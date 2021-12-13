import fs from 'fs'
import path from 'path'
import nearley from 'nearley'
import { BadSyntaxError, SemanticError } from './language/exceptions'
import * as Type from './language/Type'
import type * as Node from './nodes/helpers/Node' // TODO: Maybe I need to move this type definition into a more accessible location
import builtGrammar from './grammar.built'

const compiledGrammar = nearley.Grammar.fromCompiled(builtGrammar)

const termColors = {
  bold: '\u001b[1m',
  yellow: '\u001b[33m',
  lightRed: '\x1B[1;31m',
  reset: '\u001b[0m',
}

function parse(text: string): Node.Root {
  // A fresh parser needs to be made between each parse.
  const parser = new nearley.Parser(compiledGrammar);

  parser.feed(text)
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
    const module = parse(source)
    moduleDefinitions.set(pathToLoad, module)
    const normalizedDependencies = module.dependencies.map(
      dependency => calcAbsoluteNormalizedPath(dependency, { relativeToFile: pathToLoad })
    )
    pathsToLoad.push(...normalizedDependencies)
  }
  return { startingPath, moduleDefinitions }
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

export function run(path) {
  let moduleDefinitions
  let startingPath
  const text = '<unknown file contents>' // TODO: I need to correctly load the file in which the error occurred.

  try {
    ;({ startingPath, moduleDefinitions } = recursiveParse(path))
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

  const ast = moduleDefinitions.get(startingPath)
  try {
    ast.typeCheck({
      moduleDefinitions,
      importStack: [startingPath],
    })
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

  ast.exec({
    moduleDefinitions,
  })
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

  const ast = moduleDefinitions.get(startingPath)
  ast.typeCheck({
    behaviors: {
      showDebugTypeOutput: type => result.push(Type.repr(type))
    },
    moduleDefinitions,
    importStack: [startingPath],
  })
  ast.exec({
    behaviors: {
      showDebugOutput: value => result.push(value)
    },
    moduleDefinitions,
  })

  return result
}
