import { pool } from '../../infra/database/postgres.config';

export class AuthRepository {
  
  async findUserByProvider(provider: string, providerUserId: string) {
    const query = `
      SELECT u.id_user, r.name as role_name, ui.provider_data
      FROM fnbr_community.tb_user u
      INNER JOIN fnbr_community.tb_user_identity ui ON ui.fk_id_user = u.id_user
      INNER JOIN fnbr_community.tb_role r ON r.id_role = u.fk_id_role
      WHERE ui.provider = $1 AND ui.provider_user_id = $2;
    `;
    const result = await pool.query(query, [provider, providerUserId]);
    
    if (!result.rows.length) return null;
    
    const row = result.rows[0];
    return {
      id_user: row.id_user,
      role_name: row.role_name,
      name: row.provider_data.name || row.provider_data.username || 'Usuário',
      username: row.provider_data.username || '',
      avatar_url: row.provider_data.photo_url || ''
    };
  }

  async createUserWithProvider(provider: string, providerUserId: string, payload: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Pega o papel base (ex: ID 1 para SuperAdmin ou outro existente)
      const roleResult = await client.query('SELECT id_role, name FROM fnbr_community.tb_role ORDER BY id_role ASC LIMIT 1');
      const roleId = roleResult.rows.length ? roleResult.rows[0].id_role : 1;
      const roleName = roleResult.rows.length ? roleResult.rows[0].name : 'Membro';

      // Cria a conta master (tb_user)
      const insertUserQuery = `
        INSERT INTO fnbr_community.tb_user (fk_id_role, status, metadata)
        VALUES ($1, 'active', $2) RETURNING id_user;
      `;
      const userMeta = { real_name: payload.username || 'Novo Usuário' };
      const userResult = await client.query(insertUserQuery, [roleId, userMeta]);
      const newUserId = userResult.rows[0].id_user;

      // Vincula a rede social (tb_user_identity)
      const insertIdentityQuery = `
        INSERT INTO fnbr_community.tb_user_identity (fk_id_user, provider, provider_user_id, provider_data)
        VALUES ($1, $2, $3, $4);
      `;
      const providerData = {
        username: payload.username,
        email: payload.email,
        photo_url: ''
      };
      await client.query(insertIdentityQuery, [newUserId, provider, providerUserId, providerData]);

      await client.query('COMMIT');

      return {
        id_user: newUserId,
        role_name: roleName,
        name: payload.username || 'Novo Usuário',
        username: payload.username || '',
        avatar_url: ''
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserSessionData(identifier: string) {
    // Identifica se o JWT está usando UUID novo (API Dinâmica) ou o código numérico antigo (Legado)
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(identifier);
    
    let joinAndWhere = '';
    if (isUUID) {
      joinAndWhere = `WHERE u.id_user = $1`;
    } else {
      joinAndWhere = `
        INNER JOIN fnbr_community.tb_user_identity ui ON ui.fk_id_user = u.id_user 
        WHERE ui.provider = 'telegram' AND ui.provider_user_id = $1
      `;
    }

    const query = `
      SELECT 
          u.id_user,
          r.name AS role_name,
          COALESCE(u.metadata->>'real_name', 'Usuário') AS first_name,
          (SELECT provider_data->>'username' FROM fnbr_community.tb_user_identity WHERE fk_id_user = u.id_user LIMIT 1) AS username,
          (SELECT provider_data->>'photo_url' FROM fnbr_community.tb_user_identity WHERE fk_id_user = u.id_user LIMIT 1) AS photo_url,
          (
              SELECT COALESCE(json_agg(b ORDER BY b.sort_order), '[]'::json)
              FROM fnbr_community.tb_bot b
              WHERE b.is_active = TRUE
          ) AS bots,
          (
              SELECT COALESCE(json_agg(p ORDER BY p.sort_order), '[]'::json)
              FROM fnbr_community.tb_permission p
              INNER JOIN fnbr_community.tb_role_permission rp ON rp.fk_id_permission = p.id_permission
              WHERE rp.fk_id_role = u.fk_id_role
          ) AS permissions
      FROM fnbr_community.tb_user u
      INNER JOIN fnbr_community.tb_role r ON r.id_role = u.fk_id_role
      ${joinAndWhere}
    `;

    const result = await pool.query(query, [identifier]);
    return result.rows.length ? result.rows[0] : null;
  }
}