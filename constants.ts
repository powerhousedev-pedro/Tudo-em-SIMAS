import { EntityConfig, DropdownOptions } from './types';
import { validation } from './utils/validation';

export const REPORT_PERMISSIONS: { [role: string]: string[] } = {
  'GPMP': ['painelVagas'],
  'GACP': ['painelVagas'],
  'GGT': [],
  'GDEP': [],
  'COORDENAÇÃO': [
    'painelVagas',
    'dashboardPessoal'
  ],
  'GABINETE': [
    'painelVagas',
    'dashboardPessoal'
  ]
};

export const PERMISSOES_POR_PAPEL: { [role: string]: string[] } = {
  'COORDENAÇÃO': ['TODAS'],
  'GGT': ['Pessoa', 'Servidor', 'Alocacao', 'Nomeacao', 'CargoComissionado', 'Protocolo', 'Lotacao', 'PostoTrabalho', 'Funcao', 'Inativo', 'Auditoria'],
  'GPMP': ['Pessoa', 'Contrato', 'Vaga', 'Edital', 'Cogestora', 'Exercicio', 'Protocolo', 'Substituto', 'Lotacao', 'Vinculacao', 'PostoTrabalho', 'Funcao', 'ContratoHistorico', 'Auditoria'],
  'GACP': ['Pessoa', 'Contrato', 'Vaga', 'Edital', 'Cogestora', 'Exercicio', 'Protocolo', 'Substituto', 'Lotacao', 'Vinculacao', 'PostoTrabalho', 'Funcao', 'ContratoHistorico', 'Auditoria'],
  'GDEP': ['Pessoa', 'Capacitacao', 'Turma', 'Encontro', 'Chamada', 'Visita', 'SolicitacaoPesquisa', 'Pesquisa', 'Lotacao', 'Auditoria'],
  'GABINETE': []
};

export const READ_ONLY_ENTITIES = [
  'ContratoHistorico', 
  'AlocacaoHistorico', 
  'Inativo', 
  'Auditoria'
];

// Keys MUST match server/src/tables.ts (PascalCase)
export const FK_MAPPING: { [field: string]: string } = {
    'CPF': 'Pessoa',
    'MATRICULA': 'Servidor',
    'ID_VAGA': 'Vaga',
    'ID_LOTACAO': 'Lotacao',
    'ID_POSTO_TRABALHO': 'PostoTrabalho',
    'ID_CONTRATO': 'Contrato',
    'ID_FUNCAO': 'Funcao',
    'ID_EDITAL': 'Edital',
    'ID_COGESTORA': 'Cogestora',
    'ID_TURMA': 'Turma',
    'ID_CAPACITACAO': 'Capacitacao',
    'ID_ENCONTRO': 'Encontro',
    'ID_SOLICITACAO': 'SolicitacaoPesquisa',
    'ID_CARGO_COMISSIONADO': 'CargoComissionado',
    'ID_ALOCACAO': 'Alocacao',
    'ID_EXERCICIO': 'Exercicio',
    'ID_SUBSTITUTO': 'Substituto'
};

export const FIELD_LABELS: Record<string, Record<string, string>> = {
  'Global': {
      'NOME': 'Nome Completo',
      'NOME_SOCIAL': 'Nome Social',
      'CPF': 'CPF',
      'MATRICULA': 'Matrícula',
      'TELEFONE': 'Telefone de Contato',
      'EMAIL': 'E-mail',
      'DATA_DE_NASCIMENTO': 'Data de Nascimento',
      'CEP': 'CEP (Código Postal)',
      'ENDERECO': 'Endereço (Rua/Logradouro)',
      'NUMERO': 'Número',
      'COMPLEMENTO': 'Complemento',
      'BAIRRO': 'Bairro',
      'CIDADE': 'Cidade',
      'ESTADO': 'Estado',
      'PAIS': 'País',
      'NOME_CONTATO': 'Nome do Contato Principal',
      'ESCOLARIDADE': 'Nível de Escolaridade',
      'FORMACAO': 'Formação Acadêmica',
      'SEXO': 'Gênero',
      'USUARIO': 'Usuário Responsável',
      'DATA_HORA': 'Data e Hora',
      'ACAO': 'Ação Realizada',
      'AFRODESCENDENTE': 'Afrodescendente',
      'PCD': 'PCD (Pessoa com Deficiência)',
      'USUARIO_ASSISTENCIA': 'Usuário da Assistência Social'
  },
  'Contrato': {
      'ID_CONTRATO': 'Código do Contrato (Atual)',
      'DATA_DO_CONTRATO': 'Data de Início (Contrato Atual)',
      'ID_FUNCAO': 'Função Contratada',
      'ID_VAGA': 'Vaga Vinculada',
  },
  'ContratoHistorico': {
      'ID_CONTRATO': 'Código do Contrato (Arquivo)',
      'DATA_DO_CONTRATO': 'Início do Contrato Arquivado',
      'DATA_ARQUIVAMENTO': 'Data de Encerramento',
      'MOTIVO_ARQUIVAMENTO': 'Motivo do Encerramento',
      'ID_FUNCAO': 'Função Exercida (Histórico)'
  },
  'Alocacao': {
      'DATA_INICIO': 'Início na Lotação (Atual)',
      'ID_LOTACAO': 'Lotação Atual',
      'ID_FUNCAO': 'Função Desempenhada'
  },
  'AlocacaoHistorico': {
      'DATA_INICIO': 'Início na Lotação (Antiga)',
      'DATA_FIM': 'Saída da Lotação',
      'MOTIVO_MUDANCA': 'Motivo da Mudança',
      'ID_LOTACAO': 'Lotação Anterior'
  },
  'Servidor': {
      'DATA_MATRICULA': 'Data de Admissão',
      'VINCULO': 'Tipo de Vínculo',
      'PREFIXO_MATRICULA': 'Prefixo',
      'ID_FUNCAO': 'Função Efetiva'
  },
  'Vaga': {
      'STATUS_VAGA': 'Situação da Vaga',
      'BLOQUEADA': 'Está Bloqueada?',
      'ID_LOTACAO': 'Lotação da Vaga',
      'ID_POSTO_TRABALHO': 'Posto de Trabalho'
  },
  'Inativo': {
      'DATA_INATIVACAO': 'Data da Inativação',
      'MOTIVO': 'Motivo da Inativação',
      'PROCESSO': 'Processo Administrativo'
  },
  'Vinculacao': {
      'NOME': 'Nome da Vinculação'
  },
  'Lotacao': {
      'LOTACAO': 'Nome da Lotação',
      'TIPO_DA_LOTACAO': 'Tipo de Unidade',
      'COMPLEXIDADE': 'Nível de Complexidade'
  },
  'Substituto': {
      'ID_SUBSTITUTO': 'Código do Substituto',
      'DATA_ENTRADA': 'Data de Entrada',
      'DATA_SAIDA': 'Data de Saída'
  }
};

export const ENTITY_CONFIGS: { [key: string]: EntityConfig } = {
  // --- COMPARTILHADO / GERAL ---
  'Pessoa': {
    title: 'Pessoas',
    pk: 'CPF',
    manualPk: true, // CPF é inserido manualmente
    filterBy: 'NOME',
    cardDisplay: (item: any) => {
        const isGravissimo = item.notas?.some((n: any) => n.GRAVISSIMO);
        const age = validation.calculateAge(item.DATA_DE_NASCIMENTO);
        const ageText = age !== null ? ` | ${age} anos` : '';
        const formacaoText = item.FORMACAO ? ` | ${item.FORMACAO}` : '';
        const idText = `CPF: ${validation.formatCPF(item.CPF)}`;
        const enderecoText = (item.ENDERECO || item.CEP || item.CIDADE) ? `\nEndereço: ${validation.formatAddress(item)}` : '';
        return {
            title: validation.capitalizeName(item.NOME_SOCIAL || item.NOME),
            subtitle: `${idText}${ageText}`,
            details: `Escolaridade: ${item.ESCOLARIDADE || 'N/A'}${formacaoText}${enderecoText}`,
            
            hasGraveIssue: isGravissimo
        };
    }
  },

  
  // --- GPMP (Gestão de Pessoas e Contratos) ---
  'Contrato': {
    title: 'Contratos',
    pk: 'ID_CONTRATO',
    pkPrefix: 'CTT',
    cardDisplay: (item: any) => {
      const isGravissimo = item.pessoa?.notas?.some((n: any) => n.GRAVISSIMO);
      return {
        title: `Contrato: ${item.ID_CONTRATO}`,
        subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
        details: `Função: ${item.NOME_FUNCAO || 'N/A'}\nInício: ${validation.formatDate(item.DATA_DO_CONTRATO)}`,
        hasGraveIssue: isGravissimo
      };
    }
  },
  'Substituto': {
    title: 'Substitutos',
    pk: 'ID_SUBSTITUTO',
    pkPrefix: 'SUB',
    cardDisplay: (item: any) => ({
      title: `Substituto: ${item.ID_SUBSTITUTO}`,
      subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
      details: `Vaga: ${item.ID_VAGA}\nEntrada: ${validation.formatDate(item.DATA_ENTRADA)}`
    })
  },
  'Vaga': {
    title: 'Vagas',
    pk: 'ID_VAGA',
    pkPrefix: 'VAG',
    filterBy: 'LOTACAO_NOME',
    cardDisplay: (item: any) => {
        const isGravissimo = item.contrato?.pessoa?.notas?.some((n: any) => n.GRAVISSIMO);
        let details = `Edital: ${item.EDITAL_NOME || 'N/A'}`;
        if (item.STATUS_VAGA === 'Reservada') {
            details += `\nReservada para: ${validation.capitalizeName(item.RESERVADA_PARA_NOME || item.RESERVADA_PARA_CPF || '...')}`;
        }
        return {
            title: item.POSTO_NOME || 'Vaga',
            subtitle: item.LOTACAO_NOME || 'Lotação N/A',
            details: details,
            status: item.STATUS_VAGA,
            hasGraveIssue: isGravissimo
        };
    }
  },
  'Edital': {
      title: 'Editais',
      pk: 'ID_EDITAL',
      pkPrefix: 'EDT',
      cardDisplay: (item: any) => ({
          title: item.EDITAL,
          subtitle: `Proc: ${item.PROCESSO}`,
          details: `Vigência: ${validation.formatDate(item.INICIO)} - ${validation.formatDate(item.TERMINO)}\nCogestora: ${item.NOME_COGESTORA || 'N/A'}`
      })
  },
  'Cogestora': {
      title: 'Cogestoras',
      pk: 'ID_COGESTORA',
      pkPrefix: 'COG',
      cardDisplay: (item: any) => ({
          title: item.NOME,
          subtitle: `ID: ${item.ID_COGESTORA}`,
          details: 'Entidade Cogestora Registrada'
      })
  },
  'Exercicio': { 
      title: 'Exercícios', 
      pk: 'ID_EXERCICIO',
      pkPrefix: 'EXE',
      cardDisplay: (item: any) => ({
        title: item.NOME_POSTO_VAGA || 'Posto da Vaga',
        subtitle: `Vaga ID: ${item.ID_VAGA}`,
        details: `Lotação de Exercício: ${item.NOME_LOTACAO_EXERCICIO || item.ID_LOTACAO}`
      })
  },

  // --- GGT (Gestão de Gente e Trabalho - Servidores) ---
  'Servidor': {
    title: 'Servidores',
    pk: 'MATRICULA',
    manualPk: true,
    filterBy: 'VINCULO',
    cardDisplay: (item: any) => {
      const isGravissimo = item.pessoa?.notas?.some((n: any) => n.GRAVISSIMO);
      return {
        title: validation.capitalizeName(item.NOME_PESSOA || 'Servidor'),
        subtitle: `Matrícula: ${item.PREFIXO_MATRICULA ? item.PREFIXO_MATRICULA + '-' : ''}${item.MATRICULA}`,
        details: `${item.VINCULO}\nFunção: ${item.NOME_FUNCAO || item.ID_FUNCAO}`,
        hasGraveIssue: isGravissimo
      };
    }
  },
  'Alocacao': {
    title: 'Alocações',
    pk: 'ID_ALOCACAO',
    pkPrefix: 'ALC',
    cardDisplay: (item: any) => {
        const isGravissimo = item.servidor?.pessoa?.notas?.some((n: any) => n.GRAVISSIMO);
        return {
            title: validation.capitalizeName(item.NOME_PESSOA),
            subtitle: item.NOME_LOTACAO,
            details: `Função: ${item.NOME_FUNCAO || 'N/A'}\nInício: ${validation.formatDate(item.DATA_INICIO)}`,
            hasGraveIssue: isGravissimo
        };
    }
  },
  'Nomeacao': { 
    title: 'Nomeações', 
    pk: 'ID_NOMEACAO', 
    pkPrefix: 'NOM', 
    cardDisplay: (item: any) => ({
        title: validation.capitalizeName(item.NOME_SERVIDOR),
        subtitle: item.NOME_CARGO_COMISSIONADO || item.ID_CARGO_COMISSIONADO,
        details: `Data Nomeação: ${validation.formatDate(item.DATA_DA_NOMEACAO)}`
    }) 
  },
  'CargoComissionado': { 
    title: 'Cargos Comissionados', 
    pk: 'ID_CARGO_COMISSIONADO', 
    pkPrefix: 'CCM', 
    cardDisplay: (item: any) => ({
        title: item.NOME,
        subtitle: item.UNIDADE,
        details: `Tipo: ${item.TIPO_DE_CARGO}`
    }) 
  },

  // --- GDEP (Gestão de Desenvolvimento - Capacitação e Pesquisa) ---
  'Capacitacao': { 
    title: 'Capacitações', 
    pk: 'ID_CAPACITACAO', 
    pkPrefix: 'CAP', 
    cardDisplay: (item: any) => ({
        title: item.ATIVIDADE_DE_CAPACITACAO,
        subtitle: item.MODALIDADE,
        details: `${item.FORMATO} | ${item.TIPO_CAPACITACAO}`
    }) 
  },
  'Turma': { 
    title: 'Turmas', 
    pk: 'ID_TURMA', 
    pkPrefix: 'TUR', 
    cardDisplay: (item: any) => ({
        title: item.NOME_TURMA,
        subtitle: item.NOME_CAPACITACAO || `Capacitação ID: ${item.ID_CAPACITACAO}`,
        details: `ID Turma: ${item.ID_TURMA}`
    }) 
  },
  'Encontro': { 
    title: 'Encontros', 
    pk: 'ID_ENCONTRO', 
    pkPrefix: 'ENC', 
    cardDisplay: (item: any) => ({
        title: item.NOME_TURMA || `Turma ID: ${item.ID_TURMA}`,
        subtitle: `Encontro: ${validation.formatDate(item.DATA_DE_ENCONTRO)}`,
        details: `ID Encontro: ${item.ID_ENCONTRO}`
    }) 
  },
  'Chamada': { 
    title: 'Chamadas (Presença)', 
    pk: 'ID_CHAMADA', 
    pkPrefix: 'CHM', 
    cardDisplay: (item: any) => ({
        title: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
        subtitle: item.NOME_TURMA || item.ID_TURMA,
        status: item.PRESENCA,
        details: `Data: ${validation.formatDate(item.DATA_ENCONTRO)}`
    }) 
  },
  'Visita': { 
    title: 'Visitas Técnicas', 
    pk: 'ID_VISITA', 
    pkPrefix: 'VIS', 
    cardDisplay: (item: any) => ({
        title: item.LOCAL,
        subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
        details: `${validation.formatDate(item.DATA_VISITA)}\n${item.MODALIDADE_VISITA}`
    }) 
  },
  'SolicitacaoPesquisa': { 
    title: 'Solic. Pesquisa', 
    pk: 'ID_SOLICITACAO', 
    pkPrefix: 'SOL', 
    cardDisplay: (item: any) => ({
        title: item.OBJETO_DE_ESTUDO,
        subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
        details: `Ano: ${item.ANO_ENTRADA} | Autorizado: ${item.AUTORIZO}`
    }) 
  },
  'Pesquisa': { 
    title: 'Pesquisas (Andamento)', 
    pk: 'ID_PESQUISA', 
    pkPrefix: 'PSQ', 
    cardDisplay: (item: any) => ({
        title: item.OBJETO_ESTUDO || `Solicitação: ${item.ID_SOLICITACAO}`,
        subtitle: `Fim Previsto: ${validation.formatDate(item.PREV_DATA_FIM)}`,
        details: item.MATERIAL_PENDENTE === 'Sim' ? 'Pendência de Material' : 'Material Regular'
    }) 
  },

  // --- Tabelas de Apoio / Cross-Function ---
  'Protocolo': {
      title: 'Protocolos',
      pk: 'ID_PROTOCOLO',
      pkPrefix: 'PRT',
      cardDisplay: (item: any) => ({
          title: item.TIPO_DE_PROTOCOLO,
          subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
          details: `${item.DETALHE_VINCULO || 'Vínculo N/A'}\nInício: ${validation.formatDate(item.INICIO_PRAZO)}`
      })
  },
  'Vinculacao': {
    title: 'Vinculações',
    pk: 'ID_VINCULACAO',
    pkPrefix: 'VNC',
    cardDisplay: (item: any) => ({
      title: item.NOME,
      subtitle: `Vinculação: ${item.ID_VINCULACAO}`,
      details: ''
    })
  },
  'Lotacao': {
    title: 'Lotações',
    pk: 'ID_LOTACAO',
    pkPrefix: 'LOT',
    filterBy: 'COMPLEXIDADE',
    cardDisplay: (item: any) => ({
      title: item.LOTACAO,
      subtitle: item.BAIRRO ? `Bairro: ${item.BAIRRO}` : 'Bairro não informado',
      details: `Vinculação: ${item.vinculacao?.NOME || item.ID_VINCULACAO || 'N/A'} - Complexidade: ${item.COMPLEXIDADE || 'N/A'}`
    })
  },
  'PostoTrabalho': {
    title: 'Postos de Trabalho',
    pk: 'ID_POSTO_TRABALHO',
    pkPrefix: 'PST',
    filterBy: 'ESCOLARIDADE',
    cardDisplay: (item: any) => ({
      title: item.NOME_POSTO,
      subtitle: item.ESCOLARIDADE,
      details: item.SALARIO ? `Salário: ${validation.formatCurrency(item.SALARIO)}` : 'Salário não informado'
    })
  },
  'Funcao': {
      title: 'Funções',
      pk: 'ID_FUNCAO',
      pkPrefix: 'FUN',
      cardDisplay: (item: any) => ({
          title: item.FUNCAO,
          subtitle: item.CBO ? `CBO: ${item.CBO}` : 'Sem CBO'
      })
  },

  // --- HISTORICO E ARQUIVO (Apenas Consulta) ---
  'ContratoHistorico': {
      title: 'Histórico de Contratos',
      pk: 'ID_CONTRATO',
      cardDisplay: (item: any) => ({ 
          title: `Contrato Antigo: ${item.ID_CONTRATO}`, 
          subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
          details: `Arquivado em: ${validation.formatDate(item.DATA_ARQUIVAMENTO)}\nMotivo: ${item.MOTIVO_ARQUIVAMENTO || 'N/A'}`
      })
  },
  'AlocacaoHistorico': {
      title: 'Histórico de Alocações',
      pk: 'ID_ALOCACAO',
      cardDisplay: (item: any) => ({ 
          title: `Alocação Antiga: ${item.ID_ALOCACAO}`, 
          subtitle: `Matrícula: ${item.MATRICULA}`,
          details: `Arquivado em: ${validation.formatDate(item.DATA_ARQUIVAMENTO)}`
      })
  },
  'Inativo': {
      title: 'Servidores Inativos',
      pk: 'MATRICULA',
      cardDisplay: (item: any) => ({ 
          title: validation.capitalizeName(item.NOME || `Matrícula: ${item.MATRICULA}`), 
          subtitle: item.POSTO || 'Posto N/A',
          details: `Inativado em: ${validation.formatDate(item.DATA_INATIVACAO)}\nMotivo: ${item.MOTIVO_INATIVACAO}`
      })
  },
  'Auditoria': {
      title: 'Auditoria',
      pk: 'ID_LOG',
      cardDisplay: (item: any) => ({
          title: item.ACAO,
          subtitle: item.TABELA_AFETADA,
          details: `Usuário: ${item.USUARIO}`
      })
  }
};

export const DATA_MODEL: { [key: string]: string[] } = {
  "Pessoa": ["CPF", "NOME", "NOME_SOCIAL", "SEXO", "DATA_DE_NASCIMENTO", "EMAIL", "TELEFONE", "ESCOLARIDADE", "FORMACAO", "PAIS", "ESTADO", "CIDADE", "CEP", "ENDERECO", "NUMERO", "COMPLEMENTO", "BAIRRO", "AFRODESCENDENTE", "PCD", "USUARIO_ASSISTENCIA"],
  "Servidor": ["MATRICULA", "PREFIXO_MATRICULA", "CPF", "ID_FUNCAO", "DATA_MATRICULA", "VINCULO"],
  "Contrato": ["ID_CONTRATO", "ID_VAGA", "CPF", "DATA_DO_CONTRATO", "ID_FUNCAO"],
  "Vaga": ["ID_VAGA", "ID_LOTACAO", "ID_EDITAL", "ID_POSTO_TRABALHO", "BLOQUEADA"],
  "Vinculacao": ["ID_VINCULACAO", "NOME", "NOME_CONTATO", "EMAIL", "TELEFONE", "PAIS", "ESTADO", "CIDADE", "CEP", "ENDERECO", "NUMERO", "COMPLEMENTO", "BAIRRO"],
  "Lotacao": ["ID_LOTACAO", "LOTACAO", "ID_VINCULACAO", "TIPO_DA_LOTACAO", "BAIRRO", "COMPLEXIDADE"],
  "PostoTrabalho": ["ID_POSTO_TRABALHO", "NOME_POSTO", "ESCOLARIDADE", "SALARIO"],
  "Alocacao": ["ID_ALOCACAO", "MATRICULA", "ID_LOTACAO", "ID_FUNCAO", "DATA_INICIO"],
  "Funcao": ["ID_FUNCAO", "FUNCAO", "CBO"],
  "Edital": ["ID_EDITAL", "PROCESSO", "EDITAL", "NUMERO", "ID_COGESTORA", "INICIO", "TERMINO"],
  "Cogestora": ["ID_COGESTORA", "NOME", "NOME_CONTATO", "EMAIL", "TELEFONE", "PAIS", "ESTADO", "CIDADE", "CEP", "ENDERECO", "NUMERO", "COMPLEMENTO", "BAIRRO"],
  "Protocolo": ["ID_PROTOCOLO", "CPF", "TIPO_DE_PROTOCOLO", "INICIO_PRAZO", "TERMINO_PRAZO"],
  // GDEP
  "Capacitacao": ["ID_CAPACITACAO", "ATIVIDADE_DE_CAPACITACAO", "PERCURSO_FORMATIVO", "TIPO_CAPACITACAO", "FORMATO", "MODALIDADE", "TEMATICA_CENTRAL"],
  "Turma": ["ID_TURMA", "NOME_TURMA", "ID_CAPACITACAO"],
  "Encontro": ["ID_ENCONTRO", "ID_TURMA", "DATA_DE_ENCONTRO"],
  "Chamada": ["ID_CHAMADA", "CPF", "ID_TURMA", "ID_ENCONTRO", "PRESENCA"],
  "Visita": ["ID_VISITA", "CPF", "DATA_VISITA", "LOCAL", "CATEGORIA", "ZONA", "SETOR", "MODALIDADE_VISITA", "TIPO_DE_GRADUACAO"],
  "SolicitacaoPesquisa": ["ID_SOLICITACAO", "OBJETO_DE_ESTUDO", "CPF", "ANO_ENTRADA", "AUTORIZO", "DATA_DEF_INDEF", "DATA_INICIO"],
  "Pesquisa": ["ID_PESQUISA", "ID_SOLICITACAO", "PREV_DATA_FIM", "DATA_FIM", "ABANDONO", "MATERIAL_PENDENTE"],
  // GGT
  "Nomeacao": ["ID_NOMEACAO", "MATRICULA", "ID_CARGO_COMISSIONADO", "DATA_DA_NOMEACAO", "PAGINA_DO", "STATUS"],
  "CargoComissionado": ["ID_CARGO_COMISSIONADO", "NOME", "UNIDADE", "TIPO_DE_CARGO"],
  "Exercicio": ["ID_EXERCICIO", "ID_VAGA", "ID_LOTACAO"],
  "Substituto": ["ID_SUBSTITUTO", "CPF", "ID_VAGA", "DATA_ENTRADA", "DATA_SAIDA"],
  
  // HISTORICO
  "ContratoHistorico": ["ID_CONTRATO", "CPF", "DATA_DO_CONTRATO", "DATA_ARQUIVAMENTO", "MOTIVO_ARQUIVAMENTO", "ID_VAGA", "ID_FUNCAO"],
  "AlocacaoHistorico": ["ID_ALOCACAO", "MATRICULA", "ID_LOTACAO", "DATA_INICIO", "DATA_FIM", "MOTIVO_MUDANCA"],
  "Inativo": ["MATRICULA", "CPF", "NOME", "ID_FUNCAO", "DATA_INATIVACAO", "MOTIVO", "PROCESSO", "DATA_PUBLICACAO"]
};

export const ENTITY_RELATIONSHIPS: { [key: string]: { entity: string; pk: string }[] } = {
  'Pessoa': [
    { entity: 'Contrato', pk: 'CPF' },
    { entity: 'Servidor', pk: 'CPF' }
  ],
  'Contrato': [
    { entity: 'Protocolo', pk: 'CPF' }
  ],
  'Servidor': [
    { entity: 'Alocacao', pk: 'MATRICULA' },
    { entity: 'Nomeacao', pk: 'MATRICULA' },
    { entity: 'Protocolo', pk: 'CPF' }
  ],
  'Vaga': [
    { entity: 'Contrato', pk: 'ID_VAGA' },
    { entity: 'Exercicio', pk: 'ID_VAGA' }
  ],
  'Capacitacao': [
    { entity: 'Turma', pk: 'ID_CAPACITACAO' }
  ],
  'Turma': [
    { entity: 'Encontro', pk: 'ID_TURMA' },
    { entity: 'Chamada', pk: 'ID_TURMA' }
  ],
  'Encontro': [
    { entity: 'Chamada', pk: 'ID_ENCONTRO' }
  ],
  'SolicitacaoPesquisa': [
    { entity: 'Pesquisa', pk: 'ID_SOLICITACAO' }
  ],
  'Lotacao': [], 'PostoTrabalho': [], 'Funcao': [], 'Edital': [], 'Alocacao': [], 'Exercicio': [],
  'Nomeacao': [], 'Chamada': [], 'Visita': [], 'Pesquisa': [], 'Protocolo': [], 'CargoComissionado': [],
  'Inativo': [], 'ContratoHistorico': [], 'AlocacaoHistorico': [], 'Auditoria': []
};

// Configuration for boolean-like fields
// type: 'boolean' = Native DB boolean (true/false)
// type: 'string' = DB String ('Sim'/'Não')
export const BOOLEAN_FIELD_CONFIG: { [key: string]: { type: 'boolean' | 'string' } } = {
    'BLOQUEADA': { type: 'boolean' },
    'AFRODESCENDENTE': { type: 'boolean' },
    'PCD': { type: 'boolean' },
    'USUARIO_ASSISTENCIA': { type: 'boolean' },
    'AUTORIZO': { type: 'string' },
    'ABANDONO': { type: 'string' },
    'MATERIAL_PENDENTE': { type: 'string' },
    'ATIVO': { type: 'string' }
};

export const DROPDOWN_OPTIONS: DropdownOptions = {
  'SEXO': ['M', 'F'],
  'ESCOLARIDADE': [
    'Analfabeto',
    'Fundamental Incompleto',
    'Fundamental Cursando',
    'Fundamental Completo',
    'Médio Incompleto',
    'Médio Cursando',
    'Médio Completo',
    'Médio Técnico Incompleto',
    'Médio Técnico Cursando',
    'Médio Técnico Completo',
    'Superior Incompleto',
    'Superior Cursando',
    'Superior Completo',
    'Pós-graduação Incompleto',
    'Pós-graduação Cursando',
    'Pós-graduação Completo',
    'Mestrado Incompleto',
    'Mestrado Cursando',
    'Mestrado Completo',
    'Doutorado Incompleto',
    'Doutorado Cursando',
    'Doutorado Completo'
  ],
  'ESCOLARIDADE_POSTO': [
      'Fundamental', 'Médio', 'Técnico', 'Superior'
  ],
  'FORMACAO': [
    'Administração', 'Agronegócio', 'Agronomia', 'Análise e Desenvolvimento de Sistemas', 'Arquitetura e Urbanismo', 'Artes Cênicas',
    'Artes Visuais', 'Automação Industrial', 'Biblioteconomia', 'Biologia (Ciências Biológicas)', 'Biomedicina', 'Cibersegurança',
    'Ciência da Computação', 'Ciência de Dados', 'Ciências Aeronáuticas', 'Ciências Atuariais', 'Ciências Contábeis', 'Ciências Econômicas (Economia)',
    'Ciências Sociais', 'Ciência Política', 'Cinema e Audiovisual', 'Comércio Exterior', 'Comunicação Social - Jornalismo',
    'Comunicação Social - Publicidade e Propaganda', 'Comunicação Social - Relações Públicas', 'Conservação e Restauro', 'Construção Civil',
    'Dança', 'Design de Interiores', 'Design de Moda', 'Design Gráfico', 'Direito', 'Ecologia', 'Educação Física (Bacharelado e Licenciatura)',
    'Enfermagem', 'Engenharia Aeronáutica', 'Engenharia Agrícola', 'Engenharia Ambiental e Sanitária', 'Engenharia Cartográfica e de Agrimensura',
    'Engenharia Civil', 'Engenharia de Alimentos', 'Engenharia de Computação', 'Engenharia de Controle e Automação', 'Engenharia de Energia',
    'Engenharia de Materiais', 'Engenharia de Minas', 'Engenharia de Pesca', 'Engenharia de Petróleo', 'Engenharia de Produção', 'Engenharia Elétrica',
    'Engenharia Florestal', 'Engenharia Hídrica', 'Engenharia Mecânica', 'Engenharia Mecatrônica', 'Engenharia Metalúrgica', 'Engenharia Naval',
    'Engenharia Química', 'Engenharia Têxtil', 'Estatística', 'Estética e Cosmética', 'Eventos', 'Farmácia', 'Filosofia', 'Física',
    'Fisioterapia', 'Fonoaudiologia', 'Gastronomia', 'Geografia', 'Geologia', 'Gestão Ambiental', 'Gestão Comercial', 'Gestão Financeira',
    'Gestão Hospitalar', 'Gestão Pública', 'Gestão de Recursos Humanos', 'História', 'Jogos Digitais', 'Letras (Português)', 'Letras (Ingês)',
    'Letras (Espanhol)', 'Letras (Francês)', 'Letras (Italiano)', 'Letras (Alemão)', 'Letras (Chinês)', 'Letras (Japonês)', 'Letras (Literatura)',
    'Logística', 'Marketing', 'Matemática', 'Medicina', 'Medicina Veterinária', 'Musicoterapia', 'Música', 'Nutrição', 'Oceanografia', 'Odontologia',
    'Pedagogia', 'Pilotagem Profissional de Aeronaves', 'Produção Audiovisual', 'Produção Cênica', 'Produção Fonográfica', 'Psicologia', 'Química',
    'Radiologia', 'Redes de Computadores', 'Relações Internacionais', 'Secretariado Executivo', 'Segurança da Informação', 'Segurança no Trabalho',
    'Serviço Social', 'Sistemas de Informação', 'Sociologia', 'Teatro', 'Teologia', 'Terapia Ocupacional', 'Turismo', 'Zootecnia'
  ],
  'STATUS_PEDIDO': ['Acatado', 'Declinado', 'Aguardando'],
  'VINCULO': ['Ativo', 'Extra Quadro', 'Aposentado', 'CLT', 'Prestador de Serviços'],
  'COMPLEXIDADE': ['ALTA', 'BÁSICA', 'MÉDIA', 'NSA'],
  'TIPO_DA_LOTACAO': ['CRAS', 'CREAS', 'CENTRO POP', 'UNIDADE DE ACOLHIMENTO', 'OUTROS'],
  'Protocolo': {
      'TIPO_DE_PROTOCOLO': [
          'Aviso Prévio - Demissão',
          'Férias',
          'Afastamento INSS',
          'Licença Maternidade',
          'Licença Paternidade',
          'Licença Médica por Atestado',
          'Falta'
      ]
  },
  'PAIS': [
    'Brasil', 'Afeganistão', 'África do Sul', 'Albânia', 'Alemanha', 'Andorra', 'Angola', 'Antígua e Barbuda', 'Arábia Saudita', 'Argélia', 'Argentina', 'Armênia', 'Austrália', 'Áustria', 'Azerbaijão', 'Bahamas', 'Bangladesh', 'Barbados', 'Bahrein', 'Bélgica', 'Belize', 'Benim', 'Bielorrússia', 'Bolívia', 'Bósnia e Herzegovina', 'Botsuana', 'Brunei', 'Bulgária', 'Burquina Faso', 'Burundi', 'Butão', 'Cabo Verde', 'Camarões', 'Camboja', 'Canadá', 'Catar', 'Cazaquistão', 'Chade', 'Chile', 'China', 'Chipre', 'Colômbia', 'Comores', 'Coreia do Norte', 'Coreia do Sul', 'Costa do Marfim', 'Costa Rica', 'Croácia', 'Cuba', 'Dinamarca', 'Djibuti', 'Dominica', 'Egito', 'El Salvador', 'Emirados Árabes Unidos', 'Equador', 'Eritreia', 'Eslováquia', 'Eslovênia', 'Espanha', 'Estados Unidos', 'Estônia', 'Etiópia', 'Fiji', 'Filipinas', 'Finlândia', 'França', 'Gabão', 'Gâmbia', 'Gana', 'Geórgia', 'Granada', 'Grécia', 'Guatemala', 'Guiana', 'Guiné', 'Guiné Equatorial', 'Guiné-Bissau', 'Haiti', 'Honduras', 'Hungria', 'Iêmen', 'Ilhas Marshall', 'Índia', 'Indonésia', 'Irã', 'Iraque', 'Irlanda', 'Islândia', 'Israel', 'Itália', 'Jamaica', 'Japão', 'Jordânia', 'Kiribati', 'Kuwait', 'Laos', 'Lesoto', 'Letônia', 'Líbano', 'Libéria', 'Líbia', 'Liechtenstein', 'Lituânia', 'Luxemburgo', 'Macedônia do Norte', 'Madagascar', 'Malásia', 'Malaui', 'Maldivas', 'Mali', 'Malta', 'Marrocos', 'Maurício', 'Mauritânia', 'México', 'Mianmar', 'Micronésia', 'Moçambique', 'Moldávia', 'Mônaco', 'Mongólia', 'Montenegro', 'Namíbia', 'Nauru', 'Nepal', 'Nicarágua', 'Níger', 'Nigéria', 'Noruega', 'Nova Zelândia', 'Omã', 'Países Baixos', 'Palau', 'Panamá', 'Papua-Nova Guiné', 'Paquistão', 'Paraguai', 'Peru', 'Polônia', 'Portugal', 'Quênia', 'Quirguistão', 'Reino Unido', 'República Centro-Africana', 'República Democrática do Congo', 'República do Congo', 'República Dominicana', 'Romênia', 'Ruanda', 'Rússia', 'Samoa', 'San Marino', 'Santa Lúcia', 'São Cristóvão e Neves', 'São Tomé e Príncipe', 'São Vicente e Granadinas', 'Seicheles', 'Senegal', 'Serra Leoa', 'Sérvia', 'Singapura', 'Síria', 'Somália', 'Sri Lanka', 'Suazilândia', 'Sudão', 'Sudão do Sul', 'Suécia', 'Suíça', 'Suriname', 'Tadjiquistão', 'Tailândia', 'Tanzânia', 'Tchequia', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad e Tobago', 'Tunísia', 'Turcomenistão', 'Turquia', 'Tuvalu', 'Ucrânia', 'Uganda', 'Uruguai', 'Uzbequistão', 'Vanuatu', 'Vaticano', 'Venezuela', 'Vietnã', 'Zâmbia', 'Zimbábue'
  ],
  'STATUS_VAGA': ['Disponível', 'Ocupada', 'Bloqueada', 'Em Dispensa'],
  'MODALIDADE': ['Capacitação em Serviço', 'Ciclo de Debates', 'Curso', 'Encontro Temático', 'Oficina', 'Palestra', 'Roda de Conversa', 'Seminário'],
  'MODALIDADE_VISITA': ['Presencial', 'Remota', 'Institucional', 'Domiciliar'],
  'FORMATO': ['À distância (EAD)', 'Híbrido', 'Presencial', 'Remoto'],
  'TIPO_CAPACITACAO': ['Aprimoramento (4h - 20h)', 'Atualização (40h - 100h)', 'Introdutória (20h - 40h)', 'Supervisão Técnica (min 24h)'],
  'PRESENCA': ['Presente', 'Ausente'],
  'TIPO_DE_CARGO': ['N/A', 'S/E', 'DAS10A', 'DAS10B', 'DAS10', 'DAS09', 'DAS08', 'DAS07', 'DAS06', 'DAI06', 'DAI05', 'DAI04'],
  'PERCURSO_FORMATIVO': ['Provimento de Serviços Socioassistenciais', 'Gestão do SUAS', 'Controle Social', 'Transversal'],
  'TIPO_DE_PROTOCOLO': [
    'Aviso Prévio - Demissão', 'Férias', 'Afastamento INSS', 'Licença Maternidade', 
    'Licença Paternidade', 'Licença Médica por Atestado', 'Falta'
  ],
  'STATUS': ['Ativo', 'Inativo', 'Pendente', 'Cancelado'],
  'ZONA': ['Norte', 'Sul', 'Oeste', 'Centro'],
  'CATEGORIA': ['Institucional', 'Domiciliar', 'Eventual', 'Sistemática'],
  'SETOR': ['Psicossocial', 'Jurídico', 'Administrativo', 'Saúde'],
  'TIPO_DE_GRADUACAO': ['N/A', 'Baixo Risco', 'Médio Risco', 'Alto Risco']
};
