
import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING, DROPDOWN_OPTIONS, DROPDOWN_STRUCTURES } from '../constants';
import { api } from '../services/api';
import { Button } from './Button';
import { Card } from './Card';
import { RecordData, UserSession } from '../types';
import { AppContextProps } from '../App';
import { validation } from '../utils/validation';
import { businessLogic } from '../utils/businessLogic';
import { DossierModal } from './DossierModal';
import { ActionExecutionModal } from './ActionExecutionModal';
import { ExerciseSelectionModal } from './ExerciseSelectionModal';

interface DashboardProps extends AppContextProps {}

export const Dashboard: React.FC<DashboardProps> = ({ showToast }) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('PESSOA');
  const [formData, setFormData] = useState<RecordData>({});
  const [isEditing, setIsEditing] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [cardData, setCardData] = useState<{ [key: string]: any[] }>({});
  const [searchTerms, setSearchTerms] = useState<{ [key: string]: string }>({});
  const deferredSearchTerms = useDeferredValue(searchTerms);
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});

  // UI State
  const [activeFilters, setActiveFilters] = useState<{ [entity: string]: string[] }>({});
  const [filterPopoverOpen, setFilterPopoverOpen] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [showMainList, setShowMainList] = useState(false);

  // Modal State
  const [dossierCpf, setDossierCpf] = useState<string | null>(null);
  const [actionAtendimentoId, setActionAtendimentoId] = useState<string | null>(null);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [exerciseVagaId, setExerciseVagaId] = useState<string | null>(null);

  const popoverRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // --- SESSION ---
  const session: UserSession = useMemo(() => {
      const stored = localStorage.getItem('simas_user_session');
      return stored ? JSON.parse(stored) : { token: '', papel: 'GGT', usuario: '', isGerente: false };
  }, []);

  // --- EFFECTS ---

  // 1. Tab Change Reset
  useEffect(() => {
    const initialData: RecordData = {};
    const today = new Date().toISOString().split('T')[0];
    
    // Pre-fill dates
    DATA_MODEL[activeTab]?.forEach(field => {
        const isDateField = ['DATA_INICIO', 'DATA_DO_CONTRATO', 'DATA_MATRICULA', 'DATA_DA_NOMEACAO', 'DATA_VISITA', 'DATA_ATENDIMENTO'].includes(field);
        initialData[field] = isDateField ? today : '';
    });

    setFormData(initialData);
    setIsEditing(false);
    setSelectedItems({});
    setShowMainList(false);
    setDropdownSearch('');
    setActiveFilters({});
    
    loadAllRequiredData();
  }, [activeTab]);

  // 2. Load Pending Reviews
  useEffect(() => {
    api.getRevisoesPendentes().then(setPendingReviews).catch(console.error);
  }, []);

  // 3. Click Outside Handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (filterPopoverOpen && popoverRefs.current[filterPopoverOpen] && !popoverRefs.current[filterPopoverOpen]?.contains(event.target as Node)) {
            setFilterPopoverOpen(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterPopoverOpen]);

  // --- DATA LOADING ---

  const loadAllRequiredData = async () => {
    setLoadingData(true);
    const allEntities = Object.keys(ENTITY_CONFIGS);
    try {
      const results = await Promise.all(allEntities.map(async (entity) => {
           try {
             const data = await api.fetchEntity(entity);
             return { entity, data };
           } catch (e) {
             return { entity, data: [] };
           }
      }));
      
      const newCardData = { ...cardData };
      results.forEach(res => { newCardData[res.entity] = res.data; });
      setCardData(newCardData);
    } catch (e) {
      showToast('error', 'Erro ao carregar dados.');
    } finally {
      setLoadingData(false);
    }
  };

  // --- COMPUTED VALUES ---

  const tabs = useMemo(() => Object.keys(ENTITY_CONFIGS).filter(k => k !== 'AUDITORIA' && k !== 'ATENDIMENTO'), []);
  
  const filteredTabs = useMemo(() => tabs.filter(tab => ENTITY_CONFIGS[tab].title.toLowerCase().includes(dropdownSearch.toLowerCase())), [tabs, dropdownSearch]);

  const columnsToRender = useMemo(() => {
    const columns: string[] = showMainList ? [activeTab] : [];
    const modelFields = DATA_MODEL[activeTab] || [];
    
    modelFields.forEach(field => {
        const linkedEntity = FK_MAPPING[field];
        if (linkedEntity && ENTITY_CONFIGS[linkedEntity] && !columns.includes(linkedEntity) && linkedEntity !== activeTab) {
             columns.push(linkedEntity);
        }
    });
    return columns;
  }, [activeTab, showMainList]);

  // --- HANDLERS ---

  const resetForm = () => {
    const initialData: RecordData = {};
    const today = new Date().toISOString().split('T')[0];
    
    DATA_MODEL[activeTab]?.forEach(field => {
        const isDateField = ['DATA_INICIO', 'DATA_DO_CONTRATO', 'DATA_MATRICULA', 'DATA_DA_NOMEACAO', 'DATA_VISITA', 'DATA_ATENDIMENTO'].includes(field);
        initialData[field] = isDateField ? today : '';
    });
    setFormData(initialData);
  };

  const handleCardSelect = (entity: string, item: any) => {
    const config = ENTITY_CONFIGS[entity];
    const pkValue = String(item[config.pk]);
    
    setSelectedItems(prev => ({ ...prev, [entity]: pkValue }));

    if (entity !== activeTab) {
        const fkField = Object.keys(FK_MAPPING).find(key => FK_MAPPING[key] === entity);
        if (fkField) setFormData(prev => ({ ...prev, [fkField]: pkValue }));
    }
  };

  const handleEdit = (item: any) => {
      const formatted = { ...item };
      if (formatted.SALARIO) formatted.SALARIO = validation.formatCurrency(formatted.SALARIO);
      if (formatted.TELEFONE) formatted.TELEFONE = validation.maskPhone(formatted.TELEFONE);
      if (formatted.CPF) formatted.CPF = validation.maskCPF(formatted.CPF);

      setFormData(formatted);
      setIsEditing(true);
      
      const pkValue = String(item[ENTITY_CONFIGS[activeTab].pk]);
      setSelectedItems(prev => ({ ...prev, [activeTab]: pkValue }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === 'CPF') processedValue = validation.maskCPF(value);
    else if (name === 'TELEFONE') processedValue = validation.maskPhone(value);
    else if (name === 'SALARIO') processedValue = validation.maskCurrency(value);

    // Auto-calculate prefix for Servidor
    if (activeTab === 'SERVIDOR' && name === 'VINCULO') {
         const prefix = getPrefixForVinculo(value);
         setFormData(prev => ({ ...prev, [name]: processedValue, 'PREFIXO_MATRICULA': prefix }));
    } else {
         setFormData(prev => ({ ...prev, [name]: processedValue }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload = { ...formData };

    // Frontend Validations
    if (activeTab === 'PESSOA') {
        if (!validation.validateCPF(payload.CPF)) return showToast('error', 'CPF Inválido.'); 
        payload.CPF = payload.CPF.replace(/\D/g, ""); 
        
        const normalizedPhone = validation.normalizePhoneForSave(payload.TELEFONE);
        if (payload.TELEFONE && !normalizedPhone) return showToast('error', 'Telefone inválido.');
        payload.TELEFONE = normalizedPhone || "";
        payload.NOME = validation.capitalizeName(payload.NOME);
    }

    if (activeTab === 'CARGOS' && payload.SALARIO) {
        payload.SALARIO = payload.SALARIO.replace(/[R$\.\s]/g, '').replace(',', '.');
    }

    // Business Logic: Calculate Metadata for Atendimento
    if (activeTab === 'ATENDIMENTO') {
        const metadata = businessLogic.calculateAtendimentoMetadata(payload);
        payload = { ...payload, ...metadata };
    }

    setSubmitting(true);
    try {
      const config = ENTITY_CONFIGS[activeTab];
      
      // ID Generation for non-manual PKs
      if(!isEditing && !config.manualPk && config.pkPrefix && !payload[config.pk]) {
          payload[config.pk] = validation.generateLegacyId(config.pkPrefix);
      }

      const res = isEditing 
        ? await api.updateRecord(activeTab, config.pk, payload[config.pk], payload)
        : await api.createRecord(activeTab, payload);

      if (res.success) {
        showToast('success', isEditing ? 'Atualizado!' : 'Criado!');
        // Refresh Data
        const newData = await api.fetchEntity(activeTab);
        setCardData(prev => ({ ...prev, [activeTab]: newData }));
        if (activeTab === 'CONTRATO') {
            const resData = await api.fetchEntity('RESERVAS');
            setCardData(prev => ({ ...prev, 'RESERVAS': resData }));
        }
        
        // Reset
        resetForm();
        setIsEditing(false);
      } else {
        showToast('error', res.message);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Erro de conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: any, entityName: string) => {
    e.stopPropagation();
    if (!window.confirm('Confirmar exclusão?')) return;
    const config = ENTITY_CONFIGS[entityName];
    try {
      const res = await api.deleteRecord(entityName, config.pk, item[config.pk]);
      if (res.success) {
        showToast('info', 'Registro excluído.');
        const newData = await api.fetchEntity(entityName);
        setCardData(prev => ({ ...prev, [entityName]: newData }));
      } else { showToast('error', 'Erro ao excluir.'); }
    } catch(err) { showToast('error', 'Erro de conexão.'); }
  };

  const handleLockVaga = async (e: React.MouseEvent, idVaga: string, isOcupada: boolean) => {
      e.stopPropagation();
      if (isOcupada) return showToast('error', 'Vaga ocupada não pode ser bloqueada.');
      try {
          const newStatus = await api.toggleVagaBloqueada(idVaga);
          showToast('success', newStatus ? 'Vaga bloqueada.' : 'Vaga desbloqueada.');
          const newData = await api.fetchEntity('VAGAS');
          setCardData(prev => ({ ...prev, 'VAGAS': newData }));
      } catch (err: any) { showToast('error', err.message); }
  };

  // --- HELPER FUNCTIONS ---

  const getPrefixForVinculo = (vinculo: string) => {
      const map: Record<string, string> = { 'Extra Quadro': '60', 'Aposentado': '70', 'CLT': '29', 'Prestador de Serviços': '39' };
      return map[vinculo] || '10';
  };

  const getFilteredOptions = (field: string): string[] => {
      if (field === 'REMETENTE' && session.papel === 'GPRGP') {
          return DROPDOWN_STRUCTURES['REMETENTE'].filter((o: string) => o !== 'Prefeitura');
      }
      return (DROPDOWN_OPTIONS[field] as string[]) || [];
  };

  // --- RENDER INPUTS ---

  const renderInput = (field: string) => {
    const config = ENTITY_CONFIGS[activeTab];
    const isPK = field === config.pk;
    const isFK = FK_MAPPING[field] !== undefined;
    const isCalculated = field === 'PREFIXO_MATRICULA';

    // Logic to hide specific fields based on role or edit state
    if ((isPK && !isEditing && !config.manualPk) || 
        (activeTab === 'CARGOS' && field === 'SALARIO' && session.papel === 'GGT') ||
        (activeTab === 'PROTOCOLO' && ((field === 'MATRICULA' && session.papel === 'GPRGP') || (field === 'ID_CONTRATO' && session.papel === 'GGT')))) {
        return null;
    }

    const options = getFilteredOptions(field);
    const inputCommonClass = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all duration-200 text-sm font-medium text-simas-dark";

    if (options.length > 0) {
      return (
        <div key={field} className="relative group">
          <label className="block text-[10px] font-bold text-simas-dark/70 uppercase tracking-widest mb-1.5 ml-1">{field.replace(/_/g, ' ')}</label>
          <div className="relative">
            <select name={field} value={formData[field] || ''} onChange={handleInputChange} className={`${inputCommonClass} appearance-none cursor-pointer`}>
              <option value="">Selecione...</option>
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><i className="fas fa-chevron-down text-xs"></i></div>
          </div>
        </div>
      );
    }

    const isReadOnly = (isPK && isEditing) || isCalculated;
    const type = field.includes('DATA') ? 'date' : 'text';

    return (
      <div key={field} className="relative group">
        <label className="block text-[10px] font-bold text-simas-dark/70 uppercase tracking-widest mb-1.5 ml-1">{field.replace(/_/g, ' ')}</label>
        <div className="relative">
            {isFK && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan"><i className="fas fa-link text-xs"></i></div>}
            <input 
                type={type} 
                name={field} 
                value={formData[field] || ''} 
                onChange={handleInputChange} 
                className={`${inputCommonClass} ${isFK ? 'pl-10' : ''} ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-100' : ''}`} 
                readOnly={isReadOnly}
                placeholder={isFK ? "Selecione na lista..." : "Digite aqui..."} 
                maxLength={field === 'CPF' ? 14 : (field === 'TELEFONE' ? 15 : undefined)}
            />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-simas-cloud">
      {/* --- NAVIGATION & CONTROLS --- */}
      <div className="flex-none px-8 pt-8 pb-4 flex items-center justify-between z-20">
        <div className="relative min-w-[300px] z-50">
            <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex items-center justify-between pl-2 pr-4 py-2 bg-white text-simas-dark font-bold text-sm rounded-full border border-gray-100 hover:border-simas-cyan transition-all outline-none shadow-soft group">
                <div className="flex items-center gap-3">
                     <div className="w-9 h-9 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors">
                        <i className="fas fa-folder-open text-xs"></i>
                     </div>
                     <span>{ENTITY_CONFIGS[activeTab]?.title || 'Selecione...'}</span>
                </div>
                <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {isDropdownOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-3xl shadow-2xl overflow-hidden z-50 animate-fade-in flex flex-col max-h-[400px]">
                        <div className="p-3 border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
                            <div className="relative">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input type="text" placeholder="Filtrar..." className="w-full pl-10 pr-4 py-2.5 bg-white border-none rounded-xl text-sm outline-none shadow-sm focus:ring-2 focus:ring-simas-cyan transition-all" value={dropdownSearch} onChange={(e) => setDropdownSearch(e.target.value)} autoFocus onClick={(e) => e.stopPropagation()} />
                            </div>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {filteredTabs.map(tab => (
                                <button key={tab} onClick={() => { setActiveTab(tab); setIsDropdownOpen(false); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all ${activeTab === tab ? 'bg-simas-cloud text-simas-dark font-bold' : 'text-gray-500 hover:bg-gray-50 hover:text-simas-dark'}`}>
                                    <div className={`w-2 h-2 rounded-full ${activeTab === tab ? 'bg-simas-cyan shadow-glow' : 'bg-gray-200'}`}></div>
                                    {ENTITY_CONFIGS[tab].title}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>

        <div className="pl-6 flex items-center gap-4">
            <button onClick={() => setShowMainList(!showMainList)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all shadow-sm uppercase tracking-wide ${showMainList ? 'bg-simas-dark text-white shadow-md' : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-200 hover:text-simas-dark'}`}>
                <i className={`fas ${showMainList ? 'fa-eye' : 'fa-eye-slash'}`}></i> Consultar
            </button>
            <Button variant="secondary" onClick={() => setShowReviewsModal(true)} className="relative !rounded-full w-10 h-10 p-0 flex items-center justify-center border-none shadow-sm bg-white hover:text-simas-cyan text-gray-400 hover:shadow-md">
                <i className="fas fa-bell"></i>
                {pendingReviews.length > 0 && <span className="absolute -top-1 -right-1 bg-simas-cyan text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-white">{pendingReviews.length}</span>}
            </Button>
        </div>
      </div>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex gap-8 px-8 pb-8 overflow-hidden min-h-0 z-10">
        
        {/* 1. EDITOR PANEL */}
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
                {isEditing && <Button type="button" variant="ghost" onClick={() => { resetForm(); setIsEditing(false); }} className="flex-1">Cancelar</Button>}
                <Button type="submit" isLoading={submitting} className="flex-[2]">{isEditing ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </div>
        </div>

        {/* 2. HORIZONTAL COLUMNS */}
        <div className="flex-1 overflow-x-auto flex gap-6 pb-2 items-stretch px-2 scrollbar-thin scrollbar-thumb-simas-blue scrollbar-track-transparent snap-x">
           {columnsToRender.map((entity, index) => {
             const config = ENTITY_CONFIGS[entity];
             if (!config) return null;
             
             const rawData = cardData[entity] || [];
             const searchTerm = (deferredSearchTerms[entity] || '').toLowerCase();
             const entityFilters = activeFilters[entity] || [];
             
             const filteredData = rawData.filter(item => {
                 const display = config.cardDisplay(item);
                 const textMatch = !searchTerm || `${display.title} ${display.subtitle} ${display.details || ''}`.toLowerCase().includes(searchTerm);
                 const filterMatch = entityFilters.length === 0 || (config.filterBy && entityFilters.includes(item[config.filterBy]));
                 return textMatch && filterMatch;
             });

             const isFilterOpen = filterPopoverOpen === entity;
             const filterOptions = isFilterOpen && config.filterBy 
                ? [...new Set(rawData.map(i => i[config.filterBy!]).filter(Boolean))].sort() 
                : [];

             return (
               <div key={`${entity}-${index}`} className="flex-none w-[340px] flex flex-col bg-slate-200 rounded-3xl overflow-hidden snap-center h-full border border-slate-300 backdrop-blur-sm shadow-inner">
                 {/* Column Header */}
                 <div className="p-4 bg-gray-50/80 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100">
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="font-bold flex items-center gap-2 text-simas-dark uppercase text-xs tracking-wider pl-1">
                        {entity !== activeTab && <i className="fas fa-link text-gray-400"></i>} {config.title}
                     </h3>
                     <span className="text-[10px] font-bold bg-white shadow-sm border border-gray-100 px-2.5 py-1 rounded-full text-gray-500">{filteredData.length}</span>
                   </div>
                   <div className="flex gap-2">
                       <div className="relative group flex-grow">
                           <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-colors group-hover:text-simas-cyan"></i>
                           <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border-none bg-white shadow-sm text-xs focus:ring-2 focus:ring-simas-cyan/50 outline-none transition-all" value={searchTerms[entity] || ''} onChange={(e) => setSearchTerms(prev => ({ ...prev, [entity]: e.target.value }))} />
                       </div>
                       {config.filterBy && (
                           <div className="relative" ref={el => { popoverRefs.current[entity] = el; }}>
                               <button className={`w-9 h-full rounded-xl flex items-center justify-center transition-all shadow-sm border border-transparent ${isFilterOpen || entityFilters.length > 0 ? 'bg-simas-cyan text-white shadow-glow' : 'bg-white text-gray-400 hover:text-simas-cyan'}`} onClick={() => setFilterPopoverOpen(isFilterOpen ? null : entity)}>
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
                                                   <input type="checkbox" checked={entityFilters.includes(opt)} onChange={() => setActiveFilters(prev => ({ ...prev, [entity]: prev[entity]?.includes(opt) ? prev[entity].filter(v => v !== opt) : [...(prev[entity]||[]), opt] }))} className="rounded text-simas-cyan focus:ring-simas-cyan border-gray-300"/>
                                                   <span className="truncate">{opt}</span>
                                               </label>
                                           ))}
                                       </div>
                                   </div>
                               )}
                           </div>
                       )}
                   </div>
                 </div>
                 
                 {/* Cards List */}
                 <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                   {loadingData ? <div className="p-4 mb-3 bg-white/50 rounded-2xl border border-white shadow-sm animate-pulse h-24"></div> : filteredData.map(item => {
                       const pkValue = String(item[config.pk]);
                       const display = config.cardDisplay(item);
                       const isSelected = selectedItems[entity] === pkValue;
                       const isOcupada = item.STATUS_VAGA === 'Ocupada';
                       
                       let exerciseData = undefined;
                       if (entity === 'VAGAS') {
                           exerciseData = { label: item.NOME_LOTACAO_EXERCICIO || 'Sem exercício definido', onEdit: () => setExerciseVagaId(pkValue) };
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
                            onEdit={entity === activeTab ? () => handleEdit(item) : undefined}
                            exerciseData={exerciseData}
                            actions={
                             <>
                               {entity === 'PESSOA' && <Button variant="icon" icon="fas fa-id-card" title="Dossiê" onClick={(e) => {e.stopPropagation(); setDossierCpf(item.CPF);}} />}
                               {entity === 'VAGAS' && <Button variant="icon" icon={item.BLOQUEADA ? "fas fa-lock" : "fas fa-lock-open"} className={`${item.BLOQUEADA ? "text-red-500" : ""} ${isOcupada ? "opacity-30 cursor-not-allowed text-gray-400" : ""}`} disabled={isOcupada} onClick={(e) => handleLockVaga(e, pkValue, isOcupada)} />}
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

      {/* --- MODALS --- */}
      {dossierCpf && <DossierModal cpf={dossierCpf} onClose={() => setDossierCpf(null)} />}
      {exerciseVagaId && <ExerciseSelectionModal vagaId={exerciseVagaId} onClose={() => setExerciseVagaId(null)} onSuccess={() => { setExerciseVagaId(null); showToast('success', 'Atualizado!'); api.fetchEntity('VAGAS').then(d => setCardData(p => ({...p, 'VAGAS': d}))); }} />}
      {actionAtendimentoId && <ActionExecutionModal idAtendimento={actionAtendimentoId} onClose={() => setActionAtendimentoId(null)} onSuccess={() => { setActionAtendimentoId(null); loadAllRequiredData(); api.getRevisoesPendentes().then(setPendingReviews); showToast('success', 'Sucesso!'); }} />}
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
                                    <div className="w-12 h-12 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors"><i className="fas fa-tasks text-lg"></i></div>
                                    <div>
                                        <h4 className="font-bold text-simas-dark text-lg leading-tight group-hover:text-simas-cyan transition-colors">{rev.TIPO_DE_ACAO} {rev.ENTIDADE_ALVO}</h4>
                                        <p className="text-sm text-gray-500">Para: <span className="font-medium text-gray-700">{rev.NOME_PESSOA}</span></p>
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
