import * as Position from '../../language/Position'
import * as Runtime from '../../language/Runtime'
import * as Value from '../../language/Value'
import * as TypeState from '../../language/TypeState'
import * as RespState from '../../language/RespState'
import * as Type from '../../language/Type'
import { PURITY } from '../../language/constants'

type ValueOf<T> = T[keyof T]

export interface Node {
  readonly pos?: Position.Position
  readonly data?: unknown
  readonly exec: (rt: Runtime.Runtime) => Value.AnyValue
  readonly typeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType }
}

interface InvokeNodeTypeCheckOpts { callWithPurity?: ValueOf<typeof PURITY> }
interface InvokeNodeTypeCheckReturnValue { respState: RespState.RespState, type: Type.AnyType }
export interface InvokeNode extends Omit<Node, 'typeCheck'> {
  readonly typeCheck: (state: TypeState.TypeState, opts?: InvokeNodeTypeCheckOpts) => InvokeNodeTypeCheckReturnValue
}

export const undeterminedType = Symbol('Undetermined Type')

interface AssignmentTargetNodeExecOpts { incomingValue: Value.AnyValue, allowFailure?: boolean }
type AssignmentTargetNodeExecReturnType = { identifier: string, value: Value.AnyValue }[]
interface AssignmentTargetNodeTypeCheckOpts { incomingType: Type.AnyType | typeof undeterminedType, allowWidening?: boolean }
interface AssignmentTargetNodeTypeCheckReturnType { respState: RespState.RespState }
export interface AssignmentTargetNode {
  readonly pos?: Position.Position
  readonly exec: (rt: Runtime.Runtime, opts: AssignmentTargetNodeExecOpts) => AssignmentTargetNodeExecReturnType
  // TODO: Rename these fields to something better?
  readonly typeCheck: (state: TypeState.TypeState, opts: AssignmentTargetNodeTypeCheckOpts) => AssignmentTargetNodeTypeCheckReturnType
  readonly contextlessTypeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType }
}

export function create({ pos, data = undefined, exec, typeCheck }: Node): Node {
  return { pos, data, exec, typeCheck }
}

export function createInvokeNode({ pos, data = undefined, exec, typeCheck }: InvokeNode): InvokeNode {
  return { pos, data, exec, typeCheck }
}

export function createAssignmentTarget({ pos, exec, typeCheck, contextlessTypeCheck }: AssignmentTargetNode): AssignmentTargetNode {
  return { pos, exec, typeCheck, contextlessTypeCheck }
}