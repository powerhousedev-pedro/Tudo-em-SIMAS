
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
        'vagas': prisma.vaga, 'lotações': prisma.lotacao, 'cargos': prisma.cargo,
        'alocacao': prisma.alocacao, 'função': prisma.funcao, 'atendimento': prisma.atendimento,
        'editais': prisma.edital, 'protocolo': prisma.protocolo, 'capacitação': prisma.capacitacao,
        'turmas': prisma.turma, 'encontro': prisma.encontro, 'chamada': prisma.chamada,
        'visitas': prisma.visita, 'solicitação-de-pesquisa': prisma.solicitacaoPesquisa,
        'pesquisa': prisma.pesquisa, 'nomeação': prisma.nomeacao, 'cargo-comissionado': prisma.cargoComissionado,
        'exercício': prisma.exercicio, 'reservas': prisma.reserva, 'contrato_historico': prisma.contratoHistorico,
        'alocacao_historico': prisma.alocacaoHistorico, 'inativos': prisma.inativo, 'auditoria': prisma.auditoria,
        'usuarios': prisma.usuario
    };
    return map[entity];
};

const getPKField = (entity: string) => {
    const pkMap: any = {
        'pessoa': 'CPF', 'servidor': 'MATRICULA', 'contrato': 'ID_CONTRATO', 'vagas': 'ID_VAGA',
        'atendimento': 'ID_ATENDIMENTO', 'auditoria': 'ID_LOG', 'alocacao': 'ID_ALOCACAO',
        'lotações': 'ID_LOTACAO', 'cargos': 'ID_CARGO', 'função': 'ID_FUNCAO', 'editais': 'ID_EDITAL',
        'protocolo': 'ID_PROTOCOLO', 'capacitação': 'ID_CAPACITACAO', 'turmas': 'ID_TURMA',
        'encontro': 'ID_ENCONTRO', 'chamada': 'ID_CHAMADA', 'visitas': 'ID_VISITA',
        'solicitação-de-pesquisa': 'ID_SOLICITACAO', 'pesquisa': 'ID_PESQUISA',
        'nomeação': 'ID_NOMEACAO', 'cargo-comissionado': 'ID_CARGO_COMISSIONADO',
        'exercício': 'ID_EXERCICIO', 'reservas': 'ID_RESERVA', 'contrato_historico': 'ID_HISTORICO_CONTRATO',
        'alocacao_historico': 'ID_HISTORICO_ALOCACAO', 'inativos': 'ID_INATIVO',
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

// --- SPECIFIC BUSINESS LOGIC ROUTES ---

// 1. GET VAGAS (Calculated Status)
app.get('/api/vagas', authenticateToken, async (req, res) => {
    try {
        // Fetch Vagas with all relations needed for status calculation
        const vagas = await prisma.vaga.findMany({
            include: {
                lotacao: true,
                cargo: true,
                edital: true,
                contrato: {
                    select: { ID_CONTRATO: true, CPF: true }
                },
                reserva: {
                    where: { STATUS: 'Ativa' }
                },
                exercicio: {
                    include: { lotacao: true }
                }
            }
        });

        // Fetch Active 'Aviso Prévio' Protocols to cross-reference
        const avisos = await prisma.protocolo.findMany({
            where: { TIPO_DE_PROTOCOLO: 'Aviso Prévio' },
            select: { ID_CONTRATO: true }
        });
        const contratosEmAviso = new Set(avisos.map(a => a.ID_CONTRATO).filter(Boolean));

        // Enrich Data
        const enrichedVagas = vagas.map(v => {
            let status = 'Disponível';
            let reservadaPara = null;

            if (v.BLOQUEADA) {
                status = 'Bloqueada';
            } else if (v.contrato) {
                if (contratosEmAviso.has(v.contrato.ID_CONTRATO)) {
                    status = 'Em Aviso Prévio';
                } else {
                    status = 'Ocupada';
                }
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
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 2. CREATE CONTRATO (Validation + Reserve Closing)
app.post('/api/contrato', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);

    try {
        // Validation 1: Vaga
        const vaga = await prisma.vaga.findUnique({ 
            where: { ID_VAGA: data.ID_VAGA },
            include: { contrato: true }
        });
        if (!vaga) throw new Error('Vaga não encontrada.');
        if (vaga.BLOQUEADA) throw new Error('Vaga bloqueada.');
        if (vaga.contrato) throw new Error('Vaga já ocupada.');

        // Validation 2: Cross-Check Server
        const isServer = await prisma.servidor.findFirst({ where: { CPF: data.CPF } });
        if (isServer) throw new Error('Este CPF já possui vínculo de Servidor ativo.');

        // Transaction: Create Contrato + Update Reserva
        await prisma.$transaction(async (tx) => {
            // Create Contrato
            await tx.contrato.create({ data });

            // Close Reserva if exists
            const reserva = await tx.reserva.findUnique({ where: { ID_VAGA: data.ID_VAGA } });
            if (reserva && reserva.STATUS === 'Ativa') {
                await tx.reserva.update({
                    where: { ID_RESERVA: reserva.ID_RESERVA },
                    data: { STATUS: 'Utilizada' }
                });
            }

            // Audit
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(),
                    DATA_HORA: new Date(),
                    USUARIO: req.user.usuario,
                    ACAO: 'CRIAR',
                    TABELA_AFETADA: 'CONTRATO',
                    ID_REGISTRO_AFETADO: data.ID_CONTRATO,
                    VALOR_NOVO: JSON.stringify(data)
                }
            });
        });

        res.json({ success: true, message: 'Contrato criado e reserva baixada (se existente).' });
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// 2.1 ARCHIVE CONTRACT (Used for workflows like Promotions/Changes)
app.post('/api/contratos/arquivar', authenticateToken, async (req: any, res) => {
    const { CPF, MOTIVO } = req.body;
    
    if (!CPF) return res.status(400).json({ success: false, message: 'CPF obrigatório.' });

    try {
        await prisma.$transaction(async (tx) => {
            // Find active contract
            const activeContract = await tx.contrato.findFirst({ where: { CPF } });
            
            if (!activeContract) throw new Error('Nenhum contrato ativo encontrado para este CPF.');

            // Create History
            await tx.contratoHistorico.create({
                data: {
                    ID_HISTORICO_CONTRATO: 'HCT' + Date.now(),
                    ID_CONTRATO_ORIGINAL: activeContract.ID_CONTRATO,
                    ID_VAGA: activeContract.ID_VAGA,
                    CPF: activeContract.CPF,
                    DATA_DO_CONTRATO: activeContract.DATA_DO_CONTRATO,
                    ID_FUNCAO: activeContract.ID_FUNCAO,
                    DATA_ARQUIVAMENTO: new Date(),
                    MOTIVO_ARQUIVAMENTO: MOTIVO || 'Mudança Funcional'
                }
            });

            // Delete Active
            await tx.contrato.delete({ where: { ID_CONTRATO: activeContract.ID_CONTRATO } });

            // Audit
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(),
                    DATA_HORA: new Date(),
                    USUARIO: req.user.usuario,
                    ACAO: 'ARQUIVAR',
                    TABELA_AFETADA: 'CONTRATO',
                    ID_REGISTRO_AFETADO: activeContract.ID_CONTRATO,
                    VALOR_ANTIGO: JSON.stringify(activeContract),
                    VALOR_NOVO: 'Arquivado no histórico'
                }
            });
        });

        res.json({ success: true, message: 'Contrato anterior arquivado com sucesso.' });
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// 3. CREATE SERVIDOR (Cross-Validation)
app.post('/api/servidor', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    try {
        // Check for existing Contract
        const hasContract = await prisma.contrato.findFirst({ where: { CPF: data.CPF } });
        if (hasContract) throw new Error('Este CPF já possui um Contrato ativo.');

        // Check duplicate Server
        const existing = await prisma.servidor.findUnique({ where: { MATRICULA: data.MATRICULA } });
        if (existing) throw new Error('Matrícula já existente.');

        const created = await prisma.servidor.create({ data });
        
        // Audit
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(),
                DATA_HORA: new Date(),
                USUARIO: req.user.usuario,
                ACAO: 'CRIAR',
                TABELA_AFETADA: 'SERVIDOR',
                ID_REGISTRO_AFETADO: data.MATRICULA,
                VALOR_NOVO: JSON.stringify(data)
            }
        });

        res.json({ success: true, message: 'Servidor criado.', data: created });
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// 4. CREATE ALOCACAO (Versioning)
app.post('/api/alocacao', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    
    try {
        await prisma.$transaction(async (tx) => {
            // Check existing allocation
            const currentAlocacao = await tx.alocacao.findUnique({ where: { MATRICULA: data.MATRICULA } });
            
            if (currentAlocacao) {
                // Archive it
                await tx.alocacaoHistorico.create({
                    data: {
                        ID_HISTORICO_ALOCACAO: 'HAL' + Date.now(),
                        ID_ALOCACAO: currentAlocacao.ID_ALOCACAO,
                        MATRICULA: currentAlocacao.MATRICULA,
                        ID_LOTACAO: currentAlocacao.ID_LOTACAO,
                        ID_FUNCAO: currentAlocacao.ID_FUNCAO,
                        DATA_INICIO: currentAlocacao.DATA_INICIO,
                        DATA_ARQUIVAMENTO: new Date()
                    }
                });
                // Delete old
                await tx.alocacao.delete({ where: { ID_ALOCACAO: currentAlocacao.ID_ALOCACAO } });
            }

            // Create new
            await tx.alocacao.create({ data });

            // Audit
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(),
                    DATA_HORA: new Date(),
                    USUARIO: req.user.usuario,
                    ACAO: 'CRIAR',
                    TABELA_AFETADA: 'ALOCACAO',
                    ID_REGISTRO_AFETADO: data.ID_ALOCACAO,
                    VALOR_NOVO: JSON.stringify(data)
                }
            });
        });

        res.json({ success: true, message: 'Alocação atualizada com sucesso.' });
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// 5. INATIVAR SERVIDOR (Atomic Transaction)
app.post('/api/servidores/inativar', authenticateToken, async (req: any, res) => {
    const { MATRICULA, MOTIVO, DATA_INATIVACAO } = req.body;

    if (!MATRICULA) return res.status(400).json({ success: false, message: 'Matrícula obrigatória.' });

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get Servidor Data
            const servidor = await tx.servidor.findUnique({ where: { MATRICULA } });
            if (!servidor) throw new Error('Servidor não encontrado.');

            // 2. Create Inativo Record
            const inativoId = 'INA' + Date.now();
            await tx.inativo.create({
                data: {
                    ID_INATIVO: inativoId,
                    MATRICULA_ORIGINAL: servidor.MATRICULA,
                    CPF: servidor.CPF,
                    ID_CARGO: servidor.ID_CARGO,
                    DATA_MATRICULA: servidor.DATA_MATRICULA,
                    VINCULO_ANTERIOR: servidor.VINCULO,
                    PREFIXO_ANTERIOR: servidor.PREFIXO_MATRICULA,
                    DATA_INATIVACAO: DATA_INATIVACAO ? new Date(DATA_INATIVACAO) : new Date(),
                    MOTIVO_INATIVACAO: MOTIVO || 'Inativação'
                }
            });

            // 3. Delete Allocation (if exists)
            const alocacao = await tx.alocacao.findUnique({ where: { MATRICULA } });
            if (alocacao) {
                await tx.alocacao.delete({ where: { MATRICULA } });
            }

            // 4. Delete Nomeacao (if exists - assumption based on logic)
            // Prisma deleteMany doesn't throw if not found
            await tx.nomeacao.deleteMany({ where: { MATRICULA } });

            // 5. Delete Servidor
            await tx.servidor.delete({ where: { MATRICULA } });

            // 6. Audit
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(),
                    DATA_HORA: new Date(),
                    USUARIO: req.user.usuario,
                    ACAO: 'INATIVAR',
                    TABELA_AFETADA: 'SERVIDOR',
                    ID_REGISTRO_AFETADO: MATRICULA,
                    VALOR_ANTIGO: JSON.stringify(servidor)
                }
            });
        });

        res.json({ success: true, message: 'Servidor inativado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// --- USER MANAGEMENT ROUTES ---

// GET USERS (List based on role)
app.get('/api/usuarios', authenticateToken, async (req: any, res) => {
    try {
        let whereClause = {};
        if (req.user.papel !== 'COORDENAÇÃO') {
            whereClause = { papel: req.user.papel };
        }
        const users = await prisma.usuario.findMany({
            where: whereClause,
            select: { usuario: true, papel: true, isGerente: true }
        });
        res.json(users);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// CREATE USER
app.post('/api/usuarios', authenticateToken, async (req: any, res) => {
    if (req.user.papel !== 'COORDENAÇÃO' && !req.user.isGerente) {
        return res.status(403).json({ success: false, message: 'Sem permissão.' });
    }
    const { usuario, senha, papel, isGerente } = req.body;
    if (!usuario || !senha || !papel) return res.status(400).json({ success: false, message: 'Dados incompletos.' });
    
    if (req.user.papel !== 'COORDENAÇÃO' && papel !== req.user.papel) {
        return res.status(403).json({ success: false, message: 'Restrito ao seu setor.' });
    }

    try {
        const existing = await prisma.usuario.findUnique({ where: { usuario } });
        if (existing) return res.status(400).json({ success: false, message: 'Usuário existe.' });

        const hashedPassword = await bcrypt.hash(senha, 10);
        await prisma.usuario.create({
            data: { usuario, senha: hashedPassword, papel, isGerente: Boolean(isGerente) }
        });
        res.json({ success: true, message: 'Usuário criado.' });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE USER
app.delete('/api/usuarios/:usuarioId', authenticateToken, async (req: any, res) => {
    const targetUser = req.params.usuarioId;
    const requester = req.user;

    if (!requester.isGerente && requester.papel !== 'COORDENAÇÃO') return res.status(403).json({ success: false });
    if (targetUser === requester.usuario) return res.status(400).json({ success: false, message: 'Auto-exclusão proibida.' });

    try {
        const userToDelete = await prisma.usuario.findUnique({ where: { usuario: targetUser } });
        if (!userToDelete) return res.status(404).json({ success: false });

        if (requester.papel !== 'COORDENAÇÃO' && userToDelete.papel !== requester.papel) return res.status(403).json({ success: false });
        if (userToDelete.isGerente && requester.papel !== 'COORDENAÇÃO') return res.status(403).json({ success: false });

        await prisma.usuario.delete({ where: { usuario: targetUser } });
        res.json({ success: true, message: 'Usuário excluído.' });
    } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// GENERIC GET
app.get('/api/:entity', authenticateToken, async (req, res) => {
    // Bypass for specific logic routes above
    if (['vagas', 'usuarios'].includes(req.params.entity)) return; 

    const model = getModel(req.params.entity);
    if (!model) return res.status(404).json({ message: 'Entity not found' });
    try {
        const data = await model.findMany();
        res.json(data);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GENERIC CREATE (Fallback for simple entities)
app.post('/api/:entity', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    // Block entities that have specific routes
    if (['contrato', 'servidor', 'alocacao', 'usuarios'].includes(entityName)) return;

    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Entity not found' });
    
    const data = sanitizeData(req.body);

    try {
        const created = await model.create({ data });
        const pk = getPKField(entityName);
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(),
                DATA_HORA: new Date(),
                USUARIO: req.user.usuario,
                ACAO: 'CRIAR',
                TABELA_AFETADA: entityName.toUpperCase(),
                ID_REGISTRO_AFETADO: String(created[pk]),
                VALOR_NOVO: JSON.stringify(data)
            }
        });
        res.json({ success: true, message: 'Registro criado.', data: created });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

// GENERIC UPDATE
app.put('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Entity not found' });

    const data = sanitizeData(req.body);
    const pkField = getPKField(entityName);

    try {
        const oldData = await model.findUnique({ where: { [pkField]: req.params.id } });
        await model.update({ where: { [pkField]: req.params.id }, data });

        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(),
                DATA_HORA: new Date(),
                USUARIO: req.user.usuario,
                ACAO: 'EDITAR',
                TABELA_AFETADA: entityName.toUpperCase(),
                ID_REGISTRO_AFETADO: req.params.id,
                VALOR_ANTIGO: JSON.stringify(oldData),
                VALOR_NOVO: JSON.stringify(data)
            }
        });
        res.json({ success: true, message: 'Atualizado.' });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

// GENERIC DELETE
app.delete('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    const pkField = getPKField(entityName);

    try {
        const oldData = await model.findFirst({ where: { [pkField]: req.params.id } });
        if (oldData) {
            await model.delete({ where: { [pkField]: req.params.id } });
            await prisma.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(),
                    DATA_HORA: new Date(),
                    USUARIO: req.user.usuario,
                    ACAO: 'EXCLUIR',
                    TABELA_AFETADA: entityName.toUpperCase(),
                    ID_REGISTRO_AFETADO: req.params.id,
                    VALOR_ANTIGO: JSON.stringify(oldData)
                }
            });
        }
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

        if (log.ACAO === 'EDITAR' && log.VALOR_ANTIGO) {
            await model.update({ where: { [pkField]: log.ID_REGISTRO_AFETADO }, data: JSON.parse(log.VALOR_ANTIGO) });
        } else if (log.ACAO === 'EXCLUIR' && log.VALOR_ANTIGO) {
            await model.create({ data: JSON.parse(log.VALOR_ANTIGO) });
        } else if (log.ACAO === 'CRIAR') {
            await model.delete({ where: { [pkField]: log.ID_REGISTRO_AFETADO } });
        }

        await prisma.auditoria.delete({ where: { ID_LOG: req.params.id } });
        res.json({ success: true, message: 'Restaurado com sucesso.' });
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

// --- CRON ---
cron.schedule('0 0 * * *', async () => {
    const today = new Date();
    const protocols = await prisma.protocolo.findMany({ where: { TIPO_DE_PROTOCOLO: 'Aviso Prévio', TERMINO_PRAZO: { lt: today } } });
    for (const p of protocols) {
        if (p.ID_CONTRATO) {
            const contrato = await prisma.contrato.findUnique({ where: { ID_CONTRATO: p.ID_CONTRATO } });
            if (contrato) {
                await prisma.contratoHistorico.create({ data: { ID_HISTORICO_CONTRATO: 'HCT' + Date.now(), ...contrato, DATA_ARQUIVAMENTO: new Date(), MOTIVO_ARQUIVAMENTO: 'Fim de Aviso Prévio' } });
                await prisma.contrato.delete({ where: { ID_CONTRATO: contrato.ID_CONTRATO } });
            }
        }
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
