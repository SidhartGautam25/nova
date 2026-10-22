import { compile } from "../nova/src/index.js";
import { assemble, encodeExecutable } from "../nvm/src/index.js";

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
