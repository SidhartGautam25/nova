import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build } from "./toolchain.js";
import { VirtualMachine } from "./vm.js";
import { loadExecutable } from "./loader.js";

const VERSION = "1.0.0";

function printHelp() {
  console.log(`Nova Runtime & Launcher (nova) v${VERSION}
Usage:
  nova <file.nvm | file.nova> [options]

Arguments:
  <file.nvm>     Execute an existing compiled NVM1 binary on the virtual machine.
  <file.nova>    Compile in-memory and execute directly.

Options:
  --max-steps <N>  Maximum instruction execution limit (default: 100000).
  -v, --version    Display runtime version.
  -h, --help       Display this help message.

Examples:
  nova program.nvm
  nova program.nova
  nova program.nvm --max-steps 500000
`);
}

function parseArguments(args) {
  let input = null;
  let maxSteps = 100_000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }
    if (arg === "-v" || arg === "--version") {
      return { version: true };
    }
    if (arg === "--max-steps") {
      const val = Number(args[++i]);
      if (!Number.isInteger(val) || val <= 0) {
        throw new Error("Invalid value for --max-steps: must be a positive integer");
      }
      maxSteps = val;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!input) {
      input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!input) {
    throw new Error("Usage: nova <file.nvm | file.nova> [options]\nRun 'nova --help' for details.");
  }

  return { input, maxSteps };
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    console.log(`nova version ${VERSION}`);
    return;
  }

  const inputPath = resolve(options.input);
  const ext = extname(inputPath).toLowerCase();

  let executableBytes;

  if (ext === ".nova") {
    const source = await readFile(inputPath, "utf8");
    const result = build(source);
    executableBytes = result.executable;
  } else {
    // Assume binary .nvm (or any compiled binary file)
    executableBytes = await readFile(inputPath);
  }

  const vm = new VirtualMachine();
  loadExecutable(vm, executableBytes);
  vm.run(options.maxSteps);
}

main().catch((error) => {
  console.error(`nova error: ${error.message}`);
  process.exitCode = 1;
});

