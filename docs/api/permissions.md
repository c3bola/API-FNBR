# Permissions

## Objetivo

Este documento define as permissões dos perfis da plataforma.

As permissões são avaliadas pela API antes da execução dos casos de uso.

---

# Perfis

## USER

Representa membros da comunidade.

Permissões limitadas às próprias informações e ações disponíveis ao público.

---

## ADMIN

Representa moderadores e administradores da comunidade.

Possui acesso operacional.

Não possui acesso às funções críticas da plataforma.

---

## SUPER_ADMIN

Representa administradores da plataforma.

Possui acesso irrestrito.

Responsável por configurações globais e operações críticas.

---

# Identity

| Operação                          | USER | ADMIN | SUPER_ADMIN |
| --------------------------------- | ---- | ----- | ----------- |
| Consultar próprio usuário         | ✓    | ✓     | ✓           |
| Consultar usuário                 | ✗    | ✓     | ✓           |
| Consultar histórico de identidade | ✗    | ✓     | ✓           |

---

# Community

| Operação                | USER | ADMIN | SUPER_ADMIN |
| ----------------------- | ---- | ----- | ----------- |
| Consultar recurso       | ✓    | ✓     | ✓           |
| Consultar configurações | ✗    | ✓     | ✓           |
| Atualizar configurações | ✗    | ✓     | ✓           |
| Criar recurso           | ✗    | ✗     | ✓           |
| Atualizar recurso       | ✗    | ✗     | ✓           |

---

# Moderation

## Warn

| Operação                     | USER | ADMIN | SUPER_ADMIN |
| ---------------------------- | ---- | ----- | ----------- |
| Consultar próprios warns     | ✓    | ✓     | ✓           |
| Consultar warns de terceiros | ✗    | ✓     | ✓           |
| Aplicar warn                 | ✗    | ✓     | ✓           |
| Remover warn                 | ✗    | ✗     | ✓           |

---

## Mute

| Operação                      | USER | ADMIN | SUPER_ADMIN |
| ----------------------------- | ---- | ----- | ----------- |
| Consultar próprio status      | ✓    | ✓     | ✓           |
| Consultar status de terceiros | ✗    | ✓     | ✓           |
| Aplicar mute                  | ✗    | ✓     | ✓           |
| Remover mute                  | ✗    | ✓     | ✓           |

---

## Ban

| Operação                      | USER | ADMIN | SUPER_ADMIN |
| ----------------------------- | ---- | ----- | ----------- |
| Consultar próprio status      | ✓    | ✓     | ✓           |
| Consultar status de terceiros | ✗    | ✓     | ✓           |
| Aplicar ban                   | ✗    | ✓     | ✓           |
| Remover ban                   | ✗    | ✗     | ✓           |

---

## Restricted Content

| Operação         | USER | ADMIN | SUPER_ADMIN |
| ---------------- | ---- | ----- | ----------- |
| Consultar regras | ✗    | ✓     | ✓           |
| Criar regra      | ✗    | ✓     | ✓           |
| Atualizar regra  | ✗    | ✓     | ✓           |
| Remover regra    | ✗    | ✓     | ✓           |

---

# Club

## Planos

| Operação         | USER | ADMIN | SUPER_ADMIN |
| ---------------- | ---- | ----- | ----------- |
| Consultar planos | ✓    | ✓     | ✓           |
| Criar plano      | ✗    | ✗     | ✓           |
| Atualizar plano  | ✗    | ✗     | ✓           |

---

## Benefícios

| Operação                    | USER | ADMIN | SUPER_ADMIN |
| --------------------------- | ---- | ----- | ----------- |
| Consultar benefícios        | ✓    | ✓     | ✓           |
| Criar benefício             | ✗    | ✗     | ✓           |
| Associar benefício ao plano | ✗    | ✗     | ✓           |

---

## Membership

| Operação                          | USER | ADMIN | SUPER_ADMIN |
| --------------------------------- | ---- | ----- | ----------- |
| Consultar própria assinatura      | ✓    | ✓     | ✓           |
| Consultar assinatura de terceiros | ✗    | ✓     | ✓           |
| Conceder assinatura               | ✗    | ✓     | ✓           |
| Renovar assinatura                | ✗    | ✓     | ✓           |
| Alterar plano                     | ✗    | ✗     | ✓           |

---

# Member Rewards

## Sorteios

| Operação          | USER | ADMIN | SUPER_ADMIN |
| ----------------- | ---- | ----- | ----------- |
| Consultar sorteio | ✓    | ✓     | ✓           |
| Listar sorteios   | ✓    | ✓     | ✓           |
| Criar sorteio     | ✗    | ✓     | ✓           |
| Atualizar sorteio | ✗    | ✓     | ✓           |
| Cancelar sorteio  | ✗    | ✓     | ✓           |

---

## Participação

| Operação                | USER | ADMIN | SUPER_ADMIN |
| ----------------------- | ---- | ----- | ----------- |
| Participar              | ✓    | ✓     | ✓           |
| Consultar participantes | ✗    | ✓     | ✓           |

---

## Resultado

| Operação               | USER | ADMIN | SUPER_ADMIN |
| ---------------------- | ---- | ----- | ----------- |
| Consultar vencedores   | ✓    | ✓     | ✓           |
| Executar sorteio       | ✗    | ✗     | ✓           |
| Consultar estatísticas | ✗    | ✓     | ✓           |

---

# Bots

## Guarda

Permissões:

* Consultar usuário
* Consultar histórico de identidade
* Registrar entrada
* Aplicar warn
* Aplicar mute
* Aplicar ban
* Consultar restrições
* Validar conteúdo
* Consultar assinatura ativa
* Verificar elegibilidade

---

## Sorteio

Permissões:

* Consultar usuário
* Consultar assinatura ativa
* Verificar elegibilidade
* Registrar participação
* Consultar participantes
* Registrar vencedores
* Consultar histórico de vitórias

Observação:

O sorteio somente pode ser executado por um usuário SUPER_ADMIN.

O bot não possui permissão para executar sorteios autonomamente.
