const nodes = require('./nodes')
const tools = require('./tools')

module.exports = {
  nodes,
  BaseParseTimeError: tools.BaseParseTimeError,
  TypeError: tools.TypeError,
  SemanticError: tools.SemanticError,
  SyntaxError: tools.SyntaxError,
  withDebugOutput: (debugOutputFn, callback) => {
    const originalDebugOutput = tools.showDebugOutput
    tools.showDebugOutput = debugOutputFn
    try {
      return callback()
    } finally {
      tools.showDebugOutput = originalDebugOutput
    }
  }
}