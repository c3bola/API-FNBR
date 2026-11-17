import {
  ContainerInteraction,
  ListMatchContainerInteractions200Response,
} from '../../generated/v1/models';
import { pool } from '../../infra/database/postgres.config';
import { ReplayNotFoundError, logReplayError } from './replays.errors';

export type ReplayDiagnosticStage =
  | 'HTTP_RECEIVED'
  | 'PAYLOAD_PERSISTED'
  | 'JOB_ENQUEUED'
  | 'WORKER_CLAIMED'
  | 'PARSER_STARTED'
  | 'PARSER_COMPLETED'
  | 'NORMALIZATION_STARTED'
  | 'NORMALIZATION_COMPLETED'
  | 'DATABASE_PERSISTED'
  | 'PROCESSING_COMPLETED';

export type ReplayDiagnosticResult =
  | 'started'
  | 'succeeded'
  | 'partial_success'
  | 'failed'
  | 'skipped';

export interface ReplayStageInput {
  attemptId: number;
  fileSha256: string;
  stage: ReplayDiagnosticStage;
  workerAttempt?: number;
  result: Exclude<ReplayDiagnosticResult, 'started'>;
  startedAt?: Date;
  durationMs?: number;
  metrics?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  errorDetail?: string;
}

export interface ReplayAttemptFilters {
  status?: string;
  fileSha256?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export class ReplayDiagnosticsRepository {
  async startStage(
    attemptId: number,
    fileSha256: string,
    stage: ReplayDiagnosticStage,
    workerAttempt = 0,
  ): Promise<number | null> {
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO fortnite_replay.processing_stage
           (processing_attempt_id, worker_attempt, stage_name, result)
         VALUES ($1, $2, $3, 'started')
         RETURNING id::text`,
        [attemptId, workerAttempt, stage],
      );
      return result.rows[0] ? safeCount(result.rows[0].id, 'stage id') : null;
    } catch (error) {
      logReplayError(`diagnostic_${stage.toLowerCase()}_start`, fileSha256, attemptId, error);
      return null;
    }
  }

  async completeStage(stageId: number | null, input: ReplayStageInput): Promise<void> {
    if (stageId === null) return;
    try {
      await pool.query(
        `UPDATE fortnite_replay.processing_stage
         SET result = $2, completed_at = CURRENT_TIMESTAMP, duration_ms = $3,
             metrics = $4::jsonb, error_code = $5, error_message = $6, error_detail = $7
         WHERE id = $1 AND result = 'started'`,
        [
          stageId,
          input.result,
          Math.max(0, Math.round(input.durationMs ?? 0)),
          JSON.stringify(input.metrics ?? {}),
          input.errorCode ?? null,
          limited(input.errorMessage, 1000),
          limited(input.errorDetail, 16000),
        ],
      );
      this.logStageIssue(input);
    } catch (error) {
      logReplayError(`diagnostic_${input.stage.toLowerCase()}_complete`, input.fileSha256, input.attemptId, error);
    }
  }

  async recordStage(input: ReplayStageInput): Promise<void> {
    const completedAt = new Date();
    const startedAt = input.startedAt ?? completedAt;
    try {
      await pool.query(
        `INSERT INTO fortnite_replay.processing_stage
           (processing_attempt_id, worker_attempt, stage_name, result, started_at,
            completed_at, duration_ms, metrics, error_code, error_message, error_detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
        [
          input.attemptId,
          input.workerAttempt ?? 0,
          input.stage,
          input.result,
          startedAt,
          completedAt,
          Math.max(0, Math.round(input.durationMs ?? 0)),
          JSON.stringify(input.metrics ?? {}),
          input.errorCode ?? null,
          limited(input.errorMessage, 1000),
          limited(input.errorDetail, 16000),
        ],
      );
      this.logStageIssue(input);
    } catch (error) {
      logReplayError(`diagnostic_${input.stage.toLowerCase()}`, input.fileSha256, input.attemptId, error);
    }
  }

  async pruneDiagnostics(retentionDays: number, batchSize: number): Promise<{
    processingStages: number;
    malformedPayloads: number;
  }> {
    const stages = await pool.query(
      `WITH expired AS (
         SELECT id
         FROM fortnite_replay.processing_stage
         WHERE completed_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')
         ORDER BY completed_at, id
         LIMIT $2
       )
       DELETE FROM fortnite_replay.processing_stage AS stage
       USING expired
       WHERE stage.id = expired.id`,
      [retentionDays, batchSize],
    );
    const malformed = await pool.query(
      `WITH expired AS (
         SELECT id
         FROM fortnite_replay.ingestion_diagnostic
         WHERE received_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')
         ORDER BY received_at, id
         LIMIT $2
       )
       DELETE FROM fortnite_replay.ingestion_diagnostic AS diagnostic
       USING expired
       WHERE diagnostic.id = expired.id`,
      [retentionDays, batchSize],
    );
    return {
      processingStages: stages.rowCount ?? 0,
      malformedPayloads: malformed.rowCount ?? 0,
    };
  }

  async getHealth(workerRunning: boolean) {
    const [queue, recentErrors] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'accepted')::text AS pending,
           COUNT(*) FILTER (WHERE status = 'processing')::text AS processing,
           COUNT(*) FILTER (
             WHERE status = 'processing'
               AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
           )::text AS expired_leases,
           COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
           COUNT(*) FILTER (WHERE status = 'skipped')::text AS skipped,
           MIN(received_at) FILTER (WHERE status = 'accepted') AS oldest_pending_at
         FROM fortnite_replay.processing_attempt`,
      ),
      pool.query(
        `WITH recent_diagnostics AS (
           SELECT stage.processing_attempt_id, attempt.file_sha256,
                  stage.stage_name, stage.error_code, stage.error_message,
                  stage.completed_at, stage.id AS sort_id
           FROM fortnite_replay.processing_stage AS stage
           JOIN fortnite_replay.processing_attempt AS attempt
             ON attempt.id = stage.processing_attempt_id
           WHERE stage.result IN ('failed', 'partial_success')
           UNION ALL
           SELECT attempt.id, attempt.file_sha256, 'PROCESSING_ATTEMPT',
                  attempt.error_code, attempt.error_message, attempt.completed_at, attempt.id
           FROM fortnite_replay.processing_attempt AS attempt
           WHERE attempt.status = 'failed' AND attempt.error_code IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM fortnite_replay.processing_stage AS stage
               WHERE stage.processing_attempt_id = attempt.id AND stage.result = 'failed'
             )
         )
         SELECT processing_attempt_id, file_sha256, stage_name, error_code,
                error_message, completed_at
         FROM recent_diagnostics
         ORDER BY completed_at DESC NULLS LAST, sort_id DESC
         LIMIT 10`,
      ),
    ]);
    const row = queue.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error('Replay health metrics were not returned.');
    return {
      worker_running: workerRunning,
      queue: {
        pending: safeCount(row.pending, 'pending attempt count'),
        processing: safeCount(row.processing, 'processing attempt count'),
        expired_leases: safeCount(row.expired_leases, 'expired lease count'),
        failed: safeCount(row.failed, 'failed attempt count'),
        skipped: safeCount(row.skipped, 'skipped attempt count'),
        oldest_pending_at: nullableTimestamp(row.oldest_pending_at),
      },
      recent_errors: recentErrors.rows.map((item) => ({
        processing_attempt_id: safeCount(item.processing_attempt_id, 'attempt id'),
        file_sha256: String(item.file_sha256).trim(),
        stage: String(item.stage_name),
        error_code: item.error_code == null ? null : String(item.error_code),
        message: item.error_message == null ? null : String(item.error_message),
        occurred_at: nullableTimestamp(item.completed_at),
      })),
    };
  }

  async getMetrics() {
    const result = await pool.query(
      `WITH latest_container AS (
         SELECT DISTINCT ON (processing_attempt_id)
                processing_attempt_id, metrics
         FROM fortnite_replay.processing_stage
         WHERE stage_name = 'DATABASE_PERSISTED'
         ORDER BY processing_attempt_id, id DESC
       ), latest_completion AS (
         SELECT DISTINCT ON (processing_attempt_id)
                processing_attempt_id, result, duration_ms
         FROM fortnite_replay.processing_stage
         WHERE stage_name = 'PROCESSING_COMPLETED' AND result <> 'started'
         ORDER BY processing_attempt_id, id DESC
       )
       SELECT
         COUNT(*)::text AS received,
         COUNT(*) FILTER (WHERE attempt.status IN ('succeeded', 'failed', 'skipped'))::text AS processed,
         COUNT(*) FILTER (WHERE attempt.status = 'succeeded')::text AS succeeded,
         COUNT(*) FILTER (WHERE attempt.status = 'failed')::text AS failed,
         COUNT(*) FILTER (WHERE attempt.status = 'skipped')::text AS skipped,
         COUNT(*) FILTER (WHERE completion.result = 'partial_success')::text AS partial,
         COUNT(*) FILTER (WHERE attempt.status = 'accepted')::text AS pending,
         COUNT(*) FILTER (WHERE attempt.status = 'processing')::text AS processing,
         COUNT(*) FILTER (
           WHERE attempt.status = 'processing'
             AND (attempt.lease_expires_at IS NULL OR attempt.lease_expires_at <= CURRENT_TIMESTAMP)
         )::text AS expired_leases,
         COALESCE(AVG(completion.duration_ms), 0)::float8 AS average_processing_ms,
         COALESCE(MAX(completion.duration_ms), 0)::text AS maximum_processing_ms,
         COALESCE(AVG(attempt.worker_attempts), 0)::float8 AS average_attempts,
         COALESCE(SUM((container.metrics->>'detected')::bigint), 0)::text AS containers_detected,
         COALESCE(SUM((container.metrics->>'valid')::bigint), 0)::text AS containers_valid,
         COALESCE(SUM((container.metrics->>'rejected')::bigint), 0)::text AS containers_rejected,
         COALESCE(SUM((container.metrics->>'exact_duplicates')::bigint), 0)::text AS containers_duplicated,
         COALESCE(SUM((container.metrics->>'persisted')::bigint), 0)::text AS containers_persisted,
         COALESCE(SUM((container.metrics->>'player_linked')::bigint), 0)::text AS containers_player_linked,
         COALESCE(SUM((container.metrics->>'player_unidentified')::bigint), 0)::text AS containers_player_unidentified
       FROM fortnite_replay.processing_attempt AS attempt
       LEFT JOIN latest_container AS container
         ON container.processing_attempt_id = attempt.id
       LEFT JOIN latest_completion AS completion
         ON completion.processing_attempt_id = attempt.id`,
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error('Replay aggregate metrics were not returned.');
    const received = safeCount(row.received, 'received attempt count');
    const succeeded = safeCount(row.succeeded, 'succeeded attempt count');
    const processed = safeCount(row.processed, 'processed attempt count');
    const detected = safeCount(row.containers_detected, 'detected container count');
    const valid = safeCount(row.containers_valid, 'valid container count');
    const persisted = safeCount(row.containers_persisted, 'persisted container count');
    return {
      received,
      processed,
      succeeded,
      failed: safeCount(row.failed, 'failed attempt count'),
      skipped: safeCount(row.skipped, 'skipped attempt count'),
      partial: safeCount(row.partial, 'partial processing count'),
      pending: safeCount(row.pending, 'pending attempt count'),
      processing: safeCount(row.processing, 'processing attempt count'),
      expired_leases: safeCount(row.expired_leases, 'expired lease count'),
      average_processing_ms: Number(row.average_processing_ms),
      maximum_processing_ms: safeCount(row.maximum_processing_ms, 'maximum processing duration'),
      average_attempts: Number(row.average_attempts),
      success_rate: processed === 0 ? null : succeeded / processed,
      containers: {
        detected,
        valid,
        rejected: safeCount(row.containers_rejected, 'rejected container count'),
        duplicated: safeCount(row.containers_duplicated, 'duplicated container count'),
        persisted,
        player_linked: safeCount(row.containers_player_linked, 'player-linked container count'),
        player_unidentified: safeCount(row.containers_player_unidentified, 'unidentified container count'),
        persistence_rate: valid === 0 ? null : persisted / valid,
      },
      received_attempts: received,
    };
  }

  async listAttempts(filters: ReplayAttemptFilters) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filters.status !== undefined) {
      values.push(filters.status);
      conditions.push(`attempt.status = $${values.length}`);
    }
    if (filters.fileSha256 !== undefined) {
      values.push(filters.fileSha256);
      conditions.push(`attempt.file_sha256 = $${values.length}`);
    }
    if (filters.from !== undefined) {
      values.push(filters.from);
      conditions.push(`attempt.received_at >= $${values.length}::timestamptz`);
    }
    if (filters.to !== undefined) {
      values.push(filters.to);
      conditions.push(`attempt.received_at < $${values.length}::timestamptz`);
    }
    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM fortnite_replay.processing_attempt AS attempt ${where}`,
      values,
    );
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await pool.query(
      `SELECT attempt.id, attempt.file_sha256, attempt.payload_sha256,
              attempt.application_id, attempt.idempotency_key, attempt.status,
              attempt.error_code, attempt.error_message, attempt.received_at,
              attempt.started_at, attempt.completed_at, attempt.worker_attempts,
              latest.metrics AS container_metrics,
              latest_completion.result AS integrity_result,
              latest_completion.duration_ms
       FROM fortnite_replay.processing_attempt AS attempt
       LEFT JOIN LATERAL (
         SELECT metrics FROM fortnite_replay.processing_stage
         WHERE processing_attempt_id = attempt.id AND stage_name = 'DATABASE_PERSISTED'
         ORDER BY id DESC LIMIT 1
       ) AS latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT result, duration_ms FROM fortnite_replay.processing_stage
         WHERE processing_attempt_id = attempt.id AND stage_name = 'PROCESSING_COMPLETED'
           AND result <> 'started'
         ORDER BY id DESC LIMIT 1
       ) AS latest_completion ON TRUE
       ${where}
       ORDER BY attempt.received_at DESC, attempt.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      data: result.rows.map((row) => mapAttemptSummary(row)),
      pagination: pagination(
        filters.page,
        filters.pageSize,
        safeCount(countResult.rows[0].count, 'attempt count'),
      ),
    };
  }

  async getAttempt(attemptId: number) {
    const attemptResult = await pool.query(
      `SELECT id, file_sha256, payload_sha256, application_id, idempotency_key,
              request_sha256, analyzer_version, application_version, parser_name,
              parser_version, parse_mode, status, error_code, error_message,
              error_detail, received_at, started_at, completed_at, worker_attempts,
              lease_expires_at
       FROM fortnite_replay.processing_attempt WHERE id = $1`,
      [attemptId],
    );
    const attempt = attemptResult.rows[0] as Record<string, unknown> | undefined;
    if (!attempt) throw new ReplayNotFoundError('Replay processing attempt was not found.');
    const stages = await pool.query(
      `SELECT id, worker_attempt, stage_name, result, started_at, completed_at,
              duration_ms, metrics, error_code, error_message, error_detail
       FROM fortnite_replay.processing_stage
       WHERE processing_attempt_id = $1
       ORDER BY started_at, id`,
      [attemptId],
    );
    return {
      attempt: mapAttemptSummary(attempt),
      identifiers: {
        request_sha256: String(attempt.request_sha256).trim(),
        analyzer_version: attempt.analyzer_version ?? null,
        application_version: attempt.application_version ?? null,
        parser_name: attempt.parser_name ?? null,
        parser_version: attempt.parser_version ?? null,
        parse_mode: attempt.parse_mode ?? null,
        error_detail: attempt.error_detail ?? null,
        lease_expires_at: nullableTimestamp(attempt.lease_expires_at),
      },
      timeline: stages.rows.map((stage) => ({
        id: safeCount(stage.id, 'stage id'),
        worker_attempt: safeCount(stage.worker_attempt, 'worker attempt'),
        stage: String(stage.stage_name),
        result: String(stage.result),
        started_at: nullableTimestamp(stage.started_at),
        completed_at: nullableTimestamp(stage.completed_at),
        duration_ms: stage.duration_ms == null ? null : safeCount(stage.duration_ms, 'stage duration'),
        metrics: jsonObject(stage.metrics),
        error_code: stage.error_code ?? null,
        error_message: stage.error_message ?? null,
        error_detail: stage.error_detail ?? null,
      })),
    };
  }

  async getContainerDiagnostics(attemptId: number) {
    const attemptResult = await pool.query(
      `SELECT id, file_sha256 FROM fortnite_replay.processing_attempt WHERE id = $1`,
      [attemptId],
    );
    const attempt = attemptResult.rows[0] as Record<string, unknown> | undefined;
    if (!attempt) throw new ReplayNotFoundError('Replay processing attempt was not found.');
    const [normalizedResult, databaseResult, countsResult, samplesResult] = await Promise.all([
      pool.query(
        `SELECT metrics FROM fortnite_replay.processing_stage
         WHERE processing_attempt_id = $1 AND stage_name = 'NORMALIZATION_COMPLETED'
         ORDER BY id DESC LIMIT 1`,
        [attemptId],
      ),
      pool.query(
        `SELECT metrics FROM fortnite_replay.processing_stage
         WHERE processing_attempt_id = $1 AND stage_name = 'DATABASE_PERSISTED'
         ORDER BY id DESC LIMIT 1`,
        [attemptId],
      ),
      pool.query(
        `SELECT COUNT(*)::text AS persisted,
                COUNT(*) FILTER (WHERE event.searching_player_replay_id IS NULL)::text AS player_unidentified,
                COUNT(*) FILTER (
                  WHERE event.searching_player_replay_id IS NOT NULL AND player.id IS NULL
                )::text AS player_unmatched,
                COUNT(*) FILTER (WHERE player.id IS NOT NULL)::text AS player_linked
         FROM fortnite_replay.container_interaction AS event
         LEFT JOIN fortnite_replay.match_player AS player
           ON player.match_id = event.match_id
          AND player.replay_player_id = event.searching_player_replay_id
         WHERE event.processing_attempt_id = $1`,
        [attemptId],
      ),
      pool.query(
        `SELECT event.observation_index, event.source_actor_key, event.container_label,
                event.interaction_kind, event.time_seconds,
                event.searching_player_state_actor_id, event.searching_player_replay_id,
                (player.id IS NOT NULL) AS player_linked
         FROM fortnite_replay.container_interaction AS event
         LEFT JOIN fortnite_replay.match_player AS player
           ON player.match_id = event.match_id
          AND player.replay_player_id = event.searching_player_replay_id
         WHERE event.processing_attempt_id = $1
         ORDER BY event.observation_index
         LIMIT 100`,
        [attemptId],
      ),
    ]);
    const counts = countsResult.rows[0] as Record<string, unknown>;
    const detected = countsResult.rowCount === 0 ? 0 : safeCount(counts.persisted, 'persisted container count');
    return {
      processing_attempt_id: safeCount(attempt.id, 'attempt id'),
      file_sha256: String(attempt.file_sha256).trim(),
      normalization: normalizedResult.rows[0] ? jsonObject(normalizedResult.rows[0].metrics) : null,
      persistence: databaseResult.rows[0] ? jsonObject(databaseResult.rows[0].metrics) : null,
      database: {
        persisted: detected,
        player_linked: safeCount(counts.player_linked, 'player-linked container count'),
        player_unidentified: safeCount(counts.player_unidentified, 'unidentified container count'),
        player_unmatched: safeCount(counts.player_unmatched, 'unmatched player count'),
      },
      samples: samplesResult.rows.map((row) => ({
        observation_index: safeCount(row.observation_index, 'observation index'),
        source_actor_key: row.source_actor_key ?? null,
        container_label: row.container_label ?? null,
        interaction_kind: row.interaction_kind ?? null,
        time_seconds: row.time_seconds ?? null,
        searching_player_state_actor_id: row.searching_player_state_actor_id ?? null,
        searching_player_replay_id: row.searching_player_replay_id ?? null,
        player_linked: row.player_linked === true,
      })),
      samples_truncated: detected > samplesResult.rows.length,
    };
  }

  async listMatchContainerInteractions(
    matchId: number,
    filters: {
      fromSeconds?: number;
      toSeconds?: number;
      processingAttemptId?: number;
      playerReplayId?: number;
      containerLabel?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<ListMatchContainerInteractions200Response> {
    const values: unknown[] = [matchId];
    const conditions = ['event.match_id = $1'];
    if (filters.fromSeconds !== undefined) {
      values.push(filters.fromSeconds);
      conditions.push(`event.time_seconds >= $${values.length}`);
    }
    if (filters.toSeconds !== undefined) {
      values.push(filters.toSeconds);
      conditions.push(`event.time_seconds <= $${values.length}`);
    }
    if (filters.processingAttemptId !== undefined) {
      values.push(filters.processingAttemptId);
      conditions.push(`event.processing_attempt_id = $${values.length}`);
    }
    if (filters.playerReplayId !== undefined) {
      values.push(filters.playerReplayId);
      conditions.push(`event.searching_player_replay_id = $${values.length}`);
    }
    if (filters.containerLabel !== undefined) {
      values.push(filters.containerLabel);
      conditions.push(`event.container_label = $${values.length}`);
    }
    const where = conditions.join(' AND ');
    const match = await pool.query('SELECT 1 FROM fortnite_replay.game_match WHERE id = $1', [matchId]);
    if (match.rowCount === 0) throw new ReplayNotFoundError('Match was not found.');
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM fortnite_replay.container_interaction AS event WHERE ${where}`,
      values,
    );
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await pool.query(
      `SELECT event.id, event.match_id, event.processing_attempt_id,
              event.source_actor_key, event.container_label,
              event.interaction_kind, event.time_seconds,
              event.searching_pawn_actor_id, event.searching_player_state_actor_id,
              event.searching_player_replay_id, event.already_searched,
              event.search_animation_count, event.destroyed
       FROM fortnite_replay.container_interaction AS event
       WHERE ${where}
       ORDER BY event.time_seconds NULLS LAST, event.id
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      success: true,
      data: result.rows.map((row) => mapContainerInteraction(row)),
      pagination: pagination(
        filters.page,
        filters.pageSize,
        safeCount(countResult.rows[0].count, 'container interaction count'),
      ),
    };
  }

  private logStageIssue(input: ReplayStageInput): void {
    if (input.result !== 'failed' && input.result !== 'partial_success') return;
    const write = input.result === 'failed' ? console.error : console.warn;
    write(JSON.stringify({
      event: 'replay_processing',
      processingAttemptId: input.attemptId,
      fileSha256: input.fileSha256,
      stage: input.stage,
      result: input.result,
      errorCode: input.errorCode ?? null,
      metrics: input.metrics ?? {},
      timestamp: new Date().toISOString(),
    }));
  }
}

export const replayDiagnosticsRepository = new ReplayDiagnosticsRepository();

function mapAttemptSummary(row: Record<string, unknown>) {
  return {
    id: safeCount(row.id, 'attempt id'),
    file_sha256: String(row.file_sha256).trim(),
    payload_sha256: row.payload_sha256 == null ? null : String(row.payload_sha256).trim(),
    application_id: String(row.application_id),
    idempotency_key: String(row.idempotency_key),
    status: String(row.status),
    error_code: row.error_code ?? null,
    error_message: row.error_message ?? null,
    received_at: nullableTimestamp(row.received_at),
    started_at: nullableTimestamp(row.started_at),
    completed_at: nullableTimestamp(row.completed_at),
    worker_attempts: safeCount(row.worker_attempts, 'worker attempt count'),
    integrity_result: row.integrity_result ?? null,
    duration_ms: row.duration_ms == null ? null : safeCount(row.duration_ms, 'processing duration'),
    container_metrics: row.container_metrics == null ? null : jsonObject(row.container_metrics),
  };
}

function mapContainerInteraction(row: Record<string, unknown>): ContainerInteraction {
  return {
    id: safeCount(row.id, 'container interaction id'),
    match_id: safeCount(row.match_id, 'match id'),
    processing_attempt_id: safeCount(row.processing_attempt_id, 'attempt id'),
    source_actor_key: row.source_actor_key == null ? null : String(row.source_actor_key),
    container_label: row.container_label == null ? null : String(row.container_label),
    interaction_kind: row.interaction_kind == null ? null : String(row.interaction_kind) as ContainerInteraction.InteractionKindEnum,
    time_seconds: nullableNumber(row.time_seconds),
    searching_pawn_actor_id: nullableNumber(row.searching_pawn_actor_id),
    searching_player_state_actor_id: nullableNumber(row.searching_player_state_actor_id),
    searching_player_replay_id: nullableNumber(row.searching_player_replay_id),
    already_searched: row.already_searched == null ? null : Boolean(row.already_searched),
    search_animation_count: nullableNumber(row.search_animation_count),
    destroyed: row.destroyed == null ? null : Boolean(row.destroyed),
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : {};
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function safeCount(value: unknown, label: string): number {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`${label} is outside the safe integer range.`);
  }
  return count;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new TypeError('Invalid numeric database value.');
  return number;
}

function nullableTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid database timestamp.');
  return date.toISOString();
}

function limited(value: string | undefined, maxLength: number): string | null {
  if (value === undefined) return null;
  return value.slice(0, maxLength);
}
