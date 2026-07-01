# Error Codes

## Objetivo

Padronizar os erros retornados pela API.

Todos os erros devem possuir:

* code
* message

Exemplo:

```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found."
  }
}
```

---

# Authentication

## AUTHENTICATION_REQUIRED

```json
{
  "code": "AUTHENTICATION_REQUIRED",
  "message": "Authentication required."
}
```

---

## INVALID_TOKEN

```json
{
  "code": "INVALID_TOKEN",
  "message": "Invalid token."
}
```

---

## ACCESS_DENIED

```json
{
  "code": "ACCESS_DENIED",
  "message": "Access denied."
}
```

---

# Users

## USER_NOT_FOUND

```json
{
  "code": "USER_NOT_FOUND",
  "message": "User not found."
}
```

---

## USER_ALREADY_EXISTS

```json
{
  "code": "USER_ALREADY_EXISTS",
  "message": "User already exists."
}
```

---

# Community

## COMMUNITY_NOT_FOUND

```json
{
  "code": "COMMUNITY_NOT_FOUND",
  "message": "Community not found."
}
```

---

## COMMUNITY_ALREADY_EXISTS

```json
{
  "code": "COMMUNITY_ALREADY_EXISTS",
  "message": "Community already exists."
}
```

---

## COMMUNITY_CONFIGURATION_NOT_FOUND

```json
{
  "code": "COMMUNITY_CONFIGURATION_NOT_FOUND",
  "message": "Community configuration not found."
}
```

---

# Moderation

## WARN_NOT_FOUND

```json
{
  "code": "WARN_NOT_FOUND",
  "message": "Warn not found."
}
```

---

## MUTE_NOT_FOUND

```json
{
  "code": "MUTE_NOT_FOUND",
  "message": "Mute not found."
}
```

---

## MUTE_ALREADY_ACTIVE

```json
{
  "code": "MUTE_ALREADY_ACTIVE",
  "message": "User already has an active mute."
}
```

---

## BAN_NOT_FOUND

```json
{
  "code": "BAN_NOT_FOUND",
  "message": "Ban not found."
}
```

---

## BAN_ALREADY_ACTIVE

```json
{
  "code": "BAN_ALREADY_ACTIVE",
  "message": "User already has an active ban."
}
```

---

## RESTRICTED_CONTENT_RULE_NOT_FOUND

```json
{
  "code": "RESTRICTED_CONTENT_RULE_NOT_FOUND",
  "message": "Restricted content rule not found."
}
```

---

# Membership

## MEMBERSHIP_NOT_FOUND

```json
{
  "code": "MEMBERSHIP_NOT_FOUND",
  "message": "Membership not found."
}
```

---

## MEMBERSHIP_ALREADY_EXISTS

```json
{
  "code": "MEMBERSHIP_ALREADY_EXISTS",
  "message": "Membership already exists."
}
```

---

## MEMBERSHIP_NOT_ACTIVE

```json
{
  "code": "MEMBERSHIP_NOT_ACTIVE",
  "message": "Membership is not active."
}
```

---

## MEMBERSHIP_REQUIRED

```json
{
  "code": "MEMBERSHIP_REQUIRED",
  "message": "Active membership required."
}
```

---

## MEMBERSHIP_PERIOD_NOT_FOUND

```json
{
  "code": "MEMBERSHIP_PERIOD_NOT_FOUND",
  "message": "Membership period not found."
}
```

---

# Plans

## PLAN_NOT_FOUND

```json
{
  "code": "PLAN_NOT_FOUND",
  "message": "Plan not found."
}
```

---

# Benefits

## BENEFIT_NOT_FOUND

```json
{
  "code": "BENEFIT_NOT_FOUND",
  "message": "Benefit not found."
}
```

---

## BENEFIT_NOT_AVAILABLE

```json
{
  "code": "BENEFIT_NOT_AVAILABLE",
  "message": "Benefit not available."
}
```

---

## BENEFIT_USAGE_LIMIT_REACHED

```json
{
  "code": "BENEFIT_USAGE_LIMIT_REACHED",
  "message": "Benefit usage limit reached."
}
```

---

# Reward Program

## REWARD_PROGRAM_NOT_FOUND

```json
{
  "code": "REWARD_PROGRAM_NOT_FOUND",
  "message": "Reward program not found."
}
```

---

## REWARD_PROGRAM_CANCELLED

```json
{
  "code": "REWARD_PROGRAM_CANCELLED",
  "message": "Reward program cancelled."
}
```

---

## REWARD_PROGRAM_FINISHED

```json
{
  "code": "REWARD_PROGRAM_FINISHED",
  "message": "Reward program finished."
}
```

---

## REWARD_PROGRAM_NOT_OPEN

```json
{
  "code": "REWARD_PROGRAM_NOT_OPEN",
  "message": "Reward program is not open."
}
```

---

# Participation

## PARTICIPATION_ALREADY_EXISTS

```json
{
  "code": "PARTICIPATION_ALREADY_EXISTS",
  "message": "User already participates in this reward program."
}
```

---

## PARTICIPATION_NOT_ALLOWED

```json
{
  "code": "PARTICIPATION_NOT_ALLOWED",
  "message": "User is not eligible to participate."
}
```

---

## PARTICIPATION_NOT_FOUND

```json
{
  "code": "PARTICIPATION_NOT_FOUND",
  "message": "Participation not found."
}
```

---

# Winners

## WINNER_NOT_FOUND

```json
{
  "code": "WINNER_NOT_FOUND",
  "message": "Winner not found."
}
```

---

## DRAW_ALREADY_EXECUTED

```json
{
  "code": "DRAW_ALREADY_EXECUTED",
  "message": "Draw already executed."
}
```

---

## INSUFFICIENT_PARTICIPANTS

```json
{
  "code": "INSUFFICIENT_PARTICIPANTS",
  "message": "Insufficient participants."
}
```

---

# Validation

## INVALID_REQUEST

```json
{
  "code": "INVALID_REQUEST",
  "message": "Invalid request."
}
```

---

## INVALID_PARAMETER

```json
{
  "code": "INVALID_PARAMETER",
  "message": "Invalid parameter."
}
```

---

## INVALID_STATE

```json
{
  "code": "INVALID_STATE",
  "message": "Invalid state."
}
```

---

# Internal Errors

## INTERNAL_ERROR

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Unexpected error."
}
```

---

## DATABASE_ERROR

```json
{
  "code": "DATABASE_ERROR",
  "message": "Database error."
}
```

---

# Regras

1. Nunca retornar stack trace.

2. Nunca retornar mensagens internas do banco.

3. Sempre retornar código padronizado.

4. Bots devem tomar decisões utilizando o campo error.code e não o campo message.

5. O campo message é destinado apenas para exibição.
