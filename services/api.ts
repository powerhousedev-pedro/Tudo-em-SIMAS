
import { RecordData, DossierData, ActionContext, ReportData } from '../types';

// CONFIGURAÇÃO
const API_BASE_URL = 'https://tudoemsimas.powerhouseapp.de/api';
const TOKEN_KEY = 'simas_auth_token';

// --- CACHE & REQUEST MANAGEMENT ---
interface CacheEntry {
    data: any;
    timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos de cache

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
         throw new Error('Sessão expirada');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Backend returns error in 'message' OR 'error' property
        throw new Error(errorData.message || errorData.error || `Erro na API: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    
    // Only log strictly unknown errors to console to reduce noise
    // 400-level errors are often functional (e.g. invalid password)
    const isClientError = error.message && (error.message.includes('Senha incorreta') || error.message.includes('Usuário'));
    if (!isClientError) {
        console.error(`API Error (${method} ${endpoint}):`, error);
    }
    throw error;
  }
}

// --- MÉTODOS PÚBLICOS DA API ---
export const api = {
  login: async (usuario: string, senha: string) => request('/auth/login', 'POST', { usuario, senha }),

  // Função principal: Busca dados JÁ ENRIQUECIDOS pelo backend
  fetchEntity: async (entityName: string, forceRefresh = false, searchTerm = ''): Promise<any[]> => {
    const baseEndpoint = getEndpoint(entityName);
    const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
    const fullUrl = baseEndpoint + query;
    const cacheKey = fullUrl;

    // 1. Verificar Cache (apenas se não for refresh e não for busca)
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (!forceRefresh && !searchTerm && cached && (now - cached.timestamp < CACHE_TTL)) {
        return Promise.resolve(JSON.parse(JSON.stringify(cached.data))); // Clone to avoid mutation
    }

    try {
        const data = await request(fullUrl);
        
        // Garante que o retorno seja sempre um array
        if (!Array.isArray(data)) {
            console.warn(`fetchEntity: API retornou não-array para ${entityName}`, data);
            return [];
        }

        // Salvar no cache se não for busca
        if (!searchTerm) {
            cache.set(cacheKey, { data: data, timestamp: Date.now() });
        }

        return data;
    } catch (err) {
        // Use Warn instead of Error for fetches to avoid alarming console spam for non-critical failures (e.g. missing tables)
        console.warn(`Falha ao buscar ${entityName}:`, err);
        return [];
    }
  },

  createRecord: async (entityName: string, data: RecordData) => {
    const endpoint = getEndpoint(entityName);
    const res = await request(endpoint, 'POST', data);
    if (res.success) cache.clear(); // Invalida cache global simples para garantir consistência
    return res;
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    const endpoint = getEndpoint(entityName);
    const res = await request(`${endpoint}/${pkValue}`, 'PUT', data);
    if (res.success) cache.clear();
    return res;
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    const endpoint = getEndpoint(entityName);
    const res = await request(`${endpoint}/${pkValue}`, 'DELETE');
    if (res.success) cache.clear();
    return res;
  },

  getUsers: async () => request('/Usuario'),
  deleteUser: async (usuarioId: string) => request(`/Usuario/${usuarioId}`, 'DELETE'),

  toggleVagaBloqueada: async (idVaga: string) => {
    const res = await request(`/Vaga/${idVaga}/toggle-lock`, 'POST');
    cache.clear();
    return res;
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      const res = await request('/Exercicio', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
      cache.clear();
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
        
        const today = new Date().toISOString().split('T')[0];
        
        return data.filter((a: any) => {
            // Must be Pending AND Date must be today or in the past
            return a.STATUS_AGENDAMENTO === 'Pendente' && 
                   (a.DATA_AGENDAMENTO && a.DATA_AGENDAMENTO <= today);
        });
    } catch (e) { return []; }
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

    // O objeto atd já vem enriquecido do backend com NOME_PESSOA, etc.
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
               // Generic Update
               const pkKey = targetEntity === 'Contrato' ? 'ID_CONTRATO' : `ID_${atd.ENTIDADE_ALVO.toUpperCase()}`;
               if (data[pkKey]) await api.updateRecord(atd.ENTIDADE_ALVO, pkKey, data[pkKey], data);
          }
      }
      
      await api.updateRecord('Atendimento', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      cache.clear();
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => request(`/reports/${reportName}`)
};
