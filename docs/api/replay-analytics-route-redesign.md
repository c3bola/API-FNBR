# Replay e Analytics

Este documento descreve as rotas e os limites de dados definidos em
`source/openapi/v1/openapi/index.yaml`. O OpenAPI é a fonte dos nomes, tipos,
parâmetros e respostas; o dicionário do parser é a fonte dos campos de entrada.

## Replay

### Arquivos e ingestão

* `GET /replay-files` lista hashes e estado de processamento, sem devolver os
  bytes do replay.
* `GET /replay-files/{sha256}` consulta o registro do arquivo pelo SHA-256
  hexadecimal em minúsculas.
* `GET /replay-files/{sha256}/processing-attempts` lista tentativas.
* `POST /replay-files/{sha256}/processing-attempts` recebe o snapshot do parser.
  O corpo exige `application_id`, `idempotency_key`, `analyzer_version` e
  `data`; o identificador da aplicação não é um ID de partida.

A mesma chave de idempotência e o mesmo digest retornam a tentativa existente;
um corpo diferente com a mesma chave resulta em conflito. Uma reanálise
intencional usa uma chave nova. O contrato distingue criação, repetição,
processamento em andamento e falha registrada.

### Partidas, participantes e observações

* `GET /matches`, `GET /matches/{match_id}` e
  `GET /matches/{match_id}/stats` consultam partidas e estatísticas do evento
  Stats. As últimas não são atribuídas a participantes.
* `GET /matches/{match_id}/players`, `GET
  /matches/{match_id}/players/{match_player_id}`,
  `GET /matches/{match_id}/players/{match_player_id}/stats` e
  `GET /matches/{match_id}/teams` retornam participantes, estatísticas
  individuais e agrupamentos de equipe limitados à partida.
* `GET /players`, `GET /players/{player_id}`,
  `GET /players/{player_id}/matches` e `GET /players/{player_id}/stats`
  consultam identidades globais explicitamente associadas a IDs de origem e
  seus registros por partida. Participantes anônimos continuam consultáveis
  no escopo da partida, mas não viram identidades globais.
* `GET /matches/{match_id}/event-eliminations` e
  `GET /matches/{match_id}/kill-feed` preservam as duas fontes de eliminação
  separadamente.
* As observações de mapa ficam em
  `GET /matches/{match_id}/map`,
  `GET /matches/{match_id}/map/poi-tags` e
  `GET /matches/{match_id}/map/safe-zones`. Tags não são nomes de POIs nem
  visitas de jogadores.
* `GET /matches/{match_id}/game-state-observations` lista estados observados.
  `GET /matches/{match_id}/players/{match_player_id}/movement` pagina amostras
  Full em intervalos limitados por cursor e tempo.
* Outras observações por partida: `GET /matches/{match_id}/vehicle-observations`,
  `/weapons`, `/equipped-items`, `/container-interactions`, `/dropped-items`,
  `/treasure-events`, `/prize-handler-grants` e `/processing-attempts`.
  Cada rota mantém o escopo da partida; snapshots de movimento com veículo não
  são sessões ou eventos de entrada/saída.

## Analytics

* `GET /analytics/overview` devolve métricas suportadas e a disponibilidade
  explícita de métricas não calculáveis.
* `GET /analytics/rankings` classifica identidades globais por uma métrica
  suportada.
* `GET /analytics/activity` lista observações recentes pela hora de recebimento
  do snapshot, não por um horário de evento inventado.
* `GET /analytics/players/{player_id}/summary`,
  `GET /analytics/players/{player_id}/history` e
  `GET /analytics/players/compare` cobrem agregados, histórico por partida e
  comparação sob filtros iguais.
* `GET /analytics/containers/summary`,
  `GET /analytics/treasures/summary`,
  `GET /analytics/prize-handler-grants/summary`,
  `GET /analytics/vehicles/observations` e
  `GET /analytics/safe-zones/summary` agregam somente as observações
  relacionais disponíveis.

Os filtros usam valores recebidos como `playlist` e `map_info`; datas usam
`from` inclusivo e `to` exclusivo. Não há filtro por temporada nem código
normalizado de mapa. `parse_mode` indica a cobertura do snapshot e aceita
`EventsOnly`, `Minimal`, `Normal` ou `Full`.

## Convenções e limites

As rotas herdam `bearerAuth`. Identificadores internos são inteiros `int64`;
campos de resposta usam `snake_case`. O objeto `data` da ingestão mantém os
nomes do snapshot do parser conforme o dicionário. Listas usam `page`
(1-based), `page_size` (padrão 25, máximo 100) e `pagination`; a movimentação
usa cursor e limite de lote próprios. Respostas comuns usam
`{ "success": true, "data": ... }` e coleções paginadas acrescentam
`pagination`.

`gameSessionId` identifica a partida canônica quando presente; sem ele, o
contrato usa o hash do arquivo como identidade conservadora, sem presumir que
arquivos diferentes representam a mesma partida. O hash do arquivo,
`application_id` e ID interno da partida são conceitos distintos.

O contrato não transforma interações em aberturas confirmadas de baús, eventos
de tesouro em todos os tesouros coletados, nem concessões em tokens. Também
não infere POIs nomeados, visitas a POIs, inventário, trajetórias contínuas ou
eventos de embarque/desembarque. O ID de elemento de concessão é mencionado
pelo dicionário, mas sem tipo serializado documentado; por isso não é aceito
nem persistido. Campos de cosméticos e objetos de mapa sem tipos documentados
permanecem parcialmente cobertos, sem propriedades genéricas ou JSONB.

Essas limitações e o mapeamento campo a campo estão detalhados em
[`replay-data-mapping.md`](../database/replay-data-mapping.md) e
[`fortnite-replay-schema.md`](../database/fortnite-replay-schema.md).
