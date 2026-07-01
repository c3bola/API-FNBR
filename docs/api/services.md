# Services

## Objetivo

Definir os serviços da camada de aplicação.

Os serviços representam a implementação dos casos de uso e são a única forma permitida de acesso às regras de negócio.

Bots, APIs e integrações não devem acessar repositórios diretamente.

---

# Identity

## UserService

Responsável pelo gerenciamento de usuários.

### Responsabilidades

* Registrar usuário
* Obter usuário
* Obter usuário por telegram_id
* Registrar identidade
* Consultar histórico de identidade

### Operações

```text
registerUser()
getUser()
getUserByTelegramId()
registerIdentity()
getIdentityHistory()
```

---

# Community

## CommunityService

Responsável pelo gerenciamento dos recursos Telegram.

### Responsabilidades

* Criar recurso
* Atualizar recurso
* Consultar recurso
* Gerenciar configurações

### Operações

```text
createCommunity()
updateCommunity()
getCommunity()

saveConfiguration()
getConfiguration()
```

---

## CommunityEntryService

Responsável pelo histórico de entradas.

### Responsabilidades

* Registrar entrada
* Consultar entradas
* Contabilizar entradas

### Operações

```text
registerEntry()

getEntries()

countEntries()
```

---

# Moderation

## WarnService

Responsável pelas advertências.

### Responsabilidades

* Aplicar warn
* Remover warn
* Consultar warns

### Operações

```text
applyWarn()

removeWarn()

getWarns()
```

---

## MuteService

Responsável pelos mutes.

### Responsabilidades

* Aplicar mute
* Remover mute
* Consultar mute

### Operações

```text
applyMute()

liftMute()

hasActiveMute()

getActiveMute()
```

---

## BanService

Responsável pelos bans.

### Responsabilidades

* Aplicar ban
* Remover ban
* Consultar ban

### Operações

```text
applyBan()

liftBan()

hasActiveBan()

getActiveBan()
```

---

## RestrictedContentService

Responsável pela moderação automática.

### Responsabilidades

* Gerenciar regras
* Validar conteúdo
* Determinar ações

### Operações

```text
createRule()

updateRule()

deleteRule()

getRules()

validateContent()
```

---

# Club

## PlanService

Responsável pelos planos.

### Operações

```text
createPlan()

updatePlan()

getPlan()

getPlans()
```

---

## BenefitService

Responsável pelos benefícios.

### Operações

```text
createBenefit()

updateBenefit()

getBenefit()

assignBenefitToPlan()

getPlanBenefits()
```

---

## MembershipService

Responsável pelas assinaturas.

### Responsabilidades

* Conceder assinatura
* Renovar assinatura
* Alterar plano
* Consultar assinatura
* Verificar assinatura ativa

### Operações

```text
grantMembership()

renewMembership()

changePlan()

getMembership()

isMembershipActive()
```

---

## MembershipBenefitService

Responsável pela elegibilidade.

### Responsabilidades

* Verificar acesso
* Verificar limite
* Registrar utilização

### Operações

```text
hasBenefitAccess()

hasAvailableUsage()

registerUsage()

getUsageHistory()
```

---

## EligibilityService

Responsável pela validação de acesso.

### Operações

```text
canAccessCommunity()

canParticipateRewardProgram()
```

### Observações

Utilizado por:

* Guarda
* Sorteio

---

# Member Rewards

## RewardProgramService

Responsável pelo gerenciamento dos sorteios.

### Operações

```text
createRewardProgram()

updateRewardProgram()

cancelRewardProgram()

getRewardProgram()

getRewardPrograms()
```

---

## RewardParticipationService

Responsável pelas participações.

### Operações

```text
participate()

hasParticipation()

getParticipants()

countParticipants()
```

---

## RewardWinnerService

Responsável pelos vencedores.

### Operações

```text
registerWinners()

getWinners()

getWinnerHistory()
```

---

## RewardDrawService

Responsável pela execução dos sorteios.

### Responsabilidades

* Recuperar participantes
* Executar classificação
* Selecionar vencedores
* Finalizar sorteio

### Operações

```text
executeDraw()
```

---

## RewardRankingService

Responsável pela classificação.

### Operações

```text
buildRanking()
```

### Observações

As regras de classificação são documentadas em:

```text
reward_distribution.md
```

---

# Integrações

## TelegramMemberService

Responsável pela comunicação com Telegram para validações de participação.

### Operações

```text
isMember()
```

### Observações

Telegram é a fonte de verdade para participação atual em grupos.

---

# Dependências

```text
UserService
 ├─ CommunityService
 ├─ MembershipService
 ├─ Moderation
 └─ Rewards

MembershipService
 └─ EligibilityService

EligibilityService
 ├─ CommunityService
 └─ MembershipService

RewardDrawService
 ├─ RewardParticipationService
 ├─ RewardWinnerService
 └─ RewardRankingService
```

---

# Regras Arquiteturais

1. Controllers não acessam repositórios.

2. Bots não acessam repositórios.

3. Serviços não acessam tabelas diretamente.

4. Todo acesso ao banco ocorre através de repositórios.

5. Regras de negócio pertencem aos serviços.

6. Repositórios não possuem regras de negócio.

7. Integrações externas devem ser encapsuladas em serviços próprios.

8. Telegram deve ser acessado apenas através do TelegramMemberService.
