-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: BOT_ENGINE (Gateway & Commands)
-- Description: Operational configurations for bots, modules, commands, templates, and notifications.
-- Dependencies: schemas 'iam' (for tb_user), 'community' (for tb_comunidade).
-- ==============================================================================

-- 1. CLEANUP AND PREPARATION
DROP SCHEMA IF EXISTS bot_engine CASCADE;
CREATE SCHEMA bot_engine;

-- ==========================================
-- 2. TABLE STRUCTURES (DDL)
-- ==========================================

CREATE TABLE bot_engine.tb_bot (
    id_bot VARCHAR(50) PRIMARY KEY,         -- Bot Identifier/Slug (e.g., 'fortme')
    bot_token TEXT NOT NULL UNIQUE,         -- Real access token (Telegram/Discord)
    name VARCHAR(100) NOT NULL,             -- Display name (e.g., 'FortMeBot')
    username VARCHAR(100) NOT NULL,         -- Bot @Username
    category VARCHAR(100) NOT NULL,         -- Category (e.g., 'Engagement')
    theme_color VARCHAR(50) DEFAULT 'purple',-- Main color for the dashboard card
    status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'offline', 'maintenance')), -- Operational status
    route VARCHAR(150) NOT NULL,            -- Webhook or dashboard route
    icon VARCHAR(50) NOT NULL DEFAULT 'Bot',-- Display icon
    sort_order INT DEFAULT 0,               -- Position in the bots list
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bot_engine.tb_module (
    id_module SERIAL PRIMARY KEY,
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES bot_engine.tb_bot(id_bot) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,              -- Internal code (e.g., 'elementais')
    name VARCHAR(100) NOT NULL,             -- Module Name (e.g., 'Elemental Collection')
    description TEXT,                       -- Explanation of module features
    icon VARCHAR(50) NOT NULL DEFAULT 'Box',-- Module icon in the dashboard
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'testing', 'inactive')), -- Card status
    metric_interactions INT NOT NULL DEFAULT 0, -- Cache: Total interactions in this module
    metric_users INT NOT NULL DEFAULT 0,        -- Cache: Unique users that interacted
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_module_bot_code UNIQUE (fk_id_bot, code)
);

CREATE TABLE bot_engine.tb_command (
    id_command SERIAL PRIMARY KEY,
    fk_id_module INT NOT NULL REFERENCES bot_engine.tb_module(id_module) ON DELETE CASCADE,
    command_trigger VARCHAR(50) NOT NULL,   -- Main trigger (e.g., '/jardim')
    aliases TEXT[] DEFAULT '{}',            -- Variations (e.g., ['/jonesy', '/jd'])
    description VARCHAR(255) NOT NULL,      -- Command description
    category_name VARCHAR(50),              -- Category for dashboard display
    icon VARCHAR(50) DEFAULT 'Terminal',    -- Command icon
    response_config JSONB DEFAULT '{}'::jsonb, -- "Response" tab config (Media, Texts, Variables)
    custom_config JSONB DEFAULT '{}'::jsonb,   -- "Settings" tab config (Costs, Cooldown)
    access_level VARCHAR(30) NOT NULL DEFAULT 'community' CHECK (access_level IN ('community', 'club', 'admin')), -- Permission level required
    requires_worker BOOLEAN NOT NULL DEFAULT FALSE, -- Flag for heavy processing queue
    is_active BOOLEAN NOT NULL DEFAULT TRUE,-- Command toggle status
    metric_executions INT NOT NULL DEFAULT 0, -- Cache: Execution counter
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_command_trigger_module UNIQUE (fk_id_module, command_trigger)
);

CREATE TABLE bot_engine.tb_command_authorized_group (
    fk_id_command INT NOT NULL REFERENCES bot_engine.tb_command(id_command) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_command, fk_id_comunidade)
);

CREATE TABLE bot_engine.tb_comunidade_bot_setting (
    fk_id_comunidade UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES bot_engine.tb_bot(id_bot) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,-- Specifies if the bot is operational in this group
    config_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Local bot overrides for the specific group
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_comunidade, fk_id_bot)
);

CREATE TABLE bot_engine.tb_dynamic_variable (
    id_variable SERIAL PRIMARY KEY,
    tag VARCHAR(50) UNIQUE NOT NULL,             -- Exact name without brackets. E.g.: 'load_bar'
    name VARCHAR(100) NOT NULL,                  -- Friendly title. E.g.: 'Progress Bar'
    description TEXT,                            -- Description for the help modal
    example_preview VARCHAR(255),                -- Render preview. E.g.: '████░░░░░░'
    scope VARCHAR(50) NOT NULL DEFAULT 'global', -- Usage scope (global, elementais, etc)
    resolver_action VARCHAR(100) NOT NULL,       -- Function executed by Backend (e.g., 'ui_render_progressbar')
    accepts_parameters BOOLEAN NOT NULL DEFAULT FALSE, -- Indicates if it supports injection like (x, y)
    params_schema JSONB DEFAULT '[]'::jsonb,     -- Rules for frontend input rendering
    is_active BOOLEAN NOT NULL DEFAULT TRUE,     -- Global enable/disable flag
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dynamic_variable_scope ON bot_engine.tb_dynamic_variable(scope, is_active);

CREATE TABLE bot_engine.tb_notification_category (
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_category       SMALLSERIAL  PRIMARY KEY,
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    supports_schedule BOOLEAN      NOT NULL DEFAULT FALSE,
    fk_id_bot         VARCHAR(50)  NOT NULL REFERENCES bot_engine.tb_bot(id_bot) ON DELETE CASCADE,
    code              VARCHAR(50)  NOT NULL,
    name              VARCHAR(100) NOT NULL,
    description       VARCHAR(255),
    default_config    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uk_notification_category_bot_code UNIQUE (fk_id_bot, code)
);

CREATE TABLE bot_engine.tb_comunidade_notification_setting (
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at     TIMESTAMPTZ,
    send_time        TIME,
    fk_id_comunidade UUID        NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_category   SMALLINT    NOT NULL REFERENCES bot_engine.tb_notification_category(id_category) ON DELETE CASCADE,
    is_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
    config_data      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (fk_id_comunidade, fk_id_category)
);

CREATE INDEX idx_notification_setting_dispatch ON bot_engine.tb_comunidade_notification_setting (fk_id_category, send_time) WHERE is_enabled;

-- ==========================================
-- 3. ARCHITECTURAL FOREIGN KEYS (Cross-Schema)
-- ==========================================
-- Adding the foreign key that was left pending in community.sql to avoid circular dependencies
ALTER TABLE community.tb_comunidade_member 
    ADD CONSTRAINT fk_member_registered_by_bot 
    FOREIGN KEY (registered_by_bot) 
    REFERENCES bot_engine.tb_bot(id_bot) ON DELETE SET NULL;


-- ==========================================
-- 4. INITIAL DATA SEEDING (DML)
-- ==========================================
BEGIN;

INSERT INTO bot_engine.tb_bot (id_bot, bot_token, name, username, category, theme_color, status, route, icon, sort_order) VALUES
('fortme',       'TOKEN_FORTME',       'FortMeBot',       '@FortMeBot',       'Engajamento',         'purple', 'online', '/bots/fortme',       'Bot',          1),
('guardaoi',     'TOKEN_GUARDAOI',     'GuardaOiBot',     '@GuardaOiBot',     'Moderação',           'blue',   'online', '/bots/guardaoi',     'Shield',       2),
('battlebus',    'TOKEN_BATTLEBUS',    'BattleBusBot',    '@BattleBusBot',    'Registro de Players', 'cyan',   'online', '/bots/battlebus',    'Bus',          3),
('lojafortnite', 'TOKEN_LOJA',         'LojaFortniteBot', '@LojaFortniteBot', 'Loja e Alertas',      'yellow', 'online', '/bots/lojafortnite', 'ShoppingCart', 4),
('fortcards',    'TOKEN_FORTCARDS',    'FortCardsBot',    '@FortCardsBot',    'Coleção de Cards',    'purple', 'online', '/bots/fortcards',    'Layers',       5),
('ioguard',      'TOKEN_IOGUARD',      'IO Guard Bot',    '@ioguardbot',      'Testes',              'green',  'online', '/bots/ioguard',      'ShieldAlert',  6)
ON CONFLICT (id_bot) DO UPDATE SET bot_token = EXCLUDED.bot_token;

INSERT INTO bot_engine.tb_module (fk_id_bot, code, name, description) VALUES
('fortme',   'elementais', 'Coleção Elemental', 'Complete card system, variants, and mosaic generation'),
('guardaoi', 'moderacao',  'Moderação Global',  'Anti-spam controls, bans, mutes, and warnings'),
('ioguard',  'moderacao',  'Moderação Teste',   'Testing environment for moderation features')
ON CONFLICT (fk_id_bot, code) DO NOTHING;

DO $$
DECLARE
    v_mod_elementais INT;
    v_mod_moderacao INT;
BEGIN
    SELECT id_module INTO v_mod_elementais FROM bot_engine.tb_module WHERE code = 'elementais' AND fk_id_bot = 'fortme';
    SELECT id_module INTO v_mod_moderacao FROM bot_engine.tb_module WHERE code = 'moderacao' AND fk_id_bot = 'guardaoi';

    IF v_mod_elementais IS NOT NULL THEN
        INSERT INTO bot_engine.tb_command (fk_id_module, command_trigger, description, requires_worker) VALUES
        (v_mod_elementais, '/colecao', 'Generates the mosaic image of the user collection', TRUE),
        (v_mod_elementais, '/elementais', 'Lists available cards and rules', FALSE)
        ON CONFLICT (fk_id_module, command_trigger) DO NOTHING;
    END IF;

    IF v_mod_moderacao IS NOT NULL THEN
        INSERT INTO bot_engine.tb_command (fk_id_module, command_trigger, description, requires_worker) VALUES
        (v_mod_moderacao, '/ban', 'Bans a user from the group', FALSE),
        (v_mod_moderacao, '/mute', 'Temporarily mutes a user', FALSE)
        ON CONFLICT (fk_id_module, command_trigger) DO NOTHING;
    END IF;
END $$;

INSERT INTO bot_engine.tb_dynamic_variable (tag, name, description, example_preview, scope, resolver_action, accepts_parameters, params_schema) 
VALUES (
    'load_bar', 
    'Progress Bar', 
    'Generates a visual progress bar based on current and maximum values.', 
    '████░░░░░░', 
    'global', 
    'ui_render_progressbar', 
    TRUE, 
    '[
      {"name": "current", "type": "number", "label": "Current Value (or Variable)"},
      {"name": "max", "type": "number", "label": "Maximum Value (or Variable)"}
    ]'::jsonb
) ON CONFLICT (tag) DO NOTHING;

INSERT INTO bot_engine.tb_notification_category (fk_id_bot, code, name, description, supports_schedule)
SELECT b.id_bot, v.code, v.name, v.description, v.supports_schedule
FROM bot_engine.tb_bot b
CROSS JOIN (VALUES
    ('daily_shop',      'Daily Shop',       'Sends the daily shop to the group or channel.',            TRUE),
    ('items_returning', 'Returning Items',  'Sends an alert when items return to the shop.',            FALSE),
    ('items_leaving',   'Leaving Items',    'Sends an alert when items are about to leave the shop.',   FALSE)
) AS v(code, name, description, supports_schedule)
WHERE b.id_bot = 'lojafortnite'
ON CONFLICT (fk_id_bot, code) DO NOTHING;

COMMIT;
