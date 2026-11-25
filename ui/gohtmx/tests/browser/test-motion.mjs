// Shared deterministic motion-suppression helpers for browser tests.
export const MOTION_RESET_CSS = `*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}`;

export function motionReducedContextOptions(options = {}) {
  return { reducedMotion: 'reduce', ...options };
}

export async function disableMotion(page) {
  await page.emulateMedia?.({ reducedMotion: 'reduce' });
  await page.addStyleTag({ content: MOTION_RESET_CSS });
}
