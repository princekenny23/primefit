"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

type PaymentResult = { status: "paid" | "pending" | "failed"; event_title: string; registered: boolean };

export default function EventPaymentPage() {
  const { authenticated, loading } = usePrimeFit();
  const [txRef] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("tx_ref") ?? "");
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const verify = useCallback(async (reference: string) => {
    setChecking(true);
    setError("");
    try {
      const payment = await apiRequest<PaymentResult>("/event-payments/verify/", {
        method: "POST",
        body: JSON.stringify({ tx_ref: reference }),
      });
      setResult(payment);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "Could not verify the payment.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !authenticated || !txRef) return;
    let active = true;
    apiRequest<PaymentResult>("/event-payments/verify/", {
      method: "POST",
      body: JSON.stringify({ tx_ref: txRef }),
    }).then((payment) => {
      if (active) setResult(payment);
    }).catch((verificationError: unknown) => {
      if (active) setError(verificationError instanceof Error ? verificationError.message : "Could not verify the payment.");
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [authenticated, loading, txRef]);

  const visibleError = error || (!txRef
    ? "Payment reference is missing. Return to events to register again."
    : !loading && !authenticated
      ? "Sign in with the account used to start registration, then check your payment."
      : "");

  return <section className="event-payment-result side-card">
    {result?.status === "paid" && result.registered ? <CheckCircle2 size={34} className="event-payment-success-icon" /> : <CircleAlert size={34} className="event-payment-pending-icon" />}
    <span className="eyebrow">EVENT REGISTRATION</span>
    <h1>{result?.status === "paid" && result.registered ? "You’re registered" : checking || (authenticated && txRef && !result && !error) ? "Checking your payment…" : result?.status === "pending" ? "Payment is processing" : "Payment not confirmed"}</h1>
    {result?.event_title && <p>{result.event_title}</p>}
    {result?.status === "paid" && result.registered
      ? <p>Your payment is confirmed and your place is reserved.</p>
      : <p>{visibleError || (result?.status === "pending" ? "The provider has not confirmed this payment yet. You can check again shortly." : "Your place is not confirmed until the payment succeeds.")}</p>}
    <div className="event-payment-actions">
      {txRef && authenticated && result?.status !== "paid" && <button className="button button-dark" onClick={() => void verify(txRef)} disabled={checking}>{checking ? "Checking…" : "Check payment"}</button>}
      <Link className="button button-outline" href="/events">Back to events <ArrowRight size={14} /></Link>
    </div>
  </section>;
}
