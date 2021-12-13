import type { Position } from './Position'
import type * as Type from './Type'
import * as types from './types'

export interface RespState {
  // Variables encountered that belong to the outer scope get captured here.
  // This is needed to properly implement closures
  readonly outerFnVars: readonly string[]
  // Different return types encountered are captured here.
  // Later, they'll be verified to make sure the return types are compatable with each other.
  readonly returnTypes: readonly { type: Type.AnyType, pos: Position }[]
  // All available declarations
  readonly declarations: readonly { identifier: string, type: Type.AnyType, identPos: Position }[]
  // Items to add to the exported module
  readonly moduleShape: types.RecordType
}

export function create(opts: Partial<RespState> = {}): RespState {
  const {
    outerFnVars = [],
    returnTypes = [],
    declarations = [],
    moduleShape = types.createRecord({ nameToType: new Map() }),
  } = opts

  return {
    outerFnVars,
    returnTypes,
    declarations,
    moduleShape,
  }
}

export function update(respState: Partial<RespState>, { outerFnVars, returnTypes, declarations, moduleShape }: Partial<RespState>): RespState {
  return create({
    outerFnVars: outerFnVars ?? respState.outerFnVars,
    returnTypes: returnTypes ?? respState.returnTypes,
    declarations: declarations ?? respState.declarations,
    moduleShape: moduleShape ?? respState.moduleShape,
  })
}

export function merge(...states: RespState[]): RespState {
  return create({
    outerFnVars: [...new Set(states.flatMap(s => s.outerFnVars))],
    returnTypes: states.flatMap(s => s.returnTypes),
    declarations: states.flatMap(s => s.declarations),
    moduleShape: states.reduce((accShape, state) => (
      types.createRecord({ nameToType: new Map([...state.moduleShape.data.nameToType, ...accShape.data.nameToType]) })
    ), types.createRecord({ nameToType: new Map() })),
  })
}
