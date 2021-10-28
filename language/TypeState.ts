import type { Position } from './Position.js'
import type { RespState } from './RespState.js'
import type * as Type from './Type.js'
import { SemanticError } from './exceptions.js'
import { PURITY } from './constants.js'

type purityTypes = typeof PURITY[keyof typeof PURITY]
type createTypeFn = () => Type.AnyType

export interface TypeState {
  // The types of specific values in different scopes.
  // e.g. let x = 2 adds an entry for "x" in the current scope.
  readonly scopes: readonly Map<string, Type.AnyType>[]
  // Types that have been defined in different scopes.
  // e.g. type alias x = number adds an entry for "x" in the current definedType scope.
  readonly definedTypes: readonly Map<string, createTypeFn>[]
  // The allowed level of purity within this block.
  // Only actions of this purity level or higher are allowed here.
  readonly minPurity: purityTypes
  // true if currently within a beginBlock
  readonly isBeginBlock: boolean
}

const top = <T>(array: readonly T[]): T => array[array.length - 1]

export function create(opts: Partial<TypeState> = {}): TypeState {
  const {
    scopes = [new Map()],
    definedTypes = [new Map()],
    minPurity = PURITY.pure,
    isBeginBlock = false,
  } = opts

  return {
    scopes,
    definedTypes,
    minPurity,
    isBeginBlock,
  }
}

export function update(typeState: TypeState, opts: Partial<TypeState>): TypeState {
  return create({
    scopes: opts.scopes ?? typeState.scopes,
    definedTypes: opts.definedTypes ?? typeState.definedTypes,
    minPurity: opts.minPurity ?? typeState.minPurity,
    isBeginBlock: opts.isBeginBlock ?? typeState.isBeginBlock,
  })
}

export function addToScope(typeState: TypeState, identifier: string, type: Type.AnyType, pos: Position): TypeState {
  if (identifier === '$') return typeState
  const newScope = new Map(top(typeState.scopes))
  if (newScope.has(identifier)) {
    throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
  }
  newScope.set(identifier, type)

  return update(typeState, {
    scopes: [...typeState.scopes.slice(0, -1), newScope],
  })
}

export function addToTypeScope(typeState: TypeState, identifier: string, createType: createTypeFn, pos: Position): TypeState {
  // createType() is a function and not a plain type, so that unknown types can be added
  // to the scope, and each reference to the unknown type will produce a unique unknown instance
  // preventing you from assigning one unknown type to another.
  if (identifier === '$') return typeState
  const newScope = new Map(top(typeState.definedTypes))
  if (newScope.has(identifier)) {
    throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
  }
  newScope.set(identifier, createType)

  return update(typeState, {
    definedTypes: [...typeState.definedTypes.slice(0, -1), newScope],
  })
}

interface VarLookupInfo { type: Type.AnyType, fromOuterScope: boolean }
export function lookupVar(typeState: TypeState, identifier: string): VarLookupInfo | null {
  for (let scope of [...typeState.scopes].reverse()) {
    const type = scope.get(identifier)
    if (type) return { type, fromOuterScope: scope !== top(typeState.scopes) }
  }
  return null
}

interface TypeLookupInfo { createType: createTypeFn }
export function lookupType(typeState: TypeState, identifier: string): TypeLookupInfo | null {
  for (let scope of [...typeState.definedTypes].reverse()) {
    const createType = scope.get(identifier)
    if (createType) return { createType }
  }
  return null
}

export function applyDeclarations(typeState: TypeState, respState: RespState): TypeState {
  return respState.declarations.reduce((state, { identifier, type, identPos }) => addToScope(state, identifier, type, identPos), typeState)
}