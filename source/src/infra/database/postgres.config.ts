import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Alterado de dbPool para pool para bater com o auth.repository.ts
export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'fnbr_community',
  max: 10,
  idleTimeoutMillis: 60000, 
  connectionTimeoutMillis: 2000, 
});

export async function testDatabaseConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    console.log('[Database] Conexão com PostgreSQL estabelecida através do Pool.');
    client.release(); 
  } catch (error) {
    console.error('[Database] Falha ao conectar com o PostgreSQL:', error);
    process.exit(1); 
  }
}