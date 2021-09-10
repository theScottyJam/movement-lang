'use strict'

globalThis.debug = (...args) => {
  console.info(...args)
  return args[args.length - 1]
}

const { run } = require('./parser')

run(`\
let { x: x } where x == 2 = { x: 2 }
print x
`)
