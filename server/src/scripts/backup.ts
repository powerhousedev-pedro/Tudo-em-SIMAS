import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// Função para analisar a DATABASE_URL e extrair as credenciais
const parseDatabaseUrl = (url: string) => {
    try {
        const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(\S+)/);
        if (!match) throw new Error('Formato inválido de DATABASE_URL');
        return {
            user: match[1],
            password: match[2],
            host: match[3],
            port: match[4],
            database: match[5],
        };
    } catch (error) {
        console.error('Erro ao analisar DATABASE_URL:', error);
        return null;
    }
};

export const runBackup = async () => {
    console.log('Iniciando processo de backup do banco de dados...');

    const envPath = path.resolve(__dirname, '../../../server/prisma/.env');
    if (!fs.existsSync(envPath)) {
        console.error('ERRO: Arquivo .env não encontrado em server/prisma/.env');
        return;
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    const dbUrlLine = envContent.split('\n').find(line => line.startsWith('DATABASE_URL'));

    if (!dbUrlLine) {
        console.error('ERRO: Variável DATABASE_URL não encontrada no arquivo .env');
        return;
    }

    const dbUrl = dbUrlLine.split('=')[1].trim().replace(/[""]/g, '');
    const dbConfig = parseDatabaseUrl(dbUrl);

    if (!dbConfig) {
        return; // Erro já foi logado pelo parser
    }

    const backupDir = path.resolve(__dirname, '../../../server/backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log(`Diretório de backups criado em: ${backupDir}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.sql`;
    const backupFilePath = path.join(backupDir, backupFileName);

    // O uso de MYSQL_PWD é uma forma segura de passar a senha para o mysqldump
    const command = `mysqldump --user=${dbConfig.user} --host=${dbConfig.host} --port=${dbConfig.port} ${dbConfig.database} > \"${backupFilePath}\"
`;
    
    console.log('Executando comando de backup...');

    exec(command, { env: { ...process.env, MYSQL_PWD: dbConfig.password } }, (error, stdout, stderr) => {
        if (error) {
            console.error(`ERRO DURANTE O BACKUP: ${error.message}`);
            // Em caso de erro, remove o arquivo de backup potencialmente vazio/corrompido
            if (fs.existsSync(backupFilePath)) {
                fs.unlinkSync(backupFilePath);
            }
            return;
        }
        if (stderr) {
            // stderr pode conter avisos que não são erros fatais, então apenas os registramos
            console.warn(`Avisos do mysqldump: ${stderr}`);
        }
        console.log(`SUCESSO: Backup do banco de dados salvo em: ${backupFilePath}`);
    });
};
