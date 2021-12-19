import type { Position } from '../../language/Position'

export interface Node<T> {
  readonly sentinel: symbol
  readonly name: string
  readonly nodeType: string
  readonly payload: T
  // This is required in some node types
  readonly pos?: Position
}

export type AnyNode = Node<{}>
