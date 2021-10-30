import { run } from './parser.js'

globalThis.debug = (...args) => {
  console.info(...args)
  return args[args.length - 1]
}

run(`\
begin {
  print 'Hello world!'
}
`)
