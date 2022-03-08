export function zip<T, U>(array1: readonly T[], array2: readonly U[]): readonly [T, U][] {
  if (array1.length !== array2.length) throw new Error()
  return array1.map((array1Element, i) => [array1Element, array2[i]])
}

export function zip3<T, U, V>(array1: readonly T[], array2: readonly U[], array3: readonly V[]): readonly [T, U, V][] {
  if (array1.length !== array2.length || array2.length !== array3.length) throw new Error()
  return array1.map((array1Element, i) => [array1Element, array2[i], array3[i]])
}

export function formatErrorValue(value: unknown): string {
  const truncate = (msg: string, amount=100) => {
    if (msg.length <= amount) return msg
    return msg.slice(0, amount - 1) + '…'
  }

  try {
    return truncate(JSON.stringify(value))
  } catch (err) {
    return truncate(String(value))
  }
}

// Use this function to ensure your if/else chain is exhaustive against all variants of an enum.
export function assertUnreachable(value: never): never {
  throw new Error('INTERNAL ERROR: Unreachable statement reached.')
}

interface MemoizeOpts<Params extends unknown[], CacheKey> {
  readonly argsToKey?: (...args: Params) => CacheKey
}
export function memoize<Params extends unknown[], Return, CacheKey>(
  ...[fn, { argsToKey }]:
  [(...args: Params) => Return, MemoizeOpts<Params, CacheKey>?]
): (...args: Params) => Return {
  const cache = new Map<CacheKey, Return>()
  return (...args: Params) => {
    const key = argsToKey(...args)
    if (cache.has(key)) return cache.get(key)

    const res = fn(...args)
    cache.set(key, res)
    return res
  }
}

export function pipe<A>(
  value: A,
): A
export function pipe<A, B>(
  value: A,
  fn1: (x: A) => B,
): B
export function pipe<A, B, C>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
): C
export function pipe<A, B, C, D>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
  fn3: (x: C) => D,
): D
export function pipe<A, B, C, D, E>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
  fn3: (x: C) => D,
  fn4: (x: D) => E,
): E
export function pipe<A, B, C, D, E, F>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
  fn3: (x: C) => D,
  fn4: (x: D) => E,
  fn5: (x: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
  fn3: (x: C) => D,
  fn4: (x: D) => E,
  fn5: (x: E) => F,
  fn6: (x: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
  fn3: (x: C) => D,
  fn4: (x: D) => E,
  fn5: (x: E) => F,
  fn6: (x: F) => G,
  fn7: (x: G) => H,
): H
export function pipe<A, B, C, D, E, F, G, H, I>(
  value: A,
  fn1: (x: A) => B,
  fn2: (x: B) => C,
  fn3: (x: C) => D,
  fn4: (x: D) => E,
  fn5: (x: E) => F,
  fn6: (x: F) => G,
  fn7: (x: G) => H,
  fn8: (x: H) => I,
): I
export function pipe(value, ...fns) {
  return fns.reduce((value, fn) => fn(value), value)
}