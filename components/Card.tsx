
import React, { memo } from 'react';

interface CardProps {
  title: string;
  subtitle?: string;
  details?: string;
  status?: string;
  selected?: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  actions?: React.ReactNode;
  exerciseData?: {
      label: string;
      onEdit: () => void;
  };
}

export const Card: React.FC<CardProps> = memo(({ title, subtitle, details, status, selected, onSelect, onEdit, actions, exerciseData }) => {
  
  const isBlocked = status === 'Bloqueada';
  
  // Minimalist badges logic matching Legacy System colors
  let statusBadge = null;
  if (status) {
    let colorClass = 'bg-gray-100 text-gray-500 border-gray-200'; // Default Gray
    
    if (status === 'Ativa' || status === 'Disponível' || status === 'Ativo') {
        colorClass = 'bg-green-50 text-green-700 border-green-200';
    } else if (isBlocked || status === 'Inativo') {
        colorClass = 'bg-red-50 text-red-700 border-red-200';
    } else if (status === 'Reservada') {
        colorClass = 'bg-cyan-50 text-cyan-700 border-cyan-200';
    } else if (status === 'Ocupada') {
        colorClass = 'bg-gray-50 text-gray-600 border-gray-200'; 
    } else if (status === 'Em Aviso Prévio' || status === 'Em Dispensa') {
        colorClass = 'bg-yellow-50 text-yellow-700 border-yellow-200'; // Legacy Yellow for Warning/Aviso
    } else if (status === 'Pendente') {
        colorClass = 'bg-orange-50 text-orange-700 border-orange-200';
    }
    
    statusBadge = (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${colorClass}`}>
            {status}
        </span>
    );
  }

  return (
    <div 
      onClick={onSelect}
      className={`
        group relative p-4 mb-3 transition-all duration-200 cursor-pointer rounded-xl border
        ${selected 
          ? 'bg-white border-simas-cyan ring-1 ring-simas-cyan shadow-md z-10' 
          : 'bg-white border-slate-200 hover:border-simas-cyan/50 shadow-sm hover:shadow-md'}
      `}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-6">
            <h4 className={`font-bold truncate text-sm leading-tight ${selected ? 'text-simas-cyan' : 'text-simas-dark'}`}>{title}</h4>
            {subtitle && <p className="text-xs font-medium truncate text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Details with whitespace-pre-line to support Legacy multi-line format */}
      {details && (
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-start gap-2">
            <div className="w-0.5 h-full min-h-[12px] bg-gray-200 rounded-full flex-shrink-0 mt-1"></div>
            <p className="text-[11px] font-medium text-gray-500 leading-tight whitespace-pre-line">{details}</p>
        </div>
      )}
      
      {exerciseData && (
          <div className="mt-3 pt-2 border-t border-gray-50">
              <div className="flex items-center justify-between group/ex">
                  <div className="flex items-center gap-2 overflow-hidden bg-slate-50 rounded px-2 py-1 max-w-full border border-slate-100">
                      <i className="fas fa-map-marker-alt text-simas-blue text-[10px]"></i>
                      <span className="text-[10px] font-semibold text-gray-600 truncate">{exerciseData.label}</span>
                  </div>
                  <button 
                      onClick={(e) => { e.stopPropagation(); exerciseData.onEdit(); }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-simas-cyan hover:bg-white transition-all"
                  >
                      <i className="fas fa-pencil-alt text-[10px]"></i>
                  </button>
              </div>
          </div>
      )}
      
      <div className="flex items-center justify-between mt-3">
          {statusBadge}
      </div>

      {/* Floating Actions */}
      <div className={`
        absolute top-2 right-2 z-20 flex flex-col gap-1
        transition-all duration-200
        ${selected 
            ? 'opacity-100 translate-x-0' 
            : 'opacity-0 translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'}
      `}>
          {onEdit && (
             <button 
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-400 hover:border-simas-cyan hover:text-simas-cyan shadow-sm transition-all"
                title="Editar"
             >
                <i className="fas fa-pen text-[10px]"></i>
             </button>
          )}
          {actions}
      </div>
    </div>
  );
});
