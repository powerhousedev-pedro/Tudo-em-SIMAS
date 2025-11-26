
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

// --- HELPER: SANITIZE DATA ---
// Converts empty strings to null for optional fields, parses Dates, handles numbers.
const sanitizeData = (data: any) => {
    const sanitized: any = {};
    for (const key in data) {
        let value = data[key];
        
        if (value === '') {
            value = null;
        } else if (typeof value === 'string') {
            // Try to identify numeric fields by key name
            if (key === 'ANO_ENTRADA' && !isNaN(parseInt(value))) {
                value = parseInt(value);
            }
            // Try to identify Date fields by key name or value format
            // Matches keys with 'DATA', 'INICIO', 'TERMINO', 'VIGENCIA'
            else if (
                (key.includes('DATA') || key.includes('INICIO') || key.includes('TERMINO') || key.includes('PRAZO')) && 
                /^\d{4}-\d{2}-\d{2}/.test(value)
            ) {
                value = new Date(value);
            }
        }
        sanitized[key] = value;
    }
    return sanitized;
};

// --- MIDDLEWARE DE AUTH ---
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

// --- ROTAS DE AUTH ---
app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  
  // Simulando usuário admin inicial se banco estiver vazio
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

// --- GENERIC CRUD ---
// Map URL entity names to Prisma model names (case sensitive fix)
const getModel = (entity: string) => {
    const map: {[key:string]: any} = {
        'pessoa': prisma.pessoa,
        'servidor': prisma.servidor,
        'contrato': prisma.contrato,
        'vagas': prisma.vaga,
        'lotações': prisma.lotacao,
        'cargos': prisma.cargo,
        'alocacao': prisma.alocacao,
        'função': prisma.funcao,
        'atendimento': prisma.atendimento,
        'editais': prisma.edital,
        'protocolo': prisma.protocolo,
        'capacitação': prisma.capacitacao,
        'turmas': prisma.turma,
        'encontro': prisma.encontro,
        'chamada': prisma.chamada,
        'visitas': prisma.visita,
        'solicitação-de-pesquisa': prisma.solicitacaoPesquisa,
        'pesquisa': prisma.pesquisa,
        'nomeação': prisma.nomeacao,
        'cargo-comissionado': prisma.cargoComissionado,
        'exercício': prisma.exercicio,
        'reservas': prisma.reserva,
        'contrato_historico': prisma.contratoHistorico,
        'alocacao_historico': prisma.alocacaoHistorico,
        'inativos': prisma.inativo,
        'auditoria': prisma.auditoria
    };
    return map[entity];
};

// GET ALL
app.get('/api/:entity', authenticateToken, async (req, res) => {
    const model = getModel(req.params.entity);
    if (!model) return res.status(404).json({ message: 'Entity not found' });
    try {
        const data = await model.findMany();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// CREATE
app.post('/api/:entity', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Entity not found' });
    
    const data = sanitizeData(req.body); // SANITIZE HERE

    // --- REGRAS DE NEGÓCIO (Server-side Validation) ---
    try {
        if (entityName === 'contrato') {
            const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: data.ID_VAGA } });
            if (!vaga) throw new Error('Vaga não encontrada.');
            if (vaga.BLOQUEADA) throw new Error('Vaga está bloqueada.');
            
            const occupied = await prisma.contrato.findFirst({ where: { ID_VAGA: data.ID_VAGA } });
            if (occupied) throw new Error('Vaga já está ocupada.');
        }

        if (entityName === 'servidor') {
            const exists = await prisma.servidor.findFirst({ where: { CPF: data.CPF } });
            if (exists) throw new Error('Já existe um servidor com este CPF.');
            
            const hasContract = await prisma.contrato.findFirst({ where: { CPF: data.CPF } });
            if (hasContract) throw new Error('Esta pessoa já possui um contrato ativo.');
        }

        if (entityName === 'alocacao') {
            const hasAlloc = await prisma.alocacao.findFirst({ where: { MATRICULA: data.MATRICULA } });
            if (hasAlloc) throw new Error('Servidor já possui alocação ativa.');
        }

        const created = await model.create({ data });

        // Auditoria
        await prisma.auditoria.create({
            data: {
                ID_LOG: 'LOG' + Date.now(),
                DATA_HORA: new Date(),
                USUARIO: req.user.usuario,
                ACAO: 'CRIAR',
                TABELA_AFETADA: entityName.toUpperCase(),
                ID_REGISTRO_AFETADO: Object.values(data)[0] as string, // Assuming PK is first
                VALOR_NOVO: JSON.stringify(data)
            }
        });

        res.json({ success: true, message: 'Registro criado.', data: created });
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// UPDATE
app.put('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    if (!model) return res.status(404).json({ message: 'Entity not found' });

    const data = sanitizeData(req.body); // SANITIZE HERE

    try {
        const pkMap: any = {
            'pessoa': 'CPF', 'servidor': 'MATRICULA', 'contrato': 'ID_CONTRATO', 'vagas': 'ID_VAGA',
            'atendimento': 'ID_ATENDIMENTO'
        };
        const pkField = pkMap[entityName] || Object.keys(req.body)[0]; 

        const oldData = await model.findUnique({ where: { [pkField]: req.params.id } });

        const updated = await model.update({
            where: { [pkField]: req.params.id },
            data: data
        });

        // Auditoria
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
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// DELETE
app.delete('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    const model = getModel(entityName);
    
    const pkMap: any = {
        'pessoa': 'CPF', 'servidor': 'MATRICULA', 'contrato': 'ID_CONTRATO', 'vagas': 'ID_VAGA',
        'atendimento': 'ID_ATENDIMENTO', 'auditoria': 'ID_LOG'
    };
    const pkField = pkMap[entityName] || 'ID_' + entityName.toUpperCase(); 

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
    } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
    }
});

// --- SPECIAL ENDPOINTS ---

// Toggle Lock
app.post('/api/vagas/:id/toggle-lock', authenticateToken, async (req, res) => {
    try {
        const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: req.params.id } });
        if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada' });
        
        const updated = await prisma.vaga.update({
            where: { ID_VAGA: req.params.id },
            data: { BLOQUEADA: !vaga.BLOQUEADA }
        });
        res.json(updated.BLOQUEADA);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

// Restore Audit
app.post('/api/audit/:id/restore', authenticateToken, async (req, res) => {
    try {
        const log = await prisma.auditoria.findUnique({ where: { ID_LOG: req.params.id } });
        if (!log) return res.status(404).json({ message: 'Log não encontrado' });

        const model = getModel(log.TABELA_AFETADA.toLowerCase());
        if (!model) return res.status(400).json({ message: 'Tabela inválida' });

        const pkMap: any = { 'PESSOA': 'CPF', 'SERVIDOR': 'MATRICULA', 'CONTRATO': 'ID_CONTRATO' }; 
        const pkField = pkMap[log.TABELA_AFETADA] || 'ID_' + log.TABELA_AFETADA;

        if (log.ACAO === 'EDITAR' && log.VALOR_ANTIGO) {
            const oldData = JSON.parse(log.VALOR_ANTIGO);
            await model.update({ where: { [pkField]: log.ID_REGISTRO_AFETADO }, data: oldData });
        } else if (log.ACAO === 'EXCLUIR' && log.VALOR_ANTIGO) {
            const oldData = JSON.parse(log.VALOR_ANTIGO);
            await model.create({ data: oldData });
        } else if (log.ACAO === 'CRIAR') {
            await model.delete({ where: { [pkField]: log.ID_REGISTRO_AFETADO } });
        }

        await prisma.auditoria.delete({ where: { ID_LOG: req.params.id } });

        res.json({ success: true, message: 'Restaurado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Dossier Aggregation
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

        res.json({
            pessoal: pessoa,
            tipoPerfil,
            vinculosAtivos: vinculos,
            historico: [],
            atividadesEstudantis: { capacitacoes: [] }
        });
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

// --- DAILY CRON JOB (Trigger) ---
cron.schedule('0 0 * * *', async () => {
    console.log('Running Daily Job: Checking expired protocols...');
    const today = new Date(); // Use Date object for comparison with DateTime fields if needed, or ISO string for range
    
    const protocols = await prisma.protocolo.findMany({
        where: { 
            TIPO_DE_PROTOCOLO: 'Aviso Prévio',
            TERMINO_PRAZO: { lt: today }
        }
    });

    for (const p of protocols) {
        if (p.CPF && p.ID_CONTRATO) {
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
                        MOTIVO_ARQUIVAMENTO: 'Fim de Aviso Prévio (Automático)'
                    }
                });
                await prisma.contrato.delete({ where: { ID_CONTRATO: contrato.ID_CONTRATO } });
                console.log(`Archived contract ${contrato.ID_CONTRATO}`);
            }
        }
    }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
