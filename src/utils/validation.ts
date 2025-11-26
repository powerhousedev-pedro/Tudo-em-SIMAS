
export const validation = {
  // --- VALIDAÇÃO ---
  
  validateCPF: (cpf: string): boolean => {
    const cleanCPF = cpf.replace(/[^\d]+/g, '');
    if (cleanCPF.length !== 11 || /^(\d)\1+$/.test(cleanCPF)) return false;
    
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) soma += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cleanCPF.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cleanCPF.substring(10, 11))) return false;
    
    return true;
  },

  // --- GERAÇÃO DE ID ---
  
  generateLegacyId: (prefix: string) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `${prefix}${result}`;
  },

  // --- MÁSCARAS (Input Visual) ---

  maskCPF: (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  },

  maskPhone: (value: string) => {
    let v = value.replace(/\D/g, "");
    
    if (v.length > 11) v = v.substring(0, 11);

    if (v.length > 10) { 
        return v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3"); 
    } 
    else if (v.length > 5) { 
        return v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3"); 
    } 
    else if (v.length > 2) { 
        return v.replace(/^(\d\d)(\d*)/, "($1) $2"); 
    } 
    else if (v.length > 0) {
        return v.replace(/^(\d*)/, "($1");
    }
    return v;
  },

  maskCurrency: (value: string) => {
    let v = value.replace(/\D/g, "");
    if (!v) return "";
    
    const floatValue = parseFloat(v) / 100;
    
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(floatValue);
  },

  // --- FORMATAÇÃO (Exibição) ---

  formatDate: (value: any) => {
    if (!value) return 'N/A';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch (e) {
      return 'N/A';
    }
  },

  formatCPF: (value: string) => {
    if (!value) return "";
    const padded = value.toString().replace(/\D/g, "").padStart(11, '0');
    return padded.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  },

  formatPhone: (value: string) => {
    if (!value) return "";
    let clean = value.replace(/\D/g, "");
    
    // Adiciona DDD 21 se ausente
    if (clean.length === 8 || clean.length === 9) {
        if (!clean.startsWith('21')) {
            clean = '21' + clean;
        }
    }

    // Correção para números antigos (6-9)
    if (clean.length === 10) {
        const numeroSemDdd = clean.substring(2);
        const firstDigit = numeroSemDdd.charAt(0);
        if (clean.startsWith('21') && firstDigit >= '6' && firstDigit <= '9') {
            clean = clean.substring(0, 2) + '9' + numeroSemDdd;
        }
    }

    if (clean.length === 11) {
        return clean.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
    } else if (clean.length === 10) {
        return clean.replace(/^(\d{2})(\d{4})(\d{4}).*/, "($1) $2-$3");
    }
    
    return value;
  },

  formatCurrency: (value: any) => {
    if (value === null || value === undefined || value === '') return "";
    const number = Number(value);
    if (isNaN(number)) return "";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
  },

  // --- NORMALIZAÇÃO (Persistência) ---

  normalizePhoneForSave: (phone: string): string | null => {
    if (!phone) return null;
    
    const firstPhone = String(phone).split('/')[0].trim();
    let clean = firstPhone.replace(/\D/g, '');
    
    if (clean.startsWith('0')) clean = clean.substring(1);

    if (clean.length === 8 || clean.length === 9) {
        if (!clean.startsWith('21')) {
            clean = '21' + clean;
        }
    }

    if (clean.length === 10) {
        const numeroSemDdd = clean.substring(2);
        const firstDigit = numeroSemDdd.charAt(0);

        // Fixo
        if (['2', '3', '4', '5'].includes(firstDigit)) {
            return clean;
        }

        // Celular sem 9
        if (['6', '7', '8', '9'].includes(firstDigit)) {
            return clean.substring(0, 2) + '9' + numeroSemDdd;
        }
    }

    if (clean.length === 11) {
        return clean;
    }

    return null;
  },

  capitalizeName: (name: string): string => {
    if (!name || typeof name !== 'string') return '';
    const exceptions = ['de', 'do', 'da', 'dos', 'das', 'e'];
    
    let cleanName = name.replace(/'/g, '’').toLowerCase();
    
    return cleanName.split(' ').map((word, index) => {
        if (word.trim() === '') return '';
        
        if (word.includes('’')) {
            const parts = word.split('’');
            let p1 = parts[0];
            let p2 = parts[1];
            p2 = p2.charAt(0).toUpperCase() + p2.slice(1);
            if (index === 0) p1 = p1.charAt(0).toUpperCase() + p1.slice(1);
            else if (!exceptions.includes(p1)) p1 = p1.charAt(0).toUpperCase() + p1.slice(1);
            return p1 + '’' + p2;
        }

        if (index === 0 || !exceptions.includes(word)) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
    }).join(' ');
  },

  calculateAge: (dateString: string): number | null => {
    if (!dateString) return null;
    const birthDate = new Date(dateString);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
  }
};
