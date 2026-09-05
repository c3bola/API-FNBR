import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

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

  public getMe = async (req: Request, res: Response) => {
    try {
      // O authMiddleware deve colocar o payload decodificado em req.user
      // Caso esteja testando via mock e o middleware não esteja configurado, injete '121823278' fixo
      const telegramId = (req as any).user?.sub || '121823278'; 
      
      const sessionContext = await authService.getSessionContext(telegramId);
      
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
      name: 'Anezio Luis da Silva Fidalgo',
      username: 'C3bola',
      role: 'admin'
    };

    const jwtSecret = process.env.JWT_SECRET || 'chave-super-secreta-ambiente-dev';
    const token = jwt.sign(
      { sub: '121823278', username: mockUser.username }, 
      jwtSecret, 
      { expiresIn: '7d' }
    );

    return res.json({ success: true, token, user: mockUser });
  };
}