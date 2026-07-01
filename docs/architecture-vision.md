# Visão de Arquitetura

## Estado Atual

Cada bot possui seu próprio repositório.

Alguns bots acessam diretamente o banco MySQL.

---

## Estado Desejado

Os sistemas não acessarão diretamente o banco.

Arquitetura alvo:

Bots
↓
API Central FNBR
↓
Banco de Dados

---

## Consumidores da API

* guardaOiBot
* sorteioFnbr
* fortMe
* fortCards
* encaminhadorFnbr
* painel web

---

## Responsabilidades da API

* usuários
* comunidades
* assinaturas
* Clubinho
* permissões
* sorteios
* moderação
* integrações futuras

---

## Responsabilidades dos Bots

Os bots serão responsáveis apenas por:

* interação Telegram
* comandos
* mensagens
* menus
* callbacks

Toda regra de negócio compartilhada deverá ser centralizada na API.
