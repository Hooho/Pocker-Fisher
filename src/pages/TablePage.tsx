import type { ReactNode } from "react";

export function TablePage({ children }: { children: ReactNode }) {
  return <div className="table-page">{children}</div>;
}
