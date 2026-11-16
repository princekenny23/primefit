"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

type PaymentResult = { status: "paid" | "pending" | "failed"; challenge_title: string; registered: boolean };

export default function ChallengePaymentPage() {
  const { authenticated, loading } = usePrimeFit();
  const [txRef] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("tx_ref") ?? "");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const verify = useCallback(async (reference: string) => {
    setChecking(true);
    setError("");
    try {
      const payment = await apiRequest<PaymentResult>("/challenge-payments/verify/", {
        method: "POST",
        body: JSON.stringify({ tx_ref: reference }),
      });
      setResult(payment);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not verify the payment.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !authenticated || !txRef) return;
    let active = true;
    apiRequest<PaymentResult>("/challenge-payments/verify/", {
      method: "POST",
      body: JSON.stringify({ tx_ref: txRef }),
    }).then((payment) => {
      if (active) setResult(payment);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not verify the payment.");
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [authenticated, loading, txRef]);

  const message = !txRef
    ? "Payment reference is missing. Return to the challenge and register again."
    : !loading && !authenticated
      ? "Sign in with the account used to start registration, then check your payment."
      : error || (result?.status === "pending" ? "The payment provider has not confirmed this payment yet." : "Your place is not confirmed until the payment succeeds.");

  return <section className="event-payment-result side-card">
    {result?.status === "paid" && result.registered ? <CheckCircle2 size={34} className="event-payment-success-icon" /> : <CircleAlert size={34} className="event-payment-pending-icon" />}
    <span className="eyebrow">CHALLENGE REGISTRATION</span>
    <h1>{result?.status === "paid" && result.registered ? "You’re registered" : checking || (authenticated && txRef && !result && !error) ? "Checking your payment…" : result?.status === "pending" ? "Payment is processing" : "Payment not confirmed"}</h1>
    {result?.challenge_title && <p>{result.challenge_title}</p>}
    <p>{result?.status === "paid" && result.registered ? "Your payment is confirmed and your challenge place is reserved." : message}</p>
    <div className="event-payment-actions">
      {txRef && authenticated && result?.status !== "paid" && <button className="button button-dark" onClick={() => void verify(txRef)} disabled={checking}>{checking ? "Checking…" : "Check payment"}</button>}
      <a className="button button-outline" href="/challenges">Back to challenges <ArrowRight size={14} /></a>
    </div>
  </section>;
}
