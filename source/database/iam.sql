-- ==============================================================================
-- FORTNITE BRASIL - SCHEMA: IAM (Identity & Access Management)
-- Descrição: Gestão de usuários, papéis, permissões e provedores de autenticação.
-- ==============================================================================

-- 1. LIMPEZA E PREPARAÇÃO
DROP SCHEMA IF EXISTS iam CASCADE;
CREATE SCHEMA iam;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- ==========================================
-- 2. ESTRUTURAS DE TABELAS (DDL)
-- ==========================================

CREATE TABLE iam.tb_role (
    id_role SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,       -- Nome do cargo (Ex: SuperAdmin, Moderador)
    description VARCHAR(255),               -- Descrição amigável do papel
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,-- Define se é o dono absoluto do sistema
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iam.tb_permission (
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

CREATE TABLE iam.tb_role_permission (
    fk_id_role INT NOT NULL REFERENCES iam.tb_role(id_role) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES iam.tb_permission(id_permission) ON DELETE CASCADE,
    PRIMARY KEY (fk_id_role, fk_id_permission)
);

CREATE TABLE iam.tb_user (
    id_user UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_role INT NOT NULL REFERENCES iam.tb_role(id_role) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')), -- Status global do usuário
    metadata JSONB DEFAULT '{}'::jsonb,     -- Dados extras flexíveis (preferências, etc)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iam.tb_auth_provider (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iam.tb_user_identity (
    id_identity SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL REFERENCES iam.tb_auth_provider(code) ON DELETE RESTRICT,
    provider_user_id VARCHAR(100) NOT NULL, -- ID do usuário na plataforma (ex: ID do Telegram)
    provider_data JSONB DEFAULT '{}'::jsonb,-- Payload original recebido da plataforma
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_provider_identity UNIQUE (provider, provider_user_id)
);

CREATE TABLE iam.tb_user_permission (
    id_grant SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES iam.tb_user(id_user) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES iam.tb_permission(id_permission) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL DEFAULT 'global' CHECK (target_type IN ('global', 'bot', 'group', 'command')), -- Nível de acesso (Global ou Específico)
    target_id VARCHAR(100),                 -- ID do bot, grupo ou comando (nulo se for global)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_perm_target UNIQUE (fk_id_user, fk_id_permission, target_type, target_id)
);

-- ==========================================
-- 3. DADOS INICIAIS (DML)
-- ==========================================
BEGIN;

INSERT INTO iam.tb_role (id_role, name, description, is_owner)
VALUES (1, 'SuperAdmin', 'Acesso irrestrito a todos os módulos e bots do ecossistema', TRUE)
ON CONFLICT (id_role) DO NOTHING;

INSERT INTO iam.tb_auth_provider (code, name) VALUES
    ('telegram', 'Telegram'),
    ('discord', 'Discord'),
    ('google', 'Google'),
    ('email', 'E-mail e Senha'),
    ('epic', 'Epic Games'),
    ('playstation', 'PlayStation Network'),
    ('xbox', 'Xbox Live')
ON CONFLICT (code) DO NOTHING;

INSERT INTO iam.tb_permission (code, label, section, route, icon, sort_order, category, description) VALUES
('dashboard.view',      'Visão Geral',          'GERAL',      '/dashboard',     'LayoutDashboard', 10,  'main_dashboard', 'Acesso à tela inicial com métricas globais'),
('groups.view',         'Grupos',               'COMUNIDADE', '/groups',        'Users',           20,  'community_mgmt', 'Visualização e configuração dos cards de grupos'),
('members.view',        'Membros',              'COMUNIDADE', '/members',       'UserCheck',       30,  'community_mgmt', 'Gestão de usuários, histórico e punições'),
('vip.view',            'Clubinho (VIPs)',      'COMUNIDADE', '/vip',           'Star',            40,  'economy_mgmt',   'Gestão de assinaturas, benefícios e pagamentos'),
('announcements.manage','Avisos e Comunicados', 'COMUNIDADE', '/announcements', 'Megaphone',       50,  'community_mgmt', 'Disparo de mensagens globais via bots'),
('giveaways.view',      'Sorteios',             'COMUNIDADE', '/giveaways',     'Gift',            60,  'economy_mgmt',   'Criação e processamento de sorteios automatizados'),
('support.view',        'Suporte',              'COMUNIDADE', '/support',       'Headphones',      70,  'support_mgmt',   'Atendimento de tickets e moderação de denúncias'),
('system.integrations', 'Integrações',          'SISTEMA',    '/integrations',  'Link2',           80,  'system_config',  'Configuração de webhooks do Telegram e APIs externas'),
('system.logs',         'Logs',                 'SISTEMA',    '/logs',          'FileText',        90,  'system_config',  'Auditoria e rastreamento de erros de sistema'),
('system.config',       'Configurações',        'SISTEMA',    '/settings',      'Settings',        100, 'system_config',  'Ajustes globais do painel administrativo'),
('lojafortnite.admin',  'Administrar LojaFortniteBot', 'BOTS', '/bots/lojafortnite', 'ShoppingCart', 0, 'bot_admin', 'Allows configuring LojaFortniteBot (layout, collective notifications) in a specific group ou channel. Granted per community through tb_user_permission with target_type = group.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO iam.tb_role_permission (fk_id_role, fk_id_permission)
SELECT 1, id_permission FROM iam.tb_permission
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM iam.tb_user_identity WHERE provider = 'telegram' AND provider_user_id = '121823278') THEN
        INSERT INTO iam.tb_user (fk_id_role, status, metadata)
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

        INSERT INTO iam.tb_user_identity (fk_id_user, provider, provider_user_id, provider_data)
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

COMMIT;
