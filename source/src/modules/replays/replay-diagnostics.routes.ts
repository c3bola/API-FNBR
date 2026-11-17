import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';
import { ReplayNotFoundError, ReplayValidationError } from './replays.errors';
import { replayDiagnosticsRepository } from './replay-diagnostics.repository';
import { isReplayWorkerRunning } from './replays.bootstrap';

const ADMIN_ROLES = new Set(['admin', 'superadmin']);
const ATTEMPT_STATUSES = new Set(['accepted', 'processing', 'succeeded', 'failed', 'skipped']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const replayDiagnosticsRoutes = Router();
replayDiagnosticsRoutes.use(authMiddleware, requireReplayAdmin);

replayDiagnosticsRoutes.get('/health', asyncRoute(async (_request, response) => {
  response.json({ success: true, data: await replayDiagnosticsRepository.getHealth(isReplayWorkerRunning()) });
}));

replayDiagnosticsRoutes.get('/metrics', asyncRoute(async (_request, response) => {
  response.json({ success: true, data: await replayDiagnosticsRepository.getMetrics() });
}));

replayDiagnosticsRoutes.get('/attempts', asyncRoute(async (request, response) => {
  const status = optionalString(request.query.status, 'status');
  if (status !== undefined && !ATTEMPT_STATUSES.has(status)) {
    throw new ReplayValidationError('status is not a supported processing state.');
  }
  const fileSha256 = optionalString(request.query.file_sha256, 'file_sha256');
  if (fileSha256 !== undefined && !SHA256_PATTERN.test(fileSha256)) {
    throw new ReplayValidationError('file_sha256 must be a lowercase SHA-256 hash.');
  }
  const from = optionalDate(request.query.from, 'from');
  const to = optionalDate(request.query.to, 'to');
  if (from && to && from >= to) {
    throw new ReplayValidationError('from must be earlier than to.');
  }
  const result = await replayDiagnosticsRepository.listAttempts({
    status,
    fileSha256,
    from,
    to,
    page: positiveInteger(request.query.page, 1, 'page', 1000000),
    pageSize: positiveInteger(request.query.page_size, 25, 'page_size', 100),
  });
  response.json({ success: true, ...result });
}));

replayDiagnosticsRoutes.get('/attempts/:id/containers', asyncRoute(async (request, response) => {
  const attemptId = positiveInteger(request.params.id, undefined, 'id', Number.MAX_SAFE_INTEGER);
  response.json({
    success: true,
    data: await replayDiagnosticsRepository.getContainerDiagnostics(attemptId),
  });
}));

replayDiagnosticsRoutes.get('/attempts/:id', asyncRoute(async (request, response) => {
  const attemptId = positiveInteger(request.params.id, undefined, 'id', Number.MAX_SAFE_INTEGER);
  response.json({
    success: true,
    data: await replayDiagnosticsRepository.getAttempt(attemptId),
  });
}));

export const replayContainerRoutes = Router();
replayContainerRoutes.use(authMiddleware);
replayContainerRoutes.get('/:match_id/container-interactions', asyncRoute(async (request, response) => {
  const matchId = positiveInteger(request.params.match_id, undefined, 'match_id', Number.MAX_SAFE_INTEGER);
  const fromSeconds = optionalNumber(request.query.from_seconds, 'from_seconds');
  const toSeconds = optionalNumber(request.query.to_seconds, 'to_seconds');
  if (fromSeconds !== undefined && toSeconds !== undefined && fromSeconds > toSeconds) {
    throw new ReplayValidationError('from_seconds must not be greater than to_seconds.');
  }
  const playerReplayId = optionalInteger(request.query.player_replay_id, 'player_replay_id');
  const processingAttemptId = request.query.processing_attempt_id === undefined
    ? undefined : positiveInteger(request.query.processing_attempt_id, undefined, 'processing_attempt_id', Number.MAX_SAFE_INTEGER);
  const containerLabel = optionalString(request.query.container_label, 'container_label');
  const result = await replayDiagnosticsRepository.listMatchContainerInteractions(matchId, {
    fromSeconds,
    toSeconds,
    processingAttemptId,
    playerReplayId,
    containerLabel,
    page: positiveInteger(request.query.page, 1, 'page', 1000000),
    pageSize: positiveInteger(request.query.page_size, 25, 'page_size', 100),
  });
  response.json(result);
}));

function requireReplayAdmin(request: Request, response: Response, next: NextFunction): void {
  const user = Reflect.get(request, 'user');
  const role = typeof user === 'object' && user !== null && 'role' in user
    ? Reflect.get(user, 'role') : undefined;
  if (typeof role !== 'string' || !ADMIN_ROLES.has(role.toLowerCase())) {
    response.status(403).json({
      statusCode: 403,
      message: 'An administrator role is required.',
      error: 'Forbidden',
    });
    return;
  }
  next();
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response).catch((error: unknown) => {
      if (error instanceof ReplayValidationError) {
        response.status(400).json({
          statusCode: 400,
          message: error.message,
          error: 'Bad Request',
        });
      } else if (error instanceof ReplayNotFoundError) {
        response.status(404).json({
          statusCode: 404,
          message: error.message,
          error: 'Not Found',
        });
      } else {
        next(error);
      }
    });
  };
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ReplayValidationError(`${field} must be a single string value.`);
  }
  return value;
}

function optionalDate(value: unknown, field: string): string | undefined {
  const text = optionalString(value, field);
  if (text === undefined) return undefined;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) {
    throw new ReplayValidationError(`${field} must be a valid date/time.`);
  }
  return date.toISOString();
}

function optionalNumber(value: unknown, field: string): number | undefined {
  const text = optionalString(value, field);
  if (text === undefined) return undefined;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) {
    throw new ReplayValidationError(`${field} must be a non-negative number.`);
  }
  return number;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  const text = optionalString(value, field);
  if (text === undefined) return undefined;
  const number = Number(text);
  if (!Number.isSafeInteger(number)) {
    throw new ReplayValidationError(`${field} must be a safe integer.`);
  }
  return number;
}

function positiveInteger(
  value: unknown,
  fallback: number | undefined,
  field: string,
  maximum: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new ReplayValidationError(`${field} must be an integer from 1 to ${maximum}.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new ReplayValidationError(`${field} must be an integer from 1 to ${maximum}.`);
  }
  return number;
}
