-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: FORTNITE REPLAY (Match Telemetry & Analysis)
-- Descrição: Base unificada contendo a estrutura inicial + atualizações de snapshot, 
-- ingestion inbox e observability (Migrations consolidadas).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS fortnite_replay;

CREATE TABLE fortnite_replay.replay_file (
    file_sha256 CHAR(64) PRIMARY KEY
        CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    first_registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fortnite_replay.replay_upload (
    file_sha256 CHAR(64) NOT NULL REFERENCES fortnite_replay.replay_file(file_sha256),
    application_id TEXT NOT NULL,
    first_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (file_sha256, application_id)
);

CREATE TABLE fortnite_replay.processing_attempt (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_sha256 CHAR(64) NOT NULL REFERENCES fortnite_replay.replay_file(file_sha256),
    application_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    payload_sha256 CHAR(64) CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    analyzer_version TEXT,
    application_version TEXT,
    parser_name TEXT,
    parser_version TEXT,
    snapshot_data JSONB,
    original_payload BYTEA,
    parse_mode TEXT CHECK (parse_mode IS NULL OR parse_mode IN ('EventsOnly', 'Minimal', 'Normal', 'Full')),
    status TEXT NOT NULL CHECK (status IN ('accepted', 'processing', 'succeeded', 'failed', 'skipped')),
    error_code TEXT,
    error_message TEXT,
    error_detail TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_expires_at TIMESTAMPTZ,
    worker_attempts INTEGER NOT NULL DEFAULT 0 CHECK (worker_attempts >= 0),
    UNIQUE (file_sha256, application_id, idempotency_key),
    FOREIGN KEY (file_sha256, application_id)
        REFERENCES fortnite_replay.replay_upload(file_sha256, application_id),
    CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX processing_attempt_status_received_idx
    ON fortnite_replay.processing_attempt (status, received_at DESC);
CREATE INDEX processing_attempt_inbox_ready_idx
    ON fortnite_replay.processing_attempt (status, available_at, received_at);
CREATE INDEX processing_attempt_file_received_idx
    ON fortnite_replay.processing_attempt (file_sha256, received_at DESC);

CREATE TABLE fortnite_replay.ingestion_diagnostic (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_sha256 CHAR(64) NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    application_id TEXT,
    idempotency_key TEXT,
    payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    original_payload BYTEA NOT NULL CHECK (octet_length(original_payload) <= 1048576),
    error_code TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ingestion_diagnostic_file_received_idx
    ON fortnite_replay.ingestion_diagnostic (file_sha256, received_at DESC);
CREATE INDEX ingestion_diagnostic_received_idx
    ON fortnite_replay.ingestion_diagnostic (received_at, id);

CREATE TABLE fortnite_replay.processing_section (
    processing_attempt_id BIGINT NOT NULL
        REFERENCES fortnite_replay.processing_attempt(id) ON DELETE CASCADE,
    section_name TEXT NOT NULL CHECK (
        section_name IN (
            'match',
            'players',
            'teams',
            'eventEliminations',
            'killFeed',
            'map',
            'weapons',
            'observations'
        )
    ),
    value_state TEXT NOT NULL CHECK (value_state IN ('present', 'null', 'missing')),
    item_count INTEGER,
    PRIMARY KEY (processing_attempt_id, section_name),
    CHECK (item_count IS NULL OR item_count >= 0),
    CHECK (
        (value_state = 'present' AND item_count IS NOT NULL)
        OR (value_state <> 'present' AND item_count IS NULL)
    )
);

CREATE TABLE fortnite_replay.processing_stage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    processing_attempt_id BIGINT NOT NULL
        REFERENCES fortnite_replay.processing_attempt(id) ON DELETE CASCADE,
    worker_attempt INTEGER NOT NULL DEFAULT 0 CHECK (worker_attempt >= 0),
    stage_name TEXT NOT NULL CHECK (stage_name IN (
        'HTTP_RECEIVED',
        'PAYLOAD_PERSISTED',
        'JOB_ENQUEUED',
        'WORKER_CLAIMED',
        'PARSER_STARTED',
        'PARSER_COMPLETED',
        'NORMALIZATION_STARTED',
        'NORMALIZATION_COMPLETED',
        'DATABASE_PERSISTED',
        'PROCESSING_COMPLETED'
    )),
    result TEXT NOT NULL CHECK (result IN (
        'started', 'succeeded', 'partial_success', 'failed', 'skipped'
    )),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms >= 0),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    error_message TEXT,
    error_detail TEXT,
    CHECK (completed_at IS NULL OR completed_at >= started_at),
    CHECK (
        (result = 'started' AND completed_at IS NULL AND duration_ms IS NULL)
        OR (result <> 'started' AND completed_at IS NOT NULL AND duration_ms IS NOT NULL)
    )
);

CREATE INDEX processing_stage_attempt_timeline_idx
    ON fortnite_replay.processing_stage (processing_attempt_id, id);
CREATE INDEX processing_stage_result_completed_idx
    ON fortnite_replay.processing_stage (result, completed_at DESC)
    WHERE result IN ('partial_success', 'failed');
CREATE INDEX processing_stage_completed_idx
    ON fortnite_replay.processing_stage (completed_at, id)
    WHERE completed_at IS NOT NULL;

CREATE TABLE fortnite_replay.game_match (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identity_key TEXT NOT NULL UNIQUE,
    game_session_id TEXT,
    replay_timestamp TIMESTAMPTZ,
    replay_length_milliseconds BIGINT,
    replay_branch TEXT,
    utc_time_started_match TIMESTAMPTZ,
    match_end_time DOUBLE PRECISION,
    current_playlist TEXT,
    map_info TEXT,
    additional_playlist_levels TEXT[],
    active_gameplay_modifiers TEXT[],
    recorder_id BIGINT,
    max_players INTEGER,
    total_teams INTEGER,
    total_bots INTEGER,
    tournament_round INTEGER,
    is_large_team_game BOOLEAN,
    team_count INTEGER,
    team_size INTEGER,
    player_bots_left INTEGER,
    players_left INTEGER,
    teams_left INTEGER,
    elapsed_time INTEGER,
    game_phase INTEGER,
    safe_zone_phase SMALLINT,
    has_begun_play BOOLEAN,
    total_player_structures BIGINT,
    winning_team BIGINT,
    winning_player_ids INTEGER[],
    aircraft_start_time DOUBLE PRECISION,
    safe_zones_start_time DOUBLE PRECISION,
    team_stats_position BIGINT,
    team_stats_total_players BIGINT,
    team_stats_unknown BIGINT,
    team_stats_event_id TEXT,
    team_stats_event_group TEXT,
    team_stats_event_metadata TEXT,
    team_stats_event_start_time BIGINT,
    team_stats_event_end_time BIGINT,
    team_stats_event_size_in_bytes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (replay_length_milliseconds IS NULL OR replay_length_milliseconds >= 0),
    CHECK (recorder_id IS NULL OR recorder_id >= 0),
    CHECK (team_count IS NULL OR team_count >= 0),
    CHECK (team_size IS NULL OR team_size >= 0),
    CHECK (player_bots_left IS NULL OR player_bots_left >= 0),
    CHECK (players_left IS NULL OR players_left >= 0),
    CHECK (teams_left IS NULL OR teams_left >= 0),
    CHECK (safe_zone_phase IS NULL OR safe_zone_phase >= 0)
);

CREATE UNIQUE INDEX replay_match_game_session_uidx
    ON fortnite_replay.game_match (game_session_id)
    WHERE game_session_id IS NOT NULL;
CREATE INDEX replay_match_started_idx
    ON fortnite_replay.game_match (utc_time_started_match DESC);
CREATE INDEX replay_match_playlist_started_idx
    ON fortnite_replay.game_match (current_playlist, utc_time_started_match DESC);

CREATE TABLE fortnite_replay.match_processing_attempt (
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    PRIMARY KEY (match_id, processing_attempt_id),
    UNIQUE (processing_attempt_id)
);

CREATE TABLE fortnite_replay.game_state_observation (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    observation_index INTEGER NOT NULL,
    world_time_seconds DOUBLE PRECISION,
    replicated_world_time_seconds REAL,
    replicated_world_time_seconds_double DOUBLE PRECISION,
    team_count INTEGER,
    team_size INTEGER,
    player_bots_left INTEGER,
    players_left INTEGER,
    teams_left INTEGER,
    elapsed_time INTEGER,
    game_phase INTEGER,
    safe_zone_phase SMALLINT,
    has_begun_play BOOLEAN,
    UNIQUE (match_id, processing_attempt_id, observation_index),
    CHECK (observation_index >= 0)
);

CREATE INDEX game_state_observation_match_time_idx
    ON fortnite_replay.game_state_observation (match_id, world_time_seconds, id);

CREATE TABLE fortnite_replay.match_stats (
    match_id BIGINT PRIMARY KEY REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    event_id TEXT,
    event_group TEXT,
    event_metadata TEXT,
    event_start_time BIGINT,
    event_end_time BIGINT,
    event_size_in_bytes INTEGER,
    total_traveled DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    unknown_value BIGINT,
    assists BIGINT,
    eliminations BIGINT,
    weapon_damage BIGINT,
    other_damage BIGINT,
    revives BIGINT,
    damage_taken BIGINT,
    damage_to_structures BIGINT,
    materials_gathered BIGINT,
    materials_used BIGINT
);

CREATE TABLE fortnite_replay.player_identity (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    epic_id TEXT,
    bot_id TEXT,
    platform_unique_net_id TEXT,
    latest_player_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(epic_id, bot_id, platform_unique_net_id) >= 1)
);

CREATE UNIQUE INDEX player_identity_epic_uidx
    ON fortnite_replay.player_identity (epic_id) WHERE epic_id IS NOT NULL;
CREATE UNIQUE INDEX player_identity_bot_uidx
    ON fortnite_replay.player_identity (bot_id) WHERE bot_id IS NOT NULL;
CREATE UNIQUE INDEX player_identity_platform_uidx
    ON fortnite_replay.player_identity (platform_unique_net_id)
    WHERE platform_unique_net_id IS NOT NULL;
CREATE INDEX player_identity_name_idx
    ON fortnite_replay.player_identity (latest_player_name);

CREATE TABLE fortnite_replay.match_player (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    player_identity_id BIGINT REFERENCES fortnite_replay.player_identity(id) ON DELETE SET NULL,
    replay_player_id INTEGER,
    parser_player_id TEXT,
    epic_id TEXT,
    platform_unique_net_id TEXT,
    bot_id TEXT,
    is_bot BOOLEAN,
    player_name TEXT,
    player_name_custom_override TEXT,
    streamer_mode_name TEXT,
    platform TEXT,
    level INTEGER,
    season_level_ui_display BIGINT,
    inventory_id BIGINT,
    player_number INTEGER,
    team_index INTEGER,
    is_party_leader BOOLEAN,
    is_replay_owner BOOLEAN,
    is_game_session_owner BOOLEAN,
    has_finished_loading BOOLEAN,
    has_started_playing BOOLEAN,
    has_thanked_bus_driver BOOLEAN,
    is_using_streamer_mode BOOLEAN,
    is_using_anonymous_mode BOOLEAN,
    disconnected BOOLEAN,
    reboot_counter BIGINT,
    placement INTEGER,
    kills BIGINT,
    team_kills BIGINT,
    death_cause INTEGER,
    death_circumstance INTEGER,
    death_location_x DOUBLE PRECISION,
    death_location_y DOUBLE PRECISION,
    death_location_z DOUBLE PRECISION,
    death_location_scale_factor INTEGER,
    death_location_bits INTEGER,
    death_time DOUBLE PRECISION,
    death_time_double DOUBLE PRECISION,
    current_weapon_actor_id BIGINT,
    cosmetics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, replay_player_id),
    UNIQUE (id, match_id),
    CHECK (replay_player_id IS NULL OR replay_player_id >= 0)
);

CREATE INDEX match_player_identity_match_idx
    ON fortnite_replay.match_player (player_identity_id, match_id);
CREATE INDEX match_player_replay_id_idx
    ON fortnite_replay.match_player (match_id, replay_player_id)
    WHERE replay_player_id IS NOT NULL;
CREATE INDEX match_player_team_idx
    ON fortnite_replay.match_player (match_id, team_index);
CREATE INDEX match_player_placement_idx
    ON fortnite_replay.match_player (match_id, placement);

CREATE TABLE fortnite_replay.match_player_death_tag (
    match_player_id BIGINT NOT NULL REFERENCES fortnite_replay.match_player(id) ON DELETE CASCADE,
    tag_index INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (match_player_id, tag_index)
);

CREATE TABLE fortnite_replay.match_team (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    team_index INTEGER,
    party_owner_replay_player_id INTEGER,
    placement INTEGER,
    team_kills BIGINT,
    UNIQUE (match_id, team_index),
    UNIQUE (id, match_id)
);

CREATE TABLE fortnite_replay.match_team_member (
    team_id BIGINT NOT NULL,
    match_id BIGINT NOT NULL,
    member_index INTEGER NOT NULL,
    replay_player_id INTEGER,
    match_player_id BIGINT,
    player_name TEXT,
    PRIMARY KEY (team_id, member_index),
    FOREIGN KEY (team_id, match_id)
        REFERENCES fortnite_replay.match_team(id, match_id) ON DELETE CASCADE,
    FOREIGN KEY (match_player_id, match_id)
        REFERENCES fortnite_replay.match_player(id, match_id) ON DELETE CASCADE
);

CREATE INDEX match_team_player_idx
    ON fortnite_replay.match_team_member (match_id, replay_player_id);

CREATE TABLE fortnite_replay.event_elimination (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    event_index INTEGER NOT NULL,
    source_event_key CHAR(64) NOT NULL CHECK (source_event_key ~ '^[0-9a-f]{64}$'),
    event_id TEXT,
    event_group TEXT,
    event_metadata TEXT,
    event_start_time DOUBLE PRECISION,
    event_end_time DOUBLE PRECISION,
    event_size_in_bytes INTEGER,
    eliminated_id TEXT,
    eliminated_player_type TEXT,
    eliminated_player_type_code INTEGER,
    eliminated_location_x DOUBLE PRECISION,
    eliminated_location_y DOUBLE PRECISION,
    eliminated_location_z DOUBLE PRECISION,
    eliminated_location_scale_factor INTEGER,
    eliminated_location_bits INTEGER,
    eliminated_rotation_x DOUBLE PRECISION,
    eliminated_rotation_y DOUBLE PRECISION,
    eliminated_rotation_z DOUBLE PRECISION,
    eliminated_rotation_w DOUBLE PRECISION,
    eliminated_scale_x DOUBLE PRECISION,
    eliminated_scale_y DOUBLE PRECISION,
    eliminated_scale_z DOUBLE PRECISION,
    eliminated_scale_scale_factor INTEGER,
    eliminated_scale_bits INTEGER,
    eliminator_id TEXT,
    eliminator_player_type TEXT,
    eliminator_player_type_code INTEGER,
    eliminator_location_x DOUBLE PRECISION,
    eliminator_location_y DOUBLE PRECISION,
    eliminator_location_z DOUBLE PRECISION,
    eliminator_location_scale_factor INTEGER,
    eliminator_location_bits INTEGER,
    eliminator_rotation_x DOUBLE PRECISION,
    eliminator_rotation_y DOUBLE PRECISION,
    eliminator_rotation_z DOUBLE PRECISION,
    eliminator_rotation_w DOUBLE PRECISION,
    eliminator_scale_x DOUBLE PRECISION,
    eliminator_scale_y DOUBLE PRECISION,
    eliminator_scale_z DOUBLE PRECISION,
    eliminator_scale_scale_factor INTEGER,
    eliminator_scale_bits INTEGER,
    gun_type SMALLINT,
    knocked BOOLEAN,
    library_distance DOUBLE PRECISION,
    UNIQUE (match_id, source_event_key),
    UNIQUE (match_id, event_index)
);

CREATE INDEX event_elimination_match_time_idx
    ON fortnite_replay.event_elimination (match_id, event_start_time, id);

CREATE TABLE fortnite_replay.kill_feed (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    event_index INTEGER NOT NULL,
    source_event_key CHAR(64) NOT NULL CHECK (source_event_key ~ '^[0-9a-f]{64}$'),
    player_replay_id INTEGER,
    player_name TEXT,
    player_is_bot BOOLEAN,
    finisher_or_downer_replay_id INTEGER,
    finisher_or_downer_name TEXT,
    finisher_or_downer_is_bot BOOLEAN,
    replicated_world_time_seconds REAL,
    replicated_world_time_seconds_double DOUBLE PRECISION,
    distance REAL,
    death_cause INTEGER,
    death_circumstance INTEGER,
    death_location_x DOUBLE PRECISION,
    death_location_y DOUBLE PRECISION,
    death_location_z DOUBLE PRECISION,
    death_location_scale_factor INTEGER,
    death_location_bits INTEGER,
    is_downed BOOLEAN,
    is_revived BOOLEAN,
    UNIQUE (match_id, source_event_key),
    UNIQUE (match_id, event_index)
);

CREATE INDEX kill_feed_match_time_idx
    ON fortnite_replay.kill_feed (match_id, replicated_world_time_seconds_double, id);
CREATE INDEX kill_feed_player_idx
    ON fortnite_replay.kill_feed (match_id, player_replay_id, id);

CREATE TABLE fortnite_replay.kill_feed_death_tag (
    kill_feed_id BIGINT NOT NULL REFERENCES fortnite_replay.kill_feed(id) ON DELETE CASCADE,
    tag_index INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (kill_feed_id, tag_index)
);

CREATE TABLE fortnite_replay.map_snapshot (
    match_id BIGINT PRIMARY KEY REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    world_grid_start_x DOUBLE PRECISION,
    world_grid_start_y DOUBLE PRECISION,
    world_grid_end_x DOUBLE PRECISION,
    world_grid_end_y DOUBLE PRECISION,
    world_grid_spacing_x DOUBLE PRECISION,
    world_grid_spacing_y DOUBLE PRECISION,
    world_grid_total_size_x DOUBLE PRECISION,
    world_grid_total_size_y DOUBLE PRECISION,
    grid_count_x INTEGER,
    grid_count_y INTEGER,
    poi_tag_container_table_size INTEGER
);

CREATE TABLE fortnite_replay.map_poi_tag (
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    tag_index INTEGER NOT NULL,
    poi_tag TEXT NOT NULL,
    PRIMARY KEY (match_id, tag_index)
);

CREATE TABLE fortnite_replay.battle_bus_flight_path (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    path_index INTEGER NOT NULL,
    start_x DOUBLE PRECISION,
    start_y DOUBLE PRECISION,
    start_z DOUBLE PRECISION,
    rotation_pitch DOUBLE PRECISION,
    rotation_yaw DOUBLE PRECISION,
    rotation_roll DOUBLE PRECISION,
    velocity_x DOUBLE PRECISION,
    velocity_y DOUBLE PRECISION,
    velocity_z DOUBLE PRECISION,
    flight_time DOUBLE PRECISION,
    drop_time DOUBLE PRECISION,
    skin TEXT,
    UNIQUE (match_id, path_index)
);

CREATE TABLE fortnite_replay.map_safe_zone (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    source_index INTEGER NOT NULL,
    center_x DOUBLE PRECISION,
    center_y DOUBLE PRECISION,
    center_z DOUBLE PRECISION,
    radius DOUBLE PRECISION,
    start_shrink_time REAL,
    finish_shrink_time REAL,
    last_radius REAL,
    next_radius REAL,
    next_next_radius REAL,
    last_center_x DOUBLE PRECISION,
    last_center_y DOUBLE PRECISION,
    last_center_z DOUBLE PRECISION,
    last_center_scale_factor INTEGER,
    last_center_bits INTEGER,
    next_center_x DOUBLE PRECISION,
    next_center_y DOUBLE PRECISION,
    next_center_z DOUBLE PRECISION,
    next_center_scale_factor INTEGER,
    next_center_bits INTEGER,
    next_next_center_x DOUBLE PRECISION,
    next_next_center_y DOUBLE PRECISION,
    next_next_center_z DOUBLE PRECISION,
    next_next_center_scale_factor INTEGER,
    next_next_center_bits INTEGER,
    UNIQUE (match_id, source_index)
);

CREATE TABLE fortnite_replay.map_llama (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    source_actor_key TEXT,
    position_x DOUBLE PRECISION,
    position_y DOUBLE PRECISION,
    position_z DOUBLE PRECISION,
    destination_x DOUBLE PRECISION,
    destination_y DOUBLE PRECISION,
    destination_z DOUBLE PRECISION,
    looted BOOLEAN,
    UNIQUE (match_id, source_actor_key)
);

CREATE TABLE fortnite_replay.map_supply_drop (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    source_actor_key TEXT,
    landing_x DOUBLE PRECISION,
    landing_y DOUBLE PRECISION,
    landing_z DOUBLE PRECISION,
    fall_x DOUBLE PRECISION,
    fall_y DOUBLE PRECISION,
    fall_z DOUBLE PRECISION,
    balloon_x DOUBLE PRECISION,
    balloon_y DOUBLE PRECISION,
    balloon_z DOUBLE PRECISION,
    looted BOOLEAN,
    UNIQUE (match_id, source_actor_key)
);

CREATE TABLE fortnite_replay.map_reboot_van (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    source_actor_key TEXT,
    actor_guid TEXT,
    actor_handle BIGINT,
    location_x DOUBLE PRECISION,
    location_y DOUBLE PRECISION,
    location_z DOUBLE PRECISION,
    state INTEGER,
    UNIQUE (match_id, source_actor_key)
);

CREATE TABLE fortnite_replay.movement_sample (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL,
    match_player_id BIGINT NOT NULL,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    sample_key CHAR(64) NOT NULL CHECK (sample_key ~ '^[0-9a-f]{64}$'),
    pawn_actor_id BIGINT,
    replicated_world_time_seconds REAL,
    replicated_world_time_seconds_double DOUBLE PRECISION,
    last_update_time REAL,
    location_x DOUBLE PRECISION,
    location_y DOUBLE PRECISION,
    location_z DOUBLE PRECISION,
    rotation_pitch DOUBLE PRECISION,
    rotation_yaw DOUBLE PRECISION,
    rotation_roll DOUBLE PRECISION,
    linear_velocity_x DOUBLE PRECISION,
    linear_velocity_y DOUBLE PRECISION,
    linear_velocity_z DOUBLE PRECISION,
    angular_velocity_x DOUBLE PRECISION,
    angular_velocity_y DOUBLE PRECISION,
    angular_velocity_z DOUBLE PRECISION,
    acceleration_x DOUBLE PRECISION,
    acceleration_y DOUBLE PRECISION,
    acceleration_z DOUBLE PRECISION,
    is_simulated_physics_sleep BOOLEAN,
    is_replicating_physics BOOLEAN,
    is_replicating_acceleration BOOLEAN,
    server_frame BIGINT,
    b_rep_movement_handle BIGINT,
    location_quantization_level INTEGER,
    velocity_quantization_level INTEGER,
    rotation_quantization_level INTEGER,
    replicated_movement_mode INTEGER,
    current_movement_style INTEGER,
    is_sprinting BOOLEAN,
    is_jumping BOOLEAN,
    is_crouched BOOLEAN,
    is_slope_sliding BOOLEAN,
    is_ziplining BOOLEAN,
    is_targeting BOOLEAN,
    is_dbno BOOLEAN,
    is_honking BOOLEAN,
    is_in_any_storm BOOLEAN,
    is_waiting_for_emote_interaction BOOLEAN,
    is_playing_emote BOOLEAN,
    is_skydiving BOOLEAN,
    is_skydiving_from_launch_pad BOOLEAN,
    is_skydiving_from_bus BOOLEAN,
    is_parachute_open BOOLEAN,
    is_parachute_forced_open BOOLEAN,
    is_in_water_volume BOOLEAN,
    vehicle_actor_id BIGINT,
    vehicle_path TEXT,
    seat_index SMALLINT,
    UNIQUE (match_id, sample_key),
    FOREIGN KEY (match_player_id, match_id)
        REFERENCES fortnite_replay.match_player(id, match_id) ON DELETE CASCADE
);

CREATE INDEX movement_sample_match_time_idx
    ON fortnite_replay.movement_sample (match_id, replicated_world_time_seconds_double, id);
CREATE INDEX movement_sample_player_time_idx
    ON fortnite_replay.movement_sample (match_player_id, replicated_world_time_seconds_double, id);
CREATE INDEX movement_sample_vehicle_idx
    ON fortnite_replay.movement_sample (match_id, vehicle_actor_id)
    WHERE vehicle_actor_id IS NOT NULL;

CREATE TABLE fortnite_replay.weapon_observation (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    actor_id BIGINT,
    weapon_name TEXT,
    ammo_count INTEGER,
    weapon_level INTEGER,
    last_fire_time_verified REAL,
    is_equipping_weapon BOOLEAN,
    is_reloading_weapon BOOLEAN,
    value_a BIGINT,
    value_b BIGINT,
    value_c BIGINT,
    value_d BIGINT,
    UNIQUE (match_id, actor_id)
);

CREATE TABLE fortnite_replay.equipped_item_observation (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    observation_index INTEGER NOT NULL,
    time_seconds DOUBLE PRECISION,
    item_name TEXT,
    pawn_actor_id BIGINT,
    player_replay_id INTEGER,
    UNIQUE (match_id, processing_attempt_id, observation_index)
);

CREATE TABLE fortnite_replay.container_interaction (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    observation_index INTEGER NOT NULL,
    source_actor_key TEXT,
    container_label TEXT,
    interaction_kind TEXT CHECK (interaction_kind IN ('container', 'loot_cannon') OR interaction_kind IS NULL),
    time_seconds DOUBLE PRECISION,
    searching_pawn_actor_id BIGINT,
    searching_player_state_actor_id BIGINT,
    searching_player_replay_id INTEGER,
    already_searched BOOLEAN,
    search_animation_count BIGINT,
    destroyed BOOLEAN,
    UNIQUE (match_id, processing_attempt_id, observation_index)
);

CREATE INDEX container_interaction_match_time_idx
    ON fortnite_replay.container_interaction (match_id, time_seconds, id);
CREATE INDEX container_interaction_player_time_idx
    ON fortnite_replay.container_interaction (match_id, searching_player_replay_id, time_seconds);
CREATE INDEX container_interaction_attempt_idx
    ON fortnite_replay.container_interaction (processing_attempt_id);

CREATE TABLE fortnite_replay.dropped_item_observation (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    observation_index INTEGER NOT NULL,
    time_seconds DOUBLE PRECISION,
    item TEXT,
    item_definition_actor_id BIGINT,
    item_definition_path TEXT,
    item_count INTEGER,
    durability DOUBLE PRECISION,
    level INTEGER,
    loaded_ammo INTEGER,
    order_index INTEGER,
    item_owner BIGINT,
    pawn_who_dropped_pickup BIGINT,
    owner BIGINT,
    dropped_by_player_replay_id INTEGER,
    replicated_location_x DOUBLE PRECISION,
    replicated_location_y DOUBLE PRECISION,
    replicated_location_z DOUBLE PRECISION,
    replicated_location_scale_factor INTEGER,
    replicated_location_bits INTEGER,
    loot_initial_position_x DOUBLE PRECISION,
    loot_initial_position_y DOUBLE PRECISION,
    loot_initial_position_z DOUBLE PRECISION,
    loot_initial_position_scale_factor INTEGER,
    loot_initial_position_bits INTEGER,
    loot_final_position_x DOUBLE PRECISION,
    loot_final_position_y DOUBLE PRECISION,
    loot_final_position_z DOUBLE PRECISION,
    loot_final_position_scale_factor INTEGER,
    loot_final_position_bits INTEGER,
    final_toss_rest_location_x DOUBLE PRECISION,
    final_toss_rest_location_y DOUBLE PRECISION,
    final_toss_rest_location_z DOUBLE PRECISION,
    final_toss_rest_location_scale_factor INTEGER,
    final_toss_rest_location_bits INTEGER,
    fly_time DOUBLE PRECISION,
    toss_state INTEGER,
    picked_up BOOLEAN,
    UNIQUE (match_id, processing_attempt_id, observation_index)
);

CREATE INDEX dropped_item_match_time_idx
    ON fortnite_replay.dropped_item_observation (match_id, time_seconds, id);

CREATE TABLE fortnite_replay.treasure_event (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    observation_index INTEGER NOT NULL,
    time_seconds DOUBLE PRECISION,
    prize_id TEXT,
    pawn_actor_id BIGINT,
    player_replay_id INTEGER,
    source_container TEXT,
    UNIQUE (match_id, processing_attempt_id, observation_index)
);

CREATE INDEX treasure_event_match_time_idx
    ON fortnite_replay.treasure_event (match_id, time_seconds, id);
CREATE INDEX treasure_event_attempt_idx
    ON fortnite_replay.treasure_event (processing_attempt_id);

CREATE TABLE fortnite_replay.prize_handler_grant (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES fortnite_replay.game_match(id) ON DELETE CASCADE,
    processing_attempt_id BIGINT NOT NULL REFERENCES fortnite_replay.processing_attempt(id),
    observation_index INTEGER NOT NULL,
    handler TEXT,
    time_seconds DOUBLE PRECISION,
    player_state_actor_id BIGINT,
    player_replay_id INTEGER,
    UNIQUE (match_id, processing_attempt_id, observation_index)
);

CREATE INDEX prize_handler_grant_match_time_idx
    ON fortnite_replay.prize_handler_grant (match_id, time_seconds, id);
CREATE INDEX prize_handler_grant_attempt_idx
    ON fortnite_replay.prize_handler_grant (processing_attempt_id);
