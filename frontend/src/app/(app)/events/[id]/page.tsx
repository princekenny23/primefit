"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_BASE, apiList, apiRequest } from "@/lib/api";
import { AdventureEvent, EventRegistration, EventTeam } from "@/lib/event-types";
import { usePrimeFit } from "@/providers/app-provider";

const eventDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const eventFlyerUrl = (value: string) => new URL(value, `${new URL(API_BASE).origin}/`).toString();

export default function EventDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { authenticated, notify } = usePrimeFit();
  const [event, setEvent] = useState<AdventureEvent | null>(null);
  const [teams, setTeams] = useState<EventTeam[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadEvent = useCallback(async () => {
    const [eventData, teamRows, registrationRows] = await Promise.all([
      apiRequest<AdventureEvent>(`/events/${id}/`),
      authenticated ? apiList<EventTeam>("/teams/") : Promise.resolve([]),
      authenticated ? apiList<EventRegistration>("/event-registrations/") : Promise.resolve([]),
    ]);
    return { eventData, teamRows, registrationRows };
  }, [authenticated, id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadEvent().then(({ eventData, teamRows, registrationRows }) => {
      if (!active) return;
      setEvent(eventData);
      setTeams(teamRows);
      setRegistrations(registrationRows.filter((item) => item.status === "registered"));
      setLoadedAt(Date.now());
      setLoadError("");
    }).catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : "Could not load event details.";
      setLoadError(message);
      notify(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadEvent, notify]);

  async function refresh() {
    const { eventData, teamRows, registrationRows } = await loadEvent();
    setEvent(eventData);
    setTeams(teamRows);
    setRegistrations(registrationRows.filter((item) => item.status === "registered"));
    setLoadedAt(Date.now());
  }

  const captainTeams = teams.filter((team) => team.is_captain);
  const ownRegistration = event && registrations.find((registration) =>
    registration.event === event.id && (!registration.team || captainTeams.some((team) => team.id === registration.team)),
  );
  const availableTeams = event ? captainTeams.filter((team) =>
    !registrations.some((registration) => registration.event === event.id && registration.team === team.id),
  ) : [];
  const isPast = event ? loadedAt === null || new Date(event.starts_at).getTime() <= loadedAt : false;
  const isFull = Boolean(event?.participant_limit && event.registered_count >= event.participant_limit);

  async function joinTeam(teamId: number) {
    if (!event || !authenticated) return;
    try {
      await apiRequest(`/events/${event.id}/join/`, { method: "POST", body: JSON.stringify({ team_id: teamId }) });
      await refresh();
      notify(`Your team registered for ${event.title}.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not register your team."); }
  }

  async function submitRegistration(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event || !authenticated) return;
    const data = new FormData(formEvent.currentTarget);
    setBusy(true);
    try {
      const attendee = {
        first_name: String(data.get("first_name")),
        last_name: String(data.get("last_name") || ""),
        email: String(data.get("email")),
        phone: String(data.get("phone") || ""),
      };
      if (Number(event.registration_fee) > 0) {
        const checkout = await apiRequest<{ checkout_url?: string; registered?: boolean }>(`/events/${event.id}/checkout/`, {
          method: "POST",
          body: JSON.stringify(attendee),
        });
        if (checkout.registered) {
          setShowRegistration(false);
          await refresh();
          notify(`You are already registered for ${event.title}.`);
        } else if (checkout.checkout_url) {
          window.location.assign(checkout.checkout_url);
        } else {
          throw new Error("The payment provider did not return a checkout link.");
        }
      } else {
        await apiRequest(`/events/${event.id}/join/`, { method: "POST", body: JSON.stringify(attendee) });
        setShowRegistration(false);
        await refresh();
        notify(`You registered for ${event.title}.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not register for this event.");
    } finally { setBusy(false); }
  }

  async function cancelRegistration() {
    if (!ownRegistration) return;
    try {
      await apiRequest(`/event-registrations/${ownRegistration.id}/cancel/`, { method: "POST", body: "{}" });
      await refresh();
      notify("Event registration cancelled.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not cancel this registration."); }
  }

  return <>
    <Link className="back-link" href="/events"><ArrowLeft size={15} />Back to activities</Link>
    {loading && <div className="page-loading"><span />Loading event details…</div>}
    {!loading && loadError && <div className="empty-state"><CalendarDays size={24} /><h3>Event details unavailable</h3><p>{loadError}</p><Link className="text-action" href="/events">Back to activities <ArrowRight size={14} /></Link></div>}
    {!loading && event && <>
      <div className="event-detail-layout event-detail-page-layout">
        <div className="event-detail-image-column">
          {event.flyer
            ? <Image className="event-detail-image" src={eventFlyerUrl(event.flyer)} alt={`${event.title} event flyer`} width={1200} height={900} unoptimized />
            : <div className="event-detail-image-placeholder"><CalendarDays size={42} /></div>}
        </div>
        <div className="event-detail-content-column">
          <div className="page-intro event-detail-page-intro"><span className="eyebrow">{event.category.toUpperCase()} · {eventDate(event.starts_at)}</span><h1>{event.title}</h1><p>{event.location}</p></div>
          <p className="event-detail-description">{event.description}</p>
          {event.requirements && <section className="event-detail-section"><h2>Requirements</h2><p>{event.requirements}</p></section>}
          <section className="event-detail-section"><h2>Event details</h2><div className="event-detail-list">
            <div><CalendarDays size={16} /><span><strong>Starts</strong><small>{eventDate(event.starts_at)}</small></span></div>
            {event.ends_at && <div><CalendarDays size={16} /><span><strong>Ends</strong><small>{eventDate(event.ends_at)}</small></span></div>}
            <div><MapPin size={16} /><span><strong>Location</strong><small>{event.location}</small></span></div>
            <div><MapPin size={16} /><span><strong>Meeting point</strong><small>{event.meeting_point}</small></span></div>
            <div><UsersRound size={16} /><span><strong>Participants</strong><small>{event.registered_count}{event.participant_limit ? ` / ${event.participant_limit}` : ""}</small></span></div>
            <div><UsersRound size={16} /><span><strong>Organizer</strong><small>{event.organizer_team_name || event.organizer_name}</small></span></div>
          </div></section>
          <aside className="event-payment-column">
            <section className="event-payment-card"><span className="eyebrow">REGISTRATION & PAYMENT</span><h2>{Number(event.registration_fee) > 0 ? `${event.currency} ${Number(event.registration_fee).toLocaleString()}` : "Free event"}</h2>
            <p>{Number(event.registration_fee) > 0 ? "Payment is completed securely at checkout." : "There is no registration fee for this activity."}</p>
            <div className="event-payment-meta"><span>Difficulty</span><strong>{event.difficulty}</strong><span>Places</span><strong>{event.participant_limit ? `${Math.max(0, event.participant_limit - event.registered_count)} remaining` : "No limit"}</strong></div>
            {ownRegistration
              ? <button type="button" className="button button-outline button-full" onClick={() => void cancelRegistration()}>Cancel my registration</button>
              : !authenticated
                ? <Link className="button button-dark button-full" href={`/login?next=/events/${event.id}`}>Sign in to register <ArrowRight size={15} /></Link>
                : <button type="button" className="button button-dark button-full" disabled={isPast || isFull} onClick={() => setShowRegistration(true)}>{isPast ? "Registration closed" : isFull ? "Event full" : "Register"} <ArrowRight size={15} /></button>}
            {authenticated && !ownRegistration && Number(event.registration_fee) === 0 && availableTeams.length > 0 && <label className="event-team-register">Register a team<select defaultValue="" onChange={(change) => { const teamId = Number(change.target.value); if (teamId) void joinTeam(teamId); }}><option value="">Select a team</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
            {showRegistration && authenticated && !ownRegistration && <form className="stack-form event-registration-form" onSubmit={(formEvent) => void submitRegistration(formEvent)}>
              <label>First name<input name="first_name" autoComplete="given-name" maxLength={80} required /></label>
              <label>Last name<input name="last_name" autoComplete="family-name" maxLength={80} /></label>
              <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
              <label>Phone (optional)<input name="phone" type="tel" autoComplete="tel" maxLength={32} /></label>
              <button className="button button-dark button-full" disabled={busy}>{busy ? "Continuing…" : Number(event.registration_fee) > 0 ? "Continue to payment" : "Complete registration"} <ArrowRight size={15} /></button>
            </form>}
            </section>
          </aside>
        </div>
      </div>
    </>}
  </>;
}
