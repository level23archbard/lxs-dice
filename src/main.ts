import { DiceParser } from './parser';

const [_node, _dir, ...args] = process.argv;
const text = args.join(' ');
const parser = new DiceParser();
const exp = parser.parse(text);
const res = exp.roll();
console.log(res.value);
