# Workflows

## Objetivo

Documentar os fluxos operacionais da plataforma.

Os workflows representam a sequência completa entre bots, API, serviços e banco de dados.

---

# WF-001 - Primeiro Contato do Usuário

## Objetivo

Registrar um usuário desconhecido.

### Origem

* Guarda
* Sorteio
* Qualquer bot da plataforma

### Fluxo

```text
Evento Telegram
    ↓
UserService.getUserByTelegramId()
    ↓
Usuário existe?
    ↓
Não
    ↓
UserService.registerUser()
    ↓
UserIdentityHistoryRepository.save()
    ↓
Usuário registrado
```

### Resultado

Usuário disponível na plataforma.

---

# WF-002 - Alteração de Identidade

## Objetivo

Registrar mudança de username ou nome.

### Fluxo

```text
Evento Telegram
    ↓
UserService.getUser()
    ↓
Comparar identidade atual
    ↓
Difere?
    ↓
Sim
    ↓
UserIdentityHistoryRepository.save()
```

### Resultado

Histórico atualizado.

---

# WF-003 - Entrada em Grupo

## Objetivo

Registrar entrada de usuário.

### Origem

* Guarda

### Fluxo

```text
Evento ChatMemberUpdated
    ↓
CommunityEntryService.registerEntry()
    ↓
tb_community_entry_history
```

### Resultado

Entrada registrada.

### Observações

Toda entrada gera novo registro.

---

# WF-004 - Mensagem Recebida

## Objetivo

Executar moderação automática.

### Origem

* Guarda

### Fluxo

```text
Mensagem
    ↓
RestrictedContentService.validateContent()
    ↓
Existe violação?
    ↓
Não
    ↓
Fim

Sim
    ↓
Executar ação configurada
```

### Possíveis ações

```text
DELETE_MESSAGE
WARN_USER
MUTE_USER
BAN_USER
```

---

# WF-005 - Aplicação de Warn

## Objetivo

Registrar advertência.

### Fluxo

```text
Admin
    ↓
WarnService.applyWarn()
    ↓
WarnRepository.save()
```

### Resultado

Warn registrado.

---

# WF-006 - Aplicação de Mute

## Objetivo

Aplicar restrição temporária.

### Fluxo

```text
Admin
    ↓
MuteService.applyMute()
    ↓
MuteRepository.save()
```

### Resultado

Mute ativo.

---

# WF-007 - Aplicação de Ban

## Objetivo

Aplicar restrição.

### Fluxo

```text
Admin
    ↓
BanService.applyBan()
    ↓
BanRepository.save()
```

### Resultado

Ban ativo.

---

# WF-008 - Conceder Assinatura

## Objetivo

Criar assinatura.

### Fluxo

```text
Admin
    ↓
MembershipService.grantMembership()
    ↓
MembershipRepository.save()
    ↓
MembershipPeriodRepository.save()
```

### Resultado

Assinatura ativa.

---

# WF-009 - Renovar Assinatura

## Objetivo

Adicionar período à assinatura.

### Fluxo

```text
Admin
    ↓
MembershipService.renewMembership()
    ↓
Recuperar último período
    ↓
Calcular nova data final
    ↓
Criar novo período
```

### Resultado

Tempo adicionado.

### Observações

Não cria nova membership.

---

# WF-010 - Verificar Elegibilidade

## Objetivo

Validar acesso a recurso premium.

### Fluxo

```text
EligibilityService.canAccessCommunity()
    ↓
Community.requiresMembership?
    ↓
Não
    ↓
Permitido

Sim
    ↓
MembershipService.isMembershipActive()
```

### Resultado

Elegibilidade determinada.

---

# WF-011 - Participar de Sorteio

## Objetivo

Registrar participação.

### Origem

* Bot Sorteio

### Fluxo

```text
Usuário clica em participar
    ↓
RewardParticipationService.participate()
    ↓
RewardProgram está OPEN?
    ↓
Validar elegibilidade
    ↓
Já participa?
    ↓
Não
    ↓
Salvar participação
```

### Resultado

Participação registrada.

---

# WF-012 - Sorteio Exclusivo

## Objetivo

Validar participação de assinantes.

### Fluxo

```text
Participação
    ↓
RewardProgram
    ↓
Community
    ↓
requiresMembership?
    ↓
Sim
    ↓
Membership ativa?
```

### Resultado

Participação permitida ou negada.

---

# WF-013 - Executar Sorteio

## Objetivo

Selecionar vencedores.

### Origem

* Super Admin

### Fluxo

```text
Executar sorteio
    ↓
RewardDrawService.executeDraw()
    ↓
Recuperar participantes
    ↓
RewardRankingService.buildRanking()
    ↓
Selecionar vencedores
    ↓
RewardWinnerService.registerWinners()
    ↓
RewardProgram.status = FINISHED
```

### Resultado

Sorteio finalizado.

---

# WF-014 - Consultar Histórico de Vitórias

## Objetivo

Recuperar vitórias anteriores.

### Fluxo

```text
RewardWinnerRepository.findByUserId()
```

### Resultado

Histórico disponível.

---

# WF-015 - Verificação de Membro Telegram

## Objetivo

Validar participação atual em grupo.

### Fluxo

```text
TelegramMemberService.isMember()
    ↓
Telegram API
```

### Resultado

Status atual do membro.

### Observações

Telegram é a fonte de verdade.

O banco não deve ser utilizado para determinar participação atual.

---

# WF-016 - Benefício com Limite

## Objetivo

Controlar utilização.

### Fluxo

```text
Solicitação
    ↓
MembershipBenefitService.hasBenefitAccess()
    ↓
MembershipBenefitService.hasAvailableUsage()
    ↓
Permitido?
    ↓
Sim
    ↓
registerUsage()
```

### Resultado

Utilização registrada.

---

# Dependências Entre Bots

## Guarda

Utiliza:

```text
UserService
CommunityEntryService

WarnService
MuteService
BanService

RestrictedContentService

MembershipService

EligibilityService

TelegramMemberService
```

---

## Sorteio

Utiliza:

```text
UserService

MembershipService

EligibilityService

RewardProgramService

RewardParticipationService

RewardWinnerService

RewardDrawService

RewardRankingService

TelegramMemberService
```

---

# Regra Fundamental

O banco nunca é utilizado para validar participação atual em grupos.

Sempre utilizar:

```text
TelegramMemberService
```

como fonte de verdade.
