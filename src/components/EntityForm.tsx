
import React from 'react';
import { RecordData, UserSession } from '../types';
import { DATA_MODEL, ENTITY_CONFIGS, FK_MAPPING, DROPDOWN_OPTIONS, DROPDOWN_STRUCTURES } from '../constants';
import { Button } from './Button';

interface EntityFormProps {
  activeTab: string;
  formData: RecordData;
  isEditing: boolean;
  isReadOnly: boolean;
  submitting: boolean;
  session: UserSession;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export const EntityForm: React.FC<EntityFormProps> = ({
  activeTab,
  formData,
  isEditing,
  isReadOnly,
  submitting,
  session,
  onInputChange,
  onSubmit,
  onCancel
}) => {

  const getPrefixForVinculo = (vinculo: string) => {
      const map: Record<string, string> = { 'Extra Quadro': '60', 'Aposentado': '70', 'CLT': '29', 'Prestador de Serviços': '39' };
      return map[vinculo] || '10';
  };

  const getFilteredOptions = (field: string): string[] => {
      const papel = session.papel;

      if (field === 'REMETENTE' && papel === 'GPRGP') {
          return DROPDOWN_STRUCTURES['REMETENTE'].filter((o: string) => o !== 'Prefeitura');
      }

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

      return (DROPDOWN_OPTIONS[field] as string[]) || [];
  };

  const renderInput = (field: string) => {
    const config = ENTITY_CONFIGS[activeTab];
    const isPK = field === config.pk;
    const isFK = FK_MAPPING[field] !== undefined;
    const isCalculated = field === 'PREFIXO_MATRICULA';

    // Logic to hide specific fields
    if ((isPK && !isEditing && !config.manualPk) || 
        (activeTab === 'Cargo' && field === 'SALARIO' && session.papel === 'GGT') ||
        (activeTab === 'Protocolo' && ((field === 'MATRICULA' && session.papel === 'GPRGP') || (field === 'ID_CONTRATO' && session.papel === 'GGT')))) {
        return null;
    }

    const options = getFilteredOptions(field);
    const inputCommonClass = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all duration-200 text-sm font-medium text-simas-dark";

    if (options.length > 0) {
      return (
        <div key={field} className="relative group">
          <label className="block text-[10px] font-bold text-simas-dark/70 uppercase tracking-widest mb-1.5 ml-1">{field.replace(/_/g, ' ')}</label>
          <div className="relative">
            <select 
                name={field} 
                value={formData[field] || ''} 
                onChange={onInputChange} 
                className={`${inputCommonClass} appearance-none cursor-pointer ${isReadOnly ? 'opacity-60 cursor-not-allowed bg-gray-100' : ''}`}
                disabled={isReadOnly}
            >
              <option value="">Selecione...</option>
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><i className="fas fa-chevron-down text-xs"></i></div>
          </div>
        </div>
      );
    }

    const isFieldReadOnly = (isPK && isEditing) || isCalculated || isReadOnly;
    const type = field.includes('DATA') ? 'date' : 'text';

    return (
      <div key={field} className="relative group">
        <label className="block text-[10px] font-bold text-simas-dark/70 uppercase tracking-widest mb-1.5 ml-1">{field.replace(/_/g, ' ')}</label>
        <div className="relative">
            {isFK && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan"><i className="fas fa-link text-xs"></i></div>}
            <input 
                type={type} 
                name={field} 
                value={formData[field] || ''} 
                onChange={onInputChange} 
                className={`${inputCommonClass} ${isFK ? 'pl-10' : ''} ${isFieldReadOnly ? 'opacity-70 cursor-not-allowed bg-gray-100' : ''}`} 
                readOnly={isFieldReadOnly}
                placeholder={isFK ? "Selecione na lista..." : "Digite aqui..."} 
                maxLength={field === 'CPF' ? 14 : (field === 'TELEFONE' ? 15 : undefined)}
            />
        </div>
      </div>
    );
  };

  return (
    <div className="flex-none w-[380px] flex flex-col bg-white rounded-3xl shadow-soft overflow-hidden z-20 border border-white/50">
      <div className="p-6 border-b border-gray-50 bg-white">
        <h2 className="text-lg font-extrabold text-simas-dark flex items-center gap-3 tracking-tight">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isEditing ? 'bg-simas-cyan/10 text-simas-cyan' : 'bg-simas-blue/10 text-simas-blue'}`}>
                <i className={`fas ${isEditing ? 'fa-pen' : 'fa-plus'} text-xs`}></i>
            </div>
            {isEditing ? 'Editar Registro' : 'Novo Registro'}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
        {isReadOnly && !isEditing ? (
            <div className="text-center py-10 px-4 text-gray-400 flex flex-col items-center">
                <i className="fas fa-lock text-3xl mb-3 opacity-50"></i>
                <p className="text-sm font-medium">Esta tabela é somente leitura para o seu perfil.</p>
            </div>
        ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              {DATA_MODEL[activeTab]?.map(field => renderInput(field))}
              <div className="pt-6 flex gap-3">
                {isEditing && <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">Cancelar</Button>}
                <Button type="submit" isLoading={submitting} className="flex-[2]">{isEditing ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
        )}
      </div>
    </div>
  );
};