-- =============================================================================
-- Fortnite Replay
-- PostgreSQL 15 or later
--
-- This schema is isolated from fnbr_community and has no platform dependencies.
-- Reprocessing must replace derived rows in a single transaction while keeping
-- the replay file and its match identities stable.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS fortnite_replay;

-- ---------------------------------------------------------------------------
-- Processing software versions
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_analyzer_version (
    id_analyzer_version BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    application_version VARCHAR(50) NOT NULL,
    analyzer_version    VARCHAR(50) NOT NULL,
    parser_name         VARCHAR(100) NOT NULL,
    parser_version      VARCHAR(100) NOT NULL,
    description         TEXT,
    CONSTRAINT pk_analyzer_version PRIMARY KEY (id_analyzer_version),
    CONSTRAINT uk_analyzer_version_toolchain
        UNIQUE (application_version, analyzer_version, parser_name, parser_version)
);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_match (
    id_match          BIGINT GENERATED ALWAYS AS IDENTITY,
    match_start_at    TIMESTAMPTZ,
    match_end_at      TIMESTAMPTZ,
    duration_seconds DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_players     INTEGER,
    total_teams       INTEGER,
    chapter_number    SMALLINT,
    is_custom_match   BOOLEAN,
    session_id        VARCHAR(150),
    playlist          VARCHAR(150),
    game_mode         VARCHAR(100),
    map_code          VARCHAR(100),
    map_name          VARCHAR(150),
    season_code       VARCHAR(80),
    game_version      VARCHAR(80),
    CONSTRAINT pk_match PRIMARY KEY (id_match),
    CONSTRAINT chk_match_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT chk_match_player_count CHECK (total_players IS NULL OR total_players >= 0),
    CONSTRAINT chk_match_team_count CHECK (total_teams IS NULL OR total_teams >= 0),
    CONSTRAINT chk_match_time_order
        CHECK (match_start_at IS NULL OR match_end_at IS NULL OR match_end_at >= match_start_at)
);

-- ---------------------------------------------------------------------------
-- Global player identities
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_player (
    id_player              BIGINT GENERATED ALWAYS AS IDENTITY,
    first_seen_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_bot                 BOOLEAN NOT NULL DEFAULT FALSE,
    epic_id                VARCHAR(32),
    bot_id                 VARCHAR(200),
    platform_unique_net_id VARCHAR(150),
    current_display_name   VARCHAR(150),
    platform               VARCHAR(80),
    CONSTRAINT pk_player PRIMARY KEY (id_player),
    CONSTRAINT uk_player_epic_id UNIQUE (epic_id),
    CONSTRAINT uk_player_bot_id UNIQUE (bot_id),
    CONSTRAINT chk_player_identity_kind CHECK (
        (is_bot AND bot_id IS NOT NULL AND epic_id IS NULL)
        OR (NOT is_bot AND epic_id IS NOT NULL AND bot_id IS NULL)
    ),
    CONSTRAINT chk_player_epic_id_format CHECK (
        epic_id IS NULL OR epic_id ~ '^[0-9a-f]{32}$'
    )
);

-- ---------------------------------------------------------------------------
-- Replay files and processing attempts
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_replay_file (
    id_replay_file           BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match              BIGINT,
    fk_id_successful_attempt BIGINT,
    file_size_bytes          BIGINT,
    file_created_at          TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    file_sha256              VARCHAR(64) NOT NULL,
    file_name                VARCHAR(255) NOT NULL,
    file_path                TEXT,
    CONSTRAINT pk_replay_file PRIMARY KEY (id_replay_file),
    CONSTRAINT fk_replay_file_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE SET NULL,
    CONSTRAINT uk_replay_file_sha256 UNIQUE (file_sha256),
    CONSTRAINT uk_replay_file_match UNIQUE (fk_id_match),
    CONSTRAINT chk_replay_file_sha256_format CHECK (
        file_sha256 ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT chk_replay_file_size CHECK (
        file_size_bytes IS NULL OR file_size_bytes >= 0
    )
);

CREATE TABLE fortnite_replay.tb_replay_processing_attempt (
    id_attempt             BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_replay_file      BIGINT NOT NULL,
    fk_id_analyzer_version BIGINT NOT NULL,
    started_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at           TIMESTAMPTZ,
    status                 VARCHAR(20) NOT NULL DEFAULT 'processing',
    error_message          TEXT,
    CONSTRAINT pk_replay_processing_attempt PRIMARY KEY (id_attempt),
    CONSTRAINT fk_attempt_replay_file
        FOREIGN KEY (fk_id_replay_file)
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    CONSTRAINT fk_attempt_analyzer_version
        FOREIGN KEY (fk_id_analyzer_version)
        REFERENCES fortnite_replay.tb_analyzer_version (id_analyzer_version)
        ON DELETE RESTRICT,
    CONSTRAINT uk_attempt_file_scope UNIQUE (fk_id_replay_file, id_attempt),
    CONSTRAINT chk_attempt_status
        CHECK (status IN ('processing', 'success', 'failed', 'skipped')),
    CONSTRAINT chk_attempt_completion CHECK (
        (status = 'processing' AND completed_at IS NULL)
        OR (status <> 'processing' AND completed_at IS NOT NULL)
    )
);

-- The deferred composite FK ensures a successful attempt belongs to this file.
ALTER TABLE fortnite_replay.tb_replay_file
    ADD CONSTRAINT fk_replay_file_successful_attempt
    FOREIGN KEY (id_replay_file, fk_id_successful_attempt)
    REFERENCES fortnite_replay.tb_replay_processing_attempt
        (fk_id_replay_file, id_attempt)
    DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- Match participants
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_match_player (
    id_match_player       BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match           BIGINT NOT NULL,
    fk_id_player          BIGINT,
    total_traveled        DOUBLE PRECISION,
    death_time_seconds    DOUBLE PRECISION,
    team_index            INTEGER,
    player_number         INTEGER,
    placement             INTEGER,
    kills                 INTEGER,
    team_kills            INTEGER,
    assists               INTEGER,
    weapon_damage         INTEGER,
    other_damage          INTEGER,
    revives               INTEGER,
    damage_taken          INTEGER,
    damage_to_structures  INTEGER,
    materials_gathered    INTEGER,
    materials_used        INTEGER,
    death_cause           INTEGER,
    death_circumstance    INTEGER,
    level                 INTEGER,
    season_level          INTEGER,
    is_replay_owner       BOOLEAN,
    is_game_session_owner BOOLEAN,
    is_party_leader       BOOLEAN,
    is_anonymous          BOOLEAN,
    has_finished_loading  BOOLEAN,
    has_started_playing   BOOLEAN,
    replay_player_id      VARCHAR(200),
    player_type           VARCHAR(30) NOT NULL DEFAULT 'unknown',
    platform              VARCHAR(80),
    cosmetics             JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT pk_match_player PRIMARY KEY (id_match_player),
    CONSTRAINT fk_match_player_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_player_player
        FOREIGN KEY (fk_id_player)
        REFERENCES fortnite_replay.tb_player (id_player)
        ON DELETE SET NULL,
    CONSTRAINT uk_match_player_identity UNIQUE (fk_id_match, fk_id_player),
    CONSTRAINT uk_match_player_scope UNIQUE (fk_id_match, id_match_player),
    CONSTRAINT chk_match_player_type
        CHECK (player_type IN ('player', 'bot', 'named_bot', 'unknown')),
    CONSTRAINT chk_match_player_times CHECK (
        (total_traveled IS NULL OR total_traveled >= 0)
        AND (death_time_seconds IS NULL OR death_time_seconds >= 0)
    )
);

-- ---------------------------------------------------------------------------
-- Match-level MATCH_STATS payload
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_match_stats (
    id_match_stats       BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match          BIGINT NOT NULL,
    fk_id_match_player   BIGINT,
    total_traveled       DOUBLE PRECISION,
    accuracy             DOUBLE PRECISION,
    unknown              INTEGER,
    assists              INTEGER,
    eliminations         INTEGER,
    weapon_damage        INTEGER,
    other_damage         INTEGER,
    revives              INTEGER,
    damage_taken         INTEGER,
    damage_to_structures INTEGER,
    materials_gathered   INTEGER,
    materials_used       INTEGER,
    CONSTRAINT pk_match_stats PRIMARY KEY (id_match_stats),
    CONSTRAINT fk_match_stats_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_stats_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE SET NULL (fk_id_match_player),
    CONSTRAINT uk_match_stats_match UNIQUE (fk_id_match),
    CONSTRAINT chk_match_stats_values CHECK (
        (total_traveled IS NULL OR total_traveled >= 0)
        AND (accuracy IS NULL OR accuracy >= 0)
    )
);

-- ---------------------------------------------------------------------------
-- Elimination events
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_elimination (
    id_elimination          BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match             BIGINT NOT NULL,
    fk_id_eliminated_player BIGINT,
    fk_id_eliminator_player BIGINT,
    event_time_seconds      DOUBLE PRECISION NOT NULL,
    weapon_type             INTEGER,
    source_version          INTEGER,
    was_knocked             BOOLEAN,
    eliminated_player_type  VARCHAR(30),
    eliminator_player_type  VARCHAR(30),
    CONSTRAINT pk_elimination PRIMARY KEY (id_elimination),
    CONSTRAINT fk_elimination_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE CASCADE,
    CONSTRAINT fk_elimination_victim
        FOREIGN KEY (fk_id_match, fk_id_eliminated_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE SET NULL (fk_id_eliminated_player),
    CONSTRAINT fk_elimination_eliminator
        FOREIGN KEY (fk_id_match, fk_id_eliminator_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE SET NULL (fk_id_eliminator_player),
    CONSTRAINT chk_elimination_event_time CHECK (event_time_seconds >= 0)
);

-- ---------------------------------------------------------------------------
-- Map- and season-scoped POIs and consolidated visits
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_poi (
    id_poi             BIGINT GENERATED ALWAYS AS IDENTITY,
    center_x           DOUBLE PRECISION,
    center_y           DOUBLE PRECISION,
    center_z           DOUBLE PRECISION,
    boundary_radius    DOUBLE PRECISION,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    map_code           VARCHAR(100) NOT NULL,
    season_code        VARCHAR(80),
    poi_code           VARCHAR(150) NOT NULL,
    display_name       VARCHAR(150) NOT NULL,
    coordinate_system  VARCHAR(100),
    boundary_geometry  JSONB,
    CONSTRAINT pk_poi PRIMARY KEY (id_poi),
    CONSTRAINT uk_poi_map_season_code
        UNIQUE NULLS NOT DISTINCT (map_code, season_code, poi_code),
    CONSTRAINT chk_poi_boundary_radius
        CHECK (boundary_radius IS NULL OR boundary_radius >= 0)
);

CREATE TABLE fortnite_replay.tb_player_poi_visit (
    id_poi_visit        BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match         BIGINT NOT NULL,
    fk_id_match_player  BIGINT NOT NULL,
    fk_id_poi           BIGINT NOT NULL,
    started_at_seconds  DOUBLE PRECISION NOT NULL,
    ended_at_seconds    DOUBLE PRECISION NOT NULL,
    duration_seconds    DOUBLE PRECISION NOT NULL,
    confidence          DOUBLE PRECISION,
    sample_count        INTEGER,
    detection_method    VARCHAR(50),
    CONSTRAINT pk_player_poi_visit PRIMARY KEY (id_poi_visit),
    CONSTRAINT fk_poi_visit_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE CASCADE,
    CONSTRAINT fk_poi_visit_poi
        FOREIGN KEY (fk_id_poi)
        REFERENCES fortnite_replay.tb_poi (id_poi)
        ON DELETE RESTRICT,
    CONSTRAINT chk_poi_visit_times CHECK (
        started_at_seconds >= 0
        AND ended_at_seconds >= started_at_seconds
        AND duration_seconds >= 0
    ),
    CONSTRAINT chk_poi_visit_confidence CHECK (
        confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
    ),
    CONSTRAINT chk_poi_visit_sample_count
        CHECK (sample_count IS NULL OR sample_count >= 0)
);

COMMENT ON COLUMN fortnite_replay.tb_poi.boundary_geometry IS
    'Optional map-coordinate boundary geometry; it stores POI catalog bounds, not player movement samples.';
COMMENT ON COLUMN fortnite_replay.tb_match_player.cosmetics IS
    'Last-observed cosmetic snapshot retained as auxiliary replay data.';

-- ---------------------------------------------------------------------------
-- Container instances and their replay-observed interactions
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_container (
    id_container       BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match        BIGINT NOT NULL,
    location_x         DOUBLE PRECISION,
    location_y         DOUBLE PRECISION,
    location_z         DOUBLE PRECISION,
    first_seen_seconds DOUBLE PRECISION,
    replay_actor_id    VARCHAR(200),
    container_kind     VARCHAR(80) NOT NULL,
    blueprint          VARCHAR(255),
    CONSTRAINT pk_container PRIMARY KEY (id_container),
    CONSTRAINT fk_container_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE CASCADE,
    CONSTRAINT uk_container_scope UNIQUE (fk_id_match, id_container),
    CONSTRAINT chk_container_first_seen
        CHECK (first_seen_seconds IS NULL OR first_seen_seconds >= 0)
);

CREATE TABLE fortnite_replay.tb_container_interaction (
    id_container_interaction BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match              BIGINT NOT NULL,
    fk_id_container          BIGINT NOT NULL,
    fk_id_match_player       BIGINT,
    event_time_seconds       DOUBLE PRECISION NOT NULL,
    is_refill_reopen         BOOLEAN NOT NULL DEFAULT FALSE,
    interaction_type         VARCHAR(30) NOT NULL DEFAULT 'opened',
    source_confidence        VARCHAR(20),
    CONSTRAINT pk_container_interaction PRIMARY KEY (id_container_interaction),
    CONSTRAINT fk_interaction_container
        FOREIGN KEY (fk_id_match, fk_id_container)
        REFERENCES fortnite_replay.tb_container (fk_id_match, id_container)
        ON DELETE CASCADE,
    CONSTRAINT fk_interaction_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE SET NULL (fk_id_match_player),
    CONSTRAINT uk_interaction_scope
        UNIQUE (fk_id_match, id_container_interaction),
    CONSTRAINT chk_interaction_type
        CHECK (interaction_type IN ('opened', 'destroyed', 'searched', 'unknown')),
    CONSTRAINT chk_interaction_event_time CHECK (event_time_seconds >= 0)
);

-- ---------------------------------------------------------------------------
-- Flexible reward catalog and observed rewards
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_reward_type (
    id_reward_type BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    reward_code    VARCHAR(150) NOT NULL,
    category       VARCHAR(80),
    display_name   VARCHAR(150),
    CONSTRAINT pk_reward_type PRIMARY KEY (id_reward_type),
    CONSTRAINT uk_reward_type_code UNIQUE (reward_code)
);

CREATE TABLE fortnite_replay.tb_reward (
    id_reward                    BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match                  BIGINT NOT NULL,
    fk_id_match_player           BIGINT,
    fk_id_reward_type            BIGINT NOT NULL,
    fk_id_container_interaction  BIGINT,
    event_time_seconds           DOUBLE PRECISION,
    is_golden_chest              BOOLEAN,
    is_teammate_reward           BOOLEAN NOT NULL DEFAULT FALSE,
    is_from_chest                BOOLEAN,
    was_destroyed                BOOLEAN,
    origin                       VARCHAR(50),
    source_confidence            VARCHAR(20),
    CONSTRAINT pk_reward PRIMARY KEY (id_reward),
    CONSTRAINT fk_reward_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE CASCADE,
    CONSTRAINT fk_reward_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE SET NULL (fk_id_match_player),
    CONSTRAINT fk_reward_type
        FOREIGN KEY (fk_id_reward_type)
        REFERENCES fortnite_replay.tb_reward_type (id_reward_type)
        ON DELETE RESTRICT,
    CONSTRAINT fk_reward_interaction
        FOREIGN KEY (fk_id_match, fk_id_container_interaction)
        REFERENCES fortnite_replay.tb_container_interaction
            (fk_id_match, id_container_interaction)
        ON DELETE SET NULL (fk_id_container_interaction),
    CONSTRAINT chk_reward_event_time
        CHECK (event_time_seconds IS NULL OR event_time_seconds >= 0)
);

-- ---------------------------------------------------------------------------
-- Vehicle catalog and aggregated player usage
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_vehicle (
    id_vehicle    BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vehicle_code  VARCHAR(150) NOT NULL,
    display_name  VARCHAR(150),
    vehicle_class VARCHAR(80),
    CONSTRAINT pk_vehicle PRIMARY KEY (id_vehicle),
    CONSTRAINT uk_vehicle_code UNIQUE (vehicle_code)
);

CREATE TABLE fortnite_replay.tb_player_vehicle (
    id_player_vehicle  BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match        BIGINT NOT NULL,
    fk_id_match_player BIGINT NOT NULL,
    fk_id_vehicle      BIGINT NOT NULL,
    first_used_seconds DOUBLE PRECISION,
    last_used_seconds  DOUBLE PRECISION,
    usage_count        INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT pk_player_vehicle PRIMARY KEY (id_player_vehicle),
    CONSTRAINT fk_player_vehicle_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE CASCADE,
    CONSTRAINT fk_player_vehicle_vehicle
        FOREIGN KEY (fk_id_vehicle)
        REFERENCES fortnite_replay.tb_vehicle (id_vehicle)
        ON DELETE RESTRICT,
    CONSTRAINT uk_player_vehicle_usage
        UNIQUE (fk_id_match, fk_id_match_player, fk_id_vehicle),
    CONSTRAINT chk_player_vehicle_usage CHECK (
        usage_count > 0
        AND (first_used_seconds IS NULL OR first_used_seconds >= 0)
        AND (last_used_seconds IS NULL OR last_used_seconds >= 0)
        AND (
            first_used_seconds IS NULL
            OR last_used_seconds IS NULL
            OR last_used_seconds >= first_used_seconds
        )
    )
);

-- ---------------------------------------------------------------------------
-- Storm phases
-- ---------------------------------------------------------------------------
CREATE TABLE fortnite_replay.tb_safe_zone_phase (
    id_safe_zone_phase BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_match        BIGINT NOT NULL,
    starts_at_seconds  DOUBLE PRECISION,
    ends_at_seconds    DOUBLE PRECISION,
    center_x           DOUBLE PRECISION,
    center_y           DOUBLE PRECISION,
    radius             DOUBLE PRECISION,
    phase_number       SMALLINT NOT NULL,
    CONSTRAINT pk_safe_zone_phase PRIMARY KEY (id_safe_zone_phase),
    CONSTRAINT fk_safe_zone_phase_match
        FOREIGN KEY (fk_id_match)
        REFERENCES fortnite_replay.tb_match (id_match)
        ON DELETE CASCADE,
    CONSTRAINT uk_safe_zone_phase_match_number UNIQUE (fk_id_match, phase_number),
    CONSTRAINT chk_safe_zone_phase_values CHECK (
        phase_number > 0
        AND (starts_at_seconds IS NULL OR starts_at_seconds >= 0)
        AND (
            starts_at_seconds IS NULL
            OR ends_at_seconds IS NULL
            OR ends_at_seconds >= starts_at_seconds
        )
        AND (radius IS NULL OR radius >= 0)
    )
);

-- ---------------------------------------------------------------------------
-- Workload indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_match_start_at
    ON fortnite_replay.tb_match (match_start_at DESC);
CREATE INDEX idx_match_season
    ON fortnite_replay.tb_match (season_code, id_match);

CREATE INDEX idx_replay_attempt_history
    ON fortnite_replay.tb_replay_processing_attempt
       (fk_id_replay_file, started_at DESC);
CREATE UNIQUE INDEX ux_replay_one_processing_attempt
    ON fortnite_replay.tb_replay_processing_attempt (fk_id_replay_file)
    WHERE status = 'processing';

CREATE INDEX idx_match_player_history
    ON fortnite_replay.tb_match_player (fk_id_player, fk_id_match);
CREATE INDEX idx_match_player_teammates
    ON fortnite_replay.tb_match_player (fk_id_match, team_index, fk_id_player);

CREATE INDEX idx_elimination_victim_history
    ON fortnite_replay.tb_elimination
       (fk_id_eliminated_player, fk_id_match, event_time_seconds);
CREATE INDEX idx_elimination_eliminator_history
    ON fortnite_replay.tb_elimination
       (fk_id_eliminator_player, fk_id_match, event_time_seconds);

CREATE INDEX idx_poi_visit_player_poi
    ON fortnite_replay.tb_player_poi_visit
       (fk_id_match_player, fk_id_match, fk_id_poi);

CREATE INDEX idx_container_match_kind
    ON fortnite_replay.tb_container (fk_id_match, container_kind);
CREATE INDEX idx_interaction_container
    ON fortnite_replay.tb_container_interaction (fk_id_match, fk_id_container);
CREATE INDEX idx_interaction_player_time
    ON fortnite_replay.tb_container_interaction
       (fk_id_match, fk_id_match_player, event_time_seconds);

CREATE INDEX idx_reward_player_time
    ON fortnite_replay.tb_reward
       (fk_id_match, fk_id_match_player, event_time_seconds);
CREATE INDEX idx_reward_interaction
    ON fortnite_replay.tb_reward (fk_id_match, fk_id_container_interaction);
CREATE INDEX idx_reward_type_match
    ON fortnite_replay.tb_reward (fk_id_reward_type, fk_id_match);

CREATE INDEX idx_player_vehicle_player
    ON fortnite_replay.tb_player_vehicle (fk_id_match_player, fk_id_match);
CREATE INDEX idx_player_vehicle_vehicle
    ON fortnite_replay.tb_player_vehicle (fk_id_vehicle, fk_id_match);

-- ---------------------------------------------------------------------------
-- Derived query views
-- ---------------------------------------------------------------------------
CREATE VIEW fortnite_replay.vw_player_teammate_summary AS
SELECT
    first_player.fk_id_player AS id_player,
    second_player.fk_id_player AS teammate_id_player,
    COUNT(*) AS shared_matches,
    MAX(m.match_start_at) AS last_shared_match_at
FROM fortnite_replay.tb_match_player AS first_player
JOIN fortnite_replay.tb_match_player AS second_player
    ON second_player.fk_id_match = first_player.fk_id_match
   AND second_player.team_index = first_player.team_index
   AND second_player.fk_id_player <> first_player.fk_id_player
JOIN fortnite_replay.tb_match AS m
    ON m.id_match = first_player.fk_id_match
WHERE first_player.fk_id_player IS NOT NULL
  AND second_player.fk_id_player IS NOT NULL
  AND first_player.team_index IS NOT NULL
GROUP BY first_player.fk_id_player, second_player.fk_id_player;

CREATE VIEW fortnite_replay.vw_player_poi_season AS
SELECT
    match_player.fk_id_player AS id_player,
    m.season_code,
    poi_visit.fk_id_poi,
    SUM(poi_visit.duration_seconds) AS total_seconds,
    COUNT(*) AS visit_count
FROM fortnite_replay.tb_player_poi_visit AS poi_visit
JOIN fortnite_replay.tb_match_player AS match_player
    ON match_player.fk_id_match = poi_visit.fk_id_match
   AND match_player.id_match_player = poi_visit.fk_id_match_player
JOIN fortnite_replay.tb_match AS m
    ON m.id_match = poi_visit.fk_id_match
WHERE match_player.fk_id_player IS NOT NULL
GROUP BY match_player.fk_id_player, m.season_code, poi_visit.fk_id_poi;

COMMIT;
