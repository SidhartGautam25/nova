
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
  const data = [];
  const variableLabels = new Map();

  let nextConstant = 0;
  let stringCounter=0;

  let printCallCounter = 0;
let needsIntegerPrinter = false;

function emitIntegerPrintCall() {
  needsIntegerPrinter = true;

  const id = printCallCounter++;
  const returnAddressLabel = `PRINT_INT_RETURN_${id}`;
  const returnLabel = `AFTER_PRINT_INT_${id}`;

  emit(`LD R7, ${returnAddressLabel}`);
  emit("JMP PRINT_INT");
  emit(`${returnLabel}:`);

  data.push(
    `${returnAddressLabel}: .FILL ${returnLabel}`
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

  function emit(line) {
    instructions.push(`    ${line}`);
  }

  function emitLabel(label) {
    instructions.push(`${label}:`);
  }

  function addData(label, directive) {
    data.push(`${label}:`);
    data.push(`    ${directive}`);
  }

  function variableLabel(symbol) {
    if (!variableLabels.has(symbol.slot)) {
      variableLabels.set(symbol.slot, `VAR_${symbol.slot}`);
    }

    return variableLabels.get(symbol.slot);
  }

  function addConstant(value) {
    const label = `CONST_${nextConstant++}`;

    addData(label, `.FILL #${value}`);

    return label;
  }

  function pushR0() {
    emit("ADDI R6, R6, #-1");
    emit("STR R0, R6, #0");
  }

  function popR2() {
    emit("LDR R2, R6, #0");
    emit("ADDI R6, R6, #1");
  }

  function generateExpression(node) {
    switch (node.type) {
      case "NumberLiteral": {
        const label = addConstant(node.value);
        emit(`LD R0, ${label}`);
        return;
      }

      case "IdentifierExpression": {
        const label = variableLabel(node.symbol);
        emit(`LD R0, ${label}`);
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
          emit("ADDI R0, R0, #1");
          return;
        }

        throw new CodegenError(
          `Unsupported unary operator '${node.operator}'`,
          node
        );
      }

      case "BinaryExpression": {
        if (node.operator !== "+" && node.operator !== "-") {
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
        emit("ADD R1, R0, R0");

        // Restore the left operand into R2.
        popR2();

        if (node.operator === "+") {
          emit("ADD R0, R2, R1");
          return;
        }

        // R2 - R1 = R2 + (~R1) + 1
        emit("NOT R1, R1");
        emit("ADDI R1, R1, #1");
        emit("ADD R0, R2, R1");
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
    switch (node.type) {
      case "VariableDeclaration": {
        if (node.valueType !== "integer") {
          throw new CodegenError(
            "String variable initialization is implemented in Chapter 7",
            node
          );
        }

        generateExpression(node.initializer);

        emit(`ST R0, ${variableLabel(node.symbol)}`);
        return;
      }

      case "PrintStatement": {
        if (node.expression.valueType !== "integer") {
          throw new CodegenError(
            "String printing is implemented in Chapter 7",
            node
          );
        }

        generateExpression(node.expression);

        // TEMPORARY DEBUGGING CONVENTION:
        // OUT writes only the low byte as one character.
        // This does NOT print an integer as decimal text.
        emit("TRAP x21");
        return;
      }

      default:
        throw new CodegenError(
          `Unsupported statement '${node.type}'`,
          node
        );
    }
  }

  // Reserve a literal for the initial stack address.
  const stackTopLabel = "STACK_TOP";

  instructions.push(".ORIG x3000");

  // Initialize R6 from a nearby literal.
  emit(`LD R6, ${stackTopLabel}`);

  for (const statement of ast.statements) {
    generateStatement(statement);
  }

  emit("TRAP x25");

  // Put the data after the generated code.
  instructions.push(...data);

  for (const symbol of symbols.values()) {
    const label = variableLabel(symbol);

    // Ensure each variable slot is emitted only once.
    if (!data.includes(`${label}:`)) {
      addData(label, ".FILL #0");
    }
  }

  addData(stackTopLabel, ".FILL xFF00");

  instructions.push(".END");

  return instructions.join("\n");
}



function buildIntegerPrinter() {
  const lines = [
    "PRINT_INT:",
    "    LD R1, INT_MIN",
    "    NOT R2, R1",
    "    ADDI R2, R2, #1",
    "    ADD R2, R0, R2",
    "    BRz PRINT_INT_MIN",

    "    ADDI R4, R0, #0",
    "    BRn PRINT_INT_NEGATIVE",
    "    BRnzp PRINT_INT_DIGITS",

    "PRINT_INT_NEGATIVE:",
    "    LD R1, ASCII_MINUS",
    "    ADDI R0, R1, #0",
    "    TRAP x21",
    "    NOT R4, R4",
    "    ADDI R4, R4, #1",
    "    BRnzp PRINT_INT_DIGITS",

    "PRINT_INT_MIN:",
    "    LD R0, INT_MIN_STRING_PTR",
    "    TRAP x22",
    "    JMP R7",

    "PRINT_INT_DIGITS:",
    "    NOT R5, R4",
    "    AND R5, R5, R4",
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
      "    ADDI R2, R2, #1",
      "    ADD R2, R4, R2",
      `    BRn ${done}`,
      "    ADDI R4, R2, #0",
      "    ADDI R3, R3, #1",
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
        "    ADDI R1, R3, #0",
        `    BRp ${output}`,
        "    ADDI R1, R5, #0",
        `    BRp ${output}`,
        `    BRnzp ${next}`,
        `${output}:`,
        "    LD R1, ASCII_ZERO",
        "    ADD R0, R3, R1",
        "    TRAP x21",
        "    LD R5, INT_ONE",
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