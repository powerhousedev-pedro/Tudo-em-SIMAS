
import { RecordData } from '../types';

export const businessLogic = {
  calculateAtendimentoMetadata: (formData: RecordData) => {
    const status = formData.STATUS_PEDIDO;
    const tipo = formData.TIPO_PEDIDO;
    const hasDate = !!formData.DATA_AGENDAMENTO;

    let tipoAcao = "NENHUMA";
    let entidadeAlvo = "NENHUMA";
    let statusAgendamento = "N/A";

    if (hasDate) {
      statusAgendamento = "Pendente";
      
      if (status === "Aguardando") {
        tipoAcao = "CRIAR";
        entidadeAlvo = "ATENDIMENTO";
      } else if (status === "Acatado") {
        switch (tipo) {
          case "Contratação":
            tipoAcao = "CRIAR"; 
            entidadeAlvo = "CONTRATO"; 
            break;
          case "Promoção (Contratado)":
          case "Mudança (Contratado)":
            tipoAcao = "EDITAR"; 
            entidadeAlvo = "CONTRATO"; 
            break;
          case "Demissão":
            tipoAcao = "CRIAR"; 
            entidadeAlvo = "PROTOCOLO"; 
            break;
          case "Alocação de Servidor":
            tipoAcao = "CRIAR"; 
            entidadeAlvo = "ALOCACAO"; 
            break;
          case "Mudança de Alocação (Servidor)":
            tipoAcao = "EDITAR"; 
            entidadeAlvo = "ALOCACAO"; 
            break;
          case "Nomeação de Cargo Comissionado":
            tipoAcao = "CRIAR"; 
            entidadeAlvo = "NOMEAÇÃO"; 
            break;
          case "Exoneração de Cargo Comissionado":
          case "Exoneração do Serviço Público":
            tipoAcao = "INATIVAR"; 
            entidadeAlvo = "SERVIDOR"; 
            break;
        }
      }
    }

    return {
      TIPO_DE_ACAO: tipoAcao,
      ENTIDADE_ALVO: entidadeAlvo,
      STATUS_AGENDAMENTO: statusAgendamento
    };
  }
};
