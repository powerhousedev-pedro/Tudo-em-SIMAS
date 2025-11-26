
import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING, DROPDOWN_OPTIONS, DROPDOWN_STRUCTURES } from '../constants';
import { api } from '../services/api';
import { Button } from './Button';
import { Card } from './Card';
import { RecordData, UserSession } from '../types';
import { AppContextProps } from '../App';
import { validation } from '../utils/validation';
import { DossierModal } from './DossierModal';
import { ActionExecutionModal } from './ActionExecutionModal';
import { ExerciseSelectionModal } from './ExerciseSelectionModal';

interface DashboardProps extends AppContextProps {}

export const Dashboard: React.FC<DashboardProps> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState('PESSOA');
  const [formData, setFormData] = useState<RecordData>({});
  const [isEditing, setIsEditing] = useState(false);
  
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [cardData, setCardData] = useState<{ [key: string]: any[] }>({});
  const [searchTerms, setSearchTerms] = useState<{ [key: string]: string }>({});
  const deferredSearchTerms = useDeferredValue(searchTerms);
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});

  // Advanced Filtering State
  const [activeFilters, setActiveFilters] = useState<{ [entity: string]: string[] }>({});
  const [filterPopoverOpen, setFilterPopoverOpen] = useState<string | null>(null); // Entity Name if open

  // New State for Modals
  const [dossierCpf, setDossierCpf] = useState<string | null>(null);
  const [actionAtendimentoId, setActionAtendimentoId] = useState<string | null>(null);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  
  // Exercise Edit State
  const [exerciseVagaId, setExerciseVagaId] = useState<string | null>(null);

  // Dropdown States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');

  // Toggle for Main Column Visibility (Generic for all tabs)
  const [showMainList, setShowMainList] = useState(false);

  // Refs for clicking outside popovers
  const popoverRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // --- SESSION DATA ---
  const getSession = (): UserSession => {
      const stored = localStorage.getItem('simas_user_session');
      if (stored) {
          try { return JSON.parse(stored); } catch (e) {}
      }
      return { token: '', papel: 'GGT', usuario: '', isGerente: false }; // Fallback
  };
  const session = getSession();

  const tabs = useMemo(() => {
    return Object.keys(ENTITY_CONFIGS)
      .filter(k => k !== 'AUDITORIA' && k !== 'ATENDIMENTO');
  }, []);

  const filteredTabs = useMemo(() => {
    return tabs.filter(tab => 
        ENTITY_CONFIGS[tab].title.toLowerCase().includes(dropdownSearch.toLowerCase())
    );
  }, [tabs, dropdownSearch]);

  useEffect(() => {
    resetForm();
    loadAllRequiredData();
    loadPendingReviews();
    setSelectedItems({}); // Clear selections on tab change
    setShowMainList(false); // Hide main list by default to reduce pollution
    setDropdownSearch(''); // Reset search on tab change if needed, or keep for user convenience
    setActiveFilters({}); // Reset filters
  }, [activeTab]);

  // Handle click outside filter popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (filterPopoverOpen && popoverRefs.current[filterPopoverOpen] && !popoverRefs.current[filterPopoverOpen]?.contains(event.target as Node)) {
            setFilterPopoverOpen(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterPopoverOpen]);

  const loadPendingReviews = async () => {
    try {
        const res = await api.getRevisoesPendentes();
        setPendingReviews(res);
    } catch(e) {}
  };

  // Helper for Legacy Prefix Calculation
  const getPrefixForVinculo = (vinculo: string) => {
      switch (vinculo) {
        case 'Extra Quadro': return '60';
        case 'Aposentado': return '70';
        case 'CLT': return '29';
        case 'Prestador de Serviços': return '39';
        case 'Ativo': return '10';
        default: return '10';
      }
  };

  const resetForm = () => {
    const initialData: RecordData = {};
    const today = new Date().toISOString().split('T')[0];

    if (DATA_MODEL[activeTab]) {
      DATA_MODEL[activeTab].forEach(field => {
          // Default Dates logic matching legacy behavior (pre-fill today for start dates/events)
          if (['DATA_INICIO', 'DATA_DO_CONTRATO', 'DATA_MATRICULA', 'DATA_DA_NOMEACAO', 'DATA_VISITA', 'DATA_ATENDIMENTO'].includes(field)) {
              initialData[field] = today;
          } else {
              initialData[field] = '';
          }
      });
    }
    
    // Preserve selected Lookups in the form
    Object.keys(selectedItems).forEach(entity => {
        const config = ENTITY_CONFIGS[entity];
        if (entity !== activeTab) { 
           // Find which field maps to this entity
           const fieldName = Object.keys(FK_MAPPING).find(key => FK_MAPPING[key] === entity);
           if (fieldName && initialData.hasOwnProperty(fieldName)) {
               initialData[fieldName] = selectedItems[entity];
           }
        }
    });

    setFormData(initialData);
    setIsEditing(false);
  };

  const loadAllRequiredData = async () => {
    setLoadingData(true);
    const allEntities = Object.keys(ENTITY_CONFIGS);
    try {
      const results = await Promise.all(
        allEntities.map(async (entity) => {
           try {
             const data = await api.fetchEntity(entity);
             return { entity, data };
           } catch (e) {
             return { entity, data: [] };
           }
        })
      );
      setCardData(prev => {
        const next = { ...prev };
        results.forEach(res => { if (res) next[res.entity] = res.data; });
        return next;
      });
    } catch (e) {
      showToast('error', 'Erro ao carregar dados.');
    } finally {
      setLoadingData(false);
    }
  };

  const columnsToRender = useMemo(() => {
    // Only include the main entity column if "Consultar" is active
    const columns: string[] = showMainList ? [activeTab] : [];
    
    const modelFields = DATA_MODEL[activeTab] || [];
    
    modelFields.forEach(field => {
        const linkedEntity = FK_MAPPING[field];
        if (linkedEntity && ENTITY_CONFIGS[linkedEntity] && !columns.includes(linkedEntity)) {
             if (linkedEntity !== activeTab) {
                 columns.push(linkedEntity);
             }
        }
    });

    return columns;
  }, [activeTab, showMainList]);

  const handleCardSelect = (entity: string, item: any) => {
    const config = ENTITY_CONFIGS[entity];
    const pkValue = String(item[config.pk]);
    
    setSelectedItems(prev => ({ ...prev, [entity]: pkValue }));

    // If it's a lookup entity, update the form data FK
    if (entity !== activeTab) {
        const fkField = Object.keys(FK_MAPPING).find(key => FK_MAPPING[key] === entity);
        if (fkField) {
            setFormData(prev => ({ ...prev, [fkField]: pkValue }));
        }
    }
  };

  const handleEdit = (item: any) => {
      const formattedItem = { ...item };
      
      if (formattedItem.SALARIO) {
          formattedItem.SALARIO = validation.formatCurrency(formattedItem.SALARIO);
      }
      
      if (formattedItem.TELEFONE) {
          formattedItem.TELEFONE = validation.maskPhone(formattedItem.TELEFONE);
      }

      if (formattedItem.CPF) {
          formattedItem.CPF = validation.maskCPF(formattedItem.CPF);
      }

      setFormData(formattedItem);
      setIsEditing(true);
      const config = ENTITY_CONFIGS[activeTab];
      const pkValue = String(item[config.pk]);
      setSelectedItems(prev => ({ ...prev, [activeTab]: pkValue }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === 'CPF') {
        processedValue = validation.maskCPF(value);
    } else if (name === 'TELEFONE') {
        processedValue = validation.maskPhone(value);
    } else if (name === 'SALARIO') {
        processedValue = validation.maskCurrency(value);
    }

    // Logic for Servidor Prefix Calculation
    if (activeTab === 'SERVIDOR' && name === 'VINCULO') {
         const prefix = getPrefixForVinculo(value);
         setFormData(prev => ({ ...prev, [name]: processedValue, 'PREFIXO_MATRICULA': prefix }));
    } else {
         setFormData(prev => ({ ...prev, [name]: processedValue }));
    }
  };

  // Filter Logic Helpers
  const getUniqueFilterValues = (entity: string) => {
      const config = ENTITY_CONFIGS[entity];
      if (!config || !config.filterBy) return [];
      const key = config.filterBy;
      const data = cardData[entity] || [];
      const values = data.map(item => item[key]).filter(val => val !== undefined && val !== null && val !== '');
      return [...new Set(values)].sort();
  };

  const toggleFilterValue = (entity: string, value: string) => {
      setActiveFilters(prev => {
          const current = prev[entity] || [];
          if (current.includes(value)) {
              return { ...prev, [entity]: current.filter(v => v !== value) };
          } else {
              return { ...prev, [entity]: [...current, value] };
          }
      });
  };

  const getFilteredOptions = (field: string): string[] => {
      const papel = session.papel;
      if (field === 'REMETENTE') {
          if (papel === 'GPRGP') return DROPDOWN_STRUCTURES['REMETENTE'].filter((o: string) => o !== 'Prefeitura');
          return DROPDOWN_STRUCTURES['REMETENTE'];
      }
      return (DROPDOWN_OPTIONS[field] as string[]) || [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData };

    if (activeTab === 'PESSOA') {
        if (!validation.validateCPF(payload.CPF)) { 
            showToast('error', 'CPF Inválido. Verifique os dígitos.'); 
            return; 
        }
        payload.CPF = payload.CPF.replace(/\D/g, ""); 
        
        const normalizedPhone = validation.normalizePhoneForSave(payload.TELEFONE);
        if (payload.TELEFONE && !normalizedPhone) {
             showToast('error', 'Telefone inválido. O número deve ter 10 ou 11 dígitos (com DDD).');
             return;
        }
        payload.TELEFONE = normalizedPhone || "";
        payload.NOME = validation.capitalizeName(payload.NOME);
    }

    if (activeTab === 'CARGOS' && payload.SALARIO) {
        payload.SALARIO = payload.SALARIO.replace(/[R$\.\s]/g, '').replace(',', '.');
    }

    setSubmitting(true);
    try {
      const config = ENTITY_CONFIGS[activeTab];
      
      // Auto-Generate ID logic matching legacy backend if needed
      if(!isEditing && !config.manualPk && config.pkPrefix && !payload[config.pk]) {
          payload[config.pk] = validation.generateLegacyId(config.pkPrefix);
      }

      let res;
      if (isEditing) {
        res = await api.updateRecord(activeTab, config.pk, payload[config.pk], payload);
      } else {
        res = await api.createRecord(activeTab, payload);
      }

      if (res.success) {
        showToast('success', isEditing ? 'Registro atualizado!' : 'Registro criado!');
        const newData = await api.fetchEntity(activeTab);
        setCardData(prev => ({ ...prev, [activeTab]: newData }));
        
        if (activeTab === 'CONTRATO') {
            const newReservas = await api.fetchEntity('RESERVAS');
            setCardData(prev => ({ ...prev, 'RESERVAS': newReservas }));
        }

        resetForm();
      } else {
        showToast('error', res.message || 'Erro ao salvar.');
      }
    } catch (err) {
      showToast('error', 'Erro de conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: any, entityName: string) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza?')) return;
    const config = ENTITY_CONFIGS[entityName];
    try {
      const res = await api.deleteRecord(entityName, config.pk, item[config.pk]);
      if (res.success) {
        showToast('info', 'Registro excluído.');
        const newData = await api.fetchEntity(entityName);
        setCardData(prev => ({ ...prev, [entityName]: newData }));
        if (selectedItems[entityName] === String(item[config.pk])) {
            setSelectedItems(prev => { const next={...prev}; delete next[entityName]; return next; });
        }
      } else { showToast('error', 'Erro ao excluir.'); }
    } catch(err) { showToast('error', 'Erro.'); }
  };

  const handleLockVaga = async (e: React.MouseEvent, idVaga: string, isOcupada: boolean) => {
      e.stopPropagation();
      if (isOcupada) {
          showToast('error', 'Não é possível bloquear uma vaga ocupada.');
          return;
      }
      try {
          const newStatus = await api.toggleVagaBloqueada(idVaga);
          showToast('success', newStatus ? 'Vaga bloqueada.' : 'Vaga desbloqueada.');
          const newData = await api.fetchEntity('VAGAS');
          setCardData(prev => ({ ...prev, 'VAGAS': newData }));
      } catch (err: any) { showToast('error', err.message || 'Erro ao alterar bloqueio.'); }
  };

  const handleRestoreAudit = async (e: React.MouseEvent, idLog: string) => {
      e.stopPropagation();
      if(!window.confirm('Deseja reverter esta ação?')) return;
      try {
          const res = await api.restoreAuditLog(idLog);
          if(res.success) {
              showToast('success', res.message);
              const newData = await api.fetchEntity('AUDITORIA');
              setCardData(prev => ({...prev, 'AUDITORIA': newData}));
              // Refresh all data as audit restore might affect anything
              loadAllRequiredData();
          }
      } catch(err) { showToast('error', 'Erro ao restaurar.'); }
  };

  const renderInput = (field: string) => {
    const config = ENTITY_CONFIGS[activeTab];
    const isPK = field === config.pk;
    const isFK = FK_MAPPING[field] !== undefined;
    const userRole = session.papel;
    const isCalculated = ['PREFIXO_MATRICULA'].includes(field);

    // HIDE PK field if not editing and not manual PK (it will be generated automatically)
    if (isPK && !isEditing && !config.manualPk) {
        return null;
    }

    if (activeTab === 'CARGOS' && field === 'SALARIO' && userRole === 'GGT') return null;
    if (activeTab === 'PROTOCOLO') {
        if (field === 'MATRICULA' && userRole === 'GPRGP') return null;
        if (field === 'ID_CONTRATO' && userRole === 'GGT') return null;
    }

    const wrapperClass = "relative group";
    const labelClass = "block text-[10px] font-bold text-simas-dark/70 uppercase tracking-widest mb-1.5 ml-1";
    // Rounded 2XL input style
    const inputClass = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all duration-200 disabled:opacity-60 disabled:bg-gray-100 placeholder-gray-300 text-sm font-medium text-simas-dark";
    
    // Calculated/ReadOnly Style
    const readOnlyClass = "opacity-70 cursor-not-allowed bg-gray-100 focus:bg-gray-100 focus:border-gray-200";

    const options = getFilteredOptions(field);

    if (options.length > 0) {
      return (
        <div key={field} className={wrapperClass}>
          <label className={labelClass}>{field.replace(/_/g, ' ')}</label>
          <div className="relative">
            <select name={field} value={formData[field] || ''} onChange={handleInputChange} className={`${inputClass} appearance-none cursor-pointer hover:border-gray-300`}>
              <option value="">Selecione...</option>
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><i className="fas fa-chevron-down text-xs"></i></div>
          </div>
        </div>
      );
    }
    const type = field.includes('DATA') ? 'date' : 'text';
    let displayValue = formData[field] || '';

    const isReadOnly = (isPK && isEditing) || isCalculated;

    return (
      <div key={field} className={wrapperClass}>
        <label className={labelClass}>{field.replace(/_/g, ' ')}</label>
        <div className="relative">
            {isFK && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan">
                    <i className="fas fa-link text-xs"></i>
                </div>
            )}
            <input 
                type={type} 
                name={field} 
                value={displayValue} 
                onChange={handleInputChange} 
                className={`${inputClass} ${isFK ? 'pl-10' : ''} ${isReadOnly ? readOnlyClass : ''}`} 
                readOnly={isReadOnly}
                placeholder={isFK ? "Selecione na lista..." : "Digite aqui..."} 
                maxLength={field === 'CPF' ? 14 : (field === 'TELEFONE' ? 15 : undefined)}
            />
        </div>
      </div>
    );
  };

  const SkeletonCard = () => <div className="p-4 mb-3 bg-white/50 rounded-2xl border border-white shadow-sm animate-pulse h-24"></div>;

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-simas-cloud">
      {/* Top Bar Navigation */}
      <div className="flex-none px-8 pt-8 pb-4 flex items-center justify-between z-20">
        
        {/* Rounded Searchable Dropdown */}
        <div className="relative min-w-[300px] z-50">
            <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between pl-2 pr-4 py-2 bg-white text-simas-dark font-bold text-sm rounded-full border border-gray-100 hover:border-simas-cyan transition-all outline-none shadow-soft group"
            >
                <div className="flex items-center gap-3">
                     <div className="w-9 h-9 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors">
                        <i className="fas fa-folder-open text-xs"></i>
                     </div>
                     <span>{ENTITY_CONFIGS[activeTab]?.title || 'Selecione...'}</span>
                </div>
                <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {/* Dropdown Menu Overlay & List */}
            {isDropdownOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-3xl shadow-2xl overflow-hidden z-50 animate-fade-in flex flex-col max-h-[400px]">
                        
                        {/* Search Input */}
                        <div className="p-3 border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
                            <div className="relative">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input 
                                    type="text" 
                                    placeholder="Filtrar módulos..." 
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border-none rounded-xl text-sm outline-none shadow-sm focus:ring-2 focus:ring-simas-cyan transition-all placeholder-gray-400"
                                    value={dropdownSearch}
                                    onChange={(e) => setDropdownSearch(e.target.value)}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()} 
                                />
                            </div>
                        </div>
                        
                        {/* Options List */}
                        <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {filteredTabs.length > 0 ? filteredTabs.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setActiveTab(tab);
                                        setIsDropdownOpen(false);
                                        setDropdownSearch('');
                                    }}
                                    className={`
                                        w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all
                                        ${activeTab === tab 
                                            ? 'bg-simas-cloud text-simas-dark font-bold' 
                                            : 'text-gray-500 hover:bg-gray-50 hover:text-simas-dark'}
                                    `}
                                >
                                    <div className={`w-2 h-2 rounded-full ${activeTab === tab ? 'bg-simas-cyan shadow-glow' : 'bg-gray-200'}`}></div>
                                    {ENTITY_CONFIGS[tab].title}
                                </button>
                            )) : (
                                <div className="p-6 text-center text-gray-400 text-xs font-medium">
                                    Nenhum módulo encontrado.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>

        <div className="pl-6 flex items-center gap-4">
            <button
                onClick={() => setShowMainList(!showMainList)}
                className={`
                    flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all shadow-sm uppercase tracking-wide
                    ${showMainList 
                        ? 'bg-simas-dark text-white shadow-md' 
                        : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-200 hover:text-simas-dark'}
                `}
            >
                <i className={`fas ${showMainList ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                Consultar
            </button>

            <Button variant="secondary" onClick={() => setShowReviewsModal(true)} className="relative !rounded-full w-10 h-10 p-0 flex items-center justify-center border-none shadow-sm bg-white hover:text-simas-cyan text-gray-400 hover:shadow-md transition-all">
                <i className="fas fa-bell"></i>
                {pendingReviews.length > 0 && <span className="absolute -top-1 -right-1 bg-simas-cyan text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-white">{pendingReviews.length}</span>}
            </Button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex gap-8 px-8 pb-8 overflow-hidden min-h-0 z-10">
        
        {/* Editor Panel (Fixed Left) */}
        <div className="flex-none w-[380px] flex flex-col bg-white rounded-3xl shadow-soft overflow-hidden z-20 border border-white/50">
          <div className="p-6 border-b border-gray-50 bg-white">
            <h2 className="text-lg font-extrabold text-simas-dark flex items-center gap-3 tracking-tight">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isEditing ? 'bg-simas-cyan/10 text-simas-cyan' : 'bg-simas-blue/10 text-simas-blue'}`}>
                    <i className={`fas ${isEditing ? 'fa-pen' : 'fa-plus'} text-xs`}></i>
                </div>
                {isEditing ? 'Editar Registro' : 'Novo Registro'}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <form onSubmit={handleSubmit} className="space-y-5">
              {DATA_MODEL[activeTab]?.map(field => renderInput(field))}
              <div className="pt-6 flex gap-3">
                {isEditing && <Button type="button" variant="ghost" onClick={resetForm} className="flex-1">Cancelar</Button>}
                <Button type="submit" isLoading={submitting} className="flex-[2]">{isEditing ? 'Salvar Alterações' : 'Criar Registro'}</Button>
              </div>
            </form>
          </div>
        </div>

        {/* Horizontal Data Columns (Lateral Scrolling) */}
        <div className="flex-1 overflow-x-auto flex gap-6 pb-2 items-stretch px-2 scrollbar-thin scrollbar-thumb-simas-blue scrollbar-track-transparent snap-x">
           {columnsToRender.map((entity, index) => {
             const config = ENTITY_CONFIGS[entity];
             if (!config) return null;
             
             const rawData = cardData[entity] || [];
             const searchTerm = (deferredSearchTerms[entity] || '').toLowerCase();
             const entityFilters = activeFilters[entity] || [];
             const filterKey = config.filterBy;

             let filteredData = rawData;
             
             // Apply Text Filter
             if (searchTerm) {
                filteredData = filteredData.filter(item => {
                    const display = config.cardDisplay(item);
                    return `${display.title} ${display.subtitle} ${display.details || ''}`.toLowerCase().includes(searchTerm);
                });
             }

             // Apply Checkbox Filters
             if (filterKey && entityFilters.length > 0) {
                 filteredData = filteredData.filter(item => entityFilters.includes(item[filterKey]));
             }

             const isLookup = entity !== activeTab;
             const isFilterOpen = filterPopoverOpen === entity;
             const filterOptions = isFilterOpen ? getUniqueFilterValues(entity) : [];

             return (
               <div key={`${entity}-${index}`} className="flex-none w-[340px] flex flex-col bg-slate-200 rounded-3xl overflow-hidden snap-center h-full border border-slate-300 backdrop-blur-sm shadow-inner">
                 {/* Column Header */}
                 <div className="p-4 bg-gray-50/80 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100">
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="font-bold flex items-center gap-2 text-simas-dark uppercase text-xs tracking-wider pl-1">
                        {isLookup && <i className="fas fa-link text-gray-400"></i>}
                        {config.title}
                     </h3>
                     <span className="text-[10px] font-bold bg-white shadow-sm border border-gray-100 px-2.5 py-1 rounded-full text-gray-500">{filteredData.length}</span>
                   </div>
                   <div className="flex gap-2">
                       <div className="relative group flex-grow">
                           <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-colors group-hover:text-simas-cyan"></i>
                           <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border-none bg-white shadow-sm text-xs focus:ring-2 focus:ring-simas-cyan/50 outline-none transition-all placeholder-gray-400" value={searchTerms[entity] || ''} onChange={(e) => setSearchTerms(prev => ({ ...prev, [entity]: e.target.value }))} />
                       </div>
                       {config.filterBy && (
                           <div className="relative" ref={el => { popoverRefs.current[entity] = el; }}>
                               <button 
                                   className={`w-9 h-full rounded-xl flex items-center justify-center transition-all shadow-sm border border-transparent ${isFilterOpen || entityFilters.length > 0 ? 'bg-simas-cyan text-white shadow-glow' : 'bg-white text-gray-400 hover:text-simas-cyan'}`}
                                   onClick={() => setFilterPopoverOpen(isFilterOpen ? null : entity)}
                               >
                                   <i className="fas fa-filter text-xs"></i>
                               </button>
                               {isFilterOpen && (
                                   <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-fade-in">
                                       <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                           <span className="text-xs font-bold text-gray-600">Filtrar por {config.filterBy.replace(/_/g, ' ')}</span>
                                           {entityFilters.length > 0 && <button onClick={() => setActiveFilters(prev => ({...prev, [entity]: []}))} className="text-[10px] text-red-500 font-bold hover:underline">Limpar</button>}
                                       </div>
                                       <div className="max-h-[200px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                           {filterOptions.map(opt => (
                                               <label key={opt} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors text-xs text-gray-600">
                                                   <input 
                                                       type="checkbox" 
                                                       checked={entityFilters.includes(opt)} 
                                                       onChange={() => toggleFilterValue(entity, opt)}
                                                       className="rounded text-simas-cyan focus:ring-simas-cyan border-gray-300"
                                                   />
                                                   <span className="truncate">{opt}</span>
                                               </label>
                                           ))}
                                           {filterOptions.length === 0 && <div className="text-center py-4 text-gray-400 text-xs">Nada para filtrar.</div>}
                                       </div>
                                   </div>
                               )}
                           </div>
                       )}
                   </div>
                 </div>
                 
                 {/* Column Content */}
                 <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                   {loadingData ? <SkeletonCard /> : filteredData.map(item => {
                       const pkValue = String(item[config.pk]);
                       const display = config.cardDisplay(item);
                       const isSelected = selectedItems[entity] === pkValue;
                       const isOcupada = item.STATUS_VAGA === 'Ocupada';
                       
                       let exerciseData = undefined;
                       if (entity === 'VAGAS') {
                           exerciseData = {
                               label: item.NOME_LOTACAO_EXERCICIO || 'Sem exercício definido',
                               onEdit: () => setExerciseVagaId(pkValue)
                           };
                       }

                       return (
                         <Card 
                            key={pkValue} 
                            title={display.title} 
                            subtitle={display.subtitle} 
                            details={display.details} 
                            status={display.status} 
                            selected={isSelected} 
                            onSelect={() => handleCardSelect(entity, item)} 
                            onEdit={!isLookup ? () => handleEdit(item) : undefined}
                            exerciseData={exerciseData}
                            actions={
                             // ACTIONS prop now passes ONLY the buttons, no wrapper styling. Card.tsx handles the pill wrapper.
                             <>
                               {entity === 'PESSOA' && <Button variant="icon" icon="fas fa-id-card" title="Dossiê" onClick={(e) => {e.stopPropagation(); setDossierCpf(item.CPF);}} />}
                               {entity === 'VAGAS' && (
                                   <Button 
                                       variant="icon" 
                                       icon={item.BLOQUEADA ? "fas fa-lock" : "fas fa-lock-open"} 
                                       className={`${item.BLOQUEADA ? "text-red-500" : ""} ${isOcupada ? "opacity-30 cursor-not-allowed text-gray-400" : ""}`}
                                       title={isOcupada ? "Não é possível bloquear uma vaga ocupada" : "Bloquear/Desbloquear"}
                                       disabled={isOcupada}
                                       onClick={(e) => handleLockVaga(e, pkValue, isOcupada)} 
                                   />
                               )}
                               {entity === 'AUDITORIA' && <Button variant="icon" icon="fas fa-undo" className="text-orange-500" onClick={(e) => handleRestoreAudit(e, pkValue)} />}
                               {entity !== 'AUDITORIA' && <Button variant="icon" icon="fas fa-trash" className="text-red-300 hover:text-red-500 hover:bg-red-50" onClick={(e) => handleDelete(e, item, entity)} />}
                             </>
                           }
                         />
                       );
                     })}
                 </div>
               </div>
             );
           })}
        </div>
      </div>

      {/* Modals */}
      {dossierCpf && <DossierModal cpf={dossierCpf} onClose={() => setDossierCpf(null)} />}
      
      {exerciseVagaId && (
          <ExerciseSelectionModal 
              vagaId={exerciseVagaId}
              onClose={() => setExerciseVagaId(null)}
              onSuccess={() => {
                  setExerciseVagaId(null);
                  showToast('success', 'Exercício atualizado com sucesso!');
                  api.fetchEntity('VAGAS').then(data => setCardData(prev => ({...prev, 'VAGAS': data})));
              }}
          />
      )}

      {actionAtendimentoId && (
        <ActionExecutionModal 
            idAtendimento={actionAtendimentoId} 
            onClose={() => setActionAtendimentoId(null)}
            onSuccess={() => {
                setActionAtendimentoId(null);
                loadPendingReviews();
                loadAllRequiredData();
                showToast('success', 'Ação executada com sucesso!');
            }}
        />
      )}

      {showReviewsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-in">
                  <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                      <h3 className="text-xl font-bold text-simas-dark tracking-tight">Revisões Pendentes</h3>
                      <button onClick={() => setShowReviewsModal(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"><i className="fas fa-times"></i></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-white space-y-4">
                      {pendingReviews.length === 0 ? <div className="text-center text-gray-400 py-10 flex flex-col items-center gap-4"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center"><i className="fas fa-check text-2xl text-green-500"></i></div> Tudo limpo!</div> : 
                        pendingReviews.map(rev => (
                            <div key={rev.ID_ATENDIMENTO} className="bg-white p-5 rounded-2xl border border-gray-100 flex justify-between items-center hover:shadow-lg hover:border-simas-cyan/30 transition-all group">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors">
                                        <i className="fas fa-tasks text-lg"></i>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-simas-dark text-lg leading-tight group-hover:text-simas-cyan transition-colors">{rev.TIPO_DE_ACAO} {rev.ENTIDADE_ALVO}</h4>
                                        <p className="text-sm text-gray-500">Para: <span className="font-medium text-gray-700">{rev.NOME_PESSOA}</span></p>
                                        <p className="text-xs text-gray-400 mt-1 font-medium bg-gray-50 inline-flex items-center gap-1 px-2 py-0.5 rounded-full"><i className="far fa-calendar"></i> {rev.DATA_AGENDAMENTO}</p>
                                    </div>
                                </div>
                                <Button onClick={() => { setShowReviewsModal(false); setActionAtendimentoId(rev.ID_ATENDIMENTO); }} className="rounded-full px-6">Executar</Button>
                            </div>
                        ))
                      }
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
