const fs = require('fs')
const path = require('path')
const { Parser } = require("jison")
const grammarTools = require('./grammarTools')

grammarText = fs.readFileSync(path.join(__dirname, `grammar.jison`), 'utf8')

if (globalThis.grammarTools) throw new Error('UNREACHABLE')
globalThis.grammarTools = grammarTools // Provide grammarTools to the parser
const parser = new Parser(grammarText)
delete globalThis.grammarTools

const termColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\033[1;31m',
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
  console.log(`At line ${bold+firstLine+reset}`)
  console.log()
  console.log(codeSnippet)
  console.log(bold + yellow + underline + reset)
}

function run(text) {
  let ast

  try {
    ast = parser.parse(text)
  } catch (err) {
    if (err instanceof grammarTools.SemanticError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Semantic Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return
    } else {
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

run(`\
let x = print { a: 1, b: 2 }
`)

/*
TODO: I'm implementing scoping wrong!!
When a function is called, it should access variables from the local scope around it, not from wherever I called it from.

let x = 2 // add to scope
let y = 3 // check if in scope, if so throw error, otherwise add to it
let f = () => (
  // An initial scope will exist, that contains all to-be-determined captured variables
  let a = 1 // add to scope
  in x // type-checker detects this comes from an outer scope. At type-check time we keep around a stack of scopes. "X" will be added as a dependency to f(), to be captured.
) // Capture logic will happen. If capturing from two scopes up, it should retrigger that here.
*/