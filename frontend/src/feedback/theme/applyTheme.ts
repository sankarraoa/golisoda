/**
 * Applies theme tokens as CSS custom properties on the document root.
 *
 * Mapping rule: `color.brand.primary` -> `--color-brand-primary` (dots -> dashes, prepend `--`).
 *
 * Transitional behavior:
 * - When applying `color.brand.primary`, also set legacy `--color-tenant-primary`.
 * - When applying `color.brand.secondary`, also set legacy `--color-tenant-secondary`.
 * This keeps existing template CSS working unchanged while we migrate to canonical vars.
 */
export function applyTheme(tokens: Record<string, string>): void {
  const rootStyle = document.documentElement.style;
  for (const [key, value] of Object.entries(tokens)) {
    const cssVarName = `--${key.replaceAll(".", "-")}`;
    rootStyle.setProperty(cssVarName, value);

    if (key === "color.brand.primary") {
      rootStyle.setProperty("--color-tenant-primary", value);
    }
    if (key === "color.brand.secondary") {
      rootStyle.setProperty("--color-tenant-secondary", value);
    }
  }
}

