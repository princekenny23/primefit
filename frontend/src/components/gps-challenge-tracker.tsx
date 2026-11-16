"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Bike, Footprints, Pause, Play, Square } from "lucide-react";
import { apiRequest } from "@/lib/api";

type ActivityType = "running" | "cycling";
type RoutePoint = { latitude: number; longitude: number; timestamp: string; accuracy: number };

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

function calculateDistanceKm(points: RoutePoint[]) {
  const earthRadiusMeters = 6_371_000;
  const distanceMeters = points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const latitudeDelta = (point.latitude - previous.latitude) * Math.PI / 180;
    const longitudeDelta = (point.longitude - previous.longitude) * Math.PI / 180;
    const latitude1 = previous.latitude * Math.PI / 180;
    const latitude2 = point.latitude * Math.PI / 180;
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
    return total + earthRadiusMeters * 2 * Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(1 - haversine),
    );
  }, 0);
  return distanceMeters / 1000;
}

export function GpsChallengeTracker({
  activityType,
  challengeId,
  requirementId,
  onComplete,
}: {
  activityType: ActivityType;
  challengeId: number;
  requirementId: number;
  onComplete: () => void;
}) {
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [center, setCenter] = useState<RoutePoint | null>(null);
  const [recording, setRecording] = useState(false);
  const [started, setStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const watcher = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const runningSince = useRef<number | null>(null);
  const pausedSeconds = useRef(0);
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const routeLine = useRef<import("leaflet").Polyline | null>(null);
  const currentMarker = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => () => {
    if (watcher.current !== null) navigator.geolocation.clearWatch(watcher.current);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const currentDuration = runningSince.current === null
        ? 0
        : Math.floor((Date.now() - runningSince.current) / 1000);
      setElapsedSeconds(pausedSeconds.current + currentDuration);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!center || !mapElement.current || map.current) return;
    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !mapElement.current || map.current) return;
      const location: [number, number] = [center.latitude, center.longitude];
      map.current = leaflet.map(mapElement.current, {
        center: location,
        zoom: 16,
        scrollWheelZoom: false,
      });
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      routeLine.current = leaflet.polyline([], {
        color: "#c44330",
        opacity: 0.9,
        weight: 5,
      }).addTo(map.current);
      currentMarker.current = leaflet.circleMarker(location, {
        radius: 7,
        color: "#fff",
        weight: 3,
        fillColor: "#c44330",
        fillOpacity: 1,
      }).addTo(map.current);
      setMapReady(true);
    }).catch(() => {
      if (!cancelled) setMapError("The map could not be loaded. Check your internet connection and try again.");
    });

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      routeLine.current = null;
      currentMarker.current = null;
      setMapReady(false);
    };
  }, [center]);

  useEffect(() => {
    if (!mapReady || !map.current || !routeLine.current || !route.length) return;

    const path = route.map((point): [number, number] => [point.latitude, point.longitude]);
    const latestPoint = path[path.length - 1];
    routeLine.current.setLatLngs(path);
    currentMarker.current?.setLatLng(latestPoint);
    map.current.panTo(latestPoint);
  }, [mapReady, route]);

  function startGpsWatch() {
    if (!navigator.geolocation) {
      setError("This device or browser does not support GPS tracking.");
      return;
    }
    watcher.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: RoutePoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date(position.timestamp).toISOString(),
          accuracy: position.coords.accuracy,
        };
        if (point.accuracy > 100) return;
        setCenter((current) => current ?? point);
        setRoute((current) => {
          const previous = current[current.length - 1];
          if (previous && point.timestamp === previous.timestamp) return current;
          return [...current, point];
        });
      },
      (gpsError) => {
        setError(gpsError.code === gpsError.PERMISSION_DENIED
          ? "Location permission is required to track this challenge day."
          : "Could not read your location. Check GPS and try again.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  function start() {
    setError("");
    setRoute([]);
    setCenter(null);
    setElapsedSeconds(0);
    pausedSeconds.current = 0;
    startedAt.current = Date.now();
    runningSince.current = Date.now();
    startGpsWatch();
    setStarted(true);
    setRecording(true);
  }

  function pause() {
    if (runningSince.current !== null) {
      pausedSeconds.current += Math.floor((Date.now() - runningSince.current) / 1000);
      runningSince.current = null;
    }
    if (watcher.current !== null) navigator.geolocation.clearWatch(watcher.current);
    watcher.current = null;
    setRecording(false);
  }

  function resume() {
    setError("");
    runningSince.current = Date.now();
    startGpsWatch();
    setRecording(true);
  }

  async function finish() {
    pause();
    if (route.length < 2 || startedAt.current === null) {
      setError("Keep GPS tracking on until at least two accurate location points are recorded.");
      return;
    }
    const duration = pausedSeconds.current;
    if (duration < 10) {
      setError("Track for at least 10 seconds before finishing.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiRequest("/outdoor-activities/", {
        method: "POST",
        body: JSON.stringify({
          activity_type: activityType,
          challenge: challengeId,
          challenge_requirement: requirementId,
          started_at: new Date(startedAt.current).toISOString(),
          duration_seconds: duration,
          distance_km: 0.01,
          elevation_gain_m: 0,
          notes: "",
          route_data: route,
        }),
      });
      onComplete();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this GPS activity.");
    } finally {
      setSaving(false);
    }
  }

  const Icon = activityType === "running" ? Footprints : Bike;
  const distanceKm = calculateDistanceKm(route);

  return <section className="gps-challenge-tracker">
    <div className="gps-tracker-map">
      <div className="gps-tracker-leaflet-map" ref={mapElement} />
      {(!center || !mapReady) && <div className="gps-tracker-map-empty">
        <Icon size={28} />
        <strong>{mapError ? "Map unavailable" : "OpenStreetMap"}</strong>
        <span>{mapError || (!center ? "Start tracking to show your route here." : "Loading map…")}</span>
      </div>}
    </div>
    <div className="gps-tracker-stats"><span><small>TIME</small><strong>{formatDuration(elapsedSeconds)}</strong></span><span><small>DISTANCE</small><strong>{distanceKm.toFixed(2)} km</strong></span><span><small>GPS POINTS</small><strong>{route.length}</strong></span><span><small>ACTIVITY</small><strong>{activityType === "running" ? "Run" : "Ride"}</strong></span></div>
    {error && <p className="gps-tracker-error"><Activity size={14} />{error}</p>}
    <div className="gps-tracker-actions">
      {!recording && !started && <button className="button button-dark" type="button" onClick={start}><Play size={14} />Start {activityType === "running" ? "run" : "ride"}</button>}
      {recording && <button className="button button-outline" type="button" onClick={pause}><Pause size={14} />Pause</button>}
      {!recording && started && route.length > 0 && <button className="button button-dark" type="button" onClick={resume}><Play size={14} />Resume</button>}
      {started && <button className="button button-lime" type="button" disabled={saving || recording} onClick={() => void finish()}><Square size={13} />{saving ? "Saving…" : "Finish day"}</button>}
    </div>
    <p className="gps-tracker-note">Keep this screen open while tracking. Location is only shared with your challenge activity.</p>
  </section>;
}
