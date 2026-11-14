const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { Pool } = require('pg');
const { ReplaysRepository } = require('../dist/modules/replays/replays.repository.js');
const { ReplaysService } = require('../dist/modules/replays/replays.service.js');
const { ReplayConflictError } = require('../dist/modules/replays/replays.errors.js');
const { pool } = require('../dist/infra/database/postgres.config.js');

const connectionString = process.env.REPLAY_TEST_DATABASE_URL;

test('persists and rolls back replay ingestion with idempotent retries', {
  skip: !connectionString && 'Set REPLAY_TEST_DATABASE_URL to an isolated test database',
}, async () => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname));
  assert.equal(url.pathname, '/replay_ingestion_test');

  const testPool = new Pool({ connectionString });
  const originalConnect = pool.connect;
  const originalError = console.error;
  const errors = [];
  console.error = (entry) => errors.push(JSON.parse(entry));
  pool.connect = testPool.connect.bind(testPool);
  const suffix = randomBytes(16).toString('hex');
  const sha256 = randomBytes(32).toString('hex');
  const request = {
    idempotencyKey: `failure-${suffix}`,
    analyzerVersion: {
      applicationVersion: '3.2.0',
      analyzerVersion: '14',
      parserName: 'FortniteReplayReader',
      parserVersion: '1.0.0.0',
    },
    match: {
      matchKey: `test-${suffix}`,
      matchStartAt: '2026-11-11T22:32:51Z',
      matchEndAt: '2026-11-11T22:52:51Z',
      durationSeconds: 1200,
      totalPlayers: 4,
      playlist: 'test',
      gameVersion: 'test',
    },
    matchPlayers: Array.from({ length: 4 }, (_, index) => ({
      sourcePlayerKey: `player-${index}`,
      playerType: 'player',
      ...(index === 0
        ? { isReplayOwner: true, placement: 1, kills: 2 }
        : { epicId: `${index}${suffix.slice(0, 31)}`, currentDisplayName: `player-${index}` }),
    })),
    containers: Array.from({ length: 12 }, (_, index) => ({
      sourceId: `container-${index}`,
      containerKind: 'Chest',
      blueprint: 'test',
      firstSeenSeconds: index,
      interactions: [{
        sourceId: `interaction-${index}`,
        sourcePlayerKey: `player-${index % 4}`,
        eventTimeSeconds: index + 1,
        isRefillReopen: false,
        interactionType: index % 2 ? 'destroyed' : 'opened',
      }],
    })),
    rewards: [],
  };
  const repository = new ReplaysRepository();
  const service = new ReplaysService(repository);

  try {
    await repository.registerFile({ fileSha256: sha256, fileName: 'test.replay' });

    // Bypass service validation to exercise a real database constraint and rollback.
    const invalid = structuredClone(request);
    invalid.containers[0].interactions[0].interactionType = 'invalid';
    const failed = await repository.ingest(sha256, invalid, 'a'.repeat(64));
    assert.equal(failed.outcome, 'failed');
    assert.equal(failed.attempt.status, 'failed');
    const failureLog = errors.find((entry) => entry.attemptId === failed.attempt.id);
    assert.equal(failureLog.fileSha256, sha256);
    assert.equal(failureLog.stage, 'container_interactions');
    assert.equal(failureLog.error.sqlState, '23514');
    assert.equal(failureLog.error.constraint, 'chk_interaction_type');
    assert.match(failureLog.error.message, /chk_interaction_type/);
    assert.match(failureLog.error.stack, /insertContainers/);
    assert.equal((await testPool.query(
      'SELECT count(*)::int AS count FROM fortnite_replay.tb_match WHERE match_key = $1',
      [request.match.matchKey],
    )).rows[0].count, 0);

    const repeated = await repository.ingest(sha256, invalid, 'a'.repeat(64));
    assert.equal(repeated.outcome, 'failed');
    assert.equal(repeated.attempt.id, failed.attempt.id);
    await assert.rejects(
      repository.ingest(sha256, invalid, 'b'.repeat(64)),
      ReplayConflictError,
    );

    request.idempotencyKey = `success-${suffix}`;
    const succeeded = await service.ingest(sha256, request);
    assert.equal(succeeded.attempt.status, 'success');
    assert.notEqual(succeeded.attempt.id, failed.attempt.id);
    const counts = await testPool.query(
      `SELECT
        (SELECT count(*)::int FROM fortnite_replay.tb_match WHERE match_key = $1) AS matches,
        (SELECT count(*)::int FROM fortnite_replay.tb_match_player_source WHERE fk_id_replay_file = $2) AS players,
        (SELECT count(*)::int FROM fortnite_replay.tb_container WHERE fk_id_replay_file = $2) AS containers,
        (SELECT count(*)::int FROM fortnite_replay.tb_container_interaction WHERE fk_id_replay_file = $2) AS interactions,
        (SELECT count(*)::int FROM fortnite_replay.tb_reward WHERE fk_id_replay_file = $2) AS rewards,
        (SELECT count(*)::int FROM fortnite_replay.tb_replay_processing_attempt WHERE fk_id_replay_file = $2) AS attempts`,
      [request.match.matchKey, (await testPool.query(
        'SELECT id_replay_file FROM fortnite_replay.tb_replay_file WHERE file_sha256 = $1',
        [sha256],
      )).rows[0].id_replay_file],
    );
    assert.deepEqual(counts.rows[0], {
      matches: 1, players: 4, containers: 12, interactions: 12, rewards: 0, attempts: 2,
    });
    const persisted = await testPool.query(
      `SELECT
        (SELECT count(*)::int FROM fortnite_replay.tb_match_player_source AS s
         JOIN fortnite_replay.tb_match_player AS p ON p.id_match_player = s.fk_id_match_player
         WHERE s.fk_id_replay_file = $1 AND p.is_replay_owner AND p.placement = 1 AND p.kills = 2) AS owners,
        (SELECT count(*)::int FROM fortnite_replay.tb_container_interaction AS i
         JOIN fortnite_replay.tb_container AS c ON c.id_container = i.fk_id_container
         WHERE i.fk_id_replay_file = $1 AND c.fk_id_replay_file = $1
           AND i.fk_id_match = c.fk_id_match AND i.fk_id_match_player IS NOT NULL) AS linked`,
      [(await testPool.query(
        'SELECT id_replay_file FROM fortnite_replay.tb_replay_file WHERE file_sha256 = $1',
        [sha256],
      )).rows[0].id_replay_file],
    );
    assert.deepEqual(persisted.rows[0], { owners: 1, linked: 12 });

    invalid.idempotencyKey = `reprocess-${suffix}`;
    const reprocess = await repository.ingest(sha256, invalid, 'c'.repeat(64));
    assert.equal(reprocess.outcome, 'failed');
    const preserved = await testPool.query(
      `SELECT f.fk_id_successful_attempt,
        (SELECT count(*)::int FROM fortnite_replay.tb_container WHERE fk_id_replay_file = f.id_replay_file) AS containers,
        (SELECT count(*)::int FROM fortnite_replay.tb_container_interaction WHERE fk_id_replay_file = f.id_replay_file) AS interactions
       FROM fortnite_replay.tb_replay_file AS f WHERE f.file_sha256 = $1`,
      [sha256],
    );
    assert.equal(Number(preserved.rows[0].fk_id_successful_attempt), succeeded.attempt.id);
    assert.equal(preserved.rows[0].containers, 12);
    assert.equal(preserved.rows[0].interactions, 12);

    const lockClient = await testPool.connect();
    try {
      const lockKey = `replay-processing-attempt:${reprocess.attempt.id}`;
      const lock = await lockClient.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [lockKey],
      );
      assert.equal(lock.rows[0].acquired, true);
      await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]);
    } finally {
      lockClient.release();
    }

    const lockedSha256 = randomBytes(32).toString('hex');
    const lockedRequest = structuredClone(request);
    lockedRequest.idempotencyKey = `locked-${suffix}`;
    lockedRequest.match.matchKey = `locked-match-${suffix}`;
    const lockedFile = await repository.registerFile({
      fileSha256: lockedSha256,
      fileName: 'locked.replay',
    });
    const processing = await testPool.query(
      `INSERT INTO fortnite_replay.tb_replay_processing_attempt
         (fk_id_replay_file, fk_id_analyzer_version, idempotency_key, request_sha256)
       SELECT $1, id_analyzer_version, $2, $3
       FROM fortnite_replay.tb_analyzer_version
       WHERE application_version = '3.2.0' AND analyzer_version = '14'
         AND parser_name = 'FortniteReplayReader' AND parser_version = '1.0.0.0'
       RETURNING id_attempt`,
      [lockedFile.file.id, lockedRequest.idempotencyKey, 'd'.repeat(64)],
    );
    const processingId = Number(processing.rows[0].id_attempt);
    const activeLock = await testPool.connect();
    const activeLockKey = `replay-processing-attempt:${processingId}`;
    try {
      await activeLock.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [activeLockKey]);
      const active = await repository.ingest(lockedSha256, lockedRequest, 'd'.repeat(64));
      assert.equal(active.outcome, 'processing');
      assert.equal(active.attempt.id, processingId);
      await assert.rejects(
        repository.ingest(lockedSha256, { ...lockedRequest, idempotencyKey: `other-${suffix}` }, 'e'.repeat(64)),
        ReplayConflictError,
      );
    } finally {
      await activeLock.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [activeLockKey]);
      activeLock.release();
    }
    const resumed = await repository.ingest(lockedSha256, lockedRequest, 'd'.repeat(64));
    assert.equal(resumed.attempt.id, processingId);
    assert.equal(resumed.attempt.status, 'success');
  } finally {
    pool.connect = originalConnect;
    console.error = originalError;
    await testPool.end();
  }
});
