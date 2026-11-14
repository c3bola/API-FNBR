-- Replay ingestion support. Apply after fortnite_replay_1.sql.
BEGIN;

ALTER TABLE fortnite_replay.tb_match
    ADD COLUMN match_key VARCHAR(200);

UPDATE fortnite_replay.tb_match
SET match_key = 'legacy:' || id_match::text
WHERE match_key IS NULL;

ALTER TABLE fortnite_replay.tb_match
    ALTER COLUMN match_key SET NOT NULL,
    ADD CONSTRAINT uk_match_match_key UNIQUE (match_key);

ALTER TABLE fortnite_replay.tb_replay_file
    DROP CONSTRAINT uk_replay_file_match;

ALTER TABLE fortnite_replay.tb_replay_processing_attempt
    ADD COLUMN idempotency_key VARCHAR(100),
    ADD COLUMN request_sha256 VARCHAR(64);

UPDATE fortnite_replay.tb_replay_processing_attempt
SET idempotency_key = 'legacy:' || id_attempt::text,
    request_sha256 = repeat('0', 64)
WHERE idempotency_key IS NULL
   OR request_sha256 IS NULL;

ALTER TABLE fortnite_replay.tb_replay_processing_attempt
    ALTER COLUMN idempotency_key SET NOT NULL,
    ALTER COLUMN request_sha256 SET NOT NULL,
    ADD CONSTRAINT uk_attempt_file_idempotency
        UNIQUE (fk_id_replay_file, idempotency_key),
    ADD CONSTRAINT chk_attempt_request_sha256
        CHECK (request_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE fortnite_replay.tb_match_stats
    ADD COLUMN fk_id_replay_file BIGINT
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE SET NULL;

UPDATE fortnite_replay.tb_match_stats AS match_stats
SET fk_id_replay_file = replay_file.id_replay_file
FROM fortnite_replay.tb_replay_file AS replay_file
WHERE replay_file.fk_id_match = match_stats.fk_id_match;

ALTER TABLE fortnite_replay.tb_container
    ADD COLUMN fk_id_replay_file BIGINT
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    ADD COLUMN source_key VARCHAR(200);

UPDATE fortnite_replay.tb_container AS container
SET fk_id_replay_file = replay_file.id_replay_file,
    source_key = 'legacy:' || container.id_container::text
FROM fortnite_replay.tb_replay_file AS replay_file
WHERE replay_file.fk_id_match = container.fk_id_match;

ALTER TABLE fortnite_replay.tb_container_interaction
    ADD COLUMN fk_id_replay_file BIGINT
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    ADD COLUMN source_key VARCHAR(200);

UPDATE fortnite_replay.tb_container_interaction AS interaction
SET fk_id_replay_file = replay_file.id_replay_file,
    source_key = 'legacy:' || interaction.id_container_interaction::text
FROM fortnite_replay.tb_replay_file AS replay_file
WHERE replay_file.fk_id_match = interaction.fk_id_match;

ALTER TABLE fortnite_replay.tb_reward
    ADD COLUMN fk_id_replay_file BIGINT
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    ADD COLUMN source_key VARCHAR(200),
    ADD COLUMN prize_id VARCHAR(150);

UPDATE fortnite_replay.tb_reward AS reward
SET fk_id_replay_file = replay_file.id_replay_file,
    source_key = 'legacy:' || reward.id_reward::text
FROM fortnite_replay.tb_replay_file AS replay_file
WHERE replay_file.fk_id_match = reward.fk_id_match;

UPDATE fortnite_replay.tb_reward AS reward
SET prize_id = reward_type.reward_code
FROM fortnite_replay.tb_reward_type AS reward_type
WHERE reward.fk_id_reward_type = reward_type.id_reward_type
  AND reward.prize_id IS NULL;

UPDATE fortnite_replay.tb_reward
SET prize_id = 'legacy:' || id_reward::text
WHERE prize_id IS NULL;

ALTER TABLE fortnite_replay.tb_reward
    ALTER COLUMN prize_id SET NOT NULL;

ALTER TABLE fortnite_replay.tb_player_poi_visit
    ADD COLUMN fk_id_replay_file BIGINT
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    ADD COLUMN source_key VARCHAR(200);

UPDATE fortnite_replay.tb_player_poi_visit AS poi_visit
SET fk_id_replay_file = replay_file.id_replay_file,
    source_key = 'legacy:' || poi_visit.id_poi_visit::text
FROM fortnite_replay.tb_replay_file AS replay_file
WHERE replay_file.fk_id_match = poi_visit.fk_id_match;

ALTER TABLE fortnite_replay.tb_safe_zone_phase
    ADD COLUMN fk_id_replay_file BIGINT
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE SET NULL;

UPDATE fortnite_replay.tb_safe_zone_phase AS phase
SET fk_id_replay_file = replay_file.id_replay_file
FROM fortnite_replay.tb_replay_file AS replay_file
WHERE replay_file.fk_id_match = phase.fk_id_match;

ALTER TABLE fortnite_replay.tb_safe_zone_phase
    DROP CONSTRAINT uk_safe_zone_phase_match_number;

CREATE UNIQUE INDEX ux_safe_zone_phase_file_number
    ON fortnite_replay.tb_safe_zone_phase (fk_id_replay_file, phase_number)
    WHERE fk_id_replay_file IS NOT NULL;

CREATE UNIQUE INDEX ux_safe_zone_phase_legacy_number
    ON fortnite_replay.tb_safe_zone_phase (fk_id_match, phase_number)
    WHERE fk_id_replay_file IS NULL;

CREATE TABLE fortnite_replay.tb_match_player_source (
    fk_id_replay_file  BIGINT NOT NULL,
    fk_id_match        BIGINT NOT NULL,
    source_player_key  VARCHAR(200) NOT NULL,
    fk_id_match_player BIGINT NOT NULL,
    CONSTRAINT pk_match_player_source
        PRIMARY KEY (fk_id_replay_file, source_player_key),
    CONSTRAINT fk_match_player_source_file
        FOREIGN KEY (fk_id_replay_file)
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_player_source_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE CASCADE
);

INSERT INTO fortnite_replay.tb_match_player_source
    (fk_id_replay_file, fk_id_match, source_player_key, fk_id_match_player)
SELECT replay_file.id_replay_file,
       match_player.fk_id_match,
       match_player.replay_player_id,
       match_player.id_match_player
FROM fortnite_replay.tb_match_player AS match_player
JOIN fortnite_replay.tb_replay_file AS replay_file
  ON replay_file.fk_id_match = match_player.fk_id_match
WHERE match_player.replay_player_id IS NOT NULL
ON CONFLICT (fk_id_replay_file, source_player_key) DO NOTHING;

CREATE UNIQUE INDEX ux_container_source
    ON fortnite_replay.tb_container (fk_id_replay_file, source_key)
    WHERE fk_id_replay_file IS NOT NULL AND source_key IS NOT NULL;

CREATE UNIQUE INDEX ux_container_interaction_source
    ON fortnite_replay.tb_container_interaction (fk_id_replay_file, source_key)
    WHERE fk_id_replay_file IS NOT NULL AND source_key IS NOT NULL;

CREATE UNIQUE INDEX ux_reward_source
    ON fortnite_replay.tb_reward (fk_id_replay_file, source_key)
    WHERE fk_id_replay_file IS NOT NULL AND source_key IS NOT NULL;

CREATE UNIQUE INDEX ux_poi_visit_source
    ON fortnite_replay.tb_player_poi_visit (fk_id_replay_file, source_key)
    WHERE fk_id_replay_file IS NOT NULL AND source_key IS NOT NULL;

CREATE TABLE fortnite_replay.tb_player_vehicle_usage (
    id_vehicle_usage     BIGINT GENERATED ALWAYS AS IDENTITY,
    fk_id_replay_file    BIGINT NOT NULL
        REFERENCES fortnite_replay.tb_replay_file (id_replay_file)
        ON DELETE CASCADE,
    fk_id_match          BIGINT NOT NULL,
    fk_id_match_player   BIGINT NOT NULL,
    fk_id_vehicle        BIGINT NOT NULL
        REFERENCES fortnite_replay.tb_vehicle (id_vehicle)
        ON DELETE RESTRICT,
    source_key           VARCHAR(200) NOT NULL,
    replay_vehicle_id    VARCHAR(200),
    entered_at_seconds   DOUBLE PRECISION,
    exited_at_seconds    DOUBLE PRECISION,
    duration_seconds     DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
            WHEN entered_at_seconds IS NOT NULL
             AND exited_at_seconds IS NOT NULL
            THEN exited_at_seconds - entered_at_seconds
            ELSE NULL
        END
    ) STORED,
    CONSTRAINT pk_player_vehicle_usage PRIMARY KEY (id_vehicle_usage),
    CONSTRAINT fk_player_vehicle_usage_participant
        FOREIGN KEY (fk_id_match, fk_id_match_player)
        REFERENCES fortnite_replay.tb_match_player (fk_id_match, id_match_player)
        ON DELETE CASCADE,
    CONSTRAINT uk_player_vehicle_usage_source
        UNIQUE (fk_id_replay_file, source_key),
    CONSTRAINT chk_player_vehicle_usage_times CHECK (
        (entered_at_seconds IS NULL OR entered_at_seconds >= 0)
        AND (exited_at_seconds IS NULL OR exited_at_seconds >= 0)
        AND (
            entered_at_seconds IS NULL
            OR exited_at_seconds IS NULL
            OR exited_at_seconds >= entered_at_seconds
        )
    )
);

CREATE INDEX idx_player_vehicle_usage_player
    ON fortnite_replay.tb_player_vehicle_usage (fk_id_match_player, fk_id_match);

CREATE INDEX idx_player_vehicle_usage_vehicle
    ON fortnite_replay.tb_player_vehicle_usage (fk_id_vehicle, fk_id_match);

CREATE INDEX idx_match_player_source_participant
    ON fortnite_replay.tb_match_player_source (fk_id_match, fk_id_match_player);

COMMIT;
