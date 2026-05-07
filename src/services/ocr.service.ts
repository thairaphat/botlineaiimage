import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFilePromise = promisify(execFile);

export class OCRService {
  static async performOCR(filePath: string): Promise<string> {
    try {
      console.log(`[OCRService] Using PaddleOCR for file: ${filePath}`);
      const scriptPath = path.join(process.cwd(), 'scripts', 'ocr.py');
      
      // Use the actual python path to avoid the Microsoft Store alias issue
      const pythonPath = 'C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
      const { stdout } = await execFilePromise(pythonPath, [scriptPath, filePath]);
      
      const rawText = stdout.trim();
      console.log(`[OCRService] OCR result for ${filePath}: ${rawText}`);
      
      return rawText;
    } catch (error) {
      console.error(`[OCRService] OCR failed for ${filePath}:`, error);
      return "";
    }
  }
}
