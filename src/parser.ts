/**
 * DiceParser creates an object that can parse dice expressions into a calculable and rollable object.
 */
export class DiceParser {
  /**
   * Configurable maximum count of dice allowed by the parser. If defined, parsing counts of dice greater
   * than this will throw a DiceParserDiceCount error.
   *
   * Default is undefined.
   */
  maximumDiceCount?: number;
  /**
   * Parses a string into a dice expression object.
   *
   * @param value Textual representation of a dice expression.
   * @returns Expression structure which can call .roll() to acquire a result.
   */
  parse(value: string): DiceExpression {
    /*
     * This function operates by following a pattern of tokenizing the string, following the shunting yard algorithm
     * to convert operations to reverse polish notation, then building a tree of dice expression objects against that.
     * This is a somewhat modified pattern established by mathematical and calculator expression handlers, and
     * derives from sources such as https://gist.github.com/tkrotoff/b0b1d39da340f5fc6c5e2a79a8b6cec0 and its derivatives.
     * See also https://en.wikipedia.org/wiki/Shunting_yard_algorithm.
     * 
     * The notable differences are:
     * - This use case operates against numbers, math symbols, AND dice values, e.g. 4d6, ADVd20, and so on.
     * - This use case does not complete the calculation immediately. It creates an expression object which can then
     *   be rerolled as necessary by the consumer.
     */
    const tokens = this.tokenize(value);
    if (!tokens.length) {
      throw new DiceParserEmptyError();
    }
    const rpnStack = this.shuntingYardConversion(tokens);
    return this.expressionForReversePolishNotation(rpnStack);
  }

  private isTokenGroupStart(token: string | undefined): boolean {
    return token === '(';
  }

  private isTokenGroupEnd(token: string | undefined): boolean {
    return token === ')';
  }

  private operators: Record<string, Operator> = {
    '+': {
      operation: (left, right) => new InfixArithmeticExpression(left, right, '+'),
      arguments: 2,
      precedence: 1,
    },
    '-': {
      operation: (left, right) => new InfixArithmeticExpression(left, right, '-'),
      arguments: 2,
      precedence: 1,
    },
    '*': {
      operation: (left, right) => new InfixArithmeticExpression(left, right, '*'),
      arguments: 2,
      precedence: 2,
    },
    '/': {
      operation: (left, right) => new InfixArithmeticExpression(left, right, '/'),
      arguments: 2,
      precedence: 2,
    },
  };

  private isTokenOperator(token: string | undefined): boolean {
    return !!token && !!this.operators[token];
  }

  private tokenize(value: string): string[] {
    const tokens: string[] = [];

    const isCharPrimitive = (c: string) => /\w/.test(c);
    const isCharOperator = (c: string) => this.isTokenOperator(c);
    let current = '';
    let currentAdded: undefined | '.' = undefined;
    const trimmedValue = value.trim().replace(/\s+/g, ' ');
    for (let i = 0; i < trimmedValue.length; i++) {
      const c = trimmedValue.charAt(i);
      const prevC = trimmedValue.charAt(i - 1);
      const nextC = trimmedValue.charAt(i + 1);
      const lastToken = top(tokens);
      const currentParsingStarted = current !== '';

      if (
        // Primitive char
        isCharPrimitive(c) ||
        // Unary operator: -1 only
        ((c === '-') &&
          !currentParsingStarted &&
          (lastToken === undefined ||  lastToken === ',' || this.isTokenGroupStart(lastToken) || isCharOperator(lastToken)) &&
          /\d/.test(nextC))
      ) {
        current += c;
      } else if (c === '.') {
        if (currentParsingStarted && currentAdded) {
          throw new DiceParserSyntaxError('Invalid "." character', trimmedValue.slice(Math.max(0, i - 20), i + 20));
        }
        current += c;
        currentAdded = '.';
      } else if (c === ' ') {
        if (isCharPrimitive(prevC) && isCharPrimitive(nextC)) {
          throw new DiceParserSyntaxError('Extraneous space between tokens', trimmedValue.slice(Math.max(0, i - 20), i + 20));
        }
      } else if (isCharOperator(c) || this.isTokenGroupStart(c) || this.isTokenGroupEnd(c) || c === ',') {
        if (
          isCharOperator(c) &&
          !currentParsingStarted &&
          isCharOperator(lastToken || '')
        ) {
          throw new DiceParserSyntaxError('Consecutive operators', trimmedValue.slice(Math.max(0, i - 20), i + 20));
        }
        if (currentParsingStarted) {
          tokens.push(current);
        }
        tokens.push(c);
        current = '';
        currentAdded = undefined;
      } else {
        throw new DiceParserSyntaxError('Invalid character ' + c, trimmedValue.slice(Math.max(0, i - 20), i + 20));
      }
    }

    if (current !== '') {
      tokens.push(current);
    }
    // // Shift a leading 0 in front of relevant operators
    // if (tokens[0] === '+' || tokens[0] === '-') {
    //   tokens.unshift('0');
    // }
    return tokens;
  }

  private shuntingYardConversion(tokens: string[]): string[] {
    const outputStack: string[] = [];
    const operatorStack: string[] = [];

    tokens.forEach(token => {
      if (this.isTokenGroupStart(token)) {
        operatorStack.push(token);
      } else if (this.isTokenGroupEnd(token)) {
        while (operatorStack.length && !this.isTokenGroupStart(top(operatorStack))) {
          outputStack.push(operatorStack.pop() as string);
        }
        if (operatorStack.length && this.isTokenGroupStart(top(operatorStack))) {
          operatorStack.pop();
        } else {
          throw new DiceParserSyntaxError('Parenthesis mismatch');
        }
        // If we support functions, this is where we move the function on the top of the operator stack to the output stack
      } else if (token === ',') {
        while (operatorStack.length && !this.isTokenGroupStart(top(operatorStack))) {
          outputStack.push(operatorStack.pop()!);
        }
        if (operatorStack.length === 0) {
          throw new DiceParserSyntaxError('Misplaced ","');
        }
      } else if (this.isTokenOperator(token)) {
        while (operatorStack.length && this.isTokenOperator(top(operatorStack)) && this.operators[top(operatorStack)!].precedence >= this.operators[token].precedence) {
          outputStack.push(operatorStack.pop()!);
        }
        operatorStack.push(token);
      } else {
        // If we support functions, add another elif to check, and move the function to the operator stack
        outputStack.push(token);
      }
      return;
    });
  
    while (operatorStack.length) {
      if (!this.isTokenGroupStart(top(operatorStack))) {
        outputStack.push(operatorStack.pop()!);
      } else {
        throw new DiceParserSyntaxError('Parenthesis mismatch');
      }
    }
  
    return outputStack;
  }

  private expressionForReversePolishNotation(tokens: string[]): DiceExpression {
    const stack: DiceExpression[] = [];
    let diceCount = 0;

    tokens.forEach(token => {
      if (this.isTokenOperator(token)) {
        const operator = this.operators[token];
        const params: DiceExpression[] = [];
        for (let i = 0; i < operator.arguments; i++) {
          if (!stack.length) {
            throw new DiceParserSyntaxError('Incorrect amount of arguments');
          }
          params.push(stack.pop()!);
        }
        stack.push(operator.operation(...params.reverse()));
      } else {
        const exp = this.expressionForPrimitive(token);
        if (this.maximumDiceCount != undefined && exp instanceof CountedDiceRollExpression) {
          diceCount += exp.count;
          if (diceCount > this.maximumDiceCount) {
            throw new DiceParserDiceCount(this.maximumDiceCount);
          }
        }
        stack.push(exp);
      }
    });
  
    if (stack.length > 1) {
      throw new DiceParserSyntaxError('Insufficient operators');
    }
    return stack[0];
  }

  /**
   * Primitive tokens in RPN are converted into dice expressions via dice rules,
   * accepting any number, number prefixed with 'd', or pair of numbers infixed with 'd'.
   *
   * @param token Text contianing RPN primitive token.
   * @returns A dice expression structure to roll that primitive interpretation.
   */
  private expressionForPrimitive(token: string): DiceExpression {
    const isNumeric = (value: string) => !isNaN(+value) && !isNaN(parseFloat(value));
    const tokenLower = token.toLowerCase();
    if (tokenLower.includes('d')) {
      const parts = tokenLower.split('d');
      if (parts.length !== 2) {
        throw new DiceParserSyntaxError(`Unrecognized input with too may letter d's: ${token}`);
      }
      if (!isNumeric(parts[1])) {
        throw new DiceParserSyntaxError(`Unrecognized input following letter d: ${token}`);
      }
      const countPart = parts[0] || '1';
      if (!isNumeric(countPart)) {
        throw new DiceParserSyntaxError(`Unrecognized input before letter d: ${token}`);
      }
      const count = parseFloat(countPart);
      if (count < 1) {
        throw new DiceParserSyntaxError(`Unallowed count before letter d: ${token}`);
      }
      return new CountedDiceRollExpression(count, new DiceRollExpression(parseFloat(parts[1])));
    }
    if (isNumeric(token)) {
      return new NumericalExpression(parseFloat(token));
    }
    throw new DiceParserSyntaxError(`Unrecognized input: ${token}`);
  }
}

/**
 * Stack helper function to read the top of the stack without popping it.
 *
 * @param stack An array treated like a stack.
 * @returns The last item in that array.
 */
const top = (stack: string[]): string | undefined => stack[stack.length - 1];

interface Operator {
  operation: (...args: DiceExpression[]) => DiceExpression,
  arguments: number;
  precedence: number;
}

export abstract class DiceParserError extends Error {}

export class DiceParserEmptyError extends DiceParserError {
  constructor() {
    super('Empty expression');
  }
}

export class DiceParserSyntaxError extends DiceParserError {
  constructor(issue: string, location?: string) {
    super(`${issue}${location ? ' @ ' + location : ''}`);
  }
}

export class DiceParserDiceCount extends DiceParserError {
  constructor(allowed: number) {
    super(`Too many dice in expression, no more than ${allowed} is allowed`);
  }
}

/**
 * DiceExpression represents an interpreted expression. Expressions are calculable and rollable,
 * providing the .roll() method to acquire a result. An expression on its own contains all the
 * structural information needed to operate and order against the parts of the original text,
 * but does not offer information to consume other than the generation method for the result.
 */
export abstract class DiceExpression {
  /**
   * Call to acquire the result of the expression. The result structure contains a single value,
   * as well as an array of all the actual rolled value of the dice. Each call to the method will
   * result in a new result, which can include new values for each rolled dice as well as the
   * overall value.
   *
   * @returns Result structure which can provide its value through .value.
   */
  abstract roll(): DiceResult;
}

class NumericalExpression extends DiceExpression {
  constructor(private value: number) {
    super();
  }

  roll(): DiceResult {
    return new AccumulatedResult(this.value, []);
  }
}

class DiceRollExpression extends DiceExpression {
  constructor(private size: number) {
    super();
  }

  roll(): DiceResult {
    const value = Math.floor(Math.random() * this.size) + 1;
    const rolled: DiceRolled = {
      size: this.size,
      value,
    };
    if (value === this.size) {
      rolled.isMax = true;
    } else if (value === 1) {
      rolled.isMin = true;
    }
    return new AccumulatedResult(value, [rolled]);
  }
}

class CountedDiceRollExpression extends DiceExpression {
  constructor(public count: number, private dice: DiceRollExpression) {
    super();
  }

  roll(): DiceResult {
    let acc = this.dice.roll();
    for (let i = 1; i < this.count; i++) {
      const next = this.dice.roll();
      acc = new AccumulatedResult(acc.value + next.value, [...acc.diceRolled, ...next.diceRolled]);
    }
    return acc;
  }
}

class InfixArithmeticExpression extends DiceExpression {
  constructor(private left: DiceExpression, private right: DiceExpression, private operator: '+' | '-' | '*' | '/') {
    super();
  }

  roll(): DiceResult {
    const left = this.left.roll();
    const right = this.right.roll();
    switch (this.operator) {
      case '+': return new AccumulatedResult(left.value + right.value, [...left.diceRolled, ...right.diceRolled]);
      case '-': return new AccumulatedResult(left.value - right.value, [...left.diceRolled, ...right.diceRolled]);
      case '*': return new AccumulatedResult(left.value * right.value, [...left.diceRolled, ...right.diceRolled]);
      case '/': return new AccumulatedResult(left.value / right.value, [...left.diceRolled, ...right.diceRolled]);
    }
  }
}

/**
 * DiceRolled describes the rolling result for a single die.
 */
export interface DiceRolled {
  /** Size of the die, e.g. a d20 would have a size of 20. */
  size: number;
  /** Rolled value of this die. */
  value: number;
  /** Convenience flag to check if the rolled value of the die is the maximum, e.g. equal to its size. */
  isMax?: boolean;
  /**
   * Convenience flag to check if the rolled value of the die is the mininum, e.g. equal to 1. Note that
   * if the size of the dice is 1, then this will not be set, and isMax will be set instead.
   */
  isMin?: boolean;
}

/**
 * DiceResult describes the result of a rolled expression.
 */
export abstract class DiceResult {
  /** Overall value acquired from rolling the expression. */
  abstract readonly value: number;
  /**
   * The result of all dice and their individual rolled values. Dice are ordered by the order of
   * their appearance in the original expression.
   */
  abstract readonly diceRolled: DiceRolled[];
}

class AccumulatedResult extends DiceResult {
  constructor(readonly value: number, readonly diceRolled: DiceRolled[]) {
    super();
  }
}
