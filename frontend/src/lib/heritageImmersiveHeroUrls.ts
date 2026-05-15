import type { ImmersiveChromePackage } from "../types/surveyPresentation";

/** Stock portraits used when `hero_asset_paths` is empty or template assets are unavailable. */
export const HERITAGE_IMMERSIVE_HERO_URLS: readonly string[] = [
  "/feedback-theme/heritage-immersive-hero-1.png",
  "/feedback-theme/heritage-immersive-hero-2.png",
  "/feedback-theme/heritage-immersive-hero-3.png",
  "/feedback-theme/heritage-immersive-hero-4.png",
];

export function resolveImmersiveHeroImageUrls(
  templateId: string | undefined,
  apiOrigin: string,
  immersive: ImmersiveChromePackage | undefined,
): readonly string[] {
  const paths =
    immersive?.hero_asset_paths?.map((p) => p.trim()).filter((p) => p.length > 0) ?? [];
  if (paths.length === 0) {
    return HERITAGE_IMMERSIVE_HERO_URLS;
  }
  const id = templateId?.trim();
  const origin = apiOrigin.trim().replace(/\/$/, "");
  if (!id || !origin) {
    return HERITAGE_IMMERSIVE_HERO_URLS;
  }
  return paths.map((rel) => {
    const clean = rel.replace(/^\//, "");
    const href = `${origin}/public/template-assets/${encodeURIComponent(id)}/${clean
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
    return href;
  });
}
