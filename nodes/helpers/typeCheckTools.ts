import * as FollowTypeState from './_FollowTypeState'
import * as RespTypeState from './_RespTypeState'
import * as FollowStateActions from './_FollowStateActions'
import * as Type from '../../language/Type'
import type { Position } from '../../language/Position'
import type * as AnyNode from '../../nodes/variants/AnyNode'
import * as InwardTypeState from '../../language/InwardTypeState'
import { pipe } from '../../util'
import { PURITY } from '../../language/constants'

type InwardTypeState = InwardTypeState.InwardTypeState
type FollowTypeState = FollowTypeState.FollowTypeState
type RespTypeState = RespTypeState.RespTypeState
type CreateRespStateOpts = Parameters<typeof RespTypeState.create>[0]
type purityTypes = typeof PURITY[keyof typeof PURITY]

type TypeChecker<Payload, TypePayload, Opts> = (payloads: Payload & { pos: Position }, opts?: Opts) =>
  { outward?: CreateRespStateOpts, type: Type.AnyType, typePayload?: TypePayload }
export type TypeCheckerGetter<Payload, TypePayload, Opts> = (actions: Actions, inwardState: InwardTypeState) =>
  TypeChecker<Payload, TypePayload, Opts>

type WithStateCallback<T extends unknown[], U> = (followState: FollowTypeState) =>
  (...args: T) => {
    followState?: FollowTypeState,
    respState?: RespTypeState,
    value?: U
  } | null

type WithStateFn = <T extends unknown[], U>(callback: WithStateCallback<T, U>) => (...args: T) => U

type CheckTypeFn = <NodeType, Opts>(
  ...[module, node, inwardState, opts]:
  [TypeCheckableModule<NodeType, Opts>, NodeType, InwardTypeState, Opts?]
) => {
  respState: RespTypeState,
  type: Type.AnyType,
}

type WithNewModuleParams<T> = [
  {
    readonly inwardState: InwardTypeState
    readonly path: string
  },
  (inwardState: InwardTypeState) => T
]

type WithFunctionDefinitionParams<T> = [
  {
    readonly inwardState: InwardTypeState
    readonly minPurity: purityTypes
  },
  (inwardState: InwardTypeState) => T
]

interface TransformRespStateOpts<T> {
  readonly from: () => T
  readonly transform: (state: RespTypeState, opts: { followState: FollowTypeState }) => RespTypeState
}
type TransformRespStateFn = <T>(opts: TransformRespStateOpts<T>) => T

export const getTypeCheckableBehavior = Symbol('getTypeCheckable')
interface TypeCheckableModule<NodeType, Opts> {
  behaviors: {
    [getTypeCheckableBehavior](node: NodeType, opts?: Opts): TypeCheckable<Opts>
  }
}

type WithActionsCallback<T> = (actions: Actions) => T
const withActions = <T>(followState_: FollowTypeState, callback: WithActionsCallback<T>) => {
  let currentFollowState = followState_
  let respStates: RespTypeState[] = []

  const withState = <T extends unknown[], U>(callback: WithStateCallback<T, U>) => {
    return (...args: T): U => {
      const { followState, respState, value } = callback(currentFollowState)(...args) ?? {}
      if (followState) currentFollowState = followState
      if (respState) respStates.push(respState)
      return value
    }
  }

  const transformRespState: TransformRespStateFn = ({ from: callback, transform }) => {
    const previousRespStates = []
    respStates = []

    const res = callback()

    respStates = pipe(
      respStates,
      $=> RespTypeState.merge(...$),
      $=> transform($, { followState: currentFollowState }),
      $=> [...previousRespStates, $]
    )

    return res
  }

  const value = callback(createActions(withState, transformRespState))

  return {
    respState: RespTypeState.merge(...respStates),
    followState: currentFollowState,
    value,
  }
}

const createActions = (withState: WithStateFn, transformRespState: TransformRespStateFn) => {
  // The type of this function couldn't be inferred, because
  // TypeScript was throwing a fit about circular referencing types.
  const checkType: CheckTypeFn = withState(followState => <NodeType, Opts>(
    ...[module, node, inwardState, opts = null]:
    [TypeCheckableModule<NodeType, Opts>, NodeType, InwardTypeState, Opts?]
  ) => {
    const typeCheckable = module.behaviors[getTypeCheckableBehavior](node, opts)
    const { respState, followState: updatedFollowState, type } = typeCheckable[internalTypeCheck]({
      inward: inwardState,
      follow: followState,
    })

    return {
      respState,
      followState: updatedFollowState,
      value: { respState, type },
    }
  })

  return {
    follow: FollowStateActions.create(withState),
    checkType,
    withNewModule<T>(...[{ inwardState, path }, callback]: WithNewModuleParams<T>): T {
      const prepareFollowState = withState(followState => () => ({
        value: followState,
        followState: FollowTypeState.update(followState, {
          scopes: [{ forFn: Symbol(), valueNamespace: new Map(), typeNamespace: new Map(), typeParamSentinelsInScope: new Set() }],
        }),
      }))
      const resetFollowState = withState(followState => (originalFollowState: FollowTypeState) => ({
        followState: FollowTypeState.update(followState, {
          scopes: originalFollowState.scopes,
        }),
      }))
  
      const originalFollowState = prepareFollowState()
      const res = transformRespState({
        from: () => callback(
          InwardTypeState.update(inwardState, {
            importStack: [...inwardState.importStack, path],
            isMainModule: false,
          })
        ),
        transform: respState => RespTypeState.create({
          typeCheckContexts: respState.typeCheckContexts,
        }),
      })
      resetFollowState(originalFollowState)
      return res
    },
    withFunctionDefinition<T>(...[{ inwardState, minPurity }, callback]: WithFunctionDefinitionParams<T>) {
      return transformRespState({
        from: () => callback(
          InwardTypeState.update(inwardState, { minPurity })
        ),
        transform: (respState, { followState }) => RespTypeState.update(respState, {
          outerFnVars: respState.outerFnVars.filter(
            ident => FollowStateActions.lookupVar(followState, ident)
          ),
        })
      })
    },
    noExecZone<T>(callback: () => T) {
      return transformRespState({
        from: callback,
        transform: respState => RespTypeState.update(respState, {
          outerFnVars: [],
        }),
      })
    },
  }
}
export type Actions = ReturnType<typeof createActions>

const internalTypeCheck = Symbol('internal type check')

class TypeCheckable<Opts> {
  #getTypeChecker: TypeCheckerGetter<unknown, unknown, Opts>
  #payloads: unknown & { pos: Position }
  #opts: Opts
  #node: AnyNode.AnyNode
  constructor(node: AnyNode.AnyNode, getTypeChecker: TypeCheckerGetter<unknown, unknown, Opts>, opts?: Opts) {
    // FIXME0: `node.pos ?? null` happens because I'm currently required to supply a "pos" parameter to typeCheck. This should be optional, because not everyone has a pos. The `?? null` lets me get around the type constraint, because strict-null-checking isn't on.
    this.#payloads = { ...node.payload, pos: node.pos ?? null }
    this.#opts = opts
    this.#getTypeChecker = getTypeChecker
    this.#node = node
  }

  [internalTypeCheck](state: { inward: InwardTypeState, follow: FollowTypeState }) {
    const { respState: innerRespState, followState, value: typeCheckResp } = withActions(state.follow, actions => {
      return this.#getTypeChecker(actions, state.inward)(this.#payloads, this.#opts)
    })

    const { outward: maybeOutwardData, type, typePayload } = typeCheckResp

    const respState = RespTypeState.merge(
      innerRespState,
      RespTypeState.create({
        typeCheckContexts: new Map([[this.#node.sentinel, typePayload ?? {}]]),
      }),
      ...maybeOutwardData ? [RespTypeState.create(maybeOutwardData)] : [],
    )

    return { respState, followState, type }
  }
}

type WrapTypeCheckerArgs<Opts> = [
  AnyNode.AnyNode,
  TypeCheckerGetter<unknown, unknown, Opts>,
  Opts?,
]
export function wrapTypeChecker<Opts>(...[node, getTypeChecker, opts]: WrapTypeCheckerArgs<Opts>) {
  return new TypeCheckable<Opts>(node, getTypeChecker, opts)
}

type InwardTypeStateCreateOpts = Parameters<typeof InwardTypeState.create>[0]
type InitTypeCheckingArgs<T> = [
  typeStateInitOpts: Pick<InwardTypeStateCreateOpts, 'behaviors' | 'isMainModule' | 'moduleDefinitions' | 'importStack' | 'stdLibShape'>,
  callback: (actions: Actions, inwardState: InwardTypeState) => T,
]
export function initTypeChecking<T>(...[inwardTypeStateOpts, callback]: InitTypeCheckingArgs<T>) {
  const { respState, value: result } = withActions(FollowTypeState.create(), actions => {
    const inwardState = InwardTypeState.create(inwardTypeStateOpts)
    return callback(actions, inwardState)
  })

  return {
    typeCheckContexts: respState.typeCheckContexts,
    result,
  }    
}
