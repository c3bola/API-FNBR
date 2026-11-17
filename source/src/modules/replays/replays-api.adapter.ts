import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GetReplayFile200Response,
  IngestReplaySnapshot200Response,
  ListReplayFileProcessingAttempts200Response,
  ListReplayFiles200Response,
  ReplayIngestionRequest,
} from '../../generated/v1/models';
import { ReplayFilesApi, ReplayIngestionApi } from '../../generated/v1/api';
import {
  ReplayConflictError,
  ReplayNotFoundError,
  ReplayPersistenceError,
  ReplayValidationError,
  logReplayError,
} from './replays.errors';
import { ReplaysService } from './replays.service';
import { replayDiagnosticsRepository } from './replay-diagnostics.repository';

type IngestionRequestContext = Parameters<ReplayIngestionApi['ingestReplaySnapshot']>[2];
type FilesRequestContext = Parameters<ReplayFilesApi['listReplayFiles']>[4];

@Injectable()
export class ReplaysApiAdapter extends ReplayIngestionApi implements ReplayFilesApi {
  constructor(private readonly replaysService: ReplaysService) {
    super();
  }

  async ingestReplaySnapshot(
    sha256: string,
    replayIngestionRequest: ReplayIngestionRequest,
    request: IngestionRequestContext,
  ): Promise<IngestReplaySnapshot200Response> {
    try {
      const receivedAt = new Date();
      const acceptanceStarted = performance.now();
      const rawPayload = rawRequestBody(request, replayIngestionRequest);
      const result = await this.replaysService.accept(
        sha256,
        replayIngestionRequest,
        rawPayload,
      );
      await replayDiagnosticsRepository.recordStage({
        attemptId: result.attempt.id,
        fileSha256: sha256,
        stage: 'HTTP_RECEIVED',
        result: 'succeeded',
        startedAt: receivedAt,
        durationMs: 0,
        metrics: {
          application_id: result.attempt.application_id,
          idempotency_key: result.attempt.idempotency_key,
          payload_bytes: rawPayload.length,
          payload_sha256: result.attempt.payload_sha256,
        },
      });
      await replayDiagnosticsRepository.recordStage({
        attemptId: result.attempt.id,
        fileSha256: sha256,
        stage: 'PAYLOAD_PERSISTED',
        result: result.outcome === 'created' ? 'succeeded' : 'skipped',
        startedAt: receivedAt,
        durationMs: performance.now() - acceptanceStarted,
        metrics: {
          payload_bytes: rawPayload.length,
          payload_sha256: result.attempt.payload_sha256,
          reason: result.outcome === 'created' ? null : 'idempotent_attempt_already_exists',
        },
      });
      await replayDiagnosticsRepository.recordStage({
        attemptId: result.attempt.id,
        fileSha256: sha256,
        stage: 'JOB_ENQUEUED',
        result: result.outcome === 'created' ? 'succeeded' : 'skipped',
        metrics: {
          reason: result.outcome === 'created' ? null : 'idempotent_attempt_already_exists',
        },
      });
      if (result.outcome === 'created' || result.outcome === 'processing') {
        setResponseStatus(request, 202);
      } else {
        setResponseStatus(request, 200);
      }
      return { success: result.outcome !== 'failed', data: result.attempt };
    } catch (error) {
      throw mapError(error, sha256);
    }
  }

  async getReplayFile(
    sha256: string,
    _request: FilesRequestContext,
  ): Promise<GetReplayFile200Response> {
    try {
      return await this.replaysService.getReplayFile(sha256);
    } catch (error) {
      throw mapError(error);
    }
  }

  async listReplayFiles(
    applicationId: string | undefined,
    status: 'unprocessed' | 'accepted' | 'processing' | 'succeeded' | 'failed' | 'skipped' | undefined,
    page: number | undefined,
    pageSize: number | undefined,
    _request: FilesRequestContext,
  ): Promise<ListReplayFiles200Response> {
    try {
      return await this.replaysService.listReplayFiles(applicationId, status, page, pageSize);
    } catch (error) {
      throw mapError(error);
    }
  }

  async listReplayFileProcessingAttempts(
    sha256: string,
    status: 'accepted' | 'processing' | 'succeeded' | 'failed' | 'skipped' | undefined,
    page: number | undefined,
    pageSize: number | undefined,
    _request: FilesRequestContext,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    try {
      return await this.replaysService.listAttempts(sha256, status, page, pageSize);
    } catch (error) {
      throw mapError(error);
    }
  }

  async listMatchProcessingAttempts(
    matchId: number,
    page: number | undefined,
    pageSize: number | undefined,
    _request: FilesRequestContext,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    try {
      return await this.replaysService.listMatchAttempts(matchId, page, pageSize);
    } catch (error) {
      throw mapError(error);
    }
  }
}

function mapError(error: unknown, fileSha256?: string): Error {
  if (error instanceof ReplayValidationError) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ReplayNotFoundError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof ReplayConflictError) {
    return new ConflictException(error.message);
  }
  if (error instanceof ReplayPersistenceError) {
    return new ServiceUnavailableException(error.message);
  }
  logReplayError('api_unexpected_error', fileSha256, undefined, error);
  return new InternalServerErrorException('Replay ingestion failed.');
}

function rawRequestBody(request: IngestionRequestContext, body: ReplayIngestionRequest): Buffer {
  const context: unknown = request;
  if (typeof context === 'object' && context !== null && 'rawBody' in context) {
    const rawBody = context.rawBody;
    if (Buffer.isBuffer(rawBody)) return Buffer.from(rawBody);
  }
  return Buffer.from(JSON.stringify(body));
}

function setResponseStatus(request: IngestionRequestContext, statusCode: number): void {
  const context: unknown = request;
  if (
    typeof context !== 'object'
    || context === null
    || !('res' in context)
    || typeof context.res !== 'object'
    || context.res === null
    || !('locals' in context.res)
    || typeof context.res.locals !== 'object'
    || context.res.locals === null
  ) return;
  if (!Reflect.set(context.res.locals, 'replayStatusCode', statusCode)) {
    throw new Error('Replay response status could not be set.');
  }
}
