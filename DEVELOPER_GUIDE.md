# Developer Guide: Working Locally on Nova, NVM, and NDK

This guide explains how to develop, modify, and test **Nova** (the compiler), **NVM** (the virtual machine), and **NDK** (the development kit) completely locally on your computer.

> [!IMPORTANT]
> **You do NOT need to push to GitHub, build release packages, or run the web installer (`irm ... | iex`) to test your changes!**
> Everything in this repository runs directly from your local source files using Node.js ES Modules. Any change you save in `nova/src/`, `nvm/src/`, or `ndk/` is **immediately active** the next time you run a command.

---

## 1. Clean Architectural Structure & Imports

The project is organized into three clean layers, each with a single entry point (`index.js`):

```
                       ┌───────────────────────────────┐
                       │     Nova Source (.nova)       │
                       └──────────────┬────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  NOVA COMPILER (nova/src/index.js)                                            │
│  - lexer.js        : Character stream -> Tokens (LexerError)                  │
│  - parser.js       : Tokens -> AST (ParserError)                              │
│  - semantic.js     : AST -> Type-checked AST & Symbols (SemanticError)       │
│  - codegen.js      : AST -> 16-bit Assembly text (CodegenError)               │
│  - compiler.js     : Main `compile(source)` pipeline                          │
└─────────────────────────────────────┬─────────────────────────────────────────┘
                                      │ Emits Assembly (.asm)
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  NVM ENGINE (nvm/src/index.js)                                                │
│  - assembler.js    : 2-Pass Assembler (Assembly -> Machine Words)             │
│  - executable.js   : Encodes & Decodes NVM1 binary container (.nvm)           │
│  - loader.js       : Maps binary words into VM memory                         │
│  - cpu.js          : 16-bit CPU core (Fetch-Decode-Execute, R0-R7, CC)        │
│  - memory.js       : 64K Word Memory Bus                                      │
│  - traps.js        : Software Interrupts (PUTS, OUT, HALT)                    │
│  - vm.js           : VirtualMachine runtime class                             │
│  - isa.js          : Instruction encoding & opcode definitions                │
└─────────────────────────────────────┬─────────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  NDK TOOLCHAIN (ndk/index.js)                                                 │
│  - Imports and unifies everything from `nova/src` and `nvm/src`               │
│  - Provides the one-stop `build(source)` pipeline                             │
│  - CLI wrappers: novac-cli.js (Compiler) & nova-cli.js (Runtime)              │
└───────────────────────────────────────────────────────────────────────────────┘
```

### How to Import in Your Code or Tests
Instead of importing from dozens of scattered files, import directly from the unified entry points:

```javascript
// To use anything in the toolchain (compiler, assembler, VM, etc.):
import { build, compile, assemble, VirtualMachine, encodeExecutable } from "./ndk/index.js";

// Or import specifically from the compiler:
import { compile, tokenize, parse, analyze } from "./nova/src/index.js";

// Or import specifically from the VM:
import { VirtualMachine, assemble, loadExecutable } from "./nvm/src/index.js";
```

---

## 2. One-Time Setup: Linking Local Binaries to Your PATH

You can run `nova` and `novac` from anywhere in your terminal pointing directly to your local working directory.

### On Windows
Open a terminal in this repository and run:
```cmd
setup.bat
```

### On macOS / Linux
```bash
./setup.sh
```

**What this does:**
It adds `<repo>/bin` to your user `PATH`. The scripts inside `bin/` simply forward to your local `ndk/nova-cli.js` and `ndk/novac-cli.js`. Whenever you edit any code in this folder, the global `nova` and `novac` commands automatically run your updated code!

---

## 3. Daily Development Workflow

When you want to add or change something in Nova, NVM, or NDK, follow these simple steps:

### Step 1: Make Your Edits
Edit any file in:
- `nova/src/` for language syntax, parsing, semantic checks, or assembly generation.
- `nvm/src/` for instructions, CPU behavior, VM execution, traps, or binary format.
- `ndk/` for build orchestrations or CLI commands.

### Step 2: Write a Sample Program
Create a `.nova` file in the root directory (or edit `program.nova`):

```nova
// test_sample.nova
make int a = 20;
make int b = 22;

make int sum = a + b;

if (sum == 42) {
    print("The answer is 42!\n");
}

run 3 times {
    print("Looping...\n");
}
```

### Step 3: Run Your Sample Program

You have three easy ways to execute your test program:

#### Method A: Direct In-Memory Run (Fastest)
Compiles and executes in the virtual machine in one command without saving a binary file:
```bash
node ndk/nova-cli.js test_sample.nova
```
*(Or simply `nova test_sample.nova` if you ran `setup.bat`)*

#### Method B: Two-Step (Compile to `.nvm`, then execute)
1. **Compile to binary:**
   ```bash
   node ndk/novac-cli.js test_sample.nova -o test_sample.nvm
   ```
2. **Execute the binary:**
   ```bash
   node ndk/nova-cli.js test_sample.nvm
   ```

#### Method C: Using the `bin` wrappers directly
```bash
.\bin\nova test_sample.nova
```

---

## 4. Debugging & Pipeline Introspection

When testing a new language feature or debugging a syntax error, `novac-cli.js` provides built-in introspection flags:

### 1. View Token Stream (Lexer output)
See exactly how your source code was tokenized:
```bash
node ndk/novac-cli.js test_sample.nova --tokens
```

### 2. View Abstract Syntax Tree (Parser output)
See the structured AST produced by the parser:
```bash
node ndk/novac-cli.js test_sample.nova --ast
```

### 3. View Intermediate Assembly Text
Emit the generated LC-3 assembly code alongside the executable:
```bash
node ndk/novac-cli.js test_sample.nova -S
```
This generates `test_sample.asm`, allowing you to inspect the exact instructions emitted by `codegen.js`.

---

## 4. Subroutines & ABI Calling Convention Guide

Nova functions implement a formal C / System V ABI calling convention using NVM's 16-bit register file and downward-growing stack (`0xFF00`):

### Language Syntax
```nova
make function add(int a, int b) : int {
    return a + b;
}

make int res = add(10, 20);
print(res);
```

### Architecture & Register Allocation in Function Calls
- **`R0`–`R2`**: Parameter registers (caller evaluates arguments into `R0`, `R1`, `R2`).
- **`R0`**: Return value register (callee leaves the final result in `R0`).
- **`R5`**: **Frame Pointer (FP)**. Anchors the active function activation record. Parameters live at `R5 - 1`, `R5 - 2`; locals live at `R5 - 3`, etc.
- **`R6`**: **Stack Pointer (SP)**. Points to the current top of stack.
- **`R7`**: **Link Register**. Holds the return landing address (`JMP R7`).

### Callee Contract (Prolog & Epilog)
```asm
FN_myFunction:
    ; 1. Prolog: Save Link Register & Old FP
    ADDI R6, #-1; STR R7, R6, #0   ; Stack: return address
    ADDI R6, #-1; STR R5, R6, #0   ; Stack: old FP
    ADD R5, R6, #0                 ; FP = SP
    ; 2. Spill register arguments to local frame
    ADDI R6, #-1; STR R0, R6, #0   ; Param 0 at R5 - 1
    ; 3. Allocate local variables
    ADDI R6, #-numLocals
    ; ... Function body ...
    ; 4. Epilog & Return
FN_EPILOG_myFunction:
    ADD R6, R5, #0                 ; Collapse frame (SP = FP)
    LDR R5, R6, #0; ADDI R6, #1    ; Restore caller's FP
    LDR R7, R6, #0; ADDI R6, #1    ; Restore return address
    JMP R7                         ; Return to caller!
```

---

## 5. Running and Writing Automated Tests

Automated tests use Node.js built-in test runner (`node:test`).

### Run all tests
```bash
npm test
```
*(Or directly `node --test`)*

### Adding a New Test
Add your test to `test/nova-syntax.test.js` or create a new test file in `test/`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { compile, assemble, VirtualMachine } from "../ndk/index.js";

test("my new feature works", () => {
  const source = `
    make int x = 10;
    print(x * 2);
  `;

  const { assembly } = compile(source);
  const { origin, words } = assemble(assembly);

  let output = "";
  const vm = new VirtualMachine({
    writeOutput: (text) => { output += text; },
  });

  vm.loadProgram(words, origin);
  vm.run(100_000);

  assert.equal(output.trim(), "20");
});
```

---

## 6. How GitHub Installation Works & How to Publish Updates

When a user runs the one-line installer from GitHub:
```powershell
irm https://raw.githubusercontent.com/SidhartGautam25/nova/main/install.ps1 | iex
```
The installer script downloads **`dist/nova-sdk.zip`** directly from the repository and extracts it to `~/.nova`.

### The 3 Steps to Publish Your Changes to GitHub

Because the installer downloads `dist/nova-sdk.zip`, you must update that ZIP file before pushing to GitHub:

```bash
# 1. Update the dist/ package and dist/nova-sdk.zip
npm run build

# 2. Run all tests to make sure everything passes
npm test

# 3. Commit and push to GitHub
git add .
git commit -m "Add new features"
git push
```

**That's all!**
- `npm run build` (or `node scripts/package-sdk.js`) automatically gathers your latest `nova/src`, `nvm/src`, `ndk`, and `bin` into `dist/nova-sdk/` and compresses it into `dist/nova-sdk.zip`.
- Once you `git push`, any user who installs via GitHub will immediately receive your updated features.

---

## Summary Cheat Sheet

| Task | Command |
| :--- | :--- |
| **Run `.nova` program directly** | `node ndk/nova-cli.js program.nova` |
| **Compile `.nova` to `.nvm`** | `node ndk/novac-cli.js program.nova -o program.nvm` |
| **Run `.nvm` binary in VM** | `node ndk/nova-cli.js program.nvm` |
| **Inspect Tokens** | `node ndk/novac-cli.js program.nova --tokens` |
| **Inspect AST** | `node ndk/novac-cli.js program.nova --ast` |
| **Inspect Assembly (`.asm`)** | `node ndk/novac-cli.js program.nova -S` |
| **Start Web Visualizer UI** | `npm run web` (or `node web/server.js`) |
| **Run all tests** | `npm test` |
| **Package SDK ZIP** | `node scripts/package-sdk.js` |

