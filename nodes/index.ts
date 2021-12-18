import path from 'path'
import type { Token } from 'moo'
import * as AstRoot from './variants/Root';
import * as InstructionNode from './variants/InstructionNode';
import * as AssignmentTargetNode from './variants/AssignmentTargetNode';
import {
  assertBigInt,
  assertRawRecordValue,
  assertRecordInnerDataType,
  assertRawFunctionValue,
  assertFunctionInnerDataType,
  assertTagInnerDataType,
} from './helpers/typeAssertions';
import { RuntimeError, SemanticError, FlowControlReturnError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as RtRespState from '../language/RtRespState'
import * as values from '../language/values'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY, getPurityLevel } from '../language/constants'
import { zip, zip3 } from '../util'
export * as value from './value'
export * as assignmentTarget from './assignmentTarget'

type AnyInstructionNode = InstructionNode.AnyInstructionNode
type AnyAssignmentTargetNode = AssignmentTargetNode.AnyAssignmentTargetNode
// type InvokeNode = Node.InvokeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

type TypeGetter = (TypeState, Position) => AnyType
type ValueOf<T> = T[keyof T]

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

const top = <T>(array: readonly T[]): T => array[array.length - 1]

// FIXME: There's stuff in grammer.ne that's reaching through other node's data, to calculate dependencies.

interface RootOpts { content: AnyInstructionNode, dependencies: readonly string[] }
export const root = ({ content, dependencies }: RootOpts) => AstRoot.create({
  dependencies: [...new Set(dependencies)],
  ast: content,
  exec: ({ behaviors = {}, moduleDefinitions, cachedModules = { mutable: new Map() }, stdLib }) => {
    const rt = Runtime.create({ behaviors, moduleDefinitions, cachedModules, stdLib })
    const { rtRespState } = InstructionNode.exec(content, rt)

    const nameToType = new Map([...rtRespState.exports.entries()].map(([name, value]) => [name, value.type]))
    return values.createRecord(rtRespState.exports, types.createRecord({ nameToType }))
  },
  typeCheck: ({ behaviors = {}, moduleDefinitions, moduleShapes, importStack, stdLibShape, isMainModule = null }) => {
    const state = TypeState.create({ behaviors, moduleDefinitions, isMainModule: isMainModule ?? importStack.length === 1, moduleShapes, importStack, stdLibShape })
    const { respState } = InstructionNode.typeCheck(content, state)
    return respState.moduleShape
  }
})

interface BeginBlockPayload { content: AnyInstructionNode }
export const beginBlock = (pos: Position, content: AnyInstructionNode) =>
  InstructionNode.create<BeginBlockPayload, {}>('beginBlock', pos, { content })

// FIXME: Maybe I want to pass the `pos` arg in via state, or elsewhere, instead of pretending its part of the payload.
InstructionNode.register<BeginBlockPayload, {}>('beginBlock', {
  exec: (rt, { content }) => InstructionNode.exec(content, rt),
  typeCheck: (state, { pos, content }) => {
    if (!state.isMainModule) throw new SemanticError('Can not use a begin block in an imported module', pos)
    return InstructionNode.typeCheck(content, TypeState.update(state, {
      minPurity: PURITY.none,
      isBeginBlock: true,
    }))
  },
})

interface BlockPayload { content: AnyInstructionNode }
export const block = (pos: Position, { content }: BlockPayload) =>
  InstructionNode.create<BlockPayload, {}>('block', pos, { content })

InstructionNode.register<BlockPayload, {}>('block', {
  exec: (rt, { content }) => {
    const { rtRespState } = InstructionNode.exec(content, rt)
    return { rtRespState, value: values.createUnit() }
  },
  typeCheck: (outerState, { content }) => {
    let state = TypeState.update(outerState, {
      scopes: [...outerState.scopes, { forFn: top(outerState.scopes).forFn, typeLookup: new Map() }],
      definedTypes: [...outerState.definedTypes, new Map()],
    })
    const { respState, type: contentType } = InstructionNode.typeCheck(content, state)
    const type = types.isEffectivelyNever(contentType) ? types.createNever() : types.createUnit()
    return { respState, type }
  },
})

// FIXME: createWithNoPos is a placeholder name. I need to figure out how this is actually different from other pos nodes to get a better name (and make sure it really doesn't need a pos)
interface SequencePayload { statements: readonly AnyInstructionNode[] }
export const sequence = (statements: readonly AnyInstructionNode[]) =>
  InstructionNode.createWithNoPos<SequencePayload, {}>('sequence', { statements })

InstructionNode.register<SequencePayload, {}>('sequence', {
  exec: (rt, { statements }) => {
    const rtRespStates = statements.map(statement => InstructionNode.exec(statement, rt).rtRespState)
    return { rtRespState: RtRespState.merge(...rtRespStates), value: values.createUnit() }
  },
  typeCheck: (state, { statements }) => {
    const typeChecks = statements.map(statement => InstructionNode.typeCheck(statement, state))
    const respStates = typeChecks.map(x => x.respState)
    const type = typeChecks.find(x => types.isEffectivelyNever(x.type)) ? types.createNever() : types.createUnit()
    return { respState: RespState.merge(...respStates), type }
  },
})

interface NoopPayload {}
export const noop = () =>
  InstructionNode.createWithNoPos<NoopPayload, {}>('noop', {})

InstructionNode.register<NoopPayload, {}>('noop', {
  exec: rt => ({ rtRespState: RtRespState.create(), value: values.createUnit() }),
  typeCheck: state => {
    const respState = RespState.create()
    const type = types.createUnit()
    return { respState, type }
  },
})

interface PrintPayload { r: AnyInstructionNode }
export const print = (pos: Position, { r }: PrintPayload) =>
  InstructionNode.create<PrintPayload, {}>('print', pos, { r })

InstructionNode.register<PrintPayload, {}>('print', {
  exec: (rt, { r }) => {
    const { rtRespState, value } = InstructionNode.exec(r, rt)
    rt.behaviors.showDebugOutput(value)
    return { rtRespState, value }
  },
  typeCheck: (state, { r }) => InstructionNode.typeCheck(r, state),
})

interface PrintTypePayload { r: AnyInstructionNode }
export const printType = (pos: Position, { r }: PrintTypePayload) =>
  InstructionNode.create<PrintTypePayload, {}>('printType', pos, { r })

InstructionNode.register<PrintTypePayload, {}>('printType', {
  exec: (rt, { r }) => InstructionNode.exec(r, rt),
  typeCheck: (state, { r }) => {
    const { respState, type } = InstructionNode.typeCheck(r, state)
    state.behaviors.showDebugTypeOutput(type)
    return { respState, type }
  },
})

interface EqualsPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const equals = (pos: Position, { l, r }: EqualsPayload) =>
  InstructionNode.create<EqualsPayload, {}>('equals', pos, { l, r })

InstructionNode.register<EqualsPayload, {}>('equals', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createBoolean(lRes.value.raw === rRes.value.raw),
    }
  },
  typeCheck: (state, { l, r }) => {
    const { respState: lRespState, type: lType } = InstructionNode.typeCheck(l, state)
    const { respState: rRespState, type: rType } = InstructionNode.typeCheck(r, state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createBoolean() }
  },
})

interface NotEqualPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const notEqual = (pos: Position, { l, r }: NotEqualPayload) =>
  InstructionNode.create<NotEqualPayload, {}>('notEqual', pos, { l, r })

InstructionNode.register<NotEqualPayload, {}>('notEqual', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createBoolean(lRes.value.raw !== rRes.value.raw),
    }
  },
  typeCheck: (state, { l, r }) => {
    const { respState: lRespState, type: lType } = InstructionNode.typeCheck(l, state)
    const { respState: rRespState, type: rType } = InstructionNode.typeCheck(r, state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createBoolean() }
  },
})

interface AddPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const add = (pos: Position, { l, r }: AddPayload) =>
  InstructionNode.create<AddPayload, {}>('add', pos, { l, r })

InstructionNode.register<AddPayload, {}>('add', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createInt(
        assertBigInt(lRes.value.raw) + assertBigInt(rRes.value.raw)
      ),
    }
  },
  typeCheck: (state, { l, r }) => {
    const { respState: lRespState, type: lType } = InstructionNode.typeCheck(l, state)
    const { respState: rRespState, type: rType } = InstructionNode.typeCheck(r, state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface SubtractPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const subtract = (pos: Position, { l, r }: SubtractPayload) =>
  InstructionNode.create<SubtractPayload, {}>('subtract', pos, { l, r })

InstructionNode.register<SubtractPayload, {}>('subtract', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createInt(
        assertBigInt(lRes.value.raw) - assertBigInt(rRes.value.raw)
      ),
    }
  },
  typeCheck: (state, { l, r }) => {
    const { respState: lRespState, type: lType } = InstructionNode.typeCheck(l, state)
    const { respState: rRespState, type: rType } = InstructionNode.typeCheck(r, state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface MultiplyPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const multiply = (pos: Position, { l, r }: MultiplyPayload) =>
  InstructionNode.create<MultiplyPayload, {}>('multiply', pos, { l, r })

InstructionNode.register<MultiplyPayload, {}>('multiply', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createInt(
        assertBigInt(lRes.value.raw) * assertBigInt(rRes.value.raw)
      ),
    }
  },
  typeCheck: (state, { l, r }) => {
    const { respState: lRespState, type: lType } = InstructionNode.typeCheck(l, state)
    const { respState: rRespState, type: rType } = InstructionNode.typeCheck(r, state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface PowerPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const power = (pos: Position, { l, r }: PowerPayload) =>
  InstructionNode.create<PowerPayload, {}>('power', pos, { l, r })

InstructionNode.register<PowerPayload, {}>('power', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createInt(
        assertBigInt(lRes.value.raw) ** assertBigInt(rRes.value.raw)
      ),
    }
  },
  typeCheck: (state, { l, r }) => {
    const { respState: lRespState, type: lType } = InstructionNode.typeCheck(l, state)
    const { respState: rRespState, type: rType } = InstructionNode.typeCheck(r, state)
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { respState: RespState.merge(lRespState, rRespState), type: types.createInt() }
  },
})

interface PropertyAccessPayload { l: AnyInstructionNode, identifier: string }
export const propertyAccess = (pos: Position, { l, identifier }: PropertyAccessPayload) =>
  InstructionNode.create<PropertyAccessPayload, {}>('propertyAccess', pos, { l, identifier })

InstructionNode.register<PropertyAccessPayload, {}>('propertyAccess', {
  exec: (rt, { l, identifier }) => {
    const lRes = InstructionNode.exec(l, rt)
    const nameToValue = assertRawRecordValue(lRes.value.raw)
    if (!nameToValue.has(identifier)) throw new Error(`Internal Error: Expected to find the identifier "${identifier}" on a record, and that identifier did not exist`)
    return { rtRespState: lRes.rtRespState, value: nameToValue.get(identifier) }
  },
  typeCheck: (state, { pos, l, identifier }) => {
    const { respState, type: lType } = InstructionNode.typeCheck(l, state)
    Type.assertTypeAssignableTo(lType, types.createRecord({ nameToType: new Map() }), l.pos, `Found type ${Type.repr(lType)} but expected a record.`)
    const result = assertRecordInnerDataType(Type.getConstrainingType(lType).data).nameToType.get(identifier)
    if (!result) throw new SemanticError(`Failed to find the identifier "${identifier}" on the record of type ${Type.repr(lType)}.`, pos)
    return { respState, type: result }
  },
})

interface TypeAssertionPayload { expr: AnyInstructionNode, getType: TypeGetter, typePos: Position, operatorAndTypePos: Position }
interface TypeAssertionTypePayload { finalType: AnyType }
export const typeAssertion = (pos: Position, { expr, getType, typePos, operatorAndTypePos }: TypeAssertionPayload) =>
  InstructionNode.create<TypeAssertionPayload, TypeAssertionTypePayload>('typeAssertion', pos, { expr, typePos, getType, operatorAndTypePos })

InstructionNode.register<TypeAssertionPayload, TypeAssertionTypePayload>('typeAssertion', {
  exec: (rt, { expr, finalType }) => {
    const { rtRespState, value } = InstructionNode.exec(expr, rt)
    if (!Type.isTypeAssignableTo(value.type, finalType)) {
      throw new RuntimeError(`"as" type assertion failed - failed to convert a type from "${Type.repr(value.type)}" to ${Type.repr(finalType)}`)
    }
    return { rtRespState, value }
  },
  typeCheck: (state, { expr, getType, typePos, operatorAndTypePos }) => {
    const { respState, type } = InstructionNode.typeCheck(expr, state)
    const finalType = getType(state, typePos)
    if (!Type.isTypeAssignableTo(finalType, type) && !Type.isTypeAssignableTo(type, finalType)) {
      throw new SemanticError(`Attempted to change a type from "${Type.repr(type)}" to type "${Type.repr(finalType)}". "as" type assertions can only widen or narrow a provided type.`, operatorAndTypePos)
    }
    return { respState, type: finalType, typePayload: { finalType } }
  },
})

interface GenericParam { getType: TypeGetter, pos: Position }
interface InvokePayload { fnExpr: AnyInstructionNode, genericParams: GenericParam[], args: AnyInstructionNode[], callWithPurity: typeof PURITY[keyof typeof PURITY] }
// FIXME: The callWithPurity payload entry gets mutated by an outside source to pass information along. This should instead be an event that gets passed along.
export const invoke = (pos: Position, { fnExpr, genericParams, args }: InvokePayload) =>
  InstructionNode.create<InvokePayload, {}>('invoke', pos, { fnExpr, genericParams, args, callWithPurity: PURITY.pure })

InstructionNode.register<InvokePayload, {}>('invoke', {
  exec: (outerRt, { fnExpr, args }) => {
    const fnExprRes = InstructionNode.exec(fnExpr, outerRt)
    const fn = assertRawFunctionValue(fnExprRes.value.raw)
    let rt = Runtime.update(outerRt, { scopes: fn.capturedScope })
    const argResults = args.map(arg => InstructionNode.exec(arg, outerRt))
    for (const [param, value] of zip(fn.params, argResults.map(res => res.value))) {
      const allBindings = AssignmentTargetNode.exec(param, rt, { incomingValue: value })
      rt = Runtime.update(rt, { scopes: [...rt.scopes, ...allBindings] })
    }
    let bodyRes
    try {
      bodyRes = InstructionNode.exec(fn.body, rt)
    } catch (err) {
      if (!(err instanceof FlowControlReturnError)) throw err
      return { rtRespState: RtRespState.create(), value: err.data.returnValue }
    }
    return {
      rtRespState: RtRespState.merge(fnExprRes.rtRespState, bodyRes.rtRespState, ...argResults.map(x => x.rtRespState)),
      value: bodyRes.value,
    }
  },
  typeCheck: (state, { pos, fnExpr, genericParams, args, callWithPurity }) => {
    const { respState: fnRespState, type: fnType } = InstructionNode.typeCheck(fnExpr, state)
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
    for (const [assignerGenericParam, assigneeGenericParam] of zip(genericParams, fnTypeData.genericParamTypes.slice(0, genericParams.length))) {
      const type = assignerGenericParam.getType(state, assignerGenericParam.pos)
      Type.assertTypeAssignableTo(type, assigneeGenericParam.constrainedBy, assignerGenericParam.pos)
      valuesOfGenericParams.set(assigneeGenericParam.parameterSentinel, type)
    }

    // Type check args
    const argsTypeChecked = args.map(p => InstructionNode.typeCheck(p, state))
    const argTypes = argsTypeChecked.map(p => p.type)
    const argRespStates = argsTypeChecked.map(p => p.respState)
    if (fnTypeData.paramTypes.length !== argTypes.length) {
      throw new SemanticError(`Found ${argTypes.length} parameter(s) but expected ${fnTypeData.paramTypes.length}.`, pos)
    }
    for (const [arg, assignerParamType, assigneeParamType] of zip3(args, argTypes, fnTypeData.paramTypes)) {
      // Eventually I need to derive positions from arg.pos

      // Check that it uses generics properly
      Type.matchUpGenerics(assigneeParamType, {
        usingType: assignerParamType,
        onGeneric({ self, other }) {
          const genericValue = valuesOfGenericParams.get(self.parameterSentinel)
          if (!genericValue) {
            Type.assertTypeAssignableTo(other, self.constrainedBy, DUMMY_POS)
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

interface CallWithPermissionsPayload { purity: ValueOf<typeof PURITY>, invokeExpr: AnyInstructionNode }
export const callWithPermissions = (pos: Position, { purity, invokeExpr }: CallWithPermissionsPayload) =>
  InstructionNode.create<CallWithPermissionsPayload, {}>('callWithPermissions', pos, { purity, invokeExpr })

InstructionNode.register<CallWithPermissionsPayload, {}>('callWithPermissions', {
  exec: (rt, { invokeExpr }) => InstructionNode.exec(invokeExpr, rt),
  typeCheck: (state, { purity, invokeExpr }) => {
    if (invokeExpr.name !== 'invoke') { // FIXME: I'm reaching through to make this assertion
      throw new Error(`Internal Error: This expression received a purity annotation, but such annotations should only be used on function calls.`)
    }
    (invokeExpr.payload as any).callWithPurity = purity // FIXME: I should not be modifying this
    return InstructionNode.typeCheck(invokeExpr, state)
  }
})

interface ReturnPayload { value: AnyInstructionNode }
export const return_ = (pos: Position, { value }: ReturnPayload) =>
  InstructionNode.create<ReturnPayload, {}>('return', pos, { value })

InstructionNode.register<ReturnPayload, {}>('return', {
  exec: (rt, { value }) => {
    const returnValue = InstructionNode.exec(value, rt)
    throw new FlowControlReturnError({ returnValue: returnValue.value })
  },
  typeCheck: (state, { pos, value }) => {
    if (state.isBeginBlock) throw new SemanticError('Can not use a return outside of a function.', pos)
    const { respState, type } = InstructionNode.typeCheck(value, state)
    const newRespState = RespState.update(respState, { returnTypes: [...respState.returnTypes, { type, pos }] })
    return { respState: newRespState, type: types.createNever() }
  },
})

interface BranchPayload { condition: AnyInstructionNode, ifSo: AnyInstructionNode, ifNot: AnyInstructionNode }
export const branch = (pos: Position, { condition, ifSo, ifNot }: BranchPayload) =>
  InstructionNode.create<BranchPayload, {}>('branch', pos, { condition, ifSo, ifNot })

InstructionNode.register<BranchPayload, {}>('branch', {
  exec: (rt, { condition, ifSo, ifNot }) => {
    const conditionRes = InstructionNode.exec(condition, rt)
    const finalValueRes = conditionRes.value.raw ? InstructionNode.exec(ifSo, rt) : InstructionNode.exec(ifNot, rt)
    return {
      rtRespState: RtRespState.merge(conditionRes.rtRespState, finalValueRes.rtRespState),
      value: finalValueRes.value,
    }
  },
  typeCheck: (state, { condition, ifSo, ifNot }) => {
    const { respState: condRespState, type: condType } = InstructionNode.typeCheck(condition, state)
    Type.assertTypeAssignableTo(condType, types.createBoolean(), condition.pos)
    const { respState: ifSoRespState, type: ifSoType } = InstructionNode.typeCheck(ifSo, state)
    const { respState: ifNotRespState, type: ifNotType } = InstructionNode.typeCheck(ifNot, state)

    const biggerType = Type.getWiderType([ifSoType, ifNotType], `The following "if true" case of this condition has the type "${Type.repr(ifSoType)}", which is incompatible with the "if not" case's type, "${Type.repr(ifNotType)}".`, ifSo.pos)
    return { respState: RespState.merge(condRespState, ifSoRespState, ifNotRespState), type: biggerType }
  },
})

interface MatchPayload { matchValue: AnyInstructionNode, matchArms: { pattern: AnyAssignmentTargetNode, body: AnyInstructionNode }[] }
export const match = (pos: Position, { matchValue, matchArms }: MatchPayload) =>
  InstructionNode.create<MatchPayload, {}>('match', pos, { matchValue, matchArms })

InstructionNode.register<MatchPayload, {}>('match', {
  exec: (rt, { matchValue, matchArms }) => {
    const { rtRespState, value } = InstructionNode.exec(matchValue, rt)
    for (const { pattern, body } of matchArms) {
      const maybeBindings = AssignmentTargetNode.exec(pattern, rt, { incomingValue: value, allowFailure: true })
      if (maybeBindings) {
        rt = Runtime.update(rt, { scopes: [...rt.scopes, ...maybeBindings] })
        const result = InstructionNode.exec(body, rt)
        return {
          rtRespState: RtRespState.merge(rtRespState, result.rtRespState),
          value: result.value,
        }
      }
    }
    throw new RuntimeError('No patterns matched.')
  },
  typeCheck: (state, { matchValue, matchArms }) => {
    const { respState, type } = InstructionNode.typeCheck(matchValue, state)
    const respStates = [respState]
    let overallType: AnyType | null = null
    for (const { pattern, body } of matchArms) {
      const { respState: respState2 } = AssignmentTargetNode.typeCheck(pattern, state, { incomingType: type, allowWidening: true, export: false })
      respStates.push(RespState.update(respState2, { declarations: [] }))
      const bodyState = TypeState.applyDeclarations(state, respState2)
      const bodyType = InstructionNode.typeCheck(body, bodyState).type
      if (!overallType) {
        overallType = bodyType
        continue
      }
      overallType = Type.getWiderType([overallType, bodyType], `The following match arm's result has the type "${Type.repr(bodyType)}", which is incompatible with the type of previous match arms, "${Type.repr(overallType)}".`, DUMMY_POS)
    }
    return { respState: RespState.merge(...respStates), type: overallType }
  },
})

interface ImportOpts { from: string }
interface ImportPayload { rawFrom: string }
interface ImportTypePayload { absoluteFrom: string }
export const import_ = (pos: Position, { from: rawFrom }: ImportOpts) =>
  InstructionNode.create<ImportPayload, ImportTypePayload>('import', pos, { rawFrom })

InstructionNode.register<ImportPayload, ImportTypePayload>('import', {
  exec: (rt, { absoluteFrom: from_ }) => {
    if (rt.cachedModules.mutable.has(from_)) {
      return { rtRespState: RtRespState.create(), value: rt.cachedModules.mutable.get(from_) }
    }

    const moduleInfo = rt.moduleDefinitions.get(from_)
    if (!moduleInfo) throw new Error()

    const module = moduleInfo.exec({
      behaviors: rt.behaviors,
      moduleDefinitions: rt.moduleDefinitions,
      cachedModules: rt.cachedModules,
      stdLib: rt.stdLib,
    })
    rt.cachedModules.mutable.set(from_, module)

    return { rtRespState: RtRespState.create(), value: module }
  },
  typeCheck: (state, { pos, rawFrom }) => {
    // §dIPUB - search for a similar implementation that's used elsewhere
    const calcAbsoluteNormalizedPath = (rawPath: string, state: TypeState) => (
      path.normalize(path.join(path.dirname(top(state.importStack)), rawPath))
    )

    const from_ = calcAbsoluteNormalizedPath(rawFrom, state)
    const typePayload = { absoluteFrom: from_ }
    if (state.importStack.includes(from_)) {
      throw new SemanticError('Circular dependency detected', pos)
    }
    if (state.moduleShapes.mutable.has(from_)) {
      return { respState: RespState.create(), type: state.moduleShapes.mutable.get(from_), typePayload }
    }

    const module = state.moduleDefinitions.get(from_)
    if (!module) throw new Error()
    const type = module.typeCheck({
      behaviors: state.behaviors,
      moduleDefinitions: state.moduleDefinitions,
      moduleShapes: state.moduleShapes,
      importStack: [...state.importStack, from_],
      stdLibShape: state.stdLibShape,
    })
    state.moduleShapes.mutable.set(from_, type)

    return { respState: RespState.create(), type, typePayload }
  },
})

// Used to provide information about an import statement nested within.
// FIXME: Is there a better way to handle this? Probably not.
interface ImportMetaOpts { from: string, childNode: AnyInstructionNode }
interface ImportMetaPayload { dependency: string, childNode: AnyInstructionNode }
export const importMeta = (pos: Position, { from: from_, childNode }: ImportMetaOpts) =>
  InstructionNode.create<ImportMetaPayload, {}>('importMeta', pos, { dependency: from_, childNode })

InstructionNode.register<ImportMetaPayload, {}>('importMeta', {
  exec: (rt, { childNode }) => InstructionNode.exec(childNode, rt),
  typeCheck: (state, { childNode }) => InstructionNode.typeCheck(childNode, state),
})

interface VarLookupPayload { identifier: string }
export const varLookup = (pos: Position, { identifier }: VarLookupPayload) =>
  InstructionNode.create<VarLookupPayload, {}>('varLookup', pos, { identifier })

InstructionNode.register<VarLookupPayload, {}>('varLookup', {
  exec: (rt, { identifier }) => {
    const foundVar = Runtime.lookupVar(rt, identifier)
    if (!foundVar) throw new Error(`INTERNAL ERROR: Identifier "${identifier}" not found`)
    return { rtRespState: RtRespState.create(), value: foundVar }
  },
  typeCheck: (state, { pos, identifier }) => {
    const result = TypeState.lookupVar(state, identifier)
    if (!result) throw new SemanticError(`Attempted to access undefined variable ${identifier}`, pos)
    const { type, fromOuterFn } = result
    const respState = RespState.create({ outerFnVars: fromOuterFn ? [identifier] : [] })
    return { respState, type }
  },
})

export const stdLibRef = (pos: Position) =>
  InstructionNode.create<{}, {}>('stdLib', pos, {})

InstructionNode.register<{}, {}>('stdLib', {
  exec: rt => ({ rtRespState: RtRespState.create(), value: rt.stdLib }),
  typeCheck: state => ({ respState: RespState.create(), type: state.stdLibShape }),
})

interface TypeAliasPayload { name: string, getType: TypeGetter, definedWithin: AnyInstructionNode, typePos: Position }
export const typeAlias = (pos: Position, { name, getType, definedWithin, typePos }: TypeAliasPayload) =>
  InstructionNode.create<TypeAliasPayload, {}>('typeAlias', pos, { name, getType, definedWithin, typePos })

InstructionNode.register<TypeAliasPayload, {}>('typeAlias', {
  exec: (rt, { definedWithin }) => InstructionNode.exec(definedWithin, rt),
  typeCheck: (state, { pos, name, getType, definedWithin, typePos }) => {
    getType(state, typePos) // Make sure there's no errors
    return InstructionNode.typeCheck(definedWithin, TypeState.addToTypeScope(state, name, () => getType(state, typePos), pos))
  },
})

interface ApplyTagPayload { tag: AnyInstructionNode, content: AnyInstructionNode }
export const applyTag = (pos: Position, { tag, content }: ApplyTagPayload) =>
  InstructionNode.create<ApplyTagPayload, {}>('applyTag', pos, { tag, content })

InstructionNode.register<ApplyTagPayload, {}>('applyTag', {
  exec: (rt, { tag, content }) => {
    const { rtRespState: rtRespState1, value: tagValue } = InstructionNode.exec(tag, rt)
    const { rtRespState: rtRespState2, value: contentValue } = InstructionNode.exec(content, rt)
    assertTagInnerDataType(Type.assertIsConcreteType(tagValue.type).data)

    const finalType = types.createTagged({ tag: tagValue.type as types.TagType })
    return {
      rtRespState: RtRespState.merge(rtRespState1, rtRespState2),
      value: values.createTagged(contentValue, finalType),
    }
  },
  typeCheck: (state, { pos, tag, content }) => {
    const { respState: respState1, type: tagType } = InstructionNode.typeCheck(tag, state)
    const { respState: respState2, type: contentType } = InstructionNode.typeCheck(content, state)

    Type.assertTypeAssignableTo(contentType, assertTagInnerDataType(Type.assertIsConcreteType(tagType).data).boxedType, pos)
    const type = types.createTagged({ tag: tagType as types.TagType })
    return {
      respState: RespState.merge(respState1, respState2),
      type,
    }
  },
})

interface IndividualDeclaration { expr: AnyInstructionNode, assignmentTarget: AnyAssignmentTargetNode, assignmentTargetPos: Position }
interface DeclarationPayload { export?: boolean, declarations: IndividualDeclaration[], nextExpr: AnyInstructionNode, newScope: boolean }
export const declaration = (pos: Position, { export: export_ = false, declarations, nextExpr, newScope = false }: DeclarationPayload) =>
  InstructionNode.create<DeclarationPayload, {}>('declaration', pos, { export: export_, declarations, nextExpr, newScope })

InstructionNode.register<DeclarationPayload, {}>('declaration', {
  exec: (rt, { export: export_, declarations, nextExpr }) => {
    const rtRespStates = []
    for (const decl of declarations) {
      const { rtRespState, value } = InstructionNode.exec(decl.expr, rt)
      rtRespStates.push(rtRespState)
      const bindings = AssignmentTargetNode.exec(decl.assignmentTarget, rt, { incomingValue: value })
      rtRespStates.push(RtRespState.create({
        exports: new Map(!export_ ? [] : bindings.map(({ identifier, value }) => [identifier, value])),
      }))
      rt = bindings.reduce((rt, { identifier, value }) => (
        Runtime.update(rt, { scopes: [...rt.scopes, { identifier, value }] })
      ), rt)
    }

    const nextExprRes = InstructionNode.exec(nextExpr, rt)
    return {
      rtRespState: RtRespState.merge(...rtRespStates, nextExprRes.rtRespState),
      value: nextExprRes.value,
    }
  },
  typeCheck: (outerState, { pos, export: export_, declarations, nextExpr, newScope }) => {
    if (outerState.isMainModule && export_) throw new SemanticError('Can not export from a main module', pos)
    let state = newScope
      ? TypeState.update(outerState, {
        scopes: [...outerState.scopes, { forFn: top(outerState.scopes).forFn, typeLookup: new Map() }],
        definedTypes: [...outerState.definedTypes, new Map()],
      })
      : outerState

    const respStates = []
    for (const decl of declarations) {
      const { respState, type } = InstructionNode.typeCheck(decl.expr, state)
      respStates.push(respState)
      const { respState: respState2 } = AssignmentTargetNode.typeCheck(decl.assignmentTarget, state, { incomingType: type, export: export_ })
      respStates.push(RespState.update(respState2, { declarations: [] }))
      state = TypeState.applyDeclarations(state, respState2)
    }
    const next = InstructionNode.typeCheck(nextExpr, state)
    return { respState: RespState.merge(...respStates, next.respState), type: next.type }
  },
})