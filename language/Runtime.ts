import type { AnyValue } from './Value'
import type * as values from './values'
import type { Root as AstRoot } from '../nodes/variants/Root' // TODO: Shouldn't reach in like this

export interface RuntimeScope {
  readonly identifier: string
  readonly value: AnyValue
}

export interface RuntimeBehaviors {
  readonly showDebugOutput: (value: AnyValue) => void
}

export interface Runtime {
  readonly scopes: readonly RuntimeScope[]
  readonly behaviors: RuntimeBehaviors
  // Mapping of paths to AST trees for modules
  readonly moduleDefinitions: Map<string, AstRoot>
  // Mapping of loaded modules
  readonly cachedModules: { readonly mutable: Map<string, values.RecordValue> }
  readonly stdLib: values.RecordValue
}

function defaultShowDebugOutputBehaviors(value: AnyValue) {
  console.info(value.raw)
}

interface CreateOpts {
  readonly scopes?: readonly RuntimeScope[]
  readonly behaviors?: Partial<RuntimeBehaviors>
  readonly moduleDefinitions: Map<string, AstRoot>
  readonly cachedModules: { readonly mutable: Map<string, values.RecordValue> }
  readonly stdLib: values.RecordValue
}
export function create({ scopes = [], behaviors = {}, moduleDefinitions, cachedModules, stdLib }: CreateOpts): Runtime {
  return {
    scopes,
    behaviors: {
      showDebugOutput: behaviors.showDebugOutput ?? defaultShowDebugOutputBehaviors,
    },
    moduleDefinitions,
    cachedModules,
    stdLib,
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
