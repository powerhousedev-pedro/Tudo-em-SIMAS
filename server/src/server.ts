import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { TABLES, TableName } from './tables';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

app.use(cors());
app.use(express.json() as any);

// --- HELPERS ---

// Helper to convert Table Name (PascalCase) to Prisma Client Key (camelCase)
// e.g. 'Alocacao' -> 'alocacao'
const getClientKey = (tableName: string) => {
    return tableName.charAt(0).toLowerCase() + tableName.slice(1);
};

const getPrismaDelegate = (tableName: string) => {
    const key = getClientKey(tableName);
    // @ts-ignore
    return prisma[key];
};

const isValidTable = (name: string): name is TableName => {
    return Object.values(TABLES).includes(name as TableName);
};

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

const flattenRelation = (item: any, entityName: string) => {
    const ret = { ...item };
    
    // Map Relations using Prisma's camelCase keys corresponding to our constants
    const rPessoa = item[getClientKey(TABLES.PESSOA)];
    const rFuncao = item[getClientKey(TABLES.FUNCAO)];
    const rCargo = item[getClientKey(TABLES.CARGO)];
    const rLotacao = item[getClientKey(TABLES.LOTACAO)];
    const rServidor = item[getClientKey(TABLES.SERVIDOR)];
    const rCargoCom = item[getClientKey(TABLES.CARGO_COMISSIONADO)];
    const rCapacitacao = item[getClientKey(TABLES.CAPACITACAO)];
    const rTurma = item[getClientKey(TABLES.TURMA)];
    const rEdital = item[getClientKey(TABLES.EDITAL)];
    const rExercicio = item[getClientKey(TABLES.EXERCICIO)];
    const rContrato = item[getClientKey(TABLES.CONTRATO)];
    const rReserva = item[getClientKey(TABLES.RESERVA)];

    // Standardization of Flattened Names for Frontend
    if (rPessoa) ret.NOME_PESSOA = rPessoa.NOME;
    if (rFuncao) ret.NOME_FUNCAO = rFuncao.FUNCAO;
    if (rCargo) ret.NOME_CARGO = rCargo.NOME_CARGO;
    if (rLotacao) ret.NOME_LOTACAO = rLotacao.LOTACAO;
    
    if (rServidor?.pessoa) ret.NOME_PESSOA = rServidor.pessoa.NOME; 
    if (rServidor && !rServidor.pessoa) ret.NOME_SERVIDOR = item.MATRICULA;
    
    if (rCargoCom) ret.NOME_CARGO_COMISSIONADO = rCargoCom.NOME;
    if (rCapacitacao) ret.NOME_CAPACITACAO = rCapacitacao.ATIVIDADE_DE_CAPACITACAO;
    if (rTurma) ret.NOME_TURMA = rTurma.NOME_TURMA;
    if (rEdital) ret.EDITAL_NOME = rEdital.EDITAL;

    // Specific Logic
    if (entityName === TABLES.VAGA) {
        ret.LOTACAO_NOME = rLotacao?.LOTACAO || 'N/A';
        ret.CARGO_NOME = rCargo?.NOME_CARGO || 'N/A';
        ret.EDITAL_NOME = rEdital?.EDITAL || 'N/A';
        ret.NOME_LOTACAO_EXERCICIO = rExercicio?.lotacao?.LOTACAO || null;
        
        let status = 'Disponível';
        if (item.BLOQUEADA) status = 'Bloqueada';
        else if (rContrato) status = 'Ocupada'; 
        else if (rReserva) {
            status = 'Reservada';
            ret.RESERVADA_ID = rReserva.ID_ATENDIMENTO;
        }
        ret.STATUS_VAGA = status;
    }

    if (entityName === TABLES.EXERCICIO) {
        ret.NOME_CARGO_VAGA = item.vaga?.cargo?.NOME_CARGO; // Nested relation
        ret.NOME_LOTACAO_EXERCICIO = rLotacao?.LOTACAO;
    }

    return ret;
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
  const userDelegate = getPrismaDelegate(TABLES.USUARIO);
  
  const user = await userDelegate.findUnique({ where: { usuario } });
  if (!user) return res.status(400).json({ success: false, message: 'Usuário não encontrado' });

  const validPassword = await bcrypt.compare(senha, user.senha);
  if (!validPassword) return res.status(400).json({ success: false, message: 'Senha incorreta' });

  const token = jwt.sign({ usuario: user.usuario, papel: user.papel, isGerente: user.isGerente }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, role: user.papel, isGerente: user.isGerente });
});

// --- REPORTS ENDPOINTS (Server-Side Aggregation) ---

app.get('/api/reports/:reportName', authenticateToken, async (req: any, res) => {
    const { reportName } = req.params;

    try {
        if (reportName === 'dashboardPessoal') {
            const contratoDelegate = getPrismaDelegate(TABLES.CONTRATO);
            const servidorDelegate = getPrismaDelegate(TABLES.SERVIDOR);
            const alocacaoDelegate = getPrismaDelegate(TABLES.ALOCACAO);
            const lotacaoDelegate = getPrismaDelegate(TABLES.LOTACAO);

            const [totalContratos, totalServidores, vinculoGroups, lotacaoGroups] = await Promise.all([
                contratoDelegate.count(),
                servidorDelegate.count(),
                servidorDelegate.groupBy({ by: ['VINCULO'], _count: { MATRICULA: true } }),
                alocacaoDelegate.groupBy({ by: ['ID_LOTACAO'], _count: { MATRICULA: true }, orderBy: { _count: { MATRICULA: 'desc' } }, take: 10 })
            ]);

            const lotacaoIds = lotacaoGroups.map((l: any) => l.ID_LOTACAO);
            const lotacoes = await lotacaoDelegate.findMany({ where: { ID_LOTACAO: { in: lotacaoIds } }, select: { ID_LOTACAO: true, LOTACAO: true } });
            const lotacaoMap = new Map(lotacoes.map((l: any) => [l.ID_LOTACAO, l.LOTACAO]));

            const graficoVinculo = vinculoGroups.map((g: any) => ({ name: g.VINCULO || 'N/A', value: g._count.MATRICULA }));
            graficoVinculo.push({ name: 'OSC (Contratos)', value: totalContratos });

            const graficoLotacao = lotacaoGroups.map((g: any) => ({ name: lotacaoMap.get(g.ID_LOTACAO) || g.ID_LOTACAO, value: g._count.MATRICULA }));

            return res.json({
                totais: { 'Contratados': totalContratos, 'Servidores': totalServidores, 'Total': totalContratos + totalServidores },
                graficos: { vinculo: graficoVinculo, lotacao: graficoLotacao }
            });
        }

        if (reportName === 'painelVagas') {
            const vagaDelegate = getPrismaDelegate(TABLES.VAGA);
            const kLotacao = getClientKey(TABLES.LOTACAO);
            const kCargo = getClientKey(TABLES.CARGO);
            const kEdital = getClientKey(TABLES.EDITAL);
            const kContrato = getClientKey(TABLES.CONTRATO);
            const kReserva = getClientKey(TABLES.RESERVA);

            const vagas = await vagaDelegate.findMany({
                include: { 
                    [kLotacao]: true, 
                    [kCargo]: true, 
                    [kEdital]: true, 
                    [kContrato]: { select: { ID_CONTRATO: true } }, 
                    [kReserva]: true 
                }
            });

            const quantitativo = vagas.map((v: any) => {
                let status = v.BLOQUEADA ? 'Bloqueada' : (v[kContrato] ? 'Ocupada' : (v[kReserva] ? 'Reservada' : 'Disponível'));
                return {
                    VINCULACAO: v[kLotacao]?.LOTACAO?.includes('CRAS') ? 'Proteção Básica' : 'Proteção Especial',
                    LOTACAO: v[kLotacao]?.LOTACAO || 'N/A',
                    CARGO: v[kCargo]?.NOME_CARGO || 'N/A',
                    DETALHES: status
                };
            });
            
            const panorama = vagas.map((v: any) => ({
                OCUPANTE: v[kContrato] ? 'Ocupada' : 'Vaga Livre',
                VINCULACAO: v[kLotacao]?.VINCULACAO || 'N/A',
                LOTACAO_OFICIAL: v[kLotacao]?.LOTACAO || 'N/A',
                NOME_CARGO: v[kCargo]?.NOME_CARGO || 'N/A',
                STATUS: v.BLOQUEADA ? 'Bloqueada' : (v[kContrato] ? 'Ocupada' : 'Disponível'),
                RESERVADA_PARA: v[kReserva] ? v[kReserva].ID_ATENDIMENTO : '-'
            }));

            return res.json({ quantitativo, panorama });
        }

        if (reportName === 'analiseCustos') {
            const contratoDelegate = getPrismaDelegate(TABLES.CONTRATO);
            const kVaga = getClientKey(TABLES.VAGA);
            const kCargo = getClientKey(TABLES.CARGO);
            const kLotacao = getClientKey(TABLES.LOTACAO);

            const contratos = await contratoDelegate.findMany({
                include: { [kVaga]: { include: { [kCargo]: true, [kLotacao]: true } } }
            });
            
            const custoPorLotacao: any = {};
            contratos.forEach((c: any) => {
                const lot = c[kVaga]?.[kLotacao]?.LOTACAO || 'N/A';
                const sal = parseFloat(c[kVaga]?.[kCargo]?.SALARIO || 0);
                custoPorLotacao[lot] = (custoPorLotacao[lot] || 0) + sal;
            });

            const topCustos = Object.entries(custoPorLotacao)
                .sort((a:any, b:any) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, value]) => ({ name, value: Number(value) }));
            
            const linhasTabela = Object.entries(custoPorLotacao).map(([lot, val]) => [lot, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val))]);

            return res.json({
                graficos: { custoPorLotacao: topCustos },
                tabela: { colunas: ['Lotação', 'Custo Mensal Estimado'], linhas: linhasTabela }
            });
        }

        if (reportName === 'contratosAtivos') {
            const contratoDelegate = getPrismaDelegate(TABLES.CONTRATO);
            const kPessoa = getClientKey(TABLES.PESSOA);
            const kFuncao = getClientKey(TABLES.FUNCAO);

            const contratos = await contratoDelegate.findMany({
                include: { [kPessoa]: true, [kFuncao]: true },
                take: 500
            });
            const linhas = contratos.map((c: any) => [
                c[kPessoa]?.NOME || c.CPF, c.CPF, c.ID_CONTRATO, c[kFuncao]?.FUNCAO || 'N/A', new Date(c.DATA_DO_CONTRATO).toLocaleDateString('pt-BR')
            ]);
            return res.json({ colunas: ['Nome', 'CPF', 'Contrato', 'Função', 'Início'], linhas });
        }

        res.json({});
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

// --- GENERIC CRUD WITH SEARCH & PAGINATION ---

app.get('/api/:entity', authenticateToken, async (req, res) => {
    const entityName = req.params.entity;
    
    if (!isValidTable(entityName)) {
        return res.status(400).json({ message: 'Tabela inválida' });
    }

    const model = getPrismaDelegate(entityName);
    const search = req.query.search as string;
    const limit = parseInt(req.query.limit as string) || 100;
    
    try {
        // Generate Dynamic Includes using KEYS from TABLES
        let include: any = undefined;
        const kPessoa = getClientKey(TABLES.PESSOA);
        const kFuncao = getClientKey(TABLES.FUNCAO);
        const kCargo = getClientKey(TABLES.CARGO);
        const kLotacao = getClientKey(TABLES.LOTACAO);
        const kServidor = getClientKey(TABLES.SERVIDOR);
        const kCargoCom = getClientKey(TABLES.CARGO_COMISSIONADO);
        const kCapacitacao = getClientKey(TABLES.CAPACITACAO);
        const kTurma = getClientKey(TABLES.TURMA);
        const kEdital = getClientKey(TABLES.EDITAL);
        const kContrato = getClientKey(TABLES.CONTRATO);
        const kReserva = getClientKey(TABLES.RESERVA);
        const kExercicio = getClientKey(TABLES.EXERCICIO);

        if (entityName === TABLES.CONTRATO) include = { [kPessoa]: true, [kFuncao]: true };
        else if (entityName === TABLES.SERVIDOR) include = { [kPessoa]: true, [kCargo]: true };
        else if (entityName === TABLES.ALOCACAO) include = { [kServidor]:{include:{[kPessoa]:true}}, [kLotacao]:true, [kFuncao]:true };
        else if (entityName === TABLES.NOMEACAO) include = { [kServidor]:{include:{[kPessoa]:true}}, [kCargoCom]:true };
        else if (entityName === TABLES.EXERCICIO) include = { vaga:{include:{[kCargo]:true}}, [kLotacao]:true }; // 'vaga' is nested
        else if (entityName === TABLES.ATENDIMENTO) include = { [kPessoa]: true };
        else if (entityName === TABLES.TURMA) include = { [kCapacitacao]:true };
        else if (entityName === TABLES.ENCONTRO) include = { [kTurma]:true };
        else if (entityName === TABLES.CHAMADA) include = { [kPessoa]:true, [kTurma]:true };
        else if (entityName === TABLES.VAGA) include = { [kLotacao]: true, [kCargo]: true, [kEdital]: true, [kContrato]: true, [kReserva]: true, [kExercicio]: { include: { [kLotacao]: true } } };

        // Build Where Clause for Search
        let where: any = {};
        if (search) {
            const searchFields = ['NOME', 'CPF', 'LOTACAO', 'MATRICULA', 'FUNCAO', 'CARGO', 'EDITAL', 'TIPO_PEDIDO'];
            where = {
                OR: searchFields.map(f => ({ [f]: { contains: search, mode: 'insensitive' } }))
            };
            if (entityName === TABLES.CONTRATO || entityName === TABLES.SERVIDOR) {
               where.OR.push({ [kPessoa]: { NOME: { contains: search, mode: 'insensitive' } } });
            }
        }

        // Safe Query Execution
        let data;
        try {
            data = await model.findMany({ 
                include, 
                where,
                take: limit,
                // Fallback to 'desc' sort if possible
                orderBy: { [Object.keys(model.fields).includes('DATA_CRIACAO') ? 'DATA_CRIACAO' : (Object.keys(model.fields)[0])]: 'desc' }
            });
        } catch (searchError) {
            // Fallback
            data = await model.findMany({ include, take: limit });
        }
        
        // Flatten/Enrich on Server
        const enriched = data.map((item: any) => flattenRelation(item, entityName));

        res.json(enriched);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/:entity', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    
    if (!isValidTable(entityName)) return res.status(400).json({ message: 'Tabela inválida' });

    // Special Handlers
    if (entityName === TABLES.CONTRATO) {
        const data = sanitizeData(req.body);
        try {
            await prisma.$transaction(async (tx: any) => {
                const vagaDelegate = tx[getClientKey(TABLES.VAGA)];
                const contratoDelegate = tx[getClientKey(TABLES.CONTRATO)];
                const reservaDelegate = tx[getClientKey(TABLES.RESERVA)];
                const auditDelegate = tx[getClientKey(TABLES.AUDITORIA)];

                const vaga = await vagaDelegate.findUnique({ where: { ID_VAGA: data.ID_VAGA }, include: { [getClientKey(TABLES.CONTRATO)]: true } });
                if (!vaga) throw new Error('Vaga não encontrada.');
                if (vaga[getClientKey(TABLES.CONTRATO)]) throw new Error('Vaga já ocupada.');
                
                await contratoDelegate.create({ data });
                
                // Cleanup Reserva
                const reserva = await reservaDelegate.findUnique({ where: { ID_VAGA: data.ID_VAGA } });
                if (reserva) await reservaDelegate.delete({ where: { ID_RESERVA: reserva.ID_RESERVA } });

                await auditDelegate.create({
                    data: { ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'CRIAR', TABELA_AFETADA: TABLES.CONTRATO, ID_REGISTRO_AFETADO: data.ID_CONTRATO, VALOR_NOVO: JSON.stringify(data) }
                });
            });
            return res.json({ success: true });
        } catch (e: any) { return res.status(400).json({ message: e.message }); }
    }

    // Generic Create
    const model = getPrismaDelegate(entityName);
    const data = sanitizeData(req.body);
    try {
        const created = await model.create({ data });
        try {
             const auditDelegate = getPrismaDelegate(TABLES.AUDITORIA);
             await auditDelegate.create({
                data: { ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'CRIAR', TABELA_AFETADA: entityName, ID_REGISTRO_AFETADO: 'N/A', VALOR_NOVO: JSON.stringify(data) }
            });
        } catch(e) {} 
        res.json({ success: true, data: created });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.put('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    if (!isValidTable(entityName)) return res.status(400).json({ message: 'Tabela inválida' });

    const model = getPrismaDelegate(entityName);
    // @ts-ignore
    const meta = Prisma.dmmf.datamodel.models.find(m => m.name === entityName);
    const pkField = meta?.fields.find((f: any) => f.isId)?.name;
    if (!pkField) return res.status(400).json({message: 'Cannot update: PK not found'});

    const data = sanitizeData(req.body);
    try {
        const oldData = await model.findUnique({ where: { [pkField]: req.params.id } });
        await model.update({ where: { [pkField]: req.params.id }, data });
        
        const auditDelegate = getPrismaDelegate(TABLES.AUDITORIA);
        await auditDelegate.create({
            data: { ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'EDITAR', TABELA_AFETADA: entityName, ID_REGISTRO_AFETADO: req.params.id, VALOR_ANTIGO: JSON.stringify(oldData), VALOR_NOVO: JSON.stringify(data) }
        });
        res.json({ success: true });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

app.delete('/api/:entity/:id', authenticateToken, async (req: any, res) => {
    const entityName = req.params.entity;
    if (!isValidTable(entityName)) return res.status(400).json({ message: 'Tabela inválida' });

    const model = getPrismaDelegate(entityName);
    // @ts-ignore
    const meta = Prisma.dmmf.datamodel.models.find(m => m.name === entityName);
    const pkField = meta?.fields.find((f: any) => f.isId)?.name;
    if (!pkField) return res.status(400).json({message: 'Cannot delete: PK not found'});

    try {
        const oldData = await model.findUnique({ where: { [pkField]: req.params.id } });
        await model.delete({ where: { [pkField]: req.params.id } });
        
        const auditDelegate = getPrismaDelegate(TABLES.AUDITORIA);
        await auditDelegate.create({
            data: { ID_LOG: 'LOG' + Date.now(), DATA_HORA: new Date(), USUARIO: req.user.usuario, ACAO: 'EXCLUIR', TABELA_AFETADA: entityName, ID_REGISTRO_AFETADO: req.params.id, VALOR_ANTIGO: JSON.stringify(oldData) }
        });
        res.json({ success: true });
    } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

// --- SPECIAL ACTIONS ---

app.post('/api/contratos/arquivar', authenticateToken, async (req: any, res) => {
    // Logic moved to Action Service or simplified here
    res.json({ success: true }); 
});

app.post(`/api/${TABLES.VAGA}/:id/toggle-lock`, authenticateToken, async (req, res) => {
    try {
        const vagaDelegate = getPrismaDelegate(TABLES.VAGA);
        const vaga = await vagaDelegate.findUnique({ where: { ID_VAGA: req.params.id } });
        const updated = await vagaDelegate.update({ where: { ID_VAGA: req.params.id }, data: { BLOQUEADA: !vaga.BLOQUEADA } });
        res.json(updated.BLOQUEADA);
    } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
