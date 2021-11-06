import * as Node from './helpers/Node.js';
import { assertNotNullish } from './helpers/typeAssertions.js';
import { BadSyntaxError, SemanticError } from '../language/exceptions.js'
import * as Position from '../language/Position.js'
import * as Runtime from '../language/Runtime.js'
import * as values from '../language/values.js'
import * as TypeState from '../language/TypeState.js'
import * as RespState from '../language/RespState.js'
import * as Type from '../language/Type.js'
import * as types from '../language/types.js'
import { PURITY } from '../language/constants.js'

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
  pos,
  exec: rt => values.createInt(value),
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
    pos,
    exec: rt => values.createString(value),
    typeCheck: state => ({ respState: RespState.create(), type: types.createString() }),
  })
}

interface BooleanOpts { value: boolean }
export const boolean = (pos: Position, { value }: BooleanOpts) => Node.create({
  pos,
  exec: rt => values.createBoolean(value),
  typeCheck: state => ({ respState: RespState.create(), type: types.createBoolean() }),
})

interface RecordValueDescription { target: Node, requiredTypeGetter: TypeGetter, typeGetterPos: Position }
interface RecordOpts { content: Map<string, RecordValueDescription> }
export const record = (pos: Position, { content }: RecordOpts) => {
  let finalType: types.RecordType | null
  return Node.create({
    pos,
    exec: rt => {
      const nameToValue = new Map()
      for (const [name, { target }] of content) {
        nameToValue.set(name, target.exec(rt))
      }
      return values.createRecord(nameToValue, assertNotNullish(finalType))
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
  pos,
  exec: (rt, { typeCheckContext: { finalType, capturedStates } }) => values.createFunction(
    {
      params,
      body,
      capturedScope: capturedStates.map(identifier => ({ identifier, value: Runtime.lookupVar(rt, identifier) })),
    },
    assertNotNullish(finalType),
  ),
  typeCheck: outerState => {
    let state = TypeState.create({
      scopes: [...outerState.scopes, new Map()],
      definedTypes: [...outerState.definedTypes, new Map()],
      minPurity: purity,
      isBeginBlock: false,
    })

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

    const paramTypes = []
    const respStates = []
    for (const param of params) {
      const { respState, type } = param.contextlessTypeCheck(state)
      paramTypes.push(type)
      respStates.push(RespState.update(respState, { declarations: [] }))
      state = TypeState.applyDeclarations(state, respState)
    }
    const { respState: bodyRespState, type: bodyType } = body.typeCheck(state)
    const requiredBodyType = getBodyType ? getBodyType(state, bodyTypePos) : null
    if (requiredBodyType) Type.assertTypeAssignableTo(bodyType, requiredBodyType, pos, `This function can returns type ${Type.repr(bodyType)} but type ${Type.repr(requiredBodyType)} was expected.`)
    const capturedStates = bodyRespState.outerScopeVars

    if (requiredBodyType) {
      for (const { type, pos } of bodyRespState.returnTypes) {
        Type.assertTypeAssignableTo(type, requiredBodyType, pos)
      }
    }

    const returnType = requiredBodyType ?? bodyRespState.returnTypes.reduce((curType, returnType) => {
      if (Type.isTypeAssignableTo(curType, returnType.type)) return curType
      if (Type.isTypeAssignableTo(returnType.type, curType)) return returnType.type
      throw new SemanticError(`This return has the type "${Type.repr(returnType.type)}", which is incompatible with another possible return types from this function, "${Type.repr(curType)}".`, returnType.pos)
    }, bodyType)

    const finalType = types.createFunction({
      paramTypes,
      genericParamTypes,
      bodyType: returnType,
      purity,
    })

    const finalRespState = RespState.merge(...respStates, bodyRespState)
    const newOuterScopeVars = finalRespState.outerScopeVars.filter(ident => TypeState.lookupVar(outerState, ident).fromOuterScope)
    return {
      respState: RespState.update(finalRespState, { outerScopeVars: newOuterScopeVars }),
      type: finalType,
      typeCheckContext: { finalType, capturedStates }
    }
  },
})
