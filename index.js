'use strict'

globalThis.debug = (...args) => {
  console.log(...args)
  return args[args.length - 1]
}

const { run } = require('./parser')

run(`\
  function f() {

  }
  begin {
    print run f()
  }
`)
