import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();
const TIMEZONE = 'America/Sao_Paulo';

/**
 * Encontra e processa protocolos de demissão cujo aviso prévio terminou.
 * Esta função é projetada para ser chamada por um cron job diário.
 */
export async function processarArquivamentosAgendados() {
  console.log('Verificando arquivamentos agendados...');
  const hoje = DateTime.now().setZone(TIMEZONE).startOf('day').toJSDate();

  const protocolosVencidos = await prisma.protocolo.findMany({
    where: {
      TIPO_DE_PROTOCOLO: 'Aviso Prévio - Demissão',
      TERMINO_PRAZO: {
        lte: hoje,
      }
    }
  });

  if (protocolosVencidos.length === 0) {
    console.log('Nenhum arquivamento para processar.');
    return;
  }

  console.log(`Encontrados ${protocolosVencidos.length} arquivamentos para processar.`);

  for (const protocolo of protocolosVencidos) {
    const contratoAtivo = await prisma.contrato.findFirst({
        where: { CPF: protocolo.CPF }
    });

    if (!contratoAtivo) {
        console.warn(`Protocolo ${protocolo.ID_PROTOCOLO}: Nenhum contrato ativo encontrado para o CPF ${protocolo.CPF}. Pulando.`);
        continue;
    }

    try {
      await prisma.$transaction(async (tx) => {

        await tx.contratoHistorico.create({
          data: {
            ID_HISTORICO_CONTRATO: `HTC${Date.now()}${Math.random()}`,
            ID_CONTRATO: contratoAtivo.ID_CONTRATO,
            CPF: contratoAtivo.CPF,
            ID_VAGA: contratoAtivo.ID_VAGA,
            ID_FUNCAO: contratoAtivo.ID_FUNCAO,
            DATA_DO_CONTRATO: contratoAtivo.DATA_DO_CONTRATO,
            DATA_ARQUIVAMENTO: new Date(),
            MOTIVO_ARQUIVAMENTO: 'Demissão (Término do Aviso Prévio)',
          },
        });

        await tx.auditoria.create({
            data: {
                ID_LOG: `LOG${Date.now()}${Math.random()}`,
                DATA_HORA: new Date(),
                USUARIO: 'Agendador',
                ACAO: 'ARQUIVAR',
                TABELA_AFETADA: 'Contrato',
                ID_REGISTRO_AFETADO: contratoAtivo.ID_CONTRATO,
                VALOR_ANTIGO: JSON.stringify(contratoAtivo),
                VALOR_NOVO: '',
            }
        });

        await tx.contrato.delete({
          where: { ID_CONTRATO: contratoAtivo.ID_CONTRATO },
        });

        await tx.protocolo.delete({ where: { ID_PROTOCOLO: protocolo.ID_PROTOCOLO }});

        console.log(`Contrato ${contratoAtivo.ID_CONTRATO} arquivado com sucesso pelo Agendador.`);
      });
    } catch (error) {
      console.error(`Falha ao processar arquivamento para o contrato ${contratoAtivo.ID_CONTRATO}:`, error);
    }
  }
}

/**
 * Encontra e processa editais cujo prazo de término foi atingido.
 * Todos os contratos vinculados a vagas desses editais são arquivados
 * e as vagas são bloqueadas automaticamente.
 */
export async function processarTerminosDeEditais() {
  console.log('Verificando editais finalizados...');
  const hoje = DateTime.now().setZone(TIMEZONE).startOf('day').toJSDate();

  const editaisVencidos = await prisma.edital.findMany({
    where: {
      TERMINO: { lte: hoje }
    },
    include: {
      vagas: {
        where: { BLOQUEADA: false },
        include: { contrato: true }
      }
    }
  });

  if (editaisVencidos.length === 0) {
    console.log('Nenhum edital vencido para processar.');
    return;
  }

  console.log(`Encontrados ${editaisVencidos.length} editais vencidos para processar.`);

  for (const edital of editaisVencidos) {
    if (edital.vagas.length === 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        let contratosArquivados = 0;
        let vagasBloqueadas = 0;

        for (const vaga of edital.vagas) {
          const contratoAtivo = vaga.contrato;

          if (contratoAtivo) {
            await tx.contratoHistorico.create({
              data: {
                ID_HISTORICO_CONTRATO: `HTC${Date.now()}${Math.random()}`,
                ID_CONTRATO: contratoAtivo.ID_CONTRATO,
                CPF: contratoAtivo.CPF,
                ID_VAGA: contratoAtivo.ID_VAGA,
                ID_FUNCAO: contratoAtivo.ID_FUNCAO,
                DATA_DO_CONTRATO: contratoAtivo.DATA_DO_CONTRATO,
                DATA_ARQUIVAMENTO: new Date(),
                MOTIVO_ARQUIVAMENTO: 'Término do Edital',
              },
            });

            await tx.auditoria.create({
                data: {
                    ID_LOG: `LOG${Date.now()}${Math.random()}`,
                    DATA_HORA: new Date(),
                    USUARIO: 'Agendador',
                    ACAO: 'ARQUIVAR',
                    TABELA_AFETADA: 'Contrato',
                    ID_REGISTRO_AFETADO: contratoAtivo.ID_CONTRATO,
                    VALOR_ANTIGO: JSON.stringify(contratoAtivo),
                    VALOR_NOVO: '',
                }
            });

            await tx.contrato.delete({
              where: { ID_CONTRATO: contratoAtivo.ID_CONTRATO },
            });
            
            contratosArquivados++;
          }

          await tx.vaga.update({
            where: { ID_VAGA: vaga.ID_VAGA },
            data: { BLOQUEADA: true },
          });

          await tx.auditoria.create({
              data: {
                  ID_LOG: `LOG${Date.now()}${Math.random()}`,
                  DATA_HORA: new Date(),
                  USUARIO: 'Agendador',
                  ACAO: 'EDITAR',
                  TABELA_AFETADA: 'Vaga',
                  ID_REGISTRO_AFETADO: vaga.ID_VAGA,
                  VALOR_ANTIGO: JSON.stringify(vaga),
                  VALOR_NOVO: JSON.stringify({ ...vaga, BLOQUEADA: true }),
              }
          });

          vagasBloqueadas++;
        }

        console.log(`Edital ${edital.ID_EDITAL} processado: ${contratosArquivados} contratos arquivados e ${vagasBloqueadas} vagas bloqueadas.`);
      });
    } catch (error) {
      console.error(`Falha ao processar término do edital ${edital.ID_EDITAL}:`, error);
    }
  }
}
