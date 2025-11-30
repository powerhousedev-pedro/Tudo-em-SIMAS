
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportData, DossierData } from '../types';
import { validation } from '../utils/validation';

export const generateReportPDF = (
  reportId: string, 
  reportLabel: string, 
  data: ReportData, 
  vagasView: 'quantitativo' | 'panorama'
) => {
    if (!data) return;

    const doc = new jsPDF();
    const today = new Date().toLocaleDateString('pt-BR');

    // Header
    doc.setFillColor(19, 51, 90); // Simas Dark
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(reportLabel, 14, 13);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, 150, 13);

    let currentY = 30;

    // Totals Section
    if (data.totais) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.text("Resumo Geral:", 14, currentY);
        currentY += 7;
        
        const keys = Object.keys(data.totais);
        keys.forEach(key => {
            doc.setFontSize(10);
            doc.text(`${key}: ${data.totais![key]}`, 14, currentY);
            currentY += 6;
        });
        currentY += 5;
    }

    // Painel Vagas Logic
    if (reportId === 'painelVagas') {
        if (vagasView === 'quantitativo' && data.quantitativo) {
            autoTable(doc, {
                startY: currentY,
                head: [['Vinculação', 'Lotação', 'Cargo', 'Detalhes']],
                body: data.quantitativo.map(item => [item.VINCULACAO, item.LOTACAO, item.CARGO, item.DETALHES]),
                theme: 'grid',
                headStyles: { fillColor: [42, 104, 143] }
            });
        } else if (data.panorama) {
            autoTable(doc, {
                startY: currentY,
                head: [['Ocupante', 'Vinculação', 'Lotação', 'Cargo', 'Status']],
                body: data.panorama.map(item => [item.OCUPANTE || 'Vaga Livre', item.VINCULACAO, item.LOTACAO_OFICIAL, item.NOME_CARGO, item.STATUS]),
                theme: 'grid',
                headStyles: { fillColor: [42, 104, 143] }
            });
        }
    }
    // Generic Table Handling (Fallback for custom or future reports)
    else if ((data.colunas && data.linhas) || data.tabela) {
        const cols = data.colunas || data.tabela?.colunas || [];
        const rows = data.linhas || data.tabela?.linhas || [];
        
        autoTable(doc, {
            startY: currentY,
            head: [cols],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [42, 104, 143] }
        });
    }

    doc.save(`${reportLabel.replace(/\s+/g, '_')}_${today}.pdf`);
};

export const generateDossierPDF = (data: DossierData) => {
    if (!data) return;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(19, 51, 90); 
    doc.rect(0, 0, 210, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text(data.pessoal.NOME || 'Dossiê', 14, 13);
    doc.setFontSize(10);
    doc.text(`CPF: ${validation.formatCPF(data.pessoal.CPF)}`, 14, 20);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 150, 20);

    let currentY = 35;

    // Dados Pessoais
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Dados Pessoais", 14, currentY);
    currentY += 5;
    
    const personalRows = [
        ['Nascimento', validation.formatDate(data.pessoal.DATA_DE_NASCIMENTO)],
        ['Telefone', validation.formatPhone(data.pessoal.TELEFONE)],
        ['Email', data.pessoal.EMAIL || 'N/A'],
        ['Bairro', data.pessoal.BAIRRO || 'N/A'],
        ['Escolaridade', data.pessoal.ESCOLARIDADE || 'N/A'],
        ['Formação', data.pessoal.FORMACAO || 'N/A']
    ];

    autoTable(doc, {
        startY: currentY,
        body: personalRows,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }
    });
    
    currentY = (doc as any).lastAutoTable.finalY + 10;

    // Vínculos
    if (data.vinculosAtivos && data.vinculosAtivos.length > 0) {
        doc.setFontSize(12);
        doc.text("Vínculos Ativos", 14, currentY);
        currentY += 5;

        const vinculosRows = data.vinculosAtivos.map(v => [
            v.tipo, 
            v.cargo_efetivo || v.funcao || 'N/A', 
            v.lotacao || v.alocacao_atual || 'N/A',
            validation.formatDate(v.data_inicio || v.data_admissao)
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['Tipo', 'Cargo/Função', 'Lotação', 'Início']],
            body: vinculosRows,
            theme: 'striped',
            headStyles: { fillColor: [42, 104, 143] }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Histórico
    if (data.historico && data.historico.length > 0) {
        doc.setFontSize(12);
        doc.text("Histórico", 14, currentY);
        currentY += 5;

        const histRows = data.historico.map(h => [
            h.periodo, 
            h.tipo, 
            h.descricao, 
            h.detalhes
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [['Período', 'Tipo', 'Descrição', 'Detalhes']],
            body: histRows,
            theme: 'striped',
            headStyles: { fillColor: [19, 51, 90] }
        });
        currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.save(`Dossie_${data.pessoal.NOME?.split(' ')[0] || 'Completo'}.pdf`);
};
