# Domínios da Plataforma FNBR

## Objetivo

Este documento define os domínios de negócio da plataforma FNBR.

Um domínio representa uma área funcional da plataforma.

Os domínios não representam bots específicos.

Bots são implementações que consomem ou operam funcionalidades pertencentes a um ou mais domínios.

---

# Identidade

Responsável por:

* usuários da plataforma
* perfis
* permissões
* papéis administrativos
* relacionamento entre usuários e a comunidade

Conceitos relacionados:

* usuário
* perfil
* administrador
* administrador global

Consumidores:

* todos os sistemas da plataforma

Observações:

A identidade do usuário deve ser única dentro da plataforma FNBR.

---

# Comunidade

Responsável por:

* grupos Telegram
* canais Telegram
* organização da comunidade
* relacionamento entre recursos da comunidade
* estrutura da plataforma

Conceitos relacionados:

* comunidade
* grupo
* canal

Consumidores:

* todos os sistemas da plataforma

Observações:

Uma comunidade representa o conjunto de grupos, canais e bots pertencentes ao ecossistema FNBR.

---

# Moderação

Responsável por:

* advertências
* banimentos
* silenciamentos
* automações administrativas
* proteção contra spam
* aplicação das regras da comunidade

Sistema principal:

* guardaOiBot

Consumidores futuros:

* API Central FNBR
* Painel Web

---

# Clubinho

Responsável por:

* planos
* assinaturas
* pagamentos
* benefícios
* permissões premium
* acesso a recursos exclusivos

Conceitos relacionados:

* plano
* assinatura
* pagamento
* benefício
* membro do clubinho

Benefícios atuais:

* grupo exclusivo
* sorteios exclusivos
* tag personalizada
* divulgação de conteúdo
* permissões especiais conforme plano

Benefícios futuros:

* cards exclusivos
* integrações com outros domínios
* novos recursos premium

Sistema principal:

* sorteioFnbr

Consumidores futuros:

* guardaOiBot
* fortCards
* API Central FNBR
* Painel Web

Observações:

O programa de parceiros foi descontinuado.

Os benefícios anteriormente associados aos parceiros passam a ser disponibilizados através dos planos do Clubinho.

---

# Sorteios

Responsável por:

* criação de sorteios
* inscrições
* validações
* seleção de vencedores
* histórico de sorteios

Sistema principal:

* sorteioFnbr

Consumidores futuros:

* API Central FNBR
* Painel Web

Observações:

Sorteios podem ser públicos ou exclusivos para membros do Clubinho.

---

# Gamificação

Responsável por:

* rankings
* votações
* participação da comunidade
* comandos sociais
* brincadeiras da comunidade
* sistemas de interação

Conceitos relacionados:

* ranking
* votação
* pontuação
* participação

Exemplos:

* /fortme
* /fortgirl
* /jonesyme
* /tryhardme

Sistema principal:

* fortMe

Consumidores futuros:

* API Central FNBR
* Painel Web

Funcionalidades futuras:

* conquistas
* recompensas
* missões
* estatísticas de participação

Observações:

Este domínio tem como objetivo aumentar a participação e interação dos membros da comunidade.

---

# Jogadores

Responsável por:

* registro de nick do Fortnite
* perfil de jogador
* preferências de jogo
* disponibilidade
* relacionamento entre jogadores

Sistema principal:

* battleBusBot

Consumidores futuros:

* API Central FNBR
* Painel Web

Funcionalidades futuras:

* procura de jogadores
* formação de squads
* matchmaking
* notificações para jogadores compatíveis

Observações:

Este domínio representa os jogadores da comunidade e não substitui a identidade global dos usuários da plataforma.

---

# Notícias

Responsável por:

* distribuição de notícias
* categorização de conteúdo
* encaminhamento entre canais e grupos
* automações de publicação

Sistema principal:

* encaminhadorFnbr

Consumidores futuros:

* API Central FNBR
* Painel Web

Status:

Atualmente não operacional.

---

# Plataforma

Responsável por:

* integração entre domínios
* notificações
* auditoria
* configurações globais
* serviços compartilhados

Consumidores:

* todos os sistemas da plataforma

Observações:

Este domínio existe para suportar funcionalidades transversais que não pertencem exclusivamente a um único domínio de negócio.
