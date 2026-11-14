import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ReplayFile,
  ReplayFileRegistration,
  ReplayIngestionRequest,
  ReplayProcessingAttempt,
} from '../../generated/v1/models';
import { ReplayFilesApi, ReplayIngestionApi } from '../../generated/v1/api';
import {
  ReplayConflictError,
  ReplayNotFoundError,
  ReplayValidationError,
  logReplayError,
} from './replays.errors';
import { ReplaysService } from './replays.service';

type GeneratedRequest = Parameters<ReplayIngestionApi['replayFilesPost']>[1];

@Injectable()
export class ReplaysApiAdapter extends ReplayIngestionApi implements ReplayFilesApi {
  constructor(private readonly replaysService: ReplaysService) {
    super();
  }

  async replayFilesGet(
    sha256: string | undefined,
    matchId: number | string | undefined,
    _request: GeneratedRequest,
  ): Promise<ReplayFile[]> {
    try {
      return await this.replaysService.listFiles(sha256, matchId);
    } catch (error) {
      throw mapError(error);
    }
  }

  async replayFilesSha256Get(
    sha256: string,
    _request: GeneratedRequest,
  ): Promise<ReplayFile> {
    try {
      return await this.replaysService.getFile(sha256);
    } catch (error) {
      throw mapError(error);
    }
  }

  async replayFilesSha256ProcessingAttemptsGet(
    sha256: string,
    _request: GeneratedRequest,
  ): Promise<ReplayProcessingAttempt[]> {
    try {
      return await this.replaysService.listAttempts(sha256);
    } catch (error) {
      throw mapError(error);
    }
  }

  async replayFilesPost(
    replayFileRegistration: ReplayFileRegistration,
    request: GeneratedRequest,
  ): Promise<ReplayFile> {
    try {
      const result = await this.replaysService.registerFile(replayFileRegistration);
      if (!result.created) setResponseStatus(request, 200);
      return result.file;
    } catch (error) {
      throw mapError(error);
    }
  }

  async replayFilesSha256ProcessingAttemptsPost(
    sha256: string,
    replayIngestionRequest: ReplayIngestionRequest,
    request: GeneratedRequest,
  ): Promise<ReplayProcessingAttempt> {
    try {
      const result = await this.replaysService.ingest(sha256, replayIngestionRequest);
      if (result.outcome === 'replayed') setResponseStatus(request, 200);
      if (result.outcome === 'processing') setResponseStatus(request, 202);
      if (result.outcome === 'failed') {
        throw new UnprocessableEntityException(result.attempt);
      }
      return result.attempt;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw mapError(error);
    }
  }
}

function mapError(error: unknown): Error {
  if (error instanceof ReplayValidationError) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ReplayNotFoundError) {
    return new NotFoundException('Replay file not found.');
  }
  if (error instanceof ReplayConflictError) {
    return new ConflictException(error.message);
  }

  logReplayError('api_unexpected_error', undefined, undefined, error);
  return new InternalServerErrorException('Replay ingestion failed.');
}

function setResponseStatus(request: GeneratedRequest, statusCode: number): void {
  if (!('res' in request) || !hasResponseLocals(request.res)) return;
  request.res.locals.replayStatusCode = statusCode;
}

function hasResponseLocals(value: unknown): value is {
  locals: Record<string, unknown>;
} {
  if (
    typeof value === 'object'
    && value !== null
    && 'locals' in value
    && value.locals !== null
    && typeof value.locals === 'object'
  ) {
    return true;
  }
  return false;
}
