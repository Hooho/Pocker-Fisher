import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

const viewId = "riverClub.gameView";

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
    try {
      panel.webview.html = createWebviewHtml(panel.webview, context.extensionUri);
    } catch (error) {
      panel.webview.html = showBuildHint(error);
    }
    panel.onDidDispose(() => {
      panel = undefined;
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
