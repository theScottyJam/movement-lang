import type { Token } from 'moo'
import { formatErrorValue } from '../util'
import * as warnings from '../warnings'

const isPosSymb: unique symbol = Symbol('Position')
export const isPos = (obj: unknown): obj is Position => isPosSymb in Object(obj)

export const internalFile: unique symbol = Symbol('Internal File')

export interface Position {
  [isPosSymb]: true
  readonly file: string | typeof internalFile
  readonly line: number // one-indexed
  readonly col: number // one-indexed
  readonly length: number
  readonly offset: number // zero-indexed offset from the start of the script.
}

export function create({ file, line, col, length, offset }): Position {
  return { [isPosSymb]: true, file, line, col, length, offset }
}

// TODO: Maybe deprecate this? moo-token specific stuff should probably go in grammarParseUtils.ts instead.
export function from(file: string, token: Token): Position {
  if (token.text == null) throw new Error(`Internal error: Attempted to extract a position out of the non-token '${formatErrorValue(token)}'`)
  return {
    [isPosSymb]: true,
    file,
    line: token.line,
    col: token.col,
    length: token.text.length,
    offset: token.offset,
  }
}

export function range(pos1: Position, pos2: Position): Position {
  if (pos2.offset < pos1.offset) {
    warnings.warn('INTERNAL ERROR: range() received params in the wrong order.')
    return range(pos2, pos1)
  }
  if (pos1.file !== pos2.file) {
    warnings.warn('INTERNAL ERROR: Range of positions had different files.')
  }
  return create({
    file: pos1.file,
    line: pos1.line,
    col: pos1.col,
    length: (pos2.offset - pos1.offset) + pos2.length,
    offset: pos1.offset,
  })
}

export function asZeroLength(pos: Position): Position {
  return create({
    file: pos.file,
    line: pos.line,
    col: pos.col,
    length: 0,
    offset: pos.offset,
  })
}
