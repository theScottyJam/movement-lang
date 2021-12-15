import * as Node from './helpers/Node';
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

type Node = Node.Node
type AssignmentTargetNode = Node.AssignmentTargetNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

type purityTypes = typeof PURITY[keyof typeof PURITY]
type TypeGetter = (TypeState, Position) => AnyType
type ConcreteTypeGetter = (TypeState, Position) => Type.AnyConcreteType

interface IntOpts { value: bigint }
export const int = (pos: Position, { value }: IntOpts) => Node.create({
  name: 'int',
  pos,
  exec: rt => ({ rtRespState: RtRespState.create(), value: values.createInt(value) }),
  typeCheck: state => ({ respState: RespState.create(), type: types.createInt() }),
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

interface StringOpts { uninterpretedValue: string }
export const string = (pos: Position, { uninterpretedValue }: StringOpts) => {
  const value = parseEscapeSequences(uninterpretedValue, pos)
  return Node.create({
    name: 'string',
    pos,
    data: { value },
    exec: rt => ({ rtRespState: RtRespState.create(), value: values.createString(value) }),
    typeCheck: state => ({ respState: RespState.create(), type: types.createString() }),
  })
}

interface BooleanOpts { value: boolean }
export const boolean = (pos: Position, { value }: BooleanOpts) => Node.create({
  name: 'boolean',
  pos,
  exec: rt => ({ rtRespState: RtRespState.create(), value: values.createBoolean(value) }),
  typeCheck: state => ({ respState: RespState.create(), type: types.createBoolean() }),
})

interface RecordValueDescription { target: Node, requiredTypeGetter: TypeGetter, typeGetterPos: Position }
interface RecordOpts { content: Map<string, RecordValueDescription> }
export const record = (pos: Position, { content }: RecordOpts) => {
  let finalType: types.RecordType | null
  return Node.create({
    name: 'record',
    pos,
    exec: rt => {
      const nameToValue = new Map()
      const rtRespStates = []
      for (const [name, { target }] of content) {
        const { rtRespState, value } = target.exec(rt)
        rtRespStates.push(rtRespState)
        nameToValue.set(name, value)
      }

      return {
        rtRespState: RtRespState.merge(...rtRespStates),
        value: values.createRecord(nameToValue, assertNotNullish(finalType))
      }
    },
    typeCheck: state => {
      const nameToType = new Map<string, AnyType>()
      const respStates = []
      for (const [name, { target, requiredTypeGetter, typeGetterPos }] of content) {
        const { respState, type } = target.typeCheck(state)
        respStates.push(respState)
        const requiredType = requiredTypeGetter ? requiredTypeGetter(state, typeGetterPos) : null
        if (requiredType) Type.assertTypeAssignableTo(type, requiredType, target.pos)
        const finalType = requiredType ? requiredType : type
        nameToType.set(name, finalType)
      }
      finalType = types.createRecord({ nameToType })
      return { respState: RespState.merge(...respStates), type: finalType }
    },
  })
}

interface GenericParamDefinition {
  identifier: string
  getConstraint: ConcreteTypeGetter
  identPos: Position
  constraintPos: Position
}
interface FunctionOpts {
  params: AssignmentTargetNode[]
  body: Node
  getBodyType: TypeGetter
  bodyTypePos: Position
  purity: purityTypes
  genericParamDefList: GenericParamDefinition[]
}
interface FunctionTypeContext { finalType: types.FunctionType, capturedStates: readonly string[] }
export const function_ = (pos: Position, { params, body, getBodyType, bodyTypePos, purity, genericParamDefList }: FunctionOpts) => Node.create<FunctionTypeContext>({
  name: 'function',
  pos,
  exec: (rt, { typeCheckContext: { finalType, capturedStates } }) => ({
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
  typeCheck: outerState => {
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
    for (const { identifier, getConstraint, identPos, constraintPos } of genericParamDefList) {
      const constraint_ = getConstraint(state, constraintPos)
      const constraint = Type.createParameterType({
        constrainedBy: constraint_,
        parameterName: constraint_.reprOverride ?? 'UNKNOWN', // TODO: This UNKNOWN type shouldn't be a thing. Perhaps I shouldn't have had this parameterName idea.
      })
      genericParamTypes.push(constraint)
      state = TypeState.addToTypeScope(state, identifier, () => constraint, identPos)
    }

    // Validating parameters
    const paramTypes = []
    const respStates = []
    for (const param of params) {
      const { respState, type } = param.contextlessTypeCheck(state)
      paramTypes.push(type)
      respStates.push(RespState.update(respState, { declarations: [] }))
      state = TypeState.applyDeclarations(state, respState)
    }

    // Type checking body
    const { respState: bodyRespState, type: bodyType } = body.typeCheck(state)

    // Getting declared body type
    const requiredBodyType = getBodyType ? getBodyType(state, bodyTypePos) : null
    if (requiredBodyType) Type.assertTypeAssignableTo(bodyType, requiredBodyType, pos, `This function can return type ${Type.repr(bodyType)} but type ${Type.repr(requiredBodyType)} was expected.`)
    const capturedStates = bodyRespState.outerFnVars

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
      typeCheckContext: { finalType, capturedStates }
    }
  },
})
