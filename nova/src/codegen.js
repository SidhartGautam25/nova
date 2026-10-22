
export class CodegenError extends Error {
  constructor(message, node) {
    const line = node?.line ?? 1;
    const column = node?.column ?? 1;

    super(`${line}:${column}: ${message}`);

    this.name = "CodegenError";
    this.line = line;
    this.column = column;
  }
}

export function generateAssembly(analysis) {
  const ast = analysis.ast;
  const symbols = analysis.symbols;

  const instructions = [];
  const fnInstructions = [];
  let targetInstructions = instructions;
  const data = [];

  let nextConstant = 0;
  let stringCounter=0;

  let printCallCounter = 0;
  let callCounter = 0;
  let loopCounter = 0;
  let whileCounter = 0;
  let ifCounter = 0;
  let cmpCounter = 0;
  const loopStack = [];
  let needsIntegerPrinter = false;
  let currentFunction = null;
  const functionsToEmit = [];
  let boolPrintCounter = 0;

  let zeroConstantLabel = null;
  let oneConstantLabel = null;

  function getZeroLabel() {
    if (!zeroConstantLabel) {
      zeroConstantLabel = addConstant(0);
    }
    return zeroConstantLabel;
  }

  function getOneLabel() {
    if (!oneConstantLabel) {
      oneConstantLabel = addConstant(1);
    }
    return oneConstantLabel;
  }

function emitIntegerPrintCall() {
  needsIntegerPrinter = true;

  const id = printCallCounter++;
  const returnAddressLabel = `PRINT_INT_RETURN_${id}`;
  const returnLabel = `AFTER_PRINT_INT_${id}`;
  const targetPtrLabel = `PRINT_INT_PTR_${id}`;

  emit(`LD R7, ${returnAddressLabel}`);
  emit(`LD R3, ${targetPtrLabel}`);
  emit("JMP R3");
  emit(`${returnLabel}:`);

  data.push(
    `${returnAddressLabel}: .FILL ${returnLabel}`,
    `${targetPtrLabel}: .FILL PRINT_INT`
  );
}

  function addStringLiteral(value, data) {
  const id = stringCounter++;
  const pointerLabel = `STRING_PTR_${id}`;
  const stringLabel = `STRING_DATA_${id}`;

  data.push(`${pointerLabel}: .FILL ${stringLabel}`);
  data.push(`${stringLabel}:`);

  for (const character of value) {
    const code = character.charCodeAt(0);

    if (code > 127) {
      throw new CodegenError(
        "Nova v0.1 supports ASCII strings only"
      );
    }

    data.push(`    .FILL #${code}`);
  }

  data.push("    .FILL #0");

  return pointerLabel;
}

  let currentSourceLine = null;

  function emit(line) {
    if (currentSourceLine) {
      targetInstructions.push(`    ${line} ; line:${currentSourceLine}`);
    } else {
      targetInstructions.push(`    ${line}`);
    }
  }

  function emitLabel(label) {
    targetInstructions.push(`${label}:`);
  }

  function addData(label, directive) {
    data.push(`${label}:`);
    data.push(`    ${directive}`);
  }

  function localOffset(symbol) {
    return -(symbol.slot + 1);
  }

  function addConstant(value) {
    const label = `CONST_${nextConstant++}`;

    addData(label, `.FILL #${value}`);

    return label;
  }

  function pushR0() {
    emit("ADDI R6, #-1");
    emit("STR R0, R6, #0");
  }

  function popR2() {
    emit("LDR R2, R6, #0");
    emit("ADDI R6, #1");
  }

  function generateCallExpression(node) {
    const numArgs = node.args.length;

    if (numArgs === 1) {
      generateExpression(node.args[0]); // R0 holds arg0
    } else if (numArgs === 2) {
      generateExpression(node.args[0]);
      pushR0();
      generateExpression(node.args[1]);
      emit("AND R1, R0, R0"); // R1 holds arg1
      emit("LDR R0, R6, #0"); // R0 holds arg0
      emit("ADDI R6, #1");
    } else if (numArgs === 3) {
      generateExpression(node.args[0]);
      pushR0();
      generateExpression(node.args[1]);
      pushR0();
      generateExpression(node.args[2]);
      emit("AND R2, R0, R0"); // R2 holds arg2
      emit("LDR R1, R6, #0"); // R1 holds arg1
      emit("ADDI R6, #1");
      emit("LDR R0, R6, #0"); // R0 holds arg0
      emit("ADDI R6, #1");
    } else if (numArgs > 3) {
      throw new CodegenError("Functions with more than 3 arguments are not supported yet", node);
    }

    const id = callCounter++;
    const returnAddrLabel = `RET_ADDR_${id}`;
    const afterCallLabel = `AFTER_CALL_${id}`;
    const fnPtrLabel = `FN_PTR_${id}`;

    emit(`LD R7, ${returnAddrLabel}`);
    emit(`LD R3, ${fnPtrLabel}`);
    emit("JMP R3");
    emitLabel(afterCallLabel);

    data.push(`${returnAddrLabel}: .FILL ${afterCallLabel}`);
    data.push(`${fnPtrLabel}: .FILL FN_${node.callee}`);
  }

  function generateExpression(node) {
    switch (node.type) {
      case "NumberLiteral": {
        if (node.value >= 0 && node.value <= 511) {
          emit(`LOADI R0, #${node.value}`);
          return;
        }
        const label = addConstant(node.value);
        emit(`LD R0, ${label}`);
        return;
      }

      case "IdentifierExpression": {
        const offset = localOffset(node.symbol);
        emit(`LDR R0, R5, #${offset}`);
        return;
      }

      case "GroupExpression":
        generateExpression(node.expression);
        return;

      case "UnaryExpression": {
        if (node.operator === "+") {
          generateExpression(node.operand);
          return;
        }

        if (node.operator === "-") {
          generateExpression(node.operand);
          emit("NOT R0, R0");
          emit("ADDI R0, #1");
          return;
        }

        throw new CodegenError(
          `Unsupported unary operator '${node.operator}'`,
          node
        );
      }

      case "BinaryExpression": {
        const isComparison = [">", "<", ">=", "<=", "==", "!="].includes(node.operator);
        if (node.operator !== "+" && node.operator !== "-" && !isComparison) {
          throw new CodegenError(
            `Operator '${node.operator}' requires a runtime helper`,
            node
          );
        }

        // Compute and preserve the left operand.
        generateExpression(node.left);
        pushR0();

        // Compute the right operand.
        generateExpression(node.right);
        emit("AND R1, R0, R0");

        // Restore the left operand into R2.
        popR2();

        if (node.operator === "+") {
          emit("ADD R0, R2, R1");
          return;
        }

        // R2 - R1 = R2 + (~R1) + 1
        emit("NOT R1, R1");
        emit("ADDI R1, #1");
        emit("ADD R0, R2, R1");

        if (node.operator === "-") {
          return;
        }

        // Comparison operators
        const cmpId = cmpCounter++;
        const trueLabel = `CMP_TRUE_${cmpId}`;
        const endLabel = `CMP_END_${cmpId}`;

        const branchInstruction = {
          ">": "BRp",
          "<": "BRn",
          ">=": "BRzp",
          "<=": "BRnz",
          "==": "BRz",
          "!=": "BRnp",
        }[node.operator];

        emit(`${branchInstruction} ${trueLabel}`);
        emit("LOADI R0, #0");
        emit(`BRnzp ${endLabel}`);
        emitLabel(trueLabel);
        emit("LOADI R0, #1");
        emitLabel(endLabel);
        return;
      }

      case "CallExpression": {
        generateCallExpression(node);
        return;
      }

      case "CharLiteral": {
        const ascii = node.code ?? node.value.charCodeAt(0);
        emit(`LOADI R0, #${ascii}`);
        return;
      }

      case "BooleanLiteral": {
        emit(`LOADI R0, #${node.value ? 1 : 0}`);
        return;
      }

      case "StringLiteral": {
  const pointerLabel = addStringLiteral(
    node.value,
    data
  );

  emit(`LD R0, ${pointerLabel}`);
  break;
}

      default:
        throw new CodegenError(
          `Unsupported expression '${node.type}'`,
          node
        );
    }
  }

  function generateStatement(node) {
    const prevLine = currentSourceLine;
    if (node?.line) {
      currentSourceLine = node.line;
    }
    try {
      switch (node.type) {
      case "VariableDeclaration": {
        if (node.valueType !== "integer" && node.valueType !== "character" && node.valueType !== "boolean") {
          throw new CodegenError(
            "String variable initialization is implemented in Chapter 7",
            node
          );
        }

        generateExpression(node.initializer);

        const offset = localOffset(node.symbol);
        emit(`STR R0, R5, #${offset}`);
        return;
      }

      case "PrintStatement": {
        generateExpression(node.expression);

        if (node.expression.valueType === "string") {
          emit("TRAP x22");
        } else if (node.expression.valueType === "character") {
          emit("TRAP x21");
        } else if (node.expression.valueType === "boolean") {
          const id = boolPrintCounter++;
          const falseLabel = `PRINT_BOOL_F_${id}`;
          const endLabel = `PRINT_BOOL_END_${id}`;
          const strTruePtr = addStringLiteral("true", data);
          const strFalsePtr = addStringLiteral("false", data);

          emit("ADDI R0, #0");
          emit(`BRz ${falseLabel}`);
          emit(`LD R0, ${strTruePtr}`);
          emit("TRAP x22");
          emit(`BRnzp ${endLabel}`);
          emitLabel(falseLabel);
          emit(`LD R0, ${strFalsePtr}`);
          emit("TRAP x22");
          emitLabel(endLabel);
        } else {
          emitIntegerPrintCall();
        }
        return;
      }

      case "RunLoopStatement": {
        const id = loopCounter++;
        const testLabel = `LOOP_TEST_${id}`;
        const stepLabel = `LOOP_STEP_${id}`;
        const endLabel = `LOOP_END_${id}`;
        const counterLabel = `LOOP_CTR_${id}`;

        addData(counterLabel, ".FILL #0");

        // 1. Evaluate count expression into R0
        generateExpression(node.count);

        // 2. Store count into loop counter variable
        emit(`ST R0, ${counterLabel}`);

        // 3. Loop condition test: LD R0 sets CC (N, Z, P)
        emitLabel(testLabel);
        emit(`LD R0, ${counterLabel}`);
        emit(`BRnz ${endLabel}`);

        // 4. Generate loop body statements with loop context on stack
        loopStack.push({ breakLabel: endLabel, continueLabel: stepLabel });
        for (const statement of node.body) {
          generateStatement(statement);
        }
        loopStack.pop();

        // 5. Decrement counter at stepLabel and jump back to test
        emitLabel(stepLabel);
        emit(`LD R0, ${counterLabel}`);
        emit("ADDI R0, #-1");
        emit(`ST R0, ${counterLabel}`);
        emit(`BRnzp ${testLabel}`);

        // 6. Loop exit
        emitLabel(endLabel);
        return;
      }

      case "WhileStatement": {
        const id = whileCounter++;
        const testLabel = `WHILE_TEST_${id}`;
        const endLabel = `WHILE_END_${id}`;

        emitLabel(testLabel);

        // 1. Evaluate condition into R0
        generateExpression(node.condition);
        emit("ADDI R0, #0");
        emit(`BRz ${endLabel}`);

        // 2. Body statements
        loopStack.push({ breakLabel: endLabel, continueLabel: testLabel });
        for (const statement of node.body) {
          generateStatement(statement);
        }
        loopStack.pop();

        // 3. Loop back to test
        emit(`BRnzp ${testLabel}`);

        // 4. End label
        emitLabel(endLabel);
        return;
      }

      case "IfStatement": {
        const id = ifCounter++;
        const elseLabel = `ELSE_${id}`;
        const endLabel = `END_IF_${id}`;

        // 1. Evaluate condition
        generateExpression(node.condition);
        emit("ADDI R0, #0");
        emit(`BRz ${node.elseBranch ? elseLabel : endLabel}`);

        // 2. Then branch statements
        for (const statement of node.thenBranch) {
          generateStatement(statement);
        }

        if (node.elseBranch) {
          emit(`BRnzp ${endLabel}`);
          emitLabel(elseLabel);

          if (node.elseBranch.type === "IfStatement") {
            generateStatement(node.elseBranch);
          } else {
            for (const statement of node.elseBranch) {
              generateStatement(statement);
            }
          }
        }

        emitLabel(endLabel);
        return;
      }

      case "BreakStatement": {
        const currentLoop = loopStack[loopStack.length - 1];
        if (!currentLoop) {
          throw new CodegenError("'break' used outside of loop", node);
        }
        emit(`BRnzp ${currentLoop.breakLabel}`);
        return;
      }

      case "ContinueStatement": {
        const currentLoop = loopStack[loopStack.length - 1];
        if (!currentLoop) {
          throw new CodegenError("'continue' used outside of loop", node);
        }
        emit(`BRnzp ${currentLoop.continueLabel}`);
        return;
      }

      case "AssignmentStatement": {
        generateExpression(node.value);
        const offset = localOffset(node.symbol);
        emit(`STR R0, R5, #${offset}`);
        return;
      }

      case "ExpressionStatement": {
        generateExpression(node.expression);
        return;
      }

      case "ReturnStatement": {
        if (node.argument) {
          generateExpression(node.argument);
        } else {
          emit("LOADI R0, #0");
        }
        if (currentFunction) {
          emit(`BRnzp FN_EPILOG_${currentFunction.name}`);
        }
        return;
      }

      case "FunctionDeclaration": {
        functionsToEmit.push(node);
        return;
      }

        default:
          throw new CodegenError(
            `Unsupported statement '${node.type}'`,
            node
          );
      }
    } finally {
      currentSourceLine = prevLine;
    }
  }

  function generateFunction(fn) {
    targetInstructions = fnInstructions;
    currentFunction = fn;
    const prevLine = currentSourceLine;
    if (fn.line) currentSourceLine = fn.line;

    emitLabel(`FN_${fn.name}`);

    // 1. Callee Prolog: Save Return Address and Old Frame Pointer
    emit("ADDI R6, #-1");
    emit("STR R7, R6, #0");     // Stack: return address
    emit("ADDI R6, #-1");
    emit("STR R5, R6, #0");     // Stack: old FP
    emit("ADD R5, R6, #0");     // FP = SP

    // 2. Save incoming arguments onto stack frame (slots 0, 1, 2)
    for (let i = 0; i < fn.params.length; i++) {
      emit("ADDI R6, #-1");
      emit(`STR R${i}, R6, #0`); // Param i at R5 - (i + 1)
    }

    // 3. Allocate local variables (beyond parameters)
    const extraLocals = (fn.numLocals || 0) - fn.params.length;
    if (extraLocals > 0) {
      let rem = extraLocals;
      while (rem > 0) {
        const chunk = Math.min(rem, 32);
        emit(`ADDI R6, #${-chunk}`);
        rem -= chunk;
      }
    }

    // 4. Function body statements
    for (const stmt of fn.body) {
      generateStatement(stmt);
    }

    // 5. Callee Epilog & Return
    emitLabel(`FN_EPILOG_${fn.name}`);
    emit("ADD R6, R5, #0");     // SP = FP
    emit("LDR R5, R6, #0");     // Restore old FP
    emit("ADDI R6, #1");
    emit("LDR R7, R6, #0");     // Restore return address
    emit("ADDI R6, #1");
    emit("JMP R7");             // Return to caller!

    currentFunction = null;
    currentSourceLine = prevLine;
    targetInstructions = instructions;
  }

  instructions.push(".ORIG x3000");

  // Initialize R6 from a nearby literal.
  emit("BRnzp START_INIT");
  instructions.push("STACK_TOP:");
  instructions.push("    .FILL xFF00");
  instructions.push("START_INIT:");
  emit("LD R6, STACK_TOP");

  // Prolog: Save old FP, anchor new FP, and allocate local variables
  emit("ADDI R6, #-1");
  emit("STR R5, R6, #0");
  emit("ADD R5, R6, #0");

  const numLocals = symbols.size;
  if (numLocals > 0) {
    let remaining = numLocals;
    while (remaining > 0) {
      const chunk = Math.min(remaining, 32);
      emit(`ADDI R6, #${-chunk}`);
      remaining -= chunk;
    }
  }

  for (const statement of ast.statements) {
    generateStatement(statement);
  }

  // Epilog: Collapse locals and restore previous Frame Pointer
  emit("ADD R6, R5, #0");
  emit("LDR R5, R6, #0");
  emit("ADDI R6, #1");

  emit("TRAP x25");

  // Emit all function subroutines now (populates fnInstructions and any function data)
  for (const fn of functionsToEmit) {
    generateFunction(fn);
  }

  // Put user data right after TRAP x25
  instructions.push(...data);

  // Put function subroutines right after data
  instructions.push(...fnInstructions);

  if (needsIntegerPrinter) {
    instructions.push(...buildIntegerPrinter());
    instructions.push("INT_MIN:");
    instructions.push("    .FILL x8000");
    instructions.push("ASCII_MINUS:");
    instructions.push("    .FILL #45");
    instructions.push("INT_MIN_STRING_PTR: .FILL INT_MIN_STRING_DATA");
    instructions.push("INT_MIN_STRING_DATA:");
    instructions.push("    .FILL #45");
    instructions.push("    .FILL #51");
    instructions.push("    .FILL #50");
    instructions.push("    .FILL #55");
    instructions.push("    .FILL #54");
    instructions.push("    .FILL #56");
    instructions.push("    .FILL #0");
    instructions.push("INT_10000:");
    instructions.push("    .FILL #10000");
    instructions.push("INT_1000:");
    instructions.push("    .FILL #1000");
    instructions.push("INT_100:");
    instructions.push("    .FILL #100");
    instructions.push("INT_10:");
    instructions.push("    .FILL #10");
    instructions.push("INT_1:");
    instructions.push("    .FILL #1");
    instructions.push("ASCII_ZERO:");
    instructions.push("    .FILL #48");
    instructions.push("INT_ONE:");
    instructions.push("    .FILL #1");
    instructions.push("PRINT_FLAG:");
    instructions.push("    .FILL #0");
  }

  instructions.push(".END");

  return instructions.join("\n");
}



function buildIntegerPrinter() {
  const lines = [
    "PRINT_INT:",
    "    LD R1, INT_MIN",
    "    NOT R2, R1",
    "    ADDI R2, #1",
    "    ADD R2, R0, R2",
    "    BRz PRINT_INT_MIN",

    "    AND R4, R0, R0",
    "    BRn PRINT_INT_NEGATIVE",
    "    BRnzp PRINT_INT_DIGITS",

    "PRINT_INT_NEGATIVE:",
    "    LD R1, ASCII_MINUS",
    "    AND R0, R1, R1",
    "    TRAP x21",
    "    NOT R4, R4",
    "    ADDI R4, #1",
    "    BRnzp PRINT_INT_DIGITS",

    "PRINT_INT_MIN:",
    "    LD R0, INT_MIN_STRING_PTR",
    "    TRAP x22",
    "    JMP R7",

    "PRINT_INT_DIGITS:",
    "    LOADI R1, #0",
    "    ST R1, PRINT_FLAG",
  ];

  const places = [
    { value: 10000, name: "10000" },
    { value: 1000, name: "1000" },
    { value: 100, name: "100" },
    { value: 10, name: "10" },
    { value: 1, name: "1" },
  ];

  for (let i = 0; i < places.length; i++) {
    const { value, name } = places[i];
    const start = `PI_${name}_START`;
    const loop = `PI_${name}_LOOP`;
    const done = `PI_${name}_DONE`;
    const output = `PI_${name}_OUTPUT`;
    const next = i + 1 < places.length
      ? `PI_${places[i + 1].name}_START`
      : "PRINT_INT_RETURN";

    lines.push(
      `${start}:`,
      "    NOT R3, R4",
      "    AND R3, R3, R4",
      `${loop}:`,
      `    LD R1, INT_${name}`,
      "    NOT R2, R1",
      "    ADDI R2, #1",
      "    ADD R2, R4, R2",
      `    BRn ${done}`,
      "    AND R4, R2, R2",
      "    ADDI R3, #1",
      `    BRnzp ${loop}`,
      `${done}:`
    );

    if (value === 1) {
      // The ones digit must always be printed, including zero.
      lines.push(
        "    LD R1, ASCII_ZERO",
        "    ADD R0, R3, R1",
        "    TRAP x21",
        "    BRnzp PRINT_INT_RETURN"
      );
    } else {
      lines.push(
        "    AND R1, R3, R3",
        `    BRp ${output}`,
        "    LD R1, PRINT_FLAG",
        `    BRp ${output}`,
        `    BRnzp ${next}`,
        `${output}:`,
        "    LD R1, ASCII_ZERO",
        "    ADD R0, R3, R1",
        "    TRAP x21",
        "    LOADI R1, #1",
        "    ST R1, PRINT_FLAG",
        `    BRnzp ${next}`
      );
    }
  }

  lines.push(
    "PRINT_INT_RETURN:",
    "    JMP R7"
  );

  return lines;
}