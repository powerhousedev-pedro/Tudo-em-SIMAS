import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { ConfirmModal } from './ConfirmModal';
import { validation } from '../utils/validation';
import { DROPDOWN_OPTIONS } from '../constants';
import { useMutateEntity } from '../hooks/useSimasData';
import { api } from '../services/api';

interface CreatePessoaModalProps {
    onClose: () => void;
    onSuccess: (pessoa: any) => void;
    showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const CreatePessoaModal: React.FC<CreatePessoaModalProps> = ({ onClose, onSuccess, showToast }) => {
    const { create } = useMutateEntity('Pessoa');
    const [formData, setFormData] = useState({
        NOME: '',
        CPF: '',
        DATA_DE_NASCIMENTO: '',
        NOME_SOCIAL: '',
        SEXO: '',
        EMAIL: '',
        TELEFONE: '',
        ESCOLARIDADE: '',
        FORMACAO: '',
        CEP: '',
        ENDERECO: '',
        NUMERO: '',
        COMPLEMENTO: '',
        BAIRRO: '',
        CIDADE: 'Rio de Janeiro',
        ESTADO: 'RJ',
        PAIS: 'Brasil'
    });

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

    const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const maskedCep = validation.maskCEP(e.target.value);
        setFormData(prev => ({ ...prev, CEP: maskedCep }));
        
        const cleanCep = maskedCep.replace(/\D/g, '');
        if (cleanCep.length === 8) {
            try {
                const data = await api.getCepData(cleanCep);
                if (data && !data.erro) {
                    setFormData(prev => ({
                        ...prev,
                        ENDERECO: data.logradouro || prev.ENDERECO,
                        BAIRRO: data.bairro || prev.BAIRRO,
                        CIDADE: data.localidade || prev.CIDADE,
                        ESTADO: data.uf || prev.ESTADO
                    }));
                    showToast('success', 'Endereço preenchido automaticamente.');
                }
            } catch (err) {
                console.error("Erro ao buscar CEP", err);
            }
        }
    };

    const handleConfirmCepOverwrite = () => {
        if (cepDataToConfirm) {
            setFormData((prev: any) => ({
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
            setFormData((prev: any) => ({
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
        if (!formData.ENDERECO || formData.ENDERECO.length < 3) {
            showToast('error', 'Digite pelo menos 3 caracteres do endereço para buscar.');
            return;
        }
        setIsSearchingCep(true);
        try {
            const results = await api.searchCepByLogradouro(formData.ENDERECO);
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
            setFormData((prev: any) => ({
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.NOME || !formData.CPF) {
            showToast('error', 'Nome e CPF são obrigatórios.');
            return;
        }

        const cleanCpf = formData.CPF.replace(/\D/g, '');
        if (!validation.validateCPF(cleanCpf)) {
            showToast('error', 'CPF inválido.');
            return;
        }

        try {
            await create.mutateAsync({
                ...formData,
                CPF: cleanCpf,
                DATA_DE_NASCIMENTO: formData.DATA_DE_NASCIMENTO ? `${formData.DATA_DE_NASCIMENTO}T00:00:00.000Z` : null
            });
            showToast('success', 'Pessoa criada com sucesso!');
            onSuccess({
                ...formData,
                CPF: cleanCpf
            });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar pessoa.');
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-simas-dark flex items-center gap-2"><i className="fas fa-user-plus text-simas-cyan"></i> Novo Cadastro de Pessoa</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                </header>
                <form id="createPessoaForm" onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo *</label>
                            <input required type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.NOME} onChange={e => setFormData({...formData, NOME: e.target.value.toUpperCase()})} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Social</label>
                            <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.NOME_SOCIAL} onChange={e => setFormData({...formData, NOME_SOCIAL: e.target.value.toUpperCase()})} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CPF *</label>
                            <input required type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all font-mono" value={formData.CPF} onChange={e => setFormData({...formData, CPF: validation.maskCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data de Nascimento</label>
                            <input type="date" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.DATA_DE_NASCIMENTO} onChange={e => setFormData({...formData, DATA_DE_NASCIMENTO: e.target.value})} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sexo</label>
                            <select className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all bg-white" value={formData.SEXO} onChange={e => setFormData({...formData, SEXO: e.target.value})}>
                                <option value="">Não informado</option>
                                {(DROPDOWN_OPTIONS['SEXO'] as string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone</label>
                            <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all font-mono" value={formData.TELEFONE} onChange={e => setFormData({...formData, TELEFONE: validation.maskPhone(e.target.value)})} placeholder="(00) 00000-0000" maxLength={15} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">E-mail</label>
                            <input type="email" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.EMAIL} onChange={e => setFormData({...formData, EMAIL: e.target.value.toLowerCase()})} />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Escolaridade</label>
                            <select className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all bg-white" value={formData.ESCOLARIDADE} onChange={e => setFormData({...formData, ESCOLARIDADE: e.target.value})}>
                                <option value="">Selecione...</option>
                                {(DROPDOWN_OPTIONS['ESCOLARIDADE'] as string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Formação</label>
                            <input type="text" list="formacao-list" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.FORMACAO} onChange={e => setFormData({...formData, FORMACAO: e.target.value})} placeholder="Digite ou selecione..." />
                            <datalist id="formacao-list">
                                {(DROPDOWN_OPTIONS['FORMACAO'] as string[]).map(opt => <option key={opt} value={opt} />)}
                            </datalist>
                        </div>
                    </div>
                    
                    <h4 className="font-bold text-simas-dark mt-6 mb-2 border-b border-gray-100 pb-2">Endereço</h4>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-4 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CEP</label>
                            <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all font-mono" value={formData.CEP} onChange={handleCepChange} placeholder="00000-000" maxLength={9} />
                        </div>
                        <div className="col-span-4 sm:col-span-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Endereço</label>
                            <div className="relative">
                                <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all pr-12" value={formData.ENDERECO} onChange={e => setFormData({...formData, ENDERECO: e.target.value})} />
                                <button
                                    type="button"
                                    onClick={handleSearchCepByLogradouro}
                                    disabled={isSearchingCep}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md bg-simas-cyan/10 text-simas-cyan hover:bg-simas-cyan hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                    title="Buscar CEP por este Endereço"
                                >
                                    {isSearchingCep ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search text-xs"></i>}
                                </button>
                            </div>
                        </div>
                        <div className="col-span-4 sm:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Número</label>
                            <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.NUMERO} onChange={e => setFormData({...formData, NUMERO: e.target.value})} />
                        </div>
                        <div className="col-span-4 sm:col-span-3">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Complemento</label>
                            <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.COMPLEMENTO} onChange={e => setFormData({...formData, COMPLEMENTO: e.target.value})} />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bairro</label>
                            <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.BAIRRO} onChange={e => setFormData({...formData, BAIRRO: e.target.value})} />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">País</label>
                            <select className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all bg-white" value={formData.PAIS} onChange={e => {
                                const isBrasil = e.target.value === 'Brasil';
                                setFormData({...formData, PAIS: e.target.value, ESTADO: isBrasil ? 'RJ' : '', CIDADE: isBrasil ? 'Rio de Janeiro' : ''});
                            }}>
                                {(DROPDOWN_OPTIONS['PAIS'] as string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        {formData.PAIS === 'Brasil' ? (
                            <>
                                <div className="col-span-4 sm:col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">UF</label>
                                    <select className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all bg-white" value={formData.ESTADO} onChange={e => setFormData({...formData, ESTADO: e.target.value, CIDADE: ''})}>
                                        <option value="">Selecione...</option>
                                        {estadosIbge.map(estado => <option key={estado.sigla} value={estado.sigla}>{estado.sigla}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-4 sm:col-span-3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cidade</label>
                                    <select disabled={isLoadingCidades || !formData.ESTADO} className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all bg-white disabled:opacity-50" value={formData.CIDADE} onChange={e => setFormData({...formData, CIDADE: e.target.value})}>
                                        <option value="">{isLoadingCidades ? 'Carregando...' : 'Selecione...'}</option>
                                        {cidadesIbge.map(cidade => <option key={cidade.id} value={cidade.nome}>{cidade.nome}</option>)}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="col-span-4 sm:col-span-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estado</label>
                                    <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.ESTADO} onChange={e => setFormData({...formData, ESTADO: e.target.value})} />
                                </div>
                                <div className="col-span-4 sm:col-span-3">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cidade</label>
                                    <input type="text" className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all" value={formData.CIDADE} onChange={e => setFormData({...formData, CIDADE: e.target.value})} />
                                </div>
                            </>
                        )}
                    </div>
                </form>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                    <Button type="button" variant="secondary" className="flex-1 py-3" onClick={onClose}>Cancelar</Button>
                    <Button form="createPessoaForm" type="submit" isLoading={create.isPending} className="flex-1 py-3">Salvar Pessoa</Button>
                </div>
            </div>

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