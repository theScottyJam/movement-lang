import * as Value from './Value'
import * as types from './types'
import type { RuntimeScope } from './Runtime'
import type { AssignmentTargetNode, Node } from '../nodes/helpers/Node' // TODO: This seems bad to import from here

export type UnitValue = Value.Value<types.UnitType, undefined>
export const createUnit = (): UnitValue => Value.create({ raw: undefined, type: types.createUnit() })

export type IntValue = Value.Value<types.IntType, bigint>
export const createInt = (n: bigint): IntValue => Value.create({ raw: n, type: types.createInt() })

export type StringValue = Value.Value<types.StringType, string>
export const createString = (raw: string) => Value.create({ raw, type: types.createString() })

export type BooleanValue = Value.Value<types.BooleanType, boolean>
export const createBoolean = (raw: boolean) => Value.create({ raw, type: types.createBoolean() })

type RawRecordValue = Map<string, Value.AnyValue>
export type RecordValue = Value.Value<types.RecordType, RawRecordValue>
export const createRecord = (raw: RawRecordValue, type: types.RecordType) => Value.create({ raw, type })

interface RawFunctionValue { capturedScope: RuntimeScope[], params: AssignmentTargetNode[], body: Node }
export type FunctionValue = Value.Value<types.FunctionType, RawFunctionValue>
export const createFunction = (raw: RawFunctionValue, type: types.FunctionType) => Value.create({ raw, type })