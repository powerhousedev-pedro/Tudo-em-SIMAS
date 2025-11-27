
import { RecordData, DossierData, ActionContext, ReportData } from '../types';
import { ENTITY_CONFIGS } from '../constants';

// CONFIGURATION
const API_BASE_URL = 'http://localhost:3001/api';
const TOKEN_KEY = 'simas_auth_token';

// --- CACHE ---
let cache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutos de cache
const inflightRequests: Record<string, Promise<any> | undefined> = {};

async function request(endpoint: string, method: string = 'GET', body?: any) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = { method, headers };
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

export const api = {
  login: async (usuario: string, senha: string) => {
    return request('/auth/login', 'POST', { usuario, senha });
  },

  // Busca Genérica com Cache e Busca no Servidor
  fetchEntity: async (entityName: string, forceRefresh = false, searchTerm = ''): Promise<any[]> => {
    // O backend espera PascalCase (ex: /Pessoa, /Vaga). Não usar toLowerCase().
    const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
    const endpoint = `/${entityName}${query}`;
    const cacheKey = endpoint;

    const now = Date.now();
    
    // Se não for busca e não forçado, tenta cache
    if (!searchTerm && !forceRefresh && cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_TTL)) {
        return Promise.resolve(cache[cacheKey].data);
    }

    // Evita requisições duplicadas em voo
    if (inflightRequests[cacheKey] && !forceRefresh) {
        return inflightRequests[cacheKey] as Promise<any[]>;
    }

    const promise = request(endpoint)
        .then(data => {
            if (!searchTerm) {
                cache[cacheKey] = { data, timestamp: Date.now() };
            }
            return data;
        })
        .finally(() => {
            delete inflightRequests[cacheKey];
        });

    inflightRequests[cacheKey] = promise;
    return promise;
  },

  createRecord: async (entityName: string, data: RecordData) => {
    const res = await request(`/${entityName}`, 'POST', data);
    if (res.success) {
        // Invalida cache desta entidade
        Object.keys(cache).forEach(key => {
            if (key.startsWith(`/${entityName}`)) delete cache[key];
        });
    }
    return res;
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    const res = await request(`/${entityName}/${pkValue}`, 'PUT', data);
    if (res.success) {
        Object.keys(cache).forEach(key => {
            if (key.startsWith(`/${entityName}`)) delete cache[key];
        });
    }
    return res;
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    const res = await request(`/${entityName}/${pkValue}`, 'DELETE');
    if (res.success) {
        Object.keys(cache).forEach(key => {
            if (key.startsWith(`/${entityName}`)) delete cache[key];
        });
    }
    return res;
  },

  // Gerenciamento de Usuários
  getUsers: async () => {
      return request('/Usuario'); 
  },

  deleteUser: async (usuarioId: string) => {
      return request(`/Usuario/${usuarioId}`, 'DELETE');
  },

  // Ações Específicas
  toggleVagaBloqueada: async (idVaga: string) => {
    const res = await request(`/Vaga/${idVaga}/toggle-lock`, 'POST');
    Object.keys(cache).forEach(key => {
        if (key.startsWith(`/Vaga`)) delete cache[key];
    });
    return res;
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      const res = await request('/Exercicio', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
      // Invalida caches relacionados
      Object.keys(cache).forEach(key => {
        if (key.startsWith(`/Vaga`) || key.startsWith(`/Exercicio`)) delete cache[key];
      });
      return res;
  },

  getDossiePessoal: async (cpf: string): Promise<DossierData> => {
    return request(`/Pessoa/${cpf}/dossier`);
  },

  restoreAuditLog: async (idLog: string) => {
    const res = await request(`/Auditoria/${idLog}/restore`, 'POST');
    cache = {}; // Limpa tudo por segurança após restauração crítica
    return res;
  },

  processDailyRoutines: async () => {
      console.log('Syncing daily routines...');
  },

  getRevisoesPendentes: async () => {
    const data = await api.fetchEntity('Atendimento'); 
    if (!Array.isArray(data)) return [];
    return data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('Atendimento');
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    
    if (!atd) throw new Error("Atendimento não encontrado");

    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    const promises: Promise<any>[] = [];

    // Carrega dependências usando nomes PascalCase corretos
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

    return {
        atendimento: atd,
        lookups,
        fields
    };
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
               // Atualização Genérica
               const config: any = ENTITY_CONFIGS[atd.ENTIDADE_ALVO];
               if (config && data[config.pk]) {
                   await api.updateRecord(atd.ENTIDADE_ALVO, config.pk, data[config.pk], data);
               }
          }
      }
      
      await api.updateRecord('Atendimento', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  // Relatórios delegados 100% ao backend
  getReportData: async (reportName: string): Promise<ReportData> => {
      return request(`/reports/${reportName}`);
  }
};
