# Member Rewards Use Cases

## Objetivo

Este documento define os casos de uso do domínio Member Rewards.

O domínio é responsável pela criação, participação e execução de sorteios realizados pela comunidade.

---

# Reward Program

## UC-REWARD-001 - Criar Sorteio

### Objetivo

Criar um novo sorteio associado a um recurso da comunidade.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar recurso.
2. Informar nome.
3. Informar descrição.
4. Informar quantidade de vencedores.
5. Criar sorteio com status OPEN.

### Resultado

Sorteio disponível para participação.

---

## UC-REWARD-002 - Atualizar Sorteio

### Objetivo

Alterar informações de um sorteio ainda não finalizado.

### Ator

* Admin
* Super Admin

### Fluxo

1. Localizar sorteio.
2. Atualizar informações permitidas.
3. Persistir alterações.

### Resultado

Sorteio atualizado.

---

## UC-REWARD-003 - Cancelar Sorteio

### Objetivo

Cancelar um sorteio.

### Ator

* Admin
* Super Admin

### Fluxo

1. Localizar sorteio.
2. Alterar status para CANCELLED.
3. Remover mecanismos de participação quando aplicável.

### Resultado

Sorteio cancelado.

---

## UC-REWARD-004 - Consultar Sorteio

### Objetivo

Recuperar informações de um sorteio.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Informar sorteio.
2. Recuperar dados.
3. Retornar resultado.

### Resultado

Informações disponíveis.

---

## UC-REWARD-005 - Listar Sorteios

### Objetivo

Listar sorteios associados a um recurso.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Informar recurso.
2. Recuperar sorteios.
3. Retornar resultado.

### Resultado

Lista disponível.

---

# Participação

## UC-REWARD-006 - Participar de Sorteio

### Objetivo

Registrar participação em um sorteio.

### Ator

* Usuário

### Fluxo

1. Usuário aciona botão de participação.
2. Localizar sorteio.
3. Verificar status.
4. Validar elegibilidade.
5. Verificar participação existente.
6. Registrar participação.

### Resultado

Participação registrada.

---

## UC-REWARD-007 - Verificar Elegibilidade para Sorteio

### Objetivo

Determinar se um usuário pode participar de um sorteio.

### Ator

* Aplicação

### Fluxo

1. Localizar sorteio.
2. Identificar recurso associado.
3. Verificar configuração requires_membership.
4. Caso não exija assinatura:

   * permitir participação.
5. Caso exija assinatura:

   * validar assinatura ativa.
6. Retornar resultado.

### Resultado

Elegibilidade determinada.

### Observações

Exemplos:

* Clubinho → requer assinatura.
* Grupo principal → não requer assinatura.

---

## UC-REWARD-008 - Verificar Participação Existente

### Objetivo

Determinar se um usuário já participa do sorteio.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Informar sorteio.
3. Verificar participação.
4. Retornar resultado.

### Resultado

Participação identificada.

---

## UC-REWARD-009 - Contabilizar Participantes

### Objetivo

Obter quantidade atual de participantes.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Informar sorteio.
2. Contar participantes.
3. Retornar resultado.

### Resultado

Quantidade disponível.

---

# Execução

## UC-REWARD-010 - Executar Sorteio

### Objetivo

Selecionar vencedores para um sorteio.

### Ator

* Super Admin

### Fluxo

1. Localizar sorteio.
2. Validar status OPEN.
3. Recuperar participantes.
4. Aplicar algoritmo de classificação.
5. Selecionar vencedores.
6. Registrar vencedores.
7. Alterar status para FINISHED.

### Resultado

Sorteio finalizado.

---

## UC-REWARD-011 - Registrar Vencedores

### Objetivo

Persistir resultado do sorteio.

### Ator

* Sistema

### Fluxo

1. Receber vencedores selecionados.
2. Definir posição.
3. Criar registros em tb_reward_winner.

### Resultado

Resultado persistido.

---

## UC-REWARD-012 - Consultar Vencedores

### Objetivo

Recuperar vencedores de um sorteio.

### Ator

* Aplicação
* Admin
* Super Admin

### Fluxo

1. Informar sorteio.
2. Recuperar vencedores.
3. Ordenar por posição.
4. Retornar resultado.

### Resultado

Lista disponível.

---

# Algoritmo

## UC-REWARD-013 - Classificar Participantes

### Objetivo

Gerar ordenação para seleção dos vencedores.

### Ator

* Sistema

### Fluxo

1. Recuperar participantes.
2. Recuperar histórico de vitórias.
3. Recuperar informações necessárias para classificação.
4. Aplicar regras definidas pela plataforma.
5. Retornar ranking.

### Resultado

Participantes classificados.

### Observações

As regras de classificação são definidas em:

reward_distribution.md

---

## UC-REWARD-014 - Obter Histórico de Vitórias

### Objetivo

Consultar vitórias anteriores de um usuário.

### Ator

* Aplicação

### Fluxo

1. Informar usuário.
2. Recuperar sorteios vencidos.
3. Retornar resultado.

### Resultado

Histórico disponível.

---

# Operações Administrativas

## UC-REWARD-015 - Obter Estatísticas do Sorteio

### Objetivo

Consultar métricas operacionais de um sorteio.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar sorteio.
2. Recuperar participantes.
3. Recuperar vencedores.
4. Consolidar informações.
5. Retornar resultado.

### Resultado

Estatísticas disponíveis.

---

## UC-REWARD-016 - Obter Histórico de Sorteios

### Objetivo

Consultar sorteios realizados em um recurso.

### Ator

* Admin
* Super Admin

### Fluxo

1. Informar recurso.
2. Recuperar sorteios.
3. Retornar resultado.

### Resultado

Histórico disponível.

---

# Regras de Negócio

1. Todo sorteio pertence a um recurso da comunidade.

2. Um usuário pode participar apenas uma vez por sorteio.

3. Sorteios exclusivos dependem da configuração requires_membership do recurso.

4. Apenas usuários elegíveis podem participar.

5. Apenas Super Admin pode executar sorteios.

6. Sorteios finalizados não aceitam novas participações.

7. Sorteios cancelados não aceitam novas participações.

8. O algoritmo de seleção pertence à aplicação.

9. O banco é responsável apenas pelo armazenamento de participantes e vencedores.

10. Um sorteio pode possuir múltiplos vencedores.

11. A posição determina a classificação final dos vencedores.
