-- Align replay persistence types and retain participant metadata without a global identity.
-- Apply after fortnite_replay_2_ingestion.sql.
BEGIN;

ALTER TABLE fortnite_replay.tb_match
    ALTER COLUMN chapter_number TYPE INTEGER
        USING chapter_number::INTEGER;

ALTER TABLE fortnite_replay.tb_safe_zone_phase
    ALTER COLUMN phase_number TYPE INTEGER
        USING phase_number::INTEGER;

ALTER TABLE fortnite_replay.tb_match_player
    ADD COLUMN current_display_name VARCHAR(150),
    ADD COLUMN platform_unique_net_id VARCHAR(150);

UPDATE fortnite_replay.tb_match_player AS match_player
SET current_display_name = player.current_display_name,
    platform_unique_net_id = player.platform_unique_net_id
FROM fortnite_replay.tb_player AS player
WHERE match_player.fk_id_player = player.id_player;

COMMIT;
