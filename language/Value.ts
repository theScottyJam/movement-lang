import type { AnyType } from './Type'

export interface Value<T extends AnyType, R> {
  readonly raw: R
  readonly type: T
}

export type AnyValue = Value<AnyType, unknown>

export function create<T extends AnyType, R>({ raw, type }: { raw: R, type: T }): Value<T, R> {
  return { raw, type }
}