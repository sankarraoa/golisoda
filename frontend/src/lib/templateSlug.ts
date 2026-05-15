/**
 * Template rows use underscore slugs in CSS (`[data-template="phone_portrait"]`) and
 * in code. Some environments may return kebab-case; normalize so theme bundles apply.
 */
export function canonicalTemplateSlug(slug: string): string {
  return slug.replaceAll("-", "_");
}
