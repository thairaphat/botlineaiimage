import { messagingApi } from "@line/bot-sdk";
import fs from "node:fs";
import path from "node:path";
import { OCRService } from "./ocr.service";
import { ParserService } from "./parser.service";
import { GeminiService } from "./gemini.service";
import { prisma } from "../db";

const { MessagingApiBlobClient } = messagingApi;

console.log("[BOOT] line service init");

export class LineService {
  private static blobClient = new MessagingApiBlobClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  });

  static async handleImageMessage(messageId: string, userId?: string, groupId?: string) {
    try {
      console.log(`[LineService] Starting handleImageMessage for messageId: ${messageId}`);

      // 1. Download image
      console.log(`[LineService] Before download image: ${messageId}`);
      const stream = await this.blobClient.getMessageContent(messageId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      console.log(`[LineService] After download image, buffer size: ${buffer.length} bytes`);

      // 2. Save to uploads/
      const fileName = `${Date.now()}-${messageId}.jpg`;
      const uploadsDir = path.join(process.cwd(), "uploads");
      
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, fileName);
      fs.writeFileSync(filePath, buffer);
      console.log(`[LineService] Image saved to ${filePath}`);

      // 3. OCR (Mock for now)
      console.log(`[LineService] Before OCR for file: ${filePath}`);
      const rawText = await OCRService.performOCR(filePath);
      console.log(`[LineService] rawText: ${rawText}`);

      // 4. Parse data
      let parsedJson = await ParserService.parseText(rawText);
      const shouldUseGemini = rawText.trim().length < 30 || Number(parsedJson.confidence || 0) < 0.7;

      if (shouldUseGemini) {
        const geminiJson = await GeminiService.parseAttendanceImage(filePath);
        if (geminiJson) {
          parsedJson = geminiJson;
        }
      }

      // 5. Save to MySQL
      console.log(`[LineService] Before prisma create`);
      const record = await prisma.lineImageRecord.create({
        data: {
          lineMessageId: messageId,
          userId: userId || null,
          groupId: groupId || null,
          imagePath: fileName,
          rawText: rawText,
          parsedJson: parsedJson,
        },
      });

      // 6. Save to AttendanceImageRecord and handle session matching
      console.log(`[LineService] Creating AttendanceImageRecord and matching session`);
      
      const workDate = parsedJson.workDate ? new Date(parsedJson.workDate) : null;
      const fullNameKey = parsedJson.fullNameKey;
      const checkType = parsedJson.checkType;

      let matchStatus = "MATCHED";
      let matchReason = "Automatically matched by name and work date";

      // Check for duplicates in the same day (same name, same workDate, same checkType)
      if (fullNameKey && workDate) {
        const existingRecord = await prisma.attendanceImageRecord.findFirst({
          where: {
            fullNameKey: fullNameKey,
            workDate: workDate,
            checkType: checkType,
            userId: userId || null,
          }
        });

        if (existingRecord) {
          matchStatus = "NEED_REVIEW";
          matchReason = `Duplicate ${checkType} found for ${parsedJson.fullName} on this work date`;
        }
      }

      // Find or create session
      let session = null;
      if (fullNameKey && workDate) {
        session = await prisma.attendanceSession.findFirst({
          where: {
            userId: userId || null,
            fullNameKey: fullNameKey,
            workDate: workDate,
          }
        });

        if (!session) {
          session = await prisma.attendanceSession.create({
            data: {
              userId: userId || null,
              fullNameKey: fullNameKey,
              workDate: workDate,
              fullNameRaw: parsedJson.fullNameRaw,
              matchStatus: matchStatus,
              matchReason: matchReason,
            }
          });
        } else if (matchStatus === "NEED_REVIEW") {
          // Update session status if duplicate found
          await prisma.attendanceSession.update({
            where: { id: session.id },
            data: { matchStatus: "NEED_REVIEW", matchReason: matchReason }
          });
        }
      }

      await prisma.attendanceImageRecord.create({
        data: {
          lineImageRecordId: record.id,
          lineMessageId: messageId,
          userId: userId || null,
          groupId: groupId || null,
          imagePath: fileName,
          rawText: rawText,
          parsedJson: parsedJson,
          uploadTimestamp: new Date(),
          sessionId: session?.id,
          matchStatus: matchStatus,
          matchReason: matchReason,
          ...parsedJson
        },
      });

      console.log(`[LineService] Record saved to DB with ID: ${record.id}`);
      return record;
    } catch (error) {
      console.error("[LineService] Error handling image message:", error);
      throw error;
    }
  }

  static async handleMockImageMessage() {
    try {
      console.log(`[LineService] Handling mock image message`);
      const messageId = `mock-${Date.now()}`;
      const fileName = `mock-${messageId}.jpg`;
      const filePath = path.join(process.cwd(), "uploads", fileName);

      // Create a dummy file if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "mock image content");
      }

      const rawText = `
        Hub Name: BANGNA HUB
        Employee Code: EMP001
        Full Name (EN): John Doe
        Position: Delivery Hero
        Migrant Vendor: Vendor A
        Shift: 08:00 - 17:00
        Total overtime hours: 2.5
        May 7, 2026 6:01:39 AM
        location: Khet Bang Na, Krung Thep Maha Nakhon
      `;
      const parsedJson = await ParserService.parseText(rawText);

      const record = await prisma.lineImageRecord.create({
        data: {
          lineMessageId: messageId,
          userId: "user-mock",
          groupId: "group-mock",
          imagePath: fileName,
          rawText: rawText,
          parsedJson: parsedJson,
        },
      });

      const workDate = parsedJson.workDate ? new Date(parsedJson.workDate) : null;
      const fullNameKey = parsedJson.fullNameKey;
      const checkType = parsedJson.checkType;

      let matchStatus = "MATCHED";
      let matchReason = "Automatically matched by name and work date";

      if (fullNameKey && workDate) {
        const existingRecord = await prisma.attendanceImageRecord.findFirst({
          where: {
            fullNameKey: fullNameKey,
            workDate: workDate,
            checkType: checkType,
            userId: "user-mock",
          }
        });

        if (existingRecord) {
          matchStatus = "NEED_REVIEW";
          matchReason = `Duplicate ${checkType} found for ${parsedJson.fullName} on this work date`;
        }
      }

      let session = null;
      if (fullNameKey && workDate) {
        session = await prisma.attendanceSession.findFirst({
          where: {
            userId: "user-mock",
            fullNameKey: fullNameKey,
            workDate: workDate,
          }
        });

        if (!session) {
          session = await prisma.attendanceSession.create({
            data: {
              userId: "user-mock",
              fullNameKey: fullNameKey,
              workDate: workDate,
              fullNameRaw: parsedJson.fullNameRaw,
              matchStatus: matchStatus,
              matchReason: matchReason,
            }
          });
        }
      }

      await prisma.attendanceImageRecord.create({
        data: {
          lineImageRecordId: record.id,
          lineMessageId: messageId,
          userId: "user-mock",
          groupId: "group-mock",
          imagePath: fileName,
          rawText: rawText,
          parsedJson: parsedJson,
          uploadTimestamp: new Date(),
          sessionId: session?.id,
          matchStatus: matchStatus,
          matchReason: matchReason,
          ...parsedJson
        },
      });

      console.log(`[LineService] Mock record saved to DB with ID: ${record.id}`);
      return record;
    } catch (error) {
      console.error("[LineService] Error handling mock image message:", error);
      throw error;
    }
  }
}

console.log("[BOOT] line service init complete");
