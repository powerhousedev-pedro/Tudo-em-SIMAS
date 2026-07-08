import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { ENTITY_CONFIGS } from '../constants';

interface SelectionModalProps {
  entity: string;
  items: any[];
  title: string;
  onSelect: (item: any | any[]) => void;
  onClose: () => void;
  multiSelect?: boolean;
  initialSelection?: any[];
}

export const SelectionModal: React.FC<SelectionModalProps> = ({ entity, items, title, onSelect, onClose, multiSelect = false, initialSelection = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(!multiSelect && initialSelection.length > 0 ? initialSelection[0] : null);
  const [selectedItems, setSelectedItems] = useState<any[]>(multiSelect ? initialSelection : []);

  const config = ENTITY_CONFIGS[entity];
  if (!config) return null;

  const filteredItems = items.filter(item => {
      const display = config.cardDisplay(item);
      const searchStr = `${display.title} ${display.subtitle} ${display.details || ''}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
  });

  const handleSelect = (item: any) => {
      if (multiSelect) {
          const isSelected = selectedItems.some(i => i[config.pk] === item[config.pk]);
          if (isSelected) {
              setSelectedItems(selectedItems.filter(i => i[config.pk] !== item[config.pk]));
          } else {
              setSelectedItems([...selectedItems, item]);
          }
      } else {
          setSelectedItem(item);
      }
  };

  const handleConfirm = () => {
      if (multiSelect) {
          onSelect(selectedItems);
      } else if (selectedItem) {
          onSelect(selectedItem);
      }
  };

  const isItemSelected = (item: any) => {
      if (multiSelect) {
          return selectedItems.some(i => i[config.pk] === item[config.pk]);
      }
      return selectedItem && selectedItem[config.pk] === item[config.pk];
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up border border-gray-100">
        <header className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-lg text-simas-dark tracking-tight">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Selecione uma opção na lista abaixo</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
              <i className="fas fa-times"></i>
          </button>
        </header>

        <div className="p-4 bg-white border-b border-gray-100 shrink-0">
            <div className="relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input 
                    type="text" 
                    placeholder={`Buscar em ${title}...`} 
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-1 focus:ring-simas-cyan transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredItems.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-gray-400 text-sm">
                        Nenhum resultado encontrado.
                    </div>
                ) : (
                    filteredItems.map(item => {
                        const pkValue = String(item[config.pk]);
                        const display = config.cardDisplay(item);
                        return (
                                                        <Card 
                                                            key={pkValue} 
                                                            title={display.title} 
                                                            subtitle={display.subtitle} 
                                                            details={display.details} 
                                                            status={display.status} 
                                                            hasGraveIssue={display.hasGraveIssue}
                                                            selected={isItemSelected(item)} 
                                                            onSelect={() => handleSelect(item)} 
                                                        />                        );
                    })
                )}
            </div>
        </div>

        <footer className="px-6 py-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={multiSelect ? selectedItems.length === 0 : !selectedItem}>Confirmar Seleção</Button>
        </footer>
      </div>
    </div>
  );
};
