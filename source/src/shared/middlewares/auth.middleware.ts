import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Renomeado para authMiddleware para bater com a importação no auth.routes.ts
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'chave-super-secreta-ambiente-dev');
    
    // Alterado de req.admin para req.user para bater com a leitura no auth.controller.ts
    (req as any).user = decoded; 
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }
}