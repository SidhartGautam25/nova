# Nova Language & Compiler

Nova is a statically typed, imperative language designed to compile directly into **NVM** (Nova Virtual Machine) assembly text.

---

## 1. Compiler Architecture & Pipeline

The compiler converts high-level Nova source text into valid NVM assembly through four sequential passes:

```
Source Code
    │
    ▼
[ 1. Lexer ] ─────────► Token Stream (with line & column numbers)
    │
    ▼
[ 2. Parser ] ────────► Abstract Syntax Tree (AST)
    │
    ▼
[ 3. Semantic ] ──────► Typed AST + Symbol Table
    │
    ▼
[ 4. Codegen ] ───────► NVM Assembly Text (.asm)
```

Each stage is completely isolated and decoupled:
- **Lexer** (`src/lexer.js`): Character scanning and lexical analysis.
- **Parser** (`src/parser.js`): Recursive descent syntactic analysis.
- **Semantic Analyzer** (`src/semantic.js`): Scope tracking and type checking.
- **Code Generator** (`src/codegen.js`): Target-specific assembly code generation.
- **Compiler Entry Point** (`src/compiler.js`): Orchestrates all four passes.

---

## 2. Nova Language Specification

### Supported Syntax
- **Variable Declarations**:
  - `make int <name> = <expression>;` (16-bit integer, e.g. `make int x = 42;`)
  - `make char <name> = '<character>';` (ASCII character, e.g. `make char ch = 'a';`)
  - `make bool <name> = <true|false>;` (Boolean, e.g. `make bool ok = true;`)
  - `int <name> = <expression>;`, `char <name> = ...;`, `bool <name> = ...;` (C-style syntax)
  - `let <name> = <expression>;` (Dynamic syntax)
- **Functions & Subroutines**:
  - `make function <name>(<type> <param1>, <type> <param2>) : <return_type> { <body> }`
  - Example: `make function isLetterA(char c) : bool { return c == 'a'; }`
  - Example: `make function add(int a, int b) : int { return a + b; }`
  - Void function: `make function greet(int id) : void { print(id); }`
- **Return Statements**:
  - `return <expression>;` (Returns value in `R0` and unwinds stack frame)
  - `return;` (Returns `0` / void)
- **Function Calls**:
  - In expressions: `make int sum = add(10, 20);`
  - As statements: `sayHello(1);`
- **Conditionals & Branching**:
  - `if (<condition>) { ... } else if (<condition>) { ... } else { ... }`
  - Comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`
- **Loops & Control Flow**:
  - `run <count> times { ... }` (Fixed iteration loop)
  - `while (<condition>) { ... }` (Conditional loop)
  - `break;` (Exit nearest loop)
  - `continue;` (Skip to next iteration)
- **Output Statements**: `print(<expression>);`
- **Types**:
  - `int`: Signed 16-bit integer literals (range `0` to `32767` in literals).
  - `char`: ASCII character literals (e.g. `'a'`, `'\n'`, `'\t'`, `'\0'`).
  - `bool`: Boolean literals (`true` or `false`).
  - `string`: ASCII double-quoted strings (e.g. `"Hello, world!"`).
  - `void`: Void return type for functions that do not return a value.
- **Binary Arithmetic**: `+` (addition), `-` (subtraction).
- **Grouping**: Parenthesized expressions `(a + b) - c`.
- **Comments**: Single-line comments starting with `//`.

### Example Program with Functions & Recursion
```nova
// Recursive Sum function
make function sum(int n) : int {
    if (n <= 1) {
        return 1;
    }
    return n + sum(n - 1);
}

make int n = 5;
make int result = sum(n);

print("Recursive sum(5) = ");
print(result);
print("\n");
```

---

## 3. Compiler Internals

### 3.1 Lexer (`src/lexer.js`)
Tokenizes source code into structured tokens:
- `Token`: `{ type, value, line, column }`
- Token categories: `Keyword`, `Identifier`, `NumberLiteral`, `StringLiteral`, `Operator`, `Punctuation`.
- Rejects non-ASCII characters, unterminated strings, and malformed numbers.

### 3.2 Parser (`src/parser.js`)
Constructs an AST using recursive descent:
- `Program`: `{ type: "Program", statements: [...] }`
- `VariableDeclaration`: `{ type: "VariableDeclaration", name: string, initializer: Expression }`
- `PrintStatement`: `{ type: "PrintStatement", expression: Expression }`
- `BinaryExpression`: `{ type: "BinaryExpression", operator: "+" | "-", left: Expression, right: Expression }`
- `NumberLiteral`, `StringLiteral`, `IdentifierExpression`, `GroupExpression`.

### 3.3 Semantic Analysis (`src/semantic.js`)
Performs scope validation and static typing:
- Tracks symbols in a symbol table (`symbols: Map<string, Symbol>`).
- Symbol record: `{ name, valueType, slot, line, column }`.
- Enforces:
  1. No duplicate declarations in the same scope.
  2. Variables cannot be referenced in their own initializers (`let x = x + 1;` is rejected).
  3. All referenced identifiers must be previously declared.
  4. Arithmetic operations (`+`, `-`) require integer operands.

### 3.4 Code Generation (`src/codegen.js`)
Translates the typed AST into NVM assembly using standard stack-allocated activation records:
1. **Preamble & Stack Initialization**:
   - Emits `.ORIG x3000`.
   - Initializes Stack Pointer `R6` (SP) from `STACK_TOP: .FILL xFF00`.
2. **Activation Record Prolog**:
   - Saves caller's Frame Pointer `R5` on the stack: `ADDI R6, #-1; STR R5, R6, #0`.
   - Anchors new Frame Pointer: `ADD R5, R6, #0`.
   - Reserves stack space for $N$ local variables: `ADDI R6, #-N`.
3. **Local Variable Access (LDR / STR)**:
   - Variables are mapped to stack slots anchored relative to the Frame Pointer `R5`:
     - Local 0: `R5 - 1` (`LDR R0, R5, #-1` / `STR R0, R5, #-1`)
     - Local 1: `R5 - 2` (`LDR R0, R5, #-2` / `STR R0, R5, #-2`)
     - Local $k$: `R5 - (k + 1)` (`LDR R0, R5, #-(k+1)` / `STR R0, R5, #-(k+1)`)
   - Eliminates static global `.data` variable labels (`VAR_0`, `VAR_1`), enabling real-world activation records on the call stack.
4. **Statement Translation**:
   - **Variable Declarations**: Evaluates initializer into `R0`, then stores into stack frame `STR R0, R5, #offset`.
   - **Assignments**: Evaluates new value into `R0`, then stores into stack frame `STR R0, R5, #offset`.
   - **String Printing**: Emits `LD R0, STRING_PTR_<id>` followed by `TRAP x22` (`PUTS`).
   - **Integer Printing**: Computes value into `R0`, saves return address in `R7`, branches to the runtime subroutine `PRINT_INT`, and resumes execution at return label. The runtime subroutine preserves `R5` (Frame Pointer) at all times.
5. **Expression Evaluation (Stack Machine)**:
   - Evaluates left operand into `R0`.
   - Pushes `R0` onto stack: `ADDI R6, #-1; STR R0, R6, #0`.
   - Evaluates right operand into `R0`.
   - Moves right operand to `R1`: `AND R1, R0, R0`.
   - Pops left operand into `R2`: `LDR R2, R6, #0; ADDI R6, #1`.
   - Adds (`ADD R0, R2, R1`) or subtracts (`NOT R1, R1; ADDI R1, #1; ADD R0, R2, R1`).
6. **Activation Record Epilog**:
   - Collapses local variables: `ADD R6, R5, #0`.
   - Restores previous Frame Pointer: `LDR R5, R6, #0; ADDI R6, #1`.
   - Halts with `TRAP x25`.
7. **Subroutines & Data Section**:
   - Inlines `PRINT_INT` when integer printing is used. It extracts base-10 decimal digits via repeated subtraction and emits ASCII characters using `TRAP x21` (`OUT`).
   - Emits `.FILL` data for constants, string pointers, and `STACK_TOP`.
   - Terminates with `.END`.

### 3.5 Calling Convention & The ABI (Application Binary Interface)

Nova follows a strict calling convention aligned with the System V ABI (C) and JVM activation frames:

| Role | Contract & Action | Machine Sequence |
| :--- | :--- | :--- |
| **Caller Site** | Evaluates arguments into designated registers (`R0` for arg 0, `R1` for arg 1, `R2` for arg 2). | Evaluates and loads arguments into `R0..R2`. |
| **Call Step** | Emits link instruction saving return address into `R7`, then branches to function. | `LD R7, RET_ADDR_n`<br>`BRnzp FN_<name>`<br>`AFTER_CALL_n:` |
| **Callee Prolog** | Saves caller's Return Address (`R7`) and Frame Pointer (`R5`) onto the stack. Sets new `FP = SP`. Spills incoming register arguments to its stack frame and reserves local slots. | `ADDI R6, #-1; STR R7, R6, #0`<br>`ADDI R6, #-1; STR R5, R6, #0`<br>`ADD R5, R6, #0`<br>`ADDI R6, #-1; STR R0, R6, #0` (param 0)<br>`ADDI R6, #-N` (locals) |
| **Callee Body** | Accesses parameters and locals uniformly via Frame Pointer `R5` (`R5 - 1`, `R5 - 2`, etc.). | `LDR R0, R5, #-offset`<br>`STR R0, R5, #-offset` |
| **Callee Epilog** | Places return value in `R0`. Resets `SP = FP` (collapsing all locals & params in $O(1)$). Restores caller's `R5` (FP) and caller's `R7` (Return Address). Jumps back. | `ADD R6, R5, #0`<br>`LDR R5, R6, #0; ADDI R6, #1`<br>`LDR R7, R6, #0; ADDI R6, #1`<br>`JMP R7` |
| **Return Land** | Resumes execution in the caller immediately after the call point. Result is available in `R0`. | Caller's `R5` and `R6` are completely preserved. |

#### Assembly ABI Concrete Implementation
```asm
; --- CALLER SITE ---
; 1. Pass arguments into R0, R1
LOADI R0, #15
ADDI R6, #-1
STR R0, R6, #0
LOADI R0, #27
AND R1, R0, R0
LDR R0, R6, #0
ADDI R6, #1

; 2. Call function
LD R7, RET_ADDR_0
BRnzp FN_add
AFTER_CALL_0:
; Result is now in R0!

; --- CALLEE SITE (FN_add) ---
FN_add:
    ; 1. Save Return Address and Old Frame Pointer
    ADDI R6, #-1
    STR R7, R6, #0      ; Stack: return address
    ADDI R6, #-1
    STR R5, R6, #0      ; Stack: old FP
    ADD R5, R6, #0      ; FP = SP

    ; 2. Save incoming parameters into stack frame
    ADDI R6, #-1
    STR R0, R6, #0      ; Param 0 (a) at R5 - 1
    ADDI R6, #-1
    STR R1, R6, #0      ; Param 1 (b) at R5 - 2

    ; 3. Function Body...
    LDR R0, R5, #-1     ; Load a
    ADDI R6, #-1
    STR R0, R6, #0
    LDR R0, R5, #-2     ; Load b
    AND R1, R0, R0
    LDR R2, R6, #0
    ADDI R6, #1
    ADD R0, R2, R1      ; R0 = a + b

    ; 4. Epilog & Return
FN_EPILOG_add:
    ADD R6, R5, #0      ; SP = FP (collapses parameters and locals)
    LDR R5, R6, #0      ; Restore old FP
    ADDI R6, #1
    LDR R7, R6, #0      ; Restore return address
    ADDI R6, #1
    JMP R7              ; Return to caller!
```

---

## 4. Integration Guide for NDK Developers

The NDK communicates with Nova through `compile()`:

```javascript
import { compile } from "./nova/src/compiler.js";

const result = compile(sourceCodeString);
```

### Return Shape
| Property | Type | Description |
| :--- | :--- | :--- |
| `tokens` | `Array<Token>` | Array of all lexical tokens produced by the lexer. |
| `ast` | `ProgramNode` | Validated AST representing the program structure. |
| `symbols` | `Map<string, Symbol>` | Map of variable names to symbol metadata (slot index, type, position). |
| `assembly` | `string` | Final generated NVM assembly text ready for the assembler. |

### Error Handling
The compiler throws specific error classes with source location properties:
- `LexerError`: `{ name: "LexerError", line, column, message }`
- `ParseError`: `{ name: "ParseError", line, column, message }`
- `SemanticError`: `{ name: "SemanticError", line, column, message }`
- `CodegenError`: `{ name: "CodegenError", line, column, message }`

Tooling and language servers can catch these errors and highlight issues directly in the editor using `error.line` and `error.column`.

---

## 5. Guide for Nova Developers: What NVM Offers

When adding new language features to Nova (e.g. loops, functions, conditionals, arrays), you target NVM assembly. Here is what NVM provides:

### 5.1 Register Allocations & Conventions
| Register | Designated Role in Nova |
| :--- | :--- |
| **`R0`** | Primary expression accumulator, function return value, and TRAP argument. |
| **`R1`** | Right operand in arithmetic expressions, scratch register in subroutines. |
| **`R2`** | Left operand popped from stack, scratch register in subroutines. |
| **`R3`–`R5`**| General scratch registers (used by `PRINT_INT` for quotient/digit counts). |
| **`R6`** | **Stack Pointer (SP)**. Points to the current top of the stack. Stack grows downward from `xFF00`. |
| **`R7`** | **Link Register**. Stores return address for subroutine calls (`JMP R7`). |

### 5.2 Branching & Condition Codes
NVM maintains three condition code flags updated whenever a register is written:
- `N` (Negative, bit 15 = 1)
- `Z` (Zero, value = 0)
- `P` (Positive, value > 0 and bit 15 = 0)

You can generate conditional control flow using:
- `BRz <label>` / `BRp <label>` / `BRn <label>`
- `BRzp <label>` / `BRnp <label>` / `BRnz <label>`
- `BRnzp <label>` (Unconditional branch)

### 5.3 Memory Access Patterns
- **Direct PC-Relative**: `LD R0, LABEL` and `ST R0, LABEL` (offset range: -256 to +255 words).
- **Base + Offset (Indirect / Pointer)**: `LDR DR, BaseR, #offset` and `STR SR, BaseR, #offset` (offset range: -32 to +31 words). Ideal for stack frames and struct fields.

