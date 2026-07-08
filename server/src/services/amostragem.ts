import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const generateAmostragem = async (origemId: string, tipoOrigem: 'lotacao' | 'edital' | 'vinculacao') => {
    const hoje = new Date();
    const primeiroDiaMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    // Verifica se já existe amostragem no mês atual
    const amostragemAtual = await prisma.amostragem.findFirst({
        where: {
            ORIGEM_ID: origemId,
            TIMESTAMP: {
                gte: primeiroDiaMesAtual
            }
        },
        orderBy: {
            TIMESTAMP: 'desc'
        }
    });

    if (amostragemAtual) {
        const validacao = await prisma.validacaoAmostragem.findUnique({
            where: { ID_AMOSTRAGEM: amostragemAtual.ID_AMOSTRAGEM }
        });
        return {
            idAmostragem: amostragemAtual.ID_AMOSTRAGEM,
            cpfs: JSON.parse(amostragemAtual.CPFS_SELECIONADOS),
            validacao
        };
    }

    // Busca vagas baseadas na origem
    let vagasCond: any = {};
    if (tipoOrigem === 'lotacao') vagasCond = { ID_LOTACAO: origemId };
    else if (tipoOrigem === 'edital') vagasCond = { ID_EDITAL: origemId };
    else if (tipoOrigem === 'vinculacao') vagasCond = { lotacao: { ID_VINCULACAO: origemId } };

    const vagas = await prisma.vaga.findMany({
        where: vagasCond,
        include: {
            contrato: true
        }
    });

    const totalVagas = vagas.length;
    const metaQuantidade = Math.ceil(totalVagas * 0.10);

    if (metaQuantidade === 0) {
        return { idAmostragem: null, cpfs: [], validacao: null };
    }

    // Pessoas ocupando vagas (Contrato base, ignorando substitutos conforme regra)
    const ocupantesAtuais = vagas
        .filter((v: any) => v.contrato && v.contrato.CPF)
        .map((v: any) => v.contrato.CPF);

    if (ocupantesAtuais.length === 0) {
        return { idAmostragem: null, cpfs: [], validacao: null };
    }

    // Busca amostragem do mês anterior
    const primeiroDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999);

    const amostragemAnterior = await prisma.amostragem.findFirst({
        where: {
            ORIGEM_ID: origemId,
            TIMESTAMP: {
                gte: primeiroDiaMesAnterior,
                lte: ultimoDiaMesAnterior
            }
        },
        orderBy: {
            TIMESTAMP: 'desc'
        }
    });

    let selecionados: string[] = [];
    const metaRepetidos = Math.ceil(metaQuantidade * 0.10); // 10% da amostragem (10% dos 10%)

    let candidatosRepetidos: string[] = [];
    if (amostragemAnterior) {
        const cpfsAnteriores: string[] = JSON.parse(amostragemAnterior.CPFS_SELECIONADOS);
        // Filtra apenas os que ainda estão ocupando vaga
        candidatosRepetidos = cpfsAnteriores.filter((cpf: string) => ocupantesAtuais.includes(cpf));
        
        // Embaralha candidatos repetidos
        candidatosRepetidos.sort(() => 0.5 - Math.random());
        
        // Pega até a meta de repetidos
        selecionados = candidatosRepetidos.slice(0, metaRepetidos);
    }

    // Pega os demais ocupantes que ainda não foram selecionados
    const restantesAtuais = ocupantesAtuais.filter((cpf: string) => !selecionados.includes(cpf));
    
    // Embaralha
    restantesAtuais.sort(() => 0.5 - Math.random());

    // Preenche o resto até a metaQuantidade
    const quantidadeFaltante = metaQuantidade - selecionados.length;
    
    const novosSelecionados = restantesAtuais.slice(0, quantidadeFaltante);
    selecionados = [...selecionados, ...novosSelecionados];

    // Gera ID único
    const idAmostragem = 'AMO' + Math.random().toString(36).substring(2, 11).toUpperCase();

    await prisma.amostragem.create({
        data: {
            ID_AMOSTRAGEM: idAmostragem,
            ORIGEM_ID: origemId,
            CPFS_SELECIONADOS: JSON.stringify(selecionados)
        }
    });

    return {
        idAmostragem,
        cpfs: selecionados,
        validacao: null
    };
};