import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(projectRoot, "package.json");
const artifactsDirectory = resolve(projectRoot, "artifacts");
const dotenvPath = resolve(projectRoot, ".env");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const gitCommand = process.platform === "win32" ? "git.exe" : "git";

const releaseTypes = new Set(["patch", "minor", "major"]);
const argumentsList = process.argv.slice(2);
const flags = new Set(argumentsList.filter((argument) => argument.startsWith("--")));
const versionOptionIndex = argumentsList.indexOf("--version");
const versionOption = argumentsList.find((argument) => argument.startsWith("--version="));
const exactVersion = versionOption
  ? versionOption.slice("--version=".length)
  : versionOptionIndex >= 0
    ? argumentsList[versionOptionIndex + 1]
    : undefined;
const releaseType = argumentsList.find(
  (argument, index) =>
    !argument.startsWith("--") &&
    !(versionOptionIndex >= 0 && index === versionOptionIndex + 1),
) ?? "patch";
const dryRun = flags.has("--dry-run");
const noBump = flags.has("--no-bump");
const skipVsCode = flags.has("--skip-vscode");
const skipOpenVsx = flags.has("--skip-openvsx");
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function loadDotEnv() {
  if (!existsSync(dotenvPath)) {
    return;
  }

  const lines = readFileSync(dotenvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const normalizedLine = line.trim();
    if (!normalizedLine || normalizedLine.startsWith("#")) {
      continue;
    }

    const assignment = normalizedLine.startsWith("export ")
      ? normalizedLine.slice("export ".length).trim()
      : normalizedLine;
    const separatorIndex = assignment.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = assignment.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }

    let value = assignment.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnv();

function fail(message) {
  console.error(`\n发布失败：${message}`);
  process.exitCode = 1;
}

function readPackageJson() {
  return JSON.parse(readFileSync(packageJsonPath, "utf8"));
}

function validateArguments() {
  if (exactVersion && !semverPattern.test(exactVersion)) {
    throw new Error(`--version 必须是有效的 SemVer 版本号，当前是：${exactVersion}`);
  }

  if (exactVersion && noBump) {
    throw new Error("--version 不能和 --no-bump 同时使用");
  }

  if (!exactVersion && !releaseTypes.has(releaseType)) {
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

  if (versionOptionIndex >= 0 && !exactVersion) {
    throw new Error("--version 后面需要提供版本号，例如 --version 1.0.0");
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

function captureCommand(command, commandArguments) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, commandArguments, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand(stdout.trim());
        return;
      }

      rejectCommand(new Error(stderr.trim() || `命令退出，code=${code ?? "unknown"}`));
    });
  });
}

function compareCoreVersions(left, right) {
  const leftParts = left.split("-")[0].split("+")[0].split(".").map(Number);
  const rightParts = right.split("-")[0].split("+")[0].split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function incrementVersion(version, releaseType) {
  const [major, minor, patch] = version
    .split("-")[0]
    .split("+")[0]
    .split(".")
    .map(Number);

  if (releaseType === "major") {
    return `${major + 1}.0.0`;
  }

  if (releaseType === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

function createPrompt() {
  return createInterface({ input, output });
}

async function ask(prompt, readline) {
  return (await readline.question(prompt)).trim();
}

async function askYesNo(prompt, readline, defaultValue) {
  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
  const answer = (await readline.question(`${prompt}${suffix}`)).trim().toLowerCase();

  if (!answer) {
    return defaultValue;
  }

  return answer === "y" || answer === "yes" || answer === "是";
}

async function askVersionPlan(currentVersion, readline) {
  if (exactVersion) {
    if (compareCoreVersions(exactVersion, currentVersion) < 0) {
      throw new Error(`目标版本 ${exactVersion} 低于当前版本 ${currentVersion}`);
    }

    return {
      exactVersion,
      noBump: false,
      releaseType: undefined,
      targetVersion: exactVersion,
    };
  }

  if (noBump) {
    return {
      exactVersion: undefined,
      noBump: true,
      releaseType: undefined,
      targetVersion: currentVersion,
    };
  }

  if (argumentsList.some((argument) => releaseTypes.has(argument))) {
    return {
      exactVersion: undefined,
      noBump: false,
      releaseType,
      targetVersion: incrementVersion(currentVersion, releaseType),
    };
  }

  console.log(`\n当前版本：${currentVersion}`);
  console.log("请选择这次发布的版本变化：");
  console.log("  1. 修复问题（patch）");
  console.log("  2. 新增功能（minor）");
  console.log("  3. 重大不兼容变更（major）");
  console.log("  4. 手动指定版本号");
  console.log("  5. 保持当前版本号（首次发布或重试发布）");

  while (true) {
    const choice = await ask("请输入选项 [1-5]：", readline);

    if (choice === "1" || choice === "2" || choice === "3") {
      const selectedReleaseType = { "1": "patch", "2": "minor", "3": "major" }[choice];
      return {
        exactVersion: undefined,
        noBump: false,
        releaseType: selectedReleaseType,
        targetVersion: incrementVersion(currentVersion, selectedReleaseType),
      };
    }

    if (choice === "4") {
      const selectedVersion = await ask("请输入目标版本号（例如 1.0.1）：", readline);
      if (!semverPattern.test(selectedVersion)) {
        console.log("版本号格式不正确，请使用 x.y.z 或带预发布/构建标识的 SemVer。\n");
        continue;
      }
      if (compareCoreVersions(selectedVersion, currentVersion) < 0) {
        console.log(`目标版本不能低于当前版本 ${currentVersion}。\n`);
        continue;
      }

      return {
        exactVersion: selectedVersion,
        noBump: false,
        releaseType: undefined,
        targetVersion: selectedVersion,
      };
    }

    if (choice === "5") {
      return {
        exactVersion: undefined,
        noBump: true,
        releaseType: undefined,
        targetVersion: currentVersion,
      };
    }

    console.log("请输入 1、2、3、4 或 5。\n");
  }
}

async function createInteractivePlan() {
  const packageJson = readPackageJson();
  const readline = createPrompt();

  try {
    const versionPlan = await askVersionPlan(packageJson.version, readline);
    const confirmedVersion = await askYesNo(
      `目标版本为 ${versionPlan.targetVersion}，确认继续？`,
      readline,
      true,
    );

    if (!confirmedVersion) {
      return null;
    }

    const shouldTest = await askYesNo("是否运行发布前测试？", readline, true);
    if (!shouldTest) {
      return null;
    }

    const shouldPackage = await askYesNo("是否构建并打包 VSIX？", readline, true);
    if (!shouldPackage) {
      return null;
    }

    const shouldCommit = await askYesNo(
      "打包成功后，是否创建版本提交和 Git Tag？",
      readline,
      true,
    );
    const shouldPublishVsCode = skipVsCode
      ? false
      : await askYesNo("是否发布到 VS Code Marketplace？", readline, false);
    const shouldPublishOpenVsx = skipOpenVsx
      ? false
      : await askYesNo("是否发布到 Open VSX（Cursor 可从这里获取扩展）？", readline, false);

    return {
      ...versionPlan,
      shouldTest,
      shouldPackage,
      shouldCommit,
      shouldPublishVsCode,
      shouldPublishOpenVsx,
    };
  } finally {
    readline.close();
  }
}

function requirePublishTokens(plan) {
  if (plan.shouldPublishVsCode && !process.env.VSCE_PAT) {
    throw new Error("你选择了发布到 VS Code，但缺少 VSCE_PAT。请先设置 Azure DevOps PAT。");
  }

  if (plan.shouldPublishOpenVsx && !(process.env.OVSX_PAT ?? process.env.OVSX_TOKEN)) {
    throw new Error("你选择了发布到 Open VSX，但缺少 OVSX_PAT 或 OVSX_TOKEN。");
  }
}

async function createReleaseCommitAndTag(version) {
  const releaseFiles = ["package.json", "package-lock.json"];
  const stagedReleaseFiles = await captureCommand(gitCommand, [
    "diff",
    "--cached",
    "--name-only",
    "--",
    ...releaseFiles,
  ]);

  if (stagedReleaseFiles) {
    throw new Error(
      "package.json 或 package-lock.json 已有暂存改动，请先处理后再发布。",
    );
  }

  await runCommand("暂存版本文件", gitCommand, ["add", "--", ...releaseFiles]);
  const stagedFiles = await captureCommand(gitCommand, [
    "diff",
    "--cached",
    "--name-only",
    "--",
    ...releaseFiles,
  ]);

  if (stagedFiles) {
    await runCommand("创建 Release Commit", gitCommand, [
      "commit",
      "-m",
      `chore(release): v${version}`,
    ]);
  } else {
    console.log("\n版本文件没有变化，跳过空的 Release Commit。");
  }

  const tag = `v${version}`;
  const existingTag = await captureCommand(gitCommand, ["tag", "--list", tag]);
  if (existingTag) {
    const tagCommit = await captureCommand(gitCommand, ["rev-list", "-n", "1", tag]);
    const headCommit = await captureCommand(gitCommand, ["rev-parse", "HEAD"]);
    if (tagCommit !== headCommit) {
      throw new Error(`Tag ${tag} 已存在但不指向当前提交，请先处理冲突。`);
    }
    console.log(`\nTag ${tag} 已存在且指向当前提交，跳过创建。`);
    return;
  }

  await runCommand("创建版本 Tag", gitCommand, [
    "tag",
    "-a",
    tag,
    "-m",
    `发布 ${tag}`,
  ]);
}

async function ensureReleaseFilesClean() {
  const releaseFiles = ["package.json", "package-lock.json"];
  const dirtyReleaseFiles = await captureCommand(gitCommand, [
    "diff",
    "--name-only",
    "--",
    ...releaseFiles,
  ]);
  const stagedReleaseFiles = await captureCommand(gitCommand, [
    "diff",
    "--cached",
    "--name-only",
    "--",
    ...releaseFiles,
  ]);

  if (dirtyReleaseFiles || stagedReleaseFiles) {
    throw new Error(
      "package.json 或 package-lock.json 在发布前已有改动，请先提交或清理后再发布。",
    );
  }
}

async function main() {
  validateArguments();

  const currentPackageJson = readPackageJson();
  const plan = dryRun
    ? {
        exactVersion: undefined,
        noBump: true,
        releaseType: undefined,
        targetVersion: currentPackageJson.version,
        shouldTest: true,
        shouldPackage: true,
        shouldCommit: false,
        shouldPublishVsCode: false,
        shouldPublishOpenVsx: false,
      }
    : await createInteractivePlan();

  if (!plan) {
    console.log("\n已取消发布。没有执行版本修改、提交或发布。\n");
    return;
  }

  if (dryRun) {
    console.log("\n▶ 试运行：不修改版本号，也不发布");
  }

  requirePublishTokens(plan);
  if (!dryRun) {
    await ensureReleaseFilesClean();
  }

  if (plan.shouldTest) {
    await runCommand("运行发布前测试", npmCommand, ["test"]);
  }

  if (!dryRun && plan.exactVersion) {
    await runCommand("设置扩展版本号", npmCommand, [
      "version",
      plan.exactVersion,
      "--no-git-tag-version",
      "--allow-same-version",
    ]);
  } else if (!dryRun && !plan.noBump) {
    await runCommand("递增扩展版本号", npmCommand, [
      "version",
      plan.releaseType,
      "--no-git-tag-version",
    ]);
  } else if (!dryRun) {
    console.log("\n▶ 使用当前版本号，不递增版本");
  }

  const packageJson = readPackageJson();
  const vsixPath = resolve(
    artifactsDirectory,
    `${packageJson.publisher}.${packageJson.name}-${packageJson.version}.vsix`,
  );
  mkdirSync(artifactsDirectory, { recursive: true });

  if (plan.shouldPackage) {
    await runCommand("构建并打包 VSIX", npxCommand, [
      "--yes",
      "@vscode/vsce",
      "package",
      "--out",
      vsixPath,
    ]);
  }

  if (!existsSync(vsixPath)) {
    throw new Error(`VSIX 未生成：${vsixPath}`);
  }

  console.log(`\nVSIX 已生成：${vsixPath}`);

  if (dryRun) {
    console.log("试运行完成：没有调用任何发布接口。");
    return;
  }

  if (plan.shouldCommit) {
    await createReleaseCommitAndTag(packageJson.version);
  } else {
    console.log("\n已跳过 Release Commit 和 Git Tag；版本文件仍保留在工作区中。\n");
  }

  const vscePat = process.env.VSCE_PAT;
  const ovsxToken = process.env.OVSX_PAT ?? process.env.OVSX_TOKEN;

  if (!plan.shouldCommit && (plan.shouldPublishVsCode || plan.shouldPublishOpenVsx)) {
    const warningPrompt = createPrompt();
    let continueWithoutCommit;
    try {
      continueWithoutCommit = await askYesNo(
        "版本尚未提交，仍要继续发布吗？",
        warningPrompt,
        false,
      );
    } finally {
      warningPrompt.close();
    }

    if (!continueWithoutCommit) {
      console.log("\n已停止发布；VSIX 已生成但未上传。\n");
      return;
    }
  }

  if (plan.shouldPublishVsCode) {
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

  if (plan.shouldPublishOpenVsx) {
    await runCommand(
      "发布到 Open VSX（Cursor）",
      npxCommand,
      ["--yes", "ovsx", "publish", vsixPath, "-p", ovsxToken],
      [ovsxToken],
    );
  }

  if (plan.shouldPublishVsCode || plan.shouldPublishOpenVsx) {
    console.log("\n发布流程完成：已处理你选择的发布渠道。\n");
  } else {
    console.log("\n已完成测试和 VSIX 打包，未发布到任何 Marketplace。\n");
  }
}

main().catch(fail);
