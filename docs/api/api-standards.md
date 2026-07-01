# API Standards

## Objetivo

Definir padrões obrigatórios para desenvolvimento e evolução da FNBR API.

Todos os módulos, serviços, controllers e integrações devem seguir este documento.

---

# Versionamento

Toda rota deve possuir versionamento.

Formato:

```text
/api/v1
```

Exemplos:

```text
/api/v1/users
/api/v1/communities
/api/v1/memberships
/api/v1/reward-programs
```

---

# Convenção de URLs

Utilizar:

```text
kebab-case
```

Exemplos:

```text
/users

/identity-history

/reward-programs

/restricted-content-rules
```

Não utilizar:

```text
/rewardPrograms

/reward_programs
```

---

# Convenção JSON

Utilizar:

```text
snake_case
```

Exemplo:

```json
{
  "user_id": 1,
  "telegram_id": 123456789,
  "created_at": "2026-01-01T00:00:00Z"
}
```

Não utilizar:

```json
{
  "userId": 1,
  "telegramId": 123456789
}
```

---

# Content Type

Request:

```http
Content-Type: application/json
```

Response:

```http
Content-Type: application/json
```

---

# Autenticação

A API utiliza API Key.

Header obrigatório:

```http
X-API-Key: your-api-key
```

---

# Consumidores da API

Consumidores previstos:

```text
fnbr-bot-guarda

fnbr-bot-sorteio

fnbr-bot-cards

fnbr-public-html
```

---

# Autorização

Após autenticação, a API deve validar permissões utilizando:

```text
USER

ADMIN

SUPER_ADMIN
```

conforme definido em:

```text
permissions.md
```

---

# Formato de Resposta

## Sucesso

```json
{
  "success": true,
  "data": {}
}
```

---

## Erro

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

---

# Status Codes

## 200 OK

Consulta executada com sucesso.

---

## 201 Created

Registro criado com sucesso.

---

## 204 No Content

Operação executada sem conteúdo de retorno.

---

## 400 Bad Request

Dados inválidos.

---

## 401 Unauthorized

API Key inválida ou ausente.

---

## 403 Forbidden

Permissão insuficiente.

---

## 404 Not Found

Recurso não encontrado.

---

## 409 Conflict

Violação de regra de negócio.

Exemplos:

```text
MEMBERSHIP_ALREADY_EXISTS

PARTICIPATION_ALREADY_EXISTS

MUTE_ALREADY_ACTIVE
```

---

## 500 Internal Server Error

Erro inesperado.

---

# Datas

Todas as datas devem utilizar ISO-8601.

Exemplo:

```text
2026-01-01T15:30:00Z
```

---

# Identificadores

Todos os IDs internos devem ser retornados como:

```json
{
  "id": 1
}
```

Telegram IDs:

```json
{
  "telegram_id": -1001234567890
}
```

---

# Paginação

Formato padrão:

Request:

```text
?page=1
&page_size=50
```

Response:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total": 100
  }
}
```

---

# Ordenação

Formato padrão:

```text
?sort_by=created_at
&sort_order=desc
```

Valores:

```text
asc
desc
```

---

# Filtros

Formato padrão:

```text
?status=open

?community_id=10

?user_id=5
```

---

# Logging

A API deve registrar:

* autenticação
* erros
* operações administrativas
* falhas de integração

Não registrar:

* API Keys
* tokens
* informações sensíveis

---

# Banco de Dados

A API é a única aplicação autorizada a acessar o banco.

Bots não acessam o banco diretamente.

Fluxo obrigatório:

```text
Bot
 ↓
API
 ↓
Service
 ↓
Repository
 ↓
Database
```

---

# Integrações Telegram

Telegram é a fonte de verdade para:

* participação atual em grupos
* participação atual em canais

O banco é fonte de verdade para:

* histórico
* assinaturas
* sorteios
* moderação
* benefícios

---

# Compatibilidade

Mudanças incompatíveis exigem:

```text
/api/v2
```

Mudanças compatíveis permanecem na mesma versão.

---

# Regra Principal

Toda regra de negócio deve ser implementada na API.

Bots devem permanecer simples e delegar decisões para a API.
