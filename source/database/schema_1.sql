-- ==============================================================================
-- FORTNITE BRASIL - UNIFIED DATABASE SCHEMA (v4.3 - PostgreSQL)
-- Schema: fnbr_community
-- Arquitetura: Identity, Community, Economy, Gamification, Dashboard & Partitioning
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS fnbr_community;
SET search_path TO fnbr_community, public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

-- ==========================================
-- 1. DOMÍNIO DE SEGURANÇA E AUTORIZAÇÃO (IAM)
-- ==========================================

CREATE TABLE tb_role (
    id_role SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tb_role IS 'Tabela de papéis (perfis de acesso) dos usuários no sistema';
COMMENT ON COLUMN tb_role.id_role IS 'Identificador único do papel (Chave Primária)';
COMMENT ON COLUMN tb_role.name IS 'Nome exclusivo do papel (ex: Administrator, Member)';
COMMENT ON COLUMN tb_role.description IS 'Descrição detalhada das permissões do papel';
COMMENT ON COLUMN tb_role.is_owner IS 'Indica se o papel possui privilégios máximos de dono/proprietário';
COMMENT ON COLUMN tb_role.created_at IS 'Data e hora de criação do registro';

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

COMMENT ON TABLE tb_permission IS 'Cadastro de permissões e itens de menu do painel administrativo';
COMMENT ON COLUMN tb_permission.id_permission IS 'Identificador único da permissão (Chave Primária)';
COMMENT ON COLUMN tb_permission.code IS 'Código único da permissão (ex: main.dashboard, bot.overview)';
COMMENT ON COLUMN tb_permission.label IS 'Rótulo exibido na interface de usuário';
COMMENT ON COLUMN tb_permission.section IS 'Seção de agrupamento no menu (ex: GERAL, COMUNIDADE, SISTEMA, BOTS)';
COMMENT ON COLUMN tb_permission.route IS 'Rota frontend associada ao item de permissão';
COMMENT ON COLUMN tb_permission.icon IS 'Nome do ícone Lucide/biblioteca renderizado na UI';
COMMENT ON COLUMN tb_permission.sort_order IS 'Ordem de exibição/classificação do item no menu';
COMMENT ON COLUMN tb_permission.category IS 'Categoria lógica da permissão (ex: main_dashboard, bot_dashboard)';
COMMENT ON COLUMN tb_permission.description IS 'Descrição detalhada do propósito da permissão';

CREATE TABLE tb_role_permission (
    fk_id_role INT NOT NULL REFERENCES tb_role(id_role) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES tb_permission(id_permission) ON DELETE CASCADE,
    PRIMARY KEY (fk_id_role, fk_id_permission)
);

COMMENT ON TABLE tb_role_permission IS 'Tabela de associação N para N entre papéis (roles) e permissões';
COMMENT ON COLUMN tb_role_permission.fk_id_role IS 'Chave estrangeira referenciando tb_role(id_role)';
COMMENT ON COLUMN tb_role_permission.fk_id_permission IS 'Chave estrangeira referenciando tb_permission(id_permission)';

CREATE TABLE tb_user (
    id_user UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_role INT NOT NULL REFERENCES tb_role(id_role) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    metadata JSONB DEFAULT '{}'::jsonb, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tb_user IS 'Armazena os usuários cadastrados no sistema';
COMMENT ON COLUMN tb_user.id_user IS 'Identificador único universal (UUID) do usuário (Chave Primária)';
COMMENT ON COLUMN tb_user.fk_id_role IS 'Chave estrangeira referenciando o papel/perfil principal do usuário';
COMMENT ON COLUMN tb_user.status IS 'Status atual da conta (active, suspended, banned)';
COMMENT ON COLUMN tb_user.metadata IS 'Metadados adicionais em formato JSON';
COMMENT ON COLUMN tb_user.created_at IS 'Data e hora de criação da conta';
COMMENT ON COLUMN tb_user.updated_at IS 'Data e hora da última atualização do registro';

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

COMMENT ON TABLE tb_user_identity IS 'Identidades de autenticação externas/provedores vinculadas ao usuário';
COMMENT ON COLUMN tb_user_identity.id_identity IS 'Identificador único da identidade (Chave Primária)';
COMMENT ON COLUMN tb_user_identity.fk_id_user IS 'Chave estrangeira referenciando o usuário dono da identidade';
COMMENT ON COLUMN tb_user_identity.provider IS 'Nome do provedor de identidade (telegram, discord, google, email)';
COMMENT ON COLUMN tb_user_identity.provider_user_id IS 'ID do usuário no sistema do provedor externo';
COMMENT ON COLUMN tb_user_identity.provider_data IS 'Dados brutos/perfil retornados pelo provedor em formato JSON';
COMMENT ON COLUMN tb_user_identity.created_at IS 'Data e hora de vinculação da identidade';
COMMENT ON COLUMN tb_user_identity.updated_at IS 'Data e hora da última atualização da identidade';

CREATE TABLE tb_user_permission (
    id_grant SERIAL PRIMARY KEY,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_permission INT NOT NULL REFERENCES tb_permission(id_permission) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL DEFAULT 'global' CHECK (target_type IN ('global', 'bot', 'group', 'command')),
    target_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_perm_target UNIQUE (fk_id_user, fk_id_permission, target_type, target_id)
);

COMMENT ON TABLE tb_user_permission IS 'Permissões granulares atribuídas diretamente a usuários específicos';
COMMENT ON COLUMN tb_user_permission.id_grant IS 'Identificador único da concessão de permissão (Chave Primária)';
COMMENT ON COLUMN tb_user_permission.fk_id_user IS 'Chave estrangeira referenciando o usuário';
COMMENT ON COLUMN tb_user_permission.fk_id_permission IS 'Chave estrangeira referenciando a permissão concedida';
COMMENT ON COLUMN tb_user_permission.target_type IS 'Escopo alvo da permissão (global, bot, group, command)';
COMMENT ON COLUMN tb_user_permission.target_id IS 'Identificador opcional do alvo específico (ex: ID do bot ou grupo)';
COMMENT ON COLUMN tb_user_permission.created_at IS 'Data e hora da concessão';

-- ==========================================
-- 2. DOMÍNIO DE COMUNIDADE E OPERAÇÕES
-- ==========================================

CREATE TABLE tb_comunidade (
    id_comunidade UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('telegram', 'discord', 'web')),
    platform_id VARCHAR(100) NOT NULL, 
    type VARCHAR(50) NOT NULL CHECK (type IN ('community', 'group', 'supergroup', 'channel', 'private')),
    is_official BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'kicked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_platform_id UNIQUE (platform, platform_id)
);

COMMENT ON TABLE tb_comunidade IS 'Grupos, canais e comunidades integradas nas plataformas de chat ou web';
COMMENT ON COLUMN tb_comunidade.id_comunidade IS 'Identificador único (UUID) da comunidade (Chave Primária)';
COMMENT ON COLUMN tb_comunidade.name IS 'Nome de exibição da comunidade ou grupo';
COMMENT ON COLUMN tb_comunidade.platform IS 'Plataforma de origem (telegram, discord, web)';
COMMENT ON COLUMN tb_comunidade.platform_id IS 'ID externo do chat/canal na plataforma correspondente';
COMMENT ON COLUMN tb_comunidade.type IS 'Tipo de chat (community, group, supergroup, channel, private)';
COMMENT ON COLUMN tb_comunidade.is_official IS 'Indica se é uma comunidade oficial da rede';
COMMENT ON COLUMN tb_comunidade.status IS 'Status operacional atual (active, inactive, kicked)';
COMMENT ON COLUMN tb_comunidade.created_at IS 'Data e hora de cadastro da comunidade';
COMMENT ON COLUMN tb_comunidade.updated_at IS 'Data e hora da última alteração de dados';

CREATE TABLE tb_comunidade_member (
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    registered_by_bot VARCHAR(50), 
    registration_action VARCHAR(50), 
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'kicked')),
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_comunidade)
);

COMMENT ON TABLE tb_comunidade_member IS 'Associação de membros vinculados às respectivas comunidades';
COMMENT ON COLUMN tb_comunidade_member.fk_id_user IS 'Chave estrangeira referenciando o usuário membro';
COMMENT ON COLUMN tb_comunidade_member.fk_id_comunidade IS 'Chave estrangeira referenciando a comunidade';
COMMENT ON COLUMN tb_comunidade_member.registered_by_bot IS 'Identificador do bot que realizou o registro do membro (se aplicável)';
COMMENT ON COLUMN tb_comunidade_member.registration_action IS 'Ação ou comando que originou o cadastro';
COMMENT ON COLUMN tb_comunidade_member.status IS 'Status do membro no grupo (active, left, kicked)';
COMMENT ON COLUMN tb_comunidade_member.last_interaction_at IS 'Registro temporal da última interação do usuário na comunidade';
COMMENT ON COLUMN tb_comunidade_member.created_at IS 'Data e hora de entrada do membro';

CREATE TABLE tb_bot (
    id_bot VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    theme_color VARCHAR(50) DEFAULT 'purple',
    status VARCHAR(20) DEFAULT 'online',
    route VARCHAR(150) NOT NULL,    
    icon VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tb_bot IS 'Cadastro de bots gerenciados pelo ecossistema';
COMMENT ON COLUMN tb_bot.id_bot IS 'Identificador textual único do bot (Chave Primária, ex: fortmebot)';
COMMENT ON COLUMN tb_bot.name IS 'Nome amigável do bot';
COMMENT ON COLUMN tb_bot.username IS 'Nome de usuário (@username) oficial do bot na plataforma';
COMMENT ON COLUMN tb_bot.category IS 'Categoria de atuação do bot (ex: Engajamento, Moderação)';
COMMENT ON COLUMN tb_bot.theme_color IS 'Cor de tema visual associada ao bot (ex: purple, blue, cyan)';
COMMENT ON COLUMN tb_bot.status IS 'Status de funcionamento do bot (ex: online)';
COMMENT ON COLUMN tb_bot.route IS 'Rota base de gerenciamento do bot no painel administrativo';
COMMENT ON COLUMN tb_bot.icon IS 'Ícone representativo do bot na interface';
COMMENT ON COLUMN tb_bot.sort_order IS 'Ordem de classificação na listagem de bots';
COMMENT ON COLUMN tb_bot.is_active IS 'Indica se o bot está ativo no sistema';
COMMENT ON COLUMN tb_bot.created_at IS 'Data e hora de cadastro do bot';

CREATE TABLE tb_comunidade_bot_setting (
    fk_id_comunidade UUID NOT NULL REFERENCES tb_comunidade(id_comunidade) ON DELETE CASCADE,
    fk_id_bot VARCHAR(50) NOT NULL REFERENCES tb_bot(id_bot) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config_data JSONB NOT NULL DEFAULT '{}'::jsonb, 
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_comunidade, fk_id_bot)
);

COMMENT ON TABLE tb_comunidade_bot_setting IS 'Configurações específicas de comportamento de cada bot por comunidade';
COMMENT ON COLUMN tb_comunidade_bot_setting.fk_id_comunidade IS 'Chave estrangeira referenciando a comunidade';
COMMENT ON COLUMN tb_comunidade_bot_setting.fk_id_bot IS 'Chave estrangeira referenciando o bot';
COMMENT ON COLUMN tb_comunidade_bot_setting.is_enabled IS 'Indica se o bot está habilitado nesta comunidade específica';
COMMENT ON COLUMN tb_comunidade_bot_setting.config_data IS 'Parâmetros de configuração customizados em formato JSON';
COMMENT ON COLUMN tb_comunidade_bot_setting.updated_at IS 'Data e hora da última alteração de configuração';

-- ==========================================
-- 3. DOMÍNIO DE ECONOMIA (ASSINATURAS E SORTEIOS)
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

COMMENT ON TABLE tb_subscription IS 'Registro de assinaturas VIP (Clubinho) dos usuários nas comunidades';
COMMENT ON COLUMN tb_subscription.id_subscription IS 'Identificador único da assinatura (Chave Primária)';
COMMENT ON COLUMN tb_subscription.fk_id_user IS 'Chave estrangeira referenciando o usuário assinante';
COMMENT ON COLUMN tb_subscription.fk_id_comunidade IS 'Chave estrangeira referenciando a comunidade/clube';
COMMENT ON COLUMN tb_subscription.start_date IS 'Data de início da vigência da assinatura';
COMMENT ON COLUMN tb_subscription.end_date IS 'Data de término/expiração da assinatura';
COMMENT ON COLUMN tb_subscription.status IS 'Status atual da assinatura (active, expired, cancelled)';
COMMENT ON COLUMN tb_subscription.created_at IS 'Data e hora de criação da assinatura';
COMMENT ON COLUMN tb_subscription.updated_at IS 'Data e hora da última modificação da assinatura';

CREATE TABLE tb_subscription_transaction (
    id_transaction SERIAL PRIMARY KEY,
    fk_id_subscription INT NOT NULL REFERENCES tb_subscription(id_subscription) ON DELETE CASCADE,
    amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    months_added INT NOT NULL DEFAULT 1,
    payment_method VARCHAR(100),
    file_id_receipt TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tb_subscription_transaction IS 'Histórico de transações e pagamentos vinculados às assinaturas';
COMMENT ON COLUMN tb_subscription_transaction.id_transaction IS 'Identificador único da transação (Chave Primária)';
COMMENT ON COLUMN tb_subscription_transaction.fk_id_subscription IS 'Chave estrangeira referenciando a assinatura associada';
COMMENT ON COLUMN tb_subscription_transaction.amount_paid IS 'Valor monetário pago na transação';
COMMENT ON COLUMN tb_subscription_transaction.months_added IS 'Quantidade de meses adicionados à vigência pela transação';
COMMENT ON COLUMN tb_subscription_transaction.payment_method IS 'Método utilizado para o pagamento';
COMMENT ON COLUMN tb_subscription_transaction.file_id_receipt IS 'Identificador ou caminho do arquivo de comprovante de pagamento';
COMMENT ON COLUMN tb_subscription_transaction.payment_date IS 'Data e hora em que o pagamento foi processado';

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

COMMENT ON TABLE tb_giveaway IS 'Sorteios realizados dentro das comunidades';
COMMENT ON COLUMN tb_giveaway.id_giveaway IS 'Identificador único universal (UUID) do sorteio (Chave Primária)';
COMMENT ON COLUMN tb_giveaway.fk_id_comunidade IS 'Chave estrangeira referenciando a comunidade organizadora';
COMMENT ON COLUMN tb_giveaway.title IS 'Título ou nome descritivo do sorteio';
COMMENT ON COLUMN tb_giveaway.draw_date IS 'Data e hora previstas ou realizadas para o sorteio';
COMMENT ON COLUMN tb_giveaway.type IS 'Tipo ou modalidade do sorteio';
COMMENT ON COLUMN tb_giveaway.cost IS 'Custo de participação (se aplicável)';
COMMENT ON COLUMN tb_giveaway.prize_details IS 'Detalhes e descrição dos prêmios em formato JSON';
COMMENT ON COLUMN tb_giveaway.num_winners IS 'Número total de vencedores contemplados';
COMMENT ON COLUMN tb_giveaway.status IS 'Status atual do sorteio (open, closed, drawn, cancelled)';
COMMENT ON COLUMN tb_giveaway.created_at IS 'Data e hora de criação do sorteio';

CREATE TABLE tb_giveaway_participant (
    id_participant SERIAL PRIMARY KEY,
    fk_id_giveaway UUID NOT NULL REFERENCES tb_giveaway(id_giveaway) ON DELETE CASCADE,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    is_winner BOOLEAN NOT NULL DEFAULT FALSE,
    win_position INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_giveaway_user UNIQUE (fk_id_giveaway, fk_id_user)
);

COMMENT ON TABLE tb_giveaway_participant IS 'Usuários participantes inscritos nos sorteios';
COMMENT ON COLUMN tb_giveaway_participant.id_participant IS 'Identificador único da participação (Chave Primária)';
COMMENT ON COLUMN tb_giveaway_participant.fk_id_giveaway IS 'Chave estrangeira referenciando o sorteio';
COMMENT ON COLUMN tb_giveaway_participant.fk_id_user IS 'Chave estrangeira referenciando o usuário participante';
COMMENT ON COLUMN tb_giveaway_participant.is_winner IS 'Indica se este participante foi sorteado como vencedor';
COMMENT ON COLUMN tb_giveaway_participant.win_position IS 'Posição da premiação obtida (ex: 1º lugar, 2º lugar)';
COMMENT ON COLUMN tb_giveaway_participant.created_at IS 'Data e hora da inscrição no sorteio';

-- ==========================================
-- 4. DOMÍNIO DE GAMIFICAÇÃO E ENGAJAMENTO
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

COMMENT ON TABLE tb_user_season_stats IS 'Estatísticas de desempenho e engajamento dos usuários por temporada (season)';
COMMENT ON COLUMN tb_user_season_stats.fk_id_user IS 'Chave estrangeira referenciando o usuário';
COMMENT ON COLUMN tb_user_season_stats.fk_id_season IS 'Identificador numérico da temporada';
COMMENT ON COLUMN tb_user_season_stats.total_collected IS 'Total de itens/cards coletados na temporada';
COMMENT ON COLUMN tb_user_season_stats.total_dominated IS 'Total de elementos dominados na temporada';
COMMENT ON COLUMN tb_user_season_stats.total_helped IS 'Total de interações de ajuda registradas na temporada';
COMMENT ON COLUMN tb_user_season_stats.updated_at IS 'Data e hora da última atualização das estatísticas';

CREATE TABLE tb_thanks_history (
    id_thanks UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    fk_id_user_sender UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_user_receiver UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_comunidade UUID REFERENCES tb_comunidade(id_comunidade) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tb_thanks_history IS 'Histórico de agradecimentos (pontos de engajamento/love points) entre usuários';
COMMENT ON COLUMN tb_thanks_history.id_thanks IS 'Identificador único universal (UUID) do registro de agradecimento (Chave Primária)';
COMMENT ON COLUMN tb_thanks_history.fk_id_user_sender IS 'Chave estrangeira referenciando o usuário que enviou o agradecimento';
COMMENT ON COLUMN tb_thanks_history.fk_id_user_receiver IS 'Chave estrangeira referenciando o usuário que recebeu o agradecimento';
COMMENT ON COLUMN tb_thanks_history.fk_id_comunidade IS 'Chave estrangeira opcional referenciando a comunidade onde ocorreu a interação';
COMMENT ON COLUMN tb_thanks_history.created_at IS 'Data e hora em que o agradecimento foi registrado';

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

COMMENT ON TABLE tb_duel IS 'Registro de duelos (X1) entre usuários';
COMMENT ON COLUMN tb_duel.id_duel IS 'Identificador único universal (UUID) do duelo (Chave Primária)';
COMMENT ON COLUMN tb_duel.fk_id_comunidade IS 'Chave estrangeira referenciando a comunidade onde o duelo ocorre';
COMMENT ON COLUMN tb_duel.challenger_id IS 'Chave estrangeira referenciando o usuário desafiante';
COMMENT ON COLUMN tb_duel.challenged_id IS 'Chave estrangeira referenciando o usuário desafiado';
COMMENT ON COLUMN tb_duel.status IS 'Status atual do duelo (pending, active, finished, cancelled)';
COMMENT ON COLUMN tb_duel.winner_id IS 'Chave estrangeira referenciando o usuário vencedor (se concluído)';
COMMENT ON COLUMN tb_duel.created_at IS 'Data e hora de criação do duelo';
COMMENT ON COLUMN tb_duel.finished_at IS 'Data e hora de encerramento do duelo';

CREATE TABLE tb_duel_moves (
    id_duel_move SERIAL PRIMARY KEY,
    fk_id_duel UUID NOT NULL REFERENCES tb_duel(id_duel) ON DELETE CASCADE,
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    move VARCHAR(45) NOT NULL,
    move_order SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tb_duel_moves IS 'Movimentos executados pelos jogadores durante os duelos';
COMMENT ON COLUMN tb_duel_moves.id_duel_move IS 'Identificador único do movimento (Chave Primária)';
COMMENT ON COLUMN tb_duel_moves.fk_id_duel IS 'Chave estrangeira referenciando o duelo';
COMMENT ON COLUMN tb_duel_moves.fk_id_user IS 'Chave estrangeira referenciando o usuário que realizou o movimento';
COMMENT ON COLUMN tb_duel_moves.move IS 'Descrição ou código da jogada efetuada';
COMMENT ON COLUMN tb_duel_moves.move_order IS 'Ordem sequencial do movimento dentro do duelo';
COMMENT ON COLUMN tb_duel_moves.created_at IS 'Data e hora do registro do movimento';

CREATE TABLE tb_elemental_category (
    id_elemental_category SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE tb_elemental_category IS 'Categorias dos elementos do sistema de coleção';
COMMENT ON COLUMN tb_elemental_category.id_elemental_category IS 'Identificador único da categoria (Chave Primária)';
COMMENT ON COLUMN tb_elemental_category.code IS 'Código textual exclusivo da categoria';
COMMENT ON COLUMN tb_elemental_category.name IS 'Nome descritivo da categoria';
COMMENT ON COLUMN tb_elemental_category.is_active IS 'Indica se a categoria está ativa';

CREATE TABLE tb_elemental_sprite (
    id_elemental_sprite SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    summon_cost INT NOT NULL DEFAULT 0,
    drop_chance DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE tb_elemental_sprite IS 'Cadastro base de sprites/elementais para coleta';
COMMENT ON COLUMN tb_elemental_sprite.id_elemental_sprite IS 'Identificador único do sprite (Chave Primária)';
COMMENT ON COLUMN tb_elemental_sprite.name IS 'Nome do sprite/elemental';
COMMENT ON COLUMN tb_elemental_sprite.summon_cost IS 'Custo necessário para invocação/obtenção';
COMMENT ON COLUMN tb_elemental_sprite.drop_chance IS 'Probabilidade percentual de drop/aparição';
COMMENT ON COLUMN tb_elemental_sprite.is_active IS 'Indica se o sprite está ativo no sistema';

CREATE TABLE tb_elemental_variant (
    id_elemental_variant SERIAL PRIMARY KEY,
    fk_id_sprite INT NOT NULL REFERENCES tb_elemental_sprite(id_elemental_sprite) ON DELETE CASCADE,
    fk_id_category INT NOT NULL REFERENCES tb_elemental_category(id_elemental_category) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

COMMENT ON TABLE tb_elemental_variant IS 'Variantes específicas dos sprites vinculadas a categorias';
COMMENT ON COLUMN tb_elemental_variant.id_elemental_variant IS 'Identificador único da variante (Chave Primária)';
COMMENT ON COLUMN tb_elemental_variant.fk_id_sprite IS 'Chave estrangeira referenciando o sprite base';
COMMENT ON COLUMN tb_elemental_variant.fk_id_category IS 'Chave estrangeira referenciando a categoria elemental';
COMMENT ON COLUMN tb_elemental_variant.name IS 'Nome específico da variante do elemental';

-- ==========================================
-- 5. PARTICIONAMENTO (COLEÇÃO ELEMENTAL)
-- ==========================================

CREATE TABLE tb_elemental_collection (
    fk_id_user UUID NOT NULL REFERENCES tb_user(id_user) ON DELETE CASCADE,
    fk_id_variant INT NOT NULL REFERENCES tb_elemental_variant(id_elemental_variant) ON DELETE CASCADE,
    fk_id_season INT NOT NULL,
    is_dominated BOOLEAN NOT NULL DEFAULT FALSE,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fk_id_user, fk_id_variant, fk_id_season)
) PARTITION BY LIST (fk_id_season);

COMMENT ON TABLE tb_elemental_collection IS 'Tabela particionada de controle de coleção elemental dos usuários por temporada';
COMMENT ON COLUMN tb_elemental_collection.fk_id_user IS 'Chave estrangeira referenciando o usuário';
COMMENT ON COLUMN tb_elemental_collection.fk_id_variant IS 'Chave estrangeira referenciando a variante elemental coletada';
COMMENT ON COLUMN tb_elemental_collection.fk_id_season IS 'Identificador da temporada (chave de particionamento)';
COMMENT ON COLUMN tb_elemental_collection.is_dominated IS 'Indica se o item foi totalmente dominado/evoluído';
COMMENT ON COLUMN tb_elemental_collection.marked_at IS 'Data e hora em que o item foi coletado/marcado';

CREATE TABLE tb_elemental_collection_s0 PARTITION OF tb_elemental_collection FOR VALUES IN (0);
CREATE TABLE tb_elemental_collection_s1 PARTITION OF tb_elemental_collection FOR VALUES IN (1);
CREATE TABLE tb_elemental_collection_s2 PARTITION OF tb_elemental_collection FOR VALUES IN (2);
CREATE TABLE tb_elemental_collection_default PARTITION OF tb_elemental_collection DEFAULT;