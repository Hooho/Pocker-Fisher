export function publicAsset(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  if (typeof document === "undefined") return normalized;
  return new URL(normalized, document.baseURI).toString();
}
