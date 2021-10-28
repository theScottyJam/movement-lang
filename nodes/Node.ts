import * as Position from '../language/Position'
import * as Runtime from '../language/Runtime'
import * as Value from '../language/Value'
import * as TypeState from '../language/TypeState'
import * as RespState from '../language/RespState'
import * as Type from '../language/Type'

export interface Node {
  readonly pos?: Position.Position
  readonly exec: (rt: Runtime.Runtime) => Value.AnyValue
  readonly typeCheck: (state: TypeState.TypeState) => { respState: RespState.RespState, type: Type.AnyType }
}

export function create({ pos, exec, typeCheck }: Node): Node {
  return { pos, exec, typeCheck }
}