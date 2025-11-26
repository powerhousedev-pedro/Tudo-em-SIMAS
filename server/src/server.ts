
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

app.use(cors());
app.use(express.json() as any);

// --- HELPERS & MAPPINGS ---

// Mapa explícito Rota -> Prisma Model Delegate
const getModel = (entityName: string): any => {
    const map: { [key: string]: any } = {
        'usuario': prisma.usuario,
        'usuarios': prisma.usuario,
        'pessoa': prisma.pessoa,
        'servidor': prisma.servidor,
        'contrato': prisma.contrato,
        'vaga': prisma.vaga,
        'vagas': prisma.vaga,
        'lotacao': prisma.lotacao,
        'lotacoes': prisma.lotacao,
        'cargo': prisma.cargo,
        'cargos': prisma.cargo,
        'funcao': prisma.funcao,
        'edital': prisma.edital,
        'editais': prisma.edital,
        'alocacao': prisma.alocacao,
        'exercicio': prisma.exercicio,
        'nomeacao': prisma.nomeacao,
        'cargo-comissionado': prisma.cargoComissionado,
        'cargocomissionado': prisma.cargoComissionado,
        'capacitacao': prisma.capacitacao,
        'turma': prisma.turma,
        'turmas': prisma.turma,
        'encontro': prisma.encontro,
        'chamada': prisma.chamada,
        'visita': prisma.visita,
        'visitas': prisma.visita,
        'solicitacao-pesquisa': prisma.solicitacaoPesquisa,
        'solicitacaopesquisa': prisma.solicitacaoPesquisa,
        'pesquisa': prisma.pesquisa,
        'atendimento': prisma.atendimento,
        'protocolo': prisma.protocolo,
        'reserva': prisma.reserva,
        'reservas': prisma.reserva,
        'contrato-historico': prisma.contratoHistorico,
        'contratohistorico': prisma.contratoHistorico,
        'alocacao-historico': prisma.alocacaoHistorico,
        'alocacaohistorico': prisma.alocacaoHistorico,
        'inativo': prisma.inativo,
        'inativos': prisma.inativo,
        'auditoria': prisma.auditoria
    };
    return map[entityName.toLowerCase()];
};

// Mapa explícito de Primary Keys conforme schema.prisma
const getPKField = (entityName: string): string => {
    const map: { [key: string]: string } = {
        'usuario': 'usuario',
        'usuarios': 'usuario',
        'pessoa': 'CPF',
        'servidor': 'MATRICULA',
        'contrato': 'ID_CONTRATO',
        'vaga': 'ID_VAGA',
        'vagas': 'ID_VAGA',
        'lotacao': 'ID_LOTACAO',
        'lotacoes': 'ID_LOTACAO',
        'cargo': 'ID_CARGO',
        'cargos': 'ID_CARGO',
        'funcao': 'ID_FUNCAO',
        'edital': 'ID_EDITAL',
        'editais': 'ID_EDITAL',
        'alocacao': 'ID_ALOCACAO',
        'exercicio': 'ID_EXERCICIO',
        'nomeacao': 'ID_NOMEACAO',
        'cargo-comissionado': 'ID_CARGO_COMISSIONADO',
        'cargocomissionado': 'ID_CARGO_COMISSIONADO',
        'capacitacao': 'ID_CAPACITACAO',
        'turma': 'ID_TURMA',
        'turmas': 'ID_TURMA',
        'encontro': 'ID_ENCONTRO',
        'chamada': 'ID_CHAMADA',
        'visita': 'ID_VISITA',
        'visitas': 'ID_VISITA',
        'solicitacao-pesquisa': 'ID_SOLICITACAO',
        'solicitacaopesquisa': 'ID_SOLICITACAO',
        'pesquisa': 'ID_PESQUISA',
        'atendimento': 'ID_ATENDIMENTO',
        'protocolo': 'ID_PROTOCOLO',
        'reserva': 'ID_RESERVA',
        'reservas': 'ID_RESERVA',
        'contrato-historico': 'ID_HISTORICO_CONTRATO',
        'contratohistorico': 'ID_HISTORICO_CONTRATO',
        'alocacao-historico': 'ID_HISTORICO_ALOCACAO',
        'alocacaohistorico': 'ID_HISTORICO_ALOCACAO',
        'inativo': 'ID_INATIVO',
        'inativos': 'ID_INATIVO',
        'auditoria': 'ID_LOG'
    };
    return map[entityName.toLowerCase()] || 'id';
};

const sanitizeData = (data: any) => {
    const sanitized: any = {};
    for (const key in data) {
        let value = data[key];
        if (value === '') value = null;
        else if (typeof value === 'string') {
            if (key === 'ANO_ENTRADA' && !isNaN(parseInt(value))) value = parseInt(value);
            // Converter strings ISO ou YYYY-MM-DD para Date object
            else if ((key.includes('DATA') || key.includes('INICIO') || key.includes('TERMINO') || key.includes('PRAZO')) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                value = new Date(value);
            }
        }
        sanitized[key] = value;
    }
    return sanitized;
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

// --- SPECIAL ENTITY ROUTES (Complex Logic) ---

app.get('/api/vagas', authenticateToken, async (req, res) => {
    try {
        const vagas = await prisma.vaga.findMany({
            include: {
                lotacao: true,
                cargo: true,
                edital: true,
                contrato: { select: { ID_CONTRATO: true, CPF: true } },
                reserva: true, // 1-to-1 relation
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

// --- TRANSACTIONAL ACTIONS ---

// Create Atendimento & Reserva (if applicable)
app.post('/api/atendimento', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    const idVaga = data.ID_VAGA; // Aux field, not in Atendimento model
    delete data.ID_VAGA; 

    try {
        await prisma.$transaction(async (tx) => {
            const atendimento = await tx.atendimento.create({ data });
            
            if (idVaga) {
                // Validate Vaga before Reserving
                const vaga = await tx.vaga.findUnique({ 
                    where: { ID_VAGA: idVaga }, 
                    include: { contrato: true, reserva: true } 
                });
                
                if (!vaga) throw new Error('Vaga não encontrada.');
                if (vaga.contrato) throw new Error('Vaga já ocupada por contrato.');
                if (vaga.reserva) throw new Error('Vaga já possui uma reserva ativa.');
                if (vaga.BLOQUEADA) throw new Error('Vaga bloqueada.');

                await tx.reserva.create({
                    data: {
                        ID_RESERVA: 'RES' + Date.now(),
                        ID_ATENDIMENTO: atendimento.ID_ATENDIMENTO,
                        ID_VAGA: idVaga,
                        DATA_RESERVA: new Date(),
                        STATUS: 'Ativa'
                    }
                });
            }
            
            await tx.auditoria.create({
                data: {
                    ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'CRIAR',
                    TABELA_AFETADA: 'ATENDIMENTO', ID_REGISTRO_AFETADO: atendimento.ID_ATENDIMENTO, VALOR_NOVO: JSON.stringify(data)
                }
            });
        });
        res.json({ success: true, message: 'Atendimento criado.' });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

// Create Contrato & Clear Reserva
app.post('/api/contrato', authenticateToken, async (req: any, res) => {
    const data = sanitizeData(req.body);
    try {
        // Validate Constraints
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
            
            // If vacancy was reserved, delete reservation to free ID_VAGA constraint
            const reserva = await tx.reserva.findUnique({ where: { ID_VAGA: data.ID_VAGA } });
            if (reserva) {
                await tx.reserva.delete({ where: { ID_RESERVA: reserva.ID_RESERVA } });
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
                    ID_CONTRATO: activeContract.ID_CONTRATO, 
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
            // Unique MATRICULA constraint logic
            const current = await tx.alocacao.findUnique({ where: { MATRICULA: data.MATRICULA } });
            if (current) {
                await tx.alocacaoHistorico.create({
                    data: {
                        ID_HISTORICO_ALOCACAO: 'HAL' + Date.now(),
                        ID_ALOCACAO: current.ID_ALOCACAO,
                        MATRICULA: current.MATRICULA, 
                        ID_LOTACAO: current.ID_LOTACAO,
                        ID_FUNCAO: current.ID_FUNCAO,
                        DATA_INICIO: current.DATA_INICIO,
                        DATA_ARQUIVAMENTO: new Date()
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

// --- USERS ---

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

// --- GENERIC CRUD ---

app.get('/api/:entity', authenticateToken, async (req, res) => {
    const model = getModel(req.params.entity);
    if (!model) return res.status(404).json({ message: 'Not found' });
    
    try {
        let include: any = undefined;
        const entity = req.params.entity.toLowerCase();
        
        // Enrich Relations
        if (entity === 'contrato') include = { pessoa: {select:{NOME:true}}, funcao: {select:{FUNCAO:true}} };
        if (entity === 'servidor') include = { pessoa: {select:{NOME:true}}, cargo: {select:{NOME_CARGO:true}} };
        if (entity === 'alocacao') include = { servidor:{include:{pessoa:{select:{NOME:true}}}}, lotacao:{select:{LOTACAO:true}}, funcao:{select:{FUNCAO:true}} };
        if (entity === 'nomeacao') include = { servidor:{include:{pessoa:{select:{NOME:true}}}}, cargoComissionado:{select:{NOME:true}} };
        if (entity === 'exercicio') include = { vaga:{include:{cargo:{select:{NOME_CARGO:true}}}}, lotacao:{select:{LOTACAO:true}} };
        if (entity === 'atendimento') include = { pessoa: {select:{NOME:true}} };
        if (entity === 'turmas') include = { capacitacao:{select:{ATIVIDADE_DE_CAPACITACAO:true}} };
        if (entity === 'encontro') include = { turma:{select:{NOME_TURMA:true}} };
        if (entity === 'chamada') include = { pessoa:{select:{NOME:true}}, turma:{select:{NOME_TURMA:true}} };
        if (entity === 'vagas') include = { lotacao: true, cargo: true, edital: true, exercicio: {include: {lotacao:true}} };

        const data = await model.findMany({ include });
        
        const enriched = data.map((item: any) => {
            const ret = { ...item };
            // Flatten fields for UI
            if (item.pessoa) ret.NOME_PESSOA = item.pessoa.NOME;
            if (item.funcao) ret.NOME_FUNCAO = item.funcao.FUNCAO;
            if (item.cargo) ret.NOME_CARGO = item.cargo.NOME_CARGO;
            if (item.lotacao) ret.NOME_LOTACAO = item.lotacao.LOTACAO;
            if (item.lotacao && entity === 'vagas') ret.LOTACAO_NOME = item.lotacao.LOTACAO;
            if (item.edital && entity === 'vagas') ret.EDITAL_NOME = item.edital.EDITAL;
            if (item.cargo && entity === 'vagas') ret.CARGO_NOME = item.cargo.NOME_CARGO;
            
            if (item.servidor?.pessoa) ret.NOME_PESSOA = item.servidor.pessoa.NOME; 
            if (item.servidor && !item.servidor.pessoa) ret.NOME_SERVIDOR = item.MATRICULA;
            
            if (item.cargoComissionado) ret.NOME_CARGO_COMISSIONADO = item.cargoComissionado.NOME;
            if (item.capacitacao) ret.NOME_CAPACITACAO = item.capacitacao.ATIVIDADE_DE_CAPACITACAO;
            if (item.turma) ret.NOME_TURMA = item.turma.NOME_TURMA;
            
            if (entity === 'exercicio') {
                ret.NOME_CARGO_VAGA = item.vaga?.cargo?.NOME_CARGO;
                ret.NOME_LOTACAO_EXERCICIO = item.lotacao?.LOTACAO;
            }
            return ret;
        });

        res.json(enriched);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/:entity', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    // Block entities that have specialized endpoints
    if (['contrato', 'servidor', 'alocacao', 'usuarios', 'atendimento'].includes(entityName)) {
        return res.status(400).json({ message: 'Use specific endpoint.' });
    }
    
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
        const model = getModel(log.TABELA_AFETADA);
        const pkField = getPKField(log.TABELA_AFETADA);
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

// --- CRON JOBS ---
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
