import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../shared/middlewares/auth.middleware';

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post('/telegram', authController.authenticateTelegram);
if (process.env.NODE_ENV === 'development') {
  authRoutes.post('/mock', authController.mockLogin);
  authRoutes.post('/:provider', authController.authenticateProvider);
}
authRoutes.get('/me', authMiddleware, authController.getMe);

export { authRoutes };