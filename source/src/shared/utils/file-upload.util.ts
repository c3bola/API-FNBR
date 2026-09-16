import fs from 'fs';
import path from 'path';

export class FileUploadUtil {
  /**
   * Processa e salva uma imagem em formato Base64 no disco físico.
   * 
   * @param base64String A string da imagem em formato base64.
   * @param targetFolder O nome da sub-pasta dentro de 'public/uploads' (ex: 'groups', 'giveaways').
   * @param prefix Prefixo do nome do arquivo salvo (ex: 'cover', 'prize').
   * @returns O caminho público (URL path) para salvar no banco de dados, ou null em caso de falha.
   */
  public static saveBase64Image(base64String: string, targetFolder: string, prefix: string = 'img'): string | null {
    if (!base64String || !base64String.startsWith('data:image')) {
      return null;
    }

    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return null;
    }

    try {
      const imageBuffer = Buffer.from(matches[2], 'base64');
      const extension = matches[1].split('/')[1] || 'png';
      const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;
      
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', targetFolder);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      fs.writeFileSync(path.join(uploadDir, fileName), imageBuffer);

      return `/uploads/${targetFolder}/${fileName}`;
    } catch (error) {
      console.error(`[FileUploadUtil] Erro ao salvar imagem na pasta ${targetFolder}:`, error);
      return null;
    }
  }
}