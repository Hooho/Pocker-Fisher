const appVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
const appUpdatedAt = typeof __APP_UPDATED_AT__ === "string" ? __APP_UPDATED_AT__ : "";

export const appMetadata = Object.freeze({
  version: appVersion,
  updatedAt: appUpdatedAt,
});

export function formatAppUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
