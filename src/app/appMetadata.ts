export const appMetadata = Object.freeze({
  version: __APP_VERSION__,
  updatedAt: __APP_UPDATED_AT__,
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
