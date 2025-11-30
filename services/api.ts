import { RecordData, DossierData, ActionContext, ReportData } from '../types';

// CONFIGURAÇÃO
const API_BASE_URL = 'https://tudoemsimas.powerhouseapp.de/api';
const TOKEN_KEY = 'simas_auth_token';

// MAPEAMENTO DE ENTIDADES (Frontend -> Database)
const ENTITY_MAP: Record<string, string> = {
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
    'PESSOA': 'Pessoa', 'SERVIDOR': 'Servidor', 'CONTRATO': 'Contrato',
    'ALOCACAO': 'Alocacao', 'PROTOCOLO': 'Protocolo', 'CHAMADA': 'Chamada',
    'ATENDIMENTO': 'Atendimento', 'ENCONTRO': 'Encontro', 'AUDITORIA': 'Auditoria',
    'USUARIO': 'Usuario', 'RESERVA': 'Reserva', 'PESQUISA': 'Pesquisa'
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
    
    if (response.status === 401 || (method === 'GET' && response.status === 403)) {
         localStorage.removeItem(TOKEN_KEY);
         window.location.href = '#/login';
         throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.message || errorData.error || response.statusText;
        
        if (errorMessage.includes('Prisma') || errorMessage.includes('invocation') || errorMessage.includes('Internal Server Error')) {
            errorMessage = 'Ocorreu um erro técnico no servidor. Tente novamente mais tarde.';
        }
        
        if (errorMessage.includes('<!DOCTYPE html>')) {
             errorMessage = 'Servidor temporariamente indisponível.';
        }

        throw new Error(errorMessage);
    }
    
    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua internet.');
    }

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

  fetchEntity: async (entityName: string, searchTerm = '', page = 1, limit = 0): Promise<any[]> => {
    const baseEndpoint = getEndpoint(entityName);
    // Prep for server-side pagination, currently query is just search
    const queryParams = new URLSearchParams();
    if (searchTerm) queryParams.append('search', searchTerm);
    if (page > 1) queryParams.append('page', page.toString());
    if (limit > 0) queryParams.append('limit', limit.toString());

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

  getUsers: async () => request('/Usuario'),
  deleteUser: async (usuarioId: string) => request(`/Usuario/${usuarioId}`, 'DELETE'),

  toggleVagaBloqueada: async (idVaga: string) => {
    return request(`/Vaga/${idVaga}/toggle-lock`, 'POST');
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      return request('/Exercicio', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
  },

  getDossiePessoal: async (cpf: string): Promise<DossierData> => request(`/Pessoa/${cpf}/dossier`),

  restoreAuditLog: async (idLog: string) => {
    return request(`/Auditoria/${idLog}/restore`, 'POST');
  },

  processDailyRoutines: async () => console.log('Syncing daily routines...'),

  getRevisoesPendentes: async () => {
    try {
        // This is still heavy, but we will optimize later with a dedicated endpoint
        const data = await api.fetchEntity('Atendimento'); 
        if (!Array.isArray(data)) return [];
        
        const today = new Date().toISOString().split('T')[0];
        
        return data.filter((a: any) => {
            return a.STATUS_AGENDAMENTO === 'Pendente' && 
                   (a.DATA_AGENDAMENTO && a.DATA_AGENDAMENTO <= today);
        });
    } catch (e) { return []; }
  },

  getSystemAlerts: async () => {
      return request('/alerts');
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('Atendimento'); 
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    
    if (!atd) throw new Error("Atendimento não encontrado");

    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    const promises: Promise<any>[] = [];

    // Busca dependências enriquecidas diretamente
    // React Query will eventually handle these dependencies via useQuery prefetching
    if (acao.includes('Contrato')) {
        promises.push(api.fetchEntity('Vaga').then(d => lookups['Vaga'] = d));
        promises.push(api.fetchEntity('Funcao').then(d => lookups['Funcao'] = d));
    } else if (acao.includes('Alocacao')) {
        promises.push(api.fetchEntity('Lotacao').then(d => lookups['Lotacao'] = d));
        promises.push(api.fetchEntity('Funcao').then(d => lookups['Funcao'] = d));
    } else if (acao.includes('Nomeacao')) {
        promises.push(api.fetchEntity('CargoComissionado').then(d => lookups['CargoComissionado'] = d));
    }
    
    await Promise.all(promises);

    return { atendimento: atd, lookups, fields };
  },

  executeAction: async (idAtendimento: string, data: any) => {
      const atendimentos = await api.fetchEntity('Atendimento');
      const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
      
      if (!atd) throw new Error("Atendimento não encontrado");

      const targetEntity = getDbName(atd.ENTIDADE_ALVO);

      if (atd.TIPO_DE_ACAO === 'INATIVAR' && targetEntity === 'Servidor') {
          await request('/Servidor/inativar', 'POST', data);
      } else if (atd.TIPO_DE_ACAO === 'EDITAR' && targetEntity === 'Contrato') {
          await request('/Contrato/arquivar', 'POST', { CPF: data.CPF, MOTIVO: atd.TIPO_PEDIDO });
          if (!data.ID_CONTRATO) data.ID_CONTRATO = 'CTT' + Date.now();
          await api.createRecord('Contrato', data);
      } else if (atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else {
          if (atd.TIPO_DE_ACAO === 'EDITAR' && data.ID_ALOCACAO) {
               await api.createRecord('Alocacao', data); 
          } else {
               const pkKey = targetEntity === 'Contrato' ? 'ID_CONTRATO' : `ID_${atd.ENTIDADE_ALVO.toUpperCase()}`;
               if (data[pkKey]) await api.updateRecord(atd.ENTIDADE_ALVO, pkKey, data[pkKey], data);
          }
      }
      
      await api.updateRecord('Atendimento', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => request(`/reports/${reportName}`),

  // Novo método para o Gerador Personalizado com Joins
  generateCustomReport: async (primaryEntity: string, joins: string[]) => {
      return request('/reports/custom', 'POST', { primaryEntity, joins });
  }
};