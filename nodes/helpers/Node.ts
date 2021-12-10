import * as Position from '../../language/Position'
import * as Runtime from '../../language/Runtime'
import * as Value from '../../language/Value'
import * as TypeState from '../../language/TypeState'
import * as RespState from '../../language/RespState'
import * as Type from '../../language/Type'
import { PURITY } from '../../language/constants'

type ValueOf<T> = T[keyof T]

export interface Node {
  readonly name: string
  readonly pos?: Position.Position
  readonly data?: unknown
  readonly exec: (rt: Runtime.Runtime) => Value.AnyValue
  readonly typeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType }
}

interface NodeOpts<T> {
  readonly name: string
  readonly pos?: Position.Position
  readonly data?: unknown
  readonly exec: (rt: Runtime.Runtime, { typeCheckContext }: { typeCheckContext: T }) => Value.AnyValue
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
interface AssignmentTargetNodeTypeCheckOpts { incomingType: Type.AnyType | typeof missingType, allowWidening?: boolean }
interface AssignmentTargetNodeTypeCheckReturnType { respState: RespState.RespState }
export interface AssignmentTargetNode {
  readonly name: string
  readonly pos?: Position.Position
  readonly exec: (rt: Runtime.Runtime, opts: AssignmentTargetNodeExecOpts) => AssignmentTargetNodeExecReturnType
  // TODO: Rename these fields to something better?
  readonly typeCheck: (state: TypeState.TypeState, opts: AssignmentTargetNodeTypeCheckOpts) => AssignmentTargetNodeTypeCheckReturnType
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