import type * as Position from '../../language/Position'
import type * as TypeState from '../../language/TypeState'
import type * as RespState from '../../language/RespState'
import type * as Type from '../../language/Type'

export interface TypeNode<T> {
  readonly name: string
  readonly pos: Position.Position
  readonly nodeType: 'type'
  readonly payload: T
}
export type AnyTypeNode = TypeNode<{}>

type TypeCheckFn<T> = (state: TypeState.TypeState, payload: T & { pos: Position.Position }) =>
  { respState: RespState.RespState, type: Type.AnyType }

interface Handlers<T> { typeCheck: TypeCheckFn<T> }
type AnyHandlers = Handlers<{}>

const registeredHandlers = new Map<string, AnyHandlers>()
export function register<T extends {}>(name: string, handlers: Handlers<T>) {
  if (registeredHandlers.has(name)) throw new Error()
  registeredHandlers.set(name, handlers)
}

export function typeCheck(node: AnyTypeNode, state: TypeState.TypeState) {
  const { typeCheck } = registeredHandlers.get(node.name)
  return typeCheck(state, { ...node.payload, pos: node.pos })
}

export function create<T>(name: string, pos: Position.Position, payload: T): TypeNode<T> {
  return { nodeType: 'type', name, pos, payload }
}
