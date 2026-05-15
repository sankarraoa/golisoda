/**
 * Applies theme tokens as CSS custom properties on a DOM node (default: `<html>`).
 *
 * Mapping rule: `color.brand.primary` -> `--color-brand-primary` (dots -> dashes, prepend `--`).
 *
 * Transitional behavior:
 * - When applying `color.brand.primary`, also set legacy `--color-tenant-primary`.
 * - When applying `color.brand.secondary`, also set legacy `--color-tenant-secondary`.
 * This keeps existing template CSS working unchanged while we migrate to canonical vars.
 *
 * Public feedback applies tokens on `.public-shell` when a template pack ships CSS on
 * `:root` so designer tokens on `html` are not overridden by inline styles on the same element.
 */
export function applyTheme(tokens: Record<string, string>, target: HTMLElement | null = document.documentElement): void {
  if (!target) {
    return;
  }
  const elStyle = target.style;
  for (const [key, value] of Object.entries(tokens)) {
    const cssVarName = `--${key.replaceAll(".", "-")}`;
    elStyle.setProperty(cssVarName, value);

    if (key === "color.brand.primary") {
      elStyle.setProperty("--color-tenant-primary", value);
    }
    if (key === "color.brand.secondary") {
      elStyle.setProperty("--color-tenant-secondary", value);
    }
  }
}

/** Legacy branding columns mirrored to CSS vars (same precedence as previous document-root behavior). */
export function applyBrandingCss(
  branding: { primary_color?: string | null; secondary_color?: string | null },
  target: HTMLElement | null = document.documentElement,
): void {
  if (!target) {
    return;
  }
  if (branding.primary_color) {
    target.style.setProperty("--color-tenant-primary", branding.primary_color);
  } else {
    target.style.removeProperty("--color-tenant-primary");
  }
  if (branding.secondary_color) {
    target.style.setProperty("--color-tenant-secondary", branding.secondary_color);
  } else {
    target.style.removeProperty("--color-tenant-secondary");
  }
}

