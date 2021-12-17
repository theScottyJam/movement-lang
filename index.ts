import * as parser from './parser'

export const run = parser.run
export const loadAndTypeCheck = (fileToLoad: string) => parser.loadAndTypeCheck(fileToLoad)
