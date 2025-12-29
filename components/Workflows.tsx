

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { UserSession, RecordData, AppContextProps } from '../types';
import { ENTITY_CONFIGS, DROPDOWN_OPTIONS, DROPDOWN_STRUCTURES, DATA_MODEL } from '../constants';
import { businessLogic } from '../utils/businessLogic';
import { Card } from './Card'; 
import { validation } from '../utils/validation';

interface WorkflowsProps extends AppContextProps {}

export const Workflows: React.FC<WorkflowsProps> = ({ showToast }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');
  const [columnSearchTerms, setColumnSearchTerms] = useState<Record<string, string>>({});
  
  // New/Edit Request Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<RecordData>({});
  const [submitting, setSubmitting] = useState(false);
  
  // Lookup Data for the Form
  const [people, setPeople] = useState<any[]>([]);
  const [vagas, setVagas] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]); // List of system users for delegation
  
  // Validations for form logic (replicated from Dashboard/Legacy)
  const [contracts, setContracts] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);

  const getSession = (): UserSession => {
      const stored = localStorage.getItem('simas_user_session');
      if (stored) {
          try { return JSON.parse(stored); } catch (e) {}
      }
      return { token: '', papel: 'GGT', usuario: '', isGerente: false };
  };
  const session = getSession();

  // Date helper
  const today = new Date().toISOString().split('T')[0];
  const isFuture = (dateString: string) => {
      if (!dateString) return false;
      return dateString > today;
  };

  useEffect(() => {
    loadRequests();
    loadLookups();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      // Fetch all Atendimentos. In a real scenario, API should support filtering.
      // Here we fetch all and filter client-side for the mock.
      const data = await api.fetchEntity('ATENDIMENTO');
      
      // Sort by date descending
      data.sort((a: any, b: any) => new Date(b.DATA_ENTRADA).getTime() - new Date(a.DATA_ENTRADA).getTime());
      
      setRequests(data);
    } catch (e) {
      showToast('error', 'Erro ao carregar fluxos.');
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
      try {
          const [pData, vData, cData, sData, uData] = await Promise.all([
              api.fetchEntity('PESSOA'),
              api.fetchEntity('VAGAS'),
              api.fetchEntity('CONTRATO'),
              api.fetchEntity('SERVIDOR'),
              api.getUsers()
          ]);
          setPeople(pData);
          setVagas(vData);
          setContracts(cData);
          setServers(sData);
          setUsers(uData);
      } catch (e) {
          console.error("Failed to load lookups", e);
      }
  };

  const filteredRequests = useMemo(() => {
      return requests.filter(req => {
          // 1. Role / Sector Filtering
          let isVisibleForRole = false;
          const type = req.TIPO_PEDIDO;
          const struct = DROPDOWN_STRUCTURES['TIPO_PEDIDO'];

          if (session.papel === 'COORDENAÇÃO') {
              isVisibleForRole = true;
          } else if (session.papel === 'GGT') {
              // GGT sees Server actions and General
              if (struct.SERVIDOR.includes(type) || struct.GERAL.includes(type)) isVisibleForRole = true;
          } else if (session.papel === 'GPRGP') {
              // GPRGP sees Contract actions, Specific GPRGP and General
              if (struct.CONTRATADO.includes(type) || struct.GPRGP_ESPECIFICO.includes(type) || struct.GERAL.includes(type)) isVisibleForRole = true;
          } else {
              // GDEP and others see General
              if (struct.GERAL.includes(type)) isVisibleForRole = true;
          }

          // Force visibility if the user is the creator or responsible
          if (req.RESPONSAVEL === session.usuario) {
              isVisibleForRole = true;
          }
          
          // Force visibility if user is manager of the creator's sector (Simplified check)
          if (session.isGerente && !isVisibleForRole) {
              // Assuming same sector visibility logic applied above covers basic cases.
              // Managers should see tasks assigned to anyone in their sector?
              // Current logic uses task TYPE to determine sector, which is correct.
          }

          if (!isVisibleForRole) return false;

          // 2. Status Filtering
          if (filterStatus === 'ALL') return true;
          const isCompleted = req.STATUS_PEDIDO === 'Acatado' || req.STATUS_PEDIDO === 'Declinado';
          if (filterStatus === 'COMPLETED') return isCompleted;
          if (filterStatus === 'PENDING') return !isCompleted;
          
          return true;
      });
  }, [requests, filterStatus, session.papel, session.usuario, session.isGerente]);

  // --- FORM LOGIC ---

  const getEligibleAssignees = () => {
      // COORDENAÇÃO: Pode delegar para todos
      if (session.papel === 'COORDENAÇÃO') return users;
      
      // GERENTE: Pode delegar para usuários do mesmo papel
      if (session.isGerente) return users.filter(u => u.papel === session.papel);
      
      // USUÁRIO COMUM: Apenas ele mesmo
      return users.filter(u => u.usuario === session.usuario);
  };

  const resetForm = (existingData?: any) => {
      if (existingData) {
          // Editing Mode
          setFormData({ ...existingData });
          setIsEditing(true);
      } else {
          // Creation Mode
          setFormData({
              ID_ATENDIMENTO: '',
              CPF: '',
              TIPO_PEDIDO: '',
              STATUS_PEDIDO: 'Aguardando', // Default
              REMETENTE: session.papel === 'GGT' ? 'Prefeitura' : '',
              RESPONSAVEL: session.usuario, // Default to self
              DESCRICAO: '',
              JUSTIFICATIVA: '',
              DATA_AGENDAMENTO: '',
              ID_VAGA: '' // Special field for 'Reserva de Vaga'
          });
          setIsEditing(false);
      }
  };

  const handleOpenModal = (req?: any) => {
      resetForm(req);
      setShowModal(true);
  };

  const getFilteredOptions = (field: string): string[] => {
      const papel = session.papel;
      
      if (field === 'TIPO_PEDIDO') {
          const struct = DROPDOWN_STRUCTURES['TIPO_PEDIDO'];
          let options: string[] = [...struct.GERAL];
          if (papel === 'GPRGP') options.push(...struct.CONTRATADO, ...struct.GPRGP_ESPECIFICO);
          else if (papel === 'GGT') options.push(...struct.SERVIDOR);
          else if (papel === 'COORDENAÇÃO') options.push(...struct.CONTRATADO, ...struct.SERVIDOR, ...struct.GPRGP_ESPECIFICO);
          return [...new Set(options)].sort();
      }
      
      if (field === 'JUSTIFICATIVA') {
          const struct = DROPDOWN_STRUCTURES['JUSTIFICATIVA'];
          let options: string[] = [...struct.GERAL];
          if (papel === 'GPRGP') options.push(...struct.CONTRATADO);
          else if (papel === 'GGT') options.push(...struct.SERVIDOR);
          else if (papel === 'COORDENAÇÃO') options.push(...struct.CONTRATADO, ...struct.SERVIDOR);
          return [...new Set(options)].sort();
      }

      if (field === 'REMETENTE') {
          if (papel === 'GPRGP') return DROPDOWN_STRUCTURES['REMETENTE'].filter((o: string) => o !== 'Prefeitura');
          return DROPDOWN_STRUCTURES['REMETENTE'];
      }

      return (DROPDOWN_OPTIONS[field] as string[]) || [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // --- Business Logic Validations ---
      if (!isEditing) {
          const typesRequiringContract = ["Demissão", "Promoção (Contratado)", "Mudança (Contratado)"];
          const typesRequiringServer = ["Exoneração de Cargo Comissionado", "Exoneração do Serviço Público", "Mudança de Alocação (Servidor)"];
          
          if (typesRequiringContract.includes(formData.TIPO_PEDIDO)) {
              const hasContract = contracts.some(c => c.CPF === formData.CPF);
              if (!hasContract) {
                  showToast('error', `Ação não permitida. A pessoa não possui um contrato ativo.`);
                  return;
              }
          }
          if (typesRequiringServer.includes(formData.TIPO_PEDIDO)) {
              const hasServer = servers.some(c => c.CPF === formData.CPF);
              if (!hasServer) {
                  showToast('error', `Ação não permitida. A pessoa não é um servidor ativo.`);
                  return;
              }
          }
      }

      if (formData.TIPO_PEDIDO === 'Reserva de Vaga' && !formData.ID_VAGA) {
          showToast('error', 'Selecione uma vaga para realizar a reserva.');
          return;
      }

      setSubmitting(true);
      try {
          let payload = { ...formData };
          
          if (isEditing) {
              // Update existing
              // Recalculate metadata in case status changed
              const metadata = businessLogic.calculateAtendimentoMetadata(payload);
              payload = { ...payload, ...metadata };

              const res = await api.updateRecord('ATENDIMENTO', 'ID_ATENDIMENTO', payload.ID_ATENDIMENTO, payload);
              if (res.success) {
                  showToast('success', 'Fluxo atualizado!');
                  setShowModal(false);
                  loadRequests();
              } else {
                  showToast('error', res.message || 'Erro ao atualizar fluxo.');
              }
          } else {
              // Create new
              payload['ID_ATENDIMENTO'] = validation.generateLegacyId('ATD');
              payload['DATA_ENTRADA'] = new Date().toISOString(); // Simulate server-side setting

              const metadata = businessLogic.calculateAtendimentoMetadata(payload);
              payload = { ...payload, ...metadata };

              const res = await api.createRecord('ATENDIMENTO', payload);
              if (res.success) {
                  showToast('success', 'Fluxo iniciado com sucesso!');
                  setShowModal(false);
                  loadRequests();
              } else {
                  showToast('error', res.message || 'Erro ao criar fluxo.');
              }
          }
      } catch (e) {
          showToast('error', 'Erro de conexão.');
      } finally {
          setSubmitting(false);
      }
  };

  // --- RENDERERS ---

  const renderKanbanColumn = (title: string, statusFilter: (req: any) => boolean, color: string, colId: string) => {
      const searchTerm = (columnSearchTerms[colId] || '').toLowerCase();
      
      const items = filteredRequests
        .filter(statusFilter)
        .filter(req => 
             !searchTerm || 
             `${req.TIPO_PEDIDO} ${req.NOME_PESSOA || ''} ${req.CPF || ''}`.toLowerCase().includes(searchTerm)
        );
      
      return (
          <div className="flex-1 min-w-[300px] bg-gray-100/50 rounded-2xl p-4 flex flex-col h-full border border-gray-200/50">
              <div className={`flex items-center justify-between mb-4 pb-2 border-b border-${color}-200`}>
                  <h3 className={`font-medium text-${color}-700 uppercase tracking-wide text-sm`}>{title}</h3>
                  <span className={`bg-${color}-100 text-${color}-800 text-xs font-bold px-2 py-1 rounded-full`}>{items.length}</span>
              </div>
              
              <div className="mb-4 relative">
                   <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                   <input 
                       type="text"
                       placeholder="Buscar nesta coluna..."
                       className="w-full pl-8 pr-3 py-2 bg-white rounded-xl border border-gray-200 text-xs focus:ring-1 focus:ring-simas-cyan focus:border-simas-cyan outline-none transition-all shadow-sm"
                       value={columnSearchTerms[colId] || ''}
                       onChange={(e) => setColumnSearchTerms(prev => ({...prev, [colId]: e.target.value}))}
                   />
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {items.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic border-2 border-dashed border-gray-200 rounded-xl">
                          Nenhum item
                      </div>
                  ) : (
                      items.map(req => {
                          const isFutureItem = isFuture(req.DATA_AGENDAMENTO);
                          
                          return (
                            <div 
                                key={req.ID_ATENDIMENTO} 
                                onClick={() => handleOpenModal(req)}
                                className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group relative hover:border-simas-cyan/30"
                            >
                                {/* Status Stripe */}
                                <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-${color}-400`}></div>
                                
                                <div className="pl-3">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-medium text-simas-dark text-sm truncate pr-2 uppercase" title={req.TIPO_PEDIDO}>{req.TIPO_PEDIDO}</h4>
                                        <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 group-hover:bg-simas-cyan group-hover:text-white transition-colors">{req.ID_ATENDIMENTO}</span>
                                    </div>
                                    
                                    <p className="text-sm text-gray-600 mb-2 font-normal">{req.NOME_PESSOA || req.CPF}</p>
                                    
                                    {isFutureItem ? (
                                        <div className="mb-3">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                                                <i className="far fa-clock"></i> 
                                                Agendado: {new Date(req.DATA_AGENDAMENTO).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                                            <i className="far fa-calendar"></i>
                                            <span>Entrada: {new Date(req.DATA_ENTRADA).toLocaleDateString()}</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center border-t border-gray-50 pt-2 mt-2">
                                        <div className="flex items-center gap-1">
                                            <div className="w-5 h-5 rounded-full bg-gray-200 text-[10px] flex items-center justify-center text-gray-600 font-bold uppercase">
                                                {(req.RESPONSAVEL || '?').substring(0,1)}
                                            </div>
                                            <span className="text-[10px] text-gray-500 truncate max-w-[80px] font-medium">{req.RESPONSAVEL}</span>
                                        </div>
                                        
                                        {req.STATUS_PEDIDO === 'Acatado' && req.STATUS_AGENDAMENTO === 'Pendente' && !isFutureItem && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full animate-pulse border border-green-100">
                                                <i className="fas fa-play-circle"></i> Executar
                                            </span>
                                        )}

                                        {req.STATUS_PEDIDO === 'Aguardando' && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-100">
                                                <i className="fas fa-hourglass-start"></i> Análise
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                  )}
              </div>
          </div>
      );
  };

  const eligibleAssignees = getEligibleAssignees();
  const canDelegate = session.isGerente || session.papel === 'COORDENAÇÃO';

  return (
    <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
            <div>
                <h1 className="text-2xl font-black text-simas-dark tracking-brand uppercase">Central de Atendimentos</h1>
                <p className="text-sm text-gray-500 mt-1">Gerencie solicitações e fluxos de trabalho</p>
            </div>
            <div className="flex gap-3">
                <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
                    <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'ALL' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:text-gray-700'}`}>Todos</button>
                    <button onClick={() => setFilterStatus('PENDING')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'PENDING' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:text-gray-700'}`}>Pendentes</button>
                    <button onClick={() => setFilterStatus('COMPLETED')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'COMPLETED' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:text-gray-700'}`}>Finalizados</button>
                </div>
                <Button onClick={() => handleOpenModal()} icon="fas fa-plus">Novo Atendimento</Button>
            </div>
        </div>

        {/* Kanban Content */}
        <div className="flex-1 overflow-x-auto p-6">
            <div className="flex gap-6 h-full min-w-[1000px]">
                {/* COLUNA 1: Aguardando Decisão OU Agendado para Futuro */}
                {renderKanbanColumn(
                    "Aguardando / Agendado Futuro", 
                    r => r.STATUS_PEDIDO === 'Aguardando' || (r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO !== 'Concluído' && isFuture(r.DATA_AGENDAMENTO)), 
                    'yellow', 
                    'waiting'
                )}
                
                {/* COLUNA 2: Acatado E Data Chegou (Pronto para Execução) */}
                {renderKanbanColumn(
                    "Pronto para Execução", 
                    r => r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO !== 'Concluído' && !isFuture(r.DATA_AGENDAMENTO), 
                    'blue', 
                    'executing'
                )}
                
                {/* COLUNA 3: Concluídos */}
                {renderKanbanColumn(
                    "Concluído", 
                    r => r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO === 'Concluído', 
                    'green', 
                    'done'
                )}
                
                {/* COLUNA 4: Declinados */}
                {renderKanbanColumn(
                    "Declinado / Cancelado", 
                    r => r.STATUS_PEDIDO === 'Declinado', 
                    'red', 
                    'declined'
                )}
            </div>
        </div>

        {/* Request Modal (Create/Edit) */}
        {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-slide-in">
                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <div>
                            <h3 className="font-bold text-xl text-simas-dark uppercase">{isEditing ? 'Editar Fluxo' : 'Iniciar Novo Fluxo'}</h3>
                            {isEditing && <span className="text-xs bg-simas-cyan/10 text-simas-cyan px-2 py-0.5 rounded font-bold uppercase">{formData.ID_ATENDIMENTO}</span>}
                        </div>
                        <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times"></i></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-8">
                        <form id="workflow-form" onSubmit={handleSubmit} className="space-y-6">
                            
                            {/* Pessoa Selection */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Pessoa</label>
                                <select 
                                    required 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none disabled:bg-gray-100"
                                    value={formData.CPF}
                                    onChange={(e) => setFormData({...formData, CPF: e.target.value})}
                                    disabled={isEditing} // Cannot change person once flow starts
                                >
                                    <option value="">Selecione uma pessoa...</option>
                                    {people.map(p => <option key={p.CPF} value={p.CPF}>{(p.NOME_SOCIAL || p.NOME)} ({p.CPF})</option>)}
                                </select>
                            </div>

                            {/* Type Selection */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Tipo de Pedido</label>
                                    <select 
                                        required 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                        value={formData.TIPO_PEDIDO}
                                        onChange={(e) => setFormData({...formData, TIPO_PEDIDO: e.target.value})}
                                    >
                                        <option value="">Selecione...</option>
                                        {getFilteredOptions('TIPO_PEDIDO').map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Remetente</label>
                                    <select 
                                        required 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                        value={formData.REMETENTE}
                                        onChange={(e) => setFormData({...formData, REMETENTE: e.target.value})}
                                        disabled={session.papel === 'GGT'} // GGT locked to Prefeitura
                                    >
                                        <option value="">Selecione...</option>
                                        {getFilteredOptions('REMETENTE').map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* DELEGATION (Responsible) */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                                    <span>Responsável (Atribuído a)</span>
                                    {!canDelegate && <span className="text-[10px] text-gray-300 italic">Somente Gerência pode delegar</span>}
                                </label>
                                <div className="relative">
                                    <i className="fas fa-user-check absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan"></i>
                                    <select 
                                        required 
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none disabled:bg-gray-100 disabled:text-gray-500 cursor-pointer disabled:cursor-not-allowed"
                                        value={formData.RESPONSAVEL}
                                        onChange={(e) => setFormData({...formData, RESPONSAVEL: e.target.value})}
                                        disabled={!canDelegate}
                                    >
                                        {eligibleAssignees.map(u => (
                                            <option key={u.id || u.usuario} value={u.usuario}>
                                                {u.usuario} {u.usuario === session.usuario ? '(Você)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Conditional Vaga for Reserva */}
                            {formData.TIPO_PEDIDO === 'Reserva de Vaga' && (
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <label className="block text-xs font-medium text-blue-400 uppercase tracking-widest mb-2">Vaga a Reservar</label>
                                    <select 
                                        required 
                                        className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none"
                                        value={formData.ID_VAGA}
                                        onChange={(e) => setFormData({...formData, ID_VAGA: e.target.value})}
                                    >
                                        <option value="">Selecione uma vaga disponível...</option>
                                        {vagas.filter(v => v.STATUS_VAGA !== 'Ocupada' && v.STATUS_VAGA !== 'Bloqueada').map(v => (
                                            <option key={v.ID_VAGA} value={v.ID_VAGA}>{v.CARGO_NOME} em {v.LOTACAO_NOME}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Status & Justification */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Status do Fluxo</label>
                                    <select 
                                        required 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                        value={formData.STATUS_PEDIDO}
                                        onChange={(e) => setFormData({...formData, STATUS_PEDIDO: e.target.value})}
                                    >
                                        <option value="Aguardando">Aguardando Análise</option>
                                        <option value="Acatado">Acatado (Aprovar)</option>
                                        <option value="Declinado">Declinado (Rejeitar)</option>
                                    </select>
                                </div>
                                
                                {formData.STATUS_PEDIDO === 'Declinado' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Justificativa</label>
                                        <select 
                                            required 
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                            value={formData.JUSTIFICATIVA}
                                            onChange={(e) => setFormData({...formData, JUSTIFICATIVA: e.target.value})}
                                        >
                                            <option value="">Selecione...</option>
                                            {getFilteredOptions('JUSTIFICATIVA').map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                )}

                                {((formData.STATUS_PEDIDO === 'Acatado' && formData.TIPO_PEDIDO !== 'Reserva de Vaga') || formData.STATUS_PEDIDO === 'Aguardando') && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Data Agendamento/Revisão</label>
                                        <input 
                                            type="date"
                                            required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                            value={formData.DATA_AGENDAMENTO ? new Date(formData.DATA_AGENDAMENTO).toISOString().split('T')[0] : ''}
                                            onChange={(e) => setFormData({...formData, DATA_AGENDAMENTO: e.target.value})}
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Descrição / Observações</label>
                                <textarea 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none h-24 resize-none"
                                    placeholder="Detalhes adicionais..."
                                    value={formData.DESCRICAO || ''}
                                    onChange={(e) => setFormData({...formData, DESCRICAO: e.target.value})}
                                ></textarea>
                            </div>

                        </form>
                    </div>

                    <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setShowModal(false)} disabled={submitting}>Cancelar</Button>
                        <Button onClick={handleSubmit} isLoading={submitting}>{isEditing ? 'Salvar Alterações' : 'Criar Fluxo'}</Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
