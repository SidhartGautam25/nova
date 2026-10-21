import test from "node:test";
import assert from "node:assert/strict";

import {
  encodeExecutable,
  decodeExecutable,
  ExecutableFormatError,
  EXECUTABLE_HEADER_SIZE,
} from "../ndk/executable.js";

test("round-trips an executable", () => {
  const input = {
    origin: 0x3000,
    words: [0x1234, 0xABCD, 0xF025],
  };

  const bytes = encodeExecutable(input);
  const output = decodeExecutable(bytes);

  assert.equal(output.version, 1);
  assert.equal(output.origin, input.origin);
  assert.deepEqual(output.words, input.words);
});

test("rejects non-Uint8Array input to decode", () => {
  assert.throws(
    () => decodeExecutable("invalid"),
    /Uint8Array/i
  );
  assert.throws(
    () => decodeExecutable([1, 2, 3]),
    /Uint8Array/i
  );
});

test("rejects an invalid magic value", () => {
  const bytes = encodeExecutable({
    origin: 0x3000,
    words: [0xF025],
  });

  bytes[0] = 0;

  assert.throws(
    () => decodeExecutable(bytes),
    /magic/i
  );
});

test("rejects unsupported format version", () => {
  const bytes = encodeExecutable({
    origin: 0x3000,
    words: [0xF025],
  });

  bytes[4] = 2; // Version 2 instead of 1

  assert.throws(
    () => decodeExecutable(bytes),
    /version/i
  );
});

test("rejects invalid flags when unknown flags are present", () => {
  const bytes = encodeExecutable({
    origin: 0x3000,
    words: [0xF025],
  });

  bytes[5] = 0xFF; // Flags must be 0

  assert.throws(
    () => decodeExecutable(bytes),
    /flags/i
  );
});

test("rejects file shorter than header", () => {
  const shortBytes = new Uint8Array(EXECUTABLE_HEADER_SIZE - 1);

  assert.throws(
    () => decodeExecutable(shortBytes),
    /header|smaller/i
  );
});

test("rejects payload shorter than declared word count", () => {
  const bytes = encodeExecutable({
    origin: 0x3000,
    words: [0x1111, 0x2222, 0x3333],
  });

  // Truncate the last byte
  const truncated = bytes.slice(0, bytes.length - 1);

  assert.throws(
    () => decodeExecutable(truncated),
    /length/i
  );
});

test("rejects payload longer than declared word count", () => {
  const bytes = encodeExecutable({
    origin: 0x3000,
    words: [0x1111],
  });

  // Append extra byte
  const extended = new Uint8Array(bytes.length + 2);
  extended.set(bytes);

  assert.throws(
    () => decodeExecutable(extended),
    /length/i
  );
});

test("rejects origin and payload extending beyond available memory during decode", () => {
  const bytes = encodeExecutable({
    origin: 0xFFF0,
    words: [0x1111],
  });

  // Artificially change origin in bytes to 0xFFFF with 2 words declared
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(6, 0xFFFF, false);
  view.setUint32(8, 2, false);

  assert.throws(
    () => decodeExecutable(bytes),
    /address space|exceeds/i
  );
});

test("rejects origin and payload extending beyond available memory during encode", () => {
  assert.throws(
    () =>
      encodeExecutable({
        origin: 0xFFFE,
        words: [1, 2, 3], // 0xFFFE + 3 = 0x10001 > 0x10000
      }),
    /address space|exceeds/i
  );
});

test("rejects invalid origin supplied to encoder", () => {
  assert.throws(
    () => encodeExecutable({ origin: -1, words: [0] }),
    /origin/i
  );
  assert.throws(
    () => encodeExecutable({ origin: 0x10000, words: [0] }),
    /origin/i
  );
  assert.throws(
    () => encodeExecutable({ origin: "0x3000", words: [0] }),
    /origin/i
  );
  assert.throws(
    () => encodeExecutable({ origin: null, words: [0] }),
    /origin/i
  );
});

test("rejects invalid words array supplied to encoder", () => {
  assert.throws(
    () => encodeExecutable({ origin: 0x3000, words: null }),
    /array/i
  );
  assert.throws(
    () => encodeExecutable({ origin: 0x3000, words: "not-an-array" }),
    /array/i
  );
});

test("rejects invalid word values supplied to encoder", () => {
  assert.throws(
    () => encodeExecutable({ origin: 0x3000, words: [-1] }),
    /16-bit word/i
  );
  assert.throws(
    () => encodeExecutable({ origin: 0x3000, words: [0x10000] }),
    /16-bit word/i
  );
  assert.throws(
    () => encodeExecutable({ origin: 0x3000, words: [1.5] }),
    /16-bit word/i
  );
  assert.throws(
    () => encodeExecutable({ origin: 0x3000, words: ["0x1234"] }),
    /16-bit word/i
  );
});

