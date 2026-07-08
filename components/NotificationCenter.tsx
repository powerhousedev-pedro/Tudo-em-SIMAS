import React from 'react';
import { useSystemAlerts } from '../hooks/useSimasData';
import { Button } from './Button';
import { Alert } from '../server/src/services/onDemandAlerts'; // Import the type

interface NotificationCenterProps {
  onClose: () => void;
  // TODO: Add a new handler for navigating to other entities like Vagas
  // onNavigate: (entity: string, id: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
  const { data: systemAlerts = [], isLoading } = useSystemAlerts();

  const getAlertMetadata = (alertData: Alert) => {
    switch (alertData.type) {
      case 'VAGA_OCIOSA':
        return {
          icon: 'fas fa-chair',
          color: 'yellow-500',
          actionLabel: 'Ver Vaga',
          action: () => { /* TODO: Implement navigation */ alert(`Navegar para Vaga ID: ${alertData.referenceId}`); }
        };
      case 'CONTRATO_A_VENCER':
        return {
          icon: 'fas fa-file-signature',
          color: 'blue-500',
          actionLabel: 'Ver Contrato',
          action: () => { /* TODO: Implement navigation */ alert(`Navegar para Contrato ID: ${alertData.referenceId}`); }
        };
      default:
        return {
          icon: 'fas fa-info-circle',
          color: 'gray-500',
          actionLabel: 'Ver',
          action: () => {}
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-in border border-white/50">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-black text-simas-dark tracking-tight flex items-center gap-3">
              <i className="fas fa-bell text-yellow-500"></i>
              Central de Alertas do Sistema
              {systemAlerts.length > 0 && 
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                  {systemAlerts.length}
                </span>
              }
            </h3>
            <p className="text-sm text-gray-500 mt-1">Ações e notificações que requerem sua atenção.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shadow-sm"><i className="fas fa-times"></i></button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
          {isLoading ? (
            <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
              <i className="fas fa-circle-notch fa-spin text-4xl text-simas-blue"></i>
              <p className="text-gray-500 font-medium">Buscando alertas...</p>
            </div>
          ) : systemAlerts.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
              <i className="fas fa-shield-alt text-4xl text-green-500"></i>
              <p className="text-gray-500 font-medium">Nenhum alerta encontrado. O sistema está em dia!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {systemAlerts.map((alertData: Alert, index: number) => {
                const meta = getAlertMetadata(alertData);
                return (
                  <div key={`${alertData.referenceId}-${index}`} className={`bg-white p-5 rounded-2xl border border-gray-100 flex justify-between items-center gap-4 hover:shadow-lg hover:border-${meta.color}/30 transition-all group relative overflow-hidden`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-${meta.color}`}></div>
                    <div className="flex items-start gap-4 pl-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 shrink-0 rounded-full bg-${meta.color}/10 text-${meta.color} flex items-center justify-center group-hover:bg-${meta.color} group-hover:text-white transition-colors`}>
                        <i className={meta.icon}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed font-medium">{alertData.message}</p>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1.5 flex-wrap">
                          {alertData.responsible && <span>Responsável: <span className="font-semibold truncate max-w-[200px] inline-block align-bottom">{alertData.responsible}</span></span>}
                          {alertData.responsible && <span>•</span>}
                          <span>Ref: {alertData.referenceId}</span>
                        </div>
                      </div>
                    </div>
                    <Button onClick={() => { onClose(); meta.action(); }} className={`shrink-0 w-32 whitespace-nowrap rounded-full px-0 py-2.5 text-xs font-bold bg-${meta.color} text-white shadow-sm hover:brightness-110 transition-all text-center flex justify-center items-center border-none`}>
                      {meta.actionLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};