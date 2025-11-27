
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ActionContext, EntityConfig } from '../types';
import { ENTITY_CONFIGS } from '../constants';
import { Card } from './Card';
import { Button } from './Button';

interface ActionModalProps {
  idAtendimento: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ActionExecutionModal: React.FC<ActionModalProps> = ({ idAtendimento, onClose, onSuccess }) => {
  const [context, setContext] = useState<ActionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [selectedCards, setSelectedCards] = useState<{[entity: string]: string}>({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getActionContext(idAtendimento);
        setContext(res);
        // Pre-fill dates with today if present in fields
        const initialData: any = {};
        if(res.fields) {
            Object.entries(res.fields).forEach(([key, type]) => {
                if(type === 'date') initialData[key] = new Date().toISOString().split('T')[0];
            });
        }
        setFormData(initialData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [idAtendimento]);

  const handleCardSelect = (entity: string, pkValue: string) => {
    setSelectedCards(prev => ({ ...prev, [entity]: pkValue }));
  };

  const handleConfirm = async () => {
    if (!context) return;
    setSubmitting(true);
    try {
      // Merge form fields and selected cards PKs
      const dataToSend = { ...formData };
      
      // Map selected cards to their PK names expected by the backend
      Object.keys(selectedCards).forEach(entity => {
        const config = ENTITY_CONFIGS[entity];
        if (config) {
            dataToSend[config.pk] = selectedCards[entity];
        }
      });

      // Special case for INATIVAR SERVIDOR if reason is needed but not in context
      if (context.atendimento.TIPO_DE_ACAO === 'INATIVAR' && !dataToSend.MOTIVO) {
          dataToSend.MOTIVO = context.atendimento.TIPO_PEDIDO;
      }

      const res = await api.executeAction(idAtendimento, dataToSend);
      if (res.success) {
        onSuccess();
      } else {
        alert(res.message);
      }
    } catch (e) {
      alert('Erro ao executar ação.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-10 text-center"><i className="fas fa-circle-notch fa-spin text-2xl text-simas-medium"></i></div>;
  if (!context) return null;

  const { atendimento, lookups, fields } = context;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-slide-in">
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-xl font-bold text-simas-dark flex items-center gap-2">
            <i className="fas fa-bolt text-yellow-500"></i>
            Executar Ação: {atendimento.TIPO_DE_ACAO} {atendimento.ENTIDADE_ALVO}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Pedido: <strong>{atendimento.TIPO_PEDIDO}</strong> para <strong>{atendimento.NOME_PESSOA}</strong>
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex p-6 gap-6 bg-gray-100">
          
          {/* Left: Form Fields */}
          <div className="w-1/3 bg-white p-6 rounded-xl shadow-sm overflow-y-auto border border-gray-100">
            <h3 className="font-bold text-simas-medium mb-4 border-b pb-2 flex items-center gap-2">
                <i className="fas fa-edit"></i> Dados Necessários
            </h3>
            
            {Object.keys(fields).length === 0 && <div className="text-center py-10 text-gray-400 text-sm flex flex-col items-center"><i className="fas fa-check-circle text-3xl mb-2 opacity-30"></i>Nenhum campo adicional.</div>}

            {Object.entries(fields).map(([fieldName, options]) => (
              <div key={fieldName} className="mb-4">
                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">{fieldName.replace(/_/g, ' ')}</label>
                {Array.isArray(options) ? (
                  <select 
                    className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-simas-light/20 outline-none transition-all"
                    onChange={(e) => setFormData({...formData, [fieldName]: e.target.value})}
                    value={formData[fieldName] || ''}
                  >
                    <option value="">Selecione...</option>
                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input 
                    type={options === 'date' ? 'date' : 'text'} 
                    className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-simas-light/20 outline-none transition-all"
                    onChange={(e) => setFormData({...formData, [fieldName]: e.target.value})}
                    value={formData[fieldName] || ''}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Right: Card Selection (Dynamic Columns) */}
          <div className="flex-1 flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
            {Object.keys(lookups).map(entity => {
              const config = ENTITY_CONFIGS[entity];
              const data = lookups[entity];
              const selectedId = selectedCards[entity];

              return (
                <div key={entity} className="w-[320px] flex-none flex flex-col bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                  <div className="p-3 bg-simas-light/10 border-b border-simas-light/20 font-bold text-simas-dark text-sm flex justify-between items-center">
                    <span>Selecione {config.title}</span>
                    {selectedId && <i className="fas fa-check-circle text-green-500"></i>}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 bg-gray-50/30">
                    {data.length === 0 ? <p className="text-center text-sm text-gray-400 mt-10">Nenhum item disponível.</p> : 
                        data.map((item: any) => {
                            const pkValue = String(item[config.pk]);
                            const display = config.cardDisplay(item);
                            return (
                                <Card 
                                    key={pkValue}
                                    title={display.title}
                                    subtitle={display.subtitle}
                                    details={display.details}
                                    status={display.status}
                                    selected={selectedId === pkValue}
                                    onSelect={() => handleCardSelect(entity, pkValue)}
                                />
                            );
                        })
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} isLoading={submitting}>
            <i className="fas fa-save mr-2"></i> Confirmar e Executar
          </Button>
        </div>

      </div>
    </div>
  );
};