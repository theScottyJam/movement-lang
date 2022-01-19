import * as Position from './language/Position'
import * as AnyNode from './nodes/variants/AnyNode'
import * as warnings from './warnings'
import { formatErrorValue } from './util'
import type { Token } from 'moo'

const unknownPos = (file: string) => Position.create({ file, line: 1, col: 1, length: 0, offset: 0 })

type AnyNode = AnyNode.AnyNode
type Position = Position.Position

type NestedTokensAndNodes = NestedTokensAndNodes[] | Token | AnyNode | { pos: Position } | null
type TokensAndNodes = (Token | AnyNode | { pos: Position })[]

const top = <T>(array: readonly T[]): T => array[array.length - 1]

const isToken = (value: unknown): value is Token => (
  typeof value === 'object' &&
  value != null &&
  'type' in value &&
  'text' in value &&
  'value' in value &&
  'offset' in value &&
  'lineBreaks' in value &&
  'line' in value &&
  'col' in value
)

const asPos = (file: string, value: AnyNode | Token | { pos: Position }): Position => {
  if (AnyNode.isNode(value)) {
    if (!value.pos) {
      warnings.warn('INTERNAL ERROR: Received a node without a position property.')
      return unknownPos(file)
    }
    return value.pos
  } else if ('pos' in value && Position.isPos(value.pos)) {
    return value.pos
  } else if (isToken(value)) {
    return Position.from(file, value)
  } else {
    warnings.warn(`Internal error: Attempted to extract a position out of the non-token '${formatErrorValue(value)}'`)
    return unknownPos(file)
  }
}

// Given a nested list of tokens/nodes, this will find the first and last node,
// then return its range.
export function deepRange(file: string, nestedTokensAndNodes: NestedTokensAndNodes) {
  const tokensAndNodes = [nestedTokensAndNodes].flat(Infinity).filter(x => x != null) as TokensAndNodes
  if (tokensAndNodes.length === 0) throw new Error('INTERNAL ERROR: Failed to find the position of a particular node.')
  return Position.range(
    asPos(file, tokensAndNodes[0]),
    asPos(file, top(tokensAndNodes)),
  )
}
