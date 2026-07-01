# Repositories

## Objetivo

Definir os contratos de acesso ao banco de dados.

Repositórios são responsáveis exclusivamente pela persistência e recuperação de dados.

Não devem conter regras de negócio.

---

# Identity

## UserRepository

### Responsabilidades

* Persistir usuários
* Recuperar usuários

### Operações

```text
save()

update()

findById()

findByTelegramId()

existsByTelegramId()
```

---

## UserIdentityHistoryRepository

### Responsabilidades

* Persistir histórico de identidade
* Consultar histórico

### Operações

```text
save()

findLatestByUserId()

findByUserId()
```

---

# Community

## CommunityRepository

### Operações

```text
save()

update()

findById()

findByTelegramId()

findByCategory()

findAll()
```

---

## CommunityConfigurationRepository

### Operações

```text
save()

update()

findByCommunityIdAndType()

findByCommunityId()
```

---

## CommunityEntryHistoryRepository

### Operações

```text
save()

countByUserAndCommunity()

findByUserAndCommunity()

findByUserId()

findByCommunityId()
```

---

# Moderation

## WarnRepository

### Operações

```text
save()

delete()

findById()

findByUserId()

countByUserId()
```

---

## MuteRepository

### Operações

```text
save()

update()

findById()

findActiveByUserId()

existsActiveByUserId()
```

---

## BanRepository

### Operações

```text
save()

update()

findById()

findActiveByUserId()

existsActiveByUserId()
```

---

## RestrictedContentRuleRepository

### Operações

```text
save()

update()

delete()

findById()

findByCommunityId()

findByCommunityIdAndContentType()
```

---

# Club

## PlanRepository

### Operações

```text
save()

update()

findById()

findAll()
```

---

## BenefitRepository

### Operações

```text
save()

update()

findById()

findAll()
```

---

## PlanBenefitRepository

### Operações

```text
save()

findByPlanId()

findByBenefitId()

findByPlanAndBenefit()
```

---

## MembershipRepository

### Operações

```text
save()

update()

findById()

findByUserId()

existsByUserId()
```

---

## MembershipPeriodRepository

### Operações

```text
save()

findLatestByMembershipId()

findActiveByMembershipId()

findByMembershipId()
```

---

## BenefitUsageRepository

### Operações

```text
save()

countUsage()

findByMembershipAndBenefit()

findByMembershipBenefitAndPeriod()
```

### Observações

Utilizado para cálculo de limites:

* diário
* semanal
* mensal
* anual

---

# Member Rewards

## RewardProgramRepository

### Operações

```text
save()

update()

findById()

findByCommunityId()

findByStatus()

findByCommunityAndStatus()
```

---

## RewardParticipationRepository

### Operações

```text
save()

existsParticipation()

countParticipants()

findParticipants()

findByRewardProgramId()
```

---

## RewardWinnerRepository

### Operações

```text
save()

findByRewardProgramId()

findByUserId()

countWinsByUserId()
```

---

# Integrações

## TelegramMemberRepository

### Objetivo

Abstrair consultas ao Telegram.

### Operações

```text
isMember()
```

### Observações

Apesar do nome Repository, não acessa banco.

Representa uma fonte externa de dados.

---

# Regras

## Responsabilidades Permitidas

Repositórios podem:

* executar consultas
* executar inserts
* executar updates
* executar deletes
* executar paginação
* executar filtros

---

## Responsabilidades Proibidas

Repositórios não podem:

* validar permissões
* validar regras de negócio
* aplicar elegibilidade
* aplicar regras de sorteio
* aplicar regras de assinatura
* executar classificação
* consultar APIs externas diretamente

---

# Fluxo Arquitetural

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
Database
```

```text
Bot
    ↓
API
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
Database
```

---

# Regra Principal

Toda regra de negócio pertence aos Services.

Toda persistência pertence aos Repositories.

Nenhuma exceção.
