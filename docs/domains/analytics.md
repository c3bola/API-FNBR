# Analytics

Analytics aggregates normalized observations in the `fortnite_replay` schema.
The OpenAPI contract intentionally reports observed counts and does not
reconstruct unsupported parser data.

## Reference screen data

The five screen endpoints expose only metrics that can be derived from the
snapshot and the existing normalized tables. A count of observed events is not
a count of confirmed chest openings or classified rewards. Players here are
identities linked to at least one match participant explicitly marked
`isBot: false`; unresolved participants and participants of unknown bot status
are excluded.

| Reference image | Screen endpoint | Available data | Not supplied |
|---|---|---|---|
| `reference-home.webp` | `/analytics/screens/home` | Observed totals, interaction ranking, imported activity and its receipt time | Confirmed chest opens, token leaderboard and event wall-clock time |
| `reference-estatisticas.webp` | `/analytics/screens/statistics` | Observed totals and match counts by reported playlist | Season comparisons, chest/token/treasure distribution, records and growth |
| `reference-ranking.webp` | `/analytics/screens/ranking` | Identified players, observed match/interaction/treasure-event counts, ordering and pagination | Chest-open and token rankings, season and avatar |
| `reference-players.webp` | `/analytics/screens/players` | The same player observations, name/ID search and pagination | Membership date, avatar, activity-status classifications and season |
| `reference-pesquisa.webp` | `/analytics/screens/search` | Required name/ID search, observed player counts and pagination | Membership date, avatar, chest and token counts |

The screen APIs omit unavailable information rather than substituting a
different metric. Artwork and navigation are static frontend content. A
playlist name is not a verified game-mode category. Statistics and rankings
reflect imported observations, not the complete community. Ingestion requires
the snapshot schema upgrade to be applied before these endpoints can use a
newly imported capture.

| Visual field or control | Snapshot evidence and destination |
|---|---|
| Players | `players[].isBot`, source IDs and `playerName`; `match_player` and `player_identity`. Only explicitly non-bot, linked identities are counted. |
| Match count | `match.gameData.gameSessionId` and replay file identity; `game_match` and `match_player`. Player match counts are distinct match IDs. |
| Container interactions | `observations.containerInteractions[]`, including `searchingPlayerId`; `container_interaction` linked through `match_player`. This does not establish an opened chest. |
| Treasure observations | `observations.treasureEvents[]`; `treasure_event`. The supplied capture contains an empty array, not proof of a global total. |
| Recent activity | Interaction, treasure and grant observations; `processing_attempt.received_at` is ingestion time. `timeSeconds` is a match-relative clock. |
| Playlist chart | `match.gameData.currentPlaylist`; `game_match.current_playlist`. Counts are matches, not opened chests. |
| Player search | `players[].playerName`, `epicId` and `platformUniqueNetId`; `player_identity`. Search is a literal case-insensitive substring. |
| Rank and pagination | Computed from supported observed counts. Rank is relative to the selected search and ordering. |
| Chest opens, tokens, season, membership date, avatars, status labels | No reliable corresponding value or classification in the supplied capture; omitted. |
| Period comparison, growth, records and item distribution | Require unavailable classifications and/or a defined time series; omitted. |
| Hero art, footer, logos and navigation | Presentation content, not snapshot data. |

## Homepage reference mapping

| Visual section | Required data | Contract | Availability and presentation |
|---|---|---|---|
| Header links: ranking, statistics, players | Navigation only | `/analytics/rankings`, `/analytics/overview`, `/analytics/players/{player_id}/summary` | Static navigation; no metric is implied. |
| Hero art, One Piece/season label, CTA | Editorial/artwork content | None in Replay Analytics | Static CMS/frontend content. The parser dictionary has no season or banner-content field. |
| Ranking, statistics, and players quick links | Navigation only | `/analytics/rankings`, `/analytics/overview`, player routes | Links, not new counters. |
| “Baús abertos” KPI | Confirmed chest-open event | No exact metric currently | Show `container_interactions_observed` only with that label. Container labels/state do not prove a chest opened. |
| “Jogadores” KPI | Unique players | `GET /analytics/overview` | `identified_players` counts globally linked identities only; anonymous/unresolved participants are not included. |
| “Tesouros encontrados” KPI | Confirmed treasure count | `GET /analytics/overview` | `treasure_events_observed` counts emitted treasure events, not every treasure collected. Use an “observed” label. |
| “Tokens encontrados” KPI | Token grants | No exact metric currently | `prize_handler_grants_observed` can be shown as raw grants. Token classification is unavailable; do not display it as a token count. |
| “Ranking de Baús” | Opens attributable to players | `/analytics/rankings?metric=container_interactions` | Can rank linked players by observed container interactions only. It is not a chest-open ranking. |
| “Hall da Fama” token leaders | Token-classified grant counts | No exact metric currently | No token leaderboard. A raw prize-handler grant ranking must be separately labeled and must not be presented as token holders. |
| “Atividade Recente” | Recent activity feed | `GET /analytics/activity` | Shows recent imported container/treasure/grant observations ordered by snapshot receipt time. Event time is match-relative; no “minutes ago” wall-clock claim. |
| Footer, community links, navigation | Static content | None in Replay Analytics | No parser source. |
| Geographic/map visualization | No such element in the supplied reference | No route | Not applicable. |

`GET /analytics/overview` returns available measures plus explicit unavailable
entries for confirmed chest openings, tokens, and chest reward counts. A UI
may omit unavailable cards or display the reason; it must not substitute a
nearby count without changing the label.

## Routes

* `GET /analytics/overview` — filterable overview counts and availability.
* `GET /analytics/rankings` — rankings for matches played, observed wins,
  participant kills/team kills, average observed placement, container
  interactions, treasure events, and raw prize-handler grants.
* `GET /analytics/activity` — paginated imported observations.
* `GET /analytics/players/{player_id}/summary` — multi-match participant
  aggregates for a globally identified player.
* `GET /analytics/players/{player_id}/history` — per-match history.
* `GET /analytics/players/compare` — 2–5 players using identical filters.
* `GET /analytics/containers/summary` — interactions by observed container
  label.
* `GET /analytics/treasures/summary` — emitted events by original prize ID.
* `GET /analytics/prize-handler-grants/summary` — raw grants by handler;
  element IDs are omitted because their serialized type is undocumented.
* `GET /analytics/vehicles/observations` — movement sample counts grouped by
  observed vehicle path; not sessions or distance traveled.
* `GET /analytics/safe-zones/summary` — observed safe-zone radius counts.

Filters use only available match values: inclusive `from`, exclusive `to`,
`playlist` (the received `currentPlaylist`), `map_info`, and, where relevant,
`parse_mode`. The dictionary does not supply a season code, normalized map
code, named POI catalog, or complete POI visit intervals, so those filters and
POI popularity routes are not defined.

## Metric definitions

| Metric | Definition |
|---|---|
| `matches_recorded` | Count of canonical match rows in the selected match-start/playlist/map filters. |
| `identified_players` | Distinct `player_identity` rows linked by explicit source IDs among the filtered matches; does not include anonymous participants. |
| `container_interactions_observed` | Count of persisted `container_interaction` observations; not necessarily an open, chest, or unique container count. |
| `treasure_events_observed` | Count of `treasure_event` rows; each is a parser-emitted treasure event. |
| `prize_handler_grants_observed` | Count of `prize_handler_grant` rows; no token interpretation. |
| `matches_played` | Count of match-participant rows for the identified player. |
| `wins` | Count of those rows with observed `placement = 1`. |
| `kills` / `team_kills` | Sum of the corresponding observed `match_player` values; null source values are excluded, not treated as zero. |
| `average_placement` | Arithmetic mean of observed placements only. |
| `vehicle observations` | Count of `movement_sample` rows with a vehicle actor/path value; not unique trips, boarding events, or travel distance. |
| `safe-zone summary` | Count of matches with an observed safe-zone row at an array index and average known radius. |

Null metrics are returned as null if their denominator/source values are
unavailable. The match Stats event is not attributed to an individual player.
Elimination-event rows and replicated kill-feed rows remain separate and do not
replace participant `kills`.

## Data limits

The dictionary supplies no reliable initial player/bot counts, full inventory,
player-attributed chest-open event, token identifier catalog, complete
geographic POI visit model, continuous movement, or actual vehicle entry/exit
events. It also does not provide season codes. Such metrics are omitted or
reported as unavailable; they are not inferred from names, coordinates,
absence of flags, or event proximity.
