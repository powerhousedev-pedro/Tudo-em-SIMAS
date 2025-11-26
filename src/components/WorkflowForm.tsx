
import React from 'react';
import { Button } from './Button';
import { RecordData, UserSession } from '../types';
import { DROPDOWN_OPTIONS, DROPDOWN_STRUCTURES } from '../constants';

interface WorkflowFormProps {
  formData: RecordData;
  session: UserSession;
  people: any[];
  vagas: any[];
  setFormData: (data: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
}

export const WorkflowForm: React.FC<WorkflowFormProps> = ({ 
  formData, session, people, vagas, setFormData, onSubmit, onCancel, submitting 
}) => {

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

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      // Ensure ID_VAGA is undefined/null if not "Reserva de Vaga" to avoid backend confusion
      const payload = { ...formData };
      if (payload.TIPO_PEDIDO !== 'Reserva de Vaga') {
          delete payload.ID_VAGA;
      }
      // Parent component handles the actual API call logic, but we ensure clean data here if passed up
      // In this specific component structure, onSubmit is passed down, so we rely on parent.
      // However, the parent uses formData state directly. 
      // So we update the state to clear ID_VAGA if type changed before submit?
      // Better to handle this cleanup in the parent's handleSubmit.
      onSubmit(e);
  };

  return (
    <div className="flex flex-col h-full">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-xl text-simas-dark">Iniciar Novo Fluxo</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-red-500"><i className="fas fa-times"></i></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8">
            <form id="workflow-form" onSubmit={handleSubmit} className="space-y-6">
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

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tipo de Pedido</label>
                        <select 
                            required 
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-simas-light/30 outline-none"
                            value={formData.TIPO_PEDIDO}
                            onChange={(e) => {
                                const newVal = e.target.value;
                                const updates: any = { TIPO_PEDIDO: newVal };
                                if (newVal !== 'Reserva de Vaga') updates.ID_VAGA = '';
                                setFormData({...formData, ...updates});
                            }}
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
                            disabled={session.papel === 'GGT'}
                        >
                            <option value="">Selecione...</option>
                            {getFilteredOptions('REMETENTE').map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                </div>

                {formData.TIPO_PEDIDO === 'Reserva de Vaga' && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-fade-in">
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
            <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancelar</Button>
            <Button onClick={handleSubmit} isLoading={submitting}>Criar Fluxo</Button>
        </div>
    </div>
  );
};
