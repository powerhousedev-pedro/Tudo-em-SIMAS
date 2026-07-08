
import { RecordData } from '../types';

export const businessLogic = {
  getEscolaridadePoints: (escolaridade: string | undefined | null): number => {
    if (!escolaridade) return -1;
    const str = escolaridade.trim().toLowerCase();
    
    // Mapping exact strings or substrings to a point value
    if (str.includes('analfabeto')) return 0;
    if (str.includes('fundamental incompleto')) return 1;
    if (str.includes('fundamental cursando')) return 2;
    if (str === 'fundamental' || str.includes('fundamental completo')) return 3;
    if (str.includes('médio incompleto') || str.includes('medio incompleto')) return 4;
    if (str.includes('médio cursando') || str.includes('medio cursando')) return 5;
    if (str === 'médio' || str === 'medio' || str.includes('médio completo') || str.includes('medio completo')) return 6;
    if (str.includes('técnico incompleto') || str.includes('tecnico incompleto')) return 7;
    if (str.includes('técnico cursando') || str.includes('tecnico cursando')) return 8;
    if (str === 'técnico' || str === 'tecnico' || str.includes('técnico completo') || str.includes('tecnico completo')) return 9;
    if (str.includes('superior incompleto')) return 10;
    if (str.includes('superior cursando')) return 11;
    if (str === 'superior' || str.includes('superior completo')) return 12;
    if (str.includes('pós-graduação incompleto') || str.includes('pos-graduacao incompleto') || str.includes('pos-graduação incompleto')) return 13;
    if (str.includes('pós-graduação cursando') || str.includes('pos-graduacao cursando') || str.includes('pos-graduação cursando')) return 14;
    if (str.includes('pós-graduação completo') || str.includes('pos-graduacao completo') || str.includes('pos-graduação completo')) return 15;
    if (str.includes('mestrado incompleto')) return 16;
    if (str.includes('mestrado cursando')) return 17;
    if (str.includes('mestrado completo') || str === 'mestrado') return 18;
    if (str.includes('doutorado incompleto')) return 19;
    if (str.includes('doutorado cursando')) return 20;
    if (str.includes('doutorado completo') || str === 'doutorado') return 21;
    
    return -1; // Desconhecido
  },

  checkEscolaridade: (pessoaEscolaridade: string | undefined | null, cargoEscolaridade: string | undefined | null) => {
    if (!pessoaEscolaridade || !cargoEscolaridade) {
        return { condiz: true, message: '' }; // Se falta dado, não penaliza por padrão
    }
    const pessoaPts = businessLogic.getEscolaridadePoints(pessoaEscolaridade);
    const cargoPts = businessLogic.getEscolaridadePoints(cargoEscolaridade);
    
    if (pessoaPts === -1 || cargoPts === -1) {
        return { condiz: true, message: '' };
    }

    if (pessoaPts >= cargoPts) {
        return { condiz: true, message: 'Escolaridade condiz com o exigido pelo cargo.' };
    } else {
        return { condiz: false, message: `Escolaridade insuficiente. Exigido: ${cargoEscolaridade}` };
    }
  }
};
