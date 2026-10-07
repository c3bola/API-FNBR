-- ==============================================================================
-- FORTNITE BRASIL - UNIFIED DATABASE SCHEMA (v6.2 - Audited & Commented)
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
    name VARCHAR(50) UNIQUE NOT NULL,       -- Nome do cargo (Ex: SuperAdmin, Moderador)
    description VARCHAR(255),               -- Descrição amigável do papel
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,-- Define se é o dono absoluto do sistema
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_permission (
    id_permission SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,      -- Código da permissão (Ex: 'dashboard.view')
    label VARCHAR(100) NOT NULL,            -- Nome de exibição no painel
    section VARCHAR(50) NOT NULL,           -- Seção do menu lateral (Ex: 'GERAL')
    route VARCHAR(150) NOT NULL,            -- Rota no Angular (Ex: '/dashboard')
    icon VARCHAR(50) NOT NULL,              -- Ícone Lucide/Feather a ser renderizado
    sort_order INT DEFAULT 0,               -- Ordem de exibição no menu
    category VARCHAR(50) NOT NULL,          -- Agrupamento interno (Ex: 'system_config')
    description TEXT NOT NULL               -- O que esta permissão permite fazer
);

CREATE TABLE tb_role_permission (
    fk_id_role INT NOT NULL REFERENCES tb_role(id_role) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES tb_permission(id_permission) ON DELETE CASCADE,
    PRIMARY KEY (fk_id_role, fk_id_permission)
);

CREATE TABLE tb_user (
    id_user UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_role INT NOT NULL REFERENCES tb_role(id_role) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')), -- Status global do usuário
    metadata JSONB DEFAULT '{}'::jsonb,     -- Dados extras flexíveis (preferências, etc)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_user_identity (
    id_identity SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('telegram', 'discord', 'google', 'email')), -- De onde veio o login
    provider_user_id VARCHAR(100) NOT NULL, -- ID do usuário na plataforma (ex: ID do Telegram)
    provider_data JSONB DEFAULT '{}'::jsonb,-- Payload original recebido da plataforma
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_provider_identity UNIQUE (provider, provider_user_id)
);

CREATE TABLE tb_user_permission (
    id_grant SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES tb_permission(id_permission) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL DEFAULT 'global' CHECK (target_type IN ('global', 'bot', 'group', 'command')), -- Nível de acesso (Global ou Específico)
    target_id VARCHAR(100),                 -- ID do bot, grupo ou comando (nulo se for global)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_perm_target UNIQUE (fk_id_user, fk_id_permission, target_type, target_id)
);

-- ==========================================
-- 3. DOMÍNIO DO BOT GATEWAY (MÓDULOS E COMANDOS)
-- ==========================================
CREATE TABLE tb_bot (
    id_bot VARCHAR(50) PRIMARY KEY,         -- Identificador e Slug do bot (Ex: 'fortme')
    bot_token TEXT NOT NULL UNIQUE,         -- Token de acesso real (Telegram/Discord)
    name VARCHAR(100) NOT NULL,             -- Nome de exibição (Ex: 'FortMeBot')
    username VARCHAR(100) NOT NULL,         -- @Username do bot
    category VARCHAR(100) NOT NULL,         -- Categoria (Ex: 'Engajamento')
    theme_color VARCHAR(50) DEFAULT 'purple',-- Cor principal para o card no painel
    status VARCHAR(20) DEFAULT 'online' CHECK (status IN ('online', 'offline', 'maintenance')), -- Status operacional
    route VARCHAR(150) NOT NULL,            -- Rota de Webhook ou painel do bot
    icon VARCHAR(50) NOT NULL DEFAULT 'Bot',-- Ícone de exibição
    sort_order INT DEFAULT 0,               -- Posição na lista de bots
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_module (
    id_module SERIAL PRIMARY KEY,
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES tb_bot(id_bot) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,              -- Código interno (Ex: 'elementais')
    name VARCHAR(100) NOT NULL,             -- Nome do Módulo (Ex: 'Coleção Elemental')
    description TEXT,                       -- Explicação do que o módulo faz
    icon VARCHAR(50) NOT NULL DEFAULT 'Box',-- Ícone do Módulo no painel
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'testing', 'inactive')), -- Status do card
    metric_interactions INT NOT NULL DEFAULT 0, -- Cache: Total de interações no módulo
    metric_users INT NOT NULL DEFAULT 0,        -- Cache: Usuários únicos que utilizaram
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_module_bot_code UNIQUE (fk_id_bot, code)
);

CREATE TABLE tb_command (
    id_command SERIAL PRIMARY KEY,
    fk_id_module INT NOT NULL REFERENCES tb_module(id_module) ON DELETE CASCADE,
    command_trigger VARCHAR(50) NOT NULL,   -- Gatilho principal (Ex: '/jardim')
    aliases TEXT[] DEFAULT '{}',            -- Variações (Ex: ['/jonesy', '/jd'])
    description VARCHAR(255) NOT NULL,      -- O que o comando faz
    category_name VARCHAR(50),              -- Categoria para exibição no painel
    icon VARCHAR(50) DEFAULT 'Terminal',    -- Ícone do comando
    response_config JSONB DEFAULT '{}'::jsonb, -- Config da Aba "Resposta" (Mídia, Textos, Variáveis)
    custom_config JSONB DEFAULT '{}'::jsonb,   -- Config da Aba "Configurações" (Custos, Cooldown)
    access_level VARCHAR(30) NOT NULL DEFAULT 'community' CHECK (access_level IN ('community', 'club', 'admin')), -- Permissão de quem pode usar
    requires_worker BOOLEAN NOT NULL DEFAULT FALSE, -- Se precisa de fila de processamento pesada
    is_active BOOLEAN NOT NULL DEFAULT TRUE,-- Se o comando está ligado ou desligado
    metric_executions INT NOT NULL DEFAULT 0, -- Cache: Quantas vezes foi usado
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_command_trigger_module UNIQUE (fk_id_module, command_trigger)
);

-- ==========================================
-- 4. DOMÍNIO DE CATEGORIZAÇÃO E COMUNIDADE
-- ==========================================
CREATE TABLE tb_mode (
    id_mode SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,       -- Modo de Jogo / Tópico (Ex: 'Lego', 'Salve o Mundo')
    description VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_comunidade (
    id_comunidade UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,             -- Nome do Grupo/Comunidade
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('telegram', 'discord', 'web')),
    platform_id VARCHAR(100) NOT NULL,      -- Chat ID real na plataforma
    type VARCHAR(50) NOT NULL CHECK (type IN ('community', 'group', 'supergroup', 'channel')),
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'restricted')),
    is_forum BOOLEAN NOT NULL DEFAULT FALSE,-- Se os tópicos estão habilitados
    fk_id_mode INT NOT NULL REFERENCES tb_mode(id_mode) ON DELETE RESTRICT,
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

CREATE INDEX idx_comunidade_mode ON tb_comunidade(fk_id_mode);
CREATE INDEX idx_comunidade_visibility ON tb_comunidade(visibility);
CREATE INDEX idx_comunidade_type ON tb_comunidade(type);
CREATE UNIQUE INDEX uk_active_platform_id ON fnbr_community.tb_comunidade (platform, platform_id) WHERE status = 'active';

-- *****************************************************************************
-- MOVIDO PARA CÁ: tb_command_authorized_group (Agora que tb_comunidade já existe)
-- *****************************************************************************
CREATE TABLE tb_command_authorized_group (
    fk_id_command INT NOT NULL REFERENCES tb_command(id_command) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_command, fk_id_comunidade)
);

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
    registration_action VARCHAR(50),        -- Ex: 'join', 'invite'
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'kicked')),
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_comunidade)
);

CREATE TABLE tb_comunidade_bot_setting (
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES tb_bot(id_bot) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,-- Se o bot está operante neste grupo
    config_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Overrides locais de bot para o grupo
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_comunidade, fk_id_bot)
);

-- ==========================================
-- 5. DOMÍNIO DE ECONOMIA E SORTEIOS
-- ==========================================
-- (Mantido inalterado)
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
-- (Mantido inalterado)
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

-- ==========================================
-- 8. DOMÍNIO DE VARIÁVEIS DINÂMICAS E TEMPLATES
-- ==========================================
CREATE TABLE tb_dynamic_variable (
    id_variable SERIAL PRIMARY KEY,
    tag VARCHAR(50) UNIQUE NOT NULL,             -- Nome exato sem chaves. Ex: 'load_bar'
    name VARCHAR(100) NOT NULL,                  -- Título amigável. Ex: 'Barra de Progresso'
    description TEXT,                            -- Descrição para o modal de ajuda
    example_preview VARCHAR(255),                -- Renderização prévia. Ex: '████░░░░░░'
    scope VARCHAR(50) NOT NULL DEFAULT 'global', -- Onde pode ser usada (global, elementais, etc)
    resolver_action VARCHAR(100) NOT NULL,       -- Função que o Backend vai rodar (ex: 'ui_render_progressbar')
    accepts_parameters BOOLEAN NOT NULL DEFAULT FALSE, -- Se suporta injeção tipo (x, y)
    params_schema JSONB DEFAULT '[]'::jsonb,     -- Regras para o front-end desenhar os inputs
    is_active BOOLEAN NOT NULL DEFAULT TRUE,     -- Habilita/Desabilita uso geral
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dynamic_variable_scope ON tb_dynamic_variable(scope, is_active);

-- 
CREATE TABLE tb_skin (
    id_skin UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    -- fk_id_content UUID REFERENCES tb_content(id) -- Se você criar uma tabela base
    name VARCHAR(100) NOT NULL,
    description TEXT,
    chapter VARCHAR(50),
    season VARCHAR(50),
    origin VARCHAR(100), -- Ex: 'Passe de Batalha'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_skin_style (
    id_skin_style SERIAL PRIMARY KEY,
    fk_id_skin UUID NOT NULL REFERENCES tb_skin(id_skin) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    style_description TEXT,
    image_url VARCHAR(255)
);