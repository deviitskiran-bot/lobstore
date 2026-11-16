import test from "node:test";
import assert from "node:assert/strict";
import { nextPayDate, isCalendarDate } from "../shared/dates.js";
import { csvCell, toCsv } from "../shared/csv.js";

test("calendar dates reject rollover dates and malformed values", () => {
  for (const value of ["2026-02-30", "2026-13-01", "not a date", null, 123])
    assert.equal(isCalendarDate(value), false);
  assert.equal(isCalendarDate("2028-02-29"), true);
});
test("monthly payroll clamps January 31 to February 28", () =>
  assert.equal(nextPayDate("2026-01-31"), "2026-02-28"));
test("monthly payroll handles leap years and December", () => {
  assert.equal(nextPayDate("2028-01-31"), "2028-02-29");
  assert.equal(nextPayDate("2026-12-15"), "2027-01-15");
  assert.throws(() => nextPayDate("2026-02-30"));
});
test("CSV quotes commas, quotes and newlines", () => {
  assert.equal(csvCell('Tee, "blue"'), '"Tee, ""blue"""');
  assert.equal(csvCell("two\nlines"), '"two\nlines"');
});
test("CSV neutralizes formula prefixes including leading whitespace", () => {
  for (const value of [
    "=1+1",
    "+SUM(A1)",
    "-1+2",
    "@SUM(A1)",
    "  =1+1",
    "\t=1+1",
    "\r=1+1",
    "\uFEFF=1+1",
  ])
    assert.ok(csvCell(value).startsWith("\"'"));
});
test("CSV serializes records and empty reports", () => {
  assert.equal(
    toCsv([{ name: "Tee", stock: 2 }]),
    '"name","stock"\r\n"Tee","2"',
  );
  assert.equal(toCsv([]), "");
});
