
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
    
    if (response.status === 401 || response.status === 403) {
        // Handle both Unauthorized and Forbidden by checking if it's a session issue
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

// Helper to enrich data on client-side (Now significantly reduced for VAGAS)
const enrichEntityData = async (entityName: string, data: any[]) => {
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

  // User Management
  getUsers: async () => {
      return request('/usuarios');
  },

  deleteUser: async (usuarioId: string) => {
      return request(`/usuarios/${usuarioId}`, 'DELETE');
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
    // Backend might return empty array if table empty
    if (!Array.isArray(data)) return [];
    
    const pending = data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
    if (pending.length === 0) return [];

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
      const atd = (await api.fetchEntity('ATENDIMENTO')).find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
      
      if (!atd) throw new Error("Atendimento não encontrado");

      // 1. Execute Specific Action
      if (atd.TIPO_DE_ACAO === 'INATIVAR' && atd.ENTIDADE_ALVO === 'SERVIDOR') {
          // Call specialized endpoint
          await request('/servidores/inativar', 'POST', data);
      } else if (atd.TIPO_DE_ACAO === 'EDITAR' && atd.ENTIDADE_ALVO === 'CONTRATO') {
          // Specific flow for Contract Change/Renewal: Archive old -> Create new
          // First, archive the active contract for this person
          await request('/contratos/arquivar', 'POST', { 
              CPF: data.CPF, 
              MOTIVO: atd.TIPO_PEDIDO 
          });
          
          // Then create the new one (using standard create endpoint which handles reserve closing logic too)
          // Ensure ID is generated for new contract
          if (!data.ID_CONTRATO) data.ID_CONTRATO = 'CTT' + Date.now(); // Fallback ID gen if not provided
          await api.createRecord('CONTRATO', data);

      } else if (atd.TIPO_DE_ACAO === 'CRIAR') {
          // Uses specific logic in backend if mapped (e.g., contrato, alocacao) or generic
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else {
          // Generic Update/Edit Actions
          if (atd.TIPO_DE_ACAO === 'EDITAR' && data.ID_ALOCACAO) {
               // Use the Create endpoint for allocation because it handles versioning
               await api.createRecord('ALOCACAO', data); 
          } else {
               // Fallback generic update
               const config = {
                   'CONTRATO': 'ID_CONTRATO'
                   // Add others if needed
               }[atd.ENTIDADE_ALVO];
               
               if (config && data[config]) {
                   await api.updateRecord(atd.ENTIDADE_ALVO, config, data[config], data);
               }
          }
      }
      
      // 2. Update Atendimento status
      await api.updateRecord('ATENDIMENTO', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => {
    // Client-side aggregation for reports
    if (reportName === 'painelVagas') {
        const vagas = await api.fetchEntity('VAGAS');
        
        const quantitativo = vagas.map((v: any) => ({
            VINCULACAO: v.LOTACAO_NOME.includes('CRAS') ? 'Proteção Básica' : 'Proteção Especial', // Simplified logic
            LOTACAO: v.LOTACAO_NOME,
            CARGO: v.CARGO_NOME,
            DETALHES: v.STATUS_VAGA
        }));

        return { 
            panorama: vagas,
            quantitativo: quantitativo 
        };
    }
    // Return empty structure for others to avoid crash, assuming components handle empty states
    return {};
  }
};
