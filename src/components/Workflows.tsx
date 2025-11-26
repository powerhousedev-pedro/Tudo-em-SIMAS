
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { UserSession, RecordData, AppContextProps } from '../types';
import { businessLogic } from '../utils/businessLogic';
import { WorkflowKanban } from './WorkflowKanban';
import { WorkflowForm } from './WorkflowForm';

interface WorkflowsProps extends AppContextProps {}

export const Workflows: React.FC<WorkflowsProps> = ({ showToast }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [formData, setFormData] = useState<RecordData>({});
  const [submitting, setSubmitting] = useState(false);
  
  const [people, setPeople] = useState<any[]>([]);
  const [vagas, setVagas] = useState<any[]>([]);
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
    try {
      const data = await api.fetchEntity('ATENDIMENTO');
      data.sort((a: any, b: any) => new Date(b.DATA_ENTRADA).getTime() - new Date(a.DATA_ENTRADA).getTime());
      setRequests(data);
    } catch (e) {
      showToast('error', 'Erro ao carregar fluxos.');
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

  const resetForm = () => {
      setFormData({
          ID_ATENDIMENTO: '',
          CPF: '',
          TIPO_PEDIDO: '',
          STATUS_PEDIDO: 'Aguardando',
          REMETENTE: session.papel === 'GGT' ? 'Prefeitura' : '',
          RESPONSAVEL: session.usuario,
          DESCRICAO: '',
          JUSTIFICATIVA: '',
          DATA_AGENDAMENTO: '',
          ID_VAGA: ''
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Business Logic Validations
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
          payload['DATA_ENTRADA'] = new Date().toISOString();

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

  return (
    <div className="flex flex-col h-full bg-gray-50">
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
                <Button onClick={() => { resetForm(); setShowNewModal(true); }} icon="fas fa-plus">Novo Atendimento</Button>
            </div>
        </div>

        <div className="flex-1 overflow-x-auto p-6">
            <WorkflowKanban requests={requests} filterStatus={filterStatus} />
        </div>

        {showNewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-slide-in">
                <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <WorkflowForm 
                        formData={formData}
                        session={session}
                        people={people}
                        vagas={vagas}
                        setFormData={(d) => setFormData(prev => ({...prev, ...d}))}
                        onSubmit={handleSubmit}
                        onCancel={() => setShowNewModal(false)}
                        submitting={submitting}
                    />
                </div>
            </div>
        )}
    </div>
  );
};
