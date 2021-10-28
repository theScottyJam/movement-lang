import grammarTools from '../grammarTools/index.js'
const { BaseParseTimeError, TypeError, SyntaxError, SemanticError, FlowControlError, RuntimeError } = grammarTools
export { BaseParseTimeError, TypeError, SyntaxError, SemanticError, FlowControlError, RuntimeError }

// import type { Position } from './Position'
// import { FLOW_CONTROL } from './constants'

// type flowControlTypes = typeof FLOW_CONTROL[keyof typeof FLOW_CONTROL]

// export class BaseParseTimeError extends Error {
//   public readonly pos: Position
//   constructor(message, pos: Position) {
//     super(message)
//     this.pos = pos
//   }
// }

// export class TypeError extends BaseParseTimeError {} // TODO: Get rid of this and use SemanticError instead
// export class SyntaxError extends BaseParseTimeError {}
// export class SemanticError extends BaseParseTimeError {}

// export class FlowControlError extends Error {
//   public readonly type: flowControlTypes
//   public readonly data: unknown
//   constructor(type: flowControlTypes, data: unknown) {
//     super(`This error is intended to control the flow of the program, and should always be caught.`)
//     this.type = type
//     this.data = data
//   }
// }

// export class RuntimeError extends Error {}