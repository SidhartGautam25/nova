import test from "node:test";
import assert from "node:assert/strict";

import { compile, assemble, VirtualMachine } from "../ndk/index.js";

function runSource(source) {
  const { assembly } = compile(source);
  const { origin, words } = assemble(assembly);
  let stdout = "";
  const vm = new VirtualMachine({
    writeOutput: (text) => {
      stdout += text;
    },
  });
  vm.loadProgram(words, origin);
  vm.run(100_000);
  return stdout;
}

test("supports 'make int var_name = value;' syntax", () => {
  const source = `
    make int a = 10;
    make int b = 25;
    make int sum = a + b;
    print(sum);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "35");
});

test("supports 'int var_name = value;' syntax", () => {
  const source = `
    int x = 40;
    int y = 2;
    int result = x + y;
    print(result);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "42");
});

test("supports legacy 'let var_name = value;' syntax", () => {
  const source = `
    let x = 50;
    let y = 10;
    print(x - y);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "40");
});

test("enforces type checking for 'make int' variables", () => {
  const source = `
    make int msg = "hello";
  `;
  assert.throws(
    () => compile(source),
    /Cannot assign string to integer variable/
  );
});

test("rejects 'make' without type keyword", () => {
  const source = `
    make foo = 10;
  `;
  assert.throws(
    () => compile(source),
    /Expected 'int' after 'make'/
  );
});

test("supports 'run x times { ... }' loop", () => {
  const source = `
    make int x = 4;
    run x times {
      print("A");
    }
  `;
  const output = runSource(source);
  assert.equal(output, "AAAA");
});

test("supports loop accumulation and assignment statement", () => {
  const source = `
    make int count = 5;
    make int sum = 0;
    run count times {
      sum = sum + 3;
    }
    print(sum);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "15");
});

test("skips loop body if count is zero or negative", () => {
  const source = `
    make int zero = 0;
    run zero times {
      print("FAIL");
    }
    print("DONE");
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "DONE");
});

test("supports nested loops", () => {
  const source = `
    make int outer = 2;
    make int inner = 3;
    make int counter = 0;
    run outer times {
      run inner times {
        counter = counter + 1;
      }
    }
    print(counter);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "6");
});

test("rejects non-integer expression for loop count", () => {
  const source = `
    run "hello" times {
      print("NO");
    }
  `;
  assert.throws(
    () => compile(source),
    /Loop count expression must evaluate to an integer/
  );
});

test("supports if-else if-else conditionals", () => {
  const source1 = `
    make int x = 15;
    if (x > 10) {
      print("GT");
    } else if (x == 10) {
      print("EQ");
    } else {
      print("LT");
    }
  `;
  assert.equal(runSource(source1).trim(), "GT");

  const source2 = `
    make int x = 10;
    if (x > 10) {
      print("GT");
    } else if (x == 10) {
      print("EQ");
    } else {
      print("LT");
    }
  `;
  assert.equal(runSource(source2).trim(), "EQ");

  const source3 = `
    make int x = 3;
    if (x > 10) {
      print("GT");
    } else if (x == 10) {
      print("EQ");
    } else {
      print("LT");
    }
  `;
  assert.equal(runSource(source3).trim(), "LT");
});

test("supports all comparison operators", () => {
  const source = `
    if (5 > 3) { print("1"); }
    if (3 < 5) { print("2"); }
    if (5 >= 5) { print("3"); }
    if (5 <= 5) { print("4"); }
    if (5 == 5) { print("5"); }
    if (5 != 4) { print("6"); }
  `;
  assert.equal(runSource(source).trim(), "123456");
});

test("supports while loops", () => {
  const source = `
    make int count = 3;
    while (count > 0) {
      print(count);
      count = count - 1;
    }
  `;
  assert.equal(runSource(source).trim(), "321");
});

test("supports break and continue in while loops", () => {
  const source = `
    make int x = 0;
    while (x < 6) {
      x = x + 1;
      if (x == 2) {
        continue;
      }
      if (x == 5) {
        break;
      }
      print(x);
    }
  `;
  assert.equal(runSource(source).trim(), "134");
});

test("supports break in run loops", () => {
  const source = `
    make int iter = 0;
    run 10 times {
      iter = iter + 1;
      if (iter == 3) {
        break;
      }
    }
    print(iter);
  `;
  assert.equal(runSource(source).trim(), "3");
});

test("supports continue in run loops", () => {
  const source = `
    make int count = 0;
    make int pass = 0;
    run 5 times {
      pass = pass + 1;
      if (pass == 3) {
        continue;
      }
      count = count + 1;
    }
    print(count);
  `;
  assert.equal(runSource(source).trim(), "4");
});

test("rejects break outside of a loop", () => {
  const source = `
    make int x = 10;
    break;
  `;
  assert.throws(
    () => compile(source),
    /'break' can only be used inside a loop/
  );
});

test("rejects continue outside of a loop", () => {
  const source = `
    make int x = 10;
    continue;
  `;
  assert.throws(
    () => compile(source),
    /'continue' can only be used inside a loop/
  );
});
