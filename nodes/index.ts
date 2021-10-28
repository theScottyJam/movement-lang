import type { Token } from 'moo'
import * as Node from './Node';
import { SemanticError } from '../language/exceptions'
import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as Value from '../language/Value'
import * as values from '../language/values'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'
import * as types from '../language/types'
import { PURITY } from '../language/constants'

type Node = Node.Node
type Position = Position.Position
type Runtime = Runtime.Runtime
type AnyValue = Value.AnyValue
type TypeState = TypeState.TypeState
type RespState = RespState.RespState
type AnyType = Type.AnyType

const DUMMY_POS = Position.from({ line: 1, col: 1, offset: 0, text: '' } as Token) // TODO - get rid of all occurances of this

interface RootOpts { module: Node }
interface RootExecOpts { behaviors: Partial<Runtime.RuntimeBehaviors> }
export const root = ({ module }: RootOpts) => ({
  exec: ({ behaviors }: RootExecOpts = { behaviors: {} }): AnyValue => {
    const rt = Runtime.create({ behaviors })
    return module.exec(rt)
  },
  typeCheck: (): void => {
    const state = TypeState.create()
    module.typeCheck(state)
  }
})

export const beginBlock = (pos: Position, content: Node) => Node.create({
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
  pos,
  exec: rt => {
    content.exec(rt)
    return values.createUnit()
  },
  typeCheck: state => {
    const { respState, type: contentType } = content.typeCheck(state)
    const type = types.isNever(contentType) ? types.createNever() : types.createUnit()
    return { respState, type }
  },
})

export const sequence = (statements: readonly Node[]) => Node.create({
  exec: rt => {
    for (const statement of statements) statement.exec(rt)
    return null
  },
  typeCheck: state => {
    const typeChecks = statements.map(statement => statement.typeCheck(state))
    const respStates = typeChecks.map(x => x.respState)
    const type = typeChecks.find(x => types.isNever(x.type)) ? types.createNever() : types.createUnit()
    return { respState: RespState.merge(...respStates), type }
  },
})

export const noop = () => Node.create({
  exec: rt => null,
  typeCheck: state => {
    const respState = RespState.create()
    const type = types.createUnit()
    return { respState, type }
  },
})

interface PrintOpts { r: Node }
export const print = (pos: Position, { r }: PrintOpts) => Node.create({
  pos,
  exec: rt => {
    const value = r.exec(rt)
    rt.behaviors.showDebugOutput(value)
    return value
  },
  typeCheck: state => r.typeCheck(state)
})

interface AddOpts { l: Node, r: Node }
export const add = (pos: Position, { l, r }: AddOpts) => {
  let finalType
  return Node.create({
    pos,
    exec: rt => values.createInt(l.exec(rt).raw + r.exec(rt).raw),
    typeCheck: state => {
      const { respState: lRespState, type: lType } = l.typeCheck(state)
      const { respState: rRespState, type: rType } = r.typeCheck(state)
      tools.assertType(lType, tools.types.int, l.pos)
      tools.assertType(rType, tools.types.int, r.pos)
      finalType = tools.types.int
      return { respState: RespState.merge(lRespState, rRespState), type: finalType }
    },
  })
},