import { RecordData, DossierData, ActionContext, ReportData } from '../types';
import { validation } from '../utils/validation';

// CONFIGURAÇÃO
const API_BASE_URL = 'https://tudoemsimas.powerhouseapp.de/api';
const TOKEN_KEY = 'simas_auth_token';

// MAPEAMENTO DE ENTIDADES (Frontend -> Database)
const ENTITY_MAP: Record<string, string> = {
    'LOTAÇÕES': 'Lotacao', 'LOTACAO': 'Lotacao',
    'FUNÇÃO': 'Funcao', 'FUNCAO': 'Funcao',
    'POSTOS': 'PostoTrabalho', 'POSTO': 'PostoTrabalho', 'POSTO_TRABALHO': 'PostoTrabalho',
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
    'PESSOA': 'Pessoa', 'SERVIDOR': 'Servidor', 'CONTRATO': 'Contrato',
    'ALOCACAO': 'Alocacao', 'PROTOCOLO': 'Protocolo', 'CHAMADA': 'Chamada',
    'ENCONTRO': 'Encontro', 'AUDITORIA': 'Auditoria',
    'AUDITORIALGPD': 'AuditoriaLGPD', 'USUARIO': 'Usuario', 'PESQUISA': 'Pesquisa',
    'RELATORIO_SALVO': 'RelatorioSalvo', 'SUBSTITUTO': 'Substituto'
};

// HELPERS DE ENDPOINT
const getDbName = (entityName: string): string => ENTITY_MAP[entityName.toUpperCase()] || entityName;
const getEndpoint = (entityName: string): string => `/${getDbName(entityName)}`;

// CLIENTE HTTP BÁSICO
async function request(endpoint: string, method: string = 'GET', body?: any, signal?: AbortSignal) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config: RequestInit = { method, headers, signal };
  if (body) config.body = JSON.stringify(body);
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    // Ignore session expiration check for login endpoint
    if (endpoint !== '/auth/login' && (response.status === 401 || (method === 'GET' && response.status === 403))) {
         localStorage.removeItem(TOKEN_KEY);
         window.location.href = '#/login';
         throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
        // Tenta ler o JSON de erro
        let errorData = {};
        let errorMessage = '';

        try {
            // Verifica o Content-Type para saber se é JSON
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                errorData = await response.json();
                errorMessage = (errorData as any).message || (errorData as any).error;
            } else {
                // Se não for JSON (ex: HTML de erro do proxy/nginx), pega texto mas não exibe cru
                const text = await response.text();
                // Verifica se parece ser HTML (erro genérico de servidor web)
                if (text.trim().startsWith('<')) {
                     errorMessage = 'O servidor está temporariamente indisponível. (Erro de Gateway/Proxy)';
                } else {
                     errorMessage = text;
                }
            }
        } catch (e) {
            errorMessage = 'Erro desconhecido ao processar resposta do servidor.';
        }

        // Fallback se não conseguiu extrair nada
        if (!errorMessage) {
            errorMessage = response.statusText;
        }

        // Tratamento específico para erros 500 (Internal Server Error)
        if (response.status === 500) {
            // Se a mensagem vier do nosso backend (JSON 'message'), usamos ela.
            // Se for HTML ou vazia, usamos mensagem genérica.
            if (!errorMessage || errorMessage.includes('<!DOCTYPE') || errorMessage.includes('Internal Server Error')) {
                 errorMessage = 'Erro interno no servidor. Por favor, contate o suporte ou tente mais tarde.';
            }
        }
        
        // Hide technical Prisma/Internal Server errors only if they weren't already sanitized by backend
        if (errorMessage.includes('Prisma') || errorMessage.includes('invocation')) {
             if (!errorMessage.includes('Erro interno:')) {
                 errorMessage = 'Ocorreu um erro técnico no servidor. Tente novamente mais tarde.';
             }
        }

        throw new Error(errorMessage);
    }
    
    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
    }

    // Se o erro já foi tratado acima, ele é repassado.
    // O backend agora deve retornar erros limpos.
    const isClientError = error.message && (error.message.includes('Senha incorreta') || error.message.includes('Usuário'));
    if (!isClientError) {
        console.warn(`API Error (${method} ${endpoint}):`, error);
    }
    throw error;
  }
}

// --- MÉTODOS PÚBLICOS DA API ---
// Agora apenas retornam Promises, sem gerenciar cache
export const api = {
  login: async (usuario: string, senha: string) => request('/auth/login', 'POST', { usuario, senha }),

  fetchEntity: async (entityName: string, searchTerm = '', page = 1, limit = 0, extraParams: Record<string, string> = {}): Promise<any[]> => {
    const baseEndpoint = getEndpoint(entityName);
    // Prep for server-side pagination, currently query is just search
    const queryParams = new URLSearchParams();
    if (searchTerm) queryParams.append('search', searchTerm);
    if (page > 1) queryParams.append('page', page.toString());
    if (limit > 0) queryParams.append('limit', limit.toString());
    
    Object.entries(extraParams).forEach(([key, value]) => {
        queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    const fullUrl = baseEndpoint + (queryString ? `?${queryString}` : '');

    try {
        const data = await request(fullUrl);
        if (!Array.isArray(data)) {
            console.warn(`fetchEntity: API retornou não-array para ${entityName}`, data);
            return [];
        }
        return data;
    } catch (err) {
        console.warn(`Falha ao buscar ${entityName}:`, err);
        return [];
    }
  },

  createRecord: async (entityName: string, data: RecordData) => {
    const endpoint = getEndpoint(entityName);
    return request(endpoint, 'POST', data);
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    const endpoint = getEndpoint(entityName);
    return request(`${endpoint}/${pkValue}`, 'PUT', data);
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    const endpoint = getEndpoint(entityName);
    return request(`${endpoint}/${pkValue}`, 'DELETE');
  },
  
  restoreFromHistory: async (entityName: string, id: string) => {
      const endpoint = getEndpoint(entityName);
      return request(`${endpoint}/${id}/restaurar`, 'POST');
  },

  getUsers: async () => request('/Usuario'),
  deleteUser: async (usuarioId: string) => request(`/Usuario/${usuarioId}`, 'DELETE'),

  toggleVagaBloqueada: async (idVaga: string) => {
    return request(`/Vaga/${idVaga}/toggle-lock`, 'POST');
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      return request('/Exercicio', 'POST', { 
          ID_EXERCICIO: validation.generateLegacyId('EXE'), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
  },

  archiveContrato: async (identifier: { CPF?: string }, motivo: string) => {
      return request('/Contrato/arquivar', 'POST', { ...identifier, MOTIVO: motivo });
  },

  moverContrato: async (identifier: { CPF?: string }, novaVagaId: string, motivo: string) => {
      return request('/Contrato/mover', 'POST', { ...identifier, NOVA_VAGA_ID: novaVagaId, MOTIVO: motivo });
  },

  inactivateServidor: async (matricula: string, motivo: string) => {
      return request('/Servidor/inativar', 'POST', { MATRICULA: matricula, MOTIVO: motivo });
  },

  getDossiePessoal: async (cpf: string): Promise<DossierData> => request(`/Pessoa/${cpf}/dossier`),

  addNotaDossie: async (cpf: string, data: { OBS: string, GRAVISSIMO: boolean }): Promise<any> => {
      return request(`/Pessoa/${cpf}/nota`, 'POST', data);
  },

  restoreAuditLog: async (idLog: string) => {
    return request(`/Auditoria/${idLog}/restore`, 'POST');
  },

  processDailyRoutines: async () => console.log('Syncing daily routines...'),

  getRevisoesPendentes: async () => {
    try {
        // Otimizado: Chama o endpoint que já retorna os dados filtrados.
        return await request('/reports/revisoesPendentes');
    } catch (e) { 
        console.error("Falha ao buscar revisões pendentes:", e);
        return []; 
    }
  },

  getSystemAlerts: async () => {
      return request('/alerts');
  },

  getReportData: async (reportName: string): Promise<ReportData> => request(`/reports/${reportName}`),

  getVagaTimeline: async (vagaId: string): Promise<any> => {
      return request(`/Vaga/${vagaId}/timeline`);
  },

  getGpmpCockpit: async (): Promise<any> => {
      return request('/gpmp/cockpit');
  },

  searchPessoas: async (query: string): Promise<any[]> => {
      return request(`/search/pessoas?q=${encodeURIComponent(query)}`);
  },

  // Novo método para o Gerador Personalizado com Joins
  generateCustomReport: async (primaryEntity: string, joins: string[]) => {
      return request('/reports/custom', 'POST', { primaryEntity, joins });
  },

  // Novo método para Autocomplete de valores únicos
  getUniqueValues: async (entity: string, field: string) => {
      return request(`/${entity}/unique/${field}`);
  },

  // --- RELATÓRIOS SALVOS (Meus Relatórios) ---
  
  getSavedReports: async () => {
      return request('/reports/saved');
  },

  saveReportConfig: async (name: string, config: any) => {
      return request('/reports/saved', 'POST', { name, config });
  },

  deleteSavedReport: async (id: string) => {
      return request(`/reports/saved/${id}`, 'DELETE');
  },

  // --- INTEGRAÇÕES EXTERNAS ---
  getCepData: async (cep: string) => {
      return request(`/utils/cep/${cep}`);
  },

  searchCepByLogradouro: async (logradouro: string) => {
      return request(`/utils/cep/busca/${encodeURIComponent(logradouro)}`);
  },

  getEstados: async () => {
      try {
          const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
          return await response.json();
      } catch (e) {
          console.error("Erro ao buscar estados do IBGE", e);
          return [];
      }
  },

  getCidades: async (uf: string) => {
      try {
          const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
          return await response.json();
      } catch (e) {
          console.error("Erro ao buscar cidades do IBGE", e);
          return [];
      }
  },

  generateAmostragem: async (origemId: string, tipoOrigem: string) => {
      return request('/amostragem/gerar', 'POST', { origemId, tipoOrigem });
  },
  createLancamento: async (cpf: string) => {
      return request('/amostragem/lancamento', 'POST', { cpf });
  },
  toggleLancamento: async (id: string) => {
      return request(`/amostragem/lancamento/toggle/${id}`, 'PUT');
  },
  validarAmostragem: async (idAmostragem: string, validada: boolean, justificativa: string, idInc?: string) => {
      return request('/amostragem/validar', 'POST', { idAmostragem, validada, justificativa, idInc });
  },
  getInvalidAmostragens: async () => {
      return request('/amostragem/invalidas', 'GET');
  },
  getInconformidades: async (origemId: string) => {
      return request(`/inconformidades/${origemId}`, 'GET');
  },
  createInconformidade: async (data: { resolvido?: boolean, tipo: string, idProcesso?: string, idTermo?: string, idLotacao?: string, motivo: string, chain?: string }) => {
      return request('/inconformidades', 'POST', data);
  },
  updateInconformidade: async (id: string, data: { resolvido?: boolean, tipo?: string, idProcesso?: string, idTermo?: string, idLotacao?: string, motivo?: string, chain?: string }) => {
      return request(`/inconformidades/${id}`, 'PUT', data);
  },
  getTimeline: async (origemId: string, tipo: string) => {
      return request(`/timeline/${origemId}?tipo=${tipo}`, 'GET');
  },
  getProcesso: async (numero: string) => {
      return request(`/processos/${encodeURIComponent(numero)}`, 'GET');
  },
  getAllProcessos: async () => {
      return request('/processos_all', 'GET');
  },
  saveProcesso: async (data: any) => {
      return request('/processos', 'POST', data);
  }
};