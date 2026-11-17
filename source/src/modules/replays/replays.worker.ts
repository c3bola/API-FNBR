import { Injectable } from '@nestjs/common';
import { logReplayError, ReplayValidationError } from './replays.errors';
import { replayDiagnosticsRepository } from './replay-diagnostics.repository';
import { ReplaysRepository, ClaimedReplayAttempt } from './replays.repository';
import { ReplaysService } from './replays.service';

const MAX_WORKER_ATTEMPTS = 5;

@Injectable()
export class ReplayIngestionWorker {
  private stopping = true;
  private loop: Promise<void> | undefined;
  private wakePoll: (() => void) | undefined;

  private readonly concurrency = configuredInteger('REPLAY_WORKER_CONCURRENCY', 2, 1, 8);
  private readonly pollIntervalMs = configuredInteger('REPLAY_WORKER_POLL_INTERVAL_MS', 1000, 100, 30000);
  private readonly leaseSeconds = configuredInteger('REPLAY_WORKER_LEASE_SECONDS', 300, 30, 3600);
  private readonly diagnosticsRetentionDays = configuredInteger(
    'REPLAY_DIAGNOSTICS_RETENTION_DAYS', 90, 1, 3650,
  );
  private lastDiagnosticsPruneAt = 0;

  constructor(
    private readonly repository: ReplaysRepository,
    private readonly replaysService: ReplaysService,
  ) {}

  start(): void {
    if (this.loop) return;
    this.stopping = false;
    this.loop = this.run();
  }

  isRunning(): boolean {
    return this.loop !== undefined && !this.stopping;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.wakePoll?.();
    await this.loop;
    this.loop = undefined;
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      const claims: ClaimedReplayAttempt[] = [];
      try {
        for (let worker = 0; worker < this.concurrency; worker += 1) {
          const claim = await this.repository.claimNext(this.leaseSeconds);
          if (!claim) break;
          await replayDiagnosticsRepository.recordStage({
            attemptId: claim.id,
            fileSha256: claim.fileSha256,
            stage: 'WORKER_CLAIMED',
            workerAttempt: claim.workerAttempts,
            result: 'succeeded',
            metrics: { worker_attempt: claim.workerAttempts },
          });
          claims.push(claim);
        }
      } catch (error) {
        logReplayError('worker_claim', undefined, undefined, error);
      }

      if (claims.length === 0) {
        await this.pruneDiagnosticsIfDue();
        await this.waitForNextPoll();
      } else {
        await Promise.all(claims.map((claim) => this.processClaim(claim).catch((error: unknown) => {
          logReplayError('worker_unhandled', claim.fileSha256, claim.id, error);
        })));
        await this.pruneDiagnosticsIfDue();
      }
    }
  }

  private async pruneDiagnosticsIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastDiagnosticsPruneAt < 24 * 60 * 60 * 1000) return;
    this.lastDiagnosticsPruneAt = now;
    try {
      const deleted = await replayDiagnosticsRepository.pruneDiagnostics(
        this.diagnosticsRetentionDays,
        5000,
      );
      if (deleted.processingStages > 0 || deleted.malformedPayloads > 0) {
        console.info(JSON.stringify({
          event: 'replay_diagnostics_retention',
          retentionDays: this.diagnosticsRetentionDays,
          deleted,
        }));
      }
    } catch (error) {
      logReplayError('diagnostics_retention', undefined, undefined, error);
    }
  }

  private waitForNextPoll(): Promise<void> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout;
      const finish = () => {
        clearTimeout(timer);
        this.wakePoll = undefined;
        resolve();
      };
      this.wakePoll = finish;
      timer = setTimeout(finish, this.pollIntervalMs);
    });
  }

  private async processClaim(claim: ClaimedReplayAttempt): Promise<void> {
    const processStarted = performance.now();
    const processStageId = await replayDiagnosticsRepository.startStage(
      claim.id, claim.fileSha256, 'PROCESSING_COMPLETED', claim.workerAttempts,
    );
    if (!claim.rawPayload) {
      await this.repository.failAttempt(
        claim.id,
        'missing_original_payload',
        'The accepted request has no recoverable original payload.',
      );
      await replayDiagnosticsRepository.completeStage(processStageId, {
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'PROCESSING_COMPLETED',
        workerAttempt: claim.workerAttempts,
        result: 'failed',
        durationMs: performance.now() - processStarted,
        errorCode: 'missing_original_payload',
        errorMessage: 'The accepted request has no recoverable original payload.',
      });
      return;
    }
    if (claim.workerAttempts > MAX_WORKER_ATTEMPTS) {
      await this.repository.failAttempt(
        claim.id,
        'retry_limit_exceeded',
        'Replay processing exceeded its retry limit.',
      );
      await replayDiagnosticsRepository.completeStage(processStageId, {
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'PROCESSING_COMPLETED',
        workerAttempt: claim.workerAttempts,
        result: 'failed',
        durationMs: performance.now() - processStarted,
        errorCode: 'retry_limit_exceeded',
        errorMessage: 'Replay processing exceeded its retry limit.',
      });
      return;
    }

    const heartbeatInterval = Math.max(5000, Math.floor(this.leaseSeconds * 1000 / 3));
    const heartbeat = setInterval(() => {
      void this.repository.heartbeat(claim.id, this.leaseSeconds)
        .catch((error: unknown) => logReplayError('worker_heartbeat', claim.fileSha256, claim.id, error));
    }, heartbeatInterval);

    let databaseStageId: number | null = null;
    let databaseStarted = 0;
    let databaseStageCompleted = false;
    let processingStageCompleted = false;
    try {
      const parserReason = 'The parser runs in the submitting client; the API receives its completed snapshot.';
      await replayDiagnosticsRepository.recordStage({
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'PARSER_STARTED',
        workerAttempt: claim.workerAttempts,
        result: 'skipped',
        metrics: { reason: parserReason },
      });
      await replayDiagnosticsRepository.recordStage({
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'PARSER_COMPLETED',
        workerAttempt: claim.workerAttempts,
        result: 'skipped',
        metrics: { reason: parserReason },
      });

      const normalizationStarted = performance.now();
      const normalizationStageId = await replayDiagnosticsRepository.startStage(
        claim.id, claim.fileSha256, 'NORMALIZATION_STARTED', claim.workerAttempts,
      );
      let prepared;
      try {
        prepared = await this.replaysService.prepareAccepted(claim.rawPayload);
      } catch (error) {
        await replayDiagnosticsRepository.completeStage(normalizationStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'NORMALIZATION_STARTED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          durationMs: performance.now() - normalizationStarted,
          errorCode: error instanceof ReplayValidationError ? 'validation_failed' : 'normalization_failed',
          errorMessage: error instanceof Error ? error.message : 'Normalization failed.',
          errorDetail: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
      const inconsistencyCount = prepared.inconsistencies
        ? JSON.parse(prepared.inconsistencies).count as number : 0;
      await replayDiagnosticsRepository.completeStage(normalizationStageId, {
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'NORMALIZATION_STARTED',
        workerAttempt: claim.workerAttempts,
        result: inconsistencyCount > 0 ? 'partial_success' : 'succeeded',
        durationMs: performance.now() - normalizationStarted,
        metrics: {
          inconsistencies: inconsistencyCount,
          containers: {
            detected: prepared.containerMetrics.detected,
            valid: prepared.containerMetrics.valid,
            rejected: prepared.containerMetrics.rejected,
            exact_duplicates: prepared.containerMetrics.exactDuplicates,
            field_issues: prepared.containerMetrics.fieldIssues,
            rejection_samples: prepared.containerMetrics.rejectionSamples,
          },
        },
      });
      await replayDiagnosticsRepository.recordStage({
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'NORMALIZATION_COMPLETED',
        workerAttempt: claim.workerAttempts,
        result: inconsistencyCount > 0 ? 'partial_success' : 'succeeded',
        durationMs: performance.now() - normalizationStarted,
        metrics: {
          inconsistencies: inconsistencyCount,
          containers: prepared.containerMetrics,
        },
      });

      databaseStarted = performance.now();
      databaseStageId = await replayDiagnosticsRepository.startStage(
        claim.id, claim.fileSha256, 'DATABASE_PERSISTED', claim.workerAttempts,
      );
      const result = await this.replaysService.ingest(
        claim.fileSha256,
        prepared.input,
        claim.requestSha256,
        prepared.inconsistencies,
        claim.payloadSha256,
        prepared.containerMetrics,
      );
      const containerMetrics = containerPersistenceMetrics(prepared.containerMetrics, result.containerPersistence);
      if (result.outcome === 'failed') {
        await replayDiagnosticsRepository.completeStage(databaseStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'DATABASE_PERSISTED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          durationMs: performance.now() - databaseStarted,
          metrics: containerMetrics,
          errorCode: result.attempt.error_code ?? 'persistence_failed',
          errorMessage: result.attempt.error_message ?? 'Replay data was not persisted.',
        });
        databaseStageCompleted = true;
        await this.scheduleRetry(claim, 'Replay persistence failed during processing.');
        await replayDiagnosticsRepository.completeStage(processStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'PROCESSING_COMPLETED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          durationMs: performance.now() - processStarted,
          metrics: containerMetrics,
          errorCode: result.attempt.error_code ?? 'persistence_failed',
          errorMessage: result.attempt.error_message ?? 'Replay data was not persisted.',
        });
        processingStageCompleted = true;
        return;
      }
      const partial = hasIntegrityWarnings(prepared.inconsistencies, containerMetrics);
      await replayDiagnosticsRepository.completeStage(databaseStageId, {
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'DATABASE_PERSISTED',
        workerAttempt: claim.workerAttempts,
        result: partial ? 'partial_success' : 'succeeded',
        durationMs: performance.now() - databaseStarted,
        metrics: containerMetrics,
        errorCode: partial ? 'container_data_incomplete' : undefined,
        errorMessage: partial ? 'Replay data was stored with incomplete or unlinked container observations.' : undefined,
      });
      databaseStageCompleted = true;
      await replayDiagnosticsRepository.completeStage(processStageId, {
        attemptId: claim.id,
        fileSha256: claim.fileSha256,
        stage: 'PROCESSING_COMPLETED',
        workerAttempt: claim.workerAttempts,
        result: partial ? 'partial_success' : 'succeeded',
        durationMs: performance.now() - processStarted,
        metrics: {
          inconsistencies: inconsistencyCount,
          containers: containerMetrics,
        },
        errorCode: partial ? 'data_integrity_warnings' : undefined,
        errorMessage: partial ? 'Replay processing completed with data integrity warnings.' : undefined,
      });
      processingStageCompleted = true;
    } catch (error) {
      if (databaseStageId !== null && !databaseStageCompleted) {
        await replayDiagnosticsRepository.completeStage(databaseStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'DATABASE_PERSISTED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          durationMs: performance.now() - databaseStarted,
          errorCode: 'database_persistence_failed',
          errorMessage: error instanceof Error ? error.message : 'Replay persistence failed.',
          errorDetail: error instanceof Error ? error.stack : undefined,
        });
        databaseStageCompleted = true;
      }
      if (error instanceof ReplayValidationError) {
        await this.repository.failAttempt(
          claim.id,
          'validation_failed',
          'Replay payload could not be normalized.',
        );
        await replayDiagnosticsRepository.completeStage(processStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'PROCESSING_COMPLETED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          durationMs: performance.now() - processStarted,
          errorCode: 'validation_failed',
          errorMessage: error.message,
          errorDetail: error.stack,
        });
        processingStageCompleted = true;
      } else {
        logReplayError('worker_processing', claim.fileSha256, claim.id, error);
        await this.scheduleRetry(claim, 'Replay processing encountered a transient failure.');
        await replayDiagnosticsRepository.completeStage(processStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'PROCESSING_COMPLETED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          durationMs: performance.now() - processStarted,
          errorCode: 'worker_processing_failed',
          errorMessage: error instanceof Error ? error.message : 'Replay processing failed.',
          errorDetail: error instanceof Error ? error.stack : undefined,
        });
        processingStageCompleted = true;
      }
    } finally {
      clearInterval(heartbeat);
      if (!processingStageCompleted) {
        await replayDiagnosticsRepository.completeStage(processStageId, {
          attemptId: claim.id,
          fileSha256: claim.fileSha256,
          stage: 'PROCESSING_COMPLETED',
          workerAttempt: claim.workerAttempts,
          result: 'failed',
          errorCode: 'worker_processing_incomplete',
          errorMessage: 'The worker left processing without recording a terminal stage result.',
        });
      }
    }
  }

  private async scheduleRetry(claim: ClaimedReplayAttempt, message: string): Promise<void> {
    if (claim.workerAttempts >= MAX_WORKER_ATTEMPTS) {
      await this.repository.failAttempt(claim.id, 'retry_limit_exceeded', message);
      return;
    }
    const delaySeconds = Math.min(300, 2 ** (claim.workerAttempts - 1));
    await this.repository.retryAttempt(claim.id, delaySeconds, message);
  }
}

function containerPersistenceMetrics(
  normalized: {
    detected: number;
    valid: number;
    rejected: number;
    exactDuplicates: number;
    fieldIssues: number;
    provided: boolean;
    rejectionSamples: string[];
  },
  persisted: {
    persisted: number;
    playerLinked: number;
    playerUnidentified: number;
    playerUnmatched: number;
  } | null | undefined,
): Record<string, unknown> {
  return {
    provided: normalized.provided,
    detected: normalized.detected,
    valid: normalized.valid,
    rejected: normalized.rejected,
    exact_duplicates: normalized.exactDuplicates,
    field_issues: normalized.fieldIssues,
    persisted: persisted?.persisted ?? 0,
    player_linked: persisted?.playerLinked ?? 0,
    player_unidentified: persisted?.playerUnidentified ?? 0,
    player_unmatched: persisted?.playerUnmatched ?? 0,
    rejection_samples: normalized.rejectionSamples,
  };
}

function hasIntegrityWarnings(inconsistencies: string, metrics: Record<string, unknown>): boolean {
  const parsed = inconsistencies ? JSON.parse(inconsistencies).count as number : 0;
  const detected = Number(metrics.detected ?? 0);
  return parsed > 0
    || Number(metrics.rejected ?? 0) > 0
    || Number(metrics.field_issues ?? 0) > 0
    || Number(metrics.exact_duplicates ?? 0) > 0
    || Number(metrics.player_unidentified ?? 0) + Number(metrics.player_unmatched ?? 0) > 0
    || (metrics.provided === true && Number(metrics.persisted ?? 0) !== Number(metrics.valid ?? 0) && detected > 0);
}

function configuredInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

