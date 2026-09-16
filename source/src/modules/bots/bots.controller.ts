import { Request, Response } from 'express';
import { botsService } from './bots.service';

export class BotsController {
  public getModerationBots = async (req: Request, res: Response) => {
    try {
      const bots = await botsService.getModerationBots();
      return res.status(200).json(bots);
    } catch (error) {
      console.error('[BotsController.getModerationBots]', error);
      return res.status(500).json({ message: 'Erro ao buscar catálogo de bots moderadores.' });
    }
  };
}

export const botsController = new BotsController();