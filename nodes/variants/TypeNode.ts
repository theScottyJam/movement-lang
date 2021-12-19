import type * as AnyNode from './AnyNode'
import { wrapTypeChecker, TypeCheckerGetter, getTypeCheckableBehavior } from '../helpers/typeCheckTools'
import type * as Position from '../../language/Position'

export interface TypeNode<T> extends AnyNode.Node<T> {
  readonly sentinel: symbol
  readonly name: string
  readonly pos: Position.Position
  readonly nodeType: 'type'
  readonly payload: T
}
export type AnyTypeNode = TypeNode<{}>

interface Handlers<T> {
  readonly typeCheck: TypeCheckerGetter<T, {}, {}> 
}
type AnyHandlers = Handlers<unknown>

const registeredHandlers = new Map<string, AnyHandlers>()
export function register<T extends {}>(name: string, handlers: Handlers<T>) {
  if (registeredHandlers.has(name)) throw new Error()
  registeredHandlers.set(name, handlers)
}

export function create<T>(name: string, pos: Position.Position, payload: T): TypeNode<T> {
  return { sentinel: Symbol(), nodeType: 'type', name, pos, payload }
}

export const behaviors = {
  [getTypeCheckableBehavior](node: AnyTypeNode) {
    return wrapTypeChecker<{}>(node, registeredHandlers.get(node.name).typeCheck)
  },
}