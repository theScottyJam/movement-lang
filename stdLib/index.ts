import type { Token } from 'moo'
import * as Position from '../language/Position'
import type * as Type from '../language/Type'
import * as types from '../language/types'
import * as RespState from '../language/RespState'
import * as RtRespState from '../language/RtRespState'
import * as Value from '../language/Value'
import * as values from '../language/values'
import * as nodes from '../nodes'
import * as Node from '../nodes/helpers/Node'
import { PURITY } from '../language/constants'
import * as Runtime from '../language/Runtime'

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurrences of this

type CustomFnBodyCallback = (rt: Runtime.Runtime, ...args: Value.AnyValue[]) => Value.AnyValue

interface ConstructFnOpts {
  readonly paramTypes: Type.AnyType[]
  readonly bodyType: Type.AnyType
  readonly purity: typeof PURITY[keyof typeof PURITY]
  readonly body: CustomFnBodyCallback
}

const construct = {
  bind: (name: string, typeConstraint: Type.AnyType = null) =>
    nodes.assignmentTarget.bind(DUMMY_POS, {
      identifier: name,
      getTypeConstraint: () => typeConstraint,
      identPos: DUMMY_POS,
      typeConstraintPos: DUMMY_POS
    }),

  fn: ({ purity, paramTypes, bodyType, body }: ConstructFnOpts) =>
    nodes.value.function_(DUMMY_POS, {
      params: paramTypes.map((type, i) => construct.bind('p' + i, type)),
      body: construct._customFnBody(paramTypes.length, bodyType, body),
      getBodyType: () => bodyType,
      bodyTypePos: DUMMY_POS,
      purity,
      genericParamDefList: [],
    }),
  
  _customFnBody: (argCount: number, returnType: Type.AnyType, fn: CustomFnBodyCallback) => Node.create({
    name: 'jsNode',
    pos: DUMMY_POS,
    exec: rt => {
      const args = Array(argCount).fill(null).map((_, i) => Runtime.lookupVar(rt, 'p' + i))
      return {
        rtRespState: RtRespState.create(),
        value: fn(rt, ...args),
      }
    },
    typeCheck: state => ({ respState: RespState.create(), type: returnType }),
  })
}

const createStdLibMapping: () => { [key: string]: Node.Node } = () => ({
  add: construct.fn({
    purity: PURITY.pure,
    paramTypes: [types.createInt(), types.createInt()],
    bodyType: types.createInt(),
    body: (rt, x_, y_) => {
      const x = x_.raw as bigint
      const y = y_.raw as bigint
      return values.createInt(x + y)
    },
  }),
})

export const createStdLibAst = () => nodes.root({
  module: nodes.module(DUMMY_POS, {
    dependencies: [],
    content: nodes.declaration(DUMMY_POS, {
      declarations: Object.entries(createStdLibMapping())
        .map(([key, value]) => ({
          assignmentTarget: construct.bind(key),
          expr: value,
          assignmentTargetPos: DUMMY_POS
        })),
      expr: nodes.noop(),
      newScope: false,
      export: true,
    })
  }),
})