import { FormEvent, useState } from "react";

import { login, storeTokens } from "../../lib/adminApi";

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin@12345");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const tokens = await login(email, password);
      storeTokens(tokens);
      onSignedIn();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="brand-mark">G</div>
          <h1 className="login-title">Sign in to your account</h1>
        </div>
        <div className="login-form">
          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              className="field-input"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              className="field-input"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>
          {error ? <div className="field-error-msg">{error}</div> : null}
          <button className="btn btn--primary login-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
