
import React, { useState, useCallback, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Reports } from './components/Reports';
import { Workflows } from './components/Workflows';
import { History } from './components/History';
import { ToastContainer, ToastMessage } from './components/Toast';
import { UserAdminModal } from './components/UserAdminModal';
import { ActionExecutionModal } from './components/ActionExecutionModal';
import { Button } from './components/Button';
import { UserSession, AppRoute, AppContextProps } from './types';
import { api } from './services/api';
import { Logo } from './components/Logo';

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showUserAdminModal, setShowUserAdminModal] = useState(false);
  
  // --- STATE FOR GLOBAL REVIEWS ---
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [reviewSearchTerm, setReviewSearchTerm] = useState('');
  const [actionAtendimentoId, setActionAtendimentoId] = useState<string | null>(null);

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

  // --- POLLING / LOADING REVIEWS ---
  const loadPendingReviews = useCallback(() => {
    if (session) {
      api.getRevisoesPendentes().then(setPendingReviews).catch(console.error);
    }
  }, [session]);

  useEffect(() => {
    loadPendingReviews();
    // Optional: Poll every minute
    const interval = setInterval(loadPendingReviews, 60000);
    return () => clearInterval(interval);
  }, [loadPendingReviews]);

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
              <div className="h-10 w-10 bg-white text-simas-dark flex items-center justify-center rounded-xl shadow-lg transform transition-transform hover:scale-105 p-2">
                <Logo className="w-full h-full" />
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

            {/* Profile & Actions */}
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
                  {/* APP WIDE NOTIFICATION BELL */}
                  <button 
                    onClick={() => setShowReviewsModal(true)} 
                    className="relative w-8 h-8 rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-all flex items-center justify-center" 
                    title="Revisões Pendentes"
                  >
                      <i className="fas fa-bell text-xs"></i>
                      {pendingReviews.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-simas-cyan text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm border-2 border-simas-dark">
                          {pendingReviews.length}
                        </span>
                      )}
                  </button>

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
        
        {/* EXECUTION MODAL (Global) */}
        {actionAtendimentoId && (
          <ActionExecutionModal 
            idAtendimento={actionAtendimentoId} 
            onClose={() => setActionAtendimentoId(null)} 
            onSuccess={() => { 
              setActionAtendimentoId(null); 
              loadPendingReviews(); 
              showToast('success', 'Ação executada com sucesso!'); 
            }} 
          />
        )}

        {/* PENDING REVIEWS LIST MODAL (Global) */}
        {showReviewsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-in">
                  <div className="p-6 border-b flex flex-col gap-4 bg-gray-50">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-simas-dark tracking-tight">Revisões Pendentes</h3>
                        <button onClick={() => setShowReviewsModal(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"><i className="fas fa-times"></i></button>
                      </div>
                      <div className="relative">
                          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                          <input 
                              type="text" 
                              placeholder="Buscar pendência por nome, tipo..." 
                              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-simas-cyan transition-all"
                              value={reviewSearchTerm}
                              onChange={(e) => setReviewSearchTerm(e.target.value)}
                          />
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-white space-y-4">
                      {pendingReviews.length === 0 ? <div className="text-center text-gray-400 py-10 flex flex-col items-center gap-4"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center"><i className="fas fa-check text-2xl text-green-500"></i></div> Tudo limpo!</div> : 
                        pendingReviews
                          .filter(rev => 
                            !reviewSearchTerm || 
                            `${rev.TIPO_DE_ACAO} ${rev.ENTIDADE_ALVO} ${rev.NOME_PESSOA} ${rev.TIPO_PEDIDO}`.toLowerCase().includes(reviewSearchTerm.toLowerCase())
                          )
                          .map(rev => (
                            <div key={rev.ID_ATENDIMENTO} className="bg-white p-5 rounded-2xl border border-gray-100 flex justify-between items-center hover:shadow-lg hover:border-simas-cyan/30 transition-all group">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center group-hover:bg-simas-cyan group-hover:text-white transition-colors"><i className="fas fa-tasks text-lg"></i></div>
                                    <div>
                                        <h4 className="font-bold text-simas-dark text-lg leading-tight group-hover:text-simas-cyan transition-colors">{rev.TIPO_DE_ACAO} {rev.ENTIDADE_ALVO}</h4>
                                        <p className="text-sm text-gray-500">Para: <span className="font-medium text-gray-700">{rev.NOME_PESSOA}</span></p>
                                        <p className="text-xs text-gray-400 mt-1">Agendado para: {new Date(rev.DATA_AGENDAMENTO).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                                    </div>
                                </div>
                                <Button onClick={() => { setShowReviewsModal(false); setActionAtendimentoId(rev.ID_ATENDIMENTO); }} className="rounded-full px-6">Executar</Button>
                            </div>
                        ))
                      }
                  </div>
              </div>
          </div>
        )}

      </div>
    </Router>
  );
};

export default App;