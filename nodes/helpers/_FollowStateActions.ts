import * as FollowTypeState from './_FollowTypeState'
import { SemanticError } from '../../language/exceptions'
import type { RecordType } from '../../language/types'
import * as Type from '../../language/Type'
import type { Position } from '../../language/Position'

type FollowTypeState = FollowTypeState.FollowTypeState

interface VarLookupInfo { type: Type.AnyType, fromOuterFn: boolean }

type WithFollowState = <T extends unknown[], U>(callback: WithFollowStateCallback<T, U>) => (...args: T) => U

type WithFollowStateCallback<T extends unknown[], U> = (followState: FollowTypeState) =>
  (...args: T) => {
    followState?: FollowTypeState,
    value?: U
  } | null

  const top = <T>(array: readonly T[]): T => array[array.length - 1]

export const create = (withFollowState: WithFollowState) => ({
  // The current fn symbol uniquely identifies which function this scope belong to.
  // This is mainly used for the purposes of knowing which variables to capture in a closure.
  // If you're outside of all functions, a symbol will still be returned, which represents the module itself.
  getCurrentFnSymbol: withFollowState(followState => () => {
    return { value: top(followState.scopes).forFn }
  }),
  isInFn: withFollowState(followState => () => {
    // Are there more fn-symbols in this scope stack, then the single symbol that represents the module itself?
    return { value: new Set(followState.scopes.map(scope => scope.forFn)).size > 1 }
  }),
  withScope<T>({ forFn }: { forFn: symbol }, callback: () => T): T {
    const pushScope = withFollowState(followState => () => ({
      followState: FollowTypeState.update(followState, {
        scopes: [...followState.scopes, {
          forFn,
          typeNamespace: new Map(),
          valueNamespace: new Map(),
          typeParamSentinelsInScope: new Set(),
        }],
      }),
    }))
    const popScope = withFollowState(followState => () => ({
      followState: FollowTypeState.update(followState, {
        scopes: followState.scopes.slice(0, -1),
      }),
    }))

    pushScope()
    const res = callback()
    popScope()
    return res
  },
  addToScopeInValueNamespace: withFollowState(followState => (identifier: string, type: Type.AnyType, pos: Position) => {
    if (identifier === '$') return
    const newScope = new Map(top(followState.scopes).valueNamespace)
    if (newScope.has(identifier)) {
      throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
    }
    newScope.set(identifier, type)
  
    return {
      followState: FollowTypeState.update(followState, {
        scopes: [
          ...followState.scopes.slice(0, -1),
          { ...top(followState.scopes), valueNamespace: newScope },
        ],
      }),
    }
  }),
  
  addToScopeInTypeNamespace: withFollowState(followState => (identifier: string, type: Type.AnyType, pos: Position) => {
    if (identifier === '$') return
    const newTypeScope = new Map(top(followState.scopes).typeNamespace)
    if (newTypeScope.has(identifier)) {
      throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
    }
    newTypeScope.set(identifier, type)

    const newTypeParamSentinelsInScope = new Set(top(followState.scopes).typeParamSentinelsInScope)
    if (Type.isTypeParameter(type)) {
      newTypeParamSentinelsInScope.add(type.parameterSentinel)
    }
  
    return {
      followState: FollowTypeState.update(followState, {
        scopes: [
          ...followState.scopes.slice(0, -1),
          {
            ...top(followState.scopes),
            typeNamespace: newTypeScope,
            typeParamSentinelsInScope: newTypeParamSentinelsInScope
          },
        ],
      }),
    }
  }),

  /// Looks up the type for a variable. Returns null if it's not found.
  lookupVar: withFollowState(followState => (identifier: string) => ({ value: lookupVar(followState, identifier) })),

  /// Looks up a defined type, like #MyTypeAlias. Returns null if it's not found.
  lookupType: withFollowState(followState => (identifier: string): { value: Type.AnyType | null } => {
    for (const scope of [...followState.scopes].reverse()) {
      const type = scope.typeNamespace.get(identifier)
      if (type) {
        return { value: type }
      }
    }
    return { value: null }
  }),

  /// Looks up a type by a generic parameter's id/sentinel.
  scopeHasTypeParamSentinel: withFollowState(followState => (typeParamSentinel: symbol): { value: boolean } => {
    for (const scope of [...followState.scopes].reverse()) {
      if (scope.typeParamSentinelsInScope.has(typeParamSentinel)) {
        return { value: true }
      }
    }
    return { value: false }
  }),

  getModuleShapes: withFollowState(followState => () => {
    return { value: followState.moduleShapes }
  }),

  // Used to add exports to the module being loaded
  setModuleShapeEntry: withFollowState(followState => (key: string, shape: RecordType) => {
    const moduleShapes = new Map(followState.moduleShapes)
    moduleShapes.set(key, shape)
    return {
      followState: FollowTypeState.update(followState, { moduleShapes }),
    }
  }),
})

export const lookupVar = (followState: FollowTypeState, identifier: string): VarLookupInfo | null => {
  for (let scope of [...followState.scopes].reverse()) {
    const type = scope.valueNamespace.get(identifier)
    if (type) {
      const fromOuterFn = scope.forFn !== top(followState.scopes).forFn
      return { type, fromOuterFn }
    }
  }
  return null
}