export function warn(message: string) {
  // TODO: Provide an option to log out warnings and continue on instead.
  throw new Error(message)
}

export function warnError(err: Error) {
  // TODO: Provide an option to log out warnings and continue on instead.
  throw err
}