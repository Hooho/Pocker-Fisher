import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

const viewId = "riverClub.gameView";
const saveGlobalStateKey = "riverClub.save";

type PersistedSave = {
  revision: number;
  save: unknown;
};

type SaveStorageRequest = {
  type: "riverClub.storage";
  requestId: string;
  operation: "load" | "revision" | "save";
  expectedRevision?: number;
  save?: unknown;
};

type SaveStorageResponse =
  | {
      type: "riverClub.storageResponse";
      requestId: string;
      ok: true;
      value: unknown;
    }
  | {
      type: "riverClub.storageResponse";
      requestId: string;
      ok: false;
      error: string;
      code?: "conflict";
    };

type SaveChangedMessage = {
  type: "riverClub.saveChanged";
  revision: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSaveStorageRequest(value: unknown): value is SaveStorageRequest {
  if (!isRecord(value)) return false;
  return (
    value.type === "riverClub.storage" &&
    typeof value.requestId === "string" &&
    (value.operation === "load" ||
      value.operation === "revision" ||
      value.operation === "save")
  );
}

function isSaveConflictRequest(message: SaveStorageRequest): boolean {
  return (
    message.operation === "save" &&
    typeof message.expectedRevision === "number"
  );
}

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function createWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const distUri = vscode.Uri.joinPath(extensionUri, "dist");
  const indexPath = join(extensionUri.fsPath, "dist", "index.html");
  const baseUri = `${webview.asWebviewUri(distUri).toString()}/`;
  const csp = [
    "default-src 'none'",
    `base-uri ${webview.cspSource}`,
    `script-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} data: blob:`,
    `font-src ${webview.cspSource} data:`,
    `media-src ${webview.cspSource} blob:`,
    `connect-src ${webview.cspSource} https: http:`,
    `worker-src ${webview.cspSource} blob:`,
  ].join("; ");

  let html = readFileSync(indexPath, "utf8");
  html = html.replace(
    "<head>",
    `<head><base href="${baseUri}"><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
  return html;
}

function showBuildHint(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `<!doctype html><html lang="zh-CN"><body style="font-family:sans-serif;padding:16px"><h2>摸鱼德州还没有构建</h2><p>请先在项目根目录运行 <code>npm run build:vscode</code>，然后重试。</p><small>${detail}</small></body></html>`;
}

function createLauncherHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <style>
          body { color: var(--vscode-foreground); font: 13px var(--vscode-font-family); padding: 14px; }
          h2 { font-size: 14px; margin: 0 0 8px; }
          p { color: var(--vscode-descriptionForeground); line-height: 1.5; }
          button { width: 100%; border: 0; border-radius: 4px; padding: 8px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
          button:hover { background: var(--vscode-button-hoverBackground); }
        </style>
      </head>
      <body>
        <h2>摸鱼德州</h2>
        <p>在编辑器中打开完整牌桌，开始一局本地德州扑克。</p>
        <button id="open-game" type="button">打开游戏</button>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          document.getElementById('open-game').addEventListener('click', () => {
            vscode.postMessage({ type: 'openGame' });
          });
        </script>
      </body>
    </html>`;
}

function isOpenGameMessage(value: unknown): value is { type: "openGame" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "openGame"
  );
}

class RiverClubViewProvider implements vscode.WebviewViewProvider {
  public constructor(private readonly onOpenGame: () => void) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = createLauncherHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (isOpenGameMessage(message)) this.onOpenGame();
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined;
  const saveWebviews = new Set<vscode.Webview>();
  let saveWriteQueue: Promise<unknown> = Promise.resolve();

  const readPersistedSave = (): PersistedSave => {
    const value = context.globalState.get<PersistedSave>(saveGlobalStateKey);
    if (
      !value ||
      typeof value.revision !== "number" ||
      !Number.isInteger(value.revision) ||
      value.revision < 0
    ) {
      return { revision: 0, save: null };
    }
    return value;
  };

  const postStorageResponse = (
    webview: vscode.Webview,
    response: SaveStorageResponse,
  ): void => {
    void webview.postMessage(response);
  };

  const broadcastSaveChanged = (revision: number): void => {
    const message: SaveChangedMessage = {
      type: "riverClub.saveChanged",
      revision,
    };
    for (const webview of saveWebviews) {
      void webview.postMessage(message);
    }
  };

  const enqueueSave = <T,>(task: () => Promise<T>): Promise<T> => {
    const result = saveWriteQueue.then(task, task);
    saveWriteQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const handleStorageMessage = async (
    webview: vscode.Webview,
    message: SaveStorageRequest,
  ): Promise<void> => {
    if (message.operation === "load") {
      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: true,
        value: readPersistedSave(),
      });
      return;
    }

    if (message.operation === "revision") {
      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: true,
        value: { revision: readPersistedSave().revision },
      });
      return;
    }

    if (!isSaveConflictRequest(message)) {
      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: false,
        error: "无效的存档写入请求",
      });
      return;
    }

    try {
      const result = await enqueueSave(async () => {
        const current = readPersistedSave();
        if (current.revision !== message.expectedRevision) {
          return { conflict: true as const, revision: current.revision };
        }

        const next: PersistedSave = {
          revision: current.revision + 1,
          save: message.save,
        };
        await context.globalState.update(saveGlobalStateKey, next);
        return { conflict: false as const, revision: next.revision };
      });

      if (result.conflict) {
        postStorageResponse(webview, {
          type: "riverClub.storageResponse",
          requestId: message.requestId,
          ok: false,
          code: "conflict",
          error: "本地存档已被另一个 Webview 更新",
        });
        return;
      }

      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: true,
        value: { revision: result.revision },
      });
      broadcastSaveChanged(result.revision);
    } catch (error) {
      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const openGame = (): void => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const distUri = vscode.Uri.joinPath(context.extensionUri, "dist");
    panel = vscode.window.createWebviewPanel(
      "riverClub.game",
      "摸鱼德州",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distUri],
      },
    );
    const gamePanel = panel;
    try {
      gamePanel.webview.html = createWebviewHtml(gamePanel.webview, context.extensionUri);
    } catch (error) {
      gamePanel.webview.html = showBuildHint(error);
    }
    saveWebviews.add(gamePanel.webview);
    const storageSubscription = gamePanel.webview.onDidReceiveMessage(
      (message: unknown) => {
        if (isSaveStorageRequest(message)) {
          void handleStorageMessage(gamePanel.webview, message);
        }
      },
    );
    gamePanel.onDidDispose(() => {
      storageSubscription.dispose();
      saveWebviews.delete(gamePanel.webview);
      if (panel === gamePanel) panel = undefined;
    });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("riverClub.openGame", openGame),
    vscode.window.registerWebviewViewProvider(
      viewId,
      new RiverClubViewProvider(openGame),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  setTimeout(openGame, 800);
}

export function deactivate(): void {
  // VS Code disposes the panel and subscriptions when the extension stops.
}
