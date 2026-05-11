import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFilePromise = promisify(execFile);

console.log("[BOOT] OCR service loaded");

export class OCRService {
  static async performOCR(filePath: string): Promise<string> {
    const startedAt = Date.now();

    try {
      console.log(`[OCRService] Using PaddleOCR for file: ${filePath}`);
      const scriptPath = path.join(process.cwd(), 'scripts', 'ocr.py');
      
      // Use the actual python path to avoid the Microsoft Store alias issue
      const pythonPath = 'C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
      const { stdout, stderr } = await execFilePromise(pythonPath, [scriptPath, filePath], {
        timeout: 120000,
      });
      
      const rawText = stdout.trim();
      const elapsedMs = Date.now() - startedAt;

      console.log(`[OCRService] OCR completed in ${elapsedMs}ms`);
      console.log(`[OCRService] OCR stdout length: ${rawText.length}`);
      if (stderr?.trim()) {
        console.warn(`[OCRService] OCR stderr: ${stderr.trim()}`);
      }
      console.log(`[OCRService] OCR result for ${filePath}: ${rawText}`);
      
      return rawText;
    } catch (error) {
      const stdout = typeof (error as any)?.stdout === "string" ? (error as any).stdout.trim() : "";
      const stderr = typeof (error as any)?.stderr === "string" ? (error as any).stderr.trim() : "";
      const elapsedMs = Date.now() - startedAt;

      console.error(`[OCRService] OCR failed after ${elapsedMs}ms for ${filePath}:`, error);
      console.log(`[OCRService] OCR stdout length: ${stdout.length}`);

      if (stderr) {
        console.error(`[OCRService] OCR stderr: ${stderr}`);
      }

      if (stdout) {
        console.warn(`[OCRService] OCR returned text despite failure; using stdout`);
        return stdout;
      }

      console.error(`[OCRService] OCR failed for ${filePath}:`, error);
      return "";
    }
  }
}
