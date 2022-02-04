import * as InstructionNode from './variants/InstructionNode';
import * as TypeNode from './variants/TypeNode';
import * as AssignmentTargetNode from './variants/AssignmentTargetNode';
import { assertNotNullish } from './helpers/typeAssertions';
import { BadSyntaxError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as RtRespState from '../language/RtRespState'
import * as values from '../language/values'
import * as Type from '../language/Type'
import * as types from '../language/types'
import * as InwardTypeState from '../language/InwardTypeState'
import { PURITY } from '../language/constants'
import { pipe } from '../util'

type AnyInstructionNode = InstructionNode.AnyInstructionNode
type AnyAssignmentTargetNode = AssignmentTargetNode.AnyAssignmentTargetNode
type AnyTypeNode = TypeNode.AnyTypeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type AnyType = Type.AnyType
type InwardTypeState = InwardTypeState.InwardTypeState

type purityTypes = typeof PURITY[keyof typeof PURITY]

interface GenericParamDefinition {
  readonly identifier: string
  readonly constraintNode: AnyTypeNode
  readonly identPos: Position
}

interface IntPayload { value: bigint }
export const int = (pos: Position, payload: IntPayload) =>
  InstructionNode.create<IntPayload>('int', pos, payload)

InstructionNode.register<IntPayload, {}>('int', {
  exec: (rt, { value }) => ({ rtRespState: RtRespState.create(), value: values.createInt(value) }),
  typeCheck: (actions, inwardState) => () => ({ type: types.createInt() }),
})

export const parseEscapeSequences = (rawStr: string, pos: Position) => {
  let value = ''
  let inEscape = false
  for (const c of rawStr) {
    if (c === '\\') {
      if (inEscape) value += '\\'
      inEscape = !inEscape
      continue
    }

    if (inEscape) {
      if (c === '0') value += '\0'
      else if (c === "'") value += "'"
      else if (c === '"') value += '"'
      else if (c === 'n') value += '\n'
      else if (c === 'r') value += '\r'
      else if (c === 't') value += '\t'
      else throw new BadSyntaxError(`Unrecognized string escape sequence "\\${c}".`, pos)
      inEscape = false
    } else {
      value += c
    }
  }
  return value
}

interface StringPayload { value: string }
interface StringOpts { uninterpretedValue: string }
export const string = (pos: Position, { uninterpretedValue }: StringOpts) =>
  InstructionNode.create<StringPayload>('string', pos, {
    value: parseEscapeSequences(uninterpretedValue, pos),
  })

InstructionNode.register<StringPayload, {}>('string', {
  exec: (rt, { value }) => ({ rtRespState: RtRespState.create(), value: values.createString(value) }),
  typeCheck: (actions, inwardState) => ({ value }) => ({ type: types.createString() }),
})

interface BooleanPayload { value: boolean }
export const boolean = (pos: Position, payload: BooleanPayload) =>
  InstructionNode.create<BooleanPayload>('boolean', pos, payload)

InstructionNode.register<BooleanPayload, {}>('boolean', {
  exec: (rt, { value }) => ({ rtRespState: RtRespState.create(), value: values.createBoolean(value) }),
  typeCheck: (actions, inwardState) => ({ value }) => ({ type: types.createBoolean() }),
})

interface TypeContainerPayload { name?: string | null, typeNode: AnyTypeNode }
interface TypeContainerTypePayload { type: Type.AnyType }
export const typeContainer = (pos: Position, payload: TypeContainerPayload) =>
  InstructionNode.create<TypeContainerPayload>('typeContainer', pos, payload)

InstructionNode.register<TypeContainerPayload, TypeContainerTypePayload>('typeContainer', {
  exec: (rt, { type }) => ({
    rtRespState: RtRespState.create(),
    value: values.createTypeContainer(type),
  }),
  typeCheck: (actions, inwardState) => ({ name, typeNode }) => {
    const { type: containedType } = actions.checkType(TypeNode, typeNode, inwardState)
    const type = types.createTypeContainer({
      containerSentinel: Symbol('type container'),
      containedType: name
        ? Type.withName(containedType, name)
        : containedType,
    })
    return {
      type,
      typePayload: { type }
    }
  },
})

// TODO: Use genericParamDefList
interface TagPayload { genericParamDefList: GenericParamDefinition[], typeNode: AnyTypeNode, name?: string | null }
interface TagTypePayload { type: types.TagType }
export const tag = (pos: Position, payload: TagPayload) =>
  InstructionNode.create<TagPayload>('tag', pos, payload)

InstructionNode.register<TagPayload, TagTypePayload>('tag', {
  exec: (rt, { type }) => ({
    rtRespState: RtRespState.create(),
    value: values.createTag(type),
  }),
  typeCheck: (actions, inwardState) => ({ name, typeNode }) => {
    const { type: boxedType } = actions.checkType(TypeNode, typeNode, inwardState)
    const type = types.createTag({
      tagSentinel: Symbol('tag'),
      boxedType,
      name,
    })
    return {
      type,
      typePayload: { type }
    }
  },
})

interface RecordPayload { name: string | null }
interface SymbolTypePayload { type: types.SymbolType }
export const symbol = (pos: Position, payload: RecordPayload) =>
  InstructionNode.create<RecordPayload>('symbol', pos, payload)

InstructionNode.register<RecordPayload, SymbolTypePayload>('symbol', {
  exec: (rt, { type }) => ({
    rtRespState: RtRespState.create(),
    value: values.createSymbol(type.data.value),
  }),
  typeCheck: (actions, inwardState) => ({ name }) => {
    const type = types.createSymbol({ name })
    return {
      type,
      typePayload: { type }
    }
  },
})

interface RecordValueDescription { target: AnyInstructionNode, maybeRequiredTypeNode: AnyTypeNode | null }
interface RecordPayload { content: Map<string, RecordValueDescription> }
interface RecordTypePayload { finalType: types.RecordType }
export const record = (pos: Position, payload: RecordPayload) =>
  InstructionNode.create<RecordPayload>('record', pos, payload)

InstructionNode.register<RecordPayload, RecordTypePayload>('record', {
  exec: (rt, { content, finalType }) => {
    const nameToValue = new Map()
    const rtRespStates = []
    for (const [name, { target }] of content) {
      const { rtRespState, value } = InstructionNode.exec(target, rt)
      rtRespStates.push(rtRespState)
      nameToValue.set(name, value)
    }

    return {
      rtRespState: RtRespState.merge(...rtRespStates),
      value: values.createRecord(nameToValue, assertNotNullish(finalType))
    }
  },
  typeCheck: (actions, inwardState) => ({ content }) => {
    const nameToType = new Map<string, AnyType>()
    for (const [name, { target, maybeRequiredTypeNode }] of content) {
      const targetType = actions.checkType(InstructionNode, target, inwardState).type
      const maybeRequiredType = maybeRequiredTypeNode ? actions.checkType(TypeNode, maybeRequiredTypeNode, inwardState).type : null
      if (maybeRequiredType) {
        Type.assertTypeAssignableTo(targetType, maybeRequiredType, target.pos)
      }
      const finalType = maybeRequiredType ?? targetType
      nameToType.set(name, finalType)
    }
    const finalType = types.createRecord({ nameToType })
    return { type: finalType, typePayload: { finalType } }
  },
})

interface FunctionPayload {
  params: AnyAssignmentTargetNode[]
  body: AnyInstructionNode
  maybeBodyTypeNode: AnyTypeNode | null
  purity: purityTypes
  genericParamDefList: GenericParamDefinition[]
  posWithoutBody: Position
}
interface FunctionTypePayload {
  finalType: types.FunctionType,
  capturedStates: readonly string[]
}
export const function_ = (pos: Position, payload: FunctionPayload) =>
  InstructionNode.create<FunctionPayload>('function', pos, payload)

InstructionNode.register<FunctionPayload, FunctionTypePayload>('function', {
  exec: (rt, { params, body, finalType, capturedStates }) => ({
    rtRespState: RtRespState.create(),
    value: values.createFunction(
      {
        params,
        body,
        capturedScope: capturedStates.map(identifier => ({ identifier, value: Runtime.lookupVar(rt, identifier) })),
      },
      assertNotNullish(finalType),
    )
  }),
  typeCheck: (actions, inwardState_) => ({ params, body, maybeBodyTypeNode, purity, genericParamDefList, posWithoutBody }) => {
    type WrapParams<T> = [
      Parameters<typeof actions.withFunctionDefinition>[0],
      (inwardState: InwardTypeState) => T,
    ]
    const wrap = <T>(...[withFunctionDefinitionOpts, callback]: WrapParams<T>) => (
      actions.follow.withScope({ forFn: Symbol() }, () => (
        actions.withFunctionDefinition(withFunctionDefinitionOpts, callback)
      ))
    )
    
    const { finalType, capturedStates } = wrap({ inwardState: inwardState_, minPurity: purity }, inwardState => {
      // Adding generic params to type scope
      const genericParamTypes = []
      for (const { identifier, constraintNode, identPos } of genericParamDefList) {
        const constraint = pipe(
          actions.checkType(TypeNode, constraintNode, inwardState).type,
          $=> Type.assertIsConcreteType($), // TODO: I don't see why this has to be a concrete type. Try writing a unit test to test an outer function's type param used in an inner function definition.
          $=> Type.createParameterType({
            constrainedBy: $,
            parameterName: $.reprOverride ?? 'UNKNOWN', // TODO: This UNKNOWN type shouldn't be a thing. Perhaps I shouldn't have had this parameterName idea.
          })
        )
        genericParamTypes.push(constraint)
        actions.follow.addToScopeInTypeNamespace(identifier, () => constraint, identPos)
      }

      // Validating parameters
      const paramTypes = []
      for (const param of params) {
        const { type } = actions.checkType(AssignmentTargetNode, param, inwardState, {
          incomingType: AssignmentTargetNode.noTypeIncoming,
          export: false,
        })
        paramTypes.push(type)
      }

      // Type checking body
      const { respState: bodyRespState, type: bodyType } = actions.checkType(InstructionNode, body, inwardState)

      // Getting declared body type
      const requiredBodyType = maybeBodyTypeNode ? actions.checkType(TypeNode, maybeBodyTypeNode, inwardState).type : null
      if (requiredBodyType) Type.assertTypeAssignableTo(bodyType, requiredBodyType, posWithoutBody, `This function can return type ${Type.repr(bodyType)} but type ${Type.repr(requiredBodyType)} was expected.`)

      // Checking if calculated return types line up with declared body type
      if (requiredBodyType) {
        for (const { type, pos } of bodyRespState.returnTypes) {
          Type.assertTypeAssignableTo(type, requiredBodyType, pos)
        }
      }

      // Finding widest return type
      const allReturnTypes = [...bodyRespState.returnTypes.map(typeInfo => typeInfo.type), bodyType]
        .filter(type => !types.isEffectivelyNever(type))
      const returnType = requiredBodyType ?? (
        allReturnTypes.length === 0 // true when all paths lead to #never (and got filtered out)
          ? types.createNever()
          : Type.getWiderType(allReturnTypes, 'Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation.', posWithoutBody)
      )

      const finalType = types.createFunction({
        paramTypes,
        genericParamTypes,
        bodyType: returnType,
        purity,
      })

      return { finalType, capturedStates: bodyRespState.outerFnVars }
    })

    return {
      type: finalType,
      typePayload: { finalType, capturedStates }
    }
  },
})
