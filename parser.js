'use strict'

require('string.prototype.replaceall').shim();

const fs = require('fs')
const path = require('path')
const { Parser } = require("jison")
const grammarTools = require('./grammarTools')

const grammarText = fs.readFileSync(path.join(__dirname, `grammar.jison`), 'utf8')

if (globalThis.grammarTools) throw new Error('UNREACHABLE')
globalThis.grammarTools = grammarTools // Provide grammarTools to the parser
const parser = new Parser(grammarText)
delete globalThis.grammarTools

const termColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\x1B[1;31m',
  reset: '\u001b[0m',
}

function printPosition(text, pos) {
  const MAX_COLS = 75
  const OVERFLOW_LEFT_PAD = 20
  const { first_line: firstLine, last_line: lastLine, first_column: firstCol, last_column: lastCol } = pos
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

exports.run = function run(text) {
  let ast

  try {
    ast = parser.parse(text)
  } catch (err) {
    if (err instanceof grammarTools.SemanticError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Semantic Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return
    } else if (err instanceof grammarTools.SyntaxError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Syntax Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return
    } else {
      if (!err.hash) throw err // If it's not a syntax error from Jison
      console.error(err.message)
      return
    }
  }

  try {
    ast.typeCheck()
  } catch (err) {
    if (err instanceof grammarTools.TypeError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Type Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return
    } else if (err instanceof grammarTools.SemanticError) {
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

exports.testRun = function testRun(text) {
  let result = []
  const debugOutput = value => result.push(value)

  grammarTools.withDebugOutput(debugOutput, () => {
    const ast = parser.parse(text)
    ast.typeCheck()
    ast.exec()
  })

  return result
}
