/** How far the on-screen keyboard covers the layout viewport. */
export function keyboardInset(innerHeight: number, viewportHeight: number, offsetTop: number): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(viewportHeight)) return 0;
  return Math.max(0, Math.round(innerHeight - viewportHeight - (Number.isFinite(offsetTop) ? offsetTop : 0)));
}

export function keyboardOpen(inset: number): boolean {
  return inset > 80;
}
