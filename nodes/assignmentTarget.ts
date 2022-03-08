import type { Token } from 'moo'
import * as AssignmentTargetNode from './variants/AssignmentTargetNode';
import * as InstructionNode from './variants/InstructionNode';
import * as TypeNode from './variants/TypeNode';
import {
  assertRawRecordValue,
  assertRecordInnerDataType,
  assertTagInnerDataType,
  assertRawTaggedValue,
} from './helpers/typeAssertions';
import { SemanticError, RuntimeError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { VARIANCE_DIRECTION } from '../language/constants'
import { pipe, assertUnreachable } from '../util'

type AnyInstructionNode = InstructionNode.AnyInstructionNode
type AnyAssignmentTargetNode = AssignmentTargetNode.AnyAssignmentTargetNode
type AnyTypeNode = TypeNode.AnyTypeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type AnyType = Type.AnyType

const DUMMY_POS = Position.from('<unknown>', { line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

type ValueOf<T> = T[keyof T]

interface BindPayload {
  readonly identifier: string
  readonly maybeTypeConstraintNode?: AnyTypeNode | null
  readonly identPos: Position
}
interface BindTypePayload {
  readonly typeConstraint: AnyType | null
}
export const bind = (pos: Position, { identifier, maybeTypeConstraintNode, identPos }: BindPayload) =>
  AssignmentTargetNode.create<BindPayload>('bind', pos, { identifier, maybeTypeConstraintNode, identPos })

/// Replace all generic types within a type by their constraining types.
/// This will go into the constraining types and perform the same replacement on those as well.
/// i.e. The type #{ x #T, y #U } could be replaced with #{ x #int, y #boolean }.
/// WARNING: When visiting generic types in contravariant regions (like in function parameters), they'll
/// simply be replaced with a #never type to accept everything. This will make comparisons with the resulting type more
/// liberal then it should technically be (which is o.k. for the specific use case it's designed for)
export function getInaccurateNestedConstrainingType<T extends Type.CategoryGenerics>(type: Type.Type<T>): Type.AnyType {
  const newType: Type.AnyType = Type.deepMap(type, {
    visit<U extends Type.CategoryGenerics>(self, { varianceDirection }: { varianceDirection: ValueOf<typeof VARIANCE_DIRECTION> }) {
      if (!Type.isTypeParameter(self)) {
        return { keepNesting: true }
      }
      if (varianceDirection === VARIANCE_DIRECTION.contravariant) {
        return { keepNesting: false, replaceWith: types.createNever() }
      } else if (varianceDirection === VARIANCE_DIRECTION.invariant) {
        return { keepNesting: false, replaceWith: self }
      } else if (varianceDirection === VARIANCE_DIRECTION.covariant) {
        return { keepNesting: false, replaceWith: getInaccurateNestedConstrainingType(self.constrainedBy) as Type.Type<U> }
      } else {
        assertUnreachable(varianceDirection)
      }
    },
  })
  return newType
}

AssignmentTargetNode.register<BindPayload, BindTypePayload>('bind', {
  exec: (rt, { identifier, typeConstraint }, { incomingValue, allowFailure = false }) => {
    if (typeConstraint && !Type.isTypeAssignableTo(incomingValue.type, getInaccurateNestedConstrainingType(typeConstraint))) {
      if (allowFailure) return null
      throw new Error('Unreachable: Type mismatch when binding.')
    }
    return [{ identifier, value: incomingValue }]
  },
  typeCheck: (actions, inwardState) => ({ pos, identifier, maybeTypeConstraintNode, identPos }, { incomingType, allowWidening, export: export_ }) => {
    if (incomingType === AssignmentTargetNode.noTypeIncoming && !maybeTypeConstraintNode) {
      throw new SemanticError('Could not auto-determine the type of this lvalue, please specify it with a type constraint.', pos)
    }

    const maybeTypeConstraint = maybeTypeConstraintNode ? actions.checkType(TypeNode, maybeTypeConstraintNode, inwardState).type : null

    if (maybeTypeConstraint && incomingType !== AssignmentTargetNode.noTypeIncoming && !Type.isTypeAssignableTo(incomingType, maybeTypeConstraint)) {
      if (!allowWidening) {
        throw new SemanticError(`Can not assign the type "${Type.repr(incomingType)}" to an lvalue with the constraint "${Type.repr(maybeTypeConstraint)}".`, identPos)
      } else if (allowWidening && !Type.isTypeAssignableTo(maybeTypeConstraint, incomingType)) {
        throw new SemanticError(`Attempted to change a type from "${Type.repr(incomingType)}" to type "${Type.repr(maybeTypeConstraint)}". Pattern matching can only widen or narrow a provided type.`, DUMMY_POS)
      }
    }

    const finalType = maybeTypeConstraint ?? incomingType
    if (finalType === AssignmentTargetNode.noTypeIncoming) throw new Error('INTERNAL ERROR')

    actions.follow.addToScopeInValueNamespace(identifier, finalType, identPos)
    return {
      outward: {
        moduleShape: export_
          ? types.createRecord({ nameToType: new Map([[identifier, finalType]]), symbolToInfo: new Map() })
          : types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }),
      },
      type: maybeTypeConstraint ?? types.createUnknown(),
      typePayload: { typeConstraint: maybeTypeConstraint ?? null }
    }
  },
})

interface DestructurRecordPayload {
  entries: readonly (
    { type: 'IDENTIFIER', name: string, target: AnyAssignmentTargetNode, keyPos: Position } |
    { type: 'SYMBOL', symbNode: AnyInstructionNode, target: AnyAssignmentTargetNode, keyPos: Position }
  )[]
}
export const destructureRecord = (pos: Position, { entries }: DestructurRecordPayload) =>
  AssignmentTargetNode.create<DestructurRecordPayload>('destructureRecord', pos, { entries })

AssignmentTargetNode.register<DestructurRecordPayload, {}>('destructureRecord', {
  exec: (rt, { entries }, { incomingValue, allowFailure = false }) => {
    const allBindings = []
    if (!Type.isTypeParameter(incomingValue.type) && types.isUnknown(incomingValue.type)) return null
    for (const entry of entries) {
      const { type: entryType, target: assignmentTarget } = entry
      let innerValue
      if (entryType === 'IDENTIFIER') {
        innerValue = assertRawRecordValue(incomingValue.raw).nameToValue.get(entry.name)
        if (!innerValue) return null
      } else if (entryType === 'SYMBOL') {
        const symbValue = InstructionNode.exec(entry.symbNode, rt).value
        if (typeof symbValue.raw !== 'symbol') throw new Error()

        innerValue = assertRawRecordValue(incomingValue.raw).symbolToValue.get(symbValue.raw)
        if (!innerValue) return null
      } else {
        throw new Error()
      }
      const bindings = AssignmentTargetNode.exec(assignmentTarget, rt, { incomingValue: innerValue, allowFailure })
      if (!bindings) return null
      allBindings.push(...bindings)
      rt = bindings.reduce((rt, { identifier, value }) => (
        Runtime.update(rt, { scopes: [...rt.scopes, { identifier, value }] })
      ), rt)
    }
    return allBindings
  },
  typeCheck: (actions, inwardState) => ({ pos, entries }, { incomingType, allowWidening, export: export_ }) => {
    if (incomingType !== AssignmentTargetNode.noTypeIncoming) {
      Type.assertTypeAssignableTo(incomingType, types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }), pos, `Attempted to perform a record-destructure on the non-record type ${Type.repr(incomingType)}.`)
    }

    const nameToType = new Map() as types.RecordType['data']['nameToType']
    const symbolToInfo = new Map() as types.RecordType['data']['symbolToInfo']
    const seenKeys = new Set<string | symbol>()
    for (const entry of entries) {
      const { type: entryType, target: assignmentTarget, keyPos } = entry
      let getTypeFromIncommingRecordData: (recordData: types.RecordType['data']) => AnyType
      let keyName: string
      let setType: (type: Type.AnyType) => void
      if (entryType === 'IDENTIFIER') {
        const { name: identifier } = entry
        if (seenKeys.has(identifier)) {
          throw new SemanticError(`duplicate identifier found in record destructure: ${entry.name}`, keyPos)
        }
        seenKeys.add(identifier)

        getTypeFromIncommingRecordData = recordData => recordData.nameToType.get(identifier)
        keyName = identifier
        setType = type => nameToType.set(identifier, assignmentTargetType)
      } else if (entryType === 'SYMBOL') {
        const { symbNode } = entry
        const symbType = Type.getConcreteConstrainingType(actions.checkType(InstructionNode, symbNode, inwardState).type)
        if (!types.isSymbol(symbType)) {
          throw new SemanticError(`Only symbol types can be used in a dynamic property. Received type "${Type.repr(symbType)}".`, symbNode.pos)
        }
        if (seenKeys.has(symbType.data.value)) {
          throw new SemanticError(`duplicate symbol key found in record destructure: ${types.reprSymbolWithoutTypeText(symbType)}`, keyPos)
        }
        seenKeys.add(symbType.data.value)

        getTypeFromIncommingRecordData = recordData => recordData.symbolToInfo.get(symbType.data.value)?.type 
        keyName = types.reprSymbolWithoutTypeText(symbType)
        setType = type => symbolToInfo.set(symbType.data.value, { symbType, type })
      } else {
        throw new Error()
      }

      let valueType = incomingType === AssignmentTargetNode.noTypeIncoming || types.isEffectivelyNever(incomingType)
        ? incomingType
        : pipe(
          Type.assertIsConcreteType(incomingType).data,
          $=> assertRecordInnerDataType($),
          $=> getTypeFromIncommingRecordData($),
        )
      if (!valueType && allowWidening) valueType = AssignmentTargetNode.noTypeIncoming
      if (!valueType) {
        if (incomingType === AssignmentTargetNode.noTypeIncoming) throw new Error('INTERNAL ERROR')
        throw new SemanticError(`Unable to destructure property "${keyName}" from type ${Type.repr(incomingType)}`, keyPos)
      }
      const assignmentTargetType = actions.checkType(AssignmentTargetNode, assignmentTarget, inwardState, { incomingType: valueType, allowWidening, export: export_ }).type
      setType(assignmentTargetType)
    }
    return {
      type: types.createRecord({ nameToType, symbolToInfo }),
    }
  },
})

interface DestructureTaggedPayload { tag: AnyInstructionNode, innerContent: AnyAssignmentTargetNode }
export const destructureTagged = (pos: Position, { tag, innerContent }: DestructureTaggedPayload) =>
  AssignmentTargetNode.create<DestructureTaggedPayload>('destructureTagged', pos, { tag, innerContent })

AssignmentTargetNode.register<DestructureTaggedPayload, {}>('destructureTagged', {
  exec: (rt, { tag, innerContent }, { incomingValue, allowFailure = false }) => {
    if (!Type.isTypeParameter(incomingValue.type) && types.isUnknown(incomingValue.type)) return null
    const { value: tagValue } = InstructionNode.exec(tag, rt)

    const innerTagTypeResult = pipe(
      tagValue.type,
      $=> Type.getConcreteConstrainingType($),
      $=> Type.getProtocols(tagValue.type, DUMMY_POS).childType($),
    )
    if (!innerTagTypeResult.success) throw new Error()
    if (!Type.isTypeAssignableTo(incomingValue.type, innerTagTypeResult.type)) return null
    const innerValue = assertRawTaggedValue(incomingValue.raw)
    return AssignmentTargetNode.exec(innerContent, rt, { incomingValue: innerValue, allowFailure })
  },
  typeCheck: (actions, inwardState) => ({ pos, tag, innerContent }, { incomingType, allowWidening, export: export_ }) => {
    const tagType = actions.checkType(InstructionNode, tag, inwardState).type
    const tagInnerData = assertTagInnerDataType(Type.assertIsConcreteType(tagType).data)
    const finalType = types.createTagged({ tag: tagType as types.TagType })
    if (incomingType !== AssignmentTargetNode.noTypeIncoming) {
      Type.assertTypeAssignableTo(incomingType, finalType, pos, `Attempted to perform a tag-destructure with type "${Type.repr(incomingType)}" on an lvalue of an incompatible tag "${Type.repr(finalType)}".`)
    }
    const innerContentType = actions.checkType(AssignmentTargetNode, innerContent, inwardState, {
      incomingType: incomingType === AssignmentTargetNode.noTypeIncoming || types.isEffectivelyNever(incomingType)
        ? incomingType
        : (incomingType as types.TaggedType).data.tag.data.boxedType,
      allowWidening,
      export: export_,
    }).type
    Type.assertTypeAssignableTo(tagInnerData.boxedType, innerContentType, pos)

    return { type: finalType }
  },
})

interface ValueConstraintPayload { assignmentTarget: AnyAssignmentTargetNode, constraint: AnyInstructionNode }
export const valueConstraint = (pos: Position, { assignmentTarget, constraint }: ValueConstraintPayload) =>
  AssignmentTargetNode.create<ValueConstraintPayload>('valueConstraint', pos, { assignmentTarget, constraint })

AssignmentTargetNode.register<ValueConstraintPayload, {}>('valueConstraint', {
  exec: (rt, { assignmentTarget, constraint }, { incomingValue, allowFailure = false }) => {
    const bindings = AssignmentTargetNode.exec(assignmentTarget, rt, { incomingValue, allowFailure })
    if (!bindings) return null
    rt = Runtime.update(rt, { scopes: [...rt.scopes, ...bindings] })
    const success = InstructionNode.exec(constraint, rt)
    if (!success.value.raw) {
      if (allowFailure) return null
      throw new RuntimeError('Value Constraint failed.', { testCode: 'failedValueConstraint' })
    }
    return bindings
  },
  typeCheck: (actions, inwardState) => ({ assignmentTarget, constraint }, { incomingType, allowWidening, export: export_ }) => {
    const assignmentTargetType = actions.checkType(AssignmentTargetNode, assignmentTarget, inwardState, { incomingType, allowWidening, export: export_ }).type
    const typeConstraintType = actions.checkType(InstructionNode, constraint, inwardState).type
    Type.assertTypeAssignableTo(typeConstraintType, types.createBoolean(), DUMMY_POS)
    return {
      type: assignmentTargetType,
    }
  },
})