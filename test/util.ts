import { testRun } from '../parser'
import { BaseParseTimeError } from '../language/exceptions'
import { internalFile } from '../language/Position'

interface CustomTestRunOpts { modules?: { [name: string]: string } }
export const customTestRun = (text, opts: CustomTestRunOpts = {}) => {
  try {
    return testRun(text, opts)
  } catch (err) {
    if (err.message.includes('Unexpected end-of-file')) throw err
    if (!(err instanceof BaseParseTimeError)) throw err

    const { message, pos } = err
    const moduleTextWithErr: string | typeof internalFile = (
      pos.file === 'index.move' ? text :
      pos.file === internalFile ? internalFile :
      opts.modules[pos.file]
    )
    const snippet = moduleTextWithErr === internalFile
      ? '<internal file>'
      : moduleTextWithErr.slice(pos.offset, pos.offset + pos.length).replace(/\n/g, '\\n') + '.' // Add period, so errors have an end-token to match against.
    const newErr = new Error(message + ' -- ' + snippet)
    newErr.stack = err.stack
    throw newErr
  }
}

export const errorCodeOf = (callback: () => void) => {
  try {
    callback()
    throw new Error('This function was supposed to throw an error.')
  } catch (err) {
    if (!err.testCode) throw new Error('Expected a testCode property on the thrown error.')
    return err.testCode
  }
}