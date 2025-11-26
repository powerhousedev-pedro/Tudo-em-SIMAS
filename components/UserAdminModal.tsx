
import React, { useState } from 'react';
import { Button } from './Button';
import { api } from '../services/api';
import { UserSession } from '../types';

interface UserAdminModalProps {
  onClose: () => void;
  session: UserSession;
}

export const UserAdminModal: React.FC<UserAdminModalProps> = ({ onClose, session }) => {
  const [formData, setFormData] = useState({
    usuario: '',
    senha: '',
    nivel_acesso: session.papel !== 'COORDENAÇÃO' ? session.papel : '', // Lock to sector if not Coord
    is_gerente: false
  });
  const [loading, setLoading] = useState(false);

  const isCoord = session.papel === 'COORDENAÇÃO';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: name === 'is_gerente' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // If not coord, enforce role restriction just in case
      const payload = { ...formData };
      if (!isCoord) {
        payload.nivel_acesso = session.papel;
        payload.is_gerente = false;
      }

      const res = await api.createRecord('USUARIOS', payload); // Assuming API handles this or generic create
      if (res.success) {
        alert('Usuário criado com sucesso!');
        onClose();
      } else {
        alert('Erro ao criar usuário.');
      }
    } catch (error) {
      alert('Erro ao conectar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-slide-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-white/50">
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-extrabold text-lg text-simas-dark tracking-tight">Gerenciar Usuários</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors"><i className="fas fa-times"></i></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
                  name="nivel_acesso" required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:bg-white focus:border-simas-cyan focus:ring-0 outline-none disabled:opacity-60 appearance-none cursor-pointer"
                  value={formData.nivel_acesso} onChange={handleChange}
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
                   <span className="text-[10px] text-gray-400 font-medium mt-0.5">Concede permissões administrativas totais</span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    name="is_gerente"
                    className="sr-only peer"
                    checked={formData.is_gerente}
                    onChange={handleChange}
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-simas-cyan"></div>
                </div>
            </label>
          )}

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" isLoading={loading} className="flex-[2]">Criar Usuário</Button>
          </div>
        </form>
      </div>
    </div>
  );
};
