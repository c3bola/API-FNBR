# Club Use Cases

## Objetivo

Este documento define os casos de uso do domínio Club.

O domínio Club é responsável pela gestão de assinaturas, planos, benefícios e elegibilidade utilizada pelos demais domínios da plataforma.

---

# Planos

## UC-CLUB-001 - Criar Plano

### Objetivo

Cadastrar um novo plano de assinatura.

### Ator

* Super Admin

### Fluxo

1. Informar nome.
2. Informar descrição.
3. Criar plano.

### Resultado

Plano disponível para utilização.

---

## UC-CLUB-002 - Atualizar Plano

### Objetivo

Alterar informações de um plano existente.

### Ator

* Super Admin

### Fluxo

1. Localizar plano.
2. Atualizar dados.
3. Persistir alterações.

### Resultado

Plano atualizado.

---

## UC-CLUB-003 - Listar Planos

### Objetivo

Consultar planos disponíveis.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Recuperar planos.
2. Retornar resultado.

### Resultado

Lista de planos disponível.

---

# Benefícios

## UC-CLUB-004 - Criar Benefício

### Objetivo

Cadastrar um benefício disponível para utilização nos planos.

### Ator

* Super Admin

### Fluxo

1. Informar nome.
2. Informar descrição.
3. Criar benefício.

### Resultado

Benefício disponível.

---

## UC-CLUB-005 - Associar Benefício ao Plano

### Objetivo

Definir quais benefícios pertencem a um plano.

### Ator

* Super Admin

### Fluxo

1. Localizar plano.
2. Localizar benefício.
3. Definir limite de uso quando aplicável.
4. Definir período de controle quando aplicável.
5. Criar associação.

### Resultado

Benefício vinculado ao plano.

---

## UC-CLUB-006 - Listar Benefícios do Plano

### Objetivo

Consultar benefícios disponíveis para um plano.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Informar plano.
2. Recuperar benefícios associados.
3. Retornar resultado.

### Resultado

Benefícios disponíveis.

---

# Membership

## UC-CLUB-007 - Conceder Assinatura

### Objetivo

Criar uma assinatura para um usuário.

### Ator

* Admin
* Super Admin

### Fluxo

1. Localizar usuário.
2. Selecionar plano.
3. Criar membership.
4. Criar primeiro período.
5. Registrar evidência quando disponível.

### Resultado

Assinatura ativa.

---

## UC-CLUB-008 - Renovar Assinatura

### Objetivo

Adicionar tempo a uma assinatura existente.

### Ator

* Admin
* Super Admin

### Fluxo

1. Localizar membership.
2. Recuperar último período.
3. Calcular nova data final.
4. Criar novo período.
5. Registrar evidência quando disponível.

### Resultado

Período adicional registrado.

### Observações

* Renovação não cria nova membership.
* O tempo adquirido é acumulado ao período vigente.

---

## UC-CLUB-009 - Alterar Plano da Assinatura

### Objetivo

Alterar o plano atualmente associado à membership.

### Ator

* Super Admin

### Fluxo

1. Localizar membership.
2. Selecionar novo plano.
3. Atualizar associação.

### Resultado

Plano atualizado.

---

## UC-CLUB-010 - Consultar Assinatura

### Objetivo

Recuperar informações da assinatura de um usuário.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Informar usuário.
2. Recuperar membership.
3. Recuperar períodos.
4. Retornar resultado.

### Resultado

Informações disponíveis.

---

## UC-CLUB-011 - Verificar Assinatura Ativa

### Objetivo

Determinar se um usuário possui assinatura válida.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Recuperar membership.
3. Verificar período vigente.
4. Retornar resultado.

### Resultado

Status da assinatura disponível.

### Observações

Este caso de uso é utilizado por:

* Guarda
* Sorteio
* Recursos da comunidade que exigem assinatura

---

# Benefícios

## UC-CLUB-012 - Verificar Acesso ao Benefício

### Objetivo

Determinar se um usuário possui acesso a determinado benefício.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Informar benefício.
3. Verificar assinatura ativa.
4. Verificar plano.
5. Verificar associação do benefício.
6. Retornar resultado.

### Resultado

Permissão disponível.

---

## UC-CLUB-013 - Verificar Limite de Uso

### Objetivo

Determinar se o benefício ainda possui utilização disponível.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Informar benefício.
3. Recuperar limite configurado.
4. Recuperar utilizações registradas.
5. Calcular disponibilidade.
6. Retornar resultado.

### Resultado

Disponibilidade calculada.

### Observações

Benefícios podem possuir controle por:

* dia
* semana
* mês
* ano

---

## UC-CLUB-014 - Registrar Utilização de Benefício

### Objetivo

Registrar o consumo de um benefício.

### Ator

* Aplicação

### Fluxo

1. Validar acesso ao benefício.
2. Validar limite disponível.
3. Registrar utilização.
4. Retornar resultado.

### Resultado

Utilização registrada.

---

## UC-CLUB-015 - Consultar Histórico de Utilização

### Objetivo

Consultar utilizações registradas para um benefício.

### Ator

* Admin
* Super Admin
* Aplicação

### Fluxo

1. Informar usuário.
2. Informar benefício.
3. Recuperar registros.
4. Retornar resultado.

### Resultado

Histórico disponível.

---

# Elegibilidade

## UC-CLUB-016 - Verificar Elegibilidade de Recurso

### Objetivo

Determinar se um usuário pode acessar um recurso da comunidade.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Informar recurso.
3. Verificar configuração requires_membership.
4. Caso não exija assinatura:

   * permitir acesso.
5. Caso exija assinatura:

   * validar assinatura ativa.
6. Retornar resultado.

### Resultado

Elegibilidade determinada.

### Observações

Este caso de uso é utilizado principalmente por:

* Clubinho
* Sorteios exclusivos
* Recursos premium futuros
