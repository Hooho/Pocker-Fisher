import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

const viewId = "riverClub.gameView";
const saveGlobalStateKey = "riverClub.save";
const backupFileName = "river-fisher-save.json";
const backupBaseName = "river-fisher-save";
const snapshotBackupFileName = "river-fisher-save-snapshots.json";
const saveShardNames = ["profile", "active", "history", "characters"] as const;
type SaveShardName = (typeof saveShardNames)[number];

type PersistedSave = {
  revision: number;
  save: unknown;
  snapshotArchive?: unknown;
  appVersion?: string;
  appUpdatedAt?: string;
};

type ShardedStoragePayload = {
  version: 1;
  manifest: unknown;
  shards: Partial<Record<SaveShardName, unknown>>;
  snapshots?: unknown;
};

type SaveStorageRequest = {
  type: "riverClub.storage";
  requestId: string;
  operation: "load" | "revision" | "save";
  expectedRevision?: number;
  save?: unknown;
  snapshotArchive?: unknown;
  appVersion?: string;
  appUpdatedAt?: string;
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

function isPersistedSave(value: unknown): value is PersistedSave {
  return (
    isRecord(value) &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 0 &&
    "save" in value
  );
}

function getBackupDirectory(context: vscode.ExtensionContext) {
  return context.globalStorageUri;
}

function getLegacyWorkspaceBackupDirectory(context: vscode.ExtensionContext) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri;
  return workspace ? vscode.Uri.joinPath(workspace, ".vscode") : undefined;
}

function getBackupDirectories(context: vscode.ExtensionContext): vscode.Uri[] {
  const directories = [getBackupDirectory(context)];
  const legacyDirectory = getLegacyWorkspaceBackupDirectory(context);
  if (legacyDirectory) directories.push(legacyDirectory);
  return directories;
}

function getManifestBackupFile(
  context: vscode.ExtensionContext,
  directory = getBackupDirectory(context),
) {
  return vscode.Uri.joinPath(
    directory,
    `${backupBaseName}-manifest.json`,
  );
}

function getShardBackupFile(
  context: vscode.ExtensionContext,
  shard: SaveShardName,
  directory = getBackupDirectory(context),
) {
  return vscode.Uri.joinPath(
    directory,
    `${backupBaseName}-${shard}.json`,
  );
}

function getSnapshotBackupFile(
  context: vscode.ExtensionContext,
  directory = getBackupDirectory(context),
) {
  return vscode.Uri.joinPath(directory, snapshotBackupFileName);
}

async function readJsonBackup(context: vscode.ExtensionContext): Promise<PersistedSave | null> {
  for (const directory of getBackupDirectories(context)) {
    const candidates = [vscode.Uri.joinPath(directory, backupFileName)];
    try {
      const entries = await vscode.workspace.fs.readDirectory(directory);
      for (const [name, type] of entries) {
        if (
          type === vscode.FileType.File &&
          name.endsWith("-save.json") &&
          name !== backupFileName
        ) {
          candidates.push(vscode.Uri.joinPath(directory, name));
        }
      }
    } catch {
      // The directory may not exist until the first save.
    }

    for (const candidate of candidates) {
      try {
        const contents = await vscode.workspace.fs.readFile(candidate);
        const value: unknown = JSON.parse(new TextDecoder().decode(contents));
        if (isPersistedSave(value)) return value;
      } catch {
        // Try the next candidate or start with the browser save.
      }
    }
  }
  return null;
}

async function readShardedJsonBackupFromDirectory(
  context: vscode.ExtensionContext,
  directory: vscode.Uri,
): Promise<ShardedStoragePayload | null> {
  let snapshots: unknown;
  try {
    const contents = await vscode.workspace.fs.readFile(
      getSnapshotBackupFile(context, directory),
    );
    snapshots = JSON.parse(new TextDecoder().decode(contents));
  } catch {
    // Snapshots are optional; the current shards remain usable without them.
  }

  try {
    const contents = await vscode.workspace.fs.readFile(
      getManifestBackupFile(context, directory),
    );
    const manifest = JSON.parse(new TextDecoder().decode(contents));
    const shards: Partial<Record<SaveShardName, unknown>> = {};
    for (const shard of saveShardNames) {
      try {
        const shardContents = await vscode.workspace.fs.readFile(
          getShardBackupFile(context, shard, directory),
        );
        shards[shard] = JSON.parse(new TextDecoder().decode(shardContents));
      } catch {
        // The webview can recover the other shards if one file is damaged.
      }
    }
    return { version: 1, manifest, shards, snapshots };
  } catch {
    // The legacy single-file backup is handled by readJsonBackup.
  }
  return null;
}

async function readShardedJsonBackup(
  context: vscode.ExtensionContext,
): Promise<ShardedStoragePayload | null> {
  for (const directory of getBackupDirectories(context)) {
    const backup = await readShardedJsonBackupFromDirectory(context, directory);
    if (backup) return backup;
  }
  return null;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function checksumValue(value: unknown): string {
  let hash = 2166136261;
  for (const character of stableSerialize(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getPayloadRevision(payload: ShardedStoragePayload | null): number {
  if (!payload) return 0;
  const manifest = payload.manifest;
  return isRecord(manifest) && typeof manifest.revision === "number"
    ? manifest.revision
    : 0;
}

async function writeShardedJsonBackup(
  context: vscode.ExtensionContext,
  value: PersistedSave,
): Promise<void> {
  const source = isRecord(value.save) ? value.save : {};
  const data: Record<SaveShardName, Record<string, unknown>> = {
    profile: {
      playerProfile: source.playerProfile,
      settings: source.settings,
    },
    active: {
      game: source.game ?? null,
      tournament: source.tournament ?? null,
      ...(source.activeMatch !== undefined
        ? { activeMatch: source.activeMatch }
        : {}),
      ...(source.pausedTournament !== undefined
        ? { pausedTournament: source.pausedTournament }
        : {}),
      ...(source.chipAnimation !== undefined
        ? { chipAnimation: source.chipAnimation }
        : {}),
    },
    history: {
      tournamentRecords: source.tournamentRecords,
      playerStats: source.playerStats,
      stats: source.stats,
    },
    characters: {
      overrides: source.overrides,
      previous: source.previous,
    },
  };
  const checksums = {} as Record<SaveShardName, string>;

  const directory = getBackupDirectory(context);
  await vscode.workspace.fs.createDirectory(directory);
  if (value.snapshotArchive !== undefined) {
    await vscode.workspace.fs.writeFile(
      getSnapshotBackupFile(context),
      new TextEncoder().encode(JSON.stringify(value.snapshotArchive, null, 2) + "\n"),
    );
  }
  for (const shard of saveShardNames) {
    const checksum = checksumValue(data[shard]);
    checksums[shard] = checksum;
    await vscode.workspace.fs.writeFile(
      getShardBackupFile(context, shard),
      new TextEncoder().encode(JSON.stringify({
        version: 1,
        revision: value.revision,
        checksum,
        data: data[shard],
      }, null, 2) + "\n"),
    );
  }

  await vscode.workspace.fs.writeFile(
    getManifestBackupFile(context),
    new TextEncoder().encode(JSON.stringify({
      version: 1,
      app: {
        version: value.appVersion ?? "legacy",
        updatedAt: value.appUpdatedAt ?? "",
      },
      revision: value.revision,
      savedAt: typeof source.savedAt === "string" ? source.savedAt : "",
      checksums,
    }, null, 2) + "\n"),
  );
  await context.globalState.update(saveGlobalStateKey, value);
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
      const backup = (await readShardedJsonBackup(context)) ?? await readJsonBackup(context);
      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: true,
        value: backup ?? readPersistedSave(),
      });
      return;
    }

    if (message.operation === "revision") {
      const backup = await readShardedJsonBackup(context);
      const legacy = await readJsonBackup(context);
      const revision = Math.max(
        getPayloadRevision(backup),
        readPersistedSave().revision,
        legacy?.revision ?? 0,
      );
      postStorageResponse(webview, {
        type: "riverClub.storageResponse",
        requestId: message.requestId,
        ok: true,
        value: { revision },
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
        const backup = await readShardedJsonBackup(context);
        const legacy = await readJsonBackup(context);
        const currentRevision = Math.max(
          getPayloadRevision(backup),
          readPersistedSave().revision,
          legacy?.revision ?? 0,
        );
        if (currentRevision !== message.expectedRevision) {
          return { conflict: true as const, revision: currentRevision };
        }

        const next: PersistedSave = {
          revision: message.expectedRevision!,
          save: message.save,
          snapshotArchive: message.snapshotArchive,
          appVersion: message.appVersion,
          appUpdatedAt: message.appUpdatedAt,
        };
        await writeShardedJsonBackup(context, next);
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
      const existingPanel = panel;
      try {
        existingPanel.reveal(vscode.ViewColumn.Beside);
        return;
      } catch {
        // Cursor can retain a disposed panel object briefly after its Webview is closed.
        panel = undefined;
        try {
          saveWebviews.delete(existingPanel.webview);
        } catch {
          // The Webview getter can also fail after Cursor has disposed it.
        }
      }
    }

    const distUri = vscode.Uri.joinPath(context.extensionUri, "dist");
    const gamePanel = vscode.window.createWebviewPanel(
      "riverClub.game",
      "摸鱼德州",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distUri],
      },
    );
    panel = gamePanel;
    const gameWebview = gamePanel.webview;
    try {
      gameWebview.html = createWebviewHtml(gameWebview, context.extensionUri);
    } catch (error) {
      gameWebview.html = showBuildHint(error);
    }
    saveWebviews.add(gameWebview);
    const storageSubscription = gameWebview.onDidReceiveMessage(
      (message: unknown) => {
        if (isSaveStorageRequest(message)) {
          void handleStorageMessage(gameWebview, message);
        }
      },
    );
    gamePanel.onDidDispose(() => {
      storageSubscription.dispose();
      saveWebviews.delete(gameWebview);
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

}

export function deactivate(): void {
  // VS Code disposes the panel and subscriptions when the extension stops.
}
