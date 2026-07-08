import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ENTITY_CONFIGS, DATA_MODEL, FK_MAPPING, DROPDOWN_OPTIONS, BOOLEAN_FIELD_CONFIG, PERMISSOES_POR_PAPEL } from '../constants';
import { useDashboardData, useMutateEntity, useToggleVagaLock } from '../hooks/useSimasData';
import { Button } from './Button';
import { Card } from './Card';
import { RecordData, UserSession, AppContextProps } from '../types';
import { validation } from '../utils/validation';
import { businessLogic } from '../utils/businessLogic';
import { DossierModal } from './DossierModal';
import { ExerciseSelectionModal } from './ExerciseSelectionModal';
import { SelectionModal } from './SelectionModal';
import { ConfirmModal } from './ConfirmModal';
import { api } from '../services/api';

interface DashboardProps {
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

// Entidades que possuem fluxo de arquivamento/inativação em vez de exclusão direta
const ARCHIVABLE_ENTITIES = ['Contrato', 'Servidor', 'Alocacao'];

export const Dashboard: React.FC<DashboardProps> = ({ showToast }) => {
  // --- SESSION ---
  const session: UserSession = useMemo(() => {
      const stored = localStorage.getItem('simas_user_session');
      return stored ? JSON.parse(stored) : { token: '', papel: 'GGT', usuario: '', isGerente: false };
  }, []);

  const queryClient = useQueryClient();

  // --- PERMISSIONS ---
  const canDelete = session.papel === 'COORDENAÇÃO' || session.isGerente;
  const isUserReadOnly = session.papel === 'GACP';

  // --- COMPUTED VALUES (Role Filtering) ---
  const tabs = useMemo(() => {
      const allKeys = Object.keys(ENTITY_CONFIGS).filter(k => k !== 'Auditoria');
      const userPermissions = PERMISSOES_POR_PAPEL[session.papel] || [];
      
      if (userPermissions.includes('TODAS')) {
          return allKeys;
      }

      return allKeys.filter(key => userPermissions.includes(key));
  }, [session.papel]);

  // --- STATE ---
  const [activeTab, setActiveTab] = useState(tabs[0] || 'Pessoa');
  const [formData, setFormData] = useState<RecordData>({});
  const [isEditing, setIsEditing] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});

  // UI State
  const [searchTerms, setSearchTerms] = useState<{ [key: string]: string }>({});
  const deferredSearchTerms = useDeferredValue(searchTerms);
  const [activeFilters, setActiveFilters] = useState<{ [entity: string]: string[] }>({});
  const [filterPopoverOpen, setFilterPopoverOpen] = useState<string | null>(null);
  const [filterSearchTerm, setFilterSearchTerm] = useState(''); // New state for filter search
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [showMainList, setShowMainList] = useState(false);

  // Modal State
  const [dossierCpf, setDossierCpf] = useState<string | null>(null);
  const [exerciseVagaId, setExerciseVagaId] = useState<string | null>(null);
  
  // CEP Search and Override State
  const [cepDataToConfirm, setCepDataToConfirm] = useState<{ logradouro: string, bairro: string, cep?: string, complemento?: string, localidade?: string, uf?: string } | null>(null);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepSearchResults, setCepSearchResults] = useState<any[]>([]);
  const [showCepSearchModal, setShowCepSearchModal] = useState(false);

  // Delete Confirmation State
  const [itemToDelete, setItemToDelete] = useState<{item: any, entity: string} | null>(null);
  const [archiveReason, setArchiveReason] = useState<string>('');
  const [moveVagaContratoItem, setMoveVagaContratoItem] = useState<any>(null);
  const [availableVagas, setAvailableVagas] = useState<any[]>([]);
  const [showVagaSelection, setShowVagaSelection] = useState(false);

  const [estadosIbge, setEstadosIbge] = useState<any[]>([]);
  const [cidadesIbge, setCidadesIbge] = useState<any[]>([]);
  const [isLoadingCidades, setIsLoadingCidades] = useState(false);

  useEffect(() => {
      const loadEstados = async () => {
          const data = await api.getEstados();
          setEstadosIbge(data);
      };
      loadEstados();
  }, []);

  useEffect(() => {
      const loadCidades = async () => {
          if (formData.PAIS === 'Brasil' && formData.ESTADO) {
              setIsLoadingCidades(true);
              const data = await api.getCidades(formData.ESTADO);
              setCidadesIbge(data);
              setIsLoadingCidades(false);
          } else {
              setCidadesIbge([]);
          }
      };
      loadCidades();
  }, [formData.ESTADO, formData.PAIS]);

  const popoverRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // --- REACT QUERY DATA LOADING ---
  // Ensure default is a valid key available to the user
  useEffect(() => {
      if (!tabs.includes(activeTab) && tabs.length > 0) {
          setActiveTab(tabs[0]);
      }
  }, [tabs, activeTab]);

  // Reset form on tab change
  useEffect(() => {
    const initialData: RecordData = {};
    const today = new Date().toISOString().split('T')[0];
    DATA_MODEL[activeTab]?.forEach(field => {
        const isDateField = /DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE/i.test(field);
        initialData[field] = isDateField ? today : '';
    });
    setFormData(initialData);
    setIsEditing(false);
    setSelectedItems({});
    setShowMainList(false);
    setDropdownSearch('');
    setActiveFilters({});
    setFilterPopoverOpen(null);
  }, [activeTab]);

  // Calculate needed columns
  const columnsToRender = useMemo(() => {
    const columns: string[] = showMainList ? [activeTab] : [];
    const modelFields = DATA_MODEL[activeTab] || [];
    modelFields.forEach(field => {
        const linkedEntity = FK_MAPPING[field];
        if (linkedEntity && ENTITY_CONFIGS[linkedEntity] && !columns.includes(linkedEntity) && linkedEntity !== activeTab) {
             if (tabs.includes(linkedEntity)) {
                 columns.push(linkedEntity);
             }
        }
    });
    return columns;
  }, [activeTab, showMainList, tabs]);

  // FETCH DATA IN PARALLEL
  const queries = useDashboardData(columnsToRender);
  const loadingData = queries.some((q: any) => q.isLoading);

  // --- MUTATIONS ---
  const { create: createMutation, update: updateMutation, remove: deleteMutation } = useMutateEntity(activeTab);
  
  // Hook genérico para deletar qualquer entidade (usado no modal de confirmação)
  const { remove: genericRemove } = useMutateEntity(itemToDelete?.entity || 'Pessoa'); 

  const toggleLockMutation = useToggleVagaLock();

  // --- HANDLERS ---

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

      Object.keys(formatted).forEach(key => {
          if (/DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE/i.test(key) && formatted[key]) {
             try {
                 if (typeof formatted[key] === 'string') {
                     formatted[key] = formatted[key].split('T')[0];
                 } else if (formatted[key] instanceof Date) {
                     formatted[key] = formatted[key].toISOString().split('T')[0];
                 }
             } catch(e) {}
          }
      });

      setFormData(formatted);
      setIsEditing(true);
      
      const pkValue = String(item[ENTITY_CONFIGS[activeTab].pk]);
      setSelectedItems(prev => ({ ...prev, [activeTab]: pkValue }));
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const config = ENTITY_CONFIGS[activeTab];

    // Block editing PK if in edit mode (PKs should be immutable during update)
    if (isEditing && name === config.pk) return;

    let processedValue = value;

    if (name === 'CPF') processedValue = validation.maskCPF(value);
    else if (name === 'TELEFONE') processedValue = validation.maskPhone(value);
    else if (name === 'SALARIO') processedValue = validation.maskCurrency(value);
    else if (name === 'CEP') processedValue = validation.maskCEP(value);

    if (activeTab === 'Servidor' && name === 'VINCULO') {
         const prefix = getPrefixForVinculo(value);
         setFormData(prev => ({ ...prev, [name]: processedValue, 'PREFIXO_MATRICULA': prefix }));
    } else if (name === 'PAIS') {
         const isBrasil = processedValue === 'Brasil';
         setFormData(prev => ({ 
             ...prev, 
             [name]: processedValue,
             // Se mudar para exterior, limpa campos específicos do Brasil para não sujar o BD
             ...(isBrasil ? {} : {
                 ESTADO: '',
                 CIDADE: '',
                 CEP: '',
                 BAIRRO: '',
                 NUMERO: '',
                 COMPLEMENTO: ''
             })
         }));
    } else {
         setFormData(prev => ({ ...prev, [name]: processedValue }));
    }

    // Auto-fill CEP logic for Entities with Address
    if (['Pessoa', 'Vinculacao', 'Cogestora'].includes(activeTab) && name === 'CEP') {
        const cleanCep = processedValue.replace(/\D/g, '');
        if (cleanCep.length === 8) {
            try {
                const data = await api.getCepData(cleanCep);
                if (data && !data.erro) {
                    setFormData(prev => ({
                        ...prev,
                        ENDERECO: data.logradouro || prev.ENDERECO,
                        BAIRRO: data.bairro || prev.BAIRRO,
                        CIDADE: data.localidade || prev.CIDADE,
                        ESTADO: data.uf || prev.ESTADO,
                        PAIS: prev.PAIS || 'Brasil'
                    }));
                    showToast('success', 'Endereço preenchido automaticamente.');
                }
            } catch (err) {
                console.error("Erro ao buscar CEP", err);
            }
        }
    }
  };

  const handleConfirmCepOverwrite = () => {
      if (cepDataToConfirm) {
          setFormData(prev => ({
              ...prev,
              CEP: cepDataToConfirm.cep ? validation.maskCEP(cepDataToConfirm.cep) : prev.CEP,
              ENDERECO: cepDataToConfirm.logradouro || prev.ENDERECO,
              BAIRRO: cepDataToConfirm.bairro || prev.BAIRRO,
              CIDADE: cepDataToConfirm.localidade || prev.CIDADE,
              ESTADO: cepDataToConfirm.uf || prev.ESTADO,
              PAIS: prev.PAIS || 'Brasil'
          }));
          setCepDataToConfirm(null);
          setCepSearchResults([]);
          showToast('success', 'Endereço atualizado com sucesso.');
      }
  };

  const handleCancelCepOverwrite = () => {
      if (cepDataToConfirm) {
          setFormData(prev => ({
              ...prev,
              ENDERECO: prev.ENDERECO || cepDataToConfirm.logradouro || '',
              BAIRRO: prev.BAIRRO || cepDataToConfirm.bairro || '',
              CEP: prev.CEP || (cepDataToConfirm.cep ? validation.maskCEP(cepDataToConfirm.cep) : '')
          }));
          setCepDataToConfirm(null);
          setCepSearchResults([]);
          showToast('success', 'Apenas os campos em branco foram preenchidos.');
      }
  };

  const handleSearchCepByLogradouro = async () => {
      if (!formData.ENDERECO || (formData.ENDERECO as string).length < 3) {
          showToast('error', 'Digite pelo menos 3 caracteres do endereço para buscar.');
          return;
      }
      setIsSearchingCep(true);
      try {
          const results = await api.searchCepByLogradouro(formData.ENDERECO as string);
          if (results && results.length > 0) {
              setCepSearchResults(results);
              setShowCepSearchModal(true);
          } else {
              showToast('error', 'Nenhum CEP encontrado para este endereço.');
          }
      } catch (e: any) {
          showToast('error', 'Erro ao buscar CEP. Tente novamente mais tarde.');
      } finally {
          setIsSearchingCep(false);
      }
  };

  const handleSelectCepResult = (result: any) => {
      setShowCepSearchModal(false);
      const hasExistingData = formData.CEP || formData.BAIRRO || (formData.ENDERECO && formData.ENDERECO !== result.logradouro);
      if (hasExistingData) {
          setCepDataToConfirm({ logradouro: result.logradouro, bairro: result.bairro, cep: result.cep, complemento: result.complemento, localidade: result.localidade, uf: result.uf });
      } else {
          setFormData(prev => ({
              ...prev,
              CEP: validation.maskCEP(result.cep),
              ENDERECO: result.logradouro,
              BAIRRO: result.bairro,
              CIDADE: result.localidade,
              ESTADO: result.uf,
              PAIS: prev.PAIS || 'Brasil'
          }));
          setCepSearchResults([]);
          showToast('success', 'Endereço selecionado e CEP preenchido com sucesso!');
      }
  };

  const handleToggleChange = (field: string, checked: boolean) => {
      const config = BOOLEAN_FIELD_CONFIG[field];
      let val: any = checked;
      if (config.type === 'string') val = checked ? 'Sim' : 'Não';
      setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payload = { ...formData };

    if (activeTab === 'Pessoa') {
        if (payload.CPF) {
            if (!validation.validateCPF(payload.CPF)) return showToast('error', 'CPF Inválido.'); 
            payload.CPF = payload.CPF.replace(/\D/g, ""); 
        } else if (activeTab === 'Pessoa') {
            return showToast('error', 'CPF é obrigatório para Pessoa.');
        }

        if (payload.CEP) payload.CEP = payload.CEP.replace(/\D/g, "");
        const normalizedPhone = validation.normalizePhoneForSave(payload.TELEFONE);
        if (payload.TELEFONE && !normalizedPhone) return showToast('error', 'Telefone inválido.');
        payload.TELEFONE = normalizedPhone || "";
        payload.NOME = validation.capitalizeName(payload.NOME);
        if (payload.NOME_SOCIAL) payload.NOME_SOCIAL = validation.capitalizeName(payload.NOME_SOCIAL);
    }

    if (activeTab === 'PostoTrabalho' && payload.SALARIO) {
        payload.SALARIO = payload.SALARIO.replace(/[R$\.\s]/g, '').replace(',', '.');
    }

    try {
      const config = ENTITY_CONFIGS[activeTab];
      
      if(!isEditing && !config.manualPk && config.pkPrefix && !payload[config.pk]) {
          payload[config.pk] = validation.generateLegacyId(config.pkPrefix);
      }

      if (isEditing) {
          const pkValue = selectedItems[activeTab] || payload[config.pk];
          await updateMutation.mutateAsync({ pkValue, data: payload });
          showToast('success', 'Atualizado!');
      } else {
          await createMutation.mutateAsync(payload);
          showToast('success', 'Criado!');
          setFormData(prev => {
              // Reset only specific fields if needed, or simple reset
              const initial: any = {};
              DATA_MODEL[activeTab]?.forEach(f => {
                  if(/DATA|INICIO/.test(f)) initial[f] = new Date().toISOString().split('T')[0];
                  else initial[f] = '';
              });
              return initial;
          });
      }
      setIsEditing(false);
    } catch (err: any) {
      showToast('error', err.message || 'Erro de conexão.');
    }
  };

  const handleDeleteRequest = (e: React.MouseEvent, item: any, entityName: string) => {
    e.stopPropagation();
    setItemToDelete({ item, entity: entityName });
    setArchiveReason('');
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    const { entity, item } = itemToDelete;
    const config = ENTITY_CONFIGS[entity];
    const isArchivable = ARCHIVABLE_ENTITIES.includes(entity);
    
    try {
      if (entity === 'Contrato') {
          if (!archiveReason.trim()) return showToast('error', 'Motivo é obrigatório para encerrar contrato.');
          await api.archiveContrato({ CPF: item.CPF }, archiveReason);
          showToast('info', 'Contrato encerrado e arquivado com sucesso.');
          queryClient.invalidateQueries({ queryKey: ['entity', 'Contrato'] });
      } else if (entity === 'Servidor') {
          if (!archiveReason.trim()) return showToast('error', 'Motivo é obrigatório para inativar servidor.');
          await api.inactivateServidor(item.MATRICULA, archiveReason);
          showToast('info', 'Servidor inativado com sucesso.');
          queryClient.invalidateQueries({ queryKey: ['entity', 'Servidor'] });
      } else {
          await genericRemove.mutateAsync(item[config.pk]);
          showToast('info', isArchivable ? 'Registro arquivado com sucesso.' : 'Registro excluído.');
      }
    } catch(err: any) { 
      showToast('error', err.message || 'Erro ao processar solicitação.'); 
    } finally {
      setItemToDelete(null);
      setArchiveReason('');
    }
  };

  const handleLockVaga = async (e: React.MouseEvent, idVaga: string, isOcupada: boolean) => {
      e.stopPropagation();
      if (isOcupada) return showToast('error', 'Vaga ocupada não pode ser bloqueada.');
      try {
          await toggleLockMutation.mutateAsync(idVaga);
          showToast('success', 'Status da vaga alterado.');
      } catch (err: any) { showToast('error', err.message); }
  };

  const handleOpenMoveVaga = async (e: React.MouseEvent, item: any) => {
      e.stopPropagation();
      setMoveVagaContratoItem(item);
      try {
          const vagas = await api.fetchEntity('VAGA');
          const pessoaEscolaridade = item.pessoa?.ESCOLARIDADE;
          const abertas = vagas.filter((v: any) => {
              if (v.STATUS_VAGA !== 'Aberta' || v.BLOQUEADA) return false;
              // Check Escolaridade
              const vagaEscolaridade = v.postoTrabalho?.ESCOLARIDADE;
              const check = businessLogic.checkEscolaridade(pessoaEscolaridade, vagaEscolaridade);
              return check.condiz;
          });
          setAvailableVagas(abertas);
          setShowVagaSelection(true);
      } catch (err) {
          showToast('error', 'Erro ao carregar vagas abertas.');
      }
  };

  const handleConfirmMoveVaga = async (vagaSelecionada: any) => {
      if (!moveVagaContratoItem) return;
      try {
          // Motivo is fixed here as it's an automated move action.
          await api.moverContrato({ CPF: moveVagaContratoItem.CPF }, vagaSelecionada.ID_VAGA, 'Movimentação automática de vaga pelo painel');
          showToast('success', 'Contrato movido para nova vaga com sucesso!');
          queryClient.invalidateQueries({ queryKey: ['entity', 'Contrato'] });
          queryClient.invalidateQueries({ queryKey: ['entity', 'Vaga'] });
      } catch (e: any) {
          showToast('error', e.message || 'Erro ao mover contrato.');
      } finally {
          setShowVagaSelection(false);
          setMoveVagaContratoItem(null);
      }
  };

  // --- RENDER HELPERS ---
  const filteredTabs = useMemo(() => tabs.filter(tab => ENTITY_CONFIGS[tab].title.toLowerCase().includes(dropdownSearch.toLowerCase())), [tabs, dropdownSearch]);
  const getPrefixForVinculo = (vinculo: string) => ({ 'Extra Quadro': '60', 'Aposentado': '70', 'CLT': '29', 'Prestador de Serviços': '39' }[vinculo] || '10');
  const getFilteredOptions = (field: string) => (DROPDOWN_OPTIONS[field] as string[]) || [];

  const renderInput = (field: string) => {
    const config = ENTITY_CONFIGS[activeTab];
    const isPK = field === config.pk;
    // CRITICAL FIX: Only treat as FK if it maps to a different table than the current one
    let isFK = FK_MAPPING[field] !== undefined && FK_MAPPING[field] !== activeTab;

    const isCalculated = field === 'PREFIXO_MATRICULA';

    if ((isPK && !isEditing && !config.manualPk) || 
        (activeTab === 'PostoTrabalho' && field === 'SALARIO' && session.papel === 'GGT') ||
        (activeTab === 'Protocolo' && ((field === 'MATRICULA' && session.papel === 'GPMP') || (field === 'ID_CONTRATO' && session.papel === 'GGT')))) {
        return null;
    }

    // --- REGRAS DE VISIBILIDADE PROGRESSIVA (ENDEREÇO) ---
    const currentPais = String(formData.PAIS || '').trim();
    const isBrasil = !currentPais || currentPais === 'Brasil';
    const addressFields = ['CEP', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO'];

    // PAIS sempre aparece (se estiver no modelo)
    if (field === 'ESTADO') {
        if (!isBrasil || !currentPais) return null;
    }
    if (field === 'CIDADE') {
        if (!isBrasil || !formData.ESTADO) return null;
    }
    if (addressFields.includes(field)) {
        if (isBrasil && !formData.CIDADE) return null;
        if (!isBrasil && field !== 'ENDERECO') return null;
        if (!isBrasil && field === 'ENDERECO' && !currentPais) return null;
    }

    if (BOOLEAN_FIELD_CONFIG[field]) {        const boolConfig = BOOLEAN_FIELD_CONFIG[field];
        let isChecked = false;
        const currentVal = formData[field];
        if (boolConfig.type === 'boolean') isChecked = !!currentVal;
        else isChecked = currentVal === 'Sim';

        return (
            <div key={field} className="relative group">
                <label className="flex items-center justify-between w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl cursor-pointer transition-all hover:border-simas-cyan/50 hover:bg-white">
                    <div className="flex flex-col">
                       {/* Label: Cera Pro Medium, Uppercase */}
                       <span className="text-[10px] font-medium text-simas-dark/70 uppercase tracking-widest">{field.replace(/_/g, ' ')}</span>
                       <span className="text-[11px] text-gray-400 font-normal mt-1 tracking-wide">{isChecked ? 'Ativado/Sim' : 'Desativado/Não'}</span>
                    </div>
                    <div className="relative">
                      <input type="checkbox" className="sr-only peer" checked={isChecked} onChange={(e) => handleToggleChange(field, e.target.checked)} />
                      <div className="w-12 h-7 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-simas-cyan"></div>
                    </div>
                </label>
            </div>
        );
    }

    const options = getFilteredOptions(field);
    const inputCommonClass = "w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all duration-200 text-sm font-normal text-simas-dark tracking-wide";

    if (options.length > 0) {
      if (options.length <= 4) {
          return (
             <div key={field} className="relative group mb-1">
                 {/* Label: Cera Pro Medium, Uppercase */}
                 <label className="block text-[10px] font-medium text-simas-dark/70 uppercase tracking-widest mb-2 ml-1">{field.replace(/_/g, ' ')} <span className="text-red-400 font-bold">*</span></label>
                 <div className="flex gap-2 w-full">
                     {options.map((opt: string) => {
                         const isSelected = formData[field] === opt;
                         let label = opt;
                         if (field === 'SEXO') { if (opt === 'M') label = 'Masculino'; if (opt === 'F') label = 'Feminino'; }
                         return (
                             <button key={opt} type="button" onClick={() => handleInputChange({ target: { name: field, value: opt } } as any)} className={`flex-1 py-3 px-3 rounded-xl text-xs font-medium tracking-wide border transition-all duration-200 flex items-center justify-center gap-2 outline-none ${isSelected ? 'bg-simas-cyan text-white border-simas-cyan shadow-md transform scale-[1.02]' : 'bg-white text-gray-500 border-gray-200 hover:border-simas-cyan/50 hover:bg-gray-50'}`}>
                                 <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-white' : 'border-gray-300'}`}>{isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}</div>
                                 {label}
                             </button>
                         )
                     })}
                 </div>
             </div>
          );
      }
      return (
        <div key={field} className="relative group">
          <label className="block text-[10px] font-medium text-simas-dark/70 uppercase tracking-widest mb-2 ml-1">{field.replace(/_/g, ' ')}</label>
          <div className="relative">
            <select name={field} value={formData[field] || ''} onChange={handleInputChange} className={`${inputCommonClass} appearance-none cursor-pointer`}>
              <option value="">Selecione...</option>
              {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><i className="fas fa-chevron-down text-xs"></i></div>
          </div>
        </div>
      );
    }

    // Force FKs to be strictly read-only for text input.
    // PKs are read-only if editing (unless manual PK is handled differently, but generally PKs don't change).
    // isCalculated fields are also read-only.
    const isReadOnly = (isPK && isEditing) || isCalculated || isFK;
    
    const isDateField = /DATA|INICIO|TERMINO|PRAZO|NASCIMENTO|VALIDADE/i.test(field);
    const isTextArea = /ENDERECO|DESCRICAO|JUSTIFICATIVA/i.test(field);
    const type = isDateField ? 'date' : 'text';

    // Placeholder logic: 
    // If it is an FK (link), say "Selecione na lista..."
    // If it is a manual PK (like CPF in Pessoa) or standard field, say "Digite aqui..."
    const placeholderText = isFK ? "Selecione na lista..." : "Digite aqui...";

    return (
      <div key={field} className={`${isTextArea ? 'col-span-full' : ''} relative group`}>
        <label className="block text-[10px] font-medium text-simas-dark/70 uppercase tracking-widest mb-2 ml-1">{field.replace(/_/g, ' ')}</label>
        <div className="relative">
            {isFK && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan"><i className="fas fa-link text-xs"></i></div>}
            {isTextArea ? (
                <div className="relative">
                    <textarea
                        name={field}
                        value={formData[field] || ''}
                        onChange={handleInputChange}
                        className={`${inputCommonClass} min-h-[100px] resize-none flex-1 ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-100' : ''} ${(activeTab === 'Pessoa' && field === 'ENDERECO') ? 'pr-12' : ''}`}
                        readOnly={isReadOnly}
                        placeholder={placeholderText}
                    />
                    {(activeTab === 'Pessoa') && field === 'ENDERECO' && (
                        <button
                            type="button"
                            onClick={handleSearchCepByLogradouro}
                            disabled={isSearchingCep}
                            className="absolute right-3 top-3 w-8 h-8 rounded-full bg-simas-cyan/10 text-simas-cyan hover:bg-simas-cyan hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
                            title="Buscar CEP por este Endereço"
                        >
                            {isSearchingCep ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search text-xs"></i>}
                        </button>
                    )}
                </div>
            ) : (isBrasil && field === 'ESTADO') ? (
                <div className="relative">
                    <select name={field} value={formData[field] || ''} onChange={(e) => {
                        handleInputChange(e);
                        // Limpa a cidade ao mudar o estado
                        handleInputChange({ target: { name: 'CIDADE', value: '' } } as any);
                    }} className={`${inputCommonClass} appearance-none cursor-pointer`}>
                        <option value="">Selecione...</option>
                        {estadosIbge.map(estado => <option key={estado.sigla} value={estado.sigla}>{estado.sigla}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><i className="fas fa-chevron-down text-xs"></i></div>
                </div>
            ) : (isBrasil && field === 'CIDADE') ? (
                <div className="relative">
                    <select disabled={isLoadingCidades || !formData.ESTADO} name={field} value={formData[field] || ''} onChange={handleInputChange} className={`${inputCommonClass} appearance-none cursor-pointer disabled:opacity-50`}>
                        <option value="">{isLoadingCidades ? 'Carregando...' : 'Selecione...'}</option>
                        {cidadesIbge.map(cidade => <option key={cidade.id} value={cidade.nome}>{cidade.nome}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><i className="fas fa-chevron-down text-xs"></i></div>
                </div>
            ) : (
                <input 
                    type={type} 
                    name={field} 
                    value={formData[field] || ''} 
                    onChange={handleInputChange} 
                    className={`${inputCommonClass} ${isFK ? 'pl-10' : ''} ${isReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-100' : ''}`} 
                    readOnly={isReadOnly} 
                    placeholder={placeholderText} 
                    maxLength={field === 'CPF' ? 14 : (field === 'TELEFONE' ? 15 : undefined)} 
                />
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-simas-cloud">
      {/* --- NAVIGATION & CONTROLS --- */}
      <div className="flex-none px-8 pt-8 pb-4 flex items-center justify-between z-20">
        <div className="relative min-w-[320px] z-50">
            <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex items-center justify-between pl-3 pr-5 py-2.5 bg-white text-simas-dark font-medium uppercase tracking-wide text-sm rounded-full border border-gray-200 hover:border-simas-cyan transition-all outline-none shadow-soft group">
                <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors"><i className="fas fa-folder-open text-sm"></i></div>
                     <span className="font-bold">{ENTITY_CONFIGS[activeTab]?.title || ENTITY_CONFIGS['Pessoa'].title}</span>
                </div>
                <i className={`fas fa-chevron-down text-xs text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}></i>
            </button>
            {isDropdownOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-[1.5rem] shadow-2xl overflow-hidden z-50 animate-fade-in flex flex-col max-h-[400px]">
                        <div className="p-3 border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
                            <div className="relative">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input type="text" placeholder="Filtrar..." className="w-full pl-10 pr-4 py-3 bg-white border-none rounded-xl text-sm outline-none shadow-sm focus:ring-2 focus:ring-simas-cyan transition-all" value={dropdownSearch} onChange={(e) => setDropdownSearch(e.target.value)} autoFocus onClick={(e) => e.stopPropagation()} />
                            </div>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {filteredTabs.map(tab => (
                                <button key={tab} onClick={() => { setActiveTab(tab); setIsDropdownOpen(false); }} className={`w-full text-left px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all tracking-wide ${activeTab === tab ? 'bg-simas-cloud text-simas-dark font-bold' : 'text-gray-500 hover:bg-gray-50 hover:text-simas-dark'}`}>
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
            <button onClick={() => setShowMainList(!showMainList)} className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold transition-all shadow-sm uppercase tracking-widest ${showMainList ? 'bg-simas-dark text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-simas-dark'}`}>
                <i className={`fas ${showMainList ? 'fa-eye' : 'fa-eye-slash'}`}></i> Consultar
            </button>
        </div>
      </div>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex gap-8 px-8 pb-8 overflow-hidden min-h-0 z-10">
        {!isUserReadOnly && (
            <div className="flex-none w-[400px] flex flex-col bg-white rounded-[2rem] shadow-soft overflow-hidden z-20 border border-white/50">
              <div className="p-7 border-b border-gray-50 bg-white">
                {/* Título de Seção: Cera Pro Black, Uppercase */}
                <h2 className="text-xl font-black text-simas-dark flex items-center gap-3 tracking-brand uppercase">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isEditing ? 'bg-simas-cyan/10 text-simas-cyan' : 'bg-simas-blue/10 text-simas-blue'}`}><i className={`fas ${isEditing ? 'fa-pen' : 'fa-plus'} text-sm`}></i></div>
                    {isEditing ? 'Editar Registro' : 'Novo Registro'}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-7 custom-scrollbar bg-white">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {DATA_MODEL[activeTab]?.map(field => renderInput(field))}
                  <div className="pt-6 flex gap-3">
                    {isEditing && <Button type="button" variant="ghost" onClick={() => { setIsEditing(false); }} className="flex-1">Cancelar</Button>}
                    <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending} className="flex-[2] tracking-widest">{isEditing ? 'Salvar' : 'Criar'}</Button>
                  </div>
                </form>
              </div>
            </div>
        )}

        <div className="flex-1 overflow-x-auto flex gap-6 pb-2 items-stretch px-2 scrollbar-thin scrollbar-thumb-simas-blue scrollbar-track-transparent snap-x">
           {columnsToRender.map((entity, index) => {
             const config = ENTITY_CONFIGS[entity];
             if (!config) return null;
             
             // Extract data from the parallel query result
             const queryResult = queries[index];
             const rawData = queryResult?.data || [];
             const isLoading = queryResult?.isLoading;

             const searchTerm = (deferredSearchTerms[entity] || '').toLowerCase();
             const entityFilters = activeFilters[entity] || [];
             
             const filteredData = Array.isArray(rawData) ? rawData.filter((item: any) => {
                 const display = config.cardDisplay(item);
                 const textMatch = !searchTerm || `${display.title} ${display.subtitle} ${display.details || ''}`.toLowerCase().includes(searchTerm);
                 const filterMatch = entityFilters.length === 0 || (config.filterBy && entityFilters.includes(item[config.filterBy]));
                 return textMatch && filterMatch;
             }) : [];

             const isFilterOpen = filterPopoverOpen === entity;
             const rawOptions = config.filterBy ? [...new Set(rawData.map((i: any) => i[config.filterBy!]).filter(Boolean))].sort() : [];
             const filterOptions = isFilterOpen && config.filterBy 
                ? rawOptions.filter((opt: any) => String(opt).toLowerCase().includes(filterSearchTerm.toLowerCase()))
                : [];

             return (
               <div key={`${entity}-${index}`} className="flex-none w-[360px] flex flex-col bg-slate-200 rounded-[2rem] overflow-hidden snap-center h-full border border-slate-300 backdrop-blur-sm shadow-inner">
                 <div className="p-5 bg-gray-50/80 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100">
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="font-black flex items-center gap-2 text-simas-dark uppercase text-xs tracking-widest pl-1">
                        {entity !== activeTab && <i className="fas fa-link text-gray-400"></i>} {config.title}
                     </h3>
                     <span className="text-[10px] font-bold bg-white shadow-sm border border-gray-100 px-3 py-1 rounded-full text-gray-500">{filteredData.length}</span>
                   </div>
                   <div className="flex gap-2">
                       <div className="relative group flex-grow">
                           <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-colors group-hover:text-simas-cyan"></i>
                           <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border-none bg-white shadow-sm text-xs font-medium focus:ring-2 focus:ring-simas-cyan/50 outline-none transition-all" value={searchTerms[entity] || ''} onChange={(e) => setSearchTerms(prev => ({ ...prev, [entity]: e.target.value }))} />
                       </div>
                       {config.filterBy && (
                           <div className="relative" ref={el => { popoverRefs.current[entity] = el; }}>
                               <button className={`w-10 h-full rounded-xl flex items-center justify-center transition-all shadow-sm border border-transparent ${isFilterOpen || entityFilters.length > 0 ? 'bg-simas-cyan text-white shadow-glow' : 'bg-white text-gray-400 hover:text-simas-cyan'}`} onClick={() => { setFilterPopoverOpen(isFilterOpen ? null : entity); setFilterSearchTerm(''); }}>
                                   <i className="fas fa-filter text-xs"></i>
                               </button>
                               {isFilterOpen && (
                                   <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-fade-in flex flex-col max-h-[350px]">
                                       <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
                                           <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-gray-600">Filtrar por {config.filterBy.replace(/_/g, ' ')}</span>
                                                {entityFilters.length > 0 && <button onClick={() => setActiveFilters(prev => ({...prev, [entity]: []}))} className="text-[10px] text-red-500 font-bold hover:underline">Limpar</button>}
                                           </div>
                                           {/* Added Search Bar */}
                                           <div className="relative">
                                               <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
                                               <input 
                                                  type="text" 
                                                  placeholder="Procurar item..." 
                                                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:ring-1 focus:ring-simas-cyan outline-none"
                                                  value={filterSearchTerm}
                                                  onChange={(e) => setFilterSearchTerm(e.target.value)}
                                                  autoFocus
                                               />
                                           </div>
                                       </div>
                                       <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                           {filterOptions.length === 0 ? (
                                                <div className="text-center py-2 text-gray-400 text-xs italic">Nenhum resultado</div>
                                           ) : (
                                               filterOptions.map((opt: any) => (
                                                   <label key={opt} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors text-xs text-gray-600 font-medium tracking-wide">
                                                       <input type="checkbox" checked={entityFilters.includes(opt)} onChange={() => setActiveFilters(prev => ({ ...prev, [entity]: prev[entity]?.includes(opt) ? prev[entity].filter(v => v !== opt) : [...(prev[entity]||[]), opt] }))} className="rounded text-simas-cyan focus:ring-simas-cyan border-gray-300"/>
                                                       <span className="truncate">{opt}</span>
                                                   </label>
                                               ))
                                           )}
                                       </div>
                                   </div>
                               )}
                           </div>
                       )}
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                   {isLoading ? <div className="p-5 mb-3 bg-white/50 rounded-2xl border border-white shadow-sm animate-pulse h-24"></div> : filteredData.map((item: any) => {
                       const pkValue = String(item[config.pk]);
                       const display = config.cardDisplay(item);
                       const isSelected = selectedItems[entity] === pkValue;
                       const isOcupada = item.STATUS_VAGA === 'Ocupada';
                       
                       // Lógica de Permissão de Exclusão/Arquivamento
                       const isArchivable = ARCHIVABLE_ENTITIES.includes(entity);
                       const canAct = (canDelete || isArchivable) && entity !== 'Cogestora';

                       let exerciseData = undefined;
                       if (entity === 'Vaga') {
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
                                                         hasGraveIssue={display.hasGraveIssue}
                                                         onSelect={() => handleCardSelect(entity, item)} 
                                                         onEdit={entity === activeTab ? () => handleEdit(item) : undefined}
                                                         exerciseData={exerciseData}                            actions={
                             <>
                                                                                                                               {(entity === 'Pessoa' || entity === 'Contrato' || entity === 'Servidor') && <Button variant="icon" icon="fas fa-id-card" title="Dossiê" onClick={(e) => {e.stopPropagation(); setDossierCpf(item.CPF);}} />}                               {entity === 'Contrato' && <Button variant="icon" icon="fas fa-exchange-alt" title="Mover para outra Vaga" className="text-blue-400 hover:text-blue-600 hover:bg-blue-50" onClick={(e) => handleOpenMoveVaga(e, item)} />}
                               {entity === 'Vaga' && <Button variant="icon" icon={item.BLOQUEADA ? "fas fa-lock" : "fas fa-lock-open"} className={`${item.BLOQUEADA ? "text-red-500" : ""} ${isOcupada ? "opacity-30 cursor-not-allowed text-gray-400" : ""}`} disabled={isOcupada} onClick={(e) => handleLockVaga(e, pkValue, isOcupada)} />}
                               
                               {entity !== 'Auditoria' && canAct && (
                                   <Button 
                                        variant="icon" 
                                        icon={isArchivable ? "fas fa-file-import" : "fas fa-trash"} 
                                        className={isArchivable ? "text-orange-400 hover:text-orange-600 hover:bg-orange-50" : "text-red-300 hover:text-red-500 hover:bg-red-50"} 
                                        title={entity === 'Contrato' ? 'Encerrar Contrato' : entity === 'Servidor' ? 'Inativar Servidor' : isArchivable ? "Arquivar" : "Excluir"}
                                        onClick={(e) => handleDeleteRequest(e, item, entity)} 
                                   />
                               )}
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

      {dossierCpf && <DossierModal cpf={dossierCpf} onClose={() => setDossierCpf(null)} />}
      {exerciseVagaId && <ExerciseSelectionModal vagaId={exerciseVagaId} onClose={() => setExerciseVagaId(null)} onSuccess={() => { setExerciseVagaId(null); showToast('success', 'Atualizado!'); queryClient.invalidateQueries({ queryKey: ['entity', 'Vaga'] }); }} showToast={showToast} />}
      {itemToDelete && (
          <ConfirmModal 
            title={ARCHIVABLE_ENTITIES.includes(itemToDelete.entity) ? "Confirmar Arquivamento" : "Confirmar Exclusão"} 
            message={ARCHIVABLE_ENTITIES.includes(itemToDelete.entity) 
                ? "Deseja arquivar este registro? Ele será movido para o histórico e removido da listagem ativa." 
                : `Tem certeza que deseja excluir este registro de ${ENTITY_CONFIGS[itemToDelete.entity].title}?`
            }
            onConfirm={handleConfirmDelete} 
            onCancel={() => setItemToDelete(null)} 
            isLoading={deleteMutation.isPending} 
          >
              {(itemToDelete.entity === 'Contrato' || itemToDelete.entity === 'Servidor') && (
                  <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo do Arquivamento/Inativação <span className="text-red-500">*</span></label>
                      <input 
                          type="text" 
                          placeholder="Ex: Fim do contrato, Rescisão, etc."
                          value={archiveReason}
                          onChange={(e) => setArchiveReason(e.target.value)}
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-simas-cyan focus:bg-white transition-colors"
                          required
                      />
                  </div>
              )}
          </ConfirmModal>
      )}

      {/* CEP Confirmation Modal */}
      {cepDataToConfirm && (
          <ConfirmModal
              title="Atualizar Endereço"
              message={`Deseja sobrescrever os dados de endereço existentes com os novos dados?\n\n${cepDataToConfirm.cep ? `CEP: ${cepDataToConfirm.cep}\n` : ''}Logradouro: ${cepDataToConfirm.logradouro}\nBairro: ${cepDataToConfirm.bairro}\n\nSe você clicar em "Cancelar", apenas os campos que estiverem em branco serão preenchidos.`}
              onConfirm={handleConfirmCepOverwrite}
              onCancel={handleCancelCepOverwrite}
          />
      )}

      {/* Modal: Resultados de Busca de CEP */}
      {showCepSearchModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up flex flex-col max-h-[80vh]">
                  <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                      <h3 className="font-bold text-simas-dark uppercase tracking-tight">Selecione o Endereço</h3>
                      <button type="button" onClick={() => setShowCepSearchModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                  </header>
                  <div className="overflow-y-auto p-4 space-y-2">
                      {cepSearchResults.map((result: any, index: number) => (
                          <button
                              type="button"
                              key={index}
                              onClick={() => handleSelectCepResult(result)}
                              className="w-full p-4 border border-gray-200 rounded-xl hover:border-simas-cyan hover:bg-simas-cyan/5 transition-all text-left flex flex-col gap-1 outline-none focus:ring-2 focus:ring-simas-cyan"
                          >
                              <span className="font-bold text-simas-dark text-sm">{result.logradouro}</span>
                              {result.complemento && <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded w-fit">Ref: {result.complemento}</span>}
                              <span className="text-xs text-gray-500">
                                  Bairro: {result.bairro}
                                  {result.localidade && ` - ${result.localidade}`}
                                  {result.uf && `/${result.uf}`}
                              </span>
                              <span className="text-xs font-mono text-simas-cyan mt-1 block">CEP: {validation.maskCEP(result.cep)}</span>
                          </button>
                      ))}
                  </div>
                  <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0 flex">
                      <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCepSearchModal(false)}>Cancelar</Button>
                  </div>
              </div>
          </div>
      )}

      {/* Vaga Selection Modal for Mover Contrato */}
      {showVagaSelection && (
          <SelectionModal
              entity="Vaga"
              items={availableVagas}
              title="Selecione a Nova Vaga"
              onSelect={handleConfirmMoveVaga}
              onClose={() => {
                  setShowVagaSelection(false);
                  setMoveVagaContratoItem(null);
              }}
          />
      )}
    </div>
  );
};
