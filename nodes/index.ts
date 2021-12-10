import type { Token } from 'moo'
import * as Node from './helpers/Node';
import {
  assertBigInt,
  assertRawRecordValue,
  assertRecordInnerDataType,
  assertRawFunctionValue,
  assertFunctionInnerDataType,
} from './helpers/typeAssertions';
import { RuntimeError, SemanticError, FlowControlReturnError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as Value from '../language/Value'
import * as values from '../language/values'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY, getPurityLevel } from '../language/constants'
import { zip, zip3 } from '../util'
export * as value from './value'
export * as assignmentTarget from './assignmentTarget'

type Node = Node.Node
type AssignmentTargetNode = Node.AssignmentTargetNode
type InvokeNode = Node.InvokeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type AnyValue = Value.AnyValue
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

type TypeGetter = (TypeState, Position) => AnyType
type ValueOf<T> = T[keyof T]

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

interface RootOpts { module: Node }
interface RootExecOpts { behaviors: Partial<Runtime.RuntimeBehaviors> }
interface RootTypeCheckOpts { behaviors: Partial<TypeState.TypeStateBehaviors> }
export const root = ({ module }: RootOpts) => ({
  exec: ({ behaviors }: RootExecOpts = { behaviors: {} }): AnyValue => {
    const rt = Runtime.create({ behaviors })
    return module.exec(rt)
  },
  typeCheck: ({ behaviors }: RootTypeCheckOpts = { behaviors: {} }): void => {
    const state = TypeState.create({ behaviors })
    module.typeCheck(state)
  }
})

export const beginBlock = (pos: Position, content: Node) => Node.create({
  name: 'beginBlock',
  pos,
  exec: rt => content.exec(rt),
  typeCheck: state => (
    content.typeCheck(TypeState.update(state, {
      minPurity: PURITY.none,
      isBeginBlock: true,
    }))
  ),
})

interface BlockOpts { content: Node }
export const block = (pos: Position, { content }: BlockOpts) => Node.create({
  name: 'block',
  pos,
  exec: rt => {
    content.exec(rt)
    return values.createUnit()
  },
  typeCheck: outerState => {
    let state = TypeState.update(outerState, {
      scopes: [...outerState.scopes, new Map()],
      definedTypes: [...outerState.definedTypes, new Map()],
    })
    const { respState, type: contentType } = content.typeCheck(state)
    const type = types.isEffectivelyNever(contentType) ? types.createNever() : types.createUnit()
    return { respState, type }
  },
})

export const sequence = (statements: readonly Node[]) => Node.create({
  name: 'sequence',
  exec: rt => {
    for (const statement of statements) statement.exec(rt)
    return null
  },
  typeCheck: state => {
    const typeChecks = statements.map(statement => statement.typeCheck(state))
    const respStates = typeChecks.map(x => x.respState)
    const type = typeChecks.find(x => types.isEffectivelyNever(x.type)) ? types.createNever() : types.createUnit()
    return { respState: RespState.merge(...respStates), type }
  },
})

export const noop = () => Node.create({
  name: 'noop',
  exec: rt => null,
  typeCheck: state => {
    const respState = RespState.create()
    const type = types.createUnit()
    return { respState, type }
  },
})

interface PrintOpts { r: Node }
export const print = (pos: Position, { r }: PrintOpts) => Node.create({
  name: 'print',
  pos,
  exec: rt => {
    const value = r.exec(rt)
    rt.behaviors.showDebugOutput(value)
    return value
  },
  typeCheck: state => r.typeCheck(state),
})

interface PrintTypeOpts { r: Node }
export const printType = (pos: Position, { r }: PrintTypeOpts) => Node.create({
  name: 'print',
  pos,
  exec: rt => r.exec(rt),
  typeCheck: state => {
    const { respState, type } = r.typeCheck(state)
    state.behaviors.showDebugTypeOutput(type)
    return { respState, type }
  },
})

interface EqualsOpts { l: Node, r: Node }
export const equals = (pos: Position, { l, r }: EqualsOpts) => Node.create({
  name: 'equals',
  pos,
  exec: rt => values.createBoolean(l.exec(rt).raw === r.exec(rt).raw),
  typeCheck: state => {
    const { respState: lRespState, type: lType } = l.typeCheck(state)
    const { respState: rRespState, type: rType } = r.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createBoolean() }
  },
})

interface NotEqualOpts { l: Node, r: Node }
export const notEqual = (pos: Position, { l, r }: NotEqualOpts) => Node.create({
  name: 'notEqual',
  pos,
  exec: rt => values.createBoolean(l.exec(rt).raw !== r.exec(rt).raw),
  typeCheck: state => {
    const { respState: lRespState, type: lType } = l.typeCheck(state)
    const { respState: rRespState, type: rType } = r.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createBoolean() }
  },
})

interface AddOpts { l: Node, r: Node }
export const add = (pos: Position, { l, r }: AddOpts) => Node.create({
  name: 'add',
  pos,
  exec: rt => values.createInt(
    assertBigInt(l.exec(rt).raw) +
    assertBigInt(r.exec(rt).raw)
  ),
  typeCheck: state => {
    const { respState: lRespState, type: lType } = l.typeCheck(state)
    const { respState: rRespState, type: rType } = r.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface SubtractOpts { l: Node, r: Node }
export const subtract = (pos: Position, { l, r }: SubtractOpts) => Node.create({
  name: 'subtract',
  pos,
  exec: rt => values.createInt(assertBigInt(l.exec(rt).raw) - assertBigInt(r.exec(rt).raw)),
  typeCheck: state => {
    const { respState: lRespState, type: lType } = l.typeCheck(state)
    const { respState: rRespState, type: rType } = r.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface MultiplyOpts { l: Node, r: Node }
export const multiply = (pos: Position, { l, r }: MultiplyOpts) => Node.create({
  name: 'multiply',
  pos,
  exec: rt => values.createInt(assertBigInt(l.exec(rt).raw) * assertBigInt(r.exec(rt).raw)),
  typeCheck: state => {
    const { respState: lRespState, type: lType } = l.typeCheck(state)
    const { respState: rRespState, type: rType } = r.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface PowerOpts { l: Node, r: Node }
export const power = (pos: Position, { l, r }: PowerOpts) => Node.create({
  name: 'power',
  pos,
  exec: rt => values.createInt(assertBigInt(l.exec(rt).raw) ** assertBigInt(r.exec(rt).raw)),
  typeCheck: state => {
    const { respState: lRespState, type: lType } = l.typeCheck(state)
    const { respState: rRespState, type: rType } = r.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface PropertyAccessOpts { l: Node, identifier: string }
export const propertyAccess = (pos: Position, { l, identifier }: PropertyAccessOpts) => Node.create({
  name: 'propertyAccess',
  pos,
  exec: rt => {
    const nameToValue = assertRawRecordValue(l.exec(rt).raw)
    if (!nameToValue.has(identifier)) throw new Error(`Internal Error: Expected to find the identifier "${identifier}" on a record, and that identifier did not exist`)
    return nameToValue.get(identifier)
  },
  typeCheck: state => {
    const { respState, type: lType } = l.typeCheck(state)
    Type.assertTypeAssignableTo(lType, types.createRecord({ nameToType: new Map() }), l.pos, `Found type ${Type.repr(lType)} but expected a record.`)
    const result = assertRecordInnerDataType(Type.assertIsConcreteType(lType).data).nameToType.get(identifier)
    if (!result) throw new SemanticError(`Failed to find the identifier "${identifier}" on the record of type ${Type.repr(lType)}.`, pos)
    return { respState, type: result }
  },
})

interface TypeAssertionOpts { expr: Node, getType: TypeGetter, typePos: Position, operatorAndTypePos: Position }
export const typeAssertion = (pos: Position, { expr, getType, typePos, operatorAndTypePos }: TypeAssertionOpts) => {
  let finalType: AnyType | null
  return Node.create({
    name: 'typeAssertion',
    pos,
    exec: rt => {
      const value = expr.exec(rt)
      if (!Type.isTypeAssignableTo(value.type, finalType)) {
        throw new RuntimeError(`"as" type assertion failed - failed to convert a type from "${Type.repr(value.type)}" to ${Type.repr(finalType)}`)
      }
      // return tools.createValue({ type: finalType, raw: value.raw }) // TODO: I can't remember why I changed the type in this old code. I thought the type was always supposed to represent the current value, irrespective of how the current type definition is applied on it.
      return value
    },
    typeCheck: state => {
      const { respState, type } = expr.typeCheck(state)
      finalType = getType(state, typePos)
      if (!Type.isTypeAssignableTo(finalType, type) && !Type.isTypeAssignableTo(type, finalType)) {
        throw new SemanticError(`Attempted to change a type from "${Type.repr(type)}" to type "${Type.repr(finalType)}". "as" type assertions can only widen or narrow a provided type.`, operatorAndTypePos)
      }
      return { respState, type: finalType }
    },
  })
}

interface GenericParam { getType: TypeGetter, pos: Position }
interface InvokeOpts { fnExpr: Node, genericParams: GenericParam[], args: Node[] }
export const invoke = (pos: Position, { fnExpr, genericParams, args }: InvokeOpts) => Node.createInvokeNode({
  name: 'invoke',
  pos,
  data: {
    type: 'INVOKE',
  },
  exec: rt => {
    const fn = assertRawFunctionValue(fnExpr.exec(rt).raw)
    rt = Runtime.update(rt, { scopes: fn.capturedScope })
    const argValues = args.map(arg => arg.exec(rt))
    for (const [param, value] of zip(fn.params, argValues)) {
      const allBindings = param.exec(rt, { incomingValue: value })
      rt = Runtime.update(rt, { scopes: [...rt.scopes, ...allBindings] })
    }
    try {
      return fn.body.exec(rt)
    } catch (err) {
      if (!(err instanceof FlowControlReturnError)) throw err
      return err.data.returnValue
    }
  },
  typeCheck: (state, { callWithPurity = PURITY.pure } = {}) => {
    const { respState: fnRespState, type: fnType } = fnExpr.typeCheck(state)
    // Type check function expression
    if (Type.isTypeParameter(fnType) || !types.isFunction(fnType)) {
      throw new SemanticError(`Found type "${Type.repr(fnType)}", but expected a function.`, fnExpr.pos)
    }
    const fnTypeData = assertFunctionInnerDataType(fnType.data)

    // Ensure it's called with the right number of generic params
    if (genericParams.length > fnTypeData.genericParamTypes.length) {
      throw new SemanticError(`The function of type ${Type.repr(fnType)} must be called with at most ${fnTypeData.genericParamTypes.length} generic parameters, but got called with ${genericParams.length}.`, pos)
    }
    // Figure out the values of the generic params, and make sure they hold against the constraints
    let valuesOfGenericParams = new Map()
    for (const [assignerGenericParam, assigneeGenericParam] of zip(genericParams, fnTypeData.genericParamTypes)) {
      const type = assignerGenericParam.getType(state, assignerGenericParam.pos)
      Type.assertTypeAssignableTo(type, assigneeGenericParam.constrainedBy, assignerGenericParam.pos)
      valuesOfGenericParams.set(assigneeGenericParam.parameterSentinel, type)
    }

    // Type check args
    const argsTypeChecked = args.map(p => p.typeCheck(state))
    const argTypes = argsTypeChecked.map(p => p.type)
    const argRespStates = argsTypeChecked.map(p => p.respState)
    if (fnTypeData.paramTypes.length !== argTypes.length) {
      throw new SemanticError(`Found ${argTypes.length} parameter(s) but expected ${fnTypeData.paramTypes.length}.`, pos)
    }
    for (const [arg, assignerParamType, assigneeParamType] of zip3(args, argTypes, fnTypeData.paramTypes)) {
      const concrete = Type.isTypeParameter(assigneeParamType) ? assigneeParamType.constrainedBy : assigneeParamType
      Type.assertTypeAssignableTo(assignerParamType, concrete, arg.pos)
      // Check that it uses generics properly
      Type.matchUpGenerics(assigneeParamType, {
        usingType: assignerParamType,
        onGeneric({ self, other }) {
          const genericValue = valuesOfGenericParams.get(self.parameterSentinel)
          if (!genericValue) {
            Type.assertTypeAssignableTo(other, self, DUMMY_POS)
            valuesOfGenericParams.set(self.parameterSentinel, other)
          } else {
            Type.assertTypeAssignableTo(other, genericValue, DUMMY_POS)
          }
        },
      })
    }
    // Check purity level
    if (getPurityLevel(fnTypeData.purity) < getPurityLevel(state.minPurity)) {
      throw new SemanticError(`Attempted to call a function which was less pure than its containing environment.`, fnExpr.pos)
    }

    // Check purity annotation
    if (getPurityLevel(fnTypeData.purity) !== getPurityLevel(callWithPurity)) {
      const purityAnnotationMsgs = { PURE: 'not use any purity annotations', GETS: 'use "get"', NONE: 'use "run"' }
      throw new SemanticError(`Attempted to do this function call with the wrong purity annotation. You must ${purityAnnotationMsgs[fnTypeData.purity]}`, pos)
    }

    // Make generic return type into concrete type
    let returnType = Type.fillGenericParams(fnTypeData.bodyType, {
      getReplacement(type) {
        const concreteType = valuesOfGenericParams.get(type.parameterSentinel)
        if (!concreteType) throw new SemanticError(`Uncertain what the return type is. Please explicitly pass in type parameters to help us determine it.`, pos)
        return concreteType
      }
    })
    return { respState: RespState.merge(fnRespState, ...argRespStates), type: returnType }
  },
})

interface CallWithPermissionsOpts { purity: ValueOf<typeof PURITY>, invokeExpr: InvokeNode }
export const callWithPermissions = (pos: Position, { purity, invokeExpr }: CallWithPermissionsOpts) => Node.create({
  name: 'callWithPermissions',
  pos,
  exec: rt => invokeExpr.exec(rt),
  typeCheck: state => {
    if (invokeExpr.data?.['type'] !== 'INVOKE') {
      throw new Error(`Internal Error: This expression received a purity annotation, but such annotations should only be used on function calls.`)
    }
    return invokeExpr.typeCheck(state, { callWithPurity: purity })
  }
})

interface ReturnOpts { value: Node }
export const return_ = (pos: Position, { value }: ReturnOpts) => Node.create({
  name: 'return',
  pos,
  exec: rt => {
    const returnValue = value.exec(rt)
    throw new FlowControlReturnError({ returnValue })
  },
  typeCheck: state => {
    if (state.isBeginBlock) throw new SemanticError('Can not use a return outside of a function.', pos)
    const { respState, type } = value.typeCheck(state)
    const newRespState = RespState.update(respState, { returnTypes: [...respState.returnTypes, { type, pos }] })
    return { respState: newRespState, type: types.createNever() }
  },
})

interface BranchOpts { condition: Node, ifSo: Node, ifNot: Node }
export const branch = (pos: Position, { condition, ifSo, ifNot }: BranchOpts) => Node.create({
  name: 'branch',
  pos,
  exec: rt => {
    const result = condition.exec(rt)
    return result.raw ? ifSo.exec(rt) : ifNot.exec(rt)
  },
  typeCheck: state => {
    const { respState: condRespState, type: condType } = condition.typeCheck(state)
    Type.assertTypeAssignableTo(condType, types.createBoolean(), condition.pos)
    const { respState: ifSoRespState, type: ifSoType } = ifSo.typeCheck(state)
    const { respState: ifNotRespState, type: ifNotType } = ifNot.typeCheck(state)

    const biggerType = Type.getWiderType(ifSoType, ifNotType, `The following "if true" case of this condition has the type "${Type.repr(ifSoType)}", which is incompatible with the "if not" case's type, "${Type.repr(ifNotType)}".`, ifSo.pos)
    return { respState: RespState.merge(condRespState, ifSoRespState, ifNotRespState), type: biggerType }
  },
})

interface MatchOpts { matchValue: Node, matchArms: { pattern: AssignmentTargetNode, body: Node }[] }
export const match = (pos: Position, { matchValue, matchArms }: MatchOpts) => Node.create({
  name: 'match',
  pos,
  exec: rt => {
    const value = matchValue.exec(rt)
    for (const { pattern, body } of matchArms) {
      const maybeBindings = pattern.exec(rt, { incomingValue: value, allowFailure: true })
      if (maybeBindings) {
        rt = Runtime.update(rt, { scopes: [...rt.scopes, ...maybeBindings] })
        return body.exec(rt)
      }
    }
    throw new RuntimeError('No patterns matched.')
  },
  typeCheck: state => {
    const { respState, type } = matchValue.typeCheck(state)
    const respStates = [respState]
    let overallType: AnyType | null = null
    for (const { pattern, body } of matchArms) {
      const { respState: respState2 } = pattern.typeCheck(state, { incomingType: type, allowWidening: true })
      respStates.push(RespState.update(respState2, { declarations: [] }))
      const bodyState = TypeState.applyDeclarations(state, respState2)
      const bodyType = body.typeCheck(bodyState).type
      if (!overallType) {
        overallType = bodyType
        continue
      }
      overallType = Type.getWiderType(overallType, bodyType, `The following match arm's result has the type "${Type.repr(bodyType)}", which is incompatible with the type of previous match arms, "${Type.repr(overallType)}".`, DUMMY_POS)
    }
    return { respState: RespState.merge(...respStates), type: overallType }
  },
})

interface IdentifierOpts { identifier: string }
export const identifier = (pos: Position, { identifier }: IdentifierOpts) => Node.create({
  name: 'identifier',
  pos,
  exec: rt => {
    const foundVar = Runtime.lookupVar(rt, identifier)
    if (!foundVar) throw new Error(`INTERNAL ERROR: Identifier "${identifier}" not found`)
    return foundVar
  },
  typeCheck: state => {
    const result = TypeState.lookupVar(state, identifier)
    if (!result) throw new SemanticError(`Attempted to access undefined variable ${identifier}`, pos)
    const { type, fromOuterScope } = result
    const respState = RespState.create({ outerScopeVars: fromOuterScope ? [identifier] : [] })
    return { respState, type }
  },
})

interface TypeAlias { name: string, getType: TypeGetter, definedWithin: Node, typePos: Position }
export const typeAlias = (pos: Position, { name, getType, definedWithin, typePos }: TypeAlias) => Node.create({
  name: 'typeAlias',
  pos,
  exec: rt => definedWithin.exec(rt),
  typeCheck: state => {
    getType(state, typePos) // Make sure there's no errors
    return definedWithin.typeCheck(TypeState.addToTypeScope(state, name, () => getType(state, typePos), pos))
  },
})

// tag: (pos, { genericDefList, getType, typePos }) => tools.node({
//   pos,
//   exec: rt => ,
//   typeCheck: state => {
//     // const type = getType(pos, typePos)
//     throw new Error('Not Implemented')
//   },
// }),

interface IndividualDeclaration { expr: Node, assignmentTarget: AssignmentTargetNode, assignmentTargetPos: Position }
interface DeclarationOpts { declarations: IndividualDeclaration[], expr: Node, newScope: boolean }
export const declaration = (pos: Position, { declarations, expr, newScope = false }: DeclarationOpts) => Node.create({
  name: 'declaration',
  pos,
  exec: rt => {
    for (const decl of declarations) {
      const value = decl.expr.exec(rt)
      const bindings = decl.assignmentTarget.exec(rt, { incomingValue: value })
      rt = bindings.reduce((rt, { identifier, value }) => (
        Runtime.update(rt, { scopes: [...rt.scopes, { identifier, value }] })
      ), rt)
    }
    return expr.exec(rt)
  },
  typeCheck: outerState => {
    let state = newScope
      ? TypeState.update(outerState, {
        scopes: [...outerState.scopes, new Map()],
        definedTypes: [...outerState.definedTypes, new Map()],
      })
      : outerState

    const respStates = []
    for (const decl of declarations) {
      const { respState, type } = decl.expr.typeCheck(state)
      respStates.push(respState)
      const { respState: respState2 } = decl.assignmentTarget.typeCheck(state, { incomingType: type })
      respStates.push(RespState.update(respState2, { declarations: [] }))
      state = TypeState.applyDeclarations(state, respState2)
    }
    return { respState: RespState.merge(...respStates), type: expr.typeCheck(state).type }
  },
})