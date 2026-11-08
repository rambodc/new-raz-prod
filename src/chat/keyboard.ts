export type ShellFrame = {
  /** Visual viewport offset. The shell follows this so the page itself never scrolls. */
  top: number;
  /** Visual viewport height. The composer sits at the bottom of this box, above the keyboard. */
  height: number;
  /** How much of the layout viewport the keyboard still covers. Zero when the browser already shrank the layout. */
  keyboard: number;
};

/**
 * One geometry for both keyboard models.
 * Overlay keyboards (older iOS) shrink the visual viewport and may set offsetTop.
 * `interactive-widget=resizes-content` shrinks the layout viewport instead, so this inset stays near zero and we do not add a second shift.
 */
export function shellFrame(input: { innerHeight: number; viewportHeight: number; offsetTop: number }): ShellFrame {
  const inner = positive(input.innerHeight);
  const rawTop = Number.isFinite(input.offsetTop) ? input.offsetTop : 0;
  const top = clamp(rawTop, 0, inner);
  const rawHeight = Number.isFinite(input.viewportHeight) ? input.viewportHeight : inner;
  const height = clamp(rawHeight, 0, Math.max(0, inner - top));
  const keyboard = Math.max(0, Math.round(inner - rawHeight - top));
  return { top: Math.round(top), height: Math.round(height || inner), keyboard };
}

export function keyboardOpen(keyboard: number): boolean {
  return keyboard > 80;
}

/** Phones, including landscape, use the chat layer while the field is focused. A desktop cursor does not. */
export function chatLayer(focused: boolean, keyboard: boolean, width: number): boolean {
  if (!focused && !keyboard) return false;
  if (keyboard) return true;
  return width <= 820;
}

/** Keep the reader's place unless they are already near the newest line. */
export function stickToLatest(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
  if (scrollHeight <= clientHeight + 1) return true;
  return scrollHeight - scrollTop - clientHeight < 48;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
