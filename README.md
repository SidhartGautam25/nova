# Full Computer: Nova, NVM, and NDK

A standalone, self-contained educational computing platform written in modern JavaScript (ES Modules). The project includes a high-level programming language (**Nova**), a 16-bit register-based virtual machine (**NVM**), and an integrated development kit providing first-class **`novac`** and **`nova`** commands (**NDK**).

```
+-------------------------------------------------------------+
|                      Nova Source Code                       |
|                     (examples/hello.nova)                   |
+-------------------------------------------------------------+
                              |
                              v  [novac: Nova Compiler]
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
                              v  [nova: NVM Launcher & VM Runtime]
+-------------------------------------------------------------+
|                 Nova Virtual Machine (NVM)                  |
|          16-bit CPU, 8 Registers (R0-R7), 64KW RAM          |
|                  Terminal I/O (TRAP x21/x22)                |
+-------------------------------------------------------------+
```

---

## Zero-npm Standalone Installation

No npm packages or package managers required. Just clone the repo and add `bin` to your `PATH` (just like setting up Java, Python, or Go).

### Option A: Automatic 1-Click Setup

- **Windows**:
  Double-click `setup.bat` (or run it in Command Prompt / PowerShell):
  ```cmd
  setup.bat
  ```
- **macOS / Linux**:
  Run `setup.sh`:
  ```bash
  chmod +x setup.sh && ./setup.sh
  ```

### Option B: Manual Setup (Standard PATH)

Add the `computer/bin` directory to your user or system `PATH`:

- **Windows**:
  1. Open Start Menu $\to$ search for **Environment Variables** $\to$ click **Edit the system environment variables**.
  2. Click **Environment Variables...**.
  3. Under User variables, select **Path** and click **Edit...**.
  4. Click **New** and paste the full path to your `computer\bin` folder (e.g. `D:\fullcomputer\computer\bin`).
  5. Click **OK** to save.

- **macOS / Linux**:
  Add this line to your `~/.bashrc` or `~/.zshrc`:
  ```bash
  export PATH="/path/to/computer/bin:$PATH"
  ```

Open a **new terminal**, and you can now run `novac` and `nova` directly from any folder!

```bash
novac --help
nova --help
```

---

## Step-by-Step User Guide

### 1. Writing a Nova Program
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

### 2. Compiling with `novac` (Like `javac`)
Use `novac` to compile Nova source code into a standalone `.nvm` binary:

```bash
novac myprogram.nova
```

Output:
```
Built D:\projects\myprogram.nvm (185 machine words)
```

You can specify a custom output path with `-o`:
```bash
novac myprogram.nova -o custom_output.nvm
```

To also inspect the generated assembly code, pass `-S` or `--emit-asm`:
```bash
novac myprogram.nova -S
# Generates both myprogram.nvm and myprogram.asm
```

### 3. Running an Executable with `nova` (Like `java`)
Execute the compiled `.nvm` binary on the virtual machine:

```bash
nova myprogram.nvm
```

Output:
```
Computing total score:
137
```

### 4. Running Source Code Directly
You can also compile and immediately execute source code in a single command:

```bash
nova myprogram.nova
```

### 5. Trying the Built-In Example
A complete example is included in [`examples/hello.nova`](./examples/hello.nova):

```bash
# Compile and run in one step:
nova examples/hello.nova

# Or compile then run:
novac examples/hello.nova -o hello.nvm
nova hello.nvm
```

Expected output:
```
Hello4240
```

---

## Command Reference

### `novac` (Compiler Driver)
```
Usage:
  novac <file.nova> [options]

Options:
  -o <path>       Specify the output executable (.nvm) path.
  -S, --emit-asm  Emit intermediate assembly text (.asm) alongside executable.
  --tokens        Print tokenized stream and exit.
  --ast           Print parsed Abstract Syntax Tree (AST) as JSON and exit.
  -v, --version   Display compiler version.
  -h, --help      Display help message.
```

### `nova` (Runtime & Launcher)
```
Usage:
  nova <file.nvm | file.nova> [options]

Arguments:
  <file.nvm>       Execute compiled NVM1 binary on the virtual machine.
  <file.nova>      Compile in-memory and execute directly.

Options:
  --max-steps <N>  Maximum instruction execution limit (default: 100000).
  -v, --version    Display runtime version.
  -h, --help       Display help message.
```

---

## Running the Automated Test Suite

Run the built-in Node test suite:

```bash
node --test
```

---

## Subsystem Documentation

- **[Nova Compiler Reference (`nova/README.md`)](./nova/README.md)**: Lexer tokenization, AST structures, semantic type checking, assembly code generation, integer printer subroutine, and compiler integration contracts.
- **[NVM Virtual Machine Reference (`nvm/README.md`)](./nvm/README.md)**: 16-bit register architecture, memory map, condition codes, complete ISA opcode table, 2-pass assembler, NVM1 binary layout, trap vectors, and execution lifecycle.
- **[NDK Development Kit Reference (`ndk/README.md`)](./ndk/README.md)**: Toolchain build pipeline, CLI options, public API contracts, and integration recipes.
