import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Application, Response } from 'express';
import { ApiModule } from '../../generated/v1/api.module';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';
import { ReplaysApiAdapter } from './replays-api.adapter';
import { ReplaysRepository } from './replays.repository';
import { ReplaysService } from './replays.service';
import { ReplayIngestionWorker } from './replays.worker';

let replayWorker: ReplayIngestionWorker | undefined;

export class ReplayExpressAdapter extends ExpressAdapter {
  override reply(response: Response, body: unknown, statusCode?: number): any {
    const requestedStatus = response.locals.replayStatusCode;
    const replayStatusCode = typeof requestedStatus === 'number' ? requestedStatus : undefined;
    const bodyData = typeof body === 'object' && body !== null && 'data' in body
      ? Reflect.get(body, 'data') : undefined;
    const attemptStatus = typeof bodyData === 'object' && bodyData !== null && 'status' in bodyData
      ? Reflect.get(bodyData, 'status') : undefined;
    const outcomeStatus = attemptStatus === 'accepted' || attemptStatus === 'processing'
      ? 202
      : attemptStatus === 'succeeded' || attemptStatus === 'failed' || attemptStatus === 'skipped'
        ? 200 : undefined;
    delete response.locals.replayStatusCode;
    const effectiveStatus = statusCode === undefined || statusCode === 201
      ? replayStatusCode ?? outcomeStatus ?? statusCode : statusCode;
    return super.reply(response, body, effectiveStatus);
  }
}

export async function registerReplayIngestion(app: Application, startWorker = false): Promise<void> {
  app.use('/api/v1/replay-files', authMiddleware);
  app.use('/api/v1/matches/:match_id/processing-attempts', authMiddleware);

  const replayApi = await NestFactory.create(
    ApiModule.forRoot({
      apiImplementations: {
        replayFilesApi: ReplaysApiAdapter,
        replayIngestionApi: ReplaysApiAdapter,
      },
      providers: [ReplaysRepository, ReplaysService, ReplayIngestionWorker],
    }),
    new ReplayExpressAdapter(app),
  );
  replayApi.setGlobalPrefix('api/v1');
  await replayApi.init();
  if (startWorker) {
    const worker = replayApi.get(ReplayIngestionWorker);
    replayWorker = worker;
    worker.start();
  }
}

export async function stopReplayIngestion(): Promise<void> {
  await replayWorker?.stop();
  replayWorker = undefined;
}

export function isReplayWorkerRunning(): boolean {
  return replayWorker?.isRunning() ?? false;
}
