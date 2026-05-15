import { useEffect, useState, type CSSProperties } from "react";

import { FeedbackFlow } from "../feedback/FeedbackFlow";
import {
  TEMPLATE_GALLERY_FIXTURE_QUESTIONS,
  buildPreviewContextStub,
} from "../feedback/templateGalleryFixtures";
import { useTemplatePackStylesheets } from "../../hooks/useTemplatePackStylesheets";
import { getTemplateCatalogDisplayName, getTemplateCatalogSummaryLines } from "../../lib/templateCatalogSummary";
import type { SurveyTemplate } from "../../types/admin";
import type { PublicBranding } from "../../types/publicFeedback";
import { normalizeSurveyPresentation } from "../../types/surveyPresentation";

export function TemplateLibrarySection({
  brandingPreview,
  templates,
  templateAssetsApiOrigin = "",
  onExportTemplate,
  onDeleteTemplate,
}: {
  brandingPreview: PublicBranding;
  templates: SurveyTemplate[];
  /** API origin that serves `GET /public/template-assets/...` (tenant or platform split). */
  templateAssetsApiOrigin?: string;
  onExportTemplate?: (template: SurveyTemplate) => void;
  onDeleteTemplate?: (template: SurveyTemplate) => void | Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");

  useEffect(() => {
    setSelectedId((prev) =>
      prev && templates.some((template) => template.id === prev) ? prev : templates[0]?.id ?? "",
    );
  }, [templates]);

  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];

  if (!selected) {
    return null;
  }

  const stub = buildPreviewContextStub(brandingPreview);
  const templatePresentation = normalizeSurveyPresentation(selected.presentation ?? {});
  useTemplatePackStylesheets(selected.id, templatePresentation, templateAssetsApiOrigin);
  const hostStyle = {
    ...(brandingPreview.primary_color ? { "--color-tenant-primary": brandingPreview.primary_color } : {}),
    ...(brandingPreview.secondary_color ? { "--color-tenant-secondary": brandingPreview.secondary_color } : {}),
  } as CSSProperties;

  const [previewSummary1, previewSummary2] = getTemplateCatalogSummaryLines(selected);
  const selectedDescription = selected.description?.trim() ?? "";
  const selectedDeployNotes = selected.deployment_notes?.trim() ?? "";

  return (
    <div className="templates-library">
      <div className="templates-library-body">
        <div className="templates-library-catalog">
          <div className="template-gallery" role="list">
            {templates.map((template) => {
              const displayName = getTemplateCatalogDisplayName(template);
              const [summaryLine1, summaryLine2] = getTemplateCatalogSummaryLines(template);
              const cardDescription = template.description?.trim();
              return (
                <button
                  key={template.id}
                  type="button"
                  role="listitem"
                  className={`template-gallery-card ${
                    template.id === selected.id ? "template-gallery-card--selected" : ""
                  }`}
                  onClick={() => setSelectedId(template.id)}
                >
                  <div className="template-gallery-card-title">{displayName}</div>
                  {cardDescription ? (
                    <p className="template-gallery-card-desc template-gallery-card-desc--from-db" title={cardDescription}>
                      {cardDescription}
                    </p>
                  ) : (
                    <p className="template-gallery-card-desc template-gallery-card-desc--catalog">
                      <span className="template-gallery-card-desc-line">{summaryLine1}</span>
                      <span className="template-gallery-card-desc-line">{summaryLine2}</span>
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="templates-library-preview">
          <header className="template-preview-panel-header">
            <div className="template-preview-panel-header-row">
              <span className="template-preview-badge">Preview</span>
              {onExportTemplate || onDeleteTemplate ? (
                <div className="template-preview-panel-header-actions">
                  {onExportTemplate ? (
                    <button
                      type="button"
                      className="btn btn--sm btn--secondary template-pack-download"
                      onClick={() => onExportTemplate(selected)}
                    >
                      Download ZIP
                    </button>
                  ) : null}
                  {onDeleteTemplate ? (
                    <button
                      type="button"
                      className="btn btn--sm btn--destructive template-pack-delete"
                      onClick={() => {
                        const label = getTemplateCatalogDisplayName(selected);
                        if (
                          window.confirm(
                            `Delete template “${label}” (${selected.slug})? This cannot be undone.`,
                          )
                        ) {
                          void Promise.resolve(onDeleteTemplate(selected));
                        }
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <h3 className="template-preview-panel-title">{getTemplateCatalogDisplayName(selected)}</h3>
            {selectedDescription ? (
              <>
                <p className="template-preview-panel-official-desc">{selectedDescription}</p>
                {selectedDeployNotes ? (
                  <p className="template-preview-panel-deploy-notes">
                    <span className="template-preview-panel-notes-label">Deployment</span>
                    {selectedDeployNotes}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="template-preview-panel-desc template-preview-panel-desc--compact">
                  <span className="template-gallery-card-desc-line">{previewSummary1}</span>
                  <span className="template-gallery-card-desc-line">{previewSummary2}</span>
                </p>
                {selectedDeployNotes ? (
                  <p className="template-preview-panel-deploy-notes">
                    <span className="template-preview-panel-notes-label">Deployment</span>
                    {selectedDeployNotes}
                  </p>
                ) : null}
              </>
            )}
          </header>
          <div className="template-gallery-preview-wrap template-gallery-preview-host" style={hostStyle}>
            <FeedbackFlow
              key={selected.id}
              branding={stub.branding}
              channelCode={null}
              locationName={stub.location.name}
              organization={stub.organization}
              onSubmitAnswers={null}
              presentation={templatePresentation}
              questions={TEMPLATE_GALLERY_FIXTURE_QUESTIONS}
              surveyDescription={selected.description ?? null}
              surveyTitle={stub.survey.title}
              templateSlug={selected.slug}
              templateId={selected.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
