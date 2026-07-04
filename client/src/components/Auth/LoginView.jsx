import { useState } from "react";

import { useSession } from "../../context/SessionContext.jsx";

export default function LoginView() {
  const { login } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-view">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Conversational Database Manager</h1>

        <label className="form-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="form-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy}
        >
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
