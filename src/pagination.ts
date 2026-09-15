export function pageWindow(page: number, total: number, size = 5) {
  const safeTotal = Math.max(1, total)
  const length = Math.min(size, safeTotal)
  const start = Math.max(1, Math.min(page - Math.floor(length / 2), safeTotal - length + 1))
  return Array.from({ length }, (_, index) => start + index)
}
