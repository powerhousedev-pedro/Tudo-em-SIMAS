
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

// Helper to enrich data on client-side to match Legacy behavior
const enrichEntityData = async (entityName: string, data: any[]) => {
    // Helper to create maps for quick lookups
    const createMap = (items: any[], key: string, valueField: string) => 
        new Map(items.map((i: any) => [String(i[key]), i[valueField]]));

    // Parallel fetch for dependencies based on entity needs
    if (entityName === 'CONTRATO') {
        const [pessoas, funcoes] = await Promise.all([api.fetchEntity('PESSOA'), api.fetchEntity('FUNÇÃO')]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const funcaoMap = createMap(funcoes, 'ID_FUNCAO', 'FUNCAO');
        return data.map(c => ({ ...c, NOME_PESSOA: pessoaMap.get(c.CPF) || c.CPF, NOME_FUNCAO: funcaoMap.get(c.ID_FUNCAO) || 'N/A' }));
    }
    
    if (entityName === 'SERVIDOR') {
       const [pessoas, cargos] = await Promise.all([api.fetchEntity('PESSOA'), api.fetchEntity('CARGOS')]);
       const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
       const cargoMap = createMap(cargos, 'ID_CARGO', 'NOME_CARGO');
       return data.map(s => ({ ...s, NOME_PESSOA: pessoaMap.get(s.CPF) || s.CPF, NOME_CARGO: cargoMap.get(s.ID_CARGO) || s.ID_CARGO }));
    }

    if (entityName === 'ALOCACAO') {
        const [servidores, lotacoes, funcoes, pessoas] = await Promise.all([
            api.fetchEntity('SERVIDOR'), api.fetchEntity('LOTAÇÕES'), api.fetchEntity('FUNÇÃO'), api.fetchEntity('PESSOA')
        ]);
        // Servidor -> Pessoa Name mapping
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

    if (entityName === 'PROTOCOLO') {
        const pessoas = await api.fetchEntity('PESSOA');
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        return data.map(p => ({
            ...p,
            NOME_PESSOA: pessoaMap.get(p.CPF) || p.CPF,
            DETALHE_VINCULO: p.ID_CONTRATO ? `Contrato: ${p.ID_CONTRATO}` : (p.MATRICULA ? `Matrícula: ${p.MATRICULA}` : 'N/A')
        }));
    }

    if (entityName === 'NOMEAÇÃO') {
        const [servidores, pessoas, cargosCom] = await Promise.all([
            api.fetchEntity('SERVIDOR'), api.fetchEntity('PESSOA'), api.fetchEntity('CARGO COMISSIONADO')
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

    if (entityName === 'TURMAS') {
        const capacitacoes = await api.fetchEntity('CAPACITAÇÃO');
        const capMap = createMap(capacitacoes, 'ID_CAPACITACAO', 'ATIVIDADE_DE_CAPACITACAO');
        return data.map(t => ({ ...t, NOME_CAPACITACAO: capMap.get(t.ID_CAPACITACAO) || t.ID_CAPACITACAO }));
    }

    if (entityName === 'CHAMADA' || entityName === 'VISITAS' || entityName === 'SOLICITAÇÃO DE PESQUISA' || entityName === 'ATENDIMENTO') {
        const [pessoas, turmas] = await Promise.all([api.fetchEntity('PESSOA'), entityName === 'CHAMADA' ? api.fetchEntity('TURMAS') : []]);
        const pessoaMap = createMap(pessoas, 'CPF', 'NOME');
        const turmaMap = entityName === 'CHAMADA' ? createMap(turmas, 'ID_TURMA', 'NOME_TURMA') : new Map();
        
        return data.map(item => ({
            ...item,
            NOME_PESSOA: pessoaMap.get(item.CPF) || item.CPF,
            ...(entityName === 'CHAMADA' ? { NOME_TURMA: turmaMap.get(item.ID_TURMA) || item.ID_TURMA } : {})
        }));
    }

    if (entityName === 'ENCONTRO') {
        const turmas = await api.fetchEntity('TURMAS');
        const turmaMap = createMap(turmas, 'ID_TURMA', 'NOME_TURMA');
        return data.map(e => ({ ...e, NOME_TURMA: turmaMap.get(e.ID_TURMA) || e.ID_TURMA }));
    }

    if (entityName === 'VAGAS' || entityName === 'EXERCÍCIO') {
        const [lotacoes, cargos, editais, exercicios] = await Promise.all([
            api.fetchEntity('LOTAÇÕES'), api.fetchEntity('CARGOS'), api.fetchEntity('EDITAIS'), api.fetchEntity('EXERCÍCIO')
        ]);
        const lotacaoMap = createMap(lotacoes, 'ID_LOTACAO', 'LOTACAO');
        const cargoMap = createMap(cargos, 'ID_CARGO', 'NOME_CARGO');
        const editalMap = createMap(editais, 'ID_EDITAL', 'EDITAL');
        
        // Map Vaga -> Lotacao Exercicio Name
        const exercicioMap = new Map();
        exercicios.forEach((ex: any) => {
            exercicioMap.set(String(ex.ID_VAGA), lotacaoMap.get(ex.ID_LOTACAO));
        });

        // If enriching Exercicio, we need Vaga info first
        if (entityName === 'EXERCÍCIO') {
            // Need to fetch Vagas internally to map Cargo
            const vagasRaw = await request('/vagas'); 
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

  fetchEntity: async (entityName: string) => {
    const rawData = await request(`/${entityName.toLowerCase().replace(/ /g, '-')}`);
    // Apply client-side enrichment to match legacy behavior
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
  
  // --- REPORTS LOGIC (Client-Side Aggregation mimicking Legacy behavior) ---
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
        // Filters logic is handled in UI for React version
        return { panorama: vagas, quantitativo: quantitativo, filtrosDisponiveis: {} as any };
    }

    // 2. DASHBOARD PESSOAL
    if (reportName === 'dashboardPessoal') {
        const [contratos, servidores, alocacoes, vagas, lotacoes] = await Promise.all([
            api.fetchEntity('CONTRATO'), api.fetchEntity('SERVIDOR'), 
            api.fetchEntity('ALOCACAO'), api.fetchEntity('VAGAS'), api.fetchEntity('LOTAÇÕES')
        ]);
        
        // Calculate Vinculo Chart
        const vinculoCounts: any = { 'OSC': contratos.length };
        servidores.forEach((s: any) => {
            const v = s.VINCULO || 'Não especificado';
            vinculoCounts[v] = (vinculoCounts[v] || 0) + 1;
        });
        const graficoVinculo = Object.entries(vinculoCounts).map(([name, value]) => ({ name, value: Number(value) }));

        // Calculate Lotacao Chart
        const lotacaoCounts: any = {};
        alocacoes.forEach((a: any) => {
            lotacaoCounts[a.NOME_LOTACAO] = (lotacaoCounts[a.NOME_LOTACAO] || 0) + 1;
        });
        // Add contracts via Vagas
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
        } as any; // Casting for structure match
    }

    // 3. ANALISE CUSTOS
    if (reportName === 'analiseCustos') {
        const [contratos, vagas, cargos] = await Promise.all([
            api.fetchEntity('CONTRATO'), api.fetchEntity('VAGAS'), api.fetchEntity('CARGOS')
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
        // Simple client-side group could be added here if needed
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
        // Assuming API fetchEntity already enriched CHAMADA with Turma and Pessoa names
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
