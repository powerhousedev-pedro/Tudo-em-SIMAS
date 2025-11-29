

export interface UserSession {
  token: string;
  usuario: string;
  papel: 'COORDENAÇÃO' | 'GGT' | 'GPRGP' | 'GDEP';
  isGerente: boolean;
}

export interface AppContextProps {
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export interface EntityConfig {
  title: string;
  pk: string;
  pkPrefix?: string;
  cardDisplay: (item: any) => { title: string; subtitle: string; details?: string; status?: string };
  filterBy?: string;
  manualPk?: boolean;
}

export interface DropdownOptions {
  [key: string]: string[] | { [key: string]: string[] };
}

export type RecordData = { [key: string]: any };

export enum AppRoute {
  LOGIN = 'login',
  DASHBOARD = 'dashboard',
  WORKFLOWS = 'workflows',
  REPORTS = 'reports',
  HISTORY = 'history'
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

export interface DossierData {
  pessoal: RecordData;
  tipoPerfil: string;
  vinculosAtivos: any[];
  historico: DossierHistoryItem[];
  atividadesEstudantis: { capacitacoes: any[] };
}

export interface ActionContext {
  atendimento: RecordData;
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
