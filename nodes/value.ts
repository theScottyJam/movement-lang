import * as InstructionNode from './variants/InstructionNode';
import * as TypeNode from './variants/TypeNode';
import * as AssignmentTargetNode from './variants/AssignmentTargetNode';
import { assertNotNullish } from './helpers/typeAssertions';
import { BadSyntaxError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as RtRespState from '../language/RtRespState'
import * as values from '../language/values'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY } from '../language/constants'

type AnyInstructionNode = InstructionNode.AnyInstructionNode
type AnyAssignmentTargetNode = AssignmentTargetNode.AnyAssignmentTargetNode
type AnyTypeNode = TypeNode.AnyTypeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

type purityTypes = typeof PURITY[keyof typeof PURITY]

interface GenericParamDefinition {
  readonly identifier: string
  readonly constraintNode: AnyTypeNode
  readonly identPos: Position
}

interface IntPayload { value: bigint }
export const int = (pos: Position, { value }: IntPayload) =>
  InstructionNode.create<IntPayload, {}>('int', pos, { value })

InstructionNode.register<IntPayload, {}>('int', {
  exec: (rt, { value }) => ({ rtRespState: RtRespState.create(), value: values.createInt(value) }),
  typeCheck: (state, { value }) => ({ respState: RespState.create(), type: types.createInt() }),
})

const parseEscapeSequences = (rawStr: string, pos: Position) => {
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
export const string = (pos: Position, { uninterpretedValue }: StringOpts) => InstructionNode.create<StringPayload, {}>('string', pos, {
  value: parseEscapeSequences(uninterpretedValue, pos),
})

InstructionNode.register<StringPayload, {}>('string', {
  exec: (rt, { value }) => ({ rtRespState: RtRespState.create(), value: values.createString(value) }),
  typeCheck: (state, { value }) => ({ respState: RespState.create(), type: types.createString() }),
})

interface BooleanPayload { value: boolean }
export const boolean = (pos: Position, { value }: BooleanPayload) =>
  InstructionNode.create<BooleanPayload, {}>('boolean', pos, { value })

InstructionNode.register<BooleanPayload, {}>('boolean', {
  exec: (rt, { value }) => ({ rtRespState: RtRespState.create(), value: values.createBoolean(value) }),
  typeCheck: (state, { value }) => ({ respState: RespState.create(), type: types.createBoolean() }),
})

// TODO: Use genericParamDefList
interface TagPayload { genericParamDefList: GenericParamDefinition[], typeNode: AnyTypeNode }
interface TagTypePayload { type: types.TagType }
export const tag = (pos: Position, { genericParamDefList, typeNode }: TagPayload) =>
  InstructionNode.create<TagPayload, TagTypePayload>('tag', pos, { genericParamDefList, typeNode })

InstructionNode.register<TagPayload, TagTypePayload>('tag', {
  exec: (rt, { type }) => ({
    rtRespState: RtRespState.create(),
    value: values.createTag(type),
  }),
  typeCheck: (state, { typeNode }) => {
    const { respState, type: boxedType } = TypeNode.typeCheck(typeNode, state)
    const type = types.createTag({
      tagSentinel: Symbol('tag'),
      boxedType,
    })
    return {
      respState: respState,
      type,
      typePayload: { type }
    }
  },
})

interface RecordValueDescription { target: AnyInstructionNode, maybeRequiredTypeNode: AnyTypeNode | null }
interface RecordPayload { content: Map<string, RecordValueDescription> }
interface RecordTypePayload { finalType: types.RecordType }
export const record = (pos: Position, { content }: RecordPayload) =>
  InstructionNode.create<RecordPayload, RecordTypePayload>('record', pos, { content })

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
  typeCheck: (state, { content }) => {
    const nameToType = new Map<string, AnyType>()
    const respStates = []
    for (const [name, { target, maybeRequiredTypeNode }] of content) {
      const { respState, type } = InstructionNode.typeCheck(target, state)
      respStates.push(respState)
      const maybeRequiredTypeResp = maybeRequiredTypeNode ? TypeNode.typeCheck(maybeRequiredTypeNode, state) : null
      if (maybeRequiredTypeResp) {
        respStates.push(maybeRequiredTypeResp.respState)
        Type.assertTypeAssignableTo(type, maybeRequiredTypeResp.type, target.pos)
      }
      const finalType = maybeRequiredTypeResp ? maybeRequiredTypeResp.type : type
      nameToType.set(name, finalType)
    }
    const finalType = types.createRecord({ nameToType })
    return { respState: RespState.merge(...respStates), type: finalType, typePayload: { finalType } }
  },
})

interface FunctionPayload {
  params: AnyAssignmentTargetNode[]
  body: AnyInstructionNode
  maybeBodyTypeNode: AnyTypeNode | null
  purity: purityTypes
  genericParamDefList: GenericParamDefinition[]
}
interface FunctionTypePayload {
  finalType: types.FunctionType,
  capturedStates: readonly string[]
}
export const function_ = (pos: Position, { params, body, maybeBodyTypeNode, purity, genericParamDefList }: FunctionPayload) =>
  InstructionNode.create<FunctionPayload, FunctionTypePayload>('function', pos, { params, body, maybeBodyTypeNode, purity, genericParamDefList })

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
  typeCheck: (outerState, { pos, params, body, maybeBodyTypeNode, purity, genericParamDefList }) => {
    let state = TypeState.create({
      scopes: [...outerState.scopes, { forFn: Symbol(), typeLookup: new Map() }],
      definedTypes: [...outerState.definedTypes, new Map()],
      minPurity: purity,
      isBeginBlock: false,
      behaviors: outerState.behaviors,
      isMainModule: outerState.isMainModule,
      moduleDefinitions: outerState.moduleDefinitions,
      moduleShapes: outerState.moduleShapes,
      importStack: outerState.importStack,
      stdLibShape: outerState.stdLibShape,
    })

    // Adding generic params to type scope
    const genericParamTypes = []
    const respStates = []
    for (const { identifier, constraintNode, identPos } of genericParamDefList) {
      const { respState, type: constraint__ } = TypeNode.typeCheck(constraintNode, state)
      respStates.push(respState)
      const constraint_ = Type.assertIsConcreteType(constraint__) // FIXME: I don't see why this has to be a concrete type. Try writing a unit test to test an outer function's type param used in an inner function definition.
      const constraint = Type.createParameterType({
        constrainedBy: constraint_,
        parameterName: constraint_.reprOverride ?? 'UNKNOWN', // TODO: This UNKNOWN type shouldn't be a thing. Perhaps I shouldn't have had this parameterName idea.
      })
      genericParamTypes.push(constraint)
      state = TypeState.addToTypeScope(state, identifier, () => constraint, identPos)
    }

    // Validating parameters
    const paramTypes = []
    for (const param of params) {
      const { respState, type } = AssignmentTargetNode.contextlessTypeCheck(param, state)
      paramTypes.push(type)
      respStates.push(RespState.update(respState, { declarations: [] }))
      state = TypeState.applyDeclarations(state, respState)
    }

    // Type checking body
    const { respState: bodyRespState, type: bodyType } = InstructionNode.typeCheck(body, state)

    // Getting declared body type
    const requiredBodyTypeResp = maybeBodyTypeNode ? TypeNode.typeCheck(maybeBodyTypeNode, state) : null
    if (requiredBodyTypeResp) Type.assertTypeAssignableTo(bodyType, requiredBodyTypeResp.type, pos, `This function can return type ${Type.repr(bodyType)} but type ${Type.repr(requiredBodyTypeResp.type)} was expected.`)
    const capturedStates = bodyRespState.outerFnVars

    // Checking if calculated return types line up with declared body type
    if (requiredBodyTypeResp) {
      respStates.push(requiredBodyTypeResp.respState)
      for (const { type, pos } of bodyRespState.returnTypes) {
        Type.assertTypeAssignableTo(type, requiredBodyTypeResp.type, pos)
      }
    }

    // Finding widest return type
    const allReturnTypes = [...bodyRespState.returnTypes.map(typeInfo => typeInfo.type), bodyType]
      .filter(type => !types.isEffectivelyNever(type))
    const returnType = requiredBodyTypeResp?.type ?? (
      allReturnTypes.length === 0 // true when all paths lead to #never (and got filtered out)
        ? types.createNever()
        : Type.getWiderType(allReturnTypes, 'Failed to find a common type among the possible return types of this function. Please provide an explicit type annotation.', pos)
    )

    const finalType = types.createFunction({
      paramTypes,
      genericParamTypes,
      bodyType: returnType,
      purity,
    })

    const finalRespState = RespState.merge(...respStates, bodyRespState)
    const newOuterScopeVars = finalRespState.outerFnVars.filter(ident => TypeState.lookupVar(outerState, ident).fromOuterFn)
    return {
      respState: RespState.update(finalRespState, { outerFnVars: newOuterScopeVars }),
      type: finalType,
      typePayload: { finalType, capturedStates }
    }
  },
})
