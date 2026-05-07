export function parseOCRText(text: string): any {
  // Example parser logic: search for keywords or patterns
  // In a real scenario, you might use regex or an LLM
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  return {
    lines,
    lineCount: lines.length,
    processedAt: new Date().toISOString(),
    // Placeholder for more complex parsing
    summary: text.substring(0, 100) + (text.length > 100 ? "..." : "")
  };
}
