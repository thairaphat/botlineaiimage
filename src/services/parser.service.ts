import { normalizeEmployeeName } from "../utils/name-norm";

export class ParserService {
  static async parseText(text: string): Promise<any> {
    console.log("[ParserService] Parsing text for attendance details...");

    const fullName = this.extract(text, /Full Name\s*\(EN\)\s*:\s*(.*)/i);

    const data: any = {
      hubName: this.extract(text, /Hub Name\s*:\s*(.*)/i),
      employeeCode: this.extract(text, /Employee Code\s*:\s*(\w+)/i),
      fullName: fullName,
      fullNameRaw: fullName,
      fullNameKey: normalizeEmployeeName(fullName),
      position: this.extract(text, /Position\s*:\s*(.*)/i),
      migrantVendor: this.extract(text, /Migrant Vendor\s*:\s*(.*)/i),
      locationText: this.extract(text, /location\s*:\s*(.*)/i),
    };

    // Extract Shift
    const shiftMatch = text.match(/Shift\s*:\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    if (shiftMatch) {
      data.shiftStart = shiftMatch[1];
      data.shiftEnd = shiftMatch[2];
      data.shiftName = `${shiftMatch[1]} - ${shiftMatch[2]}`;
    }

    // Extract OT Hours
    const otMatch = text.match(/Total overtime hours\s*:\s*(\d+\.?\d*)/i);
    if (otMatch) {
      data.otHours = parseFloat(otMatch[1]);
    }

    // Extract Timestamp (e.g., May 7, 2026 6:01:39 AM)
    const dateMatch = text.match(/([A-Z][a-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2}:\d{2} [AP]M)/i);
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1]);
      if (!isNaN(parsedDate.getTime())) {
        data.photoTimestamp = parsedDate;
        data.workDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      }
    }

    // Determine Check Type
    const lowerText = text.toLowerCase();
    if (lowerText.includes("out") || lowerText.includes("check out") || lowerText.includes("ออกงาน")) {
      data.checkType = "OUT";
    } else {
      data.checkType = "IN";
    }

    // Confidence (Mocking for now)
    data.confidence = 0.95;

    return data;
  }

  private static extract(text: string, regex: RegExp): string | null {
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }
}
