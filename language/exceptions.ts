import type { Position } from './Position'
import type { AnyValue } from './Value'

export class BaseParseTimeError extends Error {
  public readonly pos: Position
  constructor(message, pos: Position) {
    super(message)
    this.pos = pos
  }
}

export class BadSyntaxError extends BaseParseTimeError {}
export class SemanticError extends BaseParseTimeError {}

export class FlowControlBaseError extends Error {
  constructor() {
    super('This error is intended to control the flow of the program, and should always be caught.')
  }
}

export class FlowControlReturnError extends FlowControlBaseError {
  public readonly data: { returnValue: AnyValue }
  constructor(data: { returnValue: AnyValue }) {
    super()
    this.data = data
  }
}

export class RuntimeError extends Error {}