import { Router } from 'express';
import { GroupsController } from './groups.controller';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';

const groupsRoutes = Router();
const groupsController = new GroupsController();

// 1. Rotas Genéricas Adicionais (Devem vir ANTES das com /:id)
groupsRoutes.get('/modes', authMiddleware, groupsController.getModes);  
groupsRoutes.get('/channels/available', authMiddleware, groupsController.getAvailableChannels);
groupsRoutes.get('/available-groups', authMiddleware, groupsController.getAvailableGroups);

// 2. Rotas Específicas por ID do Grupo
groupsRoutes.get('/:id', authMiddleware, groupsController.getGroupById);
groupsRoutes.put('/:id', authMiddleware, groupsController.updateGroupBatch);
groupsRoutes.delete('/:id', authMiddleware, groupsController.deleteGroup);

// 3. Rotas de Moderação e Configuração de Bot
groupsRoutes.get('/:id/moderation-bots', authMiddleware, groupsController.getModerationBotsStatus);
groupsRoutes.put('/:id/moderation-bots/:botId/status', authMiddleware, groupsController.setModerationBotStatus);
groupsRoutes.get('/:id/moderation-bots/:botId/config', authMiddleware, groupsController.getBotConfig);
groupsRoutes.put('/:id/moderation-bots/:botId/config', authMiddleware, groupsController.updateBotConfig);

// 4. Rotas de Tópicos
groupsRoutes.post('/:id/moderation-bots/:botId/topics', authMiddleware, groupsController.createTopic);
groupsRoutes.patch('/:id/moderation-bots/:botId/topics/:topicId', authMiddleware, groupsController.updateTopicStatus);

// 5. Rotas Raiz / CRUD Base
groupsRoutes.get('/', authMiddleware, groupsController.getAllGroups);
groupsRoutes.post('/', authMiddleware, groupsController.createGroup);

export { groupsRoutes };