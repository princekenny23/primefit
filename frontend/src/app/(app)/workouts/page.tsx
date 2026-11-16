"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { SectionHeading, WorkoutCard, WorkoutDialog } from "@/components/product-ui";
import { usePrimeFit } from "@/providers/app-provider";
import { Workout } from "@/lib/primefit-types";

export default function WorkoutsPage() {
  return <Suspense fallback={<div className="empty-state">Loading workouts…</div>}><WorkoutLibrary /></Suspense>;
}

function WorkoutLibrary() {
  const { workouts, completeWorkout } = usePrimeFit();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Workout | null>(null);
  const [queryInitialized, setQueryInitialized] = useState(false);
  const effectiveSearch = queryInitialized ? search : searchParams.get("q") ?? "";
  const filtered = useMemo(() => workouts.filter((item) => (mode === "all" || item.mode === mode) && (level === "all" || item.difficulty === level) && `${item.title} ${item.description} ${item.goal}`.toLowerCase().includes(effectiveSearch.toLowerCase())), [workouts, mode, level, effectiveSearch]);
  async function finish(workout: Workout, tracking?: { progress_recorded: boolean; sets_completed?: number; weight_kg?: number }) { const saved = await completeWorkout(workout, tracking); if (saved) setSelected(null); return saved; }
  return <><div className="page-intro"><span className="eyebrow">MOVE YOUR WAY</span><h1>Find your <em>flow.</em></h1><p>Thoughtful sessions for gym days, home days, and every version of you.</p></div><div className="filter-toolbar"><label className="filter-search"><Search size={16} /><input aria-label="Search workouts" placeholder="Search workouts or goals" value={effectiveSearch} onChange={(event) => { setQueryInitialized(true); setSearch(event.target.value); }} /></label><select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Filter by workout location"><option value="all">All locations</option><option value="gym">Gym</option><option value="home">At home</option></select><select value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Filter by difficulty"><option value="all">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div><SectionHeading eyebrow={`${filtered.length} SESSIONS TO EXPLORE`} title="Made for your pace" action="Challenge yourself" href="/challenges" /><div className="workout-grid">{filtered.map((workout) => <WorkoutCard key={workout.id} workout={workout} onOpen={setSelected} />)}</div>{filtered.length === 0 && <div className="empty-state"><Search size={24} /><h3>No workouts found</h3><p>Try a different search or choose another level.</p></div>}{selected && <WorkoutDialog workout={selected} onClose={() => setSelected(null)} onComplete={finish} />}</>;
}
