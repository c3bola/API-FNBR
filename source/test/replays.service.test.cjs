const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ReplaysService } = require('../dist/modules/replays/replays.service.js');
const {
  ReplayConflictError,
  ReplayValidationError,
} = require('../dist/modules/replays/replays.errors.js');
const { ReplayExpressAdapter } = require('../dist/modules/replays/replays.bootstrap.js');
const { authMiddleware } = require('../dist/shared/middlewares/auth.middleware.js');
const { ReplaysRepository } = require('../dist/modules/replays/replays.repository.js');
const { pool } = require('../dist/infra/database/postgres.config.js');
const jwt = require('jsonwebtoken');

function createRequest() {
  return {
    idempotencyKey: 'attempt-1',
    analyzerVersion: {
      applicationVersion: '1.0',
      analyzerVersion: '1.0',
      parserName: 'parser',
      parserVersion: '1.0',
    },
    match: {
      matchKey: 'match-1',
    },
    matchPlayers: [
      {
        sourcePlayerKey: 'replay-player-1',
        playerType: 'unknown',
      },
      {
        sourcePlayerKey: 'replay-player-2',
        playerType: 'unknown',
      },
    ],
  };
}

test('hashes semantically identical requests consistently without inventing identities', async () => {
  const hashes = [];
  const repository = {
    registerFile: async () => {
      throw new Error('not used');
    },
    ingest: async (_sha256, request, requestSha256) => {
      hashes.push(requestSha256);
      assert.equal(request.matchPlayers[0].epicId, undefined);
      assert.equal(request.matchPlayers[0].botId, undefined);
      return { outcome: 'created', attempt: {} };
    },
  };
  const service = new ReplaysService(repository);

  const first = createRequest();
  const second = {
    matchPlayers: [...first.matchPlayers].reverse(),
    match: first.match,
    analyzerVersion: first.analyzerVersion,
    idempotencyKey: first.idempotencyKey,
  };
  await service.ingest('a'.repeat(64), first);
  await service.ingest('a'.repeat(64), second);

  assert.equal(hashes[0], hashes[1]);
});

test('rejects references to participants not present in the submitted match', async () => {
  let called = false;
  const repository = {
    registerFile: async () => {
      throw new Error('not used');
    },
    ingest: async () => {
      called = true;
      return { outcome: 'created', attempt: {} };
    },
  };
  const service = new ReplaysService(repository);
  const request = createRequest();
  request.vehicleUsages = [
    {
      sourceId: 'vehicle-use-1',
      sourcePlayerKey: 'missing-player',
      vehicleCode: 'vehicle',
    },
  ];

  await assert.rejects(
    service.ingest('a'.repeat(64), request),
    ReplayValidationError,
  );
  assert.equal(called, false);
});

test('rejects invalid hashes before reaching persistence', async () => {
  let called = false;
  const repository = {
    registerFile: async () => {
      called = true;
      return { created: true, file: {} };
    },
    ingest: async () => {
      called = true;
      return { outcome: 'created', attempt: {} };
    },
  };
  const service = new ReplaysService(repository);

  await assert.rejects(
    service.ingest('not-a-sha256', createRequest()),
    ReplayValidationError,
  );
  assert.equal(called, false);
});

test('rejects malformed optional field types before reaching persistence', async () => {
  let called = false;
  const repository = {
    registerFile: async () => ({ created: true, file: {} }),
    ingest: async () => {
      called = true;
      return { outcome: 'created', attempt: {} };
    },
  };
  const service = new ReplaysService(repository);
  const request = createRequest();
  request.matchPlayers[0].currentDisplayName = 42;

  await assert.rejects(
    service.ingest('a'.repeat(64), request),
    ReplayValidationError,
  );
  assert.equal(called, false);
});

test('rejects properties not declared by the OpenAPI ingestion schemas', async () => {
  const service = new ReplaysService({
    registerFile: async () => ({ created: true, file: {} }),
    ingest: async () => ({ outcome: 'created', attempt: {} }),
  });
  const request = createRequest();
  request.matchPlayers[0].unexpected = true;

  await assert.rejects(
    service.ingest('a'.repeat(64), request),
    ReplayValidationError,
  );
});

test('requires the mandatory participant array and validates derived records', async () => {
  let called = false;
  const service = new ReplaysService({
    registerFile: async () => ({ created: true, file: {} }),
    ingest: async () => {
      called = true;
      return { outcome: 'created', attempt: {} };
    },
  });
  const invalidRequests = [
    (() => {
      const request = createRequest();
      delete request.matchPlayers;
      return request;
    })(),
    (() => {
      const request = createRequest();
      request.matchPlayers = {};
      return request;
    })(),
    (() => {
      const request = createRequest();
      request.containers = [{
        sourceId: 'container-1',
        containerKind: 'chest',
        interactions: [{ sourceId: 'interaction-1' }],
      }];
      return request;
    })(),
    (() => {
      const request = createRequest();
      request.rewards = [{ sourceId: 'reward-1', isTeammateReward: false }];
      return request;
    })(),
    (() => {
      const request = createRequest();
      request.vehicleUsages = [{
        sourceId: 'vehicle-1',
        sourcePlayerKey: 'missing-player',
        vehicleCode: 'vehicle',
      }];
      return request;
    })(),
    (() => {
      const request = createRequest();
      request.pois = [{ mapCode: 'map', poiCode: 'poi' }];
      return request;
    })(),
    (() => {
      const request = createRequest();
      request.safeZonePhases = [{ phaseNumber: 0 }];
      return request;
    })(),
  ];

  for (const request of invalidRequests) {
    await assert.rejects(
      service.ingest('a'.repeat(64), request),
      ReplayValidationError,
    );
  }
  assert.equal(called, false);
});

test('accepts only real RFC 3339 date-time values', async () => {
  const service = new ReplaysService({
    registerFile: async () => ({ created: true, file: {} }),
    ingest: async () => ({ outcome: 'created', attempt: {} }),
  });

  await assert.rejects(
    service.registerFile({
      fileSha256: 'a'.repeat(64),
      fileName: 'replay',
      fileCreatedAt: '2026',
    }),
    ReplayValidationError,
  );

  const request = createRequest();
  request.match.matchStartAt = '2026-02-31T12:00:00Z';
  await assert.rejects(
    service.ingest('a'.repeat(64), request),
    ReplayValidationError,
  );
});

test('requires a valid Bearer JWT and returns the documented error shape', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'unit-test-signing-key';
  const invoke = (authorization) => {
    const request = { headers: { authorization } };
    const response = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    let nextCalled = false;
    authMiddleware(request, response, () => {
      nextCalled = true;
    });
    return { request, response, nextCalled };
  };

  try {
    const missing = invoke(undefined);
    assert.equal(missing.response.statusCode, 401);
    assert.deepEqual(missing.response.body, {
      statusCode: 401,
      message: 'A Bearer token is required.',
      error: 'Unauthorized',
    });
    assert.equal(missing.nextCalled, false);

    const invalid = invoke('Bearer invalid');
    assert.equal(invalid.response.statusCode, 401);
    assert.equal(invalid.response.body.error, 'Unauthorized');
    assert.equal(invalid.nextCalled, false);

    const valid = invoke(`bearer ${jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET)}`);
    assert.equal(valid.nextCalled, true);
    assert.equal(valid.request.user.sub, 'user-1');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('validates and delegates replay file list filters', async () => {
  const filters = [];
  const service = new ReplaysService({
    listFiles: async (sha256, matchId) => {
      filters.push({ sha256, matchId });
      return [];
    },
  });

  await service.listFiles('a'.repeat(64), '123');
  assert.deepEqual(filters, [{ sha256: 'a'.repeat(64), matchId: 123 }]);

  await assert.rejects(
    service.listFiles('invalid'),
    ReplayValidationError,
  );
  await assert.rejects(
    service.listFiles(undefined, 1.5),
    ReplayValidationError,
  );
});

test('treats a duplicate file name change as a metadata conflict', async () => {
  const originalConnect = pool.connect;
  const row = {
    id_replay_file: '1',
    file_sha256: 'a'.repeat(64),
    fk_id_match: null,
    fk_id_successful_attempt: null,
    file_size_bytes: '100',
    file_created_at: new Date('2026-01-01T00:00:00Z'),
    created_at: new Date('2026-01-02T00:00:00Z'),
    file_name: 'original.replay',
  };
  pool.connect = async () => ({
    query: async (sql) => {
      if (sql.includes('INSERT INTO fortnite_replay.tb_replay_file')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT') && sql.includes('tb_replay_file')) {
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  });

  try {
    const repository = new ReplaysRepository();
    const result = await repository.registerFile({
      fileSha256: row.file_sha256,
      fileName: row.file_name,
      fileSizeBytes: 100,
      fileCreatedAt: '2026-01-01T00:00:00Z',
    });
    assert.equal(result.created, false);

    await assert.rejects(
      repository.registerFile({
        fileSha256: row.file_sha256,
        fileName: 'renamed.replay',
        fileSizeBytes: 100,
        fileCreatedAt: '2026-01-01T00:00:00Z',
      }),
      ReplayConflictError,
    );
  } finally {
    pool.connect = originalConnect;
  }
});

test('applies endpoint status overrides while preserving error response status', () => {
  const adapter = new ReplayExpressAdapter();
  const response = {
    locals: { replayStatusCode: 200 },
    getHeader() {
      return undefined;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  adapter.reply(response, { id: 1 }, 201);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { id: 1 });
  assert.equal(response.locals.replayStatusCode, undefined);

  response.locals.replayStatusCode = 200;
  adapter.reply(response, { error: 'failed' }, 422);
  assert.equal(response.statusCode, 422);
});

test('logs the original ingestion error before a failure while marking the attempt', async () => {
  const originalConnect = pool.connect;
  const originalError = console.error;
  const logs = [];
  const primary = Object.assign(new Error('original database failure'), {
    code: '23514',
    constraint: 'test_constraint',
  });
  const secondary = new Error('failed to update attempt');
  console.error = (entry) => logs.push(JSON.parse(entry));
  pool.connect = async () => ({
    query: async (sql) => {
      if (sql.includes('SELECT id_replay_file')) return { rows: [{ id_replay_file: 1 }] };
      if (sql.includes('a.idempotency_key = $2')) return { rows: [] };
      if (sql.includes('SELECT id_attempt')) return { rows: [] };
      if (sql.includes('SELECT id_analyzer_version')) return { rows: [{ id_analyzer_version: 1 }] };
      if (sql.includes('INSERT INTO fortnite_replay.tb_replay_processing_attempt')) {
        return { rows: [{ id_attempt: 2 }] };
      }
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ released: true }] };
      if (sql.includes('INSERT INTO fortnite_replay.tb_match')) throw primary;
      if (sql.includes("SET status = 'failed'")) throw secondary;
      return { rows: [], rowCount: 0 };
    },
    release() {},
  });

  try {
    await assert.rejects(
      new ReplaysRepository().ingest('a'.repeat(64), createRequest(), 'b'.repeat(64)),
      (error) => error === secondary,
    );
    assert.equal(logs.length, 2);
    assert.equal(logs[0].stage, 'match');
    assert.equal(logs[0].attemptId, 2);
    assert.equal(logs[0].fileSha256, 'a'.repeat(64));
    assert.equal(logs[0].error.message, primary.message);
    assert.equal(logs[0].error.sqlState, '23514');
    assert.equal(logs[0].error.constraint, 'test_constraint');
    assert.equal(logs[0].error.stack, primary.stack);
    assert.equal(logs[1].stage, 'attempt_mark_failed');
    assert.equal(logs[1].error.message, secondary.message);
  } finally {
    pool.connect = originalConnect;
    console.error = originalError;
  }
});

test('reports rollback failure and discards the connection without marking the attempt', async () => {
  const originalConnect = pool.connect;
  const originalError = console.error;
  const logs = [];
  const primary = new Error('original database failure');
  const rollbackError = new Error('rollback failed');
  let releasedWith;
  let attemptedUpdate = false;
  console.error = (entry) => logs.push(JSON.parse(entry));
  pool.connect = async () => ({
    query: async (sql) => {
      if (sql.includes('SELECT id_replay_file')) return { rows: [{ id_replay_file: 1 }] };
      if (sql.includes('a.idempotency_key = $2')) return { rows: [] };
      if (sql.includes('SELECT id_attempt')) return { rows: [] };
      if (sql.includes('SELECT id_analyzer_version')) return { rows: [{ id_analyzer_version: 1 }] };
      if (sql.includes('INSERT INTO fortnite_replay.tb_replay_processing_attempt')) {
        return { rows: [{ id_attempt: 2 }] };
      }
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ released: true }] };
      if (sql.includes('INSERT INTO fortnite_replay.tb_match')) throw primary;
      if (sql === 'ROLLBACK') throw rollbackError;
      if (sql.includes("SET status = 'failed'")) attemptedUpdate = true;
      return { rows: [], rowCount: 0 };
    },
    release(error) { releasedWith = error; },
  });

  try {
    await assert.rejects(
      new ReplaysRepository().ingest('a'.repeat(64), createRequest(), 'b'.repeat(64)),
      (error) => error === rollbackError,
    );
    assert.deepEqual(logs.map((entry) => entry.stage), ['match', 'data_transaction_rollback']);
    assert.equal(logs[0].error.message, primary.message);
    assert.equal(logs[1].error.message, rollbackError.message);
    assert.equal(attemptedUpdate, false);
    assert.equal(releasedWith, rollbackError);
  } finally {
    pool.connect = originalConnect;
    console.error = originalError;
  }
});
