
import {
  OPCODE,
  encodeLOADI,
  encodeADDI,
  encodeADD,
  encodeAND,
  encodeNOT,
  encodeLD,
  encodeST,
  encodeBR,
  encodeJMP,
  encodeTRAP,
  encodeNOP,
  encodeHALT,
} from "./isa.js";
import { encodeLDR , encodeSTR } from "./isa.js";

const DEFAULT_ORIGIN = 0x3000;

const BRANCH_MASKS = {
  BR: 0b111,
  BRN: 0b100,
  BRZ: 0b010,
  BRP: 0b001,
  BRNZ: 0b110,
  BRNP: 0b101,
  BRZP: 0b011,
  BRNZP: 0b111,
};

export class AssemblyError extends Error {
  constructor(message, lineNumber) {
    super(
      lineNumber == null
        ? message
        : `Line ${lineNumber}: ${message}`
    );

    this.name = "AssemblyError";
    this.lineNumber = lineNumber ?? null;
  }
}

function parseNumber(token, lineNumber) {
  const value = token.trim();

  if (/^#-?\d+$/.test(value)) {
    return Number(value.slice(1));
  }

  if (/^x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value.slice(1), 16);
  }

  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value.slice(2), 16);
  }

  throw new AssemblyError(
    `Invalid numeric literal "${token}"`,
    lineNumber
  );
}

function parseRegister(token, lineNumber) {
  const match = /^R([0-7])$/i.exec(token.trim());

  if (!match) {
    throw new AssemblyError(
      `Invalid register "${token}"; expected R0–R7`,
      lineNumber
    );
  }

  return Number(match[1]);
}

function splitOperands(text, lineNumber) {
  if (!text.trim()) return [];

  const operands = text.split(",").map((part) => part.trim());

  if (operands.some((part) => part.length === 0)) {
    throw new AssemblyError(
      "Empty operand; check comma placement",
      lineNumber
    );
  }

  return operands;
}

function expectCount(entry, expected) {
  if (entry.operands.length !== expected) {
    throw new AssemblyError(
      `${entry.mnemonic} expects ${expected} operand(s), got ${entry.operands.length}`,
      entry.lineNumber
    );
  }
}

function requireRange(value, min, max, label, lineNumber) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AssemblyError(
      `${label} must be between ${min} and ${max}; got ${value}`,
      lineNumber
    );
  }

  return value;
}

function parseSource(source) {
  const lines = source.split(/\r?\n/);
  const entries = [];
  let hasSeenLabel = false;

  let origin = DEFAULT_ORIGIN;
  let currentAddress = DEFAULT_ORIGIN;
  let hasStarted = false;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;

    let text = lines[index]
      .replace(/;.*/, "")
      .trim();

    if (!text) continue;

    let label = null;
    const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(text);

    if (labelMatch) {
      label = labelMatch[1].toUpperCase();
      text = text.slice(labelMatch[0].length).trim();
      hasSeenLabel=true;
    }

    if (!text) {
      entries.push({
        label,
        mnemonic: null,
        operands: [],
        lineNumber,
        address: currentAddress,
      });

      continue;
    }

    const firstSpace = text.search(/\s/);
    const mnemonic = (
      firstSpace === -1 ? text : text.slice(0, firstSpace)
    ).toUpperCase();

    const operandText = firstSpace === -1
      ? ""
      : text.slice(firstSpace + 1).trim();

    const operands = splitOperands(operandText, lineNumber);

    if (mnemonic === ".ORIG") {
      if (hasStarted || hasSeenLabel) {
        throw new AssemblyError(
          ".ORIG must appear before labels and instructions",
          lineNumber
        );
      }

      expectCount({ mnemonic, operands, lineNumber }, 1);

      origin = parseNumber(operands[0], lineNumber);
      requireRange(origin, 0, 0xFFFF, "Origin", lineNumber);
      currentAddress = origin;
      continue;
    }

    if (mnemonic === ".END") {
      break;
    }

    const entry = {
      label,
      mnemonic,
      operands,
      lineNumber,
      address: currentAddress,
    };

    entries.push(entry);
    hasStarted = true;

    // Instructions and .FILL each emit exactly one word.
    currentAddress++;
  }

  if (currentAddress > 0x10000) {
    throw new AssemblyError(
      "Program extends beyond the 16-bit address space"
    );
  }

  return { origin, entries };
}


function resolveOffset(token, entry, symbols, min, max) {
  const key = token.toUpperCase();
  let offset;

  if (symbols.has(key)) {
    offset = symbols.get(key) - (entry.address + 1);
  } else if (
    /^#-?\d+$/.test(token) ||
    /^x[0-9a-f]+$/i.test(token) ||
    /^0x[0-9a-f]+$/i.test(token)
  ) {
    offset = parseNumber(token, entry.lineNumber);
  } else {
    throw new AssemblyError(
      `Undefined label "${token}"`,
      entry.lineNumber
    );
  }

  return requireRange(
    offset,
    min,
    max,
    "Offset",
    entry.lineNumber
  );
}


function encodeEntry(entry, symbols) {
  const { mnemonic, operands, lineNumber } = entry;

  if (mnemonic === ".FILL") {
    expectCount(entry, 1);

  const token = operands[0];
  const key = token.toUpperCase();

  let value;

  if (symbols.has(key)) {
    value = symbols.get(key);
  } else {
    value = parseNumber(token, lineNumber);
  }

  return requireRange(
    value,
    0,
    0xFFFF,
    ".FILL value",
    lineNumber
  );
  }

  switch (mnemonic) {
    case "NOP":
      expectCount(entry, 0);
      return encodeNOP();

    case "HALT":
      expectCount(entry, 0);
      return encodeHALT();

    case "LOADI": {
      expectCount(entry, 2);
      const dr = parseRegister(operands[0], lineNumber);
      const imm = parseNumber(operands[1], lineNumber);
      requireRange(imm, 0, 511, "LOADI immediate", lineNumber);
      return encodeLOADI(dr, imm);
    }

    case "ADDI": {
      if (operands.length === 2) {
        const register = parseRegister(operands[0], lineNumber);
        const imm = parseNumber(operands[1], lineNumber);
        requireRange(imm, -32, 31, "ADDI immediate", lineNumber);
        return encodeADDI(register, imm);
      }
      if (operands.length === 3) {
        const dr = parseRegister(operands[0], lineNumber);
        const sr = parseRegister(operands[1], lineNumber);
        const imm = parseNumber(operands[2], lineNumber);
        if (dr === sr) {
          requireRange(imm, -32, 31, "ADDI immediate", lineNumber);
          return encodeADDI(dr, imm);
        }
        if (imm === 0) {
          return encodeAND(dr, sr, sr);
        }
        throw new AssemblyError(
          "ADDI with different source and destination only supports immediate #0",
          lineNumber
        );
      }
      expectCount(entry, 2);
    }

    case "ADD":
    case "AND": {
      expectCount(entry, 3);

      const dr = parseRegister(operands[0], lineNumber);
      const sr1 = parseRegister(operands[1], lineNumber);
      const sr2 = parseRegister(operands[2], lineNumber);

      return mnemonic === "ADD"
        ? encodeADD(dr, sr1, sr2)
        : encodeAND(dr, sr1, sr2);
    }

    case "NOT": {
      expectCount(entry, 2);

      const dr = parseRegister(operands[0], lineNumber);
      const sr = parseRegister(operands[1], lineNumber);

      return encodeNOT(dr, sr);
    }

    case "LD":
    case "ST": {
      expectCount(entry, 2);

      const register = parseRegister(operands[0], lineNumber);
      const offset = resolveOffset(
        operands[1], entry, symbols, -256, 255
      );

      return mnemonic === "LD"
        ? encodeLD(register, offset)
        : encodeST(register, offset);
    }

    case "LDR":
    case "STR": {
        expectCount(entry, 3);

        const register = parseRegister(operands[0], lineNumber);
        const baseR = parseRegister(operands[1], lineNumber);
        const offset = parseNumber(operands[2], lineNumber);

        requireRange(offset, -32, 31, `${mnemonic} offset`, lineNumber);

        return mnemonic === "LDR"
           ? encodeLDR(register, baseR, offset)
           : encodeSTR(register, baseR, offset);
        }

    case "BR":
    case "BRN":
    case "BRZ":
    case "BRP":
    case "BRNZ":
    case "BRNP":
    case "BRZP":
    case "BRNZP": {
      expectCount(entry, 1);

      const mask = BRANCH_MASKS[mnemonic];
      const offset = resolveOffset(
        operands[0], entry, symbols, -256, 255
      );

      return encodeBR(mask, offset);
    }

    case "JMP": {
      expectCount(entry, 1);
      const baseR = parseRegister(operands[0], lineNumber);
      return encodeJMP(baseR);
    }

    case "TRAP": {
      expectCount(entry, 1);
      const vector = parseNumber(operands[0], lineNumber);
      requireRange(vector, 0, 255, "TRAP vector", lineNumber);
      return encodeTRAP(vector);
    }

    default:
      throw new AssemblyError(
        `Unknown instruction or directive "${mnemonic}"`,
        lineNumber
      );
  }
}

export function assemble(source) {
  const { origin, entries } = parseSource(source);
  const symbols = new Map();

  // Pass 1: assign addresses and resolve label definitions.
  for (const entry of entries) {
    if (!entry.label) continue;

    if (symbols.has(entry.label)) {
      throw new AssemblyError(
        `Duplicate label "${entry.label}"`,
        entry.lineNumber
      );
    }

    symbols.set(entry.label, entry.address);
  }

  // Pass 2: encode each instruction and data directive.
  const words = entries
    .filter((entry) => entry.mnemonic !== null)
    .map((entry) => encodeEntry(entry, symbols));

  return {
    origin,
    words,
    symbols: Object.fromEntries(symbols),
  };
}
