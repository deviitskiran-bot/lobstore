// Keep calendar dates as UTC strings so results do not depend on the host timezone.
export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function nextPayDate(value) {
  if (!isCalendarDate(value)) throw new Error("Invalid pay date");
  const date = new Date(value + "T12:00:00Z");
  const day = date.getUTCDate();
  // Move from day 1, then clamp to the last day of the destination month.
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}
