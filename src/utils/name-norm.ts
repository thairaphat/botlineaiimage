export function normalizeEmployeeName(name: string | null | undefined): string | null {
  if (!name) return null;
  
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/[^a-z0-9 ]/g, "") // Remove special characters except alphanumeric and space
    .trim();
}
