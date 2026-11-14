import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { getJwtSecret } from '../../shared/jwt-secret';

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
  private readonly jwtSecret = getJwtSecret();
  private authRepository = new AuthRepository();

  public authenticate(data: TelegramAuthData): { token: string, admin: any } {
    if (!this.validateTelegramHash(data)) {
      throw new Error('Assinatura do Telegram inválida.');
    }

    const payload = { sub: data.id.toString(), role: 'Admin' };
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

  public async authenticateProvider(provider: string, payload: any) {
    // 1. Simulação da validação do Token Externo. 
    // No futuro, chame as APIs oficiais (ex: axios.get('https://discord.com/api/users/@me'))
    const providerUserId = payload.providerUserId;
    if (!providerUserId) {
      throw new Error('providerUserId é obrigatório (token não validado).');
    }

    // 2. Busca o usuário por esta identidade
    let user = await this.authRepository.findUserByProvider(provider, providerUserId);

    // 3. Upsert: Se não existir, registra a conta imediatamente
    if (!user) {
      user = await this.authRepository.createUserWithProvider(provider, providerUserId, payload);
    }

    // 4. Gera JWT utilizando o UUID real da conta no banco
    const tokenPayload = {
      sub: user.id_user,
      provider: provider,
      role: user.role_name
    };

    const token = jwt.sign(tokenPayload, this.jwtSecret, { expiresIn: '8h' });

    return {
      token,
      user: {
        id: user.id_user,
        name: user.name,
        username: user.username,
        avatar_url: user.avatar_url,
        role: user.role_name
      }
    };
  }

  public async getSessionContext(identifier: string) {
    const row = await this.authRepository.getUserSessionData(identifier);
    if (!row) return null;

    return {
      system: { name: 'FNBR', version: '0.0.1' },
      user: {
        id: row.id_user,
        name: row.first_name,
        username: row.username,
        avatar_url: row.photo_url,
        role: row.role_name
      },
      notifications_count: 0,
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