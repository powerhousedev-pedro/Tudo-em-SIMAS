
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DossierData } from '../types';
import { validation } from '../utils/validation';
import { businessLogic } from '../utils/businessLogic';
import { DROPDOWN_OPTIONS } from '../constants';
import { generateDossierPDF } from '../utils/pdfGenerator';
import { Logo } from './Logo';
import { Button } from './Button';
import { ConfirmModal } from './ConfirmModal';

interface DossierModalProps {
  cpf: string;
  onClose: () => void;
}

export const DossierModal: React.FC<DossierModalProps> = ({ cpf, onClose }) => {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddNota, setShowAddNota] = useState(false);
  const [newNotaText, setNewNotaText] = useState('');
  const [newNotaGravissimo, setNewNotaGravissimo] = useState(false);
  const [savingNota, setSavingNota] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  const [editingNotaId, setEditingNotaId] = useState<string | null>(null);
  const [editNotaText, setEditNotaText] = useState('');
  const [editNotaGravissimo, setEditNotaGravissimo] = useState(false);

  const [isEditingPessoal, setIsEditingPessoal] = useState(false);
  const [editPessoalForm, setEditPessoalForm] = useState<any>({});
  const [savingPessoal, setSavingPessoal] = useState(false);

  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepSearchResults, setCepSearchResults] = useState<any[]>([]);
  const [showCepSearchModal, setShowCepSearchModal] = useState(false);
  const [cepDataToConfirm, setCepDataToConfirm] = useState<any>(null);

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
          if (editPessoalForm.PAIS === 'Brasil' && editPessoalForm.ESTADO) {
              setIsLoadingCidades(true);
              const data = await api.getCidades(editPessoalForm.ESTADO);
              setCidadesIbge(data);
              setIsLoadingCidades(false);
          } else {
              setCidadesIbge([]);
          }
      };
      loadCidades();
  }, [editPessoalForm.ESTADO, editPessoalForm.PAIS]);

  useEffect(() => {
    const load = async () => {
      try {
        let identifier = cpf;
        if (/^[\d.-]+$/.test(identifier)) {
            identifier = identifier.replace(/\D/g, '');
        }
        const res = await api.getDossiePessoal(identifier);
        if (!res) throw new Error("Dados não retornados.");
        setData(res);
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Erro desconhecido ao carregar dossiê.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [cpf]);

  const handleSaveNota = async () => {
      if (!newNotaText.trim()) return;
      try {
          setSavingNota(true);
          let identifier = cpf;
          if (/^[\d.-]+$/.test(identifier)) identifier = identifier.replace(/\D/g, '');
          const newNota = await api.addNotaDossie(identifier, { OBS: newNotaText, GRAVISSIMO: newNotaGravissimo });
          setData(prev => prev ? { ...prev, notas: [newNota, ...(prev.notas || [])] } : null);
          setNewNotaText('');
          setNewNotaGravissimo(false);
          setShowAddNota(false);
      } catch (e: any) {
          alert('Erro ao salvar nota: ' + e.message);
      } finally {
          setSavingNota(false);
      }
  };

  const handleEditInit = (nota: any) => {
      setEditingNotaId(nota.ID_NOTA);
      setEditNotaText(nota.OBS);
      setEditNotaGravissimo(nota.GRAVISSIMO);
  };

  const handleUpdateNota = async () => {
      if (!editingNotaId || !editNotaText.trim()) return;
      try {
          setSavingNota(true);
          const updated = await api.updateRecord('Nota', 'ID_NOTA', editingNotaId, { OBS: editNotaText, GRAVISSIMO: editNotaGravissimo });
          setData(prev => prev ? { 
              ...prev, 
              notas: prev.notas?.map(n => n.ID_NOTA === editingNotaId ? { ...n, OBS: editNotaText, GRAVISSIMO: editNotaGravissimo } : n) 
          } : null);
          setEditingNotaId(null);
      } catch (e: any) {
          alert('Erro ao atualizar nota: ' + e.message);
      } finally {
          setSavingNota(false);
      }
  };

  const handleDeleteNota = async (id: string) => {
      if (!confirm('Tem certeza que deseja excluir esta nota permanentemente?')) return;
      try {
          await api.deleteRecord('Nota', 'ID_NOTA', id);
          setData(prev => prev ? { 
              ...prev, 
              notas: prev.notas?.filter(n => n.ID_NOTA !== id) 
          } : null);
      } catch (e: any) {
          alert('Erro ao excluir nota: ' + e.message);
      }
  };

  const handleDownloadPDF = () => {
    if (data) generateDossierPDF(data);
  };

  const handleEditPessoalInit = () => {
      if (!data?.pessoal) return;
      setEditPessoalForm({
          NOME: data.pessoal.NOME || '',
          NOME_SOCIAL: data.pessoal.NOME_SOCIAL || '',
          DATA_DE_NASCIMENTO: data.pessoal.DATA_DE_NASCIMENTO ? String(data.pessoal.DATA_DE_NASCIMENTO).split('T')[0] : '',
          TELEFONE: data.pessoal.TELEFONE || '',
          EMAIL: data.pessoal.EMAIL || '',
          ESCOLARIDADE: data.pessoal.ESCOLARIDADE || '',
          FORMACAO: data.pessoal.FORMACAO || '',
          CEP: data.pessoal.CEP || '',
          ENDERECO: data.pessoal.ENDERECO || '',
          NUMERO: data.pessoal.NUMERO || '',
          COMPLEMENTO: data.pessoal.COMPLEMENTO || '',
          BAIRRO: data.pessoal.BAIRRO || '',
          CIDADE: data.pessoal.CIDADE || 'Rio de Janeiro',
          ESTADO: data.pessoal.ESTADO || 'RJ',
          PAIS: data.pessoal.PAIS || 'Brasil'
      });
      setIsEditingPessoal(true);
  };

  const handleSavePessoal = async () => {
      if (!data?.pessoal?.CPF) return;
      try {
          setSavingPessoal(true);
          let identifier = data.pessoal.CPF.replace(/\D/g, '');
          
          const payload = {
              ...editPessoalForm,
              DATA_DE_NASCIMENTO: editPessoalForm.DATA_DE_NASCIMENTO ? `${editPessoalForm.DATA_DE_NASCIMENTO}T00:00:00.000Z` : null
          };
          
          await api.updateRecord('Pessoa', 'CPF', identifier, payload);
          
          setData(prev => prev ? {
              ...prev,
              pessoal: { ...prev.pessoal, ...payload }
          } : null);
          
          setIsEditingPessoal(false);
      } catch (e: any) {
          alert('Erro ao atualizar dados pessoais: ' + e.message);
      } finally {
          setSavingPessoal(false);
      }
  };

  const handleConfirmCepOverwrite = () => {
      if (cepDataToConfirm) {
          setEditPessoalForm((prev: any) => ({
              ...prev,
              CEP: cepDataToConfirm.cep ? validation.maskCEP(cepDataToConfirm.cep) : prev.CEP,
              ENDERECO: cepDataToConfirm.logradouro || prev.ENDERECO,
              BAIRRO: cepDataToConfirm.bairro || prev.BAIRRO,
              CIDADE: cepDataToConfirm.localidade || prev.CIDADE,
              ESTADO: cepDataToConfirm.uf || prev.ESTADO
          }));
          setCepDataToConfirm(null);
          setCepSearchResults([]);
      }
  };

  const handleCancelCepOverwrite = () => {
      if (cepDataToConfirm) {
          setEditPessoalForm((prev: any) => ({
              ...prev,
              ENDERECO: prev.ENDERECO || cepDataToConfirm.logradouro || '',
              BAIRRO: prev.BAIRRO || cepDataToConfirm.bairro || '',
              CEP: prev.CEP || (cepDataToConfirm.cep ? validation.maskCEP(cepDataToConfirm.cep) : ''),
              CIDADE: prev.CIDADE || cepDataToConfirm.localidade || '',
              ESTADO: prev.ESTADO || cepDataToConfirm.uf || ''
          }));
          setCepDataToConfirm(null);
          setCepSearchResults([]);
      }
  };

  const handleSearchCepByLogradouro = async () => {
      if (!editPessoalForm.ENDERECO || editPessoalForm.ENDERECO.length < 3) {
          alert('Digite pelo menos 3 caracteres do endereço para buscar.');
          return;
      }
      setIsSearchingCep(true);
      try {
          const results = await api.searchCepByLogradouro(editPessoalForm.ENDERECO);
          if (results && results.length > 0) {
              setCepSearchResults(results);
              setShowCepSearchModal(true);
          } else {
              alert('Nenhum CEP encontrado para este endereço.');
          }
      } catch (e: any) {
          alert('Erro ao buscar CEP. Tente novamente mais tarde.');
      } finally {
          setIsSearchingCep(false);
      }
  };

  const handleSelectCepResult = (result: any) => {
      setShowCepSearchModal(false);
      const hasExistingData = editPessoalForm.CEP || editPessoalForm.BAIRRO || (editPessoalForm.ENDERECO && editPessoalForm.ENDERECO !== result.logradouro);
      if (hasExistingData) {
          setCepDataToConfirm({ logradouro: result.logradouro, bairro: result.bairro, cep: result.cep, complemento: result.complemento, localidade: result.localidade, uf: result.uf });
      } else {
          setEditPessoalForm((prev: any) => ({
              ...prev,
              CEP: validation.maskCEP(result.cep),
              ENDERECO: result.logradouro,
              BAIRRO: result.bairro,
              CIDADE: result.localidade,
              ESTADO: result.uf,
              PAIS: prev.PAIS || 'Brasil'
          }));
          setCepSearchResults([]);
      }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-medium">Gerando ficha cadastral...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
            <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <i className="fas fa-exclamation-triangle text-2xl text-red-500"></i>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Erro ao carregar</h3>
                <p className="text-sm text-gray-500 mb-6">{error || 'Dados não encontrados.'}</p>
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors">Fechar</button>
            </div>
        </div>
      );
  }

  const p = data.pessoal || { NOME: 'Desconhecido', CPF: cpf };
  const hasGraveIssue = data.notas?.some((n: any) => n.GRAVISSIMO) || false;
  
  const badgeColors: {[key: string]: string} = {
    'Contratado': 'bg-green-100 text-green-800 border-green-200',
    'Servidor': 'bg-blue-100 text-blue-800 border-blue-200',
    'Estudante': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Avulso': 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:p-0 print:bg-white print:overflow-visible print:block print:relative print:inset-auto">
      <div className={`relative w-full max-w-5xl flex flex-col max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none print:w-full print:max-w-none print:my-0 ${hasGraveIssue ? 'bg-zinc-950 ring-1 ring-red-900' : 'bg-white'}`}>
        
        {/* --- HEADER --- */}
        <div className={`flex-none p-8 print:p-6 print:border-b-2 print:border-black print:bg-white print:text-black ${hasGraveIssue ? 'bg-red-900 text-red-50' : 'bg-simas-dark text-white'}`}>
            <div className="flex justify-between items-start">
                <div className="flex gap-6 items-center w-full">
                     <div className={`shrink-0 w-20 h-20 rounded-full flex items-center justify-center shadow-lg p-4 print:border-2 print:border-black print:shadow-none ${hasGraveIssue ? 'bg-zinc-950 text-red-500' : 'bg-white text-simas-dark'}`}>
                         <Logo className="w-full h-full opacity-90" />
                     </div>
                     <div className="flex-1 min-w-0">
                         <h1 className="text-3xl font-bold tracking-tight mb-2 print:text-black break-words">{p.NOME_SOCIAL || p.NOME}</h1>
                         <div className="flex items-center gap-3">
                             <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border print:border-black print:bg-transparent print:text-black ${badgeColors[data.tipoPerfil] || 'bg-gray-500'}`}>
                                 {data.tipoPerfil}
                             </span>
                             <span className="text-sm opacity-80 print:opacity-100 font-mono">CPF: {validation.formatCPF(p.CPF)}</span>
                         </div>
                     </div>
                </div>
                
                <div className="flex gap-3 print:hidden">
                    <button 
                        onClick={() => setIsNotesOpen(true)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 border ${data.notas?.some(n => n.GRAVISSIMO) ? 'bg-red-500/20 border-red-500 text-white animate-pulse' : 'bg-white/10 hover:bg-white/20 text-white border-transparent'}`}
                    >
                        <i className="fas fa-sticky-note"></i> 
                        Notas ({data.notas?.length || 0})
                    </button>
                    <button onClick={handleDownloadPDF} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                        <i className="fas fa-file-pdf"></i> Baixar PDF
                    </button>
                    <button onClick={onClose} className="bg-white text-simas-dark hover:bg-gray-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>

        {/* --- CONTENT GRID --- */}
        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 print:overflow-visible print:block print:p-6 custom-scrollbar">
            
            {/* COL 1: Dados Pessoais e Vínculo (Sidebar no Desktop) */}
            <div className="lg:col-span-1 space-y-8 print:mb-8 print:break-inside-avoid">
                
                {/* Dados Pessoais */}
                <section>
                    <div className={`flex items-center justify-between mb-4 border-b pb-2 print:border-black ${hasGraveIssue ? 'border-red-900/50' : 'border-gray-100'}`}>
                        <h3 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 print:text-black ${hasGraveIssue ? 'text-red-600' : 'text-gray-400'}`}>
                            <i className="fas fa-user-circle"></i> Dados Pessoais
                        </h3>
                        {!isEditingPessoal && (
                            <button onClick={handleEditPessoalInit} className="text-gray-400 hover:text-simas-blue transition-colors print:hidden" title="Editar Dados Pessoais">
                                <i className="fas fa-pencil-alt text-xs"></i>
                            </button>
                        )}
                    </div>
                    
                    {isEditingPessoal ? (
                        <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                                <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.NOME} onChange={e => setEditPessoalForm({...editPessoalForm, NOME: e.target.value.toUpperCase()})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nome Social</label>
                                <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.NOME_SOCIAL} onChange={e => setEditPessoalForm({...editPessoalForm, NOME_SOCIAL: e.target.value.toUpperCase()})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Data de Nascimento</label>
                                <input type="date" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.DATA_DE_NASCIMENTO} onChange={e => setEditPessoalForm({...editPessoalForm, DATA_DE_NASCIMENTO: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Telefone</label>
                                <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm font-mono" value={editPessoalForm.TELEFONE} onChange={e => setEditPessoalForm({...editPessoalForm, TELEFONE: validation.maskPhone(e.target.value)})} maxLength={15} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Email</label>
                                <input type="email" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.EMAIL} onChange={e => setEditPessoalForm({...editPessoalForm, EMAIL: e.target.value.toLowerCase()})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Escolaridade</label>
                                <select className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.ESCOLARIDADE} onChange={e => setEditPessoalForm({...editPessoalForm, ESCOLARIDADE: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {(DROPDOWN_OPTIONS['ESCOLARIDADE'] as string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Formação</label>
                                <input type="text" list="formacao-list-dossie" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.FORMACAO} onChange={e => setEditPessoalForm({...editPessoalForm, FORMACAO: e.target.value})} />
                                <datalist id="formacao-list-dossie">
                                    {(DROPDOWN_OPTIONS['FORMACAO'] as string[]).map(opt => <option key={opt} value={opt} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">CEP</label>
                                <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm font-mono" value={editPessoalForm.CEP} onChange={async (e) => {
                                    const maskedCep = validation.maskCEP(e.target.value);
                                    setEditPessoalForm((prev: any) => ({...prev, CEP: maskedCep}));
                                    const cleanCep = maskedCep.replace(/\D/g, '');
                                    if (cleanCep.length === 8) {
                                        try {
                                            const cepData = await api.getCepData(cleanCep);
                                            if (cepData && !cepData.erro) {
                                                setEditPessoalForm((prev: any) => ({
                                                    ...prev,
                                                    ENDERECO: cepData.logradouro || prev.ENDERECO,
                                                    BAIRRO: cepData.bairro || prev.BAIRRO,
                                                    CIDADE: cepData.localidade || prev.CIDADE,
                                                    ESTADO: cepData.uf || prev.ESTADO,
                                                    PAIS: prev.PAIS || 'Brasil'
                                                }));
                                            }
                                        } catch(e) {}
                                    }
                                }} maxLength={9} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Endereço</label>
                                <div className="relative">
                                    <textarea className="w-full p-2 border border-gray-200 rounded text-sm resize-none pr-10" rows={2} value={editPessoalForm.ENDERECO} onChange={e => setEditPessoalForm({...editPessoalForm, ENDERECO: e.target.value})}></textarea>
                                    <button
                                        type="button"
                                        onClick={handleSearchCepByLogradouro}
                                        disabled={isSearchingCep}
                                        className="absolute right-1.5 top-1.5 w-7 h-7 rounded bg-simas-cyan/10 text-simas-cyan hover:bg-simas-cyan hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
                                        title="Buscar CEP por este Endereço"
                                    >
                                        {isSearchingCep ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search text-[10px]"></i>}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Número</label>
                                    <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.NUMERO} onChange={e => setEditPessoalForm({...editPessoalForm, NUMERO: e.target.value})} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Complemento</label>
                                    <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.COMPLEMENTO} onChange={e => setEditPessoalForm({...editPessoalForm, COMPLEMENTO: e.target.value})} />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-[2]">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bairro</label>
                                    <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.BAIRRO} onChange={e => setEditPessoalForm({...editPessoalForm, BAIRRO: e.target.value})} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">País</label>
                                    <select className="w-full p-2 border border-gray-200 rounded text-sm bg-white" value={editPessoalForm.PAIS} onChange={e => {
                                        const isBrasil = e.target.value === 'Brasil';
                                        setEditPessoalForm((prev: any) => ({...prev, PAIS: e.target.value, ESTADO: isBrasil ? 'RJ' : '', CIDADE: isBrasil ? 'Rio de Janeiro' : ''}));
                                    }}>
                                        {(DROPDOWN_OPTIONS['PAIS'] as string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                            </div>
                            {editPessoalForm.PAIS === 'Brasil' ? (
                                <div className="flex gap-2">
                                    <div className="flex-[3]">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cidade</label>
                                        <select disabled={isLoadingCidades || !editPessoalForm.ESTADO} className="w-full p-2 border border-gray-200 rounded text-sm bg-white disabled:opacity-50" value={editPessoalForm.CIDADE} onChange={e => setEditPessoalForm({...editPessoalForm, CIDADE: e.target.value})}>
                                            <option value="">{isLoadingCidades ? 'Carregando...' : 'Selecione...'}</option>
                                            {cidadesIbge.map(cidade => <option key={cidade.id} value={cidade.nome}>{cidade.nome}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">UF</label>
                                        <select className="w-full p-2 border border-gray-200 rounded text-sm bg-white" value={editPessoalForm.ESTADO} onChange={e => setEditPessoalForm({...editPessoalForm, ESTADO: e.target.value, CIDADE: ''})}>
                                            <option value="">...</option>
                                            {estadosIbge.map(estado => <option key={estado.sigla} value={estado.sigla}>{estado.sigla}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <div className="flex-[3]">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cidade</label>
                                        <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.CIDADE} onChange={e => setEditPessoalForm({...editPessoalForm, CIDADE: e.target.value})} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Estado</label>
                                        <input type="text" className="w-full p-2 border border-gray-200 rounded text-sm" value={editPessoalForm.ESTADO} onChange={e => setEditPessoalForm({...editPessoalForm, ESTADO: e.target.value})} />
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex gap-2 pt-2 border-t border-gray-200">
                                <button onClick={() => setIsEditingPessoal(false)} className="flex-1 py-1.5 bg-gray-200 text-gray-700 rounded text-xs font-bold hover:bg-gray-300 transition-colors">Cancelar</button>
                                <button onClick={handleSavePessoal} disabled={savingPessoal} className="flex-1 py-1.5 bg-simas-blue text-white rounded text-xs font-bold hover:bg-simas-dark transition-colors disabled:opacity-50">
                                    {savingPessoal ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <InfoRow hasGraveIssue={hasGraveIssue} label="Data de Nascimento" value={`${p.DATA_DE_NASCIMENTO ? validation.formatDate(p.DATA_DE_NASCIMENTO) : 'N/A'} (${p.DATA_DE_NASCIMENTO ? validation.calculateAge(String(p.DATA_DE_NASCIMENTO)) || '?' : '?'} anos)`} />
                            <InfoRow hasGraveIssue={hasGraveIssue} label="Telefone" value={validation.formatPhone(p.TELEFONE || '')} />
                            <InfoRow hasGraveIssue={hasGraveIssue} label="Email" value={p.EMAIL} />
                            <InfoRow hasGraveIssue={hasGraveIssue} label="Escolaridade" value={p.ESCOLARIDADE} />
                            <InfoRow hasGraveIssue={hasGraveIssue} label="Formação" value={p.FORMACAO} />
                            <InfoRow hasGraveIssue={hasGraveIssue} label="Endereço" value={validation.formatAddress(p)} />
                        </div>
                    )}
                </section>

                {/* Vínculo Ativo */}
                <section className={`rounded-2xl p-6 border print:bg-transparent print:border-black print:p-4 print:mt-4 ${hasGraveIssue ? 'bg-zinc-900 border-red-900/50' : 'bg-gray-50 border-gray-100'}`}>
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${hasGraveIssue ? 'text-red-500' : 'text-simas-dark'}`}>
                        <i className="fas fa-id-badge"></i> Vínculo Ativo
                    </h3>
                    {data.vinculosAtivos && data.vinculosAtivos.length > 0 ? (
                        data.vinculosAtivos.map((v, i) => {
                            let escolaridadeAlert = null;
                            if (v.escolaridade_posto && data.pessoal.ESCOLARIDADE) {
                                const check = businessLogic.checkEscolaridade(data.pessoal.ESCOLARIDADE, v.escolaridade_posto);
                                if (!check.condiz) {
                                    escolaridadeAlert = <div className={`text-xs font-bold mt-2 px-2 py-1 rounded bg-red-100 text-red-600 border border-red-200 print:border-black print:text-black print:bg-transparent`}><i className="fas fa-exclamation-triangle"></i> {check.message}</div>;
                                }
                            }
                            return (
                                <div key={i} className="space-y-3 text-sm mb-6 last:mb-0">
                                    <div className={`font-bold border-b pb-1 mb-2 print:text-black print:border-black ${hasGraveIssue ? 'text-red-400 border-red-900/50' : 'text-simas-blue border-gray-200'}`}>{v.tipo.toUpperCase()}</div>
                                    <InfoRow hasGraveIssue={hasGraveIssue} label="ID/Matrícula" value={v.id_contrato || v.matricula} compact />
                                    <InfoRow hasGraveIssue={hasGraveIssue} label="Cargo/Função" value={v.cargo_efetivo || v.funcao} compact />
                                    <InfoRow hasGraveIssue={hasGraveIssue} label="Lotação" value={v.lotacao || v.alocacao_atual} compact />
                                    {v.salario && <InfoRow hasGraveIssue={hasGraveIssue} label="Salário" value={validation.formatCurrency(v.salario)} compact />}
                                    <InfoRow hasGraveIssue={hasGraveIssue} label="Início" value={validation.formatDate(v.data_inicio || v.data_admissao)} compact />
                                    {escolaridadeAlert}
                                    {v.detalhes && <p className={`text-xs mt-2 italic print:text-black ${hasGraveIssue ? 'text-red-600' : 'text-gray-500'}`}>{v.detalhes}</p>}
                                </div>
                            );
                        })
                    ) : (
                        <p className={`text-sm italic ${hasGraveIssue ? 'text-red-700' : 'text-gray-400'}`}>Nenhum vínculo ativo no momento.</p>
                    )}
                </section>
            </div>

            {/* COL 2 & 3: Linha do Tempo e Capacitações */}
            <div className="lg:col-span-2 print:mt-6">
                
                {/* SEÇÃO 1: Histórico Profissional */}
                <div className="mb-10 print:break-inside-avoid">
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-6 border-b pb-2 flex items-center gap-2 print:text-black print:border-black ${hasGraveIssue ? 'text-red-600 border-red-900/50' : 'text-gray-400 border-gray-100'}`}>
                        <i className="fas fa-history"></i> Histórico Profissional
                    </h3>

                    <div className="relative pl-4">
                        {/* Vertical Line */}
                        <div className={`absolute left-[21px] top-2 bottom-0 w-0.5 print:border-l print:border-gray-300 ${hasGraveIssue ? 'bg-red-900/30' : 'bg-gray-100'}`}></div>

                        <div className="space-y-8">
                            {(!data.historico || data.historico.length === 0) ? (
                                <div className={`text-center py-6 italic rounded-xl print:bg-transparent print:border print:border-gray-300 ${hasGraveIssue ? 'text-red-700 bg-red-950/20' : 'text-gray-400 bg-gray-50'}`}>Nenhum histórico registrado.</div>
                            ) : (
                                data.historico.map((item, idx) => (
                                    <div key={idx} className="relative flex gap-6 group print:break-inside-avoid">
                                        {/* Icon Dot */}
                                        <div className={`
                                            relative z-10 w-11 h-11 rounded-full border-4 shadow-sm flex items-center justify-center shrink-0
                                            ${hasGraveIssue ? 'border-zinc-950 bg-red-950 text-red-500' : 'border-white ' + (item.cor === 'red' ? 'bg-red-100 text-red-600' : item.cor === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600')}
                                            print:border-black print:bg-white print:text-black
                                        `}>
                                            <i className={`fas ${item.icone} text-sm`}></i>
                                        </div>

                                        {/* Content Card */}
                                        <div className="flex-1 pt-1 pb-4">
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline mb-1">
                                                <h4 className={`text-base font-bold ${hasGraveIssue ? 'text-red-500' : 'text-gray-900'}`}>{item.tipo}</h4>
                                                <span className={`text-xs font-bold px-2 py-1 rounded print:bg-transparent print:text-black print:border print:border-black ${hasGraveIssue ? 'text-red-800/80 bg-red-950/50' : 'text-gray-400 bg-gray-50'}`}>{item.periodo}</span>
                                            </div>
                                            <p className={`text-sm font-medium mb-1 print:text-black ${hasGraveIssue ? 'text-red-400' : 'text-simas-dark/80'}`}>{item.descricao}</p>
                                            <p className={`text-sm leading-relaxed print:text-gray-700 ${hasGraveIssue ? 'text-red-600/80' : 'text-gray-500'}`}>{item.detalhes}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* SEÇÃO 2: Capacitações / Frequência (NOVO) */}
                <div className="print:break-inside-avoid">
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-6 border-b pb-2 flex items-center gap-2 print:text-black print:border-black ${hasGraveIssue ? 'text-red-600 border-red-900/50' : 'text-gray-400 border-gray-100'}`}>
                        <i className="fas fa-graduation-cap"></i> Capacitação e Desenvolvimento
                    </h3>

                    {(!data.atividadesEstudantis?.capacitacoes || data.atividadesEstudantis.capacitacoes.length === 0) ? (
                        <div className={`text-center py-6 italic rounded-xl print:bg-transparent print:border print:border-gray-300 ${hasGraveIssue ? 'text-red-700 bg-red-950/20' : 'text-gray-400 bg-gray-50'}`}>Nenhuma atividade de capacitação registrada.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {data.atividadesEstudantis.capacitacoes.map((cap, idx) => (
                                <div key={idx} className={`border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:border-black print:shadow-none ${hasGraveIssue ? 'bg-zinc-950 border-red-900/30' : 'bg-white border-gray-200'}`}>
                                    <div>
                                        <h4 className={`font-bold text-sm print:text-black ${hasGraveIssue ? 'text-red-500' : 'text-simas-dark'}`}>{cap.nome}</h4>
                                        <p className={`text-xs mt-1 print:text-gray-700 ${hasGraveIssue ? 'text-red-700' : 'text-gray-500'}`}>{cap.turma}</p>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-medium">
                                        <span className={`print:text-black ${hasGraveIssue ? 'text-red-600/80' : 'text-gray-500'}`}><i className="far fa-calendar mr-1"></i> {cap.data}</span>
                                        <span className={`px-2 py-1 rounded-md border print:border-black print:bg-transparent print:text-black ${cap.status === 'Presente' ? (hasGraveIssue ? 'bg-green-950/30 text-green-500 border-green-900/50' : 'bg-green-50 text-green-700 border-green-100') : (hasGraveIssue ? 'bg-red-950/50 text-red-500 border-red-900/50' : 'bg-red-50 text-red-700 border-red-100')}`}>
                                            {cap.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

        </div>
      </div>

      {/* --- NOTAS OVERLAY --- */}
      {isNotesOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-end bg-black/40 backdrop-blur-sm animate-fade-in print:hidden">
              <div className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-slide-in-right">
                  <div className="p-6 bg-simas-dark text-white flex justify-between items-center">
                      <div>
                          <h3 className="text-xl font-bold">Notas e Observações</h3>
                          <p className="text-xs opacity-70">Histórico de anotações do dossiê</p>
                      </div>
                      <button onClick={() => setIsNotesOpen(false)} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
                          <i className="fas fa-times"></i>
                      </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {/* Novo formulário de nota */}
                      <section className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Adicionar Nova Nota</h4>
                          <textarea 
                                value={newNotaText}
                                onChange={e => setNewNotaText(e.target.value)}
                                className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-simas-blue/20 focus:border-simas-blue transition-all mb-3 resize-none bg-white"
                                placeholder="Descreva a observação ou ocorrência..."
                                rows={4}
                            ></textarea>
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-sm font-bold text-red-600 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={newNotaGravissimo}
                                        onChange={e => setNewNotaGravissimo(e.target.checked)}
                                        className="rounded border-gray-300 text-red-600 focus:ring-red-500 w-5 h-5 transition-transform group-hover:scale-110"
                                    />
                                    Marcar como Gravíssimo
                                </label>
                                <button 
                                    onClick={handleSaveNota}
                                    disabled={savingNota || !newNotaText.trim()}
                                    className="px-6 py-2 bg-simas-blue text-white rounded-xl text-sm font-bold hover:bg-simas-dark transition-all shadow-md disabled:opacity-50 disabled:shadow-none transform active:scale-95"
                                >
                                    {savingNota ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                      </section>

                      {/* Lista de notas existentes */}
                      <section className="space-y-4">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Histórico</h4>
                          {(!data.notas || data.notas.length === 0) ? (
                                <div className="text-center py-10">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <i className="fas fa-sticky-note text-gray-300 text-xl"></i>
                                    </div>
                                    <p className="text-sm text-gray-400 italic">Nenhuma nota registrada até o momento.</p>
                                </div>
                            ) : (
                                data.notas.map((nota, i) => (
                                    <div key={nota.ID_NOTA || i} className={`p-4 rounded-2xl border transition-all ${nota.GRAVISSIMO ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-white border-gray-100'}`}>
                                        {editingNotaId === nota.ID_NOTA ? (
                                            <div className="space-y-3">
                                                <textarea 
                                                    value={editNotaText}
                                                    onChange={e => setEditNotaText(e.target.value)}
                                                    className="w-full text-sm p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-simas-blue/20 focus:border-simas-blue transition-all resize-none bg-white"
                                                    rows={4}
                                                ></textarea>
                                                <div className="flex items-center justify-between">
                                                    <label className="flex items-center gap-2 text-sm font-bold text-red-600 cursor-pointer group">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={editNotaGravissimo}
                                                            onChange={e => setEditNotaGravissimo(e.target.checked)}
                                                            className="rounded border-gray-300 text-red-600 focus:ring-red-500 w-5 h-5 transition-transform group-hover:scale-110"
                                                        />
                                                        Marcar como Gravíssimo
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => setEditingNotaId(null)}
                                                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-300 transition-all"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button 
                                                            onClick={handleUpdateNota}
                                                            disabled={savingNota || !editNotaText.trim()}
                                                            className="px-4 py-2 bg-simas-blue text-white rounded-xl text-sm font-bold hover:bg-simas-dark transition-all disabled:opacity-50"
                                                        >
                                                            {savingNota ? 'Salvando...' : 'Salvar'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${nota.GRAVISSIMO ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                                        {nota.GRAVISSIMO ? 'GRAVÍSSIMO' : 'INFORMATIVO'}
                                                    </span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-bold text-gray-400 font-mono">
                                                            {new Date(nota.DATA_CRIACAO).toLocaleDateString()}
                                                        </span>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => handleEditInit(nota)} 
                                                                className="text-gray-400 hover:text-simas-blue transition-colors"
                                                                title="Editar Nota"
                                                            >
                                                                <i className="fas fa-pencil-alt text-xs"></i>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteNota(nota.ID_NOTA)} 
                                                                className="text-gray-400 hover:text-red-500 transition-colors"
                                                                title="Excluir Nota"
                                                            >
                                                                <i className="fas fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-medium">{nota.OBS}</p>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                      </section>
                  </div>
              </div>
          </div>
      )}

      {/* --- CEP MODALS --- */}
      {cepDataToConfirm && (
          <ConfirmModal
              title="Atualizar Endereço"
              message={`Deseja sobrescrever os dados de endereço existentes com os novos dados?\n\n${cepDataToConfirm.cep ? `CEP: ${cepDataToConfirm.cep}\n` : ''}Logradouro: ${cepDataToConfirm.logradouro}\nBairro: ${cepDataToConfirm.bairro}\n\nSe você clicar em "Cancelar", apenas os campos que estiverem em branco serão preenchidos.`}
              onConfirm={handleConfirmCepOverwrite}
              onCancel={handleCancelCepOverwrite}
          />
      )}

      {showCepSearchModal && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up flex flex-col max-h-[80vh]">
                  <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                      <h3 className="font-bold text-simas-dark uppercase tracking-tight">Selecione o Endereço</h3>
                      <button onClick={() => setShowCepSearchModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                  </header>
                  <div className="overflow-y-auto p-4 space-y-2">
                      {cepSearchResults.map((result: any, index: number) => (
                          <button
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
    </div>
  );
};

// Helper Component for Data Rows
const InfoRow: React.FC<{ label: string; value: any; compact?: boolean; hasGraveIssue?: boolean }> = ({ label, value, compact, hasGraveIssue }) => (
    <div className={`${compact ? 'mb-1' : 'mb-3'}`}>
        <span className={`block text-[10px] font-bold uppercase tracking-wider print:text-black ${hasGraveIssue ? 'text-red-700' : 'text-gray-400'}`}>{label}</span>
        <span className={`block font-medium ${compact ? 'text-sm' : 'text-base'} ${hasGraveIssue ? 'text-red-500' : 'text-gray-900'}`}>{value || 'N/A'}</span>
    </div>
);
