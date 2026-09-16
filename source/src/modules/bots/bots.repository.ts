import { pool } from '../../infra/database/postgres.config';

export class BotsRepository {
  async getModerationBots() {
    const query = `
      SELECT 
        id_bot AS id, 
        name, 
        username, 
        category, 
        theme_color AS "themeColor", 
        icon
      FROM fnbr_community.tb_bot
      WHERE category = 'Moderação' AND is_active = TRUE
      ORDER BY sort_order ASC;
    `;
    const result = await pool.query(query);
    return result.rows;
  }
}

export const botsRepository = new BotsRepository();