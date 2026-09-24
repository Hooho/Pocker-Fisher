import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(projectRoot, "package.json");
const artifactsDirectory = resolve(projectRoot, "artifacts");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const releaseTypes = new Set(["patch", "minor", "major"]);
const argumentsList = process.argv.slice(2);
const flags = new Set(argumentsList.filter((argument) => argument.startsWith("--")));
const releaseType = argumentsList.find((argument) => !argument.startsWith("--")) ?? "patch";
const dryRun = flags.has("--dry-run");
const noBump = flags.has("--no-bump");
const skipVsCode = flags.has("--skip-vscode");
const skipOpenVsx = flags.has("--skip-openvsx");

function fail(message) {
  console.error(`\n发布失败：${message}`);
  process.exitCode = 1;
}

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonPath, "utf8"));
}

function validateArguments() {
  if (!releaseTypes.has(releaseType)) {
    throw new Error(
      `版本递增类型必须是 patch、minor 或 major，当前是：${releaseType}`,
    );
  }

  const packageJson = readPackageJson();
  if (!packageJson.name || !packageJson.publisher || !packageJson.version) {
    throw new Error("package.json 缺少 name、publisher 或 version");
  }

  if (dryRun && (skipVsCode || skipOpenVsx)) {
    throw new Error("--dry-run 不需要搭配 --skip-vscode 或 --skip-openvsx");
  }
}

function runCommand(label, command, commandArguments, secrets = []) {
  return new Promise((resolveCommand, rejectCommand) => {
    console.log(`\n▶ ${label}`);

    const child = spawn(command, commandArguments, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });

    const writeOutput = (chunk, stream) => {
      let output = chunk.toString();
      for (const secret of secrets) {
        if (secret) {
          output = output.split(secret).join("[已隐藏]");
        }
      }
      stream.write(output);
    };

    child.stdout.on("data", (chunk) => writeOutput(chunk, process.stdout));
    child.stderr.on("data", (chunk) => writeOutput(chunk, process.stderr));
    child.on("error", rejectCommand);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }

      rejectCommand(
        new Error(`${label}退出，code=${code ?? "unknown"}, signal=${signal ?? "unknown"}`),
      );
    });
  });
}

async function main() {
  validateArguments();

  const vscePat = process.env.VSCE_PAT;
  const ovsxToken = process.env.OVSX_PAT ?? process.env.OVSX_TOKEN;

  if (!dryRun && !skipVsCode && !vscePat) {
    throw new Error("缺少 VSCE_PAT。请先设置 VS Code Marketplace 的 Azure DevOps PAT。");
  }

  if (!dryRun && !skipOpenVsx && !ovsxToken) {
    throw new Error("缺少 OVSX_PAT 或 OVSX_TOKEN。请先设置 Open VSX Token。");
  }

  if (!dryRun && !noBump) {
    await runCommand("递增扩展版本号", npmCommand, [
      "version",
      releaseType,
      "--no-git-tag-version",
    ]);
  } else if (dryRun) {
    console.log("\n▶ 试运行：不修改版本号，也不发布");
  } else {
    console.log("\n▶ 使用当前版本号，不递增版本");
  }

  const packageJson = readPackageJson();
  const vsixPath = resolve(
    artifactsDirectory,
    `${packageJson.publisher}.${packageJson.name}-${packageJson.version}.vsix`,
  );
  mkdirSync(artifactsDirectory, { recursive: true });

  await runCommand("构建并打包 VSIX", npxCommand, [
    "--yes",
    "@vscode/vsce",
    "package",
    "--out",
    vsixPath,
  ]);

  if (!existsSync(vsixPath)) {
    throw new Error(`VSIX 未生成：${vsixPath}`);
  }

  console.log(`\nVSIX 已生成：${vsixPath}`);

  if (dryRun) {
    console.log("试运行完成：没有调用任何发布接口。");
    return;
  }

  if (!skipVsCode) {
    await runCommand(
      "发布到 VS Code Marketplace",
      npxCommand,
      [
        "--yes",
        "@vscode/vsce",
        "publish",
        "--packagePath",
        vsixPath,
        "--pat",
        vscePat,
      ],
      [vscePat],
    );
  }

  if (!skipOpenVsx) {
    await runCommand(
      "发布到 Open VSX（Cursor）",
      npxCommand,
      ["--yes", "ovsx", "publish", vsixPath, "-p", ovsxToken],
      [ovsxToken],
    );
  }

  console.log("\n发布完成：VS Code Marketplace 和 Open VSX 均已处理。");
}

main().catch(fail);
