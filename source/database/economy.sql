-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: ECONOMY (Monetization & Giveaways)
-- Description: VIP subscriptions, financial transactions, and community giveaways.
-- Dependencies: schemas 'iam' (for tb_user), 'community' (for tb_comunidade).
-- ==============================================================================

-- 1. CLEANUP AND PREPARATION
DROP SCHEMA IF EXISTS economy CASCADE;
CREATE SCHEMA economy;

-- ==========================================
-- 2. TABLE STRUCTURES (DDL)
-- ==========================================

-- ------------------------------------------------------------------------------
-- VIP Subscriptions & Monetization
-- ------------------------------------------------------------------------------
CREATE TABLE economy.tb_subscription (
    id_subscription SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE economy.tb_subscription_transaction (
    id_transaction SERIAL PRIMARY KEY,
    fk_id_subscription INT NOT NULL REFERENCES economy.tb_subscription(id_subscription) ON DELETE CASCADE,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    months_added INT NOT NULL DEFAULT 1,
    payment_method VARCHAR(100),
    file_id_receipt TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- Community Giveaways
-- ------------------------------------------------------------------------------
CREATE TABLE economy.tb_giveaway (
    id_giveaway UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_comunidade UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    draw_date TIMESTAMPTZ,
    type VARCHAR(50) NOT NULL,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    prize_details JSONB NOT NULL DEFAULT '{}'::jsonb, 
    num_winners INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'drawn', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE economy.tb_giveaway_participant (
    id_participant SERIAL PRIMARY KEY,
    fk_id_giveaway UUID NOT NULL REFERENCES economy.tb_giveaway(id_giveaway) ON DELETE CASCADE,
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    is_winner BOOLEAN NOT NULL DEFAULT FALSE,
    win_position INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_giveaway_user UNIQUE (fk_id_giveaway, fk_id_user)
);
