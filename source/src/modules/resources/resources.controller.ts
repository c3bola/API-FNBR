import { Request, Response } from 'express';
import { ResourcesService } from './resources.service';

export class ResourcesController {
    private resourcesService = new ResourcesService();

    // Usamos arrow functions para manter o escopo do 'this'
    getModules = async (req: Request, res: Response) => {
        try {
            const modules = await this.resourcesService.getModules();
            res.status(200).json(modules);
        } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar módulos' });
        }
    };

    getModuleCommands = async (req: Request, res: Response) => {
        try {
            const moduleId = Number(req.params.moduleId);
            const commands = await this.resourcesService.getModuleCommands(moduleId);
            res.status(200).json(commands);
        } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar comandos' });
        }
    };

    updateCommand = async (req: Request, res: Response) => {
        try {
            const commandId = Number(req.params.commandId);
            const commandData = req.body;

            const result = await this.resourcesService.updateCommand(commandId, commandData);
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ message: 'Erro ao atualizar comando' });
        }
    };

    createResource = async (req: Request, res: Response) => {
        try {
            // Extraímos o botId dinâmico e os dados do payload enviado pelo Angular
            const { botId, module, command } = req.body;

            if (!botId) {
                return res.status(400).json({ message: 'O ID do bot (botId) é obrigatório.' });
            }

            // Passamos o botId dinâmico para o serviço
            const result = await this.resourcesService.createResource(botId, { module, command });
            res.status(201).json(result);

        } catch (error: any) {
            console.error('[ResourcesController] Erro ao criar recurso:', error);
            if (error.code === '23505') {
                res.status(400).json({ message: 'Já existe um módulo com este código ou gatilho.' });
            } else {
                res.status(500).json({ message: 'Erro interno ao criar o recurso.' });
            }
        }
    };

    updateModuleStatus = async (req: Request, res: Response) => {
        try {
            const moduleId = Number(req.params.moduleId);
            const { status } = req.body;

            const result = await this.resourcesService.updateModuleStatus(moduleId, status);
            res.status(200).json(result);
        } catch (error: any) {
            console.error('[ResourcesController] Erro ao atualizar status:', error);
            res.status(500).json({ message: error.message || 'Erro ao atualizar status.' });
        }
    };

    deleteModule = async (req: Request, res: Response) => {
        try {
            const moduleId = Number(req.params.moduleId);
            const result = await this.resourcesService.deleteModule(moduleId);
            res.status(200).json(result);
        } catch (error: any) {
            console.error('[ResourcesController] Erro ao excluir módulo:', error);
            res.status(500).json({ message: error.message || 'Erro ao excluir módulo.' });
        }
    };

    addCommand = async (req: Request, res: Response) => {
        try {
            const moduleId = Number(req.params.moduleId);
            const result = await this.resourcesService.addCommandToModule(moduleId, req.body);
            res.status(201).json(result);
        } catch (error: any) {
            if (error.code === '23505') res.status(400).json({ message: 'Este comando já existe no módulo.' });
            else res.status(500).json({ message: error.message || 'Erro ao adicionar comando.' });
        }
    };

    deleteCommand = async (req: Request, res: Response) => {
        try {
            const result = await this.resourcesService.deleteCommand(Number(req.params.commandId));
            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({ message: error.message || 'Erro ao excluir comando.' });
        }
    };
}