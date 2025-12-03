import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { runBackup } from './scripts/backup';
import cron from 'node-cron';
import { PrismaClient, Prisma } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'simas-secure-secret';

app.use(cors());
app.use(express.json() as any);

// --- TYPES ---
interface AuthenticatedRequest extends ExpressRequest {
    user?: {
        id: string;
        usuario: string;
        papel: string;
        isGerente: boolean;
    };
    body: any;
    params: any;
    query: any;
}

// --- MIDDLEWARE ---
const authenticateToken = (req: any, res: any, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- HELPERS ---

const cleanData = (data: any) => {
    const cleaned: any = {};
    for (const key in data) {
        if (key === 'editToken') continue; // Ignorar tokens de frontend
        if (data[key] === "") {
            cleaned[key] = null;
        } else {
            let val = data[key];
            // Fix for Prisma DateTime validation (YYYY-MM-DD -> ISO)
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                if (/DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE/i.test(key)) {
                    val = new Date(val).toISOString();
                }
            }
            cleaned[key] = val;
        }
    }
    return cleaned;
};

// Standard ID Generation (Matches Frontend Logic)
const generateId = (prefix: string) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}${result}`;
};

const getModel = (modelName: string) => {
    // Tratamento para nomes compostos que podem vir do frontend
    let name = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    if (name === 'solicitacaoPesquisa') name = 'solicitacaoPesquisa'; 
    if (name === 'cargoComissionado') name = 'cargoComissionado';
    if (name === 'relatorioSalvo') name = 'relatorioSalvo';
    // Mapeamento correto para tabelas históricas
    if (name === 'contratoHistorico') name = 'contratoHistorico';
    if (name === 'alocacaoHistorico') name = 'alocacaoHistorico';
    if (name === 'inativo') name = 'inativo';
    return (prisma as any)[name];
};

function getEntityPk(entity: string): string {
    const pks: any = {
        'Pessoa': 'CPF',
        'Servidor': 'MATRICULA',
        'Usuario': 'id',
        'Alocacao': 'ID_ALOCACAO',
        'Contrato': 'ID_CONTRATO',
        'Vaga': 'ID_VAGA',
        'Reserva': 'ID_RESERVA',
        'Protocolo': 'ID_PROTOCOLO',
        'RelatorioSalvo': 'ID_RELATORIO'
    };
    if (pks[entity]) return pks[entity];
    return `ID_${entity.toUpperCase()}`;
}

// --- ERROR HANDLING HELPER ---
const getFriendlyErrorMessage = (error: any): string => {
    const msg = error.message || '';

    // Prisma Unique Constraint (P2002)
    if (msg.includes('Unique constraint') || error.code === 'P2002') {
        return 'Já existe um registro com estes dados (CPF, Matrícula ou ID duplicado) na tabela ativa.';
    }

    // Prisma Foreign Key Constraint (P2003)
    if (msg.includes('Foreign key constraint') || error.code === 'P2003') {
        return 'Não é possível processar: O registro depende de dados que não existem mais (Ex: Vaga ou Pessoa excluída).';
    }

    // Prisma Record Not Found (P2025)
    if (msg.includes('Record to delete does not exist') || msg.includes('Record to update not found') || error.code === 'P2025') {
        return 'O registro solicitado não foi encontrado no banco de dados.';
    }

    // Prisma Invalid Field/Column
    if (msg.includes('Unknown argument') || msg.includes('Invalid `model')) {
        return 'Erro interno de dados: Estrutura inválida ou campo inexistente.';
    }

    // Generic "Record not found" custom throws
    if (msg.includes('não encontrado') || msg.includes('não encontrada')) {
        return msg; // Retorna a mensagem customizada já limpa
    }

    // Fallback for technical errors needed for debugging but hidden from simple UI
    console.error("Technical Error:", msg);
    return `Ocorreu um erro ao processar sua solicitação: ${msg}`;
};

// --- AUDIT SYSTEM ---

const auditAction = async (
    usuario: string, 
    acao: 'CRIAR' | 'EDITAR' | 'EXCLUIR' | 'ARQUIVAR' | 'INATIVAR' | 'RESTAURAR', 
    tabela: string, 
    idRegistro: string, 
    oldVal: any = null, 
    newVal: any = null,
    prismaClient: any = prisma // Permite passar transação
) => {
    try {
        await prismaClient.auditoria.create({
            data: {
                ID_LOG: generateId('LOG'),
                DATA_HORA: new Date(),
                USUARIO: usuario,
                ACAO: acao,
                TABELA_AFETADA: tabela,
                ID_REGISTRO_AFETADO: String(idRegistro),
                CAMPO_AFETADO: 'TODOS',
                VALOR_ANTIGO: oldVal ? JSON.stringify(oldVal) : '',
                VALOR_NOVO: newVal ? JSON.stringify(newVal) : ''
            }
        });
    } catch (e) {
        console.error("Falha ao registrar auditoria:", e);
    }
};

// --- CRON JOBS (DAILY ROUTINES) ---

cron.schedule('0 0 * * *', async () => {
    console.log('Executando rotinas diárias agendadas...');
    try {
        await runBackup();
    } catch (error) {
        console.error('ERRO: Falha ao executar backup diário:', error);
    }
});

// --- AUTH ROUTES ---

app.post('/api/auth/login', async (req: any, res: any) => {
    const { usuario, senha } = req.body;
    
    try {
        const user = await prisma.usuario.findFirst({
            where: { usuario }
        });

        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        let isValid = false;
        if (user.senha && user.senha.startsWith('$2')) {
            isValid = await bcrypt.compare(senha, user.senha);
        } else {
            isValid = (senha === user.senha);
        }

        if (!isValid) {
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        const token = jwt.sign(
            { usuario: user.usuario, papel: user.papel, isGerente: user.isGerente },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            success: true,
            token,
            role: user.papel,
            isGerente: user.isGerente
        });

    } catch (e: any) {
        console.error("Login error (DB Connection or Query):", e);
        res.status(500).json({ message: 'O servidor encontrou um erro ao processar o login. Tente novamente mais tarde.' });
    }
});

// --- CENTRALIZED ARCHIVING ROUTES (PHYSICAL TABLES + AUDIT) ---

// 1. Arquivamento de Contrato
app.post('/api/Contrato/arquivar', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { CPF, MOTIVO } = req.body;
    const usuario = req.user?.usuario || 'Desconhecido';

    if (!CPF || !MOTIVO) return res.status(400).json({ message: 'CPF e Motivo são obrigatórios.' });

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const contratoAtivo = await tx.contrato.findFirst({ where: { CPF } });
            
            if (contratoAtivo) {
                // 1. Prepara dados para a tabela histórica física
                const dadosParaHistorico = {
                    ID_HISTORICO_CONTRATO: generateId('HTC'), // Gerando PK
                    ID_CONTRATO: contratoAtivo.ID_CONTRATO,
                    CPF: contratoAtivo.CPF,
                    ID_VAGA: contratoAtivo.ID_VAGA,
                    ID_FUNCAO: contratoAtivo.ID_FUNCAO,
                    DATA_DO_CONTRATO: contratoAtivo.DATA_DO_CONTRATO,
                    DATA_ARQUIVAMENTO: new Date(),
                    MOTIVO_ARQUIVAMENTO: MOTIVO
                };
                
                // 2. Insere na Tabela Histórica
                await tx.contratoHistorico.create({ data: dadosParaHistorico });

                // 3. Cria Log na Auditoria (ARQUIVAR) com os dados originais
                await auditAction(usuario, 'ARQUIVAR', 'Contrato', contratoAtivo.ID_CONTRATO, contratoAtivo, null, tx);
                
                // 4. Deleta da Tabela Ativa
                await tx.contrato.delete({ where: { ID_CONTRATO: contratoAtivo.ID_CONTRATO } });
            } else {
                throw new Error("Contrato ativo não encontrado para este CPF.");
            }
        });

        res.json({ success: true, message: 'Contrato arquivado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 2. Inativação de Servidor
app.post('/api/Servidor/inativar', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { MATRICULA, MOTIVO } = req.body;
    const usuario = req.user?.usuario || 'Desconhecido';
    
    let matriculaFinal = MATRICULA;
    
    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            if (!matriculaFinal && req.body.CPF) {
                const s = await tx.servidor.findFirst({ where: { CPF: req.body.CPF }});
                if (s) matriculaFinal = s.MATRICULA;
            }

            if (!matriculaFinal) throw new Error('Matrícula não fornecida e servidor não encontrado.');

            const servidor = await tx.servidor.findUnique({ where: { MATRICULA: matriculaFinal } });
            if (!servidor) throw new Error('Servidor não encontrado.');

            // Remove alocação ativa se houver
            const alocacao = await tx.alocacao.findFirst({ where: { MATRICULA: matriculaFinal } });
            if (alocacao) {
                await tx.alocacao.delete({ where: { ID_ALOCACAO: alocacao.ID_ALOCACAO } });
                await auditAction(usuario, 'EXCLUIR', 'Alocacao', alocacao.ID_ALOCACAO, alocacao, null, tx);
            }

            // 1. Prepara dados para a tabela Inativo
            const dadosInativo = {
                ID_INATIVO: generateId('INA'), // Gerando PK
                MATRICULA_ORIGINAL: servidor.MATRICULA, // CORREÇÃO: Schema diz MATRICULA_ORIGINAL
                CPF: servidor.CPF,
                ID_CARGO: servidor.ID_CARGO,
                DATA_MATRICULA: servidor.DATA_MATRICULA,
                VINCULO: servidor.VINCULO,
                PREFIXO_MATRICULA: servidor.PREFIXO_MATRICULA,
                DATA_INATIVACAO: new Date(),
                MOTIVO_INATIVACAO: MOTIVO || 'Inativação'
            };

            // 2. Insere na Tabela Inativo
            await tx.inativo.create({ data: dadosInativo });

            // 3. Log na Auditoria
            await auditAction(usuario, 'INATIVAR', 'Servidor', matriculaFinal, servidor, null, tx);
            
            // 4. Remove da tabela ativa
            await tx.servidor.delete({ where: { MATRICULA: matriculaFinal } });
        });

        res.json({ success: true, message: 'Servidor inativado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 3. Alocação (Arquivamento ao Mover)
app.post('/api/Alocacao', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const usuario = req.user?.usuario || 'Desconhecido';
    let data = cleanData(req.body);

    if (!data.MATRICULA) return res.status(400).json({ message: 'Matrícula é obrigatória.' });

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const alocacaoExistente = await tx.alocacao.findFirst({ where: { MATRICULA: data.MATRICULA } });

            if (alocacaoExistente) {
                // 1. Insere na tabela Histórica
                await tx.alocacaoHistorico.create({
                    data: {
                        ID_HISTORICO_ALOCACAO: generateId('HAL'), // Gerando PK
                        ID_ALOCACAO: alocacaoExistente.ID_ALOCACAO,
                        MATRICULA: alocacaoExistente.MATRICULA,
                        ID_LOTACAO: alocacaoExistente.ID_LOTACAO,
                        ID_FUNCAO: alocacaoExistente.ID_FUNCAO,
                        DATA_INICIO: alocacaoExistente.DATA_INICIO,
                        DATA_ARQUIVAMENTO: new Date(), // Nome correto do campo
                    }
                });

                // 2. Log na Auditoria
                await auditAction(usuario, 'ARQUIVAR', 'Alocacao', alocacaoExistente.ID_ALOCACAO, alocacaoExistente, null, tx);
                
                // 3. Remove a antiga
                await tx.alocacao.delete({ where: { ID_ALOCACAO: alocacaoExistente.ID_ALOCACAO } });
            }

            // Cria a nova
            const result = await tx.alocacao.create({ data });
            await auditAction(usuario, 'CRIAR', 'Alocacao', result.ID_ALOCACAO, null, result, tx);
            return result; 
        }).then((result: any) => {
             res.json({ success: true, data: result });
        });

    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 4. Upsert de Exercício
app.post('/api/Exercicio', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const usuario = req.user?.usuario || 'Desconhecido';
    let data = cleanData(req.body);

    if (!data.ID_VAGA) return res.status(400).json({ message: 'ID da Vaga é obrigatório.' });

    try {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const exercicioExistente = await tx.exercicio.findFirst({ where: { ID_VAGA: data.ID_VAGA } });

            if (exercicioExistente) {
                const updated = await tx.exercicio.update({
                    where: { ID_EXERCICIO: exercicioExistente.ID_EXERCICIO },
                    data: { ID_LOTACAO: data.ID_LOTACAO }
                });
                await auditAction(usuario, 'EDITAR', 'Exercicio', updated.ID_EXERCICIO, exercicioExistente, updated, tx);
                return updated;
            } else {
                if (!data.ID_EXERCICIO) data.ID_EXERCICIO = generateId('EXE');
                const created = await tx.exercicio.create({ data });
                await auditAction(usuario, 'CRIAR', 'Exercicio', created.ID_EXERCICIO, null, created, tx);
                return created;
            }
        });
        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});


// --- RESTAURAR VIA AUDITORIA (Lógica Inversa) ---

app.post('/api/Auditoria/:id/restore', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { id } = req.params; // ID_LOG
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        const log = await prisma.auditoria.findUnique({ where: { ID_LOG: id } });
        if (!log) return res.status(404).json({ message: 'Log não encontrado.' });
        
        // --- LOGICA DE RESTAURAÇÃO DE ARQUIVAMENTO (Tabelas Físicas) ---
        if (log.ACAO === 'ARQUIVAR' || log.ACAO === 'INATIVAR') {
             await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                let dataToRestore: any = null;

                if (log.TABELA_AFETADA === 'Contrato') {
                    // Busca na tabela histórica física usando findFirst porque ID_CONTRATO não é PK lá
                    const historico = await tx.contratoHistorico.findFirst({ where: { ID_CONTRATO: log.ID_REGISTRO_AFETADO } });
                    if (!historico) throw new Error("Registro não encontrado na tabela de histórico.");

                    // Limpa dados de controle do histórico
                    dataToRestore = { ...historico };
                    delete dataToRestore.ID_HISTORICO_CONTRATO; // Remover PK da histórica
                    delete dataToRestore.DATA_ARQUIVAMENTO;
                    delete dataToRestore.MOTIVO_ARQUIVAMENTO;

                    // Insere na ativa
                    await tx.contrato.create({ data: dataToRestore });
                    // Remove da histórica usando a PK correta encontrada
                    await tx.contratoHistorico.delete({ where: { ID_HISTORICO_CONTRATO: historico.ID_HISTORICO_CONTRATO } });

                } else if (log.TABELA_AFETADA === 'Servidor') {
                    // O ID do log é a MATRICULA
                    const oldData = JSON.parse(log.VALOR_ANTIGO || '{}');
                    // Workaround: Buscar por CPF e filtrar em memória, pois MATRICULA pode não estar no WhereInput
                    const candidates = await tx.inativo.findMany({ where: { CPF: oldData.CPF } });
                    // CORREÇÃO: Comparar MATRICULA_ORIGINAL com o ID do log
                    const inativo = candidates.find((c: any) => c.MATRICULA_ORIGINAL === log.ID_REGISTRO_AFETADO);
                    
                    if (!inativo) throw new Error("Registro não encontrado na tabela de inativos.");

                    dataToRestore = { ...inativo };
                    
                    // CORREÇÃO: Mapear MATRICULA_ORIGINAL de volta para MATRICULA
                    dataToRestore.MATRICULA = inativo.MATRICULA_ORIGINAL;
                    
                    delete dataToRestore.ID_INATIVO; // Remover PK da histórica
                    delete dataToRestore.MATRICULA_ORIGINAL;
                    delete dataToRestore.DATA_INATIVACAO;
                    delete dataToRestore.MOTIVO_INATIVACAO; // Campo correto do Schema
                    delete dataToRestore.MOTIVO; // Caso exista
                    delete dataToRestore.PROCESSO; // Campo extra do inativo não existente em Servidor
                    delete dataToRestore.DATA_PUBLICACAO;

                    await tx.servidor.create({ data: dataToRestore });
                    // Remove usando a PK correta
                    await tx.inativo.delete({ where: { ID_INATIVO: inativo.ID_INATIVO } });

                } else if (log.TABELA_AFETADA === 'Alocacao') {
                    const hist = await tx.alocacaoHistorico.findFirst({ where: { ID_ALOCACAO: log.ID_REGISTRO_AFETADO } });
                    if (!hist) throw new Error("Registro histórico de alocação não encontrado.");

                    dataToRestore = { ...hist };
                    delete dataToRestore.ID_HISTORICO_ALOCACAO; // Remover PK da histórica
                    delete dataToRestore.DATA_ARQUIVAMENTO;
                    // delete dataToRestore.MOTIVO_MUDANCA; // Removido pois não existe no schema atual

                    await tx.alocacao.create({ data: dataToRestore });
                    // Remove usando a PK correta
                    await tx.alocacaoHistorico.delete({ where: { ID_HISTORICO_ALOCACAO: hist.ID_HISTORICO_ALOCACAO } });
                } else {
                    throw new Error(`Restauração de arquivamento não suportada para ${log.TABELA_AFETADA}`);
                }

                // Cria log de Restauração
                await auditAction(usuario, 'RESTAURAR', log.TABELA_AFETADA, log.ID_REGISTRO_AFETADO, null, dataToRestore, tx);
             });

        } 
        // --- LOGICA DE RESTAURAÇÃO DE EXCLUSÃO SIMPLES (Baseada no JSON) ---
        else if (log.ACAO === 'EXCLUIR') {
            const model = getModel(log.TABELA_AFETADA);
            const savedData = JSON.parse(log.VALOR_ANTIGO || '{}');
            
            if (!model) throw new Error('Modelo inválido para restauração.');
            
            await model.create({ data: savedData });
            await auditAction(usuario, 'RESTAURAR', log.TABELA_AFETADA, log.ID_REGISTRO_AFETADO, null, savedData);
        }
        else {
             throw new Error('Tipo de ação não permite restauração automática.');
        }

        res.json({ success: true, message: 'Registro restaurado com sucesso.' });
    } catch (e: any) { 
        res.status(500).json({ message: getFriendlyErrorMessage(e) }); 
    }
});

// --- REPORT ROUTES (Custom & Saved) ---

// Função auxiliar para construir o objeto include do Prisma recursivamente
const buildPrismaInclude = (paths: string[]) => {
    const includeObj: any = {};
    paths.forEach(path => {
        const parts = path.split('.');
        let currentLevel = includeObj;
        parts.forEach((part, index) => {
            if (!currentLevel[part]) currentLevel[part] = true;
            if (index < parts.length - 1) {
                if (currentLevel[part] === true) currentLevel[part] = { include: {} };
                if (!currentLevel[part].include) currentLevel[part] = { include: {} };
                currentLevel = currentLevel[part].include;
            }
        });
    });
    return Object.keys(includeObj).length > 0 ? includeObj : undefined;
};

// Função auxiliar para achatar objetos aninhados (Flatten)
const flattenObject = (obj: any, prefix = '', res: any = {}) => {
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const val = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        const formattedKey = newKey.split('.').map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('.');

        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
             if (Array.isArray(val)) {
                 res[`${formattedKey}.COUNT`] = val.length;
                 if(val.length > 0) flattenObject(val[0], newKey, res); 
             } else {
                 flattenObject(val, newKey, res);
             }
        } else {
            res[formattedKey] = val;
        }
    }
    return res;
};

app.post('/api/reports/custom', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { primaryEntity, joins } = req.body; 
    const model = getModel(primaryEntity);
    if (!model) return res.status(400).json({ message: `Entidade ${primaryEntity} inválida` });

    try {
        const queryOptions: any = {};
        if (joins && Array.isArray(joins) && joins.length > 0) {
            const prismaInclude = buildPrismaInclude(joins);
            if (prismaInclude) queryOptions.include = prismaInclude;
        }
        const data = await model.findMany(queryOptions);
        const flattenedData = data.map((item: any) => flattenObject(item, primaryEntity));
        res.json(flattenedData);
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.get('/api/reports/saved', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const reports = await prisma.relatorioSalvo.findMany({
            where: { USUARIO: req.user?.usuario },
            orderBy: { DATA_CRIACAO: 'desc' }
        });
        res.json(reports);
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao buscar relatórios salvos.' });
    }
});

app.post('/api/reports/saved', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { name, config } = req.body;
    if (!name || !config) return res.status(400).json({ message: 'Dados inválidos.' });
    try {
        const newReport = await prisma.relatorioSalvo.create({
            data: {
                ID_RELATORIO: generateId('REP'),
                NOME: name,
                USUARIO: req.user?.usuario || 'Sistema',
                CONFIGURACAO: JSON.stringify(config),
                DATA_CRIACAO: new Date()
            }
        });
        res.json({ success: true, data: newReport });
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao salvar relatório.' });
    }
});

app.delete('/api/reports/saved/:id', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { id } = req.params;
    try {
        const report = await prisma.relatorioSalvo.findUnique({ where: { ID_RELATORIO: id } });
        if (!report) return res.status(404).json({ message: 'Relatório não encontrado.' });
        if (report.USUARIO !== req.user?.usuario && !req.user?.isGerente) return res.status(403).json({ message: 'Sem permissão.' });
        await prisma.relatorioSalvo.delete({ where: { ID_RELATORIO: id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao excluir relatório.' });
    }
});

// --- AUTOCOMPLETE & ALERTS ---

app.get('/api/:entity/unique/:field', authenticateToken, async (req: any, res: any) => {
    const { entity, field } = req.params;
    const model = getModel(entity);
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });
    try {
        const results = await model.findMany({
            select: { [field]: true },
            distinct: [field],
            take: 100,
            orderBy: { [field]: 'asc' }
        });
        const values = results.map((item: any) => item[field]).filter((val: any) => val !== null && val !== '').map(String);
        res.json(values);
    } catch (e: any) {
        res.json([]); 
    }
});

app.get('/api/alerts', authenticateToken, async (req: any, res: any) => {
    res.json([]);
});

// --- GENERIC CRUD ROUTES ---

app.get('/api/:entity', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        if (entity === 'Auditoria') {
            const userRole = req.user?.papel;
            const isGerente = req.user?.isGerente;
            if (userRole !== 'COORDENAÇÃO' && !isGerente) {
                return res.status(403).json({ message: 'Acesso negado.' });
            }
        }

        const query: any = req.query.search ? {
            where: { OR: [{ [getEntityPk(entity)]: { contains: req.query.search } }] }
        } : { where: {} };

        if (entity === 'Auditoria') {
            const userRole = req.user?.papel;
            const isCoord = userRole === 'COORDENAÇÃO';
            const isGerente = req.user?.isGerente;
            if (!isCoord && isGerente && userRole) {
                const teamUsers = await prisma.usuario.findMany({ where: { papel: userRole }, select: { usuario: true } });
                const teamUsernames = teamUsers.map((u: any) => u.usuario);
                query.where = { ...query.where, USUARIO: { in: teamUsernames } };
            }
        }
        
        const inclusions: any = {};
        if (entity === 'Vaga') inclusions.include = { lotacao: true, cargo: true, edital: true };
        if (entity === 'Contrato') inclusions.include = { vaga: true, pessoa: true, funcao: true };
        if (entity === 'Alocacao') inclusions.include = { servidor: true, lotacao: true, funcao: true };
        if (entity === 'Servidor') inclusions.include = { pessoa: true, cargo: true };

        const data = await model.findMany({ ...query, ...inclusions });
        
        const flatData = data.map((item: any) => {
            const flat = { ...item };
            if (entity === 'Vaga') {
                flat.LOTACAO_NOME = item.lotacao?.LOTACAO;
                flat.CARGO_NOME = item.cargo?.NOME_CARGO;
                flat.EDITAL_NOME = item.edital?.EDITAL;
            }
            if (entity === 'Contrato') {
                flat.NOME_PESSOA = item.pessoa?.NOME;
                flat.NOME_FUNCAO = item.funcao?.FUNCAO;
            }
            if (entity === 'Servidor') {
                flat.NOME_PESSOA = item.pessoa?.NOME;
                flat.NOME_CARGO = item.cargo?.NOME_CARGO;
            }
            return flat;
        });

        res.json(flatData);
    } catch (e: any) {
        console.error(`Error fetching ${entity}:`, e);
        res.json([]);
    }
});

app.post('/api/:entity', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    const usuario = req.user?.usuario || 'Desconhecido';
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });
    try {
        let data = cleanData(req.body);
        if (entity === 'Usuario' && data.senha) {
            const salt = await bcrypt.genSalt(10);
            data.senha = await bcrypt.hash(data.senha, salt);
        }
        const result = await model.create({ data });
        if (entity !== 'Auditoria') {
            const pk = result[getEntityPk(entity)];
            await auditAction(usuario, 'CRIAR', entity, pk, null, result);
        }
        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.put('/api/:entity/:id', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { entity, id } = req.params;
    const model = getModel(entity);
    const usuario = req.user?.usuario || 'Desconhecido';
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });
    try {
        const { editToken, ...rawData } = req.body;
        const data = cleanData(rawData);
        const pkField = getEntityPk(entity);
        const oldRecord = await model.findUnique({ where: { [pkField]: id } });
        if (entity === 'Usuario' && data.senha) {
            const salt = await bcrypt.genSalt(10);
            data.senha = await bcrypt.hash(data.senha, salt);
        }
        const result = await model.update({ where: { [pkField]: id }, data: data });
        if (entity !== 'Auditoria') {
            await auditAction(usuario, 'EDITAR', entity, id, oldRecord, result);
        }
        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.delete('/api/:entity/:id', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { entity, id } = req.params;
    const model = getModel(entity);
    const usuario = req.user?.usuario || 'Desconhecido';
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });
    try {
        const pkField = getEntityPk(entity);
        const oldRecord = await model.findUnique({ where: { [pkField]: id } });
        if (!oldRecord) throw new Error('Record to delete does not exist');
        await model.delete({ where: { [pkField]: id } });
        if (entity !== 'Auditoria') {
            await auditAction(usuario, 'EXCLUIR', entity, id, oldRecord, null);
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// [Endpoints de relatórios, toggle lock, etc. mantidos...]
app.post('/api/Vaga/:id/toggle-lock', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { id } = req.params;
    const usuario = req.user?.usuario || 'Desconhecido';
    try {
        const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: id } });
        if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada' });
        const newStatus = !vaga.BLOQUEADA;
        const updated = await prisma.vaga.update({ where: { ID_VAGA: id }, data: { BLOQUEADA: newStatus } });
        await auditAction(usuario, 'EDITAR', 'Vaga', id, vaga, updated);
        res.json(newStatus);
    } catch (e: any) { res.status(500).json({ message: getFriendlyErrorMessage(e) }); }
});

app.get('/api/reports/:reportName', authenticateToken, async (req: any, res: any) => {
    const { reportName } = req.params;
    try {
        let result: any = {};
        if (reportName === 'dashboardPessoal') {
            const totalContratos = await prisma.contrato.count();
            const totalServidores = await prisma.servidor.count();
            const servidoresGroup = await prisma.servidor.groupBy({ by: ['VINCULO'], _count: { VINCULO: true } });
            const vinculoData = servidoresGroup.map((g: any) => ({ name: g.VINCULO || 'Não informado', value: g._count.VINCULO }));
            vinculoData.push({ name: 'OSC (Contratados)', value: totalContratos });
            const alocacoes = await prisma.alocacao.findMany({ include: { lotacao: true } });
            const contratos = await prisma.contrato.findMany({ include: { vaga: { include: { lotacao: true } } } });
            const lotacaoCounts: Record<string, number> = {};
            alocacoes.forEach((a: any) => { const name = a.lotacao?.LOTACAO || 'Desconhecida'; lotacaoCounts[name] = (lotacaoCounts[name] || 0) + 1; });
            contratos.forEach((c: any) => { const name = c.vaga?.lotacao?.LOTACAO || 'Desconhecida'; lotacaoCounts[name] = (lotacaoCounts[name] || 0) + 1; });
            const lotacaoData = Object.entries(lotacaoCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
            result = { totais: { contratados: totalContratos, servidores: totalServidores, total: totalContratos + totalServidores }, graficos: { vinculo: vinculoData, lotacao: lotacaoData } };
        } else if (reportName === 'painelVagas') {
            const vagas = await prisma.vaga.findMany({ include: { lotacao: true, cargo: true, edital: true } });
            const activeReservations = await prisma.reserva.findMany({ where: { STATUS: 'Ativa' } });
            const activeResMap = new Map(activeReservations.map((r: any) => [r.ID_VAGA, r.ID_ATENDIMENTO]));
            const atendimentos = await prisma.atendimento.findMany({ where: { ID_ATENDIMENTO: { in: Array.from(activeResMap.values()) } }, select: { ID_ATENDIMENTO: true, CPF: true } });
            const atendMap = new Map(atendimentos.map((a: any) => [a.ID_ATENDIMENTO, a.CPF]));
            const cpfs = atendimentos.map((a: any) => a.CPF).filter((c: any) => c);
            const pessoas = await prisma.pessoa.findMany({ where: { CPF: { in: cpfs } }, select: { CPF: true, NOME: true } });
            const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
            const contratos = await prisma.contrato.findMany({ select: { ID_VAGA: true, CPF: true } });
            const ocupadaMap = new Set(contratos.map((c: any) => c.ID_VAGA));
            const quantitativoMap = new Map();
            const panorama: any[] = [];
            vagas.forEach((v: any) => {
                let status = 'Disponível';
                let reservadaPara = null;
                if (v.BLOQUEADA) status = 'Bloqueada';
                else if (ocupadaMap.has(v.ID_VAGA)) status = 'Ocupada';
                else if (activeResMap.has(v.ID_VAGA)) {
                    status = 'Reservada';
                    const atdId = activeResMap.get(v.ID_VAGA);
                    const cpf = atendMap.get(atdId);
                    reservadaPara = pessoaMap.get(cpf);
                }
                panorama.push({ ID_VAGA: v.ID_VAGA, STATUS: status, VINCULACAO: v.lotacao?.VINCULACAO || 'N/A', LOTACAO_OFICIAL: v.lotacao?.LOTACAO || 'N/A', NOME_CARGO: v.cargo?.NOME_CARGO || 'N/A', RESERVADA_PARA: reservadaPara, OCUPANTE: status === 'Ocupada' ? 'Ocupada' : null });
                if (status !== 'Ocupada' && status !== 'Bloqueada') {
                    const key = `${v.lotacao?.VINCULACAO || 'N/A'}|${v.lotacao?.LOTACAO || 'N/A'}|${v.cargo?.NOME_CARGO || 'N/A'}`;
                    if (!quantitativoMap.has(key)) quantitativoMap.set(key, { free: 0, reserved: [] });
                    const entry = quantitativoMap.get(key);
                    if (status === 'Reservada') entry.reserved.push(reservadaPara || 'Anônimo');
                    else entry.free++;
                }
            });
            const quantitativo = Array.from(quantitativoMap.entries()).map(([key, val]: any) => {
                const [vinculacao, lotacao, cargo] = key.split('|');
                const detailsParts = [];
                if (val.free > 0) detailsParts.push(`Livre x${val.free}`);
                if (val.reserved.length > 0) detailsParts.push(`Reservada x${val.reserved.length} (${val.reserved.length > 0 ? val.reserved.join(', ') : '?'})`);
                return { VINCULACAO: vinculacao, LOTACAO: lotacao, CARGO: cargo, DETALHES: detailsParts.join(', ') };
            });
            result = { panorama, quantitativo };
        }
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
});

app.get('/api/Pessoa/:cpf/dossier', authenticateToken, async (req: any, res: any) => {
    let { cpf } = req.params;
    cpf = cpf.replace(/\D/g, '');
    try {
        const pessoa = await prisma.pessoa.findUnique({ where: { CPF: cpf } });
        if (!pessoa) return res.status(404).json({ message: `Pessoa com CPF ${cpf} não encontrada.` });
        const contratos = await prisma.contrato.findMany({ where: { CPF: cpf }, include: { funcao: true } });
        const servidores = await prisma.servidor.findMany({ where: { CPF: cpf }, include: { cargo: true, alocacao: { include: { lotacao: true, funcao: true } } } });
        let tipoPerfil = 'Avulso';
        if (servidores.length > 0) tipoPerfil = 'Servidor';
        else if (contratos.length > 0) tipoPerfil = 'Contratado';
        const vinculosAtivos: any[] = [];
        for (const c of contratos) { vinculosAtivos.push({ tipo: 'Contrato', id_contrato: c.ID_CONTRATO, funcao: c.funcao?.FUNCAO || 'Função não definida', data_inicio: c.DATA_DO_CONTRATO, detalhes: `Vaga ${c.ID_VAGA || 'N/A'}` }); }
        
        for (const s of servidores) { 
            const sAny = s as any;
            let aloc = Array.isArray(sAny.alocacao) ? sAny.alocacao[0] : sAny.alocacao; 
            vinculosAtivos.push({ 
                tipo: 'Servidor', 
                matricula: sAny.MATRICULA, 
                cargo_efetivo: sAny.cargo?.NOME_CARGO || 'Cargo não definido', 
                salario: sAny.cargo?.SALARIO, 
                funcao_atual: aloc?.funcao?.FUNCAO || 'Sem função comissionada', 
                alocacao_atual: aloc?.lotacao?.LOTACAO || 'Sem Lotação', 
                data_admissao: sAny.DATA_MATRICULA, 
                detalhes: `Vínculo: ${sAny.VINCULO}` 
            }); 
        }

        const timeline: any[] = [];
        // Agora buscamos o histórico na AUDITORIA, pois o acesso às tabelas históricas é indireto
        const auditoriaLogs = await prisma.auditoria.findMany({
            where: {
                OR: [
                    { TABELA_AFETADA: 'Contrato', ACAO: 'ARQUIVAR' },
                    { TABELA_AFETADA: 'Servidor', ACAO: 'INATIVAR' }
                ],
                VALOR_ANTIGO: { contains: cpf } // Simple search within JSON
            }
        });

        auditoriaLogs.forEach((log: any) => {
            const data = JSON.parse(log.VALOR_ANTIGO || '{}');
            if (data.CPF !== cpf) return; // Double check

            if (log.ACAO === 'ARQUIVAR' && log.TABELA_AFETADA === 'Contrato') {
                timeline.push({ 
                    tipo: 'Contrato Encerrado', 
                    data_ordenacao: data.DATA_ARQUIVAMENTO || log.DATA_HORA, 
                    periodo: `Encerrado em ${new Date(log.DATA_HORA).getFullYear()}`, 
                    descricao: `Contrato ${data.ID_CONTRATO}`, 
                    detalhes: `Motivo: ${data.MOTIVO_ARQUIVAMENTO || 'Arquivo'}`, 
                    icone: 'fa-file-contract', 
                    cor: 'gray' 
                });
            } else if (log.ACAO === 'INATIVAR' && log.TABELA_AFETADA === 'Servidor') {
                timeline.push({ 
                    tipo: 'Inativação de Servidor', 
                    data_ordenacao: data.DATA_INATIVACAO || log.DATA_HORA, 
                    periodo: `Encerrado em ${new Date(log.DATA_HORA).toLocaleDateString()}`, 
                    descricao: `Matrícula ${data.MATRICULA}`, 
                    detalhes: `Motivo: ${data.MOTIVO_INATIVACAO || 'Inativação'}`, 
                    icone: 'fa-user-slash', 
                    cor: 'red' 
                });
            }
        });

        timeline.sort((a, b) => new Date(b.data_ordenacao).getTime() - new Date(a.data_ordenacao).getTime());
        res.json({ pessoal: pessoa, tipoPerfil, vinculosAtivos, historico: timeline, atividadesEstudantis: { capacitacoes: [] } });
    } catch (e: any) { res.status(500).json({ message: 'Erro Dossiê: ' + e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
