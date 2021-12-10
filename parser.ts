import nearley from 'nearley'
import { BadSyntaxError, SemanticError } from './language/exceptions'
import * as Type from './language/Type'
import builtGrammar from './grammar.built'

const compiledGrammar = nearley.Grammar.fromCompiled(builtGrammar)

const termColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\x1B[1;31m',
  reset: '\u001b[0m',
}

function parse(text) {
  // A fresh parser needs to be made between each parse.
  const parser = new nearley.Parser(compiledGrammar);

  parser.feed(text)
  if (parser.results.length === 0) throw new BadSyntaxError('Unexpected end-of-file.', null)
  if (parser.results.length > 1) throw new Error(`Internal error: Grammar is ambiguous - ${parser.results.length} possible results were found.`)
  return parser.results[0]
}

function printPosition(text, pos) {
  const MAX_COLS = 75
  const OVERFLOW_LEFT_PAD = 20

  const effectedText = text.slice(pos.offset, pos.offset + pos.length)
  const newLineCount = effectedText.split('\n').length - 1
  const firstLine = pos.line
  const lastLine = firstLine + newLineCount
  const firstCol = pos.col - 1
  const lastCol = newLineCount === 0 ? firstCol + pos.length : effectedText.split('\n').pop().length - 1

  const line = text.split(/\r?\n/)[firstLine - 1]
  const lastColOnFirstLine = firstLine === lastLine ? lastCol : line.length

  let firstChar = [...line].findIndex(x => x !== ' ')
  if (firstChar === -1) firstChar = 0
  if (firstChar > firstCol) firstChar = 0
  const startAt = lastColOnFirstLine <= MAX_COLS
    ? firstChar
    : Math.max(firstChar, firstCol - OVERFLOW_LEFT_PAD)
  
  const leftEllipses = startAt !== firstChar
  const rightEllipses = line.length > startAt + MAX_COLS || firstLine !== lastLine

  const codeSnippet = (
    (leftEllipses ? '…' : '') +
    line.slice(startAt, startAt + MAX_COLS) +
    (rightEllipses ? '…' : '')
  )
  const underline = (
    ' '.repeat(firstCol - startAt) +
    (leftEllipses ? ' ' : '') +
    '~'.repeat(lastColOnFirstLine - firstCol) +
    (firstLine !== lastLine || lastCol > firstCol + MAX_COLS ? '~' : '')
  )

  const { bold, yellow, reset } = termColors
  console.error(`At line ${bold+firstLine+reset}`)
  console.error()
  console.error(codeSnippet)
  console.error(bold + yellow + underline + reset)
}

export function run(text) {
  let ast

  try {
    ast = parse(text)
  } catch (err) {
    if (err instanceof SemanticError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Semantic Error: ' + reset + err.message)
      if (err.pos) {
        printPosition(text, err.pos)
      } else if (err.pos !== null) {
        throw new Error('Internal error: Forgot to set the "pos" attribute on this error')
      }
      return
    } else if (err instanceof BadSyntaxError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Syntax Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return
    } else {
      if (!('token' in err)) throw err // If it's not a syntax error from Nearley
      console.error(err.message)
      return
    }
  }

  try {
    ast.typeCheck()
  } catch (err) {
    if (err instanceof SemanticError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Semantic Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return
    } else {
      throw err
    }
  }

  ast.exec()
}

export function testRun(text) {
  let result = []


  const ast = parse(text)
  ast.typeCheck({
    behaviors: {
      showDebugTypeOutput: type => result.push(Type.repr(type))
    }
  })
  ast.exec({
    behaviors: {
      showDebugOutput: value => result.push(value)
    }
  })

  return result
}
