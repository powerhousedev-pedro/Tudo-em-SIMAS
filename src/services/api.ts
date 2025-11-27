
import { RecordData, DossierData, ActionContext, ReportData } from '../types';
import { ENTITY_CONFIGS } from '../constants';

// CONFIGURATION
const API_BASE_URL = 'http://localhost:3001/api';
const TOKEN_KEY = 'simas_auth_token';

// --- CACHE ---
const cache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; 
const inflightRequests: Record<string, Promise<any> | undefined> = {};

async function request(endpoint: string, method: string = 'GET', body?: any) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config: RequestInit = { method, headers };
  if (body) config.body = JSON.stringify(body);
  
  console.log(`%c[REQ] ${method} ${endpoint}`, 'color: #42b9eb; font-weight: bold;', body || '(no body)');

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    if (response.status === 401 || response.status === 403) {
        console.warn(`[AUTH] ${response.status} on ${endpoint}`);
        if (method === 'GET' && response.status === 403) {
             localStorage.removeItem(TOKEN_KEY);
             window.location.href = '#/login';
             throw new Error('Sessão expirada');
        }
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`%c[ERR] ${method} ${endpoint}`, 'color: #ef4444; font-weight: bold;', errorData);
        throw new Error(errorData.message || `Erro na API: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`%c[RES] ${method} ${endpoint}`, 'color: #10b981; font-weight: bold;', data);
    return data;
  } catch (error) {
    console.error(`[API EXCEPTION] (${method} ${endpoint}):`, error);
    throw error;
  }
}

// Helper to enrich data on client-side to match Legacy behavior
const enrichEntityData = async (entityName: string, data: any[]) => {
    // Helper to create maps for quick lookups
    const createMap = (items: any[], key: string, valueField: string) => 
        new Map(items.map((i: any) => [String(i[key]), i[valueField]]));

    if (entityName === 'Contrato') {
        const [pessoas, funcoes] = await Promise.all([api.fetchEntity('Pessoa'), api.fetchEntity('Funcao')]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const funcaoMap = createMap(funcoes, 'ID_FUNCAO', 'FUNCAO');
        return data.map(c => ({ ...c, NOME_PESSOA: pessoaMap.get(c.CPF) || c.CPF, NOME_FUNCAO: funcaoMap.get(c.ID_FUNCAO) || 'N/A' }));
    }
    
    if (entityName === 'Servidor') {
       const [pessoas, cargos] = await Promise.all([api.fetchEntity('Pessoa'), api.fetchEntity('Cargo')]);
       const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
       const cargoMap = createMap(cargos, 'ID_CARGO', 'NOME_CARGO');
       return data.map(s => ({ ...s, NOME_PESSOA: pessoaMap.get(s.CPF) || s.CPF, NOME_CARGO: cargoMap.get(s.ID_CARGO) || s.ID_CARGO }));
    }

    if (entityName === 'Alocacao') {
        const [servidores, lotacoes, funcoes, pessoas] = await Promise.all([
            api.fetchEntity('Servidor'), api.fetchEntity('Lotacao'), api.fetchEntity('Funcao'), api.fetchEntity('Pessoa')
        ]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const servidorCpfMap = createMap(servidores, 'MATRICULA', 'CPF');
        const lotacaoMap = createMap(lotacoes, 'ID_LOTACAO', 'LOTACAO');
        const funcaoMap = createMap(funcoes, 'ID_FUNCAO', 'FUNCAO');

        return data.map(a => ({
            ...a,
            NOME_PESSOA: pessoaMap.get(servidorCpfMap.get(a.MATRICULA)) || `Mat: ${a.MATRICULA}`,
            NOME_LOTACAO: lotacaoMap.get(a.ID_LOTACAO) || a.ID_LOTACAO,
            NOME_FUNCAO: funcaoMap.get(a.ID_FUNCAO) || 'N/A'
        }));
    }

    if (entityName === 'Protocolo') {
        const pessoas = await api.fetchEntity('Pessoa');
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        return data.map(p => ({
            ...p,
            NOME_PESSOA: pessoaMap.get(p.CPF) || p.CPF,
            DETALHE_VINCULO: p.ID_CONTRATO ? `Contrato: ${p.ID_CONTRATO}` : (p.MATRICULA ? `Matrícula: ${p.MATRICULA}` : 'N/A')
        }));
    }

    if (entityName === 'Nomeacao') {
        const [servidores, pessoas, cargosCom] = await Promise.all([
            api.fetchEntity('Servidor'), api.fetchEntity('Pessoa'), api.fetchEntity('CargoComissionado')
        ]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const servidorCpfMap = createMap(servidores, 'MATRICULA', 'CPF');
        const cargoMap = createMap(cargosCom, 'ID_CARGO_COMISSIONADO', 'NOME');

        return data.map(n => ({
            ...n,
            NOME_SERVIDOR: pessoaMap.get(servidorCpfMap.get(n.MATRICULA)) || n.MATRICULA,
            NOME_CARGO_COMISSIONADO: cargoMap.get(n.ID_CARGO_COMISSIONADO) || n.ID_CARGO_COMISSIONADO
        }));
    }

    if (entityName === 'Turma') {
        const capacitacoes = await api.fetchEntity('Capacitacao');
        const capMap = createMap(capacitacoes, 'ID_CAPACITACAO', 'ATIVIDADE_DE_CAPACITACAO');
        return data.map(t => ({ ...t, NOME_CAPACITACAO: capMap.get(t.ID_CAPACITACAO) || t.ID_CAPACITACAO }));
    }

    if (entityName === 'Chamada' || entityName === 'Visita' || entityName === 'SolicitacaoPesquisa' || entityName === 'Atendimento') {
        const [pessoas, turmas] = await Promise.all([api.fetchEntity('Pessoa'), entityName === 'Chamada' ? api.fetchEntity('Turma') : []]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const turmaMap = entityName === 'Chamada' ? createMap(turmas, 'ID_TURMA', 'NOME_TURMA') : new Map();
        
        return data.map(item => ({
            ...item,
            NOME_PESSOA: pessoaMap.get(item.CPF) || item.CPF,
            ...(entityName === 'Chamada' ? { NOME_TURMA: turmaMap.get(item.ID_TURMA) || item.ID_TURMA } : {})
        }));
    }

    if (entityName === 'Encontro') {
        const turmas = await api.fetchEntity('Turma');
        const turmaMap = createMap(turmas, 'ID_TURMA', 'NOME_TURMA');
        return data.map(e => ({ ...e, NOME_TURMA: turmaMap.get(e.ID_TURMA) || e.ID_TURMA }));
    }

    if (entityName === 'Vaga' || entityName === 'Exercicio') {
        const [lotacoes, cargos, editais, exercicios] = await Promise.all([
            api.fetchEntity('Lotacao'), api.fetchEntity('Cargo'), api.fetchEntity('Edital'), api.fetchEntity('Exercicio')
        ]);
        const lotacaoMap = createMap(lotacoes, 'ID_LOTACAO', 'LOTACAO');
        const cargoMap = createMap(cargos, 'ID_CARGO', 'NOME_CARGO');
        const editalMap = createMap(editais, 'ID_EDITAL', 'EDITAL');
        
        const exercicioMap = new Map();
        exercicios.forEach((ex: any) => {
            exercicioMap.set(String(ex.ID_VAGA), lotacaoMap.get(ex.ID_LOTACAO));
        });

        if (entityName === 'Exercicio') {
            // Internal fetch needed for Vaga -> Cargo mapping
            const vagasRaw = await request('/Vaga'); 
            const vagaCargoMap = new Map(vagasRaw.map((v:any) => [v.ID_VAGA, v.ID_CARGO]));
            
            return data.map(e => ({
                ...e,
                NOME_LOTACAO_EXERCICIO: lotacaoMap.get(e.ID_LOTACAO) || 'N/A',
                NOME_CARGO_VAGA: cargoMap.get(String(vagaCargoMap.get(e.ID_VAGA))) || 'N/A'
            }));
        }

        return data.map(v => ({
            ...v,
            LOTACAO_NOME: lotacaoMap.get(v.ID_LOTACAO) || 'N/A',
            CARGO_NOME: cargoMap.get(v.ID_CARGO) || 'N/A',
            EDITAL_NOME: editalMap.get(v.ID_EDITAL) || 'N/A',
            NOME_LOTACAO_EXERCICIO: exercicioMap.get(v.ID_VAGA) || null
        }));
    }

    return data;
};

export const api = {
  login: async (usuario: string, senha: string) => {
    return request('/auth/login', 'POST', { usuario, senha });
  },

  fetchSchemaMeta: async () => {
      return request('/meta/schema');
  },

  // Fetch simples direto pelo nome da tabela
  fetchEntity: async (entityName: string, forceRefresh = false): Promise<any[]> => {
    const endpoint = `/${entityName}`;
    
    const now = Date.now();
    if (!forceRefresh && cache[endpoint] && (now - cache[endpoint].timestamp < CACHE_TTL)) {
        console.log(`%c[CACHE] Hit for ${endpoint}`, 'color: #f59e0b');
        return Promise.resolve(cache[endpoint].data);
    }

    if (inflightRequests[endpoint] && !forceRefresh) {
        console.log(`%c[DEDUP] Joining inflight request for ${endpoint}`, 'color: #f59e0b');
        return inflightRequests[endpoint] as Promise<any[]>;
    }

    const promise = request(endpoint)
        .then(data => enrichEntityData(entityName, data))
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
    const endpoint = `/${entityName}`;
    const res = await request(endpoint, 'POST', data);
    if (res.success) delete cache[endpoint];
    return res;
  },

  updateRecord: async (entityName: string, pkField: string, pkValue: string, data: RecordData) => {
    const endpoint = `/${entityName}`;
    const res = await request(`${endpoint}/${pkValue}`, 'PUT', data);
    if (res.success) delete cache[endpoint];
    return res;
  },

  deleteRecord: async (entityName: string, pkField: string, pkValue: string) => {
    const endpoint = `/${entityName}`;
    const res = await request(`${endpoint}/${pkValue}`, 'DELETE');
    if (res.success) delete cache[endpoint];
    return res;
  },

  // User Management
  getUsers: async () => { return request('/Usuarios'); },
  deleteUser: async (usuarioId: string) => { return request(`/Usuarios/${usuarioId}`, 'DELETE'); },

  toggleVagaBloqueada: async (idVaga: string) => {
    const res = await request(`/Vaga/${idVaga}/toggle-lock`, 'POST');
    delete cache[`/Vaga`];
    return res;
  },

  setExercicio: async (idVaga: string, idLotacao: string) => {
      const res = await request('/Exercicio', 'POST', { 
          ID_EXERCICIO: 'EXE' + Date.now(), 
          ID_VAGA: idVaga, 
          ID_LOTACAO: idLotacao 
      });
      
      delete cache[`/Exercicio`];
      delete cache[`/Vaga`];
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
    const data = await request(`/Atendimento`);
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
          await request('/servidores/inativar', 'POST', data);
      } else if (atd.TIPO_DE_ACAO === 'EDITAR' && atd.ENTIDADE_ALVO === 'Contrato') {
          await request('/contratos/arquivar', 'POST', { CPF: data.CPF, MOTIVO: atd.TIPO_PEDIDO });
          if (!data.ID_CONTRATO) data.ID_CONTRATO = 'CTT' + Date.now();
          await api.createRecord('Contrato', data);
      } else if (atd.TIPO_DE_ACAO === 'CRIAR') {
          await api.createRecord(atd.ENTIDADE_ALVO, data);
      } else {
          if (atd.TIPO_DE_ACAO === 'EDITAR' && data.ID_ALOCACAO) {
               await api.createRecord('Alocacao', data);
          } else {
               // Update genérico assumindo que a tabela está correta em ENTIDADE_ALVO
               const config = ENTITY_CONFIGS[atd.ENTIDADE_ALVO];
               if (config && data[config.pk]) {
                   await api.updateRecord(atd.ENTIDADE_ALVO, config.pk, data[config.pk], data);
               }
          }
      }
      
      // Atualizar atendimento
      await api.updateRecord('Atendimento', 'ID_ATENDIMENTO', idAtendimento, { STATUS_AGENDAMENTO: 'Concluído' });
      
      return { success: true, message: 'Ação executada com sucesso.' };
  },
  
  getReportData: async (reportName: string): Promise<ReportData> => {
    if (reportName === 'painelVagas') {
        const vagas = await api.fetchEntity('Vaga');
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
            api.fetchEntity('Contrato'), api.fetchEntity('Servidor'), 
            api.fetchEntity('Alocacao'), api.fetchEntity('Vaga')
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
            api.fetchEntity('Contrato'), api.fetchEntity('Vaga'), api.fetchEntity('Cargo')
        ]);
        
        const cargoSalarioMap = new Map(cargos.map((c:any) => [c.ID_CARGO, parseFloat(c.SALARIO || 0)]));
        const vagaMap = new Map<string, { lotacao: string, cargo: string }>(vagas.map((v:any) => [v.ID_VAGA, { lotacao: v.LOTACAO_NOME, cargo: v.ID_CARGO }]));
        
        const custoPorLotacao: any = {};
        contratos.forEach((c: any) => {
            const v = vagaMap.get(c.ID_VAGA);
            if (v) {
                const sal = cargoSalarioMap.get(v.cargo) || 0;
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
        const contratos = await api.fetchEntity('Contrato');
        const linhas = contratos.map((c: any) => [
            c.NOME_PESSOA, c.CPF, c.ID_CONTRATO, c.NOME_FUNCAO, new Date(c.DATA_DO_CONTRATO).toLocaleDateString('pt-BR')
        ]);
        return { colunas: ['Nome', 'CPF', 'Contrato', 'Função', 'Início'], linhas };
    }

    if (reportName === 'quadroLotacaoServidores') {
        const alocacoes = await api.fetchEntity('Alocacao');
        const linhas = alocacoes.map((a: any) => [
            a.NOME_LOTACAO, a.NOME_PESSOA, a.MATRICULA, a.NOME_FUNCAO
        ]);
        return { colunas: ['Lotação', 'Servidor', 'Matrícula', 'Função'], linhas };
    }

    if (reportName === 'perfilDemografico') {
        const pessoas = await api.fetchEntity('Pessoa');
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
        const chamadas = await api.fetchEntity('Chamada');
        const linhas = chamadas.map((c: any) => [
            c.NOME_TURMA, c.NOME_PESSOA, c.PRESENCA, new Date(c.DATA_ENCONTRO || Date.now()).toLocaleDateString()
        ]);
        return { colunas: ['Turma', 'Participante', 'Presença', 'Data'], linhas };
    }

    if (reportName === 'atividadeUsuarios') {
        const logs = await api.fetchEntity('Auditoria');
        const linhas = logs.map((l: any) => [
            new Date(l.DATA_HORA).toLocaleString(), l.USUARIO, l.ACAO, l.TABELA_AFETADA, l.ID_REGISTRO_AFETADO
        ]);
        return { colunas: ['Data/Hora', 'Usuário', 'Ação', 'Tabela', 'ID Registro'], linhas };
    }

    return {};
  }
};
