export interface Rng {
  next: () => number;
  state: () => number;
  int: (maxExclusive: number) => number;
  shuffle: <T>(items: T[]) => T[];
  pick: <T>(items: readonly T[]) => T;
}

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function makeRng(seed: string | number): Rng {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  if (a === 0) a = 0x9e3779b9;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number): number => {
    if (maxExclusive <= 0) throw new Error('maxExclusive debe ser positivo');
    return Math.floor(next() * maxExclusive);
  };
  const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = tmp;
    }
    return copy;
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('No se puede elegir de una lista vacia');
    return items[int(items.length)] as T;
  };
  return { next, state: () => a >>> 0, int, shuffle, pick };
}

export function createRngFromState(state: number): Rng {
  const rng = makeRng(state >>> 0);
  return rng;
}
