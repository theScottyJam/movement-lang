import { run } from './parser.js'

if (process.argv.length !== 3) {
  console.error('\nExactly one argument is required (A path to an executable). e.g. npm start -- ./example.move\n')
} else {
  const path = process.argv[2]
  run(path)
}
