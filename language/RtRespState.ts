import type * as Value from './Value'

/*
WARNING: Because flow-control is sometimes implemented via exceptions,
respState will not follow be collected and merged as the stack unwinds from a function return.
The current use case does not need this, but this should be kept in mind in case future use cases have to worry about it.
I'm also not passing the rtRespState through assignment targets.
*/

export interface RtRespState {
  // Items being exported
  readonly exports: Map<string, Value.AnyValue>
}

export function create(opts: Partial<RtRespState> = {}): RtRespState {
  const { exports = new Map(), } = opts
  return { exports }
}

export function merge(...states: RtRespState[]): RtRespState {
  return create({
    exports: states.reduce((accExports, state) => (
      new Map([...state.exports, ...accExports])
    ), new Map()),
  })
}
