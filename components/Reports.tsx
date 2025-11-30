
import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ReportData, UserSession, QuantitativoItem } from '../types';
import { Button } from './Button';
import { REPORT_PERMISSIONS, ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING } from '../constants';
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
  const validReports = [
      { id: 'dashboardPessoal', label: 'Dashboard de Pessoal', category: 'Gerencial' },
      { id: 'painelVagas', label: 'Painel de Vagas', category: 'Operacional' },
      { id: 'analiseCustos', label: 'Análise de Custos', category: 'Gerencial' },
      { id: 'atividadeUsuarios', label: 'Atividade de Usuários', category: 'Administrativo' },
      { id: 'customGenerator', label: 'Gerador Personalizado (BI)', category: 'Ferramentas' }
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

      // 2. Ocultar Foreign Keys (FKs)
      // Se o campo for uma FK que aponta para outra tabela, escondemos para forçar o uso do Join.
      // Ex: ID_VAGA em Contrato (Oculta).
      // Ex: CPF em Contrato (Oculta, pois aponta para Pessoa).
      // Ex: CPF em Pessoa (Mantém, pois aponta para si mesma/é a PK).
      const targetEntity = FK_MAPPING[field];
      if (targetEntity && targetEntity !== entity) return false;

      return true;
  };

  // Inicializar Joins Nível 1 quando a entidade principal muda
  useEffect(() => {
      if (!customEntity) {
          setAvailableJoins([]);
          setSelectedJoins([]);
          setAvailableColumns([]);
          setSelectedColumns([]);
          setCustomResults([]);
          setGenerated(false);
          return;
      }

      // Nível 0 (Colunas da tabela principal)
      const primaryFields = (DATA_MODEL[customEntity] || [])
          .filter(f => isColumnSelectable(customEntity, f))
          .map(f => `${customEntity}.${f}`);
      
      setAvailableColumns(primaryFields);
      setSelectedColumns(primaryFields.slice(0, 5));

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
      setSelectedJoins([]);
      setCustomFilters([]);
      setCustomResults([]);
      setGenerated(false);
  }, [customEntity]);

  // --- LÓGICA RECURSIVA DE JOINS ---

  const handleJoinToggle = (path: string, entity: string, isChecked: boolean) => {
      let newSelected = [...selectedJoins];
      let newAvailable = [...availableJoins];

      if (isChecked) {
          // Adicionar aos selecionados
          if (!newSelected.includes(path)) newSelected.push(path);

          // DESCOBRIR NOVAS RELAÇÕES (NÍVEL N+1)
          const childRelations = getRelationsForEntity(entity);
          
          childRelations.forEach(rel => {
              const childPath = `${path}.${rel.entity.toLowerCase()}`;
              
              // Evitar ciclos (não adicionar se o caminho já contém a entidade ou volta pra principal)
              if (path.includes(rel.entity.toLowerCase()) || rel.entity === customEntity) return;

              // Evitar duplicatas na lista de disponíveis
              if (!newAvailable.some(opt => opt.path === childPath)) {
                  newAvailable.push({
                      label: `${ENTITY_CONFIGS[rel.entity]?.title || rel.entity} (via ${ENTITY_CONFIGS[entity]?.title})`,
                      entity: rel.entity,
                      path: childPath,
                      parentPath: path,
                      depth: (path.split('.').length)
                  });
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

  // Atualizar Colunas Disponíveis baseado nos Joins Selecionados
  useEffect(() => {
      if (!customEntity) return;
      
      // Filtra PKs e FKs automáticas da entidade principal
      const primaryFields = (DATA_MODEL[customEntity] || [])
        .filter(f => isColumnSelectable(customEntity, f))
        .map(f => `${customEntity}.${f}`);

      let joinFields: string[] = [];

      // Ordenar selects para manter consistência visual
      const sortedJoins = [...selectedJoins].sort();

      sortedJoins.forEach(path => {
          // Encontrar qual entidade corresponde a este path
          const option = availableJoins.find(opt => opt.path === path);
          if (option) {
              const fields = DATA_MODEL[option.entity] || [];
              // Prefixo da coluna agora usa o Path completo para evitar ambiguidade
              // Ex: vaga.lotacao.NOME
              const displayPrefix = path.split('.').map(p => {
                  // Tentar deixar mais bonito: vaga -> Vaga
                  return p.charAt(0).toUpperCase() + p.slice(1);
              }).join('.');

              // Filtra PKs e FKs das entidades relacionadas
              const validFields = fields.filter(f => isColumnSelectable(option.entity, f));

              joinFields = [...joinFields, ...validFields.map(f => `${displayPrefix}.${f}`)];
          }
      });

      setAvailableColumns([...primaryFields, ...joinFields]);
      
      // Se não tiver colunas selecionadas, pega as 5 primeiras
      if (selectedColumns.length === 0) {
          setSelectedColumns(primaryFields.slice(0, 5));
      }
  }, [selectedJoins, availableJoins, customEntity]);

  // --- ACTIONS ---

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

  const handleGenerateCustom = async () => {
      if (!customEntity) return;
      setLoading(true);
      try {
          // Envia os paths selecionados (ex: ['vaga', 'vaga.lotacao'])
          let rawData = await api.generateCustomReport(customEntity, selectedJoins);

          // Filtragem Client-Side
          if (customFilters.length > 0) {
              rawData = rawData.filter((item: any) => {
                  return customFilters.every(filter => {
                      // Normalização do valor para comparação
                      const itemValue = String(item[filter.field] || '').toLowerCase();
                      const filterValue = filter.value.toLowerCase();
                      
                      switch (filter.operator) {
                          case 'contains': return itemValue.includes(filterValue);
                          case 'equals': return itemValue === filterValue;
                          case 'starts': return itemValue.startsWith(filterValue);
                          case 'ends': return itemValue.endsWith(filterValue);
                          default: return true;
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
      const headers = selectedColumns.join(';');
      const rows = customResults.map(row => 
          selectedColumns.map(col => {
              let val = row[col];
              if (val === null || val === undefined) return '';
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

      const tableRows = customResults.map(row => selectedColumns.map(col => row[col] || ''));

      autoTable(doc, {
          startY: 25,
          head: [selectedColumns.map(c => c.split('.').pop() || c)], // Header simplificado
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

  // --- RENDERIZADORES ---

  const renderJoinSelector = () => {
    if (availableJoins.length === 0) return <p className="text-xs text-gray-400 italic">Nenhuma relação direta encontrada.</p>;

    // Ordenar para que filhos fiquem abaixo dos pais
    const displayList = [...availableJoins].sort((a, b) => a.path.localeCompare(b.path));

    return (
        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
            {displayList.map((join) => {
                const isSelected = selectedJoins.includes(join.path);
                const isParentSelected = join.parentPath === '' || selectedJoins.includes(join.parentPath);
                
                // Só mostrar se o pai estiver selecionado (Cascata visual)
                if (!isParentSelected) return null;

                return (
                    <label 
                        key={join.path} 
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border text-xs
                            ${isSelected ? 'bg-white border-simas-blue shadow-sm' : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'}
                        `}
                        style={{ marginLeft: `${join.depth * 20}px` }}
                    >
                        <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={(e) => handleJoinToggle(join.path, join.entity, e.target.checked)}
                            className="text-simas-blue rounded focus:ring-simas-blue w-4 h-4"
                        />
                        <div className="flex flex-col">
                            <span className={`font-bold ${isSelected ? 'text-simas-blue' : 'text-gray-600'}`}>
                                {ENTITY_CONFIGS[join.entity]?.title || join.entity}
                            </span>
                            {join.depth > 0 && <span className="text-[9px] text-gray-400">Via {join.parentPath.split('.').pop()}</span>}
                        </div>
                    </label>
                );
            })}
        </div>
    );
  };

  const renderCustomBuilder = () => {
      const availableEntities = Object.keys(ENTITY_CONFIGS).filter(k => k !== 'Auditoria' && ENTITY_CONFIGS[k].title).sort();
      
      return (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                  
                  {/* ETAPA 1: TABELA PRINCIPAL */}
                  <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-full bg-simas-dark text-white flex items-center justify-center text-xs font-bold">1</span>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Fonte de Dados</label>
                        </div>
                        <select 
                            className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white outline-none transition-all focus:ring-2 focus:ring-simas-light/20"
                            value={customEntity}
                            onChange={(e) => setCustomEntity(e.target.value)}
                        >
                            <option value="">Selecione uma tabela...</option>
                            {availableEntities.map(key => (
                                <option key={key} value={key}>{ENTITY_CONFIGS[key].title}</option>
                            ))}
                        </select>
                      </div>

                       {/* ETAPA 2: JOINS RECURSIVOS */}
                       <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 rounded-full bg-simas-blue text-white flex items-center justify-center text-xs font-bold">2</span>
                              <label className="text-xs font-bold text-blue-700 uppercase tracking-widest">Cruzar Dados (Joins)</label>
                          </div>
                          <div className="bg-blue-50/30 p-3 rounded-xl border border-blue-100 min-h-[100px]">
                              {customEntity ? renderJoinSelector() : <p className="text-xs text-gray-400 p-2">Selecione uma fonte primeiro.</p>}
                          </div>
                       </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-gray-50">
                      {/* ETAPA 3: COLUNAS */}
                      <div>
                          <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold">3</span>
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Colunas ({selectedColumns.length})</label>
                          </div>
                          <div className="w-full h-48 border border-gray-200 rounded-xl bg-gray-50 overflow-y-auto p-2 custom-scrollbar">
                              {availableColumns.map(col => {
                                  // Separar Hierarquia
                                  const parts = col.split('.');
                                  const field = parts.pop();
                                  const prefix = parts.join(' > ');
                                  
                                  const isPrimary = parts[0] === customEntity;
                                  
                                  return (
                                      <label key={col} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-100 p-1.5 rounded border-b border-gray-100 last:border-0">
                                          <input 
                                            type="checkbox" 
                                            checked={selectedColumns.includes(col)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedColumns([...selectedColumns, col]);
                                                else setSelectedColumns(selectedColumns.filter(c => c !== col));
                                            }}
                                            className="text-simas-cyan rounded focus:ring-simas-cyan"
                                          />
                                          <span className={`font-bold ${isPrimary ? 'text-simas-dark' : 'text-gray-500'}`}>{prefix}</span>
                                          <span className="text-gray-300">/</span>
                                          <span>{field}</span>
                                      </label>
                                  );
                              })}
                          </div>
                      </div>

                      {/* ETAPA 4: FILTROS */}
                      {customEntity && (
                          <div>
                              <div className="flex items-center gap-2 mb-2">
                                  <span className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold">4</span>
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Filtros</label>
                              </div>
                              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 h-48 flex flex-col">
                                  <div className="flex-1 overflow-y-auto mb-2 custom-scrollbar">
                                    <div className="flex flex-wrap gap-2">
                                        {customFilters.length === 0 && <span className="text-sm text-gray-400 italic">Nenhum filtro aplicado.</span>}
                                        {customFilters.map((f, idx) => (
                                            <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1 rounded-full text-xs shadow-sm">
                                                <span className="font-bold text-simas-dark">{f.field}</span>
                                                <span className="text-gray-500">{f.operator}</span>
                                                <span className="font-bold text-simas-cyan">"{f.value}"</span>
                                                <button onClick={() => removeFilter(idx)} className="text-gray-400 hover:text-red-500 ml-1"><i className="fas fa-times"></i></button>
                                            </div>
                                        ))}
                                    </div>
                                  </div>
                                  <div className="flex gap-2 mt-auto">
                                      <select className="flex-1 p-2 rounded-lg border border-gray-200 text-xs outline-none" value={newFilter.field} onChange={e => setNewFilter({...newFilter, field: e.target.value})}>
                                          <option value="">Campo...</option>
                                          {availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                      </select>
                                      <select className="w-24 p-2 rounded-lg border border-gray-200 text-xs outline-none" value={newFilter.operator} onChange={e => setNewFilter({...newFilter, operator: e.target.value})}>
                                          <option value="contains">Contém</option>
                                          <option value="equals">Igual</option>
                                          <option value="starts">Começa</option>
                                      </select>
                                      <input type="text" placeholder="Valor..." className="flex-1 p-2 rounded-lg border border-gray-200 text-xs outline-none" value={newFilter.value} onChange={e => setNewFilter({...newFilter, value: e.target.value})} />
                                      <Button onClick={handleAddFilter} disabled={!newFilter.field || !newFilter.value} variant="secondary" className="px-3 py-1 text-xs">OK</Button>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-gray-100">
                      <Button onClick={handleGenerateCustom} disabled={!customEntity || selectedColumns.length === 0} isLoading={loading} icon="fas fa-play">
                          Gerar Relatório
                      </Button>
                  </div>
              </div>

              {/* RESULTADOS */}
              {generated && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-slide-in">
                      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                          <div>
                              <h3 className="font-bold text-simas-dark">Resultados</h3>
                              <p className="text-xs text-gray-500">{customResults.length} registros encontrados</p>
                          </div>
                          <div className="flex gap-2">
                              <Button onClick={exportCustomCSV} variant="secondary" icon="fas fa-file-csv" className="text-xs">CSV</Button>
                              <Button onClick={exportCustomPDF} variant="secondary" icon="fas fa-file-pdf" className="text-xs">PDF</Button>
                          </div>
                      </div>
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                          <table className="w-full text-sm text-left border-collapse">
                              <thead className="bg-white sticky top-0 shadow-sm z-10">
                                  <tr>
                                      {selectedColumns.map(col => (
                                          <th key={col} className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                                              {col.split('.').pop()}
                                          </th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {customResults.length === 0 ? (
                                      <tr><td colSpan={selectedColumns.length} className="p-8 text-center text-gray-400 italic">Nenhum dado encontrado com os filtros aplicados.</td></tr>
                                  ) : (
                                      customResults.map((row, idx) => (
                                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                              {selectedColumns.map(col => (
                                                  <td key={`${idx}-${col}`} className="px-4 py-2 whitespace-nowrap text-gray-700 border-r border-gray-50 last:border-0 text-xs">
                                                      {String(row[col] === null || row[col] === undefined ? '' : row[col])}
                                                  </td>
                                              ))}
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
      // Outros relatórios genéricos
      if (data.tabela || (data.colunas && data.linhas)) {
          const cols = data.colunas || data.tabela?.colunas || [];
          const rows = data.linhas || data.tabela?.linhas || [];
          return (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 overflow-x-auto animate-fade-in">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                          <tr>{cols.map((c: string) => <th key={c} className="px-6 py-3">{c}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {rows.map((row: any[], i: number) => (
                              <tr key={i} className="hover:bg-gray-50">
                                  {row.map((val: any, j: number) => <td key={j} className="px-6 py-3">{val}</td>)}
                              </tr>
                          ))}
                      </tbody>
                  </table>
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
                <h2 className="text-xl font-extrabold text-simas-dark tracking-tight">Relatórios</h2>
                <p className="text-xs text-gray-400 mt-1">Selecione uma visão</p>
            </div>
            <div className="p-4 space-y-6">
                {['Gerencial', 'Operacional', 'Administrativo', 'Ferramentas'].map(cat => {
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
                        <h1 className="text-3xl font-bold text-simas-dark">{validReports.find(r => r.id === currentReport)?.label}</h1>
                        <p className="text-gray-500 mt-2">
                            {currentReport === 'customGenerator' ? 'Business Intelligence: Crie consultas complexas cruzando tabelas.' : 'Visualização atualizada do sistema.'}
                        </p>
                    </div>
                    {currentReport !== 'customGenerator' && (
                        <Button onClick={handleExportFixedPDF} icon="fas fa-file-pdf">Exportar PDF</Button>
                    )}
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
    </div>
  );
};
