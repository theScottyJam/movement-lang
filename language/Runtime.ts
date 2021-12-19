import type { AnyValue } from './Value'
import type * as values from './values'
import type { AstApi } from '../nodes/variants/AstApi'

export interface RuntimeScope {
  readonly identifier: string
  readonly value: AnyValue
}

export interface RuntimeBehaviors {
  readonly showDebugOutput: (value: AnyValue) => void
}

export interface Runtime {
  readonly scopes: readonly RuntimeScope[]
  // Mapping of loaded modules
  readonly cachedModules: { readonly mutable: Map<string, values.RecordValue> }

  /* Constants */
  readonly behaviors: RuntimeBehaviors
  // Mapping of paths to AST trees for modules
  readonly moduleDefinitions: Map<string, AstApi>
  readonly stdLib: values.RecordValue
  // Maps a node's unique sentinel to data captured during type-checking
  // that'll be needed during exec()
  readonly typeCheckContexts: Map<symbol, unknown>
}

function defaultShowDebugOutputBehaviors(value: AnyValue) {
  console.info(value.raw)
}

interface CreateOpts {
  readonly scopes?: readonly RuntimeScope[]
  readonly behaviors?: Partial<RuntimeBehaviors>
  readonly moduleDefinitions: Map<string, AstApi>
  readonly cachedModules: { readonly mutable: Map<string, values.RecordValue> }
  readonly stdLib: values.RecordValue
  readonly typeCheckContexts: Map<symbol, unknown>
}
export function create({ scopes = [], behaviors = {}, moduleDefinitions, cachedModules, stdLib, typeCheckContexts }: CreateOpts): Runtime {
  return {
    scopes,
    behaviors: {
      showDebugOutput: behaviors.showDebugOutput ?? defaultShowDebugOutputBehaviors,
    },
    moduleDefinitions,
    cachedModules,
    stdLib,
    typeCheckContexts,
  }
}

interface UpdateOpts {
  readonly scopes?: readonly RuntimeScope[]
}
export function update(rt: Runtime, { scopes }: UpdateOpts): Runtime {
  return create({
    scopes: scopes ?? rt.scopes,
    behaviors: rt.behaviors,
    moduleDefinitions: rt.moduleDefinitions,
    cachedModules: rt.cachedModules,
    stdLib: rt.stdLib,
    typeCheckContexts: rt.typeCheckContexts,
  })
}

export function lookupVar(rt: Runtime, identifier: string): AnyValue | null {
  for (let i = rt.scopes.length - 1; i >= 0; --i) {
    if (rt.scopes[i].identifier === identifier) {
      return rt.scopes[i].value
    }
  }
  return null
}
