import { readFile, writeFile } from "node:fs/promises";

import { assemble } from "../ndk/assembler.js";
import { encodeExecutable } from "../ndk/executable.js";

const source = await readFile(
  "program.asm",
  "utf8"
);

const assemblyResult = assemble(source);

const bytes = encodeExecutable({
  origin: assemblyResult.origin,
  words: assemblyResult.words,
});

await writeFile("program.nvm", bytes);

console.log("Executable created: program.nvm");
console.log("Origin:", `0x${assemblyResult.origin.toString(16)}`);
console.log("Words:", assemblyResult.words.length);
console.log("Bytes:", bytes.length);

// to run -> node examples/build-executable.js

// to run -> node examples/build-executable.js