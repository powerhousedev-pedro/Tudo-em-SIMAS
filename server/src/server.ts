import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';

// Workaround: Use require for PrismaClient to avoid compilation errors when the client hasn't been generated yet.
const { PrismaClient } = require('@prisma/client');

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

const getModel = (modelName: string) => {
    // Tratamento para nomes compostos que podem vir do frontend
    let name = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    if (name === 'solicitacaoPesquisa') name = 'solicitacaoPesquisa'; 
    if (name === 'cargoComissionado') name = 'cargoComissionado';
    return (prisma as any)[name];
};

function getEntityPk(entity: string): string {
    const pks: any = {
        'Pessoa': 'CPF',
        'Servidor': 'MATRICULA',
        'Usuario': 'id',
        'Inativo': 'MATRICULA',
        'Alocacao': 'ID_ALOCACAO',
        'Contrato': 'ID_CONTRATO',
        'Vaga': 'ID_VAGA',
        'Reserva': 'ID_RESERVA',
        'Protocolo': 'ID_PROTOCOLO'
    };
    if (pks[entity]) return pks[entity];
    return `ID_${entity.toUpperCase()}`;
}

// --- ERROR HANDLING HELPER ---
const getFriendlyErrorMessage = (error: any): string => {
    const msg = error.message || '';

    // Prisma Unique Constraint (P2002)
    if (msg.includes('Unique constraint') || error.code === 'P2002') {
        return 'Já existe um registro com estes dados (CPF, Matrícula ou ID duplicado).';
    }

    // Prisma Foreign Key Constraint (P2003)
    if (msg.includes('Foreign key constraint') || error.code === 'P2003') {
        return 'Não é possível excluir ou alterar este registro pois ele está vinculado a outros dados no sistema.';
    }

    // Prisma Record Not Found (P2025)
    if (msg.includes('Record to delete does not exist') || msg.includes('Record to update not found') || error.code === 'P2025') {
        return 'O registro solicitado não foi encontrado no banco de dados. Pode ter sido excluído anteriormente.';
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
    return 'Ocorreu um erro ao processar sua solicitação. Verifique os dados e tente novamente.';
};

// --- AUDIT SYSTEM ---

const auditAction = async (
    usuario: string, 
    acao: 'CRIAR' | 'EDITAR' | 'EXCLUIR', 
    tabela: string, 
    idRegistro: string, 
    oldVal: any = null, 
    newVal: any = null,
    prismaClient: any = prisma // Permite passar transação
) => {
    try {
        await prismaClient.auditoria.create({
            data: {
                ID_LOG: `LOG${Date.now()}${Math.floor(Math.random()*1000)}`,
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

// Executa todos os dias à meia-noite
cron.schedule('0 0 * * *', async () => {
    console.log('--- Iniciando rotina diária: Verificar Términos de Contrato ---');
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Buscar protocolos de Aviso Prévio que terminaram ontem
        const protocolos = await prisma.protocolo.findMany({
            where: {
                TIPO_DE_PROTOCOLO: 'Aviso Prévio',
                TERMINO_PRAZO: {
                    gte: new Date(yesterdayStr + 'T00:00:00Z'),
                    lt: new Date(yesterdayStr + 'T23:59:59Z')
                }
            }
        });

        console.log(`Encontrados ${protocolos.length} protocolos de aviso prévio vencidos.`);

        for (const p of protocolos) {
            const cpf = p.CPF;
            // Buscar contrato ativo
            const contrato = await prisma.contrato.findFirst({ where: { CPF: cpf } });
            
            if (contrato) {
                console.log(`Arquivando contrato ${contrato.ID_CONTRATO} para CPF ${cpf}`);
                
                await prisma.$transaction(async (tx: any) => {
                    // Arquivar
                    await tx.contratoHistorico.create({
                        data: {
                            ID_HISTORICO_CONTRATO: `HCT${Date.now()}`,
                            ID_CONTRATO_ORIGINAL: contrato.ID_CONTRATO,
                            ID_VAGA: contrato.ID_VAGA,
                            CPF: contrato.CPF,
                            DATA_DO_CONTRATO: contrato.DATA_DO_CONTRATO,
                            ID_FUNCAO: contrato.ID_FUNCAO,
                            DATA_ARQUIVAMENTO: new Date(),
                            MOTIVO_ARQUIVAMENTO: 'Fim de Aviso Prévio (Automático)'
                        }
                    });

                    // Deletar Original
                    await tx.contrato.delete({ where: { ID_CONTRATO: contrato.ID_CONTRATO } });

                    // Auditoria
                    await auditAction('SISTEMA', 'EXCLUIR', 'Contrato', contrato.ID_CONTRATO, contrato, null, tx);
                });
            }
        }
    } catch (e) {
        console.error('Erro na rotina diária:', e);
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
            return res.status(401).json({ message: 'Usuário não encontrado' });
        }

        let isValid = false;
        if (user.senha.startsWith('$2')) {
            isValid = await bcrypt.compare(senha, user.senha);
        } else {
            isValid = (senha === user.senha);
        }

        if (!isValid) {
            return res.status(401).json({ message: 'Senha incorreta' });
        }

        const token = jwt.sign(
            { id: user.id, usuario: user.usuario, papel: user.papel, isGerente: user.isGerente },
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
        console.error("Login error:", e);
        res.status(500).json({ message: 'Erro interno no servidor' });
    }
});

// --- SPECIFIC BUSINESS LOGIC ROUTES ---

// 1. Criar Alocação (Gerencia histórico automaticamente)
app.post('/api/Alocacao', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const data = cleanData(req.body);
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            // Verificar se já existe alocação ativa
            const activeAlocacao = await tx.alocacao.findFirst({
                where: { MATRICULA: data.MATRICULA }
            });

            if (activeAlocacao) {
                // Arquivar
                await tx.alocacaoHistorico.create({
                    data: {
                        ID_HISTORICO_ALOCACAO: `HAL${Date.now()}`,
                        MATRICULA: activeAlocacao.MATRICULA,
                        ID_LOTACAO: activeAlocacao.ID_LOTACAO,
                        ID_FUNCAO: activeAlocacao.ID_FUNCAO,
                        DATA_INICIO: activeAlocacao.DATA_INICIO,
                        DATA_ARQUIVAMENTO: new Date()
                    }
                });
                
                // Remover anterior
                await tx.alocacao.delete({ where: { ID_ALOCACAO: activeAlocacao.ID_ALOCACAO } });
                
                // Auditar arquivamento
                await auditAction(usuario, 'EXCLUIR', 'Alocacao', activeAlocacao.ID_ALOCACAO, activeAlocacao, null, tx);
            }

            // Criar nova
            if (!data.ID_ALOCACAO) data.ID_ALOCACAO = `ALC${Date.now()}`;
            const newAlocacao = await tx.alocacao.create({ data });
            
            // Auditar criação
            await auditAction(usuario, 'CRIAR', 'Alocacao', newAlocacao.ID_ALOCACAO, null, newAlocacao, tx);
            
            return newAlocacao;
        });

        res.json({ success: true, data: result, message: 'Alocação realizada com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 2. Criar Contrato (Baixa reserva automaticamente)
app.post('/api/Contrato', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const data = cleanData(req.body);
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            // Validar existencia de CPF
            const pessoa = await tx.pessoa.findUnique({ where: { CPF: data.CPF }});
            if (!pessoa) throw new Error('CPF não cadastrado.');

            // Criar Contrato
            if (!data.ID_CONTRATO) data.ID_CONTRATO = `CTT${Date.now()}`;
            const newContrato = await tx.contrato.create({ data });

            // Verificar e Baixar Reserva
            const reserva = await tx.reserva.findFirst({
                where: { ID_VAGA: data.ID_VAGA, STATUS: 'Ativa' }
            });

            if (reserva) {
                const oldReserva = { ...reserva };
                const updatedReserva = await tx.reserva.update({
                    where: { ID_RESERVA: reserva.ID_RESERVA },
                    data: { STATUS: 'Utilizada' }
                });
                await auditAction(usuario, 'EDITAR', 'Reserva', reserva.ID_RESERVA, oldReserva, updatedReserva, tx);
            }

            await auditAction(usuario, 'CRIAR', 'Contrato', newContrato.ID_CONTRATO, null, newContrato, tx);
            return newContrato;
        });

        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 3. Arquivar Contrato (Ação Específica)
app.post('/api/Contrato/arquivar', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { CPF, MOTIVO } = req.body;
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const contrato = await tx.contrato.findFirst({ where: { CPF } });
            if (!contrato) throw new Error('Contrato ativo não encontrado para este CPF.');

            const historico = await tx.contratoHistorico.create({
                data: {
                    ID_HISTORICO_CONTRATO: `HCT${Date.now()}`,
                    ID_CONTRATO_ORIGINAL: contrato.ID_CONTRATO,
                    ID_VAGA: contrato.ID_VAGA,
                    CPF: contrato.CPF,
                    DATA_DO_CONTRATO: contrato.DATA_DO_CONTRATO,
                    ID_FUNCAO: contrato.ID_FUNCAO,
                    DATA_ARQUIVAMENTO: new Date(),
                    MOTIVO_ARQUIVAMENTO: MOTIVO || 'Ação Manual'
                }
            });

            await tx.contrato.delete({ where: { ID_CONTRATO: contrato.ID_CONTRATO } });
            await auditAction(usuario, 'EXCLUIR', 'Contrato', contrato.ID_CONTRATO, contrato, null, tx);

            return historico;
        });

        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 4. Inativar Servidor (Workflow Complexo)
app.post('/api/Servidor/inativar', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { MATRICULA, MOTIVO } = req.body;
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const servidor = await tx.servidor.findUnique({ where: { MATRICULA } });
            if (!servidor) throw new Error('Servidor não encontrado.');

            // 1. Criar Inativo
            const inativoData = {
                ID_INATIVO: `INA${Date.now()}`,
                MATRICULA_ORIGINAL: servidor.MATRICULA,
                MATRICULA: servidor.MATRICULA, // Adaptação para campo PK
                CPF: servidor.CPF,
                ID_CARGO: servidor.ID_CARGO,
                DATA_MATRICULA: servidor.DATA_MATRICULA,
                VINCULO_ANTERIOR: servidor.VINCULO,
                PREFIXO_ANTERIOR: servidor.PREFIXO_MATRICULA,
                DATA_INATIVACAO: new Date(),
                MOTIVO_INATIVACAO: MOTIVO
            };
            const inativo = await tx.inativo.create({ data: inativoData });
            await auditAction(usuario, 'CRIAR', 'Inativo', inativo.MATRICULA, null, inativo, tx);

            // 2. Remover Alocação Ativa
            const alocacao = await tx.alocacao.findFirst({ where: { MATRICULA } });
            if (alocacao) {
                await tx.alocacao.delete({ where: { ID_ALOCACAO: alocacao.ID_ALOCACAO } });
                await auditAction(usuario, 'EXCLUIR', 'Alocacao', alocacao.ID_ALOCACAO, alocacao, null, tx);
            }

            // 3. Remover Servidor
            await tx.servidor.delete({ where: { MATRICULA } });
            await auditAction(usuario, 'EXCLUIR', 'Servidor', servidor.MATRICULA, servidor, null, tx);

            return inativo;
        });

        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 5. Upsert Exercício (Lógica específica: Um exercício por vaga)
app.post('/api/Exercicio', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const data = cleanData(req.body);
    const usuario = req.user?.usuario || 'Desconhecido';

    if (!data.ID_VAGA || !data.ID_LOTACAO) {
        return res.status(400).json({ message: "Vaga e Lotação são obrigatórias." });
    }

    try {
        const result = await prisma.$transaction(async (tx: any) => {
            const existingExercise = await tx.exercicio.findFirst({
                where: { ID_VAGA: data.ID_VAGA }
            });

            if (existingExercise) {
                const updated = await tx.exercicio.update({
                    where: { ID_EXERCICIO: existingExercise.ID_EXERCICIO },
                    data: { ID_LOTACAO: data.ID_LOTACAO }
                });
                await auditAction(usuario, 'EDITAR', 'Exercicio', updated.ID_EXERCICIO, existingExercise, updated, tx);
                return updated;
            } else {
                if (!data.ID_EXERCICIO) data.ID_EXERCICIO = `EXE${Date.now()}`;
                const created = await tx.exercicio.create({ data });
                await auditAction(usuario, 'CRIAR', 'Exercicio', created.ID_EXERCICIO, null, created, tx);
                return created;
            }
        });

        res.json({ success: true, data: result, message: 'Exercício definido com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// 6. Criar Atendimento com Validação de Regras de Negócio e Auto-Reserva
app.post('/api/Atendimento', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const data = cleanData(req.body);
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        // Validações de Pré-requisitos (Regra de Negócio Legada)
        const tiposDesligamentoContratado = ["Demissão", "Promoção (Contratado)", "Mudança (Contratado)"];
        const tiposDesligamentoServidor = ["Exoneração de Cargo Comissionado", "Exoneração do Serviço Público", "Mudança de Alocação (Servidor)"];

        if (tiposDesligamentoContratado.includes(data.TIPO_PEDIDO)) {
            const contrato = await prisma.contrato.findFirst({ where: { CPF: data.CPF } });
            if (!contrato) {
                return res.status(400).json({ message: `Ação não permitida. O CPF ${data.CPF} não possui contrato ativo para este pedido.` });
            }
        }

        if (tiposDesligamentoServidor.includes(data.TIPO_PEDIDO)) {
            const servidor = await prisma.servidor.findFirst({ where: { CPF: data.CPF } });
            if (!servidor) {
                return res.status(400).json({ message: `Ação não permitida. O CPF ${data.CPF} não é um servidor ativo para este pedido.` });
            }
        }

        if (data.TIPO_PEDIDO === 'Reserva de Vaga' && !data.ID_VAGA) {
             // O campo ID_VAGA é enviado pelo frontend mas não existe na tabela Atendimento.
             // Ele é usado para criar a reserva associada.
             return res.status(400).json({ message: "Para reservar uma vaga, é obrigatório selecionar a vaga." });
        }

        // Separa o ID_VAGA para uso na lógica de reserva, pois ele não é persistido em Atendimento
        const idVagaReserva = data.ID_VAGA;
        delete data.ID_VAGA; 

        const result = await prisma.$transaction(async (tx: any) => {
            if (!data.ID_ATENDIMENTO) data.ID_ATENDIMENTO = `ATD${Date.now()}`;
            if (!data.DATA_ENTRADA) data.DATA_ENTRADA = new Date();

            // 1. Criar Atendimento
            const atendimento = await tx.atendimento.create({ data });
            await auditAction(usuario, 'CRIAR', 'Atendimento', atendimento.ID_ATENDIMENTO, null, atendimento, tx);

            // 2. Criar Reserva se aplicável (Lógica do Legado: addAtendimento -> create Reserva)
            if (atendimento.TIPO_PEDIDO === 'Reserva de Vaga' && idVagaReserva) {
                 const novaReserva = await tx.reserva.create({
                     data: {
                         ID_RESERVA: `RES${Date.now()}`,
                         ID_ATENDIMENTO: atendimento.ID_ATENDIMENTO,
                         ID_VAGA: idVagaReserva,
                         DATA_RESERVA: new Date(),
                         STATUS: 'Ativa'
                     }
                 });
                 await auditAction(usuario, 'CRIAR', 'Reserva', novaReserva.ID_RESERVA, null, novaReserva, tx);
            }

            return atendimento;
        });

        res.json({ success: true, data: result, message: 'Atendimento registrado com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// --- BUSINESS INTELLIGENCE & ALERTS ---
app.get('/api/alerts', authenticateToken, async (req: any, res: any) => {
    const alerts: any[] = [];
    
    // Helper para executar verificações individualmente sem quebrar a requisição inteira
    const runCheck = async (name: string, fn: () => Promise<void>) => {
        try {
            await fn();
        } catch (error) {
            console.warn(`[Alerts] Falha na verificação '${name}':`, error);
        }
    };

    try {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        const twoYearsAgo = new Date(today);
        twoYearsAgo.setFullYear(today.getFullYear() - 2);

        // 1. Stagnant Workflows (Aguardando > 7 dias)
        await runCheck('Stagnant', async () => {
            const stagnant = await prisma.atendimento.findMany({
                where: {
                    STATUS_PEDIDO: 'Aguardando',
                    DATA_ENTRADA: { lt: sevenDaysAgo }
                }
            });
            stagnant.forEach((a: any) => {
                alerts.push({
                    id: `stale_${a.ID_ATENDIMENTO}`,
                    type: 'STAGNATION',
                    severity: 'medium',
                    title: 'Atendimento Estagnado',
                    message: `O pedido ${a.TIPO_PEDIDO} de ${a.REMETENTE} está aguardando há mais de 7 dias.`,
                    entityId: a.ID_ATENDIMENTO,
                    date: a.DATA_ENTRADA
                });
            });
        });

        // 2. Orphan Servers (Servidor sem Alocação)
        await runCheck('Orphans', async () => {
            // Buscamos todos e filtramos em memória para evitar erros de sintaxe Prisma (none vs null)
            const servers = await prisma.servidor.findMany({
                include: { alocacao: true }
            });
            
            servers.forEach((s: any) => {
                // Verifica se alocacao é vazio (array ou null)
                const hasAlocacao = Array.isArray(s.alocacao) ? s.alocacao.length > 0 : !!s.alocacao;
                
                if (!hasAlocacao) {
                    alerts.push({
                        id: `orphan_${s.MATRICULA}`,
                        type: 'INTEGRITY',
                        severity: 'high',
                        title: 'Servidor sem Alocação',
                        message: `O servidor ${s.MATRICULA} está ativo mas não possui lotação definida.`,
                        entityId: s.MATRICULA,
                        date: s.DATA_MATRICULA
                    });
                }
            });
        });

        // 3. Blocked Vacancies
        await runCheck('Blocked', async () => {
            const blockedVagas = await prisma.vaga.findMany({
                where: { BLOQUEADA: true },
                include: { cargo: true, lotacao: true }
            });
            blockedVagas.forEach((v: any) => {
                alerts.push({
                    id: `blocked_${v.ID_VAGA}`,
                    type: 'BLOCKED',
                    severity: 'low',
                    title: 'Vaga Bloqueada',
                    message: `Vaga de ${v.cargo?.NOME_CARGO || 'Cargo N/A'} em ${v.lotacao?.LOTACAO || 'Lotação N/A'} está bloqueada.`,
                    entityId: v.ID_VAGA,
                    date: new Date()
                });
            });
        });

        // 4. Old Contracts (Potential Expiration > 2 years)
        await runCheck('OldContracts', async () => {
            const oldContracts = await prisma.contrato.findMany({
                where: { DATA_DO_CONTRATO: { lt: twoYearsAgo } },
                include: { pessoa: true }
            });
            oldContracts.forEach((c: any) => {
                alerts.push({
                    id: `expire_${c.ID_CONTRATO}`,
                    type: 'EXPIRATION',
                    severity: 'medium',
                    title: 'Contrato Antigo',
                    message: `O contrato de ${c.pessoa?.NOME || 'Desconhecido'} tem mais de 2 anos. Verifique renovação/término.`,
                    entityId: c.ID_CONTRATO,
                    date: c.DATA_DO_CONTRATO
                });
            });
        });

        res.json(alerts);
    } catch (e: any) {
        console.error("Alerts Fatal Error:", e);
        // Em caso de erro fatal, retorna array vazio para não quebrar o frontend
        res.json([]);
    }
});

// --- GENERIC CRUD ROUTES WITH AUDIT ---

app.get('/api/:entity', authenticateToken, async (req: any, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        const query = req.query.search ? {
            where: {
                OR: [
                    { [getEntityPk(entity)]: { contains: req.query.search } }
                ]
            }
        } : {};
        
        // Incluir relacionamentos para visualização enriquecida (simplificado)
        const inclusions: any = {};
        if (entity === 'Vaga') inclusions.include = { lotacao: true, cargo: true, edital: true };
        if (entity === 'Contrato') inclusions.include = { vaga: true, pessoa: true, funcao: true };
        if (entity === 'Alocacao') inclusions.include = { servidor: true, lotacao: true, funcao: true };
        if (entity === 'Servidor') inclusions.include = { pessoa: true, cargo: true };

        const data = await model.findMany({ ...query, ...inclusions });
        
        // Flattening for Frontend compatibility where needed
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
            if (entity === 'Alocacao') {
                // Fetch pessoa name via servidor -> pessoa is hard in flat map without deep include
                // Assuming simple enrichment for list views
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
        
        // Audit (Skip for Audit table itself)
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

        // Fetch Old Value for Audit
        const oldRecord = await model.findUnique({ where: { [pkField]: id } });

        // Logic for Password Reset (Phase 2)
        if (entity === 'Usuario' && data.senha) {
            const salt = await bcrypt.genSalt(10);
            data.senha = await bcrypt.hash(data.senha, salt);
        }

        const result = await model.update({
            where: { [pkField]: id },
            data: data
        });

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

        await model.delete({
            where: { [pkField]: id }
        });

        if (entity !== 'Auditoria') {
            await auditAction(usuario, 'EXCLUIR', entity, id, oldRecord, null);
        }

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// --- SPECIAL ACTIONS ---

app.post('/api/Vaga/:id/toggle-lock', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { id } = req.params;
    const usuario = req.user?.usuario || 'Desconhecido';
    try {
        const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: id } });
        if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada' });
        
        const newStatus = !vaga.BLOQUEADA;
        const updated = await prisma.vaga.update({
            where: { ID_VAGA: id },
            data: { BLOQUEADA: newStatus }
        });

        await auditAction(usuario, 'EDITAR', 'Vaga', id, vaga, updated);
        
        res.json(newStatus);
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

app.post('/api/Auditoria/:id/restore', authenticateToken, async (req: AuthenticatedRequest, res: any) => {
    const { id } = req.params;
    const usuario = req.user?.usuario || 'Desconhecido';

    try {
        const log = await prisma.auditoria.findUnique({ where: { ID_LOG: id } });
        if (!log) return res.status(404).json({ message: 'Log de auditoria não encontrado.' });

        const model = getModel(log.TABELA_AFETADA);
        if (!model) return res.status(400).json({ message: 'Esta tabela não suporta restauração automática.' });

        const pk = getEntityPk(log.TABELA_AFETADA);
        const oldVal = JSON.parse(log.VALOR_ANTIGO || '{}');
        const newVal = JSON.parse(log.VALOR_NOVO || '{}');

        if (log.ACAO === 'EXCLUIR') {
            // Restaurar registro deletado (Tentar recriar)
            // Verificar se já existe (pra evitar erro de PK)
            const exists = await model.findUnique({ where: { [pk]: log.ID_REGISTRO_AFETADO } });
            if (exists) throw new Error('Já existe um registro com este ID. Não é possível restaurar.');
            
            await model.create({ data: oldVal });
        } else if (log.ACAO === 'CRIAR') {
            // Deletar registro criado
            // Verificar se ainda existe
            const exists = await model.findUnique({ where: { [pk]: log.ID_REGISTRO_AFETADO } });
            if (!exists) throw new Error('Record to delete does not exist');
            
            await model.delete({ where: { [pk]: log.ID_REGISTRO_AFETADO } });
        } else if (log.ACAO === 'EDITAR') {
            // Reverter campos
             const exists = await model.findUnique({ where: { [pk]: log.ID_REGISTRO_AFETADO } });
            if (!exists) throw new Error('O registro original não foi encontrado para ser revertido.');
            
            await model.update({
                where: { [pk]: log.ID_REGISTRO_AFETADO },
                data: oldVal // Restaura todos os campos antigos
            });
        }

        // Deletar o log de auditoria usado para restauração (como no legado)
        await prisma.auditoria.delete({ where: { ID_LOG: id } });

        res.json({ success: true, message: 'Ação restaurada com sucesso.' });
    } catch (e: any) {
        res.status(500).json({ message: getFriendlyErrorMessage(e) });
    }
});

// --- REPORTS ---
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
        } else if (reportName === 'analiseCustos') {
            const contratos = await prisma.contrato.findMany({ include: { vaga: { include: { lotacao: true, cargo: true } } } });
            const custoMap: Record<string, number> = {};
            contratos.forEach((c: any) => {
                const lotacao = c.vaga?.lotacao?.LOTACAO || 'N/A';
                const salario = parseFloat(c.vaga?.cargo?.SALARIO || '0');
                custoMap[lotacao] = (custoMap[lotacao] || 0) + salario;
            });
            const sortedCustos = Object.entries(custoMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
            result = { graficos: { custoPorLotacao: sortedCustos }, tabela: { colunas: ['Lotação', 'Custo Total'], linhas: Object.entries(custoMap).map(([k, v]) => [k, v]) } };
        } else if (reportName === 'atividadeUsuarios') {
            const logs = await prisma.auditoria.findMany({ orderBy: { DATA_HORA: 'desc' }, take: 100 });
            result = { colunas: ['Data', 'Usuário', 'Ação', 'Tabela', 'ID'], linhas: logs.map((l: any) => [new Date(l.DATA_HORA).toLocaleString(), l.USUARIO, l.ACAO, l.TABELA_AFETADA, l.ID_REGISTRO_AFETADO]) };
        } else {
            return res.status(404).json({ message: 'Relatório não implementado' });
        }
        res.json(result);
    } catch (e: any) {
        console.error(`Erro report ${reportName}:`, e);
        res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
});

// --- DOSSIER ROUTE (Mantido) ---
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
        for (const s of servidores) { let aloc = s.alocacao?.[0] || s.alocacao; vinculosAtivos.push({ tipo: 'Servidor', matricula: s.MATRICULA, cargo_efetivo: s.cargo?.NOME_CARGO || 'Cargo não definido', salario: s.cargo?.SALARIO, funcao_atual: aloc?.funcao?.FUNCAO || 'Sem função comissionada', alocacao_atual: aloc?.lotacao?.LOTACAO || 'Sem Lotação', data_admissao: s.DATA_MATRICULA, detalhes: `Vínculo: ${s.VINCULO}` }); }
        const timeline: any[] = [];
        const histContratos = await prisma.contratoHistorico.findMany({ where: { CPF: cpf } });
        histContratos.forEach((h: any) => timeline.push({ tipo: 'Contrato Encerrado', data_ordenacao: h.DATA_ARQUIVAMENTO, periodo: `${h.DATA_DO_CONTRATO ? new Date(h.DATA_DO_CONTRATO).getFullYear() : '?'} - ${h.DATA_ARQUIVAMENTO ? new Date(h.DATA_ARQUIVAMENTO).getFullYear() : '?'}`, descricao: `Contrato ${h.ID_CONTRATO}`, detalhes: `Motivo: ${h.MOTIVO_ARQUIVAMENTO || 'N/A'}`, icone: 'fa-file-contract', cor: 'gray' }));
        const inativos = await prisma.inativo.findMany({ where: { CPF: cpf } });
        inativos.forEach((i: any) => timeline.push({ tipo: 'Inativação de Servidor', data_ordenacao: i.DATA_INATIVACAO, periodo: `Encerrado em ${new Date(i.DATA_INATIVACAO).toLocaleDateString()}`, descricao: `Matrícula ${i.MATRICULA}`, detalhes: `Motivo: ${i.MOTIVO_INATIVACAO}`, icone: 'fa-user-slash', cor: 'red' }));
        const chamadas = await prisma.chamada.findMany({ where: { CPF: cpf }, include: { turma: { include: { capacitacao: true } }, encontro: true } });
        const capacitacoesList: any[] = [];
        chamadas.forEach((c: any) => { capacitacoesList.push({ nome: c.turma?.capacitacao?.ATIVIDADE_DE_CAPACITACAO, turma: c.turma?.NOME_TURMA, data: c.encontro?.DATA_DE_ENCONTRO ? new Date(c.encontro.DATA_DE_ENCONTRO).toLocaleDateString() : 'N/A', status: c.PRESENCA }); });
        if (tipoPerfil === 'Avulso' && capacitacoesList.length > 0) tipoPerfil = 'Estudante';
        if (tipoPerfil === 'Avulso' && (histContratos.length > 0 || inativos.length > 0)) tipoPerfil = 'Ex-Colaborador';
        timeline.sort((a, b) => new Date(b.data_ordenacao).getTime() - new Date(a.data_ordenacao).getTime());
        res.json({ pessoal: pessoa, tipoPerfil, vinculosAtivos, historico: timeline, atividadesEstudantis: { capacitacoes: capacitacoesList } });
    } catch (e: any) {
        console.error("Erro no Dossiê:", e);
        res.status(500).json({ message: 'Erro interno ao gerar dossiê. ' + e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});