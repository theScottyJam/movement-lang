import * as InstructionNode from './variants/InstructionNode';
import * as TypeNode from './variants/TypeNode';
import type { Actions } from './helpers/typeCheckTools'
import { SemanticError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY } from '../language/constants'
import { pipe } from '../util'

type AnyTypeNode = TypeNode.AnyTypeNode
type AnyInstructionNode = InstructionNode.AnyInstructionNode
type Position = Position.Position
type AnyType = Type.AnyType

type ValueOf<T> = T[keyof T]

const mapMapValues = <T, U, V>(map: Map<T, U>, mapFn: (value: U) => V) => (
  new Map([...map.entries()].map(([key, value]) => [key, mapFn(value)]))
)

interface SimpleTypePayload { typeName: string }
export const simpleType = (pos: Position, payload: SimpleTypePayload) =>
  TypeNode.create<SimpleTypePayload>('simpleType', pos, payload)

TypeNode.register<SimpleTypePayload>('simpleType', {
  typeCheck: (actions, inwardState) => ({ pos, typeName }) => {
    const type = {
      '#unit': () => types.createUnit(),
      '#int': () => types.createInt(),
      '#string': () => types.createString(),
      '#boolean': () => types.createBoolean(),
      '#never': () => types.createNever(),
      '#unknown': () => types.createUnknown(),
    }[typeName]?.()

    if (type == null) throw new SemanticError(`Invalid built-in type ${typeName}`, pos)

    return { type }
  },
})

interface UserTypeLookupPayload { typeName: string }
export const userTypeLookup = (pos: Position, payload: UserTypeLookupPayload) =>
  TypeNode.create<UserTypeLookupPayload>('userTypeLookup', pos, payload)

TypeNode.register<UserTypeLookupPayload>('userTypeLookup', {
  typeCheck: (actions, inwardState) => ({ pos, typeName }) => {
    const typeInfo = actions.follow.lookupType(typeName)
    if (!typeInfo) throw new SemanticError(`Type "${typeName}" not found.`, pos)
    return {
      type: Type.withName(typeInfo.createType(), typeName),
    }
  },
})

interface EvaluateExprTypePayload { expr: AnyInstructionNode }
export const evaluateExprType = (pos: Position, payload: EvaluateExprTypePayload) =>
  TypeNode.create<EvaluateExprTypePayload>('evaluateExprType', pos, payload)

TypeNode.register<EvaluateExprTypePayload>('evaluateExprType', {
  typeCheck: (actions, inwardState) => ({ pos, expr }) => {
    const type = actions.noExecZone(() => {
      return pipe(
        actions.checkType(InstructionNode, expr, inwardState).type,
        $=> Type.getTypeMatchingDescendants($, pos)
      )
    })

    return { type }
  },
})

interface RecordTypePayload { nameToTypeNode: Map<string, AnyTypeNode> }
export const recordType = (pos: Position, payload: RecordTypePayload) =>
  TypeNode.create<RecordTypePayload>('recordType', pos, payload)

TypeNode.register<RecordTypePayload>('recordType', {
  typeCheck: (actions, inwardState) => ({ nameToTypeNode }) => {
    const nameToType = mapMapValues(nameToTypeNode, typeNode => actions.checkType(TypeNode, typeNode, inwardState).type)
    return { type: types.createRecord({ nameToType }) }
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
export const functionType = (pos: Position, payload: FunctionTypePayload) =>
  TypeNode.create<FunctionTypePayload>('functionType', pos, payload)

TypeNode.register<FunctionTypePayload>('functionType', {
  typeCheck: (actions, inwardState) => ({ purity, genericParamDefList, paramTypeNodes, bodyTypeNode }) => {
    const constraints = []
    for (const { identifier, constraintNode, identPos } of genericParamDefList) {
      const constraint = pipe(
        actions.checkType(TypeNode, constraintNode, inwardState).type,
        $=> Type.assertIsConcreteType($), // TODO: I don't see why this has to be a concrete type. Try writing a unit test to test an outer function's type param used in an inner function type definition.
        $=> Type.createParameterType({
          constrainedBy: $,
          parameterName: $.reprOverride ?? 'UNKNOWN' // TODO: This parameterName was probably a bad idea.
        })
      )
      constraints.push(constraint)
      actions.follow.addToScopeInTypeNamespace(identifier, () => constraint, identPos)
    }

    const paramTypes = paramTypeNodes.map(paramTypeNode => actions.checkType(TypeNode, paramTypeNode, inwardState).type)
    const bodyType = actions.checkType(TypeNode, bodyTypeNode, inwardState).type

    return {
      type: types.createFunction({
        paramTypes,
        genericParamTypes: constraints,
        bodyType,
        purity,
      })
    }
  },
})

// Mainly intended as a convenience for constructing the stdLib.
interface NodeFromTypeGetterFnPayload { typeGetter: (actions: Actions) => AnyType }
export const nodeFromTypeGetter = (pos: Position, payload: NodeFromTypeGetterFnPayload) =>
  TypeNode.create<NodeFromTypeGetterFnPayload>('customTypeNode', pos, payload)

TypeNode.register<NodeFromTypeGetterFnPayload>('customTypeNode', {
  typeCheck: (actions, inwardState) => ({ typeGetter }) => ({ type: typeGetter(actions) }),
})