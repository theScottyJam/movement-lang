import type { AnyInstructionNode } from './InstructionNode'
import type * as Runtime from '../../language/Runtime'
import type * as InwardTypeState from '../../language/InwardTypeState'
import type * as types from '../../language/types'
import type * as values from '../../language/values'

interface AstExecOpts {
  readonly behaviors?: Partial<Runtime.RuntimeBehaviors>
  readonly moduleDefinitions: Map<string, AstApi>
  readonly cachedModules?: { mutable: Map<string, values.RecordValue> }
  readonly stdLib: values.RecordValue
  readonly typeCheckContexts: Map<symbol, unknown>
}

interface AstTypeCheckOpts {
  readonly behaviors?: Partial<InwardTypeState.TypeStateBehaviors>
  readonly moduleDefinitions: Map<string, AstApi>
  readonly importStack?: readonly string[]
  readonly stdLibShape: types.RecordType
  readonly isMainModule?: boolean
}

export interface AstApi {
  readonly dependencies: readonly string[]
  readonly ast: AnyInstructionNode
  readonly exec: (opts: AstExecOpts) => values.RecordValue
  readonly typeCheck: (opts: AstTypeCheckOpts) => {
    readonly typeCheckContexts: Map<symbol, unknown>,
    readonly type: types.RecordType,
  }
}

export const create = ({ dependencies, ast, exec, typeCheck }: AstApi): AstApi => ({
  dependencies,
  ast,
  exec,
  typeCheck
})