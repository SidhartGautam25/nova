
export const TRAP_VECTOR = Object.freeze({
  OUT: 0x21,
  PUTS: 0x22,
  HALT: 0x25,
});

export class TrapError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrapError";
  }
}

export class TrapHandler {
  constructor(machine, { write = null } = {}) {
    this.machine = machine;

    // Inject output so tests can capture it without a terminal.
    this.write =
      write ??
      ((text) => process.stdout.write(text));
  }

  handle(vector) {
    switch (vector) {
      case TRAP_VECTOR.OUT:
        this.out();
        break;

      case TRAP_VECTOR.PUTS:
        this.puts();
        break;

      case TRAP_VECTOR.HALT:
        this.machine.halted = true;
        break;

      default:
        throw new TrapError(
          `Unsupported trap vector: x${vector.toString(16).toUpperCase().padStart(2, "0")}`
        );
    }
  }

  out() {
    const value = this.machine.registers[0] & 0xFF;
    this.write(String.fromCharCode(value));
  }

  puts() {
    const m = this.machine;
    let address = m.registers[0];
    let output = "";

    // Bound traversal so malformed strings cannot loop forever.
    for (let i = 0; i < m.memory.length; i++) {
      const value = m.memory.read(address);

      if (value === 0) {
        this.write(output);
        return;
      }

      output += String.fromCharCode(value & 0xFF);
      address++;

      if (address >= m.memory.length && i + 1 < m.memory.length) {
        throw new TrapError(
          "PUTS reached the end of memory without a terminator"
        );
      }
    }

    throw new TrapError(
      "PUTS string is not zero-terminated"
    );
  }
}
