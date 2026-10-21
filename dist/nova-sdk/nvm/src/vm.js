import { CPU } from "./cpu.js";
import { WORD_MASK } from "./isa.js";
import { Memory , MEMORY_SIZE } from "./memory.js";


// const WORD_MASK = 0xFFFF;
// const MEMORY_SIZE = 1 << 16;
const INITIAL_PC = 0x3000;


export class VirtualMachine {
  constructor({writeOutput}={}) {
    this.memory = new Memory();
    this.registers = new Uint16Array(8);
    this.pc = INITIAL_PC;
    this.cc = 0b010;
    this.halted = false;
    this.writeOutput=writeOutput??((text)=>process.stdout.write(text));

    this.cpu = new CPU(this);
  }

  reset() {
    this.memory.clear();
    this.registers.fill(0);
    this.pc = INITIAL_PC;
    this.cc = 0b010;
    this.halted = false;
  }

  loadProgram(words, startAddress = INITIAL_PC) {
    this.memory.loadWords(words, startAddress);

    this.pc = startAddress;
    this.cc = 0b010;
    this.halted = false;
  }

  step() {
    this.cpu.step();
  }

  run(maxSteps = 100_000) {
    if (!Number.isInteger(maxSteps) || maxSteps < 1) {
      throw new RangeError("maxSteps must be positive");
    }

    let steps = 0;

    while (!this.halted && steps < maxSteps) {
      this.step();
      steps++;
    }

    if (!this.halted) {
      throw new Error(
        `Execution limit reached after ${steps} instructions`
      );
    }

    return {
      registers: Array.from(this.registers),
      pc: this.pc,
      cc: this.cc,
      halted: this.halted,
      steps,
    };
  }
}
