import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path'; 
import { authRoutes } from './modules/auth/auth.routes';
import { groupsRoutes } from './modules/groups/groups.routes'; 
import { botsRoutes } from './modules/bots/bots.routes'; 

const app: Application = express();

app.use(helmet({
  crossOriginResourcePolicy: false, 
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================================
// ARQUIVOS ESTÁTICOS (Correção de Caminho Absoluto)
// ============================================================================
// __dirname aqui é source/src. Voltamos 2 níveis para chegar na raiz fnbr-api
const uploadsPath = path.resolve(__dirname, '../../uploads');
app.use('/uploads', express.static(uploadsPath));

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// ============================================================================
// INJEÇÃO DE ROTAS DA API
// ============================================================================
app.use('/api/v1/auth', authRoutes); 
app.use('/api/v1/groups', groupsRoutes); 
app.use('/api/v1/bots', botsRoutes);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Error] ${err.message}`);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;