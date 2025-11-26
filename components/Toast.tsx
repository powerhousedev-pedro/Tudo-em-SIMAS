import React, { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: number) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const Toast: React.FC<ToastMessage & { onClose: () => void }> = ({ type, message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: 'bg-white border-l-4 border-simas-success text-gray-800',
    error: 'bg-white border-l-4 border-simas-danger text-gray-800',
    info: 'bg-white border-l-4 border-simas-light text-gray-800'
  };

  const icons = {
    success: 'fas fa-check-circle text-simas-success',
    error: 'fas fa-exclamation-circle text-simas-danger',
    info: 'fas fa-info-circle text-simas-light'
  };

  return (
    <div className={`${styles[type]} shadow-lg rounded-r-lg p-4 min-w-[300px] flex items-center gap-3 animate-slide-in pointer-events-auto transform transition-all`}>
      <i className={`${icons[type]} text-xl`}></i>
      <p className="text-sm font-medium">{message}</p>
      <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};