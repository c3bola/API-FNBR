import { Router } from 'express';
import { botsController } from './bots.controller';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';

const botsRoutes = Router();

botsRoutes.get('/moderation', authMiddleware, botsController.getModerationBots);

export { botsRoutes };