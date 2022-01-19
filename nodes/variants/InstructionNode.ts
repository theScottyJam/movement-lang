import type * as AnyNode from './AnyNode'
import { wrapTypeChecker, TypeCheckerGetter, getTypeCheckableBehavior } from '../helpers/typeCheckTools'
import type * as Position from '../../language/Position'
import type * as Runtime from '../../language/Runtime'
import type * as Value from '../../language/Value'
import type * as RtRespState from '../../language/RtRespState'

export interface InstructionNode<T> extends AnyNode.Node<T> {
  readonly sentinel: symbol,
  readonly name: string
  readonly pos: Position.Position
  readonly nodeType: 'instruction'
  readonly payload: T
}
export type AnyInstructionNode = InstructionNode<{}>

type ExecFn<T, U> = (rt: Runtime.Runtime, payload: T & U & { pos: Position.Position }) =>
  { rtRespState: RtRespState.RtRespState, value: Value.AnyValue }

interface Handlers<T, U> {
  readonly exec: ExecFn<T, U>
  readonly typeCheck: TypeCheckerGetter<T, U, {}> 
}
type AnyHandlers = Handlers<unknown, unknown>

const registeredHandlers = new Map<string, AnyHandlers>()
export function register<T extends {}, U extends {}>(name: string, handlers: Handlers<T, U>) {
  if (registeredHandlers.has(name)) throw new Error()
  registeredHandlers.set(name, handlers)
}

export function exec(node: AnyInstructionNode, rt: Runtime.Runtime) {
  const { exec } = registeredHandlers.get(node.name)
  const typePayload = rt.typeCheckContexts.get(node.sentinel) as any
  if (!typePayload) throw new Error()
  return exec(rt, { ...node.payload, ...typePayload, pos: node.pos })
}

export function create<T>(name: string, pos: Position.Position, payload: T): InstructionNode<T> {
  return { sentinel: Symbol(), nodeType: 'instruction', name, pos, payload }
}

export function createWithNoPos<T>(name: string, payload: T): InstructionNode<T> {
  return { sentinel: Symbol(), nodeType: 'instruction', name, pos: null, payload }
}

export const behaviors = {
  [getTypeCheckableBehavior](node: AnyInstructionNode) {
    return wrapTypeChecker<{}>(node, registeredHandlers.get(node.name).typeCheck)
  },
}