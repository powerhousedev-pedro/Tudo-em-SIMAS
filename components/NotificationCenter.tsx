import React, { useState } from 'react';
import { usePendingReviews, useSystemAlerts } from '../hooks/useSimasData';
import { Button } from './Button';

interface NotificationCenterProps {
  onClose: () => void;
  onSelectAction: (id: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose, onSelectAction }) => {
  const [activeTab, setActiveTab] = useState<'REVIEWS' | 'ALERTS'>('REVIEWS');
  const [reviewSearchTerm, setReviewSearchTerm] = useState('');

  const { data: pendingReviews = [] } = usePendingReviews();
  const { data: systemAlerts = [] } = useSystemAlerts();

  const filteredReviews = pendingReviews.filter((rev: any) => 
    !reviewSearchTerm || 
    `${rev.TIPO_DE_ACAO} ${rev.ENTIDADE_ALVO} ${rev.NOME_PESSOA} ${rev.TIPO_PEDIDO}`.toLowerCase().includes(reviewSearchTerm.toLowerCase())
  );

  const getSeverityIcon = (severity: string) => {
      switch(severity) {
          case 'high': return <i className="fas fa-exclamation-circle text-red-500 text-lg"></i>;
          case 'medium': return <i className="fas fa-exclamation-triangle text-yellow-500 text-lg"></i>;
          default: return <i className="fas fa-info-circle text-blue-500 text-lg"></i>;
      }
  };

  const getSeverityLabel = (severity: string) => {
      switch(severity) {
          case 'high': return <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Crítico</span>;
          case 'medium': return <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Atenção</span>;
          default: return <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Info</span>;
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-fade-in">
        <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-in border border-white/50">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-black text-simas-dark tracking-tight">Central de Notificações</h3>
                        <p className="text-sm text-gray-500 mt-1">Gerencie suas pendências e monitore o sistema.</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shadow-sm"><i className="fas fa-times"></i></button>
                </div>

                <div className="flex gap-2 p-1 bg-gray-200/50 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('REVIEWS')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'REVIEWS' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:bg-white/50'}`}
                    >
                        <i className="fas fa-tasks"></i> Tarefas Pendentes
                        {pendingReviews.length > 0 && <span className="bg-simas-cyan text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingReviews.length}</span>}
                    </button>
                    <button 
                        onClick={() => setActiveTab('ALERTS')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'ALERTS' ? 'bg-white shadow text-simas-dark' : 'text-gray-500 hover:bg-white/50'}`}
                    >
                        <i className="fas fa-bell"></i> Alertas do Sistema
                        {systemAlerts.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{systemAlerts.length}</span>}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
                
                {/* --- REVIEWS TAB --- */}
                {activeTab === 'REVIEWS' && (
                    <div className="space-y-4">
                        <div className="relative mb-4">
                            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                            <input 
                                type="text" 
                                placeholder="Buscar pendência..." 
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-simas-cyan transition-all"
                                value={reviewSearchTerm}
                                onChange={(e) => setReviewSearchTerm(e.target.value)}
                            />
                        </div>

                        {filteredReviews.length === 0 ? (
                            <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                                <i className="fas fa-check-circle text-4xl text-green-500"></i>
                                <p className="text-gray-500 font-medium">Você está em dia com suas tarefas!</p>
                            </div>
                        ) : (
                            filteredReviews.map((rev: any) => (
                                <div key={rev.ID_ATENDIMENTO} className="bg-white p-5 rounded-2xl border border-gray-100 flex justify-between items-center hover:shadow-lg hover:border-simas-cyan/30 transition-all group relative overflow-hidden">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-simas-cyan"></div>
                                    <div className="flex items-start gap-4 pl-3">
                                        <div className="w-10 h-10 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors">
                                            <i className="fas fa-play text-xs"></i>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-simas-dark text-sm leading-tight">{rev.TIPO_DE_ACAO} {rev.ENTIDADE_ALVO}</h4>
                                                <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{rev.ID_ATENDIMENTO}</span>
                                            </div>
                                            <p className="text-xs text-gray-500">Solicitante: <span className="font-semibold text-gray-700">{rev.NOME_PESSOA}</span></p>
                                            <p className="text-[10px] text-gray-400 mt-1"><i className="far fa-clock mr-1"></i> Agendado: {new Date(rev.DATA_AGENDAMENTO).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <Button onClick={() => { onClose(); onSelectAction(rev.ID_ATENDIMENTO); }} className="rounded-full px-5 py-2 text-xs">Executar</Button>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* --- ALERTS TAB --- */}
                {activeTab === 'ALERTS' && (
                    <div className="space-y-4">
                        {systemAlerts.length === 0 ? (
                            <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                                <i className="fas fa-shield-alt text-4xl text-simas-blue"></i>
                                <p className="text-gray-500 font-medium">Nenhum alerta de sistema encontrado.</p>
                            </div>
                        ) : (
                            systemAlerts.map((alert: any) => (
                                <div key={alert.id} className="bg-white p-5 rounded-2xl border border-gray-100 flex gap-4 hover:shadow-md transition-all">
                                    <div className="shrink-0 pt-1">
                                        {getSeverityIcon(alert.severity)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-gray-800 text-sm">{alert.title}</h4>
                                            {getSeverityLabel(alert.severity)}
                                        </div>
                                        <p className="text-xs text-gray-600 leading-relaxed mb-2">{alert.message}</p>
                                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                                            <span>ID: {alert.entityId}</span>
                                            <span>•</span>
                                            <span>Detectado em: {new Date().toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

            </div>
        </div>
    </div>
  );
};