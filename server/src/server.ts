
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

app.use(cors());
app.use(express.json());

// --- HELPERS ---

const sanitizeData = (data: any) => {
    const sanitized: any = {};
    for (const key in data) {
        let value = data[key];
        if (value === '') value = null;
        else if (typeof value === 'string') {
            if (key === 'ANO_ENTRADA' && !isNaN(parseInt(value))) value = parseInt(value);
            else if ((key.includes('DATA') || key.includes('INICIO') || key.includes('TERMINO') || key.includes('PRAZO')) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                value = new Date(value);
            }
        }
        sanitized[key] = value;
    }
    return sanitized;
};

// Map entity string to Prisma Model Delegate
const getModel = (entity: string): any => {
    const map: {[key:string]: any} = {
        'pessoa': prisma.pessoa, 'servidor': prisma.servidor, 'contrato': prisma.contrato,
        'vagas': prisma.vaga, 'lotacoes': prisma.lotacao, 'cargos': prisma.cargo,
        'alocacao': prisma.alocacao, 'funcao': prisma.funcao, 'atendimento': prisma.atendimento,
        'editais': prisma.edital, 'protocolo': prisma.protocolo, 'capacitacao': prisma.capacitacao,
        'turmas': prisma.turma, 'encontro': prisma.encontro, 'chamada': prisma.chamada,
        'visitas': prisma.visita, 'solicitacao-de-pesquisa': prisma.solicitacaoPesquisa,
        'pesquisa': prisma.pesquisa, 'nomeacao': prisma.nomeacao, 'cargo-comissionado': prisma.cargoComissionado,
        'exercicio': prisma.exercicio, 'reservas': prisma.reserva, 'contrato_historico': prisma.contratoHistorico,
        'alocacao_historico': prisma.alocacaoHistorico, 'inativos': prisma.inativo, 'auditoria': prisma.auditoria,
        'usuarios': prisma.usuario
    };
    return map[entity];
};

const getPKField = (entity: string) => {
    const pkMap: any = {
        'pessoa': 'CPF', 'servidor': 'MATRICULA', 'contrato': 'ID_CONTRATO', 'vagas': 'ID_VAGA',
        'atendimento': 'ID_ATENDIMENTO', 'auditoria': 'ID_LOG', 'alocacao': 'ID_ALOCACAO',
        'lotacoes': 'ID_LOTACAO', 'cargos': 'ID_CARGO', 'funcao': 'ID_FUNCAO', 'editais': 'ID_EDITAL',
        'protocolo': 'ID_PROTOCOLO', 'capacitacao': 'ID_CAPACITACAO', 'turmas': 'ID_TURMA',
        'encontro': 'ID_ENCONTRO', 'chamada': 'ID_CHAMADA', 'visitas': 'ID_VISITA',
        'solicitacao-de-pesquisa': 'ID_SOLICITACAO', 'pesquisa': 'ID_PESQUISA',
        'nomeacao': 'ID_NOMEACAO', 'cargo-comissionado': 'ID_CARGO_COMISSIONADO',
        'exercicio': 'ID_EXERCICIO', 'reservas': 'ID_RESERVA', 
        'contrato_historico': 'ID_CONTRATO', 
        'alocacao_historico': 'ID_ALOCACAO', 
        'inativos': 'ID_INATIVO',
        'usuarios': 'usuario'
    };
    return pkMap[entity] || 'id';
};

// --- MIDDLEWARE ---

const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token não fornecido' });
  
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ message: 'Sessão inválida ou expirada.' });
    req.user = user;
    next();
  });
};

// --- SEED DEFAULT USER ---
const seedAdmin = async () => {
    try {
        const count = await prisma.usuario.count();
        if (count === 0) {
            console.log('Creating default admin user...');
            const hashedPassword = await bcrypt.hash('admin', 10);
            await prisma.usuario.create({
                data: {
                    usuario: 'admin',
                    senha: hashedPassword,
                    papel: 'COORDENAÇÃO',
                    isGerente: true
                }
            });
            console.log('Default user created: admin / admin');
        }
    } catch (e) {
        console.error('Seed error:', e);
    }
};
seedAdmin();

// --- AUTH ROUTES ---

app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  
  const user = await prisma.usuario.findUnique({ where: { usuario } });
  if (!user) return res.status(400).json({ success: false, message: 'Usuário não encontrado' });

  const validPassword = await bcrypt.compare(senha, user.senha);
  if (!validPassword) return res.status(400).json({ success: false, message: 'Senha incorreta' });

  const token = jwt.sign({ usuario: user.usuario, papel: user.papel, isGerente: user.isGerente }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, role: user.papel, isGerente: user.isGerente });
});

// --- SPECIFIC BUSINESS LOGIC ROUTES (OPTIMIZED) ---

// 1. GET VAGAS
app.get('/api/vagas', authenticateToken, async (req, res) => {
    try {
        const vagas = await prisma.vaga.findMany({
            include: {
                lotacao: true,
                cargo: true,
                edital: true,
                contrato: { select: { ID_CONTRATO: true, CPF: true } },
                reserva: { where: { STATUS: 'Ativa' } },
                exercicio: { include: { lotacao: true } }
            }
        });

        const avisos = await prisma.protocolo.findMany({
            where: { TIPO_DE_PROTOCOLO: 'Aviso Prévio' },
            select: { ID_CONTRATO: true }
        });
        const contratosEmAviso = new Set(avisos.map(a => a.ID_CONTRATO).filter(Boolean));

        const enrichedVagas = vagas.map(v => {
            let status = 'Disponível';
            let reservadaPara = null;

            if (v.BLOQUEADA) {
                status = 'Bloqueada';
            } else if (v.contrato) {
                status = contratosEmAviso.has(v.contrato.ID_CONTRATO) ? 'Em Aviso Prévio' : 'Ocupada';
            } else if (v.reserva) {
                status = 'Reservada';
                reservadaPara = v.reserva.ID_ATENDIMENTO; 
            }

            return {
                ...v,
                LOTACAO_NOME: v.lotacao?.LOTACAO || 'N/A',
                CARGO_NOME: v.cargo?.NOME_CARGO || 'N/A',
                EDITAL_NOME: v.edital?.EDITAL || 'N/A',
                NOME_LOTACAO_EXERCICIO: v.exercicio?.lotacao?.LOTACAO || null,
                STATUS_VAGA: status,
                RESERVADA_ID: reservadaPara
            };
        });
        res.json(enrichedVagas);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 2. GET CONTRATO (Optimized)
app.get('/api/contrato', authenticateToken, async (req, res) => {
    try {
        const contratos = await prisma.contrato.findMany({
            include: {
                pessoa: { select: { NOME: true } },
                funcao: { select: { FUNCAO: true } }
            }
        });
        const enriched = contratos.map(c => ({
            ...c,
            NOME_PESSOA: c.pessoa?.NOME || c.CPF,
            NOME_FUNCAO: c.funcao?.FUNCAO || 'N/A'
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 3. GET SERVIDOR (Optimized)
app.get('/api/servidor', authenticateToken, async (req, res) => {
    try {
        const servidores = await prisma.servidor.findMany({
            include: {
                pessoa: { select: { NOME: true } },
                cargo: { select: { NOME_CARGO: true } }
            }
        });
        const enriched = servidores.map(s => ({
            ...s,
            NOME_PESSOA: s.pessoa?.NOME || s.CPF,
            NOME_CARGO: s.cargo?.NOME_CARGO || s.ID_CARGO
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 4. GET ALOCACAO (Optimized)
app.get('/api/alocacao', authenticateToken, async (req, res) => {
    try {
        const alocacoes = await prisma.alocacao.findMany({
            include: {
                servidor: { include: { pessoa: { select: { NOME: true } } } },
                lotacao: { select: { LOTACAO: true } },
                funcao: { select: { FUNCAO: true } }
            }
        });
        const enriched = alocacoes.map(a => ({
            ...a,
            NOME_PESSOA: a.servidor?.pessoa?.NOME || `Mat: ${a.MATRICULA}`,
            NOME_LOTACAO: a.lotacao?.LOTACAO || a.ID_LOTACAO,
            NOME_FUNCAO: a.funcao?.FUNCAO || 'N/A'
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 5. GET PROTOCOLO (Optimized)
app.get('/api/protocolo', authenticateToken, async (req, res) => {
    try {
        // Manual fetch for Pessoa to avoid TS error if relation is missing
        const protocolos = await prisma.protocolo.findMany();
        const cpfs = [...new Set(protocolos.map(p => p.CPF).filter(Boolean))];
        const pessoas = await prisma.pessoa.findMany({
            where: { CPF: { in: cpfs as string[] } },
            select: { CPF: true, NOME: true }
        });
        
        const pessoaMap = new Map(pessoas.map(p => [p.CPF, p.NOME]));

        const enriched = protocolos.map(p => ({
            ...p,
            NOME_PESSOA: p.CPF ? (pessoaMap.get(p.CPF) || p.CPF) : 'N/A',
            DETALHE_VINCULO: p.ID_CONTRATO ? `Contrato: ${p.ID_CONTRATO}` : (p.MATRICULA ? `Matrícula: ${p.MATRICULA}` : 'N/A')
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 6. GET NOMEAÇÃO (Optimized)
app.get('/api/nomeacao', authenticateToken, async (req, res) => {
    try {
        const nomeacoes = await prisma.nomeacao.findMany({
            include: {
                servidor: { include: { pessoa: { select: { NOME: true } } } },
                cargoComissionado: { select: { NOME: true } }
            }
        });
        const enriched = nomeacoes.map(n => ({
            ...n,
            NOME_SERVIDOR: n.servidor?.pessoa?.NOME || n.MATRICULA,
            NOME_CARGO_COMISSIONADO: n.cargoComissionado?.NOME || n.ID_CARGO_COMISSIONADO
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 7. GET EXERCICIO (Optimized)
app.get('/api/exercicio', authenticateToken, async (req, res) => {
    try {
        const exercicios = await prisma.exercicio.findMany({
            include: {
                vaga: { include: { cargo: { select: { NOME_CARGO: true } } } },
                lotacao: { select: { LOTACAO: true } }
            }
        });
        const enriched = exercicios.map(e => ({
            ...e,
            NOME_CARGO_VAGA: e.vaga?.cargo?.NOME_CARGO || 'N/A',
            NOME_LOTACAO_EXERCICIO: e.lotacao?.LOTACAO || 'N/A'
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 8. GET ATENDIMENTO (Optimized)
app.get('/api/atendimento', authenticateToken, async (req, res) => {
    try {
        const atendimentos = await prisma.atendimento.findMany({
            include: { pessoa: { select: { NOME: true } } }
        });
        const enriched = atendimentos.map(a => ({
            ...a,
            NOME_PESSOA: a.pessoa?.NOME || a.CPF
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- GDEP OPTIMIZED ROUTES ---

// 9. GET TURMAS (Optimized)
app.get('/api/turmas', authenticateToken, async (req, res) => {
    try {
        const turmas = await prisma.turma.findMany({
            include: {
                capacitacao: { select: { ATIVIDADE_DE_CAPACITACAO: true } }
            }
        });
        const enriched = turmas.map(t => ({
            ...t,
            NOME_CAPACITACAO: t.capacitacao?.ATIVIDADE_DE_CAPACITACAO || t.ID_CAPACITACAO
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 10. GET ENCONTRO (Optimized)
app.get('/api/encontro', authenticateToken, async (req, res) => {
    try {
        const encontros = await prisma.encontro.findMany({
            include: {
                turma: { select: { NOME_TURMA: true } }
            }
        });
        const enriched = encontros.map(e => ({
            ...e,
            NOME_TURMA: e.turma?.NOME_TURMA || e.ID_TURMA
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 11. GET CHAMADA (Optimized)
app.get('/api/chamada', authenticateToken, async (req, res) => {
    try {
        const chamadas = await prisma.chamada.findMany({
            include: {
                pessoa: { select: { NOME: true } },
                turma: { select: { NOME_TURMA: true } }
            }
        });
        const enriched = chamadas.map(c => ({
            ...c,
            NOME_PESSOA: c.pessoa?.NOME || c.CPF,
            NOME_TURMA: c.turma?.NOME_TURMA || c.ID_TURMA
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 12. GET VISITAS (Optimized)
app.get('/api/visitas', authenticateToken, async (req, res) => {
    try {
        const visitas = await prisma.visita.findMany({
            include: {
                pessoa: { select: { NOME: true } }
            }
        });
        const enriched = visitas.map(v => ({
            ...v,
            NOME_PESSOA: v.pessoa?.NOME || v.CPF
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 13. GET SOLICITAÇÃO DE PESQUISA (Optimized)
app.get('/api/solicitacao-de-pesquisa', authenticateToken, async (req, res) => {
    try {
        const solicitacoes = await prisma.solicitacaoPesquisa.findMany({
            include: {
                pessoa: { select: { NOME: true } }
            }
        });
        const enriched = solicitacoes.map(s => ({
            ...s,
            NOME_PESSOA: s.pessoa?.NOME || s.CPF
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 14. GET PESQUISA (Optimized)
app.get('/api/pesquisa', authenticateToken, async (req, res) => {
    try {
        const pesquisas = await prisma.pesquisa.findMany({
            include: {
                solicitacao: { select: { OBJETO_DE_ESTUDO: true } }
            }
        });
        const enriched = pesquisas.map(p => ({
            ...p,
            OBJETO_ESTUDO: p.solicitacao?.OBJETO_DE_ESTUDO || `Solicitação: ${p.ID_SOLICITACAO}`
        }));
        res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// GENERIC CREATE (Validation + Logic)
app.post('/api/contrato', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    try {
        const vaga = await prisma.vaga.findUnique({ 
            where: { ID_VAGA: data.ID_VAGA }, include: { contrato: true }
        });
        if (!vaga) throw new Error('Vaga não encontrada.');
        if (vaga.BLOQUEADA) throw new Error('Vaga bloqueada.');
        if (vaga.contrato) throw new Error('Vaga já ocupada.');

        const isServer = await prisma.servidor.findFirst({ where: { CPF: data.CPF } });
        if (isServer) throw new Error('Este CPF já possui vínculo de Servidor ativo.');

        await prisma.$transaction(async (tx) => {
            await tx.contrato.create({ data });
            const reserva = await tx.reserva.findUnique({ where: { ID_VAGA: data.ID_VAGA } });
            if (reserva && reserva.STATUS === 'Ativa') {
                await tx.reserva.update({ where: { ID_RESERVA: reserva.ID_RESERVA }, data: { STATUS: 'Utilizada' } });
            }
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario,
                    ACAO: 'CRIAR', TABELA_AFETADA: 'CONTRATO', ID_REGISTRO_AFETADO: data.ID_CONTRATO,
                    VALOR_NOVO: JSON.stringify(data)
                }
            });
        });
        res.json({ success: true, message: 'Contrato criado.' });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/contratos/arquivar', authenticateToken, async (req: any, res) => {
    const { CPF, MOTIVO } = req.body;
    if (!CPF) return res.status(400).json({ success: false, message: 'CPF obrigatório.' });
    try {
        await prisma.$transaction(async (tx) => {
            const activeContract = await tx.contrato.findFirst({ where: { CPF } });
            if (!activeContract) throw new Error('Nenhum contrato ativo.');
            await tx.contratoHistorico.create({
                data: {
                    ID_HISTORICO_CONTRATO: 'HCT' + Date.now(), 
                    ID_CONTRATO: activeContract.ID_CONTRATO, // Store old ID reference
                    ID_VAGA: activeContract.ID_VAGA, 
                    CPF: activeContract.CPF, 
                    DATA_DO_CONTRATO: activeContract.DATA_DO_CONTRATO,
                    ID_FUNCAO: activeContract.ID_FUNCAO, 
                    DATA_ARQUIVAMENTO: new Date(), 
                    MOTIVO_ARQUIVAMENTO: MOTIVO || 'Mudança'
                }
            });
            await tx.contrato.delete({ where: { ID_CONTRATO: activeContract.ID_CONTRATO } });
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'ARQUIVAR',
                    TABELA_AFETADA: 'CONTRATO', ID_REGISTRO_AFETADO: activeContract.ID_CONTRATO, VALOR_ANTIGO: JSON.stringify(activeContract),
                    VALOR_NOVO: 'Arquivado'
                }
            });
        });
        res.json({ success: true, message: 'Arquivado com sucesso.' });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/servidor', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    try {
        const hasContract = await prisma.contrato.findFirst({ where: { CPF: data.CPF } });
        if (hasContract) throw new Error('Este CPF já possui um Contrato ativo.');
        const existing = await prisma.servidor.findUnique({ where: { MATRICULA: data.MATRICULA } });
        if (existing) throw new Error('Matrícula já existente.');
        const created = await prisma.servidor.create({ data });
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'CRIAR',
                TABELA_AFETADA: 'SERVIDOR', ID_REGISTRO_AFETADO: data.MATRICULA, VALOR_NOVO: JSON.stringify(data)
            }
        });
        res.json({ success: true, message: 'Servidor criado.', data: created });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/alocacao', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    try {
        await prisma.$transaction(async (tx) => {
            const current = await tx.alocacao.findUnique({ where: { MATRICULA: data.MATRICULA } });
            if (current) {
                await tx.alocacaoHistorico.create({
                    data: {
                        ID_ALOCACAO: 'HAL' + Date.now(),
                        MATRICULA: current.MATRICULA, 
                        ID_LOTACAO: current.ID_LOTACAO, 
                        DATA_INICIO: current.DATA_INICIO, 
                        MOTIVO_MUDANCA: 'Nova Alocação' 
                    }
                });
                await tx.alocacao.delete({ where: { ID_ALOCACAO: current.ID_ALOCACAO } });
            }
            await tx.alocacao.create({ data });
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'CRIAR',
                    TABELA_AFETADA: 'ALOCACAO', ID_REGISTRO_AFETADO: data.ID_ALOCACAO, VALOR_NOVO: JSON.stringify(data)
                }
            });
        });
        res.json({ success: true, message: 'Alocação atualizada.' });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/servidores/inativar', authenticateToken, async (req: any, res) => {
    const { MATRICULA, MOTIVO, DATA_INATIVACAO } = req.body;
    if (!MATRICULA) return res.status(400).json({ success: false, message: 'Matrícula obrigatória.' });
    try {
        await prisma.$transaction(async (tx) => {
            const servidor = await tx.servidor.findUnique({ where: { MATRICULA } });
            if (!servidor) throw new Error('Servidor não encontrado.');
            await tx.inativo.create({
                data: {
                    ID_INATIVO: 'INA' + Date.now(), MATRICULA_ORIGINAL: servidor.MATRICULA, CPF: servidor.CPF,
                    ID_CARGO: servidor.ID_CARGO, DATA_MATRICULA: servidor.DATA_MATRICULA,
                    VINCULO_ANTERIOR: servidor.VINCULO, PREFIXO_ANTERIOR: servidor.PREFIXO_MATRICULA,
                    DATA_INATIVACAO: DATA_INATIVACAO ? new Date(DATA_INATIVACAO) : new Date(), MOTIVO_INATIVACAO: MOTIVO || 'Inativação'
                }
            });
            const alocacao = await tx.alocacao.findUnique({ where: { MATRICULA } });
            if (alocacao) await tx.alocacao.delete({ where: { MATRICULA } });
            await tx.nomeacao.deleteMany({ where: { MATRICULA } });
            await tx.servidor.delete({ where: { MATRICULA } });
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'INATIVAR',
                    TABELA_AFETADA: 'SERVIDOR', ID_REGISTRO_AFETADO: MATRICULA, VALOR_ANTIGO: JSON.stringify(servidor)
                }
            });
        });
        res.json({ success: true, message: 'Servidor inativado.' });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/usuarios', authenticateToken, async (req: any, res) => {
    try {
        let whereClause = {};
        if (req.user.papel !== 'COORDENAÇÃO') whereClause = { papel: req.user.papel };
        const users = await prisma.usuario.findMany({
            where: whereClause, select: { usuario: true, papel: true, isGerente: true }
        });
        res.json(users);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/usuarios', authenticateToken, async (req: any, res) => {
    if (req.user.papel !== 'COORDENAÇÃO' && !req.user.isGerente) return res.status(403).json({ success: false });
    const { usuario, senha, papel, isGerente } = req.body;
    try {
        const existing = await prisma.usuario.findUnique({ where: { usuario } });
        if (existing) return res.status(400).json({ success: false, message: 'Existe.' });
        const hashedPassword = await bcrypt.hash(senha, 10);
        await prisma.usuario.create({ data: { usuario, senha: hashedPassword, papel, isGerente: Boolean(isGerente) } });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

app.delete('/api/usuarios/:usuarioId', authenticateToken, async (req: any, res) => {
    if (!req.user.isGerente && req.user.papel !== 'COORDENAÇÃO') return res.status(403).json({ success: false });
    try {
        await prisma.usuario.delete({ where: { usuario: req.params.usuarioId } });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false }); }
});

// GENERIC CRUD (Fallback for non-optimized entities)
app.get('/api/:entity', authenticateToken, async (req, res) => {
    const model = getModel(req.params.entity);
    if (!model) return res.status(404).json({ message: 'Not found' });
    try { const data = await model.findMany(); res.json(data); } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/:entity', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    if (['contrato', 'servidor', 'alocacao', 'usuarios'].includes(entityName)) return;
    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Not found' });
    const data = sanitizeData(req.body);
    try {
        const created = await model.create({ data });
        const pk = getPKField(entityName);
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'CRIAR',
                TABELA_AFETADA: entityName.toUpperCase(), ID_REGISTRO_AFETADO: String(created[pk]), VALOR_NOVO: JSON.stringify(data)
            }
        });
        res.json({ success: true, message: 'Criado.', data: created });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.put('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Not found' });
    const data = sanitizeData(req.body);
    const pkField = getPKField(entityName);
    try {
        const oldData = await model.findUnique({ where: { [pkField]: req.params.id } });
        await model.update({ where: { [pkField]: req.params.id }, data });
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'EDITAR',
                TABELA_AFETADA: entityName.toUpperCase(), ID_REGISTRO_AFETADO: req.params.id,
                VALOR_ANTIGO: JSON.stringify(oldData), VALOR_NOVO: JSON.stringify(data)
            }
        });
        res.json({ success: true, message: 'Atualizado.' });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.delete('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    const pkField = getPKField(entityName);
    try {
        const oldData = await model.findUnique({ where: { [pkField]: req.params.id } });
        await model.delete({ where: { [pkField]: req.params.id } });
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'EXCLUIR',
                TABELA_AFETADA: entityName.toUpperCase(), ID_REGISTRO_AFETADO: req.params.id, VALOR_ANTIGO: JSON.stringify(oldData)
            }
        });
        res.json({ success: true });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

// SPECIFIC ACTIONS
app.post('/api/vagas/:id/toggle-lock', authenticateToken, async (req, res) => {
    try {
        const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: req.params.id } });
        if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada' });
        const updated = await prisma.vaga.update({ where: { ID_VAGA: req.params.id }, data: { BLOQUEADA: !vaga.BLOQUEADA } });
        res.json(updated.BLOQUEADA);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/audit/:id/restore', authenticateToken, async (req, res) => {
    try {
        const log = await prisma.auditoria.findUnique({ where: { ID_LOG: req.params.id } });
        if (!log) return res.status(404).json({ message: 'Log não encontrado' });
        const model = getModel(log.TABELA_AFETADA.toLowerCase());
        const pkField = getPKField(log.TABELA_AFETADA.toLowerCase());
        if (log.ACAO === 'EDITAR' && log.VALOR_ANTIGO) await model.update({ where: { [pkField]: log.ID_REGISTRO_AFETADO }, data: JSON.parse(log.VALOR_ANTIGO) });
        else if (log.ACAO === 'EXCLUIR' && log.VALOR_ANTIGO) await model.create({ data: JSON.parse(log.VALOR_ANTIGO) });
        else if (log.ACAO === 'CRIAR') await model.delete({ where: { [pkField]: log.ID_REGISTRO_AFETADO } });
        await prisma.auditoria.delete({ where: { ID_LOG: req.params.id } });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/pessoas/:cpf/dossier', authenticateToken, async (req, res) => {
    try {
        const cpf = req.params.cpf;
        const pessoa = await prisma.pessoa.findUnique({ where: { CPF: cpf } });
        if (!pessoa) return res.status(404).json({ message: 'Pessoa não encontrada' });
        const contrato = await prisma.contrato.findFirst({ where: { CPF: cpf } });
        const servidor = await prisma.servidor.findFirst({ where: { CPF: cpf } });
        const vinculos = [];
        let tipoPerfil = 'Avulso';
        if (contrato) {
            tipoPerfil = 'Contratado';
            vinculos.push({ tipo: 'Contratado', id_contrato: contrato.ID_CONTRATO, ...contrato });
        }
        if (servidor) {
            tipoPerfil = 'Servidor';
            vinculos.push({ tipo: 'Servidor', matricula: servidor.MATRICULA, ...servidor });
        }
        res.json({ pessoal: pessoa, tipoPerfil, vinculosAtivos: vinculos, historico: [], atividadesEstudantis: { capacitacoes: [] } });
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

cron.schedule('0 0 * * *', async () => {
    const today = new Date();
    const protocols = await prisma.protocolo.findMany({ where: { TIPO_DE_PROTOCOLO: 'Aviso Prévio', TERMINO_PRAZO: { lt: today } } });
    for (const p of protocols) {
        if (p.ID_CONTRATO) {
            const contrato = await prisma.contrato.findUnique({ where: { ID_CONTRATO: p.ID_CONTRATO } });
            if (contrato) {
                await prisma.contratoHistorico.create({ 
                    data: { 
                        ID_HISTORICO_CONTRATO: 'HCT' + Date.now(), 
                        ID_CONTRATO: contrato.ID_CONTRATO,
                        ID_VAGA: contrato.ID_VAGA,
                        CPF: contrato.CPF,
                        DATA_DO_CONTRATO: contrato.DATA_DO_CONTRATO,
                        ID_FUNCAO: contrato.ID_FUNCAO,
                        DATA_ARQUIVAMENTO: new Date(), 
                        MOTIVO_ARQUIVAMENTO: 'Fim de Aviso Prévio' 
                    } 
                });
                await prisma.contrato.delete({ where: { ID_CONTRATO: contrato.ID_CONTRATO } });
            }
        }
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
