import { Request, Response } from 'express';
import { GroupsService } from './groups.service';

const groupsService = new GroupsService();

export class GroupsController {
  public getAllGroups = async (req: Request, res: Response) => {
    try {
      const groups = await groupsService.getGroupsSummary();
      return res.status(200).json(groups);
    } catch (error) {
      console.error('[GroupsController.getAllGroups]', error);
      return res.status(500).json({ message: 'Erro interno ao buscar grupos.' });
    }
  };

public getAvailableChannels = async (req: Request, res: Response) => {
    try {
      const currentGroupId = req.query.currentGroupId as string;
      const channels = await groupsService.getAvailableChannels(currentGroupId);
      return res.status(200).json(channels);
    } catch (error) {
      console.error('[GroupsController.getAvailableChannels]', error);
      return res.status(500).json({ message: 'Erro ao buscar canais disponíveis.' });
    }
  };

  public createGroup = async (req: Request, res: Response) => {
    try {
      const newGroup = await groupsService.createGroup(req.body);
      return res.status(201).json(newGroup);
    } catch (error: any) {
      console.error('[GroupsController.createGroup]', error);
      return res.status(400).json({ message: error.message || 'Erro ao criar grupo.' });
    }
  };
  public getAvailableGroups = async (req: Request, res: Response) => {
    try {
      const currentChannelId = req.query.currentChannelId as string;
      const groups = await groupsService.getAvailableGroups(currentChannelId);
      return res.status(200).json(groups);
    } catch (error) {
      console.error('[GroupsController.getAvailableGroups]', error);
      return res.status(500).json({ message: 'Erro ao buscar grupos disponíveis.' });
    }
  };
  public getModes = async (req: Request, res: Response) => {
    try {
      const modes = await groupsService.getModes();
      return res.status(200).json(modes);
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao buscar modos.' });
    }
  };

  public getGroupById = async (req: Request, res: Response) => {
    try {
      const group = await groupsService.getGroupById(req.params.id);
      if (!group) {
        return res.status(404).json({ message: 'Grupo não encontrado.' });
      }
      return res.status(200).json(group);
    } catch (error) {
      console.error('[GroupsController.getGroupById]', error);
      return res.status(500).json({ message: 'Erro ao buscar informações do grupo.' });
    }
  };

  public updateGroupBatch = async (req: Request, res: Response) => {
    try {
      const updatedGroup = await groupsService.updateGroupBatch(req.params.id, req.body);
      return res.status(200).json(updatedGroup);
    } catch (error: any) {
      console.error('[GroupsController.updateGroupBatch]', error);
      return res.status(400).json({ message: error.message || 'Erro ao atualizar grupo em lote.' });
    }
  };

  public getModerationBotsStatus = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const bots = await groupsService.getModerationBotsStatus(id);
      return res.status(200).json(bots);
    } catch (error) {
      console.error('[getModerationBotsStatus]', error);
      return res.status(500).json({ message: 'Erro ao buscar status dos bots moderadores.' });
    }
  };

  public setModerationBotStatus = async (req: Request, res: Response) => {
    try {
      const { id, botId } = req.params;
      const { isEnabled } = req.body;
      await groupsService.setModerationBotStatus(id, botId, isEnabled);
      return res.status(200).json({ message: 'Status atualizado com sucesso.' });
    } catch (error) {
      console.error('[setModerationBotStatus]', error);
      return res.status(500).json({ message: 'Erro ao atualizar status do bot.' });
    }
  };

  public getBotConfig = async (req: Request, res: Response) => {
    try {
      const { id, botId } = req.params;
      const config = await groupsService.getBotConfig(id, botId);
      if (!config) return res.status(404).json({ message: 'Configuração não encontrada.' });
      return res.status(200).json(config);
    } catch (error) {
      console.error('[getBotConfig]', error);
      return res.status(500).json({ message: 'Erro ao buscar configuração do bot.' });
    }
  };

  public updateBotConfig = async (req: Request, res: Response) => {
    try {
      const { id, botId } = req.params;
      const configData = req.body;
      await groupsService.updateBotConfig(id, botId, configData);
      return res.status(200).json({ message: 'Configurações atualizadas.' });
    } catch (error) {
      console.error('[updateBotConfig]', error);
      return res.status(500).json({ message: 'Erro ao atualizar configuração do bot.' });
    }
  };

  public createTopic = async (req: Request, res: Response) => {
    return res.status(201).json({ message: 'Tópico criado (mock)' });
  };

  public updateTopicStatus = async (req: Request, res: Response) => {
    return res.status(200).json({ message: 'Status do tópico atualizado (mock)' });
  };

  public deleteGroup = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await groupsService.deleteGroup(id);

      if (!success) {
        return res.status(404).json({ message: 'Grupo não encontrado ou já desativado.' });
      }

      return res.status(204).send();
    } catch (error) {
      console.error('[GroupsController.deleteGroup]', error);
      return res.status(500).json({ message: 'Erro interno ao desativar grupo.' });
    }
  };
}