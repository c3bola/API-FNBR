# API Contracts

## Objetivo

Este documento define os contratos públicos da API.

Os contratos são orientados aos casos de uso do negócio e não à estrutura física do banco de dados.

---

# Convenções

## Autenticação

Todos os endpoints administrativos exigem autenticação.

---

## Resposta de Sucesso

```json
{
  "success": true,
  "data": {}
}
```

---

## Resposta de Erro

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Descrição do erro"
  }
}
```

---

# Identity

## Get User

GET

```http
/users/{telegramId}
```

### Objetivo

Obter usuário pelo Telegram ID.

---

## Get Identity History

GET

```http
/users/{userId}/identity-history
```

### Objetivo

Consultar histórico de identidade.

---

# Community

## Create Community

POST

```http
/communities
```

### Request

```json
{
  "telegramId": -1001234567890,
  "name": "Clubinho",
  "type": "GROUP",
  "category": "CLUB",
  "hasForum": false,
  "requiresMembership": true
}
```

---

## Update Community

PUT

```http
/communities/{communityId}
```

---

## Get Community

GET

```http
/communities/{communityId}
```

---

## Save Configuration

PUT

```http
/communities/{communityId}/configurations/{type}
```

### Request

```json
{
  "configuration": {}
}
```

---

## Get Configuration

GET

```http
/communities/{communityId}/configurations/{type}
```

---

# Moderation

## Apply Warn

POST

```http
/moderation/warns
```

### Request

```json
{
  "userId": 1,
  "communityId": 10,
  "reason": "Flood"
}
```

---

## List Warns

GET

```http
/moderation/users/{userId}/warns
```

---

## Apply Mute

POST

```http
/moderation/mutes
```

### Request

```json
{
  "userId": 1,
  "communityId": 10,
  "reason": "Flood",
  "expiresAt": "2026-01-01T00:00:00"
}
```

---

## Remove Mute

POST

```http
/moderation/mutes/{muteId}/lift
```

---

## Apply Ban

POST

```http
/moderation/bans
```

### Request

```json
{
  "userId": 1,
  "communityId": 10,
  "reason": "Spam",
  "expiresAt": null
}
```

---

## Remove Ban

POST

```http
/moderation/bans/{banId}/lift
```

---

## Check Restrictions

GET

```http
/moderation/users/{userId}/restrictions
```

---

## Create Restricted Content Rule

POST

```http
/moderation/restricted-content-rules
```

### Request

```json
{
  "communityId": 10,
  "contentType": "WORD",
  "pattern": "pix",
  "action": "DELETE_MESSAGE"
}
```

---

# Club

## Grant Membership

POST

```http
/memberships
```

### Request

```json
{
  "userId": 1,
  "planId": 1,
  "startsAt": "2026-01-01",
  "endsAt": "2026-02-01",
  "evidenceFileId": "telegram-file-id"
}
```

---

## Renew Membership

POST

```http
/memberships/{membershipId}/renew
```

### Request

```json
{
  "endsAt": "2026-03-01",
  "evidenceFileId": "telegram-file-id"
}
```

---

## Get Membership

GET

```http
/memberships/users/{userId}
```

---

## Check Active Membership

GET

```http
/memberships/users/{userId}/active
```

### Response

```json
{
  "active": true
}
```

---

## Check Benefit Access

GET

```http
/benefits/{benefitId}/users/{userId}/access
```

---

## Register Benefit Usage

POST

```http
/benefits/{benefitId}/usage
```

### Request

```json
{
  "userId": 1
}
```

---

# Member Rewards

## Create Reward Program

POST

```http
/reward-programs
```

### Request

```json
{
  "communityId": 1,
  "name": "Passe de Batalha",
  "description": "Sorteio mensal",
  "winnerCount": 3
}
```

---

## Get Reward Program

GET

```http
/reward-programs/{rewardProgramId}
```

---

## List Reward Programs

GET

```http
/reward-programs
```

### Query

```http
?communityId=1
```

---

## Participate

POST

```http
/reward-programs/{rewardProgramId}/participate
```

### Request

```json
{
  "userId": 1
}
```

---

## Get Participants

GET

```http
/reward-programs/{rewardProgramId}/participants
```

---

## Execute Draw

POST

```http
/reward-programs/{rewardProgramId}/draw
```

### Objetivo

Executar sorteio e selecionar vencedores.

### Restrição

Somente SUPER_ADMIN.

---

## Get Winners

GET

```http
/reward-programs/{rewardProgramId}/winners
```

---

## Cancel Reward Program

POST

```http
/reward-programs/{rewardProgramId}/cancel
```

---

# Integrações Internas

Os bots não devem acessar diretamente o banco.

Toda interação deve ocorrer através dos contratos da API.

Bots previstos:

* Guarda
* Sorteio

Integrações futuras:

* News
* Outros bots da comunidade
