
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DossierData } from '../types';
import { validation } from '../utils/validation';

interface DossierModalProps {
  cpf: string;
  onClose: () => void;
}

export const DossierModal: React.FC<DossierModalProps> = ({ cpf, onClose }) => {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getDossiePessoal(cpf);
        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [cpf]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center">
          <div className="spinner-border text-simas-medium mb-4"></div>
          <p className="text-gray-600">Carregando dossiê...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const p = data.pessoal;
  const badgeColors: {[key: string]: string} = {
    'Contratado': 'bg-green-100 text-green-800 border-green-200',
    'Servidor': 'bg-blue-100 text-blue-800 border-blue-200',
    'Estudante': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Avulso': 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10 print:bg-white print:static print:block print:p-0">
      <div className="bg-gray-50 w-full max-w-4xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden print:shadow-none print:border-none print:w-full print:max-w-none">
        
        {/* Header */}
        <div className="bg-white px-8 py-6 border-b border-gray-200 flex justify-between items-start print:border-b-2 print:border-black">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-simas-dark">{p.NOME}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeColors[data.tipoPerfil] || badgeColors['Avulso']}`}>
                {data.tipoPerfil}
              </span>
            </div>
            <p className="text-gray-500 text-sm flex items-center gap-2">
              <i className="fas fa-id-card"></i> {validation.formatCPF(p.CPF)}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button onClick={handlePrint} className="btn btn-sm bg-white border hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg">
              <i className="fas fa-print mr-2"></i> Imprimir
            </button>
            <button onClick={onClose} className="btn btn-sm bg-simas-dark text-white hover:bg-simas-medium px-3 py-2 rounded-lg">
              Fechar
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 print:block print:space-y-6">
          
          {/* Personal Data */}
          <section className="col-span-2 md:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:border print:p-4 print:mb-4 print:break-inside-avoid">
            <h3 className="text-lg font-bold text-simas-medium mb-4 border-b pb-2 flex items-center gap-2">
              <i className="fas fa-user"></i> Dados Pessoais
            </h3>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500 font-medium">Nascimento:</span>
                <span className="col-span-2 text-gray-900">{p.DATA_DE_NASCIMENTO || 'N/A'} ({validation.calculateAge(p.DATA_DE_NASCIMENTO) || '-'} anos)</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500 font-medium">Telefone:</span>
                <span className="col-span-2 text-gray-900">{validation.formatPhone(p.TELEFONE || '')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500 font-medium">Email:</span>
                <span className="col-span-2 text-gray-900">{p.EMAIL || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500 font-medium">Bairro:</span>
                <span className="col-span-2 text-gray-900">{p.BAIRRO || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500 font-medium">Escolaridade:</span>
                <span className="col-span-2 text-gray-900">{p.ESCOLARIDADE || 'N/A'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500 font-medium">Formação:</span>
                <span className="col-span-2 text-gray-900">{p.FORMACAO || 'N/A'}</span>
              </div>
            </div>
          </section>

          {/* Active Link */}
          <section className="col-span-2 md:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:border print:p-4 print:mb-4 print:break-inside-avoid">
            <h3 className="text-lg font-bold text-simas-medium mb-4 border-b pb-2 flex items-center gap-2">
              <i className="fas fa-briefcase"></i> Vínculo Ativo
            </h3>
            {data.vinculosAtivos.length > 0 ? (
              data.vinculosAtivos.map((v, i) => (
                <div key={i} className="text-sm space-y-2 mb-4 last:mb-0">
                  <p><span className="font-semibold text-gray-600">Tipo:</span> {v.tipo}</p>
                  <p><span className="font-semibold text-gray-600">ID/Matrícula:</span> {v.id_contrato || v.matricula}</p>
                  <p><span className="font-semibold text-gray-600">Cargo:</span> {v.cargo || v.cargo_efetivo}</p>
                  <p><span className="font-semibold text-gray-600">Função:</span> {v.funcao || v.funcao_atual}</p>
                  <p><span className="font-semibold text-gray-600">Lotação:</span> {v.lotacao || v.alocacao_atual}</p>
                  <p><span className="font-semibold text-gray-600">Salário:</span> {v.salario ? validation.formatCurrency(v.salario) : 'N/A'}</p>
                  <p><span className="font-semibold text-gray-600">Início:</span> {v.data_inicio || v.data_admissao}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-400 italic">Nenhum vínculo ativo.</p>
            )}
          </section>

          {/* History */}
          <section className="col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:border print:p-4 print:break-inside-avoid">
            <h3 className="text-lg font-bold text-simas-medium mb-4 border-b pb-2 flex items-center gap-2">
              <i className="fas fa-history"></i> Histórico Profissional
            </h3>
            {data.historico.length > 0 ? (
              <ul className="relative border-l-2 border-gray-200 ml-3 space-y-6">
                {data.historico.map((h, i) => (
                  <li key={i} className="ml-6 relative">
                    <span className="absolute -left-[31px] top-0 w-4 h-4 bg-gray-200 rounded-full border-2 border-white"></span>
                    <h4 className="text-sm font-bold text-gray-900">{h.descricao}</h4>
                    <span className="text-xs text-gray-500 block mb-1">{h.periodo}</span>
                    <p className="text-sm text-gray-600">{h.detalhes}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400 italic">Sem histórico registrado.</p>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};
