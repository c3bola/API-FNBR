# Identity & Community Use Cases

## Objetivo

Este documento define os casos de uso dos domínios Identity e Community.

Os casos de uso representam o comportamento esperado do sistema e servem como base para definição de serviços, contratos e endpoints da API.

---

# Identity

## UC-ID-001 - Registrar Usuário

### Objetivo

Garantir que um usuário Telegram possua representação interna na plataforma.

### Ator

* Bot

### Fluxo

1. Receber evento Telegram contendo informações do usuário.
2. Procurar usuário pelo telegram_id.
3. Caso não exista:

   * criar registro em tb_user;
   * associar perfil USER;
   * registrar identidade inicial em tb_user_identity_history.
4. Retornar usuário.

### Resultado

Usuário registrado na plataforma.

---

## UC-ID-002 - Atualizar Identidade Observada

### Objetivo

Registrar alterações de identidade visual observadas no Telegram.

### Ator

* Bot

### Fluxo

1. Receber username, first_name e last_name.
2. Recuperar último registro de identidade.
3. Comparar dados recebidos.
4. Caso exista alteração:

   * criar novo registro em tb_user_identity_history.
5. Caso não exista alteração:

   * encerrar processamento.

### Resultado

Histórico atualizado.

---

## UC-ID-003 - Obter Usuário

### Objetivo

Recuperar dados internos do usuário.

### Ator

* Aplicação

### Fluxo

1. Informar telegram_id ou id interno.
2. Localizar usuário.
3. Retornar informações básicas.

### Resultado

Usuário encontrado.

---

## UC-ID-004 - Obter Histórico de Identidade

### Objetivo

Permitir auditoria de alterações de identidade.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar usuário.
2. Recuperar histórico.
3. Ordenar por detected_at desc.
4. Retornar registros.

### Resultado

Histórico disponível para auditoria.

---

# Community

## UC-COM-001 - Registrar Recurso Telegram

### Objetivo

Registrar grupos, canais ou bots administrados pela plataforma.

### Ator

* Super Admin

### Fluxo

1. Informar telegram_id.
2. Informar tipo.
3. Informar categoria.
4. Criar registro em tb_community.

### Resultado

Recurso registrado.

---

## UC-COM-002 - Atualizar Recurso

### Objetivo

Atualizar informações operacionais do recurso.

### Ator

* Super Admin

### Fluxo

1. Localizar recurso.
2. Atualizar atributos permitidos.
3. Persistir alterações.

### Resultado

Recurso atualizado.

---

## UC-COM-003 - Configurar Recurso

### Objetivo

Persistir configurações operacionais.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar tipo da configuração.
2. Informar JSON de configuração.
3. Salvar em tb_community_configuration.

### Resultado

Configuração atualizada.

---

## UC-COM-004 - Obter Configuração

### Objetivo

Carregar configuração operacional do recurso.

### Ator

* Aplicação

### Fluxo

1. Informar recurso.
2. Informar tipo da configuração.
3. Recuperar configuração.

### Resultado

Configuração carregada.

---

## UC-COM-005 - Registrar Entrada de Usuário

### Objetivo

Registrar entrada de usuário em recurso da comunidade.

### Ator

* Bot

### Fluxo

1. Receber evento de entrada.
2. Identificar usuário.
3. Identificar recurso.
4. Criar registro em tb_community_entry_history.

### Resultado

Entrada registrada.

---

## UC-COM-006 - Consultar Histórico de Entradas

### Objetivo

Consultar participação histórica de um usuário em um recurso.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar usuário.
2. Informar recurso.
3. Recuperar registros.
4. Retornar histórico.

### Resultado

Histórico de entradas disponível.

---

## UC-COM-007 - Contabilizar Entradas

### Objetivo

Determinar quantas vezes um usuário entrou em um recurso.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Informar recurso.
3. Contar registros de entrada.
4. Retornar quantidade.

### Resultado

Quantidade de entradas calculada.
