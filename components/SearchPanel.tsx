import React, { useState } from 'react';
import { api } from '../services/api';
import { DossierModal } from './DossierModal';
import { validation } from '../utils/validation';

export const SearchPanel: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedCpf, setSelectedCpf] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query || query.length < 3) return;
        setLoading(true);
        setHasSearched(true);
        try {
            const data = await api.searchPessoas(query);
            setResults(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-simas-cloud p-8 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto w-full">
                <div className="bg-white rounded-3xl shadow-soft border border-gray-100 p-8 mb-8">
                    <h2 className="text-2xl font-black text-simas-dark flex items-center gap-3 tracking-brand uppercase mb-6">
                        <div className="w-10 h-10 rounded-full bg-simas-cyan/10 text-simas-cyan flex items-center justify-center">
                            <i className="fas fa-search text-base"></i>
                        </div>
                        Busca por Pessoa
                    </h2>

                    <form onSubmit={handleSearch} className="flex gap-4">
                        <div className="relative flex-1">
                            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                            <input
                                type="text"
                                placeholder="Buscar por Nome ou CPF..."
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setHasSearched(false);
                                    if (e.target.value.length < 3) setResults([]);
                                }}
                                className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium outline-none focus:border-simas-cyan focus:bg-white focus:ring-2 focus:ring-simas-cyan/20 transition-all"
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading || query.length < 3}
                            className="bg-simas-cyan text-white px-8 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-simas-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-glow"
                        >
                            {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Buscar'}
                        </button>
                    </form>
                </div>

                {results.length > 0 && (
                    <div className="space-y-4">
                        {results.map((pessoa, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setSelectedCpf(pessoa.CPF)}
                                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-simas-cyan cursor-pointer transition-all flex items-center gap-6 group hover:shadow-md"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center group-hover:bg-simas-cyan/10 group-hover:text-simas-cyan transition-colors">
                                    <i className={`fas ${pessoa.IS_TEMP ? 'fa-user-clock' : 'fa-user'} text-xl`}></i>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-simas-dark group-hover:text-simas-cyan transition-colors">{pessoa.NOME}</h3>
                                    <div className="flex gap-4 mt-1 text-sm text-gray-500">
                                        <span className="flex items-center gap-1"><i className="fas fa-id-card text-[10px]"></i> {validation.formatCPF(pessoa.CPF)}</span>
                                        {pessoa.DATA_DE_NASCIMENTO && (
                                            <span className="flex items-center gap-1"><i className="fas fa-calendar text-[10px]"></i> {validation.formatDate(pessoa.DATA_DE_NASCIMENTO)}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-gray-300 group-hover:text-simas-cyan transition-colors">
                                    <i className="fas fa-chevron-right"></i>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && hasSearched && results.length === 0 && (
                    <div className="text-center p-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
                        <i className="fas fa-search text-4xl text-gray-200 mb-4 block"></i>
                        <h3 className="text-lg font-bold text-gray-600">Nenhum resultado encontrado</h3>
                        <p className="text-sm text-gray-400 mt-2">Tente buscar por outro nome ou CPF.</p>
                    </div>
                )}
            </div>

            {selectedCpf && (
                <DossierModal cpf={selectedCpf} onClose={() => setSelectedCpf(null)} />
            )}
        </div>
    );
};