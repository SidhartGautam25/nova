
import { decodeInstruction, WORD_MASK } from "./isa.js";
import { TrapHandler } from "./traps.js";

export const FLAG = Object.freeze({
  N: 0b100,
  Z: 0b010,
  P: 0b001,
});

export function getConditionCode(value) {
  value &= WORD_MASK;

  if (value === 0) {
    return FLAG.Z;
  }

  if ((value & 0x8000) !== 0) {
    return FLAG.N;
  }

  return FLAG.P;
}



export class CPU {
  constructor(machine) {
    this.machine = machine;
     this.traps = new TrapHandler(machine, {
    write: machine.writeOutput,
  });
  }

  step() {
    const m = this.machine;

    if (m.halted) {
      return;
    }

    // 1. Fetch the instruction.
    const instructionAddress = m.pc;
    const word = m.memory.read(m.pc);

    // 2. Advance PC before executing the instruction.
    m.pc = (m.pc + 1) & WORD_MASK;

    // 3. Decode the instruction.
    const instruction = decodeInstruction(word);

    // 4. Execute the decoded instruction.
    this.execute(instruction, instructionAddress);
  }

  execute(instruction, instructionAddress) {
    const m = this.machine;
    let result;

    switch (instruction.op) {
      case "NOP":
        break;

      case "LOADI":
        result = instruction.immediate;
        m.registers[instruction.dr] = result;
        m.cc = getConditionCode(result);
        break;

      case "ADDI": {
        const r = instruction.register;

        result =
          (m.registers[r] + instruction.immediate) &
          WORD_MASK;

        m.registers[r] = result;
        m.cc = getConditionCode(result);
        break;
      }

      case "ADD":
        result =
          (m.registers[instruction.sr1] +
           m.registers[instruction.sr2]) &
          WORD_MASK;

        m.registers[instruction.dr] = result;
        m.cc = getConditionCode(result);
        break;

      case "AND":
        result =
          m.registers[instruction.sr1] &
          m.registers[instruction.sr2];

        m.registers[instruction.dr] = result;
        m.cc = getConditionCode(result);
        break;

      case "NOT":
        result = (~m.registers[instruction.sr]) & WORD_MASK;

        m.registers[instruction.dr] = result;
        m.cc = getConditionCode(result);
        break;

      case "BR":
        if ((m.cc & instruction.mask) !== 0) {
          m.pc = (m.pc + instruction.offset) & WORD_MASK;
        }
        break;

      case "JMP":
        m.pc = m.registers[instruction.baseR];
        break;

      case "HALT":
        m.halted = true;
        break;

     
      case "LD": {
        const address = m.pc + instruction.offset;
        const value = m.memory.read(address);

        m.registers[instruction.register] = value;
        m.cc = getConditionCode(value);
        break;
      }

      case "ST": {
        const address = m.pc + instruction.offset;
        const value = m.registers[instruction.register];

        m.memory.write(address, value);
        break;
      }

      case "LDR": {
          const address =
              m.registers[instruction.baseR] + instruction.offset;

          const value = m.memory.read(address);

          m.registers[instruction.dr] = value;
          m.cc = getConditionCode(value);
          break;
          }

      case "STR": {
           const address =
              m.registers[instruction.baseR] + instruction.offset;

           const value = m.registers[instruction.sr];

           m.memory.write(address, value);
           break;
        }

      case "TRAP":
           this.traps.handle(instruction.vector);
           break;

      default:
        throw new Error(
          `Unsupported instruction: ${instruction.op}`
        );
    }
  }
}
