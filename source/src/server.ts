// npm run generate:api
// npm run dev
import 'reflect-metadata';
import app from './apifnbr';
import { testDatabaseConnection, pool } from './infra/database/postgres.config'; 
import { registerReplayIngestion } from './modules/replays/replays.bootstrap';
import express from 'express';
import path from 'path';
const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await testDatabaseConnection();
  await registerReplayIngestion(app);

  const server = app.listen(PORT, () => {
    console.log(`[Server] Aplicação rodando na porta ${PORT}`);
    console.log(`[Server] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Server] Recebido sinal ${signal}. Iniciando desligamento gracioso...`);

    server.close(async () => {
      console.log('[Server] Servidor HTTP fechado. Recusando novas requisições.');

      try {
        await pool.end();
        console.log('[Database] Pool de conexões do PostgreSQL encerrado.');
        process.exit(0);
      } catch (err) {
        console.error('[Database] Erro ao fechar as conexões:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('[Server] Desligamento forçado após timeout.');
      process.exit(1);
    }, 10000);
  };
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

bootstrap();