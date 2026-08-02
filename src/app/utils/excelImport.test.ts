// Self-check for the money parser: run with `npm test`.
//
// Prices come off spreadsheets typed by hand in a country that writes
// "1.234,56", so every one of these cases has actually cost someone a
// thousandfold price error somewhere.
import assert from "node:assert/strict";
import { parseNumber } from "./excelImport.ts";

const cases: [unknown, number | null][] = [
  // Venezuelan/European: dot groups, comma decimals
  ["1.234,56", 1234.56],
  ["Bs 12,50", 12.5],
  ["$ 1.500,00", 1500],
  ["1.234.567", 1234567],
  // Plain/exported
  ["1234.56", 1234.56],
  [12.5, 12.5],
  ["0.75", 0.75],
  // A lone separator with three trailing digits is grouping, not decimals
  ["12.500", 12500],
  ["1,500", 1500],
  // ...except when there is no thousand to group
  ["0,750", 0.75],
  ["0.750", 0.75],
  // Empty is a real zero; unreadable is not
  ["", 0],
  [null, 0],
  [undefined, 0],
  ["  ", 0],
  ["abc", null],
  ["s/n", null],
];

for (const [input, expected] of cases) {
  assert.equal(
    parseNumber(input),
    expected,
    `parseNumber(${JSON.stringify(input)}) should be ${expected}`,
  );
}

console.log(`excelImport: ${cases.length} cases passed`);
