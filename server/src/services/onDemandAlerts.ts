
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

// Interface para o objeto de usuário que vem do token JWT
interface AuthenticatedUser {
  usuario: string;
  papel: string;
  isGerente: boolean;
}

// Estrutura padrão de um Alerta
export interface Alert {
  type: 'CONTRATO_A_VENCER' | 'VAGA_OCIOSA' | 'EDITAL_A_VENCER';
  level: 'AVISO' | 'INFO' | 'GRAVE';
  message: string;
  referenceId: string;
  responsible: string | null;
}

const TIMEZONE = 'America/Sao_Paulo';
const OCIOSIDADE_VAGA_DIAS = 30; // Vagas ociosas por mais de 30 dias serão alertadas
const VENCIMENTO_CONTRATO_DIAS = 30; // Contratos vencendo nos próximos 30 dias

/**
 * Rotina 2: Verifica contratos (via Edital) próximos do vencimento.
 */
export async function verificarContratosProximosDoFim(user: AuthenticatedUser): Promise<Alert[]> {
    // Esta rotina é relevante apenas para GPMP e Coordenação
    if (user.papel !== 'GPMP' && user.papel !== 'COORDENAÇÃO' && user.papel !== 'GACP') {
        return [];
    }

    const dataLimite = DateTime.now().setZone(TIMEZONE).plus({ days: VENCIMENTO_CONTRATO_DIAS }).toJSDate();

    const contratos = await prisma.contrato.findMany({
        where: {
            vaga: {
                edital: {
                    TERMINO: {
                        lte: dataLimite,
                    }
                }
            }
        },
        include: {
            pessoa: true,
            vaga: {
                include: {
                    edital: true
                }
            }
        }
    });

    return contratos.map((ct: any) => ({
        type: 'CONTRATO_A_VENCER',
        level: 'INFO',
        message: `Contrato de ${ct.pessoa?.NOME} vence em ${DateTime.fromJSDate(ct.vaga?.edital?.TERMINO).toFormat('dd/LL/yyyy')}.`,
        referenceId: ct.ID_CONTRATO,
        responsible: null
    }));
}


/**
 * Rotina 3: Verifica vagas desocupadas por muito tempo.
 */
export async function verificarVagasOciosas(user: AuthenticatedUser): Promise<Alert[]> {
    // Relevante apenas para GPMP e Coordenação
    if (user.papel !== 'GPMP' && user.papel !== 'COORDENAÇÃO' && user.papel !== 'GACP') {
        return [];
    }

    const dataLimiteOciosidade = DateTime.now().setZone(TIMEZONE).minus({ days: OCIOSIDADE_VAGA_DIAS }).toJSDate();
    
    // 1. Buscar todas as vagas que não estão bloqueadas
    const vagasCandidatas = await prisma.vaga.findMany({
        where: {
            BLOQUEADA: false,
        },
        include: {
            contrato: true,
            edital: true,
            postoTrabalho: true,
            lotacao: true
        }
    });

    // 2. Filtrar apenas as realmente ociosas
    const vagasOciosas = vagasCandidatas.filter((v: any) => v.contrato === null);

    const alertas: Alert[] = [];

    for (const vaga of vagasOciosas) {
        // 3. Buscar o histórico de contratos da vaga
        const historicoContratos = await prisma.contratoHistorico.findMany({
            where: { ID_VAGA: vaga.ID_VAGA },
            orderBy: { DATA_ARQUIVAMENTO: 'desc' },
            take: 1
        });

        let dataInicioOciosidade: Date | null = null;

        if (historicoContratos.length > 0) {
            // Cenário A: Já foi ocupada. O marco é a data do último arquivamento.
            dataInicioOciosidade = historicoContratos[0].DATA_ARQUIVAMENTO;
        } else if (vaga.edital?.INICIO) {
            // Cenário B: Nunca foi ocupada. O marco é o início do edital.
            dataInicioOciosidade = vaga.edital.INICIO;
        }

        if (dataInicioOciosidade && dataInicioOciosidade < dataLimiteOciosidade) {
            const diasOciosa = Math.floor(DateTime.now().diff(DateTime.fromJSDate(dataInicioOciosidade), 'days').days);
            
            alertas.push({
                type: 'VAGA_OCIOSA',
                level: 'INFO',
                message: `Vaga ${vaga.postoTrabalho?.NOME_POSTO || 'Desconhecida'} em ${vaga.lotacao?.LOTACAO || 'Desconhecida'} está desocupada há ${diasOciosa} dias.`,
                referenceId: vaga.ID_VAGA,
                responsible: null
            });
        }
    }

    return alertas;
}

/**
 * Rotina 4: Verifica editais próximos do vencimento (21, 14, 7 dias)
 */
export async function verificarEditaisProximosDoFim(user: AuthenticatedUser): Promise<Alert[]> {
    if (user.papel !== 'GPMP' && user.papel !== 'COORDENAÇÃO' && user.papel !== 'GACP') {
        return [];
    }

    const hoje = DateTime.now().setZone(TIMEZONE).startOf('day');
    const alvo21 = hoje.plus({ days: 21 }).toJSDate();
    const alvo14 = hoje.plus({ days: 14 }).toJSDate();
    const alvo7 = hoje.plus({ days: 7 }).toJSDate();

    // Como as datas podem ter variação de hora, buscamos num range de dia
    const editais = await prisma.edital.findMany({
        where: {
            TERMINO: { not: null }
        }
    });

    const alertas: Alert[] = [];

    for (const edital of editais) {
        if (!edital.TERMINO) continue;
        const termino = DateTime.fromJSDate(edital.TERMINO).setZone(TIMEZONE).startOf('day');
        const diasFaltando = termino.diff(hoje, 'days').days;

        if (diasFaltando === 21 || diasFaltando === 14 || diasFaltando === 7) {
            let level: 'AVISO' | 'INFO' | 'GRAVE' = 'INFO';
            if (diasFaltando === 14) level = 'AVISO';
            if (diasFaltando === 7) level = 'GRAVE';

            alertas.push({
                type: 'EDITAL_A_VENCER',
                level,
                message: `Edital ${edital.EDITAL} encerra em ${diasFaltando} dias. Todos os contratos ativos serão arquivados e as vagas bloqueadas.`,
                referenceId: edital.ID_EDITAL,
                responsible: null
            });
        }
    }

    return alertas;
}
