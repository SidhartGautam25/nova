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
|       .ORIG x3000, Activation Records (FP/SP), LDR, STR...  |
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

## Standalone Download & Installation (No Git Cloning, No npm)

You do **not** need to clone the repository or use npm. You can download and install Nova just like Python, Go, or the Java JDK.

### Method 1: One-Line Terminal Installer (Fastest)

Run the one-line install command for your operating system:

#### Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/SidhartGautam25/nova/main/install.ps1 | iex
```

#### Windows (Command Prompt / CMD):
```cmd
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/SidhartGautam25/nova/main/install.ps1 | iex"
```

#### macOS / Linux (Terminal):
```bash
curl -fsSL https://raw.githubusercontent.com/SidhartGautam25/nova/main/install.sh | bash
```

**What this does automatically:**
1. Downloads the latest clean `nova-sdk.zip`.
2. Extracts it to `~/.nova` (`C:\Users\<username>\.nova` on Windows).
3. Adds the `bin` directory to your persistent `PATH` and sets `NOVA_HOME`.
4. Commands `nova` and `novac` are instantly available!

---

### Method 2: Direct ZIP Download

If you prefer downloading manually:
1. Go to the repository's `dist/` folder or GitHub Releases and download **`nova-sdk.zip`**.
2. Unzip it to any folder on your computer (e.g. `C:\nova-sdk` or `D:\tools\nova-sdk`).
3. Inside the unzipped folder:
   - **On Windows**: Double-click **`setup.bat`** (it automatically adds the folder to your User `PATH`).
   - **On macOS / Linux**: Run `./setup.sh`.
4. Open a new terminal and run:
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

## Packaging the Distribution SDK (For Maintainers)

To produce a fresh `nova-sdk.zip` distribution package for release:

```bash
node scripts/package-sdk.js
```

This creates a clean, lightweight bundle in `dist/nova-sdk/` and compresses it to `dist/nova-sdk.zip`, stripping out git files, internal test harnesses, and development files.

---

## Running the Automated Test Suite

Run the built-in Node test suite:

```bash
node --test
```

---

## Systems Architecture: Stack-Allocated Locals & Activation Records

Nova implements standard systems-level activation records (call stack frames) aligned with C, ARM, and x86 architectures rather than static global `.data` allocation:

```
High Memory (0xFF00)
    ┌──────────────────────────┐
    │ Caller's Stack Frame     │
    ├──────────────────────────┤
    │ Saved Frame Pointer (R5) │ <── Active Frame Pointer (R5)
    ├──────────────────────────┤
    │ Local Variable 0         │  [R5 - 1]
    ├──────────────────────────┤
    │ Local Variable 1         │  [R5 - 2]
    ├──────────────────────────┤
    │ Temporary Evaluation     │
    ├──────────────────────────┤
    │ ...                      │ <── Stack Pointer (R6)
Low Memory (grows downwards)
```

- **R6 (Stack Pointer - SP)**: Points to the top of the downward-growing stack (initialized to `0xFF00`).
- **R5 (Frame Pointer - FP)**: Anchors the active function/block frame.
- **Prolog**:
  ```asm
  ADDI R6, #-1        ; Push caller's FP
  STR R5, R6, #0
  ADD R5, R6, #0      ; Establish new FP = SP
  ADDI R6, #-N        ; Allocate N local variables
  ```
- **Local Variable Access**:
  ```asm
  LDR R0, R5, #-1     ; Read local variable 0
  STR R0, R5, #-1     ; Write local variable 0
  ```
- **Epilog**:
  ```asm
  ADD R6, R5, #0      ; Collapse locals (SP = FP)
  LDR R5, R6, #0      ; Restore caller's FP
  ADDI R6, #1         ; Pop saved FP
  ```

---

## Subsystem Documentation

- **[Nova Compiler Reference (`nova/README.md`)](./nova/README.md)**: Lexer tokenization, AST structures, semantic type checking, assembly code generation, integer printer subroutine, and compiler integration contracts.
- **[NVM Virtual Machine Reference (`nvm/README.md`)](./nvm/README.md)**: 16-bit register architecture, memory map, condition codes, complete ISA opcode table, 2-pass assembler, NVM1 binary layout, trap vectors, and execution lifecycle.
- **[NDK Development Kit Reference (`ndk/README.md`)](./ndk/README.md)**: Toolchain build pipeline, CLI options, public API contracts, and integration recipes.
