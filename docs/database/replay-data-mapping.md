# Replay parser-to-database mapping

Audit of [`replay-data-dictionary.md`](../../source/src/reference/replay-data-dictionary.md),
the current ChestCounter serializer and parser models, the provided real
capture, [`fortnite_replay.sql`](../../source/database/fortnite_replay.sql),
the service, repository and OpenAPI. The dictionary is authoritative for
semantics, but some of its claims about the outgoing JSON are stale; the actual
serializer and models resolve the serialized names and types. `Conditional`
means a field depends on replay content or parse mode, not that it is absent
from the JSON.

The tables below are the original audit, retained as historical context. Their
"pending" labels and proposed changes describe the implementation before the
snapshot compatibility update; they are not a current deployment checklist.

The supplied capture is accepted by the updated validator. A successful
attempt stores the parsed request in `processing_attempt.snapshot_data` as
JSONB in the same transaction as the normalized rows. This preserves
property presence, array order, named floating-point strings, and timestamp
text for each attempt, including values not reconstructible from the canonical
match tables. JavaScript parses JSON numbers before persistence, so arbitrary
numeric literals cannot be assumed byte-for-byte or decimal-exact. JSONB also
does not preserve original byte formatting or object key order. Existing successful attempts receive this archive on an
identical idempotent retry if their archive is absent.

The normalized mappings now include player inventory ID and death-vector
metadata, numeric elimination actor types, elimination and kill-feed vector
metadata, safe-zone timings/radii/centers, dropped-item vector metadata,
lowercase weapon properties, and equipped item names. Cosmetics remain JSONB.
Container kind and a missing source actor are not inferred. The upgrade script
is `source/database/fortnite_replay_snapshot_upgrade.sql`; apply it to an
existing schema before deploying the repository changes. It does not backfill
old requests without an identical retry. Retain the snapshot under the same
access controls and retention policy as its player-identifying data.

Canonical match rows can still be merged or replaced by later attempts. The
per-attempt JSONB archive, not the canonical rows alone, preserves parsed
JSON values and distinctions for historical snapshots. Zone-free timestamps
are interpreted by PostgreSQL's session timezone in timestamp columns; the
original spelling is preserved in the archive. Fields belonging only to
unpopulated or null structures in this capture have not been independently
verified against other parser outputs.

The request envelope (`application_id`, `idempotency_key`, analyzer metadata,
and file SHA-256) is transport/processing metadata, not part of `data`.
Processing fields are persisted in `replay_upload` and `processing_attempt`.
Player cosmetics are stored in `match_player.cosmetics` as JSONB.

## Match

| JSON path | JSON type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `match.gameData.gameSessionId` | string/null | Minimal, conditional | `game_match.game_session_id` | Natural match key when present. |
| `match.gameData.utcTimeStartedMatch` | date-time/null | Minimal, conditional | `game_match.utc_time_started_match` | `timestamptz`; source timestamp. |
| `match.gameData.matchEndTime` | number/null | Minimal, conditional | `game_match.match_end_time` | Replicated game-clock value; not converted into a timestamp. |
| `match.replayTimestamp` | date-time/null | Header/events, conditional | `game_match.replay_timestamp` | Kept distinct from match start. |
| `match.replayLengthInMilliseconds` | integer/null | Header, conditional | `game_match.replay_length_milliseconds` | Milliseconds; not interpreted as match duration. |
| `match.replayBranch` | string/null | Header, conditional | `game_match.replay_branch` | Stored verbatim. |
| `match.gameData.currentPlaylist` | string/null | Minimal, conditional | `game_match.current_playlist` | Stored verbatim. |
| `match.gameData.mapInfo` | string/null | Minimal, conditional | `game_match.map_info` | Stored verbatim; not translated to a map catalog. |
| `match.gameData.additionalPlaylistLevels[]` | string array/null | Minimal, conditional | `game_match.additional_playlist_levels[]` | PostgreSQL text array. |
| `match.gameData.activeGameplayModifiers[]` | string array | Minimal, conditional | `game_match.active_gameplay_modifiers[]` | PostgreSQL text array. |
| `match.gameData.recorderId` | unsigned integer/null | Minimal, conditional | `game_match.recorder_id` | Stored as bigint actor ID, not a player identity. |
| `match.gameData.teamCount` | integer/null | Minimal, conditional | `game_match.team_count` | Source value only. |
| `match.gameData.teamSize` | integer/null | Minimal, conditional | `game_match.team_size` | Source value only. |
| `match.gameData.playerBotsLeft` | integer/null | Minimal, conditional | `game_match.player_bots_left` | Not interpreted as starting bot count. |
| `match.gameData.playersLeft` | integer/null | Minimal, conditional | `game_match.players_left` | Source state only. |
| `match.gameData.teamsLeft` | integer/null | Minimal, conditional | `game_match.teams_left` | Source state only. |
| `match.gameData.elapsedTime` | integer/null | Minimal, conditional | `game_match.elapsed_time` | Source value; not used to invent a duration. |
| `match.gameData.gamePhase` | integer/null | Minimal, conditional | `game_match.game_phase` | Numeric enum kept unchanged. |
| `match.gameData.safeZonePhase` | byte/null | Minimal, conditional | `game_match.safe_zone_phase` | Numeric state kept unchanged. |
| `match.gameData.hasBegunPlay` | boolean/null | Minimal, conditional | `game_match.has_begun_play` | Nullable boolean; false is distinct from unknown. |
| `match.gameData.gameStateObservations[]` | object array | Minimal, conditional | `game_state_observation` | One row per emitted observation, with its source order and processing attempt. |
| `match.gameData.gameStateObservations[].worldTimeSeconds` | number/null | Legacy API input | `game_state_observation.world_time_seconds` | Retained for compatibility; not inferred from either parser clock. |
| `match.gameData.gameStateObservations[].replicatedWorldTimeSeconds` | number/null | Minimal, conditional | `game_state_observation.replicated_world_time_seconds` | Single-precision parser clock. |
| `match.gameData.gameStateObservations[].replicatedWorldTimeSecondsDouble` | number/null | Minimal, conditional | `game_state_observation.replicated_world_time_seconds_double` | Double-precision parser clock. |
| `match.gameData.gameStateObservations[].hasBegunPlay` | boolean/null | Minimal, conditional | `game_state_observation.has_begun_play` | Nullable source flag. |
| `match.gameData.gameStateObservations[].teamCount` | integer/null | Minimal, conditional | `game_state_observation.team_count` | Nullable source value. |
| `match.gameData.gameStateObservations[].teamSize` | integer/null | Minimal, conditional | `game_state_observation.team_size` | Nullable source value. |
| `match.gameData.gameStateObservations[].playerBotsLeft` | integer/null | Minimal, conditional | `game_state_observation.player_bots_left` | Not a starting count. |
| `match.gameData.gameStateObservations[].playersLeft` | integer/null | Minimal, conditional | `game_state_observation.players_left` | Nullable source value. |
| `match.gameData.gameStateObservations[].teamsLeft` | integer/null | Minimal, conditional | `game_state_observation.teams_left` | Nullable source value. |
| `match.gameData.gameStateObservations[].elapsedTime` | integer/null | Minimal, conditional | `game_state_observation.elapsed_time` | Nullable source value. |
| `match.gameData.gameStateObservations[].gamePhase` | integer/null | Minimal, conditional | `game_state_observation.game_phase` | Nullable numeric enum. |
| `match.gameData.gameStateObservations[].safeZonePhase` | byte/null | Minimal, conditional | `game_state_observation.safe_zone_phase` | Nullable numeric state. |
| `match.gameData.maxPlayers` | integer/null | Minimal, conditional | `game_match.max_players` | No substitute is inferred. |
| `match.gameData.totalTeams` | integer/null | Minimal, conditional | `game_match.total_teams` | Observed team rows are not used to infer it. |
| `match.gameData.totalBots` | integer/null | Minimal, conditional | `game_match.total_bots` | `playerBotsLeft` is not a substitute. |
| `match.gameData.tournamentRound` | integer/null | Minimal, conditional | `game_match.tournament_round` | Source value. |
| `match.gameData.isLargeTeamGame` | boolean/null | Minimal, conditional | `game_match.is_large_team_game` | Nullable source flag. |
| `match.gameData.totalPlayerStructures` | integer/null | Minimal, conditional | `game_match.total_player_structures` | Source count. |
| `match.gameData.winningTeam` | unsigned integer/null | Minimal, conditional | `game_match.winning_team` | Source team identifier. |
| `match.gameData.winningPlayerIds[]` | integer array/null | Minimal, conditional | `game_match.winning_player_ids[]` | Source player IDs, not inferred from placement. |
| `match.gameData.aircraftStartTime` | number/null | Minimal, conditional | `game_match.aircraft_start_time` | Raw game-clock value. |
| `match.gameData.safeZonesStartTime` | number/null | Minimal, conditional | `game_match.safe_zones_start_time` | Raw game-clock value. |
| `match.stats.totalTraveled` | number/null | EventsOnly+, conditional | `match_stats.total_traveled` | Parser-reported value; not reconstructed from samples. |
| `match.stats.accuracy` | number/null | EventsOnly+, conditional | `match_stats.accuracy` | Source statistic. |
| `match.stats.unknown` | integer/null | EventsOnly+, conditional | `match_stats.unknown_value` | Preserved despite the source's generic name. |
| `match.stats.assists` | integer/null | EventsOnly+, conditional | `match_stats.assists` | Source statistic. |
| `match.stats.eliminations` | integer/null | EventsOnly+, conditional | `match_stats.eliminations` | Source statistic, not event-row count. |
| `match.stats.weaponDamage` | integer/null | EventsOnly+, conditional | `match_stats.weapon_damage` | Source statistic. |
| `match.stats.otherDamage` | integer/null | EventsOnly+, conditional | `match_stats.other_damage` | Source statistic. |
| `match.stats.revives` | integer/null | EventsOnly+, conditional | `match_stats.revives` | Source statistic. |
| `match.stats.damageTaken` | integer/null | EventsOnly+, conditional | `match_stats.damage_taken` | Source statistic. |
| `match.stats.damageToStructures` | integer/null | EventsOnly+, conditional | `match_stats.damage_to_structures` | Source statistic. |
| `match.stats.materialsGathered` | integer/null | EventsOnly+, conditional | `match_stats.materials_gathered` | Source statistic. |
| `match.stats.materialsUsed` | integer/null | EventsOnly+, conditional | `match_stats.materials_used` | Source statistic. |
| `match.stats.damageToPlayers` | number/null | Not included in snapshot | — | Derived library property is explicitly not persisted. |
| `match.teamStats.position` | unsigned integer | EventsOnly+, conditional | `game_match.team_stats_position` | Source event value. |
| `match.teamStats.totalPlayers` | unsigned integer | EventsOnly+, conditional | `game_match.team_stats_total_players` | Source event value; not a starting-player count. |
| `match.teamStats.unknown` | unsigned integer | EventsOnly+, conditional | `game_match.team_stats_unknown` | Original unsigned value stored as bigint. |
| `match.stats.info.id/group/metadata/startTime/endTime/sizeInBytes` | EventInfo/null | EventsOnly+, conditional | `match_stats.event_id/event_group/event_metadata/event_start_time/event_end_time/event_size_in_bytes` | Source event metadata; times are bigint, not timestamps. |
| `match.teamStats.info.id/group/metadata/startTime/endTime/sizeInBytes` | EventInfo/null | EventsOnly+, conditional | `game_match.team_stats_event_id/team_stats_event_group/team_stats_event_metadata/team_stats_event_start_time/team_stats_event_end_time/team_stats_event_size_in_bytes` | Source event metadata; times are bigint, not timestamps. |

## Players and teams

| JSON path | JSON type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `players[].id` | integer/null | Minimal, conditional | `match_player.replay_player_id` | Match-scoped parser ID. |
| `players[].playerId` | string/null | Minimal, derived getter | `match_player.parser_player_id` | Retained as serialized; not used as a substitute for component IDs. |
| `players[].epicId` | string/null | Minimal, conditional | `match_player.epic_id`; `player_identity.epic_id` | Global link only when identity is unambiguous. |
| `players[].platformUniqueNetId` | string/null | Minimal, conditional | `match_player.platform_unique_net_id`; `player_identity.platform_unique_net_id` | Same exact-identity rule. |
| `players[].botId` | string/null | Minimal, conditional | `match_player.bot_id`; `player_identity.bot_id` | Kept separate from human identifiers. |
| `players[].isBot` | boolean | Minimal, conditional | `match_player.is_bot` | Never inferred from name or identifier. |
| `players[].playerName` | string/null | Minimal, conditional | `match_player.player_name`; `player_identity.latest_player_name` | Match snapshot plus optional latest display value. |
| `players[].playerNameCustomOverride` | string/null | Minimal, conditional | `match_player.player_name_custom_override` | Stored verbatim. |
| `players[].streamerModeName` | string/null | Minimal, conditional | `match_player.streamer_mode_name` | Stored verbatim. |
| `players[].platform` | string/null | Minimal, conditional | `match_player.platform` | Stored verbatim. |
| `players[].level` | integer/null | Minimal, conditional | `match_player.level` | Source value. |
| `players[].seasonLevelUIDisplay` | unsigned integer/null | Minimal, conditional | `match_player.season_level_ui_display` | Stored as bigint. |
| `players[].playerNumber` | integer/null | Minimal, conditional | `match_player.player_number` | World player number, not placement. |
| `players[].teamIndex` | integer/null | Minimal, conditional | `match_player.team_index`; `match_team.team_index` | Match-scoped only. |
| `players[].isPartyLeader` | boolean | Minimal, conditional | `match_player.is_party_leader` | Nullable source flag. |
| `players[].isReplayOwner` | boolean | Minimal, conditional | `match_player.is_replay_owner` | Nullable source flag. |
| `players[].isGameSessionOwner` | boolean/null | Minimal, conditional | `match_player.is_game_session_owner` | Nullable source flag. |
| `players[].hasFinishedLoading` | boolean/null | Minimal, conditional | `match_player.has_finished_loading` | Nullable source flag. |
| `players[].hasStartedPlaying` | boolean/null | Minimal, conditional | `match_player.has_started_playing` | Nullable source flag. |
| `players[].hasThankedBusDriver` | boolean/null | Minimal, conditional | `match_player.has_thanked_bus_driver` | Nullable source flag. |
| `players[].isUsingStreamerMode` | boolean/null | Minimal, conditional | `match_player.is_using_streamer_mode` | Nullable source flag. |
| `players[].isUsingAnonymousMode` | boolean/null | Minimal, conditional | `match_player.is_using_anonymous_mode` | Nullable source flag. |
| `players[].disconnected` | boolean/null | Minimal, conditional | `match_player.disconnected` | Last observed state, not a connection history. |
| `players[].rebootCounter` | unsigned integer/null | Minimal, conditional | `match_player.reboot_counter` | Source value. |
| `players[].placement` | integer/null | Minimal, conditional | `match_player.placement` | Source value. |
| `players[].kills` | unsigned integer/null | Minimal, conditional | `match_player.kills` | Not replaced by elimination event count. |
| `players[].teamKills` | unsigned integer/null | Minimal, conditional | `match_player.team_kills` | Source value. |
| `players[].deathCause` | integer/null | Minimal, conditional | `match_player.death_cause` | Source value. |
| `players[].deathCircumstance` | integer/null | Minimal, conditional | `match_player.death_circumstance` | Source value. |
| `players[].deathTags[]` | string array/null | Minimal, conditional | `match_player_death_tag` | One row per value, preserving ordinal. |
| `players[].deathLocation` | FVector/null | Minimal, conditional | `match_player.death_location_x/y/z` | Vector split into scalar coordinates. |
| `players[].deathTime` | number/null | Minimal, conditional | `match_player.death_time` | Source world clock. |
| `players[].deathTimeDouble` | number/null | Minimal, conditional | `match_player.death_time_double` | Higher precision source world clock. |
| `players[].inventoryId` | unsigned integer/null | Conditional | — | No column; currently rejected by validation. |
| `players[].cosmetics` | object/null | Minimal/Normal, conditional | `match_player.cosmetics` JSONB | The repository stores accepted objects unchanged, but validation rejects legitimate parser properties including `characterGender` and `heroType`. |
| `players[].currentWeapon` | unsigned actor ID/null | Minimal, conditional | `match_player.current_weapon_actor_id` | Actor reference, not weapon name. |
| `teams[].teamIndex` | integer/null | Minimal, conditional | `match_team.team_index` | Match-scoped grouping. |
| `teams[].playerIds[]` | integer/null array | Minimal, conditional | `match_team_member.replay_player_id` | One ordered member row; nullable unresolved participant FK. |
| `teams[].playerNames[]` | string/null array | Minimal, conditional | `match_team_member.player_name` | Stored as observed; no fuzzy identity resolution. |
| `teams[].partyOwnerId` | integer/null | Minimal, conditional | `match_team.party_owner_replay_player_id` | Source player identifier. |
| `teams[].placement` | integer/null | Minimal, conditional | `match_team.placement` | Source member-derived value. |
| `teams[].teamKills` | unsigned integer/null | Minimal, conditional | `match_team.team_kills` | Source member-derived value. |

## Elimination sources

`eventEliminations` and `killFeed` have independent tables and remain
independently queryable. Neither is silently merged or counted as the other.

| JSON path | JSON type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `eventEliminations[].eventInfo.id` | string/null | Events, conditional | `event_elimination.event_id` | Implemented. |
| `eventEliminations[].eventInfo.group` | string/null | Events, conditional | `event_elimination.event_group` | Source metadata. |
| `eventEliminations[].eventInfo.metadata` | string/null | Events, conditional | `event_elimination.event_metadata` | Source metadata text. |
| `eventEliminations[].eventInfo.startTime` | number/null | Events, conditional | `event_elimination.event_start_time` | Source clock. |
| `eventEliminations[].eventInfo.endTime` | number/null | Events, conditional | `event_elimination.event_end_time` | Source clock. |
| `eventEliminations[].eventInfo.sizeInBytes` | integer/null | Events, conditional | `event_elimination.event_size_in_bytes` | Source size. |
| `eventEliminations[].eliminated.id` | string/null | Events, conditional | `event_elimination.eliminated_id` | Source event identifier. |
| `eventEliminations[].eliminated.playerType` | numeric enum | Events, conditional | `event_elimination.eliminated_player_type` TEXT | Pending: parser emits number; service/OpenAPI require string. |
| `eventEliminations[].eliminated.location` | FVector/null | Events, conditional | `event_elimination.eliminated_location_x/y/z` | Split into coordinates. |
| `eventEliminations[].eliminated.rotation` | FQuat/null | Events, conditional | `event_elimination.eliminated_rotation_x/y/z/w` | Split into components. |
| `eventEliminations[].eliminated.scale` | FVector/null | Events, conditional | `event_elimination.eliminated_scale_x/y/z` | Split into components. |
| `eventEliminations[].eliminator.id` | string/null | Events, conditional | `event_elimination.eliminator_id` | Source event identifier. |
| `eventEliminations[].eliminator.playerType` | numeric enum | Events, conditional | `event_elimination.eliminator_player_type` TEXT | Pending: parser emits number; service/OpenAPI require string. |
| `eventEliminations[].eliminator.location` | FVector/null | Events, conditional | `event_elimination.eliminator_location_x/y/z` | Split into coordinates. |
| `eventEliminations[].eliminator.rotation` | FQuat/null | Events, conditional | `event_elimination.eliminator_rotation_x/y/z/w` | Split into components. |
| `eventEliminations[].eliminator.scale` | FVector/null | Events, conditional | `event_elimination.eliminator_scale_x/y/z` | Split into components. |
| `eventEliminations[].gunType` | byte | Events, conditional | `event_elimination.gun_type` | Numeric source code. |
| `eventEliminations[].knocked` | boolean | Events, conditional | `event_elimination.knocked` | Knock state; not a final-elimination assertion. |
| `eventEliminations[].libraryDistance` | number/null | Events, derived by library | `event_elimination.library_distance` | Retained as emitted and marked derived. |
| `killFeed[].playerId` | integer/null | Minimal, conditional | `kill_feed.player_replay_id` | Match-scoped reference. |
| `killFeed[].playerName` | string/null | Minimal, conditional | `kill_feed.player_name` | Source text. |
| `killFeed[].playerIsBot` | boolean | Minimal, conditional | `kill_feed.player_is_bot` | Source flag. |
| `killFeed[].finisherOrDowner` | integer/null | Minimal, conditional | `kill_feed.finisher_or_downer_replay_id` | Match-scoped reference; may not resolve. |
| `killFeed[].finisherOrDownerName` | string/null | Minimal, conditional | `kill_feed.finisher_or_downer_name` | Source text. |
| `killFeed[].finisherOrDownerIsBot` | boolean | Minimal, conditional | `kill_feed.finisher_or_downer_is_bot` | Source flag. |
| `killFeed[].replicatedWorldTimeSeconds` | number/null | Minimal, conditional | `kill_feed.replicated_world_time_seconds` | Source clock, single precision. |
| `killFeed[].replicatedWorldTimeSecondsDouble` | number/null | Minimal, conditional | `kill_feed.replicated_world_time_seconds_double` | Source clock, double precision. |
| `killFeed[].distance` | number/null | Minimal, conditional | `kill_feed.distance` | Source-reported distance. |
| `killFeed[].deathCause` | integer/null | Minimal, conditional | `kill_feed.death_cause` | Source value. |
| `killFeed[].deathCircumstance` | integer/null | Minimal, conditional | `kill_feed.death_circumstance` | Source value. |
| `killFeed[].deathLocation` | FVector/null | Minimal, conditional | `kill_feed.death_location_x/y/z` | Split into coordinates. |
| `killFeed[].deathTags[]` | string array/null | Minimal, conditional | `kill_feed_death_tag` | One row per tag, preserving order. |
| `killFeed[].isDowned` | boolean | Minimal, conditional | `kill_feed.is_downed` | Kept distinct from revive and event-elimination flags. |
| `killFeed[].isRevived` | boolean | Minimal, conditional | `kill_feed.is_revived` | Source state. |
| Consolidated total eliminations | Derived, not emitted | Derived only | Not persisted | Must select a source/definition before calculating; avoid double counting. |

## Movement and vehicle references

Movement is a high-volume child relation. Its values are snapshots, not a
continuous trajectory. `Full` is required for replicated movement.

| JSON path | JSON type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `players[].locations[].pawnActorId` | unsigned integer/null | Full, conditional | `movement_sample.pawn_actor_id` | Actor reference. |
| `players[].locations[].replicatedWorldTimeSeconds` | number/null | Full, conditional | `movement_sample.replicated_world_time_seconds` | Nullable source clock. |
| `players[].locations[].replicatedWorldTimeSecondsDouble` | number/null | Full, conditional | `movement_sample.replicated_world_time_seconds_double` | Nullable higher-precision source clock. |
| `players[].locations[].lastUpdateTime` | number/null | Full, conditional | `movement_sample.last_update_time` | Replicated pawn timestamp. |
| `players[].locations[].replicatedMovement.location` | FVector | Full, conditional | `movement_sample.location_x/y/z` | Split into coordinates. |
| `players[].locations[].replicatedMovement.rotation` | FRotator | Full, conditional | `movement_sample.rotation_pitch/yaw/roll` | Split into components. |
| `players[].locations[].replicatedMovement.linearVelocity` | FVector | Full, conditional | `movement_sample.linear_velocity_x/y/z` | Split into components. |
| `players[].locations[].replicatedMovement.angularVelocity` | FVector | Full, conditional | `movement_sample.angular_velocity_x/y/z` | Split into components. |
| `players[].locations[].replicatedMovement.acceleration` | FVector/null | Full, conditional | `movement_sample.acceleration_x/y/z` | Null until signaled by replay. |
| `players[].locations[].replicatedMovement.bSimulatedPhysicSleep` | boolean | Full, conditional | `movement_sample.is_simulated_physics_sleep` | Source flag. |
| `players[].locations[].replicatedMovement.bRepPhysics` | boolean | Full, conditional | `movement_sample.is_replicating_physics` | Source flag. |
| `players[].locations[].replicatedMovement.bRepAcceleration` | boolean | Full, conditional | `movement_sample.is_replicating_acceleration` | Source flag. |
| `players[].locations[].replicatedMovement.serverFrame` | unsigned integer/null | Full, conditional | `movement_sample.server_frame` | Source frame. |
| `players[].locations[].replicatedMovement.serverPhysicsHandle` | uint | Full, conditional | `movement_sample.b_rep_movement_handle` | Pending: service/contract/repository use `handle`, not the parser name; verify meaning before reusing the column. |
| `players[].locations[].replicatedMovement` location quantization | integer/enum/null | Full, conditional | `movement_sample.location_quantization_level` | Numeric code. |
| `players[].locations[].replicatedMovement` velocity quantization | integer/enum/null | Full, conditional | `movement_sample.velocity_quantization_level` | Numeric code. |
| `players[].locations[].replicatedMovement` rotation quantization | integer/enum/null | Full, conditional | `movement_sample.rotation_quantization_level` | Numeric code. |
| `players[].locations[].replicatedMovementMode` | integer/null | Full, conditional | `movement_sample.replicated_movement_mode` | Numeric code, not translated. |
| `players[].locations[].currentMovementStyle` | integer/null | Full, conditional | `movement_sample.current_movement_style` | Numeric code, not translated. |
| `players[].locations[].bIsSprinting` | boolean/null | Full, conditional | `movement_sample.is_sprinting` | Nullable source flag. |
| `players[].locations[].bIsJumping` | boolean/null | Full, conditional | `movement_sample.is_jumping` | Nullable source flag. |
| `players[].locations[].bIsCrouched` | boolean/null | Full, conditional | `movement_sample.is_crouched` | Nullable source flag. |
| `players[].locations[].bIsSlopeSliding` | boolean/null | Full, conditional | `movement_sample.is_slope_sliding` | Nullable source flag. |
| `players[].locations[].bIsZiplining` | boolean/null | Full, conditional | `movement_sample.is_ziplining` | Nullable source flag. |
| `players[].locations[].bIsTargeting` | boolean/null | Full, conditional | `movement_sample.is_targeting` | Nullable source flag. |
| `players[].locations[].bIsDBNO` | boolean/null | Full, conditional | `movement_sample.is_dbno` | Nullable source flag. |
| `players[].locations[].bIsHonking` | boolean/null | Full, conditional | `movement_sample.is_honking` | Nullable source flag. |
| `players[].locations[].bIsInAnyStorm` | boolean/null | Full, conditional | `movement_sample.is_in_any_storm` | Nullable source flag. |
| `players[].locations[].bIsWaitingForEmoteInteraction` | boolean/null | Full, conditional | `movement_sample.is_waiting_for_emote_interaction` | Nullable source flag. |
| `players[].locations[].bIsPlayingEmote` | boolean/null | Full, conditional | `movement_sample.is_playing_emote` | Nullable source flag. |
| `players[].locations[].bIsSkydiving` | boolean/null | Full, conditional | `movement_sample.is_skydiving` | Nullable source flag. |
| `players[].locations[].bIsSkydivingFromLaunchPad` | boolean/null | Full, conditional | `movement_sample.is_skydiving_from_launch_pad` | Nullable source flag. |
| `players[].locations[].bIsSkydivingFromBus` | boolean/null | Full, conditional | `movement_sample.is_skydiving_from_bus` | Nullable source flag. |
| `players[].locations[].bIsParachuteOpen` | boolean/null | Full, conditional | `movement_sample.is_parachute_open` | Nullable source flag. |
| `players[].locations[].bIsParachuteForcedOpen` | boolean/null | Full, conditional | `movement_sample.is_parachute_forced_open` | Nullable source flag. |
| `players[].locations[].bIsInWaterVolume` | boolean/null | Full, conditional | `movement_sample.is_in_water_volume` | Nullable source flag. |
| `players[].locations[].vehicle` | unsigned actor ID/null | Full, conditional | `movement_sample.vehicle_actor_id` | Actor reference. |
| `players[].locations[].vehiclePath` | string/null | Full, conditional | `movement_sample.vehicle_path` | Resolved path only; not normalized to a vehicle class. |
| `players[].locations[].seatIndex` | byte/null | Full, conditional | `movement_sample.seat_index` | Nullable source value. |
| `bIsWalking` | Not emitted | Not available | — | Must not infer walking from sprint absence. |
| Vehicle entry/exit event and time | Not emitted | Derived/not available | — | No dedicated parser event; absence of a vehicle ref does not prove exit. |
| Vehicle actor transform or normalized class | Not emitted | Not available | — | Vehicle actor groups are ignored; stored sample location is pawn location. |
| Vehicle distance | Not emitted | Derived | — | Not calculated by ChestCounter. |

## Map and world observations

| JSON path | JSON type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `map.battleBusFlightPaths[].aircraftIndex` | uint | Minimal, conditional | — | Pending bigint aircraft index; preserve source order separately. |
| `map.battleBusFlightPaths[].flightStartLocation` | FVector/null | Minimal, conditional | `battle_bus_flight_path.start_x/y/z` | Pending parser-name mapping and vector metadata. |
| `map.battleBusFlightPaths[].flightStartRotation` | FRotator/null | Minimal, conditional | `battle_bus_flight_path.rotation_pitch/yaw/roll` | Pending parser-name mapping. |
| `map.battleBusFlightPaths[].flightSpeed` | float | Minimal, conditional | — | Pending; scalar speed is not an x/y/z velocity. |
| `map.battleBusFlightPaths[].timeTillFlightEnd` / `timeTillDropStart` / `timeTillDropEnd` / `replicatedFlightTimestamp` | float | Minimal, conditional | — | Four separate fields, not interchangeable with `flight_time` or `drop_time`. |
| `map.battleBusFlightPaths[].skin` | string/null | Minimal, conditional | `battle_bus_flight_path.skin` | Source value. |
| `map.worldGridStart` | FVector2D/null | Full, conditional | `map_snapshot.world_grid_start_x/y` | Split into coordinates. |
| `map.worldGridEnd` | FVector2D/null | Full, conditional | `map_snapshot.world_grid_end_x/y` | Split into coordinates. |
| `map.worldGridSpacing` | FVector2D/null | Full, conditional | `map_snapshot.world_grid_spacing_x/y` | Split into coordinates. |
| `map.worldGridTotalSize` | FVector2D/null | Full, conditional | `map_snapshot.world_grid_total_size_x/y` | Split into coordinates. |
| `map.gridCountX` | integer/null | Full, conditional | `map_snapshot.grid_count_x` | Source value. |
| `map.gridCountY` | integer/null | Full, conditional | `map_snapshot.grid_count_y` | Source value. |
| `map.poiTagContainerTable[].tags[].tagName/tagIndex` | nested tag objects | Full, conditional | `map_poi_tag` holds a flat non-null text tag | Pending: preserve both orders, nullable names, source uint tag index, and empty/null containers and lists. |
| `map.poiTagContainerTableSize` | integer/null | Full, conditional | `map_snapshot.poi_tag_container_table_size` | Source value. |
| `map.safeZones[].radius` | number/null | Conditional | `map_safe_zone.radius` | Source radius. |
| `map.safeZones[].startShrinkTime` / `finishShrinkTime` | float | Conditional | — | Pending; both non-null in all eight captured safe zones. |
| `map.safeZones[].lastRadius` / `nextRadius` / `nextNextRadius` | float | Conditional | — | Pending; no inference from `radius`. |
| `map.safeZones[].lastCenter` / `nextCenter` / `nextNextCenter` | FVector/null | Conditional | — | Pending separate coordinates and metadata; `nextCenter` is non-null in all eight. Existing `center_*` has no proven source equivalence. |
| `map.llamas[].id` | uint | Conditional | — | Pending bigint actor ID; separate from table identity. |
| `map.llamas[].location` / `landingLocation` | FVector/null | Conditional | `map_llama.position_x/y/z` / `destination_x/y/z` | Pending parser-name mapping and vector metadata. |
| `map.llamas[].looted` | boolean | Conditional | `map_llama.looted` | Existing mapping. |
| `map.llamas[].hasSpawnedPickups` / `lootedTime` / `lootedTimeDouble` | bool / float? / double? | Conditional | — | Pending. |
| `map.supplyDrops[].id` | uint | Conditional | — | Pending bigint actor ID; separate from table identity. |
| `map.supplyDrops[].landingLocation` | FVector/null | Conditional | `map_supply_drop.landing_x/y/z` | Pending parser-name mapping and vector metadata. |
| `map.supplyDrops[].looted` | boolean | Conditional | `map_supply_drop.looted` | Existing mapping. |
| `map.supplyDrops[].hasSpawnedPickups` / `balloonPopped` | boolean | Conditional | — | Pending. |
| `map.supplyDrops[].lootedTime` / `lootedTimeDouble` / `balloonPoppedTime` / `balloonPoppedTimeDouble` / `fallSpeed` / `fallHeight` | float/double | Conditional | — | Pending; scalar fall measurements are not positions. |
| `map.rebootVans[].id` | int | Conditional | `map_reboot_van.actor_handle` | Pending parser-name mapping; constructor sources it from `SpawnMachineRepDataHandle`. |
| `map.rebootVans[].location` | FVector/null | Conditional | `map_reboot_van.location_x/y/z` | Existing coordinates; vector metadata pending. |
| `map.rebootVans[].spawnMachineState` | int | Conditional | `map_reboot_van.state` | Pending parser-name mapping. |
| `map.rebootVans[].spawnMachineCooldownStartTime` / `spawnMachineCooldownEndTime` | float | Conditional | — | Pending. |
| First landing position/time | Not emitted | Full-derived | — | No landing event is calculated by the parser. |
| POI name from coordinates | Not emitted | Not available | — | No implicit coordinate lookup. |
| POI enter/exit/dwell interval | Not emitted | Derived | — | Not asserted as parser data or stored in this raw-observation schema. |

## Weapons, containers, dropped items and special events

| JSON path | JSON type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `weapons[].actorId` | unsigned integer/null | Conditional | `weapon_observation.actor_id` | Match-scoped actor key. |
| `weapons[].weaponName` | string/null | Conditional | `weapon_observation.weapon_name` | Source name. |
| `weapons[].ammoCount` | integer/null | Conditional | `weapon_observation.ammo_count` | Nullable source value. |
| `weapons[].weaponLevel` | integer/null | Conditional | `weapon_observation.weapon_level` | Nullable source value. |
| `weapons[].lastFireTimeVerified` | number/null | Conditional | `weapon_observation.last_fire_time_verified` | Source clock. |
| `weapons[].bIsEquippingWeapon` | boolean/null | Conditional | `weapon_observation.is_equipping_weapon` | Nullable source flag. |
| `weapons[].bIsReloadingWeapon` | boolean/null | Conditional | `weapon_observation.is_reloading_weapon` | Nullable source flag. |
| `weapons[].a` / `b` / `c` / `d` | unsigned integer/null | Conditional | `weapon_observation.value_a/b/c/d` | Pending: parser serializes lowercase; service, contract and repository expect uppercase. |
| `players[].currentWeapon` | unsigned actor ID/null | Minimal, conditional | `match_player.current_weapon_actor_id` | Same reference; not resolved to a weapon name by assumption. |
| `observations.equippedItems[].timeSeconds` | number | Minimal, conditional | `equipped_item_observation.time_seconds` | Source game clock. |
| `observations.equippedItems[].item` | string/null | Minimal, conditional | `equipped_item_observation.item_name` | Pending: service/contract/repository use `name`; capture has 29 non-null values. |
| `observations.equippedItems[].pawnActorId` | unsigned integer/null | Minimal, conditional | `equipped_item_observation.pawn_actor_id` | Source actor reference. |
| `observations.equippedItems[].playerId` | integer/null | Minimal, conditional | `equipped_item_observation.player_replay_id` | Only when explicitly resolved. |
| `observations.containerInteractions[].timeSeconds` | number | Minimal+, conditional | `container_interaction.time_seconds` | Source event time. |
| `observations.containerInteractions[].sourceActorKey` | string | Conditional | `container_interaction.source_actor_key` | GUID/path or documented channel fallback. |
| `observations.containerInteractions[].containerLabel` | string | Conditional | `container_interaction.container_label` | Observed label, not canonical category. |
| `observations.containerInteractions[]` source kind | not emitted | Conditional | `container_interaction.interaction_kind` | Repository always writes `container`, including potential cannon events; kind is not determined by the payload. |
| `observations.containerInteractions[].searchingPawnActorId` | unsigned integer/null | Conditional | `container_interaction.searching_pawn_actor_id` | Explicit reference only. |
| `observations.containerInteractions[].searchingPlayerStateActorId` | unsigned integer/null | Conditional | `container_interaction.searching_player_state_actor_id` | Explicit reference only. |
| `observations.containerInteractions[].searchingPlayerId` | integer/null | Conditional | `container_interaction.searching_player_replay_id` | Explicitly resolved participant. |
| `observations.containerInteractions[].alreadySearched` | boolean/null | Conditional | `container_interaction.already_searched` | Nullable source state. |
| `observations.containerInteractions[].searchAnimationCount` | unsigned integer/null | Conditional | `container_interaction.search_animation_count` | Source count. |
| `observations.containerInteractions[].destroyed` | boolean/null | Conditional | `container_interaction.destroyed` | Nullable source state. |
| `observations.droppedItems[].timeSeconds` | number | Normal, conditional | `dropped_item_observation.time_seconds` | Source game clock. |
| `observations.droppedItems[].item` | string | Normal, conditional | `dropped_item_observation.item` | Source item label. |
| `observations.droppedItems[].itemDefinitionActorId` | unsigned integer/null | Normal, conditional | `dropped_item_observation.item_definition_actor_id` | Actor reference. |
| `observations.droppedItems[].itemDefinitionPath` | string/null | Normal, conditional | `dropped_item_observation.item_definition_path` | Resolved path, possibly null. |
| `observations.droppedItems[].count` | integer/null | Normal, conditional | `dropped_item_observation.item_count` | Pickup state, not proof of collection. |
| `observations.droppedItems[].durability` | number/null | Normal, conditional | `dropped_item_observation.durability` | Source value. |
| `observations.droppedItems[].level` | integer/null | Normal, conditional | `dropped_item_observation.level` | Source value. |
| `observations.droppedItems[].loadedAmmo` | integer/null | Normal, conditional | `dropped_item_observation.loaded_ammo` | Source value. |
| `observations.droppedItems[].orderIndex` | unsigned integer/null | Normal, conditional | `dropped_item_observation.order_index` | Source ordering value. |
| `observations.droppedItems[].itemOwner` | unsigned actor ID/null | Normal, conditional | `dropped_item_observation.item_owner` | Actor reference. |
| `observations.droppedItems[].pawnWhoDroppedPickup` | unsigned actor ID/null | Normal, conditional | `dropped_item_observation.pawn_who_dropped_pickup` | Actor reference. |
| `observations.droppedItems[].owner` | unsigned actor ID/null | Normal, conditional | `dropped_item_observation.owner` | Actor reference. |
| `observations.droppedItems[].droppedByPlayerId` | integer/null | Normal, conditional | `dropped_item_observation.dropped_by_player_replay_id` | Direct actor-chain resolution only. |
| `observations.droppedItems[].replicatedLocation` | FVector/null | Normal, conditional | `dropped_item_observation.replicated_location_x/y/z` | Split into coordinates. |
| `observations.droppedItems[].lootInitialPosition` | FVector/null | Normal, conditional | `dropped_item_observation.loot_initial_position_x/y/z` | Split into coordinates. |
| `observations.droppedItems[].lootFinalPosition` | FVector/null | Normal, conditional | `dropped_item_observation.loot_final_position_x/y/z` | Split into coordinates. |
| `observations.droppedItems[].finalTossRestLocation` | FVector/null | Normal, conditional | `dropped_item_observation.final_toss_rest_location_x/y/z` | Split into coordinates. |
| `observations.droppedItems[].flyTime` | number/null | Normal, conditional | `dropped_item_observation.fly_time` | Source value. |
| `observations.droppedItems[].tossState` | integer/null | Normal, conditional | `dropped_item_observation.toss_state` | Numeric source state. |
| `observations.droppedItems[].pickedUp` | boolean/null | Normal, conditional | `dropped_item_observation.picked_up` | Source flag, not inventory history. |
| `observations.treasureEvents[].timeSeconds` | number | Minimal, conditional | `treasure_event.time_seconds` | Source game clock. |
| `observations.treasureEvents[].prizeId` | string | Minimal, conditional | `treasure_event.prize_id` | Original ID; not labeled a token without a known mapping. |
| `observations.treasureEvents[].pawnActorId` | unsigned integer/null | Minimal, conditional | `treasure_event.pawn_actor_id` | Actor reference. |
| `observations.treasureEvents[].playerId` | integer/null | Minimal, conditional | `treasure_event.player_replay_id` | Explicit resolution only. |
| `observations.treasureEvents[].sourceContainer` | string | Minimal, conditional | `treasure_event.source_container` | Resolved path, may be empty. |
| `observations.prizeHandlerGrants[].handler` | string | Minimal, conditional | `prize_handler_grant.handler` | Raw handler value. |
| `observations.prizeHandlerGrants[].timeSeconds` | float | Minimal, conditional | `prize_handler_grant.time_seconds` | Pending: service/contract/repository use `time`. |
| `observations.prizeHandlerGrants[].playerStateActorId` | uint | Minimal, conditional | `prize_handler_grant.player_state_actor_id` | Pending: service/contract/repository use `playerState`. |
| `observations.prizeHandlerGrants[].playerId` | integer/null | Minimal, conditional | `prize_handler_grant.player_replay_id` | Explicit resolution only. |
| `observations.prizeHandlerGrants[].elementId` | int | Minimal, conditional | — | Pending integer column; type confirmed in `ReplayAnalyzer.GrantEvent`. |

## Processing, derived values and exclusions

| Field | Type | Availability | Relational destination | Treatment |
|---|---|---|---|---|
| `data.parseMode` | enum string | Always in snapshot | `processing_attempt.parse_mode` | Required on every ingestion; controls interpretation of absent rows. |
| Replay SHA-256 | 64-char hex | Request identity, when file hash is supplied | `replay_file.file_sha256` | Content/file identity; independent of application identity. |
| `application_id` | string | Request metadata | `replay_upload.application_id`, `processing_attempt.application_id` | Source application; never used alone as match identity. |
| Analyzer/parser versions | strings | Request metadata | `processing_attempt` version columns | Every attempt records exact versions. `analyzer_version.description` is accepted but not stored. |
| Attempt status/errors/timestamps | status/text/timestamps | Processing metadata | `processing_attempt` | Append-only attempt history; no payload stored. |
| `match.identity_key` | derived string | Ingestion identity rule | `game_match.identity_key` | Uses `session:<gameSessionId>` when available; otherwise `file:<sha256>`. |
| Match duration, if computed | number | Derived | Not a parser field | May be calculated in a future API only when source clocks are compatible; never a direct input column. |
| Initial player/bot counts | integer | Not available | — | No inference from observed players, `PlayerBotsLeft`, or TeamStats. |
| Full inventory and collected items | object/array | Not available | — | Inventory callbacks are disabled; dropped pickups remain separate observations. |
| POI names/visits and geospatial landing | derived/not available | No parser POI resolution | — | Do not infer named POIs from grid, tags, or proximity. |
| Chest classification/open-count metric | derived/not definitive | Labels/state only | `container_interaction` raw observations | No universal “opened chest” count until a validated classifier and event rule exist. |
| Token classification/count | not provided | Prize IDs and raw grants | `treasure_event`, `prize_handler_grant` | `elementId` is not persisted; do not label grants as tokens without a maintained identifier mapping. |
| Complete movement path/walking/vehicle entry-exit | derived/not provided | Sparse `Full` snapshots | — | No continuity or event semantics are asserted. |
| `ParseMode` values | enum | Available | `processing_attempt.parse_mode` | `EventsOnly`, `Minimal`, `Normal`, `Full`; values outside this set are rejected. |

## Exhaustive validation audit of the supplied capture

The diagnostic file has surrounding text; only its first balanced JSON object
was inspected, without publishing its contents. All array elements were
traversed, grouping paths by replacing actual array indices with `[]`.
The traversal mirrors the **current** service shapes and nullable-item rules:
unknown parent objects are counted once, not recursively treated as accepted
children. It does not execute PostgreSQL or alter the payload.

The capture contains 8,262 game-state observations, 90 players, 21 teams,
155 elimination events, 171 kill-feed entries, eight safe zones, 27 weapons,
233 container interactions, 2,201 dropped items and 29 equipped items.
Movement, llamas, supply drops, reboot vans, treasure events and prize grants
are empty; flight paths and POI tags are null. Those absent structures still
need support according to the source models.

The service stops at the first rejection, `players[0].inventoryId`; the
independent traversal found **49 distinct rejected paths** in this capture.
Each of the 49 paths was independently projected into a minimal request and
confirmed against the actual service validator:

| Rejected path, relative to `data` | Occurrences; non-null | Cause and current destination |
|---|---|---|
| `players[].inventoryId` | 90; 0 | Unknown; no destination. |
| `players[].cosmetics.characterGender`, `characterBodyType`, `heroType` | 90 each; 83 each | Unknown names; whole cosmetics object has existing JSONB destination. |
| `players[].cosmetics.bannerColorId`, `bannerIconId`, `itemWraps` | 90 each; 16 each | Unknown names; existing JSONB destination. |
| `players[].cosmetics.variantRequiredCharacterParts` | 90; 4 | Unknown name; existing JSONB destination. |
| `players[].cosmetics.isDefaultCharacter`, `loadingScreen`, `musicPack`, `petSkin`, `skyDiveContrail` | 90 each; 0 | Unknown names even when null; existing JSONB destination. |
| `players[].deathLocation.scaleFactor`, `bits` | 83 each; 83 each | Unknown; coordinates have columns, metadata does not. |
| `eventEliminations[].eliminated.playerType`, `eliminator.playerType` | 155 each; 155 each | Numeric JSON enum rejected where string is required; existing columns are TEXT. |
| `eventEliminations[].eliminator.rotation.x` | 1; 1 | String `"NaN"` rejected where finite number is required; see special-number notes. |
| `eventEliminations[].{eliminated,eliminator}.{location,scale}.{scaleFactor,bits}` | Each of the eight paths: 155; 155 | Unknown vector metadata; coordinates have columns, metadata does not. |
| `killFeed[].deathLocation.{scaleFactor,bits}` | 171 each; 171 each | Unknown vector metadata; coordinates have columns, metadata does not. |
| `map.safeZones[].startShrinkTime`, `finishShrinkTime`, `lastRadius`, `nextRadius`, `nextNextRadius`, `nextCenter` | 8 each; 8 each | Unknown; no equivalent mapped column. `nextCenter` also contains x/y/z/scaleFactor/bits, not traversed by current validator once the parent is unknown. |
| `map.safeZones[].lastCenter`, `nextNextCenter` | 8 each; 0 | Unknown even when null. |
| `weapons[].a`, `b`, `c`, `d` | 27 each; 7 each | Unknown lowercase names; existing `value_a` through `value_d` are populated only from uppercase aliases. |
| `observations.equippedItems[].item` | 29; 29 | Unknown name; existing `item_name` is populated from `name`. |
| `observations.droppedItems[].replicatedLocation.{scaleFactor,bits}` | 658 each; 658 each | Unknown vector metadata; coordinates have columns. |
| `observations.droppedItems[].lootInitialPosition.{scaleFactor,bits}` | 2 each; 2 each | Same. |
| `observations.droppedItems[].lootFinalPosition.{scaleFactor,bits}` | 2 each; 2 each | Same. |
| `observations.droppedItems[].finalTossRestLocation.{scaleFactor,bits}` | 4 each; 4 each | Same. |

This count is about validation, not 49 separate fields requiring new columns.
`radius` is already mapped. `eventInfo.id`, both game-state clocks and
`hasBegunPlay`, game totals/tournament fields, and both stats' event metadata
were implemented in the preceding work and are not rejected by this traversal.
The real snapshot has no duplicate non-null player IDs, team indices or weapon
actor IDs, no differing team array lengths, and no null container actor keys.
This only rules out these particular constraint failures **in this capture**.

`cosmetics.parts`, `character`, `backpack`, `glider`, `pickaxe`, and `dances`
are accepted by name and stored as part of JSONB if validation succeeds.
However the capture has null elements inside `variantRequiredCharacterParts`,
`itemWraps` and `dances`; a future typed validator must preserve them rather
than assume `string[]` forbids null elements. The model also declares
`characterGender`/`characterBodyType` as nullable int, `isDefaultCharacter`
as nullable bool, `parts`, `heroType`, `bannerIconId`, `bannerColorId`,
`skyDiveContrail`, `glider`, `pickaxe`, `character`, `backpack`,
`loadingScreen`, `musicPack`, `petSkin` as strings, and the three listed
collection properties as string arrays. Current service validation of legacy
cosmetics fields is arbitrary JSON, not that typed model.

## Vector and scalar type discrepancies

`FVector` is `{x: double, y: double, z: double, scaleFactor: int, bits: int}`.
The service/OpenAPI only allow x/y/z and the repository stores only those
coordinates. The metadata is missing in **every** use of FVector:

| Owner table | Source vectors (all require `scaleFactor` and `bits`) |
|---|---|
| `match_player` | `deathLocation` |
| `event_elimination` | `eliminated.location`, `eliminated.scale`, `eliminator.location`, `eliminator.scale` |
| `kill_feed` | `deathLocation` |
| `movement_sample` | `replicatedMovement.location`, `linearVelocity`, `angularVelocity`, `acceleration` |
| `battle_bus_flight_path` | `flightStartLocation` |
| `map_safe_zone` | `lastCenter`, `nextCenter`, `nextNextCenter` |
| `map_llama` | `location`, `landingLocation` |
| `map_supply_drop` | `landingLocation` |
| `map_reboot_van` | `location` |
| `dropped_item_observation` | `replicatedLocation`, `lootInitialPosition`, `lootFinalPosition`, `finalTossRestLocation` |

`FVector2D` has only x/y; `FRotator` has pitch/yaw/roll; `FQuat` has x/y/z/w.
The ChestCounter serializer explicitly enables
`JsonNumberHandling.AllowNamedFloatingPointLiterals`. In this capture one
`eliminator.rotation.x` is the JSON **string** `"NaN"`; it is not a finite JSON
number. Other float/double fields can similarly serialize `"NaN"`,
`"Infinity"` or `"-Infinity"`. PostgreSQL floating-point types support
special values, but accepting the named strings and preserving them through
the current `jsonb_to_recordset` insertion and every read/JSON serialization
path requires an end-to-end test. Converting a string to JavaScript `NaN`
before `JSON.stringify` would silently turn it into JSON null. No conversion
or acceptance is implemented yet.

Additional model/contract/SQL mismatches:

* `Stats` counters (`unknown`, `assists`, `eliminations`, `weaponDamage`,
  `otherDamage`, `revives`, `damageTaken`, `damageToStructures`,
  `materialsGathered`, `materialsUsed`) are C# `uint`; SQL `INTEGER` and
  OpenAPI `int32` cannot represent the full 0..4294967295 range.
  `totalTraveled` is uint, currently stored as double.
* `players[].rebootCounter`, `kills`, `teamKills` and `teams[].teamKills`
  are uint, OpenAPI uses int64, but SQL uses INTEGER. A valid large source
  value can therefore fail in PostgreSQL.
* `match.replayLengthInMilliseconds` comes from `ReplayInfo.LengthInMs` (uint),
  but OpenAPI declares int32 and `game_match.replay_length_milliseconds` is
  INTEGER; values above 2147483647 cannot be persisted.
* `gameData.teamCount`, `teamSize`, `playerBotsLeft`, `playersLeft`,
  `teamsLeft`, and `players[].id` originate as signed `int?`, while existing
  SQL CHECK constraints reject negative values; assess source semantics before
  deciding whether those constraints are legitimate. The service currently
  validates a safe integer, not the C# range or all SQL checks.
* `EventInfo.startTime/endTime` are uint. The new match/team event columns use
  BIGINT, while elimination uses DOUBLE PRECISION and OpenAPI says number.
  Neither timestamp is a wall-clock timestamp. Match stats validation requires
  integer, while elimination accepts a generic finite number.
* `utcTimeStartedMatch`/`replayTimestamp` are strings passed directly to
  `TIMESTAMPTZ`, but OpenAPI declares `format: date-time`, which requires a
  timezone. Both timestamps in this capture lack a timezone suffix.
  A zone-free source value is interpreted using PostgreSQL's session
  `TimeZone`; the exact original spelling and timezone absence cannot be
  reconstructed from `TIMESTAMPTZ` alone.
* `players[].locations[].replicatedMovement.serverPhysicsHandle` is uint;
  service, OpenAPI and repository instead expect `handle`. The capture has no
  movement samples, so this is a model-based finding rather than an observed
  rejection.
* `additionalProperties: false` in OpenAPI mirrors the incomplete service
  schemas. The actual contract also differs in lowercase weapon keys, map and
  prize field names, cosmetics, numeric player types, vector metadata, and
  special floating-point strings. Generated models reflect that contract, not
  the actual snapshot; regenerate them only after a targeted contract update.

## Persistence gaps beyond individual columns

* The currently accepted optional `analyzer_version.description` has no
  corresponding column and is discarded; it is absent from the capture.
* `persistPlayers` deletes all existing match players before insertion.
  `ON DELETE CASCADE` removes their movement and linked team-member rows; if
  `teams` is absent/null, the teams remain but their member links are lost.
  A new player list with missing/null `locations` similarly loses prior samples.
* Match/stats/map upserts use `COALESCE`, so an explicit null cannot clear a
  prior value and is indistinguishable from an absent property. Most nested
  arrays/objects also collapse null, missing and empty; `processing_section`
  records only top-level states.
* Team IDs and names are zipped up to the longer array; different lengths,
  null versus missing arrays, and explicit null entries cannot in general be
  reconstructed. The provided sample happens to have equal lengths.
* `replaceArray` and several explicit deletes replace earlier data by match,
  not by attempt. Processing attempts remain but much of the earlier snapshot
  does not. Some tables lack `processing_attempt_id` and source ordinals, so
  original ordering/history cannot always be reconstructed.
* `container_interaction.source_actor_key` is NOT NULL and the repository
  invents `observation:<index>` for absent values; it also invents kind
  `container`. The actual payload does not emit an interaction-kind field.
  Two captured labels contain `LootCannon`, but a label alone does not prove
  the original source type.
  `battle_bus_flight_path.path_index` similarly defaults to array index while
  the actual model emits a distinct `aircraftIndex`.
* `weapon_observation` enforces `(match_id, actor_id)` uniqueness, which may
  reject duplicate actors from future inputs rather than preserving source
  rows. Equivalent unique assumptions for teams and players need separate
  validation against the parser contract, not assumptions from one capture.

## Proposed remaining changes — not implemented

All changes below are proposals. Existing deployed databases need a reviewed,
data-preserving upgrade strategy; editing the repository's CREATE script alone
does not update them. Keep legacy input/columns compatible when possible and
detect conflicting old/new aliases explicitly rather than silently choosing.

### Database

1. `processing_attempt`: add nullable `analyzer_description TEXT`.
2. `match_player`: add nullable `inventory_id BIGINT` with the uint range
   check; widen `reboot_counter`, `kills`, `team_kills` to BIGINT. Widen
   `match_team.team_kills`, `game_match.replay_length_milliseconds` and the
   uint `match_stats` counters listed above to BIGINT. Preserve existing rows
   and verify dependent queries before changing types. `total_traveled`
   already represents all uint values exactly; its
   declared type can stay double for compatibility if the source type is
   documented.
3. `event_elimination`: add nullable `eliminated_player_type_code` and
   `eliminator_player_type_code` INTEGER for numeric enums. Preserve the
   existing TEXT columns for legacy string input rather than overwriting or
   converting it; reject contradictory aliases. Retain `event_id`, already
   implemented.
4. Add nullable INTEGER `<vector_prefix>_scale_factor` and
   `<vector_prefix>_bits` beside **each** vector in the vector table above.
   Prefixes match the existing coordinate prefixes; for the three new safe
   zone centers use `last_center`, `next_center`, `next_next_center`.
5. `map_safe_zone`: add `start_shrink_time`, `finish_shrink_time`,
   `last_radius`, `next_radius`, `next_next_radius` as nullable REAL and
   `{last,next,next_next}_center_{x,y,z}` as nullable DOUBLE PRECISION.
   Preserve the old `center_*` for legacy input, without assuming equivalence.
6. `battle_bus_flight_path`: add `aircraft_index BIGINT`, `flight_speed REAL`,
   `time_till_flight_end REAL`, `time_till_drop_start REAL`,
   `time_till_drop_end REAL`, `replicated_flight_timestamp REAL`. Existing
   `start_*`, `rotation_*` and `skin` are usable. Treat `path_index` as source
   ordinal, not aircraft ID; preserve any existing legacy value separately
   if both are accepted.
7. `map_llama`: add `actor_id BIGINT`, `has_spawned_pickups BOOLEAN`,
   `looted_time REAL`, `looted_time_double DOUBLE PRECISION`; use existing
   `position_*`, `destination_*`, `looted`. `map_supply_drop`: add
   `actor_id BIGINT`, `has_spawned_pickups BOOLEAN`, `looted_time REAL`,
   `looted_time_double DOUBLE PRECISION`, `balloon_popped BOOLEAN`,
   `balloon_popped_time REAL`, `balloon_popped_time_double DOUBLE PRECISION`,
   `fall_speed REAL`, `fall_height REAL`; reuse `landing_*` and `looted`.
   `map_reboot_van`: reuse `actor_handle`, `location_*`, `state`; add
   `cooldown_start_time REAL`, `cooldown_end_time REAL`.
8. For POI tags, propose a normalized `map_poi_tag_container` child keyed by
   match/attempt and container ordinal with an explicit tags state, and extend
   `map_poi_tag` with container ordinal, tag ordinal, nullable `tag_name`
   TEXT and source `tag_index` BIGINT. Preserve empty containers, order and
   null tag names without inventing tag names or flattening container bounds.
   This is a proposed new child relation, not an existing table; existing
   flat-tag consumers and old data require an explicit compatibility plan.
9. `prize_handler_grant`: add `element_id INTEGER`; existing `time_seconds`
   and `player_state_actor_id` are appropriate. `equipped_item_observation`
   and `weapon_observation` already have the required item/a/b/c/d columns.
10. Permit unknown `container_interaction.source_actor_key` and
    `interaction_kind` as NULL, retaining the existing allowed-kind check for
    non-null values. Use the existing observation ordinal as row identity.
    Never infer a cannon/container kind from an unverified label.
11. Add `processing_attempt_id` and stable source ordinals where absent,
    especially match players, teams, map children and weapons; revise unique
    keys to scope observations appropriately while retaining the natural
    identity constraints only where the parser actually guarantees them.
    Preserve player/team references with stable keys and non-destructive
    upserts; do not rely on delete cascades when a section is absent.
    Decide explicitly whether full prior snapshot history is required; if it is,
    parent and child rows must be attempt-scoped rather than overwritten.
12. To distinguish absent/null/empty and array lengths, use presence metadata
    per serialized object/section and original array lengths/state for paired
    team lists, death tags, map children and movement. For example, an ordered
    list of present property paths per owner row plus per-array state/length
    can represent the difference without duplicating payload values. Design
    its keys jointly with attempt scoping, including nested POI containers.
13. For timezone-less timestamps, specify a consistent PostgreSQL session
    timezone and document the interpretation without assuming that both source
    clocks have the same semantics. To preserve timezone absence and original
    representation, add nullable original-text columns alongside TIMESTAMPTZ;
    this is intentional duplication for provenance. The timezone policy needs
    a separate decision based on source semantics.

### Service, OpenAPI and repository

1. Validate all source-model properties together, including the complete typed
   `Cosmetics` model, nullable array elements actually seen, numeric player
   types, all FVector components, named special float strings, and the model
   shapes of bus, safe-zone, llama, supply-drop, reboot-van, POI, movement and
   prize records. Preserve integrity checks and reject genuinely unknown
   properties; do not accept and discard unsupported values.
2. Update the OpenAPI schemas narrowly to describe those exact names/types,
   nullable values and named floating-point alternatives; regenerate models
   with the existing generator. Reconcile legacy uppercase weapon/name/time
   aliases by retaining them or versioning the change; define conflict rules.
3. Map each source field to the existing or proposed column specified above.
   In particular map `a/b/c/d` to `value_a/b/c/d`, `item` to `item_name`,
   grant `timeSeconds`/`playerStateActorId` to existing columns, and
   `serverPhysicsHandle` to a column only after confirming its meaning.
4. Keep named float strings intact until a PostgreSQL conversion known to
   preserve `NaN`/infinities; verify both direct parameters and the JSONB
   batch path. Do not apply generic `Number()` or JSON-stringify JS nonfinite
   numbers. Define an explicit output encoding for read APIs.
5. Make writes transactional and preserve absent/null distinctions and stable
   player/team links; keep request hash, attempt locks, idempotency/conflict
   handling, and rollback. Validate constraints and integer ranges against
   both parser types and actual database types.
6. Test the complete real capture through authenticated HTTP into an isolated
   PostgreSQL database without publishing personal values; compare all mapped
   source fields, counts and nested states. Add synthetic Full-mode fixtures
   for empty sections in this capture, null/missing/empty and null array items,
   numeric bounds, named floats, conflicting aliases, repeated ingestion,
   partial reprocessing, relationships and rollback. Test legacy clients and
   existing data/schema upgrade separately.
