import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { getJwtSecret } from '../../shared/jwt-secret';

const authService = new AuthService();

export class AuthController {
  
  public authenticateTelegram = (req: Request, res: Response) => {
    try {
      const result = authService.authenticate(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Falha na autenticação com o Telegram' });
    }
  };

  public authenticateProvider = async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const payload = req.body;
      
      const result = await authService.authenticateProvider(provider, payload);
      res.status(200).json(result);
    } catch (error: any) {
      console.error(`[AuthController.authenticateProvider - ${req.params.provider}]`, error);
      res.status(401).json({ error: error.message || 'Falha na autenticação com o provedor.' });
    }
  };

  public getMe = async (req: Request, res: Response) => {
    try {
      // O JWT gerado pela nova rota trará o UUID do banco no 'sub'
      const identifier = (req as any).user?.sub || '121823278'; 
      
      const sessionContext = await authService.getSessionContext(identifier);
      
      if (!sessionContext) {
        return res.status(404).json({ message: 'Usuário não encontrado ou sem permissões.' });
      }

      return res.json(sessionContext);
    } catch (error) {
      console.error('[AuthController.getMe]', error);
      return res.status(500).json({ message: 'Erro interno ao buscar contexto da sessão.' });
    }
  };

  public mockLogin = (req: Request, res: Response) => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'ContadorDeBau',
      username: 'C3bola',
      role: 'admin'
    };

    const token = jwt.sign(
      { sub: '121823278', username: mockUser.username }, 
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.json({ success: true, token, user: mockUser });
  };
}