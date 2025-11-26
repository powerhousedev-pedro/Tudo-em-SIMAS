
import { api } from '../services/api';

interface ModelMeta {
    name: string;
    pk: string;
    fields: string[];
}

class SchemaManager {
    private static instance: SchemaManager;
    private modelMap: Map<string, string> = new Map(); // UI Key (e.g. 'SOLICITAÇÃO DE PESQUISA') -> Real DB Name (e.g. 'SolicitacaoPesquisa')
    private availableModels: ModelMeta[] = [];
    private initialized = false;

    private constructor() {}

    public static getInstance(): SchemaManager {
        if (!SchemaManager.instance) {
            SchemaManager.instance = new SchemaManager();
        }
        return SchemaManager.instance;
    }

    // Normalize string for comparison (remove accents, spaces, lowercase)
    private normalize(str: string): string {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    public async initialize(): Promise<void> {
        try {
            const meta = await api.fetchSchemaMeta();
            this.availableModels = meta;
            this.buildMap();
            this.initialized = true;
            console.log("Schema Initialized. Mappings:", Object.fromEntries(this.modelMap));
        } catch (e) {
            console.error("Failed to initialize schema manager", e);
        }
    }

    public getRealModelName(uiKey: string): string | null {
        if (!this.initialized && this.modelMap.size === 0) {
            // If called before init (shouldn't happen if init is awaited on login), try a quick sync
            console.warn(`SchemaManager accessed before initialization for key: ${uiKey}`);
        }
        return this.modelMap.get(uiKey) || null;
    }

    public getPrimaryKey(realModelName: string): string {
        const model = this.availableModels.find(m => m.name === realModelName);
        return model ? model.pk : 'id'; // fallback
    }

    private buildMap() {
        // Pre-defined UI keys from the application logic/constants
        // We need to match these to the availableModels names
        const uiKeys = [
            'LOTAÇÕES', 'FUNÇÃO', 'EXERCÍCIO', 'CAPACITAÇÃO', 'SOLICITAÇÃO DE PESQUISA', 
            'NOMEAÇÃO', 'CARGO COMISSIONADO', 'CONTRATO_HISTORICO', 'ALOCACAO_HISTORICO', 
            'INATIVOS', 'VAGAS', 'EDITAIS', 'CARGOS', 'PESSOA', 'SERVIDOR', 'CONTRATO', 
            'ALOCACAO', 'ATENDIMENTO', 'PROTOCOLO', 'TURMAS', 'ENCONTRO', 'CHAMADA', 
            'VISITAS', 'PESQUISA', 'AUDITORIA'
        ];

        uiKeys.forEach(uiKey => {
            const normalizedUI = this.normalize(uiKey);
            
            // Find best match in available models
            const match = this.availableModels.find(model => {
                const normalizedDB = this.normalize(model.name);
                return normalizedUI === normalizedDB || normalizedDB.includes(normalizedUI) || normalizedUI.includes(normalizedDB);
            });

            if (match) {
                this.modelMap.set(uiKey, match.name);
            } else {
                console.warn(`No database table match found for UI Entity: ${uiKey}`);
            }
        });
    }
}

export const schemaManager = SchemaManager.getInstance();
