export function zip<T, U>(array1: readonly T[], array2: readonly U[]): readonly [T, U][] {
  if (array1.length !== array2.length) throw new Error()
  return array1.map((array1Element, i) => [array1Element, array2[i]])
}

export function zip3<T, U, V>(array1: readonly T[], array2: readonly U[], array3: readonly V[]): readonly [T, U, V][] {
  if (array1.length !== array2.length || array2.length !== array3.length) throw new Error()
  return array1.map((array1Element, i) => [array1Element, array2[i], array3[i]])
}
