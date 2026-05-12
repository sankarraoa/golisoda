import { FormEvent, useState } from "react";

import { GoogleIcon, MicrosoftIcon, OktaIcon } from "../components/SsoProviderIcons";
import { platformLogin, storePlatformTokens } from "../lib/platformApi";

export function PlatformLoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const tokens = await platformLogin(username.trim(), password);
      storePlatformTokens(tokens);
      onSignedIn();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page login-page--platform">
      <aside aria-label="Brand" className="login-aside login-aside--platform">
        <div className="login-aside-visual login-aside-visual--platform" aria-hidden />
        <div className="login-aside-copy">
          <div className="login-aside-mark login-aside-mark--platform">Gs</div>
          <h2 className="login-aside-title">Goli Soda</h2>
          <p className="login-aside-lede login-aside-lede--platform">
            Platform administration — onboard tenants and manage operators who access the consoles.
          </p>
          <div className="login-aside-dots login-aside-dots--platform" aria-hidden>
            <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
          </div>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-main-inner">
          <div className="login-card login-card--platform">
            <div className="platform-login-ribbon">Platform super admin</div>
            <header className="login-card-head">
              <h1 className="login-card-title">Platform sign in</h1>
              <p className="login-card-sub">
                Use your platform username and password. This is separate from tenant operators.
              </p>
            </header>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="platform-username">
                  Username
                </label>
                <input
                  autoComplete="username"
                  className="field-input login-field-input"
                  id="platform-username"
                  name="username"
                  onChange={(event) => setUsername(event.target.value)}
                  type="text"
                  value={username}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="platform-password">
                  Password
                </label>
                <input
                  autoComplete="current-password"
                  className="field-input login-field-input"
                  id="platform-password"
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
              </div>
              {error ? <div className="field-error-msg">{error}</div> : null}
              <button className="btn btn--primary login-submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="login-sso-divider">
              <span className="login-sso-divider-text">or continue with</span>
            </div>

            <div className="login-sso" role="group" aria-label="Single sign-on (coming soon)">
              <button className="btn btn--secondary login-sso-btn" disabled type="button">
                <span className="login-sso-btn-inner">
                  <GoogleIcon className="login-sso-icon" />
                  <span>Continue with Google</span>
                </span>
              </button>
              <button className="btn btn--secondary login-sso-btn" disabled type="button">
                <span className="login-sso-btn-inner">
                  <MicrosoftIcon className="login-sso-icon" />
                  <span>Continue with Microsoft</span>
                </span>
              </button>
              <button className="btn btn--secondary login-sso-btn" disabled type="button">
                <span className="login-sso-btn-inner">
                  <OktaIcon className="login-sso-icon" />
                  <span>Continue with Okta</span>
                </span>
              </button>
            </div>
          </div>

          <p className="login-foot muted">
            Tenant admin operators use the organization console at the site root • SSO coming soon
          </p>
        </div>
      </main>
    </div>
  );
}
