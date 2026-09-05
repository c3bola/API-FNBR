import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post('/telegram', authController.authenticateTelegram);
authRoutes.post('/mock', authController.mockLogin);

// Rota protegida para buscar menus e dados do usuário ativo
authRoutes.get('/me', authMiddleware, authController.getMe);

export { authRoutes };