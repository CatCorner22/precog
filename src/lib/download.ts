/** Save text as a file from the browser: one object URL, one click, released. */
export function downloadText(fileName: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadUrl(fileName, url);
  URL.revokeObjectURL(url);
}

/** Save a CSV file (UTF-8) from the browser. */
export function downloadCsv(fileName: string, content: string): void {
  downloadText(fileName, content, "text/csv;charset=utf-8");
}

/** Save whatever `href` points at (an object URL or a data URL) under `fileName`. */
export function downloadUrl(fileName: string, href: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
}
