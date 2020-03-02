import util from "util";
import path from "path";
import { exec } from "child_process";
import fs from "fs";
import µ from "micromatch";
import pEach from "p-each-series";
import to from "await-to-js";
import { red, yellow } from "kleur";

const log = (msg: string) => {
  console.log("[lint-changed]:", msg);
};

const warn = (msg: string) => {
  console.warn(yellow(`[lint-changed]: ${msg}`));
};

const error = (msg: string) => {
  console.error(red(`[lint-changed]: ${msg}`));
};

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
  return stdout;
}

const git = (args: string) => runCommand(`git ${args}`);

const getBranch = () => git("rev-parse --abbrev-ref HEAD").then(b => b.trim());
const getLastTag = () => git("describe --tags --abbrev=0 HEAD^");
const getChangedFiles = (event: string) =>
  git(`diff --name-only ${event}`).then(r => r.split("\n").filter(n => !!n));

export async function lintChanged() {
  const lintConfig = pkg["lint-changed"];
  if (!lintConfig) {
    warn("No `lint-config` found in package.json");
  } else {
    const branch = await getBranch();
    let changedFiles: string[] = [];

    // Determine changed files based on branch
    if (branch === "master") {
      const [tagFetchError, lastTag] = await to(getLastTag());
      if (tagFetchError) {
        error("Unable to retrieve last tag");
        process.exit(1);
      }
      const [changedFilesError, changedFilesList] = await to(
        getChangedFiles(`${lastTag}..HEAD`)
      );
      if (changedFilesError || changedFilesList === undefined) {
        error("Unable to get changed files since last tag");
        process.exit(1);
      }
      changedFiles.concat(changedFilesList);
    } else {
      const [changedFilesError, changedFilesList] = await to(
        getChangedFiles(`origin/master`)
      );
      if (changedFilesError || changedFilesList === undefined) {
        error("Unable to get changed files since origin/master");
        process.exit(1);
      }
      changedFiles = changedFiles.concat(changedFilesList);
    }
    if (changedFiles.length === 0) return;

    Object.entries(lintConfig)
      .map(([glob, cmds]) => [glob, Array.isArray(cmds) ? cmds : [cmds]])
      .forEach(async ([glob, commands]) => {
        µ(changedFiles, glob, {
          dot: true,
          matchBase: !glob.includes("/")
        }).forEach(file => {
          pEach(commands, command => {
            log(`${command} ${file}`);
            return runCommand(`${command} ${file}`).then(o => log(o));
          });
        });
      });
  }
}
