import { createWorker } from "tesseract.js";
import { logger } from "../utils/logger";

export async function performOCR(imagePath: string): Promise<string> {
  logger.info(`Starting OCR for: ${imagePath}`);
  
  const worker = await createWorker("tha+eng");
  
  try {
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
  } catch (error) {
    logger.error("OCR Error:", error);
    await worker.terminate();
    throw error;
  }
}
