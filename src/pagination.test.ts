import { describe, expect, it } from 'vitest'
import { pageWindow } from './pagination'

describe('pageWindow', () => {
  it('shows the first five pages at the beginning', () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps the last page visible at the end', () => {
    expect(pageWindow(40, 40)).toEqual([36, 37, 38, 39, 40])
  })
})
