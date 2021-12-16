import type * as Position from '../../language/Position'
import type * as Runtime from '../../language/Runtime'
import type * as Value from '../../language/Value'
import type * as TypeState from '../../language/TypeState'
import type * as RespState from '../../language/RespState'
import type * as RtRespState from '../../language/RtRespState'
import type * as Type from '../../language/Type'
import type * as types from '../../language/types'
import type * as values from '../../language/values'
import { PURITY } from '../../language/constants'

type ValueOf<T> = T[keyof T]

export interface Node {
  readonly name: string
  readonly pos?: Position.Position
  readonly data?: unknown
  readonly exec: (rt: Runtime.Runtime) => { rtRespState: RtRespState.RtRespState, value: Value.AnyValue }
  readonly typeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType }
}

interface RootExecOpts {
  readonly behaviors?: Partial<Runtime.RuntimeBehaviors>
  readonly moduleDefinitions: Map<string, Root>
  readonly cachedModules?: { mutable: Map<string, values.RecordValue> }
  readonly stdLib: values.RecordValue
}
interface RootTypeCheckOpts {
  readonly behaviors?: Partial<TypeState.TypeStateBehaviors>
  readonly moduleDefinitions: Map<string, Root>
  readonly moduleShapes?: { readonly mutable: Map<string, types.RecordType> }
  readonly importStack?: readonly string[]
  readonly stdLibShape: types.RecordType
  readonly isMainModule?: boolean
}
export interface Root {
  readonly dependencies: readonly string[]
  readonly exec: (opts: RootExecOpts) => values.RecordValue
  readonly typeCheck: (opts: RootTypeCheckOpts) => types.RecordType
}

interface NodeOpts<T> {
  readonly name: string
  readonly pos?: Position.Position
  readonly data?: unknown
  readonly exec: (rt: Runtime.Runtime, { typeCheckContext }: { typeCheckContext: T }) => { rtRespState: RtRespState.RtRespState, value: Value.AnyValue }
  readonly typeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType, typeCheckContext?: T }
}

interface InvokeNodeTypeCheckOpts { callWithPurity?: ValueOf<typeof PURITY> }
interface InvokeNodeTypeCheckReturnValue { respState: RespState.RespState, type: Type.AnyType }
export interface InvokeNode extends Omit<Node, 'typeCheck'> {
  readonly typeCheck: (state: TypeState.TypeState, opts?: InvokeNodeTypeCheckOpts) => InvokeNodeTypeCheckReturnValue
}

export const missingType = Symbol('Missing Type')

interface AssignmentTargetNodeExecOpts { incomingValue: Value.AnyValue, allowFailure?: boolean }
type AssignmentTargetNodeExecReturnType = { identifier: string, value: Value.AnyValue }[]
interface AssignmentTargetNodeTypeCheckOpts { incomingType: Type.AnyType | typeof missingType, allowWidening?: boolean, export: boolean }
interface AssignmentTargetNodeTypeCheckReturnType { respState: RespState.RespState }
export interface AssignmentTargetNode {
  readonly name: string
  readonly pos?: Position.Position
  // The allowFailures option can be set to true, to cause exec() to return null instead of throwing an
  // error if the assignment failed. Useful for pattern matching.
  // Some code just returns null without checking this argument, because it knows that code-path shouldn't
  // execute otherwise (because you gave it something with a bad type, which typeCheck would normally catch, unless
  // you passed the allowWidening flag to it)
  readonly exec: (rt: Runtime.Runtime, opts: AssignmentTargetNodeExecOpts) => AssignmentTargetNodeExecReturnType
  // Called during normal assignment. A "incomingType" is passed in (the RHS of the assignment), which
  // you're expected to match against, to make sure the incomingType is allowed.
  // allowWidening may be set to true, to indicate the passed-in type is allowed to be more narrow
  // (it's runtime type still can't though)
  // This is useful for pattern-matching, because during pattern matching, you're trying to find more information
  // about the passed-in type, e.g. `match value as #{} when { x: X } ...`
  // this may cause incomingType to be set to the missingType sentinel, because no type information was found,
  // because the incomingType was more narrow.
  readonly typeCheck: (state: TypeState.TypeState, opts: AssignmentTargetNodeTypeCheckOpts) => AssignmentTargetNodeTypeCheckReturnType
  // This gets used when the RHS is not immediately known, e.g. a function parameter list.
  readonly contextlessTypeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType }
}

export function create<Context>({ name, pos, data = undefined, exec, typeCheck }: NodeOpts<Context>): Node {
  let typeCheckRan = false
  let context: Context | null = null
  return {
    name,
    pos,
    data,
    exec(rt: Runtime.Runtime) {
      if (!typeCheckRan) throw new Error('INTERNAL ERROR: You must run type check first.')
      return exec(rt, { typeCheckContext: context })
    },
    typeCheck(state: TypeState.TypeState) {
      if (typeCheckRan) throw new Error('INTERNAL ERROR: Can not run type check multiple times.')
      const { respState, type, typeCheckContext = null } = typeCheck(state)
      typeCheckRan = true
      context = typeCheckContext
      return { respState, type }
    },
  }
}

export function createInvokeNode({ name, pos, data = undefined, exec, typeCheck }: InvokeNode): InvokeNode {
  return { name, pos, data, exec, typeCheck }
}

export function createAssignmentTarget({ name, pos, exec, typeCheck, contextlessTypeCheck }: AssignmentTargetNode): AssignmentTargetNode {
  return { name, pos, exec, typeCheck, contextlessTypeCheck }
}