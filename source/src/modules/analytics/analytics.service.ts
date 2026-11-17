import { AnalyticsHome, AnalyticsRepository } from './analytics.repository';

export class AnalyticsValidationError extends Error {}

export class AnalyticsService {
  constructor(private readonly repository = new AnalyticsRepository()) {}

  async getHome(limit: unknown): Promise<AnalyticsHome> {
    return this.repository.getHome(parseLimit(limit, 10));
  }

  async getOverview(): Promise<AnalyticsHome['indicators']> {
    return (await this.repository.getHome(0)).indicators;
  }

  async getRankings(category: unknown, limit: unknown): Promise<AnalyticsHome['ranking']['items']> {
    if (category !== 'chests' && category !== 'tokens' && category !== 'treasures') {
      throw new AnalyticsValidationError('category must be chests, tokens, or treasures.');
    }
    if (category !== 'chests') return [];
    return (await this.repository.getHome(parseLimit(limit, 5))).ranking.items;
  }

  async getActivity(limit: unknown): Promise<AnalyticsHome['recent_activity']> {
    return (await this.repository.getHome(parseLimit(limit, 5))).recent_activity;
  }

  async getScreenHome(limit: unknown) {
    const parsedLimit = parsePositiveInteger(limit, 5, 'limit', 100);
    const [totals, players, home] = await Promise.all([
      this.repository.getScreenTotals(),
      this.repository.getScreenPlayers(undefined, 'container_interactions_observed', 1, parsedLimit),
      this.repository.getHome(parsedLimit),
    ]);
    return { totals, observed_interaction_ranking: players.items, recent_activity: home.recent_activity };
  }

  async getScreenStatistics() {
    const [totals, playlists] = await Promise.all([
      this.repository.getScreenTotals(),
      this.repository.getPlaylistCounts(),
    ]);
    return { totals, matches_by_playlist: playlists };
  }

  async getScreenPlayers(search: unknown, sort: unknown, page: unknown, pageSize: unknown) {
    if (search !== undefined && (typeof search !== 'string' || search.length > 200)) {
      throw new AnalyticsValidationError('search must be a string of at most 200 characters.');
    }
    const parsedSort = sort === undefined ? 'matches_played' : sort;
    if (parsedSort !== 'matches_played' && parsedSort !== 'container_interactions_observed'
        && parsedSort !== 'treasure_events_observed') {
      throw new AnalyticsValidationError('sort must be matches_played, container_interactions_observed, or treasure_events_observed.');
    }
    const parsedPage = parsePositiveInteger(page, 1, 'page', 1000000);
    const parsedPageSize = parsePositiveInteger(pageSize, 25, 'page_size', 100);
    const [totals, players] = await Promise.all([
      this.repository.getScreenTotals(),
      this.repository.getScreenPlayers(search, parsedSort, parsedPage, parsedPageSize),
    ]);
    return { totals, ...players };
  }
}

function parsePositiveInteger(value: unknown, fallback: number, field: string, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) {
    throw new AnalyticsValidationError(`${field} must be an integer from 1 to ${maximum}.`);
  }
  return Number(value);
}

function parseLimit(value: unknown, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (
    typeof value !== 'string'
    || !/^\d+$/.test(value)
    || !Number.isSafeInteger(Number(value))
    || Number(value) < 1
  ) {
    throw new AnalyticsValidationError('limit must be a positive safe integer.');
  }
  return Math.min(Number(value), 100);
}
