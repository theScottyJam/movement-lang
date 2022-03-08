import * as Position from '../language/Position'
import * as Type from '../language/Type'
import * as types from '../language/types'
import * as RtRespState from '../language/RtRespState'
import * as Value from '../language/Value'
import * as values from '../language/values'
import * as nodes from '../nodes'
import * as InstructionNode from '../nodes/variants/InstructionNode'
import * as TypeNode from '../nodes/variants/TypeNode'
import { prototolSymbols } from '../language/typeProtocols'
import { pipe } from '../util'
import { PURITY } from '../language/constants'
import * as Runtime from '../language/Runtime'

const STDLIB_POS = Position.create({ file: Position.internalFile, line: 1, col: 1, length: 0, offset: 0 })

type AnyTypeNode = TypeNode.AnyTypeNode

type CustomFnBodyCallback = (rt: Runtime.Runtime, ...args: Value.AnyValue[]) => Value.AnyValue

interface ConstructFnOpts {
  readonly paramTypeNodes: readonly AnyTypeNode[]
  readonly returnTypeNode: AnyTypeNode
  readonly purity: typeof PURITY[keyof typeof PURITY]
  readonly dependencies?: string[],
  readonly body: CustomFnBodyCallback
}

const construct = {
  bind: (name: string, maybeTypeConstraintNode: AnyTypeNode = null) =>
    nodes.assignmentTarget.bind(STDLIB_POS, {
      identifier: name,
      maybeTypeConstraintNode,
      identPos: STDLIB_POS,
    }),

  fn: ({ purity, paramTypeNodes, returnTypeNode, dependencies = [], body }: ConstructFnOpts) =>
    nodes.value.function_(STDLIB_POS, {
      params: paramTypeNodes.map((typeNode, i) => construct.bind('p' + i, typeNode)),
      body: construct._customFnBody({ argCount: paramTypeNodes.length, returnTypeNode, dependencies, fn: body }),
      maybeBodyTypeNode: null,
      purity,
      genericParamDefList: [],
      posWithoutBody: STDLIB_POS,
    }),
  
  _customFnBody: (() => {
    const jsFnBodyName = 'jsFnBody:' + Math.random().toString().slice(2, 7)
    interface InstructionNodePayload {
      readonly argCount: number
      readonly returnTypeNode: AnyTypeNode
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
      typeCheck: (actions, inwardState) => ({ returnTypeNode, dependencies }) => {
        const type = actions.checkType(TypeNode, returnTypeNode, inwardState).type
        return {
          outward: { outerFnVars: dependencies },
          type,
        }
      },
    })

    return ({ argCount, returnTypeNode, dependencies, fn }: InstructionNodePayload) =>
      InstructionNode.create<InstructionNodePayload>(jsFnBodyName, STDLIB_POS, { argCount, returnTypeNode, dependencies, fn })
    })(),

  record: (mapping: { [key: string]: InstructionNode.AnyInstructionNode }, symbolMapping: { [symbName: string]: InstructionNode.AnyInstructionNode } = {}) =>
    nodes.value.record(STDLIB_POS, {
      recordEntries: [
        ...Object.entries(mapping)
          .map(([key, node]) => ({ type: 'IDENTIFIER' as const, name: key, target: node, maybeRequiredTypeNode: null, keyPos: STDLIB_POS })),
        ...Object.entries(symbolMapping)
          .map(([symbName, node]) => ({ type: 'SYMBOL' as const, symbolExprNode: nodes.varLookup(STDLIB_POS, { identifier: symbName }), target: node, maybeRequiredTypeNode: null, keyPos: STDLIB_POS })),
      ],
    }),

  internalTag: () => nodes.value.tag(STDLIB_POS, {
    genericParamDefList: [],
    typeNode: nodes.type.nodeFromTypeGetter(STDLIB_POS, {
      typeGetter: () => types.createInternal()
    }),
  }),

  simpleType: typeName => nodes.type.simpleType(STDLIB_POS, { typeName })
}

const createStdLibMapping: () => { [key: string]: InstructionNode.AnyInstructionNode } = () => {
  const stdLibDef: any = {}
  const private_: any = {}

  private_.MutableTag = construct.internalTag()
  private_.SymbolChildType = nodes.value.symbol(STDLIB_POS, { name: '$Symbol.childType', value: prototolSymbols.childType })

  // TODO: I should support more than ints
  stdLibDef.Mutable = construct.record((() => {
    const MutableDef: any = {}
    const mutableTagTypeNode = (varName: string) => nodes.type.nodeFromTypeGetter(STDLIB_POS, {
      typeGetter: actions => {
        const parentType = actions.follow.lookupVar(varName).type
        const result = pipe(
          Type.getProtocols(parentType, STDLIB_POS),
          $=> $.childType(Type.getConcreteConstrainingType(parentType)),
        )
        if (!result.success) throw new Error()
        return result.type
      }
    })
    
    MutableDef.create = construct.fn({
      purity: PURITY.pure,
      paramTypeNodes: [construct.simpleType('#int')],
      dependencies: ['MutableTag'],
      returnTypeNode: mutableTagTypeNode('MutableTag'),
      body: (rt, content) => {
        const tag = Runtime.lookupVar(rt, 'MutableTag')
        const value = values.createInternal({ mutable: content })
        return values.createTagged(value, types.createTagged({ tag: tag.type as types.TagType }))
      },
    })

    MutableDef.get_ = construct.fn({
      purity: PURITY.pure,
      dependencies: ['MutableTag'],
      paramTypeNodes: [mutableTagTypeNode('MutableTag')],
      returnTypeNode: construct.simpleType('#int'),
      body: (rt, taggedItem) => (taggedItem.raw as any).raw.mutable as values.IntValue,
    })

    MutableDef.set = construct.fn({
      purity: PURITY.none,
      dependencies: ['MutableTag'],
      paramTypeNodes: [mutableTagTypeNode('MutableTag'), construct.simpleType('#int')],
      returnTypeNode: construct.simpleType('#int'),
      body: (rt, taggedItem, newValue) => {
        (taggedItem.raw as any).raw.mutable = newValue
        return values.createUnit()
      },
    })

    return MutableDef
  })())

  stdLibDef.Symbol = construct.record((() => {
    const SymbolDef: any = {}

    SymbolDef.childType = nodes.varLookup(STDLIB_POS, { identifier: 'SymbolChildType' })

    return SymbolDef
  })())

  stdLibDef.Int = construct.record(...(() => {
    const IntDef: any = {}
    const IntSymbolDef: any = {}

    IntSymbolDef.SymbolChildType = nodes.value.typeContainer(STDLIB_POS, { name: '#:$Int', typeNode: construct.simpleType('#int') })

    return [IntDef, IntSymbolDef] as const
  })())

  return { public: stdLibDef, private: private_ }
}

export const createStdLibAst = () => {
  const { public: public_, private: private_ } = createStdLibMapping()
    return nodes.createApi({
      dependencies: [],
      content: nodes.moduleRoot(STDLIB_POS, {
        content: nodes.declaration(STDLIB_POS, {
          declarations: Object.entries(private_)
            .map(([key, value]) => ({
              assignmentTarget: construct.bind(key),
              expr: value,
              assignmentTargetPos: STDLIB_POS
            })),
          nextExpr: nodes.declaration(STDLIB_POS, {
            declarations: Object.entries(public_)
              .map(([key, value]) => ({
                assignmentTarget: construct.bind(key),
                expr: value,
                assignmentTargetPos: STDLIB_POS
              })),
            nextExpr: nodes.noop(STDLIB_POS),
            newScope: false,
            export: true,
          }),
          newScope: false,
          export: false,
        })
      })
    })
}
