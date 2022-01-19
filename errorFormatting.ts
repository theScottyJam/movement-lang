import { BadSyntaxError, SemanticError } from './language/exceptions'
import * as Position from './language/Position'

type LoadModuleFn = (path: string) => string

const defaultTermColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\x1B[1;31m',
  reset: '\u001b[0m',
}

const noTermColors = {
  bold: '',
  yellow: '',
  lightRed: '',
  reset: '',
}

function camelCaseToSpaces(text) {
  let newText = ''
  for (const c of text) {
    if (c.toUpperCase() === c) {
      newText += ' ' + c.toLowerCase()
    } else {
      newText += c
    }
  }
  return newText
}

export function formatParseError(message: string, filePath: string) {
  const lines = message.split('\n')
  const errSummary = `Error in file ${filePath}\n` + lines.slice(0, 6).join('\n')
  const expectedTokens = lines.slice(6)
    .filter(line => line && !line.startsWith(' '))
    .map(line => /^A (.*?)( token)? based on:$/.exec(line)?.[1])
    .filter(phrase => !['whitespace', 'comment', 'multilineComment', 'newLine'].includes(phrase))
    .map(phrase => phrase[0] === '"' ? phrase : camelCaseToSpaces(phrase))
    .join(', ')

  return errSummary + expectedTokens
}

interface FormatPositionOpts { loadModule: LoadModuleFn, colorOutput?: boolean }
function formatPosition(pos, { loadModule, colorOutput = true }: FormatPositionOpts): string {
  const termColors = colorOutput ? defaultTermColors : noTermColors
  if (pos.file === Position.internalFile) {
    // At the moment of writing this code, I don't believe this branch of code will ever execute.
    // When the stdLib loads, it's errors don't go through this printPosition function.
    const { bold, reset } = termColors
    return `At ${bold+'<internal file>'+reset}`
  }

  const text = loadModule(pos.file)
  const MAX_COLS = 75
  const OVERFLOW_LEFT_PAD = 20

  const effectedText = text.slice(pos.offset, pos.offset + pos.length)
  const newLineCount = effectedText.split('\n').length - 1
  const firstLine = pos.line
  const lastLine = firstLine + newLineCount
  const firstCol = pos.col - 1
  const lastCol = newLineCount === 0 ? firstCol + pos.length : effectedText.split('\n').pop().length - 1

  const line = text.split(/\r?\n/)[firstLine - 1] ?? ''
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
  return [
    `At line ${bold+firstLine+reset}`,
    '',
    codeSnippet,
    bold + yellow + underline + reset,
  ].join('\n')
}

interface PrettyPrintLanguageErrorOpts {
  ParseError: { new(): Error }
  loadModule: LoadModuleFn
}
export function prettyPrintLanguageError(err: Error, { ParseError, loadModule }: PrettyPrintLanguageErrorOpts) {
  if (err instanceof SemanticError) {
    const { lightRed, reset } = defaultTermColors
    console.error(lightRed + 'Semantic Error: ' + reset + err.message)
    console.error(formatPosition(err.pos, { loadModule }))
  } else if (err instanceof BadSyntaxError) {
    const { lightRed, reset } = defaultTermColors
    console.error(lightRed + 'Syntax Error: ' + reset + err.message)
    console.error(formatPosition(err.pos, { loadModule }))
  } else if (err instanceof ParseError) {
    console.error(err.message)
  } else {
    return { success: false }
  }
  return { success: true }
}

export const _testingHelpers = { formatPosition }