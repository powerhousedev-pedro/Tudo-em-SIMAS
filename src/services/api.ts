
import { RecordData, DossierData, ActionContext, ReportData } from '../types';

// CONFIGURATION
const API_BASE_URL = 'http://localhost:3001/api';
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

export const api = {
  login: async (usuario: string, senha: string) => {
    return request('/auth/login', 'POST', { usuario, senha });
  },

  fetchEntity: async (entityName: string): Promise<any[]> => {
    // Now the backend handles enrichment, so we just fetch directly.
    return request(`/${entityName.toLowerCase().replace(/ /g, '-')}`);
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
      console.log('Syncing daily routines...');
  },

  getRevisoesPendentes: async () => {
    const data = await request('/atendimento');
    if (!Array.isArray(data)) return [];
    
    const pending = data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
    if (pending.length === 0) return [];

    // Atendimentos now come enriched with NOME_PESSOA from backend
    return pending; 
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('ATENDIMENTO');
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    
    if (!atd) throw new Error("Atendimento não encontrado");

    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    
    // We still need lookups for the modal dropdowns, but these fetches are simple now
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
        atendimento: atd,
        lookups,
        fields
    };
  },

  executeAction: async (idAtendimento: string, data: any) => {
      const atd = (await api.fetchEntity('ATENDIMENTO')).find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
      
      if (!atd) throw new Error("Atendimento não encontrado");

      if (atd.TIPO_DE_ACAO === 'INATIVAR' && atd.ENTIDADE_ALVO === 'SERVIDOR') {
          await request('/servidores/inativar', 'POST', data);
      } else if (atd.TIPO_DE_ACAO === 'EDITAR' && atd.ENTIDADE_ALVO === 'CONTRATO') {
          await request('/contratos/arquivar', 'POST', { CPF: data.CPF, MOTIVO: atd.TIPO_PEDIDO });
          if (!data.ID_CONTRATO) data.ID_CONTRATO = 'CTT' + Date.now();
          await api.createRecord('CONTRATO', data);
      } else if (atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else {
          if (atd.TIPO_DE_ACAO === 'EDITAR' && data.ID_ALOCACAO) {
               await api.createRecord('ALOCACAO', data); 
          } else {
               const config: any = { 'CONTRATO': 'ID_CONTRATO' };
               if (config[atd.ENTIDADE_ALVO] && data[config[atd.ENTIDADE_ALVO]]) {
                   await api.updateRecord(atd.ENTIDADE_ALVO, config[atd.ENTIDADE_ALVO], data[config[atd.ENTIDADE_ALVO]], data);
               }
          }
      }
      
      await api.updateRecord('ATENDIMENTO', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  // --- REPORTS LOGIC (Client-Side Aggregation) ---
  getReportData: async (reportName: string): Promise<ReportData> => {
    
    // 1. PAINEL VAGAS
    if (reportName === 'painelVagas') {
        const vagas = await api.fetchEntity('VAGAS');
        const quantitativo = vagas.map((v: any) => ({
            VINCULACAO: v.LOTACAO_NOME && v.LOTACAO_NOME.includes('CRAS') ? 'Proteção Básica' : 'Proteção Especial',
            LOTACAO: v.LOTACAO_NOME,
            CARGO: v.CARGO_NOME,
            DETALHES: v.STATUS_VAGA === 'Reservada' ? `Reservada (${v.RESERVADA_ID})` : v.STATUS_VAGA
        }));
        return { panorama: vagas, quantitativo: quantitativo, filtrosDisponiveis: {} as any };
    }

    // 2. DASHBOARD PESSOAL
    if (reportName === 'dashboardPessoal') {
        const [contratos, servidores, alocacoes, vagas] = await Promise.all([
            api.fetchEntity('CONTRATO'), api.fetchEntity('SERVIDOR'), 
            api.fetchEntity('ALOCACAO'), api.fetchEntity('VAGAS')
        ]);
        
        const vinculoCounts: any = { 'OSC': contratos.length };
        servidores.forEach((s: any) => {
            const v = s.VINCULO || 'Não especificado';
            vinculoCounts[v] = (vinculoCounts[v] || 0) + 1;
        });
        const graficoVinculo = Object.entries(vinculoCounts).map(([name, value]) => ({ name, value: Number(value) }));

        const lotacaoCounts: any = {};
        alocacoes.forEach((a: any) => {
            lotacaoCounts[a.NOME_LOTACAO] = (lotacaoCounts[a.NOME_LOTACAO] || 0) + 1;
        });
        const vagaMap = new Map<string, string>(vagas.map((v:any) => [v.ID_VAGA, v.LOTACAO_NOME]));
        contratos.forEach((c: any) => {
            const lot = vagaMap.get(c.ID_VAGA) || 'Desconhecida';
            lotacaoCounts[lot] = (lotacaoCounts[lot] || 0) + 1;
        });
        
        const graficoLotacao = Object.entries(lotacaoCounts)
            .sort((a:any, b:any) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, value]) => ({ name, value: Number(value) }));

        return {
            totais: { 'Contratados': contratos.length, 'Servidores': servidores.length, 'Total': contratos.length + servidores.length },
            graficos: { vinculo: graficoVinculo as any, lotacao: graficoLotacao as any }
        } as any;
    }

    // 3. ANALISE CUSTOS
    if (reportName === 'analiseCustos') {
        const [contratos, vagas, cargos] = await Promise.all([
            api.fetchEntity('CONTRATO'), api.fetchEntity('VAGAS'), api.fetchEntity('CARGOS')
        ]);
        
        const cargoSalarioMap = new Map(cargos.map((c:any) => [c.ID_CARGO, parseFloat(c.SALARIO || 0)]));
        const vagaMap = new Map<string, { lotacao: string, cargo: string }>(vagas.map((v:any) => [v.ID_VAGA, { lotacao: v.LOTACAO_NOME, cargo: v.CARGO_NOME }])); // CARGO_NOME is now key
        
        // We actually need cargo ID for salary lookup, but Vagas optimized API returns names. 
        // Ideally Vagas optimized API should return CARGO_ID too. Assuming it returns CARGO object with ID.
        // Let's rely on Vagas optimized returning IDs too (implied in server.ts as part of `...v`)
        const vagaMapID = new Map<string, { lotacao: string, cargoId: string }>(vagas.map((v:any) => [v.ID_VAGA, { lotacao: v.LOTACAO_NOME, cargoId: v.ID_CARGO }]));

        const custoPorLotacao: any = {};
        contratos.forEach((c: any) => {
            const v = vagaMapID.get(c.ID_VAGA);
            if (v) {
                const sal = cargoSalarioMap.get(v.cargoId) || 0;
                custoPorLotacao[v.lotacao] = (custoPorLotacao[v.lotacao] || 0) + sal;
            }
        });

        const topCustos = Object.entries(custoPorLotacao)
            .sort((a:any, b:any) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, value]) => ({ name, value: Number(value) }));
            
        const linhasTabela = Object.entries(custoPorLotacao).map(([lot, val]) => [lot, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val))]);

        return {
            graficos: { custoPorLotacao: topCustos as any },
            tabela: { colunas: ['Lotação', 'Custo Mensal Estimado'], linhas: linhasTabela }
        } as any;
    }

    // 4. CONTRATOS ATIVOS
    if (reportName === 'contratosAtivos') {
        const contratos = await api.fetchEntity('CONTRATO');
        const linhas = contratos.map((c: any) => [
            c.NOME_PESSOA, c.CPF, c.ID_CONTRATO, c.NOME_FUNCAO, new Date(c.DATA_DO_CONTRATO).toLocaleDateString('pt-BR')
        ]);
        return { colunas: ['Nome', 'CPF', 'Contrato', 'Função', 'Início'], linhas };
    }

    // 5. QUADRO LOTACAO (SERVIDORES)
    if (reportName === 'quadroLotacaoServidores') {
        const alocacoes = await api.fetchEntity('ALOCACAO');
        const linhas = alocacoes.map((a: any) => [
            a.NOME_LOTACAO, a.NOME_PESSOA, a.MATRICULA, a.NOME_FUNCAO
        ]);
        return { colunas: ['Lotação', 'Servidor', 'Matrícula', 'Função'], linhas };
    }

    // 6. PERFIL DEMOGRAFICO
    if (reportName === 'perfilDemografico') {
        const pessoas = await api.fetchEntity('PESSOA');
        
        const counts: any = {};
        const bairros: any = {};
        
        pessoas.forEach((p: any) => {
            const esc = p.ESCOLARIDADE || 'Não Inf.';
            counts[esc] = (counts[esc] || 0) + 1;
            
            const bai = p.BAIRRO || 'Não Inf.';
            bairros[bai] = (bairros[bai] || 0) + 1;
        });

        const grafEsc = Object.entries(counts).map(([name, value]) => ({ name, value: Number(value) }));
        const grafBai = Object.entries(bairros).sort((a:any,b:any)=>b[1]-a[1]).slice(0, 10).map(([name, value]) => ({ name, value: Number(value) }));

        return {
            graficos: { escolaridade: grafEsc as any, bairro: grafBai as any }
        } as any;
    }

    // 7. ADESAO FREQUENCIA
    if (reportName === 'adesaoFrequencia') {
        const chamadas = await api.fetchEntity('CHAMADA');
        const linhas = chamadas.map((c: any) => [
            c.NOME_TURMA, c.NOME_PESSOA, c.PRESENCA, new Date(c.DATA_ENCONTRO || Date.now()).toLocaleDateString()
        ]);
        return { colunas: ['Turma', 'Participante', 'Presença', 'Data'], linhas };
    }

    // 8. ATIVIDADE USUARIOS (Audit)
    if (reportName === 'atividadeUsuarios') {
        const logs = await api.fetchEntity('AUDITORIA');
        const linhas = logs.map((l: any) => [
            new Date(l.DATA_HORA).toLocaleString(), l.USUARIO, l.ACAO, l.TABELA_AFETADA, l.ID_REGISTRO_AFETADO
        ]);
        return { colunas: ['Data/Hora', 'Usuário', 'Ação', 'Tabela', 'ID Registro'], linhas };
    }

    return {};
  }
};