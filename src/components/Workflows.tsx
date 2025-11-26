
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { UserSession, RecordData, AppContextProps } from '../types';
import { DROPDOWN_OPTIONS, DROPDOWN_STRUCTURES } from '../constants';
import { businessLogic } from '../utils/businessLogic';

interface WorkflowsProps extends AppContextProps {}

export const Workflows: React.FC<WorkflowsProps> = ({ showToast }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');
  
  // New Request Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState<RecordData>({});
  const [submitting, setSubmitting] = useState(false);
  
  // Lookup Data for the Form
  const [people, setPeople] = useState<any[]>([]);
  const [vagas, setVagas] = useState<any[]>([]);
  
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
          const [pData, vData, cData, sData] = await Promise.all([
              api.fetchEntity('PESSOA'),
              api.fetchEntity('VAGAS'),
              api.fetchEntity('CONTRATO'),
              api.fetchEntity('SERVIDOR')
          ]);
          setPeople(pData);
          setVagas(vData);
          setContracts(cData);
          setServers(sData);
      } catch (e) {
          console.error("Failed to load lookups", e);
      }
  };

  const filteredRequests = useMemo(() => {
      return requests.filter(req => {
          if (filterStatus === 'ALL') return true;
          const isCompleted = req.STATUS_PEDIDO === 'Acatado' || req.STATUS_PEDIDO === 'Declinado';
          if (filterStatus === 'COMPLETED') return isCompleted;
          if (filterStatus === 'PENDING') return !isCompleted;
          return true;
      });
  }, [requests, filterStatus]);

  // --- FORM LOGIC ---

  const resetForm = () => {
      setFormData({
          ID_ATENDIMENTO: '',
          CPF: '',
          TIPO_PEDIDO: '',
          STATUS_PEDIDO: 'Aguardando', // Default
          REMETENTE: session.papel === 'GGT' ? 'Prefeitura' : '',
          RESPONSAVEL: session.usuario,
          DESCRICAO: '',
          JUSTIFICATIVA: '',
          DATA_AGENDAMENTO: '',
          ID_VAGA: '' // Special field for 'Reserva de Vaga'
      });
  };

  const handleOpenNew = () => {
      resetForm();
      setShowNewModal(true);
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
      if (formData.TIPO_PEDIDO === 'Reserva de Vaga' && !formData.ID_VAGA) {
          showToast('error', 'Selecione uma vaga para realizar a reserva.');
          return;
      }

      setSubmitting(true);
      try {
          let payload = { ...formData };
          payload['ID_ATENDIMENTO'] = `ATD${Math.floor(Math.random() * 1000000)}`;
          payload['DATA_ENTRADA'] = new Date().toISOString(); // Simulate server-side setting

          // Calculate metadata (Action Type, Target Entity)
          const metadata = businessLogic.calculateAtendimentoMetadata(payload);
          payload = { ...payload, ...metadata };

          const res = await api.createRecord('ATENDIMENTO', payload);
          if (res.success) {
              showToast('success', 'Fluxo iniciado com sucesso!');
              setShowNewModal(false);
              loadRequests();
          } else {
              showToast('error', res.message || 'Erro ao criar fluxo.');
          }
      } catch (e) {
          showToast('error', 'Erro de conexão.');
      } finally {
          setSubmitting(false);
      }
  };

  // --- RENDERERS ---

  const renderKanbanColumn = (title: string, statusFilter: (req: any) => boolean, color: string) => {
      const items = filteredRequests.filter(statusFilter);
      
      return (
          <div className="flex-1 min-w-[300px] bg-gray-100/50 rounded-2xl p-4 flex flex-col h-full border border-gray-200/50">
              <div className={`flex items-center justify-between mb-4 pb-2 border-b border-${color}-200`}>
                  <h3 className={`font-bold text-${color}-700 uppercase tracking-wide text-sm`}>{title}</h3>
                  <span className={`bg-${color}-100 text-${color}-800 text-xs font-bold px-2 py-1 rounded-full`}>{items.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {items.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic border-2 border-dashed border-gray-200 rounded-xl">
                          Nenhum item
                      </div>
                  ) : (
                      items.map(req => (
                          <div key={req.ID_ATENDIMENTO} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group relative">
                              {/* Status Stripe */}
                              <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-${color}-400`}></div>
                              
                              <div className="pl-3">
                                  <div className="flex justify-between items-start mb-1">
                                      <h4 className="font-bold text-simas-dark text-sm truncate pr-2" title={req.TIPO_PEDIDO}>{req.TIPO_PEDIDO}</h4>
                                      <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{req.ID_ATENDIMENTO}</span>
                                  </div>
                                  
                                  <p className="text-sm text-gray-600 mb-2 font-medium">{req.NOME_PESSOA || req.CPF}</p>
                                  
                                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                                      <i className="far fa-calendar"></i>
                                      <span>{new Date(req.DATA_ENTRADA).toLocaleDateString()}</span>
                                  </div>

                                  <div className="flex justify-between items-center border-t border-gray-50 pt-2 mt-2">
                                      <div className="flex items-center gap-1">
                                          <div className="w-5 h-5 rounded-full bg-gray-200 text-[10px] flex items-center justify-center text-gray-600 font-bold">
                                              {(req.RESPONSAVEL || '?').substring(0,1)}
                                          </div>
                                          <span className="text-[10px] text-gray-500 truncate max-w-[80px]">{req.RESPONSAVEL}</span>
                                      </div>
                                      
                                      {req.STATUS_PEDIDO === 'Acatado' && req.STATUS_AGENDAMENTO === 'Pendente' && (
                                          <span className="flex items-center gap-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full animate-pulse">
                                              <i className="fas fa-clock"></i> Agendado
                                          </span>
                                      )}
                                  </div>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
            <div>
                <h1 className="text-2xl font-black text-simas-dark tracking-tight">Central de Atendimentos</h1>
                <p className="text-sm text-gray-500 mt-1">Gerencie solicitações e fluxos de trabalho</p>
            </div>
            <div className="flex gap-3">
                <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
                    <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'ALL' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:text-gray-700'}`}>Todos</button>
                    <button onClick={() => setFilterStatus('PENDING')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'PENDING' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:text-gray-700'}`}>Pendentes</button>
                    <button onClick={() => setFilterStatus('COMPLETED')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === 'COMPLETED' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:text-gray-700'}`}>Finalizados</button>
                </div>
                <Button onClick={handleOpenNew} icon="fas fa-plus">Novo Atendimento</Button>
            </div>
        </div>

        {/* Kanban Content */}
        <div className="flex-1 overflow-x-auto p-6">
            <div className="flex gap-6 h-full min-w-[1000px]">
                {renderKanbanColumn("Aguardando", r => r.STATUS_PEDIDO === 'Aguardando', 'yellow')}
                {renderKanbanColumn("Em Execução / Agendado", r => r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO !== 'Concluído', 'blue')}
                {renderKanbanColumn("Concluído", r => r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO === 'Concluído', 'green')}
                {renderKanbanColumn("Declinado / Cancelado", r => r.STATUS_PEDIDO === 'Declinado', 'red')}
            </div>
        </div>

        {/* New Request Modal */}
        {showNewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-slide-in">
                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-xl text-simas-dark">Iniciar Novo Fluxo</h3>
                        <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-red-500"><i className="fas fa-times"></i></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-8">
                        <form id="workflow-form" onSubmit={handleSubmit} className="space-y-6">
                            
                            {/* Pessoa Selection */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Pessoa</label>
                                <select 
                                    required 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                    value={formData.CPF}
                                    onChange={(e) => setFormData({...formData, CPF: e.target.value})}
                                >
                                    <option value="">Selecione uma pessoa...</option>
                                    {people.map(p => <option key={p.CPF} value={p.CPF}>{p.NOME} ({p.CPF})</option>)}
                                </select>
                            </div>

                            {/* Type Selection */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tipo de Pedido</label>
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
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Remetente</label>
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

                            {/* Conditional Vaga for Reserva */}
                            {formData.TIPO_PEDIDO === 'Reserva de Vaga' && (
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <label className="block text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Vaga a Reservar</label>
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
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Status Inicial</label>
                                    <select 
                                        required 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                        value={formData.STATUS_PEDIDO}
                                        onChange={(e) => setFormData({...formData, STATUS_PEDIDO: e.target.value})}
                                    >
                                        <option value="Aguardando">Aguardando</option>
                                        <option value="Acatado">Acatado (Executar)</option>
                                        <option value="Declinado">Declinado</option>
                                    </select>
                                </div>
                                
                                {formData.STATUS_PEDIDO === 'Declinado' && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Justificativa</label>
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
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Data Agendamento/Revisão</label>
                                        <input 
                                            type="date"
                                            required
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                                            value={formData.DATA_AGENDAMENTO}
                                            onChange={(e) => setFormData({...formData, DATA_AGENDAMENTO: e.target.value})}
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Descrição / Observações</label>
                                <textarea 
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none h-24 resize-none"
                                    placeholder="Detalhes adicionais..."
                                    value={formData.DESCRICAO}
                                    onChange={(e) => setFormData({...formData, DESCRICAO: e.target.value})}
                                ></textarea>
                            </div>

                        </form>
                    </div>

                    <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setShowNewModal(false)} disabled={submitting}>Cancelar</Button>
                        <Button onClick={handleSubmit} isLoading={submitting}>Criar Fluxo</Button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
