/**
 * @fileoverview Lógica para importação de entidades relacionais,
 * usando fuzzy search para resolver chaves estrangeiras.
 */
import { PrismaClient } from '@prisma/client';
import { handleFuzzySearch } from './fuzzySearch';
import { generateId } from './idGenerator';
import { auditAction } from './audit';

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
const FUZZY_SEARCH_THRESHOLD = 2; // Aceita até 2 "erros" de digitação

/**
 * Processa a importação de uma Vaga, resolvendo FKs com fuzzy search.
 * @param tx Cliente Prisma transacional.
 * @param row A linha de dados do CSV.
 * @param usuario O usuário que está importando.
 */
interface VagaRow {
  NOME_CARGO: string;
  NOME_LOTACAO: string;
  NOME_EDITAL: string;
  BLOQUEADA?: string | boolean;
}

type ProcessVagaResult = 
  | { success: true; message: string }
  | { newVaga: { ID_VAGA: string; ID_CARGO: string; ID_LOTACAO: string; ID_EDITAL: string; BLOQUEADA: boolean }; idVaga: string };

export const processVagaRow = async (tx: TxClient | null, row: VagaRow, usuario: string): Promise<ProcessVagaResult> => {
    const { NOME_CARGO, NOME_LOTACAO, NOME_EDITAL } = row;

    if (!NOME_CARGO || !NOME_LOTACAO || !NOME_EDITAL) {
        throw new Error("As colunas NOME_CARGO, NOME_LOTACAO e NOME_EDITAL são obrigatórias.");
    }

    // Etapa de Validação e Busca (sempre ocorre)
    const [cargoResult, lotacaoResult, editalResult] = await Promise.all([
        handleFuzzySearch('Cargo', [NOME_CARGO]),
        handleFuzzySearch('Lotacao', [NOME_LOTACAO]),
        handleFuzzySearch('Edital', [NOME_EDITAL])
    ]);

    if (!cargoResult || cargoResult.length === 0) throw new Error(`Não foi encontrada nenhuma correspondência para o Cargo "${NOME_CARGO}".`);
    if (!lotacaoResult || lotacaoResult.length === 0) throw new Error(`Não foi encontrada nenhuma correspondência para a Lotação "${NOME_LOTACAO}".`);
    if (!editalResult || editalResult.length === 0) throw new Error(`Não foi encontrada nenhuma correspondência para o Edital "${NOME_EDITAL}".`);

    const cargoMatch = cargoResult[0];
    const lotacaoMatch = lotacaoResult[0];
    const editalMatch = editalResult[0];

    if (cargoMatch.score > FUZZY_SEARCH_THRESHOLD) throw new Error(`Não foi encontrada uma correspondência confiável para o Cargo "${NOME_CARGO}".`);
    if (lotacaoMatch.score > FUZZY_SEARCH_THRESHOLD) throw new Error(`Não foi encontrada uma correspondência confiável para a Lotação "${NOME_LOTACAO}".`);
    if (editalMatch.score > FUZZY_SEARCH_THRESHOLD) throw new Error(`Não foi encontrada uma correspondência confiável para o Edital "${NOME_EDITAL}".`);

    if (!cargoMatch.id) throw new Error(`ID para o Cargo correspondente a "${NOME_CARGO}" não foi encontrado.`);
    if (!lotacaoMatch.id) throw new Error(`ID para a Lotação correspondente a "${NOME_LOTACAO}" não foi encontrado.`);
    if (!editalMatch.id) throw new Error(`ID para o Edital correspondente a "${NOME_EDITAL}" não foi encontrado.`);

    const idVaga = generateId('VAG');
    const newVaga = {
        ID_VAGA: idVaga,
        ID_CARGO: cargoMatch.id,
        ID_LOTACAO: lotacaoMatch.id,
        ID_EDITAL: editalMatch.id,
        BLOQUEADA: row.BLOQUEADA === 'true' || row.BLOQUEADA === '1'
    };

    // Etapa de Inserção (ocorre apenas se a transação for fornecida)
    if (tx) {
        const createdVaga = await tx.vaga.create({ data: newVaga });
        await auditAction(usuario, 'CRIAR', 'Vaga', idVaga, null, createdVaga, tx);
        return { success: true, message: `Vaga ${idVaga} criada com sucesso.` };
    }

    // Retorna os dados processados se não houver transação
    return { newVaga, idVaga };
};
