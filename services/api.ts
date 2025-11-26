import { RecordData, DossierData, ActionContext, ReportData } from '../types';
import { ENTITY_CONFIGS } from '../constants';

// CONFIGURATION
// --- CHANGE THIS TO FALSE TO CONNECT TO REAL DB ---
const USE_MOCK_DATA = false; 
const API_BASE_URL = 'http://localhost:3001/api'; // Adjust to your VPS IP
const TOKEN_KEY = 'simas_auth_token';

// --- MOCK DATA INITIALIZATION (Fallback) ---
const MOCK_DB: { [key: string]: any[] } = {};

// (Mantendo o código do MOCK_DB apenas para fallback caso o servidor caia, 
// mas na prática ele não será usado se USE_MOCK_DATA = false)
const initMockData = () => {
  Object.keys(ENTITY_CONFIGS).forEach(key => { MOCK_DB[key] = []; });
  // ... (resto da inicialização do mock pode ficar aqui como estava antes)
};
if (USE_MOCK_DATA) { initMockData(); }

// --- REAL API CLIENT ---

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
    
    if (response.status === 401) {
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

// Helper to enrich data on client-side (Since real backend returns raw rows)
const enrichEntityData = async (entityName: string, data: any[]) => {
    if (entityName === 'VAGAS') {
        const [lotacoes, cargos, contratos, reservas] = await Promise.all([
            api.fetchEntity('LOTAÇÕES'), api.fetchEntity('CARGOS'), api.fetchEntity('CONTRATO'), api.fetchEntity('RESERVAS')
        ]);
        
        const lotacaoMap = new Map(lotacoes.map((l: any) => [l.ID_LOTACAO, l.LOTACAO]));
        const cargoMap = new Map(cargos.map((c: any) => [c.ID_CARGO, c.NOME_CARGO]));
        const occupiedSet = new Set(contratos.map((c: any) => c.ID_VAGA));
        
        return data.map(v => ({
            ...v,
            LOTACAO_NOME: lotacaoMap.get(v.ID_LOTACAO) || 'N/A',
            CARGO_NOME: cargoMap.get(v.ID_CARGO) || 'N/A',
            STATUS_VAGA: v.BLOQUEADA ? 'Bloqueada' : (occupiedSet.has(v.ID_VAGA) ? 'Ocupada' : 'Disponível')
        }));
    }
    if (entityName === 'CONTRATO') {
        const [pessoas, funcoes] = await Promise.all([api.fetchEntity('PESSOA'), api.fetchEntity('FUNÇÃO')]);
        const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
        const funcaoMap = new Map(funcoes.map((f: any) => [f.ID_FUNCAO, f.FUNCAO]));
        
        return data.map(c => ({
            ...c,
            NOME_PESSOA: pessoaMap.get(c.CPF) || c.CPF,
            NOME_FUNCAO: funcaoMap.get(c.ID_FUNCAO) || 'N/A'
        }));
    }
    return data;
};

export const api = {
  login: async (usuario: string, senha: string) => {
    // Real Login
    return request('/auth/login', 'POST', { usuario, senha });
  },

  fetchEntity: async (entityName: string) => {
    // Real Fetch
    const rawData = await request(`/${entityName.toLowerCase().replace(/ /g, '-')}`);
    return enrichEntityData(entityName, rawData);
  },

  createRecord: async (entityName: string, data: RecordData) => {
    return request(`/${entityName.toLowerCase().replace(/ /g, '-')}`, 'POST', data);
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    return request(`/${entityName.toLowerCase().replace(/ /g, '-')}/${pkValue}`, 'PUT', data);
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    return request(`/${entityName.toLowerCase().replace(/ /g, '-')}/${pkValue}`, 'DELETE');
  },

  toggleVagaBloqueada: async (idVaga: string) => {
    return request(`/vagas/${idVaga}/toggle-lock`, 'POST');
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      // Need to implement generic create or specific route if not exists
      // Simulating via direct creation for now if backend supports it
      return request('/exercício', 'POST', { ID_EXERCICIO: 'EXE'+Date.now(), ID_VAGA: idVaga, ID_LOTACAO: idLotacao });
  },

  getDossiePessoal: async (cpf: string): Promise<DossierData> => {
    return request(`/pessoas/${cpf}/dossier`);
  },

  restoreAuditLog: async (idLog: string) => {
    return request(`/audit/${idLog}/restore`, 'POST');
  },

  processDailyRoutines: async () => {
      // No-op on frontend, server handles via CRON
      console.log('Daily routines handled by server cron.');
  },

  getRevisoesPendentes: async () => {
    const data = await request('/atendimento');
    const pending = data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
    const pessoas = await api.fetchEntity('PESSOA');
    const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
    return pending.map((p: any) => ({ ...p, NOME_PESSOA: pessoaMap.get(p.CPF) || p.CPF }));
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    // Simulating context aggregation on client side to reduce backend complexity for this specific feature
    const atendimentos = await api.fetchEntity('ATENDIMENTO');
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    const pessoas = await api.fetchEntity('PESSOA');
    const person = pessoas.find((p: any) => p.CPF === atd.CPF);
    
    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    
    if (acao.includes('CONTRATO')) {
        lookups['VAGAS'] = await api.fetchEntity('VAGAS');
        lookups['FUNÇÃO'] = await api.fetchEntity('FUNÇÃO');
    }

    return {
        atendimento: { ...atd, NOME_PESSOA: person?.NOME || atd.CPF },
        lookups,
        fields
    };
  },

  executeAction: async (idAtendimento: string, data: any) => {
      // Execute Logic is partially server (create record) and partially client orchestration here
      // For safety, we simply update the Atendimento status here after creating the record
      const atd = (await api.fetchEntity('ATENDIMENTO')).find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
      
      if (atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      }
      
      // Update status
      await api.updateRecord('ATENDIMENTO', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      
      return { success: true, message: 'Ação executada.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => {
    // Re-implement client-side aggregation using real data fetch
    // This keeps backend simple (CRUD only)
    if (reportName === 'painelVagas') {
        const vagas = await api.fetchEntity('VAGAS');
        // reuse logic from generatePainelVagasData but with fetched data
        // Simplified for brevity:
        return { panorama: vagas };
    }
    return {};
  }
};
