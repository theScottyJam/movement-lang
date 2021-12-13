import { run } from './parser.js'

globalThis.debug = (...args) => {
  console.info(...args)
  return args[args.length - 1]
}

if (process.argv.length !== 3) {
  console.error('\nExactly one argument is required (A path to an executable). e.g. npm start -- ../examples/helloWorld.toy\n')
} else {
  const path = process.argv[2]
  run(path)
}
