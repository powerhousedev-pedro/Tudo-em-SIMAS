import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Workaround: Use require for PrismaClient to avoid compilation errors when the client hasn't been generated yet.
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'simas-secure-secret';

app.use(cors());
app.use(express.json() as any);

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
        if (data[key] === "") {
            cleaned[key] = null;
        } else {
            let val = data[key];
            // Fix for Prisma DateTime validation (YYYY-MM-DD -> ISO)
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                // Check if likely a date field based on name heuristic matching frontend constants
                if (/DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE/i.test(key)) {
                    // Treat YYYY-MM-DD as UTC midnight to avoid timezone shifts
                    val = new Date(val).toISOString();
                }
            }
            cleaned[key] = val;
        }
    }
    return cleaned;
};

const getModel = (modelName: string) => {
    const name = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    return (prisma as any)[name];
};

function getEntityPk(entity: string): string {
    const pks: any = {
        'Pessoa': 'CPF',
        'Servidor': 'MATRICULA',
        'Usuario': 'id',
        'Inativo': 'MATRICULA'
    };
    if (pks[entity]) return pks[entity];
    return `ID_${entity.toUpperCase()}`;
}

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

// --- REPORTS ROUTE ---

app.get('/api/reports/:reportName', authenticateToken, async (req: any, res: any) => {
    const { reportName } = req.params;

    try {
        let result: any = {};

        if (reportName === 'dashboardPessoal') {
            const totalContratos = await prisma.contrato.count();
            const totalServidores = await prisma.servidor.count();
            
            // Vinculos
            const servidoresGroup = await prisma.servidor.groupBy({
                by: ['VINCULO'],
                _count: { VINCULO: true }
            });
            
            const vinculoData = servidoresGroup.map((g: any) => ({ name: g.VINCULO || 'Não informado', value: g._count.VINCULO }));
            vinculoData.push({ name: 'OSC (Contratados)', value: totalContratos });

            // Lotações (Complex logic: join alocacao + contratos)
            // Simplified: count most frequent ID_LOTACAO in Alocacao and ID_LOTACAO via Vaga in Contrato
            const alocacoes = await prisma.alocacao.findMany({ include: { lotacao: true } });
            const contratos = await prisma.contrato.findMany({ include: { vaga: { include: { lotacao: true } } } });

            const lotacaoCounts: Record<string, number> = {};
            alocacoes.forEach((a: any) => {
                const name = a.lotacao?.LOTACAO || 'Desconhecida';
                lotacaoCounts[name] = (lotacaoCounts[name] || 0) + 1;
            });
            contratos.forEach((c: any) => {
                const name = c.vaga?.lotacao?.LOTACAO || 'Desconhecida';
                lotacaoCounts[name] = (lotacaoCounts[name] || 0) + 1;
            });

            const lotacaoData = Object.entries(lotacaoCounts)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);

            result = {
                totais: { contratados: totalContratos, servidores: totalServidores, total: totalContratos + totalServidores },
                graficos: { vinculo: vinculoData, lotacao: lotacaoData }
            };

        } else if (reportName === 'painelVagas') {
            // Fetch necessary data
            const vagas = await prisma.vaga.findMany({ 
                include: { lotacao: true, cargo: true, edital: true } 
            });
            
            const activeReservations = await prisma.reserva.findMany({
                where: { STATUS: 'Ativa' }
            });
            const activeResMap = new Map(activeReservations.map((r: any) => [r.ID_VAGA, r.ID_ATENDIMENTO]));

            // Need to link reservation to person name via Atendimento -> CPF -> Pessoa
            const atendimentos = await prisma.atendimento.findMany({
                where: { ID_ATENDIMENTO: { in: Array.from(activeResMap.values()) } },
                select: { ID_ATENDIMENTO: true, CPF: true }
            });
            const atendMap = new Map(atendimentos.map((a: any) => [a.ID_ATENDIMENTO, a.CPF]));
            
            const cpfs = atendimentos.map((a: any) => a.CPF).filter((c: any) => c);
            const pessoas = await prisma.pessoa.findMany({
                where: { CPF: { in: cpfs } },
                select: { CPF: true, NOME: true }
            });
            const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));

            // Contratos/Ocupantes
            const contratos = await prisma.contrato.findMany({
                select: { ID_VAGA: true, CPF: true } // Assuming link via ID_VAGA
            });
            const ocupadaMap = new Set(contratos.map((c: any) => c.ID_VAGA));

            // Quantitativo Logic
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

                // Add to Panorama
                panorama.push({
                    ID_VAGA: v.ID_VAGA,
                    STATUS: status,
                    VINCULACAO: v.lotacao?.VINCULACAO || 'N/A',
                    LOTACAO_OFICIAL: v.lotacao?.LOTACAO || 'N/A',
                    NOME_CARGO: v.cargo?.NOME_CARGO || 'N/A',
                    RESERVADA_PARA: reservadaPara,
                    OCUPANTE: status === 'Ocupada' ? 'Ocupada' : null
                });

                // Add to Quantitativo (only available/reserved)
                if (status !== 'Ocupada' && status !== 'Bloqueada') {
                    const key = `${v.lotacao?.VINCULACAO || 'N/A'}|${v.lotacao?.LOTACAO || 'N/A'}|${v.cargo?.NOME_CARGO || 'N/A'}`;
                    if (!quantitativoMap.has(key)) {
                        quantitativoMap.set(key, { free: 0, reserved: [] });
                    }
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
                return {
                    VINCULACAO: vinculacao,
                    LOTACAO: lotacao,
                    CARGO: cargo,
                    DETALHES: detailsParts.join(', ')
                };
            });

            result = {
                panorama,
                quantitativo
            };

        } else if (reportName === 'analiseCustos') {
            const contratos = await prisma.contrato.findMany({
                include: { vaga: { include: { lotacao: true, cargo: true } } }
            });
            
            const custoMap: Record<string, number> = {};
            
            contratos.forEach((c: any) => {
                const lotacao = c.vaga?.lotacao?.LOTACAO || 'N/A';
                const salario = parseFloat(c.vaga?.cargo?.SALARIO || '0');
                custoMap[lotacao] = (custoMap[lotacao] || 0) + salario;
            });

            const sortedCustos = Object.entries(custoMap)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);

            result = {
                graficos: { custoPorLotacao: sortedCustos },
                tabela: { 
                    colunas: ['Lotação', 'Custo Total'], 
                    linhas: Object.entries(custoMap).map(([k, v]) => [k, v]) 
                }
            };
        } else if (reportName === 'atividadeUsuarios') {
            const logs = await prisma.auditoria.findMany({
                orderBy: { DATA_HORA: 'desc' },
                take: 100
            });
            
            result = {
                colunas: ['Data', 'Usuário', 'Ação', 'Tabela', 'ID'],
                linhas: logs.map((l: any) => [
                    new Date(l.DATA_HORA).toLocaleString(),
                    l.USUARIO,
                    l.ACAO,
                    l.TABELA_AFETADA,
                    l.ID_REGISTRO_AFETADO
                ])
            };
        } else {
            return res.status(404).json({ message: 'Relatório não implementado' });
        }

        res.json(result);

    } catch (e: any) {
        console.error(`Erro report ${reportName}:`, e);
        res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
});

// --- GENERIC CRUD ROUTES ---

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
        
        const data = await model.findMany(query);
        res.json(data);
    } catch (e: any) {
        console.error(`Error fetching ${entity}:`, e);
        res.json([]);
    }
});

app.post('/api/:entity', authenticateToken, async (req: any, res: any) => {
    const { entity } = req.params;
    const model = getModel(entity);
    
    if (!model) return res.status(400).json({ message: `Entidade ${entity} inválida` });

    try {
        let data = cleanData(req.body);
        
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
        const { editToken, ...rawData } = req.body;
        const data = cleanData(rawData);

        const result = await model.update({
            where: { [getEntityPk(entity)]: id },
            data: data
        });
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error(`Error updating ${entity}:`, e);
        res.status(500).json({ message: 'Erro ao atualizar registro: ' + e.message });
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