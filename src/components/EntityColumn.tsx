
import React, { useRef } from 'react';
import { ENTITY_CONFIGS, READ_ONLY_ENTITIES } from '../constants';
import { Card } from './Card';
import { Button } from './Button';
import { UserSession } from '../types';

interface EntityColumnProps {
  entity: string;
  activeTab: string;
  session: UserSession;
  data: any[];
  loading: boolean;
  searchTerm: string;
  filters: string[];
  isFilterOpen: boolean;
  selectedItemId?: string;
  onSearchChange: (term: string) => void;
  onToggleFilter: () => void;
  onFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onSelectCard: (item: any) => void;
  onEditCard: (item: any) => void;
  onDeleteCard: (item: any) => void;
  onLockVaga: (idVaga: string, isOcupada: boolean) => void;
  onDossier: (cpf: string) => void;
  onExerciseEdit: (idVaga: string) => void;
}

export const EntityColumn: React.FC<EntityColumnProps> = ({
  entity,
  activeTab,
  session,
  data,
  loading,
  searchTerm,
  filters,
  isFilterOpen,
  selectedItemId,
  onSearchChange,
  onToggleFilter,
  onFilterChange,
  onClearFilters,
  onSelectCard,
  onEditCard,
  onDeleteCard,
  onLockVaga,
  onDossier,
  onExerciseEdit
}) => {
  const config = ENTITY_CONFIGS[entity];
  if (!config) return null;

  const popoverRef = useRef<HTMLDivElement>(null);

  const filteredData = data.filter(item => {
      const display = config.cardDisplay(item);
      const textMatch = !searchTerm || `${display.title} ${display.subtitle} ${display.details || ''}`.toLowerCase().includes(searchTerm);
      const filterMatch = filters.length === 0 || (config.filterBy && filters.includes(item[config.filterBy]));
      return textMatch && filterMatch;
  });

  const filterOptions = isFilterOpen && config.filterBy 
    ? [...new Set(data.map(i => i[config.filterBy!]).filter(Boolean))].sort() 
    : [];

  return (
    <div className="flex-none w-[340px] flex flex-col bg-slate-200 rounded-3xl overflow-hidden snap-center h-full border border-slate-300 backdrop-blur-sm shadow-inner">
      {/* Column Header */}
      <div className="p-4 bg-gray-50/80 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold flex items-center gap-2 text-simas-dark uppercase text-xs tracking-wider pl-1">
            {entity !== activeTab && <i className="fas fa-link text-gray-400"></i>} {config.title}
          </h3>
          <span className="text-[10px] font-bold bg-white shadow-sm border border-gray-100 px-2.5 py-1 rounded-full text-gray-500">{filteredData.length}</span>
        </div>
        <div className="flex gap-2">
            <div className="relative group flex-grow">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-colors group-hover:text-simas-cyan"></i>
                <input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border-none bg-white shadow-sm text-xs focus:ring-2 focus:ring-simas-cyan/50 outline-none transition-all" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} />
            </div>
            {config.filterBy && (
                <div className="relative" ref={popoverRef}>
                    <button className={`w-9 h-full rounded-xl flex items-center justify-center transition-all shadow-sm border border-transparent ${isFilterOpen || filters.length > 0 ? 'bg-simas-cyan text-white shadow-glow' : 'bg-white text-gray-400 hover:text-simas-cyan'}`} onClick={onToggleFilter}>
                        <i className="fas fa-filter text-xs"></i>
                    </button>
                    {isFilterOpen && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-fade-in">
                            <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <span className="text-xs font-bold text-gray-600">Filtrar por {config.filterBy.replace(/_/g, ' ')}</span>
                                {filters.length > 0 && <button onClick={onClearFilters} className="text-[10px] text-red-500 font-bold hover:underline">Limpar</button>}
                            </div>
                            <div className="max-h-[200px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {filterOptions.map((opt: any) => (
                                    <label key={opt} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors text-xs text-gray-600">
                                        <input type="checkbox" checked={filters.includes(opt)} onChange={() => onFilterChange(opt)} className="rounded text-simas-cyan focus:ring-simas-cyan border-gray-300"/>
                                        <span className="truncate">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
      
      {/* Cards List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
        {loading && filteredData.length === 0 ? <div className="p-4 mb-3 bg-white/50 rounded-2xl border border-white shadow-sm animate-pulse h-24"></div> : filteredData.map(item => {
            const pkValue = String(item[config.pk]);
            const display = config.cardDisplay(item);
            const isSelected = selectedItemId === pkValue;
            const isOcupada = item.STATUS_VAGA === 'Ocupada';
            const entityIsReadOnly = READ_ONLY_ENTITIES.includes(entity) && session.papel !== 'COORDENAÇÃO';
            
            let exerciseData = undefined;
            if (entity === 'Vaga') {
                exerciseData = { label: item.NOME_LOTACAO_EXERCICIO || 'Sem exercício definido', onEdit: () => onExerciseEdit(pkValue) };
            }

            return (
              <Card 
                key={pkValue} 
                title={display.title} 
                subtitle={display.subtitle} 
                details={display.details} 
                status={display.status} 
                selected={isSelected} 
                onSelect={() => onSelectCard(item)} 
                onEdit={entity === activeTab && !entityIsReadOnly ? () => onEditCard(item) : undefined}
                exerciseData={exerciseData}
                actions={
                  <>
                    {entity === 'Pessoa' && <Button variant="icon" icon="fas fa-id-card" title="Dossiê" onClick={(e: React.MouseEvent) => {e.stopPropagation(); onDossier(item.CPF);}} />}
                    {entity === 'Vaga' && !entityIsReadOnly && <Button variant="icon" icon={item.BLOQUEADA ? "fas fa-lock" : "fas fa-lock-open"} className={`${item.BLOQUEADA ? "text-red-500" : ""} ${isOcupada ? "opacity-30 cursor-not-allowed text-gray-400" : ""}`} disabled={isOcupada} onClick={(e: React.MouseEvent) => {e.stopPropagation(); onLockVaga(pkValue, isOcupada);}} />}
                    {entity !== 'Auditoria' && !entityIsReadOnly && <Button variant="icon" icon="fas fa-trash" className="text-red-300 hover:text-red-500 hover:bg-red-50" onClick={(e: React.MouseEvent) => {e.stopPropagation(); onDeleteCard(item);}} />}
                  </>
                }
              />
            );
          })}
      </div>
    </div>
  );
};
