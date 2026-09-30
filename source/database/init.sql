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
('ioguard',      '1891616406:AAEXxfFUZlXvz8EqcOdI8EBy6tXmyuHKQcI', 'IO Guard Bot', '@ioguardbot', 'Testes', 'green', 'online', '/bots/ioguard', 'ShieldAlert', 6)
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