/**
 * Template rows use underscore slugs in CSS (`[data-template="phone_portrait"]`) and
 * in code. Some environments may return kebab-case; normalize so theme bundles apply.
 *
 * Heritage immersive chrome also matches slug prefix `heritage_immersive_*` in CSS
 * (`[data-template^="heritage_immersive"]`).
 */
export function canonicalTemplateSlug(slug: string): string {
  return slug.replaceAll("-", "_");
}

/** Split layout + hero column (`public-feedback-heritage.css`) for `heritage_immersive` and variants. */
export function isHeritageImmersiveFamilySlug(slug: string): boolean {
  return canonicalTemplateSlug(slug).startsWith("heritage_immersive");
}
