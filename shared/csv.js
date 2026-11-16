// CSV quoting alone does not stop spreadsheet software from executing formulas.
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function toCsv(rows) {
  const keys = Object.keys(rows[0] || {});
  return [
    keys.map(csvCell).join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n");
}
