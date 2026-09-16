-- ==============================================================================
-- FORTNITE BRASIL - UNIFIED DATABASE SCHEMA (v6.1 - Angular & Gateway Ready)
-- Schema: fnbr_community
-- ==============================================================================

-- 1. LIMPEZA E PREPARAÇÃO
DROP SCHEMA IF EXISTS fnbr_community CASCADE;
CREATE SCHEMA fnbr_community;
SET search_path TO fnbr_community, public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- ==========================================
-- 2. DOMÍNIO DE SEGURANÇA E AUTORIZAÇÃO (IAM)
-- ==========================================
CREATE TABLE tb_role (
    id_role SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_permission (
    id_permission SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL,
    section VARCHAR(50) NOT NULL,
    route VARCHAR(150) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE tb_role_permission (
    fk_id_role INT NOT NULL REFERENCES tb_role(id_role) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES tb_permission(id_permission) ON DELETE CASCADE,
    PRIMARY KEY (fk_id_role, fk_id_permission)
);

CREATE TABLE tb_user (
    id_user UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_role INT NOT NULL REFERENCES tb_role(id_role) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    metadata JSONB DEFAULT '{}'::jsonb, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_user_identity (
    id_identity SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('telegram', 'discord', 'google', 'email')),
    provider_user_id VARCHAR(100) NOT NULL, 
    provider_data JSONB DEFAULT '{}'::jsonb, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_provider_identity UNIQUE (provider, provider_user_id)
);

CREATE TABLE tb_user_permission (
    id_grant SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES tb_permission(id_permission) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL DEFAULT 'global' CHECK (target_type IN ('global', 'bot', 'group', 'command')),
    target_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_perm_target UNIQUE (fk_id_user, fk_id_permission, target_type, target_id)
);

-- ==========================================
-- 3. DOMÍNIO DO BOT GATEWAY (MÓDULOS E COMANDOS)
-- ==========================================
CREATE TABLE tb_bot (
    id_bot VARCHAR(50) PRIMARY KEY, -- Ex: 'fortme', atua como ID e Slug do Webhook
    bot_token TEXT NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    theme_color VARCHAR(50) DEFAULT 'purple',
    status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'offline', 'maintenance')),
    route VARCHAR(150) NOT NULL,    
    icon VARCHAR(50) NOT NULL DEFAULT 'Bot',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_module (
    id_module SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tb_command (
    id_command SERIAL PRIMARY KEY,
    fk_id_module INT NOT NULL REFERENCES tb_module(id_module) ON DELETE CASCADE,
    command_trigger VARCHAR(50) NOT NULL,
    description VARCHAR(255) NOT NULL,
    requires_worker BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uk_command_trigger_module UNIQUE (fk_id_module, command_trigger)
);

CREATE TABLE tb_bot_module (
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES tb_bot(id_bot) ON DELETE CASCADE,
    fk_id_module INT NOT NULL REFERENCES tb_module(id_module) ON DELETE CASCADE,
    config_data JSONB DEFAULT '{}'::jsonb,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_bot, fk_id_module)
);

-- ==========================================
-- 4. DOMÍNIO DE CATEGORIZAÇÃO E COMUNIDADE
-- ==========================================
CREATE TABLE tb_mode (
    id_mode SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_comunidade (
    id_comunidade UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('telegram', 'discord', 'web')),
    platform_id VARCHAR(100) NOT NULL, 
    type VARCHAR(50) NOT NULL CHECK (type IN ('community', 'group', 'supergroup', 'channel')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
    is_forum BOOLEAN NOT NULL DEFAULT FALSE,
    fk_id_mode INT NOT NULL REFERENCES tb_mode(id_mode) ON DELETE RESTRICT,
    description TEXT,
    cover_image_url VARCHAR(255),
    icon_name VARCHAR(50) DEFAULT 'Users',
    theme_color VARCHAR(20) DEFAULT '#9333ea',
    badge_text VARCHAR(50),
    badge_color VARCHAR(50),
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,
    language VARCHAR(20) DEFAULT 'pt-BR',
    is_official BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'kicked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comunidade_mode ON tb_comunidade(fk_id_mode);
CREATE INDEX idx_comunidade_visibility ON tb_comunidade(visibility);
CREATE INDEX idx_comunidade_type ON tb_comunidade(type);
CREATE UNIQUE INDEX uk_active_platform_id ON fnbr_community.tb_comunidade (platform, platform_id) WHERE status = 'active';

CREATE TABLE tb_comunidade_vinculo (
    fk_id_grupo UUID PRIMARY KEY REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_canal UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_grupo_canal_diferentes CHECK (fk_id_grupo != fk_id_canal),
    CONSTRAINT uk_canal_exclusivo UNIQUE (fk_id_canal)
);
CREATE INDEX idx_comunidade_vinculo_canal ON tb_comunidade_vinculo(fk_id_canal);

CREATE TABLE tb_comunidade_member (
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    registered_by_bot VARCHAR(50) REFERENCES tb_bot(id_bot) ON DELETE SET NULL, 
    registration_action VARCHAR(50), 
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'kicked')),
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_comunidade)
);

CREATE TABLE tb_comunidade_bot_setting (
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES tb_bot(id_bot) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config_data JSONB NOT NULL DEFAULT '{}'::jsonb, 
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_comunidade, fk_id_bot)
);

-- ==========================================
-- 5. DOMÍNIO DE ECONOMIA (ASSINATURAS E SORTEIOS)
-- ==========================================
CREATE TABLE tb_subscription (
    id_subscription SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_subscription_transaction (
    id_transaction SERIAL PRIMARY KEY,
    fk_id_subscription INT NOT NULL REFERENCES tb_subscription(id_subscription) ON DELETE CASCADE,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    months_added INT NOT NULL DEFAULT 1,
    payment_method VARCHAR(100),
    file_id_receipt TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_giveaway (
    id_giveaway UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    draw_date TIMESTAMPTZ,
    type VARCHAR(50) NOT NULL,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    prize_details JSONB NOT NULL DEFAULT '{}'::jsonb, 
    num_winners INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'drawn', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_giveaway_participant (
    id_participant SERIAL PRIMARY KEY,
    fk_id_giveaway UUID NOT NULL REFERENCES tb_giveaway(id_giveaway) ON DELETE CASCADE,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    is_winner BOOLEAN NOT NULL DEFAULT FALSE,
    win_position INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_giveaway_user UNIQUE (fk_id_giveaway, fk_id_user)
);

-- ==========================================
-- 6. DOMÍNIO DE GAMIFICAÇÃO E ENGAJAMENTO
-- ==========================================
CREATE TABLE tb_user_season_stats (
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_season INT NOT NULL,
    total_collected INT NOT NULL DEFAULT 0,
    total_dominated INT NOT NULL DEFAULT 0,
    total_helped INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_season)
);

CREATE TABLE tb_thanks_history (
    id_thanks UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_user_sender UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_user_receiver UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID REFERENCES tb_comunidade(id_comunidade) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_duel (
    id_duel UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    challenger_id UUID NOT NULL REFERENCES tb_user(id_user),
    challenged_id UUID NOT NULL REFERENCES tb_user(id_user),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
    winner_id UUID REFERENCES tb_user(id_user),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ
);

CREATE TABLE tb_duel_moves (
    id_duel_move SERIAL PRIMARY KEY,
    fk_id_duel UUID NOT NULL REFERENCES tb_duel(id_duel) ON DELETE CASCADE,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    move VARCHAR(45) NOT NULL,
    move_order SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_elemental_category (
    id_elemental_category SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tb_elemental_sprite (
    id_elemental_sprite SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    summon_cost INT NOT NULL DEFAULT 0,
    drop_chance DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tb_elemental_variant (
    id_elemental_variant SERIAL PRIMARY KEY,
    fk_id_sprite INT NOT NULL REFERENCES tb_elemental_sprite(id_elemental_sprite) ON DELETE CASCADE,
    fk_id_category INT NOT NULL REFERENCES tb_elemental_category(id_elemental_category) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

-- ==========================================
-- 7. PARTICIONAMENTO (COLEÇÃO ELEMENTAL)
-- ==========================================
CREATE TABLE tb_elemental_collection (
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_variant INT NOT NULL REFERENCES tb_elemental_variant(id_elemental_variant) ON DELETE CASCADE,
    fk_id_season INT NOT NULL,
    is_dominated BOOLEAN NOT NULL DEFAULT FALSE,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_variant, fk_id_season)
) PARTITION BY LIST (fk_id_season);

CREATE TABLE tb_elemental_collection_s0 PARTITION OF tb_elemental_collection FOR VALUES IN (0);
CREATE TABLE tb_elemental_collection_s1 PARTITION OF tb_elemental_collection FOR VALUES IN (1);
CREATE TABLE tb_elemental_collection_s2 PARTITION OF tb_elemental_collection FOR VALUES IN (2);
CREATE TABLE tb_elemental_collection_default PARTITION OF tb_elemental_collection DEFAULT;