import type * as Position from '../../language/Position'
import type * as Runtime from '../../language/Runtime'
import type * as Value from '../../language/Value'
import type * as TypeState from '../../language/TypeState'
import type * as RespState from '../../language/RespState'
import type * as Type from '../../language/Type'

export const missingType = Symbol('Missing Type')

export interface AssignmentTargetNode<T, U> {
  readonly name: string
  readonly nodeType: 'assignmentTarget'
  readonly pos: Position.Position
  readonly payload: T
  typePayload?: U
}
export type AnyAssignmentTargetNode = AssignmentTargetNode<{}, {}>

// The allowFailures option can be set to true, to cause exec() to return null instead of throwing an
// error if the assignment failed. Useful for pattern matching.
// Some code just returns null without checking this argument, because it knows that code-path shouldn't
// execute otherwise (because you gave it something with a bad type, which typeCheck would normally catch, unless
// you passed the allowWidening flag to it)
interface ExecOpts { incomingValue: Value.AnyValue, allowFailure?: boolean }
type ExecFn<T, U> = (rt: Runtime.Runtime, payload: T & U & { pos: Position.Position }, opts: ExecOpts) =>
  { identifier: string, value: Value.AnyValue }[]

// Called during normal assignment. A "incomingType" is passed in (the RHS of the assignment), which
// you're expected to match against, to make sure the incomingType is allowed.
// allowWidening may be set to true, to indicate the passed-in type is allowed to be more narrow
// (it's runtime type still can't though)
// This is useful for pattern-matching, because during pattern matching, you're trying to find more information
// about the passed-in type, e.g. `match value as #{} when { x: X } ...`
// this may cause incomingType to be set to the missingType sentinel, because no type information was found,
// because the incomingType was more narrow.
interface TypeCheckOpts { incomingType: Type.AnyType | typeof missingType, allowWidening?: boolean, export: boolean }
type TypeCheckFn<T, U> = (state: TypeState.TypeState, payload: T & { pos: Position.Position }, opts: TypeCheckOpts) =>
  { respState: RespState.RespState, typePayload?: U }

// This gets used when the RHS is not immediately known, e.g. a function parameter list.
type ContextlessTypeCheckFn<T, U> = (state: TypeState.TypeState, payload: T & { pos: Position.Position }) =>
  { respState: RespState.RespState, type: Type.AnyType, typePayload?: U }

interface Handlers<T, U> { exec: ExecFn<T, U>, typeCheck: TypeCheckFn<T, U>, contextlessTypeCheck: ContextlessTypeCheckFn<T, U> }
type AnyHandlers = Handlers<{}, {}>

const registeredHandlers = new Map<string, AnyHandlers>()
export function register<T extends {}, U extends {}>(name: string, handlers: Handlers<T, U>) {
  if (registeredHandlers.has(name)) throw new Error()
  registeredHandlers.set(name, handlers)
}

export function typeCheck(node: AnyAssignmentTargetNode, state: TypeState.TypeState, opts: TypeCheckOpts) {
  const { typeCheck } = registeredHandlers.get(node.name)
  const resp = typeCheck(state, { ...node.payload, pos: node.pos }, opts)
  node.typePayload = resp.typePayload ?? {}
  return resp
}

export function contextlessTypeCheck(node: AnyAssignmentTargetNode, state: TypeState.TypeState) {
  const { contextlessTypeCheck } = registeredHandlers.get(node.name)
  const resp = contextlessTypeCheck(state, { ...node.payload, pos: node.pos })
  node.typePayload = resp.typePayload ?? {}
  return resp
}

export function exec(node: AnyAssignmentTargetNode, rt: Runtime.Runtime, opts: ExecOpts) {
  const { exec } = registeredHandlers.get(node.name)
  return exec(rt, { ...node.payload, pos: node.pos }, opts)
}

export function create<T, U>(name: string, pos: Position.Position, payload: T): AssignmentTargetNode<T, U> {
  return { nodeType: 'assignmentTarget', name, pos, payload }
}
