"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiChallenge } from "@/lib/api";
import { challengeGoalLabel } from "@/lib/primefit-types";
import { usePrimeFit } from "@/providers/app-provider";

type AccountDetails = {
  email: string;
  first_name: string;
  last_name: string;
  profile: { display_name: string };
};

export default function ChallengeRegistrationPage() {
  const { id } = useParams<{ id: string }>();
  const { authenticated, loading, notify } = usePrimeFit();
  const router = useRouter();
  const [challenge, setChallenge] = useState<ApiChallenge | null>(null);
  const [details, setDetails] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!authenticated) {
      router.replace(`/login?mode=register&role=member&next=${encodeURIComponent(`/challenges/${id}/register`)}`);
      return;
    }
    let active = true;
    Promise.all([
      apiRequest<ApiChallenge>(`/challenges/${id}/`),
      apiRequest<AccountDetails>("/me/"),
    ]).then(([challengeData, account]) => {
      if (!active) return;
      setChallenge(challengeData);
      const profileName = account.profile.display_name.trim().split(/\s+/);
      setDetails({
        first_name: account.first_name || profileName[0] || "",
        last_name: account.last_name || profileName.slice(1).join(" "),
        email: account.email,
        phone: "",
      });
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load challenge registration.");
    });
    return () => { active = false; };
  }, [authenticated, id, loading, router]);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      if (challenge.joined || Number(challenge.registration_fee) <= 0) {
        if (!challenge.joined) {
          await apiRequest(`/challenges/${challenge.id}/join/`, { method: "POST", body: "{}" });
        }
        notify(challenge.joined ? "You’re already registered for this challenge." : `You joined ${challenge.title}.`);
        window.location.assign("/challenges");
        return;
      }
      const checkout = await apiRequest<{ checkout_url?: string; joined?: boolean }>(`/challenges/${challenge.id}/checkout/`, {
        method: "POST",
        body: JSON.stringify(details),
      });
      if (checkout.joined) {
        notify(`You’re already registered for ${challenge.title}.`);
        window.location.assign("/challenges");
      } else if (checkout.checkout_url) {
        window.location.assign(checkout.checkout_url);
      } else {
        throw new Error("The payment provider did not return a checkout link.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not continue challenge registration.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !authenticated || (!challenge && !error)) return <div className="page-loading">Loading challenge registration…</div>;

  return <>
    <Link className="back-link" href="/challenges"><ArrowLeft size={15} />Back to challenges</Link>
    {error && !challenge && <div className="empty-state"><Trophy size={24} /><h3>Challenge registration unavailable</h3><p>{error}</p></div>}
    {challenge && <section className="challenge-registration-card side-card">
      <span className="eyebrow">CHALLENGE REGISTRATION</span>
      <h1>{challenge.title}</h1>
      <p>{challenge.description}</p>
      <div className="challenge-registration-summary">
        <span>{challenge.duration_days} days</span>
        <span>{challengeGoalLabel(challenge.goal)}</span>
        <strong>{Number(challenge.registration_fee) > 0 ? `${challenge.currency} ${Number(challenge.registration_fee).toLocaleString()}` : "Free"}</strong>
      </div>
      <form className="stack-form" onSubmit={(formEvent) => void submitRegistration(formEvent)}>
        <div className="trainer-form-row">
          <label>First name<input name="first_name" autoComplete="given-name" maxLength={80} required value={details.first_name} onChange={(change) => setDetails((current) => ({ ...current, first_name: change.target.value }))} /></label>
          <label>Last name<input name="last_name" autoComplete="family-name" maxLength={80} value={details.last_name} onChange={(change) => setDetails((current) => ({ ...current, last_name: change.target.value }))} /></label>
        </div>
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required value={details.email} onChange={(change) => setDetails((current) => ({ ...current, email: change.target.value }))} /></label>
        <label>Phone number<input name="phone" type="tel" autoComplete="tel" maxLength={32} placeholder="Add a contact number (optional)" value={details.phone} onChange={(change) => setDetails((current) => ({ ...current, phone: change.target.value }))} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-dark button-full" disabled={busy}>{busy ? "Continuing…" : Number(challenge.registration_fee) > 0 ? "Continue to payment" : "Join challenge"} <ArrowRight size={15} /></button>
      </form>
    </section>}
  </>;
}
