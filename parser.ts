import fs from 'fs'
import path from 'path'
import nearley from 'nearley'
import { BadSyntaxError, SemanticError } from './language/exceptions'
import * as Type from './language/Type'
import * as types from './language/types'
import * as values from './language/values'
import type * as Node from './nodes/helpers/Node' // TODO: Maybe I need to move this type definition into a more accessible location
import { createStdLibAst } from './stdLib/stdLib'
import builtGrammar from './grammar.built'

const compiledGrammar = nearley.Grammar.fromCompiled(builtGrammar)

const termColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\x1B[1;31m',
  reset: '\u001b[0m',
}

interface ModuleInfo {
  readonly module: values.RecordValue
  readonly moduleShape: types.RecordType
}

class ParseError extends Error {}

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

function formatParseError(message: string, filePath: string) {
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

function parse(text: string, { pathForErrMsg }: { pathForErrMsg: string }): Node.Root {
  // A fresh parser needs to be made between each parse.
  const parser = new nearley.Parser(compiledGrammar);

  try {
    parser.feed(text)
  } catch (err) {
    if (!('token' in err)) throw err
    if (!err.message.startsWith('Syntax error')) throw err
    throw new ParseError(formatParseError(err.message, pathForErrMsg))
  }

  if (parser.results.length === 0) throw new BadSyntaxError('Unexpected end-of-file.', null)
  if (parser.results.length > 1) throw new Error(`Internal error: Grammar is ambiguous - ${parser.results.length} possible results were found.`)
  return parser.results[0]
}

// §dIPUB - search for a similar implementation that's used elsewhere
const calcAbsoluteNormalizedPath = (rawPath: string, { relativeToFile }: { relativeToFile: string }) => (
  path.normalize(path.join(path.dirname(relativeToFile), rawPath))
)

interface RecursiveParseOpts {
  // Returns null if the module could not be resolved from the given path
  readonly loadModuleSource?: (string) => string | null
}
function recursiveParse(path_, { loadModuleSource = null }: RecursiveParseOpts = {}) {
  loadModuleSource ??= modulePath => fs.readFileSync(modulePath, 'utf-8')
  const moduleDefinitions = new Map<string, Node.Root>()
  const startingPath = path.normalize(path_)
  const pathsToLoad = [startingPath]
  while (pathsToLoad.length) {
    const pathToLoad = pathsToLoad.pop()
    if (moduleDefinitions.has(pathToLoad)) continue
    const source = loadModuleSource(pathToLoad)
    if (source == null) throw new Error(`Module not found: ${pathToLoad}`)
    const module = parse(source, { pathForErrMsg: path_ })
    moduleDefinitions.set(pathToLoad, module)
    const normalizedDependencies = module.dependencies.map(
      dependency => calcAbsoluteNormalizedPath(dependency, { relativeToFile: pathToLoad })
    )
    pathsToLoad.push(...normalizedDependencies)
  }
  return { startingPath, moduleDefinitions }
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

function runStdLib(): ModuleInfo {
  const ast = createStdLibAst()
  const moduleShape = ast.typeCheck({
    moduleDefinitions: new Map(),
    importStack: ['%stdLib%'],
    stdLibShape: types.createRecord({ nameToType: new Map() }),
    isMainModule: false,
  })
  const module = ast.exec({
    moduleDefinitions: new Map(),
    stdLib: values.createRecord(new Map(), types.createRecord({ nameToType: new Map() }))
  })
  return { module, moduleShape }
}

// Returns null if an error was caught and reported.
// If null is returned, just let the program exit naturally.
// isMainModule can be set to true, if you want to load a library module. This is currently an unused feature.
function rawRun(fileToRun: string, stdLib: ModuleInfo, { isMainModule = null } = {}): ModuleInfo | null {
  let moduleDefinitions: Map<string, Node.Root>
  let startingPath: string
  const text = '<unknown file contents>' // TODO: I need to correctly load the file in which the error occurred.

  try {
    ;({ startingPath, moduleDefinitions } = recursiveParse(fileToRun))
  } catch (err) {
    if (err instanceof SemanticError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Semantic Error: ' + reset + err.message)
      if (err.pos) {
        printPosition(text, err.pos)
      } else if (err.pos !== null) {
        throw new Error('Internal error: Forgot to set the "pos" attribute on this error')
      }
      return null
    } else if (err instanceof BadSyntaxError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Syntax Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return null
    } else {
      if (!(err instanceof ParseError)) throw err
      console.error(err.message)
      return null
    }
  }

  const ast = moduleDefinitions.get(startingPath)
  let moduleShape: types.RecordType
  try {
    moduleShape = ast.typeCheck({
      moduleDefinitions,
      importStack: [startingPath],
      stdLibShape: stdLib.moduleShape,
      isMainModule,
    })
  } catch (err) {
    if (err instanceof SemanticError) {
      const { lightRed, reset } = termColors
      console.error(lightRed + 'Semantic Error: ' + reset + err.message)
      printPosition(text, err.pos)
      return null
    } else {
      throw err
    }
  }

  const module = ast.exec({
    moduleDefinitions,
    stdLib: stdLib.module,
  })
  return { module, moduleShape }
}

export function run(fileToRun) {
  rawRun(fileToRun, runStdLib())
}

interface TestRunOpts {
  readonly modules: { [path: string]: string }
}
export function testRun(text, { modules: pathToSource = {} }: TestRunOpts = { modules: {} }) {
  let result = []

  const { startingPath, moduleDefinitions } = recursiveParse('index.toy', {
    loadModuleSource: requestedPath => {
      if (requestedPath === 'index.toy') return text
      return pathToSource[requestedPath]
    }
  })

  const { module: stdLib, moduleShape: stdLibShape } = runStdLib()

  const ast = moduleDefinitions.get(startingPath)
  ast.typeCheck({
    behaviors: {
      showDebugTypeOutput: type => result.push(Type.repr(type))
    },
    moduleDefinitions,
    importStack: [startingPath],
    stdLibShape,
  })
  ast.exec({
    behaviors: {
      showDebugOutput: value => result.push(value)
    },
    moduleDefinitions,
    stdLib
  })

  return result
}
