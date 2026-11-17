import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import {
  GetReplayFile200Response,
  ListReplayFileProcessingAttempts200Response,
  ListReplayFiles200Response,
  ParserReplayData,
  ReplayIngestionRequest,
  ReplayProcessingAttempt,
} from '../../generated/v1/models';
import { pool } from '../../infra/database/postgres.config';
import {
  logReplayError,
  ReplayConflictError,
  ReplayNotFoundError,
  ReplayPersistenceError,
} from './replays.errors';
import type { ContainerNormalizationMetrics } from './replays.service';

export type ReplayAttemptOutcomeKind = 'created' | 'replayed' | 'processing' | 'failed';

export interface ReplayAttemptOutcome {
  attempt: ReplayProcessingAttempt;
  outcome: ReplayAttemptOutcomeKind;
}

export interface ContainerPersistenceMetrics {
  provided: boolean;
  detected: number;
  valid: number;
  rejected: number;
  exactDuplicates: number;
  fieldIssues: number;
  persisted: number;
  playerLinked: number;
  playerUnidentified: number;
  playerUnmatched: number;
  rejectionSamples: string[];
}

export interface ClaimedReplayAttempt {
  id: number;
  fileSha256: string;
  requestSha256: string;
  payloadSha256: string | null;
  rawPayload: Buffer | null;
  workerAttempts: number;
}

export async function recordMalformedReplayDiagnostic(
  fileSha256: string,
  rawPayload: Buffer,
  applicationId: string | null,
  idempotencyKey: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO fortnite_replay.ingestion_diagnostic
       (file_sha256, application_id, idempotency_key, payload_sha256, original_payload, error_code)
     VALUES ($1, $2, $3, $4, $5, 'invalid_json')`,
    [
      fileSha256,
      applicationId,
      idempotencyKey,
      createHash('sha256').update(rawPayload).digest('hex'),
      rawPayload,
    ],
  );
}

const SAFE_FAILURE_MESSAGE = 'Replay ingestion failed.';
const MAX_PAGE_SIZE = 100;
const FILE_SELECT = `
  file.file_sha256,
  file.first_registered_at,
  COALESCE(upload.application_ids, ARRAY[]::text[]) AS application_ids,
  upload.latest_received_at,
  COALESCE(attempts.attempt_count, 0) AS processing_attempt_count
`;
const ATTEMPT_SELECT = `
  id, file_sha256, application_id, idempotency_key, request_sha256, payload_sha256,
  analyzer_version, application_version, parser_name, parser_version,
  parse_mode, status, error_code, error_message, received_at, started_at, completed_at
`;

export class ReplaysRepository {
  async listReplayFiles(
    applicationId: string | undefined,
    status: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<ListReplayFiles200Response> {
    const offset = (page - 1) * pageSize;
    const values: unknown[] = [];
    const filters: string[] = [];
    if (applicationId !== undefined) {
      values.push(applicationId);
      filters.push(`EXISTS (
        SELECT 1 FROM fortnite_replay.replay_upload AS filter_upload
        WHERE filter_upload.file_sha256 = file.file_sha256
          AND filter_upload.application_id = $${values.length}
      )`);
    }
    if (status === 'unprocessed') {
      filters.push(`NOT EXISTS (
        SELECT 1 FROM fortnite_replay.processing_attempt AS filter_attempt
        WHERE filter_attempt.file_sha256 = file.file_sha256
      )`);
    } else if (status !== undefined) {
      values.push(status);
      filters.push(`EXISTS (
        SELECT 1 FROM fortnite_replay.processing_attempt AS filter_attempt
        WHERE filter_attempt.file_sha256 = file.file_sha256
          AND filter_attempt.status = $${values.length}
      )`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM fortnite_replay.replay_file AS file ${where}`,
      values,
    );
    values.push(pageSize, offset);
    const result = await pool.query(
      `SELECT ${FILE_SELECT}
       FROM fortnite_replay.replay_file AS file
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(upload.application_id ORDER BY upload.application_id) AS application_ids,
                MAX(upload.last_received_at) AS latest_received_at
         FROM fortnite_replay.replay_upload AS upload
         WHERE upload.file_sha256 = file.file_sha256
       ) AS upload ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS attempt_count
         FROM fortnite_replay.processing_attempt AS attempt
         WHERE attempt.file_sha256 = file.file_sha256
       ) AS attempts ON TRUE
       ${where}
       ORDER BY file.first_registered_at DESC, file.file_sha256
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      success: true,
      data: result.rows.map(mapReplayFile),
      pagination: pagination(page, pageSize, safeInteger(countResult.rows[0].count, 'file count')),
    };
  }

  async getReplayFile(sha256: string): Promise<GetReplayFile200Response> {
    const result = await pool.query(
      `SELECT ${FILE_SELECT}
       FROM fortnite_replay.replay_file AS file
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(upload.application_id ORDER BY upload.application_id) AS application_ids,
                MAX(upload.last_received_at) AS latest_received_at
         FROM fortnite_replay.replay_upload AS upload
         WHERE upload.file_sha256 = file.file_sha256
       ) AS upload ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS attempt_count
         FROM fortnite_replay.processing_attempt AS attempt
         WHERE attempt.file_sha256 = file.file_sha256
       ) AS attempts ON TRUE
       WHERE file.file_sha256 = $1`,
      [sha256],
    );
    if (!result.rows[0]) throw new ReplayNotFoundError('Replay file was not found.');
    return { success: true, data: mapReplayFile(result.rows[0]) };
  }

  async listAttempts(
    sha256: string,
    status: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    return this.listAttemptPage('file_sha256', sha256, status, page, pageSize);
  }

  async listMatchAttempts(
    matchId: number,
    page: number,
    pageSize: number,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    return this.listAttemptPage('match_id', matchId, undefined, page, pageSize);
  }

  async accept(
    fileSha256: string,
    input: ReplayIngestionRequest,
    requestSha256: string,
    payloadSha256: string,
    rawPayload: Buffer,
  ): Promise<ReplayAttemptOutcome> {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (error) {
      logReplayError('durable_acceptance_connection', fileSha256, undefined, error);
      throw new ReplayPersistenceError('Replay request could not be durably stored.');
    }
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(
        `INSERT INTO fortnite_replay.replay_file (file_sha256)
         VALUES ($1) ON CONFLICT (file_sha256) DO NOTHING`,
        [fileSha256],
      );
      await client.query(
        `SELECT file_sha256 FROM fortnite_replay.replay_file
         WHERE file_sha256 = $1 FOR UPDATE`,
        [fileSha256],
      );
      await client.query(
        `INSERT INTO fortnite_replay.replay_upload
           (file_sha256, application_id, first_received_at, last_received_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (file_sha256, application_id) DO UPDATE
         SET last_received_at = CURRENT_TIMESTAMP`,
        [fileSha256, input.application_id],
      );
      const existing = await client.query(
        `SELECT ${ATTEMPT_SELECT}
         FROM fortnite_replay.processing_attempt
         WHERE file_sha256 = $1 AND application_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [fileSha256, input.application_id, input.idempotency_key],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.request_sha256 !== requestSha256) {
          throw new ReplayConflictError('Idempotency key was already used for a different request.');
        }
        await client.query('COMMIT');
        transactionOpen = false;
        const attempt = mapAttempt(row);
        return {
          attempt,
          outcome: attempt.status === 'accepted' || attempt.status === 'processing'
            ? 'processing' : attempt.status === 'failed' ? 'failed' : 'replayed',
        };
      }

      const parseMode = typeof input.data.parseMode === 'string'
        && ['EventsOnly', 'Minimal', 'Normal', 'Full'].includes(input.data.parseMode)
        ? input.data.parseMode : null;
      const inserted = await client.query(
        `INSERT INTO fortnite_replay.processing_attempt
           (file_sha256, application_id, idempotency_key, request_sha256, payload_sha256,
            analyzer_version, application_version, parser_name, parser_version,
            original_payload, parse_mode, status, received_at, available_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING ${ATTEMPT_SELECT}`,
        [
          fileSha256,
          input.application_id,
          input.idempotency_key,
          requestSha256,
          payloadSha256,
          input.analyzer_version.analyzer_version,
          input.analyzer_version.application_version,
          input.analyzer_version.parser_name,
          input.analyzer_version.parser_version,
          rawPayload,
          parseMode,
        ],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      return { attempt: mapAttempt(inserted.rows[0]), outcome: 'created' };
    } catch (error) {
      if (transactionOpen) {
        const rollbackError = await rollback(client);
        transactionOpen = false;
        if (rollbackError) {
          logReplayError('durable_acceptance_rollback', fileSha256, undefined, rollbackError);
          throw new ReplayPersistenceError('Replay request could not be durably stored.');
        }
      }
      if (error instanceof ReplayConflictError) throw error;
      logReplayError('durable_acceptance', fileSha256, undefined, error);
      throw new ReplayPersistenceError('Replay request could not be durably stored.');
    } finally {
      client.release();
    }
  }

  async ingest(
    fileSha256: string,
    input: ReplayIngestionRequest,
    requestSha256: string,
    inconsistencies = '',
    payloadSha256?: string,
    containerMetrics?: ContainerNormalizationMetrics,
  ): Promise<ReplayAttemptOutcome & { containerPersistence: ContainerPersistenceMetrics | null }> {
    const client = await pool.connect();
    let discardClientError: Error | undefined;
    let attempt: ReplayProcessingAttempt | undefined;
    let attemptId: number | undefined;
    let outcome: ReplayAttemptOutcomeKind = 'created';
    let transactionOpen = false;
    let dataTransactionStarted = false;
    let attemptLockHeld = false;
    let containerPersistence: ContainerPersistenceMetrics | null = null;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(
        `INSERT INTO fortnite_replay.replay_file (file_sha256)
         VALUES ($1) ON CONFLICT (file_sha256) DO NOTHING`,
        [fileSha256],
      );
      await client.query(
        `SELECT file_sha256 FROM fortnite_replay.replay_file
         WHERE file_sha256 = $1 FOR UPDATE`,
        [fileSha256],
      );
      await client.query(
        `INSERT INTO fortnite_replay.replay_upload
           (file_sha256, application_id, first_received_at, last_received_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (file_sha256, application_id) DO UPDATE
         SET last_received_at = CURRENT_TIMESTAMP`,
        [fileSha256, input.application_id],
      );
      const existing = await client.query(
        `SELECT ${ATTEMPT_SELECT}
         FROM fortnite_replay.processing_attempt
         WHERE file_sha256 = $1 AND application_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [fileSha256, input.application_id, input.idempotency_key],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.request_sha256 !== requestSha256) {
          throw new ReplayConflictError('Idempotency key was already used for a different request.');
        }
        attempt = mapAttempt(row);
        attemptId = attempt.id;
        if (attempt.status === 'processing') {
          attemptLockHeld = await this.tryAcquireAttemptLock(client, attemptId);
          if (!attemptLockHeld) {
            outcome = 'processing';
            await client.query('COMMIT');
            transactionOpen = false;
            return { attempt, outcome, containerPersistence: null };
          }
          outcome = 'replayed';
        } else {
          if (attempt.status === 'succeeded') {
            await client.query(
              `UPDATE fortnite_replay.processing_attempt SET snapshot_data = $2::jsonb
               WHERE id = $1 AND snapshot_data IS NULL`,
              [attemptId, JSON.stringify(input)],
            );
          }
          outcome = attempt.status === 'failed' ? 'failed' : 'replayed';
          await client.query('COMMIT');
          transactionOpen = false;
          return { attempt, outcome, containerPersistence: null };
        }
      } else {
        const insert = await client.query(
          `INSERT INTO fortnite_replay.processing_attempt
             (file_sha256, application_id, idempotency_key, request_sha256,
              payload_sha256, analyzer_version, application_version, parser_name, parser_version,
              original_payload, parse_mode, status, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'processing', CURRENT_TIMESTAMP)
           RETURNING ${ATTEMPT_SELECT}`,
          [
            fileSha256,
            input.application_id,
            input.idempotency_key,
            requestSha256,
            payloadSha256 ?? createHash('sha256').update(JSON.stringify(input)).digest('hex'),
            input.analyzer_version.analyzer_version,
            input.analyzer_version.application_version,
            input.analyzer_version.parser_name,
            input.analyzer_version.parser_version,
            Buffer.from(JSON.stringify(input)),
            input.data.parseMode,
          ],
        );
        attempt = mapAttempt(insert.rows[0]);
        attemptId = attempt.id;
        attemptLockHeld = await this.tryAcquireAttemptLock(client, attemptId);
        if (!attemptLockHeld) {
          throw new ReplayConflictError('Replay processing lock could not be acquired.');
        }
      }

      await client.query('COMMIT');
      transactionOpen = false;

      if (attemptId === undefined) throw new Error('Replay attempt could not be resolved.');
      await client.query('BEGIN');
      transactionOpen = true;
      dataTransactionStarted = true;
      await client.query(
        'UPDATE fortnite_replay.processing_attempt SET snapshot_data = $2::jsonb WHERE id = $1',
        [attemptId, JSON.stringify(input)],
      );
      const identityKey = input.data.match?.gameData?.gameSessionId
        ? `session:${input.data.match.gameData.gameSessionId}`
        : `file:${fileSha256}`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`replay-match:${identityKey}`],
      );
      const matchId = await this.upsertMatch(client, identityKey, input.data, attemptId);
      await client.query(
        `INSERT INTO fortnite_replay.match_processing_attempt (match_id, processing_attempt_id)
         VALUES ($1, $2) ON CONFLICT (processing_attempt_id) DO NOTHING`,
        [matchId, attemptId],
      );
      await this.recordSections(client, attemptId, input.data);
      const playerIds = await this.persistPlayers(client, matchId, attemptId, input.data.players);
      await this.persistStats(client, matchId, attemptId, input.data.match);
      await this.persistTeams(client, matchId, input.data.teams, playerIds);
      await this.persistEliminations(client, matchId, attemptId, input.data.eventEliminations);
      await this.persistKillFeed(client, matchId, attemptId, input.data.killFeed);
      await this.persistMap(client, matchId, attemptId, input.data.map);
      await this.persistWeapons(client, matchId, attemptId, input.data.weapons);
      containerPersistence = await this.persistObservations(
        client,
        matchId,
        attemptId,
        input.data.observations,
        containerMetrics,
      );
      await client.query(
        `UPDATE fortnite_replay.processing_attempt
         SET status = 'succeeded', completed_at = CURRENT_TIMESTAMP,
             error_code = CASE WHEN $2 = '' THEN NULL ELSE 'data_inconsistencies' END,
             error_message = CASE WHEN $2 = '' THEN NULL
               ELSE 'Some payload fields were invalid or unknown and were not normalized.' END,
             error_detail = NULLIF($2, ''), lease_expires_at = NULL
         WHERE id = $1 AND status = 'processing'`,
        [attemptId, inconsistencies],
      );
      attempt = await this.loadAttempt(client, attemptId);
      await client.query('COMMIT');
      transactionOpen = false;
      return { attempt, outcome, containerPersistence };
    } catch (error) {
      if (transactionOpen) {
        discardClientError = await rollback(client);
        transactionOpen = false;
      }
      if (discardClientError) throw discardClientError;
      if (error instanceof ReplayConflictError) throw error;
      if (dataTransactionStarted && attemptId !== undefined) {
        logReplayError('snapshot_persistence', fileSha256, attemptId, error);
        await client.query(
          `UPDATE fortnite_replay.processing_attempt
           SET status = 'failed', completed_at = CURRENT_TIMESTAMP,
                 error_code = 'persistence_failed', error_message = $2,
                 lease_expires_at = NULL
           WHERE id = $1 AND status = 'processing'`,
          [attemptId, SAFE_FAILURE_MESSAGE],
        );
        attempt = await this.loadAttempt(client, attemptId);
        return { attempt, outcome: 'failed', containerPersistence };
      }
      if (isUniqueViolation(error)) {
        throw new ReplayConflictError('Replay ingestion conflicts with an existing attempt.');
      }
      throw error;
    } finally {
      if (attemptLockHeld && attemptId !== undefined) {
        try {
          const unlocked = await client.query(
            'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
            [`replay-processing-attempt:${attemptId}`],
          );
          if (unlocked.rows[0]?.released !== true) {
            discardClientError = new Error('Replay attempt lock could not be released.');
            logReplayError('attempt_lock_release', fileSha256, attemptId, discardClientError);
          }
        } catch (error) {
          discardClientError = error instanceof Error ? error : new Error('Replay attempt lock release failed.');
          logReplayError('attempt_lock_release', fileSha256, attemptId, error);
        }
      }
      client.release(discardClientError);
      if (discardClientError) throw discardClientError;
    }
  }

  async claimNext(leaseSeconds: number): Promise<ClaimedReplayAttempt | null> {
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const expired = await client.query(
        `SELECT id
         FROM fortnite_replay.processing_attempt
         WHERE status = 'processing'
           AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)
         ORDER BY lease_expires_at NULLS FIRST, received_at
         FOR UPDATE SKIP LOCKED
         LIMIT 10`,
      );
      for (const row of expired.rows) {
        const id = safeInteger(row.id, 'attempt id');
        const lockKey = `replay-processing-attempt:${id}`;
        const lock = await client.query(
          'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
          [lockKey],
        );
        if (lock.rows[0]?.acquired !== true) continue;
        await client.query(
          `UPDATE fortnite_replay.processing_attempt
           SET status = 'accepted', started_at = NULL, lease_expires_at = NULL,
               available_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND status = 'processing'`,
          [id],
        );
        const unlocked = await client.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
          [lockKey],
        );
        if (unlocked.rows[0]?.released !== true) {
          throw new Error('Expired replay attempt lock could not be released.');
        }
      }
      const result = await client.query(
        `WITH candidate AS (
           SELECT id
           FROM fortnite_replay.processing_attempt
           WHERE status = 'accepted' AND available_at <= CURRENT_TIMESTAMP
           ORDER BY available_at, received_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE fortnite_replay.processing_attempt AS attempt
         SET status = 'processing',
             started_at = CURRENT_TIMESTAMP,
             lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => $1),
             worker_attempts = worker_attempts + 1
         FROM candidate
         WHERE attempt.id = candidate.id
         RETURNING attempt.id, attempt.file_sha256, attempt.request_sha256,
                   attempt.payload_sha256,
                   attempt.original_payload, attempt.worker_attempts`,
        [leaseSeconds],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: safeInteger(row.id, 'attempt id'),
        fileSha256: String(row.file_sha256).trim(),
        requestSha256: String(row.request_sha256).trim(),
        payloadSha256: row.payload_sha256 === null
          ? null : String(row.payload_sha256).trim(),
        rawPayload: Buffer.isBuffer(row.original_payload) ? row.original_payload : null,
        workerAttempts: safeInteger(row.worker_attempts, 'worker attempt count'),
      };
    } catch (error) {
      if (transactionOpen) await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(attemptId: number, leaseSeconds: number): Promise<void> {
    await pool.query(
      `UPDATE fortnite_replay.processing_attempt
       SET lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => $2)
       WHERE id = $1 AND status = 'processing'`,
      [attemptId, leaseSeconds],
    );
  }

  async failAttempt(attemptId: number, code: string, message: string, detail?: string): Promise<void> {
    await pool.query(
      `UPDATE fortnite_replay.processing_attempt
       SET status = 'failed', completed_at = CURRENT_TIMESTAMP, lease_expires_at = NULL,
           error_code = $2, error_message = $3, error_detail = $4
       WHERE id = $1 AND status = 'processing'`,
      [attemptId, code, message, detail ?? null],
    );
  }

  async retryAttempt(attemptId: number, delaySeconds: number, message: string): Promise<void> {
    await pool.query(
      `UPDATE fortnite_replay.processing_attempt
       SET status = 'accepted', started_at = NULL, completed_at = NULL,
           lease_expires_at = NULL, available_at = CURRENT_TIMESTAMP + make_interval(secs => $2),
           error_code = 'persistence_retry', error_message = $3
       WHERE id = $1 AND status = 'failed'`,
      [attemptId, delaySeconds, message],
    );
  }

  private async tryAcquireAttemptLock(client: PoolClient, attemptId: number): Promise<boolean> {
    const result = await client.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [`replay-processing-attempt:${attemptId}`],
    );
    return result.rows[0]?.acquired === true;
  }

  private async listAttemptPage(
    key: 'file_sha256' | 'match_id',
    value: string | number,
    status: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<ListReplayFileProcessingAttempts200Response> {
    const client = await pool.connect();
    try {
      if (key === 'file_sha256') {
        const exists = await client.query(
          'SELECT 1 FROM fortnite_replay.replay_file WHERE file_sha256 = $1',
          [value],
        );
        if (exists.rowCount === 0) throw new ReplayNotFoundError('Replay file was not found.');
      }
      const filters = [`${key === 'file_sha256' ? 'file_sha256' : 'match_id'} = $1`];
      const values: unknown[] = [value];
      if (status !== undefined) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      const where = filters.join(' AND ');
      const from = key === 'file_sha256'
        ? 'fortnite_replay.processing_attempt'
        : `fortnite_replay.processing_attempt AS attempt
           JOIN fortnite_replay.match_processing_attempt AS link
             ON link.processing_attempt_id = attempt.id`;
      const count = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${from} WHERE ${key === 'file_sha256' ? where : `link.match_id = $1${status === undefined ? '' : ' AND attempt.status = $2'}`}`,
        values,
      );
      values.push(pageSize, (page - 1) * pageSize);
      const result = await client.query(
        `SELECT ${key === 'file_sha256' ? ATTEMPT_SELECT : ATTEMPT_SELECT.replace(/\b(id|file_sha256|application_id|idempotency_key|request_sha256|analyzer_version|application_version|parser_name|parser_version|parse_mode|status|error_code|error_message|received_at|started_at|completed_at)\b/g, 'attempt.$1')}
         FROM ${from}
         WHERE ${key === 'file_sha256' ? where : `link.match_id = $1${status === undefined ? '' : ' AND attempt.status = $2'}`}
         ORDER BY ${key === 'file_sha256' ? 'received_at' : 'attempt.received_at'} DESC, ${key === 'file_sha256' ? 'id' : 'attempt.id'} DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        success: true,
        data: result.rows.map(mapAttempt),
        pagination: pagination(page, pageSize, safeInteger(count.rows[0].count, 'attempt count')),
      };
    } finally {
      client.release();
    }
  }

  private async upsertMatch(
    client: PoolClient,
    identityKey: string,
    data: ParserReplayData,
    attemptId: number,
  ): Promise<number> {
    const match = data.match ?? {};
    const game = match.gameData ?? {};
    const stats = match.teamStats ?? {};
    const result = await client.query(
      `INSERT INTO fortnite_replay.game_match
         (identity_key, game_session_id, replay_timestamp, replay_length_milliseconds,
          replay_branch, utc_time_started_match, match_end_time, current_playlist,
          map_info, additional_playlist_levels, active_gameplay_modifiers, recorder_id,
          team_count, team_size, player_bots_left, players_left, teams_left, elapsed_time,
          game_phase, safe_zone_phase, has_begun_play, total_player_structures,
          winning_team, winning_player_ids, aircraft_start_time, safe_zones_start_time,
          team_stats_position, team_stats_total_players,
          max_players, total_teams, total_bots, tournament_round, is_large_team_game,
          team_stats_unknown, team_stats_event_id, team_stats_event_group,
          team_stats_event_metadata, team_stats_event_start_time, team_stats_event_end_time,
          team_stats_event_size_in_bytes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
               $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, CURRENT_TIMESTAMP)
       ON CONFLICT (identity_key) DO UPDATE SET
         game_session_id = COALESCE(EXCLUDED.game_session_id, game_match.game_session_id),
         replay_timestamp = COALESCE(EXCLUDED.replay_timestamp, game_match.replay_timestamp),
         replay_length_milliseconds = COALESCE(EXCLUDED.replay_length_milliseconds, game_match.replay_length_milliseconds),
         replay_branch = COALESCE(EXCLUDED.replay_branch, game_match.replay_branch),
         utc_time_started_match = COALESCE(EXCLUDED.utc_time_started_match, game_match.utc_time_started_match),
         match_end_time = COALESCE(EXCLUDED.match_end_time, game_match.match_end_time),
         current_playlist = COALESCE(EXCLUDED.current_playlist, game_match.current_playlist),
         map_info = COALESCE(EXCLUDED.map_info, game_match.map_info),
         additional_playlist_levels = COALESCE(EXCLUDED.additional_playlist_levels, game_match.additional_playlist_levels),
         active_gameplay_modifiers = COALESCE(EXCLUDED.active_gameplay_modifiers, game_match.active_gameplay_modifiers),
         recorder_id = COALESCE(EXCLUDED.recorder_id, game_match.recorder_id),
         team_count = COALESCE(EXCLUDED.team_count, game_match.team_count),
         team_size = COALESCE(EXCLUDED.team_size, game_match.team_size),
         player_bots_left = COALESCE(EXCLUDED.player_bots_left, game_match.player_bots_left),
         players_left = COALESCE(EXCLUDED.players_left, game_match.players_left),
         teams_left = COALESCE(EXCLUDED.teams_left, game_match.teams_left),
         elapsed_time = COALESCE(EXCLUDED.elapsed_time, game_match.elapsed_time),
         game_phase = COALESCE(EXCLUDED.game_phase, game_match.game_phase),
         safe_zone_phase = COALESCE(EXCLUDED.safe_zone_phase, game_match.safe_zone_phase),
         has_begun_play = COALESCE(EXCLUDED.has_begun_play, game_match.has_begun_play),
         total_player_structures = COALESCE(EXCLUDED.total_player_structures, game_match.total_player_structures),
         winning_team = COALESCE(EXCLUDED.winning_team, game_match.winning_team),
         winning_player_ids = COALESCE(EXCLUDED.winning_player_ids, game_match.winning_player_ids),
         aircraft_start_time = COALESCE(EXCLUDED.aircraft_start_time, game_match.aircraft_start_time),
         safe_zones_start_time = COALESCE(EXCLUDED.safe_zones_start_time, game_match.safe_zones_start_time),
         team_stats_position = COALESCE(EXCLUDED.team_stats_position, game_match.team_stats_position),
         team_stats_total_players = COALESCE(EXCLUDED.team_stats_total_players, game_match.team_stats_total_players),
         max_players = COALESCE(EXCLUDED.max_players, game_match.max_players),
         total_teams = COALESCE(EXCLUDED.total_teams, game_match.total_teams),
         total_bots = COALESCE(EXCLUDED.total_bots, game_match.total_bots),
         tournament_round = COALESCE(EXCLUDED.tournament_round, game_match.tournament_round),
         is_large_team_game = COALESCE(EXCLUDED.is_large_team_game, game_match.is_large_team_game),
         team_stats_unknown = COALESCE(EXCLUDED.team_stats_unknown, game_match.team_stats_unknown),
         team_stats_event_id = COALESCE(EXCLUDED.team_stats_event_id, game_match.team_stats_event_id),
         team_stats_event_group = COALESCE(EXCLUDED.team_stats_event_group, game_match.team_stats_event_group),
         team_stats_event_metadata = COALESCE(EXCLUDED.team_stats_event_metadata, game_match.team_stats_event_metadata),
         team_stats_event_start_time = COALESCE(EXCLUDED.team_stats_event_start_time, game_match.team_stats_event_start_time),
         team_stats_event_end_time = COALESCE(EXCLUDED.team_stats_event_end_time, game_match.team_stats_event_end_time),
         team_stats_event_size_in_bytes = COALESCE(EXCLUDED.team_stats_event_size_in_bytes, game_match.team_stats_event_size_in_bytes),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [
        identityKey, game.gameSessionId ?? null, match.replayTimestamp ?? null,
        match.replayLengthInMilliseconds ?? null, match.replayBranch ?? null,
        game.utcTimeStartedMatch ?? null, game.matchEndTime ?? null,
        game.currentPlaylist ?? null, game.mapInfo ?? null,
        game.additionalPlaylistLevels ?? null, game.activeGameplayModifiers ?? null,
        game.recorderId ?? null, game.teamCount ?? null, game.teamSize ?? null,
        game.playerBotsLeft ?? null, game.playersLeft ?? null, game.teamsLeft ?? null,
        game.elapsedTime ?? null, game.gamePhase ?? null, game.safeZonePhase ?? null,
        game.hasBegunPlay ?? null, game.totalPlayerStructures ?? null,
        game.winningTeam ?? null, game.winningPlayerIds ?? null,
        game.aircraftStartTime ?? null, game.safeZonesStartTime ?? null,
        stats.position ?? null, stats.totalPlayers ?? null,
        game.maxPlayers ?? null, game.totalTeams ?? null, game.totalBots ?? null,
        game.tournamentRound ?? null, game.isLargeTeamGame ?? null,
        stats.unknown ?? null, stats.info?.id ?? null, stats.info?.group ?? null,
        stats.info?.metadata ?? null, stats.info?.startTime ?? null,
        stats.info?.endTime ?? null, stats.info?.sizeInBytes ?? null,
      ],
    );
    const matchId = safeInteger(result.rows[0]?.id, 'match id');
    await this.replaceArray(client, matchId, 'game_state_observation', data.match?.gameData?.gameStateObservations, async (rows) => {
      await insertRows(client, 'game_state_observation', rows.map((row, observationIndex) => ({
        match_id: matchId,
        processing_attempt_id: attemptId,
        observation_index: observationIndex,
        world_time_seconds: row.worldTimeSeconds ?? null,
        replicated_world_time_seconds: row.replicatedWorldTimeSeconds ?? null,
        replicated_world_time_seconds_double: row.replicatedWorldTimeSecondsDouble ?? null,
        has_begun_play: row.hasBegunPlay ?? null,
        team_count: row.teamCount ?? null,
        team_size: row.teamSize ?? null,
        player_bots_left: row.playerBotsLeft ?? null,
        players_left: row.playersLeft ?? null,
        teams_left: row.teamsLeft ?? null,
        elapsed_time: row.elapsedTime ?? null,
        game_phase: row.gamePhase ?? null,
        safe_zone_phase: row.safeZonePhase ?? null,
      })), [
        'match_id bigint', 'processing_attempt_id bigint', 'observation_index integer',
        'world_time_seconds double precision', 'replicated_world_time_seconds real',
        'replicated_world_time_seconds_double double precision', 'has_begun_play boolean',
        'team_count integer', 'team_size integer',
        'player_bots_left integer', 'players_left integer', 'teams_left integer',
        'elapsed_time integer', 'game_phase integer', 'safe_zone_phase smallint',
      ]);
    });
    return matchId;
  }

  private async recordSections(
    client: PoolClient,
    attemptId: number,
    data: ParserReplayData,
  ): Promise<void> {
    const states: Array<[string, unknown, number | null]> = [
      ['match', data.match, data.match && typeof data.match === 'object' ? 1 : null],
      ['players', data.players, Array.isArray(data.players) ? data.players.length : null],
      ['teams', data.teams, Array.isArray(data.teams) ? data.teams.length : null],
      ['eventEliminations', data.eventEliminations, Array.isArray(data.eventEliminations) ? data.eventEliminations.length : null],
      ['killFeed', data.killFeed, Array.isArray(data.killFeed) ? data.killFeed.length : null],
      ['map', data.map, data.map && typeof data.map === 'object' ? 1 : null],
      ['weapons', data.weapons, Array.isArray(data.weapons) ? data.weapons.length : null],
      ['observations', data.observations, data.observations && typeof data.observations === 'object'
        ? observationCount(data.observations) : null],
    ];
    await insertRows(client, 'processing_section', states.map(([section, value, count]) => ({
      processing_attempt_id: attemptId,
      section_name: section,
      value_state: value === undefined ? 'missing' : value === null ? 'null' : 'present',
      item_count: value === undefined || value === null ? null : count ?? 0,
    })), [
      'processing_attempt_id bigint', 'section_name text', 'value_state text', 'item_count integer',
    ], 'ON CONFLICT (processing_attempt_id, section_name) DO UPDATE SET value_state = EXCLUDED.value_state, item_count = EXCLUDED.item_count');
  }

  private async persistPlayers(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    players: ParserReplayData['players'],
  ): Promise<Map<number, number>> {
    const playerIds = new Map<number, number>();
    if (players == null) {
      const current = await client.query(
        `SELECT id, replay_player_id
         FROM fortnite_replay.match_player
         WHERE match_id = $1 AND replay_player_id IS NOT NULL`,
        [matchId],
      );
      for (const row of current.rows) {
        playerIds.set(
          safeInteger(row.replay_player_id, 'replay player id'),
          safeInteger(row.id, 'match player id'),
        );
      }
      return playerIds;
    }
    await client.query('DELETE FROM fortnite_replay.match_player WHERE match_id = $1', [matchId]);
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      const identityId = await this.upsertIdentity(client, player);
      const result = await client.query(
        `INSERT INTO fortnite_replay.match_player
           (match_id, player_identity_id, replay_player_id, parser_player_id, epic_id,
            platform_unique_net_id, bot_id, is_bot, player_name,
            player_name_custom_override, streamer_mode_name, platform, level,
            season_level_ui_display, player_number, team_index, is_party_leader,
            is_replay_owner, is_game_session_owner, has_finished_loading,
            has_started_playing, has_thanked_bus_driver, is_using_streamer_mode,
            is_using_anonymous_mode, disconnected, reboot_counter, placement, kills,
            team_kills, death_cause, death_circumstance, death_location_x,
            death_location_y, death_location_z, death_time, death_time_double,
            current_weapon_actor_id, cosmetics, inventory_id,
            death_location_scale_factor, death_location_bits)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                 $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41)
         RETURNING id`,
        [
          matchId, identityId, player.id ?? null, player.playerId ?? null,
          player.epicId ?? null, player.platformUniqueNetId ?? null, player.botId ?? null,
          player.isBot ?? null, player.playerName ?? null,
          player.playerNameCustomOverride ?? null, player.streamerModeName ?? null,
          player.platform ?? null, player.level ?? null, player.seasonLevelUIDisplay ?? null,
          player.playerNumber ?? null, player.teamIndex ?? null, player.isPartyLeader ?? null,
          player.isReplayOwner ?? null, player.isGameSessionOwner ?? null,
          player.hasFinishedLoading ?? null, player.hasStartedPlaying ?? null,
          player.hasThankedBusDriver ?? null, player.isUsingStreamerMode ?? null,
          player.isUsingAnonymousMode ?? null, player.disconnected ?? null,
          player.rebootCounter ?? null, player.placement ?? null, player.kills ?? null,
          player.teamKills ?? null, player.deathCause ?? null, player.deathCircumstance ?? null,
          player.deathLocation?.x ?? null, player.deathLocation?.y ?? null,
          player.deathLocation?.z ?? null, player.deathTime ?? null,
          player.deathTimeDouble ?? null, player.currentWeapon ?? null,
          player.cosmetics == null ? null : JSON.stringify(player.cosmetics),
          player.inventoryId ?? null, player.deathLocation?.scaleFactor ?? null,
          player.deathLocation?.bits ?? null,
        ],
      );
      const matchPlayerId = safeInteger(result.rows[0]?.id, 'match player id');
      if (player.id !== undefined && player.id !== null) playerIds.set(player.id, matchPlayerId);
      await insertRows(client, 'match_player_death_tag', (player.deathTags ?? []).map((tag, tagIndex) => ({
        match_player_id: matchPlayerId,
        tag_index: tagIndex,
        tag,
      })), ['match_player_id bigint', 'tag_index integer', 'tag text']);
      const movements = (player.locations ?? []).map((sample, sampleIndex) => ({
        match_id: matchId,
        match_player_id: matchPlayerId,
        processing_attempt_id: attemptId,
        sample_key: digest(`${index}:${sampleIndex}:${stableSerialize(sample)}`),
        pawn_actor_id: sample.pawnActorId ?? null,
        replicated_world_time_seconds: sample.replicatedWorldTimeSeconds ?? null,
        replicated_world_time_seconds_double: sample.replicatedWorldTimeSecondsDouble ?? null,
        last_update_time: sample.lastUpdateTime ?? null,
        location_x: sample.replicatedMovement?.location?.x ?? null,
        location_y: sample.replicatedMovement?.location?.y ?? null,
        location_z: sample.replicatedMovement?.location?.z ?? null,
        rotation_pitch: sample.replicatedMovement?.rotation?.pitch ?? null,
        rotation_yaw: sample.replicatedMovement?.rotation?.yaw ?? null,
        rotation_roll: sample.replicatedMovement?.rotation?.roll ?? null,
        linear_velocity_x: sample.replicatedMovement?.linearVelocity?.x ?? null,
        linear_velocity_y: sample.replicatedMovement?.linearVelocity?.y ?? null,
        linear_velocity_z: sample.replicatedMovement?.linearVelocity?.z ?? null,
        angular_velocity_x: sample.replicatedMovement?.angularVelocity?.x ?? null,
        angular_velocity_y: sample.replicatedMovement?.angularVelocity?.y ?? null,
        angular_velocity_z: sample.replicatedMovement?.angularVelocity?.z ?? null,
        acceleration_x: sample.replicatedMovement?.acceleration?.x ?? null,
        acceleration_y: sample.replicatedMovement?.acceleration?.y ?? null,
        acceleration_z: sample.replicatedMovement?.acceleration?.z ?? null,
        is_simulated_physics_sleep: sample.replicatedMovement?.bSimulatedPhysicSleep ?? null,
        is_replicating_physics: sample.replicatedMovement?.bRepPhysics ?? null,
        is_replicating_acceleration: sample.replicatedMovement?.bRepAcceleration ?? null,
        server_frame: sample.replicatedMovement?.serverFrame ?? null,
        b_rep_movement_handle: sample.replicatedMovement?.handle ?? null,
        location_quantization_level: sample.replicatedMovement?.locationQuantizationLevel ?? null,
        velocity_quantization_level: sample.replicatedMovement?.velocityQuantizationLevel ?? null,
        rotation_quantization_level: sample.replicatedMovement?.rotationQuantizationLevel ?? null,
        replicated_movement_mode: sample.replicatedMovementMode ?? null,
        current_movement_style: sample.currentMovementStyle ?? null,
        is_sprinting: sample.bIsSprinting ?? null,
        is_jumping: sample.bIsJumping ?? null,
        is_crouched: sample.bIsCrouched ?? null,
        is_slope_sliding: sample.bIsSlopeSliding ?? null,
        is_ziplining: sample.bIsZiplining ?? null,
        is_targeting: sample.bIsTargeting ?? null,
        is_dbno: sample.bIsDBNO ?? null,
        is_honking: sample.bIsHonking ?? null,
        is_in_any_storm: sample.bIsInAnyStorm ?? null,
        is_waiting_for_emote_interaction: sample.bIsWaitingForEmoteInteraction ?? null,
        is_playing_emote: sample.bIsPlayingEmote ?? null,
        is_skydiving: sample.bIsSkydiving ?? null,
        is_skydiving_from_launch_pad: sample.bIsSkydivingFromLaunchPad ?? null,
        is_skydiving_from_bus: sample.bIsSkydivingFromBus ?? null,
        is_parachute_open: sample.bIsParachuteOpen ?? null,
        is_parachute_forced_open: sample.bIsParachuteForcedOpen ?? null,
        is_in_water_volume: sample.bIsInWaterVolume ?? null,
        vehicle_actor_id: sample.vehicle ?? null,
        vehicle_path: sample.vehiclePath ?? null,
        seat_index: sample.seatIndex ?? null,
      }));
      await insertRows(client, 'movement_sample', movements, [
        'match_id bigint', 'match_player_id bigint', 'processing_attempt_id bigint', 'sample_key char(64)',
        'pawn_actor_id bigint', 'replicated_world_time_seconds real',
        'replicated_world_time_seconds_double double precision', 'last_update_time real',
        'location_x double precision', 'location_y double precision', 'location_z double precision',
        'rotation_pitch double precision', 'rotation_yaw double precision', 'rotation_roll double precision',
        'linear_velocity_x double precision', 'linear_velocity_y double precision', 'linear_velocity_z double precision',
        'angular_velocity_x double precision', 'angular_velocity_y double precision', 'angular_velocity_z double precision',
        'acceleration_x double precision', 'acceleration_y double precision', 'acceleration_z double precision',
        'is_simulated_physics_sleep boolean', 'is_replicating_physics boolean',
        'is_replicating_acceleration boolean', 'server_frame bigint', 'b_rep_movement_handle bigint',
        'location_quantization_level integer', 'velocity_quantization_level integer',
        'rotation_quantization_level integer', 'replicated_movement_mode integer',
        'current_movement_style integer', 'is_sprinting boolean', 'is_jumping boolean',
        'is_crouched boolean', 'is_slope_sliding boolean', 'is_ziplining boolean',
        'is_targeting boolean', 'is_dbno boolean', 'is_honking boolean', 'is_in_any_storm boolean',
        'is_waiting_for_emote_interaction boolean', 'is_playing_emote boolean', 'is_skydiving boolean',
        'is_skydiving_from_launch_pad boolean', 'is_skydiving_from_bus boolean',
        'is_parachute_open boolean', 'is_parachute_forced_open boolean', 'is_in_water_volume boolean',
        'vehicle_actor_id bigint', 'vehicle_path text', 'seat_index smallint',
      ]);
    }
    return playerIds;
  }

  private async upsertIdentity(
    client: PoolClient,
    player: NonNullable<ParserReplayData['players']>[number],
  ): Promise<number | null> {
    const identities = [
      player.epicId ? `epic:${player.epicId}` : null,
      player.botId ? `bot:${player.botId}` : null,
      player.platformUniqueNetId ? `platform:${player.platformUniqueNetId}` : null,
    ].filter((value): value is string => value !== null).sort();
    if (identities.length === 0) return null;
    for (const identity of identities) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity]);
    }
    const existing = await client.query(
      `SELECT id FROM fortnite_replay.player_identity
       WHERE ($1::text IS NOT NULL AND epic_id = $1)
          OR ($2::text IS NOT NULL AND bot_id = $2)
          OR ($3::text IS NOT NULL AND platform_unique_net_id = $3)
       FOR UPDATE`,
      [player.epicId ?? null, player.botId ?? null, player.platformUniqueNetId ?? null],
    );
    if (existing.rows.length > 1) {
      throw new Error('Player identifiers resolve to multiple existing global identities.');
    }
    if (existing.rows[0]) {
      const updated = await client.query(
        `UPDATE fortnite_replay.player_identity
         SET epic_id = COALESCE(epic_id, $2),
             bot_id = COALESCE(bot_id, $3),
             platform_unique_net_id = COALESCE(platform_unique_net_id, $4),
             latest_player_name = COALESCE($5, latest_player_name),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING id`,
        [
          existing.rows[0].id, player.epicId ?? null, player.botId ?? null,
          player.platformUniqueNetId ?? null, player.playerName ?? null,
        ],
      );
      return safeInteger(updated.rows[0]?.id, 'player identity id');
    }
    const inserted = await client.query(
      `INSERT INTO fortnite_replay.player_identity
         (epic_id, bot_id, platform_unique_net_id, latest_player_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        player.epicId ?? null, player.botId ?? null,
        player.platformUniqueNetId ?? null, player.playerName ?? null,
      ],
    );
    return safeInteger(inserted.rows[0]?.id, 'player identity id');
  }

  private async persistStats(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    match: ParserReplayData['match'],
  ): Promise<void> {
    const stats = match?.stats;
    if (stats == null) return;
    await client.query(
      `INSERT INTO fortnite_replay.match_stats
         (match_id, processing_attempt_id, total_traveled, accuracy, unknown_value,
          assists, eliminations, weapon_damage, other_damage, revives, damage_taken,
          damage_to_structures, materials_gathered, materials_used,
          event_id, event_group, event_metadata, event_start_time, event_end_time, event_size_in_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (match_id) DO UPDATE SET
         processing_attempt_id = EXCLUDED.processing_attempt_id,
         total_traveled = COALESCE(EXCLUDED.total_traveled, match_stats.total_traveled),
         accuracy = COALESCE(EXCLUDED.accuracy, match_stats.accuracy),
         unknown_value = COALESCE(EXCLUDED.unknown_value, match_stats.unknown_value),
         assists = COALESCE(EXCLUDED.assists, match_stats.assists),
         eliminations = COALESCE(EXCLUDED.eliminations, match_stats.eliminations),
         weapon_damage = COALESCE(EXCLUDED.weapon_damage, match_stats.weapon_damage),
         other_damage = COALESCE(EXCLUDED.other_damage, match_stats.other_damage),
         revives = COALESCE(EXCLUDED.revives, match_stats.revives),
         damage_taken = COALESCE(EXCLUDED.damage_taken, match_stats.damage_taken),
         damage_to_structures = COALESCE(EXCLUDED.damage_to_structures, match_stats.damage_to_structures),
         materials_gathered = COALESCE(EXCLUDED.materials_gathered, match_stats.materials_gathered),
         materials_used = COALESCE(EXCLUDED.materials_used, match_stats.materials_used),
         event_id = COALESCE(EXCLUDED.event_id, match_stats.event_id),
         event_group = COALESCE(EXCLUDED.event_group, match_stats.event_group),
         event_metadata = COALESCE(EXCLUDED.event_metadata, match_stats.event_metadata),
         event_start_time = COALESCE(EXCLUDED.event_start_time, match_stats.event_start_time),
         event_end_time = COALESCE(EXCLUDED.event_end_time, match_stats.event_end_time),
         event_size_in_bytes = COALESCE(EXCLUDED.event_size_in_bytes, match_stats.event_size_in_bytes)`,
      [
        matchId, attemptId, stats.totalTraveled ?? null, stats.accuracy ?? null,
        stats.unknown ?? null, stats.assists ?? null, stats.eliminations ?? null,
        stats.weaponDamage ?? null, stats.otherDamage ?? null, stats.revives ?? null,
        stats.damageTaken ?? null, stats.damageToStructures ?? null,
        stats.materialsGathered ?? null, stats.materialsUsed ?? null,
        stats.info?.id ?? null, stats.info?.group ?? null, stats.info?.metadata ?? null,
        stats.info?.startTime ?? null, stats.info?.endTime ?? null, stats.info?.sizeInBytes ?? null,
      ],
    );
  }

  private async persistTeams(
    client: PoolClient,
    matchId: number,
    teams: ParserReplayData['teams'],
    playerIds: Map<number, number>,
  ): Promise<void> {
    if (teams == null) return;
    await client.query('DELETE FROM fortnite_replay.match_team WHERE match_id = $1', [matchId]);
    for (let index = 0; index < teams.length; index += 1) {
      const team = teams[index];
      const inserted = await client.query(
        `INSERT INTO fortnite_replay.match_team
           (match_id, team_index, party_owner_replay_player_id, placement, team_kills)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [matchId, team.teamIndex ?? null, team.partyOwnerId ?? null, team.placement ?? null, team.teamKills ?? null],
      );
      const teamId = safeInteger(inserted.rows[0]?.id, 'team id');
      const members = Math.max(team.playerIds?.length ?? 0, team.playerNames?.length ?? 0);
      const rows = Array.from({ length: members }, (_, memberIndex) => {
        const replayPlayerId = team.playerIds?.[memberIndex] ?? null;
        return {
          team_id: teamId,
          match_id: matchId,
          member_index: memberIndex,
          replay_player_id: replayPlayerId,
          match_player_id: replayPlayerId === null ? null : playerIds.get(replayPlayerId) ?? null,
          player_name: team.playerNames?.[memberIndex] ?? null,
        };
      });
      await insertRows(client, 'match_team_member', rows, [
        'team_id bigint', 'match_id bigint', 'member_index integer',
        'replay_player_id integer', 'match_player_id bigint', 'player_name text',
      ]);
    }
  }

  private async persistEliminations(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    events: ParserReplayData['eventEliminations'],
  ): Promise<void> {
    if (events == null) return;
    await client.query('DELETE FROM fortnite_replay.event_elimination WHERE match_id = $1', [matchId]);
    const rows = events.map((event, eventIndex) => ({
      match_id: matchId,
      processing_attempt_id: attemptId,
      event_index: eventIndex,
      source_event_key: digest(`${eventIndex}:${stableSerialize(event)}`),
      event_id: event.eventInfo?.id ?? null,
      event_group: event.eventInfo?.group ?? null,
      event_metadata: event.eventInfo?.metadata ?? null,
      event_start_time: event.eventInfo?.startTime ?? null,
      event_end_time: event.eventInfo?.endTime ?? null,
      event_size_in_bytes: event.eventInfo?.sizeInBytes ?? null,
      eliminated_id: event.eliminated?.id ?? null,
      eliminated_player_type: typeof event.eliminated?.playerType === 'string' ? event.eliminated.playerType : null,
      eliminated_player_type_code: typeof event.eliminated?.playerType === 'number' ? event.eliminated.playerType : null,
      eliminated_location_x: event.eliminated?.location?.x ?? null,
      eliminated_location_y: event.eliminated?.location?.y ?? null,
      eliminated_location_z: event.eliminated?.location?.z ?? null,
      eliminated_location_scale_factor: event.eliminated?.location?.scaleFactor ?? null,
      eliminated_location_bits: event.eliminated?.location?.bits ?? null,
      eliminated_rotation_x: event.eliminated?.rotation?.x ?? null,
      eliminated_rotation_y: event.eliminated?.rotation?.y ?? null,
      eliminated_rotation_z: event.eliminated?.rotation?.z ?? null,
      eliminated_rotation_w: event.eliminated?.rotation?.w ?? null,
      eliminated_scale_x: event.eliminated?.scale?.x ?? null,
      eliminated_scale_y: event.eliminated?.scale?.y ?? null,
      eliminated_scale_z: event.eliminated?.scale?.z ?? null,
      eliminated_scale_scale_factor: event.eliminated?.scale?.scaleFactor ?? null,
      eliminated_scale_bits: event.eliminated?.scale?.bits ?? null,
      eliminator_id: event.eliminator?.id ?? null,
      eliminator_player_type: typeof event.eliminator?.playerType === 'string' ? event.eliminator.playerType : null,
      eliminator_player_type_code: typeof event.eliminator?.playerType === 'number' ? event.eliminator.playerType : null,
      eliminator_location_x: event.eliminator?.location?.x ?? null,
      eliminator_location_y: event.eliminator?.location?.y ?? null,
      eliminator_location_z: event.eliminator?.location?.z ?? null,
      eliminator_location_scale_factor: event.eliminator?.location?.scaleFactor ?? null,
      eliminator_location_bits: event.eliminator?.location?.bits ?? null,
      eliminator_rotation_x: event.eliminator?.rotation?.x ?? null,
      eliminator_rotation_y: event.eliminator?.rotation?.y ?? null,
      eliminator_rotation_z: event.eliminator?.rotation?.z ?? null,
      eliminator_rotation_w: event.eliminator?.rotation?.w ?? null,
      eliminator_scale_x: event.eliminator?.scale?.x ?? null,
      eliminator_scale_y: event.eliminator?.scale?.y ?? null,
      eliminator_scale_z: event.eliminator?.scale?.z ?? null,
      eliminator_scale_scale_factor: event.eliminator?.scale?.scaleFactor ?? null,
      eliminator_scale_bits: event.eliminator?.scale?.bits ?? null,
      gun_type: event.gunType ?? null,
      knocked: event.knocked ?? null,
      library_distance: event.libraryDistance ?? null,
    }));
    await insertRows(client, 'event_elimination', rows, [
      'match_id bigint', 'processing_attempt_id bigint', 'event_index integer',
      'source_event_key char(64)', 'event_id text', 'event_group text', 'event_metadata text',
      'event_start_time double precision', 'event_end_time double precision',
      'event_size_in_bytes integer', 'eliminated_id text', 'eliminated_player_type text',
      'eliminated_player_type_code integer',
      'eliminated_location_x double precision', 'eliminated_location_y double precision',
      'eliminated_location_z double precision', 'eliminated_location_scale_factor integer',
      'eliminated_location_bits integer', 'eliminated_rotation_x double precision',
      'eliminated_rotation_y double precision', 'eliminated_rotation_z double precision',
      'eliminated_rotation_w double precision', 'eliminated_scale_x double precision',
      'eliminated_scale_y double precision', 'eliminated_scale_z double precision',
      'eliminated_scale_scale_factor integer', 'eliminated_scale_bits integer',
      'eliminator_id text', 'eliminator_player_type text',
      'eliminator_player_type_code integer',
      'eliminator_location_x double precision', 'eliminator_location_y double precision',
      'eliminator_location_z double precision', 'eliminator_location_scale_factor integer',
      'eliminator_location_bits integer', 'eliminator_rotation_x double precision',
      'eliminator_rotation_y double precision', 'eliminator_rotation_z double precision',
      'eliminator_rotation_w double precision', 'eliminator_scale_x double precision',
      'eliminator_scale_y double precision', 'eliminator_scale_z double precision',
      'eliminator_scale_scale_factor integer', 'eliminator_scale_bits integer',
      'gun_type smallint', 'knocked boolean', 'library_distance double precision',
    ]);
  }

  private async persistKillFeed(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    entries: ParserReplayData['killFeed'],
  ): Promise<void> {
    if (entries == null) return;
    await client.query('DELETE FROM fortnite_replay.kill_feed WHERE match_id = $1', [matchId]);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const inserted = await client.query(
        `INSERT INTO fortnite_replay.kill_feed
           (match_id, processing_attempt_id, event_index, source_event_key,
            player_replay_id, player_name, player_is_bot, finisher_or_downer_replay_id,
            finisher_or_downer_name, finisher_or_downer_is_bot,
            replicated_world_time_seconds, replicated_world_time_seconds_double,
            distance, death_cause, death_circumstance, death_location_x,
            death_location_y, death_location_z, is_downed, is_revived,
            death_location_scale_factor, death_location_bits)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING id`,
        [
          matchId, attemptId, index, digest(`${index}:${stableSerialize(entry)}`),
          entry.playerId ?? null, entry.playerName ?? null, entry.playerIsBot ?? null,
          entry.finisherOrDowner ?? null, entry.finisherOrDownerName ?? null,
          entry.finisherOrDownerIsBot ?? null, entry.replicatedWorldTimeSeconds ?? null,
          entry.replicatedWorldTimeSecondsDouble ?? null, entry.distance ?? null,
          entry.deathCause ?? null, entry.deathCircumstance ?? null,
          entry.deathLocation?.x ?? null, entry.deathLocation?.y ?? null,
          entry.deathLocation?.z ?? null, entry.isDowned ?? null, entry.isRevived ?? null,
          entry.deathLocation?.scaleFactor ?? null, entry.deathLocation?.bits ?? null,
        ],
      );
      const id = safeInteger(inserted.rows[0]?.id, 'kill-feed id');
      await insertRows(client, 'kill_feed_death_tag', (entry.deathTags ?? []).map((tag, tagIndex) => ({
        kill_feed_id: id,
        tag_index: tagIndex,
        tag,
      })), ['kill_feed_id bigint', 'tag_index integer', 'tag text']);
    }
  }

  private async persistMap(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    map: ParserReplayData['map'],
  ): Promise<void> {
    if (map == null) return;
    await client.query(
      `INSERT INTO fortnite_replay.map_snapshot
         (match_id, processing_attempt_id, world_grid_start_x, world_grid_start_y,
          world_grid_end_x, world_grid_end_y, world_grid_spacing_x, world_grid_spacing_y,
          world_grid_total_size_x, world_grid_total_size_y, grid_count_x, grid_count_y,
          poi_tag_container_table_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (match_id) DO UPDATE SET
         processing_attempt_id = EXCLUDED.processing_attempt_id,
         world_grid_start_x = COALESCE(EXCLUDED.world_grid_start_x, map_snapshot.world_grid_start_x),
         world_grid_start_y = COALESCE(EXCLUDED.world_grid_start_y, map_snapshot.world_grid_start_y),
         world_grid_end_x = COALESCE(EXCLUDED.world_grid_end_x, map_snapshot.world_grid_end_x),
         world_grid_end_y = COALESCE(EXCLUDED.world_grid_end_y, map_snapshot.world_grid_end_y),
         world_grid_spacing_x = COALESCE(EXCLUDED.world_grid_spacing_x, map_snapshot.world_grid_spacing_x),
         world_grid_spacing_y = COALESCE(EXCLUDED.world_grid_spacing_y, map_snapshot.world_grid_spacing_y),
         world_grid_total_size_x = COALESCE(EXCLUDED.world_grid_total_size_x, map_snapshot.world_grid_total_size_x),
         world_grid_total_size_y = COALESCE(EXCLUDED.world_grid_total_size_y, map_snapshot.world_grid_total_size_y),
         grid_count_x = COALESCE(EXCLUDED.grid_count_x, map_snapshot.grid_count_x),
         grid_count_y = COALESCE(EXCLUDED.grid_count_y, map_snapshot.grid_count_y),
         poi_tag_container_table_size = COALESCE(EXCLUDED.poi_tag_container_table_size, map_snapshot.poi_tag_container_table_size)`,
      [
        matchId, attemptId, map.worldGridStart?.x ?? null, map.worldGridStart?.y ?? null,
        map.worldGridEnd?.x ?? null, map.worldGridEnd?.y ?? null,
        map.worldGridSpacing?.x ?? null, map.worldGridSpacing?.y ?? null,
        map.worldGridTotalSize?.x ?? null, map.worldGridTotalSize?.y ?? null,
        map.gridCountX ?? null, map.gridCountY ?? null, map.poiTagContainerTableSize ?? null,
      ],
    );
    await this.replaceArray(client, matchId, 'map_poi_tag', map.poiTagContainerTable, async (tags) => {
      await insertRows(client, 'map_poi_tag', tags.map((tag, index) => ({
        match_id: matchId, tag_index: index, poi_tag: tag,
      })), ['match_id bigint', 'tag_index integer', 'poi_tag text']);
    });
    await this.replaceArray(client, matchId, 'battle_bus_flight_path', map.battleBusFlightPaths, async (items) => {
      await insertRows(client, 'battle_bus_flight_path', items.map((item, index) => ({
        match_id: matchId, path_index: item.index ?? index,
        start_x: item.start?.x ?? null, start_y: item.start?.y ?? null, start_z: item.start?.z ?? null,
        rotation_pitch: item.rotation?.pitch ?? null, rotation_yaw: item.rotation?.yaw ?? null,
        rotation_roll: item.rotation?.roll ?? null, velocity_x: item.velocity?.x ?? null,
        velocity_y: item.velocity?.y ?? null, velocity_z: item.velocity?.z ?? null,
        flight_time: item.flightTime ?? null, drop_time: item.dropTime ?? null, skin: item.skin ?? null,
      })), [
        'match_id bigint', 'path_index integer', 'start_x double precision',
        'start_y double precision', 'start_z double precision', 'rotation_pitch double precision',
        'rotation_yaw double precision', 'rotation_roll double precision', 'velocity_x double precision',
        'velocity_y double precision', 'velocity_z double precision', 'flight_time double precision',
        'drop_time double precision', 'skin text',
      ]);
    });
    await this.replaceArray(client, matchId, 'map_safe_zone', map.safeZones, async (items) => {
      await insertRows(client, 'map_safe_zone', items.map((item, index) => ({
        match_id: matchId, source_index: index, center_x: item.center?.x ?? null,
        center_y: item.center?.y ?? null, center_z: item.center?.z ?? null, radius: item.radius ?? null,
        start_shrink_time: item.startShrinkTime ?? null, finish_shrink_time: item.finishShrinkTime ?? null,
        last_radius: item.lastRadius ?? null, next_radius: item.nextRadius ?? null,
        next_next_radius: item.nextNextRadius ?? null,
        last_center_x: item.lastCenter?.x ?? null, last_center_y: item.lastCenter?.y ?? null,
        last_center_z: item.lastCenter?.z ?? null, last_center_scale_factor: item.lastCenter?.scaleFactor ?? null,
        last_center_bits: item.lastCenter?.bits ?? null,
        next_center_x: item.nextCenter?.x ?? null, next_center_y: item.nextCenter?.y ?? null,
        next_center_z: item.nextCenter?.z ?? null, next_center_scale_factor: item.nextCenter?.scaleFactor ?? null,
        next_center_bits: item.nextCenter?.bits ?? null,
        next_next_center_x: item.nextNextCenter?.x ?? null, next_next_center_y: item.nextNextCenter?.y ?? null,
        next_next_center_z: item.nextNextCenter?.z ?? null, next_next_center_scale_factor: item.nextNextCenter?.scaleFactor ?? null,
        next_next_center_bits: item.nextNextCenter?.bits ?? null,
      })), [
        'match_id bigint', 'source_index integer', 'center_x double precision', 'center_y double precision',
        'center_z double precision', 'radius double precision', 'start_shrink_time real', 'finish_shrink_time real',
        'last_radius real', 'next_radius real', 'next_next_radius real',
        'last_center_x double precision', 'last_center_y double precision', 'last_center_z double precision',
        'last_center_scale_factor integer', 'last_center_bits integer',
        'next_center_x double precision', 'next_center_y double precision', 'next_center_z double precision',
        'next_center_scale_factor integer', 'next_center_bits integer',
        'next_next_center_x double precision', 'next_next_center_y double precision', 'next_next_center_z double precision',
        'next_next_center_scale_factor integer', 'next_next_center_bits integer',
      ]);
    });
    await this.replaceArray(client, matchId, 'map_llama', map.llamas, async (items) => {
      await insertRows(client, 'map_llama', items.map((item) => ({
        match_id: matchId, source_actor_key: null, position_x: item.position?.x ?? null,
        position_y: item.position?.y ?? null, position_z: item.position?.z ?? null,
        destination_x: item.destination?.x ?? null, destination_y: item.destination?.y ?? null,
        destination_z: item.destination?.z ?? null, looted: item.looted ?? null,
      })), ['match_id bigint', 'source_actor_key text', 'position_x double precision', 'position_y double precision', 'position_z double precision', 'destination_x double precision', 'destination_y double precision', 'destination_z double precision', 'looted boolean']);
    });
    await this.replaceArray(client, matchId, 'map_supply_drop', map.supplyDrops, async (items) => {
      await insertRows(client, 'map_supply_drop', items.map((item) => ({
        match_id: matchId, source_actor_key: null,
        landing_x: item.landingPosition?.x ?? null, landing_y: item.landingPosition?.y ?? null,
        landing_z: item.landingPosition?.z ?? null, fall_x: item.fallPosition?.x ?? null,
        fall_y: item.fallPosition?.y ?? null, fall_z: item.fallPosition?.z ?? null,
        balloon_x: item.balloonPosition?.x ?? null, balloon_y: item.balloonPosition?.y ?? null,
        balloon_z: item.balloonPosition?.z ?? null, looted: item.looted ?? null,
      })), ['match_id bigint', 'source_actor_key text', 'landing_x double precision', 'landing_y double precision', 'landing_z double precision', 'fall_x double precision', 'fall_y double precision', 'fall_z double precision', 'balloon_x double precision', 'balloon_y double precision', 'balloon_z double precision', 'looted boolean']);
    });
    await this.replaceArray(client, matchId, 'map_reboot_van', map.rebootVans, async (items) => {
      await insertRows(client, 'map_reboot_van', items.map((item) => ({
        match_id: matchId, source_actor_key: item.guid ?? null, actor_guid: item.guid ?? null,
        actor_handle: item.handle ?? null, location_x: item.location?.x ?? null,
        location_y: item.location?.y ?? null, location_z: item.location?.z ?? null,
        state: item.state ?? null,
      })), ['match_id bigint', 'source_actor_key text', 'actor_guid text', 'actor_handle bigint', 'location_x double precision', 'location_y double precision', 'location_z double precision', 'state integer']);
    });
  }

  private async persistWeapons(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    weapons: ParserReplayData['weapons'],
  ): Promise<void> {
    if (weapons == null) return;
    await client.query('DELETE FROM fortnite_replay.weapon_observation WHERE match_id = $1', [matchId]);
    await insertRows(client, 'weapon_observation', weapons.map((item) => ({
      match_id: matchId, processing_attempt_id: attemptId, actor_id: item.actorId ?? null,
      weapon_name: item.weaponName ?? null, ammo_count: item.ammoCount ?? null,
      weapon_level: item.weaponLevel ?? null, last_fire_time_verified: item.lastFireTimeVerified ?? null,
      is_equipping_weapon: item.bIsEquippingWeapon ?? null,
      is_reloading_weapon: item.bIsReloadingWeapon ?? null,
      value_a: item.a ?? item.A ?? null, value_b: item.b ?? item.B ?? null,
      value_c: item.c ?? item.C ?? null, value_d: item.d ?? item.D ?? null,
    })), [
      'match_id bigint', 'processing_attempt_id bigint', 'actor_id bigint',
      'weapon_name text', 'ammo_count integer', 'weapon_level integer',
      'last_fire_time_verified real', 'is_equipping_weapon boolean', 'is_reloading_weapon boolean',
      'value_a bigint', 'value_b bigint', 'value_c bigint', 'value_d bigint',
    ]);
  }

  private async persistObservations(
    client: PoolClient,
    matchId: number,
    attemptId: number,
    observations: ParserReplayData['observations'],
    normalizationMetrics?: ContainerNormalizationMetrics,
  ): Promise<ContainerPersistenceMetrics> {
    let containerInsertCount = 0;
    const observedData = observations ?? {};
    const containerEvents = observedData.containerInteractions;
    await this.replaceArray(client, matchId, 'equipped_item_observation', observedData.equippedItems, async (items) => {
      await insertRows(client, 'equipped_item_observation', items.map((item, index) => ({
        match_id: matchId, processing_attempt_id: attemptId, observation_index: index,
        time_seconds: item.timeSeconds ?? null, item_name: item.item ?? item.name ?? null,
        pawn_actor_id: item.pawnActorId ?? null, player_replay_id: item.playerId ?? null,
      })), ['match_id bigint', 'processing_attempt_id bigint', 'observation_index integer', 'time_seconds double precision', 'item_name text', 'pawn_actor_id bigint', 'player_replay_id integer']);
    });
    await this.replaceArray(client, matchId, 'container_interaction', observedData.containerInteractions, async (items) => {
      containerInsertCount = await insertRows(client, 'container_interaction', items.map((item, index) => ({
        match_id: matchId, processing_attempt_id: attemptId, observation_index: index,
        source_actor_key: item.sourceActorKey ?? null,
        container_label: item.containerLabel ?? null,
        interaction_kind: null,
        time_seconds: item.timeSeconds ?? null,
        searching_pawn_actor_id: item.searchingPawnActorId ?? null,
        searching_player_state_actor_id: item.searchingPlayerStateActorId ?? null,
        searching_player_replay_id: item.searchingPlayerId ?? null,
        already_searched: item.alreadySearched ?? null,
        search_animation_count: item.searchAnimationCount ?? null,
        destroyed: item.destroyed ?? null,
      })), [
        'match_id bigint', 'processing_attempt_id bigint', 'observation_index integer',
        'source_actor_key text', 'container_label text', 'interaction_kind text',
        'time_seconds double precision', 'searching_pawn_actor_id bigint',
        'searching_player_state_actor_id bigint', 'searching_player_replay_id integer',
        'already_searched boolean', 'search_animation_count bigint', 'destroyed boolean',
      ]);
    });
    await this.replaceArray(client, matchId, 'dropped_item_observation', observedData.droppedItems, async (items) => {
      await insertRows(client, 'dropped_item_observation', items.map((item, index) => ({
        match_id: matchId, processing_attempt_id: attemptId, observation_index: index,
        time_seconds: item.timeSeconds ?? null, item: item.item ?? null,
        item_definition_actor_id: item.itemDefinitionActorId ?? null,
        item_definition_path: item.itemDefinitionPath ?? null, item_count: item.count ?? null,
        durability: item.durability ?? null, level: item.level ?? null,
        loaded_ammo: item.loadedAmmo ?? null, order_index: item.orderIndex ?? null,
        item_owner: item.itemOwner ?? null, pawn_who_dropped_pickup: item.pawnWhoDroppedPickup ?? null,
        owner: item.owner ?? null, dropped_by_player_replay_id: item.droppedByPlayerId ?? null,
        replicated_location_x: item.replicatedLocation?.x ?? null,
        replicated_location_y: item.replicatedLocation?.y ?? null,
        replicated_location_z: item.replicatedLocation?.z ?? null,
        replicated_location_scale_factor: item.replicatedLocation?.scaleFactor ?? null,
        replicated_location_bits: item.replicatedLocation?.bits ?? null,
        loot_initial_position_x: item.lootInitialPosition?.x ?? null,
        loot_initial_position_y: item.lootInitialPosition?.y ?? null,
        loot_initial_position_z: item.lootInitialPosition?.z ?? null,
        loot_initial_position_scale_factor: item.lootInitialPosition?.scaleFactor ?? null,
        loot_initial_position_bits: item.lootInitialPosition?.bits ?? null,
        loot_final_position_x: item.lootFinalPosition?.x ?? null,
        loot_final_position_y: item.lootFinalPosition?.y ?? null,
        loot_final_position_z: item.lootFinalPosition?.z ?? null,
        loot_final_position_scale_factor: item.lootFinalPosition?.scaleFactor ?? null,
        loot_final_position_bits: item.lootFinalPosition?.bits ?? null,
        final_toss_rest_location_x: item.finalTossRestLocation?.x ?? null,
        final_toss_rest_location_y: item.finalTossRestLocation?.y ?? null,
        final_toss_rest_location_z: item.finalTossRestLocation?.z ?? null,
        final_toss_rest_location_scale_factor: item.finalTossRestLocation?.scaleFactor ?? null,
        final_toss_rest_location_bits: item.finalTossRestLocation?.bits ?? null,
        fly_time: item.flyTime ?? null, toss_state: item.tossState ?? null,
        picked_up: item.pickedUp ?? null,
      })), [
        'match_id bigint', 'processing_attempt_id bigint', 'observation_index integer',
        'time_seconds double precision', 'item text', 'item_definition_actor_id bigint',
        'item_definition_path text', 'item_count integer', 'durability double precision',
        'level integer', 'loaded_ammo integer', 'order_index integer', 'item_owner bigint',
        'pawn_who_dropped_pickup bigint', 'owner bigint', 'dropped_by_player_replay_id integer',
        'replicated_location_x double precision', 'replicated_location_y double precision',
        'replicated_location_z double precision', 'loot_initial_position_x double precision',
        'replicated_location_scale_factor integer', 'replicated_location_bits integer',
        'loot_initial_position_y double precision', 'loot_initial_position_z double precision',
        'loot_initial_position_scale_factor integer', 'loot_initial_position_bits integer',
        'loot_final_position_x double precision', 'loot_final_position_y double precision',
        'loot_final_position_z double precision', 'final_toss_rest_location_x double precision',
        'loot_final_position_scale_factor integer', 'loot_final_position_bits integer',
        'final_toss_rest_location_y double precision', 'final_toss_rest_location_z double precision',
        'final_toss_rest_location_scale_factor integer', 'final_toss_rest_location_bits integer',
        'fly_time double precision', 'toss_state integer', 'picked_up boolean',
      ]);
    });
    await this.replaceArray(client, matchId, 'treasure_event', observedData.treasureEvents, async (items) => {
      await insertRows(client, 'treasure_event', items.map((item, index) => ({
        match_id: matchId, processing_attempt_id: attemptId, observation_index: index,
        time_seconds: item.timeSeconds ?? null, prize_id: item.prizeId ?? null,
        pawn_actor_id: item.pawnActorId ?? null, player_replay_id: item.playerId ?? null,
        source_container: item.sourceContainer ?? null,
      })), ['match_id bigint', 'processing_attempt_id bigint', 'observation_index integer', 'time_seconds double precision', 'prize_id text', 'pawn_actor_id bigint', 'player_replay_id integer', 'source_container text']);
    });
    await this.replaceArray(client, matchId, 'prize_handler_grant', observedData.prizeHandlerGrants, async (items) => {
      await insertRows(client, 'prize_handler_grant', items.map((item, index) => ({
        match_id: matchId, processing_attempt_id: attemptId, observation_index: index,
        handler: item.handler ?? null, time_seconds: item.time ?? null,
        player_state_actor_id: item.playerState ?? null, player_replay_id: item.playerId ?? null,
      })), ['match_id bigint', 'processing_attempt_id bigint', 'observation_index integer', 'handler text', 'time_seconds double precision', 'player_state_actor_id bigint', 'player_replay_id integer']);
    });
    const countResult = await client.query(
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
    );
    const counts = countResult.rows[0] as Record<string, unknown> | undefined;
    if (!counts) throw new Error('Container persistence metrics were not returned.');
    const persisted = safeInteger(counts.persisted, 'persisted container count');
    if (persisted !== containerInsertCount) {
      throw new Error('Persisted container count does not match the inserted row count.');
    }
    const detected = normalizationMetrics?.detected ?? containerEvents?.length ?? 0;
    const valid = normalizationMetrics?.valid ?? containerEvents?.length ?? 0;
    return {
      provided: normalizationMetrics?.provided ?? (containerEvents !== undefined),
      detected,
      valid,
      rejected: normalizationMetrics?.rejected ?? Math.max(0, detected - valid),
      exactDuplicates: normalizationMetrics?.exactDuplicates ?? 0,
      fieldIssues: normalizationMetrics?.fieldIssues ?? 0,
      persisted,
      playerLinked: safeInteger(counts.player_linked, 'player-linked container count'),
      playerUnidentified: safeInteger(counts.player_unidentified, 'unidentified container count'),
      playerUnmatched: safeInteger(counts.player_unmatched, 'unmatched player count'),
      rejectionSamples: normalizationMetrics?.rejectionSamples ?? [],
    };
  }

  private async replaceArray<T>(
    client: PoolClient,
    matchId: number,
    table: string,
    rows: T[] | null | undefined,
    persist: (rows: T[]) => Promise<void>,
  ): Promise<void> {
    if (rows == null) return;
    await client.query(`DELETE FROM fortnite_replay.${table} WHERE match_id = $1`, [matchId]);
    await persist(rows);
  }

  private async loadAttempt(client: PoolClient, id: number): Promise<ReplayProcessingAttempt> {
    const result = await client.query(
      `SELECT ${ATTEMPT_SELECT} FROM fortnite_replay.processing_attempt WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]) throw new Error('Replay attempt could not be reloaded.');
    return mapAttempt(result.rows[0]);
  }
}

async function insertRows(
  client: PoolClient,
  table: string,
  rows: Array<Record<string, unknown>>,
  definitions: string[],
  conflictClause = '',
): Promise<number> {
  if (rows.length === 0) return 0;
  const columns = definitions.map((definition) => definition.split(' ')[0]);
  const columnList = columns.join(', ');
  const selection = columns.map((column) => `source.${column}`).join(', ');
  const result = await client.query(
    `INSERT INTO fortnite_replay.${table} (${columnList})
     SELECT ${selection}
     FROM jsonb_to_recordset($1::jsonb) AS source(${definitions.join(', ')})
     ${conflictClause}`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
}

function mapReplayFile(row: Record<string, unknown>): ListReplayFiles200Response['data'][number] {
  return {
    file_sha256: String(row.file_sha256).trim(),
    first_registered_at: timestamp(row.first_registered_at),
    application_ids: Array.isArray(row.application_ids) ? row.application_ids.map(String) : [],
    latest_received_at: nullableTimestamp(row.latest_received_at),
    processing_attempt_count: safeInteger(row.processing_attempt_count, 'processing attempt count'),
  };
}

function mapAttempt(row: Record<string, unknown>): ReplayProcessingAttempt {
  return {
    id: safeInteger(row.id, 'attempt id'),
    file_sha256: String(row.file_sha256).trim(),
    application_id: String(row.application_id),
    idempotency_key: String(row.idempotency_key),
    request_sha256: String(row.request_sha256).trim(),
    payload_sha256: row.payload_sha256 === null ? null : String(row.payload_sha256).trim(),
    analyzer_version: nullableString(row.analyzer_version),
    application_version: nullableString(row.application_version),
    parser_name: nullableString(row.parser_name),
    parser_version: nullableString(row.parser_version),
    parse_mode: row.parse_mode === null
      ? null : String(row.parse_mode) as ReplayProcessingAttempt.ParseModeEnum,
    status: String(row.status) as ReplayProcessingAttempt.StatusEnum,
    error_code: nullableString(row.error_code),
    error_message: nullableString(row.error_message),
    received_at: timestamp(row.received_at),
    started_at: nullableTimestamp(row.started_at),
    completed_at: nullableTimestamp(row.completed_at),
  };
}

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function observationCount(data: NonNullable<ParserReplayData['observations']>): number {
  return [
    data.equippedItems, data.containerInteractions, data.droppedItems,
    data.treasureEvents, data.prizeHandlerGrants,
  ].reduce((total, items) => total + (items?.length ?? 0), 0);
}

function safeInteger(value: unknown, label: string): number {
  const converted = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new RangeError(`${label} is outside the safe integer range.`);
  }
  return converted;
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid database timestamp.');
  return date.toISOString();
}

function nullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : timestamp(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function rollback(client: PoolClient): Promise<Error | undefined> {
  try {
    await client.query('ROLLBACK');
    return undefined;
  } catch (error) {
    logReplayError('transaction_rollback', undefined, undefined, error);
    return error instanceof Error ? error : new Error('Transaction rollback failed.');
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
