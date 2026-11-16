"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ArrowRight, CheckCircle2, Dumbbell, Flame, Sparkles, Trophy } from "lucide-react";
import { readAuthForm, usePrimeFit } from "@/providers/app-provider";

type AuthMode = "login" | "register";
type UserRole = "member" | "trainer";

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-page"><div className="page-loading">Loading account form…</div></main>}><LoginForm /></Suspense>;
}

function LoginForm() {
  const { signIn, register, authenticated, role: accountRole, notify } = usePrimeFit();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(searchParams.get("mode") === "register" ? "register" : "login");
  const [role, setRole] = useState<UserRole | "">(
    searchParams.get("role") === "member" ? "member" : searchParams.get("role") === "trainer" ? "trainer" : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!authenticated) return;
    const requested = searchParams.get("next") || "/";
    const safeRequested = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
    router.replace(accountRole === "trainer" ? "/trainer" : accountRole === "admin" ? "/admin" : safeRequested);
  }, [accountRole, authenticated, router, searchParams]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = readAuthForm(event);
    try {
      if (mode === "register") await register(values);
      else await signIn(values);
      notify(mode === "register"
        ? role === "trainer" ? "Your trainer account is ready." : "Welcome to PrimeFit. Let’s find your flow."
        : "Welcome back to PrimeFit.");
      const requested = new URLSearchParams(window.location.search).get("next") || "/";
      const safeRequested = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
      router.replace(role === "trainer" ? "/trainer" : safeRequested);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "We couldn't complete your request. Please check your details.";
      setError(message);
      notify(message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-story">
      <Link className="brand" href="/"><span className="brand-mark"><Activity size={19} strokeWidth={2.8} /></span><span>prime<span>fit</span></span></Link>
      <div className="auth-story-copy">
        <span className="hero-kicker"><Sparkles size={14} /> YOUR JOURNEY, YOUR PACE</span>
        <h1>Find your<br /><em>strong.</em></h1>
        <p>Make movement a little more joyful, a little more social, and a lot more you.</p>
        <div className="auth-story-features"><span><Dumbbell size={16} />Workouts for your world</span><span><Trophy size={16} />Goals worth showing up for</span><span><Flame size={16} />A community in your corner</span></div>
      </div>
      <div className="auth-story-art"><div className="auth-sun" /><span>🏃🏾‍♀️</span><i>✳</i><b>✦</b></div>
      <div className="auth-story-foot"><span>YOUR NEXT CHAPTER STARTS HERE</span><span><CheckCircle2 size={14} /> Progress, not perfection</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-mobile-brand"><Link className="brand" href="/"><span className="brand-mark"><Activity size={19} /></span><span>prime<span>fit</span></span></Link></div>
      <div className="auth-form-wrap">
        <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "JOIN THE COMMUNITY"}</span>
        <h2>{mode === "login" ? "Good to see you." : "Start your journey."}</h2>
        <p>{mode === "login" ? "Choose your account type and sign in." : "Create your PrimeFit account to get started."}</p>
        <div className="auth-mode-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Login</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Create account</button>
        </div>
        <form className="stack-form auth-form" onSubmit={submit}>
          <label>Account type
            <select name="role" value={role} required onChange={(event) => setRole(event.target.value === "trainer" ? "trainer" : event.target.value === "member" ? "member" : "")}>
              <option value="" disabled>Select your account type</option>
              <option value="member">Member</option>
              <option value="trainer">Trainer</option>
            </select>
          </label>
          {mode === "register" && <>
            <label>Your name<input name="display_name" autoComplete="name" placeholder="Your name" required /></label>
            <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            {role === "trainer" && <>
              <label>Training expertise<input name="expertise" maxLength={160} placeholder="e.g. Strength coaching" required /></label>
              <label>Years of experience<input name="experience_years" type="number" min="0" max="99" defaultValue="0" required /></label>
            </>}
          </>}
          <label>Username<input name="username" autoComplete="username" placeholder="Your username" required /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} placeholder="At least 8 characters" required /></label>
          {mode === "register" && role === "trainer" && <p className="auth-role-note">Trainer accounts open the trainer portal immediately after login.</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-dark button-full auth-submit" type="submit" disabled={busy}>
            {busy ? "One moment..." : mode === "login" ? "Login to PrimeFit" : role === "trainer" ? "Create trainer account" : "Create member account"}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-switch">{mode === "login" ? "New to PrimeFit?" : "Already have an account?"}
          <button type="button" onClick={() => changeMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create an account" : "Login"}</button>
        </p>
        <p className="auth-admin-link">Administrator? <Link href="/admin">Open the PrimeFit admin portal</Link></p>
        <p className="auth-legal">Administrator accounts are provisioned by an existing superuser, not public signup. By continuing, you agree to use PrimeFit respectfully and support a kind fitness community.</p>
      </div>
    </section>
  </main>;
}
