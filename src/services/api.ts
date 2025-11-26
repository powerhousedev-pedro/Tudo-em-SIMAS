
import { RecordData, DossierData, ActionContext, ReportData } from '../types';

// CONFIGURATION
const API_BASE_URL = 'http://localhost:3001/api';
const TOKEN_KEY = 'simas_auth_token';

// --- CACHE & NORMALIZATION ---

const cache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

const inflightRequests: Record<string, Promise<any> | undefined> = {};

// Explicit map to ensure specific entities translate correctly to backend routes
const ENDPOINT_MAP: Record<string, string> = {
    'LOTAÇÕES': 'lotacoes',
    'LOTACOES': 'lotacoes',
    'FUNÇÃO': 'funcao',
    'FUNCAO': 'funcao',
    'EXERCÍCIO': 'exercicio',
    'EXERCICIO': 'exercicio',
    'CAPACITAÇÃO': 'capacitacao',
    'CAPACITACAO': 'capacitacao',
    'SOLICITAÇÃO DE PESQUISA': 'solicitacao-de-pesquisa',
    'SOLICITACAODEPESQUISA': 'solicitacao-de-pesquisa',
    'NOMEAÇÃO': 'nomeacao',
    'NOMEACAO': 'nomeacao',
    'CARGO COMISSIONADO': 'cargo-comissionado',
    'CARGOCOMISSIONADO': 'cargo-comissionado',
    'CONTRATO_HISTORICO': 'contratohistorico',
    'CONTRATOHISTORICO': 'contratohistorico',
    'ALOCACAO_HISTORICO': 'alocacaohistorico',
    'ALOCACAOHISTORICO': 'alocacaohistorico'
};

const normalizeEndpoint = (entityName: string) => {
    const upper = entityName.toUpperCase();
    if (ENDPOINT_MAP[upper]) return ENDPOINT_MAP[upper];

    // Fallback: Aggressive normalization
    return entityName.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/ /g, '-') // Space to dash
        .replace(/[^a-z0-9-]/g, ''); // Remove anything else
};

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

  fetchEntity: async (entityName: string, forceRefresh = false): Promise<any[]> => {
    const endpoint = `/${normalizeEndpoint(entityName)}`;
    
    // 1. Check Cache
    const now = Date.now();
    if (!forceRefresh && cache[endpoint] && (now - cache[endpoint].timestamp < CACHE_TTL)) {
        return Promise.resolve(cache[endpoint].data);
    }

    // 2. Check Inflight (Deduplication)
    if (inflightRequests[endpoint] && !forceRefresh) {
        return inflightRequests[endpoint] as Promise<any[]>;
    }

    // 3. Fetch
    const promise = request(endpoint)
        .then(data => {
            cache[endpoint] = { data, timestamp: Date.now() };
            return data;
        })
        .finally(() => {
            delete inflightRequests[endpoint];
        });

    inflightRequests[endpoint] = promise;
    return promise;
  },

  createRecord: async (entityName: string, data: RecordData) => {
    const endpoint = `/${normalizeEndpoint(entityName)}`;
    const res = await request(endpoint, 'POST', data);
    if (res.success) delete cache[endpoint]; // Invalidate cache
    return res;
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    const endpoint = `/${normalizeEndpoint(entityName)}`;
    const res = await request(`${endpoint}/${pkValue}`, 'PUT', data);
    if (res.success) delete cache[endpoint]; // Invalidate cache
    return res;
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    const endpoint = `/${normalizeEndpoint(entityName)}`;
    const res = await request(`${endpoint}/${pkValue}`, 'DELETE');
    if (res.success) delete cache[endpoint]; // Invalidate cache
    return res;
  },

  // User Management
  getUsers: async () => {
      return request('/usuarios');
  },

  deleteUser: async (usuarioId: string) => {
      const res = await request(`/usuarios/${usuarioId}`, 'DELETE');
      return res;
  },

  toggleVagaBloqueada: async (idVaga: string) => {
    const res = await request(`/vagas/${idVaga}/toggle-lock`, 'POST');
    delete cache['/vagas'];
    return res;
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      const res = await request('/exercicio', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
      delete cache['/exercicio'];
      delete cache['/vagas'];
      return res;
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
    return data.filter((a: any) => a.STATUS_AGENDAMENTO === 'Pendente');
  },

  getActionContext: async (idAtendimento: string): Promise<ActionContext> => {
    const atendimentos = await api.fetchEntity('ATENDIMENTO');
    const atd = atendimentos.find((a: any) => a.ID_ATENDIMENTO === idAtendimento);
    
    if (!atd) throw new Error("Atendimento não encontrado");

    const lookups: any = {};
    const fields: any = {};
    
    const acao = `${atd.TIPO_DE_ACAO}:${atd.ENTIDADE_ALVO}`;
    
    // Use fetchEntity (cached) for lookups
    const promises: Promise<any>[] = [];
    
    if (acao.includes('CONTRATO')) {
        promises.push(api.fetchEntity('VAGAS').then(d => lookups['VAGAS'] = d));
        promises.push(api.fetchEntity('FUNÇÃO').then(d => lookups['FUNÇÃO'] = d));
    } else if (acao.includes('ALOCACAO')) {
        promises.push(api.fetchEntity('LOTAÇÕES').then(d => lookups['LOTAÇÕES'] = d));
        promises.push(api.fetchEntity('FUNÇÃO').then(d => lookups['FUNÇÃO'] = d));
    } else if (acao.includes('NOMEAÇÃO')) {
        promises.push(api.fetchEntity('CARGO COMISSIONADO').then(d => lookups['CARGO COMISSIONADO'] = d));
    }

    await Promise.all(promises);

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
      delete cache['/atendimento'];
      
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  // --- REPORTS LOGIC ---
  getReportData: async (reportName: string): Promise<ReportData> => {
    
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

    if (reportName === 'analiseCustos') {
        const [contratos, vagas, cargos] = await Promise.all([
            api.fetchEntity('CONTRATO'), api.fetchEntity('VAGAS'), api.fetchEntity('CARGOS')
        ]);
        
        const cargoSalarioMap = new Map(cargos.map((c:any) => [c.ID_CARGO, parseFloat(c.SALARIO || 0)]));
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

    if (reportName === 'contratosAtivos') {
        const contratos = await api.fetchEntity('CONTRATO');
        const linhas = contratos.map((c: any) => [
            c.NOME_PESSOA, c.CPF, c.ID_CONTRATO, c.NOME_FUNCAO, new Date(c.DATA_DO_CONTRATO).toLocaleDateString('pt-BR')
        ]);
        return { colunas: ['Nome', 'CPF', 'Contrato', 'Função', 'Início'], linhas };
    }

    if (reportName === 'quadroLotacaoServidores') {
        const alocacoes = await api.fetchEntity('ALOCACAO');
        const linhas = alocacoes.map((a: any) => [
            a.NOME_LOTACAO, a.NOME_PESSOA, a.MATRICULA, a.NOME_FUNCAO
        ]);
        return { colunas: ['Lotação', 'Servidor', 'Matrícula', 'Função'], linhas };
    }

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

    if (reportName === 'adesaoFrequencia') {
        const chamadas = await api.fetchEntity('CHAMADA');
        const linhas = chamadas.map((c: any) => [
            c.NOME_TURMA, c.NOME_PESSOA, c.PRESENCA, new Date(c.DATA_ENCONTRO || Date.now()).toLocaleDateString()
        ]);
        return { colunas: ['Turma', 'Participante', 'Presença', 'Data'], linhas };
    }

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
