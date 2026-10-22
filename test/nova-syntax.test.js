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

test("allocates local variables in stack frame relative to Frame Pointer (R5)", () => {
  const source = `
    make int a = 11;
    make int b = 22;
    make int c = a + b;
    print(c);
  `;
  const { assembly } = compile(source);

  // 1. Prolog: Save old FP, set FP = SP, reserve space for 3 locals
  assert.match(assembly, /ADDI R6, #-1/);
  assert.match(assembly, /STR R5, R6, #0/);
  assert.match(assembly, /ADD R5, R6, #0/);
  assert.match(assembly, /ADDI R6, #-3/);

  // 2. Variable accesses use LDR/STR relative to R5
  assert.match(assembly, /STR R0, R5, #-1/); // store a
  assert.match(assembly, /STR R0, R5, #-2/); // store b
  assert.match(assembly, /LDR R0, R5, #-1/); // read a
  assert.match(assembly, /LDR R0, R5, #-2/); // read b
  assert.match(assembly, /STR R0, R5, #-3/); // store c
  assert.match(assembly, /LDR R0, R5, #-3/); // read c for print

  // 3. Epilog: Collapse locals and restore previous FP
  assert.match(assembly, /ADD R6, R5, #0/);
  assert.match(assembly, /LDR R5, R6, #0/);
  assert.match(assembly, /ADDI R6, #1/);

  // 4. No static VAR_ labels in .data
  assert.doesNotMatch(assembly, /VAR_0:/);
  assert.doesNotMatch(assembly, /VAR_1:/);
  assert.doesNotMatch(assembly, /VAR_2:/);

  // 5. Execution correctness
  const output = runSource(source);
  assert.equal(output.trim(), "33");
});

test("preserves Frame Pointer (R5) and Stack Pointer (R6) across execution lifecycle", () => {
  const source = `
    make int x = 100;
    make int y = 200;
    print(x);
    x = x + y;
    print(x);
  `;
  const { assembly } = compile(source);
  const { origin, words } = assemble(assembly);

  let output = "";
  const vm = new VirtualMachine({
    writeOutput: (text) => { output += text; },
  });
  vm.loadProgram(words, origin);

  // Run program to completion
  vm.run(100_000);

  // After epilog: R6 (SP) must be restored to 0xFF00, R5 (FP) restored to 0
  assert.equal(vm.registers[6], 0xFF00, "Stack pointer R6 should be restored to 0xFF00");
  assert.equal(vm.registers[5], 0, "Frame pointer R5 should be restored to initial 0");
  assert.equal(output.trim(), "100300");
});

test("supports subroutine definition, argument passing, and return value", () => {
  const source = `
    make function add(int a, int b) : int {
        return a + b;
    }

    make int x = add(12, 30);
    print(x);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "42");
});

test("supports 'make function' syntax with local variables inside function", () => {
  const source = `
    make function compute(int x) : int {
        make int bonus = 10;
        return x + bonus;
    }

    make int ans = compute(50);
    print(ans);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "60");
});

test("supports functions with 3 arguments", () => {
  const source = `
    make function addThree(int a, int b, int c) : int {
        return a + b + c;
    }

    make int total = addThree(100, 20, 5);
    print(total);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "125");
});

test("supports void function called as a statement", () => {
  const source = `
    make function sayHello(int n) : void {
        print("Hello ");
        print(n);
        print(" ");
    }

    sayHello(1);
    sayHello(2);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "Hello 1 Hello 2");
});

test("supports early return and conditionals inside function", () => {
  const source = `
    make function max(int a, int b) : int {
        if (a > b) {
            return a;
        }
        return b;
    }

    print(max(25, 10));
    print(" ");
    print(max(7, 99));
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "25 99");
});

test("supports nested function calls (composition)", () => {
  const source = `
    make function double(int x) : int {
        return x + x;
    }

    make function quad(int x) : int {
        return double(double(x));
    }

    print(quad(6));
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "24");
});

test("supports recursive function calls on the call stack", () => {
  const source = `
    make function sum(int n) : int {
        if (n <= 1) {
            return 1;
        }
        return n + sum(n - 1);
    }

    make int res = sum(5);
    print(res);
  `;
  const output = runSource(source);
  assert.equal(output.trim(), "15");
});

test("rejects function call with incorrect number of arguments", () => {
  const source = `
    make function add(int a, int b) : int {
        return a + b;
    }
    make int res = add(10);
  `;
  assert.throws(
    () => compile(source),
    /Function 'add' expects 2 arguments but got 1/
  );
});

test("rejects 'return' statement outside of a function", () => {
  const source = `
    make int x = 10;
    return x;
  `;
  assert.throws(
    () => compile(source),
    /'return' can only be used inside a function/
  );
});

test("rejects duplicate function declaration", () => {
  const source = `
    make function foo() : int { return 1; }
    make function foo() : int { return 2; }
  `;
  assert.throws(
    () => compile(source),
    /Function 'foo' is already declared/
  );
});

test("rejects old 'fun' syntax when 'make function' is strictly required", () => {
  const source = `
    fun foo(a, b) { return a + b; }
  `;
  assert.throws(
    () => compile(source),
    /Expected a statement/
  );
});

test("supports 'make char ch = 'a';' and printing character", () => {
  const source = `
    make char ch1 = 'N';
    make char ch2 = 'V';
    make char ch3 = 'M';
    print(ch1);
    print(ch2);
    print(ch3);
  `;
  const output = runSource(source);
  assert.equal(output, "NVM");
});

test("supports character escape sequences '\\n', '\\t', '\\0'", () => {
  const source = `
    make char a = 'X';
    make char newline = '\\n';
    make char b = 'Y';
    print(a);
    print(newline);
    print(b);
  `;
  const output = runSource(source);
  assert.equal(output, "X\nY");
});

test("supports 'make bool result = false;' and 'make bool flag = true;' with boolean printing", () => {
  const source = `
    make bool flagTrue = true;
    make bool flagFalse = false;
    print(flagTrue);
    print(" ");
    print(flagFalse);
  `;
  const output = runSource(source);
  assert.equal(output, "true false");
});

test("supports conditionals with boolean variables", () => {
  const source = `
    make bool isReady = true;
    if (isReady) {
        print("Ready!");
    } else {
        print("Waiting...");
    }
  `;
  const output = runSource(source);
  assert.equal(output, "Ready!");
});

test("supports character comparisons", () => {
  const source = `
    make char first = 'a';
    make char second = 'z';
    make bool isLess = first < second;
    print(isLess);
  `;
  const output = runSource(source);
  assert.equal(output, "true");
});

test("supports boolean comparisons with == and !=", () => {
  const source = `
    make bool a = true;
    make bool b = false;
    make bool match = (a == b);
    make bool diff = (a != b);
    print(match);
    print(" ");
    print(diff);
  `;
  const output = runSource(source);
  assert.equal(output, "false true");
});

test("supports functions with char and bool parameters and return types", () => {
  const source = `
    make function isLetterA(char c) : bool {
        if (c == 'A') {
            return true;
        }
        return false;
    }

    make bool r1 = isLetterA('A');
    make bool r2 = isLetterA('B');
    print(r1);
    print(" ");
    print(r2);
  `;
  const output = runSource(source);
  assert.equal(output, "true false");
});

test("enforces type checking for char variables", () => {
  const source = `
    make char ch = 100;
  `;
  assert.throws(
    () => compile(source),
    /Cannot assign integer to char variable 'ch'/
  );
});

test("enforces type checking for bool variables", () => {
  const source = `
    make bool flag = "true";
  `;
  assert.throws(
    () => compile(source),
    /Cannot assign string to bool variable 'flag'/
  );
});

