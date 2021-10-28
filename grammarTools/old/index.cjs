const nodes = require('./nodes.cjs')
const tools = require('./tools.cjs')

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