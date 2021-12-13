import type { AnyValue } from './Value'
import type * as values from './values'
import type * as Node from '../nodes/helpers/Node' // TODO: Shouldn't reach in like this

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
  readonly moduleDefinitions: Map<string, Node.Root>
  readonly cachedModules: { readonly mutable: Map<string, values.RecordValue> }
}

function defaultShowDebugOutputBehaviors(value: AnyValue) {
  console.info(value.raw)
}

interface CreateOpts {
  readonly scopes?: readonly RuntimeScope[]
  readonly behaviors?: Partial<RuntimeBehaviors>
  readonly moduleDefinitions: Map<string, Node.Root>
  readonly cachedModules: { readonly mutable: Map<string, values.RecordValue> }
}
export function create({ scopes = [], behaviors = {}, moduleDefinitions, cachedModules }: CreateOpts): Runtime {
  return {
    scopes,
    behaviors: {
      showDebugOutput: behaviors.showDebugOutput ?? defaultShowDebugOutputBehaviors,
    },
    moduleDefinitions,
    cachedModules,
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
