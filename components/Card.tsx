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

const STATUS_STYLES: { [key: string]: string } = {
    'Ativa': 'bg-green-50 text-green-700 border-green-200',
    'Disponível': 'bg-green-50 text-green-700 border-green-200',
    'Ativo': 'bg-green-50 text-green-700 border-green-200',
    'Bloqueada': 'bg-red-50 text-red-700 border-red-200',
    'Inativo': 'bg-red-50 text-red-700 border-red-200',
    'Reservada': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'Ocupada': 'bg-gray-50 text-gray-600 border-gray-200',
    'Em Aviso Prévio': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'Em Dispensa': 'bg-yellow-50 text-yellow-700 border-yellow-200',
    'Pendente': 'bg-orange-50 text-orange-700 border-orange-200'
};

const DEFAULT_STATUS_STYLE = 'bg-gray-100 text-gray-500 border-gray-200';

export const Card: React.FC<CardProps> = memo(({ title, subtitle, details, status, selected, onSelect, onEdit, actions, exerciseData }) => {
  
  const colorClass = status ? (STATUS_STYLES[status] || DEFAULT_STATUS_STYLE) : '';
  
  // Special visual override for border color based on specific status
  const borderOverride = status === 'Em Aviso Prévio' ? 'border-l-yellow-400' : '';
  const blockedOverride = status === 'Bloqueada' ? 'bg-simas-dark border-l-red-500 text-white' : '';

  return (
    <div 
      onClick={onSelect}
      className={`
        group relative p-5 mb-4 transition-all duration-300 cursor-pointer rounded-2xl border border-l-[5px]
        ${selected 
          ? 'bg-white border-simas-cyan ring-1 ring-simas-cyan shadow-lg z-10 transform scale-[1.01]' 
          : `bg-white border-slate-200 hover:border-simas-cyan/50 shadow-sm hover:shadow-md border-l-simas-cyan`}
        ${borderOverride}
        ${blockedOverride}
      `}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-6">
            {/* Título Curto do Card: Cera Pro Medium, Uppercase */}
            <h4 className={`font-medium text-sm uppercase tracking-normal leading-snug ${selected && !blockedOverride ? 'text-simas-cyan' : (blockedOverride ? 'text-white' : 'text-simas-dark')}`}>
                {title}
            </h4>
            {/* Subtítulo: Normal/Sentence Case */}
            <p className={`text-xs font-normal mt-1 tracking-wide truncate ${blockedOverride ? 'text-gray-300' : 'text-gray-500'}`}>{subtitle}</p>
        </div>
      </div>

      {details && (
        <div className={`mt-3 pt-3 border-t flex items-start gap-3 ${blockedOverride ? 'border-white/10' : 'border-gray-50'}`}>
            <div className={`w-0.5 h-full min-h-[14px] rounded-full flex-shrink-0 mt-1 ${blockedOverride ? 'bg-white/30' : 'bg-gray-200'}`}></div>
            {/* Texto Longo: Cera Pro Regular */}
            <p className={`text-[11px] font-normal leading-relaxed whitespace-pre-line tracking-wide ${blockedOverride ? 'text-gray-300' : 'text-gray-500'}`}>
                {details}
            </p>
        </div>
      )}
      
      {exerciseData && (
          <div className={`mt-3 pt-3 border-t ${blockedOverride ? 'border-white/10' : 'border-gray-50'}`}>
              <div className="flex items-center justify-between group/ex">
                  <div className={`flex items-center gap-2 overflow-hidden rounded-lg px-2.5 py-1.5 max-w-full border ${blockedOverride ? 'bg-white/10 border-white/20' : 'bg-slate-50 border-slate-100'}`}>
                      <i className={`fas fa-map-marker-alt text-[10px] ${blockedOverride ? 'text-simas-cyan' : 'text-simas-blue'}`}></i>
                      <span className={`text-[10px] font-medium tracking-wide truncate ${blockedOverride ? 'text-gray-200' : 'text-gray-600'}`}>{exerciseData.label}</span>
                  </div>
                  <button 
                      onClick={(e) => { e.stopPropagation(); exerciseData.onEdit(); }}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${blockedOverride ? 'text-gray-400 hover:text-white hover:bg-white/20' : 'text-gray-400 hover:text-simas-cyan hover:bg-white shadow-sm'}`}
                  >
                      <i className="fas fa-pencil-alt text-[10px]"></i>
                  </button>
              </div>
          </div>
      )}
      
      <div className="flex items-center justify-between mt-4">
          {status && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border ${colorClass}`}>
                  {status}
              </span>
          )}
      </div>

      {/* Floating Actions */}
      <div className={`
        absolute top-3 right-3 z-30 flex flex-col gap-1.5
        transition-all duration-200
        ${selected 
            ? 'opacity-100 translate-x-0 pointer-events-auto' 
            : 'opacity-0 translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'}
      `}>
          {onEdit && (
             <button 
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className={`w-8 h-8 flex items-center justify-center rounded-xl border shadow-sm transition-all ${blockedOverride ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-white border-gray-200 text-gray-400 hover:border-simas-cyan hover:text-simas-cyan'}`}
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