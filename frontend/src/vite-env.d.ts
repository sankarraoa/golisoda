/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_FEEDBACK_API_URL?: string;
  readonly VITE_TEMPLATE_API_BASE_URL?: string;
  readonly VITE_PLATFORM_API_BASE_URL?: string;
  /** If set, visiting this hostname with path `/` redirects to `/platform` (same build as the tenant app, e.g. app.example.com). */
  readonly VITE_PLATFORM_ADMIN_HOSTNAME?: string;
}
