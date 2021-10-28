'use strict'

class BaseParseTimeError extends Error {
  constructor(message, pos) {
    super(message)
    this.pos = pos
  }
}

module.exports = {
  BaseParseTimeError,
  TypeError: class extends BaseParseTimeError {}, // TODO: Get rid of this and use SemanticError instead
  SyntaxError: class extends BaseParseTimeError {},
  SemanticError: class extends BaseParseTimeError {},
  FlowControlError: class extends Error {
    constructor(type, data) {
      super(`This error is intended to control the flow of the program, and should always be caught.`)
      this.type = type
      this.data = data
    }
  },
  RuntimeError: class extends Error {
    constructor(message) {
      super(message)
    }
  },
}