
import React, { useState, useCallback, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Reports } from './components/Reports';
import { Workflows } from './components/Workflows';
import { History } from './components/History';
import { ToastContainer, ToastMessage } from './components/Toast';
import { UserAdminModal } from './components/UserAdminModal';
import { UserSession, AppRoute, AppContextProps } from './types';
import { api } from './services/api';

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showUserAdminModal, setShowUserAdminModal] = useState(false);

  useEffect(() => {
      // Restore session from localStorage
      const storedSession = localStorage.getItem('simas_user_session');
      const storedToken = localStorage.getItem('simas_auth_token');
      if (storedSession && storedToken) {
          try {
              setSession(JSON.parse(storedSession));
          } catch (e) {
              console.error("Failed to restore session", e);
          }
      }

      // Run simulated background jobs
      api.processDailyRoutines();
  }, []);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem('simas_auth_token');
    localStorage.removeItem('simas_user_session');
  };

  const triggerUserAdmin = () => {
      setShowUserAdminModal(true);
  };

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  const showUserAdmin = session.isGerente || session.papel === 'COORDENAÇÃO';
  const defaultRoute = session.papel === 'COORDENAÇÃO' ? AppRoute.REPORTS : AppRoute.DASHBOARD;

  return (
    <Router>
      <div className="flex flex-col h-screen font-sans overflow-hidden bg-simas-cloud">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        {/* Minimalist Navy Header */}
        <header className="flex-none bg-simas-dark text-white z-50 shadow-soft relative">
          <div className="flex items-center justify-between px-8 h-20 relative z-10">
            
            {/* Logo Area */}
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-white text-simas-dark flex items-center justify-center rounded-xl shadow-lg transform transition-transform hover:scale-105">
                <i className="fas fa-layer-group text-lg"></i>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-extrabold tracking-tight leading-none text-white">Tudo em SIMAS</h1>
                <span className="text-[10px] text-simas-cyan font-semibold tracking-wider mt-0.5">Sistema de Monitoramento Integrado</span>
              </div>
            </div>

            {/* Navigation - Pills */}
            <nav className="hidden md:flex items-center gap-2 p-1 bg-white/5 rounded-full backdrop-blur-sm border border-white/5">
              {[
                { to: AppRoute.DASHBOARD, label: 'Dashboard', icon: 'fas fa-columns' },
                { to: AppRoute.WORKFLOWS, label: 'Fluxos', icon: 'fas fa-exchange-alt' },
                { to: AppRoute.HISTORY, label: 'Histórico', icon: 'fas fa-history' },
                { to: AppRoute.REPORTS, label: 'Relatórios', icon: 'fas fa-chart-pie' }
              ].map(link => (
                <NavLink 
                  key={link.to}
                  to={`/${link.to}`} 
                  className={({ isActive }) => `
                    flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold transition-all duration-300
                    ${isActive 
                      ? 'bg-simas-cyan text-white shadow-glow transform scale-105' 
                      : 'text-gray-300 hover:text-white hover:bg-white/10'}
                  `}
                >
                  <i className={`${link.icon} text-[10px]`}></i>
                  {link.label}
                </NavLink>
              ))}
            </nav>

            {/* Profile */}
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                     <div className="text-xs font-bold text-white">{session.usuario}</div>
                     <div className="text-[10px] text-simas-cyan font-medium">{session.papel}</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-simas-cyan to-simas-blue border-2 border-simas-dark flex items-center justify-center text-white font-bold text-xs shadow-lg">
                      {session.usuario.charAt(0).toUpperCase()}
                  </div>
               </div>
               
               <div className="flex items-center gap-2 border-l border-white/10 pl-6 h-8">
                  {showUserAdmin && (
                    <button onClick={triggerUserAdmin} className="w-8 h-8 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-all" title="Admin">
                        <i className="fas fa-cog text-xs"></i>
                    </button>
                  )}
                  <button onClick={handleLogout} className="w-8 h-8 rounded-full hover:bg-red-500/20 text-gray-300 hover:text-red-400 transition-all" title="Sair">
                    <i className="fas fa-power-off text-xs"></i>
                  </button>
               </div>
            </div>

          </div>
        </header>

        {/* Content Area - Clean Cloud Background */}
        <main className="flex-1 overflow-hidden relative w-full bg-simas-cloud">
           <div className="h-full w-full relative">
              <Routes>
                 <Route path="/" element={<Navigate to={`/${defaultRoute}`} />} />
                 <Route path={`/${AppRoute.DASHBOARD}`} element={<Dashboard showToast={showToast} />} />
                 <Route path={`/${AppRoute.WORKFLOWS}`} element={<Workflows showToast={showToast} />} />
                 <Route path={`/${AppRoute.HISTORY}`} element={<History showToast={showToast} />} />
                 <Route path={`/${AppRoute.REPORTS}`} element={<Reports />} />
              </Routes>
           </div>
        </main>

        {/* Global Modals */}
        {showUserAdminModal && <UserAdminModal onClose={() => setShowUserAdminModal(false)} session={session} />}
      </div>
    </Router>
  );
};

export default App;