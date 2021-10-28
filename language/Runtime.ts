import type { AnyValue } from './Value'

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
}

function defaultShowDebugOutputBehaviors(value: AnyValue) {
  console.info(value.raw)
}

interface CreateOpts {
  readonly scopes?: readonly RuntimeScope[]
  readonly behaviors?: Partial<RuntimeBehaviors>
}
export function create({ scopes = [], behaviors = {} }: CreateOpts = {}): Runtime {
  return {
    scopes,
    behaviors: {
      showDebugOutput: behaviors.showDebugOutput ?? defaultShowDebugOutputBehaviors,
    }
  }
}

interface UpdateOpts {
  readonly scopes?: readonly RuntimeScope[]
}
export function update(rt: Runtime, { scopes }: UpdateOpts): Runtime {
  return create({
    scopes: scopes ?? rt.scopes,
    behaviors: rt.behaviors,
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
