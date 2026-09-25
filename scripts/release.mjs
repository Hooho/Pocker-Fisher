import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
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
const skipPush = flags.has("--skip-push");
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
  console.error(`\n╭─ 发布失败 ─────────────────────────────────────`);
  console.error(`│ ${message}`);
  console.error(`╰─ 请根据上面的失败步骤处理后，再重新运行发布向导。`);
  process.exitCode = 1;
}

let stepSequence = 0;

function stepIcon(title) {
  if (title.includes("测试")) return "🧪";
  if (title.includes("VSIX") || title.includes("打包")) return "📦";
  if (title.includes("版本") || title.includes("递增")) return "🔢";
  if (title.includes("提交") || title.includes("暂存")) return "📝";
  if (title.includes("Tag")) return "🏷️";
  if (title.includes("推送") || title.includes("发布")) return "🚀";
  if (title.includes("合并") || title.includes("切换")) return "🔀";
  return "✨";
}

function beginStep(title, detail) {
  const step = ++stepSequence;
  console.log(`\n╭─ ${stepIcon(title)} 步骤 ${step} · ${title}`);
  if (detail) {
    console.log(`│ ${detail}`);
  }
  console.log("╰─ 开始执行");
  return step;
}

function completeStep(step, title, detail) {
  console.log(`\n╰─ ✅ 步骤 ${step} · ${title} 已完成`);
  if (detail) {
    console.log(`   ${detail}`);
  }
}

function failStep(step, title, detail) {
  console.error(`\n╰─ ❌ 步骤 ${step} · ${title} 失败`);
  if (detail) {
    console.error(`   ${detail}`);
  }
}

function skipStep(title, detail) {
  console.log(`\n╰─ ⏭️ ${title}：已跳过`);
  if (detail) {
    console.log(`   ${detail}`);
  }
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

  if (dryRun && skipPush) {
    throw new Error("--dry-run 不需要搭配 --skip-push");
  }

  if (versionOptionIndex >= 0 && !exactVersion) {
    throw new Error("--version 后面需要提供版本号，例如 --version 1.0.0");
  }
}

function runCommand(label, command, commandArguments, secrets = []) {
  return new Promise((resolveCommand, rejectCommand) => {
    const step = beginStep(label, "正在执行外部命令，请等待命令完成。");

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
    child.on("error", (error) => {
      failStep(step, label, error.message);
      rejectCommand(error);
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        completeStep(step, label, "命令执行成功。");
        resolveCommand();
        return;
      }

      const message = `${label}退出，code=${code ?? "unknown"}, signal=${signal ?? "unknown"}`;
      failStep(step, label, message);
      rejectCommand(
        new Error(message),
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
  const step = beginStep("确认发布选项", prompt);
  let result;

  if (canUseKeyboardSelector()) {
    const selectedOption = await selectWithKeyboard(
      `${prompt}（↑↓移动，Enter确认）`,
      [
        { label: "是", value: true },
        { label: "否", value: false },
      ],
      readline,
      false,
      defaultValue ? 0 : 1,
    );
    result = selectedOption?.value ?? false;
    completeStep(
      step,
      "确认发布选项",
      selectedOption ? `你的选择：${result ? "是 ✅" : "否"}` : "已取消当前操作。",
    );
    return result;
  }

  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
  const answer = (await readline.question(`${prompt}${suffix}`)).trim().toLowerCase();

  if (!answer) {
    result = defaultValue;
  } else {
    result = answer === "y" || answer === "yes" || answer === "是";
  }

  completeStep(step, "确认发布选项", `你的选择：${result ? "是 ✅" : "否"}`);
  return result;
}

function canUseKeyboardSelector() {
  return Boolean(input.isTTY && typeof input.setRawMode === "function");
}

function selectWithKeyboard(title, options, readline, multiple = false, initialIndex = 0) {
  return new Promise((resolve, reject) => {
    readline.pause();
    input.resume();
    input.setRawMode(true);
    emitKeypressEvents(input);

    let activeIndex = initialIndex;
    const selected = new Set();
    let renderedLineCount = 0;

    const render = () => {
      if (renderedLineCount > 0) {
        output.write(`\u001b[${renderedLineCount}A`);
      }

      const lines = [
        title,
        ...options.map((option, index) => {
          const pointer = index === activeIndex ? "❯" : " ";
          const marker = multiple ? (selected.has(index) ? "[x]" : "[ ]") : "";
          const disabled = option.disabled ? "（不可用）" : "";
          return `${pointer} ${marker} ${option.label}${disabled}`.trimEnd();
        }),
      ];

      for (const line of lines) {
        output.write(`\u001b[2K\r${line}\n`);
      }
      renderedLineCount = lines.length;
    };

    const cleanup = () => {
      input.removeListener("keypress", onKeypress);
      input.setRawMode(false);
      readline.resume();
      output.write("\u001b[?25h");
    };

    const finish = (value) => {
      cleanup();
      output.write("\n");
      resolve(value);
    };

    const onKeypress = (_character, key = {}) => {
      if (key.ctrl && key.name === "c") {
        finish(null);
        return;
      }

      if (key.name === "escape") {
        finish(null);
        return;
      }

      if (key.name === "up") {
        activeIndex = (activeIndex - 1 + options.length) % options.length;
        render();
        return;
      }

      if (key.name === "down") {
        activeIndex = (activeIndex + 1) % options.length;
        render();
        return;
      }

      if (multiple && (key.name === "space" || key.sequence === " ")) {
        if (!options[activeIndex].disabled) {
          if (selected.has(activeIndex)) {
            selected.delete(activeIndex);
          } else {
            selected.add(activeIndex);
          }
          render();
        }
        return;
      }

      if (key.name === "return") {
        if (multiple) {
          finish(options.filter((_option, index) => selected.has(index)));
        } else if (!options[activeIndex].disabled) {
          finish(options[activeIndex]);
        }
      }
    };

    input.on("keypress", onKeypress);
    output.write("\u001b[?25l");
    render();
  }).catch((error) => {
    input.setRawMode(false);
    readline.resume();
    throw error;
  });
}

async function selectOne(title, options, readline) {
  if (canUseKeyboardSelector()) {
    return selectWithKeyboard(title, options, readline);
  }

  while (true) {
    const answer = await ask(`${title}\n请输入选项编号：`, readline);
    const index = Number.parseInt(answer, 10) - 1;
    if (Number.isInteger(index) && options[index] && !options[index].disabled) {
      return options[index];
    }

    console.log("选项无效，请重新输入。\n");
  }
}

function parsePublishChannels(answer) {
  const channels = new Set();
  const aliases = new Map([
    ["1", "web"],
    ["web", "web"],
    ["网页", "web"],
    ["2", "vscode"],
    ["vscode", "vscode"],
    ["vs-code", "vscode"],
    ["3", "openvsx"],
    ["openvsx", "openvsx"],
  ]);

  for (const value of answer.split(/[,，、\s]+/).filter(Boolean)) {
    const channel = aliases.get(value.toLowerCase());
    if (!channel) {
      throw new Error(`无法识别发布渠道：${value}`);
    }
    channels.add(channel);
  }

  return channels;
}

async function askPublishChannels({ currentBranch, shouldCommit }, readline) {
  const step = beginStep(
    "选择发布渠道",
    "可以单选或多选 Web、VS Code Marketplace、Open VSX；直接确认且不勾选会取消发布。",
  );
  const webDescription = currentBranch === "main"
    ? "push main 和版本 Tag"
    : `合并 ${currentBranch} 到 main 并 push main 和版本 Tag`;
  const vsCodeStatus = skipVsCode ? "（已禁用）" : "";
  const openVsxStatus = skipOpenVsx ? "（已禁用）" : "";
  console.log("\n请选择发布渠道（可多选，使用逗号分隔；直接回车取消发布）：");
  console.log(
    `  1. Web${shouldCommit && !skipPush ? `（${webDescription}）` : "（当前不可用）"}`,
  );
  console.log(`  2. VS Code Marketplace${vsCodeStatus}`);
  console.log(`  3. Open VSX（Cursor）${openVsxStatus}`);
  console.log("方向键移动，Space 勾选/取消，Enter 确认；也支持输入 1,2,3");

  const webDisabled = !shouldCommit || skipPush || currentBranch === "HEAD";
  const options = [
    {
      label: "Web",
      value: "web",
      disabled: webDisabled,
    },
    {
      label: "VS Code Marketplace",
      value: "vscode",
      disabled: skipVsCode,
    },
    {
      label: "Open VSX（Cursor）",
      value: "openvsx",
      disabled: skipOpenVsx,
    },
  ];

  if (canUseKeyboardSelector()) {
    const selectedOptions = await selectWithKeyboard(
      "发布渠道（Space 多选，Enter 确认）",
      options,
      readline,
      true,
    );
    if (!selectedOptions) {
      completeStep(step, "选择发布渠道", "已取消渠道选择。⏸️");
      return null;
    }

    const result = {
      shouldPublishWeb: selectedOptions.some((option) => option.value === "web"),
      shouldPublishVsCode: selectedOptions.some((option) => option.value === "vscode"),
      shouldPublishOpenVsx: selectedOptions.some((option) => option.value === "openvsx"),
    };
    const selectedLabels = selectedOptions.map((option) => option.label).join("、") || "无";
    completeStep(step, "选择发布渠道", `已选择：${selectedLabels}。`);
    return result;
  }

  while (true) {
    const answer = await ask("发布渠道：", readline);
    if (!answer) {
      const result = {
        shouldPublishWeb: false,
        shouldPublishVsCode: false,
        shouldPublishOpenVsx: false,
      };
      completeStep(step, "选择发布渠道", "没有选择渠道，将取消发布。⏸️");
      return result;
    }

    try {
      const channels = parsePublishChannels(answer);
      if (channels.has("web") && webDisabled) {
        throw new Error("Web 发布需要创建版本提交，且当前分支必须能合并到 main。请移除 Web 选项后重试。");
      }
      if (channels.has("vscode") && skipVsCode) {
        throw new Error("VS Code 发布已被 --skip-vscode 禁用。");
      }
      if (channels.has("openvsx") && skipOpenVsx) {
        throw new Error("Open VSX 发布已被 --skip-openvsx 禁用。");
      }

      const result = {
        shouldPublishWeb: channels.has("web"),
        shouldPublishVsCode: channels.has("vscode"),
        shouldPublishOpenVsx: channels.has("openvsx"),
      };
      completeStep(step, "选择发布渠道", `已选择：${answer}。`);
      return result;
    } catch (error) {
      console.log(`${error instanceof Error ? error.message : "发布渠道无效"}\n`);
    }
  }
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
  const selectedOption = await selectOne(
    "请选择这次发布的版本变化（↑↓移动，Enter确认）",
    [
      { label: "修复问题（patch）", value: "patch" },
      { label: "新增功能（minor）", value: "minor" },
      { label: "重大不兼容变更（major）", value: "major" },
      { label: "手动指定版本号", value: "exact" },
      { label: "保持当前版本号（首次发布或重试发布）", value: "no-bump" },
    ],
    readline,
  );

  if (!selectedOption) {
    return null;
  }

  if (["patch", "minor", "major"].includes(selectedOption.value)) {
    return {
      exactVersion: undefined,
      noBump: false,
      releaseType: selectedOption.value,
      targetVersion: incrementVersion(currentVersion, selectedOption.value),
    };
  }

  if (selectedOption.value === "exact") {
    while (true) {
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
  }

  return {
    exactVersion: undefined,
    noBump: true,
    releaseType: undefined,
    targetVersion: currentVersion,
  }
}

async function createInteractivePlan() {
  const packageJson = readPackageJson();
  const readline = createPrompt();

  try {
    const versionStep = beginStep(
      "选择发布版本",
      `当前版本：${packageJson.version}。请选择 patch、minor、major 或手动版本号。`,
    );
    const versionPlan = await askVersionPlan(packageJson.version, readline);
    if (!versionPlan) {
      completeStep(versionStep, "选择发布版本", "未选择版本，已取消发布。⏸️");
      return null;
    }
    completeStep(versionStep, "选择发布版本", `目标版本：${versionPlan.targetVersion}。`);

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

    const shouldCommit = await askYesNo(
      "是否创建版本提交和 Git Tag？",
      readline,
      true,
    );
    const currentBranch = await captureCommand(gitCommand, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    const publishChannels = await askPublishChannels({ currentBranch, shouldCommit }, readline);
    if (!publishChannels) {
      return null;
    }
    if (
      !publishChannels.shouldPublishWeb &&
      !publishChannels.shouldPublishVsCode &&
      !publishChannels.shouldPublishOpenVsx
    ) {
      console.log("\n未选择任何发布渠道，已取消发布。\n");
      return null;
    }

    return {
      ...versionPlan,
      shouldTest,
      shouldCommit,
      shouldPackage:
        publishChannels.shouldPublishVsCode || publishChannels.shouldPublishOpenVsx,
      ...publishChannels,
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

async function createReleaseCommit(version) {
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
    skipStep("创建 Release Commit", "版本文件没有变化，跳过空提交。⏭️");
  }
}

async function createReleaseTag(version) {
  const tag = `v${version}`;
  const existingTag = await captureCommand(gitCommand, ["tag", "--list", tag]);
  if (existingTag) {
    const tagCommit = await captureCommand(gitCommand, ["rev-list", "-n", "1", tag]);
    const headCommit = await captureCommand(gitCommand, ["rev-parse", "HEAD"]);
    if (tagCommit !== headCommit) {
      throw new Error(`Tag ${tag} 已存在但不指向当前提交，请先处理冲突。`);
    }
    skipStep("创建版本 Tag", `Tag ${tag} 已存在且指向当前提交。⏭️`);
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

async function ensureWorkingTreeClean() {
  const status = await captureCommand(gitCommand, ["status", "--porcelain"]);
  if (status) {
    throw new Error(
      "当前工作区还有未提交改动，不能安全合并或推送。请先处理这些改动后再发布。",
    );
  }
}

async function syncMainAndPush(version) {
  const originalBranch = await captureCommand(gitCommand, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  const tag = `v${version}`;
  let switchedToMain = false;

  const syncCheckStep = beginStep(
    "准备 Web 同步",
    "确认当前工作区干净、远程 origin 可用，并且本地存在 main 分支。",
  );
  try {
    await ensureWorkingTreeClean();
    await captureCommand(gitCommand, ["remote", "get-url", "origin"]);
    await captureCommand(gitCommand, ["show-ref", "--verify", "refs/heads/main"]);
    completeStep(syncCheckStep, "准备 Web 同步", "Web 同步条件检查通过。🌐");
  } catch (error) {
    failStep(
      syncCheckStep,
      "准备 Web 同步",
      error instanceof Error ? error.message : "Web 同步条件检查失败。",
    );
    throw error;
  }

  try {
    if (originalBranch !== "main") {
      await runCommand("切换到 main", gitCommand, ["switch", "main"]);
      switchedToMain = true;
      await runCommand("合并发布分支到 main", gitCommand, [
        "merge",
        "--no-ff",
        originalBranch,
        "-m",
        `merge: 发布 ${tag}`,
      ]);
    }

    await ensureWorkingTreeClean();
    await runCommand("推送 main", gitCommand, ["push", "origin", "main"]);
    await createReleaseTag(version);
    await runCommand("推送版本 Tag", gitCommand, [
      "push",
      "origin",
      `refs/tags/${tag}`,
    ]);
  } finally {
    if (switchedToMain) {
      const status = await captureCommand(gitCommand, ["status", "--porcelain"]);
      if (!status) {
        await runCommand("切回原分支", gitCommand, ["switch", originalBranch]);
      } else {
        console.log(
          `\n当前 main 工作区存在冲突或未提交改动，暂不自动切回 ${originalBranch}，请先处理后再切换。`,
        );
      }
    }
  }
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
        shouldPublishWeb: false,
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

  const preflightStep = beginStep(
    "发布前检查",
    "检查发布令牌、版本文件和 Git 工作区，确保后续操作可以安全进行。",
  );
  try {
    requirePublishTokens(plan);
    if (!dryRun) {
      await ensureReleaseFilesClean();
      if (plan.shouldPublishWeb) {
        await ensureWorkingTreeClean();
      }
    }
    completeStep(preflightStep, "发布前检查", "令牌、版本文件和工作区检查通过。✅");
  } catch (error) {
    failStep(
      preflightStep,
      "发布前检查",
      error instanceof Error ? error.message : "检查失败。",
    );
    throw error;
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
  const shouldPublishVsix = plan.shouldPublishVsCode || plan.shouldPublishOpenVsx;

  if (plan.shouldPackage) {
    await runCommand("构建并打包 VSIX", npxCommand, [
      "--no-install",
      "@vscode/vsce",
      "package",
      "--out",
      vsixPath,
    ]);
    if (!existsSync(vsixPath)) {
      throw new Error(`VSIX 未生成：${vsixPath}`);
    }

    console.log(`\n🎉 VSIX 已生成：${vsixPath}`);
  } else if (shouldPublishVsix) {
    throw new Error("选择了 VS Code 或 Open VSX，但没有构建 VSIX。请返回并确认打包 VSIX。");
  } else if (plan.shouldPublishWeb) {
    skipStep("构建 VSIX", "本次只发布 Web，不需要 VSIX。🌐");
  } else {
    skipStep("构建 VSIX", "没有选择扩展市场渠道。⏭️");
  }

  if (dryRun) {
    console.log("试运行完成：没有调用任何发布接口。");
    return;
  }

  if (plan.shouldCommit) {
    await createReleaseCommit(packageJson.version);
    if (plan.shouldPublishWeb) {
      await syncMainAndPush(packageJson.version);
    } else {
      await createReleaseTag(packageJson.version);
      console.log("\n已跳过合并和推送；Release Commit 与本地 Tag 已创建。\n");
    }
  } else {
    skipStep("创建 Release Commit 和 Git Tag", "你选择不创建提交，版本文件会保留在工作区中。⏭️");
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
        "--no-install",
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
      ["--no-install", "ovsx", "publish", vsixPath, "-p", ovsxToken],
      [ovsxToken],
    );
  }

  const resultStep = beginStep("发布结果", "汇总本次发布向导已经完成的渠道和产物。");
  if (plan.shouldPublishWeb || plan.shouldPublishVsCode || plan.shouldPublishOpenVsx) {
    const channels = [
      plan.shouldPublishWeb ? "Web" : null,
      plan.shouldPublishVsCode ? "VS Code Marketplace" : null,
      plan.shouldPublishOpenVsx ? "Open VSX" : null,
    ].filter(Boolean).join("、");
    completeStep(resultStep, "发布结果", `发布流程完成，已处理：${channels}。🎉`);
  } else {
    completeStep(resultStep, "发布结果", "已完成检查，但没有发布到任何渠道。⏭️");
  }
}

main().catch(fail);
