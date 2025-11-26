
import React from 'react';

interface WorkflowKanbanProps {
  requests: any[];
  filterStatus: 'ALL' | 'PENDING' | 'COMPLETED';
}

export const WorkflowKanban: React.FC<WorkflowKanbanProps> = ({ requests, filterStatus }) => {
  
  const renderColumn = (title: string, statusFilter: (req: any) => boolean, color: string) => {
      const filtered = requests.filter(req => {
          if (filterStatus === 'ALL') return true;
          const isCompleted = req.STATUS_PEDIDO === 'Acatado' || req.STATUS_PEDIDO === 'Declinado';
          if (filterStatus === 'COMPLETED') return isCompleted;
          if (filterStatus === 'PENDING') return !isCompleted;
          return true;
      }).filter(statusFilter);
      
      return (
          <div className="flex-1 min-w-[300px] bg-gray-100/50 rounded-2xl p-4 flex flex-col h-full border border-gray-200/50">
              <div className={`flex items-center justify-between mb-4 pb-2 border-b border-${color}-200`}>
                  <h3 className={`font-bold text-${color}-700 uppercase tracking-wide text-sm`}>{title}</h3>
                  <span className={`bg-${color}-100 text-${color}-800 text-xs font-bold px-2 py-1 rounded-full`}>{filtered.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {filtered.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic border-2 border-dashed border-gray-200 rounded-xl">
                          Nenhum item
                      </div>
                  ) : (
                      filtered.map(req => (
                          <div key={req.ID_ATENDIMENTO} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group relative">
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
    <div className="flex gap-6 h-full min-w-[1000px]">
        {renderColumn("Aguardando", r => r.STATUS_PEDIDO === 'Aguardando', 'yellow')}
        {renderColumn("Em Execução / Agendado", r => r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO !== 'Concluído', 'blue')}
        {renderColumn("Concluído", r => r.STATUS_PEDIDO === 'Acatado' && r.STATUS_AGENDAMENTO === 'Concluído', 'green')}
        {renderColumn("Declinado / Cancelado", r => r.STATUS_PEDIDO === 'Declinado', 'red')}
    </div>
  );
};
