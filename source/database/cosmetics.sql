-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: COSMETICS (Catalog & Shop History)
-- Description: Centralized cosmetics catalog, shop appearances, combos, and user inventory.
-- Dependencies: schema 'iam' (for tb_user).
-- ==============================================================================

-- 1. CLEANUP AND PREPARATION
DROP SCHEMA IF EXISTS cosmetics CASCADE;
CREATE SCHEMA cosmetics;

-- ==========================================
-- 2. TABLE STRUCTURES (DDL)
-- ==========================================

-- ------------------------------------------------------------------------------
-- External Providers and Sync Settings
-- ------------------------------------------------------------------------------
CREATE TABLE cosmetics.tb_external_provider (
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_provider SMALLSERIAL  PRIMARY KEY,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    code        VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    base_url    VARCHAR(255) NOT NULL
);
COMMENT ON TABLE cosmetics.tb_external_provider IS 'Registry of external cosmetics data providers. Only used by the cron sync scripts.';
COMMENT ON COLUMN cosmetics.tb_external_provider.code IS 'Stable slug used by the sync scripts to pick the right client implementation.';
COMMENT ON COLUMN cosmetics.tb_external_provider.is_active IS 'FALSE hides a provider from the selection list; it does not remove any data.';

CREATE TABLE cosmetics.tb_cosmetic_sync_setting (
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_catalog_sync_at  TIMESTAMPTZ,
    last_shop_sync_at     TIMESTAMPTZ,
    fk_id_user_updated_by UUID REFERENCES iam.tb_user(id_user) ON DELETE SET NULL,
    id_setting            SMALLINT    PRIMARY KEY DEFAULT 1,
    fk_id_provider        SMALLINT    NOT NULL REFERENCES cosmetics.tb_external_provider(id_provider) ON DELETE RESTRICT,
    CONSTRAINT chk_cosmetic_sync_setting_singleton CHECK (id_setting = 1)
);
COMMENT ON TABLE cosmetics.tb_cosmetic_sync_setting IS 'Single-row global setting: which external provider the cron sync scripts use.';

-- ------------------------------------------------------------------------------
-- Catalog Lookup Tables
-- ------------------------------------------------------------------------------
CREATE TABLE cosmetics.tb_cosmetic_family (
    id_family SMALLSERIAL  PRIMARY KEY,
    code      VARCHAR(30)  NOT NULL UNIQUE,
    name      VARCHAR(100) NOT NULL
);
COMMENT ON TABLE cosmetics.tb_cosmetic_family IS 'Top-level grouping of cosmetics as exposed by the provider (br, instrument, car, ...).';

CREATE TABLE cosmetics.tb_cosmetic_type (
    id_type       SMALLSERIAL  PRIMARY KEY,
    fk_id_family  SMALLINT     NOT NULL REFERENCES cosmetics.tb_cosmetic_family(id_family) ON DELETE RESTRICT,
    code          VARCHAR(50)  NOT NULL,
    backend_value VARCHAR(100),
    display_name  VARCHAR(100),
    CONSTRAINT uk_cosmetic_type_family_code UNIQUE (fk_id_family, code),
    CONSTRAINT uk_cosmetic_type_id_family UNIQUE (id_type, fk_id_family)
);
COMMENT ON TABLE cosmetics.tb_cosmetic_type IS 'Cosmetic types per family (outfit, backpack, pickaxe, ...).';

CREATE TABLE cosmetics.tb_cosmetic_rarity (
    id_rarity     SMALLSERIAL  PRIMARY KEY,
    code          VARCHAR(50)  NOT NULL,
    backend_value VARCHAR(60)  NOT NULL,
    display_name  VARCHAR(100),
    CONSTRAINT uk_cosmetic_rarity UNIQUE (code, backend_value)
);
COMMENT ON TABLE cosmetics.tb_cosmetic_rarity IS 'Rarity as (code, backend tier).';

CREATE TABLE cosmetics.tb_cosmetic_series (
    id_series SMALLSERIAL  PRIMARY KEY,
    code      VARCHAR(100) NOT NULL UNIQUE,
    name      VARCHAR(100) NOT NULL,
    colors    TEXT[]
);
COMMENT ON TABLE cosmetics.tb_cosmetic_series IS 'Special series (Marvel, Icon, Gaming Legends, ...).';
COMMENT ON COLUMN cosmetics.tb_cosmetic_series.colors IS 'Gradient colours as RRGGBBAA hex strings, in provider order.';

CREATE TABLE cosmetics.tb_cosmetic_set (
    id_set SERIAL       PRIMARY KEY,
    code   VARCHAR(100) NOT NULL UNIQUE,
    name   VARCHAR(100) NOT NULL
);
COMMENT ON TABLE cosmetics.tb_cosmetic_set IS 'Cosmetic sets. code is the backend identifier.';

-- ------------------------------------------------------------------------------
-- Main Catalog
-- ------------------------------------------------------------------------------
CREATE TABLE cosmetics.tb_cosmetic (
    -- 8-byte
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    added_at        TIMESTAMPTZ,
    released_at     TIMESTAMPTZ,
    missing_since   TIMESTAMPTZ,
    -- 4-byte
    id_cosmetic     SERIAL       PRIMARY KEY,
    fk_id_parent    INT          REFERENCES cosmetics.tb_cosmetic(id_cosmetic) ON DELETE SET NULL,
    fk_id_set       INT          REFERENCES cosmetics.tb_cosmetic_set(id_set) ON DELETE RESTRICT,
    -- 2-byte
    fk_id_family    SMALLINT     NOT NULL REFERENCES cosmetics.tb_cosmetic_family(id_family) ON DELETE RESTRICT,
    fk_id_type      SMALLINT,
    fk_id_rarity    SMALLINT     REFERENCES cosmetics.tb_cosmetic_rarity(id_rarity) ON DELETE RESTRICT,
    fk_id_series    SMALLINT     REFERENCES cosmetics.tb_cosmetic_series(id_series) ON DELETE RESTRICT,
    intro_chapter   SMALLINT,
    intro_order     SMALLINT,
    -- variable length
    game_id         VARCHAR(100) NOT NULL,
    name            VARCHAR(150) NOT NULL,
    intro_season    VARCHAR(10),
    icon_url        VARCHAR(255),
    small_icon_url  VARCHAR(255),
    featured_url    VARCHAR(255),
    description     TEXT,
    attributes      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uk_cosmetic_game_id UNIQUE (game_id),
    CONSTRAINT fk_cosmetic_type_family FOREIGN KEY (fk_id_type, fk_id_family)
        REFERENCES cosmetics.tb_cosmetic_type(id_type, fk_id_family) ON DELETE RESTRICT
);
COMMENT ON TABLE cosmetics.tb_cosmetic IS 'Central cosmetics catalog shared by every bot and module. Rows are never deleted.';
COMMENT ON COLUMN cosmetics.tb_cosmetic.game_id IS 'Official in-game asset identifier. Unique across all families.';

CREATE INDEX idx_cosmetic_name_prefix ON cosmetics.tb_cosmetic (lower(name) varchar_pattern_ops);
CREATE INDEX idx_cosmetic_family_type ON cosmetics.tb_cosmetic (fk_id_family, fk_id_type);
CREATE INDEX idx_cosmetic_parent      ON cosmetics.tb_cosmetic (fk_id_parent) WHERE fk_id_parent IS NOT NULL;
CREATE INDEX idx_cosmetic_set         ON cosmetics.tb_cosmetic (fk_id_set) WHERE fk_id_set IS NOT NULL;
CREATE INDEX idx_cosmetic_added_at    ON cosmetics.tb_cosmetic (added_at DESC);

-- ------------------------------------------------------------------------------
-- Shop History & Views
-- ------------------------------------------------------------------------------
CREATE TABLE cosmetics.tb_cosmetic_shop_appearance (
    in_at          TIMESTAMPTZ NOT NULL,
    out_at         TIMESTAMPTZ,
    fk_id_cosmetic INT         NOT NULL REFERENCES cosmetics.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    final_price    INT,
    is_bundle      BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (fk_id_cosmetic, in_at, is_bundle),
    CONSTRAINT chk_shop_appearance_window CHECK (out_at IS NULL OR out_at > in_at),
    CONSTRAINT chk_shop_appearance_price  CHECK (final_price IS NULL OR final_price >= 0)
);
COMMENT ON TABLE cosmetics.tb_cosmetic_shop_appearance IS 'History of shop availability windows per cosmetic.';

CREATE INDEX idx_shop_appearance_in_at  ON cosmetics.tb_cosmetic_shop_appearance (in_at DESC);
CREATE INDEX idx_shop_appearance_out_at ON cosmetics.tb_cosmetic_shop_appearance (out_at) WHERE out_at IS NOT NULL;

CREATE OR REPLACE VIEW cosmetics.vw_cosmetic_shop_summary AS
WITH windows AS (
    SELECT fk_id_cosmetic, in_at, MAX(out_at) AS out_at
    FROM cosmetics.tb_cosmetic_shop_appearance
    GROUP BY fk_id_cosmetic, in_at
), gaps AS (
    SELECT fk_id_cosmetic, in_at, out_at,
           in_at - LAG(in_at) OVER (PARTITION BY fk_id_cosmetic ORDER BY in_at) AS gap
    FROM windows
)
SELECT fk_id_cosmetic,
       COUNT(*)                                   AS appearance_count,
       MIN(in_at)                                 AS first_in_at,
       MAX(in_at)                                 AS last_in_at,
       (ARRAY_AGG(out_at ORDER BY in_at DESC))[1] AS last_out_at,
       AVG(gap)                                   AS avg_interval
FROM gaps
GROUP BY fk_id_cosmetic;
COMMENT ON VIEW cosmetics.vw_cosmetic_shop_summary IS 'Per-cosmetic shop statistics. avg_interval is NULL until a cosmetic has appeared at least twice.';

-- ------------------------------------------------------------------------------
-- User Interactions (Inventory & Alerts)
-- ------------------------------------------------------------------------------
CREATE TABLE cosmetics.tb_user_cosmetic (
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fk_id_user     UUID        NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_cosmetic INT         NOT NULL REFERENCES cosmetics.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    PRIMARY KEY (fk_id_user, fk_id_cosmetic)
);
COMMENT ON TABLE cosmetics.tb_user_cosmetic IS 'Personal inventory: cosmetics a user declared to own. Uses the central catalog.';
CREATE INDEX idx_user_cosmetic_cosmetic ON cosmetics.tb_user_cosmetic (fk_id_cosmetic);

CREATE TABLE cosmetics.tb_cosmetic_alert (
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_notified_at TIMESTAMPTZ,
    fk_id_user       UUID        NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    id_alert         SERIAL      PRIMARY KEY,
    fk_id_cosmetic   INT         NOT NULL REFERENCES cosmetics.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    after_days       SMALLINT,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    alert_type       VARCHAR(20) NOT NULL,
    CONSTRAINT chk_cosmetic_alert_type CHECK (alert_type IN ('return', 'leaving', 'return_after')),
    CONSTRAINT chk_cosmetic_alert_days CHECK (after_days IS NULL OR after_days > 0),
    CONSTRAINT chk_cosmetic_alert_period CHECK ((alert_type = 'return_after') = (after_days IS NOT NULL))
);
COMMENT ON TABLE cosmetics.tb_cosmetic_alert IS 'Individual alerts. Independent from groups/channels and from collective notifications.';

CREATE UNIQUE INDEX uk_cosmetic_alert ON cosmetics.tb_cosmetic_alert (fk_id_user, fk_id_cosmetic, alert_type, COALESCE(after_days, 0));
CREATE INDEX idx_cosmetic_alert_dispatch ON cosmetics.tb_cosmetic_alert (fk_id_cosmetic, alert_type) WHERE is_active;
CREATE INDEX idx_cosmetic_alert_user ON cosmetics.tb_cosmetic_alert (fk_id_user);

-- ------------------------------------------------------------------------------
-- Combos & Skins (Visual Customizations)
-- ------------------------------------------------------------------------------
CREATE TABLE cosmetics.tb_combo (
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_combo      UUID         PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_user    UUID         NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    template_code VARCHAR(50)
);
COMMENT ON TABLE cosmetics.tb_combo IS 'User-owned combos of cosmetics.';
CREATE UNIQUE INDEX uk_combo_user_name ON cosmetics.tb_combo (fk_id_user, lower(name));

CREATE TABLE cosmetics.tb_combo_item (
    fk_id_combo    UUID     NOT NULL REFERENCES cosmetics.tb_combo(id_combo) ON DELETE CASCADE,
    fk_id_cosmetic INT      NOT NULL REFERENCES cosmetics.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    position       SMALLINT NOT NULL,
    PRIMARY KEY (fk_id_combo, position),
    CONSTRAINT uk_combo_item_cosmetic UNIQUE (fk_id_combo, fk_id_cosmetic),
    CONSTRAINT chk_combo_item_position CHECK (position > 0)
);
COMMENT ON TABLE cosmetics.tb_combo_item IS 'Ordered cosmetics of a combo. A cosmetic appears at most once per combo.';
CREATE INDEX idx_combo_item_cosmetic ON cosmetics.tb_combo_item (fk_id_cosmetic);

CREATE TABLE cosmetics.tb_skin (
    id_skin UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    chapter VARCHAR(50),
    season VARCHAR(50),
    origin VARCHAR(100), -- E.g., 'Battle Pass'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cosmetics.tb_skin_style (
    id_skin_style SERIAL PRIMARY KEY,
    fk_id_skin UUID NOT NULL REFERENCES cosmetics.tb_skin(id_skin) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    style_description TEXT,
    image_url VARCHAR(255)
);

-- ==========================================
-- 3. INITIAL DATA SEEDING (DML)
-- ==========================================
BEGIN;

INSERT INTO cosmetics.tb_external_provider (id_provider, code, name, base_url)
VALUES (1, 'fortnite-api', 'Fortnite-API', 'https://fortnite-api.com')
ON CONFLICT (id_provider) DO NOTHING;

SELECT setval(
    pg_get_serial_sequence('cosmetics.tb_external_provider', 'id_provider'),
    GREATEST((SELECT MAX(id_provider) FROM cosmetics.tb_external_provider), 1)
);

INSERT INTO cosmetics.tb_cosmetic_sync_setting (id_setting, fk_id_provider)
VALUES (1, 1)
ON CONFLICT (id_setting) DO NOTHING;

INSERT INTO cosmetics.tb_cosmetic_family (code, name) VALUES
    ('br',         'Battle Royale cosmetics'),
    ('instrument', 'Festival instruments'),
    ('car',        'Rocket Racing car parts'),
    ('lego',       'LEGO Fortnite characters'),
    ('lego_kit',   'LEGO Fortnite kits'),
    ('bean',       'Fall Guys beans'),
    ('track',      'Festival tracks')
ON CONFLICT (code) DO NOTHING;

COMMIT;
