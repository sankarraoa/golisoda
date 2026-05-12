## Phase 1 summary — token theming for `default_stepper` only

Goal met: **theme tokens are now supported end-to-end** (DB → API → React → CSS vars) for the existing `default_stepper` template **without changing baseline computed values**, and with **legacy alias behavior preserved** (`--color-tenant-*` still works).

---

## Files changed

### Backend

- `backend/app/schemas/survey_theme.py`
- `backend/alembic/versions/0017_theme_tokens.py`
- `backend/app/models/survey_template.py`
- `backend/app/models/tenant.py`
- `backend/app/services/surveys.py`
- `backend/app/api/channel_schemas.py`
- `backend/app/api/public.py`
- `backend/app/api/tenant_schemas.py`
- `backend/app/api/tenants.py`
- `backend/tests/test_survey_theme.py`
- `backend/tests/test_public_effective_theme.py`

### Frontend

- `frontend/src/feedback/theme/applyTheme.ts`
- `frontend/src/feedback/theme/applyTheme.test.ts`
- `frontend/src/pages/public/PublicFeedbackPage.tsx`
- `frontend/src/types/publicFeedback.ts`
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/public-feedback.css`
- `frontend/package.json`
- `frontend/vite.config.ts`

---

## Migration SQL (from `0017_theme_tokens.py`)

```sql
ALTER TABLE survey_templates
  ADD COLUMN theme JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tenant_branding
  ADD COLUMN theme_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- (idempotent safety backfill)
UPDATE survey_templates SET theme = '{}'::jsonb WHERE theme IS NULL;
UPDATE tenant_branding SET theme_overrides = '{}'::jsonb WHERE theme_overrides IS NULL;

-- Seed default_stepper theme tokens (source: frontend/src/styles/tokens.css defaults)
UPDATE survey_templates
  SET theme = CAST('{"color.brand.primary":"#1a73e8","color.brand.secondary":"#e8f0fe"}' AS jsonb)
  WHERE slug = 'default_stepper';
```

---

## Final `SurveyThemeConfig` schema (backend)

Defined in `backend/app/schemas/survey_theme.py`:

- **Shape**: `{ "tokens": { [tokenName: string]: string } }`
- **Key validation**: keys must be in `TOKEN_REGISTRY`, otherwise error like:
  - `Unknown theme token 'color.brand.tertiary'. Allowed tokens: ...`
- **Value validation** (by token type):
  - **Colors** (`color.*`): `#rgb` / `#rrggbb` / `rgb()` / `rgba()` / `hsl()` / `hsla()`
  - **Fonts** (`font.body`, `font.heading`): non-empty CSS `font-family` strings (basic injection guard)
  - **Sizes** (`font.size.base`, `spacing.*`, `radius.*`): CSS lengths with units `px|rem|em|%|ch`
  - **Shadows** (`shadow.*`): `none` or a box-shadow-like string (basic structure check)
- **Partial tokens allowed**: missing tokens are allowed (CSS fallbacks apply).

`TOKEN_REGISTRY` minimum set included:
- `color.background`, `color.surface`, `color.text.primary`, `color.text.secondary`
- `color.brand.primary`, `color.brand.secondary`, `color.brand.accent`, `color.border`
- `font.body`, `font.heading`, `font.size.base`
- `spacing.page`, `spacing.question_gap`
- `radius.input`, `radius.card`
- `shadow.card`

---

## Backend behavior changes

- **DB**:
  - `survey_templates.theme` (JSONB, default `{}`)
  - `tenant_branding.theme_overrides` (JSONB, default `{}`)
  - `default_stepper` is seeded with:
    - `color.brand.primary = "#1a73e8"`
    - `color.brand.secondary = "#e8f0fe"`

- **Theme resolution**:
  - `resolve_effective_theme(template, tenant_branding) -> dict[str, str]` added in `backend/app/services/surveys.py`
  - Merge order: template theme → tenant overrides
  - **Transitional legacy precedence**:
    - if `tenant_branding.primary_color` is set, `color.brand.primary` is suppressed from `effective_theme`
    - if `tenant_branding.secondary_color` is set, `color.brand.secondary` is suppressed

- **Public API response**:
  - `GET /f/{channel_code}` now includes `effective_theme` as a sibling of `branding` and `template` (existing fields unchanged).

- **Admin validation (422 on invalid tokens)**:
  - `PATCH /tenants/{tenant_id}/branding` accepts optional `theme_overrides`
  - `theme_overrides` is validated via `SurveyThemeConfig`; invalid tokens raise 422 with field-level errors.

---

## Frontend behavior changes

- **New token applicator**: `applyTheme(tokens)` sets CSS vars on `document.documentElement` using `token → --token-with-dashes`.
- **Legacy alias rule** (transitional, documented in code):
  - applying `color.brand.primary` also sets `--color-tenant-primary`
  - applying `color.brand.secondary` also sets `--color-tenant-secondary`
- **Order of application**:
  - `applyTheme(context.effective_theme)` runs before the existing branding effect that writes `--color-tenant-*`.

- **CSS tokenization (default/baseline only)**:
  - `frontend/src/styles/tokens.css` now defines canonical vars like `--color-brand-primary`, `--color-background`, etc. with baseline values/fallbacks.
  - `frontend/src/styles/public-feedback.css` now uses canonical vars with explicit fallbacks (e.g. `var(--color-brand-primary, #1a73e8)`).

---

## Tests

- **Backend pytest** (run in a local Python 3.12 venv):
  - `66 passed`
  - Added coverage:
    - `SurveyThemeConfig` accepts valid partial themes, rejects unknown keys, rejects malformed colors
    - `resolve_effective_theme` merge + suppression cases
    - `GET /f/{channel_code}` includes `effective_theme` without removing existing fields

- **Frontend vitest**:
  - `2 passed`
  - Added coverage:
    - `applyTheme` sets canonical vars and legacy aliases
    - `applyTheme` does not unset vars for missing tokens

---

## Manual verification checklist (still required for pixel parity)

- **Pixel parity** (before vs after): load a `default_stepper` channel, screenshot, apply changes, screenshot again, confirm parity.
- **Theme proof**: set `survey_templates.theme.color.brand.primary` for `default_stepper` to a distinctive color, refresh `/f/{channel_code}`, confirm accent color changes (and existing templates are otherwise untouched).

