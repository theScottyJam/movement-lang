import type { Position } from '../../language/Position'
import type * as Type from '../../language/Type'
import * as types from '../../language/types'

export interface RespTypeState {
  // Variables encountered that belong to the outer scope get captured here.
  // This is needed to properly implement closures
  readonly outerFnVars: readonly string[]
  // Different return types encountered are captured here.
  // Later, they'll be verified to make sure the return types are compatible with each other.
  readonly returnTypes: readonly { type: Type.AnyType, pos: Position }[]
  // Items to add to the exported module
  readonly moduleShape: types.RecordType
  // Individual nodes can choose to store information they learned during the type-check phase here.
  // This map will be provided to the exec functions, so the nodes can get their stored context back.
  readonly typeCheckContexts: Map<symbol, unknown>
}

export function create(opts: Partial<RespTypeState> = {}): RespTypeState {
  const {
    outerFnVars = [],
    returnTypes = [],
    moduleShape = types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }),
    typeCheckContexts = new Map(),
  } = opts

  return {
    outerFnVars,
    returnTypes,
    moduleShape,
    typeCheckContexts,
  }
}

export function update(respState: Partial<RespTypeState>, { outerFnVars, returnTypes, moduleShape, typeCheckContexts }: Partial<RespTypeState>): RespTypeState {
  return create({
    outerFnVars: outerFnVars ?? respState.outerFnVars,
    returnTypes: returnTypes ?? respState.returnTypes,
    moduleShape: moduleShape ?? respState.moduleShape,
    typeCheckContexts: typeCheckContexts ?? respState.typeCheckContexts,
  })
}

export function merge(...states: RespTypeState[]): RespTypeState {
  return create({
    outerFnVars: [...new Set(states.flatMap(s => s.outerFnVars))],
    returnTypes: states.flatMap(s => s.returnTypes),
    moduleShape: states.reduce((accShape, state) => (
      types.createRecord({
        nameToType: new Map([...state.moduleShape.data.nameToType, ...accShape.data.nameToType]),
        symbolToInfo: new Map([...state.moduleShape.data.symbolToInfo, ...accShape.data.symbolToInfo]),
      })
    ), types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() })),
    typeCheckContexts: new Map(states.flatMap(s => [...s.typeCheckContexts.entries()])),
  })
}
