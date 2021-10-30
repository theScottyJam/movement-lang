import type { Position } from './Position.js'
import type * as Type from './Type.js'

export interface RespState {
  // Variables encountered that belong to the outer scope get captured here.
  // This is needed to properly implement closures
  readonly outerScopeVars: readonly string[]
  // Different return types encountered are captured here.
  // Later, they'll be verified to make sure the return types are compatable with each other.
  readonly returnTypes: readonly { type: Type.AnyType, pos: Position }[]
  // All available declarations
  readonly declarations: readonly { identifier: string, type: Type.AnyType, identPos: Position }[]
}

export function create({ outerScopeVars = [], returnTypes = [], declarations = [] }: Partial<RespState> = {}): RespState {
  return {
    outerScopeVars,
    returnTypes,
    declarations,
  }
}

export function update(respState: Partial<RespState>, { outerScopeVars, returnTypes, declarations }: Partial<RespState>): RespState {
  return create({
    outerScopeVars: outerScopeVars ?? respState.outerScopeVars,
    returnTypes: returnTypes ?? respState.returnTypes,
    declarations: declarations ?? respState.declarations,
  })
}

export function merge(...states: RespState[]): RespState {
  return create({
    outerScopeVars: states.flatMap(s => s.outerScopeVars),
    returnTypes: states.flatMap(s => s.returnTypes),
    declarations: states.flatMap(s => s.declarations),
  })
}
