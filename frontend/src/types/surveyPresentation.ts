/** Mirrors backend SurveyPresentationConfig (presentation-only; not tenant-scoped). */

export type Renderer5 = "numeric" | "stars" | "emoji_5" | "color_scale";
export type Renderer4 = "numeric" | "stars" | "emoji_4" | "color_scale";
export type Renderer2 = "numeric" | "thumbs" | "emoji_2" | "yes_no";

/** Optional chrome for `heritage_immersive*` templates (hero column + pack image URLs). */
export type ImmersiveChromePackage = {
  hero_column: "start" | "end";
  hero_asset_paths: string[];
};

/** Optional static assets from an imported template ZIP (`assets/`). */
export type TemplatePackagePresentation = {
  stylesheets?: string[];
  immersive?: ImmersiveChromePackage;
};

export type SurveyPresentation = {
  layout: "stepper" | "single_page";
  nps: { presentation: "numeric" | "segmented" };
  csat_5: { renderer: Renderer5 };
  csat_4: { renderer: Renderer4 };
  csat_2: { renderer: Renderer2 };
  progress: { style: "bar" | "dots" | "none" };
  navigation: { auto_advance: boolean };
  touch: { large_targets: boolean };
  package?: TemplatePackagePresentation;
};

export const DEFAULT_SURVEY_PRESENTATION: SurveyPresentation = {
  layout: "stepper",
  nps: { presentation: "numeric" },
  csat_5: { renderer: "emoji_5" },
  csat_4: { renderer: "emoji_4" },
  csat_2: { renderer: "thumbs" },
  progress: { style: "bar" },
  navigation: { auto_advance: false },
  touch: { large_targets: false },
};

type LegacyCsatBlock = { presentation?: "digits" | "stars" | "emoji" };

export type SurveyPresentationInput = Partial<SurveyPresentation> & { csat?: LegacyCsatBlock };

function mapLegacyCsatPresentation(lp: string): { r5: Renderer5; r4: Renderer4; r2: Renderer2 } {
  const m5: Record<string, Renderer5> = { digits: "emoji_5", stars: "stars", emoji: "emoji_5" };
  const m4: Record<string, Renderer4> = { digits: "emoji_4", stars: "stars", emoji: "emoji_4" };
  const m2: Record<string, Renderer2> = { digits: "thumbs", stars: "numeric", emoji: "emoji_2" };
  return {
    r5: m5[lp] ?? "emoji_5",
    r4: m4[lp] ?? "emoji_4",
    r2: m2[lp] ?? "thumbs",
  };
}

/** Normalizes API payloads: fills defaults, upgrades legacy single `csat` block. */
export function normalizeSurveyPresentation(raw: SurveyPresentationInput): SurveyPresentation {
  const layout = raw.layout ?? DEFAULT_SURVEY_PRESENTATION.layout;
  const nps = raw.nps ?? DEFAULT_SURVEY_PRESENTATION.nps;
  const progress = raw.progress ?? DEFAULT_SURVEY_PRESENTATION.progress;
  const navigation = raw.navigation ?? DEFAULT_SURVEY_PRESENTATION.navigation;
  const touch = raw.touch ?? DEFAULT_SURVEY_PRESENTATION.touch;

  let csat_5 = raw.csat_5 ?? DEFAULT_SURVEY_PRESENTATION.csat_5;
  let csat_4 = raw.csat_4 ?? DEFAULT_SURVEY_PRESENTATION.csat_4;
  let csat_2 = raw.csat_2 ?? DEFAULT_SURVEY_PRESENTATION.csat_2;

  const legacy = raw.csat;
  if (legacy?.presentation && (!raw.csat_5 || !raw.csat_4 || !raw.csat_2)) {
    const lp = legacy.presentation;
    const mapped = mapLegacyCsatPresentation(lp);
    if (!raw.csat_5) {
      csat_5 = { renderer: mapped.r5 };
    }
    if (!raw.csat_4) {
      csat_4 = { renderer: mapped.r4 };
    }
    if (!raw.csat_2) {
      csat_2 = { renderer: mapped.r2 };
    }
  }

  const normalized: SurveyPresentation = {
    layout,
    nps,
    csat_5,
    csat_4,
    csat_2,
    progress,
    navigation,
    touch,
  };

  const pkg = raw.package;
  if (pkg && typeof pkg === "object") {
    const p = pkg as TemplatePackagePresentation & { stylesheets?: unknown; immersive?: unknown };
    const sheets = Array.isArray(p.stylesheets)
      ? p.stylesheets.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    let immersive: ImmersiveChromePackage | undefined;
    if (p.immersive && typeof p.immersive === "object") {
      const im = p.immersive as { hero_column?: string; hero_asset_paths?: unknown };
      const hero_column = im.hero_column === "start" ? "start" : "end";
      const hero_asset_paths = Array.isArray(im.hero_asset_paths)
        ? im.hero_asset_paths.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [];
      immersive = { hero_column, hero_asset_paths };
    }
    if (sheets.length > 0 || immersive) {
      normalized.package = {};
      if (sheets.length > 0) {
        normalized.package.stylesheets = sheets;
      }
      if (immersive) {
        normalized.package.immersive = immersive;
      }
    }
  }

  return normalized;
}
