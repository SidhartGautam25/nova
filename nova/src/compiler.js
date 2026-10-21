
import { tokenize } from "./lexer.js";
import { parse } from "./parser.js";
import { analyze } from "./semantic.js";
import { generateAssembly } from "./codegen.js";

export function compile(source) {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const analysis = analyze(ast);
  const assembly = generateAssembly(analysis);

  return {
    tokens,
    ast,
    symbols: analysis.symbols,
    assembly,
  };
}
