import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const publicDirectory = resolve("public");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  displayName: string;
  version: string;
  publisher: string;
  description: string;
  license: string;
};
const appUpdatedAt = process.env.VITE_APP_UPDATED_AT ?? new Date().toISOString();
const charactersFile = resolve(publicDirectory, "shared-players/characters.json");
const charactersHash = createHash("sha256")
  .update(readFileSync(charactersFile))
  .digest("hex")
  .slice(0, 12);
const hashedCharactersFileName = `characters-${charactersHash}.json`;

function publicFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name);
    return entry.isDirectory() ? publicFiles(filePath) : [filePath];
  });
}

// Relative asset URLs work in a normal browser and from a VS Code webview.
export default defineConfig(({ command }) => ({
  base: "./",
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve("../../packages/game-common")] } },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_UPDATED_AT__: JSON.stringify(appUpdatedAt),
    __CHARACTERS_ASSET__: JSON.stringify(
      command === "build" ? hashedCharactersFileName : "shared-players/characters.json",
    ),
  },
  build: {
    copyPublicDir: false,
  },
  plugins: [
    {
      name: "copy-public-assets-and-generate-app-manifest",
      apply: "build" as const,
      generateBundle() {
        for (const filePath of publicFiles(publicDirectory)) {
          const relativePath = relative(publicDirectory, filePath).split(sep).join("/");
          if (relativePath.startsWith("avatars-png/") || relativePath.startsWith("avatars-webp/") || relativePath === "characters.json") {
            continue;
          }

          this.emitFile({
            type: "asset",
            fileName: relativePath === "shared-players/characters.json" ? hashedCharactersFileName : relativePath,
            source: readFileSync(filePath),
          });
        }

        const appManifest = {
          name: packageJson.displayName,
          version: packageJson.version,
          updatedAt: appUpdatedAt,
          publisher: packageJson.publisher,
          description: packageJson.description,
          license: packageJson.license,
        };

        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: `${JSON.stringify(appManifest, null, 2)}\n`,
        });
      },
    },
  ],
}));
