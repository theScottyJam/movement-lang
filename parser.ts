import fs from 'fs'
import path from 'path'
import nearley from 'nearley'
import { BadSyntaxError, SemanticError } from './language/exceptions'
import * as Type from './language/Type'
import * as types from './language/types'
import * as values from './language/values'
import type { AstApi } from './nodes/variants/AstApi' // TODO: Maybe I need to move this type definition into a more accessible location
import { createStdLibAst } from './stdLib/stdLib'
import * as warnings from './warnings'
import { GrammarBoundary } from './grammarBoundary'
import { formatParseError, prettyPrintLanguageError } from './errorFormatting'
import builtGrammar from './grammar.built'

// This helper should be eventually removed
globalThis.debug = (...args) => {
  console.info(...args)
  return args[args.length - 1]
}

const top = <T>(array: readonly T[]): T => array[array.length - 1]

const compiledGrammar = nearley.Grammar.fromCompiled(builtGrammar)

interface ModuleInfo {
  readonly module: values.RecordValue
  readonly moduleShape: types.RecordType
  readonly typeCheckContexts: Map<symbol, unknown>
}

class ParseError extends Error {}

function expectErrorOfTypes<T>(callback: () => T, errorTypes: (new (...args: unknown[]) => Error)[]): T {
  const allKnownSpecialErrors: (new (...args: unknown[]) => Error)[] = [SemanticError, BadSyntaxError, ParseError]
  if (errorTypes.length > 0 && errorTypes.some(ErrorType => !allKnownSpecialErrors.includes(ErrorType))) throw new Error()

  try {
    return callback()
  } catch (err) {
    if (errorTypes.some(ErrorType => err instanceof ErrorType)) {
      throw err
    } else if (allKnownSpecialErrors.some(SpecialError => err instanceof SpecialError)) {
      throw new Error(`Internal error: Received an unexpected error of type ${err.constructor.name}:\n${err.message}`)
    } else {
      throw err
    }
  }
}

function parse(text: string, { path }: { path: string }): AstApi {
  // A fresh parser needs to be made between each parse.
  const parser = new nearley.Parser(compiledGrammar);

  try {
    parser.feed(text)
  } catch (err) {
    if (!('token' in err)) throw err
    if (!err.message.startsWith('Syntax error')) throw err
    throw new ParseError(formatParseError(err.message, path))
  }

  if (parser.results.length === 0) throw new BadSyntaxError('Unexpected end-of-file.', null)
  if (parser.results.length > 1) throw new Error(`Internal error: Grammar is ambiguous - ${parser.results.length} possible results were found.`)
  const endOfFileInfo = {
    line: text.split('\n').length,
    col: top(text.split('\n')).length,
    offset: text.length,
  }
  return GrammarBoundary.eval(parser.results[0], path, endOfFileInfo) as AstApi
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
  const moduleDefinitions = new Map<string, AstApi>()
  const startingPath = path.normalize(path_)
  const pathsToLoad = [startingPath]
  while (pathsToLoad.length) {
    const pathToLoad = pathsToLoad.pop()
    if (moduleDefinitions.has(pathToLoad)) continue
    const source = loadModuleSource(pathToLoad)
    if (source == null) throw new Error(`Module not found: ${pathToLoad}`)
    const module = parse(source, { path: pathToLoad })
    moduleDefinitions.set(pathToLoad, module)
    const normalizedDependencies = module.dependencies.map(
      dependency => calcAbsoluteNormalizedPath(dependency, { relativeToFile: pathToLoad })
    )
    pathsToLoad.push(...normalizedDependencies)
  }
  return { startingPath, moduleDefinitions }
}

function runStdLib(): ModuleInfo {
  if (globalThis.skipStdLib) {
    return {
      module: values.createRecord(
        { nameToValue: new Map(), symbolToValue: new Map() },
        types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }),
      ),
      moduleShape: types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }),
      typeCheckContexts: new Map(),
    }
  }
  const ast = createStdLibAst()
  const { typeCheckContexts, type: moduleShape } = ast.typeCheck({
    moduleDefinitions: new Map(),
    importStack: ['%stdLib%'],
    stdLibShape: types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }),
    isMainModule: false,
  })
  const module = ast.exec({
    moduleDefinitions: new Map(),
    stdLib: values.createRecord(
      { nameToValue: new Map(), symbolToValue: new Map() },
      types.createRecord({ nameToType: new Map(), symbolToInfo: new Map() }),
    ),
    typeCheckContexts,
  })
  return { module, moduleShape, typeCheckContexts }
}

export function loadAndTypeCheck(fileToRun: string, { stdLib = runStdLib() }: { stdLib: ModuleInfo } = { stdLib: null }) {
  const { startingPath, moduleDefinitions } = expectErrorOfTypes(
    () => recursiveParse(fileToRun),
    [SemanticError, BadSyntaxError, ParseError]
  )

  const ast = moduleDefinitions.get(startingPath)
  const { typeCheckContexts, type: moduleShape } = expectErrorOfTypes(() => ast.typeCheck({
    moduleDefinitions,
    importStack: [startingPath],
    stdLibShape: stdLib.moduleShape,
    isMainModule: true,
  }), [SemanticError])

  return {
    startingPath,
    moduleDefinitions,
    typeCheckContexts: new Map([
      ...typeCheckContexts.entries(),
      ...stdLib.typeCheckContexts.entries(),
    ]),
    mainModuleShape: moduleShape
  }
}

// The main run() function. Errors are already caught, pretty-printed, and not rethrown.
// So, don't expect errors from this function.
export function run(fileToRun: string) {
  const stdLib = runStdLib()
  try {
    const {
      startingPath,
      moduleDefinitions,
      typeCheckContexts,
      mainModuleShape: moduleShape
    } = loadAndTypeCheck(fileToRun, { stdLib })

    const ast = moduleDefinitions.get(startingPath)
    const module = expectErrorOfTypes(() => ast.exec({
      moduleDefinitions,
      stdLib: stdLib.module,
      typeCheckContexts,
    }), [])
    return { module, moduleShape }
  } catch (err) {
    const { success } = prettyPrintLanguageError(err, {
      ParseError,
      loadModule(path) {
        try {
          return fs.readFileSync(path, 'utf-8')
        } catch (err) {
          warnings.warnError(err)
          return ''
        }
      }
    })
    if (!success) {
      throw err
    }
  }
}

interface TestRunOpts {
  readonly modules?: { [path: string]: string }
}
export function testRun(text, { modules: pathToSource = {} }: TestRunOpts = { modules: {} }) {
  let result = []

  const { startingPath, moduleDefinitions } = recursiveParse('index.toy', {
    loadModuleSource: requestedPath => {
      if (requestedPath === 'index.toy') return text
      return pathToSource[requestedPath]
    }
  })

  const { module: stdLib, moduleShape: stdLibShape, typeCheckContexts: stdLibTypeCheckContexts } = runStdLib()

  const ast = moduleDefinitions.get(startingPath)
  const { typeCheckContexts } = ast.typeCheck({
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
    stdLib,
    typeCheckContexts: new Map([...typeCheckContexts, ...stdLibTypeCheckContexts]),
  })

  return result
}
