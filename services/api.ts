import { RecordData, DossierData, ActionContext, ReportData } from '../types';

// CONFIGURAÇÃO
const API_BASE_URL = 'https://tudoemsimas.powerhouseapp.de/api';
const TOKEN_KEY = 'simas_auth_token';

// MAPEAMENTO DE ENTIDADES (Frontend -> Database)
const ENTITY_MAP: Record<string, string> = {
    // Normalização (Plural/Acentos -> PascalCase Singular)
    'LOTAÇÕES': 'Lotacao', 'LOTACAO': 'Lotacao',
    'FUNÇÃO': 'Funcao', 'FUNCAO': 'Funcao',
    'CARGOS': 'Cargo', 'CARGO': 'Cargo',
    'VAGAS': 'Vaga', 'VAGA': 'Vaga',
    'EXERCÍCIO': 'Exercicio', 'EXERCICIO': 'Exercicio',
    'CAPACITAÇÃO': 'Capacitacao', 'CAPACITACAO': 'Capacitacao',
    'TURMAS': 'Turma', 'TURMA': 'Turma',
    'NOMEAÇÃO': 'Nomeacao', 'NOMEACAO': 'Nomeacao',
    'SOLICITAÇÃO DE PESQUISA': 'SolicitacaoPesquisa', 'SOLICITACAO-DE-PESQUISA': 'SolicitacaoPesquisa',
    'CARGO COMISSIONADO': 'CargoComissionado', 'CARGO-COMISSIONADO': 'CargoComissionado',
    'VISITAS': 'Visita', 'VISITA': 'Visita',
    'EDITAIS': 'Edital', 'EDITAL': 'Edital',
    'INATIVOS': 'Inativo', 'INATIVO': 'Inativo',
    'ALOCACAO_HISTORICO': 'AlocacaoHistorico',
    'CONTRATO_HISTORICO': 'ContratoHistorico',

    // Entidades padrão
    'PESSOA': 'Pessoa', 'SERVIDOR': 'Servidor', 'CONTRATO': 'Contrato',
    'ALOCACAO': 'Alocacao', 'PROTOCOLO': 'Protocolo', 'CHAMADA': 'Chamada',
    'ATENDIMENTO': 'Atendimento', 'ENCONTRO': 'Encontro', 'AUDITORIA': 'Auditoria',
    'USUARIO': 'Usuario', 'RESERVA': 'Reserva', 'PESQUISA': 'Pesquisa'
};

// CLIENTE HTTP
async function request(endpoint: string, method: string = 'GET', body?: any) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (response.status === 401 || (method === 'GET' && response.status === 403)) {
         localStorage.removeItem(TOKEN_KEY);
         window.location.href = '#/login';
         throw new Error('Sessão expirada');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro na API: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API Error (${method} ${endpoint}):`, error);
    throw error;
  }
}

// HELPERS DE ENDPOINT
const getDbName = (entityName: string): string => ENTITY_MAP[entityName.toUpperCase()] || entityName;
// Alteração aqui: removido .toLowerCase() para preservar o PascalCase
const getEndpoint = (entityName: string): string => `/${getDbName(entityName)}`;

// ENRIQUECIMENTO DE DADOS (CLIENT-SIDE JOIN)
const enrichEntityData = async (entityName: string, data: any[]) => {
    const currentEntity = getDbName(entityName);

    const createMap = (items: any[], key: string, valueField: string) => 
        new Map(items.map((i: any) => [String(i[key]), i[valueField]]));

    if (currentEntity === 'Contrato') {
        const [pessoas, funcoes] = await Promise.all([api.fetchEntity('PESSOA'), api.fetchEntity('FUNÇÃO')]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const funcaoMap = createMap(funcoes, 'ID_FUNCAO', 'FUNCAO');
        return data.map(c => ({ ...c, NOME_PESSOA: pessoaMap.get(c.CPF) || c.CPF, NOME_FUNCAO: funcaoMap.get(c.ID_FUNCAO) || 'N/A' }));
    }
    
    if (currentEntity === 'Servidor') {
       const [pessoas, cargos] = await Promise.all([api.fetchEntity('PESSOA'), api.fetchEntity('CARGOS')]);
       const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
       const cargoMap = createMap(cargos, 'ID_CARGO', 'NOME_CARGO');
       return data.map(s => ({ ...s, NOME_PESSOA: pessoaMap.get(s.CPF) || s.CPF, NOME_CARGO: cargoMap.get(s.ID_CARGO) || s.ID_CARGO }));
    }

    if (currentEntity === 'Alocacao') {
        const [servidores, lotacoes, funcoes, pessoas] = await Promise.all([
            api.fetchEntity('SERVIDOR'), api.fetchEntity('LOTAÇÕES'), 
            api.fetchEntity('FUNÇÃO'), api.fetchEntity('PESSOA')
        ]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const servidorCpfMap = createMap(servidores, 'MATRICULA', 'CPF');
        const lotacaoMap = createMap(lotacoes, 'ID_LOTACAO', 'LOTACAO');
        const funcaoMap = createMap(funcoes, 'ID_FUNCAO', 'FUNCAO');

        return data.map(a => ({
            ...a,
            NOME_PESSOA: pessoaMap.get(servidorCpfMap.get(a.MATRICULA)) || `Mat: ${a.MATRICULA}`,
            NOME_LOTACAO: lotacaoMap.get(a.ID_LOTACAO) || a.ID_LOTACAO,
            NOME_FUNCAO: funcaoMap.get(a.ID_FUNCAO) || 'N/A'
        }));
    }

    if (currentEntity === 'Protocolo') {
        const pessoas = await api.fetchEntity('PESSOA');
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        return data.map(p => ({
            ...p,
            NOME_PESSOA: pessoaMap.get(p.CPF) || p.CPF,
            DETALHE_VINCULO: p.ID_CONTRATO ? `Contrato: ${p.ID_CONTRATO}` : (p.MATRICULA ? `Matrícula: ${p.MATRICULA}` : 'N/A')
        }));
    }

    if (currentEntity === 'Nomeacao') {
        const [servidores, pessoas, cargosCom] = await Promise.all([
            api.fetchEntity('SERVIDOR'), api.fetchEntity('PESSOA'), api.fetchEntity('CARGO COMISSIONADO')
        ]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const servidorCpfMap = createMap(servidores, 'MATRICULA', 'CPF');
        const cargoMap = createMap(cargosCom, 'ID_CARGO_COMISSIONADO', 'NOME');

        return data.map(n => ({
            ...n,
            NOME_SERVIDOR: pessoaMap.get(servidorCpfMap.get(n.MATRICULA)) || n.MATRICULA,
            NOME_CARGO_COMISSIONADO: cargoMap.get(n.ID_CARGO_COMISSIONADO) || n.ID_CARGO_COMISSIONADO
        }));
    }

    if (currentEntity === 'Turma') {
        const capacitacoes = await api.fetchEntity('CAPACITAÇÃO');
        const capMap = createMap(capacitacoes, 'ID_CAPACITACAO', 'ATIVIDADE_DE_CAPACITACAO');
        return data.map(t => ({ ...t, NOME_CAPACITACAO: capMap.get(t.ID_CAPACITACAO) || t.ID_CAPACITACAO }));
    }

    if (['Chamada', 'Visita', 'SolicitacaoPesquisa', 'Atendimento'].includes(currentEntity)) {
        const [pessoas, turmas] = await Promise.all([
            api.fetchEntity('PESSOA'), 
            currentEntity === 'Chamada' ? api.fetchEntity('TURMAS') : []
        ]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const turmaMap = currentEntity === 'Chamada' ? createMap(turmas, 'ID_TURMA', 'NOME_TURMA') : new Map();
        
        return data.map(item => ({
            ...item,
            NOME_PESSOA: pessoaMap.get(item.CPF) || item.CPF,
            ...(currentEntity === 'Chamada' ? { NOME_TURMA: turmaMap.get(item.ID_TURMA) || item.ID_TURMA } : {})
        }));
    }

    if (currentEntity === 'Encontro') {
        const turmas = await api.fetchEntity('TURMAS');
        const turmaMap = createMap(turmas, 'ID_TURMA', 'NOME_TURMA');
        return data.map(e => ({ ...e, NOME_TURMA: turmaMap.get(e.ID_TURMA) || e.ID_TURMA }));
    }

    if (currentEntity === 'Vaga' || currentEntity === 'Exercicio') {
        const [lotacoes, cargos, editais, exercicios] = await Promise.all([
            api.fetchEntity('LOTAÇÕES'), api.fetchEntity('CARGOS'), 
            api.fetchEntity('EDITAIS'), api.fetchEntity('EXERCÍCIO')
        ]);
        const lotacaoMap = createMap(lotacoes, 'ID_LOTACAO', 'LOTACAO');
        const cargoMap = createMap(cargos, 'ID_CARGO', 'NOME_CARGO');
        const editalMap = createMap(editais, 'ID_EDITAL', 'EDITAL');
        
        const exercicioMap = new Map();
        exercicios.forEach((ex: any) => exercicioMap.set(String(ex.ID_VAGA), lotacaoMap.get(ex.ID_LOTACAO)));

        if (currentEntity === 'Exercicio') {
            const vagasRaw = await request('/Vaga'); // Atualizado para PascalCase
            const vagaCargoMap = new Map(vagasRaw.map((v:any) => [v.ID_VAGA, v.ID_CARGO]));
            
            return data.map(e => ({
                ...e,
                NOME_LOTACAO_EXERCICIO: lotacaoMap.get(e.ID_LOTACAO) || 'N/A',
                NOME_CARGO_VAGA: cargoMap.get(String(vagaCargoMap.get(e.ID_VAGA))) || 'N/A'
            }));
        }

        return data.map(v => ({
            ...v,
            LOTACAO_NOME: lotacaoMap.get(v.ID_LOTACAO) || 'N/A',
            CARGO_NOME: cargoMap.get(v.ID_CARGO) || 'N/A',
            EDITAL_NOME: editalMap.get(v.ID_EDITAL) || 'N/A',
            NOME_LOTACAO_EXERCICIO: exercicioMap.get(v.ID_VAGA) || null
        }));
    }

    return data;
};

// MÉTODOS EXPORTADOS DA API
export const api = {
  login: async (usuario: string, senha: string) => request('/auth/login', 'POST', { usuario, senha }),

  fetchEntity: async (entityName: string) => {
    const rawData = await request(getEndpoint(entityName));
    return enrichEntityData(entityName, rawData);
  },

  createRecord: async (entityName: string, data: RecordData) => request(getEndpoint(entityName), 'POST', data),

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => 
    request(`${getEndpoint(entityName)}/${pkValue}`, 'PUT', data),

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => 
    request(`${getEndpoint(entityName)}/${pkValue}`, 'DELETE'),

  getUsers: async () => request('/usuarios'), // Mantido lowercase (convenção comum)
  deleteUser: async (usuarioId: string) => request(`/usuarios/${usuarioId}`, 'DELETE'),

  toggleVagaBloqueada: async (idVaga: string) => request(`/Vaga/${idVaga}/toggle-lock`, 'POST'), // PascalCase

  setExercicio: async (idVaga: string, idLotacao: string) => 
    request('/Exercicio', 'POST', { ID_EXERCICIO: 'EXE' + Date.now(), ID_VAGA: idVaga, ID_LOTACAO: idLotacao }), // PascalCase

  getDossiePessoal: async (cpf: string): Promise<DossierData> => request(`/Pessoa/${cpf}/dossier`), // PascalCase

  restoreAuditLog: async (idLog: string) => request(`/Audit/${idLog}/restore`, 'POST'), // PascalCase (Assumindo Audit ou Auditoria)

  processDailyRoutines: async () => console.log('Syncing daily routines...'),

  getRevisoesPendentes: async () => {
    const data = await request('/Atendimento'); // PascalCase
    if (!Array.isArray(data)) return [];
    
    const pending = data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
    if (!pending.length) return [];

    const pessoas = await api.fetchEntity('PESSOA');
    const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
    return pending.map((p: any) => ({ ...p, NOME_PESSOA: pessoaMap.get(p.CPF) || p.CPF }));
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('ATENDIMENTO');
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    if (!atd) throw new Error("Atendimento não encontrado");

    const pessoas = await api.fetchEntity('PESSOA');
    const person = pessoas.find((p: any) => p.CPF === atd.CPF);
    
    const lookups: any = {};
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    
    if (acao.includes('CONTRATO')) {
        lookups['VAGAS'] = await api.fetchEntity('VAGAS');
        lookups['FUNÇÃO'] = await api.fetchEntity('FUNÇÃO');
    } else if (acao.includes('ALOCACAO')) {
        lookups['LOTAÇÕES'] = await api.fetchEntity('LOTAÇÕES');
        lookups['FUNÇÃO'] = await api.fetchEntity('FUNÇÃO');
    } else if (acao.includes('NOMEAÇÃO')) {
        lookups['CARGO COMISSIONADO'] = await api.fetchEntity('CARGO COMISSIONADO');
    }

    return { atendimento: { ...atd, NOME_PESSOA: person?.NOME || atd.CPF }, lookups, fields: {} };
  },

  executeAction: async (idAtendimento: string, data: any) => {
      const atd = (await api.fetchEntity('ATENDIMENTO')).find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
      if (!atd) throw new Error("Atendimento não encontrado");

      const targetEntity = getDbName(atd.ENTIDADE_ALVO);

      if (atd.TIPO_DE_ACAO === 'INATIVAR' && targetEntity === 'Servidor') {
          await request('/Servidor/inativar', 'POST', data); // PascalCase
      } else if (atd.TIPO_DE_ACAO === 'EDITAR' && targetEntity === 'Contrato') {
          await request('/Contrato/arquivar', 'POST', { CPF: data.CPF, MOTIVO: atd.TIPO_PEDIDO }); // PascalCase
          if (!data.ID_CONTRATO) data.ID_CONTRATO = 'CTT' + Date.now();
          await api.createRecord('CONTRATO', data);
      } else if (atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else {
          if (atd.TIPO_DE_ACAO === 'EDITAR' && data.ID_ALOCACAO) {
               await api.createRecord('ALOCACAO', data); 
          } else {
               const pkKey = { 'CONTRATO': 'ID_CONTRATO' }[atd.ENTIDADE_ALVO] || `ID_${atd.ENTIDADE_ALVO}`;
               if (data[pkKey]) await api.updateRecord(atd.ENTIDADE_ALVO, pkKey, data[pkKey], data);
          }
      }
      
      await api.updateRecord('ATENDIMENTO', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  // RELATÓRIOS
  getReportData: async (reportName: string): Promise<ReportData> => {
    if (reportName === 'painelVagas') {
        const vagas = await api.fetchEntity('VAGAS');
        const quantitativo = vagas.map((v: any) => ({
            VINCULACAO: v.LOTACAO_NOME?.includes('CRAS') ? 'Proteção Básica' : 'Proteção Especial',
            LOTACAO: v.LOTACAO_NOME, CARGO: v.CARGO_NOME,
            DETALHES: v.STATUS_VAGA === 'Reservada' ? `Reservada (${v.RESERVADA_ID})` : v.STATUS_VAGA
        }));
        return { panorama: vagas, quantitativo, filtrosDisponiveis: {} as any };
    }

    if (reportName === 'dashboardPessoal') {
        const [contratos, servidores, alocacoes, vagas] = await Promise.all([
            api.fetchEntity('CONTRATO'), api.fetchEntity('SERVIDOR'), 
            api.fetchEntity('ALOCACAO'), api.fetchEntity('VAGAS')
        ]);
        
        const vinculoCounts: any = { 'OSC': contratos.length };
        servidores.forEach((s: any) => vinculoCounts[s.VINCULO || 'N/A'] = (vinculoCounts[s.VINCULO || 'N/A'] || 0) + 1);

        const lotacaoCounts: any = {};
        alocacoes.forEach((a: any) => lotacaoCounts[a.NOME_LOTACAO] = (lotacaoCounts[a.NOME_LOTACAO] || 0) + 1);
        
        const vagaMap = new Map<string, string>(vagas.map((v:any) => [v.ID_VAGA, v.LOTACAO_NOME]));
        contratos.forEach((c: any) => {
            const lot = vagaMap.get(c.ID_VAGA) || 'Desconhecida';
            lotacaoCounts[lot] = (lotacaoCounts[lot] || 0) + 1;
        });
        
        return {
            totais: { 'Contratados': contratos.length, 'Servidores': servidores.length, 'Total': contratos.length + servidores.length },
            graficos: { 
                vinculo: Object.entries(vinculoCounts).map(([name, value]) => ({ name, value: Number(value) })), 
                lotacao: Object.entries(lotacaoCounts).sort((a:any, b:any) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value: Number(value) }))
            }
        } as any;
    }

    if (reportName === 'analiseCustos') {
        const [contratos, vagas, cargos] = await Promise.all([api.fetchEntity('CONTRATO'), api.fetchEntity('VAGAS'), api.fetchEntity('CARGOS')]);
        
        const cargoSalarioMap = new Map(cargos.map((c:any) => [c.ID_CARGO, parseFloat(c.SALARIO || 0)]));
        const vagaMap = new Map<string, any>(vagas.map((v:any) => [v.ID_VAGA, { lotacao: v.LOTACAO_NOME, cargo: v.ID_CARGO }]));
        
        const custoPorLotacao: any = {};
        contratos.forEach((c: any) => {
            const v = vagaMap.get(c.ID_VAGA);
            if (v) custoPorLotacao[v.lotacao] = (custoPorLotacao[v.lotacao] || 0) + (cargoSalarioMap.get(v.cargo) || 0);
        });

        return {
            graficos: { custoPorLotacao: Object.entries(custoPorLotacao).sort((a:any, b:any) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value: Number(value) })) as any },
            tabela: { colunas: ['Lotação', 'Custo Mensal'], linhas: Object.entries(custoPorLotacao).map(([lot, val]) => [lot, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val))]) }
        } as any;
    }

    if (reportName === 'contratosAtivos') {
        const contratos = await api.fetchEntity('CONTRATO');
        return { colunas: ['Nome', 'CPF', 'Contrato', 'Função', 'Início'], linhas: contratos.map((c: any) => [c.NOME_PESSOA, c.CPF, c.ID_CONTRATO, c.NOME_FUNCAO, new Date(c.DATA_DO_CONTRATO).toLocaleDateString('pt-BR')]) };
    }

    if (reportName === 'quadroLotacaoServidores') {
        const alocacoes = await api.fetchEntity('ALOCACAO');
        return { colunas: ['Lotação', 'Servidor', 'Matrícula', 'Função'], linhas: alocacoes.map((a: any) => [a.NOME_LOTACAO, a.NOME_PESSOA, a.MATRICULA, a.NOME_FUNCAO]) };
    }

    if (reportName === 'perfilDemografico') {
        const pessoas = await api.fetchEntity('PESSOA');
        const counts: any = {}; const bairros: any = {};
        
        pessoas.forEach((p: any) => {
            counts[p.ESCOLARIDADE || 'N/A'] = (counts[p.ESCOLARIDADE || 'N/A'] || 0) + 1;
            bairros[p.BAIRRO || 'N/A'] = (bairros[p.BAIRRO || 'N/A'] || 0) + 1;
        });

        return {
            graficos: { 
                escolaridade: Object.entries(counts).map(([name, value]) => ({ name, value: Number(value) })), 
                bairro: Object.entries(bairros).sort((a:any,b:any)=>b[1]-a[1]).slice(0, 10).map(([name, value]) => ({ name, value: Number(value) })) 
            }
        } as any;
    }

    if (reportName === 'adesaoFrequencia') {
        const chamadas = await api.fetchEntity('CHAMADA');
        return { colunas: ['Turma', 'Participante', 'Presença', 'Data'], linhas: chamadas.map((c: any) => [c.NOME_TURMA, c.NOME_PESSOA, c.PRESENCA, new Date(c.DATA_ENCONTRO || Date.now()).toLocaleDateString()]) };
    }

    if (reportName === 'atividadeUsuarios') {
        const logs = await api.fetchEntity('AUDITORIA');
        return { colunas: ['Data', 'Usuário', 'Ação', 'Tabela', 'ID'], linhas: logs.map((l: any) => [new Date(l.DATA_HORA).toLocaleString(), l.USUARIO, l.ACAO, l.TABELA_AFETADA, l.ID_REGISTRO_AFETADO]) };
    }

    return {};
  }
};