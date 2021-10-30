import type { Token } from 'moo'

const isPosSymb: unique symbol = Symbol('Position')
const isPos = (obj): obj is Position => !!obj[isPosSymb]

export interface Position {
  [isPosSymb]: true
  readonly line: number
  readonly col: number
  readonly length: number
  readonly offset: number
}

const truncate = (msg: string, amount=100) => {
  if (msg.length <= amount) return msg
  return msg.slice(0, amount - 1) + '…'
}

export function create({ line, col, length, offset }): Position {
  return { [isPosSymb]: true, line, col, length, offset }
}

export function from(token: Token): Position {
  if (token.text == null) throw new Error(`Internal error: Attempted to extract a position out of the non-token '${truncate(JSON.stringify(token))}'`)
  return {
    [isPosSymb]: true,
    line: token.line,
    col: token.col,
    length: token.text.length,
    offset: token.offset,
  }
}

export function range(token1: Token | Position, token2: Token | Position): Position {
  const pos1 = isPos(token1) ? token1 : from(token1)
  const pos2 = isPos(token2) ? token2 : from(token2)
  return {
    [isPosSymb]: true,
    line: pos1.line,
    col: pos1.col,
    length: (pos2.offset - pos1.offset) + pos2.length,
    offset: pos1.offset,
  }
}