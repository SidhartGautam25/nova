// Nova & NVM Visualizer Client Application

const state = {
  presets: {},
  code: "",
  compilation: null,
  trace: null,
  currentStepIndex: -1,
  isPlaying: false,
  playTimer: null,
  playSpeed: 250,
  memoryFilter: "around-pc",
  memoryJumpAddress: null,
};

// DOM Elements
const editor = document.getElementById("code-editor");
const lineNumbers = document.getElementById("line-numbers");
const activeLineIndicator = document.getElementById("active-line-indicator");
const presetSelect = document.getElementById("preset-select");
const compileBtn = document.getElementById("compile-btn");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");

// Pipeline Elements
const pipelineTabs = document.getElementById("pipeline-tabs");
const tokensTbody = document.getElementById("tokens-tbody");
const tokensMeta = document.getElementById("tokens-meta");
const astView = document.getElementById("ast-view");
const symbolsTbody = document.getElementById("symbols-tbody");
const asmView = document.getElementById("asm-view");
const binaryTbody = document.getElementById("binary-tbody");

// VM Controls
const btnReset = document.getElementById("btn-reset");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnPlay = document.getElementById("btn-play");
const speedSelect = document.getElementById("speed-select");
const stepCounterText = document.getElementById("step-counter-text");
const execStatusBadge = document.getElementById("exec-status-badge");
const progressFill = document.getElementById("progress-fill");

// Step Details & Bitfield & DataPath
const currentPcVal = document.getElementById("current-pc-val");
const currentInstVal = document.getElementById("current-inst-val");
const bitfieldRawHex = document.getElementById("bitfield-raw-hex");
const bitfieldGrid = document.getElementById("bitfield-grid");
const dpFetchVal = document.getElementById("dp-fetch-val");
const dpDecodeVal = document.getElementById("dp-decode-val");
const dpAddrVal = document.getElementById("dp-addr-val");
const dpExecVal = document.getElementById("dp-exec-val");
const explanationText = document.getElementById("explanation-text");

// CC Flags
const ccFlagN = document.getElementById("cc-flag-n");
const ccFlagZ = document.getElementById("cc-flag-z");
const ccFlagP = document.getElementById("cc-flag-p");

// Dedicated Stack Visualizer
const stackDepthTag = document.getElementById("stack-depth-tag");
const stackVisualizerContainer = document.getElementById("stack-visualizer-container");

// Memory Inspector & Heatmap
const memoryTbody = document.getElementById("memory-tbody");
const memoryScrollContainer = document.getElementById("memory-scroll-container");
const heatmapBar = document.getElementById("heatmap-bar");
const hmPcNeedle = document.getElementById("hm-pc-needle");
const heatmapCurrentTag = document.getElementById("heatmap-current-tag");

// Terminal
const terminalOutput = document.getElementById("terminal-output");
const clearTermBtn = document.getElementById("clear-term-btn");

// Initialize
async function init() {
  setupEventListeners();
  await loadPresets();
  updateLineNumbers();

  // Load default preset and compile
  if (presetSelect.value && state.presets[presetSelect.value]) {
    editor.value = state.presets[presetSelect.value].code;
    updateLineNumbers();
    compileAndTrace();
  }
}

function setStatus(text, type = "ready") {
  statusText.textContent = text;
  statusPill.className = `status-pill ${type}`;
}

// Line Numbers & Active Line Highlighting
function updateLineNumbers(activeLine = null) {
  const lines = editor.value.split("\n").length;
  let html = "";
  for (let i = 1; i <= Math.max(lines, 1); i++) {
    const isActive = activeLine === i;
    html += `<span class="line-num ${isActive ? 'active-line' : ''}" id="line-num-${i}">${i}</span>\n`;
  }
  lineNumbers.innerHTML = html;

  if (activeLineIndicator) {
    if (activeLine) {
      activeLineIndicator.textContent = `Line: ${activeLine}`;
      activeLineIndicator.style.display = "inline-block";
    } else {
      activeLineIndicator.textContent = "Line: ---";
    }
  }
}

// Event Listeners
function setupEventListeners() {
  editor.addEventListener("input", () => {
    updateLineNumbers();
  });

  editor.addEventListener("scroll", () => {
    lineNumbers.scrollTop = editor.scrollTop;
  });

  presetSelect.addEventListener("change", () => {
    const key = presetSelect.value;
    if (state.presets[key]) {
      editor.value = state.presets[key].code;
      updateLineNumbers();
      compileAndTrace();
    }
  });

  compileBtn.addEventListener("click", () => {
    compileAndTrace();
  });

  // Pipeline Tabs
  pipelineTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const tabId = btn.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const pane = document.getElementById(tabId);
    if (pane) pane.classList.add("active");
  });

  // Stepper Buttons
  btnNext.addEventListener("click", () => {
    pausePlay();
    stepForward();
  });

  btnPrev.addEventListener("click", () => {
    pausePlay();
    stepBackward();
  });

  btnReset.addEventListener("click", () => {
    pausePlay();
    resetStepper();
  });

  btnPlay.addEventListener("click", () => {
    togglePlay();
  });

  speedSelect.addEventListener("change", () => {
    state.playSpeed = Number(speedSelect.value) || 250;
    if (state.isPlaying) {
      pausePlay();
      togglePlay();
    }
  });

  // Memory Filter Buttons
  document.querySelectorAll(".mem-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mem-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.memoryFilter = btn.dataset.filter;
      state.memoryJumpAddress = null;
      renderMemory();
    });
  });

  // Memory Heatmap Segment Clicks
  heatmapBar.addEventListener("click", (e) => {
    const seg = e.target.closest(".hm-segment");
    if (!seg || !seg.dataset.jump) return;
    const targetAddr = Number(seg.dataset.jump);
    state.memoryFilter = "jump";
    state.memoryJumpAddress = targetAddr;

    document.querySelectorAll(".mem-filter-btn").forEach((b) => b.classList.remove("active"));
    renderMemory();
  });

  // Expand / Fullscreen Scalability Buttons
  document.querySelectorAll(".btn-expand").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.dataset.card;
      const card = document.getElementById(cardId);
      if (!card) return;

      const isExpanded = card.classList.toggle("expanded");
      btn.textContent = isExpanded ? "✖" : "⛶";
      btn.title = isExpanded ? "Close Fullscreen" : "Toggle Fullscreen";
    });
  });

  // Clear Terminal
  clearTermBtn.addEventListener("click", () => {
    terminalOutput.textContent = "";
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".card.expanded").forEach((c) => {
        c.classList.remove("expanded");
        const btn = c.querySelector(".btn-expand");
        if (btn) {
          btn.textContent = "⛶";
          btn.title = "Toggle Fullscreen";
        }
      });
      return;
    }

    if (document.activeElement === editor) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      pausePlay();
      stepForward();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      pausePlay();
      stepBackward();
    } else if (e.key === " " && !e.target.matches("input, textarea, select")) {
      e.preventDefault();
      togglePlay();
    }
  });
}

// Fetch Presets
async function loadPresets() {
  try {
    const res = await fetch("/api/presets");
    state.presets = await res.json();
    presetSelect.innerHTML = "";
    for (const [key, item] of Object.entries(state.presets)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = item.name;
      presetSelect.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load presets:", err);
  }
}

// Compile & Trace Pipeline
async function compileAndTrace() {
  pausePlay();
  setStatus("Compiling...", "compiling");

  const source = editor.value;

  try {
    // 1. Fetch Compilation artifacts
    const compRes = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    const compData = await compRes.json();

    if (!compData.success) {
      throw new Error(compData.error || "Compilation failed");
    }

    state.compilation = compData;
    renderCompilerStages(compData);

    // 2. Fetch Trace execution
    const traceRes = await fetch("/api/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    const traceData = await traceRes.json();

    if (!traceData.success) {
      throw new Error(traceData.error || "Execution failed");
    }

    state.trace = traceData;
    setStatus(`Compiled (${compData.wordCount} words)`, "ready");

    resetStepper();
  } catch (err) {
    setStatus("Error", "error");
    explanationText.innerHTML = `<span style="color: #f43f5e; font-weight: 600;">Error: ${escapeHtml(err.message)}</span>`;
    terminalOutput.textContent = `Compilation Error:\n${err.message}`;
    console.error(err);
  }
}

// Render Compiler Stages
function renderCompilerStages(data) {
  // 1. Tokens
  tokensMeta.textContent = `Total Tokens: ${data.tokens.length}`;
  tokensTbody.innerHTML = data.tokens
    .map(
      (tok, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="badge badge-accent">${escapeHtml(tok.type)}</span></td>
      <td><code>${escapeHtml(JSON.stringify(tok.value))}</code></td>
      <td>${tok.line}:${tok.column}</td>
    </tr>
  `
    )
    .join("");

  // 2. AST
  astView.textContent = JSON.stringify(data.ast, null, 2);

  // 3. Symbols
  if (data.symbols.length === 0) {
    symbolsTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No user variables declared in this program.</td></tr>`;
  } else {
    symbolsTbody.innerHTML = data.symbols
      .map(
        (sym) => `
      <tr>
        <td><strong>${escapeHtml(sym.name)}</strong></td>
        <td><code>slot #${sym.slot} (VAR_${sym.slot})</code></td>
        <td><span class="badge badge-accent">${escapeHtml(sym.valueType)}</span></td>
        <td>Line ${sym.line}</td>
      </tr>
    `
      )
      .join("");
  }

  // 4. Assembly (.asm)
  asmView.textContent = data.assembly;

  // 5. Binary Words
  const symbolMap = data.symbolMap || {};
  binaryTbody.innerHTML = data.memoryWords
    .map((mw) => {
      const symInfo = symbolMap[mw.address];
      const symLabel = symInfo ? (symInfo.varName ? `${symInfo.label} (${symInfo.varName})` : symInfo.label) : "—";
      return `
    <tr>
      <td><code>${mw.hexAddress}</code></td>
      <td><code>${mw.hexWord}</code></td>
      <td><span class="mem-symbol">${escapeHtml(symLabel)}</span></td>
      <td>#${mw.word}</td>
      <td><code>${escapeHtml(mw.disassembly)}</code></td>
    </tr>
  `;
    })
    .join("");
}

// Stepper Logic
function resetStepper() {
  state.currentStepIndex = -1;
  terminalOutput.textContent = "";
  updateLineNumbers(null);
  renderStep();
}

function stepForward() {
  if (!state.trace || !state.trace.steps) return;
  if (state.currentStepIndex < state.trace.steps.length - 1) {
    state.currentStepIndex++;
    renderStep();
  } else {
    pausePlay();
  }
}

function stepBackward() {
  if (!state.trace || !state.trace.steps) return;
  if (state.currentStepIndex > 0) {
    state.currentStepIndex--;
    renderStep();
  } else if (state.currentStepIndex === 0) {
    state.currentStepIndex = -1;
    renderStep();
  }
}

function togglePlay() {
  if (state.isPlaying) {
    pausePlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  if (!state.trace || !state.trace.steps) return;
  if (state.currentStepIndex >= state.trace.steps.length - 1) {
    state.currentStepIndex = -1;
  }
  state.isPlaying = true;
  btnPlay.textContent = "⏸ Pause";
  btnPlay.className = "btn btn-secondary";
  setStatus("Running...", "running");

  state.playTimer = setInterval(() => {
    if (state.currentStepIndex < state.trace.steps.length - 1) {
      stepForward();
    } else {
      pausePlay();
    }
  }, state.playSpeed);
}

function pausePlay() {
  state.isPlaying = false;
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
  }
  btnPlay.textContent = "▶▶ Auto Play";
  btnPlay.className = "btn btn-success";

  if (state.trace && state.currentStepIndex >= state.trace.steps.length - 1) {
    setStatus("Halted", "halted");
  } else {
    setStatus("Ready", "ready");
  }
}

// Render Active Step State
function renderStep() {
  if (!state.trace || !state.compilation) return;

  const total = state.trace.steps.length;
  const isStart = state.currentStepIndex === -1;
  const step = isStart ? null : state.trace.steps[state.currentStepIndex];

  // Update Step Counter & Progress
  const displayStep = isStart ? 0 : state.currentStepIndex + 1;
  stepCounterText.innerHTML = `Step: <strong>${displayStep}</strong> / ${total}`;
  const pct = total === 0 ? 0 : Math.round((displayStep / total) * 100);
  progressFill.style.width = `${pct}%`;

  // Status Badge
  if (isStart) {
    execStatusBadge.textContent = "Initial State";
    execStatusBadge.className = "badge badge-neutral";
  } else if (step.halted) {
    execStatusBadge.textContent = "Halted";
    execStatusBadge.className = "badge badge-accent";
  } else {
    execStatusBadge.textContent = "Executing";
    execStatusBadge.className = "badge badge-neutral";
  }

  // Source-to-Assembly Sync (Source line highlight)
  if (step && step.sourceLine) {
    updateLineNumbers(step.sourceLine);
  } else if (isStart) {
    updateLineNumbers(null);
  }

  // Registers & CC
  let regs = isStart ? new Array(8).fill(0) : step.registersAfter;
  let pc = isStart ? state.compilation.origin : step.pcBefore;
  let cc = isStart ? 0b010 : step.ccAfter;
  let changedRegs = isStart ? [] : step.changedRegisters;

  // Set initial stack pointer R6 if at start
  if (isStart) {
    regs[6] = 0xFF00; // default SP
  }

  // Update Explanation & Current Instruction
  if (isStart) {
    currentPcVal.textContent = "0x" + state.compilation.origin.toString(16).toUpperCase();
    currentInstVal.textContent = "Ready to execute";
    explanationText.innerHTML = `Program loaded at <strong>0x${state.compilation.origin.toString(16).toUpperCase()}</strong> (${state.compilation.wordCount} words). Click <strong>"Next Step"</strong> to begin execution.`;
    bitfieldRawHex.textContent = "0x0000";
    bitfieldGrid.innerHTML = `<div class="empty-state" style="padding: 10px !important; width: 100%;">Instruction Register (IR) ready for Fetch cycle.</div>`;
    dpFetchVal.textContent = `PC (0x${state.compilation.origin.toString(16).toUpperCase()}) ➔ MAR`;
    dpDecodeVal.textContent = "Awaiting instruction word";
    dpAddrVal.textContent = "---";
    dpExecVal.textContent = "ALU / Register Write Pending";
  } else {
    currentPcVal.textContent = "0x" + step.pcBefore.toString(16).toUpperCase();
    currentInstVal.textContent = `${step.mnemonic} (${step.hexWord})`;
    explanationText.innerHTML = escapeHtml(step.explanation);

    // 16-Bit Bitfield Breakdown Rendering
    if (step.bitfield) {
      bitfieldRawHex.textContent = `${step.bitfield.rawHex} (${step.bitfield.rawBinary.replace(/(\d{4})/g, "$1 ").trim()})`;
      bitfieldGrid.innerHTML = step.bitfield.fields
        .map(
          (f) => `
        <div class="bitfield-cell bitfield-${f.type}">
          <div class="bf-header">${escapeHtml(f.name)} <span class="bf-span">[${f.span}]</span></div>
          <div class="bf-bits">${escapeHtml(f.bits)}</div>
          <div class="bf-meaning">${escapeHtml(f.meaning)}</div>
        </div>
      `
        )
        .join("");
    }

    // 4-Stage Micro-Architecture Data-Path
    if (step.dataPath) {
      dpFetchVal.textContent = step.dataPath.fetch;
      dpDecodeVal.textContent = step.dataPath.decode;
      dpAddrVal.textContent = step.dataPath.addressEval;
      dpExecVal.textContent = step.dataPath.execute;
    }
  }

  // Update CC Badges
  ccFlagN.classList.toggle("active", (cc & 4) !== 0);
  ccFlagZ.classList.toggle("active", (cc & 2) !== 0);
  ccFlagP.classList.toggle("active", (cc & 1) !== 0);

  // Map deltas by register index
  const deltaMap = {};
  if (step && step.deltas) {
    for (const d of step.deltas) {
      deltaMap[d.reg] = d;
    }
  }

  // Update Register Cells (R0 - R7)
  for (let r = 0; r < 8; r++) {
    const hexEl = document.getElementById(`reg-val-${r}`);
    const decEl = document.getElementById(`reg-dec-${r}`);
    const cellEl = document.getElementById(`reg-cell-${r}`);
    const deltaEl = document.getElementById(`reg-delta-${r}`);
    const ctxEl = document.getElementById(`reg-ctx-${r}`);

    const val = regs[r];
    const signedVal = val >= 0x8000 ? val - 0x10000 : val;

    hexEl.textContent = "0x" + val.toString(16).padStart(4, "0").toUpperCase();
    decEl.textContent = `#${signedVal}`;

    // Delta badge
    if (deltaMap[r]) {
      const d = deltaMap[r];
      deltaEl.textContent = d.delta > 0 ? `+${d.delta}` : d.delta < 0 ? `${d.delta}` : `=${d.newVal}`;
      deltaEl.className = `delta-badge ${d.type}`;
    } else {
      deltaEl.className = "delta-badge";
      deltaEl.textContent = "";
    }

    // Smart context tag
    if (step && step.contexts && step.contexts[r]) {
      const ctx = step.contexts[r];
      const tagText = ctx.note || ctx.tag || "---";
      ctxEl.textContent = tagText;
      ctxEl.title = ctx.note || "";
    } else {
      ctxEl.textContent = r === 5 ? "Base of Stack Frame" : r === 6 ? "Top of Stack (LIFO)" : "---";
    }

    // Highlight changes
    if (changedRegs.includes(r)) {
      cellEl.classList.add("changed");
      setTimeout(() => cellEl.classList.remove("changed"), 800);
    }
  }

  // Render Dedicated Stack Visualizer
  renderStackVisualizer(step, regs);

  // Update Terminal Output
  terminalOutput.textContent = isStart ? "" : step.cumulativeOutput;

  // Render Memory
  renderMemory(pc, step);
}

// Render Dedicated LIFO Stack Visualizer
function renderStackVisualizer(step, regs) {
  const sp = regs[6];
  const fp = regs[5];
  const stackDepth = Math.max(0, 0xFF00 - sp);
  stackDepthTag.textContent = `Stack Depth: ${stackDepth} words`;

  if (step && step.stack && step.stack.length > 0) {
    stackVisualizerContainer.innerHTML = step.stack
      .map(
        (slot) => `
      <div class="stack-slot ${slot.isSP ? 'sp' : ''} ${slot.isFP ? 'fp' : ''}">
        <span class="stack-slot-addr">${slot.hexAddress}</span>
        <span class="stack-slot-val">${slot.hexValue} (#${slot.signedValue})</span>
        <div class="stack-slot-ptr">
          ${slot.isSP ? '<span class="stack-ptr-badge sp-badge">SP ➔ R6</span>' : ''}
          ${slot.isFP ? '<span class="stack-ptr-badge fp-badge">FP ➔ R5</span>' : ''}
        </div>
        <span class="stack-slot-role">${escapeHtml(slot.role)}</span>
      </div>
    `
      )
      .join("");
  } else {
    stackVisualizerContainer.innerHTML = `
      <div class="stack-slot sp">
        <span class="stack-slot-addr">0xFF00</span>
        <span class="stack-slot-val">0x0000 (#0)</span>
        <div class="stack-slot-ptr"><span class="stack-ptr-badge sp-badge">SP ➔ R6</span></div>
        <span class="stack-slot-role">Stack Top Initial Boundary (0xFF00)</span>
      </div>
    `;
  }
}

// Render Memory Table & Heatmap
function renderMemory(currentPc = state.compilation?.origin ?? 0x3000, step = null) {
  if (!state.compilation) return;

  const origin = state.compilation.origin;
  const wordCount = state.compilation.wordCount;
  const memoryWords = state.compilation.memoryWords;
  const symbolMap = (state.trace && state.trace.symbolMap) || state.compilation.symbolMap || {};

  // Update Heatmap Needle & Tag
  const needlePct = Math.min(100, Math.max(0, (currentPc / 65535) * 100));
  hmPcNeedle.style.left = `${needlePct}%`;
  heatmapCurrentTag.textContent = `PC: 0x${currentPc.toString(16).toUpperCase()}`;

  // Track memory writes up to current step
  const memoryStateMap = new Map();
  for (const mw of memoryWords) {
    memoryStateMap.set(mw.address, mw.word);
  }

  if (state.trace && state.currentStepIndex >= 0) {
    for (let i = 0; i <= state.currentStepIndex; i++) {
      const s = state.trace.steps[i];
      for (const mem of s.memoryAccess) {
        if (mem.type === "write") {
          memoryStateMap.set(mem.address, mem.value);
        }
      }
    }
  }

  const readAddrs = step ? step.memoryAccess.filter((m) => m.type === "read").map((m) => m.address) : [];
  const writeAddrs = step ? step.memoryAccess.filter((m) => m.type === "write").map((m) => m.address) : [];

  let addressesToShow = [];

  if (state.memoryFilter === "around-pc") {
    const start = Math.max(origin, currentPc - 6);
    const end = Math.min(origin + wordCount + 12, currentPc + 14);
    for (let a = start; a <= end; a++) addressesToShow.push(a);
  } else if (state.memoryFilter === "code") {
    for (let a = origin; a < origin + Math.min(wordCount, 120); a++) {
      addressesToShow.push(a);
    }
  } else if (state.memoryFilter === "data") {
    for (let a = origin + 16; a < origin + wordCount + 8; a++) {
      addressesToShow.push(a);
    }
  } else if (state.memoryFilter === "stack") {
    for (let a = 0xFF00; a >= 0xFEE0; a--) {
      addressesToShow.push(a);
    }
  } else if (state.memoryFilter === "jump" && state.memoryJumpAddress !== null) {
    const jumpStart = Math.max(0, state.memoryJumpAddress - 4);
    const jumpEnd = Math.min(0xFFFF, state.memoryJumpAddress + 24);
    for (let a = jumpStart; a <= jumpEnd; a++) {
      addressesToShow.push(a);
    }
  } else {
    for (let a = origin; a < origin + wordCount; a++) {
      addressesToShow.push(a);
    }
  }

  let rowsHtml = "";
  for (const addr of addressesToShow) {
    const word = memoryStateMap.get(addr) ?? 0;
    const hexAddr = "0x" + addr.toString(16).toUpperCase();
    const hexWord = "0x" + word.toString(16).padStart(4, "0").toUpperCase();
    const signedVal = word >= 0x8000 ? word - 0x10000 : word;

    const isPc = addr === (step ? step.pcBefore : currentPc);
    const isRead = readAddrs.includes(addr);
    const isWrite = writeAddrs.includes(addr);

    let rowClass = "";
    if (isPc) rowClass = "row-pc";
    else if (isWrite) rowClass = "row-write";
    else if (isRead) rowClass = "row-read";

    // Symbol / Variable column resolution
    const symInfo = symbolMap[addr];
    let symTag = "—";
    if (symInfo) {
      symTag = symInfo.varName ? `${symInfo.label} (${symInfo.varName})` : symInfo.label;
    }

    // Disassembly or description
    const origMw = memoryWords.find((m) => m.address === addr);
    const desc = origMw ? origMw.disassembly : `Memory Cell (Value: #${signedVal})`;

    rowsHtml += `
      <tr class="${rowClass}" id="mem-row-${addr}">
        <td class="pc-arrow">${isPc ? "👉" : isWrite ? "✍️" : isRead ? "👁️" : ""}</td>
        <td><code>${hexAddr}</code></td>
        <td><span class="mem-symbol">${escapeHtml(symTag)}</span></td>
        <td><code>${hexWord}</code></td>
        <td>#${signedVal}</td>
        <td><code>${escapeHtml(desc)}</code></td>
      </tr>
    `;
  }

  memoryTbody.innerHTML = rowsHtml;

  // Auto-scroll current PC into view smoothly
  const targetRowId = `mem-row-${step ? step.pcBefore : (state.memoryJumpAddress ?? currentPc)}`;
  const targetRow = document.getElementById(targetRowId);
  if (targetRow) {
    targetRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return String(str);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start application
init();
