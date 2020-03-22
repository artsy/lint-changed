import util from "util";
import path from "path";
import { exec } from "child_process";
import fs from "fs";
import µ from "micromatch";
import pEach from "p-each-series";
import pLimit from "p-limit";
import to from "await-to-js";
import { red, yellow, blue, dim } from "kleur";

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
  files.filter(file => fs.existsSync(path.join(process.cwd(), file)));

interface PkgConfig {
  ["lint-changed"]?: {
    [glob: string]: string | string[];
  };
}

const run = util.promisify(exec);
const pkg: PkgConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
);

async function runCommand(cmdString: string) {
  const { stdout, stderr } = await run(cmdString);
  if (stderr) {
    throw new Error(stderr);
  }
  return stdout.trim();
}

const git = (args: string) => runCommand(`git ${args}`);

const getBranch = () => git("rev-parse --abbrev-ref HEAD");
const getLastTag = () => git("describe --tags --abbrev=0 HEAD^");
const getChangedFiles = (event: string) =>
  git(`diff --name-only ${event}`).then(r => r.split("\n").filter(n => !!n));

/**
 * Checks for files that have changed since the last tag on the master branch
 */
const checkMasterForChangedFiles = async () => {
  const [tagFetchError, lastTag] = await to(getLastTag());
  if (tagFetchError) {
    error(`Unable to retrieve last tag:\n${tagFetchError}`);
    process.exit(1);
  }
  const [changedFilesError, changedFilesList] = await to(
    getChangedFiles(`${lastTag}..HEAD`)
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
 * Checks for  files that have changed since origin/master
 */
const checkFeatureBranchForChangedFiles = async (branch: string) => {
  const [changedFilesError, changedFilesList] = await to(
    getChangedFiles(`master...${branch}`)
  );
  if (changedFilesError || changedFilesList === undefined) {
    error(
      `Unable to get changed files since origin/master:\n${changedFilesError}`
    );
    process.exit(1);
  }
  const existingChangedFiles = filterOutNonExistentFiles(changedFilesList);
  if (existingChangedFiles.length > 0) {
    log(
      `Files changed since origin/master:\n${dim(
        existingChangedFiles.join("\n")
      )}\n`
    );
  }
  return existingChangedFiles;
};

export async function lintChanged() {
  const lintConfig = pkg["lint-changed"];

  // Fail if nothing is configured to run
  if (!lintConfig) {
    warn("No `lint-config` found in package.json");
    process.exit(1);
  }

  const branch = await getBranch();

  // Determine changed files based on branch
  let changedFiles: string[] =
    branch === "master"
      ? await checkMasterForChangedFiles()
      : await checkFeatureBranchForChangedFiles(branch);

  // Exit early if no files have changed
  if (changedFiles.length === 0) {
    log("No files changed, skipping linting");
    return;
  }

  Object.entries(lintConfig)
    .map(([glob, cmds]) => [glob, Array.isArray(cmds) ? cmds : [cmds]])
    .forEach(async ([glob, commands]) => {
      µ(changedFiles, glob, {
        dot: true,
        matchBase: !glob.includes("/")
      }).forEach(file => {
        pEach(commands, command => {
          log(`${command} ${file}`);
          return limit(() =>
            runCommand(`${command} ${file}`).then(o =>
              console.log(blue(dim(o)))
            )
          );
        });
      });
    });
}
