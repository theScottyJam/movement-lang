export const PURITY = {
  none: 'NONE',
  gets: 'GETS',
  pure: 'PURE',
} as const

export const getPurityLevel = purity => ({ PURE: 2, GETS: 1, NONE: 0 })[purity]
