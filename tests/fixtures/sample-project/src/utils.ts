export const format = (x: unknown): string => String(x);

export const toUpperCase = (s: string): string => s.toUpperCase();

export const { parse, stringify } = JSON;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
