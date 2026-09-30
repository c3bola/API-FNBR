import { pool } from '../../infra/database/postgres.config';
import { DEFAULT_MODERATION_CONFIG } from '../../constants/moderation-template';

export class GroupsRepository {

  async getActiveGroups() {
    const query = `
      SELECT 
        c.id_comunidade AS id,
        c.platform_id AS "platformId",
        c.name,
        c.description,
        c.cover_image_url AS "coverImageUrl",
        c.icon_name AS "iconName",
        c.theme_color AS "themeColor",
        c.type,
        c.visibility,
        c.badge_text AS "badgeText",
        c.badge_color AS "badgeColor",
        c.is_official AS "isOfficial",
        c.is_vip AS "isVip",
        c.language,
        m.name AS "mode",
        c.created_at AS "createdAt",
        EXISTS(SELECT 1 FROM fnbr_community.tb_comunidade_vinculo v WHERE v.fk_id_grupo = c.id_comunidade) AS "isLinkedToChannel",
        (SELECT fk_id_canal FROM fnbr_community.tb_comunidade_vinculo v WHERE v.fk_id_grupo = c.id_comunidade) AS "linkedChannelId",
        (SELECT COUNT(*) FROM fnbr_community.tb_comunidade_member cm WHERE cm.fk_id_comunidade = c.id_comunidade) AS "memberCount",
        (SELECT COUNT(*) > 0 FROM fnbr_community.tb_comunidade_bot_setting cbs WHERE cbs.fk_id_comunidade = c.id_comunidade AND cbs.is_enabled = TRUE) AS "botActive",
        (
          SELECT json_build_object(
            'id', b.id_bot,
            'name', b.name,
            'iconName', b.icon,
            'themeColor', b.theme_color
          )
          FROM fnbr_community.tb_comunidade_bot_setting cbs
          INNER JOIN fnbr_community.tb_bot b ON cbs.fk_id_bot = b.id_bot
          WHERE cbs.fk_id_comunidade = c.id_comunidade
            AND cbs.is_enabled = TRUE
            AND b.category = 'Moderação'
          LIMIT 1
        ) AS "moderatorBot"
      FROM fnbr_community.tb_comunidade c
      INNER JOIN fnbr_community.tb_mode m ON c.fk_id_mode = m.id_mode
      WHERE c.status = 'active';
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async getGroupById(id: string) {
    const query = `
      SELECT 
        c.id_comunidade AS id,
        c.platform_id AS "platformId",
        c.name,
        c.description,
        c.cover_image_url AS "coverImageUrl",
        c.icon_name AS "iconName",
        c.theme_color AS "themeColor",
        c.type,
        c.visibility,
        c.badge_text AS "badgeText",
        c.badge_color AS "badgeColor",
        c.is_official AS "isOfficial",
        c.is_vip AS "isVip",
        c.language,
        m.name AS "mode",
        c.is_forum AS "isForum",
        c.created_at AS "createdAt",
        EXISTS(SELECT 1 FROM fnbr_community.tb_comunidade_vinculo v WHERE v.fk_id_grupo = c.id_comunidade OR v.fk_id_canal = c.id_comunidade) AS "isLinkedToChannel",
        (SELECT CASE WHEN c.type = 'group' THEN v.fk_id_canal ELSE v.fk_id_grupo END 
         FROM fnbr_community.tb_comunidade_vinculo v 
         WHERE v.fk_id_grupo = c.id_comunidade OR v.fk_id_canal = c.id_comunidade LIMIT 1) AS "linkedChannelId",
        (SELECT COUNT(*) FROM fnbr_community.tb_comunidade_member cm WHERE cm.fk_id_comunidade = c.id_comunidade) AS "memberCount",
        (SELECT COUNT(*) > 0 FROM fnbr_community.tb_comunidade_bot_setting cbs WHERE cbs.fk_id_comunidade = c.id_comunidade AND cbs.is_enabled = TRUE) AS "botActive"
      FROM fnbr_community.tb_comunidade c
      INNER JOIN fnbr_community.tb_mode m ON c.fk_id_mode = m.id_mode
      WHERE c.id_comunidade = $1;
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // 
  async getAvailableGroups(currentChannelId?: string) {
    const query = `
      SELECT c.id_comunidade AS id, c.name, c.platform_id AS "platformId" 
      FROM fnbr_community.tb_comunidade c
      LEFT JOIN fnbr_community.tb_comunidade_vinculo v ON c.id_comunidade = v.fk_id_grupo
      WHERE c.type = 'group' 
        AND c.status = 'active'
        AND (v.fk_id_grupo IS NULL ${currentChannelId ? 'OR v.fk_id_canal = $1' : ''})
      ORDER BY c.name ASC;
    `;
    const params = currentChannelId ? [currentChannelId] : [];
    const result = await pool.query(query, params);
    return result.rows;
  }

  // 
  async updateGroupBatch(groupId: string, data: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const updateQuery = `
        UPDATE fnbr_community.tb_comunidade
        SET 
          name = COALESCE($1, name),
          description = $2,
          language = COALESCE($3, language),
          fk_id_mode = COALESCE((SELECT id_mode FROM fnbr_community.tb_mode WHERE name = $4 LIMIT 1), fk_id_mode),
          visibility = COALESCE($5, visibility),
          theme_color = COALESCE($6, theme_color),
          icon_name = COALESCE($7, icon_name),
          is_forum = COALESCE($8, is_forum),
          cover_image_url = COALESCE($10, cover_image_url),
          updated_at = CURRENT_TIMESTAMP
        WHERE id_comunidade = $9
      `;
      
      await client.query(updateQuery, [
        data.name, data.description, data.language, data.mode, 
        data.visibility, data.themeColor, data.iconName, data.isForum, groupId, data.coverImageUrl
      ]);

      if (data.isLinkedToChannel && data.linkedChannelId) {
        // Resolve a arquitetura bidirecional
        const idGrupo = data.type === 'channel' ? data.linkedChannelId : groupId;
        const idCanal = data.type === 'channel' ? groupId : data.linkedChannelId;
        
        // Remove qualquer vínculo prévio desses dois caras para evitar falha de constraints UK
        await client.query(`DELETE FROM fnbr_community.tb_comunidade_vinculo WHERE fk_id_grupo = $1 OR fk_id_canal = $2`, [idGrupo, idCanal]);
        await client.query(`INSERT INTO fnbr_community.tb_comunidade_vinculo (fk_id_grupo, fk_id_canal) VALUES ($1, $2)`, [idGrupo, idCanal]);
      
      } else if (data.isLinkedToChannel === false) {
        await client.query(`DELETE FROM fnbr_community.tb_comunidade_vinculo WHERE fk_id_grupo = $1 OR fk_id_canal = $1`, [groupId]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

 async getAvailableChannels(currentGroupId?: string) {
    const query = `
      SELECT c.id_comunidade AS id, c.name, c.platform_id AS "platformId" 
      FROM fnbr_community.tb_comunidade c
      LEFT JOIN fnbr_community.tb_comunidade_vinculo v ON c.id_comunidade = v.fk_id_canal
      WHERE c.type = 'channel' 
        AND c.status = 'active'
        AND (v.fk_id_canal IS NULL ${currentGroupId ? 'OR v.fk_id_grupo = $1' : ''})
      ORDER BY c.name ASC;
    `;
    const params = currentGroupId ? [currentGroupId] : [];
    const result = await pool.query(query, params);
    return result.rows;
  }

  

  async createGroup(data: any) {
    const query = `
      INSERT INTO fnbr_community.tb_comunidade 
      (
        name, description, is_official, is_vip, cover_image_url, 
        icon_name, theme_color, type, visibility, language, status, fk_id_mode,
        platform, platform_id
      )
      VALUES (
        $1, $2, $3, $4, $5, 
        $6, $7, $8, $9, $10, 'active', 
        COALESCE((SELECT id_mode FROM fnbr_community.tb_mode WHERE name = $11 LIMIT 1), 1),
        $12, $13
      )
      RETURNING id_comunidade AS id, platform_id AS "platformId", name;
    `;
    const values = [
      data.name, data.description || null, data.isOfficial ?? true, data.isVip || false,
      data.coverImageUrl || null, data.iconName || 'Users', data.themeColor || '#9333ea',
      data.type, data.visibility || 'public', data.language || 'pt-BR', data.mode || 'Geral',
      'telegram', data.platformId
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505' && error.constraint === 'uk_platform_id') {
        throw new Error('Já existe um grupo ou canal cadastrado com este ID do Telegram.');
      }
      throw error;
    }
  }

  async getGroups() {
      // Método genérico de listagem para caso a rota fallback necessite.
      return this.getActiveGroups();
  }

  async getActiveModes() {
    const query = `SELECT id_mode AS id, name FROM fnbr_community.tb_mode WHERE is_active = TRUE ORDER BY name ASC;`;
    const result = await pool.query(query);
    return result.rows;
  }

  async getModerationBotsStatus(groupId: string) {
    const query = `
      SELECT b.id_bot AS id, b.name, b.icon AS "iconName", b.theme_color AS "themeColor", COALESCE(cbs.is_enabled, FALSE) AS "isEnabled"
      FROM fnbr_community.tb_bot b
      LEFT JOIN fnbr_community.tb_comunidade_bot_setting cbs ON b.id_bot = cbs.fk_id_bot AND cbs.fk_id_comunidade = $1
      WHERE b.category = 'Moderação' AND b.is_active = TRUE
      ORDER BY b.sort_order ASC;
    `;
    const result = await pool.query(query, [groupId]);
    return result.rows;
  }

  async setModerationBotStatus(groupId: string, botId: string, isEnabled: boolean, defaultConfig: any) {
    const query = `
      INSERT INTO fnbr_community.tb_comunidade_bot_setting (fk_id_comunidade, fk_id_bot, is_enabled, config_data)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (fk_id_comunidade, fk_id_bot) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;
    `;
    await pool.query(query, [groupId, botId, isEnabled, JSON.stringify(defaultConfig)]);
  }

  async getBotConfig(groupId: string, botId: string) {
    const query = `SELECT config_data AS config FROM fnbr_community.tb_comunidade_bot_setting WHERE fk_id_comunidade = $1 AND fk_id_bot = $2;`;
    const result = await pool.query(query, [groupId, botId]);
    return result.rows[0]?.config || null;
  }

  async updateBotConfig(groupId: string, botId: string, configData: any) {
    const query = `UPDATE fnbr_community.tb_comunidade_bot_setting SET config_data = $3::jsonb WHERE fk_id_comunidade = $1 AND fk_id_bot = $2;`;
    await pool.query(query, [groupId, botId, JSON.stringify(configData)]);
  }

  async softDeleteGroup(groupId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Atualiza status para inactive
      const updateResult = await client.query(
        `UPDATE fnbr_community.tb_comunidade 
         SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
         WHERE id_comunidade = $1 AND status != 'inactive'`,
        [groupId]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      // 2. Remove vínculos ativos de canal associados a este grupo
      await client.query(
        `DELETE FROM fnbr_community.tb_comunidade_vinculo 
         WHERE fk_id_grupo = $1 OR fk_id_canal = $1`,
        [groupId]
      );

      // 3. Desativa os bots associados a essa comunidade
      await client.query(
        `UPDATE fnbr_community.tb_comunidade_bot_setting 
         SET is_enabled = FALSE, updated_at = CURRENT_TIMESTAMP 
         WHERE fk_id_comunidade = $1`,
        [groupId]
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}