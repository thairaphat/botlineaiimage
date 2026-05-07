import { messagingApi } from "@line/bot-sdk";
import * as dotenv from "dotenv";

dotenv.config();

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

export const lineClient = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
});

export const lineBlobClient = new MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
});

export const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
