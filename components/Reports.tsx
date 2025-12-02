import React, { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ReportData, UserSession, QuantitativoItem } from '../types';
import { Button } from './Button';
import { ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING, FIELD_LABELS, BOOLEAN_FIELD_CONFIG, PERMISSOES_POR_PAPEL } from '../constants';
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
  
  // Search for column selection
  const [columnSearch, setColumnSearch] = useState('');

  // Estados para Salvar/Carregar Relatórios
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [savedReportsModalOpen, setSavedReportsModalOpen] = useState(false);
  const [savedReportsList, setSavedReportsList] = useState<any[]>([]);

  // --- ESTADOS PARA FILTRO INTERATIVO DA TABELA DE RESULTADOS ---
  const [activeResultFilters, setActiveResultFilters] = useState<Record<string, string[]>>({});
  const [openResultFilterCol, setOpenResultFilterCol] = useState<string | null>(null);
  
  // FIXED: Using a ref map instead of a single ref to handle multiple columns correctly in the loop
  const resultFilterRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

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

  // Click Outside Handler para Filtros de Resultado
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (
            openResultFilterCol && 
            resultFilterRefs.current[openResultFilterCol] && 
            !resultFilterRefs.current[openResultFilterCol]?.contains(event.target as Node)
        ) {
            setOpenResultFilterCol(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openResultFilterCol]);

  // --- PERMISSÕES DE ACESSO ---
  // Filtra entidades baseadas no papel do usuário
  const allowedEntities = useMemo(() => {
      const perms = PERMISSOES_POR_PAPEL[session.papel] || [];
      return Object.keys(ENTITY_CONFIGS).filter(key => {
          if (key === 'Auditoria') return false; // Nunca mostrar Auditoria no gerador
          if (perms.includes('TODAS')) return true;
          return perms.includes(key);
      });
  }, [session.papel]);

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
  
  // Helper function to generate descriptions for fields
  const getFieldDescription = (fullPath: string) => {
      const parts = fullPath.split('.');
      const field = parts.pop()!;
      const type = getFieldType(fullPath);
      
      if (type === 'date') return "Data/Hora do evento ou registro";
      if (type === 'number') return "Valor numérico ou quantitativo";
      if (type === 'boolean') return "Indicador Sim/Não";
      if (field === 'CPF') return "Cadastro de Pessoa Física";
      if (field.includes('NOME')) return "Texto descritivo ou nome";
      
      return "Campo de texto para filtros";
  };

  // Inicializar Joins Nível 1 quando a entidade principal muda
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
      
      // Nível 1 (Relações diretas)
      const directRelations = getRelationsForEntity(customEntity);
      const initialJoins: JoinOption[] = directRelations
        .filter(rel => allowedEntities.includes(rel.entity)) // Filtra Joins por permissão
        .map(rel => ({
          label: `${ENTITY_CONFIGS[rel.entity]?.title || rel.entity}`,
          entity: rel.entity,
          path: rel.entity.toLowerCase(), // Usamos camelCase para paths no backend
          parentPath: '',
          depth: 0
      }));

      setAvailableJoins(initialJoins);
      // NÃO limpamos selectedJoins ou selectedColumns aqui para permitir load
  }, [customEntity, allowedEntities]);

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
              // Verifica permissão antes de adicionar relação aninhada
              if (!allowedEntities.includes(rel.entity)) return;

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
      
      let currentAvailable = [...availableJoins];
      if(currentAvailable.length === 0) return; 

      sortedSelected.forEach(path => {
          const option = currentAvailable.find(opt => opt.path === path);
          if (option) {
              const entity = option.entity;
              
              const entitiesAlreadyOption = new Set<string>();
              entitiesAlreadyOption.add(customEntity); 
              currentAvailable.forEach(opt => entitiesAlreadyOption.add(opt.entity));

              const childRelations = getRelationsForEntity(entity);
              
              childRelations.forEach(rel => {
                  if (!allowedEntities.includes(rel.entity)) return; // Check Permission

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
      
      if (currentAvailable.length > availableJoins.length) {
          setAvailableJoins(currentAvailable);
      }
  }, [selectedJoins, customEntity, allowedEntities]); // availableJoins removed to avoid loop

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
      
      if (selectedColumns.length === 0) {
          setSelectedColumns(primaryFields.slice(0, 5));
      } 
  }, [selectedJoins, availableJoins, customEntity]);

  // --- ACTIONS ---

  const handleEntityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newEntity = e.target.value;
      setCustomEntity(newEntity);
      
      // Resetar estado explicitamente
      setSelectedJoins([]);
      setSelectedColumns([]);
      setCustomFilters([]);
      setCustomResults([]);
      setActiveResultFilters({});
      setGenerated(false);
      setFilterSuggestions([]);
      setColumnSearch('');
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
      // Apenas sugere para Strings
      if (type !== 'string') return;

      const parts = fullPath.split('.');
      const field = parts.pop() || '';
      const prefix = parts.join('.');

      let targetEntity = customEntity;

      if (prefix !== customEntity) {
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
      setActiveResultFilters({}); // Limpa filtros da tabela anterior ao gerar novo relatório
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
                           const itemDate = new Date(rawValue).setHours(0,0,0,0);
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
      if (filteredResults.length === 0) return;
      const headers = selectedColumns.map(col => getColumnLabel(col)).join(';');
      const rows = filteredResults.map(row => 
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
      if (filteredResults.length === 0) return;
      const doc = new jsPDF('l', 'mm', 'a4');
      const today = new Date().toLocaleDateString('pt-BR');
      
      doc.setFontSize(14);
      doc.text(`Relatório: ${ENTITY_CONFIGS[customEntity]?.title || customEntity}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${today} - ${filteredResults.length} registros`, 14, 22);

      const tableRows = filteredResults.map(row => selectedColumns.map(col => {
          let val = row[col];
          if (val === null || val === undefined) return '';
          if (getFieldType(col) === 'date') return new Date(val).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
          return String(val);
      }));

      autoTable(doc, {
          startY: 25,
          head: [selectedColumns.map(c => getColumnLabel(c))],
          body: tableRows,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1 },
          headStyles: { fillColor: [19, 51, 90] }
      });
      
      doc.save(`Relatorio_${customEntity}_${today}.pdf`);
  };

  // Função para exportar relatórios fixos (Dashboard, Painel Vagas)
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
          
          setCustomEntity(config.entity);
          setSelectedJoins(config.joins || []);
          setSelectedColumns(config.columns || []);
          setCustomFilters(config.filters || []);
          
          setCustomResults([]);
          setActiveResultFilters({});
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

  // --- HELPER PARA FILTRO INTERATIVO DA TABELA ---
  
  const getFormattedValue = (row: any, col: string) => {
       const val = row[col];
       if (val === null || val === undefined) return '';
       const type = getFieldType(col);
       if (type === 'date') return new Date(val).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
       return String(val);
  };

  // Filtra os resultados em memória baseado nos filtros de coluna (activeResultFilters)
  const filteredResults = useMemo(() => {
      return customResults.filter(item => {
          return Object.keys(activeResultFilters).every(key => {
              const selectedValues = activeResultFilters[key];
              if (!selectedValues || selectedValues.length === 0) return true;
              
              // Compara valores formatados para garantir match com o que é exibido no filtro
              const val = getFormattedValue(item, key);
              return selectedValues.includes(val);
          });
      });
  }, [customResults, activeResultFilters]);

  const getUniqueResultValues = (col: string) => {
      const values = customResults.map(item => getFormattedValue(item, col)).filter(v => v !== '');
      return [...new Set(values)].sort();
  };
  
  // Filter columns based on search in step 3
  const filteredColumns = useMemo(() => {
      if (!columnSearch) return availableColumns;
      return availableColumns.filter(col => {
          const label = getColumnLabel(col).toLowerCase();
          const path = col.toLowerCase();
          const term = columnSearch.toLowerCase();
          return label.includes(term) || path.includes(term);
      });
  }, [availableColumns, columnSearch, customEntity]);

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
      // Filtrar a lista principal de entidades com base nas permissões
      const availableEntities = allowedEntities
        .filter(k => ENTITY_CONFIGS[k].title)
        .sort();
      
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
                           <div className="p-4 px-5 border-b border-gray-100 bg-white flex flex-col gap-3">
                               <div className="flex justify-between items-center">
                                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                      <span className="w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center shadow-sm">3</span>
                                      Colunas
                                   </label>
                                   <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{selectedColumns.length} selec.</span>
                               </div>
                               {/* Search Bar for Columns */}
                               <div className="relative">
                                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input 
                                        type="text" 
                                        placeholder="Buscar colunas..." 
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-simas-cyan transition-all"
                                        value={columnSearch}
                                        onChange={(e) => setColumnSearch(e.target.value)}
                                    />
                               </div>
                           </div>
                           <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-white">
                               <div className="grid grid-cols-2 gap-1 p-2">
                                  {filteredColumns.map(col => {
                                      const parts = col.split('.');
                                      const prefix = parts.join(' > ');
                                      const isPrimary = parts[0] === customEntity;
                                      const label = getColumnLabel(col);
                                      const type = getFieldType(col);
                                      const description = getFieldDescription(col);
                                      
                                      let icon = 'fa-font';
                                      if (type === 'date') icon = 'fa-calendar';
                                      if (type === 'number') icon = 'fa-hashtag';
                                      if (type === 'boolean') icon = 'fa-toggle-on';

                                      return (
                                          <label key={col} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer hover:bg-simas-cyan/5 p-2 rounded-lg border border-transparent hover:border-simas-cyan/20 transition-all select-none group min-h-[3.5rem]">
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
                                                  <div className="flex items-center gap-1.5 text-gray-600 truncate mb-0.5">
                                                      <i className={`fas ${icon} text-[9px] opacity-70`}></i>
                                                      <span>{label}</span>
                                                  </div>
                                                  {/* Descriptive Subtitle */}
                                                  <span className="text-[10px] text-gray-400 font-normal leading-tight line-clamp-2">{description}</span>
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
                                               <div className="text-xs text-simas-dark flex items-center gap-1 truncate">
                                                   <span className="font-bold text-simas-cyan">{translateOperator(f.operator)}</span>
                                                   <span className="truncate" title={f.value}>"{f.value}"</span>
                                               </div>
                                           </div>
                                           <button onClick={() => removeFilter(idx)} className="ml-auto text-gray-300 hover:text-red-500 transition-colors">
                                               <i className="fas fa-times"></i>
                                           </button>
                                       </div>
                                   ))
                               )}
                               </div>
                           </div>

                           {/* Add New Filter Area (Fixed at Bottom) */}
                           <div className="p-4 bg-white border-t border-gray-100">
                               <div className="flex gap-2">
                                   <div className="flex-1 min-w-0">
                                        <select 
                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-simas-cyan mb-2"
                                            value={newFilter.field}
                                            onChange={(e) => {
                                                setNewFilter({ ...newFilter, field: e.target.value, value: '' });
                                                loadFilterSuggestions(e.target.value);
                                            }}
                                        >
                                            <option value="">Escolher Campo...</option>
                                            {availableColumns.map(col => (
                                                <option key={col} value={col}>{getColumnLabel(col)}</option>
                                            ))}
                                        </select>
                                        <div className="flex gap-2">
                                            <select 
                                                className="w-1/3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-simas-cyan"
                                                value={newFilter.operator}
                                                onChange={(e) => setNewFilter({ ...newFilter, operator: e.target.value })}
                                            >
                                                {currentOperators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                                            </select>
                                            <div className="flex-1 relative">
                                                <input 
                                                    type={inputType}
                                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-simas-cyan"
                                                    placeholder="Valor..."
                                                    value={newFilter.value}
                                                    onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                                                    list="filter-suggestions"
                                                />
                                                <datalist id="filter-suggestions">
                                                    {filterSuggestions.map((s, i) => <option key={i} value={s} />)}
                                                </datalist>
                                            </div>
                                        </div>
                                   </div>
                                   <button 
                                        onClick={handleAddFilter}
                                        disabled={!newFilter.field || !newFilter.value}
                                        className="w-10 rounded-lg bg-simas-dark text-white hover:bg-simas-cyan disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center"
                                   >
                                       <i className="fas fa-plus"></i>
                                   </button>
                               </div>
                           </div>
                      </div>
                  </div>
              </div>

              {/* ACTION BAR */}
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex gap-3">
                      <Button variant="secondary" onClick={() => setSaveModalOpen(true)} disabled={!customEntity}>
                          <i className="fas fa-save mr-2"></i> Salvar Modelo
                      </Button>
                      <Button variant="secondary" onClick={handleOpenLoadModal}>
                          <i className="fas fa-folder-open mr-2"></i> Meus Relatórios
                      </Button>
                  </div>
                  <Button onClick={handleGenerateCustom} isLoading={loading} disabled={!customEntity || selectedColumns.length === 0} className="px-8 shadow-lg shadow-simas-cyan/20">
                      <i className="fas fa-rocket mr-2"></i> Gerar Relatório
                  </Button>
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
        
        {/* --- HEADER --- */}
        <div className="px-8 py-6 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-20">
            <div>
                <h1 className="text-2xl font-black text-simas-dark tracking-brand uppercase flex items-center gap-3">
                    <i className="fas fa-chart-pie text-simas-cyan text-xl"></i> 
                    Relatórios & Analytics
                </h1>
                <p className="text-sm text-gray-500 mt-1">Geração de dados estratégicos e operacionais</p>
            </div>
            
            {/* Report Type Selector */}
            <div className="flex bg-gray-100 p-1.5 rounded-xl gap-1">
                {validReports.map(rep => (
                    <button
                        key={rep.id}
                        onClick={() => { setCurrentReport(rep.id); setGenerated(false); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${currentReport === rep.id ? 'bg-white text-simas-dark shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        {rep.id === 'customGenerator' && <i className="fas fa-magic"></i>}
                        {rep.label}
                    </button>
                ))}
            </div>
        </div>

        {/* --- CONTENT AREA --- */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            
            {/* CUSTOM GENERATOR VIEW */}
            {currentReport === 'customGenerator' ? (
                generated ? (
                    // RESULT VIEW
                    <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden flex flex-col h-full animate-slide-in">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h2 className="text-lg font-black text-simas-dark uppercase">Resultados da Consulta</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    {filteredResults.length} registros encontrados • {selectedColumns.length} colunas
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="secondary" onClick={() => setGenerated(false)}>
                                    <i className="fas fa-arrow-left mr-2"></i> Voltar
                                </Button>
                                <Button variant="secondary" onClick={exportCustomCSV}>
                                    <i className="fas fa-file-csv mr-2"></i> CSV
                                </Button>
                                <Button onClick={exportCustomPDF}>
                                    <i className="fas fa-file-pdf mr-2"></i> PDF
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-0 relative">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        {selectedColumns.map(col => {
                                            const label = getColumnLabel(col);
                                            const isOpen = openResultFilterCol === col;
                                            const selectedValues = activeResultFilters[col] || [];
                                            const isFiltered = selectedValues.length > 0;
                                            const uniqueValues = isOpen ? getUniqueResultValues(col) : [];

                                            return (
                                                <th key={col} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 whitespace-nowrap bg-gray-50 group select-none">
                                                    <div 
                                                        className="flex items-center justify-between cursor-pointer hover:bg-gray-200/50 rounded px-1 -mx-1 py-1 transition-colors"
                                                        onClick={() => setOpenResultFilterCol(isOpen ? null : col)}
                                                    >
                                                        <span className={isFiltered ? 'text-simas-cyan' : ''}>{label}</span>
                                                        <i className={`fas ${isFiltered ? 'fa-filter' : 'fa-chevron-down'} ml-2 text-[10px] ${isFiltered ? 'text-simas-cyan' : 'text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity'}`}></i>
                                                    </div>

                                                    {/* Filter Dropdown */}
                                                    {isOpen && (
                                                        <div 
                                                            ref={el => { resultFilterRefs.current[col] = el; }}
                                                            className="absolute top-full mt-1 min-w-[200px] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 animate-fade-in overflow-hidden flex flex-col max-h-[300px]"
                                                        >
                                                            <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                                                <span className="text-[10px] font-bold text-gray-500">Filtrar por {label}</span>
                                                                {isFiltered && (
                                                                    <button onClick={(e) => { e.stopPropagation(); setActiveResultFilters({...activeResultFilters, [col]: []}); }} className="text-[10px] text-red-500 hover:underline font-bold">
                                                                        Limpar
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar max-h-[200px]">
                                                                {uniqueValues.map(val => (
                                                                    <label key={val} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={(e) => e.stopPropagation()}>
                                                                        <input 
                                                                            type="checkbox" 
                                                                            className="rounded text-simas-cyan focus:ring-simas-cyan border-gray-300 w-3.5 h-3.5"
                                                                            checked={selectedValues.includes(String(val))}
                                                                            onChange={() => {
                                                                                const current = activeResultFilters[col] || [];
                                                                                const newVal = String(val);
                                                                                if (current.includes(newVal)) setActiveResultFilters({...activeResultFilters, [col]: current.filter(v => v !== newVal)});
                                                                                else setActiveResultFilters({...activeResultFilters, [col]: [...current, newVal]});
                                                                            }}
                                                                        />
                                                                        <span className="text-xs text-gray-700 truncate font-medium">{val === '' ? '(Vazio)' : val}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredResults.length === 0 ? (
                                        <tr><td colSpan={selectedColumns.length} className="px-6 py-10 text-center text-gray-400 italic">Nenhum resultado encontrado para os filtros atuais.</td></tr>
                                    ) : (
                                        filteredResults.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                                {selectedColumns.map(col => (
                                                    <td key={col} className="px-6 py-3 text-sm text-gray-600 border-b border-gray-50 whitespace-nowrap max-w-[300px] truncate">
                                                        {getFormattedValue(row, col)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    // BUILDER VIEW
                    renderCustomBuilder()
                )
            ) : (
                // FIXED REPORTS (Dashboard / Painel Vagas)
                loading || !data ? (
                    <div className="flex h-64 items-center justify-center">
                        <i className="fas fa-circle-notch fa-spin text-3xl text-simas-medium"></i>
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in">
                        {/* Summary Cards */}
                        {data.totais && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {Object.entries(data.totais).map(([key, value]) => (
                                    <div key={key} className="bg-white p-6 rounded-3xl shadow-soft border border-gray-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{key.replace(/_/g, ' ')}</p>
                                            <p className="text-3xl font-black text-simas-dark mt-1">{value}</p>
                                        </div>
                                        <div className="w-12 h-12 rounded-2xl bg-simas-cyan/10 text-simas-cyan flex items-center justify-center text-xl">
                                            <i className="fas fa-hashtag"></i>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Charts Area */}
                        {data.graficos && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {Object.entries(data.graficos).map(([key, chartData]) => (
                                    <div key={key} className="bg-white p-6 rounded-3xl shadow-soft border border-gray-100">
                                        <h3 className="font-bold text-lg text-simas-dark mb-6 uppercase tracking-tight">{key.replace(/_/g, ' ')}</h3>
                                        <div className="h-64">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} interval={0} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#64748b'}} />
                                                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
                                                    <Bar dataKey="value" fill="#42b9eb" radius={[6, 6, 0, 0]} barSize={40} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Special View: Painel de Vagas */}
                        {currentReport === 'painelVagas' && (
                            <div className="bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                    <div className="flex gap-4">
                                        <button onClick={() => setVagasView('quantitativo')} className={`pb-1 border-b-2 text-sm font-bold uppercase transition-all ${vagasView === 'quantitativo' ? 'border-simas-cyan text-simas-dark' : 'border-transparent text-gray-400'}`}>Quantitativo</button>
                                        <button onClick={() => setVagasView('panorama')} className={`pb-1 border-b-2 text-sm font-bold uppercase transition-all ${vagasView === 'panorama' ? 'border-simas-cyan text-simas-dark' : 'border-transparent text-gray-400'}`}>Panorama Geral</button>
                                    </div>
                                    <Button onClick={handleExportFixedPDF} variant="secondary" className="text-xs">
                                        <i className="fas fa-file-pdf mr-2"></i> Baixar Relatório
                                    </Button>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50/50 text-gray-500 font-bold text-xs uppercase tracking-wider">
                                            <tr>
                                                {vagasView === 'quantitativo' 
                                                    ? ['Vinculação', 'Lotação', 'Cargo', 'Detalhes'].map(h => <th key={h} className="px-6 py-4">{h}</th>)
                                                    : ['Ocupante', 'Vinculação', 'Lotação', 'Cargo', 'Status'].map(h => <th key={h} className="px-6 py-4">{h}</th>)
                                                }
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-sm text-gray-600">
                                            {vagasView === 'quantitativo' && data.quantitativo?.map((row, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-simas-dark">{row.VINCULACAO}</td>
                                                    <td className="px-6 py-4">{row.LOTACAO}</td>
                                                    <td className="px-6 py-4">{row.CARGO}</td>
                                                    <td className="px-6 py-4 text-xs font-mono bg-gray-50/50">{row.DETALHES}</td>
                                                </tr>
                                            ))}
                                            {vagasView === 'panorama' && data.panorama?.map((row, i) => (
                                                <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-simas-dark">{row.OCUPANTE || '-'}</td>
                                                    <td className="px-6 py-4">{row.VINCULACAO}</td>
                                                    <td className="px-6 py-4">{row.LOTACAO_OFICIAL}</td>
                                                    <td className="px-6 py-4">{row.NOME_CARGO}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                            row.STATUS === 'Ocupada' ? 'bg-green-100 text-green-700' :
                                                            row.STATUS === 'Reservada' ? 'bg-blue-100 text-blue-700' :
                                                            row.STATUS === 'Bloqueada' ? 'bg-red-100 text-red-700' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>
                                                            {row.STATUS}
                                                        </span>
                                                        {row.RESERVADA_PARA && <span className="block text-[10px] text-blue-500 mt-1">Ref: {row.RESERVADA_PARA}</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )
            )}
        </div>

        {/* --- MODALS --- */}
        
        {/* Save Report Modal */}
        {saveModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full animate-slide-in">
                    <h3 className="text-lg font-black text-simas-dark mb-4">Salvar Relatório</h3>
                    <input 
                        type="text" 
                        placeholder="Nome do Relatório" 
                        className="w-full p-3 border border-gray-200 rounded-xl mb-4 focus:ring-2 focus:ring-simas-cyan outline-none"
                        value={reportName}
                        onChange={(e) => setReportName(e.target.value)}
                        autoFocus
                    />
                    <div className="flex gap-3 justify-end">
                        <Button variant="ghost" onClick={() => setSaveModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveReport}>Salvar</Button>
                    </div>
                </div>
            </div>
        )}

        {/* Load Report Modal */}
        {savedReportsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-slide-in">
                    <div className="flex justify-between items-center mb-6">
                         <h3 className="text-xl font-black text-simas-dark uppercase">Meus Relatórios</h3>
                         <button onClick={() => setSavedReportsModalOpen(false)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times"></i></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 p-1">
                        {savedReportsList.length === 0 ? (
                            <p className="text-center text-gray-400 py-10 italic">Nenhum relatório salvo.</p>
                        ) : (
                            savedReportsList.map((rep: any) => (
                                <div key={rep.ID_RELATORIO} className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex justify-between items-center hover:bg-white hover:shadow-md transition-all group">
                                    <div>
                                        <h4 className="font-bold text-simas-dark">{rep.NOME}</h4>
                                        <p className="text-xs text-gray-500 mt-1">Criado em: {new Date(rep.DATA_CRIACAO).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => handleLoadReport(rep.CONFIGURACAO)}>Carregar</Button>
                                        <button onClick={() => handleDeleteSavedReport(rep.ID_RELATORIO)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 text-red-400 hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center">
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
