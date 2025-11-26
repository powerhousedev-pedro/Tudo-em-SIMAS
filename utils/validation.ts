
export const validation = {
  // --- VALIDATION ---
  
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

  // --- ID GENERATION (Legacy Style) ---
  
  generateLegacyId: (prefix: string) => {
      // Replicates Utilities.getUuid().substring(0, 8).toUpperCase() behavior
      // Using random alphanumeric string of 8 chars
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
          result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `${prefix}${result}`;
  },

  // --- MASKING (Visual Input) ---

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
    
    // Limita tamanho máximo para evitar strings infinitas
    if (v.length > 11) v = v.substring(0, 11);

    // Formato Celular (11 dígitos): (XX) XXXXX-XXXX
    if (v.length > 10) { 
        return v.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3"); 
    } 
    // Formato Fixo/Legado (10 dígitos ou menos): (XX) XXXX-XXXX
    else if (v.length > 5) { 
        return v.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3"); 
    } 
    // Formato parcial enquanto digita DDD
    else if (v.length > 2) { 
        return v.replace(/^(\d\d)(\d*)/, "($1) $2"); 
    } 
    // Apenas parêntese inicial
    else if (v.length > 0) {
        return v.replace(/^(\d*)/, "($1");
    }
    return v;
  },

  maskCurrency: (value: string) => {
    // Removes everything that is not digit
    let v = value.replace(/\D/g, "");
    if (!v) return "";
    
    // Convert to float
    const floatValue = parseFloat(v) / 100;
    
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(floatValue);
  },

  // --- FORMATTING (Display) ---

  formatDate: (value: any) => {
    if (!value) return 'N/A';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return 'N/A';
      // Use UTC to avoid timezone shifts when displaying simple dates
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
    // Applies the Legacy Logic for display
    if (!value) return "";
    let clean = value.replace(/\D/g, "");
    
    // Legacy Logic: Auto-inject DDD 21 if length is 8 or 9
    if (clean.length === 8 || clean.length === 9) {
        if (!clean.startsWith('21')) {
            clean = '21' + clean;
        }
    }

    // Auto-correção visual para números antigos sem o 9 (apenas se 6-9)
    if (clean.length === 10) {
        const numeroSemDdd = clean.substring(2);
        const firstDigit = numeroSemDdd.charAt(0);
        if (clean.startsWith('21') && firstDigit >= '6' && firstDigit <= '9') {
            clean = clean.substring(0, 2) + '9' + numeroSemDdd;
        }
    }

    // Standard Formatting based on length
    if (clean.length === 11) {
        return clean.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
    } else if (clean.length === 10) {
        return clean.replace(/^(\d{2})(\d{4})(\d{4}).*/, "($1) $2-$3");
    }
    
    return value; // Return original if it doesn't fit standard
  },

  formatCurrency: (value: any) => {
    if (value === null || value === undefined || value === '') return "";
    const number = Number(value);
    if (isNaN(number)) return "";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
  },

  // --- NORMALIZATION (For Saving) ---

  normalizePhoneForSave: (phone: string): string | null => {
    if (!phone) return null;
    
    // 1. Isolate first number if multiple
    const firstPhone = String(phone).split('/')[0].trim();
    
    // 2. Remove non-digits
    let clean = firstPhone.replace(/\D/g, '');
    
    // Remove leading zero
    if (clean.startsWith('0')) clean = clean.substring(1);

    // 3. Apply DDD 21 Rule (Input sem DDD)
    // Se digitou 8 ou 9 dígitos, assume-se que é um número local do Rio (21)
    if (clean.length === 8 || clean.length === 9) {
        if (!clean.startsWith('21')) {
            clean = '21' + clean;
        }
    }

    // 4. Validação e Normalização de 10 dígitos (DDD + 8 números)
    if (clean.length === 10) {
        const numeroSemDdd = clean.substring(2);
        const firstDigit = numeroSemDdd.charAt(0);

        // REGRA SOLICITADA:
        // Se o número começa com 2, 3, 4 ou 5, é um telefone FIXO válido.
        // Aceita o formato com 10 dígitos (DDD + 8).
        if (['2', '3', '4', '5'].includes(firstDigit)) {
            return clean;
        }

        // Se o número começa com 6, 7, 8 ou 9, assume-se que é um Celular que esqueceu o 9.
        // Aplica a correção automática injetando o 9.
        if (['6', '7', '8', '9'].includes(firstDigit)) {
            return clean.substring(0, 2) + '9' + numeroSemDdd;
        }
    }

    // 5. Validação final para Celulares corretos (11 dígitos)
    if (clean.length === 11) {
        return clean;
    }

    // Se não se encaixou em Fixo (10) nem Celular (11), retorna null (erro)
    return null;
  },

  capitalizeName: (name: string): string => {
    if (!name || typeof name !== 'string') return '';
    const exceptions = ['de', 'do', 'da', 'dos', 'das', 'e'];
    
    let cleanName = name.replace(/'/g, '’').toLowerCase(); // Normalize apostrophe
    
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
    // Handle both YYYY-MM-DD and ISO strings
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
