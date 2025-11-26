
import { RecordData, DossierData, ActionContext, ReportData } from '../types';

// CONFIGURATION
const API_BASE_URL = 'https://tudoemsimas.powerhouseapp.de/api';
const TOKEN_KEY = 'simas_auth_token';

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

// Helper to enrich data on client-side
const enrichEntityData = async (entityName: string, data: any[]) => {
    if (entityName === 'VAGAS') {
        const [lotacoes, cargos, contratos] = await Promise.all([
            api.fetchEntity('LOTAÇÕES'), 
            api.fetchEntity('CARGOS'), 
            api.fetchEntity('CONTRATO')
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
        const [pessoas, funcoes] = await Promise.all([
            api.fetchEntity('PESSOA'), 
            api.fetchEntity('FUNÇÃO')
        ]);
        const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
        const funcaoMap = new Map(funcoes.map((f: any) => [f.ID_FUNCAO, f.FUNCAO]));
        
        return data.map(c => ({
            ...c,
            NOME_PESSOA: pessoaMap.get(c.CPF) || c.CPF,
            NOME_FUNCAO: funcaoMap.get(c.ID_FUNCAO) || 'N/A'
        }));
    }
    
    // Additional enrichment for other entities can be added here
    if (entityName === 'SERVIDOR') {
       const [pessoas, cargos] = await Promise.all([
            api.fetchEntity('PESSOA'),
            api.fetchEntity('CARGOS')
       ]);
       const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
       const cargoMap = new Map(cargos.map((c: any) => [c.ID_CARGO, c.NOME_CARGO]));

       return data.map(s => ({
           ...s,
           NOME_PESSOA: pessoaMap.get(s.CPF) || s.CPF,
           NOME_CARGO: cargoMap.get(s.ID_CARGO) || s.ID_CARGO
       }));
    }

    return data;
};

export const api = {
  login: async (usuario: string, senha: string) => {
    return request('/auth/login', 'POST', { usuario, senha });
  },

  fetchEntity: async (entityName: string) => {
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
      // Assuming backend handles ID generation or we send a temp one
      return request('/exercício', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
  },

  getDossiePessoal: async (cpf: string): Promise<DossierData> => {
    return request(`/pessoas/${cpf}/dossier`);
  },

  restoreAuditLog: async (idLog: string) => {
    return request(`/audit/${idLog}/restore`, 'POST');
  },

  processDailyRoutines: async () => {
      // Handled by server-side CRON, but we keep the stub to avoid breaking App.tsx calls
      console.log('Syncing daily routines...');
  },

  getRevisoesPendentes: async () => {
    const data = await request('/atendimento');
    const pending = data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
    const pessoas = await api.fetchEntity('PESSOA');
    const pessoaMap = new Map(pessoas.map((p: any) => [p.CPF, p.NOME]));
    return pending.map((p: any) => ({ 
        ...p, 
        NOME_PESSOA: pessoaMap.get(p.CPF) || p.CPF 
    }));
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('ATENDIMENTO');
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    
    if (!atd) throw new Error("Atendimento não encontrado");

    const pessoas = await api.fetchEntity('PESSOA');
    const person = pessoas.find((p: any) => p.CPF === atd.CPF);
    
    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    
    // Pre-load necessary lookups based on action type
    if (acao.includes('CONTRATO')) {
        lookups['VAGAS'] = await api.fetchEntity('VAGAS');
        lookups['FUNÇÃO'] = await api.fetchEntity('FUNÇÃO');
    } else if (acao.includes('ALOCACAO')) {
        lookups['LOTAÇÕES'] = await api.fetchEntity('LOTAÇÕES');
        lookups['FUNÇÃO'] = await api.fetchEntity('FUNÇÃO');
    } else if (acao.includes('NOMEAÇÃO')) {
        lookups['CARGO COMISSIONADO'] = await api.fetchEntity('CARGO COMISSIONADO');
    }

    return {
        atendimento: { ...atd, NOME_PESSOA: person?.NOME || atd.CPF },
        lookups,
        fields
    };
  },

  executeAction: async (idAtendimento: string, data: any) => {
      // 1. Create the target record (Server side logic is triggered via generic CREATE)
      const atd = (await api.fetchEntity('ATENDIMENTO')).find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
      
      if (atd && atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else if (atd && atd.TIPO_DE_ACAO === 'INATIVAR') {
          // Specific endpoint could be better, but generic update works if mapped correctly
          // For now, we assume INATIVAR implies moving to history which needs specific backend logic
          // Or simple status update:
          if (atd.ENTIDADE_ALVO === 'SERVIDOR') {
             // This specific case might need a custom endpoint or robust create logic for 'INATIVOS'
             // For simplicity in this refactor, we assume generic create on INATIVOS table if data is correct
             await api.createRecord('INATIVOS', data);
          }
      }
      
      // 2. Update Atendimento status
      await api.updateRecord('ATENDIMENTO', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => {
    // In a real app, these aggregations should be server-side endpoints (e.g., /api/reports/painel-vagas)
    // For this refactor, we maintain client-side aggregation to match current backend capabilities
    if (reportName === 'painelVagas') {
        const vagas = await api.fetchEntity('VAGAS');
        
        const quantitativo = vagas.map((v: any) => ({
            VINCULACAO: 'Geral', // Real data would come from joined Lotacao
            LOTACAO: v.LOTACAO_NOME,
            CARGO: v.CARGO_NOME,
            DETALHES: v.STATUS_VAGA
        }));

        return { 
            panorama: vagas,
            quantitativo: quantitativo // Simplified aggregation
        };
    }
    // Implement other reports similarly or fetch generic data
    return {};
  }
};
