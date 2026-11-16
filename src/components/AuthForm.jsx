import React, { useState } from "react";
import { ArrowRight } from "lucide-react";

export default function AuthForm({ mode, api, onSuccess }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          onSuccess(
            await api("/auth/" + mode, {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
            }),
          );
        } catch (e) {
          setError(
            e.message.includes("JSON")
              ? "API unavailable. Start the PostgreSQL server to sign in."
              : e.message,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {mode === "signup" && (
        <>
          <label>
            Your name
            <input name="name" required placeholder="Your name" />
          </label>
          <label>
            Business name
            <input name="business" required placeholder="Your business" />
          </label>
        </>
      )}
      <label>
        Email address
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.com"
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          minLength={10}
          required
          placeholder="At least 10 characters"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} className="button primary">
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Sign in"
            : "Create workspace"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
