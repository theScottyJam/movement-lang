import fs from 'fs'
import path from 'path'
import nearley from 'nearley'
import { BadSyntaxError, SemanticError } from './language/exceptions'
import * as Type from './language/Type'
import * as types from './language/types'
import * as values from './language/values'
import type * as Node from './nodes/helpers/Node' // TODO: Maybe I need to move this type definition into a more accessible location
import { createStdLibAst } from './stdLib/stdLib'
import { formatParseError, prettyPrintLanguageError } from './errorFormatting'
import builtGrammar from './grammar.built'

const compiledGrammar = nearley.Grammar.fromCompiled(builtGrammar)

interface ModuleInfo {
  readonly module: values.RecordValue
  readonly moduleShape: types.RecordType
}

class ParseError extends Error {}

function expectErrorOfTypes<T>(callback: () => T, errorTypes: (new (...args: unknown[]) => Error)[]): T {
  try {
    return callback()
  } catch (err) {
    if (errorTypes.some(ErrorType => err instanceof ErrorType)) {
      throw err
    } else {
      throw new Error(`Internal error: Received an unexpected error of type ${err.constructor.name}:\n${err.message}`)
    }
  }
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

export function loadAndTypeCheck(fileToRun: string, { stdLib = runStdLib() }: { stdLib: ModuleInfo } = { stdLib: null }) {
  const { startingPath, moduleDefinitions } = expectErrorOfTypes(
    () => recursiveParse(fileToRun),
    [SemanticError, BadSyntaxError, ParseError]
  )

  const ast = moduleDefinitions.get(startingPath)
  const moduleShape = expectErrorOfTypes(() => ast.typeCheck({
    moduleDefinitions,
    importStack: [startingPath],
    stdLibShape: stdLib.moduleShape,
    isMainModule: true,
  }), [SemanticError])

  return { startingPath, moduleDefinitions, mainModuleShape: moduleShape }
}

// The main run() function. Errors are already caught, pretty-printed, and not rethrown.
// So, don't expect errors from this function.
export function run(fileToRun: string): ModuleInfo | null {
  const stdLib = runStdLib()
  try {
    const {
      startingPath,
      moduleDefinitions,
      mainModuleShape: moduleShape
    } = loadAndTypeCheck(fileToRun, { stdLib })

    const ast = moduleDefinitions.get(startingPath)
    const module = expectErrorOfTypes(() => ast.exec({
      moduleDefinitions,
      stdLib: stdLib.module,
    }), [])
    return { module, moduleShape }
  } catch (err) {
    const { success } = prettyPrintLanguageError(err, { ParseError })
    if (!success) {
      throw err
    }
  }
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
