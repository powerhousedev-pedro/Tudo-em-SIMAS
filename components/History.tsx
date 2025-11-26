
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { AppContextProps } from '../App';
import { ENTITY_CONFIGS, DATA_MODEL } from '../constants';
import { validation } from '../utils/validation';
import { UserSession } from '../types';

interface HistoryProps extends AppContextProps {}

const VIEWS = [
    { id: 'AUDITORIA', label: 'Auditoria do Sistema', icon: 'fas fa-shield-alt' },
    { id: 'CONTRATO_HISTORICO', label: 'Histórico de Contratos', icon: 'fas fa-file-contract' },
    { id: 'ALOCACAO_HISTORICO', label: 'Histórico de Alocações', icon: 'fas fa-map-marked-alt' },
    { id: 'INATIVOS', label: 'Arquivo de Inativos', icon: 'fas fa-archive' }
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

    // Logic: Audit visible only for Managers or Coordination
    const allowedViews = useMemo(() => {
        const isAllowedAudit = session.papel === 'COORDENAÇÃO' || session.isGerente;
        return VIEWS.filter(view => {
            if (view.id === 'AUDITORIA' && !isAllowedAudit) return false;
            return true;
        });
    }, [session.papel, session.isGerente]);

    const [currentView, setCurrentView] = useState(allowedViews[0]?.id || '');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
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
        if (currentView) {
            loadData();
            setActiveFilters({});
            setGlobalSearch('');
        }
    }, [currentView]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.fetchEntity(currentView);
            // Default Sort: Try DATE fields or fallback to index
            if (res.length > 0) {
                const dateKeys = Object.keys(res[0]).filter(k => k.includes('DATA') || k === 'DATE');
                if (dateKeys.length > 0) {
                    const key = dateKeys[0];
                    res.sort((a: any, b: any) => new Date(b[key]).getTime() - new Date(a[key]).getTime());
                }
            }
            setData(res);
        } catch (e) {
            showToast('error', `Erro ao carregar dados de ${currentView}.`);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (idLog: string) => {
        if (!window.confirm('Deseja realmente desfazer esta ação? O registro voltará ao estado anterior.')) return;
        try {
            const res = await api.restoreAuditLog(idLog);
            if (res.success) {
                showToast('success', res.message);
                loadData();
            } else {
                showToast('error', 'Não foi possível restaurar.');
            }
        } catch (e) {
            showToast('error', 'Erro de conexão.');
        }
    };

    // --- Dynamic Column Logic ---
    const columns = useMemo(() => {
        if (currentView === 'AUDITORIA') {
             return ['DATA_HORA', 'USUARIO', 'ACAO', 'TABELA_AFETADA', 'ID_REGISTRO_AFETADO', 'DETALHES'];
        }
        // For other views, use keys from DATA_MODEL if available, else infer from first item
        if (DATA_MODEL[currentView]) {
            return DATA_MODEL[currentView];
        }
        if (data.length > 0) {
            return Object.keys(data[0]).filter(k => k !== 'hidden');
        }
        return [];
    }, [currentView, data]);

    // --- Filter Logic ---

    const getUniqueValues = (key: string) => {
        const values = data.map(item => {
            // Special handling for Auditoria Details which are complex objects rendered differently
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
        // Skip filtering for complex/computed columns or specifically Details in Audit
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
        // Special Audit Rendering
        if (currentView === 'AUDITORIA') {
            if (col === 'DETALHES') {
                 if (item.ACAO === 'EDITAR') {
                    return (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="line-through text-red-400 bg-red-50 px-1 rounded text-xs">{item.VALOR_ANTIGO || 'Vazio'}</span>
                            <i className="fas fa-arrow-right text-[10px] text-gray-300"></i>
                            <span className="text-green-600 bg-green-50 px-1 rounded font-medium text-xs">{item.VALOR_NOVO}</span>
                        </div>
                    );
                 }
                 return <span className="text-gray-400 italic text-xs">Ação estrutural</span>;
            }
            if (col === 'DATA_HORA') return new Date(item[col]).toLocaleString('pt-BR');
            if (col === 'ACAO') {
                return (
                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide
                        ${item.ACAO === 'CRIAR' ? 'bg-green-100 text-green-700' : 
                          item.ACAO === 'EDITAR' ? 'bg-blue-100 text-blue-700' : 
                          item.ACAO === 'EXCLUIR' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}
                    `}>
                        {item.ACAO}
                    </span>
                );
            }
        }

        // Generic Rendering
        let val = item[col];
        
        // Date Formatting
        if (typeof val === 'string' && (col.includes('DATA') || col.match(/^\d{4}-\d{2}-\d{2}/))) {
             // Simple regex check for ISO date or YYYY-MM-DD
             if (val.match(/^\d{4}-\d{2}-\d{2}/)) {
                 try { val = new Date(val).toLocaleDateString('pt-BR'); } catch(e){}
             }
        }

        // CPF Formatting
        if (col === 'CPF' && val) val = validation.formatCPF(val);
        
        return <span className="text-sm text-gray-600 truncate block max-w-[200px]" title={String(val)}>{val}</span>;
    };

    return (
        <div className="flex h-full bg-gray-50 overflow-hidden">
            
            {/* Sidebar Navigation */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-none z-20 shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-black text-simas-dark tracking-tight leading-none">Arquivo Morto</h2>
                    <p className="text-xs text-gray-400 mt-1">Consultas históricas</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {allowedViews.map(view => (
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
                        <h1 className="text-2xl font-bold text-simas-dark">{VIEWS.find(v => v.id === currentView)?.label}</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {data.length} registros encontrados
                            {Object.keys(activeFilters).length > 0 && <span className="text-simas-accent ml-2 font-medium">(Filtrado)</span>}
                        </p>
                    </div>
                    
                    {/* Global Search Bar */}
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
                                        {currentView === 'AUDITORIA' && <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredData.length === 0 ? (
                                        <tr>
                                            <td colSpan={columns.length + (currentView === 'AUDITORIA' ? 1 : 0)} className="px-6 py-12 text-center text-gray-400 italic">
                                                Nenhum registro encontrado.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredData.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                                {columns.map(col => (
                                                    <td key={col} className="px-6 py-4 whitespace-nowrap">
                                                        {renderCell(item, col)}
                                                    </td>
                                                ))}
                                                {currentView === 'AUDITORIA' && (
                                                    <td className="px-6 py-4 text-right">
                                                        {(item.ACAO === 'EDITAR' || item.ACAO === 'EXCLUIR') && (
                                                            <button 
                                                                onClick={() => handleRestore(item.ID_LOG)}
                                                                className="text-gray-300 hover:text-orange-500 hover:bg-orange-50 p-2 rounded-lg transition-all"
                                                                title="Reverter Alteração"
                                                            >
                                                                <i className="fas fa-undo"></i>
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
