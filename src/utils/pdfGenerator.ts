
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportData } from '../types';

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

    // Totals Section (Simple Text)
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

    // Special Handling for Painel Vagas
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
    // Generic Table Handling
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
