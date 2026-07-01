# Plataforma FNBR - Domínio do Negócio

## Objetivo

A plataforma FNBR é composta por múltiplos bots Telegram, serviços web e um banco de dados compartilhado.

O objetivo é centralizar funcionalidades relacionadas à comunidade FNBR.

---

## Conceitos

### Usuário

Usuário é qualquer membro identificado da comunidade.

Um usuário é representado por seu Telegram ID e pode participar de múltiplos grupos, canais e bots da plataforma.

---

### Comunidade

Comunidade representa o conjunto de:

* grupos Telegram
* canais Telegram
* bots Telegram

que pertencem ao ecossistema FNBR.

---

### Bot

Bot é uma aplicação independente da plataforma.

Cada bot possui uma responsabilidade específica.

Bots conhecidos:

* guardaOiBot
* sorteioFnbr
* fortMe
* fortCards
* encaminhadorFnbr

---

### Perfil

Perfil representa o papel do usuário dentro da plataforma.

Exemplos:

* usuário comum
* administrador de um bot específico
* administrador global

Perfis não representam sistemas.

Perfis não representam assinaturas.

---

### Assinatura

Assinatura representa o acesso a funcionalidades premium da plataforma.

Atualmente a principal assinatura é o Clubinho.

---

### Clubinho

Clubinho é o programa de assinatura da comunidade.

Benefícios incluem:

* participação em grupo exclusivo
* participação em sorteios exclusivos
* tag personalizada
* benefícios de divulgação
* permissões adicionais definidas pelo plano

---

### Parceiros

O programa de parceiros foi descontinuado.

Benefícios anteriormente atribuídos a parceiros estão sendo migrados para os planos do Clubinho.

---

### Conhecimento de Usuário

Um usuário passa a ser conhecido pela plataforma quando algum bot obtém seu Telegram ID através de interação válida.

Atualmente isso ocorre principalmente através de:

* participação em grupos monitorados pelos bots;
* envio de mensagens em grupos onde os bots possuem acesso;
* utilização de comandos dos bots;
* interação direta com um bot.

Observações:

* Um usuário conhecido pela plataforma não necessariamente pode receber mensagens privadas de todos os bots.
* A capacidade de um bot enviar mensagens privadas depende das regras e permissões da API do Telegram para aquele bot específico.
* Atualmente a plataforma FNBR não utiliza sistema de solicitação de entrada (Join Requests) como parte do seu fluxo principal.

