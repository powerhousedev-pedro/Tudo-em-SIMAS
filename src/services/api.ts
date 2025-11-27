import { RecordData, DossierData, ActionContext, ReportData } from '../types';
import { ENTITY_CONFIGS } from '../constants';

// CONFIGURATION
// Use relative path or env var in production
const API_BASE_URL = 'https://tudoemsimas.powerhouseapp.de/api';
const TOKEN_KEY = 'simas_auth_token';

// --- CACHE & REQUEST MANAGEMENT ---
interface CacheEntry {
    data: any;
    timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Tracks inflight promises to deduplicate exact same calls
const inflightRequests: Map<string, Promise<any>> = new Map();

// Tracks controllers to cancel stale requests (search typing)
const activeControllers: Map<string, AbortController> = new Map();

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

async function request(endpoint: string, method: string = 'GET', body?: any, signal?: AbortSignal) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = { method, headers, signal };
  if (body) {
    config.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (response.status === 401 || response.status === 403) {
        if (method === 'GET' && response.status === 403) {
             localStorage.removeItem(TOKEN_KEY);
             window.location.href = '#/login';
             throw new Error('Sessão expirada');
        }
    }

    if (response.status === 304) {
        return null; // Should ideally use cache, but fetch handles 304 transparently mostly
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro na API: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
        throw error; 
    }
    console.error(`API Error (${method} ${endpoint}):`, error);
    throw error;
  }
}

// HELPERS DE ENDPOINT
const getDbName = (entityName: string): string => ENTITY_MAP[entityName.toUpperCase()] || entityName;
const getEndpoint = (entityName: string): string => `/${getDbName(entityName)}`;

export const api = {
  login: async (usuario: string, senha: string) => {
    return request('/auth/login', 'POST', { usuario, senha });
  },

  fetchEntity: async (entityName: string, forceRefresh = false, searchTerm = ''): Promise<any[]> => {
    const baseEndpoint = getEndpoint(entityName);
    const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
    const fullUrl = baseEndpoint + query;
    const cacheKey = fullUrl;

    // 1. Abort Stale Search Requests
    if (searchTerm) {
        if (activeControllers.has(baseEndpoint)) {
            activeControllers.get(baseEndpoint)?.abort();
        }
        const controller = new AbortController();
        activeControllers.set(baseEndpoint, controller);
    }

    // 2. Return Inflight Promise (Deduplication)
    if (inflightRequests.has(cacheKey)) {
        return inflightRequests.get(cacheKey)!.then(res => JSON.parse(JSON.stringify(res)));
    }

    // 3. Check Memory Cache
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (!forceRefresh && !searchTerm && cached && (now - cached.timestamp < CACHE_TTL)) {
        return Promise.resolve(JSON.parse(JSON.stringify(cached.data)));
    }

    const signal = searchTerm ? activeControllers.get(baseEndpoint)?.signal : undefined;

    const promise = request(fullUrl, 'GET', undefined, signal)
        .then(data => {
            if (!searchTerm) {
                cache.set(cacheKey, { data, timestamp: Date.now() });
            }
            return data;
        })
        .catch(err => {
            if (err.name === 'AbortError') return [];
            throw err;
        })
        .finally(() => {
            inflightRequests.delete(cacheKey);
            if (activeControllers.get(baseEndpoint)?.signal === signal) {
                activeControllers.delete(baseEndpoint);
            }
        });

    inflightRequests.set(cacheKey, promise);
    
    return promise;
  },

  createRecord: async (entityName: string, data: RecordData) => {
    const endpoint = getEndpoint(entityName);
    const res = await request(endpoint, 'POST', data);
    if (res.success) {
        const baseKey = getEndpoint(entityName);
        for (const key of cache.keys()) {
            if (key.startsWith(baseKey)) cache.delete(key);
        }
    }
    return res;
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    const endpoint = getEndpoint(entityName);
    const res = await request(`${endpoint}/${pkValue}`, 'PUT', data);
    if (res.success) {
        const baseKey = getEndpoint(entityName);
        for (const key of cache.keys()) {
            if (key.startsWith(baseKey)) cache.delete(key);
        }
    }
    return res;
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    const endpoint = getEndpoint(entityName);
    const res = await request(`${endpoint}/${pkValue}`, 'DELETE');
    if (res.success) {
        const baseKey = getEndpoint(entityName);
        for (const key of cache.keys()) {
            if (key.startsWith(baseKey)) cache.delete(key);
        }
    }
    return res;
  },

  getUsers: async () => request('/Usuario'),
  deleteUser: async (usuarioId: string) => request(`/Usuario/${usuarioId}`, 'DELETE'),

  toggleVagaBloqueada: async (idVaga: string) => {
    const res = await request(`/Vaga/${idVaga}/toggle-lock`, 'POST');
    for (const key of cache.keys()) { if (key.startsWith('/Vaga')) cache.delete(key); }
    return res;
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      const res = await request('/Exercicio', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
      for (const key of cache.keys()) {
        if (key.startsWith('/Vaga') || key.startsWith('/Exercicio')) cache.delete(key);
      }
      return res;
  },

  getDossiePessoal: async (cpf: string): Promise<DossierData> => request(`/Pessoa/${cpf}/dossier`),

  restoreAuditLog: async (idLog: string) => {
    const res = await request(`/Auditoria/${idLog}/restore`, 'POST');
    cache.clear(); 
    return res;
  },

  processDailyRoutines: async () => console.log('Syncing daily routines...'),

  getRevisoesPendentes: async () => {
    try {
        const data = await api.fetchEntity('Atendimento'); 
        if (!Array.isArray(data)) return [];
        return data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
    } catch (e) { return []; }
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('Atendimento', true); 
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    
    if (!atd) throw new Error("Atendimento não encontrado");

    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    const promises: Promise<any>[] = [];

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

      if (atd.TIPO_DE_ACAO === 'INATIVAR' && atd.ENTIDADE_ALVO === 'Servidor') {
          await request('/Servidor/inativar', 'POST', data);
      } else if (atd.TIPO_DE_ACAO === 'EDITAR' && atd.ENTIDADE_ALVO === 'Contrato') {
          await request('/Contrato/arquivar', 'POST', { CPF: data.CPF, MOTIVO: atd.TIPO_PEDIDO });
          if (!data.ID_CONTRATO) data.ID_CONTRATO = 'CTT' + Date.now();
          await api.createRecord('Contrato', data);
      } else if (atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else {
          if (atd.TIPO_DE_ACAO === 'EDITAR' && data.ID_ALOCACAO) {
               await api.createRecord('Alocacao', data); 
          } else {
               const config: any = ENTITY_CONFIGS[atd.ENTIDADE_ALVO];
               if (config && data[config.pk]) {
                   await api.updateRecord(atd.ENTIDADE_ALVO, config.pk, data[config.pk], data);
               }
          }
      }
      
      await api.updateRecord('Atendimento', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => request(`/reports/${reportName}`)
};