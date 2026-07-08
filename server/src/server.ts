import dotenv from 'dotenv';
dotenv.config();
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { runBackup } from './scripts/backup';
import { geocodeAddress } from './utils/geocoding';
import cron from 'node-cron';
import { PrismaClient, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'simas-secure-secret';
const TIMEZONE = 'America/Sao_Paulo';

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

// --- ROBUST TIMEZONE HELPERS WITH LUXON ---

const getBrasiliaTimestamp = () => {
    // Return a standard JS Date object in UTC. Best practice for storage.
    return DateTime.utc().toJSDate();
};

const getEndOfDayInBrasiliaAsUtc = () => {
    // Get the current time, set it to Brasília's timezone, find the end of that day,
    // and return it as a standard JS Date object (in UTC).
    return DateTime.now().setZone(TIMEZONE).endOf('day').toJSDate();
};

const cleanData = (data: any) => {
    const cleaned: any = {};
    const globalIgnore = ['editToken', 'NOME_PESSOA', 'IS_TEMP', 'NOME_FUNCAO', 'POSTO_ESCOLARIDADE', 'EDITAL_NOME', 'LOTACAO_NOME', 'POSTO_NOME'];
    const booleanFields = ['AFRODESCENDENTE', 'PCD', 'USUARIO_ASSISTENCIA', 'BLOQUEADA', 'GRAVISSIMO', 'isGerente'];

    for (const key in data) {
        if (globalIgnore.includes(key)) continue;
        
        if (data[key] === "" || data[key] === null) {
            if (booleanFields.includes(key)) {
                cleaned[key] = false;
            } else {
                cleaned[key] = null;
            }
        } else if (typeof data[key] === 'object' && !Array.isArray(data[key]) && !(data[key] instanceof Date)) {
            // Ignore nested objects (like related entities loaded by include)
            continue;
        } else {
            let val = data[key];
            // If we get a date string "YYYY-MM-DD", interpret it as a Brasília date
            // and convert it to a proper UTC timestamp for storage.
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                if (/DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE/i.test(key)) {
                    const dt = DateTime.fromISO(val, { zone: TIMEZONE });
                    if (dt.isValid) {
                        val = dt.toJSDate();
                    } else {
                        // Keep the original string or set to null based on your requirements
                        val = null;
                    }
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
    if (name === 'postoTrabalho') name = 'postoTrabalho';
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
        'Protocolo': 'ID_PROTOCOLO',
        'RelatorioSalvo': 'ID_RELATORIO',
        'PostoTrabalho': 'ID_POSTO_TRABALHO',
        'CargoComissionado': 'ID_CARGO_COMISSIONADO',
        'ContratoHistorico': 'ID_HISTORICO_CONTRATO',
        'AlocacaoHistorico': 'ID_HISTORICO_ALOCACAO',
        'SolicitacaoPesquisa': 'ID_SOLICITACAO',
        'Substituto': 'ID_SUBSTITUTO',
        'Auditoria': 'ID_LOG',
        'AuditoriaLGPD': 'ID_LOG_LGPD'
    };
    if (pks[entity]) return pks[entity];
    // Fallback normalizer for simple names
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

const auditLGPDAction = async (
    usuario: string,
    acao: 'LEITURA' | 'CRIACAO' | 'EDICAO' | 'EXCLUSAO' | 'RESTAURACAO' | 'EXPORTACAO',
    tabela: string,
    idRegistro: string,
    prismaClient: any = prisma
) => {
    try {
        await prismaClient.auditoriaLGPD.create({
            data: {
                ID_LOG_LGPD: generateId('LGP'),
                DATA_HORA: getBrasiliaTimestamp(),
                USUARIO: usuario,
                ACAO: acao,
                TABELA_AFETADA: tabela,
                ID_REGISTRO_AFETADO: String(idRegistro),
                CAMPO_AFETADO: 'N/A'
            }
        });
    } catch (e) {
        console.error("Falha ao registrar auditoria LGPD:", e);
    }
};

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
                DATA_HORA: getBrasiliaTimestamp(),
                USUARIO: usuario,
                ACAO: acao,
                TABELA_AFETADA: tabela,
                ID_REGISTRO_AFETADO: String(idRegistro),
                CAMPO_AFETADO: 'TODOS',
                VALOR_ANTIGO: oldVal ? JSON.stringify(oldVal) : '',
                VALOR_NOVO: newVal ? JSON.stringify(newVal) : ''
            }
        });

        // Mapeia ações do hotfix para a LGPD
        let acaoLGPD: any = 'EDICAO';
        if (acao === 'CRIAR') acaoLGPD = 'CRIACAO';
        if (acao === 'EXCLUIR' || acao === 'ARQUIVAR' || acao === 'INATIVAR') acaoLGPD = 'EXCLUSAO';
        if (acao === 'RESTAURAR') acaoLGPD = 'RESTAURACAO';
        
        await auditLGPDAction(usuario, acaoLGPD, tabela, idRegistro, prismaClient);

    } catch (e) {
        console.error("Falha ao registrar auditoria:", e);
        throw e; // Relança o erro para abortar a transação
    }
};

// --- CRON JOBS (DAILY ROUTINES) ---

import * as jobScheduler from './services/jobScheduler';

cron.schedule('5 0 * * *', async () => {
    console.log('Executando rotinas diárias agendadas...');
    try {
        await runBackup();
        await jobScheduler.processarArquivamentosAgendados();
        await jobScheduler.processarTerminosDeEditais();
    } catch (error) {
        console.error('ERRO: Falha ao executar rotinas diárias:', error);
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

    if (!CPF || !MOTIVO) return res.status(400).json({ message: 'Identificador (CPF) e Motivo são obrigatórios.' });

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
                    DATA_ARQUIVAMENTO: getBrasiliaTimestamp(),
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

app.post('/api/Contrato/mover', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { CPF, NOVA_VAGA_ID, MOTIVO } = req.body;
    const usuario = req.user?.usuario || 'Desconhecido';

    if (!CPF || !NOVA_VAGA_ID) return res.status(400).json({ message: 'Identificador, Nova Vaga e Motivo são obrigatórios.' });

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const contratoAtivo = await tx.contrato.findFirst({ where: { CPF } });
            
            if (!contratoAtivo) throw new Error("Contrato ativo não encontrado.");

            // 1. Arquiva o contrato atual
            const dadosParaHistorico = {
                ID_HISTORICO_CONTRATO: generateId('HTC'),
                ID_CONTRATO: contratoAtivo.ID_CONTRATO,
                CPF: contratoAtivo.CPF,
                ID_VAGA: contratoAtivo.ID_VAGA,
                ID_FUNCAO: contratoAtivo.ID_FUNCAO,
                DATA_DO_CONTRATO: contratoAtivo.DATA_DO_CONTRATO,
                DATA_ARQUIVAMENTO: getBrasiliaTimestamp(),
                MOTIVO_ARQUIVAMENTO: MOTIVO || 'Movimentação para outra vaga'
            };
            
            await tx.contratoHistorico.create({ data: dadosParaHistorico });
            await auditAction(usuario, 'ARQUIVAR', 'Contrato', contratoAtivo.ID_CONTRATO, contratoAtivo, null, tx);
            await tx.contrato.delete({ where: { ID_CONTRATO: contratoAtivo.ID_CONTRATO } });

            // 2. Cria novo contrato na nova vaga
            const vagaExists = await tx.vaga.findUnique({ where: { ID_VAGA: NOVA_VAGA_ID } });
            if (!vagaExists) throw new Error("A nova vaga selecionada não existe.");

            const novoContratoData = {
                ...contratoAtivo,
                ID_CONTRATO: generateId('CTT'),
                ID_VAGA: NOVA_VAGA_ID,
                DATA_DO_CONTRATO: new Date()
            };
            
            const novoContrato = await tx.contrato.create({ data: novoContratoData });
            await auditAction(usuario, 'CRIAR', 'Contrato', novoContrato.ID_CONTRATO, null, novoContrato, tx);
        });

        res.json({ success: true, message: 'Contrato movido com sucesso.' });
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
                ID_FUNCAO: servidor.ID_FUNCAO,
                DATA_MATRICULA: servidor.DATA_MATRICULA,
                VINCULO_ANTERIOR: servidor.VINCULO,
                PREFIXO_ANTERIOR: servidor.PREFIXO_MATRICULA,
                DATA_INATIVACAO: getBrasiliaTimestamp(),
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
                        DATA_ARQUIVAMENTO: getBrasiliaTimestamp(), // Nome correto do campo
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
        
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Helper local para obter um modelo Prisma dentro da transação, garantindo consistência.
            const getModelForTx = (modelName: string) => {
                let name = modelName.charAt(0).toLowerCase() + modelName.slice(1);
                if (name === 'solicitacaoPesquisa') name = 'solicitacaoPesquisa'; 
                if (name === 'cargoComissionado') name = 'cargoComissionado';
                if (name === 'relatorioSalvo') name = 'relatorioSalvo';
                if (name === 'contratoHistorico') name = 'contratoHistorico';
                if (name === 'alocacaoHistorico') name = 'alocacaoHistorico';
                if (name === 'inativo') name = 'inativo';
                return (tx as any)[name];
            };

            // --- LOGICA DE RESTAURAÇÃO DE ARQUIVAMENTO (Tabelas Físicas) ---
            if (log.ACAO === 'ARQUIVAR' || log.ACAO === 'INATIVAR') {
                if (log.TABELA_AFETADA === 'Contrato') {
                    const historico = await tx.contratoHistorico.findFirst({ where: { ID_CONTRATO: log.ID_REGISTRO_AFETADO } });
                    if (!historico) throw new Error("Registro não encontrado na tabela de histórico.");
                    
                    const dataToRestore: any = { ...historico };
                    delete dataToRestore.ID_HISTORICO_CONTRATO;
                    delete dataToRestore.DATA_ARQUIVAMENTO;
                    delete dataToRestore.MOTIVO_ARQUIVAMENTO;

                    await tx.contrato.create({ data: dataToRestore });
                    await tx.contratoHistorico.delete({ where: { ID_HISTORICO_CONTRATO: historico.ID_HISTORICO_CONTRATO } });
                } else if (log.TABELA_AFETADA === 'Servidor') {
                    const oldData = JSON.parse(log.VALOR_ANTIGO || '{}');
                    const candidates = await tx.inativo.findMany({ where: { CPF: oldData.CPF } });
                    const inativo = candidates.find((c: any) => c.MATRICULA_ORIGINAL === log.ID_REGISTRO_AFETADO);
                    if (!inativo) throw new Error("Registro não encontrado na tabela de inativos.");
                    const dataToRestore: any = { ...inativo };
                    dataToRestore.MATRICULA = inativo.MATRICULA_ORIGINAL;
                    delete dataToRestore.ID_INATIVO;
                    delete dataToRestore.MATRICULA_ORIGINAL;
                    delete dataToRestore.DATA_INATIVACAO;
                    delete dataToRestore.MOTIVO_INATIVACAO;
                    delete dataToRestore.MOTIVO;
                    delete dataToRestore.PROCESSO;
                    delete dataToRestore.DATA_PUBLICACAO;
                    await tx.servidor.create({ data: dataToRestore });
                    await tx.inativo.delete({ where: { ID_INATIVO: inativo.ID_INATIVO } });
                } else if (log.TABELA_AFETADA === 'Alocacao') {
                    const hist = await tx.alocacaoHistorico.findFirst({ where: { ID_ALOCACAO: log.ID_REGISTRO_AFETADO } });
                    if (!hist) throw new Error("Registro histórico de alocação não encontrado.");
                    const dataToRestore: any = { ...hist };
                    delete dataToRestore.ID_HISTORICO_ALOCACAO;
                    delete dataToRestore.DATA_ARQUIVAMENTO;
                    await tx.alocacao.create({ data: dataToRestore });
                    await tx.alocacaoHistorico.delete({ where: { ID_HISTORICO_ALOCACAO: hist.ID_HISTORICO_ALOCACAO } });
                } else {
                    throw new Error(`Restauração de arquivamento não suportada para ${log.TABELA_AFETADA}`);
                }
                await tx.auditoria.delete({ where: { ID_LOG: id } });
            
            } 
            // --- LOGICA DE RESTAURAÇÃO DE EXCLUSÃO SIMPLES (Baseada no JSON) ---
            else if (log.ACAO === 'EXCLUIR') {
                const model = getModelForTx(log.TABELA_AFETADA);
                const savedData = JSON.parse(log.VALOR_ANTIGO || '{}');
                if (!model) throw new Error('Modelo inválido para restauração.');
                await model.create({ data: savedData });
                await tx.auditoria.delete({ where: { ID_LOG: id } });
            }
            // --- Desfaz uma EDIÇÃO, voltando para o valor antigo ---
            else if (log.ACAO === 'EDITAR') {
                const model = getModelForTx(log.TABELA_AFETADA);
                if (!model) throw new Error('Modelo inválido para restauração.');
                const pkField = getEntityPk(log.TABELA_AFETADA);
                const recordId = log.ID_REGISTRO_AFETADO;
                const originalData = JSON.parse(log.VALOR_ANTIGO || '{}');
                delete originalData[pkField];
                await model.update({ where: { [pkField]: recordId }, data: originalData });
                await tx.auditoria.delete({ where: { ID_LOG: id } });
            }
            // --- Desfaz uma CRIAÇÃO, deletando o registro ---
            else if (log.ACAO === 'CRIAR') {
                const model = getModelForTx(log.TABELA_AFETADA);
                if (!model) throw new Error('Modelo inválido para restauração.');
                const pkField = getEntityPk(log.TABELA_AFETADA);
                const recordId = log.ID_REGISTRO_AFETADO;
                const createdRecord = JSON.parse(log.VALOR_NOVO || '{}');
                await model.delete({ where: { [pkField]: recordId } });
                await tx.auditoria.delete({ where: { ID_LOG: id } });
            }
            else {
                 throw new Error('Tipo de ação não permite restauração automática.');
            }
        });

        res.json({ success: true, message: 'Registro restaurado com sucesso.', invalidatedEntity: log.TABELA_AFETADA });
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

import { generateAmostragem } from './services/amostragem';

app.post('/api/amostragem/gerar', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { origemId, tipoOrigem } = req.body;
        if (!origemId || !tipoOrigem) {
            return res.status(400).json({ message: 'Dados inválidos para amostragem.' });
        }
        const resultado = await generateAmostragem(origemId, tipoOrigem);
        
        // Find existing lancamentos for the current month for these CPFs
        const hoje = new Date();
        const primeiroDiaMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        const lancamentos = await prisma.lancamentoAmostragem.findMany({
            where: {
                CPF: { in: resultado.cpfs },
                TIMESTAMP: { gte: primeiroDiaMesAtual }
            }
        });

        res.json({ success: true, data: resultado, lancamentos });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.post('/api/amostragem/lancamento', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { cpf } = req.body;
        if (!cpf) return res.status(400).json({ message: 'CPF inválido.' });

        const hoje = new Date();
        const primeiroDiaMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

        const existente = await prisma.lancamentoAmostragem.findFirst({
            where: {
                CPF: cpf,
                TIMESTAMP: { gte: primeiroDiaMesAtual }
            }
        });

        if (existente) {
            return res.status(400).json({ message: 'Lançamento já existe para este mês.' });
        }

        const lancamento = await prisma.lancamentoAmostragem.create({
            data: { ID_LANCAMENTO: generateId('LAN'), CPF: cpf, STATUS: false }
        });

        res.json({ success: true, lancamento });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.put('/api/amostragem/lancamento/toggle/:id', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.params;
        const lancamento = await prisma.lancamentoAmostragem.findUnique({ where: { ID_LANCAMENTO: id } });
        if (!lancamento) return res.status(404).json({ message: 'Lançamento não encontrado.' });

        const atualizado = await prisma.lancamentoAmostragem.update({
            where: { ID_LANCAMENTO: id },
            data: { STATUS: !lancamento.STATUS }
        });

        res.json({ success: true, lancamento: atualizado });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.post('/api/amostragem/validar', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { idAmostragem, validada, justificativa, idInc } = req.body;
        if (!idAmostragem) return res.status(400).json({ message: 'Amostragem inválida.' });

        const existingValidacao = await prisma.validacaoAmostragem.findUnique({
            where: { ID_AMOSTRAGEM: idAmostragem }
        });

        const validacao = await prisma.validacaoAmostragem.upsert({
            where: { ID_AMOSTRAGEM: idAmostragem },
            update: {
                VALIDADA: validada,
                JUSTIFICATIVA: justificativa,
                ID_INC: idInc || null
            },
            create: {
                ID_VALIDACAO: generateId('VAL'),
                ID_AMOSTRAGEM: idAmostragem,
                VALIDADA: validada,
                JUSTIFICATIVA: justificativa,
                ID_INC: idInc || null
            }
        });

        await auditAction(
            req.user?.usuario || 'Sistema',
            existingValidacao ? 'EDITAR' : 'CRIAR',
            'ValidacaoAmostragem',
            validacao.ID_VALIDACAO,
            existingValidacao,
            validacao
        );

        res.json({ success: true, validacao });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.get('/api/amostragem/invalidas', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const validacoesInvalidas = await prisma.validacaoAmostragem.findMany({
            where: {
                VALIDADA: false,
                OR: [
                    { ID_INC: null },
                    { ID_INC: '' }
                ]
            },
            include: { amostragem: true }
        });

        const origens = validacoesInvalidas.map(v => v.amostragem.ORIGEM_ID);
        res.json({ success: true, origens });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.get('/api/inconformidades/:origemId', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { origemId } = req.params;
        const inconformidades = await prisma.inconformidade.findMany({
            where: {
                OR: [
                    { ID_LOTACAO: origemId },
                    { ID_PROCESSO: origemId },
                    { ID_TERMO: origemId }
                ]
            },
            orderBy: { TIMESTAMP: 'desc' }
        });
        res.json({ success: true, inconformidades });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.get('/api/timeline/:origemId', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { origemId } = req.params;
        const { tipo } = req.query; // 'lotacao', 'edital', 'vinculacao', 'cogestora'
        
        let eventos: any[] = [];
        
        let lotacaoIds: string[] = [];
        let editalIds: string[] = [];
        
        if (tipo === 'cogestora') {
            const editais = await prisma.edital.findMany({ where: { ID_COGESTORA: origemId } });
            editalIds = editais.map(e => e.ID_EDITAL);
        } else if (tipo === 'edital') {
            editalIds = [origemId];
        } else if (tipo === 'lotacao') {
            lotacaoIds = [origemId];
        }

        // 1. Inconformidades
        const inconformidadesWhere: any = {};
        if (tipo === 'cogestora') {
            inconformidadesWhere.ID_TERMO = { in: editalIds };
        } else {
            inconformidadesWhere.OR = [
                { ID_LOTACAO: origemId },
                { ID_PROCESSO: origemId },
                { ID_TERMO: origemId }
            ];
        }

        const inconformidades = await prisma.inconformidade.findMany({
            where: inconformidadesWhere,
            include: {
                edital: { include: { cogestora: true } },
                lotacao: true
            }
        });
        
        inconformidades.forEach(inc => {
            eventos.push({
                id: inc.ID_INC,
                tipo: 'inconformidade',
                timestamp: inc.TIMESTAMP,
                titulo: `Inconformidade: ${inc.TIPO}`,
                descricao: inc.MOTIVO,
                resolvido: inc.RESOLVIDO,
                tipo_inconformidade: inc.TIPO,
                idLotacao: inc.ID_LOTACAO,
                idProcesso: inc.ID_PROCESSO,
                idTermo: inc.ID_TERMO,
                chain: inc.CHAIN,
                nomeEdital: inc.edital?.EDITAL,
                numeroEdital: inc.edital?.NUMERO,
                nomeCogestora: inc.edital?.cogestora?.NOME,
                nomeLotacao: inc.lotacao?.LOTACAO
            });
        });

        // 2. Amostragens e seus processos/inconformidades
        const amostragensWhere: any = {};
        if (tipo === 'cogestora') {
            amostragensWhere.ORIGEM_ID = { in: editalIds };
        } else {
            amostragensWhere.ORIGEM_ID = origemId;
        }

        const amostragens = await prisma.amostragem.findMany({
            where: amostragensWhere,
            include: { 
                validacao: {
                    include: {
                        inconformidade: {
                            include: {
                                edital: { include: { cogestora: true } },
                                lotacao: true
                            }
                        }
                    }
                }
            }
        });
        amostragens.forEach(a => {
            if (a.validacao && a.validacao.ID_INC) {
                eventos.push({
                    id: a.validacao.ID_VALIDACAO,
                    tipo: 'amostragem_validada',
                    timestamp: a.TIMESTAMP, 
                    titulo: 'Inconformidade Vinculada (Amostragem)',
                    descricao: `Justificativa: ${a.validacao.JUSTIFICATIVA}\nInc. ID: ${a.validacao.ID_INC}\nProcesso: ${a.validacao.inconformidade?.ID_PROCESSO || 'N/A'}`,
                    status: a.validacao.VALIDADA ? 'Validada' : 'Não Validada',
                    nomeEdital: a.validacao.inconformidade?.edital?.EDITAL,
                    numeroEdital: a.validacao.inconformidade?.edital?.NUMERO,
                    nomeCogestora: a.validacao.inconformidade?.edital?.cogestora?.NOME,
                    nomeLotacao: a.validacao.inconformidade?.lotacao?.LOTACAO
                });
            } else if (a.validacao) {
                 eventos.push({
                    id: a.validacao.ID_VALIDACAO,
                    tipo: 'amostragem_validada',
                    timestamp: a.TIMESTAMP,
                    titulo: 'Amostragem Validada',
                    descricao: `Status: ${a.validacao.VALIDADA ? 'Validada' : 'Não Validada'}`,
                    status: a.validacao.VALIDADA ? 'Validada' : 'Não Validada'
                });
            } else {
                 eventos.push({
                    id: a.ID_AMOSTRAGEM,
                    tipo: 'amostragem',
                    timestamp: a.TIMESTAMP,
                    titulo: 'Amostragem Gerada',
                    descricao: 'Amostragem mensal gerada.'
                });
            }
        });

        // 3. Processos N:M
        const processosWhere: any = {};
        if (tipo === 'cogestora') {
            processosWhere.editais = { some: { ID_EDITAL: { in: editalIds } } };
        } else if (tipo === 'edital') {
            processosWhere.editais = { some: { ID_EDITAL: origemId } };
        } else if (tipo === 'lotacao') {
            processosWhere.lotacoes = { some: { ID_LOTACAO: origemId } };
        } else if (tipo === 'vinculacao') {
            const lotacoesVinculacao = await prisma.lotacao.findMany({ where: { ID_VINCULACAO: origemId } });
            const lotIds = lotacoesVinculacao.map(l => l.ID_LOTACAO);
            processosWhere.lotacoes = { some: { ID_LOTACAO: { in: lotIds } } };
        }

        const processos = await prisma.processo.findMany({
            where: processosWhere,
            include: {
                editais: { include: { cogestora: true } }
            }
        });

        processos.forEach(proc => {
            const cogestoraName = proc.editais.length > 0 ? proc.editais[0].cogestora?.NOME : null;
            eventos.push({
                id: proc.ID_PROCESSO + '_proc',
                uuid: proc.ID_PROCESSO,
                tipo: 'processo',
                timestamp: proc.TIMESTAMP || proc.DATA_PUBLICACAO || new Date(),
                titulo: 'Processo SEI',
                descricao: `Processo: ${proc.NUMERO}\nStatus: ${proc.STATUS_ENCAMINHAMENTO || 'N/A'}\nTítulo: ${proc.TITULO || 'N/A'}`,
                idProcesso: proc.NUMERO,
                nomeCogestora: cogestoraName,
                resolvido: proc.RESOLVIDO,
                chain: proc.CHAIN
            });
        });

        // 4. Eventos Fundacionais (Criação/Término de Editais e Lotações)
        const now = new Date();

        if (tipo === 'cogestora') {
            const editaisCogestora = await prisma.edital.findMany({ where: { ID_COGESTORA: origemId }, include: { cogestora: true } });
            editaisCogestora.forEach(ed => {
                eventos.push({
                    id: ed.ID_EDITAL + '_criado',
                    tipo: 'info',
                    timestamp: ed.INICIO || ed.TIMESTAMP || new Date(),
                    titulo: 'Edital Criado',
                    descricao: `Edital ${ed.EDITAL} foi registrado no sistema.`,
                    nomeEdital: ed.EDITAL,
                    numeroEdital: ed.NUMERO,
                    nomeCogestora: ed.cogestora?.NOME
                });
                if (ed.TERMINO && now > ed.TERMINO) {
                    eventos.push({
                        id: ed.ID_EDITAL + '_termino',
                        tipo: 'alerta',
                        timestamp: ed.TERMINO,
                        titulo: 'Edital Finalizado',
                        descricao: `O prazo do edital ${ed.EDITAL} expirou.`,
                        nomeEdital: ed.EDITAL,
                        numeroEdital: ed.NUMERO,
                        nomeCogestora: ed.cogestora?.NOME
                    });
                }
            });
        } else if (tipo === 'edital') {
            const ed = await prisma.edital.findUnique({ where: { ID_EDITAL: origemId }, include: { cogestora: true } });
            if (ed) {
                eventos.push({
                    id: ed.ID_EDITAL + '_criado',
                    tipo: 'info',
                    timestamp: ed.INICIO || ed.TIMESTAMP || new Date(),
                    titulo: 'Edital Criado',
                    descricao: `Edital ${ed.EDITAL} foi registrado no sistema.`,
                    nomeEdital: ed.EDITAL,
                    numeroEdital: ed.NUMERO,
                    nomeCogestora: ed.cogestora?.NOME
                });
                if (ed.TERMINO && now > ed.TERMINO) {
                    eventos.push({
                        id: ed.ID_EDITAL + '_termino',
                        tipo: 'alerta',
                        timestamp: ed.TERMINO,
                        titulo: 'Edital Finalizado',
                        descricao: `O prazo do edital ${ed.EDITAL} expirou.`,
                        nomeEdital: ed.EDITAL,
                        numeroEdital: ed.NUMERO,
                        nomeCogestora: ed.cogestora?.NOME
                    });
                }
            }
        } else if (tipo === 'vinculacao') {
            const lotacoesVinc = await prisma.lotacao.findMany({ where: { ID_VINCULACAO: origemId } });
            lotacoesVinc.forEach(lot => {
                eventos.push({
                    id: lot.ID_LOTACAO + '_criada',
                    tipo: 'info',
                    timestamp: lot.TIMESTAMP || new Date(),
                    titulo: 'Lotação Registrada',
                    descricao: `A lotação ${lot.LOTACAO} passou a integrar esta vinculação.`,
                    nomeLotacao: lot.LOTACAO
                });
            });

            // Editais que fornecem vagas para essa vinculação
            const vagasVinculacao = await prisma.vaga.findMany({
                where: { ID_LOTACAO: { in: lotacoesVinc.map(l => l.ID_LOTACAO) } },
                select: { ID_EDITAL: true }
            });
            const uniqueEditalIds = Array.from(new Set(vagasVinculacao.map(v => v.ID_EDITAL)));
            const editaisVinc = await prisma.edital.findMany({ where: { ID_EDITAL: { in: uniqueEditalIds } }, include: { cogestora: true } });
            
            editaisVinc.forEach(ed => {
                eventos.push({
                    id: ed.ID_EDITAL + '_criado_vinc',
                    tipo: 'info',
                    timestamp: ed.INICIO || ed.TIMESTAMP || new Date(),
                    titulo: 'Edital Ativo na Vinculação',
                    descricao: `O Edital ${ed.EDITAL} começou a fornecer vagas para esta vinculação.`,
                    nomeEdital: ed.EDITAL,
                    numeroEdital: ed.NUMERO,
                    nomeCogestora: ed.cogestora?.NOME
                });
                if (ed.TERMINO && now > ed.TERMINO) {
                    eventos.push({
                        id: ed.ID_EDITAL + '_termino_vinc',
                        tipo: 'alerta',
                        timestamp: ed.TERMINO,
                        titulo: 'Edital Finalizado',
                        descricao: `O prazo do edital ${ed.EDITAL}, que fornecia vagas para esta vinculação, expirou.`,
                        nomeEdital: ed.EDITAL,
                        numeroEdital: ed.NUMERO,
                        nomeCogestora: ed.cogestora?.NOME
                    });
                }
            });
        } else if (tipo === 'lotacao') {
            const lot = await prisma.lotacao.findUnique({ where: { ID_LOTACAO: origemId } });
            if (lot) {
                eventos.push({
                    id: lot.ID_LOTACAO + '_criada',
                    tipo: 'info',
                    timestamp: lot.TIMESTAMP || new Date(),
                    titulo: 'Lotação Registrada',
                    descricao: `A lotação ${lot.LOTACAO} foi criada.`,
                    nomeLotacao: lot.LOTACAO
                });
            }
        }

        // Ordenar decrescente
        eventos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        res.json({ success: true, eventos });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.get('/api/processos/:numero', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { numero } = req.params;
        const processo = await prisma.processo.findUnique({
            where: { NUMERO: numero },
            include: { processosFilhos: true, processoPai: true }
        });
        res.json({ success: true, processo });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.get('/api/processos_all', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const processos = await prisma.processo.findMany({
            orderBy: { TIMESTAMP: 'asc' }
        });
        res.json({ success: true, processos });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.post('/api/processos', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { NUMERO, STATUS_ENCAMINHAMENTO, TITULO, TEXTO_LEGENDA, DATA_PUBLICACAO, FILHO_DE, idLotacao, idEdital, resolvido, chain } = req.body;
        if (!NUMERO) return res.status(400).json({ message: 'Número do processo é obrigatório.' });

        if (chain) {
            const procAnterior = await prisma.processo.findUnique({ where: { ID_PROCESSO: chain } });
            if (procAnterior && procAnterior.RESOLVIDO) {
                return res.status(400).json({ message: 'Não é possível encadear em um processo já resolvido/concluído.' });
            }
        }

        const data: any = {
            NUMERO,
            STATUS_ENCAMINHAMENTO,
            TITULO,
            TEXTO_LEGENDA,
            RESOLVIDO: resolvido || false,
            CHAIN: chain || null
        };

        if (DATA_PUBLICACAO) {
            data.DATA_PUBLICACAO = new Date(DATA_PUBLICACAO);
        }
        if (FILHO_DE) {
            data.FILHO_DE = FILHO_DE;
        }

        const connections: any = {};
        if (idLotacao) {
            connections.lotacoes = { connect: Array.isArray(idLotacao) ? idLotacao.map((id: string) => ({ ID_LOTACAO: id })) : { ID_LOTACAO: idLotacao } };
        }
        if (idEdital) {
            connections.editais = { connect: Array.isArray(idEdital) ? idEdital.map((id: string) => ({ ID_EDITAL: id })) : { ID_EDITAL: idEdital } };
        }

        const existingProcesso = await prisma.processo.findUnique({ where: { NUMERO } });

        const processo = await prisma.processo.upsert({
            where: { NUMERO },
            update: {
                ...data,
                ...connections
            },
            create: {
                ...data,
                ID_PROCESSO: existingProcesso?.ID_PROCESSO || generateId('PRO'),
                ...connections
            }
        });
        
        await auditAction(
            req.user?.usuario || 'Sistema',
            existingProcesso ? 'EDITAR' : 'CRIAR',
            'Processo',
            processo.ID_PROCESSO,
            existingProcesso,
            processo
        );
        
        res.json({ success: true, processo });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.post('/api/inconformidades', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { resolvido, tipo, idProcesso, idTermo, idLotacao, motivo, chain } = req.body;
        if (!tipo || !motivo) {
            return res.status(400).json({ message: 'Tipo e motivo são obrigatórios.' });
        }
        
        if (!idTermo && !idLotacao) {
            return res.status(400).json({ message: 'É obrigatório vincular a Inconformidade a um Edital (idTermo) ou a uma Lotação (idLotacao).' });
        }
        
        // Verifica se a inconformidade anterior está resolvida, se for passar chain
        if (chain) {
            const incAnterior = await prisma.inconformidade.findUnique({ where: { ID_INC: chain } });
            if (incAnterior && incAnterior.RESOLVIDO) {
                return res.status(400).json({ message: 'Não é possível encadear em uma inconformidade já resolvida.' });
            }
        }

        let processoUuid = null;
        if (idProcesso) {
            // Tenta encontrar o processo pelo UUID ou pelo Número SEI
            const processoEncontrado = await prisma.processo.findFirst({
                where: {
                    OR: [
                        { ID_PROCESSO: idProcesso },
                        { NUMERO: idProcesso }
                    ]
                }
            });
            if (processoEncontrado) {
                processoUuid = processoEncontrado.ID_PROCESSO;
            } else {
                return res.status(400).json({ message: 'Processo não encontrado. Crie o processo primeiro.' });
            }
        }

        const novaInc = await prisma.inconformidade.create({
            data: {
                ID_INC: generateId('INC'),
                RESOLVIDO: resolvido || false,
                TIPO: tipo,
                ID_PROCESSO: processoUuid,
                ID_TERMO: idTermo || null,
                ID_LOTACAO: idLotacao || null,
                MOTIVO: motivo,
                CHAIN: chain || null
            }
        });
        
        await auditAction(
            req.user?.usuario || 'Sistema',
            'CRIAR',
            'Inconformidade',
            novaInc.ID_INC,
            null,
            novaInc
        );
        
        res.json({ success: true, inconformidade: novaInc });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.put('/api/inconformidades/:id', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { id } = req.params;
        const { resolvido, tipo, idProcesso, idTermo, idLotacao, motivo, chain } = req.body;
        
        const existingInc = await prisma.inconformidade.findUnique({ where: { ID_INC: id } });
        if (!existingInc) return res.status(404).json({ message: 'Inconformidade não encontrada.' });

        let processoUuid = existingInc.ID_PROCESSO;
        if (idProcesso !== undefined && idProcesso !== null && idProcesso !== '') {
            // Tenta encontrar o processo pelo UUID ou pelo Número SEI
            const processoEncontrado = await prisma.processo.findFirst({
                where: {
                    OR: [
                        { ID_PROCESSO: idProcesso },
                        { NUMERO: idProcesso }
                    ]
                }
            });
            if (processoEncontrado) {
                processoUuid = processoEncontrado.ID_PROCESSO;
            } else {
                return res.status(400).json({ message: 'Processo não encontrado. Crie o processo primeiro.' });
            }
        } else if (idProcesso === '' || idProcesso === null) {
            processoUuid = null;
        }

        const updatedInc = await prisma.inconformidade.update({
            where: { ID_INC: id },
            data: {
                RESOLVIDO: resolvido !== undefined ? resolvido : existingInc.RESOLVIDO,
                TIPO: tipo || existingInc.TIPO,
                ID_PROCESSO: processoUuid,
                ID_TERMO: idTermo !== undefined ? idTermo : existingInc.ID_TERMO,
                ID_LOTACAO: idLotacao !== undefined ? idLotacao : existingInc.ID_LOTACAO,
                MOTIVO: motivo || existingInc.MOTIVO,
                CHAIN: chain !== undefined ? chain : existingInc.CHAIN
            }
        });

        await auditAction(
            req.user?.usuario || 'Sistema',
            'EDITAR',
            'Inconformidade',
            updatedInc.ID_INC,
            existingInc,
            updatedInc
        );

        res.json({ success: true, inconformidade: updatedInc });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
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
                DATA_CRIACAO: getBrasiliaTimestamp()
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

import * as onDemandAlerts from './services/onDemandAlerts';

app.get('/api/alerts', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    try {
        const user = req.user; // Obtém o objeto de usuário do token
        if (!user) {
            // Embora o authenticateToken já bloqueie, é uma boa prática verificar.
            return res.status(401).json([]);
        }

        // Chama as funções do serviço em paralelo para otimizar
        const [
            contratos, 
            vagas,
            editais
        ] = await Promise.all([
            onDemandAlerts.verificarContratosProximosDoFim(user),
            onDemandAlerts.verificarVagasOciosas(user),
            onDemandAlerts.verificarEditaisProximosDoFim(user)
        ]);

        // Junta os resultados de todas as rotinas em um único array
        const allAlerts = [...contratos, ...vagas, ...editais];
        
        res.json(allAlerts);

    } catch (e: any) {
        console.error("ERRO: Falha ao gerar alertas on-demand:", e);
        // Retorna um erro 500 para o cliente, indicando que algo deu errado no servidor
        res.status(500).json({ message: "Erro ao buscar alertas do sistema." });
    }
});

// --- GENERIC CRUD ROUTES ---

app.get('/api/utils/cep/:cep', authenticateToken, async (req: any, res: any) => {
    try {
        const cleanCep = req.params.cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return res.status(400).json({ message: 'CEP inválido' });
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        if (!response.ok) return res.status(500).json({ message: 'Erro ao buscar dados do CEP' });
        const data = await response.json();
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao buscar dados do CEP' });
    }
});

app.get('/api/utils/cep/busca/:logradouro', authenticateToken, async (req: any, res: any) => {
    try {
        let logradouro = req.params.logradouro;
        
        // Remove everything after a comma (usually numbers and complements)
        if (logradouro.includes(',')) {
            logradouro = logradouro.split(',')[0];
        }
        
        // Remove any remaining standalone numbers and trim
        logradouro = logradouro.replace(/[0-9]/g, '').trim();

        if (!logradouro || logradouro.length < 3) {
            return res.status(400).json({ message: 'Logradouro deve ter pelo menos 3 caracteres úteis para busca' });
        }
        // Assuming RJ / Rio de Janeiro as default for this system.
        const response = await fetch(`https://viacep.com.br/ws/RJ/Rio de Janeiro/${encodeURIComponent(logradouro)}/json/`);
        if (!response.ok) return res.status(500).json({ message: 'Erro ao buscar CEP por logradouro na API externa' });
        const data = await response.json();
        res.json(data); // Returns an array of matches
    } catch (e: any) {
        res.status(500).json({ message: 'Erro interno ao buscar CEP por logradouro' });
    }
});

app.get('/api/:entity', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        const userRole = req.user?.papel;
        const isGerente = req.user?.isGerente;

        if (entity === 'AuditoriaLGPD') {
            if (userRole !== 'COORDENAÇÃO' || !isGerente) {
                return res.status(403).json({ message: 'Acesso negado. Apenas gerentes da coordenação podem acessar a auditoria LGPD.' });
            }
        } else if (['Auditoria', 'Inativo', 'ContratoHistorico', 'AlocacaoHistorico'].includes(entity)) {
            if (userRole !== 'COORDENAÇÃO' && !isGerente) {
                return res.status(403).json({ message: 'Acesso negado.' });
            }
        }

        const query: any = req.query.search ? {
            where: { OR: [{ [getEntityPk(entity)]: { contains: req.query.search } }] }
        } : { where: {} };

        if (entity === 'Auditoria' || entity === 'AuditoriaLGPD') {
            const isCoord = userRole === 'COORDENAÇÃO';
            if (!isCoord && isGerente && userRole) {
                const teamUsers = await prisma.usuario.findMany({ where: { papel: userRole }, select: { usuario: true } });
                const teamUsernames = teamUsers.map((u: any) => u.usuario);
                query.where = { ...query.where, USUARIO: { in: teamUsernames } };
            }
        }
        
        const inclusions: any = {};
        if (entity === 'Vaga') inclusions.include = { lotacao: { include: { vinculacao: true } }, postoTrabalho: true, edital: true, contrato: { include: { pessoa: { include: { notas: true } } } } };
        if (entity === 'Contrato') inclusions.include = { vaga: true, pessoa: { include: { notas: true } }, funcao: true };
        if (entity === 'Alocacao') inclusions.include = { servidor: { include: { pessoa: { include: { notas: true } } } }, lotacao: true, funcao: true };
        if (entity === 'Servidor') inclusions.include = { pessoa: { include: { notas: true } }, funcao: true };
        if (entity === 'Edital') inclusions.include = { cogestora: true };
        if (entity === 'Lotacao') inclusions.include = { vinculacao: true };

        let data;
        data = await model.findMany({ ...query, ...inclusions });
        
        const flatData = data.map((item: any) => {
            const flat = { ...item };
            if (entity === 'Edital') {
                flat.NOME_COGESTORA = item.cogestora?.NOME;
            }
            if (entity === 'Vaga') {
                flat.LOTACAO_NOME = item.lotacao?.LOTACAO;
                flat.POSTO_NOME = item.postoTrabalho?.NOME_POSTO;
                flat.EDITAL_NOME = item.edital?.EDITAL;
                
                // Determina o status da Vaga para ser consumido pelo frontend
                if (item.BLOQUEADA) {
                    flat.STATUS_VAGA = 'Bloqueada';
                } else if (item.contrato && item.contrato.length > 0) {
                    flat.STATUS_VAGA = 'Ocupada';
                } else {
                    flat.STATUS_VAGA = 'Aberta';
                }
            }
            if (entity === 'Contrato') {
                flat.NOME_PESSOA = item.pessoa?.NOME;
                flat.NOME_FUNCAO = item.funcao?.FUNCAO;
                if (userRole === 'GDEP') {
                    if (flat.pessoa) {
                        flat.pessoa.ENDERECO = '*** (Oculto - LGPD)';
                        flat.pessoa.CEP = '***';
                    }
                }
            }
            if (entity === 'Servidor') {
                flat.NOME_PESSOA = item.pessoa?.NOME;
                flat.NOME_FUNCAO = item.funcao?.FUNCAO;
                if (userRole === 'GDEP') {
                    if (flat.pessoa) {
                        flat.pessoa.ENDERECO = '*** (Oculto - LGPD)';
                        flat.pessoa.CEP = '***';
                    }
                }
            }
            if (entity === 'Pessoa' && userRole === 'GDEP') {
                flat.ENDERECO = '*** (Oculto - LGPD)';
                flat.CEP = '***';
            }
            if (entity === 'Usuario') {
                delete flat.senha;
                delete flat.assinatura;
            }
            return flat;
        });

        // Registrar a leitura caso seja uma listagem sensível
        if (['Pessoa', 'Servidor', 'Contrato', 'Inativo', 'ContratoHistorico', 'AlocacaoHistorico'].includes(entity)) {
             auditLGPDAction(req.user?.usuario || 'Desconhecido', 'LEITURA', entity, 'LISTAGEM_GERAL');
        }

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

    if (req.user?.papel === 'GABINETE' || req.user?.papel === 'GACP') {
        return res.status(403).json({ message: 'Acesso negado. O perfil é somente leitura.' });
    }

    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });
    try {
        let data = cleanData(req.body);

        if (entity === 'Contrato' || entity === 'Servidor') {
            const cpfToCheck = data.CPF;
            if (cpfToCheck) {
                const orConditions = [];
                if (cpfToCheck) {
                    const cleanCpf = cpfToCheck.replace(/\D/g, '');
                    const maskedCpf = cleanCpf.length === 11 ? cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpfToCheck;
                    orConditions.push({ CPF: cleanCpf });
                    orConditions.push({ CPF: maskedCpf });
                }

                if (orConditions.length > 0) {
                    const notas = await prisma.nota.findFirst({
                        where: { OR: orConditions, GRAVISSIMO: true }
                    });
                    if (notas) {
                        return res.status(403).json({ message: 'Bloqueio: Esta pessoa possui uma infração gravíssima e não pode ser vinculada.' });
                    }
                }
            }
        }

        if (entity === 'Usuario' && data.senha) {
            const salt = await bcrypt.genSalt(10);
            data.senha = await bcrypt.hash(data.senha, salt);
        }
        if ((entity === 'Pessoa' || entity === 'Vinculacao' || entity === 'Cogestora' || entity === 'Lotacao') && (data.ENDERECO || data.CEP || data.BAIRRO)) {
            const coords = await geocodeAddress(
                data.ENDERECO, 
                data.CEP, 
                data.BAIRRO, 
                data.NUMERO, 
                data.CIDADE, 
                data.ESTADO, 
                data.PAIS
            );
            if (coords) {
                data.LATITUDE = coords.latitude;
                data.LONGITUDE = coords.longitude;
            }
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
    let { entity, id } = req.params;

    const model = getModel(entity);
    const usuario = req.user?.usuario || 'Desconhecido';

    if (req.user?.papel === 'GABINETE' || req.user?.papel === 'GACP') {
        return res.status(403).json({ message: 'Acesso negado. O perfil é somente leitura.' });
    }

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
        if (entity === 'Pessoa' || entity === 'Vinculacao' || entity === 'Cogestora' || entity === 'Lotacao') {
            const cepChanged = data.CEP !== undefined && data.CEP !== oldRecord?.CEP;
            const enderecoChanged = data.ENDERECO !== undefined && data.ENDERECO !== oldRecord?.ENDERECO;
            const bairroChanged = data.BAIRRO !== undefined && data.BAIRRO !== oldRecord?.BAIRRO;
            const numeroChanged = data.NUMERO !== undefined && data.NUMERO !== oldRecord?.NUMERO;
            
            if (cepChanged || enderecoChanged || bairroChanged || numeroChanged) {
                const coords = await geocodeAddress(
                    data.ENDERECO !== undefined ? data.ENDERECO : oldRecord?.ENDERECO, 
                    data.CEP !== undefined ? data.CEP : oldRecord?.CEP,
                    data.BAIRRO !== undefined ? data.BAIRRO : oldRecord?.BAIRRO,
                    data.NUMERO !== undefined ? data.NUMERO : oldRecord?.NUMERO,
                    data.CIDADE !== undefined ? data.CIDADE : oldRecord?.CIDADE,
                    data.ESTADO !== undefined ? data.ESTADO : oldRecord?.ESTADO,
                    data.PAIS !== undefined ? data.PAIS : oldRecord?.PAIS
                );
                if (coords) {
                    data.LATITUDE = coords.latitude;
                    data.LONGITUDE = coords.longitude;
                }
            }
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
    let { entity, id } = req.params;

    const model = getModel(entity);
    const usuario = req.user?.usuario || 'Desconhecido';

    if (req.user?.papel === 'GABINETE' || req.user?.papel === 'GACP') {
        return res.status(403).json({ message: 'Acesso negado. O perfil é somente leitura.' });
    }

    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });
    try {
        const pkField = getEntityPk(entity);
        const oldRecord = await model.findUnique({ where: { [pkField]: id } });
        if (!oldRecord) throw new Error('Record to delete does not exist');

        if (entity === 'Vaga') {
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                const contratoAtivo = await tx.contrato.findFirst({ where: { ID_VAGA: id } });
                if (contratoAtivo) {
                    const dadosParaHistorico = {
                        ID_HISTORICO_CONTRATO: generateId('HTC'),
                        ID_CONTRATO: contratoAtivo.ID_CONTRATO,
                        CPF: contratoAtivo.CPF,
                        ID_VAGA: contratoAtivo.ID_VAGA,
                        ID_FUNCAO: contratoAtivo.ID_FUNCAO,
                        DATA_DO_CONTRATO: contratoAtivo.DATA_DO_CONTRATO,
                        DATA_ARQUIVAMENTO: getBrasiliaTimestamp(),
                        MOTIVO_ARQUIVAMENTO: 'Vaga excluída'
                    };
                    await tx.contratoHistorico.create({ data: dadosParaHistorico });
                    await auditAction(usuario, 'ARQUIVAR', 'Contrato', contratoAtivo.ID_CONTRATO, contratoAtivo, null, tx);
                    await tx.contrato.delete({ where: { ID_CONTRATO: contratoAtivo.ID_CONTRATO } });
                }
                await tx.vaga.delete({ where: { ID_VAGA: id } });
            });
        } else {
            await model.delete({ where: { [pkField]: id } });
        }

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
        if (reportName === 'revisoesPendentes') {
            result = []; // Fluxo removido
        } else if (reportName === 'dashboardPessoal') {
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
            const vagas = await prisma.vaga.findMany({ include: { lotacao: { include: { vinculacao: true } }, postoTrabalho: true, edital: true } });
            const contratos = await prisma.contrato.findMany({ select: { ID_VAGA: true, CPF: true } });
            const ocupadaMap = new Set(contratos.map((c: any) => c.ID_VAGA));
            const quantitativoMap = new Map();
            const panorama: any[] = [];
            vagas.forEach((v: any) => {
                let status = 'Disponível';
                let reservadaPara = null;
                if (v.BLOQUEADA) status = 'Bloqueada';
                else if (ocupadaMap.has(v.ID_VAGA)) status = 'Ocupada';
                
                panorama.push({ ID_VAGA: v.ID_VAGA, STATUS: status, VINCULACAO: v.lotacao?.vinculacao?.NOME || 'N/A', LOTACAO_OFICIAL: v.lotacao?.LOTACAO || 'N/A', NOME_CARGO: v.postoTrabalho?.NOME_POSTO || 'N/A', RESERVADA_PARA: reservadaPara, OCUPANTE: status === 'Ocupada' ? 'Ocupada' : null });
                if (status !== 'Ocupada' && status !== 'Bloqueada') {
                    const key = `${v.lotacao?.vinculacao?.NOME || 'N/A'}|${v.lotacao?.LOTACAO || 'N/A'}|${v.cargo?.NOME_CARGO || 'N/A'}`;
                    if (!quantitativoMap.has(key)) quantitativoMap.set(key, { free: 0, reserved: [] });
                    const entry = quantitativoMap.get(key);
                    entry.free++;
                }
            });
            const quantitativo = Array.from(quantitativoMap.entries()).map(([key, val]: any) => {
                const [vinculacao, lotacao, cargo] = key.split('|');
                const detailsParts = [];
                if (val.free > 0) detailsParts.push(`Livre x${val.free}`);
                return { VINCULACAO: vinculacao, LOTACAO: lotacao, CARGO: cargo, DETALHES: detailsParts.join(', ') };
            });
            result = { panorama, quantitativo };
        } else if (reportName === 'georeferenciamento') {
            const userRole = req.user?.papel;
            if (userRole !== 'COORDENAÇÃO' && userRole !== 'GABINETE') {
                return res.status(403).json({ message: 'Acesso negado. Apenas Coordenação e Gabinete podem visualizar o mapa de georeferenciamento.' });
            }
            auditLGPDAction(req.user?.usuario || 'Desconhecido', 'LEITURA', 'MapaGeoreferenciamento', 'TODOS');

            // --- INÍCIO GEOCODIFICAÇÃO ON-THE-FLY ---
            // Removido para otimizar o carregamento do mapa. A geocodificação agora é feita via script externo (geocode_pessoas.ts)
            // e de forma assíncrona durante a criação/edição dos registros no banco.
            // --- FIM GEOCODIFICAÇÃO ON-THE-FLY ---

            
            const pessoas = await prisma.pessoa.findMany({
                where: { LATITUDE: { not: null }, LONGITUDE: { not: null } },
                select: {
                    CPF: true, NOME: true, LATITUDE: true, LONGITUDE: true,
                    servidor: { include: { funcao: true, alocacao: { include: { lotacao: true } } } },
                    contratos: { include: { funcao: true, vaga: { include: { lotacao: true, postoTrabalho: true, edital: true } } } }
                }
            });

            const lotacoes = await prisma.lotacao.findMany({
                where: { LATITUDE: { not: null }, LONGITUDE: { not: null } }
            });

            const markers: any[] = [];

            pessoas.forEach((p: any) => {
                let vinculo = 'Nenhum';
                let lotacao = 'Nenhuma';
                let funcao = 'Nenhuma';
                let postoTrabalho = 'Nenhum';
                let edital = 'Nenhum';
                let dataAdmissao = null;
                
                if (p.servidor) {
                    vinculo = 'Servidor';
                    funcao = p.servidor.funcao?.FUNCAO || 'Nenhuma';
                    dataAdmissao = p.servidor.DATA_MATRICULA;
                    const aloc = Array.isArray(p.servidor.alocacao) ? p.servidor.alocacao[0] : p.servidor.alocacao;
                    if (aloc?.lotacao) lotacao = aloc.lotacao.LOTACAO;
                } else if (p.contratos && p.contratos.length > 0) {
                    vinculo = 'Contratado';
                    dataAdmissao = p.contratos[0].DATA_DO_CONTRATO;
                    funcao = p.contratos[0].funcao?.FUNCAO || 'Nenhuma';
                    if (p.contratos[0].vaga) {
                        if (p.contratos[0].vaga.lotacao) lotacao = p.contratos[0].vaga.lotacao.LOTACAO;
                        if (p.contratos[0].vaga.postoTrabalho) postoTrabalho = p.contratos[0].vaga.postoTrabalho.NOME_POSTO;
                        if (p.contratos[0].vaga.edital) edital = p.contratos[0].vaga.edital.EDITAL;
                    }
                }

                if (!isNaN(parseFloat(p.LATITUDE)) && !isNaN(parseFloat(p.LONGITUDE))) {
                    markers.push({
                        type: 'pessoa',
                        cpf: p.CPF,
                        nome: p.NOME,
                        latitude: parseFloat(p.LATITUDE),
                        longitude: parseFloat(p.LONGITUDE),
                        vinculo,
                        lotacao,
                        funcao,
                        postoTrabalho,
                        edital,
                        dataAdmissao
                    });
                }
            });

            lotacoes.forEach((l: any) => {
                if (!isNaN(parseFloat(l.LATITUDE)) && !isNaN(parseFloat(l.LONGITUDE))) {
                    markers.push({
                        type: 'lotacao',
                        id: l.ID_LOTACAO,
                        nome: l.LOTACAO,
                        latitude: parseFloat(l.LATITUDE),
                        longitude: parseFloat(l.LONGITUDE),
                        tipoLotacao: l.TIPO_DA_LOTACAO,
                        endereco: l.ENDERECO,
                        bairro: l.BAIRRO,
                        ehSetor: l.EH_SETOR
                    });
                }
            });

            result = markers;
        }
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
});

app.get('/api/Vaga/:id/timeline', authenticateToken, async (req: any, res: any) => {
    try {
        const idVaga = req.params.id;
        
        // 1. Vaga info
        const vaga = await prisma.vaga.findUnique({
            where: { ID_VAGA: idVaga },
            include: { lotacao: true, postoTrabalho: true, edital: true }
        });
        if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada' });

        // 2. Current Contrato
        const contratoAtual = await prisma.contrato.findUnique({
            where: { ID_VAGA: idVaga },
            include: { pessoa: true, funcao: true }
        });

        // 3. ContratoHistorico
        const historico = await prisma.contratoHistorico.findMany({
            where: { ID_VAGA: idVaga }
        });

        // 4. Substitutos
        const substitutos = await prisma.substituto.findMany({
            where: { ID_VAGA: idVaga },
            include: { pessoa: true }
        });

        // Gather all CPFs
        const cpfs = new Set<string>();
        if (contratoAtual?.CPF) cpfs.add(contratoAtual.CPF);
        historico.forEach((h: any) => { if (h.CPF) cpfs.add(h.CPF); });
        substitutos.forEach((s: any) => { if (s.CPF) cpfs.add(s.CPF); });

        // 5. Protocolos for these CPFs
        const pessoas = await prisma.pessoa.findMany({
            where: { CPF: { in: Array.from(cpfs) } },
            select: { CPF: true, NOME: true }
        });
        const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));

        const protocolos = await prisma.protocolo.findMany({
            where: { CPF: { in: Array.from(cpfs) } }
        });

        let events: any[] = [];

        if (contratoAtual) {
            events.push({
                type: 'CONTRATO_ATUAL',
                date: contratoAtual.DATA_DO_CONTRATO,
                title: 'Contrato Atual Iniciado',
                description: `Entrada de ${contratoAtual.pessoa?.NOME || 'Desconhecido'}`,
                cpf: contratoAtual.CPF
            });
        }

        historico.forEach((h: any) => {
            const nome = pessoaMap.get(h.CPF || '') || 'Desconhecido';
            if (h.DATA_DO_CONTRATO) {
                events.push({
                    type: 'CONTRATO_HISTORICO_INICIO',
                    date: h.DATA_DO_CONTRATO,
                    title: 'Contrato Anterior',
                    description: `Entrada de ${nome}`,
                    cpf: h.CPF
                });
            }
            if (h.DATA_ARQUIVAMENTO) {
                events.push({
                    type: 'CONTRATO_HISTORICO_FIM',
                    date: h.DATA_ARQUIVAMENTO,
                    title: 'Saída/Desligamento',
                    description: `Saída de ${nome}. Motivo: ${h.MOTIVO_ARQUIVAMENTO || 'Não informado'}`,
                    cpf: h.CPF
                });
            }
        });

        substitutos.forEach((s: any) => {
            const nome = s.pessoa?.NOME || 'Desconhecido';
            if (s.DATA_ENTRADA) {
                events.push({
                    type: 'SUBSTITUICAO_INICIO',
                    date: s.DATA_ENTRADA,
                    title: 'Início de Substituição',
                    description: `${nome} iniciou substituição`,
                    cpf: s.CPF
                });
            }
            if (s.DATA_SAIDA) {
                 events.push({
                    type: 'SUBSTITUICAO_FIM',
                    date: s.DATA_SAIDA,
                    title: 'Fim de Substituição',
                    description: `${nome} encerrou substituição`,
                    cpf: s.CPF
                });
            }
        });

        protocolos.forEach((p: any) => {
            if (p.INICIO_PRAZO || p.TIMESTAMP) {
                events.push({
                    type: 'PROTOCOLO',
                    date: p.INICIO_PRAZO || p.TIMESTAMP,
                    title: p.TIPO_DE_PROTOCOLO || 'Protocolo/Afastamento',
                    description: `Registrado para ${pessoaMap.get(p.CPF || '') || 'Desconhecido'}`,
                    cpf: p.CPF,
                    details: p
                });
            }
        });

        events = events.filter(e => e.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        res.json({ vaga, events });
    } catch (e: any) {
        console.error('Erro na timeline da vaga:', e);
        res.status(500).json({ message: 'Erro ao buscar linha do tempo da vaga' });
    }
});


app.get('/api/gpmp/cockpit', authenticateToken, async (req: any, res: any) => {
    try {
        const vagas = await prisma.vaga.findMany({
            include: {
                edital: true,
                lotacao: { include: { vinculacao: true } },
                postoTrabalho: true,
                contrato: { include: { pessoa: true } }
            }
        });

        let editais = await prisma.edital.findMany();
        // Filtrar editais vigentes (TERMINO >= hoje ou null)
        const hojeDate = new Date();
        hojeDate.setHours(0,0,0,0);
        editais = editais.filter((e: any) => !e.TERMINO || new Date(e.TERMINO) >= hojeDate);
        const editaisVigentesIds = editais.map((e: any) => e.ID_EDITAL);

        // Apenas vagas de editais vigentes
        const vagasVigentes = vagas.filter((v: any) => !v.ID_EDITAL || editaisVigentesIds.includes(v.ID_EDITAL));

        const historico = await prisma.contratoHistorico.findMany({
            where: { DATA_ARQUIVAMENTO: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) } }
        });
        const contratosMes = await prisma.contrato.findMany({
            where: { DATA_DO_CONTRATO: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) } }
        });

        // 1. Termômetro Editais
        let editaisNaMeta = 0;
        let editaisSatisfatorios = 0;
        let editaisDeficit = 0;

        const editaisStats = editais.map(edital => {
            const vagasEdital = vagasVigentes.filter((v: any) => v.ID_EDITAL === edital.ID_EDITAL && !v.BLOQUEADA);
            const total = vagasEdital.length;
            const ocupadas = vagasEdital.filter(v => v.contrato !== null).length;
            
            const ocupacaoReal = total > 0 ? (ocupadas / total) * 100 : 0;
            const meta = edital.META_OCUPACAO || 100;
            const satisfatorio = edital.NIVEL_SATISFATORIO || 85;

            if (ocupacaoReal >= meta) editaisNaMeta++;
            else if (ocupacaoReal >= satisfatorio) editaisSatisfatorios++;
            else editaisDeficit++;

            return { id: edital.ID_EDITAL, nome: edital.EDITAL, ocupacao: ocupacaoReal, meta, satisfatorio };
        });

        // 2. Termômetro Vacância
        let vagasCriticas: any[] = [];
        let vagasAlerta: any[] = [];
        let vagasAtencao: any[] = [];

        // Para calcular vacância, precisamos do último histórico da vaga.
        // Como aproximação rápida (já que a linha do tempo busca o histórico detalhado),
        // vamos cruzar o histórico recente das vagas desocupadas.
        const vagasVazias = vagasVigentes.filter((v: any) => v.contrato === null && !v.BLOQUEADA);
        
        // Buscar o último arquivamento de cada vaga vazia
        const ultimoHistoricoVazias = await prisma.contratoHistorico.groupBy({
            by: ['ID_VAGA'],
            where: { ID_VAGA: { in: vagasVazias.map(v => v.ID_VAGA) } },
            _max: { DATA_ARQUIVAMENTO: true }
        });

        const historicoMap = new Map(ultimoHistoricoVazias.map(h => [h.ID_VAGA, h._max.DATA_ARQUIVAMENTO]));
        const hoje = new Date().getTime();

        vagasVazias.forEach(v => {
            const dataSaida = historicoMap.get(v.ID_VAGA);
            let diasVazios = 0;
            if (dataSaida) {
                diasVazios = Math.floor((hoje - new Date(dataSaida).getTime()) / (1000 * 3600 * 24));
            } else {
                // Vagas nunca ocupadas usam INICIO do edital (se existir) ou TIMESTAMP da vaga
                const dataInicioStr = v.edital?.INICIO;
                let dataBase = new Date(v.TIMESTAMP).getTime();
                if (dataInicioStr) {
                    const dtInicio = new Date(dataInicioStr).getTime();
                    // So usa se a data for valida
                    if (!isNaN(dtInicio)) dataBase = dtInicio;
                }
                diasVazios = Math.floor((hoje - dataBase) / (1000 * 3600 * 24));
            }

            const itemInfo = { ...v, diasVazios };

            if (diasVazios >= 15) vagasCriticas.push(itemInfo);
            else if (diasVazios >= 7) vagasAlerta.push(itemInfo);
            else vagasAtencao.push(itemInfo);
        });

        // 3. Indicador de Cotas (Global - Simplificado para o Header, mas a tabela detalhará por Edital)
        // Algoritmo Volátil de Cotas
        let globaisCotas = {
            totalVagas: vagasVigentes.filter((v: any) => !v.BLOQUEADA).length,
            metaPCD_Absoluta: 0,
            metaAfro_M_Absoluta: 0,
            metaAfro_F_Absoluta: 0,
            metaAssist_Absoluta: 0,
            realizadoPCD: 0,
            realizadoAfro_M: 0,
            realizadoAfro_F: 0,
            realizadoAssist: 0
        };

        const cotasPorEdital: any[] = [];

        editais.forEach((edital: any) => {
            const vagasEdital = vagasVigentes.filter((v: any) => v.ID_EDITAL === edital.ID_EDITAL && !v.BLOQUEADA);
            const total = vagasEdital.length;
            if (total === 0) return;

            const ocupantes = vagasEdital.filter((v: any) => v.contrato !== null && v.contrato.pessoa !== null).map((v: any) => v.contrato.pessoa);

            // Metas do Edital
            const metaPcd = Math.ceil((edital.COTA_PCD || 0) / 100 * total);
            const metaAfroTotal = Math.ceil((edital.COTA_AFRO || 0) / 100 * total);
            const metaAfro_M = Math.floor(metaAfroTotal / 2);
            const metaAfro_F = Math.ceil(metaAfroTotal / 2);
            const metaAssist = Math.ceil((edital.COTA_ASSISTENCIA || 0) / 100 * total);

            globaisCotas.metaPCD_Absoluta += metaPcd;
            globaisCotas.metaAfro_M_Absoluta += metaAfro_M;
            globaisCotas.metaAfro_F_Absoluta += metaAfro_F;
            globaisCotas.metaAssist_Absoluta += metaAssist;

            let cotaAtual = {
                PCD: 0,
                AFRO_M: 0,
                AFRO_F: 0,
                ASSISTENCIA: 0
            };

            // Distribuir as pessoas (Volátil)
            ocupantes.forEach(pessoa => {
                const isPCD = pessoa.PCD;
                const isAssist = pessoa.USUARIO_ASSISTENCIA;
                const isAfro = pessoa.AFRODESCENDENTE;
                const isFeminino = pessoa.SEXO === 'Feminino';

                if (!isPCD && !isAssist && !isAfro) return; // Não é cotista

                // Calcular déficit de cada cota para este edital
                const deficitAssist = metaAssist - cotaAtual.ASSISTENCIA;
                const deficitPCD = metaPcd - cotaAtual.PCD;
                const deficitAfro = isFeminino ? (metaAfro_F - cotaAtual.AFRO_F) : (metaAfro_M - cotaAtual.AFRO_M);

                let escolhida = null;
                let maiorDeficit = -9999;

                const avaliarCota = (nome: string, deficit: number) => {
                    if (deficit > maiorDeficit) {
                        maiorDeficit = deficit;
                        escolhida = nome;
                    }
                };

                // Regra 2: Distância para preencher (maior déficit)
                if (isAssist) avaliarCota('ASSISTENCIA', deficitAssist);
                if (isPCD) avaliarCota('PCD', deficitPCD);
                if (isAfro) avaliarCota(isFeminino ? 'AFRO_F' : 'AFRO_M', deficitAfro);

                // Regra 3: Empate ou todas preenchidas -> Prioridade: Assist > PCD > Afro
                if (escolhida === null || maiorDeficit <= 0) {
                     if (isAssist) escolhida = 'ASSISTENCIA';
                     else if (isPCD) escolhida = 'PCD';
                     else if (isAfro) escolhida = isFeminino ? 'AFRO_F' : 'AFRO_M';
                }

                if (escolhida) (cotaAtual as any)[escolhida]++;
            });

            globaisCotas.realizadoPCD += cotaAtual.PCD;
            globaisCotas.realizadoAfro_M += cotaAtual.AFRO_M;
            globaisCotas.realizadoAfro_F += cotaAtual.AFRO_F;
            globaisCotas.realizadoAssist += cotaAtual.ASSISTENCIA;

            cotasPorEdital.push({
                edital: edital.EDITAL,
                metas: { pcd: metaPcd, afro_m: metaAfro_M, afro_f: metaAfro_F, assist: metaAssist },
                realizado: { pcd: cotaAtual.PCD, afro_m: cotaAtual.AFRO_M, afro_f: cotaAtual.AFRO_F, assist: cotaAtual.ASSISTENCIA }
            });
        });

        // 4. Giro e Tempo de Reposição
        const saldoGiro = contratosMes.length - historico.length; // Positivo = Crescimento, Negativo = Retração

        res.json({
            termometroEditais: { naMeta: editaisNaMeta, satisfatorios: editaisSatisfatorios, deficit: editaisDeficit, lista: editaisStats },
            vacancia: {
                criticas: vagasCriticas.sort((a,b) => b.diasVazios - a.diasVazios),
                alerta: vagasAlerta.sort((a,b) => b.diasVazios - a.diasVazios),
                atencao: vagasAtencao.sort((a,b) => b.diasVazios - a.diasVazios)
            },
            giro: { admissoes: contratosMes.length, desligamentos: historico.length, saldo: saldoGiro },
            cotas: { global: globaisCotas, porEdital: cotasPorEdital }
        });
    } catch (e: any) {
        console.error('Erro no Cockpit GPMP:', e);
        res.status(500).json({ message: 'Erro ao gerar dados do Cockpit' });
    }
});

app.get('/api/Pessoa/:id/dossier', authenticateToken, async (req: any, res: any) => {
    let identifier = req.params.id;
    let identifierClean = identifier;
    let identifierMasked = identifier;

    if (/^[\d.-]+$/.test(identifier)) {
        identifierClean = identifier.replace(/\D/g, '');
        if (identifierClean.length === 11) {
            identifierMasked = identifierClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        }
    }

    const userRole = req.user?.papel;
    const isGerente = req.user?.isGerente;

    try {
        let pessoa: any = await prisma.pessoa.findFirst({ 
            where: { 
                OR: [
                    { CPF: identifierClean },
                    { CPF: identifierMasked }
                ]
            },
            include: { notas: { orderBy: { DATA_CRIACAO: 'desc' } } }
        });
        let isTemp = false;

        if (!pessoa) return res.status(404).json({ message: `Pessoa com identificador ${identifier} não encontrada.` });
        
        if (userRole === 'GDEP') {
            pessoa.ENDERECO = '*** (Oculto - LGPD)';
            pessoa.CEP = '***';
        }

        const orConditions = [];
        if (pessoa.CPF) {
            const clean = pessoa.CPF.replace(/\D/g, '');
            const masked = clean.length === 11 ? clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : pessoa.CPF;
            orConditions.push({ CPF: clean });
            orConditions.push({ CPF: masked });
        }

        // Se por acaso não tiver CPF nem ID (teoricamente impossível), não deve buscar contratos
        if (orConditions.length === 0) {
             return res.json({ pessoal: pessoa, tipoPerfil: isTemp ? 'Candidato' : 'Avulso', vinculosAtivos: [], historico: [], atividadesEstudantis: { capacitacoes: [] } });
        }

        const contratos = await prisma.contrato.findMany({ where: { OR: orConditions }, include: { funcao: true, vaga: { include: { lotacao: true, postoTrabalho: true, exercicio: { include: { lotacao: true } } } } } });
        const servidores = await prisma.servidor.findMany({ where: { OR: orConditions }, include: { funcao: true, alocacao: { include: { lotacao: true, funcao: true } } } });
        
        let tipoPerfil = isTemp ? 'Candidato' : 'Avulso';
        if (servidores.length > 0) tipoPerfil = 'Servidor';
        else if (contratos.length > 0) tipoPerfil = 'Contratado';

        const vinculosAtivos: any[] = [];
        for (const c of contratos) { vinculosAtivos.push({ tipo: 'Contrato', id_contrato: c.ID_CONTRATO, funcao: c.funcao?.FUNCAO || 'Função não definida', lotacao: c.vaga?.exercicio?.lotacao?.LOTACAO || c.vaga?.lotacao?.LOTACAO || 'Sem Lotação', data_inicio: c.DATA_DO_CONTRATO, detalhes: `Vaga ${c.ID_VAGA || 'N/A'}`, escolaridade_posto: c.vaga?.postoTrabalho?.ESCOLARIDADE }); }
        
        for (const s of servidores) { 
            const sAny = s as any;
            let aloc = Array.isArray(sAny.alocacao) ? sAny.alocacao[0] : sAny.alocacao; 
            vinculosAtivos.push({ 
                tipo: 'Servidor', 
                matricula: sAny.MATRICULA, 
                funcao_efetiva: sAny.funcao?.FUNCAO || 'Função não definida', 
                funcao_atual: aloc?.funcao?.FUNCAO || 'Sem função comissionada', 
                alocacao_atual: aloc?.lotacao?.LOTACAO || 'Sem Lotação', 
                data_admissao: sAny.DATA_MATRICULA, 
                detalhes: `Vínculo: ${sAny.VINCULO}` 
            }); 
        }

        const timeline: any[] = [];
        
        if (userRole === 'COORDENAÇÃO' || isGerente) {
            const auditConditions = [];
            if (pessoa.CPF) {
                const clean = pessoa.CPF.replace(/\D/g, '');
                const masked = clean.length === 11 ? clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : pessoa.CPF;
                auditConditions.push({ VALOR_ANTIGO: { contains: clean } });
                auditConditions.push({ VALOR_ANTIGO: { contains: masked } });
            }

            const auditoriaLogs = await prisma.auditoria.findMany({
                where: {
                    OR: [
                        { TABELA_AFETADA: 'Contrato', ACAO: 'ARQUIVAR' },
                        { TABELA_AFETADA: 'Servidor', ACAO: 'INATIVAR' }
                    ],
                    AND: { OR: auditConditions }
                }
            });

            auditoriaLogs.forEach((log: any) => {
                const data = JSON.parse(log.VALOR_ANTIGO || '{}');
                // Considerar válido se bater com CPF do registro excluído
                if (data.CPF !== pessoa.CPF) return;

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
        }

        auditLGPDAction(req.user?.usuario || 'Desconhecido', 'LEITURA', 'Dossier', identifier);

        res.json({ pessoal: pessoa, tipoPerfil, vinculosAtivos, historico: timeline, notas: pessoa.notas || [], atividadesEstudantis: { capacitacoes: [] } });
    } catch (e: any) { res.status(500).json({ message: 'Erro Dossiê: ' + e.message }); }
});

app.post('/api/Pessoa/:id/nota', authenticateToken, async (req: any, res: any) => {
    try {
        const identifier = req.params.id;
        const { OBS, GRAVISSIMO } = req.body;

        let cpfToSave = null;
        let idTempToSave = null;

        let identifierClean = identifier;
        let identifierMasked = identifier;

        if (/^[\d.-]+$/.test(identifier)) {
            identifierClean = identifier.replace(/\D/g, '');
            if (identifierClean.length === 11) {
                identifierMasked = identifierClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
            }
        }

        const pessoa = await prisma.pessoa.findFirst({ where: { OR: [{ CPF: identifierClean }, { CPF: identifierMasked }] } });
        if (pessoa) {
            cpfToSave = pessoa.CPF;
        } else {
            return res.status(404).json({ message: 'Pessoa não encontrada' });
        }

        const newNota = await prisma.nota.create({
            data: {
                ID_NOTA: `NTX${Date.now()}`,
                CPF: cpfToSave,
                GRAVISSIMO: Boolean(GRAVISSIMO),
                OBS: OBS
            }
        });

        await auditAction(req.user?.usuario || 'Desconhecido', 'CRIAR', 'Nota', newNota.ID_NOTA, null, newNota);

        res.json(newNota);
    } catch (e: any) {
        res.status(500).json({ message: 'Erro ao criar nota: ' + e.message });
    }
});

app.get('/api/search/pessoas', authenticateToken, async (req: any, res: any) => {
    const q = req.query.q as string;
    if (!q || q.length < 3) return res.json([]);
    try {
        const orConditions: any[] = [{ NOME: { contains: q } }];
        
        const clean = q.replace(/\D/g, '');
        if (clean.length > 0) {
            orConditions.push({ CPF: { contains: clean } });
            if (clean.length === 11) {
                const masked = clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                orConditions.push({ CPF: { contains: masked } });
            }
        }
        
        const pessoas = await prisma.pessoa.findMany({
            where: {
                OR: orConditions
            },
            take: 20
        });

        res.json(pessoas);
    } catch (e: any) {
        res.status(500).json({ message: 'Erro na busca.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
