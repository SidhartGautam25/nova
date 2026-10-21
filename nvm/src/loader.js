
import { decodeExecutable } from "./executable.js";

export function loadExecutable(vm, bytes) {
  // Decode and validate the entire file first.
  const executable = decodeExecutable(bytes);

  // Only modify the VM after decoding succeeds.
  vm.reset();

  vm.loadProgram(
    executable.words,
    executable.origin
  );

  return {
    origin: executable.origin,
    wordCount: executable.words.length,
    version: executable.version,
  };
}
