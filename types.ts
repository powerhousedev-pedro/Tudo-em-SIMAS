

export interface UserSession {
  token: string;
  usuario: string;
  papel: 'COORDENAÇÃO' | 'GGT' | 'GPMP' | 'GACP' | 'GDEP' | 'GABINETE';
  isGerente: boolean;
}

export interface AppContextProps {
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export interface EntityConfig {
  title: string;
  pk: string;
  pkPrefix?: string;
  cardDisplay: (item: any) => { title: string; subtitle: string; details?: string; status?: string; hasGraveIssue?: boolean };
  filterBy?: string;
  manualPk?: boolean;
}

export interface DropdownOptions {
  [key: string]: string[] | { [key: string]: string[] };
}

export type RecordData = { [key: string]: any };

export interface PessoaData {
  CPF: string;
  NOME: string;
  NOME_SOCIAL?: string;
  SEXO?: string;
  DATA_DE_NASCIMENTO?: string | Date;
  EMAIL?: string;
  TELEFONE?: string;
  ESCOLARIDADE?: string;
  FORMACAO?: string;
  CEP?: string;
  ENDERECO?: string;
  NUMERO?: string;
  COMPLEMENTO?: string;
  BAIRRO?: string;
  CIDADE?: string;
  ESTADO?: string;
  PAIS?: string;
}

export enum AppRoute {
  LOGIN = 'login',
  DASHBOARD = 'dashboard',
  REPORTS = 'reports',
  HISTORY = 'history',
  MONITORAMENTO = 'monitoramento',
  ACOMPANHAMENTO = 'acompanhamento',
  BUSCA = 'busca'
}

export interface DossierHistoryItem {
    tipo: string;
    data_ordenacao: string | Date; // Permite Date ou ISO String
    periodo: string;
    descricao: string;
    detalhes: string;
    icone: string;
    cor: string;
}

export interface Nota {
    ID_NOTA: string;
    CPF?: string | null;
    GRAVISSIMO: boolean;
    OBS: string;
    DATA_CRIACAO: string | Date;
}

export interface DossierData {
  pessoal: PessoaData;
  tipoPerfil: string;
  vinculosAtivos: any[];
  historico: DossierHistoryItem[];
  notas?: Nota[];
  atividadesEstudantis: { capacitacoes: any[] };
}

export interface ActionContext {
  lookups: { [entity: string]: any[] };
  fields: { [field: string]: string[] | string };
}

export interface QuantitativoItem {
  VINCULACAO: string;
  LOTACAO: string;
  CARGO: string;
  DETALHES: string;
}

export interface ReportData {
  totais?: RecordData;
  graficos?: Record<string, { name: string; value: number }[]>;
  colunas?: string[];
  linhas?: any[][];
  tabela?: { colunas: string[], linhas: any[][] };
  panorama?: any[];
  quantitativo?: QuantitativoItem[];
  filtrosDisponiveis?: any;
}
