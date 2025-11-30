
import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ReportData, UserSession, QuantitativoItem } from '../types';
import { Button } from './Button';
import { REPORT_PERMISSIONS, ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING } from '../constants';
import { generateReportPDF } from '../utils/pdfGenerator';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
      { id: 'customGenerator', label: 'Gerador Personalizado', category: 'Ferramentas' }
  ];

  const [currentReport, setCurrentReport] = useState(validReports[0].id);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [vagasView, setVagasView] = useState<'quantitativo' | 'panorama'>('quantitativo');

  // --- ESTADO DO GERADOR PERSONALIZADO ---
  const [customEntity, setCustomEntity] = useState<string>('');
  const [availableJoins, setAvailableJoins] = useState<string[]>([]);
  const [selectedJoins, setSelectedJoins] = useState<string[]>([]);
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

  // Identificar Joins Disponíveis (Baseado em DATA_MODEL e FK_MAPPING)
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

      // Identificar relacionamentos possíveis onde a tabela atual tem a FK
      const currentFields = DATA_MODEL[customEntity] || [];
      const potentialJoins = currentFields
        .map(field => FK_MAPPING[field])
        .filter(entity => entity && entity !== customEntity);

      setAvailableJoins([...new Set(potentialJoins)]);
      setSelectedJoins([]);
      
      // Carregar colunas iniciais (só da tabela principal)
      const cols = currentFields.map(f => `${customEntity}.${f}`);
      setAvailableColumns(cols);
      setSelectedColumns(cols.slice(0, 5));
      setCustomFilters([]);
      setCustomResults([]);
      setGenerated(false);
  }, [customEntity]);

  // Atualizar Colunas quando Joins mudam
  useEffect(() => {
      if (!customEntity) return;
      
      const primaryFields = (DATA_MODEL[customEntity] || []).map(f => `${customEntity}.${f}`);
      let joinFields: string[] = [];

      selectedJoins.forEach(joinEntity => {
          const fields = DATA_MODEL[joinEntity] || [];
          // Prefix columns with Joined Entity Name
          joinFields = [...joinFields, ...fields.map(f => `${joinEntity}.${f}`)];
      });

      setAvailableColumns([...primaryFields, ...joinFields]);
      // Não reseta selectedColumns se já tiver algo, apenas adiciona se estiver vazio
      if (selectedColumns.length === 0) {
          setSelectedColumns(primaryFields.slice(0, 5));
      }
  }, [selectedJoins, customEntity]);

  // --- LÓGICA DO GERADOR ---

  const handleAddFilter = () => {
      if (newFilter.field && newFilter.value) {
          setCustomFilters([...customFilters, newFilter]);
          setNewFilter({ ...newFilter, value: '' }); // Limpa valor
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
          // Busca dados brutos com Joins no servidor
          let rawData = await api.generateCustomReport(customEntity, selectedJoins);

          // Aplica Filtros no Cliente (Client-side filtering para flexibilidade)
          if (customFilters.length > 0) {
              rawData = rawData.filter((item: any) => {
                  return customFilters.every(filter => {
                      // O filtro agora precisa lidar com chaves achatadas 'Entity.Field'
                      const itemValue = String(item[filter.field] || '').toLowerCase();
                      const filterValue = filter.value.toLowerCase();
                      
                      switch (filter.operator) {
                          case 'contains': return itemValue.includes(filterValue);
                          case 'equals': return itemValue === filterValue;
                          case 'starts': return itemValue.startsWith(filterValue);
                          case 'ends': return itemValue.endsWith(filterValue);
                          case 'gt': return parseFloat(itemValue) > parseFloat(filterValue);
                          case 'lt': return parseFloat(itemValue) < parseFloat(filterValue);
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
              return String(val).replace(/;/g, ','); // Escape semi-colons
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
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
      const today = new Date().toLocaleDateString('pt-BR');
      
      doc.setFontSize(14);
      doc.text(`Relatório Personalizado: ${ENTITY_CONFIGS[customEntity]?.title || customEntity}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${today} - ${customResults.length} registros`, 14, 22);

      const tableRows = customResults.map(row => selectedColumns.map(col => row[col] || ''));

      autoTable(doc, {
          startY: 25,
          head: [selectedColumns],
          body: tableRows,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2 },
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

  const renderQuantitativoGrouped = (items: QuantitativoItem[]) => {
      const grouped = items.reduce((acc, item) => {
          if (!acc[item.VINCULACAO]) acc[item.VINCULACAO] = {};
          if (!acc[item.VINCULACAO][item.LOTACAO]) acc[item.VINCULACAO][item.LOTACAO] = [];
          acc[item.VINCULACAO][item.LOTACAO].push(item);
          return acc;
      }, {} as Record<string, Record<string, QuantitativoItem[]>>);

      return (
          <div className="space-y-6">
              {Object.entries(grouped).map(([vinculacao, lotacoes]) => (
                  <div key={vinculacao} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="bg-simas-blue/10 px-6 py-4 border-b border-simas-blue/20">
                          <h3 className="font-bold text-lg text-simas-dark">{vinculacao}</h3>
                      </div>
                      <div className="p-6 space-y-6">
                          {Object.entries(lotacoes).map(([lotacao, cargos]) => (
                              <div key={lotacao} className="border-l-4 border-simas-cyan pl-4">
                                  <h4 className="font-semibold text-simas-blue mb-2">{lotacao}</h4>
                                  <ul className="space-y-2">
                                      {cargos.map((item, idx) => (
                                          <li key={idx} className="flex justify-between items-center text-sm bg-gray-50 p-3 rounded-lg">
                                              <span className="font-medium text-gray-700">{item.CARGO}</span>
                                              <span className="text-gray-500 font-light">{item.DETALHES}</span>
                                          </li>
                                      ))}
                                  </ul>
                              </div>
                          ))}
                      </div>
                  </div>
              ))}
          </div>
      );
  };

  const renderFixedReport = () => {
      if (!data) return null;

      if (currentReport === 'painelVagas') {
          return (
              <div className="space-y-6">
                  <div className="flex gap-2 bg-white p-2 rounded-lg shadow-sm border border-gray-100 w-fit">
                      <button onClick={() => setVagasView('quantitativo')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${vagasView === 'quantitativo' ? 'bg-simas-blue text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}><i className="fas fa-list-ol mr-2"></i> Quantitativo</button>
                      <button onClick={() => setVagasView('panorama')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${vagasView === 'panorama' ? 'bg-simas-blue text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}><i className="fas fa-table mr-2"></i> Panorama</button>
                  </div>
                  {vagasView === 'quantitativo' && data.quantitativo ? renderQuantitativoGrouped(data.quantitativo) : null}
                  {vagasView === 'panorama' && data.panorama ? (
                      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 overflow-x-auto">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                              <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                                  <tr><th className="px-6 py-3">Ocupante</th><th className="px-6 py-3">Vinculação</th><th className="px-6 py-3">Lotação</th><th className="px-6 py-3">Cargo</th><th className="px-6 py-3">Status</th></tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {data.panorama.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-gray-50/50">
                                          <td className="px-6 py-3 font-bold">{row.OCUPANTE}</td><td className="px-6 py-3">{row.VINCULACAO}</td><td className="px-6 py-3">{row.LOTACAO_OFICIAL}</td><td className="px-6 py-3">{row.NOME_CARGO}</td>
                                          <td className="px-6 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${row.STATUS === 'Disponível' ? 'bg-green-100 text-green-800' : row.STATUS === 'Ocupada' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>{row.STATUS}</span></td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  ) : null}
              </div>
          );
      }

      return (
          <div className="space-y-8">
              {data.totais && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {Object.entries(data.totais).map(([key, val]) => (
                          <div key={key} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                              <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">{key}</h3>
                              <p className="text-4xl font-extrabold text-simas-dark">{val as React.ReactNode}</p>
                          </div>
                      ))}
                  </div>
              )}
              {data.graficos && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {Object.entries(data.graficos).map(([key, chartData]) => (
                          <div key={key} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-[400px]">
                              <h4 className="text-sm font-bold text-gray-500 mb-4 uppercase">{key === 'vinculo' ? 'Por Vínculo' : 'Por Lotação'}</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={chartData}>
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="name" />
                                      <YAxis />
                                      <Tooltip cursor={{fill: '#f3f4f6'}} />
                                      <Legend />
                                      <Bar dataKey="value" fill="#2a688f" radius={[4, 4, 0, 0]} />
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      );
  };

  const renderCustomBuilder = () => {
      const availableEntities = Object.keys(ENTITY_CONFIGS).filter(k => k !== 'Auditoria' && ENTITY_CONFIGS[k].title).sort();
      
      return (
          <div className="space-y-6 animate-fade-in">
              {/* CONFIGURAÇÃO DO RELATÓRIO */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-6">
                  
                  {/* ETAPA 1: TABELA PRINCIPAL */}
                  <div>
                      <div className="flex items-center gap-2 mb-2">
                          <span className="w-6 h-6 rounded-full bg-simas-dark text-white flex items-center justify-center text-xs font-bold">1</span>
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Fonte de Dados Principal</label>
                      </div>
                      <select 
                        className="w-full md:w-1/2 p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white outline-none transition-all focus:ring-2 focus:ring-simas-light/20"
                        value={customEntity}
                        onChange={(e) => setCustomEntity(e.target.value)}
                      >
                          <option value="">Selecione uma tabela...</option>
                          {availableEntities.map(key => (
                              <option key={key} value={key}>{ENTITY_CONFIGS[key].title}</option>
                          ))}
                      </select>
                  </div>

                  {/* ETAPA 2: CRUZAMENTO DE DADOS (JOINS) */}
                  {customEntity && availableJoins.length > 0 && (
                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                          <div className="flex items-center gap-2 mb-3">
                              <span className="w-6 h-6 rounded-full bg-simas-blue text-white flex items-center justify-center text-xs font-bold">2</span>
                              <label className="text-xs font-bold text-blue-700 uppercase tracking-widest">Cruzar dados com (Joins)</label>
                          </div>
                          <div className="flex flex-wrap gap-3">
                              {availableJoins.map(joinEntity => (
                                  <label key={joinEntity} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all border ${selectedJoins.includes(joinEntity) ? 'bg-white border-simas-blue shadow-sm' : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'}`}>
                                      <input 
                                          type="checkbox" 
                                          checked={selectedJoins.includes(joinEntity)}
                                          onChange={(e) => {
                                              if (e.target.checked) setSelectedJoins([...selectedJoins, joinEntity]);
                                              else setSelectedJoins(selectedJoins.filter(j => j !== joinEntity));
                                          }}
                                          className="text-simas-blue rounded focus:ring-simas-blue"
                                      />
                                      <span className="text-sm font-medium text-gray-700">{ENTITY_CONFIGS[joinEntity]?.title || joinEntity}</span>
                                  </label>
                              ))}
                          </div>
                          <p className="text-[10px] text-blue-400 mt-2 italic">* Apenas tabelas relacionadas diretamente disponíveis.</p>
                      </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* ETAPA 3: COLUNAS */}
                      <div>
                          <div className="flex items-center gap-2 mb-2">
                              <span className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold">3</span>
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Colunas ({selectedColumns.length})</label>
                          </div>
                          <div className="w-full h-48 border border-gray-200 rounded-xl bg-gray-50 overflow-y-auto p-2 custom-scrollbar">
                              {availableColumns.map(col => {
                                  // Separar Tabela.Coluna para visualização melhor
                                  const [table, field] = col.split('.');
                                  const isPrimary = table === customEntity;
                                  
                                  return (
                                      <label key={col} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-100 p-1.5 rounded border-b border-gray-100 last:border-0">
                                          <input 
                                            type="checkbox" 
                                            checked={selectedColumns.includes(col)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedColumns([...selectedColumns, col]);
                                                else setSelectedColumns(selectedColumns.filter(c => c !== col));
                                            }}
                                            className="text-simas-cyan rounded"
                                          />
                                          <span className={`font-bold ${isPrimary ? 'text-simas-dark' : 'text-gray-500'}`}>{table}</span>
                                          <span className="text-gray-400">/</span>
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
                                      <select className="flex-1 p-2 rounded-lg border border-gray-200 text-xs" value={newFilter.field} onChange={e => setNewFilter({...newFilter, field: e.target.value})}>
                                          <option value="">Campo...</option>
                                          {availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
                                      </select>
                                      <select className="w-24 p-2 rounded-lg border border-gray-200 text-xs" value={newFilter.operator} onChange={e => setNewFilter({...newFilter, operator: e.target.value})}>
                                          <option value="contains">Contém</option>
                                          <option value="equals">Igual</option>
                                          <option value="starts">Começa</option>
                                      </select>
                                      <input type="text" placeholder="Valor..." className="flex-1 p-2 rounded-lg border border-gray-200 text-xs" value={newFilter.value} onChange={e => setNewFilter({...newFilter, value: e.target.value})} />
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
                                              {col}
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

  return (
    <div className="flex h-full overflow-hidden">
        {/* SIDEBAR DE RELATÓRIOS */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-y-auto flex-none z-10">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-extrabold text-simas-dark tracking-tight">Relatórios</h2>
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
            <div className="max-w-7xl mx-auto animate-slide-in pb-10">
                <header className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-simas-dark">{validReports.find(r => r.id === currentReport)?.label}</h1>
                        <p className="text-gray-500 mt-2">
                            {currentReport === 'customGenerator' ? 'Crie consultas personalizadas cruzando dados do sistema.' : 'Visualização atualizada do sistema.'}
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
