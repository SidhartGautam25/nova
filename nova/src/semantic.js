
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
  const functions = new Map();
  let nextSlot = 0;
  let loopDepth = 0;
  let currentFunction = null;

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

      case "CharLiteral":
        node.valueType = "character";
        return "character";

      case "BooleanLiteral":
        node.valueType = "boolean";
        return "boolean";

      case "IdentifierExpression": {
        let symbol = null;
        if (currentFunction) {
          symbol = currentFunction.localSymbols.get(node.name);
        }
        if (!symbol) {
          symbol = symbols.get(node.name);
        }

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

      case "CallExpression": {
        const fn = functions.get(node.callee);
        if (!fn) {
          fail(`Undefined function '${node.callee}'`, node);
        }
        if (node.args.length !== fn.params.length) {
          fail(
            `Function '${node.callee}' expects ${fn.params.length} arguments but got ${node.args.length}`,
            node
          );
        }

        for (let i = 0; i < node.args.length; i++) {
          const arg = node.args[i];
          const param = fn.params[i];
          const argType = analyzeExpression(arg);

          let expectedType = "integer";
          if (param.declaredType === "char") expectedType = "character";
          else if (param.declaredType === "bool") expectedType = "boolean";

          if (argType !== expectedType && !(expectedType === "integer" && argType === "boolean")) {
            fail(`Function '${node.callee}' argument ${i + 1} expects ${expectedType} but got ${argType}`, arg);
          }
        }

        node.valueType = fn.returnType || "integer";
        return node.valueType;
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

        const isComparison = [">", "<", ">=", "<=", "==", "!="].includes(node.operator);

        if (isComparison) {
          const compatible = (leftType === rightType && (leftType === "integer" || leftType === "character")) ||
            (leftType === rightType && leftType === "boolean" && (node.operator === "==" || node.operator === "!=")) ||
            ((leftType === "integer" || leftType === "boolean") && (rightType === "integer" || rightType === "boolean"));

          if (!compatible) {
            fail(
              `Cannot compare ${leftType} and ${rightType} using '${node.operator}'`,
              node
            );
          }

          node.valueType = "boolean";
          return "boolean";
        }

        if (leftType !== "integer" || rightType !== "integer") {
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
        let valueType = analyzeExpression(node.initializer);

        if (node.declaredType === "int") {
          if (valueType === "boolean") {
            valueType = "integer";
          }
          if (valueType !== "integer") {
            fail(
              `Cannot assign ${valueType} to integer variable '${node.name}'`,
              node
            );
          }
        } else if (node.declaredType === "char") {
          if (valueType !== "character") {
            fail(
              `Cannot assign ${valueType} to char variable '${node.name}'`,
              node
            );
          }
        } else if (node.declaredType === "bool") {
          if (valueType !== "boolean") {
            fail(
              `Cannot assign ${valueType} to bool variable '${node.name}'`,
              node
            );
          }
        }

        const targetMap = currentFunction ? currentFunction.localSymbols : symbols;

        if (targetMap.has(node.name)) {
          fail(
            `Variable '${node.name}' is already declared`,
            node
          );
        }

        const slot = currentFunction ? currentFunction.nextSlot++ : nextSlot++;
        const symbol = {
          name: node.name,
          valueType,
          slot,
          line: node.line,
          column: node.column,
          isLocal: !!currentFunction,
        };

        targetMap.set(node.name, symbol);

        node.symbol = symbol;
        node.valueType = valueType;

        return;
      }

     case "PrintStatement": {
        analyzeExpression(node.expression);
        return;
      }

      case "RunLoopStatement": {
        const countType = analyzeExpression(node.count);

        if (countType !== "integer") {
          fail(
            "Loop count expression must evaluate to an integer",
            node.count
          );
        }

        loopDepth++;
        try {
          for (const statement of node.body) {
            analyzeStatement(statement);
          }
        } finally {
          loopDepth--;
        }

        return;
      }

      case "WhileStatement": {
        const conditionType = analyzeExpression(node.condition);

        if (conditionType !== "boolean" && conditionType !== "integer") {
          fail(
            "While condition expression must evaluate to a boolean or integer",
            node.condition
          );
        }

        loopDepth++;
        try {
          for (const statement of node.body) {
            analyzeStatement(statement);
          }
        } finally {
          loopDepth--;
        }

        return;
      }

      case "IfStatement": {
        const conditionType = analyzeExpression(node.condition);

        if (conditionType !== "boolean" && conditionType !== "integer") {
          fail(
            "If condition expression must evaluate to a boolean or integer",
            node.condition
          );
        }

        for (const statement of node.thenBranch) {
          analyzeStatement(statement);
        }

        if (node.elseBranch) {
          if (node.elseBranch.type === "IfStatement") {
            analyzeStatement(node.elseBranch);
          } else {
            for (const statement of node.elseBranch) {
              analyzeStatement(statement);
            }
          }
        }

        return;
      }

      case "BreakStatement": {
        if (loopDepth <= 0) {
          fail("'break' can only be used inside a loop", node);
        }
        return;
      }

      case "ContinueStatement": {
        if (loopDepth <= 0) {
          fail("'continue' can only be used inside a loop", node);
        }
        return;
      }

      case "AssignmentStatement": {
        let symbol = null;
        if (currentFunction) {
          symbol = currentFunction.localSymbols.get(node.name);
        }
        if (!symbol) {
          symbol = symbols.get(node.name);
        }

        if (!symbol) {
          fail(
            `Undefined variable '${node.name}'`,
            node
          );
        }

        const valueType = analyzeExpression(node.value);
        const isCompatible = symbol.valueType === valueType ||
          (symbol.valueType === "integer" && valueType === "boolean");

        if (!isCompatible) {
          fail(
            `Cannot assign ${valueType} to ${symbol.valueType} variable '${node.name}'`,
            node
          );
        }

        node.symbol = symbol;
        return;
      }

      case "FunctionDeclaration": {
        currentFunction = {
          name: node.name,
          params: node.params,
          localSymbols: new Map(),
          nextSlot: 0,
        };

        // Register parameters in local scope
        for (const param of node.params) {
          if (currentFunction.localSymbols.has(param.name)) {
            fail(`Duplicate parameter '${param.name}' in function '${node.name}'`, param);
          }
          let paramValueType = "integer";
          if (param.declaredType === "char") paramValueType = "character";
          else if (param.declaredType === "bool") paramValueType = "boolean";

          const paramSymbol = {
            name: param.name,
            valueType: paramValueType,
            slot: currentFunction.nextSlot++,
            line: param.line,
            column: param.column,
            isParam: true,
            isLocal: true,
          };
          currentFunction.localSymbols.set(param.name, paramSymbol);
          param.symbol = paramSymbol;
        }

        for (const statement of node.body) {
          analyzeStatement(statement);
        }

        node.localSymbols = currentFunction.localSymbols;
        node.numLocals = currentFunction.nextSlot;
        currentFunction = null;
        return;
      }

      case "ReturnStatement": {
        if (!currentFunction) {
          fail("'return' can only be used inside a function", node);
        }

        if (node.argument) {
          const argType = analyzeExpression(node.argument);
          if (argType !== "integer" && argType !== "boolean") {
            fail("Return expression must evaluate to an integer", node.argument);
          }
        }
        return;
      }

      case "ExpressionStatement": {
        analyzeExpression(node.expression);
        return;
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

  // Pass 1: Collect top-level function declarations
  for (const statement of ast.statements) {
    if (statement.type === "FunctionDeclaration") {
      if (functions.has(statement.name)) {
        fail(`Function '${statement.name}' is already declared`, statement);
      }
      if (symbols.has(statement.name)) {
        fail(`Identifier '${statement.name}' is already declared as a variable`, statement);
      }
      functions.set(statement.name, statement);
    }
  }

  // Pass 2: Analyze all statements
  for (const statement of ast.statements) {
    analyzeStatement(statement);
  }

  return {
    ast,
    symbols,
    functions,
  };
}
