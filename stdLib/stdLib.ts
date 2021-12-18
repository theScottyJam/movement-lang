import type { Token } from 'moo'
import * as Position from '../language/Position'
import * as Type from '../language/Type'
import * as types from '../language/types'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as RtRespState from '../language/RtRespState'
import * as Value from '../language/Value'
import * as values from '../language/values'
import * as nodes from '../nodes'
import * as InstructionNode from '../nodes/variants/InstructionNode'
import { PURITY } from '../language/constants'
import * as Runtime from '../language/Runtime'

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

type CustomFnBodyCallback = (rt: Runtime.Runtime, ...args: Value.AnyValue[]) => Value.AnyValue

type TypeGetter = (state: TypeState.TypeState) => Type.AnyType

interface ConstructFnOpts {
  readonly paramTypeGetters: readonly TypeGetter[]
  readonly getReturnType: TypeGetter
  readonly purity: typeof PURITY[keyof typeof PURITY]
  readonly dependencies?: string[],
  readonly body: CustomFnBodyCallback
}

const construct = {
  bind: (name: string, getTypeConstraint: TypeGetter = () => null) =>
    nodes.assignmentTarget.bind(DUMMY_POS, {
      identifier: name,
      getTypeConstraint: getTypeConstraint,
      identPos: DUMMY_POS,
      typeConstraintPos: DUMMY_POS
    }),

  fn: ({ purity, paramTypeGetters, getReturnType, dependencies = [], body }: ConstructFnOpts) =>
    nodes.value.function_(DUMMY_POS, {
      params: paramTypeGetters.map((typeGetter, i) => construct.bind('p' + i, typeGetter)),
      body: construct._customFnBody({ argCount: paramTypeGetters.length, getReturnType, dependencies, fn: body }),
      getBodyType: null,
      bodyTypePos: DUMMY_POS,
      purity,
      genericParamDefList: [],
    }),
  
  _customFnBody: (() => {
    const jsFnBodyName = 'jsFnBody:' + Math.random().toString().slice(2, 7)
    interface InstructionNodePayload {
      readonly argCount: number
      readonly getReturnType: TypeGetter
      readonly dependencies: string[]
      readonly fn: CustomFnBodyCallback
    }
    InstructionNode.register<InstructionNodePayload, {}>(jsFnBodyName, {
      exec: (rt, { argCount, fn }) => {
        const args = Array(argCount).fill(null).map((_, i) => Runtime.lookupVar(rt, 'p' + i))
        return {
          rtRespState: RtRespState.create(),
          value: fn(rt, ...args),
        }
      },
      typeCheck: (state, { getReturnType, dependencies }) => ({ respState: RespState.create({ outerFnVars: dependencies }), type: getReturnType(state) }),
    })

    return ({ argCount, getReturnType, dependencies, fn }: InstructionNodePayload) =>
      InstructionNode.create<InstructionNodePayload, {}>(jsFnBodyName, DUMMY_POS, { argCount, getReturnType, dependencies, fn })
    })(),

  record: (mapping: { [key: string]: InstructionNode.AnyInstructionNode }) =>
    nodes.value.record(DUMMY_POS, {
      content: new Map(
        Object.entries(mapping)
          .map(([key, node]) => [key, { target: node, requiredTypeGetter: null, typeGetterPos: DUMMY_POS }]
      )),
    }),

  internalTag: () => nodes.value.tag(DUMMY_POS, {
    genericParamDefList: [],
    getType: () => types.createInternal(),
    typePos: DUMMY_POS,
  }),
}

const createStdLibMapping: () => { [key: string]: InstructionNode.AnyInstructionNode } = () => {
  const stdLibDef: any = {}
  const private_: any = {}

  private_.MutableTag = construct.internalTag()

  // TODO: I should support more than ints
  stdLibDef.Mutable = construct.record((() => {
    const MutableDef: any = {}
    const mutableTagType = (state: TypeState.TypeState, varName: string) =>
      Type.getTypeMatchingDescendants(TypeState.lookupVar(state, varName).type, DUMMY_POS)
    
    MutableDef.create = construct.fn({
      purity: PURITY.pure,
      paramTypeGetters: [() => types.createInt()],
      dependencies: ['MutableTag'],
      getReturnType: state => mutableTagType(state, 'MutableTag'),
      body: (rt, content) => {
        const tag = Runtime.lookupVar(rt, 'MutableTag')
        const value = values.createInternal({ mutable: content })
        return values.createTagged(value, types.createTagged({ tag: tag.type as types.TagType }))
      },
    })

    MutableDef.get_ = construct.fn({
      purity: PURITY.pure,
      dependencies: ['MutableTag'],
      paramTypeGetters: [state => mutableTagType(state, 'MutableTag')],
      getReturnType: () => types.createInt(),
      body: (rt, taggedItem) => (taggedItem.raw as any).raw.mutable as values.IntValue,
    })

    MutableDef.set = construct.fn({
      purity: PURITY.none,
      dependencies: ['MutableTag'],
      paramTypeGetters: [state => mutableTagType(state, 'MutableTag'), () => types.createInt()],
      getReturnType: () => types.createInt(),
      body: (rt, taggedItem, newValue) => {
        (taggedItem.raw as any).raw.mutable = newValue
        return values.createUnit()
      },
    })

    return MutableDef
  })())

  return { public: stdLibDef, private: private_ }
}

export const createStdLibAst = () => {
  const { public: public_, private: private_ } = createStdLibMapping()
  return nodes.root({
    dependencies: [],
    content: nodes.declaration(DUMMY_POS, {
      declarations: Object.entries(private_)
        .map(([key, value]) => ({
          assignmentTarget: construct.bind(key),
          expr: value,
          assignmentTargetPos: DUMMY_POS
        })),
      nextExpr: nodes.declaration(DUMMY_POS, {
        declarations: Object.entries(public_)
          .map(([key, value]) => ({
            assignmentTarget: construct.bind(key),
            expr: value,
            assignmentTargetPos: DUMMY_POS
          })),
        nextExpr: nodes.noop(),
        newScope: false,
        export: true,
      }),
      newScope: false,
      export: false,
    })
  })
}
