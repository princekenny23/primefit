"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bike, CalendarDays, Footprints, MapPin, Mountain, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { API_BASE, apiList } from "@/lib/api";
import { AdventureEvent } from "@/lib/event-types";
import { usePrimeFit } from "@/providers/app-provider";

const categoryIcon = { running: Footprints, cycling: Bike, hiking: Mountain, walking: Footprints, other: CalendarDays, workout: UsersRound };
const eventDate = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const eventFlyerUrl = (value: string) => new URL(value, `${new URL(API_BASE).origin}/`).toString();

export default function EventsPage() {
  const { notify } = usePrimeFit();
  const [events, setEvents] = useState<AdventureEvent[]>([]);
  const [location, setLocation] = useState("");

  useEffect(() => {
    let active = true;
    apiList<AdventureEvent>("/events/")
      .then((eventRows) => { if (active) setEvents(eventRows); })
      .catch((error) => { if (active) notify(error instanceof Error ? error.message : "Could not load events."); });
    return () => { active = false; };
  }, [notify]);

  const filteredEvents = useMemo(() => events.filter((event) =>
    !location || event.location.toLowerCase().includes(location.toLowerCase()),
  ), [events, location]);

  return <>
    <div className="page-intro"><span className="eyebrow">PRIMEFIT EVENTS</span><h1>Move <em>together.</em></h1><p>Explore activities and competitions, then open an event to see all the details.</p></div>
    <div className="events-toolbar"><nav className="event-type-tabs" aria-label="Event category"><Link href="/events" aria-current="page" className="active">Activities</Link><Link href="/competitions">Competitions</Link></nav><label className="filter-search event-location-search"><MapPin size={15} /><input placeholder="Filter by location" value={location} onChange={(event) => setLocation(event.target.value)} /></label></div>
    <div className="section-heading"><div><span className="eyebrow">{filteredEvents.length} PUBLISHED ACTIVITIES</span><h2>Explore activities</h2></div></div>
    {filteredEvents.length ? <div className="event-grid">{filteredEvents.map((item) => {
      const Icon = categoryIcon[item.category];
      return <article className="side-card event-card" key={item.id}>
        <Link className="event-card-open" href={`/events/${item.id}`} aria-label={`View details for ${item.title}`}>
          <div className="event-card-image">
            {item.flyer
              ? <Image className="event-flyer" src={eventFlyerUrl(item.flyer)} alt={`${item.title} event flyer`} width={640} height={420} unoptimized />
              : <span className="event-flyer-placeholder" aria-label={`${item.category} event image`}><Icon size={38} /></span>}
          </div>
          <div className="event-card-top"><span className="event-icon"><Icon size={20} /></span><span className={`event-difficulty event-${item.difficulty}`}>{item.difficulty}</span></div>
          <span className="eyebrow">{item.category.toUpperCase()} · {eventDate(item.starts_at)}</span>
          <h3>{item.title}</h3><p>{item.description}</p>
          <div className="event-detail"><MapPin size={14} /><span><strong>{item.location}</strong><small>Meet: {item.meeting_point}</small></span></div>
          <span className="event-card-more">Full details and registration <ArrowRight size={14} /></span>
        </Link>
      </article>;
    })}</div> : <div className="empty-state"><CalendarDays size={24} /><h3>No matching activities</h3><p>Try a different location filter.</p></div>}
  </>;
}
