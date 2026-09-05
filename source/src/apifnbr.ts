import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRoutes } from './modules/auth/auth.routes';

const app: Application = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// ============================================================================
// INJEÇÃO DE ROTAS DA API
// ============================================================================
app.use('/api/v1/auth', authRoutes); // <-- 2. Registre a rota base de auth

// Middleware global de tratamento de erros
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Error] ${err.message}`);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;