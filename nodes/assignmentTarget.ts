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
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'

type AnyInstructionNode = InstructionNode.AnyInstructionNode
type AnyAssignmentTargetNode = AssignmentTargetNode.AnyAssignmentTargetNode
type AnyTypeNode = TypeNode.AnyTypeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

interface BindPayload {
  readonly identifier: string
  readonly maybeTypeConstraintNode?: AnyTypeNode | null
  readonly identPos: Position
}
interface BindTypePayload {
  readonly typeConstraint: AnyType
}
export const bind = (pos: Position, { identifier, maybeTypeConstraintNode, identPos }: BindPayload) =>
  AssignmentTargetNode.create<BindPayload, BindTypePayload>('bind', pos, { identifier, maybeTypeConstraintNode, identPos })

AssignmentTargetNode.register<BindPayload, BindTypePayload>('bind', {
  exec: (rt, { identifier, typeConstraint }, { incomingValue, allowFailure = false }) => {
    if (typeConstraint && !Type.isTypeAssignableTo(incomingValue.type, typeConstraint)) {
      if (allowFailure) return null
      throw new Error('Unreachable: Type mismatch when binding.')
    }
    return [{ identifier, value: incomingValue }]
  },
  typeCheck: (state, { identifier, maybeTypeConstraintNode, identPos }, { incomingType, allowWidening = false, export: export_ = false }) => {
    const maybeTypeConstraintResp = maybeTypeConstraintNode ? TypeNode.typeCheck(maybeTypeConstraintNode, state) : null
    if (incomingType === AssignmentTargetNode.missingType && !maybeTypeConstraintResp) {
      throw new SemanticError("Could not auto-determine the type of this record field, please specify it with a type constraint.", DUMMY_POS)
    }
    if (maybeTypeConstraintResp && incomingType !== AssignmentTargetNode.missingType && !Type.isTypeAssignableTo(incomingType, maybeTypeConstraintResp.type)) {
      if (!allowWidening) {
        throw new SemanticError(`Found type "${Type.repr(incomingType)}", but expected type "${Type.repr(maybeTypeConstraintResp.type)}".`, DUMMY_POS)
      } else if (allowWidening && !Type.isTypeAssignableTo(maybeTypeConstraintResp.type, incomingType)) {
        throw new SemanticError(`Attempted to change a type from "${Type.repr(incomingType)}" to type "${Type.repr(maybeTypeConstraintResp.type)}". Pattern matching can only widen or narrow a provided type.`, DUMMY_POS)
      }
    }
    const finalType = maybeTypeConstraintResp ? maybeTypeConstraintResp.type : incomingType
    if (finalType === AssignmentTargetNode.missingType) throw new Error('INTERNAL ERROR')
    return {
      respState: RespState.merge(
        ...(maybeTypeConstraintResp ? [maybeTypeConstraintResp.respState] : []),
        RespState.create({
          declarations: [{ identifier, type: finalType, identPos }],
          moduleShape: export_
            ? types.createRecord({ nameToType: new Map([[identifier, finalType]]) })
            : types.createRecord({ nameToType: new Map() }),
        })
      ),
    }
  },
  contextlessTypeCheck: (state, { pos, identifier, maybeTypeConstraintNode, identPos }) => {
    if (!maybeTypeConstraintNode) throw new SemanticError('All function parameters must have a declared type', pos)
    const typeConstraintResp = TypeNode.typeCheck(maybeTypeConstraintNode, state)
    return {
      respState: RespState.merge(
        typeConstraintResp.respState,
        RespState.create({ declarations: [{ identifier, type: typeConstraintResp.type, identPos }] })
      ),
      type: typeConstraintResp.type,
      typePayload: { typeConstraint: typeConstraintResp.type }
    }
  }
})

interface DestructurObjPayload { entries: Map<string, AnyAssignmentTargetNode> }
export const destructureObj = (pos: Position, { entries }: DestructurObjPayload) =>
  AssignmentTargetNode.create<DestructurObjPayload, {}>('destructureRecord', pos, { entries })

AssignmentTargetNode.register<DestructurObjPayload, {}>('destructureRecord', {
  exec: (rt, { entries }, { incomingValue, allowFailure = false }) => {
    const allBindings = []
    if (!Type.isTypeParameter(incomingValue.type) && types.isUnknown(incomingValue.type)) return null
    for (const [identifier, assignmentTarget] of entries) {
      const innerValue = assertRawRecordValue(incomingValue.raw).get(identifier)
      if (!innerValue) return null
      const bindings = AssignmentTargetNode.exec(assignmentTarget, rt, { incomingValue: innerValue, allowFailure })
      if (!bindings) return null
      allBindings.push(...bindings)
      rt = bindings.reduce((rt, { identifier, value }) => (
        Runtime.update(rt, { scopes: [...rt.scopes, { identifier, value }] })
      ), rt)
    }
    return allBindings
  },
  typeCheck: (state, { entries }, { incomingType, allowWidening = false, export: export_ = false }) => {
    if (incomingType !== AssignmentTargetNode.missingType) Type.assertTypeAssignableTo(incomingType, types.createRecord({ nameToType: new Map() }), DUMMY_POS, `Found type ${Type.repr(incomingType)} but expected a record.`)
    const respStates = []
    for (const [identifier, assignmentTarget] of entries) {
      let valueType = incomingType === AssignmentTargetNode.missingType || types.isEffectivelyNever(incomingType)
        ? incomingType
        : assertRecordInnerDataType(Type.assertIsConcreteType(incomingType).data).nameToType.get(identifier)
      if (!valueType && allowWidening) valueType = AssignmentTargetNode.missingType
      if (!valueType) {
        if (incomingType === AssignmentTargetNode.missingType) throw new Error('INTERNAL ERROR')
        throw new SemanticError(`Unable to destructure property ${identifier} from type ${Type.repr(incomingType)}`, DUMMY_POS)
      }
      const { respState } = AssignmentTargetNode.typeCheck(assignmentTarget, state, { incomingType: valueType, allowWidening, export: export_ })
      respStates.push(respState)
      state = TypeState.applyDeclarations(state, respState)
    }
    return {
      respState: RespState.merge(...respStates),
    }
  },
  contextlessTypeCheck: (state, { entries }) => {
    const respStates = []
    const nameToType = new Map()
    for (const [identifier, assignmentTarget] of entries) {
      const { respState, type } = AssignmentTargetNode.contextlessTypeCheck(assignmentTarget, state)
      respStates.push(respState)
      state = TypeState.applyDeclarations(state, respState)
      nameToType.set(identifier, type)
    }
    return {
      respState: RespState.merge(...respStates),
      type: types.createRecord({ nameToType }),
    }
  },
})

interface DestructureTaggedPayload { tag: AnyInstructionNode, innerContent: AnyAssignmentTargetNode }
export const destructureTagged = (pos: Position, { tag, innerContent }: DestructureTaggedPayload) =>
  AssignmentTargetNode.create<DestructureTaggedPayload, {}>('destructureTagged', pos, { tag, innerContent })

AssignmentTargetNode.register<DestructureTaggedPayload, {}>('destructureTagged', {
  exec: (rt, { pos, tag, innerContent }, { incomingValue, allowFailure = false }) => {
    if (!Type.isTypeParameter(incomingValue.type) && types.isUnknown(incomingValue.type)) return null
    const { value: tagValue } = InstructionNode.exec(tag, rt)
    if (!Type.isTypeAssignableTo(incomingValue.type, Type.getTypeMatchingDescendants(tagValue.type, DUMMY_POS))) return null
    const innerValue = assertRawTaggedValue(incomingValue.raw)
    return AssignmentTargetNode.exec(innerContent, rt, { incomingValue: innerValue, allowFailure })
  },
  typeCheck: (state, { tag, innerContent }, { incomingType, allowWidening = false, export: export_ = false }) => {
    const { respState: respState1, type: tagType } = InstructionNode.typeCheck(tag, state)
    assertTagInnerDataType(Type.assertIsConcreteType(tagType).data)
    if (incomingType !== AssignmentTargetNode.missingType) {
      Type.assertTypeAssignableTo(incomingType, types.createTagged({ tag: tagType as types.TagType }), DUMMY_POS)
    }
    const { respState: respState2 } = AssignmentTargetNode.typeCheck(innerContent, state, {
      incomingType: incomingType === AssignmentTargetNode.missingType || types.isEffectivelyNever(incomingType)
        ? incomingType
        : (incomingType as types.TaggedType).data.tag.data.boxedType,
      allowWidening,
      export: export_,
    })

    return {
      respState: RespState.merge(respState1, respState2),
    }
  },
  contextlessTypeCheck: (state, { pos, tag, innerContent }) => {
    const { respState: respState1, type: tagType } = InstructionNode.typeCheck(tag, state)
    const { respState: respState2, type: innerContentType } = AssignmentTargetNode.contextlessTypeCheck(innerContent, state)
    state = TypeState.applyDeclarations(state, respState2)
    Type.assertTypeAssignableTo(innerContentType, assertTagInnerDataType(Type.assertIsConcreteType(tagType).data).boxedType, pos)
    return {
      respState: RespState.merge(respState1, respState2),
      type: types.createTagged({ tag: tagType as types.TagType }),
    }
  },
})

interface ValueConstraintPayload { assignmentTarget: AnyAssignmentTargetNode, constraint: AnyInstructionNode }
export const valueConstraint = (pos: Position, { assignmentTarget, constraint }: ValueConstraintPayload) =>
  AssignmentTargetNode.create<ValueConstraintPayload, {}>('valueConstraint', pos, { assignmentTarget, constraint })

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
  typeCheck: (state, { assignmentTarget, constraint }, { incomingType, allowWidening = false, export: export_ = false }) => {
    const { respState } = AssignmentTargetNode.typeCheck(assignmentTarget, state, { incomingType, allowWidening, export: export_ })
    state = TypeState.applyDeclarations(state, respState)
    const { respState: respState2, type } = InstructionNode.typeCheck(constraint, state)
    Type.assertTypeAssignableTo(type, types.createBoolean(), DUMMY_POS)
    return {
      respState: RespState.merge(respState, respState2)
    }
  },
  contextlessTypeCheck: (state, { assignmentTarget, constraint }) => {
    const { respState, type } = AssignmentTargetNode.contextlessTypeCheck(assignmentTarget, state)
    state = TypeState.applyDeclarations(state, respState)
    const { respState: respState2, type: type2 } = InstructionNode.typeCheck(constraint, state)
    Type.assertTypeAssignableTo(type2, types.createBoolean(), DUMMY_POS)
    return {
      respState: RespState.merge(respState, respState2),
      type,
    }
  }
})