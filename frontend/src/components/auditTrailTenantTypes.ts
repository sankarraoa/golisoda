/** Mirrors `ActiveAdminView` in TenantDashboardPage — separate to avoid circular imports. */
export type ActiveAdminView =
  | "dashboard"
  | "locations"
  | "surveys"
  | "channels"
  | "responses"
  | "analytics"
  | "organization"
  | "templates"
  | "users"
  | "roles";
