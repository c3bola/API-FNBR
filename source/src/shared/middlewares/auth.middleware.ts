import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../jwt-secret';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1];
  if (!bearerToken) {
    res.status(401).json({
      statusCode: 401,
      message: 'A Bearer token is required.',
      error: 'Unauthorized',
    });
    return;
  }

  try {
    const decoded = jwt.verify(bearerToken, getJwtSecret());
    Reflect.set(req, 'user', decoded);
    next();
  } catch {
    res.status(401).json({
      statusCode: 401,
      message: 'The Bearer token is invalid or expired.',
      error: 'Unauthorized',
    });
  }
}
