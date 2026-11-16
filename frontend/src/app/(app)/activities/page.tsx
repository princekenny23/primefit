"use client";

import { FormEvent, useEffect, useState } from "react";
import { Activity, ArrowRight, Bike, Footprints, Mountain } from "lucide-react";
import { apiList, apiRequest } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

type OutdoorActivity = { id: number; activity_type: "running" | "cycling" | "hiking" | "walking" | "other"; activity_label: string; started_at: string; duration_seconds: number; distance_km: string; elevation_gain_m: number; notes: string; verification_status?: "pending" | "verified" | "rejected" };
type EventRegistration = { id: number; event_title: string; event_category: string; status: string };

const icons = { running: Footprints, cycling: Bike, hiking: Mountain, walking: Footprints, other: Activity };

export default function ActivitiesPage() {
  const { authenticated, notify } = usePrimeFit();
  const [activities, setActivities] = useState<OutdoorActivity[]>([]);
  const [eventRegistrations, setEventRegistrations] = useState<EventRegistration[]>([]);
  const [type, setType] = useState<OutdoorActivity["activity_type"]>("running");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    Promise.all([
      apiList<OutdoorActivity>("/outdoor-activities/"),
      apiList<EventRegistration>("/event-registrations/"),
    ]).then(([activityRows, registrationRows]) => {
      setActivities(activityRows);
      setEventRegistrations(registrationRows.filter((item) => item.status === "registered" && ["running", "cycling", "hiking", "walking", "other"].includes(item.event_category)));
    }).catch((error) => notify(error instanceof Error ? error.message : "Could not load outdoor activity data."));
  }, [authenticated, notify]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const eventRegistration = String(data.get("event_registration") || "");
      const saved = await apiRequest<OutdoorActivity>("/outdoor-activities/", { method: "POST", body: JSON.stringify({ activity_type: data.get("activity_type"), started_at: new Date(String(data.get("started_at"))).toISOString(), duration_seconds: Number(data.get("duration_minutes")) * 60, distance_km: Number(data.get("distance_km")), elevation_gain_m: Number(data.get("elevation_gain_m") || 0), notes: data.get("notes") || "", ...(eventRegistration ? { event_registration: Number(eventRegistration) } : {}) }) });
      setActivities((current) => [saved, ...current]);
      form.reset();
      setType("running");
      notify("Activity saved to your journey.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save this activity."); }
    finally { setBusy(false); }
  }

  return <><div className="page-intro"><span className="eyebrow">OUTDOOR MOVEMENT</span><h1>Move <em>outside.</em></h1><p>Log a run, ride, or hike and build your next personal milestone.</p></div><div className="activities-layout"><section className="side-card"><div className="section-heading"><div><span className="eyebrow">LOG ACTIVITY</span><h2>Record your effort</h2></div><Activity size={20} /></div><form className="stack-form" onSubmit={submit}><label>Activity<select name="activity_type" value={type} onChange={(event) => setType(event.target.value as OutdoorActivity["activity_type"])}><option value="running">Running</option><option value="cycling">Cycling</option><option value="hiking">Hiking</option><option value="walking">Walking</option><option value="other">Other</option></select></label><label>Started at<input name="started_at" type="datetime-local" required /></label><div className="trainer-form-row"><label>Distance in km<input name="distance_km" type="number" min="0.01" step="0.01" required /></label><label>Duration in minutes<input name="duration_minutes" type="number" min="1" required /></label></div><label>Elevation gain in metres<input name="elevation_gain_m" type="number" min="0" defaultValue="0" /></label><label>Notes<textarea name="notes" rows={3} placeholder="How did it feel?" /></label>{eventRegistrations.filter((item) => item.event_category === type).length > 0 && <label>Registered event (optional)<select name="event_registration" defaultValue=""><option value="">Personal activity</option>{eventRegistrations.filter((item) => item.event_category === type).map((item) => <option key={item.id} value={item.id}>{item.event_title}</option>)}</select></label>}<button className="button button-dark button-full" type="submit" disabled={!authenticated || busy}>{busy ? "Saving..." : "Save activity"}<ArrowRight size={15} /></button>{!authenticated && <p className="profile-note">Login to save outdoor activities.</p>}</form></section><section><div className="section-heading"><div><span className="eyebrow">YOUR OUTDOOR LOG</span><h2>Recent activities</h2></div></div>{activities.length ? <div className="activity-list">{activities.map((item) => { const Icon = icons[item.activity_type]; return <article className="activity-row" key={item.id}><span className="activity-icon"><Icon size={18} /></span><div><strong>{item.activity_label}</strong><small>{Number(item.distance_km).toFixed(2)} km · {Math.round(item.duration_seconds / 60)} min{item.elevation_gain_m ? ` · ${item.elevation_gain_m} m elevation` : ""}</small><small>{item.verification_status === "verified" ? "Verified" : item.verification_status === "rejected" ? "Not verified" : "Pending verification"}</small></div><time>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(item.started_at))}</time></article>; })}</div> : <div className="empty-state"><Activity size={24} /><h3>No outdoor activities yet</h3><p>Your first run, ride, or hike will appear here.</p></div>}</section></div></>;
}
