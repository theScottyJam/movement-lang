import type { Token } from 'moo'
import * as Node from './helpers/Node';
import { assertRawRecordValue, assertRecordInnerDataType } from './helpers/typeAssertions';
import { SemanticError, RuntimeError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'

type Node = Node.Node
type AssignmentTargetNode = Node.AssignmentTargetNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

type TypeGetter = (TypeState, Position) => AnyType

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

interface BindOpts {
  identifier: string
  getTypeConstraint?: TypeGetter
  identPos: Position
  typeConstraintPos: Position
}
export const bind = (pos: Position, { identifier, getTypeConstraint, identPos, typeConstraintPos }: BindOpts) => {
  let typeConstraint: AnyType | null
  return Node.createAssignmentTarget({
    name: 'bind',
    pos,
    exec: (rt, { incomingValue, allowFailure = false }) => {
      if (typeConstraint && !Type.isTypeAssignableTo(incomingValue.type, typeConstraint)) {
        if (allowFailure) return null
        throw new Error('Unreachable: Type mismatch when binding.')
      }
      return [{ identifier, value: incomingValue }]
    },
    typeCheck: (state, { incomingType, allowWidening = false, export: export_ = false }) => {
      typeConstraint = getTypeConstraint ? getTypeConstraint(state, typeConstraintPos) : null
      if (incomingType === Node.missingType && !typeConstraint) throw new SemanticError("Could not auto-determine the type of this record field, please specify it with a type constraint.", DUMMY_POS)
      if (typeConstraint && incomingType !== Node.missingType && !Type.isTypeAssignableTo(incomingType, typeConstraint)) {
        if (!allowWidening) {
          throw new SemanticError(`Found type "${Type.repr(incomingType)}", but expected type "${Type.repr(typeConstraint)}".`, DUMMY_POS)
        } else if (allowWidening && !Type.isTypeAssignableTo(typeConstraint, incomingType)) {
          throw new SemanticError(`Attempted to change a type from "${Type.repr(incomingType)}" to type "${Type.repr(typeConstraint)}". Pattern matching can only widen or narrow a provided type.`, DUMMY_POS)
        }
      }
      const finalType = typeConstraint ? typeConstraint : incomingType
      if (finalType === Node.missingType) throw new Error('INTERNAL ERROR')
      return {
        respState: RespState.create({
          declarations: [{ identifier, type: finalType, identPos }],
          moduleShape: export_
            ? types.createRecord({ nameToType: new Map([[identifier, finalType]]) })
            : types.createRecord({ nameToType: new Map() }),
        }),
      }
    },
    contextlessTypeCheck: state => {
      if (!getTypeConstraint) throw new SemanticError('All function parameters must have a declared type', pos)
      const typeConstraint = getTypeConstraint(state, typeConstraintPos)
      return {
        respState: RespState.create({ declarations: [{ identifier, type: typeConstraint, identPos }] }),
        type: typeConstraint,
      }
    }
  })
}

interface DestructurObjOpts { entries: Map<string, AssignmentTargetNode> }
export const destructureObj = (pos: Position, { entries }: DestructurObjOpts) => Node.createAssignmentTarget({
  name: 'destructureObj',
  pos,
  exec: (rt, { incomingValue, allowFailure = false }) => {
    const allBindings = []
    for (const [identifier, assignmentTarget] of entries) {
      if (!Type.isTypeParameter(incomingValue.type) && types.isUnknown(incomingValue.type)) return null
      const innerValue = assertRawRecordValue(incomingValue.raw).get(identifier)
      if (!innerValue) return null
      const bindings = assignmentTarget.exec(rt, { incomingValue: innerValue, allowFailure })
      if (!bindings) return null
      allBindings.push(...bindings)
      rt = bindings.reduce((rt, { identifier, value }) => (
        Runtime.update(rt, { scopes: [...rt.scopes, { identifier, value }] })
      ), rt)
    }
    return allBindings
  },
  typeCheck: (state, { incomingType, allowWidening = false, export: export_ = false }) => {
    if (incomingType !== Node.missingType) Type.assertTypeAssignableTo(incomingType, types.createRecord({ nameToType: new Map() }), DUMMY_POS, `Found type ${Type.repr(incomingType)} but expected a record.`)
    const respStates = []
    for (const [identifier, assignmentTarget] of entries) {
      let valueType = incomingType === Node.missingType || types.isEffectivelyNever(incomingType)
        ? incomingType
        : assertRecordInnerDataType(Type.assertIsConcreteType(incomingType).data).nameToType.get(identifier)
      if (!valueType && allowWidening) valueType = Node.missingType
      if (!valueType) {
        if (incomingType === Node.missingType) throw new Error('INTERNAL ERROR')
        throw new SemanticError(`Unable to destructure property ${identifier} from type ${Type.repr(incomingType)}`, DUMMY_POS)
      }
      const { respState } = assignmentTarget.typeCheck(state, { incomingType: valueType, allowWidening, export: export_ })
      respStates.push(respState)
      state = TypeState.applyDeclarations(state, respState)
    }
    return {
      respState: RespState.merge(...respStates),
    }
  },
  contextlessTypeCheck: state => {
    const respStates = []
    const nameToType = new Map()
    for (const [identifier, assignmentTarget] of entries) {
      const { respState, type } = assignmentTarget.contextlessTypeCheck(state)
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

interface ValueConstraintOpts { assignmentTarget: AssignmentTargetNode, constraint: Node }
export const valueConstraint = (pos: Position, { assignmentTarget, constraint }: ValueConstraintOpts) => Node.createAssignmentTarget({
  name: 'valueConstraint',
  pos,
  exec: (rt, { incomingValue, allowFailure = false }) => {
    const bindings = assignmentTarget.exec(rt, { incomingValue, allowFailure })
    if (!bindings) return null
    rt = Runtime.update(rt, { scopes: [...rt.scopes, ...bindings] })
    const success = constraint.exec(rt)
    if (!success.value.raw) {
      if (allowFailure) return null
      throw new RuntimeError('Value Constraint failed.', { testCode: 'failedValueConstraint' })
    }
    return bindings
  },
  typeCheck: (state, { incomingType, allowWidening = false, export: export_ = false }) => {
    const { respState } = assignmentTarget.typeCheck(state, { incomingType, allowWidening, export: export_ })
    state = TypeState.applyDeclarations(state, respState)
    const { respState: respState2, type } = constraint.typeCheck(state)
    Type.assertTypeAssignableTo(type, types.createBoolean(), DUMMY_POS)
    return {
      respState: RespState.merge(respState, respState2)
    }
  },
  contextlessTypeCheck: state => {
    const { respState, type } = assignmentTarget.contextlessTypeCheck(state)
    state = TypeState.applyDeclarations(state, respState)
    const { respState: respState2, type: type2 } = constraint.typeCheck(state)
    Type.assertTypeAssignableTo(type2, types.createBoolean(), DUMMY_POS)
    return {
      respState: RespState.merge(respState, respState2),
      type,
    }
  }
})