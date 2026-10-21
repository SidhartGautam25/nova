
export const MEMORY_SIZE = 1 << 16;
export const WORD_MASK = 0xFFFF;

export class MemoryFault extends Error {
  constructor(address, operation) {
    super(
      `Memory ${operation} fault at address ${address}`
    );

    this.name = "MemoryFault";
    this.address = address;
    this.operation = operation;
  }
}

export class Memory {
  constructor() {
    this.data = new Uint16Array(MEMORY_SIZE);
  }

  validateAddress(address, operation) {
    if (
      !Number.isInteger(address) ||
      address < 0 ||
      address >= MEMORY_SIZE
    ) {
      throw new MemoryFault(address, operation);
    }
  }

  read(address) {
    this.validateAddress(address, "read");
    return this.data[address];
  }

  write(address, value) {
    this.validateAddress(address, "write");

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > WORD_MASK
    ) {
      throw new RangeError(
        `Invalid 16-bit word: ${value}`
      );
    }

    this.data[address] = value;
  }

  loadWords(words, startAddress) {
    if (
      !Number.isInteger(startAddress) ||
      startAddress < 0 ||
      startAddress >= MEMORY_SIZE ||
      startAddress + words.length > MEMORY_SIZE
    ) {
      throw new RangeError(
        "Program does not fit in memory"
      );
    }

    // Validate all input before modifying memory.
    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (
        !Number.isInteger(word) ||
        word < 0 ||
        word > WORD_MASK
      ) {
        throw new RangeError(
          `Invalid 16-bit word at index ${i}`
        );
      }
    }

    for (let i = 0; i < words.length; i++) {
      this.data[startAddress + i] = words[i];
    }
  }

  clear() {
    this.data.fill(0);
  }
}
