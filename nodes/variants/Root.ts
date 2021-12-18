import type { AnyInstructionNode } from './InstructionNode'
import type * as Runtime from '../../language/Runtime'
import type * as TypeState from '../../language/TypeState'
import type * as types from '../../language/types'
import type * as values from '../../language/values'

interface RootExecOpts {
  readonly behaviors?: Partial<Runtime.RuntimeBehaviors>
  readonly moduleDefinitions: Map<string, Root>
  readonly cachedModules?: { mutable: Map<string, values.RecordValue> }
  readonly stdLib: values.RecordValue
}

interface RootTypeCheckOpts {
  readonly behaviors?: Partial<TypeState.TypeStateBehaviors>
  readonly moduleDefinitions: Map<string, Root>
  readonly moduleShapes?: { readonly mutable: Map<string, types.RecordType> }
  readonly importStack?: readonly string[]
  readonly stdLibShape: types.RecordType
  readonly isMainModule?: boolean
}

export interface Root {
  readonly dependencies: readonly string[]
  readonly ast: AnyInstructionNode
  readonly exec: (opts: RootExecOpts) => values.RecordValue
  readonly typeCheck: (opts: RootTypeCheckOpts) => types.RecordType
}

export const create = ({ dependencies, ast, exec, typeCheck }: Root): Root => ({
  dependencies,
  ast,
  exec,
  typeCheck
})