import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { defineConfig } from "vite";

const publicDirectory = resolve("public");

function publicFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name);
    return entry.isDirectory() ? publicFiles(filePath) : [filePath];
  });
}

// Relative asset URLs work in a normal browser and from a VS Code webview.
export default defineConfig({
  base: "./",
  build: {
    copyPublicDir: false,
  },
  plugins: [
    {
      name: "copy-public-assets-without-avatar-png",
      apply: "build",
      generateBundle() {
        for (const filePath of publicFiles(publicDirectory)) {
          const relativePath = relative(publicDirectory, filePath).split(sep).join("/");
          if (relativePath.startsWith("avatars-png/")) {
            continue;
          }

          this.emitFile({
            type: "asset",
            fileName: relativePath,
            source: readFileSync(filePath),
          });
        }
      },
    },
  ],
});
