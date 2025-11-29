import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Workaround: Use require for PrismaClient to avoid compilation errors when the client hasn't been generated yet.
// This allows the server file to compile even in environments where `prisma generate` hasn't run.
const { PrismaClient } = require('@prisma/client');

const app = express();
// Fix: PrismaClient type might be missing if not generated, so we let it be any or inferred from require
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'simas-secure-secret';

app.use(cors());
// Cast to any to avoid potential type mismatch with NextHandleFunction in some environments
app.use(express.json() as any);

const authenticateToken = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        (req as any).user = user;
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/auth/login', async (req: any, res: any) => {
    const { usuario, senha } = req.body;
    
    try {
        // Prisma models are usually camelCase (e.g. prisma.usuario)
        const user = await prisma.usuario.findFirst({
            where: { usuario }
        });

        if (!user) {
            return res.status(401).json({ message: 'Usuário não encontrado' });
        }

        // Check password (bcrypt or plain for migration)
        let isValid = false;
        if (user.senha.startsWith('$2')) {
            isValid = await bcrypt.compare(senha, user.senha);
        } else {
            // Fallback for plain text passwords during migration
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

// --- GENERIC CRUD ROUTES ---

// Helper to get prisma model dynamically
const getModel = (modelName: string) => {
    // Convert EntityName to camelCase (e.g. Pessoa -> pessoa)
    const name = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    return (prisma as any)[name];
};

// Helper for PKs mapping
function getEntityPk(entity: string): string {
    const pks: any = {
        'Pessoa': 'CPF',
        'Servidor': 'MATRICULA',
        'Usuario': 'id',
        'Inativo': 'MATRICULA'
    };
    if (pks[entity]) return pks[entity];
    // Default fallback: ID_ENTITY (e.g. ID_CONTRATO)
    return `ID_${entity.toUpperCase()}`;
}

app.get('/api/:entity', authenticateToken, async (req: any, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        const query = req.query.search ? {
            where: {
                OR: [
                    { [getEntityPk(entity)]: { contains: req.query.search } }
                    // Add other search fields if needed
                ]
            }
        } : {};
        
        const data = await model.findMany(query);
        res.json(data);
    } catch (e: any) {
        console.error(`Error fetching ${entity}:`, e);
        // Return empty array instead of 500 to prevent frontend crash on missing tables
        res.json([]);
    }
});

app.post('/api/:entity', authenticateToken, async (req: any, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        let data = req.body;
        
        // Special handling for Usuario password hashing
        if (entity === 'Usuario' && data.senha) {
            const salt = await bcrypt.genSalt(10);
            data.senha = await bcrypt.hash(data.senha, salt);
        }

        const result = await model.create({ data });
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error(`Error creating ${entity}:`, e);
        res.status(500).json({ message: 'Erro ao criar registro: ' + e.message });
    }
});

app.put('/api/:entity/:id', authenticateToken, async (req: any, res: any) => {
    const { entity, id } = req.params;
    const model = getModel(entity);
    
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        // Filter out fields that shouldn't be updated or are unknown
        // For simplicity, we pass body directly, relying on Prisma to error or ignore
        const { editToken, ...data } = req.body; // Remove frontend-only fields

        const result = await model.update({
            where: { [getEntityPk(entity)]: id },
            data: data
        });
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error(`Error updating ${entity}:`, e);
        res.status(500).json({ message: 'Erro ao atualizar registro' });
    }
});

app.delete('/api/:entity/:id', authenticateToken, async (req: any, res: any) => {
    const { entity, id } = req.params;
    const model = getModel(entity);
    
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        await model.delete({
            where: { [getEntityPk(entity)]: id }
        });
        res.json({ success: true });
    } catch (e: any) {
        console.error(`Error deleting ${entity}:`, e);
        res.status(500).json({ message: 'Erro ao excluir registro' });
    }
});

// --- SPECIAL ACTIONS ---

app.post('/api/Vaga/:id/toggle-lock', authenticateToken, async (req: any, res: any) => {
    const { id } = req.params;
    try {
        const vaga = await prisma.vaga.findUnique({ where: { ID_VAGA: id } });
        if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada' });
        
        const newStatus = !vaga.BLOQUEADA;
        await prisma.vaga.update({
            where: { ID_VAGA: id },
            data: { BLOQUEADA: newStatus }
        });
        
        res.json(newStatus);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --- DOSSIER ENDPOINT ---

app.get('/api/Pessoa/:cpf/dossier', authenticateToken, async (req: any, res: any) => {
    let { cpf } = req.params;
    cpf = cpf.replace(/\D/g, '');

    const pessoaDelegate = prisma.pessoa;
    const contratoDelegate = prisma.contrato;
    const servidorDelegate = prisma.servidor;
    const contratoHistDelegate = prisma.contratoHistorico;
    const alocacaoHistDelegate = prisma.alocacaoHistorico;
    const inativoDelegate = prisma.inativo;
    const lotacaoDelegate = prisma.lotacao;
    const chamadaDelegate = prisma.chamada;

    try {
        const pessoa = await pessoaDelegate.findUnique({ where: { CPF: cpf } });
        
        if (!pessoa) {
             return res.status(404).json({ message: `Pessoa com CPF ${cpf} não encontrada.` });
        }

        // --- Active Links (Vínculos Ativos) ---
        const contratos = await contratoDelegate.findMany({
            where: { CPF: cpf },
            include: { funcao: true } 
        });
        
        const servidores = await servidorDelegate.findMany({
            where: { CPF: cpf },
            include: { 
                cargo: true,
                alocacao: {
                     include: { lotacao: true, funcao: true }
                }
            }
        }) as any[];

        let tipoPerfil = 'Avulso';
        if (servidores.length > 0) tipoPerfil = 'Servidor';
        else if (contratos.length > 0) tipoPerfil = 'Contratado';

        const vinculosAtivos: any[] = [];

        for (const c of contratos) {
            vinculosAtivos.push({
                tipo: 'Contrato',
                id_contrato: c.ID_CONTRATO,
                funcao: c.funcao?.FUNCAO || 'Função não definida',
                data_inicio: c.DATA_DO_CONTRATO,
                detalhes: `Vaga ${c.ID_VAGA || 'N/A'}`
            });
        }

        for (const s of servidores) {
            let aloc = null;
            if (s.alocacao && Array.isArray(s.alocacao) && s.alocacao.length > 0) {
                 s.alocacao.sort((a: any, b: any) => new Date(b.DATA_INICIO).getTime() - new Date(a.DATA_INICIO).getTime());
                 aloc = s.alocacao[0];
            } else if (s.alocacao && !Array.isArray(s.alocacao)) {
                aloc = s.alocacao;
            }

            vinculosAtivos.push({
                tipo: 'Servidor',
                matricula: s.MATRICULA,
                cargo_efetivo: s.cargo?.NOME_CARGO || 'Cargo não definido',
                salario: s.cargo?.SALARIO,
                funcao_atual: aloc?.funcao?.FUNCAO || 'Sem função comissionada',
                alocacao_atual: aloc?.lotacao?.LOTACAO || 'Sem Lotação',
                data_admissao: s.DATA_MATRICULA,
                detalhes: `Vínculo: ${s.VINCULO}`
            });
        }

        // --- Timeline (Histórico Unificado) ---
        const timeline: any[] = [];
        
        const histContratos = await contratoHistDelegate.findMany({ where: { CPF: cpf } });
        histContratos.forEach((h: any) => timeline.push({
            tipo: 'Contrato Encerrado',
            data_ordenacao: h.DATA_ARQUIVAMENTO ? new Date(h.DATA_ARQUIVAMENTO) : new Date(0),
            periodo: `${h.DATA_DO_CONTRATO ? new Date(h.DATA_DO_CONTRATO).getFullYear() : '?'} - ${h.DATA_ARQUIVAMENTO ? new Date(h.DATA_ARQUIVAMENTO).getFullYear() : '?'}`,
            descricao: `Contrato ${h.ID_CONTRATO}`,
            detalhes: `Arquivado em ${new Date(h.DATA_ARQUIVAMENTO).toLocaleDateString('pt-BR')}. Motivo: ${h.MOTIVO_ARQUIVAMENTO || 'N/A'}`,
            icone: 'fa-file-contract',
            cor: 'gray'
        }));

        const inativos = await inativoDelegate.findMany({ where: { CPF: cpf } });
        inativos.forEach((i: any) => timeline.push({
            tipo: 'Inativação de Servidor',
            data_ordenacao: i.DATA_INATIVACAO ? new Date(i.DATA_INATIVACAO) : new Date(0),
            periodo: `Encerrado em ${new Date(i.DATA_INATIVACAO).toLocaleDateString('pt-BR')}`,
            descricao: `Matrícula ${i.MATRICULA} - ${i.CARGO || 'N/A'}`,
            detalhes: `Motivo: ${i.MOTIVO || 'N/A'}. Processo: ${i.PROCESSO || 'N/A'}`,
            icone: 'fa-user-slash',
            cor: 'red'
        }));

        const matriculas = [
            ...servidores.map((s:any) => s.MATRICULA),
            ...inativos.map((i:any) => i.MATRICULA)
        ];
        
        if (matriculas.length > 0) {
            const allLotacoes = await lotacaoDelegate.findMany();
            const lotacaoMap = new Map(allLotacoes.map((l: any) => [l.ID_LOTACAO, l.LOTACAO]));

            const histAlocacoes = await alocacaoHistDelegate.findMany({
                where: { MATRICULA: { in: matriculas } }
            });

            histAlocacoes.forEach((a: any) => timeline.push({
                tipo: 'Movimentação / Alocação',
                data_ordenacao: a.DATA_FIM ? new Date(a.DATA_FIM) : new Date(a.DATA_INICIO),
                periodo: `${new Date(a.DATA_INICIO).toLocaleDateString('pt-BR')} - ${a.DATA_FIM ? new Date(a.DATA_FIM).toLocaleDateString('pt-BR') : 'Atual'}`,
                descricao: `Lotação em ${lotacaoMap.get(a.ID_LOTACAO) || a.ID_LOTACAO}`,
                detalhes: `Matrícula ${a.MATRICULA}. Motivo: ${a.MOTIVO_MUDANCA || 'Rotina'}`,
                icone: 'fa-map-marker-alt',
                cor: 'blue'
            }));
        }

        const chamadas = await chamadaDelegate.findMany({
            where: { CPF: cpf },
            include: {
                turma: {
                    include: { capacitacao: true }
                },
                encontro: true
            },
            orderBy: { ID_CHAMADA: 'desc' }
        });

        const capacitacoesList: any[] = [];
        chamadas.forEach((c: any) => {
            capacitacoesList.push({
                nome: c.turma?.capacitacao?.ATIVIDADE_DE_CAPACITACAO || 'Atividade N/A',
                turma: c.turma?.NOME_TURMA || 'Turma N/A',
                data: c.encontro?.DATA_DE_ENCONTRO ? new Date(c.encontro.DATA_DE_ENCONTRO).toLocaleDateString('pt-BR') : 'N/A',
                status: c.PRESENCA || 'N/A'
            });
        });

        if (tipoPerfil === 'Avulso' && capacitacoesList.length > 0) {
            tipoPerfil = 'Estudante';
        }
        
        if (tipoPerfil === 'Avulso' && (histContratos.length > 0 || inativos.length > 0)) {
            tipoPerfil = 'Ex-Colaborador';
        }

        timeline.sort((a, b) => b.data_ordenacao.getTime() - a.data_ordenacao.getTime());

        res.json({
            pessoal: pessoa,
            tipoPerfil,
            vinculosAtivos,
            historico: timeline,
            atividadesEstudantis: { capacitacoes: capacitacoesList } 
        });

    } catch (e: any) {
        console.error("Erro no Dossiê:", e);
        res.status(500).json({ message: 'Erro interno ao gerar dossiê. ' + e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});