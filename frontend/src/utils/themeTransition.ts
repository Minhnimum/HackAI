/**
 * themeTransition.ts — Smooth circular ripple animation when toggling themes.
 *
 * Creates a coloured circle that expands from the toggle button outward,
 * while all page elements smoothly transition their colours via the
 * `.theme-transitioning` class defined in index.css.
 */

/**
 * Animate a theme switch with a circular ripple expanding from the toggle button.
 *
 * @param event       - The click event from the toggle button (used for position).
 * @param toDark      - Whether we're switching _to_ dark mode.
 * @param applyTheme  - Callback that actually sets/removes the data-theme attribute.
 */
export function animateThemeSwitch(
  event: React.MouseEvent<HTMLButtonElement>,
  toDark: boolean,
  applyTheme: () => void,
): void {
  const { clientX: x, clientY: y } = event;

  // 1. Enable smooth CSS transitions on every element.
  document.body.classList.add('theme-transitioning');

  // 2. Create the ripple overlay centred on the button click position.
  const ripple = document.createElement('div');
  ripple.className = 'theme-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  // The ripple colour hints at the _destination_ theme:
  //   → going dark: deep indigo wash
  //   → going light: warm white wash
  ripple.style.background = toDark
    ? 'radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, rgba(18, 18, 20, 0.25) 70%)'
    : 'radial-gradient(circle, rgba(165, 180, 252, 0.30) 0%, rgba(253, 253, 250, 0.20) 70%)';
  document.body.appendChild(ripple);

  // 3. Apply the actual theme change slightly after the ripple starts,
  //    so the colours flow outward from the button.
  requestAnimationFrame(() => {
    applyTheme();
  });

  // 4. Clean up: remove the ripple and transition class once complete.
  const cleanup = () => {
    ripple.remove();
    document.body.classList.remove('theme-transitioning');
  };

  ripple.addEventListener('animationend', cleanup, { once: true });
  // Safety net in case animationend doesn't fire
  setTimeout(cleanup, 900);
}
