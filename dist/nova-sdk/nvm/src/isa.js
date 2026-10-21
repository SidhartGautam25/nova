
export const WORD_MASK = 0xFFFF;

export const OPCODE = Object.freeze({
  NOP:    0x0,
  LOADI:  0x1,
  ADDI:   0x2,
  ADD:    0x3,
  AND:    0x4,
  NOT:    0x5,
  LD:     0x6,
  ST:     0x7,
  BR:     0x8,
  JMP:    0x9,
  TRAP:   0xA,
  HALT:   0xF,
  LDR:    0xB,
  STR:    0xC,
});

function assertInteger(name, value, min, max) {
  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new RangeError(
      `${name} must be an integer from ${min} to ${max}`
    );
  }
}

function unsignedField(value, width, name = "field") {
  assertInteger(name, value, 0, (1 << width) - 1);
  return value;
}

function signedField(value, width, name = "immediate") {
  assertInteger(
    name,
    value,
    -(1 << (width - 1)),
    (1 << (width - 1)) - 1
  );

  // Preserve the low `width` bits of a signed integer.
  return value & ((1 << width) - 1);
}

export function signExtend(value, width) {
  const signBit = 1 << (width - 1);
  const mask = (1 << width) - 1;

  value &= mask;
  return (value ^ signBit) - signBit;
}

function opcodeBits(opcode) {
  return unsignedField(opcode, 4, "opcode") << 12;
}

function registerBits(register, name = "register") {
  return unsignedField(register, 3, name);
}

// LOADI DR, imm9
export function encodeLOADI(dr, immediate) {
  return (
    opcodeBits(OPCODE.LOADI) |
    (registerBits(dr, "DR") << 9) |
    unsignedField(immediate, 9, "imm9")
  );
}

// ADDI R, imm6
// The same register is read and written.
export function encodeADDI(register, immediate) {
  return (
    opcodeBits(OPCODE.ADDI) |
    (registerBits(register) << 9) |
    (signedField(immediate, 6) << 3)
  );
}

// ADD DR, SR1, SR2
export function encodeADD(dr, sr1, sr2) {
  return (
    opcodeBits(OPCODE.ADD) |
    (registerBits(dr, "DR") << 9) |
    (registerBits(sr1, "SR1") << 6) |
    registerBits(sr2, "SR2")
  );
}

// AND DR, SR1, SR2
export function encodeAND(dr, sr1, sr2) {
  return (
    opcodeBits(OPCODE.AND) |
    (registerBits(dr, "DR") << 9) |
    (registerBits(sr1, "SR1") << 6) |
    registerBits(sr2, "SR2")
  );
}

// NOT DR, SR
export function encodeNOT(dr, sr) {
  return (
    opcodeBits(OPCODE.NOT) |
    (registerBits(dr, "DR") << 9) |
    (registerBits(sr, "SR") << 6)
  );
}

// LD DR, offset9
export function encodeLD(dr, offset) {
  return (
    opcodeBits(OPCODE.LD) |
    (registerBits(dr, "DR") << 9) |
    signedField(offset, 9)
  );
}

// ST SR, offset9
export function encodeST(sr, offset) {
  return (
    opcodeBits(OPCODE.ST) |
    (registerBits(sr, "SR") << 9) |
    signedField(offset, 9)
  );
}

// BR mask, offset9
// mask uses N=4, Z=2, P=1.
export function encodeBR(mask, offset) {
  return (
    opcodeBits(OPCODE.BR) |
    (unsignedField(mask, 3, "condition mask") << 9) |
    signedField(offset, 9)
  );
}

// JMP BaseR
export function encodeJMP(baseR) {
  return (
    opcodeBits(OPCODE.JMP) |
    (registerBits(baseR, "BaseR") << 6)
  );
}

// TRAP vector8
export function encodeTRAP(vector) {
  return (
    opcodeBits(OPCODE.TRAP) |
    unsignedField(vector, 8, "trap vector")
  );
}

export function encodeNOP() {
  return opcodeBits(OPCODE.NOP);
}

export function encodeHALT() {
  return opcodeBits(OPCODE.HALT);
}

export function encodeLDR(dr, baseR, offset) {
  if (!Number.isInteger(dr) || dr < 0 || dr > 7) {
    throw new RangeError("Invalid destination register");
  }

  if (!Number.isInteger(baseR) || baseR < 0 || baseR > 7) {
    throw new RangeError("Invalid base register");
  }

  if (!Number.isInteger(offset) || offset < -32 || offset > 31) {
    throw new RangeError("LDR offset must be between -32 and 31");
  }

  return (
    (OPCODE.LDR << 12) |
    (dr << 9) |
    (baseR << 6) |
    (offset & 0x3F)
  );
}

export function encodeSTR(sr, baseR, offset) {
  if (!Number.isInteger(sr) || sr < 0 || sr > 7) {
    throw new RangeError("Invalid source register");
  }

  if (!Number.isInteger(baseR) || baseR < 0 || baseR > 7) {
    throw new RangeError("Invalid base register");
  }

  if (!Number.isInteger(offset) || offset < -32 || offset > 31) {
    throw new RangeError("STR offset must be between -32 and 31");
  }

  return (
    (OPCODE.STR << 12) |
    (sr << 9) |
    (baseR << 6) |
    (offset & 0x3F)
  );
}



export function decodeInstruction(word) {
  assertInteger("instruction word", word, 0, WORD_MASK);

  const opcode = word >>> 12;
  const field = (word >>> 9) & 0x7;

  switch (opcode) {
    case OPCODE.NOP:
      if ((word & 0x0FFF) !== 0) {
        throw new Error("Invalid NOP encoding");
      }
      return { op: "NOP" };

    case OPCODE.LOADI:
      return {
        op: "LOADI",
        dr: field,
        immediate: word & 0x01FF,
      };

    case OPCODE.ADDI: {
      if ((word & 0x7) !== 0) {
        throw new Error("Invalid ADDI reserved bits");
      }

      return {
        op: "ADDI",
        register: field,
        immediate: signExtend((word >>> 3) & 0x3F, 6),
      };
    }

    case OPCODE.ADD:
    case OPCODE.AND: {
      if ((word & 0x0038) !== 0) {
        throw new Error("Invalid register-operation encoding");
      }

      return {
        op: opcode === OPCODE.ADD ? "ADD" : "AND",
        dr: field,
        sr1: (word >>> 6) & 0x7,
        sr2: word & 0x7,
      };
    }

    case OPCODE.NOT:
      if ((word & 0x003F) !== 0) {
        throw new Error("Invalid NOT encoding");
      }

      return {
        op: "NOT",
        dr: field,
        sr: (word >>> 6) & 0x7,
      };

    case OPCODE.LD:
    case OPCODE.ST:
      return {
        op: opcode === OPCODE.LD ? "LD" : "ST",
        register: field,
        offset: signExtend(word & 0x01FF, 9),
      };

    case OPCODE.BR:
      return {
        op: "BR",
        mask: field,
        offset: signExtend(word & 0x01FF, 9),
      };

    case OPCODE.JMP:
      if ((word & 0x0E3F) !== 0) {
        throw new Error("Invalid JMP encoding");
      }

      return {
        op: "JMP",
        baseR: (word >>> 6) & 0x7,
      };

    case OPCODE.TRAP:
      if ((word & 0x0F00) !== 0) {
        throw new Error("Invalid TRAP encoding");
      }

      return {
        op: "TRAP",
        vector: word & 0xFF,
      };

    case OPCODE.HALT:
      if ((word & 0x0FFF) !== 0) {
        throw new Error("Invalid HALT encoding");
      }
      return { op: "HALT" };
    
    
    case OPCODE.LDR:
      return {
        op: "LDR",
        dr: (word >> 9) & 0x7,
        baseR: (word >> 6) & 0x7,
        offset: signExtend(word & 0x3F, 6),
       };

    case OPCODE.STR:
       return {
         op: "STR",
         sr: (word >> 9) & 0x7,
         baseR: (word >> 6) & 0x7,
         offset: signExtend(word & 0x3F, 6),
        };
    default:
      throw new Error(
        `Unknown opcode: 0x${opcode.toString(16)}`
      );
  }
}
