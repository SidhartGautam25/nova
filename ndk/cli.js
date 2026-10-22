import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import { build, VirtualMachine, loadExecutable } from "./index.js";

function parseBuildArguments(args) {
  let input = null;
  let output = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-o") {
      if (!args[i + 1]) {
        throw new Error("Missing path after -o");
      }

      output = args[++i];
    } else if (!input) {
      input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!input) {
    throw new Error(
      "Usage: node ndk/cli.js build <file.nova> [-o output.nvm]"
    );
  }

  if (!output) {
    const name = basename(input, extname(input));
    output = `${name}.nvm`;
  }

  return { input, output };
}

function parseRunFileArguments(args) {
  if (args.length !== 1) {
    throw new Error(
      "Usage: node ndk/cli.js run-file <file.nvm>"
    );
  }

  return { input: args[0] };
}

async function buildCommand(args) {
  const { input, output } = parseBuildArguments(args);

  const source = await readFile(
    resolve(input),
    "utf8"
  );

  const result = build(source);

  await writeFile(
    resolve(output),
    result.executable
  );

  console.log(`Built ${output}`);
  console.log(
    `${result.assembled.words.length} machine words`
  );
}

async function runCommand(args) {
  const { input } = parseBuildArguments(args);

  const source = await readFile(
    resolve(input),
    "utf8"
  );

  const result = build(source);

  const vm = new VirtualMachine();
  loadExecutable(vm, result.executable);
  vm.run();
}

async function runFileCommand(args) {
  const { input } = parseRunFileArguments(args);

  const bytes = await readFile(
    resolve(input)
  );

  const vm = new VirtualMachine();
  loadExecutable(vm, bytes);
  vm.run();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === "build") {
    await buildCommand(args);
    return;
  }

  if (command === "run") {
    await runCommand(args);
    return;
  }

  if (command === "run-file") {
    await runFileCommand(args);
    return;
  }

  throw new Error(
    "Usage: node ndk/cli.js <build|run|run-file> [options]"
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
