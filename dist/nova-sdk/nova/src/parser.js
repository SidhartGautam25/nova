
export class ParserError extends Error {
  constructor(message, token) {
    super(
      `${token.line}:${token.column}: ${message}`
    );

    this.name = "ParserError";
    this.line = token.line;
    this.column = token.column;
    this.token = token;
  }
}

export function parse(tokens) {
  let current = 0;

  function peek() {
    return tokens[current];
  }

  function previous() {
    return tokens[current - 1];
  }

  function isAtEnd() {
    return peek().type === "EOF";
  }

  function advance() {
    if (!isAtEnd()) {
      current++;
    }

    return previous();
  }

  function check(type) {
    return !isAtEnd() && peek().type === type;
  }

  function match(...types) {
    for (const type of types) {
      if (check(type)) {
        advance();
        return true;
      }
    }

    return false;
  }

  function consume(type, message) {
    if (check(type)) {
      return advance();
    }

    throw new ParserError(message, peek());
  }

  function makeNode(type, fields, token) {
    return {
      type,
      ...fields,
      line: token.line,
      column: token.column,
    };
  }

  function parseProgram() {
    const statements = [];

    while (!isAtEnd()) {
      statements.push(parseStatement());
    }

    return {
      type: "Program",
      statements,
      line: 1,
      column: 1,
    };
  }

  function parseStatement() {
    if (match("MAKE")) {
      const makeToken = previous();
      if (match("FUNCTION")) {
        return parseFunctionDeclaration(makeToken);
      }
      if (match("INT")) {
        return parseVariableDeclaration(makeToken, "int");
      }
      if (match("CHAR")) {
        return parseVariableDeclaration(makeToken, "char");
      }
      if (match("BOOL")) {
        return parseVariableDeclaration(makeToken, "bool");
      }
      consume("INT", "Expected 'int' after 'make'");
      return parseVariableDeclaration(makeToken, "int");
    }

    if (match("RETURN")) {
      return parseReturnStatement(previous());
    }

    if (match("INT")) {
      return parseVariableDeclaration(previous(), "int");
    }

    if (match("CHAR")) {
      return parseVariableDeclaration(previous(), "char");
    }

    if (match("BOOL")) {
      return parseVariableDeclaration(previous(), "bool");
    }

    if (match("LET")) {
      return parseVariableDeclaration(previous(), "any");
    }

    if (match("PRINT")) {
      return parsePrintStatement(previous());
    }

    if (match("RUN")) {
      return parseRunLoopStatement(previous());
    }

    if (match("WHILE")) {
      return parseWhileStatement(previous());
    }

    if (match("IF")) {
      return parseIfStatement(previous());
    }

    if (match("BREAK")) {
      return parseBreakStatement(previous());
    }

    if (match("CONTINUE")) {
      return parseContinueStatement(previous());
    }

    if (check("IDENTIFIER")) {
      const nextToken = tokens[current + 1];
      if (nextToken && nextToken.type === "EQUAL") {
        return parseAssignmentStatement();
      }
      if (nextToken && nextToken.type === "LEFT_PAREN") {
        const callToken = peek();
        const expr = parseExpression();
        consume("SEMICOLON", "Expected ';' after function call");
        return makeNode("ExpressionStatement", { expression: expr }, callToken);
      }
    }

    throw new ParserError(
      "Expected a statement (make int, make function, int, let, print, run, while, if, break, continue, return, or assignment)",
      peek()
    );
  }

  function parseFunctionDeclaration(startToken) {
    const nameToken = consume("IDENTIFIER", "Expected function name after 'make function'");
    consume("LEFT_PAREN", "Expected '(' after function name");
    const params = [];
    if (!check("RIGHT_PAREN")) {
      do {
        let declaredType = "int";
        if (match("INT")) {
          declaredType = "int";
        } else if (match("CHAR")) {
          declaredType = "char";
        } else if (match("BOOL")) {
          declaredType = "bool";
        } else {
          consume("INT", "Expected parameter type ('int', 'char', or 'bool')");
        }
        const paramToken = consume("IDENTIFIER", "Expected parameter name");
        params.push({
          name: paramToken.value,
          declaredType,
          line: paramToken.line,
          column: paramToken.column,
        });
      } while (match("COMMA"));
    }
    consume("RIGHT_PAREN", "Expected ')' after parameter list");

    consume("COLON", "Expected ':' and return type after function parameters");
    let returnType = "integer";
    if (match("INT")) {
      returnType = "integer";
    } else if (match("CHAR")) {
      returnType = "character";
    } else if (match("BOOL")) {
      returnType = "boolean";
    } else if (match("VOID")) {
      returnType = "void";
    } else if (match("IDENTIFIER")) {
      returnType = previous().value;
    } else {
      throw new ParserError("Expected return type (e.g. 'int', 'char', 'bool', or 'void') after ':'", peek());
    }

    consume("LEFT_BRACE", "Expected '{' before function body");
    const body = [];
    while (!check("RIGHT_BRACE") && !isAtEnd()) {
      body.push(parseStatement());
    }
    consume("RIGHT_BRACE", "Expected '}' after function body");

    return makeNode(
      "FunctionDeclaration",
      {
        name: nameToken.value,
        params,
        body,
        returnType,
      },
      nameToken
    );
  }

  function parseReturnStatement(startToken) {
    let argument = null;
    if (!match("SEMICOLON")) {
      argument = parseExpression();
      consume("SEMICOLON", "Expected ';' after return expression");
    }
    return makeNode("ReturnStatement", { argument }, startToken);
  }

  function parseRunLoopStatement(startToken) {
    const count = parseExpression();

    consume("TIMES", "Expected 'times' after loop count expression");

    consume("LEFT_BRACE", "Expected '{' to begin loop body");

    const body = [];
    while (!check("RIGHT_BRACE") && !isAtEnd()) {
      body.push(parseStatement());
    }

    consume("RIGHT_BRACE", "Expected '}' after loop body");

    if (check("SEMICOLON")) {
      advance();
    }

    return makeNode(
      "RunLoopStatement",
      {
        count,
        body,
      },
      startToken
    );
  }

  function parseWhileStatement(startToken) {
    consume("LEFT_PAREN", "Expected '(' after 'while'");
    const condition = parseExpression();
    consume("RIGHT_PAREN", "Expected ')' after while condition");

    consume("LEFT_BRACE", "Expected '{' to begin while loop body");

    const body = [];
    while (!check("RIGHT_BRACE") && !isAtEnd()) {
      body.push(parseStatement());
    }

    consume("RIGHT_BRACE", "Expected '}' after while loop body");

    if (check("SEMICOLON")) {
      advance();
    }

    return makeNode(
      "WhileStatement",
      {
        condition,
        body,
      },
      startToken
    );
  }

  function parseIfStatement(startToken) {
    consume("LEFT_PAREN", "Expected '(' after 'if'");
    const condition = parseExpression();
    consume("RIGHT_PAREN", "Expected ')' after if condition");

    consume("LEFT_BRACE", "Expected '{' after if condition");

    const thenBranch = [];
    while (!check("RIGHT_BRACE") && !isAtEnd()) {
      thenBranch.push(parseStatement());
    }

    consume("RIGHT_BRACE", "Expected '}' after if block");

    if (check("SEMICOLON")) {
      advance();
    }

    let elseBranch = null;
    if (match("ELSE")) {
      if (match("IF")) {
        elseBranch = parseIfStatement(previous());
      } else {
        consume("LEFT_BRACE", "Expected '{' after 'else'");
        elseBranch = [];
        while (!check("RIGHT_BRACE") && !isAtEnd()) {
          elseBranch.push(parseStatement());
        }
        consume("RIGHT_BRACE", "Expected '}' after else block");

        if (check("SEMICOLON")) {
          advance();
        }
      }
    }

    return makeNode(
      "IfStatement",
      {
        condition,
        thenBranch,
        elseBranch,
      },
      startToken
    );
  }

  function parseBreakStatement(startToken) {
    consume("SEMICOLON", "Expected ';' after 'break'");
    return makeNode("BreakStatement", {}, startToken);
  }

  function parseContinueStatement(startToken) {
    consume("SEMICOLON", "Expected ';' after 'continue'");
    return makeNode("ContinueStatement", {}, startToken);
  }

  function parseAssignmentStatement() {
    const name = advance();
    consume("EQUAL", "Expected '=' after variable name");
    const value = parseExpression();
    consume("SEMICOLON", "Expected ';' after assignment");

    return makeNode(
      "AssignmentStatement",
      {
        name: name.value,
        value,
      },
      name
    );
  }

  function parseVariableDeclaration(startToken, declaredType = "int") {
    const name = consume(
      "IDENTIFIER",
      "Expected a variable name"
    );

    consume(
      "EQUAL",
      "Expected '=' after the variable name"
    );

    const initializer = parseExpression();

    consume(
      "SEMICOLON",
      "Expected ';' after the variable declaration"
    );

    return makeNode(
      "VariableDeclaration",
      {
        name: name.value,
        initializer,
        declaredType,
      },
      startToken
    );
  }

  function parsePrintStatement(startToken) {
    consume(
      "LEFT_PAREN",
      "Expected '(' after 'print'"
    );

    const expression = parseExpression();

    consume(
      "RIGHT_PAREN",
      "Expected ')' after the print expression"
    );

    consume(
      "SEMICOLON",
      "Expected ';' after the print statement"
    );

    return makeNode(
      "PrintStatement",
      { expression },
      startToken
    );
  }

 
function parseExpression() {
  return parseEquality();
}

function parseEquality() {
  let expression = parseComparison();

  while (match("EQUAL_EQUAL", "BANG_EQUAL")) {
    const operator = previous();
    const right = parseComparison();

    expression = makeNode(
      "BinaryExpression",
      {
        operator: operator.value,
        left: expression,
        right,
      },
      operator
    );
  }

  return expression;
}

function parseComparison() {
  let expression = parseAddition();

  while (match("GREATER", "GREATER_EQUAL", "LESS", "LESS_EQUAL")) {
    const operator = previous();
    const right = parseAddition();

    expression = makeNode(
      "BinaryExpression",
      {
        operator: operator.value,
        left: expression,
        right,
      },
      operator
    );
  }

  return expression;
}

function parseAddition() {
  let expression = parseMultiplication();

  while (match("PLUS", "MINUS")) {
    const operator = previous();
    const right = parseMultiplication();

    expression = makeNode(
      "BinaryExpression",
      {
        operator: operator.value,
        left: expression,
        right,
      },
      operator
    );
  }

  return expression;
}

function parseMultiplication() {
  let expression = parseUnary();

  while (match("STAR", "SLASH")) {
    const operator = previous();
    const right = parseUnary();

    expression = makeNode(
      "BinaryExpression",
      {
        operator: operator.value,
        left: expression,
        right,
      },
      operator
    );
  }

  return expression;
}

function parseUnary() {
  if (match("MINUS", "PLUS")) {
    const operator = previous();
    const operand = parseUnary();

    return makeNode(
      "UnaryExpression",
      {
        operator: operator.value,
        operand,
      },
      operator
    );
  }

  return parsePrimary();
}

function parsePrimary() {
  if (match("NUMBER")) {
    const token = previous();

    return makeNode(
      "NumberLiteral",
      { value: Number(token.value) },
      token
    );
  }

  if (match("STRING")) {
    const token = previous();

    return makeNode(
      "StringLiteral",
      { value: token.value },
      token
    );
  }

  if (match("CHAR_LITERAL")) {
    const token = previous();

    return makeNode(
      "CharLiteral",
      { value: token.value, code: token.value.charCodeAt(0) },
      token
    );
  }

  if (match("TRUE")) {
    return makeNode(
      "BooleanLiteral",
      { value: true },
      previous()
    );
  }

  if (match("FALSE")) {
    return makeNode(
      "BooleanLiteral",
      { value: false },
      previous()
    );
  }

  if (match("IDENTIFIER")) {
    const token = previous();

    if (match("LEFT_PAREN")) {
      const args = [];
      if (!check("RIGHT_PAREN")) {
        do {
          args.push(parseExpression());
        } while (match("COMMA"));
      }
      consume("RIGHT_PAREN", "Expected ')' after argument list");
      return makeNode(
        "CallExpression",
        {
          callee: token.value,
          args,
        },
        token
      );
    }

    return makeNode(
      "IdentifierExpression",
      { name: token.value },
      token
    );
  }

  if (match("LEFT_PAREN")) {
    const startToken = previous();
    const expression = parseExpression();

    consume(
      "RIGHT_PAREN",
      "Expected ')' after the expression"
    );

    return makeNode(
      "GroupExpression",
      { expression },
      startToken
    );
  }

  throw new ParserError(
    "Expected an expression",
    peek()
  );
}


  return parseProgram();
}
