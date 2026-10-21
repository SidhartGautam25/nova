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
- **Variable Declarations**: `let <name> = <expression>;`
- **Output Statements**: `print(<expression>);`
- **Types**:
  - `integer`: Signed 16-bit integer literals (range `0` to `32767` in literals).
  - `string`: ASCII double-quoted strings (e.g. `"Hello, world!"`).
- **Binary Arithmetic**: `+` (addition), `-` (subtraction).
- **Grouping**: Parenthesized expressions `(a + b) - c`.
- **Comments**: Single-line comments starting with `//`.

### Example Program
```nova
// Declare and compute
let initial = 20;
let delta = 22;
let answer = initial + delta;

// Output
print("Result is:");
print(answer);
print(answer - 2);
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
Translates the typed AST into NVM assembly:
1. **Preamble**:
   - Emits `.ORIG x3000`.
   - Initializes stack pointer `R6` from `STACK_TOP: .FILL xFF00`.
2. **Statement Translation**:
   - **Variable Declarations**: Computes expression into `R0`, then stores into variable label `ST R0, VAR_<slot>`.
   - **String Printing**: Emits `LD R0, STRING_PTR_<id>` followed by `TRAP x22` (`PUTS`).
   - **Integer Printing**: Computes value into `R0`, saves return address in `R7`, branches to the runtime subroutine `PRINT_INT`, and resumes execution at return label.
3. **Expression Evaluation (Stack Machine)**:
   - Evaluates left operand into `R0`.
   - Pushes `R0` onto stack: `ADDI R6, #-1; STR R0, R6, #0`.
   - Evaluates right operand into `R0`.
   - Moves right operand to `R1`: `AND R1, R0, R0`.
   - Pops left operand into `R2`: `LDR R2, R6, #0; ADDI R6, #1`.
   - Adds (`ADD R0, R2, R1`) or subtracts (`NOT R1, R1; ADDI R1, #1; ADD R0, R2, R1`).
4. **Subroutines**:
   - Inlines `PRINT_INT` when integer printing is used. It extracts base-10 decimal digits (10000s, 1000s, 100s, 10s, 1s) via repeated subtraction and emits ASCII characters using `TRAP x21` (`OUT`).
5. **Data Section & Postamble**:
   - Emits `.FILL` data for constants, string pointers, variable memory slots, and `STACK_TOP`.
   - Terminates with `.END`.

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

