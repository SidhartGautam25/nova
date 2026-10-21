# Full Computer: Nova, NVM, and NDK

A complete, self-contained educational computing platform written in modern JavaScript (ES Modules). The project includes a high-level programming language (**Nova**), a 16-bit register-based virtual machine (**NVM**), and an integrated development kit and CLI toolchain (**NDK**).

```
+-------------------------------------------------------------+
|                      Nova Source Code                       |
|                     (examples/hello.nova)                   |
+-------------------------------------------------------------+
                              |
                              v  [Nova Compiler]
+-------------------------------------------------------------+
|                     Assembly Text (.asm)                    |
|             .ORIG x3000, LD, ST, ADD, TRAP...               |
+-------------------------------------------------------------+
                              |
                              v  [NVM Assembler]
+-------------------------------------------------------------+
|                     16-bit Machine Words                    |
|                   [0x6001, 0x1234, 0xF025]                  |
+-------------------------------------------------------------+
                              |
                              v  [NVM Executable Encoder]
+-------------------------------------------------------------+
|                    NVM1 Binary Executable                   |
|                   Magic: "NVM1", Header: 12B                |
+-------------------------------------------------------------+
                              |
                              v  [NVM Loader & VM Runtime]
+-------------------------------------------------------------+
|                 Nova Virtual Machine (NVM)                  |
|          16-bit CPU, 8 Registers (R0-R7), 64KW RAM          |
|                  Terminal I/O (TRAP x21/x22)                |
+-------------------------------------------------------------+
```

---

## Architecture at a Glance

The codebase is divided into three distinct modules:

| Subsystem | Name | Purpose | Role & Analog |
| :--- | :--- | :--- | :--- |
| **[`nova/`](./nova/README.md)** | **Nova Language** | High-level programming language compiler | Lexer, parser, semantic analyzer, code generator |
| **[`nvm/`](./nvm/README.md)** | **Nova Virtual Machine** | 16-bit RISC VM architecture and assembler | CPU, memory, ISA, assembler, loader, binary format (like JVM) |
| **[`ndk/`](./ndk/README.md)** | **Nova Development Kit** | Toolchain integration and command-line driver | Compiler driver, build pipeline, VM runner, CLI (like JDK) |

---

## Step-by-Step User Guide

### 1. Prerequisites
- **Node.js**: Version 18+ (tested on Node.js 20+ and 24+)
- No external npm packages required (pure Node.js standard library)

### 2. Writing a Nova Program
Nova programs use the `.nova` file extension. The language supports variable declarations, arithmetic expressions (`+`, `-`, nested parenthesized groups), integer printing, and ASCII string literal printing.

Create a file named `myprogram.nova`:

```nova
// Declare variables
let base = 100;
let multiplier = 5;
let bonus = 42;

// Arithmetic expressions
let total = (base + bonus) - multiplier;

// Print string literals and integer values
print("Computing total score:");
print(total);
```

### 3. Compiling to a Binary Executable (`.nvm`)
Use the NDK build command to compile Nova source code into an NVM executable file:

```bash
node ndk/cli.js build myprogram.nova -o myprogram.nvm
```

Output:
```
Built myprogram.nvm
185 machine words
```

If you omit `-o`, the CLI automatically defaults to `<name>.nvm`:
```bash
node ndk/cli.js build myprogram.nova
# Generates myprogram.nvm
```

### 4. Running a Compiled Executable
You can run an already compiled `.nvm` executable without invoking the compiler:

```bash
node ndk/cli.js run-file myprogram.nvm
```

Output:
```
Computing total score:
137
```

### 5. Compiling and Running in One Step
For development, you can compile and immediately execute source code in memory:

```bash
node ndk/cli.js run myprogram.nova
```

### 6. Trying the Built-In Example
A complete example is included in [`examples/hello.nova`](./examples/hello.nova):

```bash
node ndk/cli.js run examples/hello.nova
```

Expected output:
```
Hello4240
```

---

## Running the Automated Test Suite

The test suite validates the binary executable encoding/decoding, header verification, format corruption checks, and address space constraints using Node's built-in test runner:

```bash
node --test
```

---

## Subsystem Documentation

For detailed architectural specifications, integration guidelines, and internal designs, consult each component's dedicated documentation:

- **[Nova Compiler Reference (`nova/README.md`)](./nova/README.md)**: Lexer tokenization, AST structures, semantic type checking, assembly code generation, integer printer subroutine, and compiler integration contracts.
- **[NVM Virtual Machine Reference (`nvm/README.md`)](./nvm/README.md)**: 16-bit register architecture, memory map, condition codes, complete ISA opcode table, 2-pass assembler, NVM1 binary layout, trap vectors, and execution lifecycle.
- **[NDK Development Kit Reference (`ndk/README.md`)](./ndk/README.md)**: Toolchain build pipeline, CLI options, public API contracts, and integration recipes.

