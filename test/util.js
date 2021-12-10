import { testRun } from '../parser'
import { BaseParseTimeError } from '../language/exceptions'

export const customTestRun = text => {
  try {
    return testRun(text)
  } catch (err) {
    if (!(err instanceof BaseParseTimeError)) throw err
    const { message, pos } = err
    const lines = text.split('\n').slice(pos.first_line - 1, pos.last_line)
    if (pos.first_line === pos.last_line) {
      lines[0] = lines[0].slice(pos.first_column, pos.last_column)
    } else {
      lines[0] = lines[0].slice(0, pos.first_column)
      lines[lines.length - 1] = lines[lines.length - 1].slice(pos.last_column)
    }
    throw new Error(message + ' -- ' + lines.join('\\n'))
  }
}

export const errorCodeOf = callback => {
  try {
    callback()
    throw new Error('This function was supposed to throw an error.')
  } catch (err) {
    if (!err.testCode) throw new Error('Expected a testCode property on the thrown error.')
    return err.testCode
  }
}