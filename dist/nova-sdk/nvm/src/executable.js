
const MAGIC = [0x4E, 0x56, 0x4D, 0x31]; // "NVM1"
const VERSION = 1;
const HEADER_SIZE = 12;
const MEMORY_SIZE = 1 << 16;
const WORD_MASK = 0xFFFF;

export class ExecutableFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExecutableFormatError";
  }
}

function validateProgram(origin, words) {
  if (
    !Number.isInteger(origin) ||
    origin < 0 ||
    origin >= MEMORY_SIZE
  ) {
    throw new ExecutableFormatError(
      `Invalid program origin: ${origin}`
    );
  }

  if (!Array.isArray(words)) {
    throw new ExecutableFormatError(
      "Program words must be an array"
    );
  }

  if (origin + words.length > MEMORY_SIZE) {
    throw new ExecutableFormatError(
      "Program exceeds the address space"
    );
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (
      !Number.isInteger(word) ||
      word < 0 ||
      word > WORD_MASK
    ) {
      throw new ExecutableFormatError(
        `Invalid 16-bit word at index ${i}`
      );
    }
  }
}

export function encodeExecutable({ origin, words }) {
  validateProgram(origin, words);

  const bytes = new Uint8Array(
    HEADER_SIZE + words.length * 2
  );

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  for (let i = 0; i < MAGIC.length; i++) {
    bytes[i] = MAGIC[i];
  }

  bytes[4] = VERSION;
  bytes[5] = 0; // Reserved flags.

  view.setUint16(6, origin, false);
  view.setUint32(8, words.length, false);

  for (let i = 0; i < words.length; i++) {
    view.setUint16(
      HEADER_SIZE + i * 2,
      words[i],
      false
    );
  }

  return bytes;
}

export function decodeExecutable(input) {
  if (!(input instanceof Uint8Array)) {
    throw new ExecutableFormatError(
      "Executable input must be a Uint8Array"
    );
  }

  if (input.byteLength < HEADER_SIZE) {
    throw new ExecutableFormatError(
      "Executable is smaller than its header"
    );
  }

  const bytes = new Uint8Array(
    input.buffer,
    input.byteOffset,
    input.byteLength
  );

  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new ExecutableFormatError(
        "Invalid executable magic signature"
      );
    }
  }

  const version = bytes[4];
  const flags = bytes[5];

  if (version !== VERSION) {
    throw new ExecutableFormatError(
      `Unsupported executable version: ${version}`
    );
  }

  if (flags !== 0) {
    throw new ExecutableFormatError(
      `Unsupported executable flags: ${flags}`
    );
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  const origin = view.getUint16(6, false);
  const wordCount = view.getUint32(8, false);

  if (origin + wordCount > MEMORY_SIZE) {
    throw new ExecutableFormatError(
      "Executable exceeds the address space"
    );
  }

  const expectedLength = HEADER_SIZE + wordCount * 2;

  if (bytes.byteLength !== expectedLength) {
    throw new ExecutableFormatError(
      `Invalid executable length: expected ${expectedLength} bytes, got ${bytes.byteLength}`
    );
  }

  const words = new Array(wordCount);

  for (let i = 0; i < wordCount; i++) {
    words[i] = view.getUint16(
      HEADER_SIZE + i * 2,
      false
    );
  }

  return {
    version,
    origin,
    words,
  };
}

export const EXECUTABLE_HEADER_SIZE = HEADER_SIZE;
