
import React from 'react';
import { Button } from './Button';

interface AuditLogModalProps {
  log: any | null;
  onClose: () => void;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({ log, onClose }) => {
  if (!log) return null;

  const parseData = (str: string) => {
      try { return JSON.parse(str); } catch (e) { return {}; }
  };

  const acao = log.ACAO;
  const valorAntigo = parseData(log.VALOR_ANTIGO);
  const valorNovo = parseData(log.VALOR_NOVO);

  let cardClass = "bg-white border-gray-200";
  let title = "Detalhes da Alteração";
  let icon = "fas fa-info-circle";

  if (acao === 'CRIAR') {
      cardClass = "bg-green-50 border-green-200";
      title = "Registro Criado";
      icon = "fas fa-plus-circle text-green-600";
  } else if (acao === 'EXCLUIR' || acao === 'INATIVAR' || acao === 'ARQUIVAR') {
      cardClass = "bg-red-50 border-red-200";
      title = "Registro Excluído/Arquivado";
      icon = "fas fa-trash text-red-600";
  } else if (acao === 'EDITAR') {
      cardClass = "bg-white border-gray-200";
      title = "Registro Editado";
      icon = "fas fa-pen text-blue-600";
  }

  const renderContent = () => {
      // CRIAR: Mostra tudo verde
      if (acao === 'CRIAR') {
          return Object.entries(valorNovo).map(([k, v]) => (
              <div key={k} className="flex flex-col mb-2 p-2 bg-white/60 rounded border border-green-100">
                  <span className="text-[10px] font-bold uppercase text-green-800">{k}</span>
                  <span className="text-sm font-medium text-gray-800">{String(v)}</span>
              </div>
          ));
      }
      
      // EXCLUIR: Mostra tudo vermelho
      if (acao === 'EXCLUIR' || acao === 'INATIVAR' || acao === 'ARQUIVAR') {
          return Object.entries(valorAntigo).map(([k, v]) => (
              <div key={k} className="flex flex-col mb-2 p-2 bg-white/60 rounded border border-red-100">
                  <span className="text-[10px] font-bold uppercase text-red-800">{k}</span>
                  <span className="text-sm font-medium text-gray-800">{String(v)}</span>
              </div>
          ));
      }

      // EDITAR: Diff (Original cortado, Novo destacado)
      const allKeys = new Set([...Object.keys(valorAntigo), ...Object.keys(valorNovo)]);
      return Array.from(allKeys).map(key => {
          const oldV = valorAntigo[key];
          const newV = valorNovo[key];
          
          if (oldV == newV) return null; 
          
          const isChanged = JSON.stringify(oldV) !== JSON.stringify(newV);
          
          if (!isChanged) {
                if(key.includes('ID') || key === 'NOME' || key === 'CPF') {
                    return (
                    <div key={key} className="flex flex-col mb-2 p-2 bg-gray-50 rounded border border-gray-100 opacity-70">
                        <span className="text-[10px] font-bold uppercase text-gray-500">{key}</span>
                        <span className="text-sm text-gray-600">{String(oldV || newV)}</span>
                    </div>
                    );
                }
                return null;
          }

          return (
              <div key={key} className="flex flex-col mb-2 p-2 bg-white rounded border border-gray-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase text-gray-700 mb-1">{key}</span>
                  <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 line-through decoration-red-400">{String(oldV === undefined ? '(vazio)' : oldV)}</span>
                      <i className="fas fa-arrow-right text-[10px] text-gray-300"></i>
                      <span className="text-sm font-bold text-red-600">{String(newV === undefined ? '(vazio)' : newV)}</span>
                  </div>
              </div>
          );
      });
  };

  return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border flex flex-col max-h-[80vh] ${cardClass}`}>
              <div className="p-5 border-b border-black/5 flex justify-between items-center bg-white/50">
                  <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800">
                      <i className={icon}></i> {title}
                  </h3>
                  <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors">
                      <i className="fas fa-times text-gray-500"></i>
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-1 custom-scrollbar">
                  <div className="text-xs text-gray-400 mb-4 flex justify-between border-b border-black/5 pb-2">
                      <span>Reg: {log.ID_REGISTRO_AFETADO}</span>
                      <span>Por: {log.USUARIO} em {new Date(log.DATA_HORA).toLocaleString()}</span>
                  </div>
                  {renderContent()}
              </div>
              <div className="p-4 bg-white/50 border-t border-black/5 flex justify-end">
                  <Button variant="secondary" onClick={onClose}>Fechar</Button>
              </div>
          </div>
      </div>
  );
};
