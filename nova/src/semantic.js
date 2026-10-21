
export class SemanticError extends Error {
  constructor(message, node) {
    const line = node.line ?? 1;
    const column = node.column ?? 1;

    super(`${line}:${column}: ${message}`);

    this.name = "SemanticError";
    this.line = line;
    this.column = column;
  }
}

export function analyze(ast) {
  const symbols = new Map();
  let nextSlot = 0;

  function fail(message, node) {
    throw new SemanticError(message, node);
  }

  function analyzeExpression(node) {
    switch (node.type) {
      case "NumberLiteral": {
        if (
          !Number.isInteger(node.value) ||
          node.value < 0 ||
          node.value > 32767
        ) {
          fail(
            "Integer literal must be between 0 and 32767",
            node
          );
        }

        node.valueType = "integer";
        return "integer";
      }

      case "StringLiteral":
        node.valueType = "string";
        return "string";

      case "IdentifierExpression": {
        const symbol = symbols.get(node.name);

        if (!symbol) {
          fail(
            `Undefined variable '${node.name}'`,
            node
          );
        }

        node.symbol = symbol;
        node.valueType = symbol.valueType;

        return symbol.valueType;
      }

      case "GroupExpression": {
        const valueType = analyzeExpression(node.expression);

        node.valueType = valueType;
        return valueType;
      }

      case "UnaryExpression": {
        const operandType = analyzeExpression(node.operand);

        if (operandType !== "integer") {
          fail(
            `Unary '${node.operator}' requires an integer operand`,
            node
          );
        }

        node.valueType = "integer";
        return "integer";
      }

      case "BinaryExpression": {
        const leftType = analyzeExpression(node.left);
        const rightType = analyzeExpression(node.right);

        if (
          leftType !== "integer" ||
          rightType !== "integer"
        ) {
          fail(
            `Operator '${node.operator}' requires integer operands`,
            node
          );
        }

        node.valueType = "integer";
        return "integer";
      }

      default:
        fail(
          `Unsupported expression node '${node.type}'`,
          node
        );
    }
  }

  function analyzeStatement(node) {
    switch (node.type) {
      case "VariableDeclaration": {
        // Analyze the initializer before declaring the new
        // variable. This prevents a variable from referring
        // to itself during its own initialization.
        const valueType = analyzeExpression(node.initializer);

        if (symbols.has(node.name)) {
          fail(
            `Variable '${node.name}' is already declared`,
            node
          );
        }

        const symbol = {
          name: node.name,
          valueType,
          slot: nextSlot++,
          line: node.line,
          column: node.column,
        };

        symbols.set(node.name, symbol);

        node.symbol = symbol;
        node.valueType = valueType;

        return;
      }

     case "PrintStatement": {
  generateExpression(node.expression);

  if (node.expression.valueType === "string") {
    emit("TRAP x22");
  } else {
    emitIntegerPrintCall();
  }

  break;
}

      default:
        fail(
          `Unsupported statement node '${node.type}'`,
          node
        );
    }
  }

  if (ast.type !== "Program") {
    fail("Expected a Program AST node", ast);
  }

  for (const statement of ast.statements) {
    analyzeStatement(statement);
  }

  return {
    ast,
    symbols,
  };
}
