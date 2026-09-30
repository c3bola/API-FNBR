import { pool } from '../../infra/database/postgres.config';

export class ResourcesRepository {
  
  async findAllModules() {
    const query = `
      SELECT 
        id_module AS "id",
        fk_id_bot AS "botId",
        code,
        name,
        description,
        icon,
        status,
        metric_interactions AS "metricInteractions",
        metric_users AS "metricUsers"
      FROM fnbr_community.tb_module
      ORDER BY id_module ASC;
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  async findCommandsByModule(moduleId: number) {
    const query = `
      SELECT 
        id_command AS "id",
        fk_id_module AS "moduleId",
        command_trigger AS "commandTrigger",
        aliases,
        description,
        category_name AS "categoryName",
        icon,
        is_active AS "isActive",
        response_config AS "responseConfig",
        custom_config AS "customConfig",
        access_level AS "accessLevel",
        metric_executions AS "metricExecutions"
      FROM fnbr_community.tb_command
      WHERE fk_id_module = $1
      ORDER BY id_command ASC;
    `;
    const { rows } = await pool.query(query, [moduleId]);
    return rows;
  }

  async updateCommand(commandId: number, data: any) {
    const query = `
      UPDATE fnbr_community.tb_command
      SET 
        command_trigger = COALESCE($1, command_trigger),
        aliases = COALESCE($2, aliases),
        description = COALESCE($3, description),
        category_name = COALESCE($4, category_name),
        icon = COALESCE($5, icon),
        is_active = COALESCE($6, is_active),
        custom_config = COALESCE($7, custom_config)
      WHERE id_command = $8
      RETURNING id_command;
    `;
    
    const values = [
      data.commandTrigger,
      data.aliases,
      data.description,
      data.categoryName,
      data.icon,
      data.isActive,
      data.customConfig ? JSON.stringify(data.customConfig) : null,
      commandId
    ];

    const { rowCount } = await pool.query(query, values);
    return rowCount !== null && rowCount > 0;
  }

  async createModuleWithCommand(botId: string, moduleData: any, commandData: any) {
    const client = await pool.connect();
    
    try {
      // Inicia a transação
      await client.query('BEGIN');

      // 1. Inserir o Módulo
      const insertModuleQuery = `
        INSERT INTO fnbr_community.tb_module 
          (fk_id_bot, code, name, description, icon) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING id_module;
      `;
      const moduleValues = [
        botId,
        moduleData.code,
        moduleData.name,
        moduleData.description,
        moduleData.icon
      ];
      
      const moduleResult = await client.query(insertModuleQuery, moduleValues);
      const newModuleId = moduleResult.rows[0].id_module;

      // 2. Inserir o Comando Inicial vinculado ao Módulo
      const insertCommandQuery = `
        INSERT INTO fnbr_community.tb_command 
          (fk_id_module, command_trigger, description, access_level, is_active) 
        VALUES ($1, $2, $3, $4, true) 
        RETURNING id_command;
      `;
      const commandValues = [
        newModuleId,
        commandData.commandTrigger,
        commandData.description,
        commandData.accessLevel
      ];

      const commandResult = await client.query(insertCommandQuery, commandValues);
      
      // Confirma a transação
      await client.query('COMMIT');

      return {
        moduleId: newModuleId,
        commandId: commandResult.rows[0].id_command
      };

    } catch (error) {
      // Em caso de erro, desfaz tudo
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Liberta o cliente de volta para a pool
      client.release();
    }
  }

  async updateModuleStatus(moduleId: number, status: string) {
    const query = `
      UPDATE fnbr_community.tb_module 
      SET status = $1 
      WHERE id_module = $2 
      RETURNING id_module;
    `;
    const { rowCount } = await pool.query(query, [status, moduleId]);
    return rowCount !== null && rowCount > 0;
  }

  async deleteModule(moduleId: number) {
    const query = `
      DELETE FROM fnbr_community.tb_module 
      WHERE id_module = $1 
      RETURNING id_module;
    `;
    const { rowCount } = await pool.query(query, [moduleId]);
    return rowCount !== null && rowCount > 0;
  }

  async createSingleCommand(moduleId: number, commandData: any) {
    const query = `
      INSERT INTO fnbr_community.tb_command 
        (fk_id_module, command_trigger, description, access_level, is_active) 
      VALUES ($1, $2, $3, $4, true) 
      RETURNING id_command;
    `;
    const values = [
      moduleId, 
      commandData.commandTrigger.startsWith('/') ? commandData.commandTrigger : '/' + commandData.commandTrigger, 
      commandData.description || 'Novo comando adicionado', 
      commandData.accessLevel || 'community'
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async deleteCommand(commandId: number) {
  const { rowCount } = await pool.query('DELETE FROM fnbr_community.tb_command WHERE id_command = $1', [commandId]);
  return rowCount !== null && rowCount > 0;
}
}