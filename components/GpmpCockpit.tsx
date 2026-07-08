import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Button } from './Button';
import { DossierModal } from './DossierModal';

export const GpmpCockpit: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'vagas' | 'cotas'>('vagas');
    const [dossierVagaCpf, setDossierVagaCpf] = useState<string | null>(null);

    // Timeline state (reused logic from MonitoramentoPanel)
    const [timelineVagaId, setTimelineVagaId] = useState<string | null>(null);
    const [timelineData, setTimelineData] = useState<any>(null);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.getGpmpCockpit();
            setData(res);
        } catch (e) {
            console.error('Erro ao carregar Cockpit GPMP:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!timelineVagaId) {
            setTimelineData(null);
            return;
        }
        const fetchTimeline = async () => {
            setLoadingTimeline(true);
            try {
                const data = await api.getVagaTimeline(timelineVagaId);
                setTimelineData(data);
            } catch (e) {
                console.error("Erro ao buscar timeline da vaga:", e);
                setTimelineData(null);
            } finally {
                setLoadingTimeline(false);
            }
        };
        fetchTimeline();
    }, [timelineVagaId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm flex-1">
                <div className="w-12 h-12 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin"></div>
                <p className="text-simas-blue font-medium animate-pulse">Carregando Cockpit GPMP...</p>
            </div>
        );
    }

    if (!data) return <div className="text-center text-gray-500 py-10">Falha ao carregar os dados.</div>;

    const allVagasList = [...data.vacancia.criticas, ...data.vacancia.alerta, ...data.vacancia.atencao];

    return (
        <div className="flex flex-col gap-6 animate-fade-in pb-10">
            {/* LINHA 1: RADAR (CARDS) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Saúde dos Editais */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-simas-blue flex items-center justify-center">
                            <i className="fas fa-file-contract"></i>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saúde dos Editais</h3>
                            <p className="text-sm font-black text-simas-dark">{data.termometroEditais.lista.length} Ativos</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-green-600 font-bold"><i className="fas fa-check-circle mr-1"></i> Na Meta</span>
                            <span className="font-bold bg-green-100 px-2 rounded-full text-green-700">{data.termometroEditais.naMeta}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-orange-500 font-bold"><i className="fas fa-exclamation-circle mr-1"></i> Satisfatório</span>
                            <span className="font-bold bg-orange-100 px-2 rounded-full text-orange-600">{data.termometroEditais.satisfatorios}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-red-500 font-bold"><i className="fas fa-times-circle mr-1"></i> Déficit</span>
                            <span className="font-bold bg-red-100 px-2 rounded-full text-red-600">{data.termometroEditais.deficit}</span>
                        </div>
                    </div>
                </div>

                {/* Radar de Vacância */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
                            <i className="fas fa-chair"></i>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Radar de Vagas</h3>
                            <p className="text-sm font-black text-simas-dark">{allVagasList.length} Vazias</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-red-600 font-bold"><i className="fas fa-circle mr-1 text-[8px]"></i> Crítico (15+ dias)</span>
                            <span className="font-bold bg-red-100 px-2 rounded-full text-red-700">{data.vacancia.criticas.length}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-orange-500 font-bold"><i className="fas fa-circle mr-1 text-[8px]"></i> Alerta (7 a 14 dias)</span>
                            <span className="font-bold bg-orange-100 px-2 rounded-full text-orange-600">{data.vacancia.alerta.length}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-yellow-500 font-bold"><i className="fas fa-circle mr-1 text-[8px]"></i> Atenção (Até 6 dias)</span>
                            <span className="font-bold bg-yellow-100 px-2 rounded-full text-yellow-600">{data.vacancia.atencao.length}</span>
                        </div>
                    </div>
                </div>

                {/* Indicador de Cotas Globais */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center">
                            <i className="fas fa-users"></i>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cotas Globais</h3>
                            <p className="text-sm font-black text-simas-dark">Atendimento</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-purple-600 font-bold">PCD</span>
                            <span className="font-bold bg-gray-100 px-2 rounded text-gray-600">{data.cotas.global.realizadoPCD} / {data.cotas.global.metaPCD_Absoluta}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-purple-600 font-bold">Assistência</span>
                            <span className="font-bold bg-gray-100 px-2 rounded text-gray-600">{data.cotas.global.realizadoAssist} / {data.cotas.global.metaAssist_Absoluta}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-purple-600 font-bold">Afro</span>
                            <span className="font-bold bg-gray-100 px-2 rounded text-gray-600">
                                M:{data.cotas.global.realizadoAfro_M}/{data.cotas.global.metaAfro_M_Absoluta} | F:{data.cotas.global.realizadoAfro_F}/{data.cotas.global.metaAfro_F_Absoluta}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Giro de Pessoal */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-green-50 text-green-500 flex items-center justify-center">
                            <i className="fas fa-sync-alt"></i>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Giro Mensal</h3>
                            <p className="text-sm font-black text-simas-dark">Últimos 30 Dias</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-green-600 font-bold"><i className="fas fa-arrow-up mr-1"></i> Admissões</span>
                            <span className="font-bold bg-green-100 px-2 rounded-full text-green-700">+{data.giro.admissoes}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-red-500 font-bold"><i className="fas fa-arrow-down mr-1"></i> Desligamentos</span>
                            <span className="font-bold bg-red-100 px-2 rounded-full text-red-600">-{data.giro.desligamentos}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-1 pt-1 border-t border-gray-100">
                            <span className="text-gray-500 font-bold">Saldo</span>
                            <span className={`font-bold px-2 rounded-full ${data.giro.saldo >= 0 ? 'bg-simas-cyan/10 text-simas-cyan' : 'bg-red-100 text-red-600'}`}>
                                {data.giro.saldo > 0 ? '+' : ''}{data.giro.saldo}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ABAS (CORPO PRINCIPAL) */}
            <div className="bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden flex flex-col">
                <div className="flex border-b border-gray-100 bg-gray-50">
                    <button 
                        onClick={() => setActiveTab('vagas')} 
                        className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'vagas' ? 'border-simas-cyan text-simas-cyan bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100'}`}
                    >
                        <i className="fas fa-clipboard-list mr-2"></i> Fila de Vagas ({allVagasList.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('cotas')} 
                        className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'cotas' ? 'border-simas-cyan text-simas-cyan bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100'}`}
                    >
                        <i className="fas fa-chart-pie mr-2"></i> Monitoramento de Cotas (Por Edital)
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'vagas' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left whitespace-nowrap">
                                <thead>
                                    <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 bg-gray-50/50">
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Dias Vazios</th>
                                        <th className="px-4 py-3">Lotação</th>
                                        <th className="px-4 py-3">Posto / Edital</th>
                                        <th className="px-4 py-3 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {allVagasList.map((v: any) => {
                                        let bgStatus = 'bg-yellow-100 text-yellow-700';
                                        let iconStatus = 'fa-exclamation-triangle';
                                        if (v.diasVazios >= 15) {
                                            bgStatus = 'bg-red-100 text-red-700';
                                            iconStatus = 'fa-radiation';
                                        } else if (v.diasVazios >= 7) {
                                            bgStatus = 'bg-orange-100 text-orange-700';
                                            iconStatus = 'fa-exclamation-circle';
                                        }

                                        return (
                                            <tr key={v.ID_VAGA} className="hover:bg-gray-50 transition-colors group">
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${bgStatus}`}>
                                                        <i className={`fas ${iconStatus}`}></i>
                                                        {v.diasVazios >= 15 ? 'Crítico' : v.diasVazios >= 7 ? 'Alerta' : 'Atenção'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-black text-simas-dark">{v.diasVazios}</span> <span className="text-xs text-gray-500 font-medium">dias</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-700 font-medium truncate max-w-[200px]" title={v.lotacao?.LOTACAO}>
                                                    {v.lotacao?.LOTACAO}
                                                </td>
                                                <td className="px-4 py-3 flex flex-col">
                                                    <span className="text-sm font-bold text-simas-cyan">{v.postoTrabalho?.NOME_POSTO}</span>
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">{v.edital?.EDITAL}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => setTimelineVagaId(v.ID_VAGA)} className="px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-simas-cyan hover:text-white rounded text-xs font-bold transition-all shadow-sm">
                                                        <i className="fas fa-history mr-1"></i> Linha do Tempo
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {allVagasList.length === 0 && (
                                        <tr><td colSpan={5} className="text-center py-8 text-gray-400 italic">Nenhuma vaga em aberto no momento.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'cotas' && (
                        <div className="grid grid-cols-1 gap-6">
                            {data.cotas.porEdital.map((editalCota: any, idx: number) => (
                                <div key={idx} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                                    <h4 className="font-black text-simas-dark mb-4 pb-2 border-b border-gray-200 uppercase">{editalCota.edital}</h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">PCD</p>
                                            <div className="flex items-end justify-between">
                                                <span className="text-xl font-black text-simas-dark">{editalCota.realizado.pcd}</span>
                                                <span className="text-xs font-bold text-gray-500">/ {editalCota.metas.pcd} meta</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-1.5 mt-2 rounded-full overflow-hidden">
                                                <div className={`h-full ${editalCota.realizado.pcd >= editalCota.metas.pcd ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `\${Math.min(100, editalCota.metas.pcd > 0 ? (editalCota.realizado.pcd / editalCota.metas.pcd) * 100 : 100)}%` }}></div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Assistência</p>
                                            <div className="flex items-end justify-between">
                                                <span className="text-xl font-black text-simas-dark">{editalCota.realizado.assist}</span>
                                                <span className="text-xs font-bold text-gray-500">/ {editalCota.metas.assist} meta</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-1.5 mt-2 rounded-full overflow-hidden">
                                                <div className={`h-full ${editalCota.realizado.assist >= editalCota.metas.assist ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `\${Math.min(100, editalCota.metas.assist > 0 ? (editalCota.realizado.assist / editalCota.metas.assist) * 100 : 100)}%` }}></div>
                                            </div>
                                        </div>

                                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Afro (Homem)</p>
                                            <div className="flex items-end justify-between">
                                                <span className="text-xl font-black text-simas-dark">{editalCota.realizado.afro_m}</span>
                                                <span className="text-xs font-bold text-gray-500">/ {editalCota.metas.afro_m} meta</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-1.5 mt-2 rounded-full overflow-hidden">
                                                <div className={`h-full ${editalCota.realizado.afro_m >= editalCota.metas.afro_m ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `\${Math.min(100, editalCota.metas.afro_m > 0 ? (editalCota.realizado.afro_m / editalCota.metas.afro_m) * 100 : 100)}%` }}></div>
                                            </div>
                                        </div>

                                        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Afro (Mulher)</p>
                                            <div className="flex items-end justify-between">
                                                <span className="text-xl font-black text-simas-dark">{editalCota.realizado.afro_f}</span>
                                                <span className="text-xs font-bold text-gray-500">/ {editalCota.metas.afro_f} meta</span>
                                            </div>
                                            <div className="w-full bg-gray-100 h-1.5 mt-2 rounded-full overflow-hidden">
                                                <div className={`h-full ${editalCota.realizado.afro_f >= editalCota.metas.afro_f ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `\${Math.min(100, editalCota.metas.afro_f > 0 ? (editalCota.realizado.afro_f / editalCota.metas.afro_f) * 100 : 100)}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* TIMELINE DA VAGA MODAL */}
            {timelineVagaId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setTimelineVagaId(null)}>
                    <div 
                        className="bg-white w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden animate-slide-in flex flex-col border border-gray-100"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                            <div>
                                <h3 className="font-black text-simas-dark text-lg uppercase tracking-tight flex items-center gap-2">
                                    <i className="fas fa-history text-simas-cyan"></i> Dossiê da Vaga
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">{timelineVagaId}</p>
                            </div>
                            <button onClick={() => setTimelineVagaId(null)} className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors flex items-center justify-center shadow-sm">
                                <i className="fas fa-times"></i>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30 custom-scrollbar relative">
                            {loadingTimeline ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
                                    <div className="w-10 h-10 border-4 border-simas-cyan border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-simas-cyan font-bold mt-4 animate-pulse uppercase tracking-wider text-xs">Montando Linha do Tempo...</p>
                                </div>
                            ) : !timelineData ? (
                                <div className="h-full flex items-center justify-center text-gray-400 italic">
                                    Falha ao carregar a linha do tempo.
                                </div>
                            ) : (
                                <div className="max-w-xl mx-auto py-4">
                                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-8 flex flex-col items-center text-center">
                                        <h4 className="font-black text-simas-dark text-xl">{timelineData.vaga?.postoTrabalho?.NOME_POSTO}</h4>
                                        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mt-1">{timelineData.vaga?.lotacao?.LOTACAO}</p>
                                        <div className="mt-3 flex gap-2">
                                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">{timelineData.vaga?.edital?.EDITAL}</span>
                                            {timelineData.vaga?.BLOQUEADA && <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Bloqueada</span>}
                                        </div>
                                    </div>

                                    {timelineData.events?.length === 0 ? (
                                        <p className="text-center text-gray-400 italic">Nenhum evento registrado nesta vaga.</p>
                                    ) : (
                                        <div className="relative pl-6 border-l-2 border-gray-200 space-y-8 pb-10">
                                            {timelineData.events.map((event: any, idx: number) => {
                                                let icon = 'fa-circle';
                                                let color = 'text-gray-400';
                                                let bgColor = 'bg-white';
                                                
                                                if (event.type === 'CONTRATO_ATUAL' || event.type === 'CONTRATO_HISTORICO_INICIO') {
                                                    icon = 'fa-check';
                                                    color = 'text-simas-cyan';
                                                    bgColor = 'bg-simas-cyan/10';
                                                } else if (event.type === 'CONTRATO_HISTORICO_FIM') {
                                                    icon = 'fa-door-open';
                                                    color = 'text-red-400';
                                                    bgColor = 'bg-red-50';
                                                } else if (event.type.startsWith('SUBSTITUICAO')) {
                                                    icon = 'fa-exchange-alt';
                                                    color = 'text-green-500';
                                                    bgColor = 'bg-green-50';
                                                } else if (event.type === 'PROTOCOLO') {
                                                    icon = 'fa-file-signature';
                                                    color = 'text-purple-500';
                                                    bgColor = 'bg-purple-50';
                                                }

                                                return (
                                                    <div key={idx} className="relative animate-fade-in group">
                                                        <div className={`absolute -left-[35px] w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${bgColor} ${color} group-hover:scale-110 transition-transform`}>
                                                            <i className={`fas ${icon} text-[10px]`}></i>
                                                        </div>
                                                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-gray-300 transition-colors">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <h5 className={`font-bold text-sm ${color}`}>{event.title}</h5>
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg">
                                                                    {new Date(event.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-700 leading-snug">{event.description}</p>
                                                            {event.cpf && (
                                                                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                                                                     <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded">
                                                                        {event.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                                                     </span>
                                                                     <button 
                                                                        onClick={() => setDossierVagaCpf(event.cpf)}
                                                                        className="text-[10px] font-bold text-simas-cyan hover:text-simas-blue uppercase tracking-wider flex items-center gap-1"
                                                                     >
                                                                        Ver Dossiê <i className="fas fa-arrow-right"></i>
                                                                     </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {dossierVagaCpf && (
                <DossierModal cpf={dossierVagaCpf} onClose={() => setDossierVagaCpf(null)} />
            )}
        </div>
    );
};
