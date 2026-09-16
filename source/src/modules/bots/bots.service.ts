import { botsRepository } from './bots.repository';

export class BotsService {
  public async getModerationBots() {
    return await botsRepository.getModerationBots();
  }
}

export const botsService = new BotsService();