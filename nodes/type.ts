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

interface DescendentTypePayload { expr: AnyInstructionNode }
export const descendentType = (pos: Position, payload: DescendentTypePayload) =>
  TypeNode.create<DescendentTypePayload>('descendentType', pos, payload)

TypeNode.register<DescendentTypePayload>('descendentType', {
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

interface TypeOfExprPayload { expr: AnyInstructionNode }
export const typeOfExpr = (pos: Position, payload: TypeOfExprPayload) =>
  TypeNode.create<TypeOfExprPayload>('typeOfExpr', pos, payload)

TypeNode.register<TypeOfExprPayload>('typeOfExpr', {
  typeCheck: (actions, inwardState) => ({ pos, expr }) => {
    const type = actions.noExecZone(() => {
      return actions.checkType(InstructionNode, expr, inwardState).type
    })

    return { type }
  },
})

interface RecordTypePayload {
  readonly recordTypeEntries: readonly (
    { type: 'IDENTIFIER', name: string, typeNode: AnyTypeNode, keyPos: Position } |
    { type: 'SYMBOL', symbTypeNode: AnyTypeNode, typeNode: AnyTypeNode, keyPos: Position }
  )[]
}
export const recordType = (pos: Position, payload: RecordTypePayload) =>
  TypeNode.create<RecordTypePayload>('recordType', pos, payload)

TypeNode.register<RecordTypePayload>('recordType', {
  typeCheck: (actions, inwardState) => ({ recordTypeEntries }) => {
    const nameToType = new Map() as types.RecordType['data']['nameToType']
    const symbolToInfo = new Map() as types.RecordType['data']['symbolToInfo']
    const seenKeys = new Set<string | symbol>()
    for (const entry of recordTypeEntries) {
      if (entry.type === 'IDENTIFIER') {
        const { name, typeNode, keyPos } = entry
        if (seenKeys.has(entry.name)) {
          throw new SemanticError(`This record type definition contains the same key "${entry.name}" multiple times.`, keyPos)
        }
        seenKeys.add(entry.name)

        nameToType.set(name, actions.checkType(TypeNode, typeNode, inwardState).type)
      } else if (entry.type === 'SYMBOL') {
        const { symbTypeNode, typeNode, keyPos } = entry
        // TODO: Not sure if I should use getConstrainingType() here.
        const symbType = Type.getConstrainingType(actions.checkType(TypeNode, symbTypeNode, inwardState).type)
        if (!types.isSymbol(symbType)) {
          throw new SemanticError(`Only symbol types can be used in a dynamic property type field. Received type "${Type.repr(symbType)}".`, symbTypeNode.pos)
        }

        if (seenKeys.has(symbType.data.value)) {
          throw new SemanticError(`This record type definition contains the same symbol key "${types.reprSymbolWithoutTypeText(symbType)}" multiple times.`, keyPos)
        }
        seenKeys.add(symbType.data.value)

        const type = actions.checkType(TypeNode, typeNode, inwardState).type
        symbolToInfo.set(symbType.data.value, { symbType, type, })
      } else {
        throw new Error()
      }
    }
    return { type: types.createRecord({ nameToType, symbolToInfo }) }
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