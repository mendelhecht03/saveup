
// ---- dates (plain YYYY-MM-DD strings, computed in UTC so DST never shifts a day)
const toDate = s => new Date(`${s}T00:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function weekRange(today, offset = 0) {
  const start = addDays(today, -toDate(today).getUTCDay() + 7 * offset); // Sunday
  return { start, end: addDays(start, 6) };
}
export function periodRange(interval, today) {
  if (interval === 'weekly') return weekRange(today);
  const [y, m] = today.split('-').map(Number);
  if (interval === 'monthly') return { start: `${today.slice(0, 7)}-01`, end: iso(new Date(Date.UTC(y, m, 0))) };
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
