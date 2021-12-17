import { BadSyntaxError, SemanticError } from './language/exceptions'

const termColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\x1B[1;31m',
  reset: '\u001b[0m',
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

function printPosition(text, pos) {
  return // Disabling for now, as its completely broken anyways.
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

export function prettyPrintLanguageError(err, { ParseError }) {
  const text = '<unknown file contents>' // TODO: I need to correctly load the file in which the error occurred.

  if (err instanceof SemanticError) {
    const { lightRed, reset } = termColors
    console.error(lightRed + 'Semantic Error: ' + reset + err.message)
    printPosition(text, err.pos)
  } else if (err instanceof BadSyntaxError) {
    const { lightRed, reset } = termColors
    console.error(lightRed + 'Syntax Error: ' + reset + err.message)
    printPosition(text, err.pos)
  } else if (err instanceof ParseError) {
    console.error(err.message)
  } else {
    return { success: false }
  }
  return { success: true }
}