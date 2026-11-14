import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../jwt-secret';

// Renomeado para authMiddleware para bater com a importação no auth.routes.ts
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  const bearerToken = authHeader && /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1];
  if (!bearerToken) {
    return res.status(401).json({
      statusCode: 401,
      message: 'A Bearer token is required.',
      error: 'Unauthorized',
    });
  }

  try {
    const decoded = jwt.verify(bearerToken, getJwtSecret());
    
    // Alterado de req.admin para req.user para bater com a leitura no auth.controller.ts
    (req as any).user = decoded; 
    
    next();
  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: 'The Bearer token is invalid or expired.',
      error: 'Unauthorized',
    });
  }
}