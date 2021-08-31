'use strict'

globalThis.debug = (...args) => {
  console.info(...args)
  return args[args.length - 1]
}

const { run } = require('./parser')

run(`\
begin {
  if true {
    print 1
  } else if true {
    print 2
  } else if false {
    print 3
  } else {
    print 4
  }
  print 'end'
}
`)
