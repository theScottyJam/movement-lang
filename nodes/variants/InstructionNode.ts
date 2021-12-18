import type * as Position from '../../language/Position'
import type * as Runtime from '../../language/Runtime'
import type * as Value from '../../language/Value'
import type * as TypeState from '../../language/TypeState'
import type * as RespState from '../../language/RespState'
import type * as RtRespState from '../../language/RtRespState'
import type * as Type from '../../language/Type'

export interface InstructionNode<T, U> {
  readonly name: string
  readonly pos?: Position.Position
  readonly nodeType: 'instruction'
  readonly payload: T
  typePayload?: U
}
export type AnyInstructionNode = InstructionNode<{}, {}>

type ExecFn<T, U> = (rt: Runtime.Runtime, payload: T & U & { pos: Position.Position }) =>
  { rtRespState: RtRespState.RtRespState, value: Value.AnyValue }
type TypeCheckFn<T, U> = (state: TypeState.TypeState, payload: T & { pos: Position.Position }) =>
  { respState: RespState.RespState, type: Type.AnyType, typePayload?: U }

interface Handlers<T, U> { exec: ExecFn<T, U>, typeCheck: TypeCheckFn<T, U> }
type AnyHandlers = Handlers<{}, {}>

const registeredHandlers = new Map<string, AnyHandlers>()
export function register<T extends {}, U extends {}>(name: string, handlers: Handlers<T, U>) {
  if (registeredHandlers.has(name)) throw new Error()
  registeredHandlers.set(name, handlers)
}

export function typeCheck(node: AnyInstructionNode, state: TypeState.TypeState) {
  const { typeCheck } = registeredHandlers.get(node.name)
  const resp = typeCheck(state, { ...node.payload, pos: node.pos })
  node.typePayload = resp.typePayload ?? {}
  return resp
}

export function exec(node: AnyInstructionNode, rt: Runtime.Runtime) {
  const { exec } = registeredHandlers.get(node.name)
  return exec(rt, { ...node.payload, ...node.typePayload, pos: node.pos })
}

export function create<T, U>(name: string, pos: Position.Position, payload: T): InstructionNode<T, U> {
  return { nodeType: 'instruction', name, pos, payload }
}

export function createWithNoPos<T, U>(name: string, payload: T): InstructionNode<T, U> {
  return { nodeType: 'instruction', name, pos: null, payload }
}