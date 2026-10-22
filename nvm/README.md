# NVM: Nova Virtual Machine

NVM is a 16-bit word-addressable RISC virtual machine and execution environment inspired by classic educational computer architectures (like LC-3). It includes a virtual CPU, memory subsystem, trap vector handlers, a two-pass assembler, and an executable binary serializer/loader.

---

## 1. Machine Architecture & Specifications

| Feature | Specification | Details |
| :--- | :--- | :--- |
| **Word Size** | 16 bits | All registers, instructions, and memory words are 16 bits. |
| **Address Space** | 64 Kilo-words (`0x0000` to `0xFFFF`) | Word-addressable (65,536 total 16-bit words). |
| **General Registers** | 8 registers (`R0` through `R7`) | 16-bit unsigned / two's-complement signed integers. |
| **Program Counter (PC)**| 16-bit register | Points to current instruction address. Default origin: `0x3000`. |
| **Condition Codes (CC)**| 3 bits (`N`, `Z`, `P`) | Automatically set whenever any register is modified. |
| **Endianness** | Big-Endian | High byte first in file format and data view serialization. |
| **Stack Convention** | Downward-growing from `0xFF00` | Register `R6` serves as Stack Pointer (SP). Register `R5` serves as Frame Pointer (FP) anchoring activation records. |

### Activation Record & Stack Frame Layout
NVM uses standard C / RISC call stack activation records:
```
High Memory (0xFF00)
    ┌──────────────────────────┐
    │ Caller's Stack Frame     │
    ├──────────────────────────┤
    │ Saved Frame Pointer (R5) │ <── Current Frame Pointer (R5)
    ├──────────────────────────┤
    │ Local Variable 0         │  (R5 - 1)
    ├──────────────────────────┤
    │ Local Variable 1         │  (R5 - 2)
    ├──────────────────────────┤
    │ Temporary Evaluation     │
    ├──────────────────────────┤
    │ ...                      │ <── Current Stack Pointer (R6)
Low Memory (grows downwards)
```
- **Prolog**: `ADDI R6, #-1; STR R5, R6, #0; ADD R5, R6, #0; ADDI R6, #-N`
- **Variable Access**: `LDR R0, R5, #-1` (read local 0), `STR R0, R5, #-1` (write local 0)
- **Epilog**: `ADD R6, R5, #0; LDR R5, R6, #0; ADDI R6, #1`

---

## 2. Instruction Set Architecture (ISA)

NVM instructions are 16 bits wide, with the 4-bit opcode occupying bits [15:12]:

```
15 14 13 12 | 11 10  9 |  8  7  6 |  5  4  3 |  2  1  0
[  Opcode  ] | [  DR  ] | [ SR1  ] | [ Mode/Imm/SR2   ]
```

### Complete Opcode Table

| Opcode | Mnemonic | Operands | Encoding Format | Semantics |
| :---: | :--- | :--- | :--- | :--- |
| `0x0` | `NOP` | *(none)* | `0000 000000000000` | No operation. Word must equal `0x0000`. |
| `0x1` | `LOADI` | `DR, imm9` | `0001 [DR] [imm9: unsigned 0..511]` | `DR = imm9`. Sets CC. |
| `0x2` | `ADDI` | `R, imm6` | `0010 [R] [imm6: signed -32..31] 000`| `R = R + imm6`. Sets CC. |
| `0x3` | `ADD` | `DR, SR1, SR2` | `0011 [DR] [SR1] 000 [SR2]` | `DR = SR1 + SR2`. Sets CC. |
| `0x4` | `AND` | `DR, SR1, SR2` | `0100 [DR] [SR1] 000 [SR2]` | `DR = SR1 & SR2`. Sets CC. |
| `0x5` | `NOT` | `DR, SR` | `0101 [DR] [SR] 111111` | `DR = ~SR`. Sets CC. |
| `0x6` | `LD` | `DR, offset9` | `0110 [DR] [offset9: -256..255]` | `DR = Memory[PC + offset9]`. Sets CC. |
| `0x7` | `ST` | `SR, offset9` | `0111 [SR] [offset9: -256..255]` | `Memory[PC + offset9] = SR`. |
| `0x8` | `BR[n][z][p]`| `offset9` | `1000 [N][Z][P] [offset9: -256..255]` | If `(CC & mask) != 0`, `PC = PC + offset9`. |
| `0x9` | `JMP` | `BaseR` | `1001 000 [BaseR] 000000` | `PC = BaseR`. Unconditional register jump. |
| `0xA` | `TRAP` | `vector8` | `1010 0000 [vector8: 0..255]` | Calls trap service routine. |
| `0xB` | `LDR` | `DR, BaseR, offset6` | `1011 [DR] [BaseR] [offset6: -32..31]`| `DR = Memory[BaseR + offset6]`. Sets CC. |
| `0xC` | `STR` | `SR, BaseR, offset6` | `1100 [SR] [BaseR] [offset6: -32..31]`| `Memory[BaseR + offset6] = SR`. |
| `0xF` | `HALT` | *(none)* | `1111 000000000000` | Halts VM execution. |

---

## 3. Trap Vectors & Terminal I/O

Trap routines provide basic system calls:

| Vector | Name | Argument | Behavior |
| :---: | :--- | :--- | :--- |
| `0x21` | `OUT` | `R0[7:0]` | Writes the low byte of `R0` as a single ASCII character to standard output. |
| `0x22` | `PUTS` | `R0` (Address)| Reads null-terminated 16-bit words starting at address `R0` and outputs them as ASCII text. |
| `0x25` | `HALT` | *(none)* | Halts the machine and sets `vm.halted = true`. |

---

## 4. The NVM Assembler (`src/assembler.js`)

The assembler converts human-readable assembly text into 16-bit machine words using a two-pass algorithm:

- **Pass 1 (Symbol Resolution)**:
  - Scans lines, strips comments (`;...`).
  - Reads the `.ORIG <address>` directive (default: `0x3000`).
  - Records addresses for all labels (`LABEL:`).
  - Validates duplicate label declarations.
- **Pass 2 (Instruction & Directive Encoding)**:
  - Resolves branch and load/store label offsets (`offset = targetAddress - (instructionAddress + 1)`).
  - Encodes `.FILL <value>` directives (supports numeric literals `#123`, `x3000`, `0x3000` or label addresses).
  - Halts assembly on `.END`.

```javascript
import { assemble } from "./nvm/src/assembler.js";

const result = assemble(assemblyText);
// Returns:
// {
//   origin: 0x3000,
//   words: [ 0x6001, 0x1234, ... ],
//   symbols: { START: 0x3000, DATA: 0x3010 }
// }
```

---

## 5. NVM1 Binary Executable Format (`src/executable.js`)

NVM executables use a compact, self-validating 12-byte header followed by machine words:

```
0       1       2       3       4       5       6       7       8       9      10      11
+-------+-------+-------+-------+-------+-------+-------+-------+-------+-------+-------+-------+
|  'N'  |  'V'  |  'M'  |  '1'  |Version| Flags |  Origin (16)  |    Word Count (32)    |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+-------+-------+-------+
| Word 0 (High) | Word 0 (Low)  | Word 1 (High) | Word 1 (Low)  | ...
```

- **Header Size**: Exactly 12 bytes.
- **Magic**: ASCII `"NVM1"` (`0x4E 0x56 0x4D 0x31`).
- **Version**: `0x01`.
- **Flags**: `0x00` (reserved for future extensions).
- **Origin**: 16-bit big-endian unsigned integer (e.g. `0x3000`).
- **Word Count ($N$)**: 32-bit big-endian unsigned integer.
- **Total File Size**: $12 + 2N$ bytes.

### Encoding & Decoding API
```javascript
import {
  encodeExecutable,
  decodeExecutable
} from "./nvm/src/executable.js";

// Serialization
const uint8Bytes = encodeExecutable({
  origin: 0x3000,
  words: [0x1234, 0xF025]
});

// Deserialization (validates magic, length, memory bounds)
const program = decodeExecutable(uint8Bytes);
// Returns: { version: 1, origin: 0x3000, words: [0x1234, 0xF025] }
```

---

## 6. Virtual Machine Runtime (`src/vm.js`)

The `VirtualMachine` class represents the hardware state:

```javascript
import { VirtualMachine } from "./nvm/src/vm.js";
import { loadExecutable } from "./nvm/src/loader.js";

// Optional: inject custom output handler (e.g., for tests or web UI)
const vm = new VirtualMachine({
  writeOutput: (text) => process.stdout.write(text),
});

// Load executable bytes
loadExecutable(vm, executableBytes);

// Run up to maxSteps (default: 100,000 instructions)
const result = vm.run();
console.log(`Executed ${result.steps} instructions. Halted: ${result.halted}`);
```

### VM State Properties
- `vm.memory`: `Memory` instance (64KW buffer with `read(address)` and `write(address, value)`).
- `vm.registers`: `Uint16Array(8)` containing `R0` through `R7`.
- `vm.pc`: Current program counter.
- `vm.cc`: Condition code mask (`0b100` = N, `0b010` = Z, `0b001` = P).
- `vm.halted`: Boolean execution halt flag.

