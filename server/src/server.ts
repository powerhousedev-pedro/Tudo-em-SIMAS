
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
        'usuarios': prisma.usuario // Added map for users
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
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- ROUTES ---

app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  
  // Keep initial admin fallback for fresh installs
  if (usuario === 'admin' && senha === 'admin') {
     const token = jwt.sign({ usuario: 'admin', papel: 'COORDENAÇÃO', isGerente: true }, JWT_SECRET, { expiresIn: '8h' });
     return res.json({ success: true, token, role: 'COORDENAÇÃO', isGerente: true });
  }

  const user = await prisma.usuario.findUnique({ where: { usuario } });
  if (!user) return res.status(400).json({ success: false, message: 'Usuário não encontrado' });

  const validPassword = await bcrypt.compare(senha, user.senha);
  if (!validPassword) return res.status(400).json({ success: false, message: 'Senha incorreta' });

  const token = jwt.sign({ usuario: user.usuario, papel: user.papel, isGerente: user.isGerente }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, role: user.papel, isGerente: user.isGerente });
});

// --- USER MANAGEMENT ROUTES ---

// GET USERS (List based on role)
app.get('/api/usuarios', authenticateToken, async (req: any, res) => {
    try {
        let whereClause = {};
        
        // If not COORDENAÇÃO, restrict to same role
        if (req.user.papel !== 'COORDENAÇÃO') {
            whereClause = { papel: req.user.papel };
        }

        const users = await prisma.usuario.findMany({
            where: whereClause,
            select: {
                usuario: true,
                papel: true,
                isGerente: true
                // Never select password
            }
        });
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// CREATE USER
app.post('/api/usuarios', authenticateToken, async (req: any, res) => {
    // Only COORDENAÇÃO or Gerentes can add users
    if (req.user.papel !== 'COORDENAÇÃO' && !req.user.isGerente) {
        return res.status(403).json({ success: false, message: 'Sem permissão para criar usuários.' });
    }

    const { usuario, senha, papel, isGerente } = req.body;

    if (!usuario || !senha || !papel) {
        return res.status(400).json({ success: false, message: 'Campos obrigatórios faltando.' });
    }

    // Restriction: Non-coord managers can only create users for their own department
    if (req.user.papel !== 'COORDENAÇÃO' && papel !== req.user.papel) {
        return res.status(403).json({ success: false, message: 'Você só pode criar usuários para o seu setor.' });
    }

    try {
        const existing = await prisma.usuario.findUnique({ where: { usuario } });
        if (existing) return res.status(400).json({ success: false, message: 'Usuário já existe.' });

        const hashedPassword = await bcrypt.hash(senha, 10);
        
        await prisma.usuario.create({
            data: {
                usuario,
                senha: hashedPassword,
                papel,
                isGerente: Boolean(isGerente)
            }
        });

        res.json({ success: true, message: 'Usuário criado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE USER
app.delete('/api/usuarios/:usuarioId', authenticateToken, async (req: any, res) => {
    const targetUser = req.params.usuarioId;
    const requester = req.user;

    if (!requester.isGerente && requester.papel !== 'COORDENAÇÃO') {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    if (targetUser === requester.usuario) {
        return res.status(400).json({ success: false, message: 'Você não pode excluir a si mesmo.' });
    }

    try {
        const userToDelete = await prisma.usuario.findUnique({ where: { usuario: targetUser } });
        if (!userToDelete) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        // Scope Check: Non-coord managers can only delete from their department
        if (requester.papel !== 'COORDENAÇÃO' && userToDelete.papel !== requester.papel) {
            return res.status(403).json({ success: false, message: 'Você não pode excluir usuários de outros setores.' });
        }

        // Hierarchy Check: Only COORDENAÇÃO can delete other managers
        if (userToDelete.isGerente && requester.papel !== 'COORDENAÇÃO') {
            return res.status(403).json({ success: false, message: 'Apenas a Coordenação pode excluir gerentes.' });
        }

        await prisma.usuario.delete({ where: { usuario: targetUser } });
        res.json({ success: true, message: 'Usuário excluído com sucesso.' });

    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// GENERIC GET
app.get('/api/:entity', authenticateToken, async (req, res) => {
    const model = getModel(req.params.entity);
    if (!model) return res.status(404).json({ message: 'Entity not found' });
    try {
        const data = await model.findMany();
        res.json(data);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GENERIC CREATE
app.post('/api/:entity', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Entity not found' });
    
    const data = sanitizeData(req.body);

    try {
        // Validations
        if (entityName === 'contrato') {
            const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: data.ID_VAGA } });
            if (!vaga || vaga.BLOQUEADA) throw new Error('Vaga inválida ou bloqueada.');
            const occupied = await prisma.contrato.findFirst({ where: { ID_VAGA: data.ID_VAGA } });
            if (occupied) throw new Error('Vaga já ocupada.');
        }
        if (entityName === 'servidor' && await prisma.servidor.findFirst({ where: { CPF: data.CPF } })) {
            throw new Error('CPF já cadastrado como servidor.');
        }

        const created = await model.create({ data });

        // Audit
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
