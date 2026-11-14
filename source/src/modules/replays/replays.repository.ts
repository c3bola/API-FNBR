import { PoolClient } from 'pg';
import {
  AnalyzerVersion,
  ReplayFile,
  ReplayFileRegistration,
  ReplayIngestionRequest,
  ReplayProcessingAttempt,
} from '../../generated/v1/models';
import { pool } from '../../infra/database/postgres.config';
import { logReplayError, ReplayConflictError, ReplayNotFoundError } from './replays.errors';

export interface ReplayFileRegistrationOutcome {
  file: ReplayFile;
  created: boolean;
}

export type ReplayAttemptOutcomeKind = 'created' | 'replayed' | 'processing' | 'failed';

export interface ReplayAttemptOutcome {
  attempt: ReplayProcessingAttempt;
  outcome: ReplayAttemptOutcomeKind;
}

const SAFE_FAILURE_MESSAGE = 'Replay ingestion failed.';

const FILE_COLUMNS = `
  id_replay_file, file_sha256, fk_id_match, fk_id_successful_attempt,
  file_size_bytes, file_created_at, created_at, file_name
`;

const ATTEMPT_COLUMNS = `
  a.id_attempt, a.started_at, a.completed_at, a.status, a.idempotency_key,
  a.error_message, a.request_sha256, v.id_analyzer_version,
  v.created_at AS analyzer_created_at,
  v.application_version, v.analyzer_version, v.parser_name, v.parser_version,
  v.description AS analyzer_description
`;

export class ReplaysRepository {
  async registerFile(input: ReplayFileRegistration): Promise<ReplayFileRegistrationOutcome> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO fortnite_replay.tb_replay_file
           (file_sha256, file_name, file_size_bytes, file_created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (file_sha256) DO NOTHING
         RETURNING ${FILE_COLUMNS}`,
        [
          input.fileSha256,
          input.fileName,
          input.fileSizeBytes ?? null,
          input.fileCreatedAt ?? null,
        ],
      );

      const row = inserted.rows[0] ?? (await client.query(
        `SELECT ${FILE_COLUMNS}
         FROM fortnite_replay.tb_replay_file
         WHERE file_sha256 = $1
         FOR UPDATE`,
        [input.fileSha256],
      )).rows[0];

      if (!row) {
        throw new ReplayConflictError('Replay file registration could not be resolved.');
      }

      if (!inserted.rows[0] && !sameFileMetadata(row, input)) {
        throw new ReplayConflictError('A Replay file with this SHA-256 is already registered with different metadata.');
      }

      await client.query('COMMIT');
      return { file: mapFile(row), created: inserted.rows.length > 0 };
    } catch (error) {
      await rollbackQuietly(client);
      if (isUniqueViolation(error)) {
        throw new ReplayConflictError('Replay file registration conflicts with an existing record.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listFiles(sha256?: string, matchId?: number): Promise<ReplayFile[]> {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (sha256 !== undefined) {
      values.push(sha256);
      conditions.push(`file_sha256 = $${values.length}`);
    }
    if (matchId !== undefined) {
      values.push(matchId);
      conditions.push(`fk_id_match = $${values.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT ${FILE_COLUMNS}
       FROM fortnite_replay.tb_replay_file
       ${where}
       ORDER BY created_at DESC, id_replay_file DESC`,
      values,
    );
    return result.rows.map(mapFile);
  }

  async getFile(sha256: string): Promise<ReplayFile> {
    const result = await pool.query(
      `SELECT ${FILE_COLUMNS}
       FROM fortnite_replay.tb_replay_file
       WHERE file_sha256 = $1`,
      [sha256],
    );
    if (result.rows.length === 0) {
      throw new ReplayNotFoundError('Replay file was not registered.');
    }
    return mapFile(result.rows[0]);
  }

  async listAttempts(sha256: string): Promise<ReplayProcessingAttempt[]> {
    const file = await pool.query(
      `SELECT id_replay_file
       FROM fortnite_replay.tb_replay_file
       WHERE file_sha256 = $1`,
      [sha256],
    );
    if (file.rows.length === 0) {
      throw new ReplayNotFoundError('Replay file was not registered.');
    }
    const result = await pool.query(
      `SELECT ${ATTEMPT_COLUMNS}
       FROM fortnite_replay.tb_replay_processing_attempt AS a
       JOIN fortnite_replay.tb_analyzer_version AS v
         ON v.id_analyzer_version = a.fk_id_analyzer_version
       WHERE a.fk_id_replay_file = $1
       ORDER BY a.started_at DESC, a.id_attempt DESC`,
      [file.rows[0].id_replay_file],
    );
    return result.rows.map(mapAttempt);
  }

  async ingest(
    fileSha256: string,
    input: ReplayIngestionRequest,
    requestSha256: string,
  ): Promise<ReplayAttemptOutcome> {
    let replayFileId: number;
    let attemptId: number | undefined;
    let isNewAttempt = false;
    let resumeExistingAttempt = false;
    let discardClient: Error | undefined;
    const lockedAttemptIds: number[] = [];
    const trace = createIngestionTrace(fileSha256, () => attemptId);
    trace.start('connection');
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (error) {
      trace.fail(error);
      throw error;
    }

    try {
      trace.start('attempt_transaction_begin');
      await client.query('BEGIN');
      trace.start('file_lookup');
      const fileResult = await client.query(
        `SELECT id_replay_file
         FROM fortnite_replay.tb_replay_file
         WHERE file_sha256 = $1
         FOR UPDATE`,
        [fileSha256],
      );
      if (fileResult.rows.length === 0) {
        throw new ReplayNotFoundError('Replay file was not registered.');
      }
      replayFileId = safeInteger(fileResult.rows[0].id_replay_file, 'replay file id');

      trace.start('attempt_lookup');
      const existingResult = await client.query(
        `SELECT ${ATTEMPT_COLUMNS}
         FROM fortnite_replay.tb_replay_processing_attempt AS a
         JOIN fortnite_replay.tb_analyzer_version AS v
           ON v.id_analyzer_version = a.fk_id_analyzer_version
         WHERE a.fk_id_replay_file = $1
           AND a.idempotency_key = $2`,
        [replayFileId, input.idempotencyKey],
      );
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        if (existing.request_sha256 !== requestSha256) {
          throw new ReplayConflictError('Idempotency key was already used for a different request.');
        }
        attemptId = safeInteger(existing.id_attempt, 'attempt id');
        if (existing.status === 'processing') {
          trace.start('attempt_lock');
          if (!await this.tryAcquireAttemptLock(client, attemptId)) {
            trace.start('attempt_transaction_commit');
            await client.query('COMMIT');
            trace.finish();
            client.release();
            return { attempt: mapAttempt(existing), outcome: 'processing' };
          }
          lockedAttemptIds.push(attemptId);
          const current = await this.loadAttemptRow(client, attemptId, true);
          if (current.status !== 'processing') {
            trace.start('attempt_transaction_commit');
            await client.query('COMMIT');
            trace.finish();
            const attempt = mapAttempt(current);
            const releaseError = await this.releaseAttemptLocks(client, lockedAttemptIds, fileSha256);
            client.release(releaseError);
            return { attempt, outcome: attemptOutcomeForStatus(attempt.status, false) };
          }
          resumeExistingAttempt = true;
        } else {
          trace.start('attempt_transaction_commit');
          await client.query('COMMIT');
          trace.finish();
          const attempt = mapAttempt(existing);
          client.release();
          return { attempt, outcome: attemptOutcomeForStatus(attempt.status, false) };
        }
      }

      if (!resumeExistingAttempt) {
        trace.start('active_attempt_recovery');
        const activeResult = await client.query(
          `SELECT id_attempt
           FROM fortnite_replay.tb_replay_processing_attempt
           WHERE fk_id_replay_file = $1
             AND status = 'processing'
           LIMIT 1`,
          [replayFileId],
        );
        if (activeResult.rows.length > 0) {
          const activeAttemptId = safeInteger(activeResult.rows[0].id_attempt, 'attempt id');
          if (!await this.tryAcquireAttemptLock(client, activeAttemptId)) {
            throw new ReplayConflictError('A processing attempt already exists for this Replay file.');
          }
          lockedAttemptIds.push(activeAttemptId);
          const activeAttempt = await this.loadAttemptRow(client, activeAttemptId, true);
          if (activeAttempt.status === 'processing') {
            await client.query(
              `UPDATE fortnite_replay.tb_replay_processing_attempt
               SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = $2
               WHERE id_attempt = $1 AND status = 'processing'`,
              [activeAttemptId, SAFE_FAILURE_MESSAGE],
            );
          }
        }
      }

      if (!resumeExistingAttempt) {
        trace.start('analyzer_version');
        const version = input.analyzerVersion;
        await client.query(
          `INSERT INTO fortnite_replay.tb_analyzer_version
             (application_version, analyzer_version, parser_name, parser_version, description)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (application_version, analyzer_version, parser_name, parser_version)
           DO NOTHING`,
          [
            version.applicationVersion,
            version.analyzerVersion,
            version.parserName,
            version.parserVersion,
            version.description ?? null,
          ],
        );
        const versionResult = await client.query(
          `SELECT id_analyzer_version
           FROM fortnite_replay.tb_analyzer_version
           WHERE application_version = $1
             AND analyzer_version = $2
             AND parser_name = $3
             AND parser_version = $4`,
          [version.applicationVersion, version.analyzerVersion, version.parserName, version.parserVersion],
        );
        const analyzerVersionId = versionResult.rows[0]
          ? safeInteger(versionResult.rows[0].id_analyzer_version, 'analyzer version id')
          : undefined;
        if (analyzerVersionId === undefined) {
          throw new Error('Analyzer version could not be resolved.');
        }

        trace.start('attempt_create');
        const attemptResult = await client.query(
          `INSERT INTO fortnite_replay.tb_replay_processing_attempt
             (fk_id_replay_file, fk_id_analyzer_version, idempotency_key, request_sha256)
           VALUES ($1, $2, $3, $4)
           RETURNING id_attempt`,
          [replayFileId, analyzerVersionId, input.idempotencyKey, requestSha256],
        );
        attemptId = safeInteger(attemptResult.rows[0].id_attempt, 'attempt id');
        trace.start('attempt_lock');
        if (!await this.tryAcquireAttemptLock(client, attemptId)) {
          throw new ReplayConflictError('Replay processing lock could not be acquired.');
        }
        lockedAttemptIds.push(attemptId);
        isNewAttempt = true;
      }
      trace.start('attempt_transaction_commit');
      await client.query('COMMIT');
      trace.finish();
    } catch (error) {
      trace.fail(error);
      trace.start('attempt_transaction_rollback');
      discardClient = await rollbackQuietly(client, trace);
      trace.finish();
      const releaseError = await this.releaseAttemptLocks(client, lockedAttemptIds, fileSha256);
      client.release(discardClient ?? releaseError);
      if (discardClient) throw discardClient;
      if (isUniqueViolation(error)) {
        throw new ReplayConflictError('Replay processing conflicts with an existing attempt.');
      }
      throw error;
    }

    if (attemptId === undefined) {
      const releaseError = await this.releaseAttemptLocks(client, lockedAttemptIds, fileSha256);
      client.release(releaseError);
      throw new Error('Replay processing attempt could not be resolved.');
    }

    try {
      trace.start('data_transaction_begin');
      await client.query('BEGIN');
      trace.start('match');
      const matchResult = await client.query(
        `INSERT INTO fortnite_replay.tb_match
           (match_key, match_start_at, match_end_at, duration_seconds, total_players,
            total_teams, chapter_number, is_custom_match, session_id, playlist, game_mode,
            map_code, map_name, season_code, game_version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
         ON CONFLICT (match_key) DO UPDATE SET
           match_start_at = EXCLUDED.match_start_at,
           match_end_at = EXCLUDED.match_end_at,
           duration_seconds = EXCLUDED.duration_seconds,
           total_players = EXCLUDED.total_players,
           total_teams = EXCLUDED.total_teams,
           chapter_number = EXCLUDED.chapter_number,
           is_custom_match = EXCLUDED.is_custom_match,
           session_id = EXCLUDED.session_id,
           playlist = EXCLUDED.playlist,
           game_mode = EXCLUDED.game_mode,
           map_code = EXCLUDED.map_code,
           map_name = EXCLUDED.map_name,
           season_code = EXCLUDED.season_code,
           game_version = EXCLUDED.game_version,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id_match`,
        [
          input.match.matchKey,
          input.match.matchStartAt ?? null,
          input.match.matchEndAt ?? null,
          input.match.durationSeconds ?? null,
          input.match.totalPlayers ?? null,
          input.match.totalTeams ?? null,
          input.match.chapterNumber ?? null,
          input.match.isCustomMatch ?? null,
          input.match.sessionId ?? null,
          input.match.playlist ?? null,
          input.match.gameMode ?? null,
          input.match.mapCode ?? null,
          input.match.mapName ?? null,
          input.match.seasonCode ?? null,
          input.match.gameVersion ?? null,
        ],
      );
      const matchId = safeInteger(matchResult.rows[0].id_match, 'match id');

      trace.start('derived_data_cleanup');
      await this.deleteFileDerivedData(client, replayFileId);
      trace.start('stale_participant_cleanup');
      const currentSourceKeys = input.matchPlayers.map((player) => player.sourcePlayerKey);
      const staleSources = await client.query(
        `SELECT fk_id_match_player
         FROM fortnite_replay.tb_match_player_source
         WHERE fk_id_replay_file = $1
           AND NOT (source_player_key = ANY($2::text[]))`,
        [replayFileId, currentSourceKeys],
      );
      await client.query(
        `DELETE FROM fortnite_replay.tb_match_player_source
         WHERE fk_id_replay_file = $1
           AND NOT (source_player_key = ANY($2::text[]))`,
        [replayFileId, currentSourceKeys],
      );
      const staleParticipantIds = [...new Set(
        staleSources.rows.map((row) => safeInteger(row.fk_id_match_player, 'match player id')),
      )];
      await client.query(
        `DELETE FROM fortnite_replay.tb_match_player AS participant
         WHERE participant.id_match_player = ANY($2::bigint[])
           AND participant.fk_id_match = $1
           AND participant.fk_id_player IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM fortnite_replay.tb_match_player_source AS source
             WHERE source.fk_id_match_player = participant.id_match_player
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_match_stats AS stats
             WHERE stats.fk_id_match = participant.fk_id_match
               AND stats.fk_id_match_player = participant.id_match_player
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_elimination AS elimination
             WHERE elimination.fk_id_match = participant.fk_id_match
               AND (elimination.fk_id_eliminated_player = participant.id_match_player
                 OR elimination.fk_id_eliminator_player = participant.id_match_player)
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_player_poi_visit AS visit
             WHERE visit.fk_id_match = participant.fk_id_match
               AND visit.fk_id_match_player = participant.id_match_player
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_container_interaction AS interaction
             WHERE interaction.fk_id_match = participant.fk_id_match
               AND interaction.fk_id_match_player = participant.id_match_player
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_reward AS reward
             WHERE reward.fk_id_match = participant.fk_id_match
               AND reward.fk_id_match_player = participant.id_match_player
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_player_vehicle_usage AS usage
             WHERE usage.fk_id_match = participant.fk_id_match
               AND usage.fk_id_match_player = participant.id_match_player
           )
           AND NOT EXISTS (
             SELECT 1 FROM fortnite_replay.tb_player_vehicle AS usage
             WHERE usage.fk_id_match = participant.fk_id_match
               AND usage.fk_id_match_player = participant.id_match_player
           )`,
        [matchId, staleParticipantIds],
      );

      trace.start('global_players');
      await this.upsertGlobalPlayers(client, input.matchPlayers);
      trace.start('match_players');
      await this.upsertMatchPlayers(client, replayFileId, matchId, input.matchPlayers);
      trace.start('match_stats');
      await this.insertMatchStats(client, replayFileId, matchId, input);
      trace.start('containers');
      await this.insertContainers(client, replayFileId, matchId, input, () => trace.start('container_interactions'));
      trace.start('rewards');
      await this.insertRewards(client, replayFileId, matchId, input);
      trace.start('vehicle_usages');
      await this.insertVehicleUsages(client, replayFileId, matchId, input);
      trace.start('pois_and_visits');
      await this.insertPoisAndVisits(client, replayFileId, matchId, input);
      trace.start('safe_zones');
      await this.insertSafeZones(client, replayFileId, matchId, input);

      trace.start('attempt_finalize');
      await client.query(
        `UPDATE fortnite_replay.tb_replay_processing_attempt
         SET status = 'success', completed_at = CURRENT_TIMESTAMP, error_message = NULL
         WHERE id_attempt = $1 AND status = 'processing'`,
        [attemptId],
      );
      await client.query(
        `UPDATE fortnite_replay.tb_replay_file
         SET fk_id_match = $2, fk_id_successful_attempt = $3
         WHERE id_replay_file = $1`,
        [replayFileId, matchId, attemptId],
      );
      const attempt = await this.loadAttempt(client, attemptId);
      trace.start('data_transaction_commit');
      await client.query('COMMIT');
      trace.finish();
      return { attempt, outcome: isNewAttempt ? 'created' : 'replayed' };
    } catch (error) {
      trace.fail(error);
      trace.start('data_transaction_rollback');
      discardClient = await rollbackQuietly(client, trace);
      trace.finish();
      if (discardClient) throw discardClient;
      let failedUpdate;
      let attempt: ReplayProcessingAttempt;
      try {
        trace.start('attempt_mark_failed');
        failedUpdate = await client.query(
          `UPDATE fortnite_replay.tb_replay_processing_attempt
           SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = $2
           WHERE id_attempt = $1 AND status = 'processing'`,
          [attemptId, SAFE_FAILURE_MESSAGE],
        );
        attempt = await this.loadAttempt(client, attemptId);
        trace.finish();
      } catch (secondaryError) {
        trace.fail(secondaryError);
        throw secondaryError;
      }
      if (failedUpdate.rowCount === 0 && attempt.status === 'success') {
        return { attempt, outcome: isNewAttempt ? 'created' : 'replayed' };
      }
      if (isUniqueViolation(error)) {
        throw new ReplayConflictError('Replay ingestion conflicts with existing data.');
      }
      return { attempt, outcome: 'failed' };
    } finally {
      const releaseError = await this.releaseAttemptLocks(client, lockedAttemptIds, fileSha256);
      client.release(discardClient ?? releaseError);
    }
  }

  private async deleteFileDerivedData(client: PoolClient, replayFileId: number): Promise<void> {
    await client.query(
      `DELETE FROM fortnite_replay.tb_reward
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
    await client.query(
      `DELETE FROM fortnite_replay.tb_container_interaction
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
    await client.query(
      `DELETE FROM fortnite_replay.tb_container
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
    await client.query(
      `DELETE FROM fortnite_replay.tb_player_vehicle_usage
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
    await client.query(
      `DELETE FROM fortnite_replay.tb_player_poi_visit
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
    await client.query(
      `DELETE FROM fortnite_replay.tb_safe_zone_phase
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
    await client.query(
      `DELETE FROM fortnite_replay.tb_match_stats
       WHERE fk_id_replay_file = $1`,
      [replayFileId],
    );
  }

  private async upsertGlobalPlayers(client: PoolClient, players: ReplayIngestionRequest['matchPlayers']): Promise<void> {
    const input = JSON.stringify(players.map((player) => ({
      epic_id: player.epicId ?? null,
      bot_id: player.botId ?? null,
      platform_unique_net_id: player.platformUniqueNetId ?? null,
      current_display_name: player.currentDisplayName ?? null,
      platform: player.platform ?? null,
    })));
    await client.query(
      `WITH source AS (
         SELECT epic_id, bot_id, platform_unique_net_id, current_display_name, platform
         FROM jsonb_to_recordset($1::jsonb) AS x(
           epic_id text, bot_id text, platform_unique_net_id text,
           current_display_name text, platform text
         )
       )
       INSERT INTO fortnite_replay.tb_player
         (epic_id, bot_id, is_bot, platform_unique_net_id, current_display_name, platform)
       SELECT epic_id, NULL, FALSE, platform_unique_net_id, current_display_name, platform
       FROM source
       WHERE epic_id IS NOT NULL
       ON CONFLICT (epic_id) DO UPDATE SET
         last_seen_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         platform_unique_net_id = COALESCE(EXCLUDED.platform_unique_net_id, fortnite_replay.tb_player.platform_unique_net_id),
         current_display_name = COALESCE(EXCLUDED.current_display_name, fortnite_replay.tb_player.current_display_name),
         platform = COALESCE(EXCLUDED.platform, fortnite_replay.tb_player.platform)`,
      [input],
    );
    await client.query(
      `WITH source AS (
         SELECT epic_id, bot_id, platform_unique_net_id, current_display_name, platform
         FROM jsonb_to_recordset($1::jsonb) AS x(
           epic_id text, bot_id text, platform_unique_net_id text,
           current_display_name text, platform text
         )
       )
       INSERT INTO fortnite_replay.tb_player
         (epic_id, bot_id, is_bot, platform_unique_net_id, current_display_name, platform)
       SELECT NULL, bot_id, TRUE, platform_unique_net_id, current_display_name, platform
       FROM source
       WHERE bot_id IS NOT NULL
       ON CONFLICT (bot_id) DO UPDATE SET
         last_seen_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         platform_unique_net_id = COALESCE(EXCLUDED.platform_unique_net_id, fortnite_replay.tb_player.platform_unique_net_id),
         current_display_name = COALESCE(EXCLUDED.current_display_name, fortnite_replay.tb_player.current_display_name),
         platform = COALESCE(EXCLUDED.platform, fortnite_replay.tb_player.platform)`,
      [input],
    );
  }

  private async upsertMatchPlayers(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    players: ReplayIngestionRequest['matchPlayers'],
  ): Promise<void> {
    const input = JSON.stringify(players.map((player) => ({
      source_player_key: player.sourcePlayerKey,
      epic_id: player.epicId ?? null,
      bot_id: player.botId ?? null,
      total_traveled: player.totalTraveled ?? null,
      death_time_seconds: player.deathTimeSeconds ?? null,
      team_index: player.teamIndex ?? null,
      player_number: player.playerNumber ?? null,
      placement: player.placement ?? null,
      kills: player.kills ?? null,
      team_kills: player.teamKills ?? null,
      assists: player.assists ?? null,
      weapon_damage: player.weaponDamage ?? null,
      other_damage: player.otherDamage ?? null,
      revives: player.revives ?? null,
      damage_taken: player.damageTaken ?? null,
      damage_to_structures: player.damageToStructures ?? null,
      materials_gathered: player.materialsGathered ?? null,
      materials_used: player.materialsUsed ?? null,
      death_cause: player.deathCause ?? null,
      death_circumstance: player.deathCircumstance ?? null,
      level: player.level ?? null,
      season_level: player.seasonLevel ?? null,
      is_replay_owner: player.isReplayOwner ?? null,
      is_game_session_owner: player.isGameSessionOwner ?? null,
      is_party_leader: player.isPartyLeader ?? null,
      is_anonymous: player.isAnonymous ?? null,
      has_finished_loading: player.hasFinishedLoading ?? null,
      has_started_playing: player.hasStartedPlaying ?? null,
      replay_player_id: player.replayPlayerId ?? null,
      player_type: player.playerType,
      platform: player.platform ?? null,
      current_display_name: player.currentDisplayName ?? null,
      platform_unique_net_id: player.platformUniqueNetId ?? null,
      cosmetics: player.cosmetics ?? {},
    })));

    const participantResult = await client.query(
      `WITH source AS MATERIALIZED (
         SELECT source_player_key, epic_id, bot_id, total_traveled,
                death_time_seconds, team_index, player_number, placement, kills,
                team_kills, assists, weapon_damage, other_damage, revives,
                damage_taken, damage_to_structures, materials_gathered,
                materials_used, death_cause, death_circumstance, level,
                season_level, is_replay_owner, is_game_session_owner,
                is_party_leader, is_anonymous, has_finished_loading,
                has_started_playing, replay_player_id, player_type, platform,
                current_display_name, platform_unique_net_id, cosmetics
         FROM jsonb_to_recordset($3::jsonb) AS x(
           source_player_key text, epic_id text, bot_id text,
           total_traveled double precision, death_time_seconds double precision,
           team_index integer, player_number integer, placement integer, kills integer,
           team_kills integer, assists integer, weapon_damage integer, other_damage integer,
           revives integer, damage_taken integer, damage_to_structures integer,
           materials_gathered integer, materials_used integer, death_cause integer,
           death_circumstance integer, level integer, season_level integer,
           is_replay_owner boolean, is_game_session_owner boolean, is_party_leader boolean,
           is_anonymous boolean, has_finished_loading boolean, has_started_playing boolean,
           replay_player_id text, player_type text, platform text,
           current_display_name text, platform_unique_net_id text, cosmetics jsonb
         )
       ),
       resolved AS MATERIALIZED (
         SELECT s.source_player_key, s.epic_id, s.bot_id, s.total_traveled,
                s.death_time_seconds, s.team_index, s.player_number, s.placement,
                s.kills, s.team_kills, s.assists, s.weapon_damage, s.other_damage,
                s.revives, s.damage_taken, s.damage_to_structures,
                s.materials_gathered, s.materials_used, s.death_cause,
                s.death_circumstance, s.level, s.season_level, s.is_replay_owner,
                s.is_game_session_owner, s.is_party_leader, s.is_anonymous,
                s.has_finished_loading, s.has_started_playing, s.replay_player_id,
                s.player_type, s.platform, s.current_display_name,
                s.platform_unique_net_id, s.cosmetics,
                p.id_player AS global_player_id,
                src.fk_id_match_player AS sourced_match_player_id
         FROM source AS s
         LEFT JOIN fortnite_replay.tb_player AS p
           ON (s.epic_id IS NOT NULL AND p.epic_id = s.epic_id)
           OR (s.bot_id IS NOT NULL AND p.bot_id = s.bot_id)
         LEFT JOIN fortnite_replay.tb_match_player_source AS src
           ON src.fk_id_replay_file = $1
          AND src.source_player_key = s.source_player_key
       ),
       planned AS MATERIALIZED (
         SELECT r.*,
                CASE
                  WHEN r.global_player_id IS NULL AND r.sourced_match_player_id IS NULL
                  THEN nextval('fortnite_replay.tb_match_player_id_match_player_seq')
                  ELSE NULL
                END AS new_match_player_id
         FROM resolved AS r
       ),
       known_write AS (
         INSERT INTO fortnite_replay.tb_match_player
           (fk_id_match, fk_id_player, total_traveled, death_time_seconds, team_index,
            player_number, placement, kills, team_kills, assists, weapon_damage,
            other_damage, revives, damage_taken, damage_to_structures, materials_gathered,
            materials_used, death_cause, death_circumstance, level, season_level,
            is_replay_owner, is_game_session_owner, is_party_leader, is_anonymous,
            has_finished_loading, has_started_playing, replay_player_id, player_type,
            platform, current_display_name, platform_unique_net_id, cosmetics)
         SELECT $2, global_player_id, total_traveled, death_time_seconds, team_index,
                player_number, placement, kills, team_kills, assists, weapon_damage,
                other_damage, revives, damage_taken, damage_to_structures, materials_gathered,
                materials_used, death_cause, death_circumstance, level, season_level,
                is_replay_owner, is_game_session_owner, is_party_leader, is_anonymous,
                has_finished_loading, has_started_playing, replay_player_id, player_type,
                platform, current_display_name, platform_unique_net_id,
                COALESCE(cosmetics, '{}'::jsonb)
         FROM planned
         WHERE global_player_id IS NOT NULL
         ON CONFLICT (fk_id_match, fk_id_player) DO UPDATE SET
           total_traveled = EXCLUDED.total_traveled,
           death_time_seconds = EXCLUDED.death_time_seconds,
           team_index = EXCLUDED.team_index,
           player_number = EXCLUDED.player_number,
           placement = EXCLUDED.placement,
           kills = EXCLUDED.kills,
           team_kills = EXCLUDED.team_kills,
           assists = EXCLUDED.assists,
           weapon_damage = EXCLUDED.weapon_damage,
           other_damage = EXCLUDED.other_damage,
           revives = EXCLUDED.revives,
           damage_taken = EXCLUDED.damage_taken,
           damage_to_structures = EXCLUDED.damage_to_structures,
           materials_gathered = EXCLUDED.materials_gathered,
           materials_used = EXCLUDED.materials_used,
           death_cause = EXCLUDED.death_cause,
           death_circumstance = EXCLUDED.death_circumstance,
           level = EXCLUDED.level,
           season_level = EXCLUDED.season_level,
           is_replay_owner = EXCLUDED.is_replay_owner,
           is_game_session_owner = EXCLUDED.is_game_session_owner,
           is_party_leader = EXCLUDED.is_party_leader,
           is_anonymous = EXCLUDED.is_anonymous,
           has_finished_loading = EXCLUDED.has_finished_loading,
           has_started_playing = EXCLUDED.has_started_playing,
           replay_player_id = EXCLUDED.replay_player_id,
           player_type = EXCLUDED.player_type,
           platform = EXCLUDED.platform,
           current_display_name = EXCLUDED.current_display_name,
           platform_unique_net_id = EXCLUDED.platform_unique_net_id,
           cosmetics = EXCLUDED.cosmetics
         RETURNING id_match_player, fk_id_player
       ),
       unknown_update AS (
         UPDATE fortnite_replay.tb_match_player AS p
         SET total_traveled = s.total_traveled,
             death_time_seconds = s.death_time_seconds,
             team_index = s.team_index,
             player_number = s.player_number,
             placement = s.placement,
             kills = s.kills,
             team_kills = s.team_kills,
             assists = s.assists,
             weapon_damage = s.weapon_damage,
             other_damage = s.other_damage,
             revives = s.revives,
             damage_taken = s.damage_taken,
             damage_to_structures = s.damage_to_structures,
             materials_gathered = s.materials_gathered,
             materials_used = s.materials_used,
             death_cause = s.death_cause,
             death_circumstance = s.death_circumstance,
             level = s.level,
             season_level = s.season_level,
             is_replay_owner = s.is_replay_owner,
             is_game_session_owner = s.is_game_session_owner,
             is_party_leader = s.is_party_leader,
             is_anonymous = s.is_anonymous,
             has_finished_loading = s.has_finished_loading,
             has_started_playing = s.has_started_playing,
             replay_player_id = s.replay_player_id,
             player_type = s.player_type,
             platform = s.platform,
             current_display_name = s.current_display_name,
             platform_unique_net_id = s.platform_unique_net_id,
             cosmetics = COALESCE(s.cosmetics, '{}'::jsonb)
         FROM planned AS s
         WHERE s.global_player_id IS NULL
           AND s.sourced_match_player_id = p.id_match_player
           AND p.fk_id_match = $2
         RETURNING p.id_match_player
       ),
       unknown_insert AS (
         INSERT INTO fortnite_replay.tb_match_player
           (id_match_player, fk_id_match, fk_id_player, total_traveled, death_time_seconds,
            team_index, player_number, placement, kills, team_kills, assists, weapon_damage,
            other_damage, revives, damage_taken, damage_to_structures, materials_gathered,
            materials_used, death_cause, death_circumstance, level, season_level,
            is_replay_owner, is_game_session_owner, is_party_leader, is_anonymous,
            has_finished_loading, has_started_playing, replay_player_id, player_type,
            platform, current_display_name, platform_unique_net_id, cosmetics)
         OVERRIDING SYSTEM VALUE
         SELECT new_match_player_id, $2, NULL, total_traveled, death_time_seconds,
                team_index, player_number, placement, kills, team_kills, assists, weapon_damage,
                other_damage, revives, damage_taken, damage_to_structures, materials_gathered,
                materials_used, death_cause, death_circumstance, level, season_level,
                is_replay_owner, is_game_session_owner, is_party_leader, is_anonymous,
                has_finished_loading, has_started_playing, replay_player_id, player_type,
                platform, current_display_name, platform_unique_net_id,
                COALESCE(cosmetics, '{}'::jsonb)
         FROM planned
         WHERE new_match_player_id IS NOT NULL
         RETURNING id_match_player
       ),
       links AS (
         SELECT p.source_player_key,
                COALESCE(k.id_match_player, u.id_match_player, i.id_match_player,
                         p.sourced_match_player_id, p.new_match_player_id) AS match_player_id
         FROM planned AS p
         LEFT JOIN known_write AS k ON k.fk_id_player = p.global_player_id
         LEFT JOIN unknown_update AS u ON u.id_match_player = p.sourced_match_player_id
         LEFT JOIN unknown_insert AS i ON i.id_match_player = p.new_match_player_id
       )
       INSERT INTO fortnite_replay.tb_match_player_source
         (fk_id_replay_file, fk_id_match, source_player_key, fk_id_match_player)
       SELECT $1, $2, source_player_key, match_player_id
       FROM links
       WHERE match_player_id IS NOT NULL
       ON CONFLICT (fk_id_replay_file, source_player_key) DO UPDATE SET
         fk_id_match = EXCLUDED.fk_id_match,
         fk_id_match_player = EXCLUDED.fk_id_match_player`,
      [replayFileId, matchId, input],
    );
    assertInsertedRows(participantResult.rowCount, players.length, 'match participant source');
  }

  private async insertMatchStats(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    request: ReplayIngestionRequest,
  ): Promise<void> {
    if (!request.matchStats) return;
    const stats = request.matchStats;
    const result = await client.query(
      `INSERT INTO fortnite_replay.tb_match_stats
         (fk_id_match, fk_id_match_player, total_traveled, accuracy, unknown, assists,
          eliminations, weapon_damage, other_damage, revives, damage_taken,
          damage_to_structures, materials_gathered, materials_used, fk_id_replay_file)
       VALUES (
         $1,
         (SELECT fk_id_match_player
          FROM fortnite_replay.tb_match_player_source
          WHERE fk_id_replay_file = $2 AND source_player_key = $3),
         $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $2
       )
       ON CONFLICT (fk_id_match) DO UPDATE SET
         fk_id_match_player = EXCLUDED.fk_id_match_player,
         total_traveled = EXCLUDED.total_traveled,
         accuracy = EXCLUDED.accuracy,
         unknown = EXCLUDED.unknown,
         assists = EXCLUDED.assists,
         eliminations = EXCLUDED.eliminations,
         weapon_damage = EXCLUDED.weapon_damage,
         other_damage = EXCLUDED.other_damage,
         revives = EXCLUDED.revives,
         damage_taken = EXCLUDED.damage_taken,
         damage_to_structures = EXCLUDED.damage_to_structures,
         materials_gathered = EXCLUDED.materials_gathered,
         materials_used = EXCLUDED.materials_used,
         fk_id_replay_file = EXCLUDED.fk_id_replay_file`,
      [
        matchId,
        replayFileId,
        stats.sourcePlayerKey ?? null,
        stats.totalTraveled ?? null,
        stats.accuracy ?? null,
        stats.unknown ?? null,
        stats.assists ?? null,
        stats.eliminations ?? null,
        stats.weaponDamage ?? null,
        stats.otherDamage ?? null,
        stats.revives ?? null,
        stats.damageTaken ?? null,
        stats.damageToStructures ?? null,
        stats.materialsGathered ?? null,
        stats.materialsUsed ?? null,
      ],
    );
    assertInsertedRows(result.rowCount, 1, 'match stats');
  }

  private async insertContainers(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    request: ReplayIngestionRequest,
    startInteractions: () => void,
  ): Promise<void> {
    const containers = request.containers ?? [];
    const containerRows = containers.map((container) => ({
      source_id: container.sourceId,
      container_kind: container.containerKind,
      blueprint: container.blueprint ?? null,
      replay_actor_id: container.replayActorId ?? null,
      location_x: container.locationX ?? null,
      location_y: container.locationY ?? null,
      location_z: container.locationZ ?? null,
      first_seen_seconds: container.firstSeenSeconds ?? null,
    }));
    const containerResult = await client.query(
      `WITH source AS (
         SELECT source_id, container_kind, blueprint, replay_actor_id,
                location_x, location_y, location_z, first_seen_seconds
         FROM jsonb_to_recordset($3::jsonb) AS x(
           source_id text, container_kind text, blueprint text, replay_actor_id text,
           location_x double precision, location_y double precision, location_z double precision,
           first_seen_seconds double precision
         )
       )
       INSERT INTO fortnite_replay.tb_container
         (fk_id_match, fk_id_replay_file, source_key, container_kind, blueprint,
          replay_actor_id, location_x, location_y, location_z, first_seen_seconds)
       SELECT $2, $1, source_id, container_kind, blueprint, replay_actor_id,
              location_x, location_y, location_z, first_seen_seconds
       FROM source`,
      [replayFileId, matchId, JSON.stringify(containerRows)],
    );
    assertInsertedRows(containerResult.rowCount, containers.length, 'container');

    startInteractions();
    const interactions = containers.flatMap((container) => (container.interactions ?? []).map((interaction) => ({
      source_id: interaction.sourceId,
      container_source_id: container.sourceId,
      source_player_key: interaction.sourcePlayerKey ?? null,
      event_time_seconds: interaction.eventTimeSeconds,
      is_refill_reopen: interaction.isRefillReopen ?? false,
      interaction_type: interaction.interactionType,
      source_confidence: interaction.sourceConfidence ?? null,
    })));
    const interactionResult = await client.query(
      `WITH source AS (
         SELECT source_id, container_source_id, source_player_key,
                event_time_seconds, is_refill_reopen, interaction_type,
                source_confidence
         FROM jsonb_to_recordset($3::jsonb) AS x(
           source_id text, container_source_id text, source_player_key text,
           event_time_seconds double precision, is_refill_reopen boolean,
           interaction_type text, source_confidence text
         )
       )
       INSERT INTO fortnite_replay.tb_container_interaction
         (fk_id_match, fk_id_replay_file, source_key, fk_id_container,
          fk_id_match_player, event_time_seconds, is_refill_reopen,
          interaction_type, source_confidence)
       SELECT $2, $1, source.source_id, container.id_container,
              player.fk_id_match_player, source.event_time_seconds,
              COALESCE(source.is_refill_reopen, FALSE), source.interaction_type,
              source.source_confidence
       FROM source
       JOIN fortnite_replay.tb_container AS container
         ON container.fk_id_replay_file = $1
        AND container.source_key = source.container_source_id
       LEFT JOIN fortnite_replay.tb_match_player_source AS player
         ON player.fk_id_replay_file = $1
        AND player.source_player_key = source.source_player_key`,
      [replayFileId, matchId, JSON.stringify(interactions)],
    );
    assertInsertedRows(interactionResult.rowCount, interactions.length, 'container interaction');
  }

  private async insertRewards(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    request: ReplayIngestionRequest,
  ): Promise<void> {
    const rewards = request.rewards ?? [];
    const catalogRows = rewards.map((reward) => ({
      reward_code: reward.rewardTypeCode ?? reward.prizeId,
      category: reward.category ?? null,
      display_name: reward.displayName ?? null,
    }));
    const rewardResult = await client.query(
      `WITH source AS (
         SELECT DISTINCT ON (reward_code) reward_code, category, display_name
         FROM jsonb_to_recordset($1::jsonb) AS x(
           reward_code text, category text, display_name text
         )
         ORDER BY reward_code
       )
       INSERT INTO fortnite_replay.tb_reward_type AS existing
         (reward_code, category, display_name)
       SELECT reward_code, category, display_name
       FROM source
       ON CONFLICT (reward_code) DO UPDATE SET
         category = COALESCE(EXCLUDED.category, existing.category),
         display_name = COALESCE(EXCLUDED.display_name, existing.display_name)`,
      [JSON.stringify(catalogRows)],
    );
    const rows = rewards.map((reward) => ({
      source_id: reward.sourceId,
      prize_id: reward.prizeId,
      reward_code: reward.rewardTypeCode ?? reward.prizeId,
      source_player_key: reward.sourcePlayerKey ?? null,
      interaction_source_id: reward.containerInteractionSourceId ?? null,
      event_time_seconds: reward.eventTimeSeconds ?? null,
      is_golden_chest: reward.isGoldenChest ?? null,
      is_teammate_reward: reward.isTeammateReward,
      is_from_chest: reward.isFromChest ?? null,
      was_destroyed: reward.wasDestroyed ?? null,
      origin: reward.origin ?? null,
      source_confidence: reward.sourceConfidence ?? null,
    }));
    await client.query(
      `WITH source AS (
         SELECT source_id, prize_id, reward_code, source_player_key,
                interaction_source_id, event_time_seconds, is_golden_chest,
                is_teammate_reward, is_from_chest, was_destroyed, origin,
                source_confidence
         FROM jsonb_to_recordset($3::jsonb) AS x(
           source_id text, prize_id text, reward_code text, source_player_key text,
           interaction_source_id text, event_time_seconds double precision,
           is_golden_chest boolean, is_teammate_reward boolean, is_from_chest boolean,
           was_destroyed boolean, origin text, source_confidence text
         )
       )
       INSERT INTO fortnite_replay.tb_reward
         (fk_id_match, fk_id_replay_file, source_key, prize_id, fk_id_match_player,
          fk_id_reward_type, fk_id_container_interaction, event_time_seconds,
          is_golden_chest, is_teammate_reward, is_from_chest, was_destroyed,
          origin, source_confidence)
       SELECT $2, $1, source.source_id, source.prize_id, player.fk_id_match_player,
              reward_type.id_reward_type, interaction.id_container_interaction,
              source.event_time_seconds, source.is_golden_chest,
              COALESCE(source.is_teammate_reward, FALSE), source.is_from_chest,
              source.was_destroyed, source.origin, source.source_confidence
       FROM source
       JOIN fortnite_replay.tb_reward_type AS reward_type
         ON reward_type.reward_code = source.reward_code
       LEFT JOIN fortnite_replay.tb_match_player_source AS player
         ON player.fk_id_replay_file = $1
        AND player.source_player_key = source.source_player_key
       LEFT JOIN fortnite_replay.tb_container_interaction AS interaction
         ON interaction.fk_id_replay_file = $1
        AND interaction.source_key = source.interaction_source_id`,
      [replayFileId, matchId, JSON.stringify(rows)],
    );
    assertInsertedRows(rewardResult.rowCount, rewards.length, 'reward');
  }

  private async insertVehicleUsages(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    request: ReplayIngestionRequest,
  ): Promise<void> {
    const usages = request.vehicleUsages ?? [];
    const catalogRows = usages.map((usage) => ({
      vehicle_code: usage.vehicleCode,
      display_name: usage.displayName ?? null,
      vehicle_class: usage.vehicleClass ?? null,
    }));
    const usageResult = await client.query(
      `WITH source AS (
         SELECT DISTINCT ON (vehicle_code) vehicle_code, display_name, vehicle_class
         FROM jsonb_to_recordset($1::jsonb) AS x(
           vehicle_code text, display_name text, vehicle_class text
         )
         ORDER BY vehicle_code
       )
       INSERT INTO fortnite_replay.tb_vehicle AS existing
         (vehicle_code, display_name, vehicle_class)
       SELECT vehicle_code, display_name, vehicle_class
       FROM source
       ON CONFLICT (vehicle_code) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, existing.display_name),
         vehicle_class = COALESCE(EXCLUDED.vehicle_class, existing.vehicle_class)`,
      [JSON.stringify(catalogRows)],
    );
    const rows = usages.map((usage) => ({
      source_id: usage.sourceId,
      source_player_key: usage.sourcePlayerKey,
      vehicle_code: usage.vehicleCode,
      replay_vehicle_id: usage.replayVehicleId ?? null,
      entered_at_seconds: usage.enteredAtSeconds ?? null,
      exited_at_seconds: usage.exitedAtSeconds ?? null,
    }));
    await client.query(
      `WITH source AS (
         SELECT source_id, source_player_key, vehicle_code, replay_vehicle_id,
                entered_at_seconds, exited_at_seconds
         FROM jsonb_to_recordset($3::jsonb) AS x(
           source_id text, source_player_key text, vehicle_code text,
           replay_vehicle_id text, entered_at_seconds double precision,
           exited_at_seconds double precision
         )
       )
       INSERT INTO fortnite_replay.tb_player_vehicle_usage
         (fk_id_replay_file, fk_id_match, fk_id_match_player, fk_id_vehicle,
          source_key, replay_vehicle_id, entered_at_seconds, exited_at_seconds)
       SELECT $1, $2, player.fk_id_match_player, vehicle.id_vehicle,
              source.source_id, source.replay_vehicle_id,
              source.entered_at_seconds, source.exited_at_seconds
       FROM source
       JOIN fortnite_replay.tb_match_player_source AS player
         ON player.fk_id_replay_file = $1
        AND player.source_player_key = source.source_player_key
       JOIN fortnite_replay.tb_vehicle AS vehicle
         ON vehicle.vehicle_code = source.vehicle_code`,
      [replayFileId, matchId, JSON.stringify(rows)],
    );
    assertInsertedRows(usageResult.rowCount, usages.length, 'vehicle usage');
  }

  private async insertPoisAndVisits(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    request: ReplayIngestionRequest,
  ): Promise<void> {
    const pois = request.pois ?? [];
    const poiRows = pois.map((poi) => ({
      map_code: poi.mapCode,
      season_code: poi.seasonCode ?? null,
      poi_code: poi.poiCode,
      display_name: poi.displayName,
      center_x: poi.centerX ?? null,
      center_y: poi.centerY ?? null,
      center_z: poi.centerZ ?? null,
      boundary_radius: poi.boundaryRadius ?? null,
      coordinate_system: poi.coordinateSystem ?? null,
    }));
    const visitResult = await client.query(
      `WITH source AS (
         SELECT map_code, season_code, poi_code, display_name, center_x, center_y,
                center_z, boundary_radius, coordinate_system
         FROM jsonb_to_recordset($1::jsonb) AS x(
           map_code text, season_code text, poi_code text, display_name text,
           center_x double precision, center_y double precision, center_z double precision,
           boundary_radius double precision, coordinate_system text
         )
       )
       INSERT INTO fortnite_replay.tb_poi AS existing
         (map_code, season_code, poi_code, display_name, center_x, center_y,
          center_z, boundary_radius, coordinate_system)
       SELECT map_code, season_code, poi_code, display_name, center_x, center_y,
              center_z, boundary_radius, coordinate_system
       FROM source
       ON CONFLICT (map_code, season_code, poi_code) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         center_x = COALESCE(EXCLUDED.center_x, existing.center_x),
         center_y = COALESCE(EXCLUDED.center_y, existing.center_y),
         center_z = COALESCE(EXCLUDED.center_z, existing.center_z),
         boundary_radius = COALESCE(EXCLUDED.boundary_radius, existing.boundary_radius),
         coordinate_system = COALESCE(EXCLUDED.coordinate_system, existing.coordinate_system)`,
      [JSON.stringify(poiRows)],
    );
    const visits = (request.poiVisits ?? []).map((visit) => ({
      source_id: visit.sourceId,
      source_player_key: visit.sourcePlayerKey,
      poi_code: visit.poiCode,
      season_code: visit.seasonCode ?? request.match.seasonCode ?? null,
      started_at_seconds: visit.startedAtSeconds,
      ended_at_seconds: visit.endedAtSeconds,
      duration_seconds: visit.durationSeconds,
      confidence: visit.confidence ?? null,
      sample_count: visit.sampleCount ?? null,
      detection_method: visit.detectionMethod ?? null,
    }));
    await client.query(
      `WITH source AS (
         SELECT source_id, source_player_key, poi_code, season_code,
                started_at_seconds, ended_at_seconds, duration_seconds,
                confidence, sample_count, detection_method
         FROM jsonb_to_recordset($4::jsonb) AS x(
           source_id text, source_player_key text, poi_code text, season_code text,
           started_at_seconds double precision, ended_at_seconds double precision,
           duration_seconds double precision, confidence double precision,
           sample_count integer, detection_method text
         )
       )
       INSERT INTO fortnite_replay.tb_player_poi_visit
         (fk_id_match, fk_id_replay_file, source_key, fk_id_match_player, fk_id_poi,
          started_at_seconds, ended_at_seconds, duration_seconds, confidence,
          sample_count, detection_method)
       SELECT $2, $1, source.source_id, player.fk_id_match_player, poi.id_poi,
              source.started_at_seconds, source.ended_at_seconds,
              source.duration_seconds, source.confidence, source.sample_count,
              source.detection_method
       FROM source
       JOIN fortnite_replay.tb_match_player_source AS player
         ON player.fk_id_replay_file = $1
        AND player.source_player_key = source.source_player_key
       JOIN fortnite_replay.tb_poi AS poi
         ON poi.map_code = $3
        AND poi.poi_code = source.poi_code
        AND poi.season_code IS NOT DISTINCT FROM source.season_code`,
      [replayFileId, matchId, request.match.mapCode ?? null, JSON.stringify(visits)],
    );
    assertInsertedRows(visitResult.rowCount, visits.length, 'POI visit');
  }

  private async insertSafeZones(
    client: PoolClient,
    replayFileId: number,
    matchId: number,
    request: ReplayIngestionRequest,
  ): Promise<void> {
    const rows = (request.safeZonePhases ?? []).map((phase) => ({
      phase_number: phase.phaseNumber,
      starts_at_seconds: phase.startsAtSeconds ?? null,
      ends_at_seconds: phase.endsAtSeconds ?? null,
      center_x: phase.centerX ?? null,
      center_y: phase.centerY ?? null,
      radius: phase.radius ?? null,
    }));
    const result = await client.query(
      `WITH source AS (
         SELECT phase_number, starts_at_seconds, ends_at_seconds, center_x,
                center_y, radius
         FROM jsonb_to_recordset($3::jsonb) AS x(
           phase_number integer, starts_at_seconds double precision,
           ends_at_seconds double precision, center_x double precision,
           center_y double precision, radius double precision
         )
       )
       INSERT INTO fortnite_replay.tb_safe_zone_phase
         (fk_id_match, fk_id_replay_file, phase_number, starts_at_seconds,
          ends_at_seconds, center_x, center_y, radius)
       SELECT $2, $1, phase_number, starts_at_seconds, ends_at_seconds,
              center_x, center_y, radius
       FROM source`,
      [replayFileId, matchId, JSON.stringify(rows)],
    );
    assertInsertedRows(result.rowCount, rows.length, 'Safe Zone phase');
  }

  private async loadAttempt(client: PoolClient, attemptId: number): Promise<ReplayProcessingAttempt> {
    return mapAttempt(await this.loadAttemptRow(client, attemptId));
  }

  private async loadAttemptRow(
    client: PoolClient,
    attemptId: number,
    forUpdate = false,
  ): Promise<Record<string, unknown>> {
    const result = await client.query(
      `SELECT ${ATTEMPT_COLUMNS}
       FROM fortnite_replay.tb_replay_processing_attempt AS a
       JOIN fortnite_replay.tb_analyzer_version AS v
         ON v.id_analyzer_version = a.fk_id_analyzer_version
       WHERE a.id_attempt = $1
       ${forUpdate ? 'FOR UPDATE OF a' : ''}`,
      [attemptId],
    );
    if (result.rows.length === 0) {
      throw new ReplayNotFoundError('Replay processing attempt was not found.');
    }
    return result.rows[0];
  }

  private async tryAcquireAttemptLock(client: PoolClient, attemptId: number): Promise<boolean> {
    const result = await client.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [`replay-processing-attempt:${attemptId}`],
    );
    return result.rows[0]?.acquired === true;
  }

  private async releaseAttemptLocks(
    client: PoolClient,
    attemptIds: number[],
    fileSha256?: string,
  ): Promise<Error | undefined> {
    let releaseError: Error | undefined;
    for (const attemptId of [...attemptIds].reverse()) {
      try {
        const result = await client.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
          [`replay-processing-attempt:${attemptId}`],
        );
        if (result.rows[0]?.released !== true) {
          throw new Error('PostgreSQL advisory lock was not held by this connection.');
        }
      } catch (error) {
        logReplayError('attempt_lock_release', fileSha256, attemptId, error);
        releaseError ??= error instanceof Error ? error : new Error('Advisory lock release failed.');
      }
    }
    return releaseError;
  }
}

function mapFile(row: Record<string, unknown>): ReplayFile {
  return {
    id: safeInteger(row.id_replay_file, 'replay file id'),
    fileSha256: String(row.file_sha256),
    matchId: nullableInteger(row.fk_id_match, 'match id'),
    successfulAttemptId: nullableInteger(row.fk_id_successful_attempt, 'successful attempt id'),
    fileSizeBytes: nullableInteger(row.file_size_bytes, 'file size'),
    fileCreatedAt: nullableTimestamp(row.file_created_at),
    createdAt: requiredTimestamp(row.created_at, 'file created at'),
    fileName: String(row.file_name),
  };
}

function mapAttempt(row: Record<string, unknown>): ReplayProcessingAttempt {
  const analyzerVersion: AnalyzerVersion = {
    id: safeInteger(row.id_analyzer_version, 'analyzer version id'),
    createdAt: requiredTimestamp(row.analyzer_created_at, 'analyzer version created at'),
    applicationVersion: String(row.application_version),
    analyzerVersion: String(row.analyzer_version),
    parserName: String(row.parser_name),
    parserVersion: String(row.parser_version),
    description: row.analyzer_description === null ? null : stringOrUndefined(row.analyzer_description),
  };
  const attempt: ReplayProcessingAttempt = {
    id: safeInteger(row.id_attempt, 'attempt id'),
    startedAt: requiredTimestamp(row.started_at, 'attempt started at'),
    completedAt: nullableTimestamp(row.completed_at),
    status: String(row.status) as ReplayProcessingAttempt.StatusEnum,
    idempotencyKey: String(row.idempotency_key),
    errorMessage: row.error_message === null ? null : SAFE_FAILURE_MESSAGE,
    analyzerVersion,
  };
  return attempt;
}

function sameFileMetadata(row: Record<string, unknown>, input: ReplayFileRegistration): boolean {
  if (row.file_name !== input.fileName) return false;
  const existingSize = nullableInteger(row.file_size_bytes, 'file size');
  const inputSize = input.fileSizeBytes ?? null;
  if (existingSize !== inputSize) return false;
  const existingCreated = nullableTimestamp(row.file_created_at);
  const inputCreated = input.fileCreatedAt ?? null;
  if (existingCreated === null || inputCreated === null) return existingCreated === inputCreated;
  return Date.parse(existingCreated) === Date.parse(inputCreated);
}

function attemptOutcomeForStatus(
  status: ReplayProcessingAttempt.StatusEnum,
  newlyCreated: boolean,
): ReplayAttemptOutcomeKind {
  if (newlyCreated) return 'created';
  if (status === ReplayProcessingAttempt.StatusEnum.Processing) return 'processing';
  if (status === ReplayProcessingAttempt.StatusEnum.Failed) return 'failed';
  return 'replayed';
}

function safeInteger(value: unknown, label: string): number {
  const converted = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError(`${label} is outside the safe integer range.`);
  }
  return converted;
}

function assertInsertedRows(actual: number | null, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected} ${label} row(s), but inserted ${actual ?? 0}.`);
  }
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : safeInteger(value, label);
}

function requiredTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new TypeError(`Invalid ${label} timestamp.`);
  return date.toISOString();
}

function nullableTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredTimestamp(value, 'nullable');
}

function stringOrUndefined(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function isUniqueViolation(error: unknown): boolean {
  return getErrorCode(error) === '23505';
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

interface IngestionTrace {
  start(stage: string): void;
  finish(): void;
  fail(error: unknown): void;
}

function createIngestionTrace(fileSha256: string, getAttemptId: () => number | undefined): IngestionTrace {
  let stage: string | undefined;
  const emit = (result: 'started' | 'success') => {
    console.log(JSON.stringify({
      event: 'replay_ingestion',
      fileSha256,
      attemptId: getAttemptId() ?? null,
      stage,
      result,
    }));
  };
  const finish = () => {
    if (stage !== undefined) emit('success');
    stage = undefined;
  };
  return {
    start(nextStage) {
      finish();
      stage = nextStage;
      emit('started');
    },
    finish,
    fail(error) {
      logReplayError(stage ?? 'unknown', fileSha256, getAttemptId(), error);
      stage = undefined;
    },
  };
}

async function rollbackQuietly(client: PoolClient, trace?: IngestionTrace): Promise<Error | undefined> {
  try {
    await client.query('ROLLBACK');
    return undefined;
  } catch (error) {
    if (trace) trace.fail(error);
    else logReplayError('transaction_rollback', undefined, undefined, error);
    return error instanceof Error ? error : new Error('Transaction rollback failed.');
  }
}
