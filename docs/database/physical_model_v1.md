# Physical Model

## Objetivo

Este documento define o modelo físico da plataforma.

Ele é a fonte de verdade para a geração do schema SQL.

Regras:

* O modelo físico deve refletir os domínios aprovados.
* O modelo físico deve refletir as regras de negócio aprovadas.
* O modelo físico não deve introduzir conceitos não documentados.
* Telegram é a fonte de verdade para presença atual em grupos.
* O banco é a fonte de verdade para histórico e regras de negócio persistidas.

---

# Identity

## tb_profile

Descrição:

Representa os perfis de autorização da plataforma.

Campos:

* id
* name

Valores iniciais:

* USER
* ADMIN
* SUPER_ADMIN

Relacionamentos:

Nenhum.

Constraints:

* name UNIQUE

---

## tb_user

Descrição:

Representa um usuário da plataforma.

Campos:

* id
* telegram_id
* profile_id
* created_at
* updated_at

Relacionamentos:

* profile_id → tb_profile.id

Constraints:

* telegram_id UNIQUE

Observações:

* Telegram ID representa a identidade externa do usuário.
* A chave primária interna é utilizada pelos relacionamentos.

---

## tb_user_identity_history

Descrição:

Armazena o histórico de identidade observada no Telegram.

Campos:

* id
* user_id
* username
* first_name
* last_name
* detected_at

Relacionamentos:

* user_id → tb_user.id

Constraints:

Nenhuma.

Regras:

* Toda alteração detectada gera um novo registro.
* O estado atual é obtido pelo registro mais recente.
* Username, first_name e last_name não são armazenados em tb_user.

Observações:

* Esta tabela existe para auditoria e rastreabilidade.
* Permite identificar mudanças de identidade visual no Telegram.

## Community
## tb_community

Descrição:

Representa recursos Telegram administrados pela plataforma.

Campos:

id
telegram_id
name
type
category
has_forum
requires_membership
created_at
updated_at

Relacionamentos:

Nenhum.

Constraints:

telegram_id UNIQUE

Valores para type:

GROUP
CHANNEL
BOT

Valores para category:

MAIN
NEWS
SUPPORT
CLUB
LOG
SUB
OTHER

Observações:

Não existe separação física entre Community e Resource.
Toda a plataforma pertence ao ecossistema Fortnite.
tb_community_configuration

Descrição:

Armazena configurações operacionais de recursos.

Campos:

id
community_id
configuration_type
configuration_json
created_at
updated_at

Relacionamentos:

community_id → tb_community.id

Observações:

Configurações permanecem em JSON.
Estrutura é intencional.
tb_community_entry_history

Descrição:

Armazena o histórico de entradas dos usuários nos recursos da comunidade.

Campos:

id
user_id
community_id
entered_at

Relacionamentos:

user_id → tb_user.id
community_id → tb_community.id

Regras:

Cada entrada gera um novo registro.
Reentradas geram novos registros.
Não representa presença atual.

Observações:

Utilizada para estatísticas e engajamento.
Telegram continua sendo a fonte de verdade para participação atual.
Moderation
tb_warn

Campos:

id
user_id
community_id
reason
applied_by_user_id
created_at

Relacionamentos:

user_id → tb_user.id
community_id → tb_community.id
applied_by_user_id → tb_user.id

Observações:

Warn aplicado incorretamente pode ser removido fisicamente.
tb_mute

Campos:

id
user_id
community_id
reason
expires_at
applied_by_user_id
created_at
lifted_at
lifted_by_user_id

Relacionamentos:

user_id → tb_user.id
community_id → tb_community.id
applied_by_user_id → tb_user.id
lifted_by_user_id → tb_user.id

Observações:

Possui ciclo de vida.
Pode expirar ou ser removido manualmente.
tb_ban

Campos:

id
user_id
community_id
reason
expires_at
applied_by_user_id
created_at
lifted_at
lifted_by_user_id

Relacionamentos:

user_id → tb_user.id
community_id → tb_community.id
applied_by_user_id → tb_user.id
lifted_by_user_id → tb_user.id

Observações:

Ban é global.
community_id representa o contexto da aplicação.
tb_restricted_content_rule

Campos:

id
community_id
content_type
pattern
action
created_by_user_id
created_at

Relacionamentos:

community_id → tb_community.id
created_by_user_id → tb_user.id

Valores para content_type:

WORD
PHRASE
REGEX
URL
DOMAIN

Valores para action:

DELETE_MESSAGE
WARN_USER
MUTE_USER
BAN_USER

Observações:

Não existe tabela de violações.
O grupo de logs atende a necessidade atual.
Club
tb_plan

Campos:

id
name
description
created_at
updated_at
tb_benefit

Campos:

id
name
description
created_at
updated_at
tb_plan_benefit

Campos:

id
plan_id
benefit_id
usage_limit
usage_period
created_at

Relacionamentos:

plan_id → tb_plan.id
benefit_id → tb_benefit.id

Observações:

Benefícios sem limite possuem valores nulos.
tb_membership

Campos:

id
user_id
plan_id
created_at
updated_at

Relacionamentos:

user_id → tb_user.id
plan_id → tb_plan.id

Constraints:

UNIQUE(user_id)

Observações:

Um usuário possui apenas uma membership.
O histórico é armazenado nos períodos.
tb_membership_period

Campos:

id
membership_id
starts_at
ends_at
evidence_file_id
created_by_user_id
created_at

Relacionamentos:

membership_id → tb_membership.id
created_by_user_id → tb_user.id

Regras:

Renovação adiciona novos períodos.
Não cria uma nova membership.
tb_benefit_usage

Campos:

id
membership_id
benefit_id
used_at

Relacionamentos:

membership_id → tb_membership.id
benefit_id → tb_benefit.id
Member Rewards
tb_reward_program

Descrição:

Representa um sorteio criado em um recurso da comunidade.

Campos:

id
community_id
name
description
winner_count
status
starts_at
ends_at
created_by_user_id
created_at
updated_at

Relacionamentos:

community_id → tb_community.id
created_by_user_id → tb_user.id

Valores para status:

OPEN
CANCELLED
FINISHED

Observações:

Todo sorteio pertence a um recurso da comunidade.
O recurso determina as regras de elegibilidade.
Se requires_membership = true, apenas assinantes ativos podem participar.
tb_reward_participation

Campos:

id
reward_program_id
user_id
participated_at

Relacionamentos:

reward_program_id → tb_reward_program.id
user_id → tb_user.id

Constraints:

UNIQUE(reward_program_id, user_id)

Observações:

A participação é registrada quando o usuário utiliza o botão de participação.
tb_reward_winner

Campos:

id
reward_program_id
user_id
position
selected_at

Relacionamentos:

reward_program_id → tb_reward_program.id
user_id → tb_user.id

Constraints:

UNIQUE(reward_program_id, position)
UNIQUE(reward_program_id, user_id)

Observações:

Um sorteio pode possuir múltiplos vencedores.
A posição representa a classificação final.
Decisões Arquiteturais Consolidadas
Telegram é a fonte de verdade para participação atual em grupos.
O banco é a fonte de verdade para histórico.
Ban, mute e warn são globais.
Community representa diretamente grupos, canais e bots.
Não existe suporte planejado para múltiplas comunidades.
Assinaturas pertencem ao usuário.
Membership possui múltiplos períodos.
Benefícios podem possuir limites configuráveis.
O sistema financeiro legado não faz parte do novo modelo.
Todo sorteio pertence a um recurso da comunidade.
Recursos da comunidade podem exigir assinatura através de requires_membership.
Não existe conceito de Participant Pool.
Estatísticas de sorteio poderão ser obtidas por VIEW quando necessário.
A lógica de seleção dos vencedores pertence à aplicação.
O banco armazena participantes e vencedores; o algoritmo de classificação não pertence ao banco.