import React, { useState, useCallback, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Reports } from './components/Reports';
import { Workflows } from './components/Workflows';
import { History } from './components/History';
import { ToastContainer, ToastMessage } from './components/Toast';
import { UserAdminModal } from './components/UserAdminModal';
import { ActionExecutionModal } from './components/ActionExecutionModal';
import { NotificationCenter } from './components/NotificationCenter';
import { UserSession, AppRoute } from './types';
import { Logo } from './components/Logo';
import { usePendingReviews, useSystemAlerts } from './hooks/useSimasData';

// Separate component to use Hooks inside Provider
const MainLayout: React.FC<{ 
    session: UserSession, 
    onLogout: () => void, 
    showToast: (t: any, m: string) => void,
    onUserAdmin: () => void 
}> = ({ session, onLogout, showToast, onUserAdmin }) => {
    
    // Using React Query Hooks for Bell Count
    const { data: pendingReviews = [] } = usePendingReviews();
    const { data: systemAlerts = [] } = useSystemAlerts();
    
    const [showNotificationCenter, setShowNotificationCenter] = useState(false);
    const [actionAtendimentoId, setActionAtendimentoId] = useState<string | null>(null);

    const showUserAdmin = session.isGerente || session.papel === 'COORDENAÇÃO';
    const defaultRoute = session.papel === 'COORDENAÇÃO' ? AppRoute.REPORTS : AppRoute.DASHBOARD;

    const totalNotifications = pendingReviews.length + systemAlerts.length;
    const hasCritical = systemAlerts.some((a: any) => a.severity === 'high');

    return (
        <div className="flex flex-col h-screen font-sans overflow-hidden bg-simas-cloud">
            {/* Header */}
            <header className="flex-none bg-simas-dark text-white z-50 shadow-soft relative">
              <div className="flex items-center justify-between px-8 h-20 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-white text-simas-dark flex items-center justify-center rounded-xl shadow-lg transform transition-transform hover:scale-105 p-2 shrink-0">
                    <Logo className="w-full h-full" />
                  </div>
                  {/* Texto: Oculto em telas muito pequenas (mobile portrait), aparece empilhado em tablet, linha única em desktop */}
                  <div className="hidden sm:flex flex-col justify-center">
                    {/* Título: Cera Pro Black, Uppercase. Tablet: Flex Col. Desktop: Block */}
                    <h1 className="text-xl leading-none text-white font-black uppercase tracking-brand flex flex-col md:block">
                        <span className="md:mr-1.5">Tudo em</span>
                        <span>SIMAS</span>
                    </h1>
                  </div>
                </div>

                <nav className="hidden md:flex items-center gap-2 p-1.5 bg-white/5 rounded-full backdrop-blur-sm border border-white/5">
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
                        flex items-center gap-2 px-6 py-2 rounded-full text-xs font-medium uppercase transition-all duration-300 tracking-wide
                        ${isActive 
                          ? 'bg-simas-cyan text-white shadow-glow transform scale-105 font-bold' 
                          : 'text-gray-300 hover:text-white hover:bg-white/10'}
                      `}
                    >
                      <i className={`${link.icon} text-[10px]`}></i>
                      {link.label}
                    </NavLink>
                  ))}
                </nav>

                <div className="flex items-center gap-6">
                   <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                         <div className="text-sm font-bold text-white tracking-wide uppercase">{session.usuario}</div>
                         <div className="text-[10px] text-simas-cyan font-medium tracking-wider uppercase opacity-90">{session.papel}</div>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-simas-cyan to-simas-blue border-2 border-simas-dark flex items-center justify-center text-white font-black text-sm shadow-lg">
                          {session.usuario.charAt(0).toUpperCase()}
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-3 border-l border-white/10 pl-6 h-8">
                      <button 
                        onClick={() => setShowNotificationCenter(true)} 
                        className={`relative w-8 h-8 rounded-full hover:bg-white/10 transition-all flex items-center justify-center ${hasCritical ? 'text-red-400 animate-pulse' : 'text-gray-300 hover:text-white'}`}
                        title="Notificações"
                      >
                          <i className="fas fa-bell text-sm"></i>
                          {totalNotifications > 0 && (
                            <span className={`absolute -top-1 -right-1 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm border-2 border-simas-dark ${hasCritical ? 'bg-red-500' : 'bg-simas-cyan'}`}>
                              {totalNotifications}
                            </span>
                          )}
                      </button>

                      {showUserAdmin && (
                        <button onClick={onUserAdmin} className="w-8 h-8 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-all" title="Admin">
                            <i className="fas fa-cog text-sm"></i>
                        </button>
                      )}
                      <button onClick={onLogout} className="w-8 h-8 rounded-full hover:bg-red-500/20 text-gray-300 hover:text-red-400 transition-all" title="Sair">
                        <i className="fas fa-power-off text-sm"></i>
                      </button>
                   </div>
                </div>
              </div>
            </header>

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

            {/* Global Execution Modals */}
            {actionAtendimentoId && (
              <ActionExecutionModal 
                idAtendimento={actionAtendimentoId} 
                onClose={() => setActionAtendimentoId(null)} 
                onSuccess={() => { 
                  setActionAtendimentoId(null); 
                  queryClient.invalidateQueries({ queryKey: ['reviews'] });
                  showToast('success', 'Ação executada com sucesso!'); 
                }}
                showToast={showToast}
              />
            )}

            {showNotificationCenter && (
                <NotificationCenter 
                    onClose={() => setShowNotificationCenter(false)}
                    onSelectAction={(id: string) => { 
                        setShowNotificationCenter(false);
                        setActionAtendimentoId(id);
                    }}
                />
            )}
        </div>
    );
};

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showUserAdminModal, setShowUserAdminModal] = useState(false);

  useEffect(() => {
      const storedSession = localStorage.getItem('simas_user_session');
      const storedToken = localStorage.getItem('simas_auth_token');
      if (storedSession && storedToken) {
          try {
              setSession(JSON.parse(storedSession));
          } catch (e) {
              console.error("Failed to restore session", e);
          }
      }
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
    queryClient.clear(); // Clear cache on logout
  };

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
        <Router>
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <MainLayout 
                session={session} 
                onLogout={handleLogout} 
                showToast={showToast} 
                onUserAdmin={() => setShowUserAdminModal(true)} 
            />
            {showUserAdminModal && <UserAdminModal onClose={() => setShowUserAdminModal(false)} session={session} showToast={showToast} />}
        </Router>
    </QueryClientProvider>
  );
};

export default App;
