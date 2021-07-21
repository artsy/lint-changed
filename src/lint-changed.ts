import util from "util";
import path from "path";
import { exec } from "child_process";
import fs from "fs";
import µ from "micromatch";
import pLimit from "p-limit";
import to from "await-to-js";
import { red, yellow, blue, dim } from "kleur";
import { Command } from "commander";


const limit = pLimit(8);

const log = (msg: string) => {
  console.log(blue(`[lint-changed]: ${msg}`));
};

const warn = (msg: string) => {
  console.warn(yellow(`[lint-changed]: ${msg}`));
};

const error = (msg: string) => {
  console.error(red(`[lint-changed]: ${msg}`));
};

const filterOutNonExistentFiles = (files: string[]) =>
  files.filter((file) => fs.existsSync(path.join(process.cwd(), file)));

interface PkgConfig {
  ["lint-changed-base-branch"]?: string;
  ["lint-changed-release-branch"]?: string;
  ["lint-changed"]?: {
    [glob: string]: string | string[];
  };
}

const run = util.promisify(exec);
const pkg: PkgConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
);

async function runCommand(cmdString: string) {
  try {
    const { stdout, stderr } = await run(cmdString);
    if (stderr) {
      throw new Error(stderr);
    }
    return stdout.trim();
  } catch ({ stdout }) {
    throw new Error(stdout);
  }
}

const git = (args: string) => runCommand(`git ${args}`);

const getBranch = () => git("rev-parse --abbrev-ref HEAD");
const getLastTag = () => git("describe --tags --abbrev=0 HEAD^");
const getMergeBase = (baseBranch: string) =>
  git(`merge-base HEAD ${baseBranch}`);

const getChangedFiles = (event: string) =>
  git(`diff --name-only ${event}`).then((r) =>
    r.split("\n").filter((n) => !!n)
  );

/**
 * Checks for files that have changed since the last tag on the base branch
 */
const checkReleaseBranchForChangedFiles = async () => {
  log("Checking for files that have changed since last tag on release branch");
  const [tagFetchError, lastTag] = await to(getLastTag());
  if (tagFetchError) {
    error(`Unable to retrieve last tag:\n${tagFetchError}`);
    process.exit(1);
  }
  const [changedFilesError, changedFilesList] = await to(
    getChangedFiles(`${lastTag}...`)
  );
  if (changedFilesError || changedFilesList === undefined) {
    error(`Unable to get changed files since last tag:\n${changedFilesError}`);
    process.exit(1);
  }
  const existingChangedFiles = filterOutNonExistentFiles(changedFilesList);
  if (existingChangedFiles.length > 0) {
    log(
      `Files changed since ${lastTag}:\n${dim(
        existingChangedFiles.join("\n")
      )}\n`
    );
  }
  return existingChangedFiles;
};

/**
 * Checks for  files that have changed since baseBranch
 */
const checkFeatureBranchForChangedFiles = async (
  baseBranch: string,
  branch: string
) => {
  log(`Checking for files that have changed on ${branch} since ${baseBranch}`);
  const [mergeBaseError, mergeBase] = await to(getMergeBase(baseBranch));
  if (mergeBaseError) {
    error(`Unable to retrieve merge base:\n${mergeBaseError}`);
    process.exit(1);
  }
  const [changedFilesError, changedFilesList] = await to(
    getChangedFiles(`${branch} ${mergeBase}`)
  );
  if (changedFilesError || changedFilesList === undefined) {
    error(
      `Unable to get changed files since ${baseBranch}:\n${changedFilesError}`
    );
    process.exit(1);
  }
  const existingChangedFiles = filterOutNonExistentFiles(changedFilesList);
  if (existingChangedFiles.length > 0) {
    log(
      `Files changed since ${baseBranch}:\n${dim(
        existingChangedFiles.join("\n")
      )}\n`
    );
  }
  return existingChangedFiles;
};

export async function lintChanged() {
  const program = new Command();
  program
    .option('-B, --base-branch <type>', 'Base Branch')
    .option('-R, --release-branch <type>', 'Release Branch');

  program.parse(process.argv);
  const options = program.opts();

  const lintConfig = pkg["lint-changed"];
  const baseBranch = options.baseBranch || pkg["lint-changed-base-branch"] || "master";
  const releaseBranch = options.releaseBranch || pkg["lint-changed-release-branch"] || "master";

  // Warn if basebranch is not specified
  if (!lintConfig) {
    warn(
      "No `lint-changed-base-branch` found in package.json, falling back to 'master'"
    );
  }

  // Warn if releasebranch is not specified
  if (!lintConfig) {
    warn(
      "No `lint-changed-release-branch` found in package.json, falling back to 'master'"
    );
  }

  // Fail if nothing is configured to run
  if (!lintConfig) {
    warn("No `lint-changed` found in package.json");
    process.exit(1);
  }

  const branch = await getBranch();

  // Determine changed files based on branch
  let changedFiles: string[] =
    branch === releaseBranch
      ? await checkReleaseBranchForChangedFiles()
      : await checkFeatureBranchForChangedFiles(baseBranch, branch);

  // Exit early if no files have changed
  if (changedFiles.length === 0) {
    log("No files changed, skipping linting");
    return;
  }

  const globAndCommands = Object.entries(lintConfig)
    .map(([glob, cmds]) => [glob, Array.isArray(cmds) ? cmds : [cmds]]);

  const results = await Promise.all(globAndCommands.map(async ([glob, commands]) => {
    const files = µ(changedFiles, glob, {
      dot: true,
      matchBase: !glob.includes("/"),
    });

    return await Promise.all(files.map((file) => limit(async () => {
      // Stop running commands for current file on first command that fails
      try {
        for (const command of commands) {
          const o = await runCommand(`${command} ${file}`);
          console.log(blue(dim(o)));
        }
      } catch (e) {
        error(e.message.trimLeft());
        return e;
      }
    })));
  }));

  // In case there were any errors during execution, make sure to exit with error
  if (results.some((command) => command.some((e) => e))) {
    process.exit(1);
  }
}
