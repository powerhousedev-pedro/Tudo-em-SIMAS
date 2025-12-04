import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { ENTITY_CONFIGS, DATA_MODEL, FIELD_LABELS } from '../constants';
import { validation } from '../utils/validation';
import { UserSession, AppContextProps } from '../types';

interface HistoryProps extends AppContextProps {}

// Definição das Abas disponíveis
const AVAILABLE_VIEWS = [
    { 
        id: 'AUDITORIA', 
        label: 'Auditoria Geral', 
        entity: 'Auditoria', 
        icon: 'fas fa-shield-alt',
        requiresAdmin: true 
    },
    { 
        id: 'CONTRATOS', 
        label: 'Contratos Arquivados', 
        entity: 'ContratoHistorico', 
        icon: 'fas fa-file-contract',
        requiresAdmin: false,
        roles: ['GPRGP']
    },
    { 
        id: 'INATIVOS', 
        label: 'Servidores Inativos', 
        entity: 'Inativo', 
        icon: 'fas fa-user-slash',
        requiresAdmin: false,
        roles: ['GGT']
    },
    { 
        id: 'ALOCACOES', 
        label: 'Histórico de Alocações', 
        entity: 'AlocacaoHistorico', 
        icon: 'fas fa-exchange-alt',
        requiresAdmin: false,
        roles: ['GGT', 'GPRGP']
    }
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

    const isAdmin = session.papel === 'COORDENAÇÃO' || session.isGerente;

    // Filtra quais abas o usuário pode ver
    const tabs = useMemo(() => {
        return AVAILABLE_VIEWS.filter(view => {
            // Auditoria só para Admins
            if (view.requiresAdmin && !isAdmin) return false;
            
            // Se for admin, vê tudo
            if (isAdmin) return true;

            // Filtra por papel específico
            if (view.roles && view.roles.includes(session.papel)) return true;
            
            return false;
        });
    }, [session.papel, isAdmin]);

    const [currentView, setCurrentView] = useState(tabs[0]?.id || '');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // UI State for specific actions
    const [restoringId, setRestoringId] = useState<string | null>(null); 
    const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

    // Modal State
    const [selectedAudit, setSelectedAudit] = useState<any | null>(null);

    // Global Search
    const [globalSearch, setGlobalSearch] = useState('');
    const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
    const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
    const [filterSearch, setFilterSearch] = useState(''); // New state for filter dropdown search
    const filterRef = useRef<HTMLDivElement>(null);

    // Atualiza a view padrão se a lista de tabs mudar
    useEffect(() => {
        if (!tabs.find(t => t.id === currentView) && tabs.length > 0) {
            setCurrentView(tabs[0].id);
        }
    }, [tabs]);

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
            setOpenFilterCol(null);
        }
    }, [currentView]);

    const getEntityForView = () => {
        const view = tabs.find(t => t.id === currentView);
        return view ? view.entity : 'Auditoria';
    };

    const loadData = async () => {
        setLoading(true);
        const entity = getEntityForView();
        try {
            const res = await api.fetchEntity(entity);
            // Ordenar por data decrescente (tentativa genérica)
            res.sort((a: any, b: any) => {
                const dateA = a.DATA_HORA || a.DATA_ARQUIVAMENTO || a.DATA_INATIVACAO || a.DATA_FIM || '';
                const dateB = b.DATA_HORA || b.DATA_ARQUIVAMENTO || b.DATA_INATIVACAO || b.DATA_FIM || '';
                return new Date(dateB).getTime() - new Date(dateA).getTime();
            });
            setData(res);
        } catch (e) {
            showToast('error', `Erro ao carregar dados.`);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    // --- RESTORE LOGIC (Only for Audit View) ---
    const executeRestore = async () => {
        if (!pendingRestoreId) return;
        setRestoringId(pendingRestoreId);
        try {
            const res = await api.restoreAuditLog(pendingRestoreId);
            if (res.success) {
                showToast('success', res.message);
                setPendingRestoreId(null);
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

    // --- Column Logic ---
    const columns = useMemo(() => {
        const entity = getEntityForView();
        
        if (entity === 'Auditoria') {
            return ['DATA_HORA', 'USUARIO', 'ACAO', 'TABELA_AFETADA', 'ID_REGISTRO_AFETADO', 'DETALHES'];
        }
        
        // Para outras entidades, usa o DATA_MODEL
        const modelFields = DATA_MODEL[entity] || [];
        // Filtra campos técnicos desnecessários para a visualização de lista
        return modelFields.filter(f => !f.startsWith('ID_HISTORICO') && f !== 'VALOR_ANTIGO' && f !== 'VALOR_NOVO');
    }, [currentView]);

    const getColumnLabel = (col: string) => {
        const entity = getEntityForView();
        if (entity === 'Auditoria' && col === 'DETALHES') return 'Detalhes';
        
        // Tenta pegar do FIELD_LABELS específico ou Global
        const specific = FIELD_LABELS[entity]?.[col];
        const global = FIELD_LABELS['Global']?.[col];
        
        if (specific) return specific;
        if (global) return global;
        
        return col.replace(/_/g, ' ');
    };

    // --- Filter Logic ---
    const getUniqueValues = (key: string) => {
        const values = data.map(item => {
            if (key === 'DETALHES') return null; 
            // Tratamento especial para datas no filtro
            if (key.includes('DATA')) return validation.formatDate(item[key]);
            return String(item[key] || '');
        }).filter(v => v !== null);
        return [...new Set(values)].sort();
    };

    const filteredData = useMemo(() => {
        return data.filter(item => {
            // 1. Global Search
            const searchStr = globalSearch.toLowerCase();
            const matchesSearch = !globalSearch || Object.values(item).some(val => 
                String(val).toLowerCase().includes(searchStr)
            );

            if (!matchesSearch) return false;

            // 2. Column Filters
            const matchesFilters = Object.keys(activeFilters).every((key) => {
                const selectedValues = activeFilters[key];
                if (!selectedValues || selectedValues.length === 0) return true;
                
                let itemVal = String(item[key] || '');
                if (key.includes('DATA')) itemVal = validation.formatDate(item[key]);

                return selectedValues.includes(itemVal);
            });

            return matchesFilters;
        });
    }, [data, globalSearch, activeFilters]);

    // --- Renders ---

    const renderCell = (item: any, col: string) => {
        const entity = getEntityForView();

        // AUDITORIA SPECIFIC
        if (entity === 'Auditoria') {
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
        }

        // GENERIC TABLES (Historical)
        if (col.includes('DATA')) {
            return <span className="text-sm text-gray-600 font-mono">{validation.formatDate(item[col])}</span>;
        }

        let val = item[col];
        return <span className="text-sm text-gray-600 truncate block max-w-[250px]" title={String(val)}>{val}</span>;
    };

    return (
        <div className="flex h-full bg-gray-50 overflow-hidden">
            
            {/* Sidebar Navigation (Tabs) */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-none z-20 shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-black text-simas-dark tracking-brand uppercase leading-none">Arquivo Central</h2>
                    <p className="text-xs text-gray-400 mt-1">Histórico e Auditoria</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {tabs.length === 0 ? (
                         <div className="text-center p-4 text-gray-400 text-sm italic">
                             Sem acesso a históricos.
                         </div>
                    ) : tabs.map(view => (
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
                        <h1 className="text-2xl font-black text-simas-dark uppercase tracking-brand">
                            {tabs.find(t => t.id === currentView)?.label || 'Histórico'}
                        </h1>
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
                                        {columns.map(col => {
                                            const label = getColumnLabel(col);
                                            const rawValues = getUniqueValues(col);
                                            const isOpen = openFilterCol === col;
                                            // Filter values based on search inside dropdown
                                            const uniqueValues = isOpen 
                                                ? rawValues.filter(v => String(v).toLowerCase().includes(filterSearch.toLowerCase())) 
                                                : [];
                                            const selectedValues = activeFilters[col] || [];
                                            const isFiltered = selectedValues.length > 0;

                                            return (
                                                <th key={col} className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider relative group select-none">
                                                    <div className="flex items-center justify-between cursor-pointer hover:bg-gray-100/50 rounded p-1 -ml-1 transition-colors" onClick={() => { setOpenFilterCol(isOpen ? null : col); setFilterSearch(''); }}>
                                                        <span className={isFiltered ? 'text-simas-accent' : ''}>{label}</span>
                                                        <button className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${isFiltered ? 'text-simas-accent' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`}>
                                                            <i className={`fas ${isFiltered ? 'fa-filter' : 'fa-chevron-down'} text-[10px]`}></i>
                                                        </button>
                                                    </div>

                                                    {isOpen && (
                                                        <div ref={filterRef} className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 animate-fade-in overflow-hidden flex flex-col max-h-[350px]">
                                                            <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs font-bold text-gray-600">Filtrar por {label}</span>
                                                                    {isFiltered && <button onClick={(e) => { e.stopPropagation(); setActiveFilters({...activeFilters, [col]: []}); }} className="text-[10px] text-red-500 hover:underline">Limpar</button>}
                                                                </div>
                                                                {/* Search Bar in Filter */}
                                                                <div className="relative">
                                                                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="Procurar valor..." 
                                                                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:ring-1 focus:ring-simas-cyan outline-none"
                                                                        value={filterSearch}
                                                                        onChange={(e) => setFilterSearch(e.target.value)}
                                                                        autoFocus
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                                                {uniqueValues.length === 0 ? (
                                                                     <div className="text-center py-2 text-gray-400 text-xs italic">Nenhum resultado</div>
                                                                ) : (
                                                                    uniqueValues.map(val => (
                                                                        <label key={val} className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={(e) => e.stopPropagation()}>
                                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${selectedValues.includes(String(val)) ? 'bg-simas-accent border-simas-accent' : 'bg-white border-gray-300'}`}>
                                                                                {selectedValues.includes(String(val)) && <i className="fas fa-check text-white text-[10px]"></i>}
                                                                            </div>
                                                                            <input 
                                                                                type="checkbox" 
                                                                                className="hidden"
                                                                                checked={selectedValues.includes(String(val))}
                                                                                onChange={() => {
                                                                                    const current = activeFilters[col] || [];
                                                                                    const newVal = String(val);
                                                                                    if (current.includes(newVal)) setActiveFilters({...activeFilters, [col]: current.filter(v => v !== newVal)});
                                                                                    else setActiveFilters({...activeFilters, [col]: [...current, newVal]});
                                                                                }}
                                                                            />
                                                                            <span className="text-xs text-gray-700 truncate">{val === '' ? '(Vazio)' : val}</span>
                                                                        </label>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                        {getEntityForView() === 'Auditoria' && (
                                            <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                                        )}
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
                                            const isAudit = getEntityForView() === 'Auditoria';
                                                        const isRestorable = isAudit && (item.ACAO === 'EXCLUIR' || item.ACAO === 'ARQUIVAR' || item.ACAO === 'INATIVAR' || item.ACAO === 'CRIAR' || item.ACAO === 'EDITAR');
                                                        return (
                                                            <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                                                {columns.map(col => (
                                                                    <td key={col} className="px-6 py-4 whitespace-nowrap">
                                                                        {renderCell(item, col)}
                                                                    </td>
                                                                ))}
                                                                {isAudit && (
                                                                    <td className="px-6 py-4 text-right">
                                                                        {isRestorable && isAdmin && (
                                                                            <button 
                                                                                onClick={() => setPendingRestoreId(item.ID_LOG)}
                                                                                className={`p-2 rounded-lg transition-all ${item.ACAO === 'ARQUIVAR' || item.ACAO === 'INATIVAR' ? 'text-green-500 hover:bg-green-50' : 'text-orange-500 hover:bg-orange-50'}`}
                                                                                title={
                                                                                    item.ACAO === 'ARQUIVAR' ? "Desarquivar" :
                                                                                    item.ACAO === 'INATIVAR' ? "Reativar" :
                                                                                    item.ACAO === 'CRIAR' ? "Desfazer Criação" :
                                                                                    item.ACAO === 'EDITAR' ? "Desfazer Edição" :
                                                                                    item.ACAO === 'EXCLUIR' ? "Desfazer Exclusão" :
                                                                                    "Restaurar Ação"
                                                                                }
                                                                            >
                                                                                <i className={`fas ${item.ACAO === 'ARQUIVAR' || item.ACAO === 'INATIVAR' ? 'fa-box-open' : 'fa-undo'}`}></i>
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Audit Modal (Details) */}
            {selectedAudit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
                     <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] bg-white border border-gray-200 animate-slide-in">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="font-bold text-lg text-simas-dark flex items-center gap-2">
                                    <i className="fas fa-search text-simas-cyan"></i>
                                    Detalhes da Auditoria
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">{selectedAudit.TABELA_AFETADA} - {selectedAudit.ACAO}</p>
                            </div>
                            <button onClick={() => setSelectedAudit(null)} className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-500"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                            {/* Render Logic for Details matches previous implementation */}
                            {(() => {
                                const oldData = JSON.parse(selectedAudit.VALOR_ANTIGO || '{}');
                                const newData = JSON.parse(selectedAudit.VALOR_NOVO || '{}');
                                const action = selectedAudit.ACAO;
                                const displayData = (action === 'EXCLUIR' || action === 'ARQUIVAR' || action === 'INATIVAR') ? oldData : (action === 'CRIAR' || action === 'RESTAURAR' ? newData : { ...oldData, ...newData });
                                
                                return Object.keys(displayData).sort().map(key => {
                                    if (key === 'ID_LOG' || key === 'DATA_CRIACAO') return null;
                                    let content;
                                    if (action === 'EDITAR') {
                                        const oldVal = oldData[key];
                                        const newVal = newData[key];
                                        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                                            content = (
                                                <div className="flex flex-col items-start bg-yellow-50 p-2 rounded border border-yellow-100 mt-1">
                                                    <span className="line-through text-gray-400 text-xs mb-1">{String(oldVal || '(Vazio)')}</span>
                                                    <span className="text-simas-dark font-bold text-sm">{String(newVal || '(Vazio)')}</span>
                                                </div>
                                            );
                                        } else {
                                            content = <span className="text-gray-600 font-medium text-sm">{String(newVal || '')}</span>;
                                        }
                                    } else {
                                        content = <span className="text-gray-800 font-medium text-sm">{String(displayData[key] || '')}</span>;
                                    }
                                    return (
                                        <div key={key} className="flex flex-col border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{key.replace(/_/g, ' ')}</span>
                                            {content}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                     </div>
                </div>
            )}

            {/* Restore Confirmation Modal */}
            {pendingRestoreId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in px-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-white/20 animate-slide-in">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4 border border-yellow-100">
                                <i className="fas fa-history text-2xl text-yellow-500"></i>
                            </div>
                            <h3 className="text-xl font-extrabold text-simas-dark mb-2">Confirmar Restauração</h3>
                            <p className="text-sm text-gray-500 mb-6 px-4 leading-relaxed">
                                Você está prestes a restaurar este registro para a lista ativa.
                            </p>
                            
                            <div className="flex gap-3 w-full">
                                <Button variant="secondary" onClick={() => setPendingRestoreId(null)} className="flex-1 justify-center" disabled={!!restoringId}>Cancelar</Button>
                                <Button onClick={executeRestore} isLoading={!!restoringId} className="flex-1 justify-center">Restaurar</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
