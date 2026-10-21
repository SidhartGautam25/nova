import { compile } from "./compiler.js";
import { assemble } from "./assembler.js";
import { encodeExecutable } from "./executable.js";

export function build(source) {
  const compilation = compile(source);

  const assembled = assemble(compilation.assembly);

  const executable = encodeExecutable({
    origin: assembled.origin,
    words: assembled.words,
  });

  return {
    ...compilation,
    assembled,
    executable,
  };
}

