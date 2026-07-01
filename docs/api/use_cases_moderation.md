# Moderation Use Cases

## Objetivo

Este documento define os casos de uso do domínio Moderation.

Os casos de uso representam o comportamento esperado para aplicação de restrições, análise de conteúdo e controle operacional da comunidade.

---

# Warn

## UC-MOD-001 - Aplicar Warn

### Objetivo

Registrar uma advertência para um usuário.

### Ator

* Admin
* Super Admin
* Sistema

### Fluxo

1. Identificar usuário.
2. Identificar motivo.
3. Identificar contexto da aplicação.
4. Registrar warn.
5. Notificar usuário quando aplicável.

### Resultado

Warn registrado.

---

## UC-MOD-002 - Listar Warns

### Objetivo

Consultar advertências de um usuário.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar usuário.
2. Recuperar warns.
3. Ordenar por data.
4. Retornar resultado.

### Resultado

Histórico de warns disponível.

---

## UC-MOD-003 - Remover Warn

### Objetivo

Remover advertência aplicada incorretamente.

### Ator

* Super Admin

### Fluxo

1. Identificar warn.
2. Validar permissão.
3. Remover registro.

### Resultado

Warn removido.

---

# Mute

## UC-MOD-004 - Aplicar Mute

### Objetivo

Restringir temporariamente a capacidade de comunicação de um usuário.

### Ator

* Admin
* Super Admin
* Sistema

### Fluxo

1. Identificar usuário.
2. Definir duração.
3. Informar motivo.
4. Aplicar mute.
5. Registrar operação.

### Resultado

Mute ativo.

---

## UC-MOD-005 - Remover Mute

### Objetivo

Encerrar um mute antes de sua expiração.

### Ator

* Admin
* Super Admin

### Fluxo

1. Identificar mute ativo.
2. Registrar remoção.
3. Atualizar estado.

### Resultado

Mute encerrado.

---

## UC-MOD-006 - Verificar Mute Ativo

### Objetivo

Determinar se o usuário possui mute vigente.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Verificar restrições ativas.
3. Retornar resultado.

### Resultado

Status de mute disponível.

---

# Ban

## UC-MOD-007 - Aplicar Ban

### Objetivo

Restringir a participação do usuário na comunidade.

### Ator

* Admin
* Super Admin
* Sistema

### Fluxo

1. Identificar usuário.
2. Informar motivo.
3. Definir duração quando aplicável.
4. Registrar ban.
5. Executar ações operacionais necessárias.

### Resultado

Ban ativo.

### Observações

* Ban é global.
* O contexto da aplicação é registrado para auditoria.

---

## UC-MOD-008 - Remover Ban

### Objetivo

Encerrar um ban antes de sua expiração.

### Ator

* Super Admin

### Fluxo

1. Identificar ban ativo.
2. Registrar remoção.
3. Atualizar estado.

### Resultado

Ban encerrado.

---

## UC-MOD-009 - Verificar Ban Ativo

### Objetivo

Determinar se um usuário possui ban vigente.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Verificar bans ativos.
3. Retornar resultado.

### Resultado

Status de ban disponível.

---

# Restricted Content

## UC-MOD-010 - Criar Regra de Conteúdo Restrito

### Objetivo

Cadastrar uma regra de moderação automática.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar padrão.
2. Informar tipo do conteúdo.
3. Informar ação.
4. Associar ao recurso.
5. Salvar regra.

### Resultado

Regra cadastrada.

---

## UC-MOD-011 - Atualizar Regra de Conteúdo Restrito

### Objetivo

Alterar comportamento de uma regra existente.

### Ator

* Admin
* Super Admin

### Fluxo

1. Localizar regra.
2. Atualizar dados.
3. Persistir alterações.

### Resultado

Regra atualizada.

---

## UC-MOD-012 - Remover Regra de Conteúdo Restrito

### Objetivo

Desativar uma regra de moderação.

### Ator

* Admin
* Super Admin

### Fluxo

1. Identificar regra.
2. Remover registro.

### Resultado

Regra removida.

---

## UC-MOD-013 - Validar Conteúdo

### Objetivo

Determinar se uma mensagem viola alguma regra cadastrada.

### Ator

* Aplicação

### Fluxo

1. Receber mensagem.
2. Carregar regras do recurso.
3. Avaliar conteúdo.
4. Identificar correspondências.
5. Retornar ação aplicável.

### Resultado

Conteúdo validado.

---

## UC-MOD-014 - Executar Ação Automática

### Objetivo

Aplicar automaticamente a ação definida pela regra.

### Ator

* Sistema

### Fluxo

1. Receber resultado da validação.
2. Determinar ação configurada.
3. Executar ação.
4. Registrar operação.

### Resultado

Ação aplicada.

---

# Consultas Operacionais

## UC-MOD-015 - Obter Restrições Ativas

### Objetivo

Recuperar todas as restrições atualmente aplicadas a um usuário.

### Ator

* Admin
* Super Admin
* Aplicação

### Fluxo

1. Informar usuário.
2. Consultar bans ativos.
3. Consultar mutes ativos.
4. Retornar resultado consolidado.

### Resultado

Restrições disponíveis para consulta.
