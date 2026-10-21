import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import { build } from "./toolchain.js";
import { compile } from "./compiler.js";

const VERSION = "1.0.0";

function printHelp() {
  console.log(`Nova Compiler (novac) v${VERSION}
Usage:
  novac <file.nova> [options]

Options:
  -o <path>       Specify the output executable (.nvm) path.
  -S, --emit-asm  Emit intermediate assembly text (.asm) alongside executable.
  --tokens        Print tokenized stream and exit.
  --ast           Print parsed Abstract Syntax Tree (AST) as JSON and exit.
  -v, --version   Display compiler version.
  -h, --help      Display this help message.

Examples:
  novac hello.nova
  novac hello.nova -o hello.nvm
  novac hello.nova -S
`);
}

function parseArguments(args) {
  let input = null;
  let output = null;
  let emitAsm = false;
  let dumpTokens = false;
  let dumpAst = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }
    if (arg === "-v" || arg === "--version") {
      return { version: true };
    }
    if (arg === "-o") {
      if (!args[i + 1]) {
        throw new Error("Missing output path after -o");
      }
      output = args[++i];
    } else if (arg === "-S" || arg === "--emit-asm") {
      emitAsm = true;
    } else if (arg === "--tokens") {
      dumpTokens = true;
    } else if (arg === "--ast") {
      dumpAst = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!input) {
      input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!input) {
    throw new Error("Usage: novac <file.nova> [options]\nRun 'novac --help' for details.");
  }

  return { input, output, emitAsm, dumpTokens, dumpAst };
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArguments(args);

  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    console.log(`novac version ${VERSION}`);
    return;
  }

  const inputPath = resolve(options.input);
  const source = await readFile(inputPath, "utf8");

  if (options.dumpTokens || options.dumpAst) {
    const compilation = compile(source);
    if (options.dumpTokens) {
      console.log(JSON.stringify(compilation.tokens, null, 2));
    }
    if (options.dumpAst) {
      console.log(JSON.stringify(compilation.ast, null, 2));
    }
    return;
  }

  const result = build(source);

  const base = basename(options.input, extname(options.input));
  const outputPath = resolve(options.output ?? `${base}.nvm`);

  await writeFile(outputPath, result.executable);
  console.log(`Built ${outputPath} (${result.assembled.words.length} machine words)`);

  if (options.emitAsm) {
    const asmPath = resolve(`${base}.asm`);
    await writeFile(asmPath, result.assembly, "utf8");
    console.log(`Emitted assembly ${asmPath}`);
  }
}

main().catch((error) => {
  console.error(`novac error: ${error.message}`);
  process.exitCode = 1;
});

