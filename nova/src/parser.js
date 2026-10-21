
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
    if (match("LET")) {
      return parseVariableDeclaration(previous());
    }

    if (match("PRINT")) {
      return parsePrintStatement(previous());
    }

    throw new ParserError(
      "Expected a statement (let or print)",
      peek()
    );
  }

  function parseVariableDeclaration(startToken) {
    const name = consume(
      "IDENTIFIER",
      "Expected a variable name after 'let'"
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
  return parseAddition();
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

  if (match("IDENTIFIER")) {
    const token = previous();

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
