import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';

interface TelegramAuthData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export class AuthService {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  private readonly jwtSecret = process.env.JWT_SECRET || 'chave-super-secreta-ambiente-dev';
  private authRepository = new AuthRepository();

  public authenticate(data: TelegramAuthData): { token: string, admin: any } {
    if (!this.validateTelegramHash(data)) {
      throw new Error('Assinatura do Telegram inválida.');
    }

    const payload = {
      sub: data.id.toString(),
      role: 'Admin'
    };

    const token = jwt.sign(payload, this.jwtSecret, { expiresIn: '8h' });

    return {
      token,
      admin: {
        id: data.id.toString(),
        name: data.first_name,
        username: data.username || '',
        avatar: data.photo_url || '',
        role: 'Admin',
        status: 'Online'
      }
    };
  }

  public async getSessionContext(telegramId: string) {
    const row = await this.authRepository.getUserSessionData(telegramId);
    
    if (!row) return null;

    return {
      system: {
        name: 'FNBR',
        version: '0.0.1'
      },
      user: {
        id: row.id_user,
        name: row.first_name,
        username: row.username,
        avatar_url: row.photo_url,
        role: row.role_name
      },
      notifications_count: 0, // Valor estático temporário
      bots_access: row.bots,
      navigation: this.buildNavigation(row.permissions)
    };
  }

  private buildNavigation(permissions: any[]) {
    const sectionsMap = new Map<string, any>();

    permissions.forEach(p => {
      if (!sectionsMap.has(p.section)) {
        sectionsMap.set(p.section, { section: p.section, items: [] });
      }
      sectionsMap.get(p.section).items.push({
        label: p.label,
        icon: p.icon,
        route: p.route,
        permission: p.code
      });
    });

    return Array.from(sectionsMap.values());
  }

  private validateTelegramHash(data: TelegramAuthData): boolean {
    const { hash, ...userData } = data;

    const dataCheckArr = Object.keys(userData)
      .map(key => `${key}=${(userData as any)[key]}`)
      .sort();

    const dataCheckString = dataCheckArr.join('\n');
    const secretKey = crypto.createHash('sha256').update(this.botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === hash;
  }
}