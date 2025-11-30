import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ReportData, UserSession, QuantitativoItem } from '../types';
import { Button } from './Button';
import { ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING, FIELD_LABELS, BOOLEAN_FIELD_CONFIG } from '../constants';
import { generateReportPDF } from '../utils/pdfGenerator';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Definição de tipo para o Join com Caminho
interface JoinOption {
    label: string;
    entity: string;
    path: string; // Ex: "vaga", "vaga.lotacao"
    parentPath: string; // Ex: "", "vaga"
    depth: number;
}

// Configuração de Operadores por Tipo
const OPERATORS_BY_TYPE: Record<string, { value: string, label: string }[]> = {
    string: [
        { value: 'contains', label: 'Contém' },
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' }
    ],
    date: [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' },
        { value: 'greater', label: 'Posterior a (>)' },
        { value: 'less', label: 'Anterior a (<)' },
        { value: 'greater_equal', label: 'Posterior ou Igual (>=)' },
        { value: 'less_equal', label: 'Anterior ou Igual (<=)' }
    ],
    number: [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' },
        { value: 'greater', label: 'Maior que (>)' },
        { value: 'less', label: 'Menor que (<)' },
        { value: 'greater_equal', label: 'Maior ou Igual (>=)' },
        { value: 'less_equal', label: 'Menor ou Igual (<=)' }
    ],
    boolean: [
        { value: 'equals', label: 'Igual a' }
    ]
};

export const Reports: React.FC = () => {
  const getSession = (): UserSession => {
      const stored = localStorage.getItem('simas_user_session');
      if (stored) {
          try { return JSON.parse(stored); } catch (e) {}
      }
      return { token: '', papel: 'GGT', usuario: '', isGerente: false };
  }; 
  const session = getSession();

  // --- CONFIGURAÇÃO DOS RELATÓRIOS ---
  // Apenas Dashboard, Painel de Vagas e o Gerador Customizado
  const validReports = [
      { id: 'dashboardPessoal', label: 'Dashboard de Pessoal', category: 'Gerencial' },
      { id: 'painelVagas', label: 'Painel de Vagas', category: 'Operacional' },
      { id: 'customGenerator', label: 'Gerador Personalizado', category: 'Ferramentas' }
  ];

  const [currentReport, setCurrentReport] = useState(validReports[0].id);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [vagasView, setVagasView] = useState<'quantitativo' | 'panorama'>('quantitativo');

  // --- ESTADO DO GERADOR PERSONALIZADO ---
  const [customEntity, setCustomEntity] = useState<string>('');
  
  // Joins Disponíveis e Selecionados (Agora baseados em caminhos)
  const [availableJoins, setAvailableJoins] = useState<JoinOption[]>([]);
  const [selectedJoins, setSelectedJoins] = useState<string[]>([]); // Array de paths: ['vaga', 'vaga.lotacao']

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<{ field: string, operator: string, value: string }[]>([]);
  const [customResults, setCustomResults] = useState<any[]>([]);
  const [generated, setGenerated] = useState(false);
  
  // Estado temporário para adicionar novo filtro
  const [newFilter, setNewFilter] = useState({ field: '', operator: 'contains', value: '' });
  const [filterSuggestions, setFilterSuggestions] = useState<string[]>([]);

  // Estados para Salvar/Carregar Relatórios
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [savedReportsModalOpen, setSavedReportsModalOpen] = useState(false);
  const [savedReportsList, setSavedReportsList] = useState<any[]>([]);

  // Carregar dados dos relatórios fixos
  useEffect(() => {
    if (currentReport === 'customGenerator' || !currentReport) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.getReportData(currentReport);
        setData(res);
      } catch (e) {
        console.error(e);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentReport]);

  // Função auxiliar para encontrar relações de uma entidade
  const getRelationsForEntity = (entity: string): { entity: string, field: string }[] => {
      const fields = DATA_MODEL[entity] || [];
      const relations: { entity: string, field: string }[] = [];
      
      fields.forEach(f => {
          const targetEntity = FK_MAPPING[f];
          if (targetEntity && targetEntity !== entity) {
              relations.push({ entity: targetEntity, field: f });
          }
      });
      return relations;
  };

  // Helper para verificar se a coluna deve ser exibida (oculta PKs técnicas e FKs)
  const isColumnSelectable = (entity: string, field: string) => {
      const config = ENTITY_CONFIGS[entity];
      if (!config) return true;
      
      // 1. Ocultar PKs Técnicas (não manuais)
      // Ex: ID_CONTRATO (oculta), CPF (mantém se estiver em Pessoa)
      if (field === config.pk && !config.manualPk) return false;

      // 2. Ocultar Foreign Keys (FKs) que apontam para OUTRAS tabelas
      // Se o campo for uma FK que aponta para outra tabela, escondemos para forçar o uso do Join.
      const targetEntity = FK_MAPPING[field];
      if (targetEntity && targetEntity !== entity) return false;

      return true;
  };

  // Inferência de Tipo de Campo - Baseado no Schema Prisma e Nomenclatura
  const getFieldType = (fullPath: string): 'string' | 'date' | 'number' | 'boolean' => {
      const fieldName = fullPath.split('.').pop() || '';
      
      if (BOOLEAN_FIELD_CONFIG[fieldName]) return 'boolean';
      
      // Prisma DateTime fields keywords
      if (/DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE|CRIACAO|ATENDIMENTO|AGENDAMENTO/i.test(fieldName)) return 'date';
      
      // Prisma Int fields or logical numbers (e.g., ANO_ENTRADA, SALARIO treated as num for filter)
      if (/SALARIO|VALOR|COUNT|NUMERO|ANO/i.test(fieldName)) return 'number';
      
      return 'string';
  };
  
  const translateOperator = (op: string) => {
      const allOps = Object.values(OPERATORS_BY_TYPE).flat();
      const found = allOps.find(o => o.value === op);
      return found ? found.label : op;
  };

  const getColumnLabel = (fullPath: string) => {
      const parts = fullPath.split('.');
      const field = parts.pop()!;
      
      // Tenta inferir a entidade com base no prefixo (ex: Vaga.Lotacao -> Lotacao)
      let entityName = customEntity;
      if (parts.length > 0) {
          entityName = parts[parts.length - 1]; // Pega o último segmento (ex: Lotacao)
      }

      // 1. Label Específico da Entidade
      if (FIELD_LABELS[entityName]?.[field]) return FIELD_LABELS[entityName][field];

      // 2. Label Global
      if (FIELD_LABELS['Global']?.[field]) return FIELD_LABELS['Global'][field];

      // 3. Fallback: Formatação do nome técnico
      return field.replace(/_/g, ' ');
  };

  // Inicializar Joins Nível 1 quando a entidade principal muda
  // Refatorado para NÃO limpar estado se ele já estiver sendo carregado (via selectedJoins)
  useEffect(() => {
      if (!customEntity) {
          setAvailableJoins([]);
          setAvailableColumns([]);
          return;
      }

      // Nível 0 (Colunas da tabela principal)
      const primaryFields = (DATA_MODEL[customEntity] || [])
          .filter(f => isColumnSelectable(customEntity, f))
          .map(f => `${customEntity}.${f}`);
      
      // Se acabamos de mudar a entidade (estado limpo) ou carregamos (estado preenchido)
      // Precisamos garantir que as colunas da entidade principal estejam disponíveis
      // Mas NÃO resetamos selectedColumns aqui, isso é feito no onChange do select ou load
      
      // Nível 1 (Relações diretas)
      const directRelations = getRelationsForEntity(customEntity);
      const initialJoins: JoinOption[] = directRelations.map(rel => ({
          label: `${ENTITY_CONFIGS[rel.entity]?.title || rel.entity}`,
          entity: rel.entity,
          path: rel.entity.toLowerCase(), // Usamos camelCase para paths no backend
          parentPath: '',
          depth: 0
      }));

      setAvailableJoins(initialJoins);
      // NÃO limpamos selectedJoins ou selectedColumns aqui para permitir load
  }, [customEntity]);

  // --- LÓGICA RECURSIVA DE JOINS COM PREVENÇÃO DE REDUNDÂNCIA ---

  const handleJoinToggle = (path: string, entity: string, isChecked: boolean) => {
      let newSelected = [...selectedJoins];
      let newAvailable = [...availableJoins];

      if (isChecked) {
          // Adicionar aos selecionados
          if (!newSelected.includes(path)) newSelected.push(path);

          // RASTREAMENTO DE ENTIDADES DISPONÍVEIS (PREVENÇÃO DE REDUNDÂNCIA)
          // Verificamos o que JÁ ESTÁ na lista de opções para não adicionar de novo
          const entitiesAlreadyOption = new Set<string>();
          entitiesAlreadyOption.add(customEntity); 
          newAvailable.forEach(opt => entitiesAlreadyOption.add(opt.entity));

          // DESCOBRIR NOVAS RELAÇÕES (NÍVEL N+1)
          const childRelations = getRelationsForEntity(entity);
          
          childRelations.forEach(rel => {
              const childPath = `${path}.${rel.entity.toLowerCase()}`;
              
              // Se a entidade JÁ existe como opção em qualquer lugar da árvore, não adiciona de novo
              if (entitiesAlreadyOption.has(rel.entity)) return;

              if (!newAvailable.some(opt => opt.path === childPath)) {
                  newAvailable.push({
                      label: `${ENTITY_CONFIGS[rel.entity]?.title || rel.entity} (via ${ENTITY_CONFIGS[entity]?.title})`,
                      entity: rel.entity,
                      path: childPath,
                      parentPath: path,
                      depth: (path.split('.').length)
                  });
                  entitiesAlreadyOption.add(rel.entity);
              }
          });

      } else {
          // Remover dos selecionados e remover recursivamente os filhos dependentes
          const pathsToRemove = newSelected.filter(p => p === path || p.startsWith(path + '.'));
          newSelected = newSelected.filter(p => !pathsToRemove.includes(p));
      }

      setSelectedJoins(newSelected);
      setAvailableJoins(newAvailable);
  };

  // Quando selectedJoins muda (seja por clique ou LOAD), precisamos reconstruir availableJoins recursivamente
  // para que a árvore de opções reflita o que foi carregado
  useEffect(() => {
      if (!customEntity || selectedJoins.length === 0) return;

      // Reconstrução simplificada: vamos iterar sobre os selectedJoins ordenados por profundidade
      // e simular a "expansão" da árvore
      const sortedSelected = [...selectedJoins].sort((a, b) => a.length - b.length);
      
      // Precisamos começar do base state (Nivel 1 já setado pelo useEffect[customEntity])
      // Mas como React state updates são async, melhor manipular cópias locais
      let currentAvailable = [...availableJoins];
      if(currentAvailable.length === 0) return; // Espera o efeito inicial rodar

      sortedSelected.forEach(path => {
          // Acha a opção correspondente ao path atual
          const option = currentAvailable.find(opt => opt.path === path);
          if (option) {
              // Simula a lógica de expansão
              const entity = option.entity;
              
              // Prevenção de redundância
              const entitiesAlreadyOption = new Set<string>();
              entitiesAlreadyOption.add(customEntity); 
              currentAvailable.forEach(opt => entitiesAlreadyOption.add(opt.entity));

              const childRelations = getRelationsForEntity(entity);
              
              childRelations.forEach(rel => {
                  const childPath = `${path}.${rel.entity.toLowerCase()}`;
                  
                  if (entitiesAlreadyOption.has(rel.entity)) return;

                  if (!currentAvailable.some(opt => opt.path === childPath)) {
                      currentAvailable.push({
                          label: `${ENTITY_CONFIGS[rel.entity]?.title || rel.entity} (via ${ENTITY_CONFIGS[entity]?.title})`,
                          entity: rel.entity,
                          path: childPath,
                          parentPath: path,
                          depth: (path.split('.').length)
                      });
                      entitiesAlreadyOption.add(rel.entity);
                  }
              });
          }
      });
      
      // Atualiza apenas se mudou (para evitar loop infinito se useEffect dependesse de availableJoins)
      if (currentAvailable.length > availableJoins.length) {
          setAvailableJoins(currentAvailable);
      }
  }, [selectedJoins, customEntity]); // Note: availableJoins removido das deps para evitar loop

  // Atualizar Colunas Disponíveis baseado nos Joins Selecionados
  useEffect(() => {
      if (!customEntity) return;
      
      // Colunas da entidade principal
      const primaryFields = (DATA_MODEL[customEntity] || [])
        .filter(f => isColumnSelectable(customEntity, f))
        .map(f => `${customEntity}.${f}`);

      let joinFields: string[] = [];

      // Colunas das entidades relacionadas selecionadas
      const sortedJoins = [...selectedJoins].sort();

      sortedJoins.forEach(path => {
          const option = availableJoins.find(opt => opt.path === path);
          if (option) {
              const fields = DATA_MODEL[option.entity] || [];
              const displayPrefix = path.split('.').map(p => {
                  return p.charAt(0).toUpperCase() + p.slice(1);
              }).join('.');

              const validFields = fields.filter(f => isColumnSelectable(option.entity, f));

              joinFields = [...joinFields, ...validFields.map(f => `${displayPrefix}.${f}`)];
          }
      });

      setAvailableColumns([...primaryFields, ...joinFields]);
      
      // Auto-selecionar padrão apenas se estiver vazio E não for load
      // (Se selectedColumns estiver vazio, assume-se novo relatório)
      if (selectedColumns.length === 0) {
          setSelectedColumns(primaryFields.slice(0, 5));
      } 
  }, [selectedJoins, availableJoins, customEntity]);

  // --- ACTIONS ---

  const handleEntityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newEntity = e.target.value;
      setCustomEntity(newEntity);
      
      // Resetar estado explicitamente apenas quando o usuário muda manualmente
      setSelectedJoins([]);
      setSelectedColumns([]); // O useEffect vai repopular o padrão
      setCustomFilters([]);
      setCustomResults([]);
      setGenerated(false);
      setFilterSuggestions([]);
  };

  const handleAddFilter = () => {
      if (newFilter.field && newFilter.value) {
          setCustomFilters([...customFilters, newFilter]);
          setNewFilter({ ...newFilter, value: '' });
      }
  };

  const removeFilter = (idx: number) => {
      const newF = [...customFilters];
      newF.splice(idx, 1);
      setCustomFilters(newF);
  };

  // Lógica de Autocomplete para Filtros
  const loadFilterSuggestions = async (fullPath: string) => {
      setFilterSuggestions([]);
      const type = getFieldType(fullPath);
      // Apenas sugere para Strings para evitar peso desnecessário e formatação de datas
      if (type !== 'string') return;

      const parts = fullPath.split('.');
      const field = parts.pop() || '';
      const prefix = parts.join('.'); // Ex: "Vaga.Lotacao" ou "Pessoa"

      let targetEntity = customEntity;

      // Descobrir a Entidade baseada no Prefixo do Caminho
      if (prefix !== customEntity) {
          // O prefixo "Display" (Capitalizado) precisa ser mapeado de volta para a entidade
          // Varremos os availableJoins para achar quem tem esse caminho
          const foundJoin = availableJoins.find(join => {
              const displayPath = join.path.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
              return displayPath === prefix;
          });
          if (foundJoin) targetEntity = foundJoin.entity;
      }

      if (targetEntity && field) {
          try {
              const values = await api.getUniqueValues(targetEntity, field);
              setFilterSuggestions(values);
          } catch (e) {
              console.warn("Falha ao carregar sugestões", e);
          }
      }
  };

  const handleGenerateCustom = async () => {
      if (!customEntity) return;
      setLoading(true);
      try {
          // Envia os paths selecionados (ex: ['vaga', 'vaga.lotacao'])
          let rawData = await api.generateCustomReport(customEntity, selectedJoins);

          // Filtragem Client-Side Avançada
          if (customFilters.length > 0) {
              rawData = rawData.filter((item: any) => {
                  return customFilters.every(filter => {
                      const type = getFieldType(filter.field);
                      const rawValue = item[filter.field];
                      const filterValue = filter.value;
                      
                      if (rawValue === null || rawValue === undefined) return false;

                      // Conversão e Comparação por Tipo
                      if (type === 'date') {
                           // Normaliza para comparação de data (ignorando tempo se for yyyy-mm-dd vs iso)
                           const itemDate = new Date(rawValue).setHours(0,0,0,0);
                           // Input type="date" sempre manda YYYY-MM-DD, que o Date() interpreta como UTC,
                           // mas precisamos garantir que estamos comparando maçãs com maçãs.
                           // Vamos assumir string comparison para datas simples ou timestamp para completas.
                           const filterDate = new Date(filterValue).setHours(0,0,0,0);
                           
                           if (isNaN(itemDate) || isNaN(filterDate)) return false;

                           switch (filter.operator) {
                               case 'equals': return itemDate === filterDate;
                               case 'not_equals': return itemDate !== filterDate;
                               case 'greater': return itemDate > filterDate;
                               case 'less': return itemDate < filterDate;
                               case 'greater_equal': return itemDate >= filterDate;
                               case 'less_equal': return itemDate <= filterDate;
                               default: return false;
                           }
                      } else if (type === 'number') {
                          // Remove símbolos de moeda se houver, ou espaços
                          const cleanRaw = String(rawValue).replace(/[^\d.-]/g, '');
                          const itemNum = parseFloat(cleanRaw);
                          const filterNum = parseFloat(filterValue);
                          
                          if (isNaN(itemNum) || isNaN(filterNum)) return false;

                          switch (filter.operator) {
                              case 'equals': return itemNum === filterNum;
                              case 'not_equals': return itemNum !== filterNum;
                              case 'greater': return itemNum > filterNum;
                              case 'less': return itemNum < filterNum;
                              case 'greater_equal': return itemNum >= filterNum;
                              case 'less_equal': return itemNum <= filterNum;
                              default: return false;
                          }
                      } else if (type === 'boolean') {
                          // Tratamento de booleano (pode vir como bool, 'Sim'/'Não', ou 0/1)
                          let boolItem = !!rawValue;
                          if (typeof rawValue === 'string') boolItem = rawValue === 'Sim' || rawValue === 'true';
                          
                          const boolFilter = filterValue === 'true' || filterValue === 'Sim';
                          
                          return boolItem === boolFilter;
                      } else {
                          // String (Default)
                          const itemStr = String(rawValue).toLowerCase();
                          const filterStr = filterValue.toLowerCase();

                          switch (filter.operator) {
                              case 'contains': return itemStr.includes(filterStr);
                              case 'equals': return itemStr === filterStr;
                              case 'not_equals': return itemStr !== filterStr;
                              case 'starts': return itemStr.startsWith(filterStr);
                              case 'ends': return itemStr.endsWith(filterStr);
                              default: return true;
                          }
                      }
                  });
              });
          }
          
          setCustomResults(rawData);
          setGenerated(true);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const exportCustomCSV = () => {
      if (customResults.length === 0) return;
      const headers = selectedColumns.map(col => getColumnLabel(col)).join(';');
      const rows = customResults.map(row => 
          selectedColumns.map(col => {
              let val = row[col];
              if (val === null || val === undefined) return '';
              const type = getFieldType(col);
              if (type === 'date') val = new Date(val).toLocaleDateString('pt-BR');
              return String(val).replace(/;/g, ',').replace(/\n/g, ' '); 
          }).join(';')
      );
      
      const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Relatorio_${customEntity}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const exportCustomPDF = () => {
      if (customResults.length === 0) return;
      const doc = new jsPDF('l', 'mm', 'a4');
      const today = new Date().toLocaleDateString('pt-BR');
      
      doc.setFontSize(14);
      doc.text(`Relatório: ${ENTITY_CONFIGS[customEntity]?.title || customEntity}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${today} - ${customResults.length} registros`, 14, 22);

      const tableRows = customResults.map(row => selectedColumns.map(col => {
          let val = row[col];
          if (val === null || val === undefined) return '';
          if (getFieldType(col) === 'date') return new Date(val).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
          return String(val);
      }));

      autoTable(doc, {
          startY: 25,
          head: [selectedColumns.map(c => getColumnLabel(c))], // Usar Label Amigável
          body: tableRows,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1 },
          headStyles: { fillColor: [19, 51, 90] }
      });
      
      doc.save(`Relatorio_${customEntity}_${today}.pdf`);
  };

  const handleExportFixedPDF = () => {
    if (!data) return;
    const reportLabel = validReports.find(r => r.id === currentReport)?.label || 'Relatório';
    generateReportPDF(currentReport, reportLabel, data, vagasView);
  };

  // --- SAVE & LOAD REPORT LOGIC ---

  const handleSaveReport = async () => {
      if (!customEntity || !reportName) return;
      setLoading(true);
      try {
          const config = {
              entity: customEntity,
              joins: selectedJoins,
              columns: selectedColumns,
              filters: customFilters
          };
          
          await api.saveReportConfig(reportName, config);
          setSaveModalOpen(false);
          setReportName('');
          alert('Relatório salvo com sucesso!');
      } catch (e) {
          console.error(e);
          alert('Erro ao salvar relatório.');
      } finally {
          setLoading(false);
      }
  };

  const handleOpenLoadModal = async () => {
      setLoading(true);
      try {
          const reports = await api.getSavedReports();
          setSavedReportsList(reports);
          setSavedReportsModalOpen(true);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const handleLoadReport = (savedConfigStr: string) => {
      try {
          const config = JSON.parse(savedConfigStr);
          
          // 1. Set Entity (Trigger initial load via useEffect, but we override it)
          setCustomEntity(config.entity);
          
          // 2. Set State
          setSelectedJoins(config.joins || []);
          setSelectedColumns(config.columns || []);
          setCustomFilters(config.filters || []);
          
          // 3. Reset Results
          setCustomResults([]);
          setGenerated(false);
          setSavedReportsModalOpen(false);
      } catch (e) {
          console.error("Error parsing config", e);
          alert("Configuração inválida.");
      }
  };

  const handleDeleteSavedReport = async (id: string) => {
      if (!confirm('Tem certeza?')) return;
      try {
          await api.deleteSavedReport(id);
          const reports = await api.getSavedReports();
          setSavedReportsList(reports);
      } catch (e) {
          console.error(e);
      }
  };

  // --- RENDERIZADORES ---

  const renderJoinSelector = () => {
    if (availableJoins.length === 0) return <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">Nenhuma relação direta encontrada.</div>;

    const displayList = [...availableJoins].sort((a, b) => a.path.localeCompare(b.path));

    return (
        <div className="flex flex-col gap-1 p-1">
            {displayList.map((join) => {
                const isSelected = selectedJoins.includes(join.path);
                const isParentSelected = join.parentPath === '' || selectedJoins.includes(join.parentPath);
                
                if (!isParentSelected) return null;

                return (
                    <label 
                        key={join.path} 
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all border text-xs
                            ${isSelected ? 'bg-simas-cyan/5 border-simas-cyan text-simas-dark' : 'bg-transparent border-transparent hover:bg-gray-100 text-gray-600'}
                        `}
                        style={{ marginLeft: `${join.depth * 16}px` }}
                    >
                        <div className="relative flex items-center">
                            <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => handleJoinToggle(join.path, join.entity, e.target.checked)}
                                className="peer sr-only"
                            />
                            <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-simas-cyan border-simas-cyan' : 'bg-white border-gray-300'}`}>
                                {isSelected && <i className="fas fa-check text-[8px] text-white"></i>}
                            </div>
                        </div>
                        
                        <div className="flex flex-col">
                            <span className="font-medium truncate">
                                {ENTITY_CONFIGS[join.entity]?.title || join.entity}
                            </span>
                            {join.depth > 0 && <span className="text-[9px] text-gray-400 leading-none">Via {join.parentPath.split('.').pop()}</span>}
                        </div>
                    </label>
                );
            })}
        </div>
    );
  };

  const renderCustomBuilder = () => {
      const availableEntities = Object.keys(ENTITY_CONFIGS).filter(k => k !== 'Auditoria' && ENTITY_CONFIGS[k].title).sort();
      
      const currentFieldType = newFilter.field ? getFieldType(newFilter.field) : 'string';
      const currentOperators = OPERATORS_BY_TYPE[currentFieldType] || OPERATORS_BY_TYPE['string'];
      const inputType = currentFieldType === 'date' ? 'date' : (currentFieldType === 'number' ? 'number' : 'text');

      return (
          <div className="space-y-6 animate-fade-in">
              {/* MAIN BUILDER BOX - Layout fixo de Split Pane */}
              <div className="bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden flex flex-col md:flex-row h-[80vh] min-h-[600px]">
                  
                  {/* LEFT COLUMN: SOURCE & JOINS (40%) */}
                  <div className="w-full md:w-5/12 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col bg-gray-50/30">
                      
                      {/* Step 1: Source */}
                      <div className="p-5 border-b border-gray-100 bg-white">
                           <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                              <span className="w-6 h-6 bg-simas-dark text-white rounded-full flex items-center justify-center shadow-sm">1</span>
                              Fonte de Dados
                           </label>
                           <div className="relative">
                               <i className="fas fa-database absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan text-sm"></i>
                               <select 
                                   className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-simas-cyan/20 outline-none transition-all text-sm font-medium text-simas-dark shadow-sm appearance-none cursor-pointer hover:border-simas-cyan"
                                   value={customEntity}
                                   onChange={handleEntityChange}
                               >
                                   <option value="">Selecione a tabela principal...</option>
                                   {availableEntities.map(key => (
                                       <option key={key} value={key}>{ENTITY_CONFIGS[key].title}</option>
                                   ))}
                               </select>
                               <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                           </div>
                      </div>

                      {/* Step 2: Joins (Flex Grow) */}
                      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                           <div className="p-4 px-5 pb-2 bg-gray-50/50">
                              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <span className="w-6 h-6 bg-simas-blue text-white rounded-full flex items-center justify-center shadow-sm">2</span>
                                  Cruzar Dados (Joins)
                              </label>
                           </div>
                           <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar">
                               <div className="bg-white border border-gray-200 rounded-2xl p-2 min-h-full shadow-inner">
                                  {customEntity ? renderJoinSelector() : <div className="h-full flex items-center justify-center text-xs text-gray-400 italic text-center p-4">Selecione uma fonte de dados para ver as conexões disponíveis.</div>}
                               </div>
                           </div>
                      </div>
                  </div>

                  {/* RIGHT COLUMN: COLUMNS & FILTERS (60%) */}
                  <div className="w-full md:w-7/12 flex flex-col">
                      
                      {/* Step 3: Columns (50% Height) */}
                      <div className="flex-1 flex flex-col min-h-0 border-b border-gray-100 h-1/2">
                           <div className="p-4 px-5 border-b border-gray-100 bg-white flex justify-between items-center">
                               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <span className="w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center shadow-sm">3</span>
                                  Colunas
                               </label>
                               <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{selectedColumns.length} selec.</span>
                           </div>
                           <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-white">
                               <div className="grid grid-cols-2 gap-1 p-2">
                                  {availableColumns.map(col => {
                                      const parts = col.split('.');
                                      const prefix = parts.join(' > ');
                                      const isPrimary = parts[0] === customEntity;
                                      const label = getColumnLabel(col);
                                      const type = getFieldType(col);
                                      
                                      let icon = 'fa-font';
                                      if (type === 'date') icon = 'fa-calendar';
                                      if (type === 'number') icon = 'fa-hashtag';
                                      if (type === 'boolean') icon = 'fa-toggle-on';

                                      return (
                                          <label key={col} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer hover:bg-simas-cyan/5 p-2 rounded-lg border border-transparent hover:border-simas-cyan/20 transition-all select-none group">
                                              <div className="relative flex items-center mt-0.5">
                                                  <input 
                                                    type="checkbox" 
                                                    checked={selectedColumns.includes(col)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedColumns([...selectedColumns, col]);
                                                        else setSelectedColumns(selectedColumns.filter(c => c !== col));
                                                    }}
                                                    className="peer sr-only"
                                                  />
                                                  <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${selectedColumns.includes(col) ? 'bg-simas-cyan border-simas-cyan' : 'bg-white border-gray-300 group-hover:border-simas-cyan'}`}>
                                                      {selectedColumns.includes(col) && <i className="fas fa-check text-[8px] text-white"></i>}
                                                  </div>
                                              </div>
                                              <div className="flex flex-col overflow-hidden min-w-0">
                                                  <span className={`font-bold truncate ${isPrimary ? 'text-simas-dark' : 'text-gray-500'}`}>{prefix}</span>
                                                  <div className="flex items-center gap-1.5 text-gray-500 truncate">
                                                      <i className={`fas ${icon} text-[9px] opacity-70`}></i>
                                                      <span>{label}</span>
                                                  </div>
                                              </div>
                                          </label>
                                      );
                                  })}
                               </div>
                           </div>
                      </div>

                      {/* Step 4: Filters (50% Height) - Button integrated here */}
                      <div className="flex-1 flex flex-col min-h-0 bg-gray-50/20 h-1/2">
                           <div className="p-3 px-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <span className="w-6 h-6 bg-simas-cyan text-white rounded-full flex items-center justify-center shadow-sm">4</span>
                                  Filtros
                               </label>
                               {customFilters.length > 0 && <span className="text-[10px] bg-simas-cyan/10 text-simas-cyan px-2 py-0.5 rounded-full font-bold">{customFilters.length} ativo(s)</span>}
                           </div>

                           {/* Active Filters List - Card Based */}
                           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                               <div className="flex flex-wrap gap-2 content-start">
                               {customFilters.length === 0 ? (
                                    <div className="w-full h-20 flex flex-col items-center justify-center text-gray-300 gap-2">
                                        <i className="fas fa-filter text-2xl opacity-50"></i>
                                        <span className="text-xs italic">Adicione filtros abaixo para refinar</span>
                                    </div>
                               ) : (
                                   customFilters.map((f, idx) => (
                                       <div key={idx} className="bg-white p-2 pr-3 rounded-lg border border-gray-200 shadow-sm flex items-center gap-3 animate-fade-in max-w-full">
                                           <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                                               <i className="fas fa-filter text-xs"></i>
                                           </div>
                                           <div className="flex flex-col min-w-0">
                                               <span className="text-[9px] font-bold text-gray-400 uppercase truncate">{getColumnLabel(f.field)}</span>
                                               <div className="text-[10px] text-simas-dark truncate flex items-center gap-1">
                                                   <span className="text-gray-500">{translateOperator(f.operator)}</span>
                                                   <span className="font-bold">"{f.value}"</span>
                                               </div>
                                           </div>
                                           <button 
                                               onClick={() => removeFilter(idx)}
                                               className="w-5 h-5 rounded-full hover:bg-red-50 hover:text-red-500 text-gray-300 flex items-center justify-center transition-colors ml-auto"
                                               title="Remover"
                                           >
                                               <i className="fas fa-times text-[10px]"></i>
                                           </button>
                                       </div>
                                   ))
                               )}
                               </div>
                           </div>

                           {/* Add Filter Form & Generate Button Footer */}
                           <div className="p-3 bg-white border-t border-gray-100 shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.05)] z-10">
                               <div className="flex flex-col gap-2">
                                   <div className="flex gap-2">
                                       <select 
                                           className="w-1/2 text-xs p-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all"
                                           value={newFilter.field} 
                                           onChange={e => {
                                               const field = e.target.value;
                                               const type = getFieldType(field);
                                               // Reset operator to default for type and clear value when field changes
                                               const defaultOp = OPERATORS_BY_TYPE[type][0].value;
                                               setNewFilter({ field, operator: defaultOp, value: '' });
                                               loadFilterSuggestions(field);
                                           }}
                                       >
                                           <option value="">Campo...</option>
                                           {availableColumns.map(col => <option key={col} value={col}>{getColumnLabel(col)}</option>)}
                                       </select>
                                       <select 
                                           className="w-1/2 text-xs p-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all"
                                           value={newFilter.operator} 
                                           onChange={e => setNewFilter({...newFilter, operator: e.target.value})}
                                           disabled={!newFilter.field}
                                       >
                                           {currentOperators.map(op => (
                                               <option key={op.value} value={op.value}>{op.label}</option>
                                           ))}
                                       </select>
                                   </div>
                                   <div className="flex gap-2">
                                       {currentFieldType === 'boolean' ? (
                                           <select 
                                                className="flex-1 text-xs p-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all"
                                                value={newFilter.value}
                                                onChange={e => setNewFilter({...newFilter, value: e.target.value})}
                                           >
                                               <option value="">Selecione...</option>
                                               <option value="true">Verdadeiro / Sim</option>
                                               <option value="false">Falso / Não</option>
                                           </select>
                                       ) : (
                                           <>
                                              <input 
                                                  type={inputType}
                                                  placeholder={currentFieldType === 'date' ? '' : "Valor..."}
                                                  className="flex-1 text-xs p-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all"
                                                  value={newFilter.value} 
                                                  onChange={e => setNewFilter({...newFilter, value: e.target.value})}
                                                  onKeyPress={(e) => e.key === 'Enter' && handleAddFilter()}
                                                  list={filterSuggestions.length > 0 ? "filter-suggestions" : undefined}
                                              />
                                              {filterSuggestions.length > 0 && (
                                                  <datalist id="filter-suggestions">
                                                      {filterSuggestions.map((sug, i) => (
                                                          <option key={i} value={sug} />
                                                      ))}
                                                  </datalist>
                                              )}
                                           </>
                                       )}
                                       <button 
                                           onClick={handleAddFilter} 
                                           disabled={!newFilter.field || !newFilter.value}
                                           className="px-4 bg-simas-dark text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-simas-blue disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                       >
                                           OK
                                       </button>
                                   </div>
                                   
                                   {/* ACTION BUTTON INTEGRATED HERE */}
                                   <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
                                        <Button onClick={handleGenerateCustom} disabled={!customEntity || selectedColumns.length === 0} isLoading={loading} icon="fas fa-bolt" className="w-full justify-center shadow-simas-blue/20">
                                            Gerar Relatório
                                        </Button>
                                   </div>
                               </div>
                           </div>
                      </div>
                  </div>
              </div>

              {/* RESULTADOS */}
              {generated && (
                  <div className="bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden animate-slide-in mb-10">
                      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                          <div>
                              <h3 className="font-black uppercase tracking-brand text-simas-dark text-lg">Resultados da Consulta</h3>
                              <p className="text-xs text-gray-500 font-medium">{customResults.length} registros encontrados</p>
                          </div>
                          <div className="flex gap-3">
                              <Button onClick={exportCustomCSV} variant="secondary" icon="fas fa-file-csv" className="text-xs">CSV</Button>
                              <Button onClick={exportCustomPDF} variant="secondary" icon="fas fa-file-pdf" className="text-xs">PDF</Button>
                          </div>
                      </div>
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-white sticky top-0 shadow-sm z-10">
                                  <tr>
                                      {selectedColumns.map(col => (
                                          <th key={col} className="px-6 py-4 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                              {getColumnLabel(col)}
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {customResults.length === 0 ? (
                                      <tr><td colSpan={selectedColumns.length} className="p-10 text-center text-gray-400 italic">Nenhum dado encontrado com os filtros aplicados.</td></tr>
                                  ) : (
                                      customResults.map((row, idx) => (
                                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                              {selectedColumns.map(col => {
                                                  const val = row[col];
                                                  const type = getFieldType(col);
                                                  let displayVal = val;
                                                  if (type === 'date' && val) displayVal = new Date(val).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
                                                  
                                                  return (
                                                      <td key={`${idx}-${col}`} className="px-6 py-3 whitespace-nowrap text-gray-600 border-r border-gray-50 last:border-0 text-xs font-medium">
                                                          {String(val === null || val === undefined ? '' : displayVal)}
                                                      </td>
                                                  );
                                              })}
                                          </tr>
                                      ))
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}
          </div>
      );
  };

  // Funções de renderização de relatórios fixos (Dashboard Pessoal, Painel de Vagas)
  const renderFixedReport = () => {
      if (!data) return null;
      if (currentReport === 'dashboardPessoal') {
          return (
             <div className="space-y-8 animate-fade-in">
                  {data.totais && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {Object.entries(data.totais).map(([key, val]) => (
                              <div key={key} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                  <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">{key.replace(/_/g, ' ')}</h3>
                                  <p className="text-4xl font-extrabold text-simas-dark">{val as React.ReactNode}</p>
                              </div>
                          ))}
                      </div>
                  )}
                  {data.graficos && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {Object.entries(data.graficos).map(([key, chartData]) => (
                              <div key={key} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-[400px]">
                                  <h4 className="text-sm font-bold text-gray-500 mb-4 uppercase">{key === 'vinculo' ? 'Distribuição por Vínculo' : 'Top Lotações'}</h4>
                                  <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={chartData} layout={key === 'lotacao' ? 'vertical' : 'horizontal'}>
                                          <CartesianGrid strokeDasharray="3 3" />
                                          {key === 'lotacao' ? <XAxis type="number" /> : <XAxis dataKey="name" />}
                                          {key === 'lotacao' ? <YAxis dataKey="name" type="category" width={100} style={{fontSize: '10px'}} /> : <YAxis />}
                                          <Tooltip cursor={{fill: '#f3f4f6'}} />
                                          <Bar dataKey="value" fill="#2a688f" radius={[4, 4, 4, 4]} barSize={30} />
                                      </BarChart>
                                  </ResponsiveContainer>
                              </div>
                          ))}
                      </div>
                  )}
             </div>
          );
      }
      if (currentReport === 'painelVagas') {
          return (
              <div className="space-y-6 animate-fade-in">
                  <div className="flex gap-2 bg-white p-1.5 rounded-lg shadow-sm border border-gray-100 w-fit">
                      <button onClick={() => setVagasView('quantitativo')} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${vagasView === 'quantitativo' ? 'bg-simas-blue text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}><i className="fas fa-list-ol mr-2"></i> Quantitativo</button>
                      <button onClick={() => setVagasView('panorama')} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${vagasView === 'panorama' ? 'bg-simas-blue text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}><i className="fas fa-table mr-2"></i> Panorama</button>
                  </div>
                  {vagasView === 'quantitativo' && data.quantitativo ? (
                      <div className="space-y-6">
                          {/* Group by Vinculacao */}
                          {Object.entries(data.quantitativo.reduce((acc: any, item: any) => {
                              if (!acc[item.VINCULACAO]) acc[item.VINCULACAO] = [];
                              acc[item.VINCULACAO].push(item);
                              return acc;
                          }, {})).map(([vinculo, items]: any) => (
                              <div key={vinculo} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                                      <h3 className="font-bold text-simas-dark">{vinculo}</h3>
                                  </div>
                                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {items.map((item: any, i: number) => (
                                          <div key={i} className="border border-gray-100 rounded-lg p-3 hover:shadow-md transition-shadow">
                                              <div className="text-xs font-bold text-gray-400 uppercase mb-1">{item.LOTACAO}</div>
                                              <div className="font-bold text-simas-blue mb-1">{item.CARGO}</div>
                                              <div className="text-xs text-gray-600">{item.DETALHES}</div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : null}
                  {vagasView === 'panorama' && data.panorama ? (
                      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 overflow-x-auto">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                              <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                                  <tr><th className="px-6 py-3">Status</th><th className="px-6 py-3">Lotação</th><th className="px-6 py-3">Cargo</th><th className="px-6 py-3">Ocupante/Reserva</th></tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {data.panorama.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-gray-50">
                                          <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${row.STATUS === 'Disponível' ? 'bg-green-100 text-green-800' : row.STATUS === 'Ocupada' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>{row.STATUS}</span></td>
                                          <td className="px-6 py-3">{row.LOTACAO_OFICIAL}</td>
                                          <td className="px-6 py-3 font-medium">{row.NOME_CARGO}</td>
                                          <td className="px-6 py-3 text-gray-500">{row.RESERVADA_PARA || row.OCUPANTE || '-'}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  ) : null}
              </div>
          );
      }
      return null;
  };

  return (
    <div className="flex h-full overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-y-auto flex-none z-10">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-black uppercase tracking-brand text-simas-dark">Relatórios</h2>
                <p className="text-xs text-gray-400 mt-1">Selecione uma visão</p>
            </div>
            <div className="p-4 space-y-6">
                {['Gerencial', 'Operacional', 'Ferramentas'].map(cat => {
                    const catReports = validReports.filter(r => r.category === cat);
                    if (catReports.length === 0) return null;
                    return (
                        <div key={cat}>
                            <h3 className="px-3 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{cat}</h3>
                            <div className="space-y-1">
                                {catReports.map(rep => (
                                    <button 
                                        key={rep.id} 
                                        onClick={() => { setCurrentReport(rep.id); setGenerated(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${currentReport === rep.id ? 'bg-simas-blue/10 text-simas-blue' : 'text-gray-600 hover:bg-gray-50 hover:text-simas-dark'}`}
                                    >
                                        {rep.id === 'customGenerator' && <i className="fas fa-magic text-xs"></i>}
                                        {rep.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
            <div className="max-w-7xl mx-auto pb-10">
                <header className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-brand text-simas-dark">{validReports.find(r => r.id === currentReport)?.label}</h1>
                        <p className="text-gray-500 mt-2">
                            {currentReport === 'customGenerator' ? 'Business Intelligence: Crie consultas complexas cruzando tabelas.' : 'Visualização atualizada do sistema.'}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        {currentReport === 'customGenerator' ? (
                            <>
                                {customEntity && (
                                    <Button variant="secondary" icon="fas fa-save" onClick={() => setSaveModalOpen(true)}>
                                        Salvar Modelo
                                    </Button>
                                )}
                                <Button variant="secondary" icon="fas fa-folder-open" onClick={handleOpenLoadModal}>
                                    Meus Relatórios
                                </Button>
                            </>
                        ) : (
                            <Button onClick={handleExportFixedPDF} icon="fas fa-file-pdf">Exportar PDF</Button>
                        )}
                    </div>
                </header>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <div className="w-12 h-12 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-simas-blue font-medium animate-pulse">Processando dados...</p>
                    </div>
                ) : (
                    currentReport === 'customGenerator' ? renderCustomBuilder() : renderFixedReport()
                )}
            </div>
        </div>

        {/* MODAL SALVAR RELATÓRIO */}
        {saveModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-white/20 animate-slide-in">
                    <h3 className="text-lg font-bold text-simas-dark mb-4">Salvar Modelo</h3>
                    <input 
                        type="text" 
                        placeholder="Nome do relatório..." 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-4 focus:bg-white focus:border-simas-cyan outline-none"
                        value={reportName}
                        onChange={(e) => setReportName(e.target.value)}
                        autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="secondary" onClick={() => setSaveModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveReport} disabled={!reportName.trim()}>Salvar</Button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL MEUS RELATÓRIOS */}
        {savedReportsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-slide-in flex flex-col max-h-[80vh]">
                    <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-simas-dark">Meus Relatórios</h3>
                        <button onClick={() => setSavedReportsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {savedReportsList.length === 0 ? (
                            <p className="text-center text-gray-400 italic py-8">Nenhum relatório salvo.</p>
                        ) : (
                            <div className="space-y-2">
                                {savedReportsList.map(rep => (
                                    <div key={rep.ID_RELATORIO} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl hover:shadow-md transition-shadow group">
                                        <button 
                                            onClick={() => handleLoadReport(rep.CONFIGURACAO)}
                                            className="flex-1 text-left flex flex-col"
                                        >
                                            <span className="font-bold text-simas-dark text-sm group-hover:text-simas-cyan transition-colors">{rep.NOME}</span>
                                            <span className="text-[10px] text-gray-400">Criado em: {new Date(rep.DATA_CRIACAO).toLocaleDateString()}</span>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteSavedReport(rep.ID_RELATORIO)}
                                            className="w-8 h-8 rounded-full hover:bg-red-50 hover:text-red-500 text-gray-300 flex items-center justify-center transition-colors"
                                            title="Excluir"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
