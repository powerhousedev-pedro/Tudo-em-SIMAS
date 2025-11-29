
import React from 'react';
import { Button } from './Button';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, message, onConfirm, onCancel, isLoading }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-white/20 animate-slide-in">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4 border border-red-100">
            <i className="fas fa-exclamation-triangle text-xl text-red-500"></i>
          </div>
          <h3 className="text-lg font-extrabold text-simas-dark mb-2">{title}</h3>
          <p className="text-sm text-gray-500 mb-6 px-2 leading-relaxed">
            {message}
          </p>
          
          <div className="flex gap-3 w-full">
            <Button 
              variant="secondary" 
              onClick={onCancel}
              className="flex-1 justify-center"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              variant="danger"
              onClick={onConfirm} 
              isLoading={isLoading}
              className="flex-1 justify-center"
            >
              Confirmar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
