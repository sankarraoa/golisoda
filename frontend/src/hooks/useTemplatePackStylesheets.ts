import { useEffect } from "react";

import type { SurveyPresentation } from "../types/surveyPresentation";

/**
 * Loads `presentation.package.stylesheets` from the API static host
 * (`{apiOrigin}/public/template-assets/{templateId}/...`).
 */
export function useTemplatePackStylesheets(
  templateId: string | undefined,
  presentation: SurveyPresentation,
  apiOrigin: string,
): void {
  const packKey = JSON.stringify(presentation.package?.stylesheets ?? null);

  useEffect(() => {
    if (!templateId || !apiOrigin.trim()) {
      return;
    }
    const sheets = presentation.package?.stylesheets;
    if (!sheets?.length) {
      return;
    }
    const origin = apiOrigin.replace(/\/$/, "");
    const links: HTMLLinkElement[] = [];
    for (const sheet of sheets) {
      const rel = sheet.replace(/^\//, "").trim();
      if (!rel || rel.includes("..")) {
        continue;
      }
      const href = `${origin}/public/template-assets/${encodeURIComponent(templateId)}/${rel
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      links.forEach((el) => el.remove());
    };
  }, [apiOrigin, packKey, templateId]);
}
