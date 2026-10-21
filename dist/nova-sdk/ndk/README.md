# NDK: Nova Development Kit

The **Nova Development Kit (NDK)** is the developer-facing toolkit, build orchestrator, and command-line driver uniting the **Nova language** and the **Nova Virtual Machine (NVM)**. 

Just as the JDK (Java Development Kit) provides `javac` and the `java` launcher for the JVM, the NDK provides the compilation toolchain, binary serializer, and command-line interface for NVM.

---

## 1. NDK Architecture & Responsibilities

The NDK deliberately does not reimplement compiler or virtual machine internals. Instead, it serves as the orchestration layer:

```
[ CLI: cli.js ]  ──(User Commands)──►  [ Toolchain: toolchain.js ]
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
     [ Nova Compiler: compile() ]                                 [ NVM Assembler: assemble() ]
                 │                                                             │
                 ▼                                                             ▼
         Assembly Text (.asm)                                         16-bit Machine Words
                                                                               │
                                                                               ▼
                                                                  [ NVM Serializer: encode() ]
                                                                               │
                                                                               ▼
                                                                     NVM1 Binary (.nvm)
```

### Why a Separate NDK Layer?
If compiler orchestration is embedded directly into the CLI, reusing the compilation pipeline in test suites, editors, language servers, or web runners becomes difficult. 

The dedicated `ndk/toolchain.js` module provides a single integration point that can be driven by the CLI, automated tests, or external third-party tools.

---

## 2. Command-Line Interface (`cli.js`)

The NDK CLI exposes three primary commands:

### 2.1 Build Command (`build`)
Compiles `.nova` source into a serialized `.nvm` binary:

```bash
# Explicit output path:
node ndk/cli.js build examples/hello.nova -o hello.nvm

# Automatic output naming (defaults to <basename>.nvm):
node ndk/cli.js build examples/hello.nova
```

Output:
```
Built hello.nvm
179 machine words
```

### 2.2 Run Existing Binary (`run-file`)
Loads and executes a pre-built `.nvm` binary directly on the virtual machine:

```bash
node ndk/cli.js run-file hello.nvm
```

This path tests loader and VM behavior independently of the compiler.

### 2.3 Compile and Run (`run`)
Compiles `.nova` source code, serializes it in memory, loads it into the VM, and runs it immediately:

```bash
node ndk/cli.js run examples/hello.nova
```

---

## 3. Programmatic Toolchain API (`toolchain.js`)

The `build()` function is the core programmatic entry point:

```javascript
import { build } from "./ndk/toolchain.js";

const sourceCode = `
  let x = 10;
  let y = 20;
  print(x + y);
`;

const result = build(sourceCode);
```

### The Integration Contract
`build(source)` guarantees a complete set of intermediate artifacts:

```javascript
{
  // 1. Compiler artifacts from Nova:
  tokens: [...],         // Token stream with source coordinates
  ast: {...},            // Validated Abstract Syntax Tree
  symbols: Map(...),     // Scoped symbol table
  assembly: "...",       // Generated assembly text

  // 2. Assembler artifacts from NVM:
  assembled: {
    origin: 0x3000,      // Program base address
    words: [ ... ],      // Array of 16-bit machine words
    symbols: { ... }     // Label to address map
  },

  // 3. Executable binary from NVM Serializer:
  executable: Uint8Array // Validated NVM1 binary file buffer
}
```

Returning intermediate artifacts allows test harnesses, debuggers, and IDEs to inspect generated assembly and machine words without re-running each stage manually.

---

## 4. Unified Module Surface

The `ndk/` directory re-exports the public APIs of both Nova and NVM, offering a clean, unified surface for consumers:

| Re-Export File | Upstream Module | Primary Exports |
| :--- | :--- | :--- |
| `ndk/compiler.js` | `nova/src/compiler.js` | `compile(source)` |
| `ndk/assembler.js` | `nvm/src/assembler.js` | `assemble(source)`, `AssemblyError` |
| `ndk/executable.js` | `nvm/src/executable.js` | `encodeExecutable()`, `decodeExecutable()`, `ExecutableFormatError` |
| `ndk/vm.js` | `nvm/src/vm.js` | `VirtualMachine` class |
| `ndk/loader.js` | `nvm/src/loader.js` | `loadExecutable(vm, bytes)` |
| `ndk/cpu.js` | `nvm/src/cpu.js` | `CPU` class, `FLAG`, `getConditionCode` |
| `ndk/isa.js` | `nvm/src/isa.js` | `OPCODE`, `decodeInstruction`, encoder functions |
| `ndk/memory.js` | `nvm/src/memory.js` | `Memory` class, `MemoryFault` |
| `ndk/traps.js` | `nvm/src/traps.js` | `TrapHandler`, `TRAP_VECTOR`, `TrapError` |
| `ndk/toolchain.js` | *(Internal)* | `build(source)` |
| `ndk/cli.js` | *(Internal)* | Command-line executable script |

---

## 5. Programmatic Execution Example

Here is how an external host application or test suite can embed Nova execution:

```javascript
import { build } from "./ndk/toolchain.js";
import { VirtualMachine } from "./ndk/vm.js";
import { loadExecutable } from "./ndk/loader.js";

// 1. Compile and build executable bytes
const { executable } = build(`
  let greeting = "Hello from Nova!";
  print(greeting);
`);

// 2. Set up the VM (capture output to a string buffer)
let output = "";
const vm = new VirtualMachine({
  writeOutput: (chunk) => {
    output += chunk;
  }
});

// 3. Load the executable into VM memory
loadExecutable(vm, executable);

// 4. Run the program
const result = vm.run();

console.log("Captured Output:", output);
console.log("Steps executed:", result.steps);
```

