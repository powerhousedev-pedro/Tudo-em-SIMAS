import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    // Placeholder for token verification
    // In a real application, verify the token using jsonwebtoken
    next();
};

// --- DOSSIER ENDPOINT (REFATORADO) ---

app.get('/api/Pessoa/:cpf/dossier', authenticateToken, async (req: any, res: any) => {
    let { cpf } = req.params;
    
    // Robustez: Remover caracteres não numéricos do CPF para evitar 404 por formatação
    cpf = cpf.replace(/\D/g, '');

    // Delegates (usando nomes fixos para garantir acesso correto)
    const pessoaDelegate = prisma.pessoa;
    const contratoDelegate = prisma.contrato;
    const servidorDelegate = prisma.servidor;
    const contratoHistDelegate = prisma.contratoHistorico;
    const alocacaoHistDelegate = prisma.alocacaoHistorico;
    const inativoDelegate = prisma.inativo;
    const lotacaoDelegate = prisma.lotacao;
    const chamadaDelegate = prisma.chamada; // Novo delegate

    try {
        const pessoa = await pessoaDelegate.findUnique({ where: { CPF: cpf } });
        
        if (!pessoa) {
             // Retornar 404 limpo se a pessoa não existir
             return res.status(404).json({ message: `Pessoa com CPF ${cpf} não encontrada.` });
        }

        // --- Active Links (Vínculos Ativos) ---
        // Contratos: Inclui Função
        const contratos = await contratoDelegate.findMany({
            where: { CPF: cpf },
            include: { funcao: true } 
        });
        
        // Servidores: Inclui Cargo e Alocação atual
        // Cast as any[] to avoid TS errors about nested includes if types aren't perfect
        const servidores = await servidorDelegate.findMany({
            where: { CPF: cpf },
            include: { 
                cargo: true,
                alocacao: {
                     // Removing orderBy inside include to avoid TS2353 error
                     // We will sort manually in JS
                     include: { lotacao: true, funcao: true }
                }
            }
        }) as any[];

        // Determinar Perfil Principal (Base)
        let tipoPerfil = 'Avulso';
        if (servidores.length > 0) tipoPerfil = 'Servidor';
        else if (contratos.length > 0) tipoPerfil = 'Contratado';

        // Construir View Unificada de Vínculos
        const vinculosAtivos: any[] = [];

        // Adicionar Contratos
        for (const c of contratos) {
            vinculosAtivos.push({
                tipo: 'Contrato',
                id_contrato: c.ID_CONTRATO,
                funcao: c.funcao?.FUNCAO || 'Função não definida',
                data_inicio: c.DATA_DO_CONTRATO,
                detalhes: `Vaga ${c.ID_VAGA || 'N/A'}`
            });
        }

        // Adicionar Servidores
        for (const s of servidores) {
            // Manual sort of alocacao array to get most recent
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
        
        // 1. Histórico de Contratos
        const histContratos = await contratoHistDelegate.findMany({ where: { CPF: cpf } });
        histContratos.forEach((h: any) => timeline.push({
            tipo: 'Contrato Encerrado',
            data_ordenacao: h.DATA_ARQUIVAMENTO ? new Date(h.DATA_ARQUIVAMENTO) : new Date(0), // Data real para ordenação
            periodo: `${h.DATA_DO_CONTRATO ? new Date(h.DATA_DO_CONTRATO).getFullYear() : '?'} - ${h.DATA_ARQUIVAMENTO ? new Date(h.DATA_ARQUIVAMENTO).getFullYear() : '?'}`,
            descricao: `Contrato ${h.ID_CONTRATO}`,
            detalhes: `Arquivado em ${new Date(h.DATA_ARQUIVAMENTO).toLocaleDateString('pt-BR')}. Motivo: ${h.MOTIVO_ARQUIVAMENTO || 'N/A'}`,
            icone: 'fa-file-contract',
            cor: 'gray'
        }));

        // 2. Histórico de Inatividade
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

        // 3. Histórico de Alocação (precisa das matrículas)
        const matriculas = [
            ...servidores.map((s:any) => s.MATRICULA),
            ...inativos.map((i:any) => i.MATRICULA)
        ];
        
        if (matriculas.length > 0) {
            // Load all Lotacoes for manual name resolution (since include lotacao might fail on history table)
            const allLotacoes = await lotacaoDelegate.findMany();
            const lotacaoMap = new Map(allLotacoes.map((l: any) => [l.ID_LOTACAO, l.LOTACAO]));

            const histAlocacoes = await alocacaoHistDelegate.findMany({
                where: { MATRICULA: { in: matriculas } }
                // Remove include 'lotacao' to fix TS Error 2322
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

        // --- Atividades Estudantis (CHAMADA -> TURMA -> CAPACITACAO) ---
        const chamadas = await chamadaDelegate.findMany({
            where: { CPF: cpf },
            include: {
                turma: {
                    include: { capacitacao: true }
                },
                encontro: true
            },
            orderBy: { ID_CHAMADA: 'desc' } // Ordem aproximada de criação
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

        // Lógica Legado: Se for Avulso e tiver chamadas, vira Estudante
        if (tipoPerfil === 'Avulso' && capacitacoesList.length > 0) {
            tipoPerfil = 'Estudante';
        }
        
        // Verifica se histórico existe mas perfil é avulso
        if (tipoPerfil === 'Avulso' && (histContratos.length > 0 || inativos.length > 0)) {
            tipoPerfil = 'Ex-Colaborador';
        }

        // Ordenação Robusta por Data (Decrescente)
        // Isso resolve o problema de ordenação frágil baseada em string
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