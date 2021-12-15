import fs from 'fs'
import type { Position } from './Position'
import type { RespState } from './RespState'
import * as Type from './Type'
import type * as types from './types'
import type * as Node from '../nodes/helpers/Node' // TODO: I probably should not be reaching over here. (Maybe I can parameterize TypeState instead, with a generic parameter)
import { SemanticError } from './exceptions'
import { PURITY } from './constants'

type purityTypes = typeof PURITY[keyof typeof PURITY]
type createTypeFn = () => Type.AnyType

export interface TypeStateBehaviors {
  readonly showDebugTypeOutput: (value: Type.AnyType) => void
}

export interface TypeState {
  readonly behaviors: Partial<TypeStateBehaviors>
  // The types of specific values in different scopes.
  // e.g. let x = 2 adds an entry for "x" in the current scope.
  readonly scopes: {
    // A symbol that uniquely identifies which function you're in (if you're in one)
    // i.e. a subscope within a function would have the same symbol as the function itself.
    // Used for deciding which variables need to be captured from outer scopes.
    readonly forFn: symbol
    readonly typeLookup: Map<string, Type.AnyType>
  }[]
  // Types that have been defined in different scopes.
  // e.g. type alias x = number adds an entry for "x" in the current definedType scope.
  readonly definedTypes: readonly Map<string, createTypeFn>[]
  // The allowed level of purity within this block.
  // Only actions of this purity level or higher are allowed here.
  readonly minPurity: purityTypes
  // true if currently within a beginBlock
  readonly isBeginBlock: boolean
  // true if this is the first-loaded module
  readonly isMainModule: boolean
  // Map of paths to loaded modules. This value won't change from its initial value.
  readonly moduleDefinitions: Map<string, Node.Root>
  // Map of paths to module shapes
  readonly moduleShapes: { readonly mutable: Map<string, types.RecordType> }
  // List of modules that are currently being looked at, where the first is the main module.
  // Used to find circular dependencies.
  readonly importStack: readonly string[]
  readonly stdLibShape: types.RecordType
}

const required = () => { throw new Error('Missing required param') }
const InvalidParam = () => { throw new Error('Not allowed to provide this parameter') }

function defaultShowDebugTypeOutputFn(value: Type.AnyType) {
  console.info(Type.repr(value))
}

const top = <T>(array: readonly T[]): T => array[array.length - 1]

export function create(opts: Partial<TypeState> = {}): TypeState {
  const {
    behaviors = { showDebugTypeOutput: null },
    scopes = [{ forFn: Symbol(), typeLookup: new Map() }],
    definedTypes = [new Map()],
    minPurity = PURITY.pure,
    isBeginBlock = false,
    isMainModule = required(),
    moduleDefinitions = required(),
    moduleShapes = { mutable: new Map() },
    importStack = [],
    stdLibShape = required(),
  } = opts

  return {
    behaviors: {
      showDebugTypeOutput: behaviors.showDebugTypeOutput ?? defaultShowDebugTypeOutputFn,
    },
    scopes,
    definedTypes,
    minPurity,
    isBeginBlock,
    isMainModule,
    moduleDefinitions,
    moduleShapes,
    importStack,
    stdLibShape,
  }
}

export function update(typeState: TypeState, opts: Partial<TypeState>): TypeState {
  return create({
    behaviors: typeState.behaviors,
    scopes: opts.scopes ?? typeState.scopes,
    definedTypes: opts.definedTypes ?? typeState.definedTypes,
    minPurity: opts.minPurity ?? typeState.minPurity,
    isBeginBlock: opts.isBeginBlock ?? typeState.isBeginBlock,
    isMainModule: opts.isMainModule ?? typeState.isMainModule,
    moduleDefinitions: opts.moduleDefinitions ? InvalidParam() : typeState.moduleDefinitions,
    moduleShapes: opts.moduleShapes ? InvalidParam() : typeState.moduleShapes,
    importStack: opts.importStack ?? typeState.importStack,
    stdLibShape: opts.stdLibShape ? InvalidParam() : typeState.stdLibShape,
  })
}

export function addToScope(typeState: TypeState, identifier: string, type: Type.AnyType, pos: Position): TypeState {
  if (identifier === '$') return typeState
  const newScope = new Map(top(typeState.scopes).typeLookup)
  if (newScope.has(identifier)) {
    throw new SemanticError(`Identifier "${identifier}" already exists in scope, please choose a different name.`, pos)
  }
  newScope.set(identifier, type)

  return update(typeState, {
    scopes: [...typeState.scopes.slice(0, -1), { forFn: top(typeState.scopes).forFn, typeLookup: newScope }],
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

interface VarLookupInfo { type: Type.AnyType, fromOuterFn: boolean }
export function lookupVar(typeState: TypeState, identifier: string): VarLookupInfo | null {
  for (let scope of [...typeState.scopes].reverse()) {
    const type = scope.typeLookup.get(identifier)
    if (type) return { type, fromOuterFn: scope.forFn !== top(typeState.scopes).forFn }
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