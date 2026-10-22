# Nova & NVM Interactive Web Visualizer

An interactive, pure Node.js-served visualizer and step-by-step CPU debugger for the Nova programming language and 16-bit Virtual Machine (NVM).

Zero npm dependencies, zero build tools, pure HTML5/CSS3/JavaScript (ES Modules).

---

## 🚀 Quick Start

Run the server with Node.js:

```bash
node web/server.js
```
*(Or via npm: `npm run web`)*

Then open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🌟 Key Features

### 1. Live Code Editor & Presets
- Write or modify Nova source code in real time.
- Pre-loaded interactive presets:
  - **Variables & Arithmetic** (`make int`, expressions)
  - **Conditionals** (`if / else if / else`, comparisons)
  - **Run Loop** (`run x times`)
  - **While Loop** with `break` and `continue`
  - **Nested Loops**
  - **Hello World** string printing

### 2. Multi-Stage Compiler Pipeline Inspector
Inspect each transformation stage of the Nova compiler:
1. **Tokens (Lexer)**: View raw tokens, line/column coordinates, and token classifications.
2. **AST (Parser)**: Interactive, formatted Abstract Syntax Tree representation.
3. **Symbols (Semantic Analyzer)**: View symbol table, variable allocation slots (`VAR_0`, `VAR_1`), and data types.
4. **Assembly (Codegen)**: Emitted LC-3 symbolic assembly instructions.
5. **Machine Words (Assembler / Binary)**: Decoded 16-bit machine words and instructions mapped to hexadecimal memory addresses.

### 3. Step-by-Step CPU & Virtual Machine Debugger
Step through execution instruction-by-instruction:
- **Controls**:
  - `Next Step` (`▶`): Execute 1 CPU cycle.
  - `Step Back` (`◀`): Rewind 1 CPU cycle.
  - `Auto Play` (`▶▶`): Automated stepping with adjustable speed (Slow, Normal, Fast, Turbo).
  - `Reset` (`⏮`): Return to program origin (`0x3000`).
- **Natural Language Step Explanation**:
  - Explains what the CPU did in plain English (e.g., *"Added R1 (25) + R2 (100) -> Stored 125 into R0, set Condition Code to Positive"*).
- **CPU Registers (R0–R7, PC, CC)**:
  - Live hexadecimal (`0x0000`) and signed decimal (`#0`) values.
  - **Glow animation** on whichever register changed in the current step.
  - Illuminated condition codes (`[N]`, `[Z]`, `[P]`).
- **Memory Bus Inspector**:
  - Interactive grid showing 16-bit memory cells.
  - Current `PC` pointed with `👉` arrow.
  - Memory **reads** highlighted in blue (`👁️`).
  - Memory **writes** highlighted in amber (`✍️`).
- **Virtual Terminal (`stdout`)**:
  - Displays characters emitted by `TRAP x21` (OUT) and `TRAP x22` (PUTS), and integer prints in real time.

