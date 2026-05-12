import { FormEvent, useState } from "react";

import { GoogleIcon, MicrosoftIcon, OktaIcon } from "../../components/SsoProviderIcons";
import { login, storeTokens } from "../../lib/adminApi";

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin@12345");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const tokens = await login(username.trim(), password);
      storeTokens(tokens);
      onSignedIn();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <aside aria-label="Brand" className="login-aside">
        <div className="login-aside-visual" aria-hidden />
        <div className="login-aside-copy">
          <div className="login-aside-mark">G</div>
          <h2 className="login-aside-title">Goli Soda</h2>
          <p className="login-aside-lede">
            Run feedback loops that feel effortless—surveys your team edits in minutes and guests complete in
            moments.
          </p>
          <div className="login-aside-dots" aria-hidden>
            <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
          </div>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-main-inner">
          <div className="login-card">
            <header className="login-card-head">
              <h1 className="login-card-title">Sign in</h1>
              <p className="login-card-sub">Use your organization username and password to continue.</p>
            </header>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="username">
                  Username
                </label>
                <input
                  autoComplete="username"
                  className="field-input login-field-input"
                  id="username"
                  name="username"
                  onChange={(event) => setUsername(event.target.value)}
                  type="text"
                  value={username}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <input
                  autoComplete="current-password"
                  className="field-input login-field-input"
                  id="password"
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

          <p className="login-foot muted">Administrator access • Single sign-on options coming soon</p>
        </div>
      </main>
    </div>
  );
}
