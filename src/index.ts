import { Elysia, t } from "elysia";
import { LineService } from "./services/line.service";
import { prisma } from "./db";
import * as dotenv from "dotenv";

console.log("[BOOT] starting server");
dotenv.config();
console.log("[BOOT] env loaded");

const PORT = Number(process.env.PORT || 3002);
console.log(`[BOOT] port resolved: ${PORT}`);

console.log("[BOOT] before app.listen");
const app = new Elysia()
  // Health check route
  .get("/", () => ({
    status: "ok",
    message: "LINE OCR Bot is running",
    timestamp: new Date().toISOString()
  }))

  // Test route: Mock image processing
  .post("/test/mock-image", async () => {
    const record = await LineService.handleMockImageMessage();
    return {
      message: "Mock image processed successfully",
      record
    };
  })

  // Get latest 20 records
  .get("/records", async () => {
    const records = await prisma.lineImageRecord.findMany({
      take: 20,
      orderBy: { createdAt: "desc" }
    });
    return records;
  })

  // Get record by ID
  .get("/records/:id", async ({ params: { id }, set }) => {
    const record = await prisma.lineImageRecord.findUnique({
      where: { id: parseInt(id) }
    });

    if (!record) {
      set.status = 404;
      return { error: "Record not found" };
    }

    return record;
  })

  // Get latest 50 attendance records
  .get("/attendance-records", async () => {
    const records = await prisma.attendanceImageRecord.findMany({
      take: 50,
      orderBy: { createdAt: "desc" }
    });
    return records;
  })

  // LINE Webhook
  .post("/webhook/line", async ({ body, set }) => {
    console.log("[WEBHOOK] called");
    console.log(JSON.stringify(body, null, 2));

    try {
      const events = (body as any).events;
      
      if (!events || !Array.isArray(events)) {
        set.status = 400;
        return { error: "Invalid events" };
      }

      for (const event of events) {
        console.log(`Event Type: ${event.type}, Message Type: ${event.message?.type}, Message ID: ${event.message?.id}`);
        console.log(`Source: userId=${event.source?.userId}, groupId=${event.source?.groupId}, roomId=${event.source?.roomId}`);

        if (event.type === "message" && event.message.type === "image") {
          const messageId = event.message.id;
          const userId = event.source.userId;
          const groupId = event.source.groupId || event.source.roomId;

          // Process in background to avoid LINE webhook timeout
          LineService.handleImageMessage(messageId, userId, groupId)
            .then(record => {
              console.log(`[Webhook] Successfully processed image: ${messageId}`);
            })
            .catch(err => {
              console.error(`[Webhook] Failed to process image: ${messageId}`, err);
            });
        }
      }

      return "OK";
    } catch (error) {
      console.error("[Webhook] Error:", error);
      set.status = 500;
      return { error: "Internal Server Error" };
    }
  })

  .listen(PORT);

console.log("[BOOT] server started");
console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
