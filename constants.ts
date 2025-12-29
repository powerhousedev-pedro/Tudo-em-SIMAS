

import { EntityConfig, DropdownOptions } from './types';
import { validation } from './utils/validation';

export const REPORT_PERMISSIONS: { [role: string]: string[] } = {
  'GPRGP': ['painelVagas'],
  'GGT': [],
  'GDEP': [],
  'COORDENAÇÃO': [
    'painelVagas',
    'dashboardPessoal'
  ]
};

export const PERMISSOES_POR_PAPEL: { [role: string]: string[] } = {
  'COORDENAÇÃO': ['TODAS'],
  'GGT': ['Pessoa', 'Servidor', 'Alocacao', 'Nomeacao', 'CargoComissionado', 'Atendimento', 'Protocolo', 'Lotacao', 'Cargo', 'Funcao', 'Inativo', 'Auditoria'],
  'GPRGP': ['Pessoa', 'Contrato', 'Vaga', 'Edital', 'Exercicio', 'Atendimento', 'Protocolo', 'Lotacao', 'Cargo', 'Funcao', 'ContratoHistorico', 'Auditoria'],
  'GDEP': ['Pessoa', 'Capacitacao', 'Turma', 'Encontro', 'Chamada', 'Visita', 'SolicitacaoPesquisa', 'Pesquisa', 'Lotacao', 'Auditoria']
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
    'ID_CARGO': 'Cargo',
    'ID_CONTRATO': 'Contrato',
    'ID_FUNCAO': 'Funcao',
    'ID_EDITAL': 'Edital',
    'ID_TURMA': 'Turma',
    'ID_CAPACITACAO': 'Capacitacao',
    'ID_ENCONTRO': 'Encontro',
    'ID_SOLICITACAO': 'SolicitacaoPesquisa',
    'ID_CARGO_COMISSIONADO': 'CargoComissionado',
    'ID_ATENDIMENTO': 'Atendimento',
    'ID_ALOCACAO': 'Alocacao',
    'ID_EXERCICIO': 'Exercicio'
};

export const FIELD_LABELS: Record<string, Record<string, string>> = {
  'Global': {
      'NOME': 'Nome Completo',
      'CPF': 'CPF',
      'MATRICULA': 'Matrícula',
      'TELEFONE': 'Telefone de Contato',
      'EMAIL': 'E-mail',
      'DATA_DE_NASCIMENTO': 'Data de Nascimento',
      'BAIRRO': 'Bairro Residencial',
      'ESCOLARIDADE': 'Nível de Escolaridade',
      'FORMACAO': 'Formação Acadêmica',
      'SEXO': 'Gênero',
      'USUARIO': 'Usuário Responsável',
      'DATA_HORA': 'Data e Hora',
      'ACAO': 'Ação Realizada'
  },
  'Contrato': {
      'ID_CONTRATO': 'Código do Contrato (Atual)',
      'DATA_DO_CONTRATO': 'Data de Início (Contrato Atual)',
      'ID_FUNCAO': 'Função Contratada',
      'ID_VAGA': 'Vaga Vinculada'
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
      'PREFIXO_MATRICULA': 'Prefixo'
  },
  'Vaga': {
      'STATUS_VAGA': 'Situação da Vaga',
      'BLOQUEADA': 'Está Bloqueada?',
      'ID_LOTACAO': 'Lotação da Vaga',
      'ID_CARGO': 'Cargo da Vaga'
  },
  'Inativo': {
      'DATA_INATIVACAO': 'Data da Inativação',
      'MOTIVO': 'Motivo da Inativação',
      'PROCESSO': 'Processo Administrativo'
  },
  'Lotacao': {
      'LOTACAO': 'Nome da Lotação',
      'TIPO_DA_LOTACAO': 'Tipo de Unidade',
      'COMPLEXIDADE': 'Nível de Complexidade'
  },
  'Atendimento': {
      'TIPO_PEDIDO': 'Tipo de Solicitação',
      'STATUS_PEDIDO': 'Status do Fluxo',
      'DATA_ENTRADA': 'Data de Abertura',
      'DATA_AGENDAMENTO': 'Data Agendada/Revisão'
  }
};

export const ENTITY_CONFIGS: { [key: string]: EntityConfig } = {
  // --- COMPARTILHADO / GERAL ---
  'Pessoa': {
    title: 'Pessoas',
    pk: 'CPF',
    manualPk: true, // CPF é inserido manualmente
    filterBy: 'BAIRRO',
    cardDisplay: (item: any) => {
        const age = validation.calculateAge(item.DATA_DE_NASCIMENTO);
        const ageText = age !== null ? ` | ${age} anos` : '';
        const formacaoText = item.FORMACAO ? ` | ${item.FORMACAO}` : '';
        return {
            title: validation.capitalizeName(item.NOME_SOCIAL || item.NOME),
            subtitle: `CPF: ${validation.formatCPF(item.CPF)}${ageText}`,
            details: `Escolaridade: ${item.ESCOLARIDADE || 'N/A'}${formacaoText}\nBairro: ${item.BAIRRO || 'N/A'}`
        };
    }
  },
  
  // --- GPRGP (Gestão de Pessoas e Contratos) ---
  'Contrato': {
    title: 'Contratos',
    pk: 'ID_CONTRATO',
    pkPrefix: 'CTT',
    cardDisplay: (item: any) => ({
      title: `Contrato: ${item.ID_CONTRATO}`,
      subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
      details: `Função: ${item.NOME_FUNCAO || 'N/A'}\nInício: ${validation.formatDate(item.DATA_DO_CONTRATO)}`,
    })
  },
  'Vaga': {
    title: 'Vagas',
    pk: 'ID_VAGA',
    pkPrefix: 'VAG',
    filterBy: 'LOTACAO_NOME',
    cardDisplay: (item: any) => {
        let details = `Edital: ${item.EDITAL_NOME || 'N/A'}`;
        if (item.STATUS_VAGA === 'Reservada') {
            details += `\nReservada para: ${validation.capitalizeName(item.RESERVADA_PARA_NOME || item.RESERVADA_PARA_CPF || '...')}`;
        }
        return {
            title: item.CARGO_NOME || 'Vaga',
            subtitle: item.LOTACAO_NOME || 'Lotação N/A',
            details: details,
            status: item.STATUS_VAGA
        };
    }
  },
  'Edital': {
      title: 'Editais',
      pk: 'ID_EDITAL',
      pkPrefix: 'EDT',
      filterBy: 'COGESTORA',
      cardDisplay: (item: any) => ({
          title: item.EDITAL,
          subtitle: `Proc: ${item.PROCESSO}`,
          details: `Vigência: ${validation.formatDate(item.INICIO)} - ${validation.formatDate(item.TERMINO)}\nCogestora: ${item.COGESTORA || 'N/A'}`
      })
  },
  'Exercicio': { 
      title: 'Exercícios', 
      pk: 'ID_EXERCICIO',
      pkPrefix: 'EXE',
      cardDisplay: (item: any) => ({
        title: item.NOME_CARGO_VAGA || 'Cargo da Vaga',
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
    cardDisplay: (item: any) => ({
      title: validation.capitalizeName(item.NOME_PESSOA || 'Servidor'),
      subtitle: `Matrícula: ${item.PREFIXO_MATRICULA ? item.PREFIXO_MATRICULA + '-' : ''}${item.MATRICULA}`,
      details: `${item.VINCULO}\nCargo Efetivo: ${item.NOME_CARGO || item.ID_CARGO}`
    })
  },
  'Alocacao': {
    title: 'Alocações',
    pk: 'ID_ALOCACAO',
    pkPrefix: 'ALC',
    cardDisplay: (item: any) => ({
        title: validation.capitalizeName(item.NOME_PESSOA),
        subtitle: item.NOME_LOTACAO,
        details: `Função: ${item.NOME_FUNCAO || 'N/A'}\nInício: ${validation.formatDate(item.DATA_INICIO)}`
    })
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
  'Atendimento': {
    title: 'Atendimentos',
    pk: 'ID_ATENDIMENTO',
    pkPrefix: 'ATD',
    cardDisplay: (item: any) => ({
      title: item.TIPO_PEDIDO,
      subtitle: validation.capitalizeName(item.NOME_PESSOA || item.CPF),
      status: item.STATUS_PEDIDO,
      details: `Entrada: ${validation.formatDate(item.DATA_ENTRADA)}\nResponsável: ${item.RESPONSAVEL}`
    })
  },
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
  'Lotacao': {
    title: 'Lotações',
    pk: 'ID_LOTACAO',
    pkPrefix: 'LOT',
    filterBy: 'COMPLEXIDADE',
    cardDisplay: (item: any) => ({
      title: item.LOTACAO,
      subtitle: `Unidade: ${item.UNIDADE}`,
      details: `Bairro: ${item.BAIRRO || 'N/A'}\nComplexidade: ${item.COMPLEXIDADE || 'N/A'}`
    })
  },
  'Cargo': {
    title: 'Cargos',
    pk: 'ID_CARGO',
    pkPrefix: 'CRG',
    filterBy: 'ESCOLARIDADE_CARGO',
    cardDisplay: (item: any) => ({
      title: item.NOME_CARGO,
      subtitle: item.ESCOLARIDADE_CARGO,
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
          subtitle: item.CARGO || 'Cargo N/A',
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
  "Pessoa": ["CPF", "NOME", "NOME_SOCIAL", "SEXO", "DATA_DE_NASCIMENTO", "EMAIL", "TELEFONE", "ESCOLARIDADE", "FORMACAO", "BAIRRO"],
  "Servidor": ["MATRICULA", "PREFIXO_MATRICULA", "CPF", "ID_CARGO", "DATA_MATRICULA", "VINCULO"],
  "Contrato": ["ID_CONTRATO", "ID_VAGA", "CPF", "DATA_DO_CONTRATO", "ID_FUNCAO"],
  "Vaga": ["ID_VAGA", "ID_LOTACAO", "ID_EDITAL", "ID_CARGO", "BLOQUEADA"],
  "Lotacao": ["ID_LOTACAO", "LOTACAO", "VINCULACAO", "TIPO_DA_LOTACAO", "BAIRRO", "COMPLEXIDADE", "UNIDADE"],
  "Cargo": ["ID_CARGO", "NOME_CARGO", "ESCOLARIDADE_CARGO", "SALARIO"],
  "Alocacao": ["ID_ALOCACAO", "MATRICULA", "ID_LOTACAO", "ID_FUNCAO", "DATA_INICIO"],
  "Funcao": ["ID_FUNCAO", "FUNCAO", "CBO"],
  "Atendimento": ["ID_ATENDIMENTO", "REMETENTE", "CPF", "RESPONSAVEL", "DATA_ATENDIMENTO", "TIPO_PEDIDO", "DESCRICAO", "STATUS_PEDIDO", "JUSTIFICATIVA", "DATA_AGENDAMENTO"],
  "Edital": ["ID_EDITAL", "PROCESSO", "EDITAL", "NUMERO", "COGESTORA", "INICIO", "TERMINO"],
  "Protocolo": ["ID_PROTOCOLO", "CPF", "TIPO_DE_PROTOCOLO", "INICIO_PRAZO", "TERMINO_PRAZO", "ID_CONTRATO", "MATRICULA"],
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
  
  // HISTORICO
  "ContratoHistorico": ["ID_CONTRATO", "CPF", "DATA_DO_CONTRATO", "DATA_ARQUIVAMENTO", "MOTIVO_ARQUIVAMENTO", "ID_VAGA", "ID_FUNCAO"],
  "AlocacaoHistorico": ["ID_ALOCACAO", "MATRICULA", "ID_LOTACAO", "DATA_INICIO", "DATA_FIM", "MOTIVO_MUDANCA"],
  "Inativo": ["MATRICULA", "CPF", "NOME", "CARGO", "DATA_INATIVACAO", "MOTIVO", "PROCESSO", "DATA_PUBLICACAO"]
};

export const ENTITY_RELATIONSHIPS: { [key: string]: { entity: string; pk: string }[] } = {
  'Pessoa': [
    { entity: 'Contrato', pk: 'CPF' },
    { entity: 'Servidor', pk: 'CPF' },
    { entity: 'Atendimento', pk: 'CPF' },
  ],
  'Contrato': [
    { entity: 'Protocolo', pk: 'ID_CONTRATO' }
  ],
  'Servidor': [
    { entity: 'Alocacao', pk: 'MATRICULA' },
    { entity: 'Nomeacao', pk: 'MATRICULA' },
    { entity: 'Protocolo', pk: 'MATRICULA' }
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
  'Lotacao': [], 'Cargo': [], 'Funcao': [], 'Edital': [], 'Alocacao': [], 'Exercicio': [],
  'Nomeacao': [], 'Chamada': [], 'Visita': [], 'Pesquisa': [], 'Atendimento': [], 'Protocolo': [], 'CargoComissionado': [],
  'Inativo': [], 'ContratoHistorico': [], 'AlocacaoHistorico': [], 'Auditoria': []
};

export const DROPDOWN_STRUCTURES: any = {
  'TIPO_PEDIDO': {
    'CONTRATADO': [
      'Contratação', 'Promoção (Contratado)', 'Mudança (Contratado)', 'Demissão'
    ],
    'SERVIDOR': [
      'Alocação de Servidor', 'Mudança de Alocação (Servidor)', 'Nomeação de Cargo Comissionado',
      'Exoneração de Cargo Comissionado', 'Exoneração do Serviço Público'
    ],
    'GPRGP_ESPECIFICO': ['Reserva de Vaga'],
    'GERAL': ['Orientação', 'Outro']
  },
  'JUSTIFICATIVA': {
      'CONTRATADO': [
          'Aguardando Assinatura de Aditivo', 'Aguardando Atendimento', 'Aguardando OSC', 'Aguardando Vaga',
          'Declinou', 'Não Compareceu', 'Não Conseguiu Contato', 'Não Preenche os Requisitos da Vaga',
          'Problemas na Contratação', 'Problemas na Documentação'
      ],
      'SERVIDOR': [
          'Aguardando Publicação em Diário Oficial', 'Aguardando Parecer da Procuradoria',
          'Processo em Análise Técnica (GGT/SGP)', 'Vaga Extinta ou Remanejada'
      ],
      'GERAL': [
          'Comando Cancelado', 'Protocolo Não Acatado', 'Aguardando Gabinete', 'Outras Situações'
      ]
  },
  'REMETENTE': [
    'Prefeitura', 'Currículo', 'Protocolo', 'Sem Protocolo', 'Cogestora', 'Outro'
  ]
};

// Configuration for boolean-like fields
// type: 'boolean' = Native DB boolean (true/false)
// type: 'string' = DB String ('Sim'/'Não')
export const BOOLEAN_FIELD_CONFIG: { [key: string]: { type: 'boolean' | 'string' } } = {
    'BLOQUEADA': { type: 'boolean' },
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
  'ESCOLARIDADE_CARGO': [
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
    'Gestão Hospitalar', 'Gestão Pública', 'Gestão de Recursos Humanos', 'História', 'Jogos Digitais', 'Letras (Português)', 'Letras (Inglês)',
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
  'BAIRRO': [
    'Acari', 'Anil', 'Bangu', 'Barra da Tijuca', 'Benfica', 'Bonsucesso', 'Botafogo', 'Caju', 'Campo Grande', 'Catete', 'Centro',
    'Cidade de Deus', 'Cidade Nova', 'Coelho Neto', 'Copacabana', 'Curicica', 'Diversos', 'Engenho de Dentro', 'Engenho Novo',
    'Estácio de Sá', 'Flamengo', 'Galeão', 'Gamboa', 'Grajaú', 'Guadalupe', 'Guaratiba', 'Inhaúma', 'Inhoaíba', 'Irajá',
    'Jacarepaguá', 'Jardim América', 'Lapa', 'Laranjeiras', 'Lins de Vasconcelos', 'Madureira', 'Manguinhos', 'Méier', 'NSA',
    'Olaria', 'Paciência', 'Pavuna', 'Pedra de Guaratiba', 'Penha', 'Piedade', 'Portuguesa', 'Praça da Bandeira', 'Praça Seca',
    'Ramos', 'Realengo', 'Recreio', 'Rio Comprido', 'Rocha Miranda', 'Rocinha', 'Santa Cruz', 'São Conrado', 'São Cristóvão',
    'Saúde', 'Sepetiba', 'Taquara', 'Tauá', 'Tijuca', 'Todos os Santos', 'Vargem Pequena', 'Vila Isabel'
  ],
  'STATUS_VAGA': ['Disponível', 'Ocupada', 'Bloqueada', 'Em Dispensa'],
  'MODALIDADE': ['Capacitação em Serviço', 'Ciclo de Debates', 'Curso', 'Encontro Temático', 'Oficina', 'Palestra', 'Roda de Conversa', 'Seminário'],
  'MODALIDADE_VISITA': ['Presencial', 'Remota', 'Institucional', 'Domiciliar'],
  'FORMATO': ['À distância (EAD)', 'Híbrido', 'Presencial', 'Remoto'],
  'TIPO_CAPACITACAO': ['Aprimoramento (4h - 20h)', 'Atualização (40h - 100h)', 'Introdutória (20h - 40h)', 'Supervisão Técnica (min 24h)'],
  'PRESENCA': ['Presente', 'Ausente'],
  'COGESTORA': ['CAMPO', 'CENTRAL', 'CIEDS', 'CONT-ATO', 'DOM PIXOTE', 'ECOS', 'INADH', 'NONE'],
  'TIPO_DE_CARGO': ['N/A', 'S/E', 'DAS10A', 'DAS10B', 'DAS10', 'DAS09', 'DAS08', 'DAS07', 'DAS06', 'DAI06', 'DAI05', 'DAI04'],
  'PERCURSO_FORMATIVO': ['Provimento de Serviços Socioassistenciais', 'Gestão do SUAS', 'Controle Social', 'Transversal'],
  'TIPO_DE_PROTOCOLO': [
    'Férias', 'Licença Médica', 'Licença Maternidade', 'Licença Adoção', 'Licença Nojo (Luto)', 
    'Licença Paternidade', 'Licença Militar', 'Licença Casamento', 'Afastamento INSS', 'Aviso Prévio',
    'Readaptação', 'Redução de Carga Horária', 'Licença por Acidente de Trabalho', 'Licença Aleitamento',
    'Licença Especial (Prêmio)', 'Licença para Acompanhar Cônjuge', 'Licença para Estudos', 
    'Licença para Aposentadoria', 'Licença para Interesse Particular', 'Licença para Pleito Eleitoral',
    'Licença sem Vencimento', 'Licença para Tratamento de Saúde Familiar', 'Demissão'
  ],
  'STATUS': ['Ativo', 'Inativo', 'Pendente', 'Cancelado'],
  'ZONA': ['Norte', 'Sul', 'Oeste', 'Centro'],
  'CATEGORIA': ['Institucional', 'Domiciliar', 'Eventual', 'Sistemática'],
  'SETOR': ['Psicossocial', 'Jurídico', 'Administrativo', 'Saúde'],
  'TIPO_DE_GRADUACAO': ['N/A', 'Baixo Risco', 'Médio Risco', 'Alto Risco']
};
