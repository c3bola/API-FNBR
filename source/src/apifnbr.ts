import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path'; 
import { authRoutes } from './modules/auth/auth.routes';
import { groupsRoutes } from './modules/groups/groups.routes'; 
import { botsRoutes } from './modules/bots/bots.routes'; 
import { resourcesRoutes } from './modules/resources/resources.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { authMiddleware } from './shared/middlewares/auth.middleware';
import { recordMalformedReplayDiagnostic } from './modules/replays/replays.repository';
import { replayContainerRoutes, replayDiagnosticsRoutes } from './modules/replays/replay-diagnostics.routes';

const app: Application = express();

app.use(helmet({
  crossOriginResourcePolicy: false, 
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.use('/api/v1/replay-files', authMiddleware);
app.use('/api/v1/matches/:match_id/processing-attempts', authMiddleware);

app.use(express.json({
  limit: '50mb',
  verify: (request, _response, body) => {
    const url = request.url ?? '';
    const isReplayIngestion = request.method === 'POST'
      && /^\/api\/v1\/replay-files\/[a-f0-9]{64}\/processing-attempts(?:\?|$)/.test(url);
    if (isReplayIngestion && !Reflect.set(request, 'rawBody', Buffer.from(body))) {
      throw new Error('Request body could not be preserved.');
    }
  },
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


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
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin/replays', replayDiagnosticsRoutes);
app.use('/api/v1/matches', replayContainerRoutes);
app.use('/api/v1', resourcesRoutes);

app.use(async (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const isJsonParseError = typeof err === 'object'
    && err !== null
    && 'type' in err
    && err.type === 'entity.parse.failed';
  const isTooLarge = typeof err === 'object'
    && err !== null
    && 'type' in err
    && err.type === 'entity.too.large';
  const statusCode = isJsonParseError ? 400 : isTooLarge ? 413 : 500;
  const message = isJsonParseError
    ? 'Invalid JSON request body.'
    : isTooLarge ? 'Request body exceeds the maximum permitted size.' : 'Internal server error.';

  if (isJsonParseError) {
    try {
      await persistMalformedReplay(req);
    } catch (diagnosticError) {
      console.error('[Replay] Malformed request diagnostic could not be persisted.', {
        errorName: diagnosticError instanceof Error ? diagnosticError.name : 'UnknownError',
      });
    }
  }

  console.error('[Error] Unhandled request error.', {
    errorName: err instanceof Error ? err.name : 'UnknownError',
  });
  res.status(statusCode).json({
    statusCode,
    message,
    error: isJsonParseError ? 'Bad Request' : isTooLarge ? 'Payload Too Large' : 'Internal Server Error',
  });
});

async function persistMalformedReplay(request: Request): Promise<void> {
  const match = /^\/api\/v1\/replay-files\/([a-f0-9]{64})\/processing-attempts$/.exec(request.path);
  const rawBody = Reflect.get(request, 'rawBody');
  if (!match || !Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 1024 * 1024) return;
  const applicationIdHeader = request.get('x-application-id');
  const idempotencyHeader = request.get('idempotency-key');
  await recordMalformedReplayDiagnostic(
    match[1],
    rawBody,
    applicationIdHeader && applicationIdHeader.length <= 150 ? applicationIdHeader : null,
    idempotencyHeader && idempotencyHeader.length <= 200 ? idempotencyHeader : null,
  );
}

export default app;