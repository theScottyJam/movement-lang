import type * as AnyNode from './AnyNode'
import { wrapTypeChecker, TypeCheckerGetter, getTypeCheckableBehavior } from '../helpers/typeCheckTools'
import type * as Position from '../../language/Position'
import type * as Runtime from '../../language/Runtime'
import type * as Value from '../../language/Value'
import type * as Type from '../../language/Type'

export const noTypeIncoming = Symbol('No type incoming')

export interface AssignmentTargetNode<T> extends AnyNode.Node<T> {
  readonly sentinel: symbol
  readonly name: string
  readonly nodeType: 'assignmentTarget'
  readonly pos: Position.Position
  readonly payload: T
}
export type AnyAssignmentTargetNode = AssignmentTargetNode<{}>

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
// this may cause incomingType to be set to the noTypeIncoming sentinel, because no type information was found,
// because the incomingType was more narrow. It may also be set to noTypeIncoming if, for example, this
// assignmentTargetNode is a function parameter, where the incoming type is not immediately known.
interface TypeCheckOpts { incomingType: Type.AnyType | typeof noTypeIncoming, allowWidening?: boolean, export?: boolean }

interface Handlers<T, U> {
  readonly exec: ExecFn<T, U>
  readonly typeCheck: TypeCheckerGetter<T, U, TypeCheckOpts> 
}
type AnyHandlers = Handlers<unknown, unknown>

const registeredHandlers = new Map<string, AnyHandlers>()
export function register<T extends {}, U extends {}>(name: string, handlers: Handlers<T, U>) {
  if (registeredHandlers.has(name)) throw new Error()
  registeredHandlers.set(name, handlers)
}

export function exec(node: AnyAssignmentTargetNode, rt: Runtime.Runtime, opts: ExecOpts) {
  const { exec } = registeredHandlers.get(node.name)
  const typePayload = rt.typeCheckContexts.get(node.sentinel) as any
  if (!typePayload) throw new Error()
  return exec(rt, { ...node.payload, ...typePayload, pos: node.pos }, opts)
}

export function create<T>(name: string, pos: Position.Position, payload: T): AssignmentTargetNode<T> {
  return { sentinel: Symbol(), nodeType: 'assignmentTarget', name, pos, payload }
}

export const behaviors = {
  [getTypeCheckableBehavior](node: AnyAssignmentTargetNode, opts_: TypeCheckOpts) {
    const opts: TypeCheckOpts = { allowWidening: false, export: false, ...opts_ }
    return wrapTypeChecker<TypeCheckOpts>(node, registeredHandlers.get(node.name).typeCheck, opts)
  },
}
