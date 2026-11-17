# Modular OpenAPI — Fortnite Brasil Admin API

This package refactors the original `openapi.yaml` into a modular structure while preserving the existing paths, schemas, tags, servers, and security scheme.

## Structure

```text
openapi/
├── index.yaml                 # main entrypoint
├── components/
│   └── security.yaml          # shared components
├── domains/
│   ├── auth/
│   │   ├── index.yaml         # domain aggregator
│   │   ├── paths/
│   │   └── schemas/
│   ├── groups/
│   │   ├── index.yaml         # domain aggregator
│   │   ├── paths/
│   │   └── schemas/
│   ├── members/
│   ├── vips/
│   ├── announcements/
│   ├── giveaways/
│   ├── replay/
│   └── analytics/
├── all-paths.yaml              # technical path aggregator
├── all-schemas.yaml            # technical schema aggregator
└── dist/
    └── openapi.yaml            # optional generated artifact
```

## Why this organization?

Each domain has an `index.yaml` that acts as an aggregator. Within each domain, endpoints are split by functional area and schemas are kept in individual files. This prevents files such as `groups.yaml` from growing indefinitely as new group sub-routes are added.

The `all-paths.yaml` and `all-schemas.yaml` files provide the technical aggregation required by the root `index.yaml` without duplicating API contracts.

## Bundling tool

The **Redocly CLI** is used to validate and bundle the OpenAPI files. It resolves external `$ref` references and produces a single OpenAPI document consumable by OpenAPI Generator.

Local installation:

```bash
npm install
```

Or install globally if preferred:

```bash
npm install -g @redocly/cli
```

## Bundle command

From the package/project root:

```bash
npx redocly bundle openapi/index.yaml -o ./openapi.yaml
```

Because `package.json` already defines the equivalent script, you can also use:

```bash
cd v1
    npm run openapi:bundle
```


## OpenAPI Generator

After bundling, use **`openapi.yaml`** as the OpenAPI Generator input. Generic example:

```bash
openapi-generator-cli generate -i openapi.yaml ...
```

Replace the remaining parameters (`-g`, `-o`, `-c`, etc.) with the parameters already used by your project.

## Maintenance rule

Do not edit `openapi.yaml` manually. It is a generated artifact.

To add a new feature:

1. Edit or create the functional file inside `domains/<domain>/paths/`.
2. Edit or create the corresponding schema inside `domains/<domain>/schemas/`.
3. Add the `$ref` entries to `domains/<domain>/index.yaml`.
4. Run `npm run openapi:build`.
5. Use `openapi.yaml` with OpenAPI Generator.

## `$ref` note

Domain files are aggregators and do not need to be complete OpenAPI documents. The root `index.yaml` is the main OpenAPI document. Redocly resolves `$ref` references during bundling and produces the final consolidated document.

## Compatibility note

API field names and existing enum values are intentionally preserved, including values currently used by the backend such as `pt-BR`, `Geral`, `Membro`, and other domain literals. These are contract values rather than documentation text; translating them would change the API contract. Human-readable summaries, descriptions, and comments are written in English.

## Replay ingestion diagnostics

`match.gameData.utcTimeStartedMatch` and `match.replayTimestamp` are passed to
PostgreSQL without conversion. PostgreSQL validates them and interprets an
omitted timezone using the database session's `TimeZone` setting because both
columns are `timestamptz`.

Replay ingestion uses the same Bearer JWT as other protected API endpoints.
The submitting `application_id` is checked against `REPLAY_APPLICATION_ID`
(default `chestcounter`) and recorded for traceability; it does not authenticate
the request. Configure `JWT_SECRET` for the API's JWT issuer and verifier.
`POST /api/v1/auth/mock` issues a general JWT only when `NODE_ENV=development`;
it is not available in production.

The receive transaction stores the exact JSON request bytes in
`processing_attempt.original_payload`, along with its SHA-256, idempotency
metadata, and an `accepted` attempt. The API returns `202` only after that
transaction commits. Workers in the API process consume this PostgreSQL inbox
with row locks and leases; no in-memory queue is used as the durable record.
The normalized snapshot and relational data are written independently, after
acceptance. Unknown or invalid fields remain in the original bytes and are
summarized in `error_detail`; known `prizeHandlerGrants[].timeSeconds` values
are normalized to the canonical `time` property. `payload_sha256` hashes the
exact request bytes; `request_sha256` retains the canonical JSON digest used by
the existing idempotency rule, so insignificant whitespace does not change it.
Authenticated requests with malformed JSON are not accepted as attempts, but
the parser preserves their original bytes in `ingestion_diagnostic` when they
are at most 1 MiB and include a valid Replay SHA-256 in the route. Optional
`X-Application-Id` and `Idempotency-Key` headers are recorded for diagnosis;
invalid or oversized bodies are still rejected without entering the inbox.

Apply
[`20261115_replay_ingestion_inbox.sql`](../../database/migrations/20261115_replay_ingestion_inbox.sql)
to an existing replay database before deploying this version. The complete
schema for new installations is
[`fortnite_replay.sql`](../../database/fortnite_replay.sql). The migration
backfills original payload bytes from existing JSON snapshots where possible;
it cannot reconstruct exact historical request bytes.

Worker settings are bounded: `REPLAY_WORKER_CONCURRENCY` defaults to 2 (range
1–8), `REPLAY_WORKER_POLL_INTERVAL_MS` defaults to 1000 (100–30000), and
`REPLAY_WORKER_LEASE_SECONDS` defaults to 300 (30–3600). Transient processing
failures retry up to five times with exponential backoff; expired leases make
interrupted work claimable again. The API's PostgreSQL pool has ten connections,
so keep worker concurrency below the pool capacity to leave room for HTTP work.

The worker prunes completed processing-stage rows and malformed-request
diagnostic payloads older than `REPLAY_DIAGNOSTICS_RETENTION_DAYS` (default 90,
range 1–3650) in batches of at most 5,000 rows per table, once per day. Accepted
replay payloads and processing attempts are retained for recovery and audit;
configure a separate reviewed retention policy for those records and restrict
database access and backups accordingly.

## Replay and Analytics contract

The Replay and Analytics domains are modeled in the same modular OpenAPI
contract. The route catalog, supported metrics, query conventions, and
parser/schema limitations are documented in
[`docs/api/replay-analytics-route-redesign.md`](../../../docs/api/replay-analytics-route-redesign.md).
The contract exposes documented map, movement, weapon, dropped-item, and
special-event observations. It does not expose inferred results such as
continuous trajectories, named POI visits, confirmed chest openings, or token
counts.

A failed attempt remains in the history. Reusing its idempotency key and the
same request returns that failed attempt; use a new key for an explicit retry.
An in-progress attempt may instead be resumed if its advisory lock is no longer
held. Never delete attempts to retry.

The proposed relational schema is defined in
[`source/database/fortnite_replay.sql`](../../database/fortnite_replay.sql).
The existing opt-in repository integration test uses the backend's legacy
tables and is not a validator for this DDL. Any PostgreSQL test must use an
isolated local database and must never target production.

## Replay processing observability

Apply
[`20261115_replay_processing_observability.sql`](../../database/migrations/20261115_replay_processing_observability.sql)
after the inbox migration. `processing_stage` stores attempt-linked stage
timings, outcomes, aggregate metrics, and bounded error details; it never
stores a second copy of the replay payload. Writes to this table are
best-effort and cannot roll back an accepted replay.

The parser runs in the submitting client. The API can trace receipt and the
resulting snapshot, but records `PARSER_STARTED` and `PARSER_COMPLETED` as
skipped because it cannot observe execution inside that client. Normalization
and PostgreSQL persistence stages include container counts, exact duplicate
counts, rejected-item samples, and player-link coverage. A replay with no
container observations is reported as having no container data, not as a
processing failure.

Administrative endpoints require a Bearer JWT whose role is `Admin` or
`SuperAdmin` (case-insensitive):

```text
GET /api/v1/admin/replays/health
GET /api/v1/admin/replays/metrics
GET /api/v1/admin/replays/attempts?status=failed&from=2026-11-15T00:00:00Z
GET /api/v1/admin/replays/attempts/{id}
GET /api/v1/admin/replays/attempts/{id}/containers
```

The attempt detail includes the durable timeline and identifiers but omits
the raw payload. The containers endpoint returns aggregate counts and at most
100 stored-observation samples. Metrics are queried from PostgreSQL, including
queue state and lease expiry. `partial_success` describes integrity or player
attribution warnings; it does not change the existing processing-attempt
status enum.

The documented
`GET /api/v1/matches/{match_id}/container-interactions` route is also
implemented. `interaction_kind` and `source_actor_key` may be null because the
database and accepted parser snapshot allow unclassified or unresolved sources.
Use its `processing_attempt_id` filter to distinguish observations retained from
different ingestion attempts for the same match.
