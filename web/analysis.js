import { decodeInstruction, WORD_MASK, FLAG } from "../ndk/index.js";

export function buildSourceMap(assembly) {
  const map = {};
  let currentAddress = 0x3000;
  const lines = assembly.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith(".ORIG")) {
      const parts = trimmed.split(/\s+/);
      if (parts[1]) {
        currentAddress = parseInt(parts[1].replace(/x|#/i, ""), parts[1].startsWith("x") || parts[1].startsWith("0x") ? 16 : 10);
      }
      continue;
    }

    if (trimmed === ".END") break;

    // Check for comment with line tag: ; line:N
    const match = /;\s*line:(\d+)/i.exec(line);
    const sourceLine = match ? Number(match[1]) : null;

    let instructionPart = line.replace(/;.*/, "").trim();
    if (!instructionPart) continue;

    // Remove label prefix if present
    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*/.exec(instructionPart);
    if (labelMatch) {
      instructionPart = instructionPart.slice(labelMatch[0].length).trim();
    }

    if (instructionPart) {
      if (sourceLine) {
        map[currentAddress] = sourceLine;
      }
      currentAddress++;
    }
  }

  return map;
}

export function buildSymbolMap(compilationSymbols, assembledSymbols, words, origin = 0x3000) {
  const map = {};

  // 1. Map user variables from compilation
  const slotToVar = {};
  if (compilationSymbols) {
    const entries = Array.isArray(compilationSymbols) ? compilationSymbols : Array.from(compilationSymbols.entries());
    for (const item of entries) {
      const name = Array.isArray(item) ? item[0] : item.name;
      const sym = Array.isArray(item) ? item[1] : item;
      slotToVar[sym.slot] = { name, ...sym };
    }
  }

  // 2. Map assembler labels
  if (assembledSymbols) {
    for (const [label, address] of Object.entries(assembledSymbols)) {
      let varInfo = null;
      const varMatch = /^VAR_(\d+)$/.exec(label);
      if (varMatch) {
        const slot = Number(varMatch[1]);
        if (slotToVar[slot]) {
          varInfo = slotToVar[slot];
        }
      }

      let role = label;
      if (varInfo) {
        role = `Variable '${varInfo.name}' (${varInfo.valueType || "int"})`;
      } else if (label.startsWith("STRING_DATA")) {
        role = "String literal characters";
      } else if (label.startsWith("STRING_PTR")) {
        role = "Pointer to string data";
      } else if (label.startsWith("LOOP_CTR")) {
        role = "Loop iteration counter";
      } else if (label === "STACK_TOP") {
        role = "Initial stack base address";
      } else if (label === "START_INIT") {
        role = "Program entry initialization";
      } else if (label.startsWith("LOOP_TEST")) {
        role = "Loop condition header";
      } else if (label.startsWith("LOOP_END")) {
        role = "Loop exit target";
      } else if (label.startsWith("PRINT_INT")) {
        role = "Integer print subroutine";
      }

      map[address] = {
        label,
        address,
        hexAddress: "0x" + address.toString(16).toUpperCase(),
        varName: varInfo ? varInfo.name : null,
        varType: varInfo ? (varInfo.valueType || "int") : null,
        role,
      };
    }
  }

  return map;
}

export function buildBitfield(word, pc) {
  const binary16 = (word & 0xFFFF).toString(2).padStart(16, "0");
  const bits = binary16.split("").map((b) => Number(b));

  let inst = null;
  try {
    inst = decodeInstruction(word);
  } catch {
    const hexWord = "0x" + word.toString(16).padStart(4, "0").toUpperCase();
    return {
      rawWord: word,
      hexWord,
      rawHex: hexWord,
      binary: binary16,
      rawBinary: binary16,
      bits,
      isInstruction: false,
      fields: [
        {
          name: "Data Word",
          span: "15:0",
          bits: binary16,
          binary: binary16,
          meaning: `#${word >= 0x8000 ? word - 0x10000 : word}`,
          value: `#${word >= 0x8000 ? word - 0x10000 : word}`,
          role: "raw 16-bit word",
          type: "unused",
        }
      ]
    };
  }

  const opcodeBits = binary16.slice(0, 4);
  const fields = [
    {
      name: "Opcode",
      bits: "15:12",
      binary: opcodeBits,
      value: `${inst.op} (0x${(word >>> 12).toString(16).toUpperCase()})`,
      role: "Instruction operation"
    }
  ];

  switch (inst.op) {
    case "LOADI":
      fields.push(
        { name: "DR", bits: "11:9", binary: binary16.slice(4, 7), value: `R${inst.dr}`, role: "Destination register" },
        { name: "imm9", bits: "8:0", binary: binary16.slice(7), value: `#${inst.immediate}`, role: "Unsigned 9-bit immediate (0..511)" }
      );
      break;

    case "ADDI":
      fields.push(
        { name: "Reg", bits: "11:9", binary: binary16.slice(4, 7), value: `R${inst.register}`, role: "Source & destination register" },
        { name: "imm6", bits: "8:3", binary: binary16.slice(7, 13), value: `#${inst.immediate}`, role: "Signed 6-bit immediate (-32..31)" },
        { name: "Reserved", bits: "2:0", binary: binary16.slice(13), value: "0", role: "Fixed zero bits" }
      );
      break;

    case "ADD":
    case "AND":
      fields.push(
        { name: "DR", bits: "11:9", binary: binary16.slice(4, 7), value: `R${inst.dr}`, role: "Destination register" },
        { name: "SR1", bits: "8:6", binary: binary16.slice(7, 10), value: `R${inst.sr1}`, role: "First source register" },
        { name: "Mode", bits: "5:3", binary: binary16.slice(10, 13), value: "0", role: "Register-to-register mode" },
        { name: "SR2", bits: "2:0", binary: binary16.slice(13), value: `R${inst.sr2}`, role: "Second source register" }
      );
      break;

    case "NOT":
      fields.push(
        { name: "DR", bits: "11:9", binary: binary16.slice(4, 7), value: `R${inst.dr}`, role: "Destination register" },
        { name: "SR", bits: "8:6", binary: binary16.slice(7, 10), value: `R${inst.sr}`, role: "Source register" },
        { name: "Fixed", bits: "5:0", binary: binary16.slice(10), value: "0", role: "Fixed ones/zeros" }
      );
      break;

    case "LD":
    case "ST": {
      const targetAddr = (pc + 1 + inst.offset) & WORD_MASK;
      fields.push(
        { name: inst.op === "LD" ? "DR" : "SR", bits: "11:9", binary: binary16.slice(4, 7), value: `R${inst.register}`, role: inst.op === "LD" ? "Destination register" : "Source register" },
        { name: "PCoffset9", bits: "8:0", binary: binary16.slice(7), value: `#${inst.offset} (-> 0x${targetAddr.toString(16).toUpperCase()})`, role: "PC-relative 9-bit offset" }
      );
      break;
    }

    case "LDR":
    case "STR": {
      fields.push(
        { name: inst.op === "LDR" ? "DR" : "SR", bits: "11:9", binary: binary16.slice(4, 7), value: `R${inst.op === "LDR" ? inst.dr : inst.sr}`, role: "Register" },
        { name: "BaseR", bits: "8:6", binary: binary16.slice(7, 10), value: `R${inst.baseR}`, role: "Base address register" },
        { name: "offset6", bits: "5:0", binary: binary16.slice(10), value: `#${inst.offset}`, role: "Signed 6-bit index offset" }
      );
      break;
    }

    case "BR": {
      const targetAddr = (pc + 1 + inst.offset) & WORD_MASK;
      const maskStr = [inst.mask & 4 ? "N" : "", inst.mask & 2 ? "Z" : "", inst.mask & 1 ? "P" : ""].join("");
      fields.push(
        { name: "NZP", bits: "11:9", binary: binary16.slice(4, 7), value: maskStr || "None", role: "Condition code branch mask" },
        { name: "PCoffset9", bits: "8:0", binary: binary16.slice(7), value: `#${inst.offset} (-> 0x${targetAddr.toString(16).toUpperCase()})`, role: "Branch target relative offset" }
      );
      break;
    }

    case "JMP":
      fields.push(
        { name: "Fixed", bits: "11:9", binary: binary16.slice(4, 7), value: "0", role: "Unused zero bits" },
        { name: "BaseR", bits: "8:6", binary: binary16.slice(7, 10), value: `R${inst.baseR}`, role: inst.baseR === 7 ? "Link Register (Return)" : "Target address register" },
        { name: "Fixed", bits: "5:0", binary: binary16.slice(10), value: "0", role: "Unused zero bits" }
      );
      break;

    case "TRAP":
      fields.push(
        { name: "Fixed", bits: "11:8", binary: binary16.slice(4, 8), value: "0", role: "Trap prefix" },
        { name: "Vector8", bits: "7:0", binary: binary16.slice(8), value: `0x${inst.vector.toString(16).toUpperCase()}`, role: "Service routine trap vector" }
      );
      break;

    default:
      fields.push({
        name: "Operands",
        bits: "11:0",
        binary: binary16.slice(4),
        value: "---",
        role: "Instruction parameters"
      });
  }

  // Normalize fields with semantic types and aliases
  const normalizedFields = fields.map((f) => {
    let type = "unused";
    const nameLower = f.name.toLowerCase();
    if (nameLower === "opcode") type = "opcode";
    else if (["dr", "sr", "sr1", "sr2", "reg", "baser"].includes(nameLower)) type = "reg";
    else if (["nzp", "cc", "flags"].includes(nameLower)) type = "flag";
    else if (nameLower.includes("offset")) type = "offset";
    else if (nameLower.includes("imm") || nameLower.includes("vector")) type = "imm";

    const span = f.bits || f.span || "";
    const bitStr = f.binary || f.bits || "";
    const meaning = f.value || f.role || "";

    return {
      name: f.name,
      span,
      bits: bitStr,
      binary: bitStr,
      meaning,
      value: meaning,
      role: f.role || meaning,
      type,
    };
  });

  const hexWord = "0x" + word.toString(16).padStart(4, "0").toUpperCase();

  return {
    rawWord: word,
    hexWord,
    rawHex: hexWord,
    binary: binary16,
    rawBinary: binary16,
    bits,
    isInstruction: true,
    op: inst.op,
    fields: normalizedFields,
  };
}

export function buildDataPath(inst, word, pcBefore, regsBefore, regsAfter, memAccess, ccAfter) {
  const pcHex = "0x" + pcBefore.toString(16).toUpperCase();
  const wordHex = "0x" + word.toString(16).padStart(4, "0").toUpperCase();

  const fetch = `MAR = PC (${pcHex})  ➔  MDR = Mem[${pcHex}] = ${wordHex}`;
  let decode = `IR = ${wordHex}`;
  let addressEval = "No memory address evaluation needed";
  let execute = "Cycle complete";

  if (!inst) {
    decode = `Data word / Constant: ${wordHex}`;
    return { fetch, decode, addressEval, execute };
  }

  decode = `IR = ${wordHex} ➔ Opcode: ${inst.op}`;

  switch (inst.op) {
    case "LOADI":
      execute = `R${inst.dr} 🠐 #${inst.immediate} (${regsAfter[inst.dr]})  |  CC 🠐 ${ccAfter & 4 ? "N" : ccAfter & 2 ? "Z" : "P"}`;
      break;

    case "ADDI":
      execute = `ALU: R${inst.register} (${regsBefore[inst.register]}) + #${inst.immediate} ➔ Result: ${regsAfter[inst.register]}  |  R${inst.register} 🠐 ${regsAfter[inst.register]}`;
      break;

    case "ADD":
      execute = `ALU: R${inst.sr1} (${regsBefore[inst.sr1]}) + R${inst.sr2} (${regsBefore[inst.sr2]}) ➔ Result: ${regsAfter[inst.dr]}  |  R${inst.dr} 🠐 ${regsAfter[inst.dr]}`;
      break;

    case "AND":
      execute = `ALU: R${inst.sr1} & R${inst.sr2} ➔ Result: ${regsAfter[inst.dr]}  |  R${inst.dr} 🠐 ${regsAfter[inst.dr]}`;
      break;

    case "NOT":
      execute = `ALU: ~R${inst.sr} ➔ Result: ${regsAfter[inst.dr]}  |  R${inst.dr} 🠐 ${regsAfter[inst.dr]}`;
      break;

    case "LD": {
      const targetAddr = (pcBefore + 1 + inst.offset) & WORD_MASK;
      addressEval = `MAR = PC + 1 + offset9 = ${pcHex} + 1 + (${inst.offset}) ➔ 0x${targetAddr.toString(16).toUpperCase()}`;
      execute = `MDR = Mem[0x${targetAddr.toString(16).toUpperCase()}] (${regsAfter[inst.register]}) ➔ R${inst.register} 🠐 ${regsAfter[inst.register]}`;
      break;
    }

    case "ST": {
      const targetAddr = (pcBefore + 1 + inst.offset) & WORD_MASK;
      addressEval = `MAR = PC + 1 + offset9 = ${pcHex} + 1 + (${inst.offset}) ➔ 0x${targetAddr.toString(16).toUpperCase()}`;
      execute = `MDR 🠐 R${inst.register} (${regsBefore[inst.register]})  ➔  Mem[0x${targetAddr.toString(16).toUpperCase()}] = ${regsBefore[inst.register]}`;
      break;
    }

    case "LDR": {
      const baseAddr = regsBefore[inst.baseR];
      const targetAddr = (baseAddr + inst.offset) & WORD_MASK;
      addressEval = `MAR = BaseR (${inst.baseR}: 0x${baseAddr.toString(16).toUpperCase()}) + offset6 (${inst.offset}) ➔ 0x${targetAddr.toString(16).toUpperCase()}`;
      execute = `MDR = Mem[0x${targetAddr.toString(16).toUpperCase()}] ➔ R${inst.dr} 🠐 ${regsAfter[inst.dr]}`;
      break;
    }

    case "STR": {
      const baseAddr = regsBefore[inst.baseR];
      const targetAddr = (baseAddr + inst.offset) & WORD_MASK;
      addressEval = `MAR = BaseR (${inst.baseR}: 0x${baseAddr.toString(16).toUpperCase()}) + offset6 (${inst.offset}) ➔ 0x${targetAddr.toString(16).toUpperCase()}`;
      execute = `MDR 🠐 R${inst.sr} (${regsBefore[inst.sr]}) ➔ Mem[0x${targetAddr.toString(16).toUpperCase()}] = ${regsBefore[inst.sr]}`;
      break;
    }

    case "BR": {
      const targetAddr = (pcBefore + 1 + inst.offset) & WORD_MASK;
      addressEval = `Branch Target = PC + 1 + offset9 = 0x${targetAddr.toString(16).toUpperCase()}`;
      const taken = (regsAfter[inst.dr] !== undefined ? true : true);
      execute = `Evaluated CC against mask. PC 🠐 0x${((regsBefore[0] !== undefined) ? targetAddr : pcBefore + 1).toString(16).toUpperCase()}`;
      break;
    }

    case "JMP":
      execute = `PC 🠐 R${inst.baseR} (0x${regsBefore[inst.baseR].toString(16).toUpperCase()})`;
      break;

    case "TRAP":
      execute = `Invoked Service Vector x${inst.vector.toString(16).toUpperCase()}`;
      break;

    case "HALT":
      execute = "CPU Clock Halted.";
      break;
  }

  return { fetch, decode, addressEval, execute };
}

export function inferRegisterContext(regIndex, val, symbolMap, memory) {
  const result = {
    tag: null,
    note: null,
  };

  // 1. Is it matching a variable address?
  if (symbolMap && symbolMap[val] && symbolMap[val].varName) {
    result.tag = `&${symbolMap[val].varName}`;
    result.note = `&${symbolMap[val].varName} (address)`;
    return result;
  }

  // 1b. Does it hold the value of a declared variable?
  if (symbolMap && memory) {
    for (const [addrStr, sym] of Object.entries(symbolMap)) {
      if (sym && sym.varName) {
        const addrNum = Number(addrStr);
        const memVal = memory.read(addrNum);
        if (memVal === val && val !== 0) {
          result.tag = `var: ${sym.varName}`;
          result.note = `var: ${sym.varName} (#${val})`;
          return result;
        }
      }
    }
  }

  // 2. Is it matching a string pointer?
  if (symbolMap && symbolMap[val] && symbolMap[val].label?.startsWith("STRING_DATA")) {
    let str = "";
    for (let i = 0; i < 20; i++) {
      const ch = memory ? memory.read(val + i) : 0;
      if (ch === 0) break;
      str += String.fromCharCode(ch & 0xFF);
    }
    result.tag = `str`;
    result.note = `→ "${str}"`;
    return result;
  }

  // 3. Stack address?
  if (val >= 0xFEE0 && val <= 0xFF00) {
    result.tag = "stack";
    result.note = `→ Stack [0x${val.toString(16).toUpperCase()}]`;
    return result;
  }

  // 4. Code address?
  if (val >= 0x3000 && val <= 0x3500) {
    if (symbolMap && symbolMap[val]) {
      result.tag = `label`;
      result.note = `→ ${symbolMap[val].label}`;
      return result;
    }
    result.tag = "addr";
    result.note = `→ 0x${val.toString(16).toUpperCase()}`;
    return result;
  }

  // 5. Printable ASCII character?
  if (val >= 32 && val <= 126) {
    result.tag = `'${String.fromCharCode(val)}'`;
    result.note = `ASCII #${val}`;
    return result;
  }
  if (val === 10) {
    result.tag = "'\\n'";
    result.note = "ASCII newline";
    return result;
  }

  // 6. Boolean?
  if (val === 0 || val === 1) {
    result.note = val === 1 ? "bool: true" : "bool: false / 0";
    return result;
  }

  return result;
}

export function extractStackSnapshot(vm) {
  const snapshot = [];
  const sp = vm.registers[6] === 0 ? 0xFF00 : vm.registers[6]; // R6 (Stack Pointer, defaults to initial boundary 0xFF00)
  const fp = vm.registers[5]; // R5

  // Stack grows down from 0xFF00 to SP
  const top = 0xFF00;
  const bottom = Math.max(0xFEE0, sp - 2);

  for (let addr = top; addr >= bottom; addr--) {
    const val = vm.memory.read(addr);
    const hexVal = "0x" + val.toString(16).padStart(4, "0").toUpperCase();
    const signedVal = val >= 0x8000 ? val - 0x10000 : val;

    let role = "Empty stack slot";
    if (addr === top) {
      role = "Stack Top Boundary (xFF00)";
    }
    if (addr === sp) {
      role = "Top of Stack (SP / R6)";
    }
    if (addr === fp && fp !== 0) {
      role = "Active Frame Pointer (FP / R5)";
    }

    snapshot.push({
      address: addr,
      hexAddress: "0x" + addr.toString(16).toUpperCase(),
      value: val,
      hexValue: hexVal,
      signedValue: signedVal,
      isSP: addr === sp,
      isFP: addr === fp && fp !== 0,
      role,
    });
  }

  return snapshot;
}
