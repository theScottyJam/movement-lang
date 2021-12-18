import type { Token } from 'moo'
import * as InstructionNode from './variants/InstructionNode';
import * as TypeNode from './variants/TypeNode';
import { SemanticError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY } from '../language/constants'

type AnyTypeNode = TypeNode.AnyTypeNode
type AnyInstructionNode = InstructionNode.AnyInstructionNode
type Position = Position.Position
type TypeState = TypeState.TypeState
type AnyType = Type.AnyType

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

type ValueOf<T> = T[keyof T]

const mapMapValues = (map, mapFn) => (
  new Map([...map.entries()].map(([key, value]) => [key, mapFn(value)]))
)

interface SimpleTypePayload { typeName: string }
export const simpleType = (pos: Position, { typeName }: SimpleTypePayload) =>
  TypeNode.create<SimpleTypePayload>('simpleType', pos, { typeName })

TypeNode.register<SimpleTypePayload>('simpleType', {
  typeCheck: (state, { pos, typeName }) => {
    const type = {
      '#unit': () => types.createUnit(),
      '#int': () => types.createInt(),
      '#string': () => types.createString(),
      '#boolean': () => types.createBoolean(),
      '#never': () => types.createNever(),
      '#unknown': () => types.createUnknown(),
    }[typeName]?.()

    if (type == null) throw new SemanticError(`Invalid built-in type ${typeName}`, pos)

    return { respState: RespState.create(), type }
  },
})

interface UserTypeLookupPayload { typeName: string }
export const userTypeLookup = (pos: Position, { typeName }: UserTypeLookupPayload) =>
  TypeNode.create<UserTypeLookupPayload>('userTypeLookup', pos, { typeName })

TypeNode.register<UserTypeLookupPayload>('userTypeLookup', {
  typeCheck: (state, { pos, typeName }) => {
    const typeInfo = TypeState.lookupType(state, typeName)
    if (!typeInfo) throw new SemanticError(`Type "${typeName}" not found.`, pos)
    return {
      respState: RespState.create(),
      type: Type.withName(typeInfo.createType(), typeName),
    }
  },
})

interface EvaluateExprTypePayload { expr: AnyInstructionNode }
export const evaluateExprType = (pos: Position, { expr }: EvaluateExprTypePayload) =>
  TypeNode.create<EvaluateExprTypePayload>('evaluateExprType', pos, { expr })

TypeNode.register<EvaluateExprTypePayload>('evaluateExprType', {
  typeCheck: (state, { pos, expr }) => {
    const { respState, type } = InstructionNode.typeCheck(expr, state)
    return {
      respState: RespState.update(respState, {
        // Since we're never going to execute this instruction node,
        // it won't have real runtime dependencies on outer function variables.
        outerFnVars: [],
      }),
      type: Type.getTypeMatchingDescendants(type, pos)
    }
  },
})

interface RecordTypePayload { nameToTypeNode: Map<string, AnyTypeNode> }
export const recordType = (pos: Position, { nameToTypeNode }: RecordTypePayload) =>
  TypeNode.create<RecordTypePayload>('recordType', pos, { nameToTypeNode })

TypeNode.register<RecordTypePayload>('recordType', {
  typeCheck: (state, { nameToTypeNode }) => {
    const typeCheckResponses = mapMapValues(nameToTypeNode, typeNode => TypeNode.typeCheck(typeNode, state))

    return {
      respState: RespState.merge(...Object.values(typeCheckResponses).map(resp => resp.respState)),
      type: types.createRecord({ nameToType: mapMapValues(typeCheckResponses, resp => resp.type) })
    }
  },
})

interface FunctionTypePayload {
  readonly purity: ValueOf<typeof PURITY>
  readonly genericParamDefList: {
    identifier: string,
    constraintNode: AnyTypeNode,
    identPos: Position,
  }[]
  readonly paramTypeNodes: AnyTypeNode[]
  readonly bodyTypeNode: AnyTypeNode
}
export const functionType = (pos: Position, { purity, genericParamDefList, paramTypeNodes, bodyTypeNode }: FunctionTypePayload) =>
  TypeNode.create<FunctionTypePayload>('functionType', pos, { purity, genericParamDefList, paramTypeNodes, bodyTypeNode })

TypeNode.register<FunctionTypePayload>('functionType', {
  typeCheck: (state, { purity, genericParamDefList, paramTypeNodes, bodyTypeNode }) => {
    const constraints = []
    const respStates = []
    for (const { identifier, constraintNode, identPos } of genericParamDefList) {
      const { respState, type: constraint__ } = TypeNode.typeCheck(constraintNode, state) //!! RespState
      respStates.push(respState)
      const constraint_ = Type.assertIsConcreteType(constraint__) // FIXME: I don't see why this has to be a concrete type. Try writing a unit test to test an outer function's type param used in an inner function type definition.
      const constraint = Type.createParameterType({
        constrainedBy: constraint_,
        parameterName: constraint_.reprOverride ?? 'UNKNOWN' // TODO: This parameterName was probably a bad idea.
      })
      constraints.push(constraint)
      state = TypeState.addToTypeScope(state, identifier, () => constraint, identPos)
    }

    const paramResponses = paramTypeNodes.map(paramTypeNode => TypeNode.typeCheck(paramTypeNode, state)) //!! RespState
    respStates.push(...paramResponses.map(resp => resp.respState))
    const bodyTypeResp = TypeNode.typeCheck(bodyTypeNode, state)
    respStates.push(bodyTypeResp.respState)

    return {
      respState: RespState.merge(...respStates),
      type: types.createFunction({
        paramTypes: paramResponses.map(resp => resp.type),
        genericParamTypes: constraints,
        bodyType: bodyTypeResp.type,
        purity,
      })
    }
  },
})

// Mainly intended as a convenience for constructing the stdLib.
interface nodeFromTypeGetterFnPayload { typeGetter: (state: TypeState) => AnyType }
export const nodeFromTypeGetter = (pos: Position, { typeGetter }: nodeFromTypeGetterFnPayload) =>
  TypeNode.create<nodeFromTypeGetterFnPayload>('customTypeNode', pos, { typeGetter })

TypeNode.register<nodeFromTypeGetterFnPayload>('customTypeNode', {
  typeCheck: (state, { typeGetter }) => {
    return {
      respState: RespState.create(),
      type: typeGetter(state)
    }
  },
})