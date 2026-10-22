import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compile,
  assemble,
  encodeExecutable,
  VirtualMachine,
  decodeInstruction,
  WORD_MASK,
  FLAG,
} from "../ndk/index.js";

import {
  buildSourceMap,
  buildSymbolMap,
  buildBitfield,
  buildDataPath,
  inferRegisterContext,
  extractStackSnapshot,
} from "./analysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const PRESETS = {
  "hello": {
    name: "Hello World",
    code: `// Print string literals
print("Hello from Nova!\n");
`,
  },
  "variables": {
    name: "Variables & Arithmetic",
    code: `// Declare variables using make int
make int base = 100;
make int bonus = 25;
make int penalty = 5;

// Parenthesized expressions
make int score = (base + bonus) - penalty;

print("Final Score: ");
print(score);
print("\n");
`,
  },
  "conditionals": {
    name: "Conditionals (if / else if / else)",
    code: `make int score = 85;

if (score >= 90) {
    print("Grade: A\n");
} else if (score >= 80) {
    print("Grade: B\n");
} else if (score >= 70) {
    print("Grade: C\n");
} else {
    print("Grade: F\n");
}
`,
  },
  "run-loop": {
    name: "Run Loop ('run x times')",
    code: `make int total = 0;

run 5 times {
    total = total + 10;
}

print("Total accumulated: ");
print(total);
print("\n");
`,
  },
  "while-loop": {
    name: "While Loop (break & continue)",
    code: `make int n = 0;

while (n < 6) {
    n = n + 1;
    if (n == 2) {
        continue; // skip printing 2
    }
    if (n == 5) {
        break;    // stop before 5
    }
    print(n);
}
print("\n");
`,
  },
  "nested-loops": {
    name: "Nested Loops",
    code: `make int count = 0;

run 3 times {
    run 2 times {
        count = count + 1;
    }
}

print("Total iterations: ");
print(count);
print("\n");
`,
  },
  "functions": {
    name: "Functions & ABI Subroutines (Recursion)",
    code: `make function sum(int n) : int {
    if (n <= 1) {
        return 1;
    }
    return n + sum(n - 1);
}

make int n = 5;
make int result = sum(n);

print("Recursive sum of 1..5 = ");
print(result);
print("\\n");
`,
  },
};

function formatCC(cc) {
  const parts = [];
  if (cc & FLAG.N) parts.push("N (Negative)");
  if (cc & FLAG.Z) parts.push("Z (Zero)");
  if (cc & FLAG.P) parts.push("P (Positive)");
  return parts.join(", ") || "None";
}

function disassemble(word, pc) {
  try {
    const inst = decodeInstruction(word);
    switch (inst.op) {
      case "NOP": return "NOP";
      case "LOADI": return `LOADI R${inst.dr}, #${inst.immediate}`;
      case "ADDI": return `ADDI R${inst.register}, #${inst.immediate}`;
      case "ADD": return `ADD R${inst.dr}, R${inst.sr1}, R${inst.sr2}`;
      case "AND": return `AND R${inst.dr}, R${inst.sr1}, R${inst.sr2}`;
      case "NOT": return `NOT R${inst.dr}, R${inst.sr}`;
      case "LD": return `LD R${inst.register}, #${inst.offset} [0x${((pc + 1 + inst.offset) & WORD_MASK).toString(16).toUpperCase()}]`;
      case "ST": return `ST R${inst.register}, #${inst.offset} [0x${((pc + 1 + inst.offset) & WORD_MASK).toString(16).toUpperCase()}]`;
      case "LDR": return `LDR R${inst.dr}, R${inst.baseR}, #${inst.offset}`;
      case "STR": return `STR R${inst.sr}, R${inst.baseR}, #${inst.offset}`;
      case "BR": {
        const cond = [];
        if (inst.mask & 4) cond.push("n");
        if (inst.mask & 2) cond.push("z");
        if (inst.mask & 1) cond.push("p");
        return `BR${cond.join("")} [0x${((pc + 1 + inst.offset) & WORD_MASK).toString(16).toUpperCase()}]`;
      }
      case "JMP": return inst.baseR === 7 ? "RET (JMP R7)" : `JMP R${inst.baseR}`;
      case "TRAP": {
        if (inst.vector === 0x21) return "TRAP x21 (OUT)";
        if (inst.vector === 0x22) return "TRAP x22 (PUTS)";
        if (inst.vector === 0x25) return "TRAP x25 (HALT)";
        return `TRAP x${inst.vector.toString(16).toUpperCase()}`;
      }
      case "HALT": return "HALT";
      default: return `0x${word.toString(16).padStart(4, "0").toUpperCase()}`;
    }
  } catch {
    return `.FILL #${word >= 0x8000 ? word - 0x10000 : word} (0x${word.toString(16).padStart(4, "0").toUpperCase()})`;
  }
}

function explainInstruction(inst, word, pcBefore, regsBefore, regsAfter, memAccess, ccBefore, ccAfter) {
  if (!inst) {
    return `Data word: 0x${word.toString(16).padStart(4, "0").toUpperCase()}`;
  }

  const ccStr = formatCC(ccAfter);

  switch (inst.op) {
    case "NOP":
      return "No-Operation: CPU does nothing this cycle.";
    case "LOADI":
      return `LOADI: Loaded immediate value #${inst.immediate} (0x${inst.immediate.toString(16).toUpperCase()}) into R${inst.dr}. Condition code set to ${ccStr}.`;
    case "ADDI":
      return `ADDI: Added immediate #${inst.immediate} to R${inst.register} (${regsBefore[inst.register]}) -> Result: ${regsAfter[inst.register]} stored into R${inst.register}. Condition code set to ${ccStr}.`;
    case "ADD":
      return `ADD: Added R${inst.sr1} (${regsBefore[inst.sr1]}) + R${inst.sr2} (${regsBefore[inst.sr2]}) -> Result: ${regsAfter[inst.dr]} stored into R${inst.dr}. Condition code set to ${ccStr}.`;
    case "AND":
      return `AND: Bitwise AND of R${inst.sr1} & R${inst.sr2} -> Result: 0x${regsAfter[inst.dr].toString(16).toUpperCase()} stored into R${inst.dr}. Condition code set to ${ccStr}.`;
    case "NOT":
      return `NOT: Bitwise NOT of R${inst.sr} (~${regsBefore[inst.sr]}) -> Result: 0x${regsAfter[inst.dr].toString(16).toUpperCase()} stored into R${inst.dr}. Condition code set to ${ccStr}.`;
    case "LD": {
      const targetAddr = (pcBefore + 1 + inst.offset) & WORD_MASK;
      const val = memAccess.find((m) => m.type === "read" && m.address === targetAddr)?.value ?? regsAfter[inst.register];
      return `LD: Loaded word from address 0x${targetAddr.toString(16).toUpperCase()} (value: ${val}) into R${inst.register}. Condition code set to ${ccStr}.`;
    }
    case "ST": {
      const targetAddr = (pcBefore + 1 + inst.offset) & WORD_MASK;
      return `ST: Stored value ${regsBefore[inst.register]} from R${inst.register} into memory address 0x${targetAddr.toString(16).toUpperCase()}.`;
    }
    case "LDR": {
      const baseAddr = regsBefore[inst.baseR];
      const targetAddr = (baseAddr + inst.offset) & WORD_MASK;
      return `LDR: Read base register R${inst.baseR} (0x${baseAddr.toString(16).toUpperCase()}) + offset #${inst.offset} -> Address 0x${targetAddr.toString(16).toUpperCase()}, loaded value ${regsAfter[inst.dr]} into R${inst.dr}.`;
    }
    case "STR": {
      const baseAddr = regsBefore[inst.baseR];
      const targetAddr = (baseAddr + inst.offset) & WORD_MASK;
      return `STR: Stored value ${regsBefore[inst.sr]} from R${inst.sr} into address [R${inst.baseR} + #${inst.offset}] (0x${targetAddr.toString(16).toUpperCase()}).`;
    }
    case "BR": {
      const targetAddr = (pcBefore + 1 + inst.offset) & WORD_MASK;
      const taken = ((ccBefore & inst.mask) !== 0);
      return `BR: Evaluated branch condition against previous CC (${formatCC(ccBefore)}). Condition met? ${taken ? `YES -> Jumped to 0x${targetAddr.toString(16).toUpperCase()}` : "NO -> Continued to next instruction"}.`;
    }
    case "JMP": {
      const targetAddr = regsBefore[inst.baseR];
      if (inst.baseR === 7) {
        return `RET (JMP R7): Subroutine return to address 0x${targetAddr.toString(16).toUpperCase()} held in link register R7.`;
      }
      return `JMP: Unconditional jump to address 0x${targetAddr.toString(16).toUpperCase()} stored in R${inst.baseR}.`;
    }
    case "TRAP": {
      if (inst.vector === 0x21) {
        const char = String.fromCharCode(regsBefore[0] & 0xFF);
        return `TRAP x21 (OUT): Output character '${char}' (ASCII #${regsBefore[0]}) to console output.`;
      }
      if (inst.vector === 0x22) {
        return `TRAP x22 (PUTS): Output null-terminated string starting at address 0x${regsBefore[0].toString(16).toUpperCase()} to console.`;
      }
      if (inst.vector === 0x25) {
        return "TRAP x25 (HALT): Execution completed. Virtual Machine has halted.";
      }
      return `TRAP x${inst.vector.toString(16).toUpperCase()}: Invoked system trap service routine.`;
    }
    case "HALT":
      return "HALT: Processor execution halted.";
    default:
      return `Executed instruction: ${inst.op}`;
  }
}

function runTrace(source, maxSteps = 10_000) {
  const compilation = compile(source);
  const assembled = assemble(compilation.assembly);

  const sourceMap = buildSourceMap(compilation.assembly);
  const symbolMap = buildSymbolMap(compilation.symbols, assembled.symbols, assembled.words, assembled.origin);

  let currentStepOutput = "";
  let cumulativeOutput = "";

  const vm = new VirtualMachine({
    writeOutput: (text) => {
      currentStepOutput += text;
      cumulativeOutput += text;
    },
  });
  vm.loadProgram(assembled.words, assembled.origin);

  const steps = [];

  // Hook memory read and write for the active step
  let currentMemAccess = [];
  const origRead = vm.memory.read.bind(vm.memory);
  const origWrite = vm.memory.write.bind(vm.memory);

  vm.memory.read = (addr) => {
    const val = origRead(addr);
    currentMemAccess.push({ type: "read", address: addr, value: val });
    return val;
  };

  vm.memory.write = (addr, val) => {
    origWrite(addr, val);
    currentMemAccess.push({ type: "write", address: addr, value: val });
  };

  let stepCount = 0;
  while (!vm.halted && stepCount < maxSteps) {
    currentMemAccess = [];
    currentStepOutput = "";

    const pcBefore = vm.pc;
    const regsBefore = Array.from(vm.registers);
    const ccBefore = vm.cc;
    const word = vm.memory.read(pcBefore);

    let decoded = null;
    try {
      decoded = decodeInstruction(word);
    } catch {
      // not a valid instruction
    }

    const mnemonic = disassemble(word, pcBefore);

    // Execute 1 CPU step
    vm.step();
    stepCount++;

    const pcAfter = vm.pc;
    const regsAfter = Array.from(vm.registers);
    const ccAfter = vm.cc;

    const changedRegisters = [];
    const deltas = [];
    for (let r = 0; r < 8; r++) {
      if (regsBefore[r] !== regsAfter[r]) {
        changedRegisters.push(r);
        const diff = regsAfter[r] - regsBefore[r];
        deltas.push({
          reg: r,
          oldVal: regsBefore[r],
          newVal: regsAfter[r],
          delta: diff,
          type: diff > 0 ? "inc" : diff < 0 ? "dec" : "set",
        });
      }
    }

    const explanation = explainInstruction(
      decoded,
      word,
      pcBefore,
      regsBefore,
      regsAfter,
      currentMemAccess,
      ccBefore,
      ccAfter
    );

    const bitfield = buildBitfield(word, pcBefore);
    const dataPath = buildDataPath(decoded, word, pcBefore, regsBefore, regsAfter, currentMemAccess, ccAfter);

    const contexts = [];
    for (let r = 0; r < 8; r++) {
      contexts.push(inferRegisterContext(r, regsAfter[r], symbolMap, vm.memory));
    }

    const stack = extractStackSnapshot(vm);

    steps.push({
      step: stepCount,
      pcBefore,
      pcAfter,
      sourceLine: sourceMap[pcBefore] || null,
      activeSymbol: symbolMap[pcBefore] || null,
      word,
      hexWord: "0x" + word.toString(16).padStart(4, "0").toUpperCase(),
      mnemonic,
      decoded,
      bitfield,
      dataPath,
      registersBefore: regsBefore,
      registersAfter: regsAfter,
      changedRegisters,
      deltas,
      contexts,
      stack,
      ccBefore,
      ccAfter,
      ccBeforeStr: formatCC(ccBefore),
      ccAfterStr: formatCC(ccAfter),
      memoryAccess: currentMemAccess,
      explanation,
      output: currentStepOutput,
      cumulativeOutput,
      halted: vm.halted,
    });
  }

  // Restore memory hooks
  vm.memory.read = origRead;
  vm.memory.write = origWrite;

  return {
    totalSteps: stepCount,
    halted: vm.halted,
    output: cumulativeOutput,
    steps,
    sourceMap,
    symbolMap,
  };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Get sample presets
  if (req.method === "GET" && pathname === "/api/presets") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(PRESETS));
    return;
  }

  // API: Compile
  if (req.method === "POST" && pathname === "/api/compile") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { source } = JSON.parse(body || "{}");
        if (!source || typeof source !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing or invalid 'source' parameter" }));
          return;
        }

        const compilation = compile(source);
        const assembled = assemble(compilation.assembly);
        const executable = encodeExecutable({
          origin: assembled.origin,
          words: assembled.words,
        });

        const sourceMap = buildSourceMap(compilation.assembly);
        const symbolMap = buildSymbolMap(compilation.symbols, assembled.symbols, assembled.words, assembled.origin);

        // Build memory words disassembly list
        const memoryWords = assembled.words.map((word, index) => {
          const address = assembled.origin + index;
          const sym = symbolMap[address];
          return {
            address,
            hexAddress: "0x" + address.toString(16).toUpperCase(),
            word,
            hexWord: "0x" + word.toString(16).padStart(4, "0").toUpperCase(),
            disassembly: disassemble(word, address),
            label: sym ? sym.label : null,
            varName: sym ? sym.varName : null,
            role: sym ? sym.role : null,
            sourceLine: sourceMap[address] || null,
          };
        });

        const symbolsArray = Array.from(compilation.symbols.entries()).map(([name, sym]) => ({
          name,
          slot: sym.slot,
          valueType: sym.valueType,
          line: sym.line,
          column: sym.column,
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            tokens: compilation.tokens,
            ast: compilation.ast,
            symbols: symbolsArray,
            symbolMap,
            sourceMap,
            assembly: compilation.assembly,
            origin: assembled.origin,
            wordCount: assembled.words.length,
            memoryWords,
            executableSize: executable.byteLength,
          })
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: err.message,
            stack: err.stack,
          })
        );
      }
    });
    return;
  }

  // API: Trace Execution Steps
  if (req.method === "POST" && pathname === "/api/trace") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { source, maxSteps } = JSON.parse(body || "{}");
        if (!source || typeof source !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing or invalid 'source' parameter" }));
          return;
        }

        const trace = runTrace(source, maxSteps || 5000);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...trace }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: err.message,
            stack: err.stack,
          })
        );
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end("Internal Server Error");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    });
  });
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Nova & NVM Visualizer Server is running!`);
  console.log(`👉 Open in browser: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
