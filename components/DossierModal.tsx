
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DossierData } from '../types';
import { validation } from '../utils/validation';
import { generateDossierPDF } from '../utils/pdfGenerator';

interface DossierModalProps {
  cpf: string;
  onClose: () => void;
}

export const DossierModal: React.FC<DossierModalProps> = ({ cpf, onClose }) => {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cleanCpf = cpf.replace(/\D/g, '');
        const res = await api.getDossiePessoal(cleanCpf);
        if (!res) throw new Error("Dados não retornados.");
        setData(res);
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Erro desconhecido ao carregar dossiê.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [cpf]);

  const handleDownloadPDF = () => {
    if (data) generateDossierPDF(data);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-medium">Gerando ficha cadastral...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
            <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <i className="fas fa-exclamation-triangle text-2xl text-red-500"></i>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Erro ao carregar</h3>
                <p className="text-sm text-gray-500 mb-6">{error || 'Dados não encontrados.'}</p>
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-200 transition-colors">Fechar</button>
            </div>
        </div>
      );
  }

  const p = data.pessoal || { NOME: 'Desconhecido', CPF: cpf };
  
  const badgeColors: {[key: string]: string} = {
    'Contratado': 'bg-green-100 text-green-800 border-green-200',
    'Servidor': 'bg-blue-100 text-blue-800 border-blue-200',
    'Estudante': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Avulso': 'bg-gray-100 text-gray-800 border-gray-200'
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:overflow-visible print:block print:relative print:inset-auto">
      <div className="relative w-full max-w-5xl my-8 bg-white rounded-3xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none print:w-full print:max-w-none print:my-0">
        
        {/* --- HEADER --- */}
        <div className="bg-simas-dark text-white p-8 print:p-6 print:border-b-2 print:border-black print:bg-white print:text-black">
            <div className="flex justify-between items-start">
                <div className="flex gap-6 items-center">
                     <div className="w-20 h-20 rounded-full bg-white text-simas-dark flex items-center justify-center text-3xl font-black shadow-lg print:border-2 print:border-black print:shadow-none">
                         {(p.NOME_SOCIAL || p.NOME)?.charAt(0) || '?'}
                     </div>
                     <div>
                         <h1 className="text-3xl font-bold tracking-tight mb-2 print:text-black">{p.NOME_SOCIAL || p.NOME}</h1>
                         <div className="flex items-center gap-3">
                             <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border print:border-black print:bg-transparent print:text-black ${badgeColors[data.tipoPerfil] || 'bg-gray-500'}`}>
                                 {data.tipoPerfil}
                             </span>
                             <span className="text-sm opacity-80 print:opacity-100 font-mono">CPF: {validation.formatCPF(p.CPF)}</span>
                         </div>
                     </div>
                </div>
                
                <div className="flex gap-3 print:hidden">
                    <button onClick={handleDownloadPDF} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                        <i className="fas fa-file-pdf"></i> Baixar PDF
                    </button>
                    <button onClick={onClose} className="bg-white text-simas-dark hover:bg-gray-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>

        {/* --- CONTENT GRID --- */}
        <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 print:block print:p-6">
            
            {/* COL 1: Dados Pessoais e Vínculo (Sidebar no Desktop) */}
            <div className="lg:col-span-1 space-y-8 print:mb-8 print:break-inside-avoid">
                
                {/* Dados Pessoais */}
                <section>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-gray-100 pb-2 flex items-center gap-2 print:text-black print:border-black">
                        <i className="fas fa-user-circle"></i> Dados Pessoais
                    </h3>
                    <div className="space-y-4">
                        <InfoRow label="Data de Nascimento" value={`${validation.formatDate(p.DATA_DE_NASCIMENTO)} (${validation.calculateAge(p.DATA_DE_NASCIMENTO) || '?'} anos)`} />
                        <InfoRow label="Telefone" value={validation.formatPhone(p.TELEFONE || '')} />
                        <InfoRow label="Email" value={p.EMAIL} />
                        <InfoRow label="Endereço (Bairro)" value={p.BAIRRO} />
                        <InfoRow label="Escolaridade" value={p.ESCOLARIDADE} />
                        <InfoRow label="Formação" value={p.FORMACAO} />
                    </div>
                </section>

                {/* Vínculo Ativo */}
                <section className="bg-gray-50 rounded-2xl p-6 border border-gray-100 print:bg-transparent print:border-black print:p-4 print:mt-4">
                    <h3 className="text-xs font-bold text-simas-dark uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i className="fas fa-id-badge"></i> Vínculo Ativo
                    </h3>
                    {data.vinculosAtivos && data.vinculosAtivos.length > 0 ? (
                        data.vinculosAtivos.map((v, i) => (
                            <div key={i} className="space-y-3 text-sm mb-6 last:mb-0">
                                <div className="font-bold text-simas-blue border-b border-gray-200 pb-1 mb-2 print:text-black print:border-black">{v.tipo.toUpperCase()}</div>
                                <InfoRow label="ID/Matrícula" value={v.id_contrato || v.matricula} compact />
                                <InfoRow label="Cargo/Função" value={v.cargo_efetivo || v.funcao} compact />
                                <InfoRow label="Lotação" value={v.lotacao || v.alocacao_atual} compact />
                                {v.salario && <InfoRow label="Salário" value={validation.formatCurrency(v.salario)} compact />}
                                <InfoRow label="Início" value={validation.formatDate(v.data_inicio || v.data_admissao)} compact />
                                {v.detalhes && <p className="text-xs text-gray-500 mt-2 italic print:text-black">{v.detalhes}</p>}
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-400 italic">Nenhum vínculo ativo no momento.</p>
                    )}
                </section>

            </div>

            {/* COL 2 & 3: Linha do Tempo e Capacitações */}
            <div className="lg:col-span-2 print:mt-6">
                
                {/* SEÇÃO 1: Histórico Profissional */}
                <div className="mb-10 print:break-inside-avoid">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-100 pb-2 flex items-center gap-2 print:text-black print:border-black">
                        <i className="fas fa-history"></i> Histórico Profissional
                    </h3>

                    <div className="relative pl-4">
                        {/* Vertical Line */}
                        <div className="absolute left-[21px] top-2 bottom-0 w-0.5 bg-gray-100 print:border-l print:border-gray-300"></div>

                        <div className="space-y-8">
                            {(!data.historico || data.historico.length === 0) ? (
                                <div className="text-center py-6 text-gray-400 italic bg-gray-50 rounded-xl print:bg-transparent print:border print:border-gray-300">Nenhum histórico registrado.</div>
                            ) : (
                                data.historico.map((item, idx) => (
                                    <div key={idx} className="relative flex gap-6 group print:break-inside-avoid">
                                        {/* Icon Dot */}
                                        <div className={`
                                            relative z-10 w-11 h-11 rounded-full border-4 border-white shadow-sm flex items-center justify-center shrink-0
                                            ${item.cor === 'red' ? 'bg-red-100 text-red-600' : 
                                            item.cor === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}
                                            print:border-black print:bg-white print:text-black
                                        `}>
                                            <i className={`fas ${item.icone} text-sm`}></i>
                                        </div>

                                        {/* Content Card */}
                                        <div className="flex-1 pt-1 pb-4">
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline mb-1">
                                                <h4 className="text-base font-bold text-gray-900">{item.tipo}</h4>
                                                <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded print:bg-transparent print:text-black print:border print:border-black">{item.periodo}</span>
                                            </div>
                                            <p className="text-sm font-medium text-simas-dark/80 mb-1 print:text-black">{item.descricao}</p>
                                            <p className="text-sm text-gray-500 leading-relaxed print:text-gray-700">{item.detalhes}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* SEÇÃO 2: Capacitações / Frequência (NOVO) */}
                <div className="print:break-inside-avoid">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-100 pb-2 flex items-center gap-2 print:text-black print:border-black">
                        <i className="fas fa-graduation-cap"></i> Capacitação e Desenvolvimento
                    </h3>

                    {(!data.atividadesEstudantis?.capacitacoes || data.atividadesEstudantis.capacitacoes.length === 0) ? (
                        <div className="text-center py-6 text-gray-400 italic bg-gray-50 rounded-xl print:bg-transparent print:border print:border-gray-300">Nenhuma atividade de capacitação registrada.</div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {data.atividadesEstudantis.capacitacoes.map((cap, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:border-black print:shadow-none">
                                    <div>
                                        <h4 className="font-bold text-simas-dark text-sm print:text-black">{cap.nome}</h4>
                                        <p className="text-xs text-gray-500 mt-1 print:text-gray-700">{cap.turma}</p>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-medium">
                                        <span className="text-gray-500 print:text-black"><i className="far fa-calendar mr-1"></i> {cap.data}</span>
                                        <span className={`px-2 py-1 rounded-md border ${cap.status === 'Presente' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'} print:border-black print:bg-transparent print:text-black`}>
                                            {cap.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

        </div>
      </div>
    </div>
  );
};

// Helper Component for Data Rows
const InfoRow: React.FC<{ label: string; value: any; compact?: boolean }> = ({ label, value, compact }) => (
    <div className={`${compact ? 'mb-1' : 'mb-3'}`}>
        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider print:text-black">{label}</span>
        <span className={`block text-gray-900 font-medium ${compact ? 'text-sm' : 'text-base'}`}>{value || 'N/A'}</span>
    </div>
);
