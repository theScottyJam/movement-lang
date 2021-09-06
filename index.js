'use strict'

globalThis.debug = (...args) => {
  console.info(...args)
  return args[args.length - 1]
}

const { run } = require('./parser')

run(`\
let f = <#T>(x #T) #T => x
let x = f(2)
print if true then x else 'x'
`)
