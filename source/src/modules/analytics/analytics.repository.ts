import { pool } from '../../infra/database/postgres.config';

export type HomeAvailability = 'available' | 'unavailable';
export type HomeEventType = 'container_interaction' | 'treasure_event' | 'prize_handler_grant';

export interface AnalyticsHomeMetric {
  value: number | null;
  availability: HomeAvailability;
  metric: string;
  description: string;
  reason?: string | null;
}

export interface AnalyticsHomeRankingItem {
  position: number;
  player_id: number;
  display_name: string | null;
  value: number;
}

export interface AnalyticsHomeActivity {
  id: string;
  event_type: HomeEventType;
  player_id: number | null;
  player_name: string | null;
  match_id: number;
  observed_value: string | null;
  received_at: string;
  event_time_seconds: number | null;
  description: string;
}

export interface AnalyticsHome {
  indicators: {
    chests: AnalyticsHomeMetric;
    players: AnalyticsHomeMetric;
    treasures: AnalyticsHomeMetric;
    tokens: AnalyticsHomeMetric;
  };
  ranking: {
    availability: HomeAvailability;
    metric: 'container_interactions';
    description: string;
    items: AnalyticsHomeRankingItem[];
  };
  hall_of_fame: {
    availability: 'unavailable';
    metric: 'token_holders';
    description: string;
    reason: string;
    items: [];
  };
  recent_activity: AnalyticsHomeActivity[];
}

interface HomeCounts {
  players: string;
  treasure_events: string;
}

interface RankingRow {
  player_id: string;
  display_name: string | null;
  value: string;
}

interface ActivityRow {
  id: string;
  event_type: HomeEventType;
  player_id: string | null;
  player_name: string | null;
  match_id: string;
  observed_value: string | null;
  received_at: Date | string;
  event_time_seconds: number | null;
  description: string;
}

export interface ScreenTotals {
  identified_players: number;
  matches_recorded: number;
  container_interactions_observed: number;
  treasure_events_observed: number;
}

export interface ScreenPlayer {
  position: number;
  player_id: number;
  display_name: string | null;
  matches_played: number;
  container_interactions_observed: number;
  treasure_events_observed: number;
}

export type ScreenPlayerSort = 'matches_played' | 'container_interactions_observed' | 'treasure_events_observed';

const CHEST_UNAVAILABLE_REASON =
  'Recorded container interactions do not prove that a chest was opened.';
const TOKEN_UNAVAILABLE_REASON =
  'The parser records prize IDs and prize-handler grants without a documented token classification.';

export class AnalyticsRepository {
  async getScreenTotals(): Promise<ScreenTotals> {
    const result = await pool.query<{
      identified_players: string;
      matches_recorded: string;
      container_interactions_observed: string;
      treasure_events_observed: string;
    }>(`SELECT
      (SELECT COUNT(*) FROM fortnite_replay.player_identity AS player
       WHERE EXISTS (SELECT 1 FROM fortnite_replay.match_player AS participant
                     WHERE participant.player_identity_id = player.id AND participant.is_bot = false))::text AS identified_players,
      (SELECT COUNT(*) FROM fortnite_replay.game_match)::text AS matches_recorded,
      (SELECT COUNT(*) FROM fortnite_replay.container_interaction)::text AS container_interactions_observed,
      (SELECT COUNT(*) FROM fortnite_replay.treasure_event)::text AS treasure_events_observed`);
    const row = result.rows[0];
    if (!row) throw new Error('Analytics screen totals were not returned.');
    return {
      identified_players: safeCount(row.identified_players, 'identified player count'),
      matches_recorded: safeCount(row.matches_recorded, 'match count'),
      container_interactions_observed: safeCount(row.container_interactions_observed, 'interaction count'),
      treasure_events_observed: safeCount(row.treasure_events_observed, 'treasure event count'),
    };
  }

  async getScreenPlayers(
    search: string | undefined,
    sort: ScreenPlayerSort,
    page: number,
    pageSize: number,
  ): Promise<{ items: ScreenPlayer[]; total: number; page: number; page_size: number }> {
    const pattern = search === undefined ? null : `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = `EXISTS (SELECT 1 FROM fortnite_replay.match_player AS participant
                           WHERE participant.player_identity_id = player.id AND participant.is_bot = false)
      AND ($1::text IS NULL OR player.latest_player_name ILIKE $1 ESCAPE '\\'
           OR player.epic_id ILIKE $1 ESCAPE '\\' OR player.platform_unique_net_id ILIKE $1 ESCAPE '\\')`;
    const counts = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM fortnite_replay.player_identity AS player WHERE ${where}`,
      [pattern],
    );
    const total = safeCount(counts.rows[0].total, 'player count');
    const result = await pool.query<{
      player_id: string;
      display_name: string | null;
      matches_played: string;
      container_interactions_observed: string;
      treasure_events_observed: string;
    }>(`SELECT * FROM (SELECT player.id::text AS player_id, player.latest_player_name AS display_name,
      (SELECT COUNT(DISTINCT participant.match_id) FROM fortnite_replay.match_player AS participant
       WHERE participant.player_identity_id = player.id)::text AS matches_played,
      (SELECT COUNT(*) FROM fortnite_replay.container_interaction AS interaction
       JOIN fortnite_replay.match_player AS participant
         ON participant.match_id = interaction.match_id
        AND participant.replay_player_id = interaction.searching_player_replay_id
       WHERE participant.player_identity_id = player.id)::text AS container_interactions_observed,
      (SELECT COUNT(*) FROM fortnite_replay.treasure_event AS event
       JOIN fortnite_replay.match_player AS participant
         ON participant.match_id = event.match_id
        AND participant.replay_player_id = event.player_replay_id
       WHERE participant.player_identity_id = player.id)::text AS treasure_events_observed
      FROM fortnite_replay.player_identity AS player WHERE ${where}) AS player_stats
      ORDER BY ${sort}::bigint DESC, player_id::bigint ASC LIMIT $2 OFFSET $3`,
    [pattern, pageSize, (page - 1) * pageSize]);
    return {
      items: result.rows.map((row, index) => ({
        position: (page - 1) * pageSize + index + 1,
        player_id: safeCount(row.player_id, 'player id'),
        display_name: row.display_name,
        matches_played: safeCount(row.matches_played, 'match count'),
        container_interactions_observed: safeCount(row.container_interactions_observed, 'interaction count'),
        treasure_events_observed: safeCount(row.treasure_events_observed, 'treasure event count'),
      })),
      total, page, page_size: pageSize,
    };
  }

  async getPlaylistCounts(): Promise<Array<{ playlist: string | null; matches_recorded: number }>> {
    const result = await pool.query<{ playlist: string | null; matches_recorded: string }>(
      `SELECT current_playlist AS playlist, COUNT(*)::text AS matches_recorded
       FROM fortnite_replay.game_match GROUP BY current_playlist
       ORDER BY COUNT(*) DESC, current_playlist ASC NULLS LAST`,
    );
    return result.rows.map((row) => ({
      playlist: row.playlist,
      matches_recorded: safeCount(row.matches_recorded, 'playlist match count'),
    }));
  }

  async getHome(limit: number): Promise<AnalyticsHome> {
    const [counts, ranking, activity] = await Promise.all([
      pool.query<HomeCounts>(
        `SELECT
           (SELECT COUNT(DISTINCT player.id)
            FROM fortnite_replay.player_identity AS player
            WHERE player.bot_id IS NULL
              AND (player.epic_id IS NOT NULL OR player.platform_unique_net_id IS NOT NULL)
           )::text AS players,
           (SELECT COUNT(*) FROM fortnite_replay.treasure_event)::text AS treasure_events`,
      ),
      pool.query<RankingRow>(
        `SELECT player.id::text AS player_id,
                MAX(COALESCE(player.latest_player_name, participant.player_name)) AS display_name,
                COUNT(*)::text AS value
         FROM fortnite_replay.container_interaction AS interaction
         JOIN fortnite_replay.match_player AS participant
           ON participant.match_id = interaction.match_id
          AND participant.replay_player_id = interaction.searching_player_replay_id
         JOIN fortnite_replay.player_identity AS player
           ON player.id = participant.player_identity_id
         WHERE player.bot_id IS NULL
           AND (player.epic_id IS NOT NULL OR player.platform_unique_net_id IS NOT NULL)
         GROUP BY player.id
         ORDER BY COUNT(*) DESC, player.id ASC
         LIMIT $1`,
        [limit],
      ),
      pool.query<ActivityRow>(
        `SELECT event.id, event.event_type, event.player_id, event.player_name,
                event.match_id, event.observed_value, event.received_at,
                event.event_time_seconds, event.description
         FROM (
           SELECT 'container_interaction:' || interaction.id::text AS id,
                  'container_interaction'::text AS event_type,
                  identity.id AS player_id,
                  COALESCE(identity.latest_player_name, participant.player_name) AS player_name,
                  interaction.match_id,
                  interaction.container_label AS observed_value,
                  attempt.received_at,
                  interaction.time_seconds AS event_time_seconds,
                  CASE
                    WHEN interaction.interaction_kind = 'loot_cannon'
                      THEN 'Container interaction observed for a loot cannon.'
                    ELSE 'Container interaction observed; this does not confirm a chest opening.'
                  END AS description
           FROM fortnite_replay.container_interaction AS interaction
           JOIN fortnite_replay.processing_attempt AS attempt
             ON attempt.id = interaction.processing_attempt_id
           LEFT JOIN fortnite_replay.match_player AS participant
             ON participant.match_id = interaction.match_id
            AND participant.replay_player_id = interaction.searching_player_replay_id
           LEFT JOIN fortnite_replay.player_identity AS identity
             ON identity.id = participant.player_identity_id
           UNION ALL
           SELECT 'treasure_event:' || event.id::text,
                  'treasure_event'::text,
                  identity.id,
                  COALESCE(identity.latest_player_name, participant.player_name),
                  event.match_id,
                  event.prize_id,
                  attempt.received_at,
                  event.time_seconds,
                  'Treasure event observed; reward classification is unavailable.'
           FROM fortnite_replay.treasure_event AS event
           JOIN fortnite_replay.processing_attempt AS attempt
             ON attempt.id = event.processing_attempt_id
           LEFT JOIN fortnite_replay.match_player AS participant
             ON participant.match_id = event.match_id
            AND participant.replay_player_id = event.player_replay_id
           LEFT JOIN fortnite_replay.player_identity AS identity
             ON identity.id = participant.player_identity_id
           UNION ALL
           SELECT 'prize_handler_grant:' || event.id::text,
                  'prize_handler_grant'::text,
                  identity.id,
                  COALESCE(identity.latest_player_name, participant.player_name),
                  event.match_id,
                  event.handler,
                  attempt.received_at,
                  event.time_seconds,
                  'Prize-handler grant observed; this does not confirm a token.'
           FROM fortnite_replay.prize_handler_grant AS event
           JOIN fortnite_replay.processing_attempt AS attempt
             ON attempt.id = event.processing_attempt_id
           LEFT JOIN fortnite_replay.match_player AS participant
             ON participant.match_id = event.match_id
            AND participant.replay_player_id = event.player_replay_id
           LEFT JOIN fortnite_replay.player_identity AS identity
             ON identity.id = participant.player_identity_id
         ) AS event
         ORDER BY event.received_at DESC, event.id DESC
         LIMIT $1`,
        [limit],
      ),
    ]);

    const countsRow = counts.rows[0];
    if (!countsRow) throw new Error('Analytics home counts were not returned.');
    const rankingItems = ranking.rows.map((row, index) => ({
      position: index + 1,
      player_id: safeCount(row.player_id, 'player id'),
      display_name: row.display_name,
      value: safeCount(row.value, 'container interaction count'),
    }));

    return {
      indicators: {
        chests: {
          value: null,
          availability: 'unavailable',
          metric: 'confirmed_chest_opens',
          description: 'Confirmed number of opened chests.',
          reason: CHEST_UNAVAILABLE_REASON,
        },
        players: {
          value: safeCount(countsRow.players, 'identified player count'),
          availability: 'available',
          metric: 'identified_players',
          description: 'Distinct non-bot player identities with an Epic ID or platform network ID.',
        },
        treasures: {
          value: safeCount(countsRow.treasure_events, 'treasure event count'),
          availability: 'available',
          metric: 'treasure_events_observed',
          description: 'Recorded treasure event rows; not a count of tokens.',
        },
        tokens: {
          value: null,
          availability: 'unavailable',
          metric: 'tokens_found',
          description: 'Number of classified tokens found.',
          reason: TOKEN_UNAVAILABLE_REASON,
        },
      },
      ranking: {
        availability: 'available',
        metric: 'container_interactions',
        description: 'Observed container interactions by identified non-bot player; not confirmed chest openings.',
        items: rankingItems,
      },
      hall_of_fame: {
        availability: 'unavailable',
        metric: 'token_holders',
        description: 'Players with confirmed token discoveries.',
        reason: TOKEN_UNAVAILABLE_REASON,
        items: [],
      },
      recent_activity: activity.rows.map((row) => ({
        id: row.id,
        event_type: row.event_type,
        player_id: row.player_id === null ? null : safeCount(row.player_id, 'player id'),
        player_name: row.player_name,
        match_id: safeCount(row.match_id, 'match id'),
        observed_value: row.observed_value,
        received_at: timestamp(row.received_at),
        event_time_seconds: row.event_time_seconds,
        description: row.description,
      })),
    };
  }
}

function safeCount(value: string, label: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`${label} is outside the safe integer range.`);
  }
  return count;
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid analytics activity timestamp.');
  return date.toISOString();
}
