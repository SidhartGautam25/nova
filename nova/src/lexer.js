
const KEYWORDS = new Map([
  ["let", "LET"],
  ["make", "MAKE"],
  ["int", "INT"],
  ["print", "PRINT"],
  ["run", "RUN"],
  ["times", "TIMES"],
  ["if", "IF"],
  ["else", "ELSE"],
  ["while", "WHILE"],
  ["break", "BREAK"],
  ["continue", "CONTINUE"],
  ["function", "FUNCTION"],
  ["void", "VOID"],
  ["return", "RETURN"],
  ["char", "CHAR"],
  ["bool", "BOOL"],
  ["true", "TRUE"],
  ["false", "FALSE"],
]);

export class LexerError extends Error {
  constructor(message, line, column) {
    super(`${line}:${column}: ${message}`);
    this.name = "LexerError";
    this.line = line;
    this.column = column;
  }
}

export function tokenize(source) {
  const tokens = [];

  let start = 0;
  let current = 0;
  let line = 1;
  let column = 1;

  let startLine = 1;
  let startColumn = 1;

  function isAtEnd() {
    return current >= source.length;
  }

  function peek() {
    return isAtEnd() ? "\0" : source[current];
  }

  function peekNext() {
    return current + 1 >= source.length
      ? "\0"
      : source[current + 1];
  }

  function advance() {
    const char = source[current++];

    if (char === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }

    return char;
  }

  function match(expected) {
    if (isAtEnd() || source[current] !== expected) {
      return false;
    }

    advance();
    return true;
  }

  function emit(type, value) {
    tokens.push({
      type,
      value,
      line: startLine,
      column: startColumn,
      start,
      end: current,
    });
  }

  function error(message) {
    throw new LexerError(message, startLine, startColumn);
  }

  function isDigit(char) {
    return char >= "0" && char <= "9";
  }

  function isAlpha(char) {
    return (
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      char === "_"
    );
  }

  function isAlphaNumeric(char) {
    return isAlpha(char) || isDigit(char);
  }

  function scanNumber() {
    while (isDigit(peek())) {
      advance();
    }

    // Keep the original spelling. Range and integer validation
    // will be handled during semantic analysis.
    emit("NUMBER", source.slice(start, current));
  }

  function scanIdentifier() {
    while (isAlphaNumeric(peek())) {
      advance();
    }

    const text = source.slice(start, current);
    const type = KEYWORDS.get(text) ?? "IDENTIFIER";

    emit(type, text);
  }

  function scanString() {
    let value = "";

    while (!isAtEnd() && peek() !== '"') {
      const char = advance();

      if (char === "\n") {
        error("Unterminated string literal");
      }

      if (char !== "\\") {
        value += char;
        continue;
      }

      if (isAtEnd()) {
        error("Unterminated escape sequence");
      }

      const escaped = advance();

      switch (escaped) {
        case '"':
          value += '"';
          break;
        case "\\":
          value += "\\";
          break;
        case "n":
          value += "\n";
          break;
        case "r":
          value += "\r";
          break;
        case "t":
          value += "\t";
          break;
        default:
          error(`Unknown escape sequence: \\${escaped}`);
      }
    }

    if (isAtEnd()) {
      error("Unterminated string literal");
    }

    // Consume the closing quote.
    advance();

    // String token values are decoded, not quoted source text.
    emit("STRING", value);
  }

  function scanChar() {
    if (isAtEnd() || peek() === "'") {
      error("Empty character literal");
    }

    let charVal = advance();
    if (charVal === "\\") {
      if (isAtEnd()) {
        error("Unterminated escape sequence in character literal");
      }
      const escaped = advance();
      switch (escaped) {
        case "'": charVal = "'"; break;
        case "\\": charVal = "\\"; break;
        case "n": charVal = "\n"; break;
        case "r": charVal = "\r"; break;
        case "t": charVal = "\t"; break;
        case "0": charVal = "\0"; break;
        default:
          error(`Unknown escape sequence in character literal: \\${escaped}`);
      }
    }

    if (isAtEnd() || peek() !== "'") {
      error("Unterminated character literal");
    }

    // Consume the closing quote
    advance();

    emit("CHAR_LITERAL", charVal);
  }

  function skipLineComment() {
    while (!isAtEnd() && peek() !== "\n") {
      advance();
    }
  }

  function scanToken() {
    const char = advance();

    switch (char) {
      // Whitespace
      case " ":
      case "\r":
      case "\t":
      case "\n":
        return;

      // Comments and division
      case "/":
        if (match("/")) {
          skipLineComment();
        } else {
          emit("SLASH", "/");
        }
        return;

      // Single-character and two-character tokens
      case "=":
        if (match("=")) {
          emit("EQUAL_EQUAL", "==");
        } else {
          emit("EQUAL", "=");
        }
        return;
      case "!":
        if (match("=")) {
          emit("BANG_EQUAL", "!=");
        } else {
          emit("BANG", "!");
        }
        return;
      case ">":
        if (match("=")) {
          emit("GREATER_EQUAL", ">=");
        } else {
          emit("GREATER", ">");
        }
        return;
      case "<":
        if (match("=")) {
          emit("LESS_EQUAL", "<=");
        } else {
          emit("LESS", "<");
        }
        return;
      case "+":
        emit("PLUS", "+");
        return;
      case "-":
        emit("MINUS", "-");
        return;
      case "*":
        emit("STAR", "*");
        return;
      case "(":
        emit("LEFT_PAREN", "(");
        return;
      case ")":
        emit("RIGHT_PAREN", ")");
        return;
      case ",":
        emit("COMMA", ",");
        return;
      case ":":
        emit("COLON", ":");
        return;
      case ";":
        emit("SEMICOLON", ";");
        return;
      case "{":
        emit("LEFT_BRACE", "{");
        return;
      case "}":
        emit("RIGHT_BRACE", "}");
        return;

      // Characters and Strings
      case "'":
        scanChar();
        return;
      case '"':
        scanString();
        return;

      default:
        if (isDigit(char)) {
          scanNumber();
          return;
        }

        if (isAlpha(char)) {
          scanIdentifier();
          return;
        }

        error(`Unexpected character: ${JSON.stringify(char)}`);
    }
  }

  while (!isAtEnd()) {
    start = current;
    startLine = line;
    startColumn = column;

    scanToken();
  }

  tokens.push({
    type: "EOF",
    value: null,
    line,
    column,
    start: current,
    end: current,
  });

  return tokens;
}
