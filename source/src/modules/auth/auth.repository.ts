import { pool } from '../../infra/database/postgres.config';

export class AuthRepository {
  
  async getUserSessionData(telegramId: string) {
    const query = `
      SELECT 
          u.id_user,
          r.name AS role_name,
          ui.provider_data->>'first_name' AS first_name,
          ui.provider_data->>'username' AS username,
          ui.provider_data->>'photo_url' AS photo_url,
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
      INNER JOIN fnbr_community.tb_user_identity ui ON ui.fk_id_user = u.id_user
      WHERE ui.provider = 'telegram' AND ui.provider_user_id = $1;
    `;

    const result = await pool.query(query, [telegramId]);
    return result.rows.length ? result.rows[0] : null;
  }

}