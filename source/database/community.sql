-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: COMMUNITY (Gestão de Comunidades)
-- Descrição: Grupos, canais, fóruns e vínculos de usuários com comunidades.
-- Dependências Prévias: schema 'iam' (para tb_user).
-- ==============================================================================

-- 1. LIMPEZA E PREPARAÇÃO
DROP SCHEMA IF EXISTS community CASCADE;
CREATE SCHEMA community;

-- ==========================================
-- 2. ESTRUTURAS DE TABELAS (DDL)
-- ==========================================

CREATE TABLE community.tb_mode (
    id_mode SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,       -- Modo de Jogo / Tópico (Ex: 'Lego', 'Salve o Mundo')
    description VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE community.tb_comunidade (
    id_comunidade UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,             -- Nome do Grupo/Comunidade
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('telegram', 'discord', 'web')),
    platform_id VARCHAR(100) NOT NULL,      -- Chat ID real na plataforma
    type VARCHAR(50) NOT NULL CHECK (type IN ('community', 'group', 'supergroup', 'channel')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
    is_forum BOOLEAN NOT NULL DEFAULT FALSE,-- Se os tópicos estão habilitados
    fk_id_mode INT NOT NULL REFERENCES community.tb_mode(id_mode) ON DELETE RESTRICT,
    description TEXT,
    cover_image_url VARCHAR(255),
    icon_name VARCHAR(50) DEFAULT 'Users',
    theme_color VARCHAR(20) DEFAULT '#9333ea',
    badge_text VARCHAR(50),                 -- Ex: 'Oficial'
    badge_color VARCHAR(50),
    is_vip BOOLEAN NOT NULL DEFAULT FALSE,  -- Se é o grupo VIP (Clubinho)
    language VARCHAR(20) DEFAULT 'pt-BR',
    is_official BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'kicked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comunidade_mode ON community.tb_comunidade(fk_id_mode);
CREATE INDEX idx_comunidade_visibility ON community.tb_comunidade(visibility);
CREATE INDEX idx_comunidade_type ON community.tb_comunidade(type);
CREATE UNIQUE INDEX uk_active_platform_id ON community.tb_comunidade (platform, platform_id) WHERE status = 'active';

CREATE TABLE community.tb_comunidade_vinculo (
    fk_id_grupo UUID PRIMARY KEY REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_canal UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_grupo_canal_diferentes CHECK (fk_id_grupo != fk_id_canal),
    CONSTRAINT uk_canal_exclusivo UNIQUE (fk_id_canal)
);
CREATE INDEX idx_comunidade_vinculo_canal ON community.tb_comunidade_vinculo(fk_id_canal);

CREATE TABLE community.tb_comunidade_member (
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    
    -- NOTA ARQUITETURAL:
    -- O campo "registered_by_bot" faz referência a um Bot. No entanto, a tabela "tb_bot" 
    -- ficará no schema "bot_engine", o qual depende de "community". Para evitar 
    -- dependência circular de FK na criação, deixamos como VARCHAR.
    -- A Foreign Key será adicionada via ALTER TABLE no arquivo bot_engine.sql.
    registered_by_bot VARCHAR(50), 
    
    registration_action VARCHAR(50),        -- Ex: 'join', 'invite'
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'kicked')),
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_comunidade)
);

-- ==========================================
-- 3. DADOS INICIAIS (DML)
-- ==========================================
BEGIN;

INSERT INTO community.tb_mode (name) VALUES 
    ('Logs'), ('Atendimento'), ('Lego'), ('Salve o mundo'), 
    ('Girls'), ('Principal'), ('Notícias'), ('Wallpapers'), 
    ('Ballistic'), ('Server Brasil'), ('Competitive'), 
    ('Server Europe'), ('Server Oceania')
ON CONFLICT (name) DO NOTHING;

COMMIT;
