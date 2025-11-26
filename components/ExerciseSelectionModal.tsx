
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from './Card';
import { Button } from './Button';
import { ENTITY_CONFIGS } from '../constants';

interface ExerciseSelectionModalProps {
  vagaId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ExerciseSelectionModal: React.FC<ExerciseSelectionModalProps> = ({ vagaId, onClose, onSuccess }) => {
  const [lotacoes, setLotacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLotacaoId, setSelectedLotacaoId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.fetchEntity('LOTAÇÕES');
        setLotacoes(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!selectedLotacaoId) return;
    setSaving(true);
    try {
      const res = await api.setExercicio(vagaId, selectedLotacaoId);
      if (res.success) {
        onSuccess();
      } else {
        alert('Erro ao salvar exercício.');
      }
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setSaving(false);
    }
  };

  const config = ENTITY_CONFIGS['LOTAÇÕES'];
  
  const filteredLotacoes = lotacoes.filter(item => {
      const display = config.cardDisplay(item);
      return `${display.title} ${display.subtitle} ${display.details || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-lg h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-simas-dark">Definir Exercício</h3>
            <p className="text-xs text-gray-500">Selecione a nova lotação de exercício para esta vaga.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-4 bg-white border-b border-gray-100">
            <div className="relative">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input 
                    type="text" 
                    placeholder="Buscar Lotação..." 
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-simas-light focus:bg-white transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-2">
          {loading ? (
            <div className="text-center py-10"><div className="spinner-border text-simas-medium"></div></div>
          ) : filteredLotacoes.length === 0 ? (
             <p className="text-center text-gray-400 mt-4">Nenhuma lotação encontrada.</p>
          ) : (
            filteredLotacoes.map(item => {
                const pkValue = String(item[config.pk]);
                const display = config.cardDisplay(item);
                return (
                    <Card
                        key={pkValue}
                        title={display.title}
                        subtitle={display.subtitle}
                        details={display.details}
                        selected={selectedLotacaoId === pkValue}
                        onSelect={() => setSelectedLotacaoId(pkValue)}
                    />
                );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!selectedLotacaoId} isLoading={saving}>Confirmar</Button>
        </div>
      </div>
    </div>
  );
};
