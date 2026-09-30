import { ResourcesRepository } from './resources.repository';

export class ResourcesService {
    private resourcesRepository = new ResourcesRepository();

    async getModules() {
        return await this.resourcesRepository.findAllModules();
    }

    async getModuleCommands(moduleId: number) {
        return await this.resourcesRepository.findCommandsByModule(moduleId);
    }

    async updateCommand(commandId: number, commandData: any) {
        const isUpdated = await this.resourcesRepository.updateCommand(commandId, commandData);

        if (!isUpdated) {
            throw new Error('Comando não encontrado ou nenhuma alteração efetuada.');
        }

        return { success: true, message: 'Comando atualizado com sucesso' };
    }

    async createResource(botId: string, payload: any) {
        const { module, command } = payload;

        if (!module || !command) {
            throw new Error('Payload inválido. Módulo e comando são obrigatórios.');
        }

        const result = await this.resourcesRepository.createModuleWithCommand(botId, module, command);

        return {
            success: true,
            message: 'Recurso criado com sucesso!',
            data: result
        };
    }

    async updateModuleStatus(moduleId: number, status: string) {
        // Converte 'disabled' do front para 'inactive' do banco de dados
        const dbStatus = status === 'disabled' ? 'inactive' : status;

        const isUpdated = await this.resourcesRepository.updateModuleStatus(moduleId, dbStatus);
        if (!isUpdated) throw new Error('Módulo não encontrado.');

        return { success: true, message: 'Status do módulo atualizado.' };
    }

    async deleteModule(moduleId: number) {
        const isDeleted = await this.resourcesRepository.deleteModule(moduleId);
        if (!isDeleted) throw new Error('Módulo não encontrado.');

        return { success: true, message: 'Módulo excluído com sucesso.' };
    }

    async addCommandToModule(moduleId: number, commandData: any) {
        if (!commandData.commandTrigger) throw new Error('O gatilho do comando é obrigatório.');
        const result = await this.resourcesRepository.createSingleCommand(moduleId, commandData);
        return { success: true, message: 'Comando adicionado com sucesso.', data: result };
    }

    async deleteCommand(commandId: number) {
        const isDeleted = await this.resourcesRepository.deleteCommand(commandId);
        if (!isDeleted) throw new Error('Comando não encontrado.');
        return { success: true, message: 'Comando excluído com sucesso.' };
    }
}