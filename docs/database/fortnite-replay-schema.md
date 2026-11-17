# Fortnite Replay relational schema

## Purpose and boundaries

`source/database/fortnite_replay.sql` is the canonical PostgreSQL DDL for
Replay observations. It is designed from the ChestCounter
[`replay-data-dictionary.md`](../../source/src/reference/replay-data-dictionary.md),
not from the removed SQL scripts. Normalized observations are accompanied by
the parsed request as JSONB in `processing_attempt.snapshot_data`. This
per-attempt archive preserves parsed JSON values and nested presence/order that
the canonical match tables cannot reconstruct. JavaScript parses numbers before
storage, and JSONB does not preserve original byte formatting or object key
order. Protect it as player-identifying data.

Nullable columns retain unknown values as SQL `NULL`; booleans are not
defaulted to false and numbers are not defaulted to zero. `processing_section`
records whether each top-level parser section was present, explicitly null, or
missing in each attempt, and records the collection count when present. The
attempt's `parse_mode` explains which parser groups could have produced data.

The script is additive and does not drop schemas or tables. It creates the
`fortnite_replay` schema and is intended to be run once as the initial
structure. Existing deployments should apply
`source/database/fortnite_replay_snapshot_upgrade.sql` before deploying the
updated ingestion code.

## Tables and responsibilities

| Table | Responsibility |
|---|---|
| `replay_file` | File identity by validated SHA-256; stores no replay bytes. |
| `replay_upload` | Which source application submitted a replay and when. |
| `processing_attempt` | Idempotency, request digest, parser/analyzer versions, parse mode, status, timestamps, error history and archived request. |
| `processing_section` | Per-attempt presence/null/missing state and item count of each top-level parser section. |
| `game_match` | Canonical match identity, source GameData, Replay header values, and TeamStats. |
| `match_processing_attempt` | Links each processing attempt to at most one canonical match; a match can have multiple attempts. |
| `game_state_observation` | Ordered observations of changing GameState counters and phases. |
| `match_stats` | Event-provided match statistics, distinct from participant statistics and elimination events. |
| `player_identity` | Optional global identity for an explicitly known Epic, bot, or platform ID. |
| `match_player` | Match-scoped player snapshot and source identifiers/state. |
| `match_player_death_tag` | Ordered death tags for a player in a match. |
| `match_team` | Match-scoped observed team grouping; not a persistent team entity. |
| `match_team_member` | Ordered team player IDs/names and nullable resolved match-player relation. |
| `event_elimination` | The custom `eventEliminations` source with its event info and actor transforms. |
| `kill_feed` | The replicated `killFeed` source. Kept separate from custom elimination events. |
| `kill_feed_death_tag` | Ordered kill-feed death tags. |
| `map_snapshot` | World-grid values and POI tag table size for a match. |
| `map_poi_tag` | Ordered observed POI tags; no inferred POI names. |
| `battle_bus_flight_path` | Per-match observed flight path vectors, timings, and skin. |
| `map_safe_zone` | Observed safe-zone center and radius. |
| `map_llama` | Observed llama position, destination, and looted state. |
| `map_supply_drop` | Observed supply-drop landing/fall/balloon positions and looted state. |
| `map_reboot_van` | Observed actor GUID/handle, location, and state. |
| `movement_sample` | Sparse per-player `Full` replicated movement samples, including movement flags and vehicle references. |
| `weapon_observation` | Weapon actors and their observed name/ammo/level/fire/equipment state. |
| `equipped_item_observation` | Explicit generic equipment observations with time and actor/player references. |
| `container_interaction` | Container and Loot Cannon interaction observations with source actor, label, player references, state, and time. |
| `dropped_item_observation` | Observed dropped pickups, definitions, counts, owners, coordinates, toss state, and pickup flag. |
| `treasure_event` | Treasure event observations. |
| `prize_handler_grant` | Raw handler grant observations; the undocumented element-ID type is omitted. |

## Relationships and cardinalities

* One `replay_file` has zero or more application uploads and processing
  attempts. Each attempt references an upload for its application.
  `(file_sha256, application_id, idempotency_key)` uniquely identifies an
  attempt; request digest mismatch for the same key is a conflict.
* A processing attempt can be linked to at most one canonical match; a match
  can be linked to multiple attempts through `match_processing_attempt`. A
  shared `gameSessionId` joins Replay files to the same match; without it, the
  file SHA-256 is the conservative identity.
* A match has zero or one `match_stats` and `map_snapshot`, and zero or more
  participants, teams, GameState observations, movement samples, map objects,
  weapons, interactions, and events.
* A `player_identity` may be linked to many `match_player` rows. The
  match-scoped participant remains the authority for source IDs, mode-specific
  values, team membership, and references in events. IDs are linked globally
  only by exact identifiers; names and approximate matching are not identity
  keys.
* `match_team` and `match_team_member` are scoped to one match. A match player
  can be linked only when the replay ID resolves explicitly; unresolved
  members remain represented with source ID/name.
* `event_elimination` and `kill_feed` are separate one-to-many relations under
  a match. Their event keys are deterministic hashes calculated from each
  source's values for retry deduplication; they do not merge the two sources.
* `movement_sample` belongs to a match participant and to the processing
  attempt that supplied it. Actor IDs and paths remain nullable when the
  parser cannot resolve a reference.
* Event collections with attempt-scoped rows keep an ordinal or derived stable
  key. Map snapshots and map collections are canonical match observations, not
  a history of every processing attempt.

## Keys, constraints, and indexes

* Identity columns are `BIGINT GENERATED ALWAYS AS IDENTITY`; source actor
  references use `BIGINT` to retain unsigned 32-bit IDs. SHA-256 values are
  lowercase 64-character hex and checked in DDL.
* Source time values are `REAL`/`DOUBLE PRECISION` game-clock values and are
  not converted to wall-clock timestamps. Actual UTC values use `TIMESTAMPTZ`.
  This preserves source precision and distinguishes the replay timestamp,
  match-start timestamp, and relative event times.
* Partial unique indexes protect known global Epic, bot, and platform IDs
  without treating nullable identifiers as equal. `game_match.game_session_id`
  is uniquely indexed only when present; `identity_key` is always unique.
* Match-start/playlist, match-player identity/team/placement, event-time,
  movement match/player time, and container/dropped-item/treasure/grant time
  indexes support the expected filtered queries.
* Foreign keys cascade match-owned observations on match deletion; identity
  deletion does not delete match observations.

## Identity, ingestion, and idempotency

The file SHA-256 identifies a replay file; it is not a match ID or application
ID. The source `application_id` is recorded on each upload and attempt. A
canonical match key is generated as `session:<gameSessionId>` when the parser
provides a non-empty session ID. Otherwise the ingestion layer uses
`replay:<file_sha256>`, intentionally avoiding an unsupported guess that two
different files without a shared session ID represent the same match.

The endpoint should compute a SHA-256 digest of a canonicalized request body.
For an existing `(file_sha256, application_id, idempotency_key)`, the same
digest returns the prior attempt; a different digest returns a conflict. An
explicit reprocess uses a new idempotency key and records a new immutable
attempt with application/analyzer/parser versions, parse mode, timestamps, and
error details. Successful attempts retain the received JSON values in
`snapshot_data`; older attempts without an archive can populate it on an
identical retry.

Persist scalar snapshots using `INSERT ... ON CONFLICT` rules that update only
with newly observed non-null values. Keep `false` and `0` as real values.
Collection rows use source order plus a deterministic per-source key to make
retries idempotent. A `Normal` reprocess followed by `Full` therefore
complements absent movement data without replacing the match with invented
zeroes or duplicating events.

For throughput, validate and resolve IDs in memory, then use PostgreSQL
`COPY` into bounded staging tables (temporary to the transaction) or batched
multi-row inserts, followed by set-based upserts. Commit normalized rows and
attempt success atomically; on failure, roll back derived rows and retain a
failed attempt with its error/status. Do not silently drop unresolved
references: persist their source ID and leave the FK nullable.

## Movement storage and partitioning

`movement_sample` has a composite match/player relationship, an idempotency
key, a match-time index, and a player-time index. Read paths should require a
match and bounded time interval, order by
`replicated_world_time_seconds_double` then `id`, and use keyset pagination.
Bulk writes should use the parser's sample order and avoid one insert per
sample.

The initial DDL does not partition the table: the repository provides no
measured sample volume or retention horizon, and partitioning complicates
foreign keys, unique keys, and deployment. The access pattern is match-scoped;
if production measurements show a need, hash partitioning on `match_id` is the
first option to benchmark because it prunes for match queries without assuming
that game-clock values are wall-clock dates. Do not partition by sample time
until retention and time-range workload are measured.

## Observed, derived, and unavailable data

The parser-provided values are recorded as observations. Values such as
`event_elimination.library_distance`, POI visit intervals, landing points,
container classification, and vehicle enter/exit sessions are derived or
heuristic and are not represented as received facts by this schema. The
dictionary does not provide starting bot/player counts, full inventory,
reliable named POIs, continuous movement, vehicle actor transforms, complete
cosmetic member types, map-object timestamps/cooldown field names, or a token
classification catalog. The prize-handler element ID is named but its
serialized type is undocumented, so it is not exposed or persisted here.

The screenshot's exact totals for opened chests, treasures, and tokens cannot
all be faithfully reproduced from the current dictionary alone. Container
labels and states do not define a universal confirmed-open event, and prize
IDs do not define which grant is a token. Analytics must expose
observed counts with their real names and disclaimers rather than report those
visual labels as exact totals.

## Limitations in the source dictionary

The dictionary summarizes several nested model objects without enumerating all
serialized properties or their types. In particular, cosmetic property names
are listed without serialized types, and some map-object timestamps/state
fields are summarized rather than enumerated. The contract lists named
cosmetic members without accepting arbitrary additions; those values are not
persisted until parser definitions establish their relational types. The
field-by-field matrix identifies these limits instead of adding a generic JSON
column.
