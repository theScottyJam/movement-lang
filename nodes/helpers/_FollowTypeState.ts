import * as Type from '../../language/Type'
import type * as types from '../../language/types'

export interface FollowTypeState {
  // Map of paths to module shapes
  readonly moduleShapes: Map<string, types.RecordType>
  // The types of specific values in different scopes.
  // e.g. let x = 2 adds an entry for "x" in the current scope.
  readonly scopes: {
    // A symbol that uniquely identifies which function you're in (if you're in one)
    // i.e. a subscope within a function would have the same symbol as the function itself.
    // Used for deciding which variables need to be captured from outer scopes.
    readonly forFn: symbol
    // Stores type information for values, e.g. `let x = 2` would create an "x" entry.
    readonly valueNamespace: Map<string, Type.AnyType>
    // Stores types that were defined in this scope, e.g. `type #T = #int` would create a "T" entry.
    readonly typeNamespace: Map<string, Type.AnyType>
    // Alternative representation of the data that can be found in typeNamespace.
    readonly typeParamSentinelsInScope: Set<symbol>
  }[]
}

export function create(opts: Partial<FollowTypeState> = {}): FollowTypeState {
  return {
    scopes: opts.scopes ?? [{
      forFn: Symbol(),
      valueNamespace: new Map(),
      typeNamespace: new Map(),
      typeParamSentinelsInScope: new Set(),
    }],
    moduleShapes: opts.moduleShapes ?? new Map(),
  }
}

export function update(followState: FollowTypeState, opts: Partial<FollowTypeState>): FollowTypeState {
  return create({
    scopes: opts.scopes ?? followState.scopes,
    moduleShapes: opts.moduleShapes ?? followState.moduleShapes,
  })
}
