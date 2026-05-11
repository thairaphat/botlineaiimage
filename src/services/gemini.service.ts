import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { normalizeEmployeeName } from "../utils/name-norm";

const GEMINI_PROMPT = `Read this attendance screenshot and extract structured data.

Return ONLY valid JSON.

Fields:
{
"fullName": "",
"employeeCode": "",
"hubName": "",
"position": "",
"shiftName": "",
"shiftStart": "",
"shiftEnd": "",
"uploadTimestamp": "",
"photoTimestamp": "",
"workDate": "",
"locationText": "",
"otHours": 0,
"confidence": 0
}

If a field is missing, use null.
Do not explain.`;

const JSON_FIELDS = [
  "fullName",
  "employeeCode",
  "hubName",
  "position",
  "shiftName",
  "shiftStart",
  "shiftEnd",
  "uploadTimestamp",
  "photoTimestamp",
  "workDate",
  "locationText",
  "otHours",
  "confidence",
];

export class GeminiService {
  static async parseAttendanceImage(imagePath: string): Promise<any | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[AI] Gemini fallback to OCR parser");
      return null;
    }

    try {
      console.log("[AI] Gemini Vision start");

      const ai = new GoogleGenAI({ apiKey });
      const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
      const imageBuffer = fs.readFileSync(imagePath);

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: GEMINI_PROMPT },
              {
                inlineData: {
                  mimeType: this.getMimeType(imagePath),
                  data: imageBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
      });

      const parsed = this.parseJsonResponse(response.text ?? "");
      if (!parsed) {
        console.log("[AI] Gemini fallback to OCR parser");
        return null;
      }

      console.log("[AI] Gemini parsed successfully");
      return this.normalize(parsed);
    } catch (error) {
      console.log("[AI] Gemini fallback to OCR parser");
      return null;
    }
  }

  private static parseJsonResponse(text: string): any | null {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;

    try {
      return JSON.parse(jsonText);
    } catch {
      return null;
    }
  }

  private static normalize(data: any): any {
    const normalized: any = {};

    for (const field of JSON_FIELDS) {
      normalized[field] = data?.[field] ?? null;
    }

    if (normalized.otHours !== null) {
      const otHours = Number(normalized.otHours);
      normalized.otHours = Number.isFinite(otHours) ? otHours : null;
    }

    if (normalized.confidence !== null) {
      const confidence = Number(normalized.confidence);
      normalized.confidence = Number.isFinite(confidence) ? confidence : null;
    }

    normalized.fullNameRaw = normalized.fullName;
    normalized.fullNameKey = normalizeEmployeeName(normalized.fullName);
    normalized.uploadTimestamp = this.toDateOrNull(normalized.uploadTimestamp);
    normalized.photoTimestamp = this.toDateOrNull(normalized.photoTimestamp);
    normalized.workDate = this.toDateOrNull(normalized.workDate);

    return normalized;
  }

  private static toDateOrNull(value: unknown): Date | null {
    if (!value) return null;

    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private static getMimeType(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();

    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    return "image/jpeg";
  }
}
