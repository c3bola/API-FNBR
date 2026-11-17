-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: GAMIFICATION (Engagement & Interactions)
-- Description: User progression, elemental card collection, duels, and community thanks.
-- Dependencies: schemas 'iam' (for tb_user), 'community' (for tb_comunidade).
-- ==============================================================================

-- 1. CLEANUP AND PREPARATION
DROP SCHEMA IF EXISTS gamification CASCADE;
CREATE SCHEMA gamification;

-- ==========================================
-- 2. TABLE STRUCTURES (DDL)
-- ==========================================

-- ------------------------------------------------------------------------------
-- Gamification & Engagement Base
-- ------------------------------------------------------------------------------
CREATE TABLE gamification.tb_user_season_stats (
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_season INT NOT NULL,
    total_collected INT NOT NULL DEFAULT 0,
    total_dominated INT NOT NULL DEFAULT 0,
    total_helped INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_season)
);

CREATE TABLE gamification.tb_thanks_history (
    id_thanks UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_user_sender UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_user_receiver UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID REFERENCES community.tb_comunidade(id_comunidade) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gamification.tb_duel (
    id_duel UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_comunidade UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    challenger_id UUID NOT NULL REFERENCES iam.tb_user(id_user),
    challenged_id UUID NOT NULL REFERENCES iam.tb_user(id_user),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
    winner_id UUID REFERENCES iam.tb_user(id_user),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ
);

CREATE TABLE gamification.tb_duel_moves (
    id_duel_move SERIAL PRIMARY KEY,
    fk_id_duel UUID NOT NULL REFERENCES gamification.tb_duel(id_duel) ON DELETE CASCADE,
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    move VARCHAR(45) NOT NULL,
    move_order SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- Elemental Collection Base (Cards & Variants)
-- ------------------------------------------------------------------------------
CREATE TABLE gamification.tb_elemental_category (
    id_elemental_category SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE gamification.tb_elemental_sprite (
    id_elemental_sprite SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    summon_cost INT NOT NULL DEFAULT 0,
    drop_chance DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE gamification.tb_elemental_variant (
    id_elemental_variant SERIAL PRIMARY KEY,
    fk_id_sprite INT NOT NULL REFERENCES gamification.tb_elemental_sprite(id_elemental_sprite) ON DELETE CASCADE,
    fk_id_category INT NOT NULL REFERENCES gamification.tb_elemental_category(id_elemental_category) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Elemental Collection User Progress (Partitioned)
-- ------------------------------------------------------------------------------
CREATE TABLE gamification.tb_elemental_collection (
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_variant INT NOT NULL REFERENCES gamification.tb_elemental_variant(id_elemental_variant) ON DELETE CASCADE,
    fk_id_season INT NOT NULL,
    is_dominated BOOLEAN NOT NULL DEFAULT FALSE,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_variant, fk_id_season)
) PARTITION BY LIST (fk_id_season);

-- Partitions for current and past seasons
CREATE TABLE gamification.tb_elemental_collection_s0 PARTITION OF gamification.tb_elemental_collection FOR VALUES IN (0);
CREATE TABLE gamification.tb_elemental_collection_s1 PARTITION OF gamification.tb_elemental_collection FOR VALUES IN (1);
CREATE TABLE gamification.tb_elemental_collection_s2 PARTITION OF gamification.tb_elemental_collection FOR VALUES IN (2);
CREATE TABLE gamification.tb_elemental_collection_default PARTITION OF gamification.tb_elemental_collection DEFAULT;
