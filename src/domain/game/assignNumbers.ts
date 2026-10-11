/** Random unique assignments, evenly sampled across the inclusive 0–100 range. */
export function assignNumbers(count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 101) throw new Error('Count must be between 1 and 101.');
  const pool = Array.from({ length: 101 }, (_, value) => value);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
