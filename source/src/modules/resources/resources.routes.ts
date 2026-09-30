import { Router } from 'express';
import { ResourcesController } from './resources.controller';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';

const resourcesRoutes = Router();
const resourcesController = new ResourcesController();

// 1. Rotas de Módulos Genéricos
resourcesRoutes.get('/modules', authMiddleware, resourcesController.getModules);

// 2. Rotas Específicas por Módulo
resourcesRoutes.get('/modules/:moduleId/commands', authMiddleware, resourcesController.getModuleCommands);

// 
resourcesRoutes.post('/modules', authMiddleware, resourcesController.createResource);

// 
resourcesRoutes.put('/commands/:commandId', authMiddleware, resourcesController.updateCommand);

// 
resourcesRoutes.patch('/modules/:moduleId/status', authMiddleware, resourcesController.updateModuleStatus);

// 
resourcesRoutes.delete('/modules/:moduleId', authMiddleware, resourcesController.deleteModule);

//
resourcesRoutes.post('/modules/:moduleId/commands', authMiddleware, resourcesController.addCommand);

//
resourcesRoutes.delete('/commands/:commandId', authMiddleware, resourcesController.deleteCommand);

export { resourcesRoutes };

