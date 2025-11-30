import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { ENTITY_CONFIGS, DATA_MODEL } from '../constants';
import { validation } from '../utils/validation';
import { UserSession, AppContextProps } from '../types';

interface HistoryProps extends AppContextProps {}

const VIEWS = [
    { id: 'AUDITORIA', label: 'Auditoria e Arquivo Morto', icon: 'fas fa-shield-alt' }
];

export const History: React.FC<HistoryProps> = ({ showToast }) => {
    // --- SESSION & PERMISSION LOGIC ---
    const getSession = (): UserSession => {
        const stored = localStorage.getItem('simas_user_session');
        if (stored) {
            try { return JSON.parse(stored); } catch (e) {}
        }
        return { token: '', papel: 'GGT', usuario: '', isGerente: false };
    };
    const session = getSession();

    // Logic: Audit visible ONLY for Managers/Coordinators
    // Operacionais não veem Auditoria
    const canAccess = session.papel === 'COORDENAÇÃO' || session.isGerente;

    const [currentView, setCurrentView] = useState('AUDITORIA');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // UI State for specific actions
    const [restoringId, setRestoringId] = useState<string | null>(null); // Controls Spinner
    const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null); // Controls Modal

    // Modal State
    const [selectedAudit, setSelectedAudit] = useState<any | null>(null);

    // Global Search
    const [globalSearch, setGlobalSearch] = useState('');

    // Excel-style Filter State: { column_key: [selected_values] }
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);

    // Click outside to close filter dropdown
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setOpenFilterCol(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (canAccess) {
            loadData();
            setActiveFilters({});
            setGlobalSearch('');
        }
    }, [canAccess]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.fetchEntity('Auditoria');
            // Ordenar por data decrescente
            res.sort((a: any, b: any) => new Date(b.DATA_HORA).getTime() - new Date(a.DATA_HORA).getTime());
            setData(res);
        } catch (e) {
            showToast('error', `Erro ao carregar auditoria.`);
        } finally {
            setLoading(false);
        }
    };

    // Abre o modal de confirmação
    const initiateRestore = (id: string) => {
        setPendingRestoreId(id);
    };

    // Executa a ação real após confirmação no modal
    const executeRestore = async () => {
        if (!pendingRestoreId) return;
        
        setRestoringId(pendingRestoreId);
        try {
            const res = await api.restoreAuditLog(pendingRestoreId);

            if (res.success) {
                showToast('success', res.message);
                setPendingRestoreId(null); // Fecha o modal apenas no sucesso
                loadData();
            } else {
                showToast('error', res.message || 'Não foi possível restaurar.');
            }
        } catch (e: any) {
            showToast('error', e.message || 'Erro de conexão.');
        } finally {
            setRestoringId(null);
        }
    };

    // --- Dynamic Column Logic ---
    const columns = useMemo(() => {
        return ['DATA_HORA', 'USUARIO', 'ACAO', 'TABELA_AFETADA', 'ID_REGISTRO_AFETADO', 'DETALHES'];
    }, []);

    // --- Filter Logic ---

    const getUniqueValues = (key: string) => {
        const values = data.map(item => {
            if (key === 'DETALHES') return null; 
            return String(item[key] || '');
        }).filter(v => v !== null);
        return [...new Set(values)].sort();
    };

    const toggleFilterValue = (column: string, value: string) => {
        setActiveFilters(prev => {
            const current = prev[column] || [];
            if (current.includes(value)) {
                return { ...prev, [column]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [column]: [...current, value] };
            }
        });
    };

    const clearFilter = (column: string) => {
        setActiveFilters(prev => {
            const next = { ...prev };
            delete next[column];
            return next;
        });
    };

    const filteredData = useMemo(() => {
        return data.filter(item => {
            // 1. Global Search
            const searchStr = globalSearch.toLowerCase();
            const matchesSearch = !globalSearch || Object.values(item).some(val => 
                String(val).toLowerCase().includes(searchStr)
            );

            if (!matchesSearch) return false;

            // 2. Column Filters (Excel Style)
            const matchesFilters = Object.keys(activeFilters).every((key) => {
                const selectedValues = activeFilters[key];
                if (!selectedValues || selectedValues.length === 0) return true;
                return selectedValues.includes(String(item[key] || ''));
            });

            return matchesFilters;
        });
    }, [data, globalSearch, activeFilters]);

    // --- Sub-Component for Header with Filter ---
    const FilterHeader: React.FC<{ label: string, columnKey: string }> = ({ label, columnKey }) => {
        if (columnKey === 'DETALHES') {
             return <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Detalhes</th>;
        }

        const isOpen = openFilterCol === columnKey;
        const uniqueValues = getUniqueValues(columnKey);
        const selectedValues = activeFilters[columnKey] || [];
        const isFiltered = selectedValues.length > 0;

        return (
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider relative group select-none">
                <div className="flex items-center justify-between cursor-pointer hover:bg-gray-100/50 rounded p-1 -ml-1 transition-colors" onClick={() => setOpenFilterCol(isOpen ? null : columnKey)}>
                    <span className={isFiltered ? 'text-simas-accent' : ''}>{label}</span>
                    <button className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${isFiltered ? 'text-simas-accent' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`}>
                        <i className={`fas ${isFiltered ? 'fa-filter' : 'fa-chevron-down'} text-[10px]`}></i>
                    </button>
                </div>

                {isOpen && (
                    <div ref={filterRef} className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 animate-fade-in overflow-hidden flex flex-col max-h-[300px]">
                        <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-600">Filtrar por {label}</span>
                            {isFiltered && <button onClick={(e) => { e.stopPropagation(); clearFilter(columnKey); }} className="text-[10px] text-red-500 hover:underline">Limpar</button>}
                        </div>
                        <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {uniqueValues.map(val => (
                                <label key={val} className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={(e) => e.stopPropagation()}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${selectedValues.includes(String(val)) ? 'bg-simas-accent border-simas-accent' : 'bg-white border-gray-300'}`}>
                                        {selectedValues.includes(String(val)) && <i className="fas fa-check text-white text-[10px]"></i>}
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        className="hidden"
                                        checked={selectedValues.includes(String(val))}
                                        onChange={() => toggleFilterValue(columnKey, String(val))}
                                    />
                                    <span className="text-xs text-gray-700 truncate">{val === '' ? '(Vazio)' : val}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </th>
        );
    };

    const renderCell = (item: any, col: string) => {
        if (col === 'DETALHES') {
             return (
                <button 
                    onClick={() => setSelectedAudit(item)}
                    className="px-4 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-bold text-simas-dark hover:border-simas-cyan hover:text-simas-cyan transition-all flex items-center gap-2"
                >
                    <i className="fas fa-eye text-[10px]"></i> Ver
                </button>
             );
        }
        if (col === 'DATA_HORA') return new Date(item[col]).toLocaleString('pt-BR');
        if (col === 'ACAO') {
            return (
                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide
                    ${item.ACAO === 'CRIAR' ? 'bg-green-100 text-green-700' : 
                      item.ACAO === 'EDITAR' ? 'bg-blue-100 text-blue-700' : 
                      item.ACAO === 'EXCLUIR' ? 'bg-red-100 text-red-700' : 
                      item.ACAO === 'ARQUIVAR' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                      item.ACAO === 'INATIVAR' ? 'bg-gray-200 text-gray-700 border border-gray-300' :
                      item.ACAO === 'RESTAURAR' ? 'bg-cyan-100 text-cyan-700 border border-cyan-200' :
                      'bg-gray-100 text-gray-700'}
                `}>
                    {item.ACAO}
                </span>
            );
        }

        let val = item[col];
        return <span className="text-sm text-gray-600 truncate block max-w-[200px]" title={String(val)}>{val}</span>;
    };

    // --- Modal Render Logic ---
    const renderAuditModal = () => {
        if (!selectedAudit) return null;

        const action = selectedAudit.ACAO;
        let oldData: any = {};
        let newData: any = {};
        
        try { oldData = JSON.parse(selectedAudit.VALOR_ANTIGO || '{}'); } catch(e){}
        try { newData = JSON.parse(selectedAudit.VALOR_NOVO || '{}'); } catch(e){}

        // Cores baseadas na ação
        let cardClass = "bg-white border-gray-200"; 
        let headerIcon = "fa-pen text-simas-blue";
        
        if (action === 'CRIAR') {
            cardClass = "bg-green-50 border-green-200";
            headerIcon = "fa-plus-circle text-green-600";
        } else if (action === 'EXCLUIR') {
            cardClass = "bg-red-50 border-red-200";
            headerIcon = "fa-trash-alt text-red-600";
        } else if (action === 'ARQUIVAR') {
            cardClass = "bg-orange-50 border-orange-200";
            headerIcon = "fa-archive text-orange-600";
        } else if (action === 'INATIVAR') {
            cardClass = "bg-gray-100 border-gray-300";
            headerIcon = "fa-user-slash text-gray-600";
        } else if (action === 'RESTAURAR') {
            cardClass = "bg-cyan-50 border-cyan-200";
            headerIcon = "fa-undo text-cyan-600";
        }

        // Para Restaurar ou Criar, mostramos o VALOR_NOVO. Para os outros, VALOR_ANTIGO.
        const dataDisplay = (action === 'EXCLUIR' || action === 'ARQUIVAR' || action === 'INATIVAR') ? oldData : (action === 'CRIAR' || action === 'RESTAURAR' ? newData : { ...oldData, ...newData });
        const keys = Object.keys(dataDisplay).sort();

        // Extrai metadados importantes para mostrar no topo
        const motivo = oldData.MOTIVO_ARQUIVAMENTO || oldData.MOTIVO_INATIVACAO || oldData.MOTIVO_MUDANCA || newData.MOTIVO_ARQUIVAMENTO;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
                 <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${cardClass} border-2 animate-slide-in`}>
                    
                    {/* Header do Card */}
                    <div className="p-5 border-b border-black/5 flex justify-between items-center bg-white/60 backdrop-blur-sm">
                        <div>
                            <h3 className="font-bold text-lg text-simas-dark flex items-center gap-2">
                                <i className={`fas ${headerIcon}`}></i>
                                {action}: {selectedAudit.TABELA_AFETADA}
                            </h3>
                            {motivo && (
                                <p className="text-sm font-bold text-gray-800 mt-1">
                                    Motivo: "{motivo}"
                                </p>
                            )}
                        </div>
                        <button onClick={() => setSelectedAudit(null)} className="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors text-gray-500"><i className="fas fa-times"></i></button>
                    </div>

                    {/* Conteúdo Scrollável */}
                    <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                        {keys.map(key => {
                            if (key === 'ID_LOG' || key === 'DATA_CRIACAO') return null; 

                            let content;
                            
                            if (action === 'EDITAR') {
                                const oldVal = oldData[key];
                                const newVal = newData[key];
                                const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);

                                if (hasChanged) {
                                    content = (
                                        <div className="flex flex-col items-start bg-white/50 p-2 rounded border border-black/5 mt-1">
                                            <span className="line-through text-gray-400 text-xs mb-1 select-none" title="Valor Antigo">
                                                {String(oldVal === null || oldVal === undefined ? '(Vazio)' : oldVal)}
                                            </span>
                                            <span className="text-red-600 font-bold text-sm" title="Valor Novo">
                                                {String(newVal === null || newVal === undefined ? '(Vazio)' : newVal)}
                                            </span>
                                        </div>
                                    );
                                } else {
                                    content = <span className="text-gray-600 font-medium text-sm">{String(newVal === null || newVal === undefined ? '' : newVal)}</span>;
                                }
                            } else {
                                const val = dataDisplay[key];
                                content = <span className="text-gray-800 font-medium text-sm">{String(val === null || val === undefined ? '' : val)}</span>;
                            }

                            return (
                                <div key={key} className="flex flex-col border-b border-black/5 last:border-0 pb-3 last:pb-0">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{key.replace(/_/g, ' ')}</span>
                                    {content}
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer com Metadados */}
                    <div className="p-4 bg-gray-50/80 border-t border-black/5 text-xs text-gray-500 flex justify-between">
                        <span>Usuário: <strong>{selectedAudit.USUARIO}</strong></span>
                        <span>{new Date(selectedAudit.DATA_HORA).toLocaleString()}</span>
                    </div>
                 </div>
            </div>
        );
    };

    if (!canAccess) {
        return (
            <div className="flex h-full items-center justify-center bg-gray-50">
                <div className="text-center">
                    <i className="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                    <h2 className="text-xl font-bold text-gray-500">Acesso Restrito</h2>
                    <p className="text-sm text-gray-400">Você não tem permissão para acessar a auditoria.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full bg-gray-50 overflow-hidden">
            
            {/* Sidebar Navigation */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-none z-20 shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-black text-simas-dark tracking-brand uppercase leading-none">Arquivo Central</h2>
                    <p className="text-xs text-gray-400 mt-1">Histórico e Auditoria</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {VIEWS.map(view => (
                        <button
                            key={view.id}
                            onClick={() => setCurrentView(view.id)}
                            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 group
                                ${currentView === view.id 
                                    ? 'bg-simas-dark text-white shadow-lg shadow-simas-dark/20' 
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-simas-dark'}
                            `}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${currentView === view.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-simas-accent group-hover:shadow-sm'}`}>
                                <i className={view.icon}></i>
                            </div>
                            <span className="font-bold text-sm">{view.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <div className="px-8 py-6 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
                    <div>
                        <h1 className="text-2xl font-black text-simas-dark uppercase tracking-brand">Auditoria do Sistema</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {filteredData.length} registros encontrados
                        </p>
                    </div>
                    
                    <div className="relative w-80">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input 
                            type="text" 
                            placeholder="Pesquisar..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-simas-light/30 focus:bg-white transition-all outline-none"
                            value={globalSearch}
                            onChange={(e) => setGlobalSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table Container */}
                <div className="flex-1 overflow-auto p-8">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible min-h-[400px] relative">
                        {loading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20">
                                <i className="fas fa-circle-notch fa-spin text-3xl text-simas-medium mb-3"></i>
                                <p className="text-gray-400 font-medium">Carregando dados...</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                        {columns.map(col => (
                                            <FilterHeader 
                                                key={col} 
                                                columnKey={col} 
                                                label={col.replace(/_/g, ' ')} 
                                            />
                                        ))}
                                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Restaurar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredData.length === 0 ? (
                                        <tr>
                                            <td colSpan={columns.length + 1} className="px-6 py-12 text-center text-gray-400 italic">
                                                Nenhum registro encontrado.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredData.map((item, idx) => {
                                            const isRestorable = item.ACAO === 'EXCLUIR' || item.ACAO === 'ARQUIVAR' || item.ACAO === 'INATIVAR';
                                            return (
                                                <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                                    {columns.map(col => (
                                                        <td key={col} className="px-6 py-4 whitespace-nowrap">
                                                            {renderCell(item, col)}
                                                        </td>
                                                    ))}
                                                    <td className="px-6 py-4 text-right">
                                                        {isRestorable && (
                                                            <button 
                                                                onClick={() => initiateRestore(item.ID_LOG)}
                                                                className={`p-2 rounded-lg transition-all ${item.ACAO === 'ARQUIVAR' || item.ACAO === 'INATIVAR' ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:text-orange-500 hover:bg-orange-50'}`}
                                                                title={item.ACAO === 'ARQUIVAR' ? "Desarquivar" : "Desfazer Exclusão"}
                                                            >
                                                                <i className={`fas ${item.ACAO === 'ARQUIVAR' || item.ACAO === 'INATIVAR' ? 'fa-box-open' : 'fa-undo'}`}></i>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {renderAuditModal()}

            {pendingRestoreId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in px-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-white/20 animate-slide-in">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4 border border-yellow-100">
                                <i className="fas fa-history text-2xl text-yellow-500"></i>
                            </div>
                            <h3 className="text-xl font-extrabold text-simas-dark mb-2">Confirmar Restauração</h3>
                            <p className="text-sm text-gray-500 mb-6 px-4 leading-relaxed">
                                Você está prestes a restaurar este registro do arquivo/auditoria para a lista ativa. O registro de log será removido após a restauração.
                            </p>
                            
                            <div className="flex gap-3 w-full">
                                <Button 
                                    variant="secondary" 
                                    onClick={() => setPendingRestoreId(null)}
                                    className="flex-1 justify-center"
                                    disabled={!!restoringId}
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    onClick={executeRestore} 
                                    isLoading={!!restoringId}
                                    className="flex-1 justify-center"
                                >
                                    Restaurar
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};