import { useCallback, useEffect, useState } from "react";

export const APP_ROUTES = {
  lobby: "/",
  table: "/table",
  settings: "/settings",
  players: "/players",
  tournament: "/tournament",
  leaderboard: "/leaderboard",
} as const;

export type AppPage = keyof typeof APP_ROUTES;
export type NavigateOptions = { replace?: boolean };

const pageByPath = Object.fromEntries(
  Object.entries(APP_ROUTES).map(([page, path]) => [path, page]),
) as Record<string, AppPage>;

function normalizePath(pathname: string) {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  return path || "/";
}

export function resolvePage(pathname: string, hash = ""): AppPage {
  // Accept hash URLs as a harmless fallback for static hosts that do not
  // rewrite unknown paths to index.html.
  const hashPath = hash.startsWith("#/") ? hash.slice(1) : "";
  const hashPage = hashPath ? pageByPath[normalizePath(hashPath)] : undefined;
  if (hashPage) return hashPage;

  return pageByPath[normalizePath(pathname)] || "lobby";
}

function isVscodeWebview() {
  return typeof window !== "undefined" && window.location.protocol.startsWith("vscode-webview");
}

export function pathForPage(page: AppPage) {
  const path = APP_ROUTES[page];
  return isVscodeWebview() ? `#${path}` : path;
}

function currentPage() {
  return resolvePage(window.location.pathname, window.location.hash);
}

export function useAppRouter() {
  const [page, setPage] = useState<AppPage>(() => currentPage());

  useEffect(() => {
    const syncPage = () => setPage(currentPage());
    window.addEventListener("popstate", syncPage);
    window.addEventListener("hashchange", syncPage);
    return () => {
      window.removeEventListener("popstate", syncPage);
      window.removeEventListener("hashchange", syncPage);
    };
  }, []);

  const navigate = useCallback((nextPage: AppPage, options: NavigateOptions = {}) => {
    if (currentPage() === nextPage) return;

    if (isVscodeWebview()) {
      const nextHash = `#${APP_ROUTES[nextPage]}`;
      if (options.replace) {
        window.history.replaceState({}, "", nextHash);
      } else {
        // VS Code Webviews have a restricted history implementation. Hash
        // navigation is the stable browser primitive there and also updates
        // the visible Webview URL for debugging.
        window.location.hash = nextHash;
      }
      if (window.location.hash !== nextHash) window.location.hash = nextHash;
      setPage(nextPage);
      return;
    }

    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({}, "", pathForPage(nextPage));
    setPage(nextPage);
  }, []);

  return [page, navigate] as const;
}
