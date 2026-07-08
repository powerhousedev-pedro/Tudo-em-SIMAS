import React, { useState, useEffect } from 'react';
import { useEntityData, useMutateEntity } from '../hooks/useSimasData';
import { Button } from './Button';
import { validation } from '../utils/validation';
import { SelectionModal } from './SelectionModal';
import { DossierModal } from './DossierModal';
import { ConfirmModal } from './ConfirmModal';
import { CreatePessoaModal } from './CreatePessoaModal';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { businessLogic } from '../utils/businessLogic';
import { DROPDOWN_OPTIONS } from '../constants';

export const MonitoramentoPanel: React.FC<{ showToast: (type: 'success'|'error'|'info', msg: string) => void, historicoMode?: boolean }> = ({ showToast, historicoMode = false }) => {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreatePessoaModal, setShowCreatePessoaModal] = useState(false);
    const { data: lotacoes = [], isLoading: loadingLotacoes } = useEntityData('Lotacao');
    const { data: vagasData = [] } = useEntityData('Vaga');
    const { data: alocacoes = [] } = useEntityData('Alocacao');
    const { data: contratos = [] } = useEntityData('Contrato');
    const { data: nomeacoes = [] } = useEntityData('Nomeacao');
    const { data: exercicios = [] } = useEntityData('Exercicio');
    const { data: protocolos = [] } = useEntityData('Protocolo');
    const { data: substitutos = [] } = useEntityData('Substituto');
    
    // lookups for creates
    const { data: editaisData = [] } = useEntityData('Edital');
    const { data: cogestoras = [] } = useEntityData('Cogestora');
    const { data: postos = [] } = useEntityData('PostoTrabalho');
    const { data: servidores = [] } = useEntityData('Servidor');
    const { data: funcoes = [] } = useEntityData('Funcao');
    const { data: pessoas = [] } = useEntityData('Pessoa', '', { mergeTemp: 'true' });

    // Filtragem de Editais e Vagas
    const hojeDate = new Date();
    hojeDate.setHours(0,0,0,0);
    const editais = editaisData.filter((e: any) => {
        const isVigente = !e.TERMINO || new Date(e.TERMINO) >= hojeDate;
        return historicoMode ? !isVigente : isVigente;
    });
    const editaisVigentesIds = editais.map((e: any) => e.ID_EDITAL);
    const vagas = vagasData.filter((v: any) => !v.ID_EDITAL || editaisVigentesIds.includes(v.ID_EDITAL));

    const [selectedLotacao, setSelectedLotacao] = useState<any>(null);
    const [showVagaModal, setShowVagaModal] = useState(false);
    const [showAlocacaoModal, setShowAlocacaoModal] = useState(false);
    const [showCreateLotacaoModal, setShowCreateLotacaoModal] = useState(false);
    const [showCreateEditalModal, setShowCreateEditalModal] = useState(false);
    const [showCreatePostoModal, setShowCreatePostoModal] = useState(false);
    const [showCreateVinculacaoModal, setShowCreateVinculacaoModal] = useState(false);
    const [showFillVagaModal, setShowFillVagaModal] = useState(false);
        const [showCreateFuncaoModal, setShowCreateFuncaoModal] = useState(false);
    const [showProtocoloModal, setShowProtocoloModal] = useState(false);
    const [showCreateSubstitutoModal, setShowCreateSubstitutoModal] = useState(false);

    // Form states
    const [vagaData, setVagaData] = useState({ ID_LOTACAO: '', LOTACAO_NOME: '', ID_EDITAL: '', EDITAL_NOME: '', ID_POSTO_TRABALHO: '', POSTO_NOME: '', BLOQUEADA: false, QUANTIDADE: 1 });
    const [alocacaoData, setAlocacaoData] = useState({ MATRICULA: '', ID_FUNCAO: '', DATA_INICIO: '', NOME_SERVIDOR: '', NOME_FUNCAO: '' });
    const [protocoloData, setProtocoloData] = useState({ CPF: '', TIPO_DE_PROTOCOLO: '', INICIO_PRAZO: '', TERMINO_PRAZO: '' });
    const [substitutoData, setSubstitutoData] = useState({ ID_VAGA: '', CPF: '', DATA_ENTRADA: '', DATA_SAIDA: '', NOME_PESSOA: '' });
    const [fillVagaData, setFillVagaData] = useState<any>({ ID_VAGA: '', CPF: '', ID_FUNCAO: '', DATA_DO_CONTRATO: '', NOME_PESSOA: '', NOME_FUNCAO: '', POSTO_ESCOLARIDADE: '' });
    const [viewingSubstituto, setViewingSubstituto] = useState<{[key: string]: boolean}>({});

    const hasActiveSubstitutableProtocol = (cpfOrIdTemp: string) => {
        const protocol = getActiveProtocol(cpfOrIdTemp);
        if (!protocol) return false;
        const validTypes = ['Férias', 'Afastamento INSS', 'Licença Maternidade', 'Licença Paternidade'];
        return validTypes.includes(protocol.TIPO_DE_PROTOCOLO);
    };

    const getActiveProtocol = (cpfOrIdTemp: string) => {
        if (!cpfOrIdTemp) return null;
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const trackedTypes = [
            'Férias', 
            'Afastamento INSS', 
            'Licença Maternidade', 
            'Licença Paternidade', 
            'Licença Médica por Atestado', 
            'Falta'
        ];
        
        return protocolos.find((p: any) => {
            if (p.CPF !== cpfOrIdTemp) return false;
            if (!trackedTypes.includes(p.TIPO_DE_PROTOCOLO)) return false;
            
            const inicio = p.INICIO_PRAZO ? new Date(p.INICIO_PRAZO) : null;
            const termino = p.TERMINO_PRAZO ? new Date(p.TERMINO_PRAZO) : null;
            
            if (inicio && termino) {
                inicio.setHours(0,0,0,0);
                termino.setHours(0,0,0,0);
                return hoje >= inicio && hoje <= termino;
            } else if (inicio) {
                inicio.setHours(0,0,0,0);
                return hoje >= inicio;
            }
            return false;
        });
    };
        const [cepDataToConfirm, setCepDataToConfirm] = useState<{ logradouro: string, bairro: string, cep?: string, complemento?: string, localidade?: string, uf?: string } | null>(null);
    
    
    
    const [newFuncaoData, setNewFuncaoData] = useState({ FUNCAO: '', CBO: '' });
    const [newVinculacaoData, setNewVinculacaoData] = useState({ NOME: '', META_OCUPACAO: '', NIVEL_SATISFATORIO: '', COTA_PCD: '', COTA_AFRO: '', COTA_ASSISTENCIA: '' });

    const [dossierCpf, setDossierCpf] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<{item: any, entity: string} | null>(null);
    const [archiveReason, setArchiveReason] = useState<string>('');
    const [moveVagaContratoItem, setMoveVagaContratoItem] = useState<any>(null);
    const [availableVagas, setAvailableVagas] = useState<any[]>([]);
    const [showVagaSelection, setShowVagaSelection] = useState(false);
    
    // --- TIMELINE STATE ---
    const [timelineVagaId, setTimelineVagaId] = useState<string | null>(null);
    const [timelineData, setTimelineData] = useState<any>(null);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    useEffect(() => {
        if (!timelineVagaId) {
            setTimelineData(null);
            return;
        }
        const fetchTimeline = async () => {
            setLoadingTimeline(true);
            try {
                const data = await api.getVagaTimeline(timelineVagaId);
                setTimelineData(data);
            } catch (e) {
                console.error("Erro ao buscar timeline da vaga:", e);
                setTimelineData(null);
            } finally {
                setLoadingTimeline(false);
            }
        };
        fetchTimeline();
    }, [timelineVagaId]);

    const handleDeleteRequest = (e: React.MouseEvent, item: any, entityName: string) => {
        e.stopPropagation();
        setItemToDelete({ item, entity: entityName });
        setArchiveReason('');
    };

    const handleConfirmDelete = async () => {
        if (!itemToDelete) return;
        const { entity, item } = itemToDelete;
        
        try {
            if (entity === 'Contrato') {
                if (!archiveReason.trim()) return showToast('error', 'Motivo é obrigatório para encerrar contrato.');
                await api.archiveContrato({ CPF: item.CPF }, archiveReason);
                showToast('info', 'Contrato encerrado e arquivado com sucesso.');
                queryClient.invalidateQueries({ queryKey: ['entity', 'Contrato'] });
                queryClient.invalidateQueries({ queryKey: ['entity', 'Vaga'] });
            }
        } catch(err: any) { 
            showToast('error', err.message || 'Erro ao processar solicitação.'); 
        } finally {
            setItemToDelete(null);
            setArchiveReason('');
        }
    };

    const handleOpenMoveVaga = async (e: React.MouseEvent, item: any) => {
        e.stopPropagation();
        setMoveVagaContratoItem(item);
        try {
            const result = await api.fetchEntity('VAGA');
            const pessoaEscolaridade = item.pessoa?.ESCOLARIDADE;
            const abertas = result.filter((v: any) => {
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

    const openVagaModal = () => {
        setVagaData({
            ID_LOTACAO: viewMode === 'lotacao' ? selectedLotacao?.ID_LOTACAO : '',
            LOTACAO_NOME: viewMode === 'lotacao' ? selectedLotacao?.LOTACAO : '',
            ID_EDITAL: viewMode === 'edital' ? selectedLotacao?.ID_EDITAL : '',
            EDITAL_NOME: viewMode === 'edital' ? selectedLotacao?.EDITAL : '',
            ID_POSTO_TRABALHO: viewMode === 'posto' ? selectedLotacao?.ID_POSTO_TRABALHO : '',
            POSTO_NOME: viewMode === 'posto' ? selectedLotacao?.NOME_POSTO : '',
            BLOQUEADA: false,
            QUANTIDADE: 1
        });
        setShowVagaModal(true);
    };
    const { data: vinculacoes = [] } = useEntityData('Vinculacao');
    const [newLotacaoData, setNewLotacaoData] = useState({ 
        LOTACAO: '', COMPLEXIDADE: '', ID_VINCULACAO: '', TIPO_DA_LOTACAO: '', BAIRRO: '', 
        META_OCUPACAO: '', NIVEL_SATISFATORIO: '', COTA_PCD: '', COTA_AFRO: '', COTA_ASSISTENCIA: '',
        CEP: '', ENDERECO: '', NUMERO: '', COMPLEMENTO: '', CIDADE: '', ESTADO: '', PAIS: 'Brasil', LATITUDE: '', LONGITUDE: '',
        EH_SETOR: false, ID_LOTACAO_PAI: ''
    });
    const [isSearchingCep, setIsSearchingCep] = useState(false);
    
    const handleSearchCepLotacao = async () => {
        const cep = newLotacaoData.CEP?.replace(/\D/g, '');
        if (cep?.length === 8) {
            setIsSearchingCep(true);
            try {
                const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await res.json();
                if (!data.erro) {
                    setNewLotacaoData(prev => ({
                        ...prev,
                        ENDERECO: data.logradouro || '',
                        BAIRRO: data.bairro || '',
                        CIDADE: data.localidade || '',
                        ESTADO: data.uf || ''
                    }));
                }
            } catch (e) {
                console.error("Erro ao buscar CEP:", e);
            } finally {
                setIsSearchingCep(false);
            }
        }
    };
    const [newEditalData, setNewEditalData] = useState({ PROCESSO: '', EDITAL: '', NUMERO: '', ID_COGESTORA: '', INICIO: '', TERMINO: '', META_OCUPACAO: '', NIVEL_SATISFATORIO: '', COTA_PCD: '', COTA_AFRO: '', COTA_ASSISTENCIA: '' });
    const [newPostoData, setNewPostoData] = useState({ NOME_POSTO: '', ESCOLARIDADE: '', SALARIO: '' });

    // Selection Modal states
    const [selectionContext, setSelectionContext] = useState<{ active: boolean; entity: string; items: any[]; title: string; onSelect: (item: any) => void } | null>(null);

    // View Mode
    const [viewMode, setViewMode] = useState<'lotacao' | 'edital' | 'posto'>(historicoMode ? 'edital' : 'lotacao');
    const [viewLotacaoMode, setViewLotacaoMode] = useState<'vaga' | 'exercicio'>('vaga');
    const [sortOption, setSortOption] = useState<'vagas_desc' | 'vagas_asc' | 'az' | 'za'>('vagas_desc');

    // Search states for relations
    const [vagaSearchTerm, setVagaSearchTerm] = useState('');
    const [alocacaoSearchTerm, setAlocacaoSearchTerm] = useState('');
    const [vagaFilterDesocupada, setVagaFilterDesocupada] = useState(false);
    const [vagaFilterBloqueada, setVagaFilterBloqueada] = useState<'todas' | 'bloqueadas' | 'desbloqueadas'>('todas');
    const [vagaFilterPosto, setVagaFilterPosto] = useState('');
    const [vagaFilterEdital, setVagaFilterEdital] = useState('');
    const [vagaFilterLotacao, setVagaFilterLotacao] = useState('');

    // mutators
    const { create: createVaga, remove: deleteVaga } = useMutateEntity('Vaga');
    const { create: createAlocacao, remove: deleteAlocacao } = useMutateEntity('Alocacao');
    const { create: createLotacao } = useMutateEntity('Lotacao');
    const { create: createEdital } = useMutateEntity('Edital');
    const { create: createPosto } = useMutateEntity('PostoTrabalho');
    const { create: createVinculacao } = useMutateEntity('Vinculacao');
    const { create: createContrato } = useMutateEntity('Contrato');
        const { create: createFuncao } = useMutateEntity('Funcao');
    const { create: createProtocolo } = useMutateEntity('Protocolo');
    const { create: createSubstituto, remove: deleteSubstituto } = useMutateEntity('Substituto');

    const session = JSON.parse(localStorage.getItem('simas_user_session') || '{}');
    const isCoordination = session.papel === 'COORDENAÇÃO';
    const isReadOnly = historicoMode || session.papel === 'GABINETE' || session.papel === 'GACP';

    const handleCreateSubstituto = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('SUB');
            const { NOME_PESSOA, ...payload } = substitutoData;
            await createSubstituto.mutateAsync({ ...payload, ID_SUBSTITUTO: pk });
            showToast('success', 'Substituto adicionado com sucesso!');
            setShowCreateSubstitutoModal(false);
            setSubstitutoData({ ID_VAGA: '', CPF: '', DATA_ENTRADA: '', DATA_SAIDA: '', NOME_PESSOA: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao adicionar substituto.');
        }
    };

    const handleCreateProtocolo = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('PRT');
            await createProtocolo.mutateAsync({ ...protocoloData, ID_PROTOCOLO: pk });
            showToast('success', 'Protocolo anexado com sucesso!');
            if (['Licença Médica por Atestado', 'Falta'].includes(protocoloData.TIPO_DE_PROTOCOLO)) {
                setTimeout(() => showToast('error', `Atenção: ${protocoloData.TIPO_DE_PROTOCOLO} registrada. Fique atento à reincidência.`), 500);
            }
            setShowProtocoloModal(false);
            setProtocoloData({ CPF: '', TIPO_DE_PROTOCOLO: '', INICIO_PRAZO: '', TERMINO_PRAZO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao anexar protocolo.');
        }
    };

    const isEditalExpired = (editalId: string) => {
        if (!editalId) return false;
        const edital = editais.find((e: any) => e.ID_EDITAL === editalId);
        if (!edital || !edital.TERMINO) return false;
        const termino = new Date(edital.TERMINO);
        termino.setHours(0, 0, 0, 0);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        return termino < hoje;
    };

    const handleCreateFuncao = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('FNC');
            await createFuncao.mutateAsync({ ...newFuncaoData, ID_FUNCAO: pk });
            showToast('success', 'Função criada com sucesso!');
            setShowCreateFuncaoModal(false);
            if (showAlocacaoModal) {
                setAlocacaoData({...alocacaoData, ID_FUNCAO: pk, NOME_FUNCAO: newFuncaoData.FUNCAO});
            }
            if (showFillVagaModal) {
                setFillVagaData({...fillVagaData, ID_FUNCAO: pk, NOME_FUNCAO: newFuncaoData.FUNCAO});
            }
            setNewFuncaoData({ FUNCAO: '', CBO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar função.');
        }
    };

    const parseNumericFields = (data: any) => ({
        ...data,
        META_OCUPACAO: data.META_OCUPACAO ? parseInt(data.META_OCUPACAO, 10) : null,
        NIVEL_SATISFATORIO: data.NIVEL_SATISFATORIO ? parseInt(data.NIVEL_SATISFATORIO, 10) : null,
        COTA_PCD: data.COTA_PCD ? parseFloat(data.COTA_PCD) : null,
        COTA_AFRO: data.COTA_AFRO ? parseFloat(data.COTA_AFRO) : null,
        COTA_ASSISTENCIA: data.COTA_ASSISTENCIA ? parseFloat(data.COTA_ASSISTENCIA) : null,
        EH_SETOR: data.EH_SETOR || false,
        ID_LOTACAO_PAI: data.ID_LOTACAO_PAI || null,
        CEP: data.CEP || null,
        ENDERECO: data.ENDERECO || null,
        NUMERO: data.NUMERO || null,
        COMPLEMENTO: data.COMPLEMENTO || null,
        BAIRRO: data.BAIRRO || null,
        CIDADE: data.CIDADE || null,
        ESTADO: data.ESTADO || null,
        PAIS: data.PAIS || 'Brasil'
    });

    const handleCreateLotacao = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('LOT');
            await createLotacao.mutateAsync({
                ...parseNumericFields(newLotacaoData),
                ID_LOTACAO: pk
            });
            showToast('success', 'Lotação criada com sucesso!');
            setShowCreateLotacaoModal(false);
            setVagaData({...vagaData, ID_LOTACAO: pk, LOTACAO_NOME: newLotacaoData.LOTACAO});
            setNewLotacaoData({ LOTACAO: '', COMPLEXIDADE: '', ID_VINCULACAO: '', TIPO_DA_LOTACAO: '', BAIRRO: '', META_OCUPACAO: '', NIVEL_SATISFATORIO: '', COTA_PCD: '', COTA_AFRO: '', COTA_ASSISTENCIA: '', CEP: '', ENDERECO: '', NUMERO: '', COMPLEMENTO: '', CIDADE: '', ESTADO: '', PAIS: 'Brasil', LATITUDE: '', LONGITUDE: '', EH_SETOR: false, ID_LOTACAO_PAI: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar lotação.');
        }
    };

    const handleCreateEdital = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('EDT');
            await createEdital.mutateAsync({ ...parseNumericFields(newEditalData), ID_EDITAL: pk });
            showToast('success', 'Edital criado com sucesso!');
            setShowCreateEditalModal(false);
            setVagaData({...vagaData, ID_EDITAL: pk, EDITAL_NOME: newEditalData.EDITAL});
            setNewEditalData({ PROCESSO: '', EDITAL: '', NUMERO: '', ID_COGESTORA: '', INICIO: '', TERMINO: '', META_OCUPACAO: '', NIVEL_SATISFATORIO: '', COTA_PCD: '', COTA_AFRO: '', COTA_ASSISTENCIA: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar edital.');
        }
    };

    const handleCreateVinculacao = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('VNC');
            await createVinculacao.mutateAsync({ ...parseNumericFields(newVinculacaoData), ID_VINCULACAO: pk });
            showToast('success', 'Vinculação criada com sucesso!');
            setShowCreateVinculacaoModal(false);
            setNewVinculacaoData({ NOME: '', META_OCUPACAO: '', NIVEL_SATISFATORIO: '', COTA_PCD: '', COTA_AFRO: '', COTA_ASSISTENCIA: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar vinculação.');
        }
    };

    const handleCreatePosto = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('PST');
            await createPosto.mutateAsync({ ...newPostoData, ID_POSTO_TRABALHO: pk });
            showToast('success', 'Posto de trabalho criado com sucesso!');
            setShowCreatePostoModal(false);
            setVagaData({...vagaData, ID_POSTO_TRABALHO: pk, POSTO_NOME: newPostoData.NOME_POSTO});
            setNewPostoData({ NOME_POSTO: '', ESCOLARIDADE: '', SALARIO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar posto.');
        }
    };

    const getVagasCount = (item: any, type: 'lotacao' | 'edital' | 'posto') => {
        if (type === 'lotacao') {
            if (viewLotacaoMode === 'exercicio') {
                return exercicios.filter((e:any) => e.ID_LOTACAO === item.ID_LOTACAO).length;
            }
            return vagas.filter((v:any) => v.ID_LOTACAO === item.ID_LOTACAO).length;
        }
        if (type === 'edital') return vagas.filter((v:any) => v.ID_EDITAL === item.ID_EDITAL).length;
        if (type === 'posto') return vagas.filter((v:any) => v.ID_POSTO_TRABALHO === item.ID_POSTO_TRABALHO).length;
        return 0;
    };

    const sortItems = (items: any[], type: 'lotacao' | 'edital' | 'posto') => {
        return [...items].sort((a, b) => {
            const vagasA = getVagasCount(a, type);
            const vagasB = getVagasCount(b, type);
            const nameA = (a.LOTACAO || a.EDITAL || a.NOME_POSTO || '').toLowerCase();
            const nameB = (b.LOTACAO || b.EDITAL || b.NOME_POSTO || '').toLowerCase();

            if (sortOption === 'vagas_desc') {
                if (vagasA !== vagasB) return vagasB - vagasA;
                return nameA.localeCompare(nameB);
            }
            if (sortOption === 'vagas_asc') {
                if (vagasA !== vagasB) return vagasA - vagasB;
                return nameA.localeCompare(nameB);
            }
            if (sortOption === 'az') {
                return nameA.localeCompare(nameB);
            }
            if (sortOption === 'za') {
                return nameB.localeCompare(nameA);
            }
            return 0;
        });
    };

    const filteredLotacoes = sortItems(lotacoes.filter((l: any) => 
        l.LOTACAO?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.BAIRRO?.toLowerCase().includes(searchTerm.toLowerCase())
    ), 'lotacao');

    const filteredEditais = sortItems(editais.filter((e: any) => 
        e.EDITAL?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.PROCESSO?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.NOME_COGESTORA?.toLowerCase().includes(searchTerm.toLowerCase())
    ), 'edital');

    const filteredPostos = sortItems(postos.filter((p: any) => 
        p.NOME_POSTO?.toLowerCase().includes(searchTerm.toLowerCase())
    ), 'posto');

    const handleCreateVaga = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLotacao) return;
        try {
            const quantidade = Math.max(1, parseInt(String(vagaData.QUANTIDADE), 10) || 1);
            const promises = [];
            for (let i = 0; i < quantidade; i++) {
                promises.push(createVaga.mutateAsync({
                    ID_VAGA: validation.generateLegacyId('VAG'),
                    ID_LOTACAO: vagaData.ID_LOTACAO,
                    ID_EDITAL: vagaData.ID_EDITAL,
                    ID_POSTO_TRABALHO: vagaData.ID_POSTO_TRABALHO,
                    BLOQUEADA: vagaData.BLOQUEADA
                }));
            }
            await Promise.all(promises);
            showToast('success', `${quantidade} vaga(s) criada(s) com sucesso!`);
            setShowVagaModal(false);
            setVagaData({ ID_LOTACAO: '', LOTACAO_NOME: '', ID_EDITAL: '', EDITAL_NOME: '', ID_POSTO_TRABALHO: '', POSTO_NOME: '', BLOQUEADA: false, QUANTIDADE: 1 });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar vaga(s).');
        }
    };

    const handleCreateAlocacao = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLotacao) return;
        try {
            await createAlocacao.mutateAsync({
                ID_ALOCACAO: validation.generateLegacyId('ALC'),
                ID_LOTACAO: selectedLotacao.ID_LOTACAO,
                MATRICULA: alocacaoData.MATRICULA,
                ID_FUNCAO: alocacaoData.ID_FUNCAO,
                DATA_INICIO: alocacaoData.DATA_INICIO
            });
            showToast('success', 'Alocação criada com sucesso!');
            setShowAlocacaoModal(false);
            setAlocacaoData({ MATRICULA: '', ID_FUNCAO: '', DATA_INICIO: '', NOME_SERVIDOR: '', NOME_FUNCAO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar alocação.');
        }
    };

    const handleFillVaga = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createContrato.mutateAsync({
                ID_CONTRATO: validation.generateLegacyId('CTT'),
                ID_VAGA: fillVagaData.ID_VAGA,
                CPF: fillVagaData.IS_TEMP ? null : fillVagaData.CPF,
                
                ID_FUNCAO: fillVagaData.ID_FUNCAO,
                DATA_DO_CONTRATO: fillVagaData.DATA_DO_CONTRATO ? `${fillVagaData.DATA_DO_CONTRATO}T00:00:00.000Z` : null
            });
            showToast('success', 'Vaga preenchida com sucesso!');
            setShowFillVagaModal(false);
            setFillVagaData({ ID_VAGA: '', CPF: '', ID_FUNCAO: '', DATA_DO_CONTRATO: '', NOME_PESSOA: '', NOME_FUNCAO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao preencher vaga.');
        }
    };

    // Filter relations for selected
    const getRelationalVagas = () => {
        if (!selectedLotacao) return [];
        if (viewMode === 'lotacao') {
            if (viewLotacaoMode === 'exercicio') {
                const ex = exercicios.filter((e: any) => e.ID_LOTACAO === selectedLotacao.ID_LOTACAO);
                const vagaIds = ex.map((e: any) => e.ID_VAGA);
                return vagas.filter((v: any) => vagaIds.includes(v.ID_VAGA));
            }
            return vagas.filter((v: any) => v.ID_LOTACAO === selectedLotacao.ID_LOTACAO);
        }
        if (viewMode === 'edital') return vagas.filter((v: any) => v.ID_EDITAL === selectedLotacao.ID_EDITAL);
        if (viewMode === 'posto') return vagas.filter((v: any) => v.ID_POSTO_TRABALHO === selectedLotacao.ID_POSTO_TRABALHO);
        return [];
    };

    const getRelationalAlocacoes = () => {
        if (!selectedLotacao) return [];
        if (viewMode === 'lotacao') return alocacoes.filter((a: any) => a.ID_LOTACAO === selectedLotacao.ID_LOTACAO);
        // Alocações don't have Edital or PostoTrabalho relationships directly
        return [];
    };

    const lotacaoVagas = getRelationalVagas();
    const lotacaoAlocacoes = getRelationalAlocacoes();

    const filteredVagas = lotacaoVagas.filter((v: any) => {
        const searchStr = `${v.ID_VAGA} ${v.POSTO_NOME || v.ID_POSTO_TRABALHO} ${v.EDITAL_NOME || v.ID_EDITAL} ${v.LOTACAO_NOME || v.ID_LOTACAO}`.toLowerCase();
        const matchesSearch = searchStr.includes(vagaSearchTerm.toLowerCase());
        
        const isDesocupada = !contratos.some((c: any) => c.ID_VAGA === v.ID_VAGA);
        const matchesDesocupada = vagaFilterDesocupada ? isDesocupada : true;
        
        const matchesBloqueada = vagaFilterBloqueada === 'todas' ? true : 
                                 vagaFilterBloqueada === 'bloqueadas' ? v.BLOQUEADA : 
                                 !v.BLOQUEADA;

        const matchesPosto = viewMode !== 'posto' && vagaFilterPosto ? v.ID_POSTO_TRABALHO === vagaFilterPosto : true;
        const matchesEdital = viewMode !== 'edital' && vagaFilterEdital ? v.ID_EDITAL === vagaFilterEdital : true;
        const matchesLotacao = viewMode !== 'lotacao' && vagaFilterLotacao ? v.ID_LOTACAO === vagaFilterLotacao : true;

        return matchesSearch && matchesDesocupada && matchesBloqueada && matchesPosto && matchesEdital && matchesLotacao;
    });

    const filteredAlocacoes = lotacaoAlocacoes.filter((a: any) => {
        const searchStr = `${a.NOME_PESSOA || a.MATRICULA} ${a.NOME_FUNCAO || a.ID_FUNCAO}`.toLowerCase();
        return searchStr.includes(alocacaoSearchTerm.toLowerCase());
    });

    return (
        <div className={`flex flex-col h-full ${historicoMode ? 'bg-transparent' : 'bg-simas-cloud'} p-6 relative overflow-hidden`}>
            <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 relative z-10">
                <div>
                    <h2 className="text-2xl font-black text-simas-dark uppercase tracking-tight">Monitoramento</h2>
                    <p className="text-gray-500 text-sm">Painel de edição relacional</p>
                </div>
                
                {!selectedLotacao && (
                    <div className="flex flex-col xl:flex-row gap-4 items-center">
                        {!historicoMode && (
                        <div className="flex bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 p-1 w-max shrink-0">
                            <button 
                                onClick={() => { setViewMode('lotacao'); setSearchTerm(''); }}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'lotacao' ? 'bg-simas-cyan text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Lotações
                            </button>
                            <button 
                                onClick={() => { setViewMode('edital'); setSearchTerm(''); }}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'edital' ? 'bg-simas-cyan text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Editais
                            </button>
                            <button 
                                onClick={() => { setViewMode('posto'); setSearchTerm(''); }}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'posto' ? 'bg-simas-cyan text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Postos
                            </button>
                        </div>
                        )}
                        {viewMode === 'lotacao' && (
                            <div className="flex items-center gap-3 animate-fade-in w-full justify-center xl:justify-start">
                                <div className="h-8 w-px bg-gray-200 hidden xl:block"></div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:inline">Exibir por:</span>
                                <div className="flex bg-white rounded-xl p-1 shadow-sm border border-gray-100 shrink-0">
                                    <button 
                                        onClick={() => setViewLotacaoMode('vaga')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all ${viewLotacaoMode === 'vaga' ? 'bg-simas-cyan/10 text-simas-cyan' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                                    >
                                        <i className="fas fa-sitemap"></i> Vagas Base
                                    </button>
                                    <button 
                                        onClick={() => setViewLotacaoMode('exercicio')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all ${viewLotacaoMode === 'exercicio' ? 'bg-simas-cyan/10 text-simas-cyan' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}
                                    >
                                        <i className="fas fa-map-marker-alt"></i> Locais de Exercício
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex w-full md:w-auto gap-2">
                    <div className="relative flex-1 md:w-80">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            <i className="fas fa-search text-sm"></i>
                        </div>
                        <input 
                            type="text" 
                            placeholder={`Buscar por ${viewMode === 'lotacao' ? 'nome da lotação' : viewMode === 'edital' ? 'nome do edital' : 'nome do posto'}...`}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan outline-none transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative shrink-0">
                        <select
                            className="h-full bg-white border border-gray-200 rounded-2xl pl-4 pr-10 py-3 text-sm font-medium focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan outline-none transition-all shadow-sm text-gray-600 appearance-none cursor-pointer"
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value as any)}
                            title="Ordenar por"
                        >
                            <option value="vagas_desc">Mais Vagas</option>
                            <option value="vagas_asc">Menos Vagas</option>
                            <option value="az">A-Z</option>
                            <option value="za">Z-A</option>
                        </select>
                        <i className="fas fa-sort absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                    </div>
                </div>
            </header>

            {!selectedLotacao ? (
                // GRID VIEW
                <div className="flex-1 overflow-y-auto min-h-0 pr-2 pt-4 -mt-4 relative z-20">
                    {loadingLotacoes ? (
                        <div className="flex justify-center items-center h-full">
                            <i className="fas fa-circle-notch fa-spin text-3xl text-simas-cyan"></i>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-12 pt-2">
                            {isCoordination && !isReadOnly && viewMode === 'lotacao' && (
                                <div 
                                    onClick={() => setShowCreateLotacaoModal(true)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-gray-200 hover:border-simas-cyan hover:bg-simas-cyan/5 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 group-hover:bg-simas-cyan group-hover:text-white flex items-center justify-center transition-all mb-3 shadow-inner">
                                        <i className="fas fa-plus text-lg"></i>
                                    </div>
                                    <span className="font-black text-xs text-gray-400 group-hover:text-simas-dark uppercase tracking-widest">Nova Lotação</span>
                                </div>
                            )}
                            {isCoordination && !isReadOnly && viewMode === 'edital' && (
                                <div 
                                    onClick={() => setShowCreateEditalModal(true)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-gray-200 hover:border-simas-cyan hover:bg-simas-cyan/5 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 group-hover:bg-simas-cyan group-hover:text-white flex items-center justify-center transition-all mb-3 shadow-inner">
                                        <i className="fas fa-plus text-lg"></i>
                                    </div>
                                    <span className="font-black text-xs text-gray-400 group-hover:text-simas-dark uppercase tracking-widest">Novo Edital</span>
                                </div>
                            )}
                            {isCoordination && !isReadOnly && viewMode === 'posto' && (
                                <div 
                                    onClick={() => setShowCreatePostoModal(true)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-gray-200 hover:border-simas-cyan hover:bg-simas-cyan/5 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 group-hover:bg-simas-cyan group-hover:text-white flex items-center justify-center transition-all mb-3 shadow-inner">
                                        <i className="fas fa-plus text-lg"></i>
                                    </div>
                                    <span className="font-black text-xs text-gray-400 group-hover:text-simas-dark uppercase tracking-widest">Novo Posto</span>
                                </div>
                            )}

                            {viewMode === 'lotacao' && filteredLotacoes.map((lotacao: any) => (
                                <div 
                                    key={lotacao.ID_LOTACAO} 
                                    onClick={() => setSelectedLotacao(lotacao)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-simas-cyan cursor-pointer transition-all transform hover:-translate-y-1 flex flex-col"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-simas-cloud text-simas-dark flex items-center justify-center font-bold text-lg shrink-0">
                                            <i className="fas fa-building text-sm"></i>
                                        </div>
                                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-lg uppercase">{lotacao.COMPLEXIDADE || 'N/A'}</span>
                                    </div>
                                    <h3 className="font-bold text-simas-dark text-base leading-tight mb-1">{lotacao.LOTACAO}</h3>
                                    <p className="text-gray-500 text-xs mb-4">{lotacao.BAIRRO ? `Bairro: ${lotacao.BAIRRO}` : 'Bairro não definido'}</p>
                                    <div className="mt-auto flex gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md">
                                            <i className="fas fa-chair text-simas-cyan"></i> {getVagasCount(lotacao, 'lotacao')}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md">
                                            <i className="fas fa-users text-simas-cyan"></i> {alocacoes.filter((a:any) => a.ID_LOTACAO === lotacao.ID_LOTACAO).length}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {viewMode === 'edital' && filteredEditais.map((edital: any) => (
                                <div 
                                    key={edital.ID_EDITAL} 
                                    onClick={() => setSelectedLotacao(edital)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-simas-cyan cursor-pointer transition-all transform hover:-translate-y-1 flex flex-col"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-simas-cyan/10 text-simas-cyan flex items-center justify-center font-bold text-lg shrink-0">
                                            <i className="fas fa-file-contract text-sm"></i>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-simas-dark text-base leading-tight mb-1">{edital.EDITAL}</h3>
                                    <p className="text-gray-500 text-xs mb-4">Proc: {edital.PROCESSO || 'N/A'}</p>
                                    <div className="mt-auto flex gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md">
                                            <i className="fas fa-chair text-simas-cyan"></i> {vagas.filter((v:any) => v.ID_EDITAL === edital.ID_EDITAL).length} vagas
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {viewMode === 'posto' && filteredPostos.map((posto: any) => (
                                <div 
                                    key={posto.ID_POSTO_TRABALHO} 
                                    onClick={() => setSelectedLotacao(posto)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-simas-cyan cursor-pointer transition-all transform hover:-translate-y-1 flex flex-col"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-simas-blue/10 text-simas-blue flex items-center justify-center font-bold text-lg shrink-0">
                                            <i className="fas fa-briefcase text-sm"></i>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-simas-dark text-base leading-tight mb-1">{posto.NOME_POSTO}</h3>
                                    <p className="text-gray-500 text-xs mb-4">Escolaridade: {posto.ESCOLARIDADE || 'N/A'}</p>
                                    <div className="mt-auto flex gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md">
                                            <i className="fas fa-chair text-simas-cyan"></i> {vagas.filter((v:any) => v.ID_POSTO_TRABALHO === posto.ID_POSTO_TRABALHO).length} vagas
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                // DETAIL VIEW
                <div className="flex-1 flex flex-col min-h-0 bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-slide-up">
                    <header className="px-8 py-6 border-b border-gray-100 bg-gray-50/80 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setSelectedLotacao(null)}
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-simas-dark hover:border-simas-dark transition-all shadow-sm"
                            >
                                <i className="fas fa-arrow-left"></i>
                            </button>
                            <div>
                                <p className="text-xs font-bold text-simas-cyan uppercase tracking-widest mb-0.5">
                                    {viewMode === 'lotacao' ? 'Editando Lotação' : viewMode === 'edital' ? 'Editando Edital' : 'Editando Posto'}
                                </p>
                                <h2 className="text-2xl font-black text-simas-dark">
                                    {viewMode === 'lotacao' ? selectedLotacao.LOTACAO : viewMode === 'edital' ? selectedLotacao.EDITAL : selectedLotacao.NOME_POSTO}
                                </h2>
                            </div>
                        </div>
                    </header>
                    
                    <div className="flex-1 overflow-y-auto p-8 flex flex-col lg:flex-row gap-8">
                        {/* Vagas Column */}
                        <div className="flex-1 flex flex-col border border-gray-100 rounded-2xl bg-gray-50/30 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                                <h3 className="font-bold text-simas-dark flex items-center gap-2"><i className="fas fa-chair text-simas-cyan"></i> Vagas ({filteredVagas.length})</h3>
                                <div className="flex items-center gap-2 w-full sm:w-auto relative group">
                                    <div className="relative flex-1 sm:w-48">
                                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                        <input 
                                            type="text" 
                                            placeholder="Buscar vaga..." 
                                            className="w-full pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-simas-cyan focus:bg-white transition-all"
                                            value={vagaSearchTerm}
                                            onChange={(e) => setVagaSearchTerm(e.target.value)}
                                        />
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                            <button className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-simas-cyan transition-colors rounded">
                                                <i className="fas fa-filter text-xs"></i>
                                            </button>
                                            
                                            {/* Filter Popover */}
                                            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 origin-top-right transform scale-95 group-hover:scale-100">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="font-bold text-sm text-simas-dark">Filtros de Vagas</h4>
                                                    {(vagaFilterDesocupada || vagaFilterBloqueada !== 'todas' || vagaFilterPosto || vagaFilterEdital || vagaFilterLotacao) && (
                                                        <button 
                                                            onClick={() => { setVagaFilterDesocupada(false); setVagaFilterBloqueada('todas'); setVagaFilterPosto(''); setVagaFilterEdital(''); setVagaFilterLotacao(''); }}
                                                            className="text-[10px] text-red-500 hover:underline"
                                                        >
                                                            Limpar
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                <div className="space-y-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 text-simas-cyan rounded border-gray-300 focus:ring-simas-cyan"
                                                            checked={vagaFilterDesocupada}
                                                            onChange={e => setVagaFilterDesocupada(e.target.checked)}
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Apenas desocupadas</span>
                                                    </label>

                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status de Bloqueio</label>
                                                        <select 
                                                            className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-simas-cyan focus:bg-white"
                                                            value={vagaFilterBloqueada}
                                                            onChange={e => setVagaFilterBloqueada(e.target.value as any)}
                                                        >
                                                            <option value="todas">Todas as vagas</option>
                                                            <option value="desbloqueadas">Apenas desbloqueadas</option>
                                                            <option value="bloqueadas">Apenas bloqueadas</option>
                                                        </select>
                                                    </div>

                                                    {viewMode !== 'posto' && (
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filtrar por Posto</label>
                                                            <select 
                                                                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-simas-cyan focus:bg-white"
                                                                value={vagaFilterPosto}
                                                                onChange={e => setVagaFilterPosto(e.target.value)}
                                                            >
                                                                <option value="">Todos os postos</option>
                                                                {Array.from(new Set(lotacaoVagas.map((v:any) => v.ID_POSTO_TRABALHO))).map(postoId => {
                                                                    const postoNome = lotacaoVagas.find((v:any) => v.ID_POSTO_TRABALHO === postoId)?.POSTO_NOME || postoId;
                                                                    return <option key={postoId as string} value={postoId as string}>{postoNome as string}</option>;
                                                                })}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {viewMode !== 'edital' && (
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filtrar por Edital</label>
                                                            <select 
                                                                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-simas-cyan focus:bg-white"
                                                                value={vagaFilterEdital}
                                                                onChange={e => setVagaFilterEdital(e.target.value)}
                                                            >
                                                                <option value="">Todos os editais</option>
                                                                {Array.from(new Set(lotacaoVagas.map((v:any) => v.ID_EDITAL))).map(editalId => {
                                                                    const editalNome = lotacaoVagas.find((v:any) => v.ID_EDITAL === editalId)?.EDITAL_NOME || editalId;
                                                                    return <option key={editalId as string} value={editalId as string}>{editalNome as string}</option>;
                                                                })}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {viewMode !== 'lotacao' && (
                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Filtrar por Lotação</label>
                                                            <select 
                                                                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-simas-cyan focus:bg-white"
                                                                value={vagaFilterLotacao}
                                                                onChange={e => setVagaFilterLotacao(e.target.value)}
                                                            >
                                                                <option value="">Todas as lotações</option>
                                                                {Array.from(new Set(lotacaoVagas.map((v:any) => v.ID_LOTACAO))).map(lotacaoId => {
                                                                    const lotacaoNome = lotacaoVagas.find((v:any) => v.ID_LOTACAO === lotacaoId)?.LOTACAO_NOME || lotacaoId;
                                                                    return <option key={lotacaoId as string} value={lotacaoId as string}>{lotacaoNome as string}</option>;
                                                                })}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {!isReadOnly && (
                                        <Button 
                                            onClick={openVagaModal} 
                                            disabled={viewMode === 'edital' && isEditalExpired(selectedLotacao?.ID_EDITAL)}
                                            title={viewMode === 'edital' && isEditalExpired(selectedLotacao?.ID_EDITAL) ? 'Este edital já foi encerrado e não pode receber novas vagas.' : ''}
                                        >
                                            <i className="fas fa-plus"></i> Nova Vaga
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="p-4 pt-6 flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 content-start">
                                {filteredVagas.length === 0 ? (
                                    <p className="col-span-full text-gray-400 text-sm text-center py-8">Nenhuma vaga encontrada.</p>
                                ) : filteredVagas.map((v: any) => {
                                    const contratoVinculado = contratos.find((c: any) => c.ID_VAGA === v.ID_VAGA);
                                    const hasGraveIssue = contratoVinculado?.pessoa?.notas?.some((n: any) => n.GRAVISSIMO);
                                    
                                                                         return (
                                                                            <div key={v.ID_VAGA} onClick={() => setTimelineVagaId(v.ID_VAGA)} className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between group hover:shadow-md transition-all overflow-hidden cursor-pointer ${v.BLOQUEADA ? 'border-red-300 bg-red-50' : (hasGraveIssue ? 'border-red-200 border-l-[6px] border-l-red-600 bg-red-50 shadow-red-100/50' : 'bg-white border-gray-100')}`}>
                                                                                <div className="w-full mb-3">                                                {hasGraveIssue && (
                                                    <span className="inline-block bg-red-100 text-red-700 font-bold text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-red-200 w-max mb-2 shadow-sm">
                                                        <i className="fas fa-exclamation-triangle mr-1"></i> PROBLEMA GRAVE
                                                    </span>
                                                )}
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <p className="text-xs text-gray-400 mb-0.5 font-medium">{v.ID_VAGA}</p>
                                                        {viewMode !== 'posto' && <p className="font-bold text-sm text-simas-dark">{v.POSTO_NOME || v.ID_POSTO_TRABALHO}</p>}
                                                        {viewMode !== 'edital' && <p className="text-xs text-gray-500 mt-0.5">{v.EDITAL_NOME || v.ID_EDITAL}</p>}
                                                        {viewMode !== 'lotacao' && <p className="text-xs text-simas-cyan font-bold mt-0.5">{v.LOTACAO_NOME || v.ID_LOTACAO}</p>}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                                                        {v.BLOQUEADA && <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded uppercase shadow-sm flex items-center gap-1"><i className="fas fa-lock"></i> Bloqueada</span>}
                                                        {!isReadOnly && (
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                {contratoVinculado && hasActiveSubstitutableProtocol(contratoVinculado.CPF) && (
                                                                    <button onClick={(e) => { e.stopPropagation(); setSubstitutoData({ ...substitutoData, ID_VAGA: v.ID_VAGA }); setShowCreateSubstitutoModal(true); }} className="text-green-500 hover:text-green-700 bg-green-50 w-6 h-6 rounded flex items-center justify-center" title="Adicionar Substituto">
                                                                        <i className="fas fa-user-plus text-xs"></i>
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); deleteVaga.mutate(v.ID_VAGA); }}
                                                                    className="text-red-400 hover:text-red-600 bg-red-50 w-6 h-6 rounded flex items-center justify-center"
                                                                    title="Remover Vaga"
                                                                >
                                                                    <i className="fas fa-trash text-xs"></i>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                                {/* Informações do Ocupante (Contrato) */}
                                                <div className="mt-auto pt-3 border-t border-gray-50">
                                                    {(() => {
                                                        if (!contratoVinculado) {
                                                            return (
                                                                <div className="flex justify-between items-center w-full">
                                                                    <div className="flex items-center gap-2 text-xs text-gray-400 italic">
                                                                        <i className="fas fa-exclamation-circle text-yellow-500"></i> Vaga desocupada
                                                                    </div>
                                                                    {!isReadOnly && !v.BLOQUEADA && !isEditalExpired(v.ID_EDITAL) && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setFillVagaData({ ...fillVagaData, ID_VAGA: v.ID_VAGA, POSTO_ESCOLARIDADE: v.postoTrabalho?.ESCOLARIDADE });
                                                                                setShowFillVagaModal(true);
                                                                            }}
                                                                            className="text-[10px] bg-simas-cyan text-white px-2 py-1 rounded hover:bg-simas-blue transition-colors font-bold uppercase tracking-wide"
                                                                        >
                                                                            Preencher
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        const subsDaVaga = substitutos.filter((sub: any) => sub.ID_VAGA === v.ID_VAGA);
                                                        const temSubstituto = subsDaVaga.length > 0;
                                                        const isViewingSub = viewingSubstituto[v.ID_VAGA] && temSubstituto;
                                                        const subAtivo = isViewingSub ? subsDaVaga[0] : null;

                                                        return (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    {isViewingSub ? (
                                                                        <div className="flex items-start gap-3 w-full">
                                                                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                                                                                <i className="fas fa-user-clock text-xs"></i>
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-xs font-bold text-green-700 truncate">{subAtivo.NOME_PESSOA || validation.formatCPF(subAtivo.CPF)}</p>
                                                                                <div className="flex flex-col gap-1 mt-1">
                                                                                    <span className="w-fit bg-green-200 text-green-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Substituto</span>
                                                                                    <p className="text-[10px] text-green-600">Até {validation.formatDate(subAtivo.DATA_SAIDA)}</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1 shrink-0 justify-end ml-auto opacity-0 group-hover:opacity-100 transition-opacity max-w-[70px]">
                                                                                <button onClick={(e) => { e.stopPropagation(); setViewingSubstituto(prev => ({...prev, [v.ID_VAGA]: false})); }} className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors" title="Ver Titular">
                                                                                    <i className="fas fa-exchange-alt text-xs"></i>
                                                                                </button>
                                                                                <button onClick={(e) => { e.stopPropagation(); setDossierCpf(subAtivo.CPF); }} className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 text-gray-500 hover:text-simas-cyan hover:bg-simas-cyan/10 transition-colors" title="Dossiê">
                                                                                    <i className="fas fa-id-card text-xs"></i>
                                                                                </button>
                                                                                {!isReadOnly && (
                                                                                    <button onClick={() => deleteSubstituto.mutate(subAtivo.ID_SUBSTITUTO)} className="w-6 h-6 rounded flex items-center justify-center bg-red-50 text-red-400 hover:text-red-600 transition-colors" title="Remover Substituto">
                                                                                        <i className="fas fa-times text-xs"></i>
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex items-start gap-3 w-full">
                                                                            <div className="w-8 h-8 rounded-full bg-simas-cyan/10 text-simas-cyan flex items-center justify-center shrink-0">
                                                                                <i className="fas fa-user text-xs"></i>
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-xs font-bold text-simas-dark truncate">{contratoVinculado.NOME_PESSOA || contratoVinculado.CPF}</p>
                                                                                <p className="text-[10px] text-gray-500">Contrato: {contratoVinculado.ID_CONTRATO}</p>
                                                                                <p className="text-[10px] text-simas-cyan font-medium">{contratoVinculado.NOME_FUNCAO || contratoVinculado.ID_FUNCAO}</p>
                                                                                {getActiveProtocol(contratoVinculado.CPF) && (
                                                                                    <div className="flex gap-1 mt-1 flex-wrap">
                                                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-black uppercase border border-purple-200">
                                                                                            <i className="fas fa-clock"></i> {getActiveProtocol(contratoVinculado.CPF).TIPO_DE_PROTOCOLO}
                                                                                        </span>
                                                                                        {hasActiveSubstitutableProtocol(contratoVinculado.CPF) && (
                                                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-black uppercase border border-red-200">
                                                                                                <i className="fas fa-user-minus"></i> Ausente
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1 shrink-0 justify-end ml-auto opacity-0 group-hover:opacity-100 transition-opacity max-w-[70px]">
                                                                                {temSubstituto && (
                                                                                    <button onClick={(e) => { e.stopPropagation(); setViewingSubstituto(prev => ({...prev, [v.ID_VAGA]: true})); }} className="w-6 h-6 rounded flex items-center justify-center bg-green-100 text-green-600 hover:text-green-800 hover:bg-green-200 transition-colors" title="Ver Substituto">
                                                                                        <i className="fas fa-exchange-alt text-xs"></i>
                                                                                    </button>
                                                                                )}
                                                                                {!isReadOnly && (
                                                                                    <>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setDossierCpf(contratoVinculado.CPF); }} className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 text-gray-500 hover:text-simas-cyan hover:bg-simas-cyan/10 transition-colors" title="Dossiê">
                                                                                            <i className="fas fa-id-card text-xs"></i>
                                                                                        </button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setProtocoloData({ ...protocoloData, CPF: contratoVinculado.CPF || '' }); setShowProtocoloModal(true); }} className="w-6 h-6 rounded flex items-center justify-center bg-purple-50 text-purple-400 hover:text-purple-600 hover:bg-purple-100 transition-colors" title="Anexar Protocolo">
                                                                                            <i className="fas fa-file-signature text-xs"></i>
                                                                                        </button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleOpenMoveVaga(e, contratoVinculado); }} className="w-6 h-6 rounded flex items-center justify-center bg-blue-50 text-blue-400 hover:text-blue-600 hover:bg-blue-100 transition-colors" title="Mover para outra Vaga">
                                                                                            <i className="fas fa-long-arrow-alt-right text-xs"></i>
                                                                                        </button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteRequest(e, contratoVinculado, 'Contrato'); }} className="w-6 h-6 rounded flex items-center justify-center bg-orange-50 text-orange-400 hover:text-orange-600 hover:bg-orange-100 transition-colors" title="Encerrar Contrato">
                                                                                            <i className="fas fa-file-import text-xs"></i>
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Alocações Column */}
                        {viewMode === 'lotacao' && (
                        <div className="flex-1 flex flex-col border border-gray-100 rounded-2xl bg-gray-50/30 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                                <h3 className="font-bold text-simas-dark flex items-center gap-2"><i className="fas fa-users text-simas-cyan"></i> Alocações ({filteredAlocacoes.length})</h3>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="relative flex-1 sm:w-48">
                                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                        <input 
                                            type="text" 
                                            placeholder="Buscar alocação..." 
                                            className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-simas-cyan focus:bg-white transition-all"
                                            value={alocacaoSearchTerm}
                                            onChange={(e) => setAlocacaoSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    {!isReadOnly && <Button onClick={() => setShowAlocacaoModal(true)}><i className="fas fa-plus"></i></Button>}
                                </div>
                            </div>
                            <div className="p-4 pt-6 flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 content-start">
                                {filteredAlocacoes.length === 0 ? (
                                    <p className="col-span-full text-gray-400 text-sm text-center py-8">Nenhuma alocação encontrada.</p>
                                ) : filteredAlocacoes.map((a: any) => {
                                    const nomeacaoAtiva = nomeacoes.find((n: any) => n.MATRICULA === a.MATRICULA && n.STATUS !== 'Inativo');
                                    const hasGraveIssue = a.servidor?.pessoa?.notas?.some((n: any) => n.GRAVISSIMO);

                                                                         return (
                                                                            <div key={a.ID_ALOCACAO} className={`p-4 rounded-xl shadow-sm border flex flex-col justify-between group hover:shadow-md transition-shadow ${hasGraveIssue ? 'border-red-200 border-l-[6px] border-l-red-600 bg-red-50 shadow-red-100/50' : 'bg-white border-gray-100'}`}>
                                                                                <div className="w-full mb-3">                                                {hasGraveIssue && (
                                                    <span className="inline-block bg-red-100 text-red-700 font-bold text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-red-200 w-max mb-2 shadow-sm">
                                                        <i className="fas fa-exclamation-triangle mr-1"></i> PROBLEMA GRAVE
                                                    </span>
                                                )}
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-sm text-simas-dark truncate">{a.NOME_PESSOA || a.MATRICULA}</p>
                                                        <p className="text-xs text-simas-cyan font-medium my-0.5 truncate">{a.NOME_FUNCAO || a.ID_FUNCAO}</p>
                                                        <p className="text-xs text-gray-400">Início: {validation.formatDate(a.DATA_INICIO)}</p>
                                                        {getActiveProtocol(a.servidor?.CPF) && (
                                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] font-black uppercase border border-purple-200">
                                                                    <i className="fas fa-clock"></i> {getActiveProtocol(a.servidor?.CPF).TIPO_DE_PROTOCOLO}
                                                                </span>
                                                                {hasActiveSubstitutableProtocol(a.servidor?.CPF) && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-black uppercase border border-red-200">
                                                                        <i className="fas fa-user-minus"></i> Ausente
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                        {!isReadOnly && (
                                                            <div className="flex gap-1 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={(e) => { e.stopPropagation(); setProtocoloData({ ...protocoloData, CPF: a.servidor?.CPF || '' }); setShowProtocoloModal(true); }} className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center bg-purple-50 text-purple-400 hover:text-purple-600 hover:bg-purple-100 transition-colors" title="Anexar Protocolo">
                                                                    <i className="fas fa-file-signature text-xs"></i>
                                                                </button>
                                                                <button 
                                                                    onClick={() => deleteAlocacao.mutate(a.ID_ALOCACAO)}
                                                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all text-xs bg-red-50 w-6 h-6 rounded flex items-center justify-center"
                                                                    title="Remover Alocação"
                                                                >
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </div>
                                                        )}
                                                </div>
                                            </div>

                                            {/* Informações da Nomeação Ativa */}
                                            <div className="mt-auto pt-3 border-t border-gray-50">
                                                    {nomeacaoAtiva ? (
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-simas-blue/10 text-simas-blue flex items-center justify-center shrink-0">
                                                                <i className="fas fa-award text-xs"></i>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-simas-dark">Cargo Comissionado</p>
                                                                <p className="text-[10px] text-gray-500">{nomeacaoAtiva.NOME_CARGO_COMISSIONADO || nomeacaoAtiva.ID_CARGO_COMISSIONADO}</p>
                                                                <p className="text-[10px] text-simas-cyan font-medium">Nomeado em: {validation.formatDate(nomeacaoAtiva.DATA_DA_NOMEACAO)}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-xs text-gray-400 italic">
                                                            <i className="fas fa-info-circle text-gray-300"></i> Sem cargo comissionado
                                                        </div>
                                                    )}
                                                </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: Nova Vaga */}
            {showVagaModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark">
                                Nova Vaga em {viewMode === 'lotacao' ? selectedLotacao?.LOTACAO : viewMode === 'edital' ? selectedLotacao?.EDITAL : selectedLotacao?.NOME_POSTO}
                            </h3>
                            <button onClick={() => setShowVagaModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateVaga} className="p-6 space-y-4">
                            {viewMode !== 'lotacao' && (
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Lotação</label>
                                    {isCoordination && (
                                        <button type="button" onClick={() => setShowCreateLotacaoModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                            + Criar Novo
                                        </button>
                                    )}
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setSelectionContext({
                                        active: true,
                                        entity: 'Lotacao',
                                        items: lotacoes,
                                        title: 'Selecionar Lotação',
                                        onSelect: (item) => {
                                            setVagaData({...vagaData, ID_LOTACAO: item.ID_LOTACAO, LOTACAO_NOME: item.LOTACAO});
                                            setSelectionContext(null);
                                        }
                                    })}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={vagaData.ID_LOTACAO ? 'text-simas-dark' : 'text-gray-400'}>
                                        {vagaData.ID_LOTACAO ? vagaData.LOTACAO_NOME : 'Selecione uma lotação...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            )}

                            {viewMode !== 'edital' && (
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Edital</label>
                                    {isCoordination && (
                                        <button type="button" onClick={() => setShowCreateEditalModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                            + Criar Novo
                                        </button>
                                    )}
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setSelectionContext({
                                        active: true,
                                        entity: 'Edital',
                                        items: editais.filter((e: any) => !isEditalExpired(e.ID_EDITAL)),
                                        title: 'Selecionar Edital',
                                        onSelect: (item) => {
                                            setVagaData({...vagaData, ID_EDITAL: item.ID_EDITAL, EDITAL_NOME: item.EDITAL});
                                            setSelectionContext(null);
                                        }
                                    })}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={vagaData.ID_EDITAL ? 'text-simas-dark' : 'text-gray-400'}>
                                        {vagaData.ID_EDITAL ? vagaData.EDITAL_NOME : 'Selecione um edital...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            )}

                            {viewMode !== 'posto' && (
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Posto de Trabalho</label>
                                    {isCoordination && (
                                        <button type="button" onClick={() => setShowCreatePostoModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                            + Criar Novo
                                        </button>
                                    )}
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setSelectionContext({
                                        active: true,
                                        entity: 'PostoTrabalho',
                                        items: postos,
                                        title: 'Selecionar Posto de Trabalho',
                                        onSelect: (item) => {
                                            setVagaData({...vagaData, ID_POSTO_TRABALHO: item.ID_POSTO_TRABALHO, POSTO_NOME: item.NOME_POSTO});
                                            setSelectionContext(null);
                                        }
                                    })}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={vagaData.ID_POSTO_TRABALHO ? 'text-simas-dark' : 'text-gray-400'}>
                                        {vagaData.ID_POSTO_TRABALHO ? vagaData.POSTO_NOME : 'Selecione um posto...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantidade de Vagas</label>
                                <input 
                                    type="number"
                                    min="1"
                                    max="100"
                                    required
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                    value={vagaData.QUANTIDADE}
                                    onChange={e => setVagaData({...vagaData, QUANTIDADE: parseInt(e.target.value) || 1})}
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Gera múltiplas vagas idênticas de uma vez.</p>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer pt-2">
                                <input 
                                    type="checkbox" 
                                    className="w-4 h-4 text-simas-cyan rounded border-gray-300 focus:ring-simas-cyan"
                                    checked={vagaData.BLOQUEADA}
                                    onChange={e => setVagaData({...vagaData, BLOQUEADA: e.target.checked})}
                                />
                                <span className="text-sm font-bold text-gray-600">Vaga inicialmente bloqueada</span>
                            </label>
                            <div className="pt-4 flex gap-2">
                                <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowVagaModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createVaga.isPending} className="flex-1 justify-center">Salvar</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Nova Alocação */}
            {showAlocacaoModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark">Nova Alocação em {selectedLotacao?.LOTACAO}</h3>
                            <button onClick={() => setShowAlocacaoModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateAlocacao} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Servidor (Matrícula)</label>
                                <button 
                                    type="button"
                                    onClick={() => setSelectionContext({
                                        active: true,
                                        entity: 'Servidor',
                                        items: servidores,
                                        title: 'Selecionar Servidor',
                                        onSelect: (item) => {
                                            setAlocacaoData({...alocacaoData, MATRICULA: item.MATRICULA, NOME_SERVIDOR: item.NOME_PESSOA || item.MATRICULA});
                                            setSelectionContext(null);
                                        }
                                    })}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={alocacaoData.MATRICULA ? 'text-simas-dark' : 'text-gray-400'}>
                                        {alocacaoData.MATRICULA ? `${alocacaoData.NOME_SERVIDOR} (${alocacaoData.MATRICULA})` : 'Selecione o servidor...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Função</label>
                                    {isCoordination && (
                                        <button type="button" onClick={() => setShowCreateFuncaoModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                            + Criar Nova
                                        </button>
                                    )}
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setSelectionContext({
                                        active: true,
                                        entity: 'Funcao',
                                        items: funcoes,
                                        title: 'Selecionar Função',
                                        onSelect: (item) => {
                                            setAlocacaoData({...alocacaoData, ID_FUNCAO: item.ID_FUNCAO, NOME_FUNCAO: item.FUNCAO});
                                            setSelectionContext(null);
                                        }
                                    })}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={alocacaoData.ID_FUNCAO ? 'text-simas-dark' : 'text-gray-400'}>
                                        {alocacaoData.ID_FUNCAO ? alocacaoData.NOME_FUNCAO : 'Selecione a função...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data de Início</label>
                                <input 
                                    type="date"
                                    required
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-simas-cyan focus:bg-white"
                                    value={alocacaoData.DATA_INICIO}
                                    onChange={e => setAlocacaoData({...alocacaoData, DATA_INICIO: e.target.value})}
                                />
                            </div>
                            <div className="pt-4 flex gap-2">
                                <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowAlocacaoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createAlocacao.isPending} className="flex-1 justify-center">Salvar</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Nova Vinculação */}
            {showCreateVinculacaoModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight">Cadastrar Nova Vinculação</h3>
                            <button onClick={() => setShowCreateVinculacaoModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateVinculacao} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome da Vinculação</label>
                                <input
                                    type="text" required placeholder="Ex: SUBAS"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                    value={newVinculacaoData.NOME} onChange={e => setNewVinculacaoData({...newVinculacaoData, NOME: e.target.value})}
                                />
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100 mt-2">
                                <div className="col-span-full">
                                    <h4 className="text-[10px] font-black text-simas-cyan uppercase tracking-widest flex items-center gap-2 mb-1">
                                        <i className="fas fa-bullseye"></i> Metas e Cotas
                                    </h4>
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Meta Vagas (Qtd/%)</label>
                                    <input type="number" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newVinculacaoData.META_OCUPACAO} onChange={e => setNewVinculacaoData({...newVinculacaoData, META_OCUPACAO: e.target.value})} placeholder="Ex: 100" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Satisfatório (%)</label>
                                    <input type="number" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newVinculacaoData.NIVEL_SATISFATORIO} onChange={e => setNewVinculacaoData({...newVinculacaoData, NIVEL_SATISFATORIO: e.target.value})} placeholder="Ex: 85" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cota PCD (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newVinculacaoData.COTA_PCD} onChange={e => setNewVinculacaoData({...newVinculacaoData, COTA_PCD: e.target.value})} placeholder="Ex: 5" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cota Afro (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newVinculacaoData.COTA_AFRO} onChange={e => setNewVinculacaoData({...newVinculacaoData, COTA_AFRO: e.target.value})} placeholder="Ex: 20" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Assistência (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newVinculacaoData.COTA_ASSISTENCIA} onChange={e => setNewVinculacaoData({...newVinculacaoData, COTA_ASSISTENCIA: e.target.value})} placeholder="Ex: 2" />
                                </div>
                            </div>

                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateVinculacaoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createVinculacao.isPending} className="flex-1 py-3">Criar Vinculação</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Nova Lotação */}
            {showCreateLotacaoModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight">Cadastrar Nova Lotação</h3>
                            <button onClick={() => setShowCreateLotacaoModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateLotacao} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome da Lotação</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="Ex: CRAS Zumbi dos Palmares"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newLotacaoData.LOTACAO}
                                        onChange={e => setNewLotacaoData({...newLotacaoData, LOTACAO: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-full mt-2">
                                    <h4 className="text-[10px] font-black text-simas-cyan uppercase tracking-widest flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                                        <i className="fas fa-sitemap"></i> Estrutura Organizacional
                                    </h4>
                                    <label className="flex items-center gap-2 cursor-pointer w-max mb-3">
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only" checked={newLotacaoData.EH_SETOR} onChange={e => setNewLotacaoData({...newLotacaoData, EH_SETOR: e.target.checked})} />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${newLotacaoData.EH_SETOR ? 'bg-simas-cyan' : 'bg-gray-300'}`}></div>
                                            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${newLotacaoData.EH_SETOR ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">Esta lotação é um Setor de outra?</span>
                                    </label>
                                    
                                    {newLotacaoData.EH_SETOR && (
                                        <div className="mb-3">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pertence à Lotação:</label>
                                            <button
                                                type="button"
                                                onClick={() => setSelectionContext({
                                                    active: true,
                                                    entity: 'Lotacao',
                                                    items: lotacoes,
                                                    title: 'Selecionar Lotação Pai',
                                                    onSelect: (item) => setNewLotacaoData({...newLotacaoData, ID_LOTACAO_PAI: item.ID_LOTACAO})
                                                })}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-left flex justify-between items-center hover:border-simas-cyan transition-all"
                                            >
                                                <span className={newLotacaoData.ID_LOTACAO_PAI ? 'text-simas-dark' : 'text-gray-400'}>
                                                    {newLotacaoData.ID_LOTACAO_PAI ? lotacoes.find((l: any) => l.ID_LOTACAO === newLotacaoData.ID_LOTACAO_PAI)?.LOTACAO : 'Clique para buscar lotação...'}
                                                </span>
                                                <i className="fas fa-search text-gray-300"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-full mt-2">
                                    <h4 className="text-[10px] font-black text-simas-cyan uppercase tracking-widest flex items-center gap-2 mb-2 pb-1 border-b border-gray-100">
                                        <i className="fas fa-map-marker-alt"></i> Endereço e Localização
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div className="relative">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">CEP</label>
                                            <input type="text" className="w-full p-2 pr-10 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.CEP} onChange={e => setNewLotacaoData({...newLotacaoData, CEP: e.target.value})} onBlur={handleSearchCepLotacao} placeholder="00000-000" />
                                            {isSearchingCep && <i className="fas fa-spinner fa-spin absolute right-3 top-8 text-simas-cyan"></i>}
                                        </div>
                                        <div className="md:col-span-2 relative">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Endereço</label>
                                            <input type="text" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.ENDERECO} onChange={e => setNewLotacaoData({...newLotacaoData, ENDERECO: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Número</label>
                                            <input type="text" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.NUMERO} onChange={e => setNewLotacaoData({...newLotacaoData, NUMERO: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Complemento</label>
                                            <input type="text" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.COMPLEMENTO} onChange={e => setNewLotacaoData({...newLotacaoData, COMPLEMENTO: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bairro</label>
                                            <input type="text" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.BAIRRO} onChange={e => setNewLotacaoData({...newLotacaoData, BAIRRO: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cidade</label>
                                            <input type="text" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.CIDADE} onChange={e => setNewLotacaoData({...newLotacaoData, CIDADE: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estado</label>
                                            <input type="text" className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" value={newLotacaoData.ESTADO} onChange={e => setNewLotacaoData({...newLotacaoData, ESTADO: e.target.value})} />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Complexidade</label>
                                    <select 
                                        required
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all appearance-none"
                                        value={newLotacaoData.COMPLEXIDADE}
                                        onChange={e => setNewLotacaoData({...newLotacaoData, COMPLEXIDADE: e.target.value})}
                                    >
                                        <option value="">Selecione...</option>
                                        <option value="ALTA">ALTA</option>
                                        <option value="MÉDIA">MÉDIA</option>
                                        <option value="BÁSICA">BÁSICA</option>
                                        <option value="NSA">NSA</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Vinculação</label>
                                        <button type="button" onClick={() => setShowCreateVinculacaoModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                            + Criar Novo
                                        </button>
                                    </div>
                                    <select
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all appearance-none"
                                        value={newLotacaoData.ID_VINCULACAO}
                                        onChange={e => setNewLotacaoData({...newLotacaoData, ID_VINCULACAO: e.target.value})}
                                    >
                                        <option value="">Selecione...</option>
                                        {vinculacoes.map((v: any) => (
                                            <option key={v.ID_VINCULACAO} value={v.ID_VINCULACAO}>{v.NOME}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Tipo</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: CRAS"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newLotacaoData.TIPO_DA_LOTACAO}
                                        onChange={e => setNewLotacaoData({...newLotacaoData, TIPO_DA_LOTACAO: e.target.value})}
                                    />
                                </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100 mt-2">
                                <div className="col-span-full">
                                    <h4 className="text-[10px] font-black text-simas-cyan uppercase tracking-widest flex items-center gap-2 mb-1">
                                        <i className="fas fa-bullseye"></i> Metas e Cotas
                                    </h4>
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Meta Vagas (Qtd/%)</label>
                                    <input type="number" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newLotacaoData.META_OCUPACAO} onChange={e => setNewLotacaoData({...newLotacaoData, META_OCUPACAO: e.target.value})} placeholder="Ex: 100" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Satisfatório (%)</label>
                                    <input type="number" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newLotacaoData.NIVEL_SATISFATORIO} onChange={e => setNewLotacaoData({...newLotacaoData, NIVEL_SATISFATORIO: e.target.value})} placeholder="Ex: 85" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cota PCD (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newLotacaoData.COTA_PCD} onChange={e => setNewLotacaoData({...newLotacaoData, COTA_PCD: e.target.value})} placeholder="Ex: 5" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cota Afro (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newLotacaoData.COTA_AFRO} onChange={e => setNewLotacaoData({...newLotacaoData, COTA_AFRO: e.target.value})} placeholder="Ex: 20" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Assistência (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newLotacaoData.COTA_ASSISTENCIA} onChange={e => setNewLotacaoData({...newLotacaoData, COTA_ASSISTENCIA: e.target.value})} placeholder="Ex: 2" />
                                </div>
                            </div>

                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateLotacaoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createLotacao.isPending} className="flex-1 py-3">Criar Lotação</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Universal Selection for FKs */}
            {selectionContext && selectionContext.active && (
                <SelectionModal
                    entity={selectionContext.entity}
                    items={selectionContext.items}
                    title={selectionContext.title}
                    onSelect={selectionContext.onSelect}
                    onClose={() => setSelectionContext(null)}
                />
            )}

            {/* Modal: Novo Edital */}
            {showCreateEditalModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight">Cadastrar Novo Edital</h3>
                            <button onClick={() => setShowCreateEditalModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateEdital} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="col-span-full">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome do Edital</label>
                                    <input 
                                        type="text" required placeholder="Ex: Edital SEDP 2024"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newEditalData.EDITAL} onChange={e => setNewEditalData({...newEditalData, EDITAL: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Processo</label>
                                    <input 
                                        type="text" placeholder="Ex: 14/000/123/2024"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newEditalData.PROCESSO} onChange={e => setNewEditalData({...newEditalData, PROCESSO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Número</label>
                                    <input 
                                        type="text" placeholder="Ex: 01/2024"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newEditalData.NUMERO} onChange={e => setNewEditalData({...newEditalData, NUMERO: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-full">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Cogestora</label>
                                    <select 
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all appearance-none"
                                        value={newEditalData.ID_COGESTORA} onChange={e => setNewEditalData({...newEditalData, ID_COGESTORA: e.target.value})}
                                    >
                                        <option value="">Selecione...</option>
                                        {cogestoras.map((c: any) => <option key={c.ID_COGESTORA} value={c.ID_COGESTORA}>{c.NOME}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Data de Início</label>
                                    <input 
                                        type="date"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newEditalData.INICIO} onChange={e => setNewEditalData({...newEditalData, INICIO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Data de Término</label>
                                    <input 
                                        type="date"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newEditalData.TERMINO} onChange={e => setNewEditalData({...newEditalData, TERMINO: e.target.value})}
                                    />
                                </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100 mt-2">
                                <div className="col-span-full">
                                    <h4 className="text-[10px] font-black text-simas-cyan uppercase tracking-widest flex items-center gap-2 mb-1">
                                        <i className="fas fa-bullseye"></i> Metas e Cotas
                                    </h4>
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Meta Vagas (Qtd/%)</label>
                                    <input type="number" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newEditalData.META_OCUPACAO} onChange={e => setNewEditalData({...newEditalData, META_OCUPACAO: e.target.value})} placeholder="Ex: 100" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Satisfatório (%)</label>
                                    <input type="number" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newEditalData.NIVEL_SATISFATORIO} onChange={e => setNewEditalData({...newEditalData, NIVEL_SATISFATORIO: e.target.value})} placeholder="Ex: 85" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cota PCD (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newEditalData.COTA_PCD} onChange={e => setNewEditalData({...newEditalData, COTA_PCD: e.target.value})} placeholder="Ex: 5" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cota Afro (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newEditalData.COTA_AFRO} onChange={e => setNewEditalData({...newEditalData, COTA_AFRO: e.target.value})} placeholder="Ex: 20" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Assistência (%)</label>
                                    <input type="number" step="0.1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 outline-none focus:border-simas-cyan focus:bg-white transition-all" value={newEditalData.COTA_ASSISTENCIA} onChange={e => setNewEditalData({...newEditalData, COTA_ASSISTENCIA: e.target.value})} placeholder="Ex: 2" />
                                </div>
                            </div>

                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateEditalModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createEdital.isPending} className="flex-1 py-3">Criar Edital</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Novo Posto */}
            {showCreatePostoModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight">Cadastrar Novo Posto de Trabalho</h3>
                            <button onClick={() => setShowCreatePostoModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreatePosto} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome do Posto</label>
                                <input 
                                    type="text" required placeholder="Ex: Assistente Social"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                    value={newPostoData.NOME_POSTO} onChange={e => setNewPostoData({...newPostoData, NOME_POSTO: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Escolaridade do Posto</label>
                                <select 
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all appearance-none"
                                    value={newPostoData.ESCOLARIDADE} onChange={e => setNewPostoData({...newPostoData, ESCOLARIDADE: e.target.value})}
                                >
                                    <option value="">Selecione...</option>
                                    {(DROPDOWN_OPTIONS.ESCOLARIDADE_POSTO as string[]).map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Salário</label>
                                <input 
                                    type="number" step="0.01" required placeholder="Ex: 3500.00"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                    value={newPostoData.SALARIO} onChange={e => setNewPostoData({...newPostoData, SALARIO: e.target.value})}
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreatePostoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createPosto.isPending} className="flex-1 py-3">Criar Posto</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Preencher Vaga */}
            {showFillVagaModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark">Preencher Vaga</h3>
                            <button onClick={() => setShowFillVagaModal(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleFillVaga} className="p-6 space-y-4">
                            <div>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase">Pessoa</label>
                                                                    <button type="button" onClick={() => setShowCreatePessoaModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                                                        + Criar Nova
                                                                    </button>
                                                                </div>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const pessoasCondizentes = pessoas.filter((p: any) => {
                                            const check = businessLogic.checkEscolaridade(p.ESCOLARIDADE, fillVagaData.POSTO_ESCOLARIDADE);
                                            return check.condiz;
                                        });
                                        setSelectionContext({
                                            active: true,
                                            entity: 'Pessoa',
                                            items: pessoasCondizentes,
                                            title: 'Selecionar Pessoa',
                                            onSelect: (item) => {
                                                if (item.IS_TEMP) {
                                                    setFillVagaData({...fillVagaData, CPF: '', NOME_PESSOA: item.NOME});
                                                } else {
                                                    setFillVagaData({...fillVagaData, CPF: item.CPF, NOME_PESSOA: item.NOME});
                                                }
                                                setSelectionContext(null);
                                            }
                                        });
                                    }}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={fillVagaData.NOME_PESSOA ? 'text-simas-dark' : 'text-gray-400'}>
                                        {fillVagaData.NOME_PESSOA ? `${fillVagaData.NOME_PESSOA} (${fillVagaData.IS_TEMP ? 'Temp' : 'Validada'})` : 'Selecione a pessoa...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Função</label>
                                    {isCoordination && (
                                        <button type="button" onClick={() => setShowCreateFuncaoModal(true)} className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider">
                                            + Criar Nova
                                        </button>
                                    )}
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setSelectionContext({
                                        active: true,
                                        entity: 'Funcao',
                                        items: funcoes,
                                        title: 'Selecionar Função',
                                        onSelect: (item) => {
                                            setFillVagaData({...fillVagaData, ID_FUNCAO: item.ID_FUNCAO, NOME_FUNCAO: item.FUNCAO});
                                            setSelectionContext(null);
                                        }
                                    })}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all flex justify-between items-center"
                                >
                                    <span className={fillVagaData.ID_FUNCAO ? 'text-simas-dark' : 'text-gray-400'}>
                                        {fillVagaData.ID_FUNCAO ? fillVagaData.NOME_FUNCAO : 'Selecione a função...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data de Início (Contrato)</label>
                                <input 
                                    type="date"
                                    required
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-simas-cyan focus:bg-white"
                                    value={fillVagaData.DATA_DO_CONTRATO}
                                    onChange={e => setFillVagaData({...fillVagaData, DATA_DO_CONTRATO: e.target.value})}
                                />
                            </div>
                            <div className="pt-4 flex gap-2">
                                <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={() => setShowFillVagaModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createContrato.isPending} className="flex-1 justify-center" disabled={!fillVagaData.ID_FUNCAO || (!fillVagaData.CPF)}>Preencher</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

                        {/* Modal: Nova Função */}
            {showCreateFuncaoModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight">Cadastrar Nova Função</h3>
                            <button onClick={() => setShowCreateFuncaoModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateFuncao} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Nome da Função</label>
                                <input 
                                    type="text" required placeholder="Ex: Assistente Social"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                    value={newFuncaoData.FUNCAO} onChange={e => setNewFuncaoData({...newFuncaoData, FUNCAO: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">CBO (Opcional)</label>
                                <input 
                                    type="text" placeholder="0000-00"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                    value={newFuncaoData.CBO} onChange={e => setNewFuncaoData({...newFuncaoData, CBO: validation.maskCBO(e.target.value)})}
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateFuncaoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createFuncao.isPending} className="flex-1 py-3">Criar Função</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Anexar Protocolo */}
            {showProtocoloModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-purple-100 flex justify-between items-center bg-purple-50">
                            <h3 className="font-bold text-purple-900 uppercase tracking-tight flex items-center gap-2">
                                <i className="fas fa-file-signature text-purple-500"></i> Anexar Protocolo
                            </h3>
                            <button onClick={() => setShowProtocoloModal(false)} className="text-purple-400 hover:text-purple-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateProtocolo} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">CPF Associado</label>
                                <input 
                                    type="text" disabled
                                    className="w-full p-3 bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-500 outline-none"
                                    value={validation.formatCPF(protocoloData.CPF)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Protocolo</label>
                                <select 
                                    required
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-purple-400 focus:bg-white focus:ring-1 focus:ring-purple-400 transition-all"
                                    value={protocoloData.TIPO_DE_PROTOCOLO} 
                                    onChange={e => setProtocoloData({...protocoloData, TIPO_DE_PROTOCOLO: e.target.value})}
                                >
                                    <option value="">Selecione um tipo...</option>
                                    {((DROPDOWN_OPTIONS.Protocolo as any).TIPO_DE_PROTOCOLO as string[]).map((opt: string) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                                {['Licença Médica por Atestado', 'Falta'].includes(protocoloData.TIPO_DE_PROTOCOLO) && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex gap-2">
                                        <i className="fas fa-exclamation-triangle mt-0.5"></i>
                                        <span>Atenção: O registro de <strong>{protocoloData.TIPO_DE_PROTOCOLO}</strong> requer atenção. Fique alerta à reincidência deste servidor.</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Início do Prazo</label>
                                    <input 
                                        type="date"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-purple-400 focus:bg-white focus:ring-1 focus:ring-purple-400 transition-all"
                                        value={protocoloData.INICIO_PRAZO} 
                                        onChange={e => setProtocoloData({...protocoloData, INICIO_PRAZO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Término do Prazo</label>
                                    <input 
                                        type="date"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-purple-400 focus:bg-white focus:ring-1 focus:ring-purple-400 transition-all"
                                        value={protocoloData.TERMINO_PRAZO} 
                                        onChange={e => setProtocoloData({...protocoloData, TERMINO_PRAZO: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowProtocoloModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createProtocolo.isPending} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700">Anexar Protocolo</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Adicionar Substituto */}
            {showCreateSubstitutoModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-green-100 flex justify-between items-center bg-green-50">
                            <h3 className="font-bold text-green-900 uppercase tracking-tight flex items-center gap-2">
                                <i className="fas fa-user-plus text-green-500"></i> Adicionar Substituto
                            </h3>
                            <button onClick={() => setShowCreateSubstitutoModal(false)} className="text-green-400 hover:text-green-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form onSubmit={handleCreateSubstituto} className="p-6 space-y-4">
                            <div>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <label className="block text-xs font-bold text-gray-500 uppercase">Pessoa Substituta</label>
                                                                    <button type="button" onClick={() => setShowCreatePessoaModal(true)} className="text-[10px] font-bold text-green-600 hover:text-green-800 uppercase tracking-wider">
                                                                        + Criar Nova
                                                                    </button>
                                                                </div>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const pessoasElegiveis = pessoas.filter((p: any) => {
                                            const temContrato = contratos.some((c: any) => c.CPF === p.CPF);
                                            const isServidor = servidores.some((s: any) => s.CPF === p.CPF);
                                            return !temContrato && !isServidor;
                                        });
                                        setSelectionContext({
                                            active: true,
                                            entity: 'Pessoa',
                                            items: pessoasElegiveis,
                                            title: 'Selecionar Pessoa Substituta',
                                            onSelect: (item) => {
                                                if (item.IS_TEMP) {
                                                    setSubstitutoData({...substitutoData, CPF: '', NOME_PESSOA: item.NOME});
                                                } else {
                                                    setSubstitutoData({...substitutoData, CPF: item.CPF, NOME_PESSOA: item.NOME});
                                                }
                                                setSelectionContext(null);
                                            }
                                        });
                                    }}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-left outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all flex justify-between items-center"
                                >
                                    <span className={substitutoData.NOME_PESSOA ? 'text-simas-dark' : 'text-gray-400'}>
                                        {substitutoData.NOME_PESSOA ? substitutoData.NOME_PESSOA : 'Selecione a pessoa...'}
                                    </span>
                                    <i className="fas fa-chevron-right text-gray-400 text-xs"></i>
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Entrada</label>
                                    <input 
                                        type="date" required
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-green-500 focus:bg-white focus:ring-1 focus:ring-green-500 transition-all"
                                        value={substitutoData.DATA_ENTRADA} 
                                        onChange={e => setSubstitutoData({...substitutoData, DATA_ENTRADA: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Saída</label>
                                    <input 
                                        type="date" required
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-green-500 focus:bg-white focus:ring-1 focus:ring-green-500 transition-all"
                                        value={substitutoData.DATA_SAIDA} 
                                        onChange={e => setSubstitutoData({...substitutoData, DATA_SAIDA: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateSubstitutoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createSubstituto.isPending} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white">Adicionar Substituto</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}



            {dossierCpf && <DossierModal cpf={dossierCpf} onClose={() => setDossierCpf(null)} />}

            {showCreatePessoaModal && (
                <CreatePessoaModal 
                    showToast={showToast}
                    onClose={() => setShowCreatePessoaModal(false)}
                    onSuccess={(novaPessoa) => {
                        setShowCreatePessoaModal(false);
                        // Optional: auto-select the new person if one of the selection modals is open
                        if (showFillVagaModal) {
                            setFillVagaData({ ...fillVagaData, CPF: novaPessoa.CPF, NOME_PESSOA: novaPessoa.NOME });
                        } else if (showCreateSubstitutoModal) {
                            setSubstitutoData({ ...substitutoData, CPF: novaPessoa.CPF, NOME_PESSOA: novaPessoa.NOME });
                        }
                    }}
                />
            )}

            {itemToDelete && (
                <ConfirmModal 
                    title={itemToDelete.entity === 'Contrato' ? "Confirmar Encerramento de Contrato" : "Confirmar Ação"} 
                    message={itemToDelete.entity === 'Contrato' 
                        ? "Deseja encerrar e arquivar este contrato?" 
                        : "Tem certeza que deseja processar esta ação?"
                    }
                    onConfirm={handleConfirmDelete} 
                    onCancel={() => setItemToDelete(null)}
                >
                    {itemToDelete.entity === 'Contrato' && (
                        <div className="mt-4">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo do Encerramento <span className="text-red-500">*</span></label>
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
            
                        {/* TIMELINE DA VAGA MODAL */}
                        {timelineVagaId && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setTimelineVagaId(null)}>
                                <div 
                                    className="bg-white w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden animate-slide-in flex flex-col border border-gray-100"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                                        <div>
                                            <h3 className="font-black text-simas-dark text-lg uppercase tracking-tight flex items-center gap-2">
                                                <i className="fas fa-history text-simas-cyan"></i> Dossiê da Vaga
                                            </h3>
                                            <p className="text-xs text-gray-500 mt-0.5">{timelineVagaId}</p>
                                        </div>
                                        <button onClick={() => setTimelineVagaId(null)} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors flex items-center justify-center shadow-sm">
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </header>
            
                                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30 custom-scrollbar relative">
                                        {loadingTimeline ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
                                                <div className="w-10 h-10 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin"></div>
                                                <p className="text-simas-cyan font-bold mt-4 animate-pulse uppercase tracking-wider text-xs">Montando Linha do Tempo...</p>
                                            </div>
                                        ) : !timelineData ? (
                                            <div className="h-full flex items-center justify-center text-gray-400 italic">
                                                Falha ao carregar a linha do tempo.
                                            </div>
                                        ) : (
                                            <div className="max-w-xl mx-auto py-4">
                                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-8 flex flex-col items-center text-center">
                                                    <h4 className="font-black text-simas-dark text-xl">{timelineData.vaga?.postoTrabalho?.NOME_POSTO}</h4>
                                                    <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mt-1">{timelineData.vaga?.lotacao?.LOTACAO}</p>
                                                    <div className="mt-3 flex gap-2">
                                                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">{timelineData.vaga?.edital?.EDITAL}</span>
                                                        {timelineData.vaga?.BLOQUEADA && <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Bloqueada</span>}
                                                    </div>
                                                </div>
            
                                                {timelineData.events?.length === 0 ? (
                                                    <p className="text-center text-gray-400 italic">Nenhum evento registrado nesta vaga.</p>
                                                ) : (
                                                    <div className="relative pl-6 border-l-2 border-gray-200 space-y-8 pb-10">
                                                        {timelineData.events.map((event: any, idx: number) => {
                                                            let icon = 'fa-circle';
                                                            let color = 'text-gray-400';
                                                            let bgColor = 'bg-white';
                                                            
                                                            if (event.type === 'CONTRATO_ATUAL' || event.type === 'CONTRATO_HISTORICO_INICIO') {
                                                                icon = 'fa-check';
                                                                color = 'text-simas-cyan';
                                                                bgColor = 'bg-simas-cyan/10';
                                                            } else if (event.type === 'CONTRATO_HISTORICO_FIM') {
                                                                icon = 'fa-door-open';
                                                                color = 'text-red-400';
                                                                bgColor = 'bg-red-50';
                                                            } else if (event.type.startsWith('SUBSTITUICAO')) {
                                                                icon = 'fa-exchange-alt';
                                                                color = 'text-green-500';
                                                                bgColor = 'bg-green-50';
                                                            } else if (event.type === 'PROTOCOLO') {
                                                                icon = 'fa-file-signature';
                                                                color = 'text-purple-500';
                                                                bgColor = 'bg-purple-50';
                                                            }
            
                                                            return (
                                                                <div key={idx} className="relative animate-fade-in group">
                                                                    <div className={`absolute -left-[35px] w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${bgColor} ${color} group-hover:scale-110 transition-transform`}>
                                                                        <i className={`fas ${icon} text-[10px]`}></i>
                                                                    </div>
                                                                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-gray-300 transition-colors">
                                                                        <div className="flex justify-between items-start mb-2">
                                                                            <h5 className={`font-bold text-sm ${color}`}>{event.title}</h5>
                                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg">
                                                                                {new Date(event.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-sm text-gray-700 leading-snug">{event.description}</p>
                                                                        {event.cpf && (
                                                                            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                                                                                 <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded">
                                                                                    {event.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "            .$2.$3-$4")}
                                                                                 </span>
                                                                                 <button 
                                                                                    onClick={() => setDossierCpf(event.cpf)}
                                                                                    className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider flex items-center gap-1"
                                                                                 >
                                                                                    Ver Dossiê <i className="fas fa-arrow-right"></i>
                                                                                 </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            };
