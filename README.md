Utilities for rolling dice expressions.

Supports dice expressions such as:
- d20
- 4d20
- any number
- operators +, -, *, and /
- parenthesis () to order operations

The package provides a DiceParser object as an entry point. To get started,
create a new DiceParser, call .parse() with your text to get an expression,
call .roll() to get a result, and access .value to read the overall value.

This package may be used as a command line utility. Run:
`npx lxs-dice some_expression`
