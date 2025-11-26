
import React, { useState } from 'react';
import { Button } from './Button';
import { api } from '../services/api';
import { UserSession } from '../types';

interface LoginProps {
  onLogin: (session: UserSession) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await api.login(user, pass);
      if (res.success) {
        const sessionData: UserSession = { 
          token: res.token, 
          usuario: user, 
          papel: res.role as any, 
          isGerente: res.isGerente 
        };

        // Persist to localStorage
        localStorage.setItem('simas_auth_token', res.token);
        localStorage.setItem('simas_user_session', JSON.stringify(sessionData));

        onLogin(sessionData);
      } else {
        setError('Usuário ou senha inválidos.');
      }
    } catch (err) {
      setError('Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-simas-dark selection:bg-simas-cyan selection:text-white">
      {/* Soft Glow Background Elements */}
      <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-simas-blue/20 rounded-full blur-[100px] animate-float"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-simas-cyan/10 rounded-full blur-[80px] animate-float" style={{ animationDelay: '2s' }}></div>
      
      <div className="relative z-10 w-full max-w-sm px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 animate-fade-in">
          
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-simas-cyan to-simas-blue shadow-lg shadow-simas-cyan/30 mb-6 transform -rotate-6">
               <i className="fas fa-layer-group text-2xl text-white transform rotate-6"></i>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mb-2">Tudo em SIMAS</h1>
            <p className="text-xs font-medium text-simas-cyan uppercase tracking-widest">Sistema de Monitoramento</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-4">Usuário</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan transition-colors">
                    <i className="fas fa-user text-sm"></i>
                </div>
                <input 
                  type="text" 
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 bg-simas-dark/50 border border-white/10 text-white placeholder-gray-500 focus:bg-simas-dark focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan outline-none transition-all font-medium rounded-2xl text-sm"
                  placeholder="ID do Usuário"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-4">Senha</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-simas-cyan transition-colors">
                    <i className="fas fa-lock text-sm"></i>
                </div>
                <input 
                  type="password" 
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 bg-simas-dark/50 border border-white/10 text-white placeholder-gray-500 focus:bg-simas-dark focus:border-simas-cyan focus:ring-1 focus:ring-simas-cyan outline-none transition-all font-medium rounded-2xl text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 text-red-300 text-xs font-semibold bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                <i className="fas fa-exclamation-circle"></i>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className="w-full py-4 text-sm uppercase tracking-widest font-black rounded-full bg-gradient-to-r from-simas-cyan to-simas-blue text-white shadow-lg shadow-simas-cyan/20 hover:shadow-simas-cyan/40 hover:-translate-y-0.5 transition-all mt-4" 
              disabled={loading}
            >
              {loading ? <i className="fas fa-circle-notch fa-spin"></i> : 'Acessar Sistema'}
            </button>
          </form>
          
          <div className="mt-10 text-center">
             <p className="text-[10px] text-gray-500 font-medium">© {new Date().getFullYear()} PowerHouse Design</p>
          </div>
        </div>
      </div>
    </div>
  );
};
