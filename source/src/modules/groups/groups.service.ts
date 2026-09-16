import { GroupsRepository } from './groups.repository';
import { DEFAULT_MODERATION_CONFIG } from '../../constants/moderation-template';
import { FileUploadUtil } from '../../shared/utils/file-upload.util';

export class GroupsService {
  private groupsRepository = new GroupsRepository();

  public async getGroupsSummary() {
    const rawGroups = await this.groupsRepository.getActiveGroups();

    return rawGroups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      coverImageUrl: group.coverImageUrl,
      iconName: group.iconName,
      themeColor: group.themeColor,
      type: group.type,
      visibility: group.visibility,
      badgeText: group.badgeText,
      badgeColor: group.badgeColor,
      memberCount: parseInt(group.memberCount, 10),
      onlineCount: Math.floor(parseInt(group.memberCount, 10) * (Math.random() * 0.3 + 0.1)),
      isOfficial: group.isOfficial,
      isVip: group.isVip,
      language: group.language,
      mode: group.mode,
      botActive: group.botActive,
      createdAt: group.createdAt,
      isLinkedToChannel: group.isLinkedToChannel || false,
      linkedChannelId: group.linkedChannelId || null,
      moderatorBot: group.moderatorBot
    }));
  }

  public async getGroupById(id: string) {
    const group = await this.groupsRepository.getGroupById(id);
    if (!group) return null;

    return {
      id: group.id,
      platformId: group.platformId,
      name: group.name,
      description: group.description,
      coverImageUrl: group.coverImageUrl,
      iconName: group.iconName,
      themeColor: group.themeColor,
      type: group.type,
      visibility: group.visibility,
      badgeText: group.badgeText,
      badgeColor: group.badgeColor,
      memberCount: parseInt(group.memberCount, 10),
      onlineCount: Math.floor(parseInt(group.memberCount, 10) * (Math.random() * 0.3 + 0.1)),
      isOfficial: group.isOfficial,
      isVip: group.isVip,
      language: group.language,
      mode: group.mode,
      botActive: group.botActive,
      isForum: group.isForum || false,
      isLinkedToChannel: group.isLinkedToChannel || false,
      linkedChannelId: group.linkedChannelId || null,
      createdAt: group.createdAt
    };
  }

  public async getAvailableChannels(currentGroupId?: string) {
    return await this.groupsRepository.getAvailableChannels(currentGroupId);
  }
  public async getAvailableGroups(currentChannelId?: string) {
    return await this.groupsRepository.getAvailableGroups(currentChannelId);
  }
  public async updateGroupBatch(groupId: string, payload: any) {
    if (payload.isForum && (payload.isLinkedToChannel || payload.linkedChannelId)) {
      throw new Error('Conflito: Um grupo não pode ter o Modo Fórum ativado e um Canal Vinculado simultaneamente.');
    }

    // Processamento centralizado da imagem via utilitário
    if (payload.coverImageUrl && payload.coverImageUrl.startsWith('data:image')) {
      const savedPath = FileUploadUtil.saveBase64Image(payload.coverImageUrl, 'groups', 'cover');
      if (savedPath) {
        payload.coverImageUrl = savedPath;
      }
    }

    await this.groupsRepository.updateGroupBatch(groupId, payload);
    return await this.getGroupById(groupId);
  }

  public async createGroup(payload: any) {
    // Processamento centralizado da imagem via utilitário
    if (payload.coverImageUrl && payload.coverImageUrl.startsWith('data:image')) {
      const savedPath = FileUploadUtil.saveBase64Image(payload.coverImageUrl, 'groups', 'cover');
      if (savedPath) {
        payload.coverImageUrl = savedPath;
      }
    }

    return await this.groupsRepository.createGroup(payload);
  }

  public async deleteGroup(groupId: string): Promise<boolean> {
    const exists = await this.groupsRepository.getGroupById(groupId);
    if (!exists) {
      return false;
    }
    return await this.groupsRepository.softDeleteGroup(groupId);
  }

  public async getModes() {
    return await this.groupsRepository.getActiveModes();
  }

  public async getModerationBotsStatus(groupId: string) {
    return await this.groupsRepository.getModerationBotsStatus(groupId);
  }

  public async setModerationBotStatus(groupId: string, botId: string, isEnabled: boolean) {
    await this.groupsRepository.setModerationBotStatus(groupId, botId, isEnabled, DEFAULT_MODERATION_CONFIG);
  }

  public async getBotConfig(groupId: string, botId: string) {
    return await this.groupsRepository.getBotConfig(groupId, botId);
  }

  public async updateBotConfig(groupId: string, botId: string, configData: any) {
    await this.groupsRepository.updateBotConfig(groupId, botId, configData);
  }
}