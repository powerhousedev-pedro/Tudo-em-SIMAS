
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ReportData, QuantitativoItem, UserSession } from '../types';
import { Button } from './Button';
import { REPORT_PERMISSIONS } from '../constants';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const Reports: React.FC = () => {
  // Mock session retrieval - replace with Context
  const getSession = (): UserSession => {
      const stored = localStorage.getItem('simas_user_session');
      if (stored) {
          try { return JSON.parse(stored); } catch (e) {}
      }
      return { token: '', papel: 'GGT', usuario: '', isGerente: false };
  }; 
  const session = getSession();

  const allReports = [
      { id: 'dashboardPessoal', label: 'Dashboard de Pessoal', category: 'Gerencial' },
      { id: 'painelVagas', label: 'Painel de Vagas', category: 'Operacional' },
      { id: 'contratosAtivos', label: 'Contratos Ativos', category: 'Operacional' },
      { id: 'quadroLotacaoServidores', label: 'Quadro de Lotação (Serv.)', category: 'Operacional' },
      { id: 'adesaoFrequencia', label: 'Adesão e Frequência', category: 'Operacional' },
      { id: 'analiseCustos', label: 'Análise de Custos', category: 'Gerencial' },
      { id: 'perfilDemografico', label: 'Perfil Demográfico', category: 'Análise Social' },
      { id: 'atividadeUsuarios', label: 'Atividade de Usuários', category: 'Administrativo' },
  ];

  // Filter reports based on role
  const allowedIds = REPORT_PERMISSIONS[session.papel] || [];
  const reportsList = allReports.filter(r => allowedIds.includes(r.id) || allowedIds.includes('TODAS'));

  const [currentReport, setCurrentReport] = useState(reportsList[0]?.id || '');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [vagasView, setVagasView] = useState<'quantitativo' | 'panorama'>('quantitativo');

  useEffect(() => {
    if (!currentReport) return;
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

  const handleExportPDF = () => {
    if (!data) return;

    const doc = new jsPDF();
    const reportTitle = reportsList.find(r => r.id === currentReport)?.label || 'Relatório';
    const today = new Date().toLocaleDateString('pt-BR');

    // Header
    doc.setFillColor(19, 51, 90); // Simas Dark
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(reportTitle, 14, 13);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, 150, 13);

    let currentY = 30;

    // Totals Section (Simple Text)
    if (data.totais) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text("Resumo Geral:", 14, currentY);
        currentY += 7;
        
        const keys = Object.keys(data.totais);
        keys.forEach(key => {
            doc.setFontSize(10);
            doc.text(`${key}: ${data.totais![key]}`, 14, currentY);
            currentY += 6;
        });
        currentY += 5;
    }

    // Special Handling for Painel Vagas
    if (currentReport === 'painelVagas') {
        if (vagasView === 'quantitativo' && data.quantitativo) {
            autoTable(doc, {
                startY: currentY,
                head: [['Vinculação', 'Lotação', 'Cargo', 'Detalhes']],
                body: data.quantitativo.map(item => [item.VINCULACAO, item.LOTACAO, item.CARGO, item.DETALHES]),
                theme: 'grid',
                headStyles: { fillColor: [42, 104, 143] }
            });
        } else if (data.panorama) {
            autoTable(doc, {
                startY: currentY,
                head: [['Ocupante', 'Vinculação', 'Lotação', 'Cargo', 'Status']],
                body: data.panorama.map(item => [item.OCUPANTE || 'Vaga Livre', item.VINCULACAO, item.LOTACAO_OFICIAL, item.NOME_CARGO, item.STATUS]),
                theme: 'grid',
                headStyles: { fillColor: [42, 104, 143] }
            });
        }
    }
    // Generic Table Handling
    else if ((data.colunas && data.linhas) || data.tabela) {
        const cols = data.colunas || data.tabela?.colunas || [];
        const rows = data.linhas || data.tabela?.linhas || [];
        
        autoTable(doc, {
            startY: currentY,
            head: [cols],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [42, 104, 143] }
        });
    }

    doc.save(`${reportTitle.replace(/\s+/g, '_')}_${today}.pdf`);
  };

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

  const renderContent = () => {
      if (!data) return null;

      if (currentReport === 'painelVagas') {
          return (
              <div className="space-y-6">
                  <div className="flex gap-2 bg-white p-2 rounded-lg shadow-sm border border-gray-100 w-fit">
                      <button 
                        onClick={() => setVagasView('quantitativo')} 
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${vagasView === 'quantitativo' ? 'bg-simas-blue text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                          <i className="fas fa-list-ol mr-2"></i> Quantitativo
                      </button>
                      <button 
                        onClick={() => setVagasView('panorama')} 
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${vagasView === 'panorama' ? 'bg-simas-blue text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                          <i className="fas fa-table mr-2"></i> Panorama
                      </button>
                  </div>

                  {vagasView === 'quantitativo' && data.quantitativo ? (
                      renderQuantitativoGrouped(data.quantitativo)
                  ) : null}

                  {vagasView === 'panorama' && data.panorama ? (
                      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 overflow-x-auto">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                              <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                                  <tr>
                                      <th className="px-6 py-3">Ocupante / Status</th>
                                      <th className="px-6 py-3">Vinculação</th>
                                      <th className="px-6 py-3">Lotação Oficial</th>
                                      <th className="px-6 py-3">Cargo</th>
                                      <th className="px-6 py-3">Status</th>
                                      <th className="px-6 py-3">Reservada Para</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {data.panorama.map((row: any, i: number) => (
                                      <tr key={i} className="hover:bg-gray-50/50">
                                          <td className="px-6 py-3 font-bold">{row.OCUPANTE}</td>
                                          <td className="px-6 py-3">{row.VINCULACAO}</td>
                                          <td className="px-6 py-3">{row.LOTACAO_OFICIAL}</td>
                                          <td className="px-6 py-3">{row.NOME_CARGO}</td>
                                          <td className="px-6 py-3">
                                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                  row.STATUS === 'Disponível' ? 'bg-green-100 text-green-800' : 
                                                  row.STATUS === 'Ocupada' ? 'bg-gray-100 text-gray-800' : 
                                                  row.STATUS === 'Em Aviso Prévio' ? 'bg-yellow-100 text-yellow-800' :
                                                  'bg-blue-100 text-blue-800'}`}>
                                                  {row.STATUS}
                                              </span>
                                          </td>
                                          <td className="px-6 py-3">{row.RESERVADA_PARA || '-'}</td>
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
                              <p className="text-4xl font-extrabold text-simas-dark">{val}</p>
                          </div>
                      ))}
                  </div>
              )}

              {data.graficos && (
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.graficos}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                              <Legend />
                              <Bar dataKey="value" fill="#2a688f" radius={[4, 4, 0, 0]} />
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              )}

              {((data.colunas && data.linhas) || data.tabela) && (
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                      <div className="px-6 py-4 border-b border-gray-100 font-bold text-simas-dark bg-gray-50/50">
                          Detalhes
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left whitespace-nowrap">
                              <thead className="bg-gray-50 text-gray-600 font-bold uppercase text-xs">
                                  <tr>
                                      {(data.colunas || data.tabela?.colunas || []).map((col, idx) => (
                                          <th key={idx} className="px-6 py-3">{col}</th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {(data.linhas || data.tabela?.linhas || []).map((row, i) => (
                                      <tr key={i} className="hover:bg-gray-50/50">
                                          {row.map((cell, j) => (
                                              <td key={j} className="px-6 py-3">{cell}</td>
                                          ))}
                                      </tr>
                                  ))}
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
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-extrabold text-simas-dark tracking-tight">Relatórios</h2>
                <p className="text-xs text-gray-400 mt-1">Selecione uma visão</p>
            </div>
            <div className="p-4 space-y-6">
                {['Gerencial', 'Operacional', 'Análise Social', 'Administrativo'].map(cat => {
                    const catReports = reportsList.filter(r => r.category === cat);
                    if (catReports.length === 0) return null;
                    return (
                        <div key={cat}>
                            <h3 className="px-3 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{cat}</h3>
                            <div className="space-y-1">
                                {catReports.map(rep => (
                                    <button 
                                        key={rep.id} 
                                        onClick={() => setCurrentReport(rep.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${currentReport === rep.id ? 'bg-simas-blue/10 text-simas-blue' : 'text-gray-600 hover:bg-gray-50 hover:text-simas-dark'}`}
                                    >
                                        {rep.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-12 h-12 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-simas-blue font-medium animate-pulse">Carregando dados...</p>
                </div>
            ) : (
                <div className="max-w-7xl mx-auto animate-slide-in">
                    <header className="mb-8 flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-simas-dark">{reportsList.find(r => r.id === currentReport)?.label || 'Selecione um Relatório'}</h1>
                            <p className="text-gray-500 mt-2">Visualização atualizada do sistema.</p>
                        </div>
                        <Button onClick={handleExportPDF} icon="fas fa-file-pdf">
                            Exportar PDF
                        </Button>
                    </header>
                    {renderContent()}
                </div>
            )}
        </div>
    </div>
  );
};
