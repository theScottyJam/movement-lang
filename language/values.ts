import * as Value from './Value'
import * as Type from './Type'
import * as types from './types'
import type { RuntimeScope } from './Runtime'
import type { AnyAssignmentTargetNode } from '../nodes/variants/AssignmentTargetNode'
import type { AnyInstructionNode } from '../nodes/variants/InstructionNode'

export type UnitValue = Value.Value<types.UnitType, undefined>
export const createUnit = (): UnitValue => Value.create({ raw: undefined, type: types.createUnit() })

export type IntValue = Value.Value<types.IntType, bigint>
export const createInt = (n: bigint): IntValue => Value.create({ raw: n, type: types.createInt() })

export type StringValue = Value.Value<types.StringType, string>
export const createString = (raw: string) => Value.create({ raw, type: types.createString() })

export type BooleanValue = Value.Value<types.BooleanType, boolean>
export const createBoolean = (raw: boolean) => Value.create({ raw, type: types.createBoolean() })

export type SymbolValue = Value.Value<types.SymbolType, symbol>
export const createSymbol = (raw: symbol) => Value.create({ raw, type: types.createSymbol({ value: raw }) })

// Used only within the content of a private tag, to hold arbitrary information
export type InternalValue = Value.Value<types.InternalType, any>
export const createInternal = (raw: any) => Value.create({ raw, type: types.createInternal() })

export type TypeContainerValue = Value.Value<types.TypeContainerType, undefined>
export const createTypeContainer = (type: Type.AnyType) => Value.create({ raw: undefined, type })

export type TagValue = Value.Value<types.TagType, undefined>
export const createTag = (type: types.TagType) => Value.create({ raw: undefined, type })

export type TaggedValue = Value.Value<types.TaggedType, Value.AnyValue>
export const createTagged = (content: Value.AnyValue, type: types.TaggedType) => Value.create({ raw: content, type })

interface RawRecordValue { nameToValue: Map<string, Value.AnyValue>, symbolToValue: Map<symbol, Value.AnyValue> }
export type RecordValue = Value.Value<types.RecordType, RawRecordValue>
export const createRecord = (raw: RawRecordValue, type: types.RecordType) => Value.create({ raw, type })

interface RawFunctionValue { capturedScope: RuntimeScope[], params: AnyAssignmentTargetNode[], body: AnyInstructionNode }
export type FunctionValue = Value.Value<types.FunctionType, RawFunctionValue>
export const createFunction = (raw: RawFunctionValue, type: types.FunctionType) => Value.create({ raw, type })