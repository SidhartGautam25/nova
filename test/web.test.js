import test from "node:test";
import assert from "node:assert/strict";

import { compile, assemble, VirtualMachine, decodeInstruction } from "../ndk/index.js";

test("compiler produces all visualizer artifacts", () => {
  const source = `
    make int x = 10;
    make int y = 20;
    make int sum = x + y;
    print(sum);
  `;

  const compilation = compile(source);
  assert.ok(compilation.tokens.length > 0);
  assert.equal(compilation.ast.type, "Program");
  assert.ok(compilation.symbols.has("x"));
  assert.ok(compilation.symbols.has("y"));
  assert.ok(compilation.symbols.has("sum"));
  assert.ok(compilation.assembly.includes("ADD"));

  const assembled = assemble(compilation.assembly);
  assert.equal(assembled.origin, 0x3000);
  assert.ok(assembled.words.length > 0);
});

test("step trace records execution timeline with register and memory tracking", () => {
  const source = `
    make int a = 5;
    make int b = 3;
    make int c = a + b;
  `;

  const compilation = compile(source);
  const assembled = assemble(compilation.assembly);

  const vm = new VirtualMachine({ writeOutput: () => {} });
  vm.loadProgram(assembled.words, assembled.origin);

  let steps = 0;
  while (!vm.halted && steps < 1000) {
    const pcBefore = vm.pc;
    const word = vm.memory.read(pcBefore);
    const inst = decodeInstruction(word);
    assert.ok(inst);
    vm.step();
    steps++;
  }

  assert.equal(vm.halted, true);
  assert.ok(steps > 0);
});

test("analysis helpers provide bitfields, data-path, stack snapshots, and source-to-CPU mapping", async () => {
  const {
    buildBitfield,
    buildDataPath,
    buildSourceMap,
    buildSymbolMap,
    inferRegisterContext,
    extractStackSnapshot,
  } = await import("../web/analysis.js");

  const source = `make int score = 42;\nprint(score);\n`;
  const comp = compile(source);
  const assembled = assemble(comp.assembly);

  // 1. Source map
  const sourceMap = buildSourceMap(comp.assembly);
  assert.ok(Object.keys(sourceMap).length > 0);
  assert.ok(Object.values(sourceMap).includes(1));

  // 2. Symbol map
  const symbolMap = buildSymbolMap(comp.symbols, assembled.symbols, assembled.words, assembled.origin);
  const foundVar = Object.values(symbolMap).find((s) => s.varName === "score");
  assert.ok(foundVar, "score variable should be mapped in symbol table");

  // 3. Bitfield
  const bf = buildBitfield(0x100A, 0x3000); // LOADI R0, #10
  assert.equal(bf.isInstruction, true);
  assert.ok(bf.fields.length >= 2);
  assert.equal(bf.fields[0].name, "Opcode");

  // 4. DataPath
  const dp = buildDataPath(
    { op: "LOADI", dr: 0, immediate: 10 },
    0x100A,
    0x3000,
    [0, 0, 0, 0, 0, 0, 0xFF00, 0],
    [10, 0, 0, 0, 0, 0, 0xFF00, 0],
    [],
    1
  );
  assert.ok(dp.fetch.includes("MAR = PC"));
  assert.ok(dp.execute.includes("R0"));

  // 5. Register Context Inference
  const vm = new VirtualMachine();
  vm.loadProgram(assembled.words, assembled.origin);
  const ctxStack = inferRegisterContext(6, 0xFF00, symbolMap, vm.memory);
  assert.equal(ctxStack.tag, "stack");

  // 6. Stack Snapshot
  const stack = extractStackSnapshot(vm);
  assert.ok(stack.length > 0);
  assert.equal(stack[0].address, 0xFF00);
  assert.equal(stack[0].isSP, true);
});

