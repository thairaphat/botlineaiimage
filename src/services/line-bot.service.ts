import fs from "fs";
import path from "path";
import { lineBlobClient } from "../line";
import { performOCR } from "../ocr";
import { parseOCRText } from "../parsers";
import { prisma } from "../db";
import { logger } from "../utils/logger";

export class LineBotService {
  static async handleImageMessage(
    messageId: string,
    userId: string,
    groupId?: string
  ) {
    try {
      logger.info(`Processing image message: ${messageId} from ${userId}`);

      // 1. Download image from LINE
      const response = await lineBlobClient.getMessageContent(messageId);
      const buffer = Buffer.from(await response.arrayBuffer());

      // 2. Save locally
      const fileName = `${Date.now()}-${messageId}.jpg`;
      const uploadDir = path.join(process.cwd(), "uploads");
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);
      logger.info(`Saved image to: ${filePath}`);

      // 3. OCR
      const rawText = await performOCR(filePath);
      logger.info(`OCR Result: ${rawText.substring(0, 50)}...`);

      // 4. Parse text
      const parsedJson = parseOCRText(rawText);

      // 5. Save to DB
      const record = await prisma.lineImageRecord.create({
        data: {
          lineMessageId: messageId,
          userId,
          groupId,
          imagePath: fileName,
          rawText,
          parsedJson,
        },
      });

      logger.info(`Saved record to DB with ID: ${record.id}`);
      return record;
    } catch (error) {
      logger.error("Error in handleImageMessage:", error);
      throw error;
    }
  }
}
