-- ==============================================================================
-- FORTNITE BRASIL — BANCO UNIFICADO
-- Base: schema_4.sql + init.sql + migrations 0001 a 0006
--
-- ORDEM DE EXECUÇÃO:
--   1. schema_4.sql       (cria o schema e as tabelas-base)
--   2. init.sql           (insere os dados iniciais, incluindo o bot lojafortnite)
--   3. migrations 0001–6  (adiciona as estruturas do LojaFortniteBot)
--
-- ATENÇÃO:
--   schema_4.sql contém DROP SCHEMA IF EXISTS fnbr_community CASCADE.
--   Este arquivo é destinado à criação de um BANCO NOVO. Não execute em um
--   banco existente que contenha dados que deseja preservar.
--
--   O token de ioguard que estava escrito diretamente em init.sql foi
--   substituído por TOKEN_IOGUARD. Configure o token real de forma segura
--   antes de utilizar esse bot.
-- ==============================================================================



-- ============================================================================
-- SCHEMA BASE — estrutura original
-- ============================================================================

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

CREATE TABLE tb_auth_provider (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tb_user_identity (
    id_identity SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL REFERENCES tb_auth_provider(code) ON DELETE RESTRICT, -- Agora é uma FK
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


-- ============================================================================
-- DADOS INICIAIS — roles, permissões, bots e conta administrativa
-- ============================================================================

-- ==============================================================================
-- FORTNITE BRASIL - INITIAL DATA SEEDING (DML)
-- ==============================================================================

BEGIN;

-- ==========================================
-- 1. ROLES (PERFIS DE ACESSO)
-- ==========================================
INSERT INTO fnbr_community.tb_role (id_role, name, description, is_owner)
VALUES (1, 'SuperAdmin', 'Acesso irrestrito a todos os módulos e bots do ecossistema', TRUE)
ON CONFLICT (id_role) DO NOTHING;

-- ==========================================
-- 1.5. PROVEDORES DE AUTENTICAÇÃO
-- ==========================================
INSERT INTO fnbr_community.tb_auth_provider (code, name) VALUES
    ('telegram', 'Telegram'),
    ('discord', 'Discord'),
    ('google', 'Google'),
    ('email', 'E-mail e Senha'),
    ('epic', 'Epic Games'),
    ('playstation', 'PlayStation Network'),
    ('xbox', 'Xbox Live')
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- 2. MODOS DE GRUPO
-- ==========================================
INSERT INTO fnbr_community.tb_mode (name) VALUES 
    ('Logs'), ('Atendimento'), ('Lego'), ('Salve o mundo'), 
    ('Girls'), ('Principal'), ('Notícias'), ('Wallpapers'), 
    ('Ballistic'), ('Server Brasil'), ('Competitive'), 
    ('Server Europe'), ('Server Oceania')
ON CONFLICT (name) DO NOTHING;

-- ==========================================
-- 3. PERMISSÕES E MENUS DO PAINEL
-- ==========================================
INSERT INTO fnbr_community.tb_permission (code, label, section, route, icon, sort_order, category, description) VALUES
('dashboard.view',      'Visão Geral',          'GERAL',      '/dashboard',     'LayoutDashboard', 10,  'main_dashboard', 'Acesso à tela inicial com métricas globais'),
('groups.view',         'Grupos',               'COMUNIDADE', '/groups',        'Users',           20,  'community_mgmt', 'Visualização e configuração dos cards de grupos'),
('members.view',        'Membros',              'COMUNIDADE', '/members',       'UserCheck',       30,  'community_mgmt', 'Gestão de usuários, histórico e punições'),
('vip.view',            'Clubinho (VIPs)',      'COMUNIDADE', '/vip',           'Star',            40,  'economy_mgmt',   'Gestão de assinaturas, benefícios e pagamentos'),
('announcements.manage','Avisos e Comunicados', 'COMUNIDADE', '/announcements', 'Megaphone',       50,  'community_mgmt', 'Disparo de mensagens globais via bots'),
('giveaways.view',      'Sorteios',             'COMUNIDADE', '/giveaways',     'Gift',            60,  'economy_mgmt',   'Criação e processamento de sorteios automatizados'),
('support.view',        'Suporte',              'COMUNIDADE', '/support',       'Headphones',      70,  'support_mgmt',   'Atendimento de tickets e moderação de denúncias'),
('system.integrations', 'Integrações',          'SISTEMA',    '/integrations',  'Link2',           80,  'system_config',  'Configuração de webhooks do Telegram e APIs externas'),
('system.logs',         'Logs',                 'SISTEMA',    '/logs',          'FileText',        90,  'system_config',  'Auditoria e rastreamento de erros de sistema'),
('system.config',       'Configurações',        'SISTEMA',    '/settings',      'Settings',        100, 'system_config',  'Ajustes globais do painel administrativo')
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- 4. VÍNCULO DE PERMISSÕES AO SUPERADMIN
-- ==========================================
INSERT INTO fnbr_community.tb_role_permission (fk_id_role, fk_id_permission)
SELECT 1, id_permission FROM fnbr_community.tb_permission
ON CONFLICT DO NOTHING;

-- ==========================================
-- 5. BOTS DO ECOSSISTEMA
-- ==========================================
INSERT INTO fnbr_community.tb_bot (id_bot, bot_token, name, username, category, theme_color, status, route, icon, sort_order) VALUES
('fortme',       'TOKEN_FORTME',       'FortMeBot',       '@FortMeBot',       'Engajamento',         'purple', 'online', '/bots/fortme',       'Bot',          1),
('guardaoi',     'TOKEN_GUARDAOI',     'GuardaOiBot',     '@GuardaOiBot',     'Moderação',           'blue',   'online', '/bots/guardaoi',     'Shield',       2),
('battlebus',    'TOKEN_BATTLEBUS',    'BattleBusBot',    '@BattleBusBot',    'Registro de Players', 'cyan',   'online', '/bots/battlebus',    'Bus',          3),
('lojafortnite', 'TOKEN_LOJA',         'LojaFortniteBot', '@LojaFortniteBot', 'Loja e Alertas',      'yellow', 'online', '/bots/lojafortnite', 'ShoppingCart', 4),
('fortcards',    'TOKEN_FORTCARDS',    'FortCardsBot',    '@FortCardsBot',    'Coleção de Cards',    'purple', 'online', '/bots/fortcards',    'Layers',       5),
('ioguard',      'TOKEN_IOGUARD', 'IO Guard Bot', '@ioguardbot', 'Testes', 'green', 'online', '/bots/ioguard', 'ShieldAlert', 6)
ON CONFLICT (id_bot) DO UPDATE SET bot_token = EXCLUDED.bot_token;

-- ==========================================
-- 6. MÓDULOS E COMANDOS LÓGICOS
-- ==========================================
-- Agora vinculamos os Módulos diretamente aos Bots no INSERT
INSERT INTO fnbr_community.tb_module (fk_id_bot, code, name, description) VALUES
('fortme',   'elementais', 'Coleção Elemental', 'Sistema completo de cartas, variantes e geração de mosaicos'),
('guardaoi', 'moderacao',  'Moderação Global',  'Controles de anti-spam, banimentos, mutes e advertências'),
('ioguard',  'moderacao',  'Moderação Teste',   'Ambiente de testes para moderação')
ON CONFLICT (fk_id_bot, code) DO NOTHING;

DO $$
DECLARE
    v_mod_elementais INT;
    v_mod_moderacao INT;
BEGIN
    SELECT id_module INTO v_mod_elementais FROM fnbr_community.tb_module WHERE code = 'elementais' AND fk_id_bot = 'fortme';
    SELECT id_module INTO v_mod_moderacao FROM fnbr_community.tb_module WHERE code = 'moderacao' AND fk_id_bot = 'guardaoi';

    -- Comandos apenas para o FortMe
    IF v_mod_elementais IS NOT NULL THEN
        INSERT INTO fnbr_community.tb_command (fk_id_module, command_trigger, description, requires_worker) VALUES
        (v_mod_elementais, '/colecao', 'Gera a imagem do mosaico da coleção do usuário', TRUE),
        (v_mod_elementais, '/elementais', 'Lista as cartas disponíveis e regras', FALSE)
        ON CONFLICT (fk_id_module, command_trigger) DO NOTHING;
    END IF;

    -- Comandos apenas para o GuardaOi
    IF v_mod_moderacao IS NOT NULL THEN
        INSERT INTO fnbr_community.tb_command (fk_id_module, command_trigger, description, requires_worker) VALUES
        (v_mod_moderacao, '/ban', 'Bane um usuário do grupo', FALSE),
        (v_mod_moderacao, '/mute', 'Silencia um usuário temporariamente', FALSE)
        ON CONFLICT (fk_id_module, command_trigger) DO NOTHING;
    END IF;
END $$;

-- ==========================================
-- 7. CRIAÇÃO DA CONTA ADMINISTRATIVA
-- ==========================================
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM fnbr_community.tb_user_identity WHERE provider = 'telegram' AND provider_user_id = '121823278') THEN
        INSERT INTO fnbr_community.tb_user (fk_id_role, status, metadata)
        VALUES (
            1, 
            'active', 
            '{
                "real_name": "C3bola", 
                "notes": "System Owner & Lead Developer",
                "interface_preference": "dark_mode"
            }'::jsonb
        )
        RETURNING id_user INTO v_user_id;

        INSERT INTO fnbr_community.tb_user_identity (fk_id_user, provider, provider_user_id, provider_data)
        VALUES (
            v_user_id,
            'telegram',
            '121823278',
            jsonb_build_object(
                'id', 121823278,
                'username', 'c3bola',
                'first_name', 'c3bola',
                'auth_date', EXTRACT(EPOCH FROM NOW())::integer
            )
        );
        RAISE NOTICE 'Conta administrativa registrada com sucesso.';
    ELSE
        RAISE NOTICE 'A conta administrativa já se encontra ativa no banco de dados.';
    END IF;
END $$;

-- ==========================================
-- 8. CADASTRO DA VARIÁVEL DINÂMICA
-- ==========================================
-- Prefixo 'fnbr_community' adicionado para evitar o erro de schema skipping
INSERT INTO fnbr_community.tb_dynamic_variable 
(tag, name, description, example_preview, scope, resolver_action, accepts_parameters, params_schema) 
VALUES (
    'load_bar', 
    'Barra de Carregamento', 
    'Gera uma barra de progresso visual com base no valor atual e máximo.', 
    '████░░░░░░', 
    'global', 
    'ui_render_progressbar', 
    TRUE, 
    '[
      {"name": "current", "type": "number", "label": "Valor Atual (ou Variável)"},
      {"name": "max", "type": "number", "label": "Valor Máximo (ou Variável)"}
    ]'::jsonb
) ON CONFLICT (tag) DO NOTHING;

COMMIT;


-- ============================================================================
-- MIGRATION 0001 — provedores e configuração global
-- ============================================================================

-- ==============================================================================
-- Migration 0001 - External provider registry and global sync setting
-- Schema: fnbr_community
--
-- Purpose
--   The cosmetics catalog is fed by cron sync scripts that call an external
--   provider. Which provider is used is a GLOBAL, ADMINISTRATIVE decision:
--   there is exactly one active provider for the whole platform. It is never
--   configured per community, group, channel or user.
--
-- Design decisions
--   * tb_external_provider is a small registry so the provider can be swapped
--     by an administrator without a deploy.
--   * tb_cosmetic_sync_setting is a single-row table (id_setting is forced to 1)
--     that points to the active provider.
--   * Cosmetics (migration 0002) deliberately carry NO foreign key to the
--     provider. Switching providers therefore never deletes or invalidates
--     catalog or history data.
--   * API keys/secrets are NOT stored here. They belong to the environment of
--     the cron scripts.
--
-- Safety
--   Additive and idempotent: only CREATE ... IF NOT EXISTS and
--   INSERT ... ON CONFLICT DO NOTHING. No existing object is touched.
--
-- Column order follows the "Tetris" rule: 8-byte types, then 16-byte uuid,
-- 4-byte, 2-byte, 1-byte, and variable-length types last, to minimise padding.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fnbr_community.tb_external_provider (
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_provider SMALLSERIAL  PRIMARY KEY,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    code        VARCHAR(50)  NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    base_url    VARCHAR(255) NOT NULL
);

COMMENT ON TABLE  fnbr_community.tb_external_provider IS 'Registry of external cosmetics data providers. Only used by the cron sync scripts.';
COMMENT ON COLUMN fnbr_community.tb_external_provider.code IS 'Stable slug used by the sync scripts to pick the right client implementation.';
COMMENT ON COLUMN fnbr_community.tb_external_provider.is_active IS 'FALSE hides a provider from the selection list; it does not remove any data.';

-- The initial provider has the fixed ID 1, as required by the card.
INSERT INTO fnbr_community.tb_external_provider (id_provider, code, name, base_url)
VALUES (1, 'fortnite-api', 'Fortnite-API', 'https://fortnite-api.com')
ON CONFLICT (id_provider) DO NOTHING;

-- Explicit IDs do not advance the sequence, so realign it for future providers.
SELECT setval(
    pg_get_serial_sequence('fnbr_community.tb_external_provider', 'id_provider'),
    GREATEST((SELECT MAX(id_provider) FROM fnbr_community.tb_external_provider), 1)
);

CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_sync_setting (
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_catalog_sync_at  TIMESTAMPTZ,
    last_shop_sync_at     TIMESTAMPTZ,
    fk_id_user_updated_by UUID REFERENCES fnbr_community.tb_user(id_user) ON DELETE SET NULL,
    id_setting            SMALLINT    PRIMARY KEY DEFAULT 1,
    fk_id_provider        SMALLINT    NOT NULL REFERENCES fnbr_community.tb_external_provider(id_provider) ON DELETE RESTRICT,
    -- Single-row table: any other id is rejected, so there is one global provider.
    CONSTRAINT chk_cosmetic_sync_setting_singleton CHECK (id_setting = 1)
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic_sync_setting IS 'Single-row global setting: which external provider the cron sync scripts use.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_sync_setting.fk_id_user_updated_by IS 'Administrator who last changed the provider (audit only).';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_sync_setting.last_catalog_sync_at IS 'Written by the catalog sync script after a successful run.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_sync_setting.last_shop_sync_at IS 'Written by the shop sync script after a successful run.';

INSERT INTO fnbr_community.tb_cosmetic_sync_setting (id_setting, fk_id_provider)
VALUES (1, 1)
ON CONFLICT (id_setting) DO NOTHING;

COMMIT;


-- ============================================================================
-- MIGRATION 0002 — catálogo de cosméticos e histórico da loja
-- ============================================================================

-- ==============================================================================
-- Migration 0002 - Centralised cosmetics catalog and shop appearance history
-- Schema: fnbr_community
--
-- Purpose
--   A single catalog of every cosmetic, shared by the whole platform (all bots,
--   the API and the admin panel). LojaFortniteBot is just one more consumer.
--
-- Identity
--   game_id is the in-game asset identifier (e.g. 'Backpack_AbstractMirror',
--   'CID_704_Athena_Commando_F_LollipopTrickster'). The provider payload checked
--   for this card contains NO RFC-4122 UUID anywhere, so this text identifier is
--   the only stable official identity available. It is unique across ALL
--   families (verified against the full payload: zero collisions).
--   id_cosmetic is an internal surrogate key so that high-volume tables
--   (inventory, alerts, shop history) reference a 4-byte integer instead of a
--   ~40-byte string.
--   The catalog has no reference to any provider (see migration 0001).
--
-- Preservation rules
--   * Rows are NEVER deleted. A cosmetic the provider stops returning gets
--     missing_since set by the sync script and stays in the catalog.
--   * released_at is nullable: cosmetics may exist in the provider data before
--     they are released in-game, and must still be preserved.
--
-- Families
--   One table holds every family the provider exposes (battle royale cosmetics,
--   instruments, cars, LEGO items, LEGO kits, beans, festival tracks). Family
--   specific data that is not used for filtering lives in `attributes` (JSONB).
--   LEGO and bean items reference the battle royale cosmetic they derive from
--   through fk_id_parent.
--
-- Lookup keys (verified against the payload)
--   * rarity: the same rarity code appears with several backend tiers
--     (e.g. 'marvel' with Common..Legendary), so the key is (code, backend_value).
--   * type: display names are inconsistent inside one type, so a canonical
--     display_name is kept once in the lookup table, not per cosmetic.
--   * set: set names are not unique, backend identifiers are.
--
-- Safety
--   Additive and idempotent. No existing object is modified.
--
-- Column order follows the "Tetris" rule (8-byte, uuid, 4-byte, 2-byte, 1-byte,
-- variable length last).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Lookup tables
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_family (
    id_family SMALLSERIAL  PRIMARY KEY,
    code      VARCHAR(30)  NOT NULL UNIQUE,
    name      VARCHAR(100) NOT NULL
);

COMMENT ON TABLE fnbr_community.tb_cosmetic_family IS 'Top-level grouping of cosmetics as exposed by the provider (br, instrument, car, ...). Adding a family is an INSERT.';

INSERT INTO fnbr_community.tb_cosmetic_family (code, name) VALUES
    ('br',         'Battle Royale cosmetics'),
    ('instrument', 'Festival instruments'),
    ('car',        'Rocket Racing car parts'),
    ('lego',       'LEGO Fortnite characters'),
    ('lego_kit',   'LEGO Fortnite kits'),
    ('bean',       'Fall Guys beans'),
    ('track',      'Festival tracks')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_type (
    id_type       SMALLSERIAL  PRIMARY KEY,
    fk_id_family  SMALLINT     NOT NULL REFERENCES fnbr_community.tb_cosmetic_family(id_family) ON DELETE RESTRICT,
    code          VARCHAR(50)  NOT NULL,
    backend_value VARCHAR(100),
    display_name  VARCHAR(100),
    CONSTRAINT uk_cosmetic_type_family_code UNIQUE (fk_id_family, code),
    -- Target of the composite FK in tb_cosmetic that keeps type and family consistent.
    CONSTRAINT uk_cosmetic_type_id_family UNIQUE (id_type, fk_id_family)
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic_type IS 'Cosmetic types per family (outfit, backpack, pickaxe, ...). Populated by the catalog sync script.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_type.display_name IS 'Canonical label. The provider returns inconsistent labels for the same type, so it is stored once here.';

CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_rarity (
    id_rarity     SMALLSERIAL  PRIMARY KEY,
    code          VARCHAR(50)  NOT NULL,
    backend_value VARCHAR(60)  NOT NULL,
    display_name  VARCHAR(100),
    CONSTRAINT uk_cosmetic_rarity UNIQUE (code, backend_value)
);

COMMENT ON TABLE fnbr_community.tb_cosmetic_rarity IS 'Rarity as (code, backend tier). Series rarities such as marvel/dc/icon exist in several backend tiers.';

CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_series (
    id_series SMALLSERIAL  PRIMARY KEY,
    code      VARCHAR(100) NOT NULL UNIQUE,
    name      VARCHAR(100) NOT NULL,
    colors    TEXT[]
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic_series IS 'Special series (Marvel, Icon, Gaming Legends, ...). code is the backend identifier.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_series.colors IS 'Gradient colours as RRGGBBAA hex strings, in provider order.';

CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_set (
    id_set SERIAL       PRIMARY KEY,
    code   VARCHAR(100) NOT NULL UNIQUE,
    name   VARCHAR(100) NOT NULL
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic_set IS 'Cosmetic sets. code is the backend identifier because set names are not unique.';

-- ------------------------------------------------------------------------------
-- Catalog
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic (
    -- 8-byte
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    added_at        TIMESTAMPTZ,
    released_at     TIMESTAMPTZ,
    missing_since   TIMESTAMPTZ,
    -- 4-byte
    id_cosmetic     SERIAL       PRIMARY KEY,
    fk_id_parent    INT          REFERENCES fnbr_community.tb_cosmetic(id_cosmetic) ON DELETE SET NULL,
    fk_id_set       INT          REFERENCES fnbr_community.tb_cosmetic_set(id_set) ON DELETE RESTRICT,
    -- 2-byte
    fk_id_family    SMALLINT     NOT NULL REFERENCES fnbr_community.tb_cosmetic_family(id_family) ON DELETE RESTRICT,
    fk_id_type      SMALLINT,
    fk_id_rarity    SMALLINT     REFERENCES fnbr_community.tb_cosmetic_rarity(id_rarity) ON DELETE RESTRICT,
    fk_id_series    SMALLINT     REFERENCES fnbr_community.tb_cosmetic_series(id_series) ON DELETE RESTRICT,
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
    -- With a NULL fk_id_type (LEGO, beans, tracks) the check is skipped (MATCH SIMPLE).
    CONSTRAINT fk_cosmetic_type_family FOREIGN KEY (fk_id_type, fk_id_family)
        REFERENCES fnbr_community.tb_cosmetic_type(id_type, fk_id_family) ON DELETE RESTRICT
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic IS 'Central cosmetics catalog shared by every bot and module. Rows are never deleted.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.game_id IS 'Official in-game asset identifier. Text, not an RFC-4122 UUID: the provider does not expose one. Unique across all families.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.added_at IS 'When the provider reports the item was added to the game files. May precede the in-game release.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.released_at IS 'First time the item became obtainable in-game (e.g. first shop appearance). NULL means unknown or not released yet; such rows must be kept.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.missing_since IS 'Set by the sync script when the provider stops returning the item; cleared if it comes back. The row is preserved either way.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.fk_id_parent IS 'For LEGO and bean items: the battle royale cosmetic they derive from.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.fk_id_type IS 'NULL for families without types (LEGO characters, beans, tracks).';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.intro_chapter IS 'Chapter of introduction (1-7 so far).';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.intro_season IS 'Season label within the chapter. Not always numeric (e.g. X, OG, Remix), hence text.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.intro_order IS 'Provider sequential season index; use it to order introductions chronologically.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.icon_url IS 'Main image (provider icon / large).';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.small_icon_url IS 'Thumbnail image (provider smallIcon / small).';
COMMENT ON COLUMN fnbr_community.tb_cosmetic.attributes IS 'Family-specific data not needed for filtering (variants, showcase video, meta tags, track artist/bpm, ...). Not for authoritative business data.';

CREATE INDEX IF NOT EXISTS idx_cosmetic_name_prefix ON fnbr_community.tb_cosmetic (lower(name) varchar_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_cosmetic_family_type ON fnbr_community.tb_cosmetic (fk_id_family, fk_id_type);
CREATE INDEX IF NOT EXISTS idx_cosmetic_parent      ON fnbr_community.tb_cosmetic (fk_id_parent) WHERE fk_id_parent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cosmetic_set         ON fnbr_community.tb_cosmetic (fk_id_set) WHERE fk_id_set IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cosmetic_added_at    ON fnbr_community.tb_cosmetic (added_at DESC);

-- ------------------------------------------------------------------------------
-- Shop appearance history
-- ------------------------------------------------------------------------------
-- One row per (cosmetic, start of availability window, bundle flag). A cosmetic
-- sold as a single offer and inside a bundle at the same time yields two rows.
-- This table is the only source for "currently in shop", "leaving soon",
-- "returned" and return prediction; nothing is cached elsewhere.
CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_shop_appearance (
    in_at          TIMESTAMPTZ NOT NULL,
    out_at         TIMESTAMPTZ,
    fk_id_cosmetic INT         NOT NULL REFERENCES fnbr_community.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    final_price    INT,
    is_bundle      BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (fk_id_cosmetic, in_at, is_bundle),
    CONSTRAINT chk_shop_appearance_window CHECK (out_at IS NULL OR out_at > in_at),
    CONSTRAINT chk_shop_appearance_price  CHECK (final_price IS NULL OR final_price >= 0)
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic_shop_appearance IS 'History of shop availability windows per cosmetic.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_shop_appearance.out_at IS 'End of the availability window; NULL while unknown.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_shop_appearance.final_price IS 'V-Bucks price of the offer the item was sold in. For bundles it is the offer total, not the item price.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_shop_appearance.is_bundle IS 'TRUE when the item was sold as part of a bundle offer.';

CREATE INDEX IF NOT EXISTS idx_shop_appearance_in_at  ON fnbr_community.tb_cosmetic_shop_appearance (in_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_appearance_out_at ON fnbr_community.tb_cosmetic_shop_appearance (out_at) WHERE out_at IS NOT NULL;

-- Per-cosmetic aggregation used for "returning" detection and return prediction.
-- Intervals are measured start-to-start between distinct availability windows.
-- The API turns these raw statistics into a prediction (business rule, not stored).
CREATE OR REPLACE VIEW fnbr_community.vw_cosmetic_shop_summary AS
WITH windows AS (
    SELECT fk_id_cosmetic, in_at, MAX(out_at) AS out_at
    FROM fnbr_community.tb_cosmetic_shop_appearance
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

COMMENT ON VIEW fnbr_community.vw_cosmetic_shop_summary IS 'Per-cosmetic shop statistics. avg_interval is NULL until a cosmetic has appeared at least twice.';

COMMIT;


-- ============================================================================
-- MIGRATION 0003 — inventário e alertas pessoais
-- ============================================================================

-- ==============================================================================
-- Migration 0003 - Personal cosmetic inventory and individual alerts
-- Schema: fnbr_community
--
-- Purpose
--   Per-user data, owned by tb_user and independent of any group or channel the
--   user belongs to:
--     * inventory: which cosmetics the user says they own;
--     * alerts: which cosmetics the user wants to be notified about.
--
-- Alerts vs collective notifications
--   Alerts are PERSONAL and live here. Group/channel broadcasts (daily shop,
--   returning items, leaving items) are a different concept and live in
--   migration 0004. They share no table on purpose.
--
-- Alert types
--   return        - notify when the cosmetic returns to the shop.
--   leaving       - notify when the cosmetic is about to leave the shop.
--   return_after  - notify when the cosmetic returns after having been absent
--                   for at least after_days days (after_days is required).
--
-- Delivery target
--   The user's private Telegram chat id is the telegram identity in
--   tb_user_identity; no chat id is duplicated here.
--
-- Safety
--   Additive and idempotent. No existing object is modified. Inventory rows are
--   removed with the user (ON DELETE CASCADE); the catalog is protected
--   (ON DELETE RESTRICT).
--
-- Column order follows the "Tetris" rule.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fnbr_community.tb_user_cosmetic (
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fk_id_user     UUID        NOT NULL REFERENCES fnbr_community.tb_user(id_user) ON DELETE CASCADE,
    fk_id_cosmetic INT         NOT NULL REFERENCES fnbr_community.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    PRIMARY KEY (fk_id_user, fk_id_cosmetic)
);

COMMENT ON TABLE fnbr_community.tb_user_cosmetic IS 'Personal inventory: cosmetics a user declared to own. Uses the central catalog.';

-- Reverse lookup (which users own a cosmetic); the PK already covers user -> cosmetics.
CREATE INDEX IF NOT EXISTS idx_user_cosmetic_cosmetic ON fnbr_community.tb_user_cosmetic (fk_id_cosmetic);

CREATE TABLE IF NOT EXISTS fnbr_community.tb_cosmetic_alert (
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_notified_at TIMESTAMPTZ,
    fk_id_user       UUID        NOT NULL REFERENCES fnbr_community.tb_user(id_user) ON DELETE CASCADE,
    id_alert         SERIAL      PRIMARY KEY,
    fk_id_cosmetic   INT         NOT NULL REFERENCES fnbr_community.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    after_days       SMALLINT,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    alert_type       VARCHAR(20) NOT NULL,
    CONSTRAINT chk_cosmetic_alert_type CHECK (alert_type IN ('return', 'leaving', 'return_after')),
    CONSTRAINT chk_cosmetic_alert_days CHECK (after_days IS NULL OR after_days > 0),
    -- after_days is required for, and only allowed on, return_after alerts.
    CONSTRAINT chk_cosmetic_alert_period CHECK ((alert_type = 'return_after') = (after_days IS NOT NULL))
);

COMMENT ON TABLE  fnbr_community.tb_cosmetic_alert IS 'Individual alerts. Independent from groups/channels and from collective notifications.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_alert.after_days IS 'Minimum absence, in days, before a return_after alert fires. NULL for the other types.';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_alert.last_notified_at IS 'Lets the dispatcher avoid notifying twice for the same shop appearance (compare with tb_cosmetic_shop_appearance.in_at).';
COMMENT ON COLUMN fnbr_community.tb_cosmetic_alert.is_active IS 'FALSE pauses the alert without losing its configuration.';

-- A user may hold several return_after alerts for one cosmetic with different
-- periods, but not duplicates. COALESCE keeps NULL periods comparable on all
-- supported PostgreSQL versions (NULLS NOT DISTINCT needs PG 15+).
CREATE UNIQUE INDEX IF NOT EXISTS uk_cosmetic_alert
    ON fnbr_community.tb_cosmetic_alert (fk_id_user, fk_id_cosmetic, alert_type, COALESCE(after_days, 0));

-- Dispatcher access path: active alerts for a given cosmetic and type.
CREATE INDEX IF NOT EXISTS idx_cosmetic_alert_dispatch
    ON fnbr_community.tb_cosmetic_alert (fk_id_cosmetic, alert_type) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_cosmetic_alert_user ON fnbr_community.tb_cosmetic_alert (fk_id_user);

COMMIT;


-- ============================================================================
-- MIGRATION 0004 — notificações coletivas
-- ============================================================================

-- ==============================================================================
-- Migration 0004 - Collective notifications for groups and channels
-- Schema: fnbr_community
--
-- Purpose
--   Lets a bot broadcast to groups and channels (tb_comunidade). Each community
--   configures every category independently.
--
-- Extensibility
--   A category is a ROW in tb_notification_category, not a table or a column.
--   A future category (e.g. 'shop_forecast') is a single INSERT; no migration
--   or new structure is needed.
--
-- Default state: everything starts DISABLED
--   A community has no setting row until an administrator configures a category,
--   and a missing row means "disabled". The column default is also FALSE.
--   This covers categories added in the future too: they are off everywhere
--   until explicitly enabled.
--
-- Scheduling
--   send_time is a time of day in America/Sao_Paulo (the platform timezone).
--   It only applies to categories with supports_schedule = TRUE.
--
-- Not covered here (application rules, deliberately outside the database)
--   * the bot must be enabled in the community (tb_comunidade_bot_setting);
--   * who may change these settings (see migration 0006).
--
-- Safety
--   Additive and idempotent. The seed is skipped when the 'lojafortnite' bot
--   does not exist yet, instead of failing.
--
-- Column order follows the "Tetris" rule.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fnbr_community.tb_notification_category (
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_category       SMALLSERIAL  PRIMARY KEY,
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    supports_schedule BOOLEAN      NOT NULL DEFAULT FALSE,
    fk_id_bot         VARCHAR(50)  NOT NULL REFERENCES fnbr_community.tb_bot(id_bot) ON DELETE CASCADE,
    code              VARCHAR(50)  NOT NULL,
    name              VARCHAR(100) NOT NULL,
    description       VARCHAR(255),
    default_config    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uk_notification_category_bot_code UNIQUE (fk_id_bot, code)
);

COMMENT ON TABLE  fnbr_community.tb_notification_category IS 'Catalog of collective notification categories offered by each bot.';
COMMENT ON COLUMN fnbr_community.tb_notification_category.supports_schedule IS 'TRUE when the category is sent at a configurable time of day (send_time applies).';
COMMENT ON COLUMN fnbr_community.tb_notification_category.is_active IS 'FALSE retires a category globally without deleting community settings.';
COMMENT ON COLUMN fnbr_community.tb_notification_category.default_config IS 'Documented defaults for the category parameters; communities override them in config_data.';

CREATE TABLE IF NOT EXISTS fnbr_community.tb_comunidade_notification_setting (
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at     TIMESTAMPTZ,
    send_time        TIME,
    fk_id_comunidade UUID        NOT NULL REFERENCES fnbr_community.tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_category   SMALLINT    NOT NULL REFERENCES fnbr_community.tb_notification_category(id_category) ON DELETE CASCADE,
    is_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
    config_data      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (fk_id_comunidade, fk_id_category)
);

COMMENT ON TABLE  fnbr_community.tb_comunidade_notification_setting IS 'Per group/channel setting of each notification category. Missing row = disabled.';
COMMENT ON COLUMN fnbr_community.tb_comunidade_notification_setting.is_enabled IS 'Always starts FALSE; only an authorised administrator turns it on.';
COMMENT ON COLUMN fnbr_community.tb_comunidade_notification_setting.send_time IS 'Time of day in America/Sao_Paulo. NULL when the category is not scheduled.';
COMMENT ON COLUMN fnbr_community.tb_comunidade_notification_setting.last_sent_at IS 'Lets the dispatcher avoid sending the same category twice in one cycle.';
COMMENT ON COLUMN fnbr_community.tb_comunidade_notification_setting.config_data IS 'Category-specific parameters (e.g. a minimum absence for returning items).';

-- Dispatcher access path: enabled communities of a category, by send time.
CREATE INDEX IF NOT EXISTS idx_notification_setting_dispatch
    ON fnbr_community.tb_comunidade_notification_setting (fk_id_category, send_time) WHERE is_enabled;

-- Initial categories of LojaFortniteBot. Only the daily shop is time-scheduled;
-- the other two are event driven. Flip supports_schedule with an UPDATE if the
-- business wants a fixed send time for them.
INSERT INTO fnbr_community.tb_notification_category (fk_id_bot, code, name, description, supports_schedule)
SELECT b.id_bot, v.code, v.name, v.description, v.supports_schedule
FROM fnbr_community.tb_bot b
CROSS JOIN (VALUES
    ('daily_shop',      'Loja diária',    'Envia a loja do dia no grupo ou canal.',                  TRUE),
    ('items_returning', 'Itens voltando', 'Avisa quando itens voltam para a loja.',                  FALSE),
    ('items_leaving',   'Itens saindo',   'Avisa quando itens estão prestes a sair da loja.',        FALSE)
) AS v(code, name, description, supports_schedule)
WHERE b.id_bot = 'lojafortnite'
ON CONFLICT (fk_id_bot, code) DO NOTHING;

COMMIT;


-- ============================================================================
-- MIGRATION 0005 — combos
-- ============================================================================

-- ==============================================================================
-- Migration 0005 - Cosmetic combos
-- Schema: fnbr_community
--
-- Purpose
--   A combo is a named, ordered selection of cosmetics owned by a user (for
--   example an outfit + back bling + pickaxe + glider + emote).
--
-- Items
--   Items reference the central catalog (tb_cosmetic); nothing is duplicated.
--   position gives the display order inside the combo.
--
-- Templates (OPEN POINT)
--   The card asks combos to respect the existing presentation templates, but no
--   combo/presentation template exists in the api-fnbr, bot_gateway or
--   fn_admin_panel repositories. The existing template mechanism (response
--   templates in tb_comunidade_bot_setting.config_data and tb_dynamic_variable)
--   covers message text, not layouts. Until the real template catalog is
--   identified, the chosen template is kept as a plain code in template_code.
--   When that catalog exists, a follow-up migration can add a foreign key
--   without data loss.
--
-- Safety
--   Additive and idempotent. No existing object is modified.
--
-- Column order follows the "Tetris" rule.
-- ==============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fnbr_community.tb_combo (
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_combo      UUID         PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_user    UUID         NOT NULL REFERENCES fnbr_community.tb_user(id_user) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    template_code VARCHAR(50)
);

COMMENT ON TABLE  fnbr_community.tb_combo IS 'User-owned combos of cosmetics.';
COMMENT ON COLUMN fnbr_community.tb_combo.template_code IS 'Presentation template chosen for the combo. Plain code until the real template catalog is identified (see migration header).';

CREATE UNIQUE INDEX IF NOT EXISTS uk_combo_user_name ON fnbr_community.tb_combo (fk_id_user, lower(name));

CREATE TABLE IF NOT EXISTS fnbr_community.tb_combo_item (
    fk_id_combo    UUID     NOT NULL REFERENCES fnbr_community.tb_combo(id_combo) ON DELETE CASCADE,
    fk_id_cosmetic INT      NOT NULL REFERENCES fnbr_community.tb_cosmetic(id_cosmetic) ON DELETE RESTRICT,
    position       SMALLINT NOT NULL,
    PRIMARY KEY (fk_id_combo, position),
    CONSTRAINT uk_combo_item_cosmetic UNIQUE (fk_id_combo, fk_id_cosmetic),
    CONSTRAINT chk_combo_item_position CHECK (position > 0)
);

COMMENT ON TABLE fnbr_community.tb_combo_item IS 'Ordered cosmetics of a combo. A cosmetic appears at most once per combo.';

-- Reverse lookup (which combos contain a cosmetic).
CREATE INDEX IF NOT EXISTS idx_combo_item_cosmetic ON fnbr_community.tb_combo_item (fk_id_cosmetic);

COMMIT;


-- ============================================================================
-- MIGRATION 0006 — permissão administrativa do LojaFortniteBot
-- ============================================================================

-- ==============================================================================
-- Migration 0006 - Permission to administer LojaFortniteBot in a group/channel
-- Schema: fnbr_community
--
-- Purpose
--   Being a Telegram administrator does NOT authorise someone to configure the
--   bot. A user may administer LojaFortniteBot in a given group or channel only
--   when ALL of the following hold:
--     1. the user is administrator or owner of that group/channel on Telegram
--        (checked live against Telegram by the bot/API; never persisted);
--     2. the user is linked to our database (tb_user + tb_user_identity);
--     3. the user holds the grant 'lojafortnite.admin' for that group/channel.
--
-- How the grant is stored (existing structures are reused, no new table)
--   tb_user_permission row with
--     fk_id_permission = id of 'lojafortnite.admin'
--     target_type      = 'group'    (also used for channels: both are tb_comunidade)
--     target_id        = tb_comunidade.id_comunidade rendered as text
--   The permission code names the bot, the target names the community.
--
-- Why it does not appear in the admin panel menu
--   tb_permission also drives the panel navigation, but menu items only show
--   when a permission is linked to a role in tb_role_permission. This one is
--   intentionally NOT linked to any role. WARNING: seed scripts that bulk-link
--   every permission to SuperAdmin (init.sql does) would make it appear as a
--   menu entry pointing to the bot page; harmless, but unintended.
--
-- Safety
--   Additive and idempotent: one INSERT ... ON CONFLICT DO NOTHING.
-- ==============================================================================

BEGIN;

INSERT INTO fnbr_community.tb_permission (code, label, section, route, icon, sort_order, category, description)
VALUES (
    'lojafortnite.admin',
    'Administrar LojaFortniteBot',
    'BOTS',
    '/bots/lojafortnite',
    'ShoppingCart',
    0,
    'bot_admin',
    'Allows configuring LojaFortniteBot (layout, collective notifications) in a specific group or channel. Granted per community through tb_user_permission with target_type = group. Telegram admin status alone is not enough.'
)
ON CONFLICT (code) DO NOTHING;

COMMIT;


