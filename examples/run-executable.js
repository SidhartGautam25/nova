import { readFile } from "node:fs/promises";

import { VirtualMachine, loadExecutable } from "../ndk/index.js";

const bytes = await readFile("program.nvm");

const vm = new VirtualMachine();

const loaded = loadExecutable(vm, bytes);

console.log("Loaded executable:", loaded);

const result = vm.run();

console.log("Registers:", result.registers);
console.log("Executed instructions:", result.steps);


// to run this -> node examples/run-executable.js

// to run this -> node examples/run-executable.js