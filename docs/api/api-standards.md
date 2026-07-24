# API Standards

## Objective

Define mandatory standards for the development and evolution of the FNBR API.

All modules, services, controllers, and integrations must comply with this document.

---

# Versioning

Every endpoint must be versioned.

Format:

```text
/api/v1
```

Examples:

```text
/api/v1/users
/api/v1/communities
/api/v1/memberships
/api/v1/reward-programs
```

---

# URL Naming Convention

Use:

```text
kebab-case
```

Examples:

```text
/users

/identity-history

/reward-programs

/restricted-content-rules
```

Do not use:

```text
/rewardPrograms

/reward_programs
```

---

# JSON Naming Convention

Use:

```text
snake_case
```

Example:

```json
{
  "user_id": 1,
  "telegram_id": 123456789,
  "created_at": "2026-01-01T00:00:00Z"
}
```

Do not use:

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

# Authentication

The API uses API Key authentication.

Required header:

```http
X-API-Key: your-api-key
```

---

# API Consumers

Expected consumers:

```text
fnbr-bot-guarda

fnbr-bot-sorteio

fnbr-bot-cards

fnbr-public-html
```

---

# Authorization

After authentication, the API must validate permissions using:

```text
USER

ADMIN

SUPER_ADMIN
```

as defined in:

```text
permissions.md
```

---

# Response Format

## Success

```json
{
  "success": true,
  "data": {}
}
```

---

## Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

---

# HTTP Status Codes

## 200 OK

Request completed successfully.

---

## 201 Created

Resource created successfully.

---

## 204 No Content

Operation completed successfully with no response body.

---

## 400 Bad Request

Invalid request data.

---

## 401 Unauthorized

Missing or invalid API Key.

---

## 403 Forbidden

Insufficient permissions.

---

## 404 Not Found

Resource not found.

---

## 409 Conflict

Business rule violation.

Examples:

```text
MEMBERSHIP_ALREADY_EXISTS

PARTICIPATION_ALREADY_EXISTS

MUTE_ALREADY_ACTIVE
```

---

## 500 Internal Server Error

Unexpected server error.

---

# Date and Time Format

All date and time values must use the ISO 8601 standard.

Example:

```text
2026-01-01T15:30:00Z
```

---

# Identifiers

All internal IDs must be returned as:

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

# Pagination

Standard format:

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

# Sorting

Standard format:

```text
?sort_by=created_at
&sort_order=desc
```

Allowed values:

```text
asc
desc
```

---

# Filtering

Standard format:

```text
?status=open

?community_id=10

?user_id=5
```

---

# Logging

The API must log:

* authentication
* errors
* administrative operations
* integration failures

Do not log:

* API keys
* tokens
* sensitive information

---

# Database

The API is the only application authorized to access the database.

Bots must not access the database directly.

Required flow:

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

# Telegram Integrations

Telegram is the source of truth for:

* current group membership
* current channel membership

The database is the source of truth for:

* history
* subscriptions
* giveaways
* moderation
* benefits

---

# Backward Compatibility

Breaking changes require:

```text
/api/v2
```

Backward-compatible changes remain within the same API version.

---

# Primary Rule

All business rules must be implemented within the API.

Bots must remain lightweight and delegate all business decisions to the API.
