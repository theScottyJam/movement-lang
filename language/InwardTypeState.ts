import * as Type from './Type'
import type * as types from './types'
import type { AstApi } from '../nodes/variants/AstApi'
import { PURITY } from './constants'

type purityTypes = typeof PURITY[keyof typeof PURITY]

export interface TypeStateBehaviors {
  readonly showDebugTypeOutput: (value: Type.AnyType) => void
}

export interface InwardTypeState {
  // The allowed level of purity within this block.
  // Only actions of this purity level or higher are allowed here.
  readonly minPurity: purityTypes
  // true if this is the first-loaded module
  readonly isMainModule: boolean
  // List of modules that are currently being looked at, where the first is the main module.
  // Used to find circular dependencies.
  readonly importStack: readonly string[]
  readonly constants: {
    readonly behaviors: Partial<TypeStateBehaviors>
    readonly stdLibShape: types.RecordType
    // Map of paths to loaded modules. This value won't change from its initial value.
    readonly moduleDefinitions: Map<string, AstApi>
  }
}

const required = () => { throw new Error('Missing required param') }
const InvalidParam = () => { throw new Error('Not allowed to provide this parameter') }

function defaultShowDebugTypeOutputFn(value: Type.AnyType) {
  console.info(Type.repr(value))
}

type CreateOrUpdateOpts = Partial<Omit<InwardTypeState, 'constants'> & InwardTypeState['constants']>

export function create(opts: CreateOrUpdateOpts): InwardTypeState {
  const {
    behaviors = { showDebugTypeOutput: null },
    minPurity = PURITY.pure,
    isMainModule = required(),
    moduleDefinitions = required(),
    importStack = [],
    stdLibShape = required(),
  } = opts

  return {
    minPurity,
    isMainModule,
    importStack,
    constants: {
      behaviors: {
        showDebugTypeOutput: behaviors.showDebugTypeOutput ?? defaultShowDebugTypeOutputFn,
      },
      stdLibShape,
      moduleDefinitions,
    },
  }
}

export function update(inwardState: InwardTypeState, opts: CreateOrUpdateOpts): InwardTypeState {
  return create({
    behaviors: inwardState.constants.behaviors,
    minPurity: opts.minPurity ?? inwardState.minPurity,
    isMainModule: opts.isMainModule ?? inwardState.isMainModule,
    moduleDefinitions: opts.moduleDefinitions ? InvalidParam() : inwardState.constants.moduleDefinitions,
    importStack: opts.importStack ?? inwardState.importStack,
    stdLibShape: opts.stdLibShape ? InvalidParam() : inwardState.constants.stdLibShape,
  })
}
