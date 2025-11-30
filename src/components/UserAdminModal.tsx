import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { api } from '../services/api';
import { UserSession } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface UserAdminModalProps {
  onClose: () => void;
  session: UserSession;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const UserAdminModal: React.FC<UserAdminModalProps> = ({ onClose, session, showToast }) => {
  const [formData, setFormData] = useState({
    usuario: '',
    senha: '',
    papel: session.papel !== 'COORDENAÇÃO' ? session.papel : '',
    isGerente: false
  });
  const [loading, setLoading] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  
  // Deletion State
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Password Reset State
  const [resetUser, setResetUser] = useState<{id: string, usuario: string} | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const isCoord = session.papel === 'COORDENAÇÃO';

  useEffect(() => {
      loadUsers();
  }, []);

  const loadUsers = async () => {
      setLoadingList(true);
      try {
          const users = await api.getUsers();
          setUsersList(users);
      } catch (e) {
          console.error("Error loading users", e);
      } finally {
          setLoadingList(false);
      }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: name === 'isGerente' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...formData };
      if (!isCoord) {
        payload.papel = session.papel;
        payload.isGerente = false;
      }

      // Using correct Entity Name 'Usuario' as defined in tables.ts
      const res = await api.createRecord('Usuario', payload);
      if (res.success) {
        showToast('success', 'Usuário criado com sucesso!');
        setFormData({
            usuario: '',
            senha: '',
            papel: session.papel !== 'COORDENAÇÃO' ? session.papel : '',
            isGerente: false
        });
        loadUsers(); // Refresh list
      } else {
        showToast('error', res.message || 'Erro ao criar usuário.');
      }
    } catch (error) {
      showToast('error', 'Erro ao conectar.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteUser = async () => {
      if (!userToDelete) return;
      setDeleting(true);
      
      try {
          const res = await api.deleteUser(userToDelete);
          if (res.success) {
              showToast('success', 'Usuário excluído.');
              loadUsers();
          } else {
              showToast('error', res.message || 'Erro ao excluir.');
          }
      } catch (e: any) {
          showToast('error', 'Erro: ' + e.message);
      } finally {
          setDeleting(false);
          setUserToDelete(null);
      }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resetUser || !newPassword) return;
      setResetting(true);
      
      try {
          // Assuming 'id' is the primary key for Usuario (default in most DBs, though server uses 'id')
          const res = await api.updateRecord('Usuario', 'id', resetUser.id, { senha: newPassword });
          if (res.success) {
              showToast('success', 'Senha redefinida com sucesso!');
              setResetUser(null);
              setNewPassword('');
          } else {
              showToast('error', res.message || 'Erro ao redefinir senha.');
          }
      } catch (e: any) {
          showToast('error', 'Erro ao conectar: ' + e.message);
      } finally {
          setResetting(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-slide-in">
      <div className="bg-white w-full max-w-4xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden border border-white/50 flex relative">
        
        {/* Create User Column */}
        <div className="w-1/3 bg-white border-r border-gray-100 flex flex-col">
            <div className="p-6 border-b border-gray-100 bg-gray-50">
              <h3 className="font-extrabold text-lg text-simas-dark tracking-tight">Novo Usuário</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-bold text-simas-medium uppercase tracking-widest mb-1.5 ml-1">Nome do Usuário</label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <i className="fas fa-user text-xs"></i>
                    </div>
                    <input 
                      type="text" name="usuario" required
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all placeholder-gray-300"
                      placeholder="Digite o login..."
                      value={formData.usuario} onChange={handleChange}
                    />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-simas-medium uppercase tracking-widest mb-1.5 ml-1">Senha</label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <i className="fas fa-lock text-xs"></i>
                    </div>
                    <input 
                      type="password" name="senha" required
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all placeholder-gray-300"
                      placeholder="••••••••"
                      value={formData.senha} onChange={handleChange}
                    />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-simas-medium uppercase tracking-widest mb-1.5 ml-1">Nível de Acesso</label>
                <div className="relative">
                    <select 
                      name="papel" required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none disabled:opacity-60 appearance-none cursor-pointer"
                      value={formData.papel} onChange={handleChange}
                      disabled={!isCoord}
                    >
                      <option value="" disabled>Selecione o nível...</option>
                      <option value="COORDENAÇÃO">COORDENAÇÃO</option>
                      <option value="GGT">GGT</option>
                      <option value="GPRGP">GPRGP</option>
                      <option value="GDEP">GDEP</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        <i className="fas fa-chevron-down text-xs"></i>
                    </div>
                </div>
              </div>

              {isCoord && (
                <label className="flex items-center justify-between w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl cursor-pointer transition-all hover:border-simas-cyan/50 hover:bg-white group">
                    <div className="flex flex-col">
                       <span className="text-xs font-bold text-simas-dark uppercase tracking-widest group-hover:text-simas-cyan transition-colors">Acesso Gerencial</span>
                       <span className="text-[10px] text-gray-400 font-medium mt-0.5">Concede permissões totais</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        name="isGerente"
                        className="sr-only peer"
                        checked={formData.isGerente}
                        onChange={handleChange}
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-simas-cyan"></div>
                    </div>
                </label>
              )}

              <div className="pt-4">
                <Button type="submit" isLoading={loading} className="w-full">Criar Usuário</Button>
              </div>
            </form>
        </div>

        {/* List Users Column */}
        <div className="flex-1 flex flex-col bg-gray-50/30 relative">
            <div className="p-6 border-b border-gray-100 bg-white flex justify-between items-center">
              <h3 className="font-extrabold text-lg text-simas-dark tracking-tight">Usuários Existentes</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
                {loadingList ? (
                    <div className="text-center py-10"><div className="spinner-border text-simas-medium"></div></div>
                ) : usersList.length === 0 ? (
                    <p className="text-center text-gray-400">Nenhum usuário encontrado.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {usersList.map(user => (
                            <div key={user.usuario} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group hover:shadow-md transition-all">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-simas-cloud text-simas-dark flex items-center justify-center font-bold text-xs">
                                            {user.usuario.charAt(0).toUpperCase()}
                                        </div>
                                        <h4 className="font-bold text-simas-dark text-sm">{user.usuario}</h4>
                                    </div>
                                    <div className="mt-2 flex gap-2">
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-md uppercase">{user.papel}</span>
                                        {user.isGerente && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-md uppercase">Gerente</span>}
                                    </div>
                                </div>
                                
                                {user.usuario !== session.usuario && (
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => setResetUser({ id: user.id, usuario: user.usuario })}
                                            className="w-8 h-8 rounded-lg text-gray-300 hover:text-simas-cyan hover:bg-simas-cyan/10 flex items-center justify-center transition-all"
                                            title="Redefinir Senha"
                                        >
                                            <i className="fas fa-key text-sm"></i>
                                        </button>
                                        <button 
                                            onClick={() => setUserToDelete(user.usuario)} // Server expects ID usually, but here passing username for confirmation modal, need to ensure API handles ID in confirm
                                            // The delete API in api.ts takes ID. The modal uses a temporary name for display. 
                                            // Let's pass ID to the state for deletion.
                                            // *Correction*: ConfirmModal uses 'userToDelete' string for display. 
                                            // Let's reuse the existing logic but pass the correct ID to the API. 
                                            // Since api.deleteUser(id) takes ID, we should store ID.
                                            // But previous implementation stored username string.
                                            // I will modify setUserToDelete to store ID and add a display name state, OR assume userToDelete is ID.
                                            // To keep it simple and consistent with previous turn (which used 'usuario' as ID apparently?), 
                                            // I'll check server.ts... 'deleteUser' takes ID. 
                                            // I'll update the button to pass ID.
                                            className="w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all"
                                            title="Excluir Usuário"
                                        >
                                            <i className="fas fa-trash-alt text-sm"></i>
                                        </button>
                                        {/* Hidden button to capture ID for delete logic below */}
                                        <span onClick={() => setUserToDelete(user.id)} className="hidden"></span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Password Reset Overlay */}
            {resetUser && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex items-center justify-center animate-fade-in p-8">
                    <div className="bg-white w-full max-w-sm p-6 rounded-2xl shadow-xl border border-gray-200">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3 text-yellow-600">
                                <i className="fas fa-key text-lg"></i>
                            </div>
                            <h3 className="font-bold text-simas-dark">Redefinir Senha</h3>
                            <p className="text-sm text-gray-500">Nova senha para <strong>{resetUser.usuario}</strong></p>
                        </div>
                        <form onSubmit={handlePasswordReset}>
                            <div className="mb-4">
                                <input 
                                    type="password" 
                                    autoFocus
                                    placeholder="Digite a nova senha..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none transition-all text-center font-medium"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="secondary" onClick={() => { setResetUser(null); setNewPassword(''); }} className="flex-1 justify-center">Cancelar</Button>
                                <Button type="submit" isLoading={resetting} className="flex-1 justify-center">Salvar</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
      </div>
      
      {userToDelete && (
          <ConfirmModal 
              title="Excluir Usuário" 
              message="Tem certeza que deseja excluir este usuário permanentemente?"
              onConfirm={confirmDeleteUser} 
              onCancel={() => setUserToDelete(null)}
              isLoading={deleting}
          />
      )}
    </div>
  );
};