import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Application, Response } from 'express';
import { ApiModule } from '../../generated/v1/api.module';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';
import { ReplaysApiAdapter } from './replays-api.adapter';
import { ReplaysRepository } from './replays.repository';
import { ReplaysService } from './replays.service';

export class ReplayExpressAdapter extends ExpressAdapter {
  override reply(response: Response, body: unknown, statusCode?: number): any {
    const requestedStatus = response.locals.replayStatusCode;
    const replayStatusCode = typeof requestedStatus === 'number' ? requestedStatus : undefined;
    delete response.locals.replayStatusCode;
    const effectiveStatus = statusCode === 201 ? replayStatusCode ?? statusCode : statusCode;
    return super.reply(response, body, effectiveStatus);
  }
}

export async function registerReplayIngestion(app: Application): Promise<void> {
  app.use('/api/v1/replay-files', authMiddleware);

  const replayApi = await NestFactory.create(
    ApiModule.forRoot({
      apiImplementations: {
        replayFilesApi: ReplaysApiAdapter,
        replayIngestionApi: ReplaysApiAdapter,
      },
      providers: [ReplaysRepository, ReplaysService],
    }),
    new ReplayExpressAdapter(app),
  );
  replayApi.setGlobalPrefix('api/v1');
  await replayApi.init();
}
