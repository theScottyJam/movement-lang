import * as Position from './language/Position'
import { formatErrorValue } from './util'
import type { Token } from 'moo'

const firstPos = (file: string) =>
  Position.create({ file, line: 1, col: 1, length: 0, offset: 0 })
const lastPos = (file: string, endOfFileInfo: EndOfFileInfo) =>
  Position.create({ file, line: endOfFileInfo.line, col: endOfFileInfo.col, length: 0, offset: endOfFileInfo.offset })

type Position = Position.Position
type RawNestedArg = GrammarBoundary | Token | null
type RawNestedArgs = RawNestedArg | RawNestedArgs[]

interface PositionInfo {
  readonly pos: Position // position of the entire region
  // Remember: There might be whitespace between this pos, and the position of the next token.
  readonly nextTokenPos: Position // position of the token following this region. Used to get (inaccurate) line and col numbers
}

interface EndOfFileInfo {
  readonly line: number
  readonly col: number
  readonly offset: number
}

type Nested<T> = T | Nested<T>[]

const nestedMap = <T, U>(args: Nested<T>, callback: (x: T) => U): Nested<U> => (
  Array.isArray(args)
    ? args.map(arg => nestedMap<T, U>(arg, callback))
    : callback(args)
)

const isToken = (value: unknown): value is Token => (
  typeof value === 'object' &&
  value != null &&
  'type' in value &&
  'text' in value &&
  'value' in value &&
  'offset' in value &&
  'lineBreaks' in value &&
  'line' in value &&
  'col' in value
)

class WithDirectOutput {
  public result
  public directOutput
  constructor(opts: { result: unknown, directOutput: {} }) {
    Object.assign(this, opts)
  }
}

namespace clsTypes {
  export type Callback = (posInfo: PositionInfo, nestedArgs: unknown, receivedDirectInput: {}) => unknown | WithDirectOutput
  type GetArgValueCallback = (arg: GrammarBoundary, directInput?: {}) => { result: any, directOutput: {} }
  export type RawCallback = (getArgValue: GetArgValueCallback, posInfo: PositionInfo, nestedArgs: unknown, receivedDirectInput: {}) => unknown | WithDirectOutput
  export type ConstructorCallbackOpts = { callback?: clsTypes.Callback, rawCallback?: clsTypes.RawCallback }
}

export class GrammarBoundary {
  #callback?: clsTypes.Callback
  #rawCallback?: clsTypes.RawCallback
  #rawNestedArgs: RawNestedArgs
  private constructor(opts: clsTypes.ConstructorCallbackOpts, rawNestedArgs: RawNestedArgs) {
    this.#callback = opts.callback
    this.#rawCallback = opts.rawCallback
    this.#rawNestedArgs = rawNestedArgs
  }

  static create(callback: clsTypes.Callback) {
    return (rawNestedArgs: RawNestedArgs) => new GrammarBoundary({ callback }, rawNestedArgs)
  }

  static createRaw(rawCallback: clsTypes.RawCallback) {
    return (rawNestedArgs: RawNestedArgs) => new GrammarBoundary({ rawCallback }, rawNestedArgs)
  }

  static withDirectOutput(opts: { result: unknown, directOutput: {} }) {
    return new WithDirectOutput(opts)
  }

  static #gatherPosData(root: GrammarBoundary, file: string, endOfFileInfo: EndOfFileInfo) {
    const clean = (args: RawNestedArgs): (GrammarBoundary | Token)[] => [args].flat(Infinity).filter(x => x != null)
    const getAllTokens = (boundary: GrammarBoundary): Token[] => clean(boundary.#rawNestedArgs)
      .flatMap(value => value instanceof GrammarBoundary ? getAllTokens(value) : [value])

    // A list of all tokens, used to find positions of tokens relative to each other.
    // Remember that positions aren't necessarily back-to-back, sometimes there's ignored whitespace in between two tokens.
    const allTokens = getAllTokens(root)

    const popBoundary = Symbol('jump out')
    const processStack: (GrammarBoundary | Token | typeof popBoundary)[] = [root] // Holds the entries in reverse order
    interface BoundaryEntry { boundary: GrammarBoundary, startIndex: number }
    const boundaryStack: BoundaryEntry[] = []
    const boundaryToPosInfo = new Map<GrammarBoundary, PositionInfo>()
    let indexOfLastToken = -1
    while (processStack.length > 0) {
      const nextEntry = processStack.pop()
      if (isToken(nextEntry)) {
        indexOfLastToken++
        if (nextEntry !== allTokens[indexOfLastToken]) throw new Error()
      } else if (nextEntry instanceof GrammarBoundary) {
        const pushing = clean(nextEntry.#rawNestedArgs).reverse()
        processStack.push(popBoundary, ...pushing)
        boundaryStack.push({ boundary: nextEntry, startIndex: indexOfLastToken })
      } else if (nextEntry === popBoundary) {
        const { boundary, startIndex } = boundaryStack.pop()

        // If the boundary was empty, this will hold the first token after the boundary.
        const inclusiveStartPos = startIndex + 1 < allTokens.length
          ? Position.from(file, allTokens[startIndex + 1])
          : lastPos(file, endOfFileInfo)

        // If the boundary was empty, this will hold the last token before the boundary.
        const inclusiveEndPos = indexOfLastToken > -1
          ? Position.from(file, allTokens[indexOfLastToken])
          : firstPos(file)

        const pos = Position.create({
          file,
          line: inclusiveStartPos.line,
          col: inclusiveStartPos.col,
          length: startIndex === indexOfLastToken // If the boundary didn't have any tokens.
            ? 0
            : inclusiveEndPos.offset - inclusiveStartPos.offset + inclusiveEndPos.length,
          offset: inclusiveStartPos.offset,
        })
        boundaryToPosInfo.set(boundary, {
          pos,
          nextTokenPos: allTokens[indexOfLastToken + 1]
            ? Position.from(file, allTokens[indexOfLastToken + 1])
            : lastPos(file, endOfFileInfo),
        })
      } else {
        throw new Error(`INTERNAL ERROR: Received a non-token, non-boundary child: ${formatErrorValue(nextEntry)}`)
      }
    }
    return boundaryToPosInfo
  }

  static #evalChild(arg: RawNestedArg, boundaryToPosInfo: Map<GrammarBoundary, PositionInfo>, directInput = {}): { result: unknown, directOutput: {} } {
    if (arg == null) {
      return { result: arg, directOutput: {} }
    } else if (arg instanceof GrammarBoundary) {
      return GrammarBoundary.#eval(arg, boundaryToPosInfo, directInput)
    } else if (isToken(arg)) {
      return { result: arg, directOutput: {} }
    } else {
      throw new Error(`INTERNAL ERROR: Received a non-token, non-boundary child: ${formatErrorValue(arg)}`)
    }
  }

  static eval(root: GrammarBoundary, file: string, endOfFileInfo: EndOfFileInfo): unknown {
    const boundaryToPosInfo = GrammarBoundary.#gatherPosData(root, file, endOfFileInfo)
    return this.#eval(root, boundaryToPosInfo).result
  }

  static #eval(self: GrammarBoundary, boundaryToPosInfo: Map<GrammarBoundary, PositionInfo>, receivedDirectInput = {}): { result: unknown, directOutput: {} } {
    const posInfo = boundaryToPosInfo.get(self)
    if (posInfo == null) throw new Error()

    let callbackResult
    if (self.#callback) {
      const updatedArgs = nestedMap(self.#rawNestedArgs, arg => GrammarBoundary.#evalChild(arg, boundaryToPosInfo).result)
      callbackResult = self.#callback(posInfo, updatedArgs, receivedDirectInput)
    } else if (self.#rawCallback) {
      const getArgValue = (arg: GrammarBoundary, directInput = {}) => (
        GrammarBoundary.#evalChild(arg, boundaryToPosInfo, directInput)
      )
      callbackResult = self.#rawCallback(getArgValue, posInfo, self.#rawNestedArgs, receivedDirectInput)
    } else {
      throw new Error()
    }

    return callbackResult instanceof WithDirectOutput
      ? { result: callbackResult.result, directOutput: callbackResult.directOutput }
      : { result: callbackResult, directOutput: {} }
  }
}
