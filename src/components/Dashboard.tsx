
import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING, PERMISSOES_POR_PAPEL, READ_ONLY_ENTITIES } from '../constants';
import { api } from '../services/api';
import { Button } from './Button';
import { RecordData, UserSession, AppContextProps } from '../types';
import { validation } from '../utils/validation';
import { businessLogic } from '../utils/businessLogic';
import { DossierModal } from './DossierModal';
import { ActionExecutionModal } from './ActionExecutionModal';
import { ExerciseSelectionModal } from './ExerciseSelectionModal';
import { EntityForm } from './EntityForm';
import { EntityColumn } from './EntityColumn';

interface DashboardProps extends AppContextProps {}

export const Dashboard: React.FC<DashboardProps> = ({ showToast }) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('Pessoa');
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
  const [showMainList, setShowMainList] = useState(true);

  // Modal State
  const [dossierCpf, setDossierCpf] = useState<string | null>(null);
  const [actionAtendimentoId, setActionAtendimentoId] = useState<string | null>(null);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [exerciseVagaId, setExerciseVagaId] = useState<string | null>(null);

  // --- SESSION ---
  const session: UserSession = useMemo(() => {
      const stored = localStorage.getItem('simas_user_session');
      return stored ? JSON.parse(stored) : { token: '', papel: 'GGT', usuario: '', isGerente: false };
  }, []);

  // --- COMPUTED VALUES ---

  const isEntityAllowed = (entityName: string) => {
      const allowed = PERMISSOES_POR_PAPEL[session.papel] || [];
      return allowed.includes('TODAS') || allowed.includes(entityName);
  };

  const columnsToRender = useMemo<string[]>(() => {
    const columns: string[] = showMainList ? [activeTab] : [];
    const modelFields = DATA_MODEL[activeTab] || [];
    
    modelFields.forEach(field => {
        const linkedEntity = FK_MAPPING[field];
        if (linkedEntity && ENTITY_CONFIGS[linkedEntity] && !columns.includes(linkedEntity) && linkedEntity !== activeTab) {
             if (isEntityAllowed(linkedEntity)) {
                 columns.push(linkedEntity);
             }
        }
    });
    return columns;
  }, [activeTab, showMainList, session.papel]);

  const tabs = useMemo(() => {
      return Object.keys(ENTITY_CONFIGS).filter(k => 
          k !== 'Auditoria' && k !== 'Atendimento' && isEntityAllowed(k)
      );
  }, [session.papel]);
  
  const filteredTabs = useMemo(() => tabs.filter(tab => ENTITY_CONFIGS[tab].title.toLowerCase().includes(dropdownSearch.toLowerCase())), [tabs, dropdownSearch]);

  const isReadOnly = useMemo(() => {
      return READ_ONLY_ENTITIES.includes(activeTab) && session.papel !== 'COORDENAÇÃO';
  }, [activeTab, session.papel]);

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
    setShowMainList(true); 
    setDropdownSearch('');
    setActiveFilters({});
    setFilterPopoverOpen(null);
    
  }, [activeTab]);

  // Load data whenever the visible columns change or active tab changes
  useEffect(() => {
      loadRequiredData();
  }, [columnsToRender, activeTab]);

  // 2. Load Pending Reviews
  useEffect(() => {
    api.getRevisoesPendentes().then(setPendingReviews).catch(console.error);
  }, []);

  // --- DATA LOADING ---

  const loadRequiredData = async () => {
    const entitiesToFetch = new Set<string>(columnsToRender);
    entitiesToFetch.add(activeTab); 

    const modelFields = DATA_MODEL[activeTab] || [];
    modelFields.forEach(field => {
        const linkedEntity = FK_MAPPING[field];
        if (linkedEntity && isEntityAllowed(linkedEntity)) {
            entitiesToFetch.add(linkedEntity);
        }
    });

    const missingEntities = Array.from(entitiesToFetch);
    if (missingEntities.length === 0) return;

    setLoadingData(true);
    try {
      const results = await Promise.all(missingEntities.map(async (entity: string) => {
           try {
             const data = await api.fetchEntity(entity);
             return { entity, data };
           } catch (e) {
             return { entity, data: [] };
           }
      }));
      
      setCardData(prev => {
          const next = { ...prev };
          results.forEach(res => { next[res.entity] = res.data; });
          return next;
      });
    } catch (e) {
      showToast('error', 'Erro ao carregar dados.');
    } finally {
      setLoadingData(false);
    }
  };

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

    if (activeTab === 'Servidor' && name === 'VINCULO') {
         const map: Record<string, string> = { 'Extra Quadro': '60', 'Aposentado': '70', 'CLT': '29', 'Prestador de Serviços': '39' };
         const prefix = map[value] || '10';
         setFormData(prev => ({ ...prev, [name]: processedValue, 'PREFIXO_MATRICULA': prefix }));
    } else {
         setFormData(prev => ({ ...prev, [name]: processedValue }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return showToast('error', 'Ação não permitida.');

    let payload = { ...formData };

    if (activeTab === 'Pessoa') {
        if (!validation.validateCPF(payload.CPF)) return showToast('error', 'CPF Inválido.'); 
        payload.CPF = payload.CPF.replace(/\D/g, ""); 
        
        const normalizedPhone = validation.normalizePhoneForSave(payload.TELEFONE);
        if (payload.TELEFONE && !normalizedPhone) return showToast('error', 'Telefone inválido.');
        payload.TELEFONE = normalizedPhone || "";
        payload.NOME = validation.capitalizeName(payload.NOME);
    }

    if (activeTab === 'Cargo' && payload.SALARIO) {
        payload.SALARIO = payload.SALARIO.replace(/[R$\.\s]/g, '').replace(',', '.');
    }

    if (activeTab === 'Atendimento') {
        const metadata = businessLogic.calculateAtendimentoMetadata(payload);
        payload = { ...payload, ...metadata };
    }

    setSubmitting(true);
    try {
      const config = ENTITY_CONFIGS[activeTab];
      
      if(!isEditing && !config.manualPk && config.pkPrefix && !payload[config.pk]) {
          payload[config.pk] = validation.generateLegacyId(config.pkPrefix);
      }

      const res = isEditing 
        ? await api.updateRecord(activeTab, config.pk, payload[config.pk], payload)
        : await api.createRecord(activeTab, payload);

      if (res.success) {
        showToast('success', isEditing ? 'Atualizado!' : 'Criado!');
        const newData = await api.fetchEntity(activeTab, true); 
        setCardData(prev => ({ ...prev, [activeTab]: newData }));
        
        if (activeTab === 'Contrato') {
            const resData = await api.fetchEntity('Reserva', true);
            setCardData(prev => ({ ...prev, 'Reserva': resData }));
        }
        
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

  const handleDelete = async (item: any, entityName?: string) => {
    const targetEntity = entityName || activeTab;
    if (!window.confirm('Confirmar exclusão?')) return;
    const config = ENTITY_CONFIGS[targetEntity];
    try {
      const res = await api.deleteRecord(targetEntity, config.pk, item[config.pk]);
      if (res.success) {
        showToast('info', 'Registro excluído.');
        const newData = await api.fetchEntity(targetEntity, true);
        setCardData(prev => ({ ...prev, [targetEntity]: newData }));
      } else { showToast('error', 'Erro ao excluir.'); }
    } catch(err) { showToast('error', 'Erro de conexão.'); }
  };

  const handleLockVaga = async (idVaga: string, isOcupada: boolean) => {
      if (isOcupada) return showToast('error', 'Vaga ocupada não pode ser bloqueada.');
      try {
          const newStatus = await api.toggleVagaBloqueada(idVaga);
          showToast('success', newStatus ? 'Vaga bloqueada.' : 'Vaga desbloqueada.');
          const newData = await api.fetchEntity('Vaga', true);
          setCardData(prev => ({ ...prev, 'Vaga': newData }));
      } catch (err: any) { showToast('error', err.message); }
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
        
        <EntityForm 
            activeTab={activeTab}
            formData={formData}
            isEditing={isEditing}
            isReadOnly={isReadOnly}
            submitting={submitting}
            session={session}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
            onCancel={() => { resetForm(); setIsEditing(false); }}
        />

        {/* COLUMNS */}
        <div className="flex-1 overflow-x-auto flex gap-6 pb-2 items-stretch px-2 scrollbar-thin scrollbar-thumb-simas-blue scrollbar-track-transparent snap-x">
           {columnsToRender.map((entity, index) => {
             return (
               <EntityColumn
                 key={`${entity}-${index}`}
                 entity={entity}
                 activeTab={activeTab}
                 session={session}
                 data={cardData[entity] || []}
                 loading={loadingData}
                 searchTerm={deferredSearchTerms[entity] || ''}
                 filters={activeFilters[entity] || []}
                 isFilterOpen={filterPopoverOpen === entity}
                 selectedItemId={selectedItems[entity]}
                 onSearchChange={(val) => setSearchTerms(prev => ({ ...prev, [entity]: val }))}
                 onToggleFilter={() => setFilterPopoverOpen(filterPopoverOpen === entity ? null : entity)}
                 onFilterChange={(opt) => setActiveFilters(prev => ({ ...prev, [entity]: prev[entity]?.includes(opt) ? prev[entity].filter(v => v !== opt) : [...(prev[entity]||[]), opt] }))}
                 onClearFilters={() => setActiveFilters(prev => ({...prev, [entity]: []}))}
                 onSelectCard={(item) => handleCardSelect(entity, item)}
                 onEditCard={handleEdit}
                 onDeleteCard={(item) => handleDelete(item, entity)}
                 onLockVaga={handleLockVaga}
                 onDossier={setDossierCpf}
                 onExerciseEdit={(id) => setExerciseVagaId(id)}
               />
             );
           })}
        </div>
      </div>

      {/* --- MODALS --- */}
      {dossierCpf && <DossierModal cpf={dossierCpf} onClose={() => setDossierCpf(null)} />}
      {exerciseVagaId && <ExerciseSelectionModal vagaId={exerciseVagaId} onClose={() => setExerciseVagaId(null)} onSuccess={() => { setExerciseVagaId(null); showToast('success', 'Atualizado!'); api.fetchEntity('Vaga', true).then((d: any) => setCardData(p => ({...p, 'Vaga': d}))); }} />}
      {actionAtendimentoId && <ActionExecutionModal idAtendimento={actionAtendimentoId} onClose={() => setActionAtendimentoId(null)} onSuccess={() => { setActionAtendimentoId(null); loadRequiredData(); api.getRevisoesPendentes().then(setPendingReviews); showToast('success', 'Sucesso!'); }} />}
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
