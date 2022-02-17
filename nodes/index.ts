import path from 'path'
import type { Token } from 'moo'
import * as AstApi from './variants/AstApi';
import * as InstructionNode from './variants/InstructionNode';
import * as AssignmentTargetNode from './variants/AssignmentTargetNode';
import * as TypeNode from './variants/TypeNode';
import {
  assertBigInt,
  assertRawRecordValue,
  assertRecordInnerDataType,
  assertRawFunctionValue,
  assertFunctionInnerDataType,
  assertTagInnerDataType,
} from './helpers/typeAssertions';
import { initTypeChecking } from './helpers/typeCheckTools';
import { RuntimeError, SemanticError, FlowControlReturnError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as InwardTypeState from '../language/InwardTypeState'
import * as Runtime from '../language/Runtime'
import * as RtRespState from '../language/RtRespState'
import * as values from '../language/values'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY, getPurityLevel } from '../language/constants'
import { pipe, zip, zip3 } from '../util'
export * as value from './value'
export * as assignmentTarget from './assignmentTarget'
export * as type from './type'

type AnyInstructionNode = InstructionNode.AnyInstructionNode
type AnyAssignmentTargetNode = AssignmentTargetNode.AnyAssignmentTargetNode
type AnyTypeNode = TypeNode.AnyTypeNode
type Position = Position.Position
type Runtime = Runtime.Runtime
type AnyType = Type.AnyType

type ValueOf<T> = T[keyof T]

const DUMMY_POS = Position.from('<unknown>', { line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

const top = <T>(array: readonly T[]): T => array[array.length - 1]

interface CreateApiOpts { content: AnyInstructionNode, dependencies: readonly string[] }
export const createApi = ({ content, dependencies }: CreateApiOpts) => AstApi.create({
  dependencies: [...new Set(dependencies)],
  ast: content,
  // If this module is being imported, then the functions below won't be used, instead,
  // the code will just jump to using the "ast" property directly.
  // FIXME0: Maybe move these to be static functions, and get rid of this createApi thing entirely. I would need to deal with dependencies somehow.
  exec: ({ behaviors = {}, moduleDefinitions, cachedModules = { mutable: new Map() }, stdLib, typeCheckContexts }) => {
    const rt = Runtime.create({ behaviors, moduleDefinitions, cachedModules, stdLib, typeCheckContexts })
    const { rtRespState } = InstructionNode.exec(content, rt)

    const nameToType = new Map([...rtRespState.exports.entries()].map(([name, value]) => [name, value.type]))
    return values.createRecord({ nameToValue: rtRespState.exports, symbolToValue: new Map() }, types.createRecord({ nameToType, symbolToInfo: new Map() }))
  },
  typeCheck: ({ behaviors = {}, moduleDefinitions, importStack, stdLibShape, isMainModule = true }) => {
    const typeStateOpts = {
      behaviors,
      moduleDefinitions,
      isMainModule,
      importStack,
      stdLibShape,
    }
    const { typeCheckContexts, result: type } = initTypeChecking(typeStateOpts, (actions, inwardState) => {
      return actions.checkType(InstructionNode, content, inwardState).type as types.RecordType
    })
    return { typeCheckContexts, type }
  }
})

interface ModuleRootPayload { content: AnyInstructionNode }
export const moduleRoot = (pos: Position, payload: ModuleRootPayload) =>
  InstructionNode.create<ModuleRootPayload>('moduleRoot', pos, payload)

InstructionNode.register<ModuleRootPayload, {}>('moduleRoot', {
  exec: (rt, { content }) => InstructionNode.exec(content, rt),
  typeCheck: (actions, inwardState_) => ({ content }) => {
    const inwardState = InwardTypeState.update(inwardState_, { minPurity: PURITY.pure })
    const { respState } = actions.checkType(InstructionNode, content, inwardState)
    return { type: respState.moduleShape }
  },
})

interface BeginBlockPayload { content: AnyInstructionNode }
export const beginBlock = (pos: Position, content: AnyInstructionNode) =>
  InstructionNode.create<BeginBlockPayload>('beginBlock', pos, { content })

InstructionNode.register<BeginBlockPayload, {}>('beginBlock', {
  exec: (rt, { content }) => InstructionNode.exec(content, rt),
  typeCheck: (actions, inwardState) => ({ pos, content }) => {
    if (!inwardState.isMainModule) throw new SemanticError('Can not use a begin block in an imported module', pos)
    return pipe(
      InwardTypeState.update(inwardState, { minPurity: PURITY.none }),
      $=> actions.checkType(InstructionNode, content, $),
      $=> ({ type: $.type }),
    )
  },
})

interface BlockPayload { content: AnyInstructionNode }
export const block = (pos: Position, payload: BlockPayload) =>
  InstructionNode.create<BlockPayload>('block', pos, payload)

InstructionNode.register<BlockPayload, {}>('block', {
  exec: (rt, { content }) => {
    const { rtRespState } = InstructionNode.exec(content, rt)
    return { rtRespState, value: values.createUnit() }
  },
  typeCheck: (actions, inwardState) => ({ content }) => {
    return actions.follow.withScope({ forFn: actions.follow.getCurrentFnSymbol() }, () => {
      const contentType = actions.checkType(InstructionNode, content, inwardState).type
      const type = types.isEffectivelyNever(contentType) ? types.createNever() : types.createUnit()
      return { type }
    })
  },
})

// FIXME0: createWithNoPos is a placeholder name. I need to figure out how this is actually different from other pos nodes to get a better name (and make sure it really doesn't need a pos)
interface SequencePayload { statements: readonly AnyInstructionNode[] }
export const sequence = (pos: Position, statements: readonly AnyInstructionNode[]) =>
  InstructionNode.create<SequencePayload>('sequence', pos, { statements })

InstructionNode.register<SequencePayload, {}>('sequence', {
  exec: (rt, { statements }) => {
    const rtRespStates = statements.map(statement => InstructionNode.exec(statement, rt).rtRespState)
    return { rtRespState: RtRespState.merge(...rtRespStates), value: values.createUnit() }
  },
  typeCheck: (actions, inwardState) => ({ statements }) => {
    const typeChecks = statements.map(statement => actions.checkType(InstructionNode, statement, inwardState))
    return {
      type: typeChecks.find(x => types.isEffectivelyNever(x.type))
        ? types.createNever()
        : types.createUnit()
    }
  },
})

interface NoopPayload {}
export const noop = (pos: Position) =>
  InstructionNode.create<NoopPayload>('noop', pos, {})

InstructionNode.register<NoopPayload, {}>('noop', {
  exec: rt => ({ rtRespState: RtRespState.create(), value: values.createUnit() }),
  typeCheck: (actions, inwardState) => () => ({ type: types.createUnit() }),
})

interface PrintPayload { r: AnyInstructionNode }
export const print = (pos: Position, payload: PrintPayload) =>
  InstructionNode.create<PrintPayload>('print', pos, payload)

InstructionNode.register<PrintPayload, {}>('print', {
  exec: (rt, { r }) => {
    const { rtRespState, value } = InstructionNode.exec(r, rt)
    rt.behaviors.showDebugOutput(value)
    return { rtRespState, value }
  },
  typeCheck: (actions, inwardState) => ({ r }) => ({ type: actions.checkType(InstructionNode, r, inwardState).type }),
})

interface PrintTypePayload { r: AnyInstructionNode }
export const printType = (pos: Position, payload: PrintTypePayload) =>
  InstructionNode.create<PrintTypePayload>('printType', pos, payload)

InstructionNode.register<PrintTypePayload, {}>('printType', {
  exec: (rt, { r }) => InstructionNode.exec(r, rt),
  typeCheck: (actions, inwardState) => ({ r }) => {
    const type = actions.checkType(InstructionNode, r, inwardState).type
    inwardState.constants.behaviors.showDebugTypeOutput(type)
    return { type }
  },
})

interface ShowDebugOutputPayload { r: AnyInstructionNode }
export const showDebugOutput = (pos: Position, payload: ShowDebugOutputPayload) =>
  InstructionNode.create<ShowDebugOutputPayload>('showDebugOutput', pos, payload)

InstructionNode.register<ShowDebugOutputPayload, {}>('showDebugOutput', {
  exec: (rt, { r }) => {
    ;(globalThis?.debugExec as any)(rt)
    return InstructionNode.exec(r, rt)
  },
  typeCheck: (actions, inwardState) => ({ r }) => {
    ;(globalThis?.debugType as any)()
    return { type: actions.checkType(InstructionNode, r, inwardState).type }
  },
})

interface EqualsPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const equals = (pos: Position, payload: EqualsPayload) =>
  InstructionNode.create<EqualsPayload>('equals', pos, payload)

InstructionNode.register<EqualsPayload, {}>('equals', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createBoolean(lRes.value.raw === rRes.value.raw),
    }
  },
  typeCheck: (actions, inwardState) => ({ l, r }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    const rType = actions.checkType(InstructionNode, r, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { type: types.createBoolean() }
  },
})

interface NotEqualPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const notEqual = (pos: Position, payload: NotEqualPayload) =>
  InstructionNode.create<NotEqualPayload>('notEqual', pos, payload)

InstructionNode.register<NotEqualPayload, {}>('notEqual', {
  exec: (rt, { l, r }) => {
    const lRes = InstructionNode.exec(l, rt)
    const rRes = InstructionNode.exec(r, rt)
    return {
      rtRespState: RtRespState.merge(lRes.rtRespState, rRes.rtRespState),
      value: values.createBoolean(lRes.value.raw !== rRes.value.raw),
    }
  },
  typeCheck: (actions, inwardState) => ({ l, r }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    const rType = actions.checkType(InstructionNode, r, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { type: types.createBoolean() }
  },
})

interface AddPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const add = (pos: Position, payload: AddPayload) =>
  InstructionNode.create<AddPayload>('add', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ l, r }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    const rType = actions.checkType(InstructionNode, r, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { type: types.createInt() }
  },
})

interface SubtractPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const subtract = (pos: Position, payload: SubtractPayload) =>
  InstructionNode.create<SubtractPayload>('subtract', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ l, r }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    const rType = actions.checkType(InstructionNode, r, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { type: types.createInt() }
  },
})

interface MultiplyPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const multiply = (pos: Position, payload: MultiplyPayload) =>
  InstructionNode.create<MultiplyPayload>('multiply', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ l, r }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    const rType = actions.checkType(InstructionNode, r, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { type: types.createInt() }
  },
})

interface PowerPayload { l: AnyInstructionNode, r: AnyInstructionNode }
export const power = (pos: Position, payload: PowerPayload) =>
  InstructionNode.create<PowerPayload>('power', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ l, r }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    const rType = actions.checkType(InstructionNode, r, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createInt(), l.pos)
    Type.assertTypeAssignableTo(rType, types.createInt(), r.pos)
    return { type: types.createInt() }
  },
})

interface PropertyAccessPayload { l: AnyInstructionNode, identifier: string }
export const propertyAccess = (pos: Position, payload: PropertyAccessPayload) =>
  InstructionNode.create<PropertyAccessPayload>('propertyAccess', pos, payload)

InstructionNode.register<PropertyAccessPayload, {}>('propertyAccess', {
  exec: (rt, { l, identifier }) => {
    const lRes = InstructionNode.exec(l, rt)
    const { nameToValue } = assertRawRecordValue(lRes.value.raw)
    if (!nameToValue.has(identifier)) throw new Error(`Internal Error: Expected to find the identifier "${identifier}" on a record, and that identifier did not exist`)
    return { rtRespState: lRes.rtRespState, value: nameToValue.get(identifier) }
  },
  typeCheck: (actions, inwardState) => ({ pos, l, identifier }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }), l.pos, `Found type ${Type.repr(lType)} but expected a record.`)
    const result = assertRecordInnerDataType(Type.getConstrainingType(lType).data).nameToType.get(identifier)
    if (!result) throw new SemanticError(`Failed to find the identifier "${identifier}" on the record of type ${Type.repr(lType)}.`, pos)
    return { type: result }
  },
})

interface SymbolPropertyAccessPayload { l: AnyInstructionNode, symbolExprNode: AnyInstructionNode }
export const symbolPropertyAccess = (pos: Position, payload: SymbolPropertyAccessPayload) =>
  InstructionNode.create<SymbolPropertyAccessPayload>('symbolPropertyAccess', pos, payload)

InstructionNode.register<SymbolPropertyAccessPayload, {}>('symbolPropertyAccess', {
  exec: (rt, { l, symbolExprNode }) => {
    const { rtRespState: symbRtRespState, value: symbExpr } = InstructionNode.exec(symbolExprNode, rt)
    if (typeof symbExpr.raw !== 'symbol') throw new Error()
    const lRes = InstructionNode.exec(l, rt)
    const { symbolToValue } = assertRawRecordValue(lRes.value.raw)
    if (!symbolToValue.has(symbExpr.raw)) throw new Error(`Internal Error: Expected to find the identifier "${types.reprSymbolWithoutTypeText(symbExpr.type as any)}" on a record, and that identifier did not exist`)
    return {
      rtRespState: RtRespState.merge(symbRtRespState, lRes.rtRespState),
      value: symbolToValue.get(symbExpr.raw),
    }
  },
  typeCheck: (actions, inwardState) => ({ pos, l, symbolExprNode }) => {
    const lType = actions.checkType(InstructionNode, l, inwardState).type
    Type.assertTypeAssignableTo(lType, types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }), l.pos, `Found type ${Type.repr(lType)} but expected a record.`)
    // TODO: Not sure if I should use getConstrainingType() here.
    const symbType = Type.getConstrainingType(actions.checkType(InstructionNode, symbolExprNode, inwardState).type)
    if (!types.isSymbol(symbType)) {
      throw new SemanticError(`Only symbol types can be used in a dynamic property. Received type "${Type.repr(symbType)}".`, symbolExprNode.pos)
    }
    const result = pipe(
      Type.getConstrainingType(lType).data,
      $=> assertRecordInnerDataType($).symbolToInfo.get(symbType.data.value)?.type,
    )
    if (!result) throw new SemanticError(`Failed to find the symbol "${types.reprSymbolWithoutTypeText(symbType)}" on the record of type ${Type.repr(lType)}.`, pos)
    return { type: result }
  },
})

interface TypeAssertionPayload { expr: AnyInstructionNode, typeNode: AnyTypeNode, operatorAndTypePos: Position }
interface TypeAssertionTypePayload { finalType: AnyType }
export const typeAssertion = (pos: Position, payload: TypeAssertionPayload) =>
  InstructionNode.create<TypeAssertionPayload>('typeAssertion', pos, payload)

InstructionNode.register<TypeAssertionPayload, TypeAssertionTypePayload>('typeAssertion', {
  exec: (rt, { expr, finalType }) => {
    const { rtRespState, value } = InstructionNode.exec(expr, rt)
    if (!Type.isTypeAssignableTo(value.type, finalType)) {
      throw new RuntimeError(`"as" type assertion failed - failed to convert a type from "${Type.repr(value.type)}" to ${Type.repr(finalType)}`)
    }
    return { rtRespState, value }
  },
  typeCheck: (actions, inwardState) => ({ expr, typeNode, operatorAndTypePos }) => {
    const exprType = actions.checkType(InstructionNode, expr, inwardState).type
    const expectedType = actions.checkType(TypeNode, typeNode, inwardState).type
    if (!Type.isTypeAssignableTo(expectedType, exprType) && !Type.isTypeAssignableTo(exprType, expectedType)) {
      throw new SemanticError(`Attempted to change a type from "${Type.repr(exprType)}" to type "${Type.repr(expectedType)}". "as" type assertions can only widen or narrow a provided type.`, operatorAndTypePos)
    }
    return {
      type: expectedType,
      typePayload: { finalType: expectedType },
    }
  },
})

interface GenericParam { typeNode: AnyTypeNode, pos: Position }
interface InvokePayload { fnExpr: AnyInstructionNode, genericParams: GenericParam[], args: AnyInstructionNode[], callWithPurity?: ValueOf<typeof PURITY> }
export const invoke = (pos: Position, payload: InvokePayload) =>
  InstructionNode.create<InvokePayload>('invoke', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ pos, fnExpr, genericParams, args, callWithPurity }) => {
    const fnType = actions.checkType(InstructionNode, fnExpr, inwardState).type
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
      const assignerGenericParamType = actions.checkType(TypeNode, assignerGenericParam.typeNode, inwardState).type
      Type.assertTypeAssignableTo(assignerGenericParamType, assigneeGenericParam.constrainedBy, assignerGenericParam.pos)
      valuesOfGenericParams.set(assigneeGenericParam.parameterSentinel, assignerGenericParamType)
    }

    // Type check args
    const argTypes = args.map(p => actions.checkType(InstructionNode, p, inwardState).type)
    if (fnTypeData.paramTypes.length !== argTypes.length) {
      throw new SemanticError(`Found ${argTypes.length} parameter(s) but expected ${fnTypeData.paramTypes.length}.`, pos)
    }
    for (const [arg, assignerParamType, assigneeParamType] of zip3(args, argTypes, fnTypeData.paramTypes)) {
      // Check that it uses generics properly
      Type.matchUpGenerics(assigneeParamType, {
        usingType: assignerParamType,
        onGeneric({ self, other }) {
          const genericValue = valuesOfGenericParams.get(self.parameterSentinel)
          if (!genericValue) {
            Type.assertTypeAssignableTo(other, self.constrainedBy, arg.pos, `Failed to match a type found from an argument, "${Type.repr(other)}", with the generic param type constraint "${Type.repr(self.constrainedBy)}".`)
            valuesOfGenericParams.set(self.parameterSentinel, other)
          } else {
            Type.assertTypeAssignableTo(other, genericValue, arg.pos, `Failed to match a type found from an argument, "${Type.repr(other)}", with the generic param type "${Type.repr(genericValue)}".`)
          }
        },
      })
    }
    // Check purity level
    if (getPurityLevel(fnTypeData.purity) < getPurityLevel(inwardState.minPurity)) {
      throw new SemanticError(`Attempted to call a function which was less pure than its containing environment.`, pos)
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
    return { type: returnType }
  },
})

interface ReturnPayload { value: AnyInstructionNode }
export const return_ = (pos: Position, payload: ReturnPayload) =>
  InstructionNode.create<ReturnPayload>('return', pos, payload)

InstructionNode.register<ReturnPayload, {}>('return', {
  exec: (rt, { value }) => {
    const returnValue = InstructionNode.exec(value, rt)
    throw new FlowControlReturnError({ returnValue: returnValue.value })
  },
  typeCheck: (actions, inwardState) => ({ pos, value }) => {
    if (!actions.follow.isInFn()) throw new SemanticError('Can not use a return outside of a function.', pos)
    const type = actions.checkType(InstructionNode, value, inwardState).type
    return {
      outward: { returnTypes: [{ type, pos }] },
      type: types.createNever()
    }
  },
})

interface BranchPayload { condition: AnyInstructionNode, ifSo: AnyInstructionNode, ifNot: AnyInstructionNode }
export const branch = (pos: Position, payload: BranchPayload) =>
  InstructionNode.create<BranchPayload>('branch', pos, payload)

InstructionNode.register<BranchPayload, {}>('branch', {
  exec: (rt, { condition, ifSo, ifNot }) => {
    const conditionRes = InstructionNode.exec(condition, rt)
    const finalValueRes = conditionRes.value.raw ? InstructionNode.exec(ifSo, rt) : InstructionNode.exec(ifNot, rt)
    return {
      rtRespState: RtRespState.merge(conditionRes.rtRespState, finalValueRes.rtRespState),
      value: finalValueRes.value,
    }
  },
  typeCheck: (actions, inwardState) => ({ condition, ifSo, ifNot }) => {
    const condType = actions.checkType(InstructionNode, condition, inwardState).type
    Type.assertTypeAssignableTo(condType, types.createBoolean(), condition.pos)
    const ifSoType = actions.checkType(InstructionNode, ifSo, inwardState).type
    const ifNotType = actions.checkType(InstructionNode, ifNot, inwardState).type
    
    const biggerType = Type.getWiderType([ifSoType, ifNotType], `The following "if true" case of this condition has the type "${Type.repr(ifSoType)}", which is incompatible with the "if not" case's type, "${Type.repr(ifNotType)}".`, ifSo.pos)
    return { type: biggerType }
  },
})

interface MatchPayload { matchValue: AnyInstructionNode, matchArms: { pattern: AnyAssignmentTargetNode, body: AnyInstructionNode }[] }
export const match = (pos: Position, payload: MatchPayload) =>
  InstructionNode.create<MatchPayload>('match', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ matchValue, matchArms }) => {
    const matchValueType = actions.checkType(InstructionNode, matchValue, inwardState).type
    let overallType: AnyType | null = null
    for (const { pattern, body } of matchArms) {
      const bodyType = actions.follow.withScope({ forFn: actions.follow.getCurrentFnSymbol() }, () => {
        actions.checkType(AssignmentTargetNode, pattern, inwardState, { incomingType: matchValueType, allowWidening: true, export: false })
        return actions.checkType(InstructionNode, body, inwardState).type
      })
      if (!overallType) {
        overallType = bodyType
        continue
      }
      overallType = Type.getWiderType([overallType, bodyType], `The following match arm's result has the type "${Type.repr(bodyType)}", which is incompatible with the type of previous match arms, "${Type.repr(overallType)}".`, DUMMY_POS)
    }
    return { type: overallType }
  },
})

interface ImportOpts { from: string, fromNode: AnyInstructionNode }
interface ImportPayload { rawFrom: string, fromNode: AnyInstructionNode }
interface ImportTypePayload { absoluteFrom: string }
export const import_ = (pos: Position, { from: rawFrom, fromNode }: ImportOpts) =>
  InstructionNode.create<ImportPayload>('import', pos, { rawFrom, fromNode })

InstructionNode.register<ImportPayload, ImportTypePayload>('import', {
  exec: (rt, { absoluteFrom: from_, fromNode }) => {
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
      typeCheckContexts: rt.typeCheckContexts,
    })
    rt.cachedModules.mutable.set(from_, module)

    return { rtRespState: RtRespState.create(), value: module }
  },
  typeCheck: (actions, inwardState) => ({ pos, rawFrom, fromNode }) => {
    // §dIPUB - search for a similar implementation that's used elsewhere
    const calcAbsoluteNormalizedPath = (rawPath: string, { relativeToFile }: { relativeToFile: string }) => (
      path.normalize(path.join(path.dirname(relativeToFile), rawPath))
    )

    const from_ = calcAbsoluteNormalizedPath(rawFrom, { relativeToFile: top(inwardState.importStack) })
    const typePayload = { absoluteFrom: from_ }
    if (inwardState.importStack.includes(from_)) {
      throw new SemanticError('Circular dependency detected', pos)
    }
    if (actions.follow.getModuleShapes().has(from_)) {
      return { type: actions.follow.getModuleShapes().get(from_), typePayload }
    }

    const module = inwardState.constants.moduleDefinitions.get(from_)
    if (!module) throw new Error()

    const type = actions.withNewModule({ inwardState, path: from_ }, newInwardState => {
      const type = actions.checkType(InstructionNode, module.ast, newInwardState).type
      return type as types.RecordType
    })

    actions.follow.setModuleShapeEntry(from_, type)

    return {
      type,
      typePayload,
    }
  },
})

interface VarLookupPayload { identifier: string }
export const varLookup = (pos: Position, { identifier }: VarLookupPayload) =>
  InstructionNode.create<VarLookupPayload>('varLookup', pos, { identifier })

InstructionNode.register<VarLookupPayload, {}>('varLookup', {
  exec: (rt, { identifier }) => {
    const foundVar = Runtime.lookupVar(rt, identifier)
    if (!foundVar) throw new Error(`INTERNAL ERROR: Identifier "${identifier}" not found`)
    return { rtRespState: RtRespState.create(), value: foundVar }
  },
  typeCheck: (actions, inwardState) => ({ pos, identifier }) => {
    const result = actions.follow.lookupVar(identifier)
    if (!result) throw new SemanticError(`Attempted to access undefined variable ${identifier}`, pos)
    const { type, fromOuterFn } = result
    return {
      outward: { outerFnVars: fromOuterFn ? [identifier] : [] },
      type,
    }
  },
})

export const stdLibRef = (pos: Position) =>
  InstructionNode.create<{}>('stdLib', pos, {})

InstructionNode.register<{}, {}>('stdLib', {
  exec: rt => ({ rtRespState: RtRespState.create(), value: rt.stdLib }),
  typeCheck: (actions, inwardState) => () => ({ type: inwardState.constants.stdLibShape }),
})

interface TypeAliasPayload { name: string, typeNode: AnyTypeNode, definedWithin: AnyInstructionNode }
export const typeAlias = (pos: Position, payload: TypeAliasPayload) =>
  InstructionNode.create<TypeAliasPayload>('typeAlias', pos, payload)

InstructionNode.register<TypeAliasPayload, {}>('typeAlias', {
  exec: (rt, { definedWithin }) => InstructionNode.exec(definedWithin, rt),
  typeCheck: (actions, inwardState) => ({ pos, name, typeNode, definedWithin }) => {
    const type = actions.checkType(TypeNode, typeNode, inwardState).type
    actions.follow.addToScopeInTypeNamespace(name, () => type, pos)
    return {
      type: actions.checkType(InstructionNode, definedWithin, inwardState).type
    }
  },
})

interface ApplyTagPayload { tag: AnyInstructionNode, content: AnyInstructionNode }
export const applyTag = (pos: Position, payload: ApplyTagPayload) =>
  InstructionNode.create<ApplyTagPayload>('applyTag', pos, payload)

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
  typeCheck: (actions, inwardState) => ({ pos, tag, content }) => {
    const tagType = actions.checkType(InstructionNode, tag, inwardState).type
    const contentType = actions.checkType(InstructionNode, content, inwardState).type

    Type.assertTypeAssignableTo(contentType, assertTagInnerDataType(Type.assertIsConcreteType(tagType).data).boxedType, pos)
    return {
      type: types.createTagged({ tag: tagType as types.TagType })
    }
  },
})

interface IndividualDeclaration { expr: AnyInstructionNode, assignmentTarget: AnyAssignmentTargetNode, assignmentTargetPos: Position }
interface DeclarationPayload { export?: boolean, declarations: IndividualDeclaration[], nextExpr: AnyInstructionNode, newScope: boolean }
export const declaration = (pos: Position, { export: export_ = false, declarations, nextExpr, newScope = false }: DeclarationPayload) =>
  InstructionNode.create<DeclarationPayload>('declaration', pos, { export: export_, declarations, nextExpr, newScope })

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
  typeCheck: (actions, inwardState) => ({ pos, export: export_, declarations, nextExpr, newScope }) => {
    if (inwardState.isMainModule && export_) throw new SemanticError('Can not export from a main module', pos)
    
    const logicMaybeWithinScope = () => {
      for (const decl of declarations) {
        const declExprType = actions.checkType(InstructionNode, decl.expr, inwardState).type
        actions.checkType(AssignmentTargetNode, decl.assignmentTarget, inwardState, { incomingType: declExprType, export: export_ })
      }
      return actions.checkType(InstructionNode, nextExpr, inwardState).type
    }

    return {
      type: newScope
        ? actions.follow.withScope({ forFn: actions.follow.getCurrentFnSymbol() }, logicMaybeWithinScope)
        : logicMaybeWithinScope()
    }
  },
})