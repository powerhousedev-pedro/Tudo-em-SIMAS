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

export const AcompanhamentoPanel: React.FC<{ showToast: (type: 'success'|'error'|'info', msg: string) => void }> = ({ showToast }) => {
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
    const { data: vinculacoes = [] } = useEntityData('Vinculacao');
    const { data: servidores = [] } = useEntityData('Servidor');
    const { data: funcoes = [] } = useEntityData('Funcao');
    const { data: pessoas = [] } = useEntityData('Pessoa', '', { mergeTemp: 'true' });

    // Filtragem de Editais e Vagas vigentes
    const hojeDate = new Date();
    hojeDate.setHours(0,0,0,0);
    const editais = editaisData.filter((e: any) => !e.TERMINO || new Date(e.TERMINO) >= hojeDate);
    const editaisVigentesIds = editais.map((e: any) => e.ID_EDITAL);
    const vagas = vagasData.filter((v: any) => !v.ID_EDITAL || editaisVigentesIds.includes(v.ID_EDITAL));

    const [selectedLotacao, setSelectedLotacao] = useState<any>(null);
    const [showVagaModal, setShowVagaModal] = useState(false);
    const [showAlocacaoModal, setShowAlocacaoModal] = useState(false);
    const [showCreateLotacaoModal, setShowCreateLotacaoModal] = useState(false);
    const [showCreateEditalModal, setShowCreateEditalModal] = useState(false);
    const [showCreateVinculacaoModal, setShowCreateVinculacaoModal] = useState(false);
    const [showAmostragemModal, setShowAmostragemModal] = useState(false);
    const [amostragemResult, setAmostragemResult] = useState<any[]>([]);
    const [amostragemData, setAmostragemData] = useState<{ idAmostragem: string, validacao: any, lancamentos: any[] } | null>(null);
    const [validacaoForm, setValidacaoForm] = useState({ validada: false, justificativa: '' });
    const [isGeneratingAmostragem, setIsGeneratingAmostragem] = useState(false);
    const [showCreatePostoModal, setShowCreatePostoModal] = useState(false);
    const [showFillVagaModal, setShowFillVagaModal] = useState(false);
        const [showCreateFuncaoModal, setShowCreateFuncaoModal] = useState(false);
    const [showProtocoloModal, setShowProtocoloModal] = useState(false);
    const [showCreateSubstitutoModal, setShowCreateSubstitutoModal] = useState(false);
    
    const [invalidAmostragens, setInvalidAmostragens] = useState<string[]>([]);
    const fetchInvalidAmostragens = async () => {
        try {
            const res: any = await api.getInvalidAmostragens();
            if (res.success) setInvalidAmostragens(res.origens);
        } catch (e) {
            console.error(e);
        }
    };
    useEffect(() => {
        fetchInvalidAmostragens();
    }, []);

    const [timeline, setTimeline] = useState<any[]>([]);
    const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
    const [timelineOrientation, setTimelineOrientation] = useState<'vertical' | 'horizontal'>('horizontal');
    const [timelineFilterType, setTimelineFilterType] = useState('todos');
    const [timelineFilterIncType, setTimelineFilterIncType] = useState('todos');
    const [inconformidadeForm, setInconformidadeForm] = useState({ tipo: "Administrativa", motivo: "", resolvido: false, idProcesso: "", idAmostragemVinculada: "", idLotacao: "", idEdital: "" });
    const [isCreatingInconformidade, setIsCreatingInconformidade] = useState(false);
    const [showCreateInconformidadeModal, setShowCreateInconformidadeModal] = useState(false);
    const [showCreateProcessoModal, setShowCreateProcessoModal] = useState(false);

    const [showProcessoModal, setShowProcessoModal] = useState(false);
    const [selectedProcessoId, setSelectedProcessoId] = useState<string>('');
    const [processoData, setProcessoData] = useState<any>({ NUMERO: '', TITULO: '', STATUS_ENCAMINHAMENTO: '', TEXTO_LEGENDA: '', DATA_PUBLICACAO: '', editais: [], lotacoes: [] });
    const [isLoadingProcesso, setIsLoadingProcesso] = useState(false);
    const [processoChain, setProcessoChain] = useState<any[]>([]);
    const [showProcessoChainForm, setShowProcessoChainForm] = useState(false);

    const [showInconformidadeModal, setShowInconformidadeModal] = useState(false);
    const [showChainForm, setShowChainForm] = useState(false);
    const [selectedInconformidade, setSelectedInconformidade] = useState<any>(null);
    const [inconformidadeChain, setInconformidadeChain] = useState<any[]>([]);

    const handleOpenProcesso = async (numero: string) => {
        if (!numero) return;
        setSelectedProcessoId(numero);
        setProcessoData({ NUMERO: numero, TITULO: '', STATUS_ENCAMINHAMENTO: '', TEXTO_LEGENDA: '', DATA_PUBLICACAO: '', editais: [], lotacoes: [], resolvido: false });
        setShowProcessoModal(true);
        setIsLoadingProcesso(true);
        setShowProcessoChainForm(false);
        try {
            const res: any = await api.getProcesso(numero);
            if (res && res.success && res.processo) {
                setProcessoData({ ...res.processo, resolvido: res.processo.RESOLVIDO });
            }
            const resChain: any = await api.getAllProcessos();
            if (resChain && resChain.success) {
                setProcessoChain(resChain.processos);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingProcesso(false);
        }
    };

    const handleSaveProcesso = async (e: any, chainId?: string) => {
        if (e && e.preventDefault) e.preventDefault();
        try {
            const payload = { ...processoData, chain: chainId || null };
            
            // Atribuição de Lotação (múltipla)
            let lotacaoIds = processoData.lotacoes?.map((l:any) => l.ID_LOTACAO) || [];
            if (viewMode === 'lotacao' && selectedLotacao && !lotacaoIds.includes(selectedLotacao.ID_LOTACAO)) {
                lotacaoIds.push(selectedLotacao.ID_LOTACAO);
            }
            if (lotacaoIds.length > 0) payload.idLotacao = lotacaoIds;
            
            // Atribuição de Edital (múltipla e obrigatória)
            let editalIds = processoData.editais?.map((ed:any) => ed.ID_EDITAL) || [];
            if (viewMode === 'edital' && selectedLotacao && !editalIds.includes(selectedLotacao.ID_EDITAL)) {
                editalIds.push(selectedLotacao.ID_EDITAL);
            }
            if (editalIds.length === 0) {
                return showToast('error', 'É obrigatório vincular o Processo a pelo menos um Edital.');
            }
            payload.idEdital = editalIds;

            const res: any = await api.saveProcesso(payload);
            if (res && res.success) {
                // assume showToast is present (it is in the component)
                if (!chainId) {
                    setShowProcessoModal(false);
                }
                fetchTimeline(); 
                
                // Atribui o número do processo SEI ao form de inconformidade
                if (showCreateProcessoModal) {
                    setInconformidadeForm(prev => ({ ...prev, idProcesso: res.processo.NUMERO }));
                    setShowCreateProcessoModal(false);
                }
                
                if (chainId) {
                    handleOpenProcesso(res.processo.NUMERO);
                }
            }
        } catch (e: any) {
            console.error(e);
            showToast('error', e.message || 'Erro ao salvar processo');
        }
    };

    const handleOpenInconformidade = async (inc: any) => {
        setSelectedInconformidade(inc);
        setShowInconformidadeModal(true);
        setShowChainForm(false);
        try {
            const origemId = viewMode === 'lotacao' ? selectedLotacao.ID_LOTACAO : viewMode === 'edital' ? selectedLotacao.ID_EDITAL : viewMode === 'cogestora' ? selectedLotacao.ID_COGESTORA : selectedLotacao.ID_VINCULACAO;
            const res: any = await api.getInconformidades(origemId);
            if (res && res.success) {
                setInconformidadeChain(res.inconformidades);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateInconformidade = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInconformidade) return;
        try {
            const res: any = await api.updateInconformidade(selectedInconformidade.id, {
                resolvido: selectedInconformidade.resolvido,
                motivo: selectedInconformidade.descricao
            });
            if (res.success) {
                setShowInconformidadeModal(false);
                fetchTimeline();
                showToast('success', 'Inconformidade atualizada com sucesso.');
            }
        } catch (e: any) {
            showToast('error', e.message || 'Erro ao atualizar inconformidade.');
        }
    };

    
    useEffect(() => {
        if (selectedLotacao) {
            fetchTimeline();
        } else {
            setTimeline([]);
        }
    }, [selectedLotacao]);

    const fetchTimeline = async () => {
        if (!selectedLotacao) return;
        setIsLoadingTimeline(true);
        try {
            const origemId = viewMode === 'lotacao' ? selectedLotacao.ID_LOTACAO : viewMode === 'edital' ? selectedLotacao.ID_EDITAL : viewMode === 'cogestora' ? selectedLotacao.ID_COGESTORA : selectedLotacao.ID_VINCULACAO;
            const res: any = await api.getTimeline(origemId, viewMode);
            if (res && res.success) {
                const eventos = res.eventos || [];
                if (selectedLotacao.TIMESTAMP) {
                    eventos.push({
                        id: 'registro_inicial_' + origemId,
                        tipo: 'criacao',
                        timestamp: selectedLotacao.TIMESTAMP,
                        titulo: viewMode === 'lotacao' ? selectedLotacao.LOTACAO : viewMode === 'edital' ? selectedLotacao.EDITAL : selectedLotacao.NOME,
                        descricao: 'Item registrado no sistema'
                    });
                }
                eventos.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setTimeline(eventos);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingTimeline(false);
        }
    };

    const handleCreateInconformidade = async (e: any, chainId?: string) => {
        if (e) e.preventDefault();
        
        let finalIdLotacao = viewMode === 'lotacao' ? selectedLotacao?.ID_LOTACAO : inconformidadeForm.idLotacao;
        let finalIdEdital = viewMode === 'edital' ? selectedLotacao?.ID_EDITAL : inconformidadeForm.idEdital;

        if (!finalIdLotacao && !finalIdEdital) {
            return showToast('error', 'É obrigatório vincular a Inconformidade a uma Lotação ou a um Edital.');
        }
        if (!inconformidadeForm.motivo.trim() || !inconformidadeForm.tipo) {
            return showToast('error', 'Tipo e motivo são obrigatórios.');
        }

        setIsCreatingInconformidade(true);
        try {
            const payload: any = {
                tipo: inconformidadeForm.tipo,
                motivo: inconformidadeForm.motivo,
                resolvido: inconformidadeForm.resolvido,
                idProcesso: inconformidadeForm.idProcesso || undefined,
                chain: chainId || null,
                idLotacao: finalIdLotacao || undefined,
                idTermo: finalIdEdital || undefined
            };
            
            const res: any = await api.createInconformidade(payload);
            if (res && res.success) {
                // Se essa inconformidade foi criada a partir da invalidação de uma amostragem, atualiza a validação para vincular o ID_INC
                if (inconformidadeForm.idAmostragemVinculada) {
                    await api.validarAmostragem(inconformidadeForm.idAmostragemVinculada, false, inconformidadeForm.motivo, res.inconformidade.ID_INC);
                }

                setInconformidadeForm({ tipo: 'Administrativa', motivo: '', resolvido: false, idProcesso: '', idAmostragemVinculada: '', idLotacao: '', idEdital: '' });
                fetchTimeline();
                if (chainId) {
                    // Se estiver criando a partir do dossiê, atualiza o dossiê
                    handleOpenInconformidade(res.inconformidade);
                }
            }
        } catch (e: any) {
            console.error(e);
            showToast('error', e.message || 'Erro ao criar inconformidade');
        } finally {
            setIsCreatingInconformidade(false);
        }
    };


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

    const [dossierCpf, setDossierCpf] = useState<string | null>(null);
    const [itemToDelete, setItemToDelete] = useState<{item: any, entity: string} | null>(null);
    const [archiveReason, setArchiveReason] = useState<string>('');
    const [moveVagaContratoItem, setMoveVagaContratoItem] = useState<any>(null);
    const [availableVagas, setAvailableVagas] = useState<any[]>([]);
    const [showVagaSelection, setShowVagaSelection] = useState(false);

    const handleGenerateAmostragem = async (e: React.MouseEvent, origemId: string, tipoOrigem: 'lotacao' | 'edital' | 'vinculacao') => {
        e.stopPropagation();
        setIsGeneratingAmostragem(true);
        try {
            const result: any = await api.generateAmostragem(origemId, tipoOrigem);
            if (result && result.success) {
                const data = result.data;
                const fullDetails = data.cpfs.map((cpf: string) => {
                    const pessoaTemp = pessoas.find((p: any) => p.CPF === cpf);
                    return {
                        cpf: cpf,
                        nome: pessoaTemp?.NOME || 'Nome não encontrado'
                    };
                });
                setAmostragemResult(fullDetails);
                setAmostragemData({
                    idAmostragem: data.idAmostragem,
                    validacao: data.validacao,
                    lancamentos: result.lancamentos || []
                });
                setValidacaoForm({
                    validada: data.validacao?.VALIDADA || false,
                    justificativa: data.validacao?.JUSTIFICATIVA || ''
                });
                setShowAmostragemModal(true);
            } else {
                showToast('error', result?.message || 'Erro ao gerar amostragem.');
            }
        } catch(err: any) {
            showToast('error', err.message || 'Erro de rede ao gerar amostragem.');
        } finally {
            setIsGeneratingAmostragem(false);
        }
    };

    const handleCreateLancamento = async (cpf: string) => {
        try {
            const res: any = await api.createLancamento(cpf);
            if (res.success) {
                setAmostragemData(prev => prev ? { ...prev, lancamentos: [...prev.lancamentos, res.lancamento] } : prev);
                showToast('success', 'Lançamento criado com sucesso.');
            }
        } catch (e: any) {
            showToast('error', e.message || 'Erro ao criar lançamento.');
        }
    };

    const handleToggleLancamento = async (id: string) => {
        try {
            const res: any = await api.toggleLancamento(id);
            if (res.success) {
                setAmostragemData(prev => prev ? {
                    ...prev,
                    lancamentos: prev.lancamentos.map(l => l.ID_LANCAMENTO === id ? res.lancamento : l)
                } : prev);
            }
        } catch (e: any) {
            showToast('error', e.message || 'Erro ao alternar lançamento.');
        }
    };

    const handleValidarAmostragem = async (validada: boolean) => {
        if (!amostragemData?.idAmostragem) return;
        if (!validada && !validacaoForm.justificativa) {
            return showToast('error', 'Justificativa é obrigatória para amostragem não validada.');
        }
        try {
            // Note: Não estamos mais usando o idProcesso na validação da amostragem (vai para a inconformidade)
            const res: any = await api.validarAmostragem(amostragemData.idAmostragem, validada, validacaoForm.justificativa, '');
            if (res.success) {
                setAmostragemData(prev => prev ? { ...prev, validacao: res.validacao } : prev);
                setValidacaoForm(prev => ({ ...prev, validada: res.validacao.VALIDADA }));
                fetchInvalidAmostragens();
                showToast('success', 'Amostragem validada com sucesso.');
                
                // Se for invalidada, direciona para o fluxo de criar inconformidade
                if (!validada) {
                    setShowAmostragemModal(false);
                    setInconformidadeForm({
                        tipo: "Operacional", // Tipo sugerido inicial para amostragem
                        motivo: validacaoForm.justificativa,
                        resolvido: false,
                        idProcesso: "",
                        idAmostragemVinculada: amostragemData.idAmostragem,
                        idLotacao: "",
                        idEdital: ""
                    });
                    setShowCreateInconformidadeModal(true);
                }
            }
        } catch (e: any) {
            showToast('error', e.message || 'Erro ao validar amostragem.');
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
            ID_POSTO_TRABALHO: '',
            POSTO_NOME: '',
            BLOQUEADA: false,
            QUANTIDADE: 1
        });
        setShowVagaModal(true);
    };
    const [newLotacaoData, setNewLotacaoData] = useState({ LOTACAO: '', COMPLEXIDADE: '', ID_VINCULACAO: '', TIPO_DA_LOTACAO: '', BAIRRO: '' });
    const [newEditalData, setNewEditalData] = useState({ PROCESSO: '', EDITAL: '', NUMERO: '', ID_COGESTORA: '', INICIO: '', TERMINO: '' });
    const [newPostoData, setNewPostoData] = useState({ NOME_POSTO: '', ESCOLARIDADE: '', SALARIO: '' });
    const [newVinculacaoData, setNewVinculacaoData] = useState({ NOME: '' });

    // Selection Modal states
    const [selectionContext, setSelectionContext] = useState<{ active: boolean; entity: string; items: any[]; title: string; onSelect: (item: any) => void; multiSelect?: boolean; initialSelection?: any[] } | null>(null);

    // View Mode
    const [viewMode, setViewMode] = useState<'lotacao' | 'edital' | 'vinculacao' | 'cogestora'>('vinculacao');
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
    const { create: createVinculacao } = useMutateEntity('Vinculacao');
    const { create: createEdital } = useMutateEntity('Edital');
    const { create: createPosto } = useMutateEntity('PostoTrabalho');
    const { create: createContrato } = useMutateEntity('Contrato');
        const { create: createFuncao } = useMutateEntity('Funcao');
    const { create: createProtocolo } = useMutateEntity('Protocolo');
    const { create: createSubstituto, remove: deleteSubstituto } = useMutateEntity('Substituto');

    const session = JSON.parse(localStorage.getItem('simas_user_session') || '{}');
    const isCoordination = session.papel === 'COORDENAÇÃO';
    const isReadOnly = session.papel === 'GABINETE' || session.papel === 'GACP';

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

    const handleCreateVinculacao = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('VNC');
            await createVinculacao.mutateAsync({ ...newVinculacaoData, ID_VINCULACAO: pk });
            showToast('success', 'Vinculação criada com sucesso!');
            setShowCreateVinculacaoModal(false);
            setNewVinculacaoData({ NOME: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar vinculação.');
        }
    };

    const handleCreateLotacao = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('LOT');
            await createLotacao.mutateAsync({
                ...newLotacaoData,
                ID_LOTACAO: pk
            });
            showToast('success', 'Lotação criada com sucesso!');
            setShowCreateLotacaoModal(false);
            setVagaData({...vagaData, ID_LOTACAO: pk, LOTACAO_NOME: newLotacaoData.LOTACAO});
            setNewLotacaoData({ LOTACAO: '', COMPLEXIDADE: '', ID_VINCULACAO: '', TIPO_DA_LOTACAO: '', BAIRRO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar lotação.');
        }
    };

    const handleCreateEdital = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const pk = validation.generateLegacyId('EDT');
            await createEdital.mutateAsync({ ...newEditalData, ID_EDITAL: pk });
            showToast('success', 'Edital criado com sucesso!');
            setShowCreateEditalModal(false);
            setVagaData({...vagaData, ID_EDITAL: pk, EDITAL_NOME: newEditalData.EDITAL});
            setNewEditalData({ PROCESSO: '', EDITAL: '', NUMERO: '', ID_COGESTORA: '', INICIO: '', TERMINO: '' });
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar edital.');
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

    const getVagasCount = (item: any, type: 'lotacao' | 'edital' | 'vinculacao' | 'cogestora') => {
        if (type === 'lotacao') return vagas.filter((v:any) => v.ID_LOTACAO === item.ID_LOTACAO).length;
        if (type === 'edital') return vagas.filter((v:any) => v.ID_EDITAL === item.ID_EDITAL).length;
        if (type === 'vinculacao') return vagas.filter((v:any) => v.lotacao?.ID_VINCULACAO === item.ID_VINCULACAO).length;
        if (type === 'cogestora') return vagas.filter((v:any) => v.edital?.ID_COGESTORA === item.ID_COGESTORA).length;
        return 0;
    };

    const sortItems = (items: any[], type: 'lotacao' | 'edital' | 'vinculacao' | 'cogestora') => {
        return [...items].sort((a, b) => {
            const vagasA = getVagasCount(a, type);
            const vagasB = getVagasCount(b, type);
            const nameA = (a.LOTACAO || a.EDITAL || a.NOME || '').toLowerCase();
            const nameB = (b.LOTACAO || b.EDITAL || b.NOME || '').toLowerCase();

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

    const filteredCogestoras = sortItems(cogestoras.filter((c: any) =>
        c.NOME?.toLowerCase().includes(searchTerm.toLowerCase())
    ), 'cogestora');

    const filteredVinculacoes = sortItems(vinculacoes.filter((v: any) =>
            v.NOME?.toLowerCase().includes(searchTerm.toLowerCase())
        ), 'vinculacao');
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
        if (viewMode === 'lotacao') return vagas.filter((v: any) => v.ID_LOTACAO === selectedLotacao.ID_LOTACAO);
        if (viewMode === 'edital') return vagas.filter((v: any) => v.ID_EDITAL === selectedLotacao.ID_EDITAL);
        if (viewMode === 'vinculacao') return vagas.filter((v: any) => v.lotacao?.ID_VINCULACAO === selectedLotacao.ID_VINCULACAO);
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

        const matchesPosto = viewMode !== 'vinculacao' && vagaFilterPosto ? v.ID_POSTO_TRABALHO === vagaFilterPosto : true;
        const matchesEdital = viewMode !== 'edital' && vagaFilterEdital ? v.ID_EDITAL === vagaFilterEdital : true;
        const matchesLotacao = viewMode !== 'lotacao' && vagaFilterLotacao ? v.ID_LOTACAO === vagaFilterLotacao : true;

        return matchesSearch && matchesDesocupada && matchesBloqueada && matchesPosto && matchesEdital && matchesLotacao;
    });

    const filteredAlocacoes = lotacaoAlocacoes.filter((a: any) => {
        const searchStr = `${a.NOME_PESSOA || a.MATRICULA} ${a.NOME_FUNCAO || a.ID_FUNCAO}`.toLowerCase();
        return searchStr.includes(alocacaoSearchTerm.toLowerCase());
    });

    const getFilteredSelectEditais = () => {
        if (!selectedLotacao) return editais;
        if (viewMode === 'cogestora') {
            return editais.filter((e: any) => e.ID_COGESTORA === selectedLotacao.ID_COGESTORA);
        }
        if (viewMode === 'lotacao') {
            const editalIdsFromVagas = new Set(vagas.filter((v: any) => v.ID_LOTACAO === selectedLotacao.ID_LOTACAO).map((v: any) => v.ID_EDITAL));
            return editais.filter((e: any) => editalIdsFromVagas.has(e.ID_EDITAL));
        }
        if (viewMode === 'vinculacao') {
            const lotacaoIdsFromVinculacao = new Set(lotacoes.filter((l: any) => l.ID_VINCULACAO === selectedLotacao.ID_VINCULACAO).map((l: any) => l.ID_LOTACAO));
            const editalIdsFromVagas = new Set(vagas.filter((v: any) => lotacaoIdsFromVinculacao.has(v.ID_LOTACAO)).map((v: any) => v.ID_EDITAL));
            return editais.filter((e: any) => editalIdsFromVagas.has(e.ID_EDITAL));
        }
        return editais;
    };

    const getFilteredSelectLotacoes = () => {
        if (!selectedLotacao) return lotacoes;
        if (viewMode === 'edital') {
            const lotacaoIdsFromVagas = new Set(vagas.filter((v: any) => v.ID_EDITAL === selectedLotacao.ID_EDITAL).map((v: any) => v.ID_LOTACAO));
            return lotacoes.filter((l: any) => lotacaoIdsFromVagas.has(l.ID_LOTACAO));
        }
        if (viewMode === 'vinculacao') {
            return lotacoes.filter((l: any) => l.ID_VINCULACAO === selectedLotacao.ID_VINCULACAO);
        }
        if (viewMode === 'cogestora') {
            const editalIdsFromCogestora = new Set(editais.filter((e: any) => e.ID_COGESTORA === selectedLotacao.ID_COGESTORA).map((e: any) => e.ID_EDITAL));
            const lotacaoIdsFromVagas = new Set(vagas.filter((v: any) => editalIdsFromCogestora.has(v.ID_EDITAL)).map((v: any) => v.ID_LOTACAO));
            return lotacoes.filter((l: any) => lotacaoIdsFromVagas.has(l.ID_LOTACAO));
        }
        return lotacoes;
    };

    const filteredSelectEditais = getFilteredSelectEditais();
    const filteredSelectLotacoes = getFilteredSelectLotacoes();

    return (
        <div className="flex flex-col h-full bg-simas-cloud p-6 relative overflow-hidden">
            <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 relative z-10">
                <div>
                    <h2 className="text-2xl font-black text-simas-dark uppercase tracking-tight">Acompanhamento</h2>
                    <p className="text-gray-500 text-sm">Painel de acompanhamento de conformidade</p>
                </div>
                
                {!selectedLotacao && (
                    <div className="flex flex-col xl:flex-row gap-4 items-center">
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
                                onClick={() => { setViewMode('cogestora'); setSearchTerm(''); }}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'cogestora' ? 'bg-simas-cyan text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Cogestoras
                            </button>
                            <button
                                onClick={() => { setViewMode('vinculacao'); setSearchTerm(''); }}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'vinculacao' ? 'bg-simas-cyan text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Vinculações
                            </button>                        </div>
                    </div>
                )}

                <div className="flex w-full md:w-auto gap-2">
                    <div className="relative flex-1 md:w-80">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            <i className="fas fa-search text-sm"></i>
                        </div>
                        <input 
                            type="text" 
                            placeholder={`Buscar por ${viewMode === 'lotacao' ? 'nome da lotação' : viewMode === 'edital' ? 'nome do edital' : viewMode === 'cogestora' ? 'nome da cogestora' : 'nome da vinculação'}...`}
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
                            {isCoordination && !isReadOnly && viewMode === 'vinculacao' && (
                                <div 
                                    onClick={() => setShowCreateVinculacaoModal(true)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-gray-200 hover:border-simas-cyan hover:bg-simas-cyan/5 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 group-hover:bg-simas-cyan group-hover:text-white flex items-center justify-center transition-all mb-3 shadow-inner">
                                        <i className="fas fa-plus text-lg"></i>
                                    </div>
                                    <span className="font-black text-xs text-gray-400 group-hover:text-simas-dark uppercase tracking-widest">Nova Vinculação</span>
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
                                    <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex gap-2">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md">
                                                <i className="fas fa-chair text-simas-cyan"></i> {getVagasCount(lotacao, 'lotacao')}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md">
                                                <i className="fas fa-users text-simas-cyan"></i> {alocacoes.filter((a:any) => a.ID_LOTACAO === lotacao.ID_LOTACAO).length}
                                            </div>
                                        </div>
                                        <button onClick={(e) => handleGenerateAmostragem(e, lotacao.ID_LOTACAO, 'lotacao')} disabled={isGeneratingAmostragem} className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-simas-blue font-bold bg-simas-blue/10 hover:bg-simas-blue/20 transition-colors px-2 py-1.5 rounded-md uppercase tracking-wider disabled:opacity-50">
                                            <i className="fas fa-vial"></i> Gerar Amostragem
                                        </button>
                                        {invalidAmostragens.includes(lotacao.ID_LOTACAO) && (
                                            <button onClick={(e) => handleGenerateAmostragem(e, lotacao.ID_LOTACAO, 'lotacao')} className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-red-600 font-bold bg-red-50 hover:bg-red-100 transition-colors px-2 py-1.5 rounded-md uppercase tracking-wider border border-red-200 shadow-sm">
                                                <i className="fas fa-exclamation-circle"></i> Informar Processo SEI
                                            </button>
                                        )}
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
                                    <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md w-max">
                                            <i className="fas fa-chair text-simas-cyan"></i> {vagas.filter((v:any) => v.ID_EDITAL === edital.ID_EDITAL).length} vagas
                                        </div>
                                        <button onClick={(e) => handleGenerateAmostragem(e, edital.ID_EDITAL, 'edital')} disabled={isGeneratingAmostragem} className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-simas-blue font-bold bg-simas-blue/10 hover:bg-simas-blue/20 transition-colors px-2 py-1.5 rounded-md uppercase tracking-wider disabled:opacity-50">
                                            <i className="fas fa-vial"></i> Gerar Amostragem
                                        </button>
                                        {invalidAmostragens.includes(edital.ID_EDITAL) && (
                                            <button onClick={(e) => handleGenerateAmostragem(e, edital.ID_EDITAL, 'edital')} className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-red-600 font-bold bg-red-50 hover:bg-red-100 transition-colors px-2 py-1.5 rounded-md uppercase tracking-wider border border-red-200 shadow-sm">
                                                <i className="fas fa-exclamation-circle"></i> Informar Processo SEI
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {viewMode === 'cogestora' && filteredCogestoras.map((cogestora: any) => (
                                <div 
                                    key={cogestora.ID_COGESTORA} 
                                    onClick={() => setSelectedLotacao(cogestora)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-simas-cyan cursor-pointer transition-all transform hover:-translate-y-1 flex flex-col"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-lg shrink-0">
                                            <i className="fas fa-building text-sm"></i>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-simas-dark text-base leading-tight mb-1">{cogestora.NOME}</h3>
                                    <p className="text-gray-500 text-xs mb-4">ID: {cogestora.ID_COGESTORA}</p>
                                    <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md w-max">
                                            <i className="fas fa-file-contract text-simas-cyan"></i> {editais.filter((e:any) => e.ID_COGESTORA === cogestora.ID_COGESTORA).length} editais
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {viewMode === 'vinculacao' && filteredVinculacoes.map((vinculacao: any) => (
                                <div 
                                    key={vinculacao.ID_VINCULACAO} 
                                    onClick={() => setSelectedLotacao(vinculacao)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-simas-cyan cursor-pointer transition-all transform hover:-translate-y-1 flex flex-col"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-simas-blue/10 text-simas-blue flex items-center justify-center font-bold text-lg shrink-0">
                                            <i className="fas fa-briefcase text-sm"></i>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-simas-dark text-base leading-tight mb-1">{vinculacao.NOME}</h3>
                                    <p className="text-gray-500 text-xs mb-4">ID: {vinculacao.ID_VINCULACAO}</p>
                                    <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-gray-50">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded-md w-max">
                                            <i className="fas fa-chair text-simas-cyan"></i> {vagas.filter((v:any) => v.lotacao?.ID_VINCULACAO === vinculacao.ID_VINCULACAO).length} vagas
                                        </div>
                                        <button onClick={(e) => handleGenerateAmostragem(e, vinculacao.ID_VINCULACAO, 'vinculacao')} disabled={isGeneratingAmostragem} className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-simas-blue font-bold bg-simas-blue/10 hover:bg-simas-blue/20 transition-colors px-2 py-1.5 rounded-md uppercase tracking-wider disabled:opacity-50">
                                            <i className="fas fa-vial"></i> Gerar Amostragem
                                        </button>
                                        {invalidAmostragens.includes(vinculacao.ID_VINCULACAO) && (
                                            <button onClick={(e) => handleGenerateAmostragem(e, vinculacao.ID_VINCULACAO, 'vinculacao')} className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs text-red-600 font-bold bg-red-50 hover:bg-red-100 transition-colors px-2 py-1.5 rounded-md uppercase tracking-wider border border-red-200 shadow-sm">
                                                <i className="fas fa-exclamation-circle"></i> Informar Processo SEI
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                // DETAIL VIEW
                <div className="flex-1 flex flex-col min-h-0 bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-slide-up">
                    <header className="px-8 py-6 border-b border-gray-100 bg-gray-50/80 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 shrink-0 z-30 relative shadow-sm">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setSelectedLotacao(null)}
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-simas-dark hover:border-simas-dark transition-all shadow-sm shrink-0"
                            >
                                <i className="fas fa-arrow-left"></i>
                            </button>
                            <div>
                                <p className="text-xs font-bold text-simas-cyan uppercase tracking-widest mb-0.5">
                                    {viewMode === 'lotacao' ? 'Acompanhando Lotação' : viewMode === 'edital' ? 'Acompanhando Edital' : 'Acompanhando Vinculação'}
                                </p>
                                <h2 className="text-2xl font-black text-simas-dark">
                                    {viewMode === 'lotacao' ? selectedLotacao.LOTACAO : viewMode === 'edital' ? selectedLotacao.EDITAL : selectedLotacao.NOME}
                                </h2>
                            </div>
                        </div>

                        <div className="w-full xl:w-auto bg-white p-2 rounded-2xl shadow-sm border border-gray-200 shrink-0 flex items-center gap-4">
                            <div className="flex items-center gap-2 border-r border-gray-100 pr-4">
                                <select 
                                    className="p-2 text-[10px] bg-gray-50 border-none rounded-lg font-bold text-gray-600 outline-none cursor-pointer"
                                    value={timelineFilterType}
                                    onChange={e => setTimelineFilterType(e.target.value)}
                                >
                                    <option value="todos">Todos Eventos</option>
                                    <option value="inconformidade">Inconformidades</option>
                                    <option value="processo">Processos</option>
                                    <option value="amostragem">Amostragens</option>
                                </select>

                                {timelineFilterType === 'inconformidade' && (
                                    <select 
                                        className="p-2 text-[10px] bg-gray-50 border-none rounded-lg font-bold text-gray-600 outline-none cursor-pointer max-w-[120px]"
                                        value={timelineFilterIncType}
                                        onChange={e => setTimelineFilterIncType(e.target.value)}
                                    >
                                        <option value="todos">Todos os Tipos</option>
                                        {Array.from(new Set(timeline.filter(e => e.tipo === 'inconformidade').map(e => e.tipo_inconformidade))).map(tipo => (
                                            <option key={tipo} value={tipo}>{tipo}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <button 
                                type="button" 
                                onClick={() => setTimelineOrientation(o => o === 'vertical' ? 'horizontal' : 'vertical')} 
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:text-simas-cyan hover:bg-white border border-gray-200 transition-all shadow-sm shrink-0" 
                                title="Alternar orientação"
                            >
                                <i className={`fas ${timelineOrientation === 'vertical' ? 'fa-arrows-alt-h' : 'fa-arrows-alt-v'}`}></i>
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setShowCreateInconformidadeModal(true)} 
                                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold transition-colors shrink-0 text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                <i className="fas fa-exclamation-triangle"></i> Inconformidade
                            </button>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setProcessoData({ NUMERO: '', TITULO: '', STATUS_ENCAMINHAMENTO: '', TEXTO_LEGENDA: '', DATA_PUBLICACAO: '' });
                                    setShowCreateProcessoModal(true);
                                }} 
                                className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200 rounded-xl font-bold transition-colors shrink-0 text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                <i className="fas fa-folder-open"></i> Processo
                            </button>
                        </div>
                    </header>
                    
                    
                    <div className={`flex-1 bg-gray-50/50 p-8 ${timelineOrientation === 'horizontal' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
                        <div className={timelineOrientation === 'horizontal' ? 'w-max min-w-full h-full flex items-center px-12' : 'max-w-4xl mx-auto'}>
                            {/* Timeline Container */}
                            <div className={`relative ${timelineOrientation === 'horizontal' ? 'flex items-center h-full min-w-full' : ''}`}>
                                {/* Linha central */}
                                <div className={`absolute bg-gray-300/40 rounded-full ${timelineOrientation === 'horizontal' ? 'top-1/2 left-0 right-0 h-[4px] -translate-y-1/2' : 'left-[39px] sm:left-1/2 top-0 bottom-0 w-[4px] -translate-x-1/2'}`}></div>
                                
                                {isLoadingTimeline ? (
                                    <div className="flex justify-center p-12 relative z-10">
                                        <div className="w-8 h-8 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                ) : (
                                    <div className={timelineOrientation === 'horizontal' ? 'flex flex-row gap-8 w-max items-center h-full' : 'space-y-8'}>
                                        
                                        {(timelineOrientation === 'horizontal' ? [...timeline.filter(evento => {
                                            if (timelineFilterType !== 'todos' && timelineFilterType !== 'amostragem') {
                                                if (evento.tipo !== timelineFilterType) return false;
                                            }
                                            if (timelineFilterType === 'amostragem') {
                                                if (evento.tipo !== 'amostragem' && evento.tipo !== 'amostragem_validada') return false;
                                            }
                                            if (timelineFilterType === 'inconformidade' && timelineFilterIncType !== 'todos') {
                                                if (evento.tipo_inconformidade !== timelineFilterIncType) return false;
                                            }
                                            return true;
                                        })].reverse() : timeline.filter(evento => {
                                            if (timelineFilterType !== 'todos' && timelineFilterType !== 'amostragem') {
                                                if (evento.tipo !== timelineFilterType) return false;
                                            }
                                            if (timelineFilterType === 'amostragem') {
                                                if (evento.tipo !== 'amostragem' && evento.tipo !== 'amostragem_validada') return false;
                                            }
                                            if (timelineFilterType === 'inconformidade' && timelineFilterIncType !== 'todos') {
                                                if (evento.tipo_inconformidade !== timelineFilterIncType) return false;
                                            }
                                            return true;
                                        })).map((evento, index) => {
                                            // Lado Esquerdo/Cima: Processos e Marcos de Fundação (Info/Alerta)
                                            // Lado Direito/Baixo: Problemas (Inconformidades) e Amostragens
                                            const isLeft = ['processo', 'info', 'alerta'].includes(evento.tipo);
                                            
                                            // Configuração do ícone e cores baseado no tipo e severidade
                                            let icon = 'fa-circle';
                                            let colorClass = 'bg-gray-100 text-gray-500 border-gray-200';
                                            
                                            if (evento.tipo === 'criacao') {
                                                icon = 'fa-flag-checkered';
                                                colorClass = 'bg-gray-100 text-gray-500 border-gray-200';
                                            } else if (evento.tipo === 'inconformidade') {
                                                icon = 'fa-exclamation-triangle';
                                                colorClass = evento.resolvido ? 'bg-green-50 text-green-500 border-green-200' : 'bg-red-50 text-red-500 border-red-200';
                                            } else if (evento.tipo === 'processo') {
                                                icon = 'fa-folder-open';
                                                colorClass = 'bg-purple-50 text-purple-500 border-purple-200';
                                            } else if (evento.tipo === 'amostragem' || evento.tipo === 'amostragem_validada') {
                                                icon = 'fa-vial';
                                                if (evento.status === 'Validada') colorClass = 'bg-green-50 text-green-500 border-green-200';
                                                else if (evento.status === 'Não Validada') colorClass = 'bg-red-50 text-red-500 border-red-200';
                                                else colorClass = 'bg-simas-cyan/10 text-simas-cyan border-simas-cyan/20';
                                            } else if (evento.tipo === 'info') {
                                                icon = 'fa-info-circle';
                                                colorClass = 'bg-blue-50 text-blue-500 border-blue-200';
                                            } else if (evento.tipo === 'alerta') {
                                                icon = 'fa-exclamation-circle';
                                                colorClass = 'bg-orange-50 text-orange-500 border-orange-200';
                                            }

                                            return (
                                                <div key={evento.id} className={`relative z-10 flex justify-between ${timelineOrientation === 'horizontal' ? (isLeft ? 'flex-col-reverse items-center w-[360px] shrink-0 h-[480px]' : 'flex-col items-center w-[360px] shrink-0 h-[480px]') : ('flex-col sm:flex-row items-start sm:items-center w-full gap-4 sm:gap-0 ' + (isLeft ? 'sm:flex-row-reverse' : ''))}`}>
                                                    {/* Espaçador para o lado vazio em telas md+ */}
                                                    {timelineOrientation === 'vertical' && <div className="hidden sm:block w-[calc(50%-40px)]"></div>}
                                                    {timelineOrientation === 'horizontal' && <div className="w-full h-1/2"></div>}
                                                    
                                                    {/* Marcador central */}
                                                    <div className={`absolute z-20 w-10 h-10 rounded-full border-4 border-white bg-white shadow-sm flex items-center justify-center ${timelineOrientation === 'horizontal' ? 'top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2' : 'left-[39px] sm:left-1/2 -translate-x-1/2'}`}>
                                                        <div className={`w-full h-full rounded-full border flex items-center justify-center ${colorClass}`}>
                                                            <i className={`fas ${icon} text-sm`}></i>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Conteúdo do Card */}
                                                    <div className={timelineOrientation === 'horizontal' ? `w-full h-1/2 flex items-${isLeft ? 'end' : 'start'} justify-center ${isLeft ? 'pb-8' : 'pt-8'}` : `w-[calc(100%-80px)] ml-[80px] sm:ml-0 sm:w-[calc(50%-40px)] ${isLeft ? 'sm:pr-8' : 'sm:pl-8'}`}>
                                                        <div 
                                                            className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-100 transition-all relative group w-full ${evento.tipo === 'processo' || evento.tipo === 'inconformidade' ? 'cursor-pointer hover:border-simas-cyan hover:shadow-md hover:-translate-y-1' : 'hover:shadow-md'}`}
                                                            onClick={() => {
                                                                if (evento.tipo === 'processo') handleOpenProcesso(evento.idProcesso);
                                                                else if (evento.tipo === 'inconformidade') handleOpenInconformidade(evento);
                                                            }}
                                                        >
                                                            {/* Triângulo (Ponteiro) */}
                                                            <div className={`hidden sm:block absolute bg-white border-gray-100 transform rotate-45 w-4 h-4 ${timelineOrientation === 'horizontal' ? (isLeft ? 'bottom-[-8px] left-1/2 -translate-x-1/2 border-b border-r' : 'top-[-8px] left-1/2 -translate-x-1/2 border-t border-l') : ('top-1/2 -translate-y-1/2 ' + (isLeft ? '-right-2 border-t border-r' : '-left-2 border-l border-b'))}`}></div>
                                                            
                                                            <div className="flex justify-between items-start mb-2 gap-3">
                                                                <h4 className="font-bold text-sm text-simas-dark break-words flex-1">{evento.titulo}</h4>
                                                                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-md shrink-0">
                                                                    {new Date(evento.timestamp).toLocaleString('pt-BR')}
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-600 text-sm mb-3 whitespace-pre-wrap">{evento.descricao}</p>
                                                            
                                                            {evento.status && (
                                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${evento.status === 'Validada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                    <i className={`fas ${evento.status === 'Validada' ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                                                                    {evento.status}
                                                                </span>
                                                            )}
                                                            <div className="flex flex-wrap gap-2 mt-3">
                                                                {evento.idProcesso && (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-700">
                                                                        <i className="fas fa-file-alt"></i> Processo: {evento.idProcesso}
                                                                    </span>
                                                                )}
                                                                {evento.nomeEdital && (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100">
                                                                        <i className="fas fa-file-contract"></i> Edital: {evento.numeroEdital ? `${evento.numeroEdital} - ` : ''}{evento.nomeEdital}
                                                                    </span>
                                                                )}
                                                                {evento.nomeLotacao && (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-50 text-orange-600 border border-orange-100">
                                                                        <i className="fas fa-map-marker-alt"></i> Lotação: {evento.nomeLotacao}
                                                                    </span>
                                                                )}
                                                                {evento.nomeCogestora && (
                                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-500">
                                                                        <i className="fas fa-building"></i> {evento.nomeCogestora}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        
                                        

                                    </div>
                                )}
                            </div>
                        </div>
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

                            {viewMode !== 'vinculacao' && (
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
                            </div>
                            <div className="pt-4 flex gap-3">
                                <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateVinculacaoModal(false)}>Cancelar</Button>
                                <Button type="submit" isLoading={createVinculacao.isPending} className="flex-1 py-3">Criar Vinculação</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Resultado da Amostragem */}
            {showAmostragemModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight flex items-center gap-2">
                                <i className="fas fa-vial text-simas-blue"></i> Resultado da Amostragem
                            </h3>
                            <button onClick={() => setShowAmostragemModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                            <div className="mb-4 text-xs text-gray-500 bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <p className="font-medium text-simas-blue flex items-center gap-2 mb-1">
                                    <i className="fas fa-info-circle"></i> Sobre a Amostragem
                                </p>
                                Selecionamos 10% dos ocupantes (arredondado para cima) aleatoriamente, garantindo uma sobreposição de 10% com o mês anterior para o mesmo local. Esta amostra ficará salva para consultas futuras neste mês.
                            </div>
                            
                            <h4 className="font-bold text-sm text-simas-dark mb-3">Ocupantes Selecionados ({amostragemResult.length})</h4>
                            
                            {amostragemResult.length === 0 ? (
                                <p className="text-sm text-gray-500 italic text-center p-4 bg-white rounded-xl border border-dashed border-gray-200">Não há ocupantes ativos ou vagas suficientes para gerar a amostragem neste local.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {amostragemResult.map((res, index) => {
                                        const lancamento = amostragemData?.lancamentos?.find(l => l.CPF === res.cpf);
                                        return (
                                        <li key={index} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-simas-blue/10 text-simas-blue flex items-center justify-center shrink-0">
                                                    <i className="fas fa-user text-xs"></i>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-simas-dark">{res.nome}</p>
                                                    <p className="text-[10px] text-gray-500">{validation.formatCPF(res.cpf) || res.cpf}</p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex items-center">
                                                {lancamento ? (
                                                    <button 
                                                        onClick={() => handleToggleLancamento(lancamento.ID_LANCAMENTO)}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${lancamento.STATUS ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                                                    >
                                                        <i className={`fas ${lancamento.STATUS ? 'fa-check-circle' : 'fa-clock'}`}></i>
                                                        {lancamento.STATUS ? 'Processado' : 'Pendente'}
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleCreateLancamento(res.cpf)}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-simas-blue text-white hover:bg-blue-600 transition-colors flex items-center gap-1.5"
                                                    >
                                                        <i className="fas fa-plus"></i> Lançamento
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    )})}
                                </ul>
                            )}
                            
                            {amostragemData?.idAmostragem && (
                                <div className="mt-6 pt-4 border-t border-gray-200">
                                    <h4 className="font-bold text-sm text-simas-dark mb-3">Validação da Amostragem</h4>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-xs font-bold text-gray-600 uppercase">Status:</span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setValidacaoForm(prev => ({ ...prev, validada: true }))}
                                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${validacaoForm.validada ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                                >
                                                    Validada
                                                </button>
                                                <button
                                                    onClick={() => setValidacaoForm(prev => ({ ...prev, validada: false }))}
                                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!validacaoForm.validada ? 'bg-red-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                                >
                                                    Não Validada
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {!validacaoForm.validada && (
                                            <>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Justificativa *</label>
                                                    <textarea 
                                                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-red-400 focus:bg-white resize-none"
                                                        rows={2}
                                                        placeholder="Motivo da não validação..."
                                                        value={validacaoForm.justificativa}
                                                        onChange={e => setValidacaoForm(prev => ({ ...prev, justificativa: e.target.value }))}
                                                    ></textarea>
                                                </div>
                                                <div className="bg-red-50 text-red-600 text-[10px] font-bold p-2 rounded-lg border border-red-100 flex items-center gap-2">
                                                    <i className="fas fa-info-circle text-xs"></i>
                                                    Ao salvar, você será direcionado para criar uma Inconformidade associada a esta justificativa.
                                                </div>
                                            </>
                                        )}
                                        <Button 
                                            onClick={() => handleValidarAmostragem(validacaoForm.validada)}
                                            className="w-full justify-center"
                                        >
                                            Salvar Validação
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <footer className="px-6 py-4 border-t border-gray-100 bg-white shrink-0">
                            <Button type="button" variant="secondary" className="w-full py-3" onClick={() => setShowAmostragemModal(false)}>Fechar</Button>
                        </footer>
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
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Bairro</label>
                                    <input 
                                        type="text"
                                        required
                                        placeholder="Ex: Centro"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                                        value={newLotacaoData.BAIRRO}
                                        onChange={e => setNewLotacaoData({...newLotacaoData, BAIRRO: e.target.value})}
                                    />
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
                                                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Vinculação</label>
                                                                        <select
                                                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all appearance-none"
                                                                            value={newLotacaoData.ID_VINCULACAO}
                                                                            onChange={e => setNewLotacaoData({...newLotacaoData, ID_VINCULACAO: e.target.value})}
                                                                        >
                                                                            <option value="">Selecione...</option>
                                                                            {vinculacoes.map((v: any) => (
                                                                                <option key={v.ID_VINCULACAO} value={v.ID_VINCULACAO}>{v.NOME}</option>
                                                                            ))}
                                                                        </select>                                </div>
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
                    multiSelect={selectionContext.multiSelect}
                    initialSelection={selectionContext.initialSelection}
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

            {/* Modal: Processo Dossier */}
            {showProcessoModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="font-bold text-simas-dark uppercase tracking-tight flex items-center gap-2">
                                    <i className="fas fa-folder-open text-purple-500"></i> Dossiê do Processo SEI
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{processoData.NUMERO}</p>
                            </div>
                            <button onClick={() => setShowProcessoModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
                            {isLoadingProcesso ? (
                                <div className="flex justify-center py-12">
                                    <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : (
                                <>
                                    {/* Card Principal de Edição */}
                                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Entrada Atual</span>
                                            <span className="text-[10px] font-bold text-gray-400">{processoData.DATA_PUBLICACAO ? new Date(processoData.DATA_PUBLICACAO).toLocaleDateString('pt-BR') : ''}</span>
                                        </div>
                                        <form id="processo-form" onSubmit={(e) => handleSaveProcesso(e, undefined)} className="p-5 space-y-4">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${processoData.resolvido ? 'bg-green-50 text-green-700 border-green-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                                        {processoData.STATUS_ENCAMINHAMENTO || 'Sem Status'}
                                                    </span>
                                                    <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500"
                                                            checked={processoData.resolvido}
                                                            onChange={e => setProcessoData({...processoData, resolvido: e.target.checked})}
                                                        />
                                                        Concluído / Resolvido
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="col-span-full">
                                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Título / Assunto</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Ex: Apuração de Irregularidades..."
                                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all focus:bg-white"
                                                        value={processoData.TITULO || ''} 
                                                        onChange={e => setProcessoData({...processoData, TITULO: e.target.value})}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Status de Encaminhamento</label>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Ex: Em Análise, Concluído..."
                                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all focus:bg-white"
                                                        value={processoData.STATUS_ENCAMINHAMENTO || ''} 
                                                        onChange={e => setProcessoData({...processoData, STATUS_ENCAMINHAMENTO: e.target.value})}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Data de Publicação</label>
                                                    <input 
                                                        type="date"
                                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all focus:bg-white"
                                                        value={processoData.DATA_PUBLICACAO ? new Date(processoData.DATA_PUBLICACAO).toISOString().split('T')[0] : ''} 
                                                        onChange={e => setProcessoData({...processoData, DATA_PUBLICACAO: e.target.value})}
                                                    />
                                                </div>
                                                <div className="col-span-full">
                                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Texto / Legenda</label>
                                                    <textarea 
                                                        rows={4}
                                                        placeholder="Detalhes ou andamentos importantes do processo..."
                                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all resize-none focus:bg-white"
                                                        value={processoData.TEXTO_LEGENDA || ''} 
                                                        onChange={e => setProcessoData({...processoData, TEXTO_LEGENDA: e.target.value})}
                                                    ></textarea>
                                                </div>
                                            </div>
                                            <div className="flex justify-end">
                                                <button type="submit" className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm">
                                                    Salvar Alterações
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    {/* Corrente de Processos */}
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <i className="fas fa-link"></i> Corrente de Processos
                                        </h4>
                                        
                                        <div className="space-y-3 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                                            {(() => {
                                                const all = processoChain;
                                                const getFullChain = (numero: string) => {
                                                    const family = [];
                                                    let root = all.find(p => p.NUMERO === numero);
                                                    while(root && root.CHAIN) {
                                                        const parent = all.find(p => p.ID_PROCESSO === root.CHAIN);
                                                        if (parent) root = parent;
                                                        else break;
                                                    }
                                                    
                                                    let next = root;
                                                    while(next) {
                                                        family.push(next);
                                                        const child = all.find(p => p.CHAIN === next.ID_PROCESSO);
                                                        next = child;
                                                    }
                                                    return family;
                                                };

                                                const family = getFullChain(processoData.NUMERO);

                                                return family.map((item, idx) => (
                                                    <div key={item.ID_PROCESSO} className={`relative pl-10 group`}>
                                                        <div className={`absolute left-0 w-10 h-10 flex items-center justify-center z-10`}>
                                                            <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${item.NUMERO === processoData.NUMERO ? 'bg-purple-500 scale-125 ring-4 ring-purple-500/10' : 'bg-gray-300'}`}></div>
                                                        </div>
                                                        <div 
                                                            onClick={() => handleOpenProcesso(item.NUMERO)}
                                                            className={`p-3 rounded-xl border transition-all cursor-pointer ${
                                                                item.NUMERO === processoData.NUMERO 
                                                                ? 'bg-white border-purple-500 shadow-md' 
                                                                : 'bg-white/50 border-gray-100 hover:border-gray-300'
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-start mb-1">
                                                                <span className="text-[10px] font-black text-simas-dark">{item.NUMERO}</span>
                                                                <span className="text-[9px] font-bold text-gray-400">{item.DATA_PUBLICACAO ? new Date(item.DATA_PUBLICACAO).toLocaleDateString('pt-BR') : new Date(item.TIMESTAMP).toLocaleDateString('pt-BR')}</span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 line-clamp-2">{item.TITULO || item.STATUS_ENCAMINHAMENTO}</p>
                                                        </div>
                                                    </div>
                                                ));
                                            })()}

                                            {!processoData.resolvido && !showProcessoChainForm && (
                                                <div className="pl-10 pt-2">
                                                    <button 
                                                        onClick={() => setShowProcessoChainForm(true)}
                                                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-purple-500 hover:border-purple-500 hover:bg-purple-50 transition-all text-xs font-bold flex items-center justify-center gap-2"
                                                    >
                                                        <i className="fas fa-plus-circle"></i> Dar Prosseguimento ao Processo
                                                    </button>
                                                </div>
                                            )}

                                            {showProcessoChainForm && (
                                                <div className="pl-10 pt-2 animate-slide-up">
                                                    <div className="bg-purple-50/50 border border-purple-200 rounded-2xl p-4 space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Novo Prosseguimento</span>
                                                            <button onClick={() => setShowProcessoChainForm(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xs"></i></button>
                                                        </div>
                                                        
                                                        <input 
                                                            type="text" 
                                                            placeholder="Número SEI (Obrigatório)*"
                                                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-purple-500 transition-all"
                                                            value={processoData.novoNumero || ''}
                                                            onChange={e => setProcessoData({...processoData, novoNumero: e.target.value})}
                                                        />
                                                        <input 
                                                            type="text" 
                                                            placeholder="Status de Encaminhamento"
                                                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 outline-none focus:border-purple-500 transition-all"
                                                            value={processoData.novoStatus || ''}
                                                            onChange={e => setProcessoData({...processoData, novoStatus: e.target.value})}
                                                        />
                                                        <textarea 
                                                            className="w-full p-3 bg-white rounded-xl border border-gray-200 text-xs text-gray-700 outline-none focus:border-purple-500 transition-all resize-none"
                                                            rows={2}
                                                            placeholder="Título ou Resumo do andamento..."
                                                            value={processoData.novoTitulo || ''}
                                                            onChange={e => setProcessoData({...processoData, novoTitulo: e.target.value})}
                                                        ></textarea>
                                                        
                                                        <div className="flex justify-between items-center mt-2">
                                                            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer shrink-0">
                                                                <input 
                                                                    type="checkbox" 
                                                                    className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500"
                                                                    checked={processoData.novoResolvido || false}
                                                                    onChange={e => setProcessoData({...processoData, novoResolvido: e.target.checked})}
                                                                />
                                                                Marcar como Concluído
                                                            </label>
                                                            <button 
                                                                onClick={(e) => {
                                                                    const oldProc = processoChain.find(p => p.NUMERO === processoData.NUMERO);
                                                                    const chainId = oldProc ? oldProc.ID_PROCESSO : null;
                                                                    
                                                                    // Criamos um payload virtual para a nova entrada
                                                                    const payload = {
                                                                        NUMERO: processoData.novoNumero,
                                                                        STATUS_ENCAMINHAMENTO: processoData.novoStatus,
                                                                        TITULO: processoData.novoTitulo,
                                                                        resolvido: processoData.novoResolvido,
                                                                        editais: processoData.editais,
                                                                        lotacoes: processoData.lotacoes
                                                                    };
                                                                    
                                                                    const oldProcessoData = {...processoData};
                                                                    setProcessoData(payload); // Setamos state temp
                                                                    handleSaveProcesso(e, chainId).finally(() => {
                                                                        // Não desfaz se der sucesso pois handleSaveProcesso já reabre o novo, mas se der erro voltamos
                                                                    });
                                                                }}
                                                                disabled={isLoadingProcesso || !processoData.novoNumero}
                                                                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                                                            >
                                                                Confirmar Prosseguimento
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <footer className="px-6 py-4 border-t border-gray-100 bg-white shrink-0 flex justify-end gap-3">
                            <Button type="button" variant="secondary" className="w-full" onClick={() => setShowProcessoModal(false)}>Fechar Dossiê</Button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Inconformidade (Dossiê) */}
            {showInconformidadeModal && selectedInconformidade && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="font-bold text-simas-dark uppercase tracking-tight flex items-center gap-2">
                                    <i className="fas fa-exclamation-triangle text-red-500"></i> Dossiê de Inconformidade
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">{selectedInconformidade.id}</p>
                            </div>
                            <button onClick={() => setShowInconformidadeModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
                            {/* Card Principal de Edição */}
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Entrada Atual</span>
                                    <span className="text-[10px] font-bold text-gray-400">{new Date(selectedInconformidade.timestamp).toLocaleString('pt-BR')}</span>
                                </div>
                                <form id="inconformidade-form" onSubmit={handleUpdateInconformidade} className="p-5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${selectedInconformidade.resolvido ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {selectedInconformidade.tipo_inconformidade || selectedInconformidade.tipo}
                                            </span>
                                            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded text-simas-cyan focus:ring-simas-cyan"
                                                    checked={selectedInconformidade.resolvido}
                                                    onChange={e => setSelectedInconformidade({...selectedInconformidade, resolvido: e.target.checked})}
                                                />
                                                Resolvida
                                            </label>
                                        </div>
                                    </div>
                                    <textarea 
                                        className="w-full p-4 bg-gray-50 rounded-xl border border-gray-100 text-gray-700 text-sm outline-none focus:bg-white focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan transition-all resize-none"
                                        rows={4}
                                        value={selectedInconformidade.descricao || selectedInconformidade.motivo}
                                        onChange={e => setSelectedInconformidade({...selectedInconformidade, descricao: e.target.value, motivo: e.target.value})}
                                    ></textarea>
                                    <div className="flex justify-end">
                                        <button type="submit" className="px-4 py-2 bg-simas-cyan hover:bg-simas-blue text-white rounded-lg text-xs font-bold transition-all shadow-sm">
                                            Salvar Alterações
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Corrente (History Chain) */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <i className="fas fa-link"></i> Corrente de Eventos
                                </h4>
                                
                                <div className="space-y-3 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                                    {/* Buscar entradas anteriores e posteriores na chain */}
                                    {(() => {
                                        const chain = [];
                                        let current = selectedInconformidade;
                                        
                                        // Busca recursiva para trás (Simplified: we have all in inconformidadeChain)
                                        const all = inconformidadeChain;
                                        
                                        // Função para pegar toda a família
                                        const getFullChain = (id: string) => {
                                            const family = [];
                                            // Encontrar o "pai original" (raiz)
                                            let root = all.find(i => (i.id || i.ID_INC) === id);
                                            while(root && root.chain) {
                                                const parent = all.find(i => (i.id || i.ID_INC) === root.chain);
                                                if (parent) root = parent;
                                                else break;
                                            }
                                            
                                            // Seguir a linha do tempo do root para baixo
                                            let next = root;
                                            while(next) {
                                                family.push(next);
                                                const child = all.find(i => i.chain === (next.id || next.ID_INC));
                                                next = child;
                                            }
                                            return family;
                                        };

                                        const family = getFullChain(selectedInconformidade.id || selectedInconformidade.ID_INC);

                                        return family.map((item, idx) => (
                                            <div key={item.id || item.ID_INC} className={`relative pl-10 group`}>
                                                <div className={`absolute left-0 w-10 h-10 flex items-center justify-center z-10`}>
                                                    <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${(item.id || item.ID_INC) === (selectedInconformidade.id || selectedInconformidade.ID_INC) ? 'bg-simas-cyan scale-125 ring-4 ring-simas-cyan/10' : 'bg-gray-300'}`}></div>
                                                </div>
                                                <div 
                                                    onClick={() => setSelectedInconformidade(item)}
                                                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                                                        (item.id || item.ID_INC) === (selectedInconformidade.id || selectedInconformidade.ID_INC) 
                                                        ? 'bg-white border-simas-cyan shadow-md' 
                                                        : 'bg-white/50 border-gray-100 hover:border-gray-300'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] font-black text-simas-dark">{item.tipo_inconformidade || item.tipo}</span>
                                                        <span className="text-[9px] font-bold text-gray-400">{new Date(item.timestamp).toLocaleDateString('pt-BR')}</span>
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 line-clamp-2">{item.descricao || item.motivo}</p>
                                                </div>
                                            </div>
                                        ));
                                    })()}

                                    {/* Botão para Novo Prosseguimento (se não estiver resolvida) */}
                                    {!selectedInconformidade.resolvido && !showChainForm && (
                                        <div className="pl-10 pt-2">
                                            <button 
                                                onClick={() => setShowChainForm(true)}
                                                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-simas-cyan hover:border-simas-cyan hover:bg-simas-cyan/5 transition-all text-xs font-bold flex items-center justify-center gap-2"
                                            >
                                                <i className="fas fa-plus-circle"></i> Dar Prosseguimento à Inconformidade
                                            </button>
                                        </div>
                                    )}

                                    {showChainForm && (
                                        <div className="pl-10 pt-2 animate-slide-up">
                                            <div className="bg-simas-cyan/5 border border-simas-cyan/20 rounded-2xl p-4 space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-simas-cyan uppercase tracking-widest">Novo Prosseguimento</span>
                                                    <button onClick={() => setShowChainForm(false)} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times text-xs"></i></button>
                                                </div>
                                                <div className="relative">
                                                    <input 
                                                        list="inconformidade-types"
                                                        placeholder="Digite o tipo (ex: Administrativa, Operacional...)"
                                                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-simas-cyan transition-all"
                                                        value={inconformidadeForm.tipo}
                                                        onChange={e => setInconformidadeForm({...inconformidadeForm, tipo: e.target.value})}
                                                    />
                                                    <datalist id="inconformidade-types">
                                                        {Array.from(new Set(timeline.filter(e => e.tipo === 'inconformidade').map(e => e.tipo_inconformidade || e.tipo))).map(tipo => (
                                                            <option key={tipo} value={tipo} />
                                                        ))}
                                                        <option value="Administrativa" />
                                                        <option value="Operacional" />
                                                        <option value="Trabalhista" />
                                                        <option value="Grave" />
                                                    </datalist>
                                                </div>
                                                <textarea 
                                                    className="w-full p-3 bg-white rounded-xl border border-gray-200 text-xs text-gray-700 outline-none focus:border-simas-cyan transition-all resize-none"
                                                    rows={3}
                                                    placeholder="Descreva o andamento ou nova observação..."
                                                    value={inconformidadeForm.motivo}
                                                    onChange={e => setInconformidadeForm({...inconformidadeForm, motivo: e.target.value})}
                                                ></textarea>
                                                
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                    <div className="flex-1 relative">
                                                        <input 
                                                            type="text"
                                                            placeholder="Processo SEI (Opcional)"
                                                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:border-simas-cyan transition-all pr-10"
                                                            value={inconformidadeForm.idProcesso}
                                                            onChange={e => setInconformidadeForm({...inconformidadeForm, idProcesso: e.target.value})}
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => setShowCreateProcessoModal(true)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600 transition-colors"
                                                            title="Criar Novo Processo"
                                                        >
                                                            <i className="fas fa-folder-plus"></i>
                                                        </button>
                                                    </div>
                                                    
                                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer shrink-0">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 rounded text-simas-cyan focus:ring-simas-cyan"
                                                            checked={inconformidadeForm.resolvido}
                                                            onChange={e => setInconformidadeForm({...inconformidadeForm, resolvido: e.target.checked})}
                                                        />
                                                        Marcar como Resolvida
                                                    </label>
                                                </div>

                                                <button 
                                                    onClick={(e) => {
                                                        handleCreateInconformidade(null, selectedInconformidade.id || selectedInconformidade.ID_INC);
                                                        setShowChainForm(false);
                                                    }}
                                                    disabled={isCreatingInconformidade || !inconformidadeForm.motivo.trim()}
                                                    className="w-full py-2.5 bg-simas-cyan hover:bg-simas-blue text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                                                >
                                                    Confirmar Prosseguimento
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <footer className="px-6 py-4 border-t border-gray-100 bg-white shrink-0">
                            <Button type="button" variant="secondary" className="w-full py-3" onClick={() => setShowInconformidadeModal(false)}>Fechar Dossiê</Button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Criar Inconformidade */}
            {showCreateInconformidadeModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight flex items-center gap-2">
                                <i className="fas fa-plus text-red-500"></i> Nova Inconformidade
                            </h3>
                            <button onClick={() => setShowCreateInconformidadeModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form id="create-inconformidade-form" onSubmit={(e) => {
                            handleCreateInconformidade(e);
                            if (inconformidadeForm.motivo.trim() && inconformidadeForm.tipo) {
                                setShowCreateInconformidadeModal(false);
                            }
                        }} className="flex-1 overflow-y-auto flex flex-col">
                            <div className="p-6 space-y-4 bg-gray-50/50 flex-1">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Inconformidade *</label>
                                    <input 
                                        list="inconformidade-types-main"
                                        placeholder="Digite o tipo da inconformidade..."
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all"
                                        value={inconformidadeForm.tipo}
                                        onChange={e => setInconformidadeForm({...inconformidadeForm, tipo: e.target.value})}
                                    />
                                    <datalist id="inconformidade-types-main">
                                        {Array.from(new Set(timeline.filter(e => e.tipo === 'inconformidade').map(e => e.tipo_inconformidade || e.tipo))).map(tipo => (
                                            <option key={tipo} value={tipo} />
                                        ))}
                                        <option value="Administrativa" />
                                        <option value="Operacional" />
                                        <option value="Trabalhista" />
                                        <option value="Grave" />
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Motivo / Descrição *</label>
                                    <textarea 
                                        required
                                        className="w-full p-4 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-700 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all resize-none"
                                        rows={6}
                                        placeholder="Descreva detalhadamente o motivo da inconformidade..."
                                        value={inconformidadeForm.motivo}
                                        onChange={e => setInconformidadeForm({...inconformidadeForm, motivo: e.target.value})}
                                    ></textarea>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex-1 relative">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Processo SEI (Opcional)</label>
                                        <input 
                                            type="text"
                                            placeholder="Ex: 00000.000000/0000-00"
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all pr-12"
                                            value={inconformidadeForm.idProcesso}
                                            onChange={e => setInconformidadeForm({...inconformidadeForm, idProcesso: e.target.value})}
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setShowCreateProcessoModal(true)}
                                            className="absolute right-3 top-[38px] text-gray-400 hover:text-purple-600 transition-colors"
                                            title="Criar Novo Processo"
                                        >
                                            <i className="fas fa-folder-plus text-lg"></i>
                                        </button>
                                    </div>
                                    <div className="pt-5">
                                        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 rounded text-red-500 focus:ring-red-500"
                                                checked={inconformidadeForm.resolvido}
                                                onChange={e => setInconformidadeForm({...inconformidadeForm, resolvido: e.target.checked})}
                                            />
                                            Marcar como Resolvida
                                        </label>
                                    </div>
                                </div>
                                
                                {viewMode !== 'lotacao' && viewMode !== 'edital' && (
                                    <div className="flex flex-col sm:flex-row gap-4 border-t border-gray-200 pt-4 mt-2">
                                        <div className="flex-1">
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Vincular a Edital</label>
                                            <button 
                                                type="button"
                                                onClick={() => setSelectionContext({
                                                    active: true,
                                                    entity: 'Edital',
                                                    items: filteredSelectEditais,
                                                    title: 'Selecionar Edital',
                                                    multiSelect: false,
                                                    onSelect: (selectedItem) => {
                                                        setInconformidadeForm({...inconformidadeForm, idEdital: selectedItem.ID_EDITAL});
                                                        setSelectionContext(null);
                                                    }
                                                })}
                                                className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none hover:border-red-400 hover:text-red-600 transition-all text-left flex justify-between items-center shadow-sm"
                                            >
                                                <span className="truncate">
                                                    {inconformidadeForm.idEdital 
                                                        ? editais.find((e:any) => e.ID_EDITAL === inconformidadeForm.idEdital)?.EDITAL || 'Selecionado'
                                                        : 'Selecionar Edital...'}
                                                </span>
                                                <i className="fas fa-search text-gray-400"></i>
                                            </button>
                                            {inconformidadeForm.idEdital && (
                                                <div className="mt-2">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100">
                                                        <i className="fas fa-file-contract"></i> {editais.find((e:any) => e.ID_EDITAL === inconformidadeForm.idEdital)?.EDITAL}
                                                        <i className="fas fa-times cursor-pointer hover:text-red-500" onClick={() => setInconformidadeForm({...inconformidadeForm, idEdital: ''})}></i>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Vincular a Lotação</label>
                                            <button 
                                                type="button"
                                                onClick={() => setSelectionContext({
                                                    active: true,
                                                    entity: 'Lotacao',
                                                    items: filteredSelectLotacoes,
                                                    title: 'Selecionar Lotação',
                                                    multiSelect: false,
                                                    onSelect: (selectedItem) => {
                                                        setInconformidadeForm({...inconformidadeForm, idLotacao: selectedItem.ID_LOTACAO});
                                                        setSelectionContext(null);
                                                    }
                                                })}
                                                className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none hover:border-red-400 hover:text-red-600 transition-all text-left flex justify-between items-center shadow-sm"
                                            >
                                                <span className="truncate">
                                                    {inconformidadeForm.idLotacao 
                                                        ? lotacoes.find((l:any) => l.ID_LOTACAO === inconformidadeForm.idLotacao)?.LOTACAO || 'Selecionado'
                                                        : 'Selecionar Lotação...'}
                                                </span>
                                                <i className="fas fa-search text-gray-400"></i>
                                            </button>
                                            {inconformidadeForm.idLotacao && (
                                                <div className="mt-2">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-orange-50 text-orange-600 text-[10px] font-bold border border-orange-100">
                                                        <i className="fas fa-map-marker-alt"></i> {lotacoes.find((l:any) => l.ID_LOTACAO === inconformidadeForm.idLotacao)?.LOTACAO}
                                                        <i className="fas fa-times cursor-pointer hover:text-red-500" onClick={() => setInconformidadeForm({...inconformidadeForm, idLotacao: ''})}></i>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </form>
                        <footer className="px-6 py-4 border-t border-gray-100 bg-white flex gap-3">
                            <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateInconformidadeModal(false)}>Cancelar</Button>
                            <Button type="submit" form="create-inconformidade-form" disabled={isCreatingInconformidade} className="flex-1 py-3 bg-red-600 hover:bg-red-700 border-none">Registrar</Button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Modal: Criar Processo */}
            {showCreateProcessoModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-simas-dark uppercase tracking-tight flex items-center gap-2">
                                <i className="fas fa-folder-plus text-purple-500"></i> Novo Processo
                            </h3>
                            <button onClick={() => setShowCreateProcessoModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><i className="fas fa-times"></i></button>
                        </header>
                        <form id="create-processo-form" onSubmit={(e) => {
                            handleSaveProcesso(e);
                            setShowCreateProcessoModal(false);
                        }} className="flex-1 overflow-y-auto flex flex-col">
                            <div className="p-6 space-y-4 bg-gray-50/50 flex-1">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Número do Processo (SEI) *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        placeholder="00000.000000/0000-00"
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all"
                                        value={processoData.NUMERO || ''} 
                                        onChange={e => setProcessoData({...processoData, NUMERO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Título / Assunto</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: Apuração de Irregularidades..."
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all"
                                        value={processoData.TITULO || ''} 
                                        onChange={e => setProcessoData({...processoData, TITULO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Status de Encaminhamento</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: Em Análise, Concluído..."
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all"
                                        value={processoData.STATUS_ENCAMINHAMENTO || ''} 
                                        onChange={e => setProcessoData({...processoData, STATUS_ENCAMINHAMENTO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Data de Publicação</label>
                                    <input 
                                        type="date"
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all"
                                        value={processoData.DATA_PUBLICACAO ? new Date(processoData.DATA_PUBLICACAO).toISOString().split('T')[0] : ''} 
                                        onChange={e => setProcessoData({...processoData, DATA_PUBLICACAO: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Texto / Legenda</label>
                                    <textarea 
                                        rows={4}
                                        placeholder="Detalhes ou andamentos importantes do processo..."
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all resize-none"
                                        value={processoData.TEXTO_LEGENDA || ''} 
                                        onChange={e => setProcessoData({...processoData, TEXTO_LEGENDA: e.target.value})}
                                    ></textarea>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 border-t border-gray-200 pt-4 mt-2">
                                    <div className="flex-1">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Vincular a Edital (Obrigatório) *</label>
                                        <button 
                                            type="button"
                                            onClick={() => setSelectionContext({
                                                active: true,
                                                entity: 'Edital',
                                                items: filteredSelectEditais,
                                                title: 'Selecionar Editais',
                                                multiSelect: true,
                                                initialSelection: processoData.editais || [],
                                                onSelect: (selectedItems) => {
                                                    setProcessoData({...processoData, editais: selectedItems});
                                                    setSelectionContext(null);
                                                }
                                            })}
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none hover:border-purple-400 hover:text-purple-600 transition-all text-left flex justify-between items-center shadow-sm"
                                        >
                                            <span className="truncate">
                                                {processoData.editais?.length > 0 
                                                    ? `${processoData.editais.length} edital(is) selecionado(s)` 
                                                    : (viewMode === 'edital' ? 'Edital Atual (Automático)' : 'Selecionar Editais...')}
                                            </span>
                                            <i className="fas fa-search text-gray-400"></i>
                                        </button>
                                        {processoData.editais?.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {processoData.editais.map((ed: any) => (
                                                    <span key={ed.ID_EDITAL} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-50 text-purple-600 text-[10px] font-bold border border-purple-100">
                                                        <i className="fas fa-file-contract"></i> {ed.EDITAL}
                                                        <i className="fas fa-times cursor-pointer hover:text-red-500" onClick={() => setProcessoData({...processoData, editais: processoData.editais.filter((e:any) => e.ID_EDITAL !== ed.ID_EDITAL)})}></i>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Vincular a Lotação (Opcional)</label>
                                        <button 
                                            type="button"
                                            onClick={() => setSelectionContext({
                                                active: true,
                                                entity: 'Lotacao',
                                                items: filteredSelectLotacoes,
                                                title: 'Selecionar Lotações',
                                                multiSelect: true,
                                                initialSelection: processoData.lotacoes || [],
                                                onSelect: (selectedItems) => {
                                                    setProcessoData({...processoData, lotacoes: selectedItems});
                                                    setSelectionContext(null);
                                                }
                                            })}
                                            className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 outline-none hover:border-purple-400 hover:text-purple-600 transition-all text-left flex justify-between items-center shadow-sm"
                                        >
                                            <span className="truncate">
                                                {processoData.lotacoes?.length > 0 
                                                    ? `${processoData.lotacoes.length} lotação(ões) selecionada(s)` 
                                                    : (viewMode === 'lotacao' ? 'Lotação Atual (Automática)' : 'Selecionar Lotações...')}
                                            </span>
                                            <i className="fas fa-search text-gray-400"></i>
                                        </button>
                                        {processoData.lotacoes?.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {processoData.lotacoes.map((lot: any) => (
                                                    <span key={lot.ID_LOTACAO} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-orange-50 text-orange-600 text-[10px] font-bold border border-orange-100">
                                                        <i className="fas fa-map-marker-alt"></i> {lot.LOTACAO}
                                                        <i className="fas fa-times cursor-pointer hover:text-red-500" onClick={() => setProcessoData({...processoData, lotacoes: processoData.lotacoes.filter((l:any) => l.ID_LOTACAO !== lot.ID_LOTACAO)})}></i>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </form>
                        <footer className="px-6 py-4 border-t border-gray-100 bg-white flex gap-3">
                            <Button type="button" variant="secondary" className="flex-1 py-3" onClick={() => setShowCreateProcessoModal(false)}>Cancelar</Button>
                            <Button type="submit" form="create-processo-form" className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 border-none">Criar Processo</Button>
                        </footer>
                    </div>
                </div>
            )}
            {showCreatePessoaModal && (
                <CreatePessoaModal 
                    showToast={showToast}
                    onClose={() => setShowCreatePessoaModal(false)}
                    onSuccess={(novaPessoa) => {
                        setShowCreatePessoaModal(false);
                        if (showFillVagaModal) {
                            setFillVagaData({ ...fillVagaData, CPF: novaPessoa.CPF, NOME_PESSOA: novaPessoa.NOME });
                        }
                    }}
                />
            )}
        </div>
    );

};
