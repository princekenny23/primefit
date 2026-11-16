"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiChallenge, ApiExercise } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";
import { ChallengeGoalOptions, Modal, SectionHeading } from "@/components/product-ui";

type TrainerMetrics = {
  participants: number;
  workout_completions: number;
  active_users: number;
  challenge_completion_percent: number;
  eligible_earnings: number | string;
  commission_note: string;
};
type DayExercise = { exercise: number; sets: number; reps: string; rest_seconds: number };
type ChallengeDay = { title: string; mode: "gym" | "home"; duration_minutes: number; exercises: DayExercise[] };

function localDateString() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthString(dateString: string) {
  return dateString.slice(0, 7);
}

function dateKey(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function emptyDay(index: number): ChallengeDay {
  return { title: `Day ${index + 1} workout`, mode: "gym", duration_minutes: 25, exercises: [] };
}

export default function TrainerPage() {
  const { authenticated, role, exercises, notify, refreshChallenges } = usePrimeFit();
  const router = useRouter();
  const [metrics, setMetrics] = useState<TrainerMetrics | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [challengeDuration, setChallengeDuration] = useState(7);
  const [activityCategory, setActivityCategory] = useState("general");
  const [challengeGoal, setChallengeGoal] = useState("strength");
  const [challengeDays, setChallengeDays] = useState<ChallengeDay[]>([]);
  const [challengeStartDate, setChallengeStartDate] = useState(localDateString);
  const [calendarMonth, setCalendarMonth] = useState(() => monthString(localDateString()));
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [dayEditorOpen, setDayEditorOpen] = useState(false);

  useEffect(() => {
    if (authenticated && role !== "trainer") router.replace("/");
    if (authenticated && role === "trainer") {
      apiRequest<TrainerMetrics>("/trainer/metrics/")
        .then(setMetrics)
        .catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not load trainer metrics."));
    }
  }, [authenticated, role, router, notify]);

  function openCreator() {
    setCreatorOpen(true);
    setChallengeDuration(7);
    setActivityCategory("general");
    setChallengeGoal("strength");
    setChallengeDays(Array.from({ length: 7 }, (_, index) => emptyDay(index)));
    setExerciseSearch("");
    const startDate = localDateString();
    setChallengeStartDate(startDate);
    setCalendarMonth(monthString(startDate));
    setSelectedDayIndex(0);
    setDayEditorOpen(false);
  }

  function updateDuration(value: number) {
    const duration = Math.max(1, Math.min(60, value || 1));
    setChallengeDuration(duration);
    setChallengeDays((current) => Array.from(
      { length: duration },
      (_, index) => current[index] ?? emptyDay(index),
    ));
    setSelectedDayIndex((current) => Math.min(current, duration - 1));
  }

  function updateDay(index: number, update: (day: ChallengeDay) => ChallengeDay) {
    setChallengeDays((current) => current.map((day, dayIndex) => dayIndex === index ? update(day) : day));
  }

  function toggleExercise(day: ChallengeDay, exercise: ApiExercise, checked: boolean): ChallengeDay {
    const exercisesForDay = checked
      ? [...day.exercises, { exercise: exercise.id, sets: 3, reps: "10", rest_seconds: 45 }]
      : day.exercises.filter((item) => item.exercise !== exercise.id);
    return { ...day, exercises: exercisesForDay };
  }

  async function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const gpsChallenge = activityCategory === "running" || activityCategory === "cycling";
    if (!gpsChallenge && challengeDays.some((day) => day.exercises.length === 0)) {
      notify("Add at least one exercise to every scheduled day.");
      return;
    }
    try {
      const challenge = await apiRequest<ApiChallenge>("/challenges/", {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          description: data.get("description"),
          duration_days: challengeDuration,
          goal: challengeGoal,
          activity_category: activityCategory,
          points_per_completion: Number(data.get("points_per_completion")),
          registration_fee: Number(data.get("registration_fee")),
          currency: data.get("currency"),
          starts_at: challengeStartDate,
          rules: data.get("rules"),
          requirements_input: challengeDays.map((day, index) => gpsChallenge
            ? { day_number: index + 1, activity_type: activityCategory }
            : {
              day_number: index + 1,
              activity_type: "workout",
              title: day.title,
              mode: day.mode,
              duration_minutes: day.duration_minutes,
              exercise_items: day.exercises,
            }),
        }),
      });
      const image = data.get("image");
      let imageError = "";
      if (image instanceof File && image.size > 0) {
        const imageData = new FormData();
        imageData.set("image", image);
        try {
          await apiRequest(`/challenges/${challenge.id}/`, { method: "PATCH", body: imageData });
        } catch (error) {
          imageError = error instanceof Error ? error.message : "Upload failed.";
        }
      }
      try {
        await refreshChallenges();
      } catch (error) {
        setCreatorOpen(false);
        setDayEditorOpen(false);
        const refreshError = error instanceof Error ? error.message : "Refresh failed.";
        notify(`Challenge created, but its image or challenge list could not be refreshed: ${imageError || refreshError}`);
        return;
      }
      setCreatorOpen(false);
      setDayEditorOpen(false);
      notify(imageError ? `Challenge published, but its image could not be uploaded: ${imageError}` : "Challenge created and published.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not submit the challenge.");
    }
  }

  const matchingExercises = useMemo(() => exercises.filter((exercise) =>
    `${exercise.name} ${exercise.equipment} ${exercise.body_part} ${exercise.primary_muscles.join(" ")}`
      .toLowerCase().includes(exerciseSearch.trim().toLowerCase())).slice(0, 40), [exercises, exerciseSearch]);
  const calendarCells = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const firstOfMonth = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const cellCount = Math.ceil((firstOfMonth.getDay() + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const dayNumber = index - firstOfMonth.getDay() + 1;
      return dayNumber > 0 && dayNumber <= daysInMonth ? new Date(year, month - 1, dayNumber) : null;
    });
  }, [calendarMonth]);
  const scheduledDaysByDate = useMemo(() => {
    const start = new Date(`${challengeStartDate}T00:00:00`);
    return new Map(challengeDays.map((day, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return [dateKey(date), index] as const;
    }));
  }, [challengeDays, challengeStartDate]);

  function changeCalendarMonth(offset: number) {
    const [year, month] = calendarMonth.split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    setCalendarMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  if (!authenticated || role !== "trainer") return <div className="page-loading">Redirecting to Login...</div>;

  const selectedWorkoutDate = new Date(`${challengeStartDate}T00:00:00`);
  selectedWorkoutDate.setDate(selectedWorkoutDate.getDate() + selectedDayIndex);
  const gpsChallenge = activityCategory === "running" || activityCategory === "cycling";
  const readyDaysCount = gpsChallenge ? challengeDays.length : challengeDays.filter((day) => day.exercises.length > 0).length;

  return <>
    <div className="page-intro"><span className="eyebrow">TRAINER PORTAL</span><h1>Make movement <em>matter.</em></h1><p>Create thoughtful programming and help the whole community grow.</p></div>
    <div className="trainer-welcome"><div><span className="eyebrow">YOUR IMPACT, AT A GLANCE</span><h2>Good to have you here.</h2><p>Here’s how members are moving with your programs.</p></div><span className="status-approved"><CheckCircle2 size={15} />Active trainer</span></div>
    <div className="trainer-metrics">{[["Participants", metrics?.participants ?? 0], ["Workout completions", metrics?.workout_completions ?? 0], ["Active members", metrics?.active_users ?? 0], ["Challenge completion", `${metrics?.challenge_completion_percent ?? 0}%`]].map(([label, value]) => <div className="trainer-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="trainer-lower"><section className="side-card"><SectionHeading eyebrow="CONTENT PORTAL" title="Your programs" /><p>Create a challenge with a custom workout plan for every day.</p><div className="trainer-actions"><button className="button button-dark" onClick={openCreator}>Create challenge <ArrowRight size={15} /></button></div></section><section className="trainer-earnings"><span className="eyebrow">ELIGIBLE EARNINGS</span><strong>MK {Number(metrics?.eligible_earnings ?? 0).toLocaleString()}</strong><p>{metrics?.commission_note ?? "Commission is set by PrimeFit administration."}</p></section></div>
    {creatorOpen && <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatorOpen(false); }}><section className="modal-panel" role="dialog" aria-modal="true" aria-label="Create challenge"><div className="modal-topline"><span className="eyebrow">TRAINER PORTAL</span><button onClick={() => setCreatorOpen(false)} className="modal-close" aria-label="Close"><span>×</span></button></div><h2>Create a challenge</h2><form className="stack-form trainer-form" onSubmit={(event) => void submitChallenge(event)}>
      <label>Title<input name="title" maxLength={140} required /></label>
      <label>Description<textarea name="description" rows={3} required /></label>
      <label>Challenge image<input name="image" type="file" accept="image/*" /></label>
      <div className="trainer-form-row">
        <label>Duration in days<input name="duration_days" type="number" min="1" max="60" value={challengeDuration} onChange={(event) => updateDuration(Number(event.target.value))} required /></label>
        <label>Points per day<input name="points_per_completion" type="number" min="1" max="500" defaultValue="50" required /></label>
      </div>
      <div className="trainer-form-row">
        <label>Registration fee<input name="registration_fee" type="number" min="0" step="0.01" defaultValue="0" required /></label>
        <label>Fee currency<select name="currency" defaultValue="MWK"><option value="MWK">MWK</option><option value="USD">USD</option></select></label>
      </div>
      <label>Challenge start date<input type="date" value={challengeStartDate} onChange={(event) => { if (event.target.value) { setChallengeStartDate(event.target.value); setCalendarMonth(monthString(event.target.value)); } }} required /></label>
      <fieldset className="challenge-goal-field">
        <legend>Fitness goal</legend>
        <ChallengeGoalOptions value={challengeGoal} onChange={setChallengeGoal} />
      </fieldset>
      <label>Challenge activity<select name="activity_category" value={activityCategory} onChange={(event) => setActivityCategory(event.target.value)}><option value="general">Workout plan</option><option value="boxing">Boxing workout plan</option><option value="running">Running · GPS tracked</option><option value="cycling">Cycling · GPS tracked</option></select></label>
      <section className="challenge-schedule-picker">
      <div className="challenge-schedule-heading"><div><strong>{gpsChallenge ? `Schedule each day’s ${activityCategory === "running" ? "run" : "ride"}` : "Build each day’s workout"}</strong><small>{gpsChallenge ? "Members will start GPS tracking from each challenge day." : "Choose exercises, then set the sets, reps, and rest for each one."}</small></div><span>{readyDaysCount}/{challengeDuration} days</span></div>
        <section className="challenge-month-calendar" aria-label="Challenge workout calendar">
          <header className="challenge-month-calendar-header">
            <button type="button" className="calendar-month-arrow" aria-label="Previous month" onClick={() => changeCalendarMonth(-1)}><ArrowLeft size={17} /></button>
            <h3>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(`${calendarMonth}-01T00:00:00`))}</h3>
            <button type="button" className="calendar-month-arrow" aria-label="Next month" onClick={() => changeCalendarMonth(1)}><ArrowRight size={17} /></button>
          </header>
          <div className="challenge-month-grid" role="group" aria-label={`Calendar for ${calendarMonth}`}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => <span className="challenge-month-weekday" key={weekday}>{weekday}</span>)}
            {calendarCells.map((date, index) => {
              if (!date) return <span className="challenge-month-empty" key={`empty-${calendarMonth}-${index}`} />;
              const key = dateKey(date);
              const dayIndex = scheduledDaysByDate.get(key) ?? -1;
              const day = dayIndex < 0 ? undefined : challengeDays[dayIndex];
              return <button
                type="button"
                key={key}
                aria-label={day ? `${key}, challenge day ${dayIndex + 1}, ${gpsChallenge ? `${activityCategory} tracking` : day.exercises.length ? `${day.exercises.length} exercises selected` : "workout not built"}` : key}
                aria-pressed={dayIndex === selectedDayIndex}
                className={`challenge-month-date ${day ? "has-challenge-day" : ""} ${day && (gpsChallenge || day.exercises.length) ? "has-workout" : ""} ${dayIndex === selectedDayIndex ? "selected" : ""}`}
                onClick={() => { if (dayIndex >= 0) { setSelectedDayIndex(dayIndex); setDayEditorOpen(true); } }}
                disabled={dayIndex < 0}
              >
                <span className="challenge-month-date-number">{date.getDate()}</span>
                {day && <><small>{gpsChallenge ? activityCategory.toUpperCase() : `DAY ${dayIndex + 1}`}</small><i className={gpsChallenge || day.exercises.length ? "calendar-day-indicator-ready" : ""} /></>}
              </button>;
            })}
          </div>
          <div className="challenge-calendar-legend"><span><i /> {gpsChallenge ? "GPS activity scheduled" : "Workout to build"}</span><span><i className="legend-ready" /> {gpsChallenge ? "Ready to track" : "Workout ready"}</span></div>
          {challengeDays[selectedDayIndex] && <div className="challenge-calendar-selection"><span><strong>Day {selectedDayIndex + 1}</strong> · {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(selectedWorkoutDate)}</span><strong>{gpsChallenge ? `${activityCategory === "running" ? "Run" : "Ride"} · GPS tracking` : challengeDays[selectedDayIndex].title || "Untitled workout"}</strong></div>}
        </section>
        {!gpsChallenge && <p className="exercise-data-credit">Exercise data by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>.</p>}
      </section>
      <label>Challenge rules<textarea name="rules" rows={2} /></label>
      <button className="button button-dark button-full" type="submit">Create challenge <ArrowRight size={15} /></button>
    </form></section></div>}
    {creatorOpen && dayEditorOpen && challengeDays[selectedDayIndex] && <Modal title={gpsChallenge ? `Day ${selectedDayIndex + 1} ${activityCategory === "running" ? "run" : "ride"}` : `Day ${selectedDayIndex + 1} workout`} eyebrow={new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(selectedWorkoutDate)} onClose={() => setDayEditorOpen(false)} className="challenge-day-modal">
      <section className="challenge-day-editor">
        <div className="challenge-day-editor-heading"><div><span className="eyebrow">DAY {selectedDayIndex + 1} · {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(selectedWorkoutDate)}</span><h3>{gpsChallenge ? `${activityCategory === "running" ? "GPS run" : "GPS ride"}` : challengeDays[selectedDayIndex].title || "Untitled workout"}</h3></div><div className="challenge-day-navigation"><button className="calendar-month-arrow" type="button" aria-label="Previous challenge day" onClick={() => setSelectedDayIndex((current) => Math.max(current - 1, 0))} disabled={selectedDayIndex === 0}><ArrowLeft size={15} /></button><button className="calendar-month-arrow" type="button" aria-label="Next challenge day" onClick={() => setSelectedDayIndex((current) => Math.min(current + 1, challengeDuration - 1))} disabled={selectedDayIndex >= challengeDuration - 1}><ArrowRight size={15} /></button></div></div>
        {gpsChallenge ? <p className="gps-day-setup">This day will open the live map and GPS tracker for members who join this challenge.</p> : <>
        <label>Workout name<input value={challengeDays[selectedDayIndex].title} maxLength={140} onChange={(event) => updateDay(selectedDayIndex, (current) => ({ ...current, title: event.target.value }))} /></label>
        <div className="trainer-form-row">
          <label>Workout type<select value={challengeDays[selectedDayIndex].mode} onChange={(event) => updateDay(selectedDayIndex, (current) => ({ ...current, mode: event.target.value as "gym" | "home" }))}><option value="gym">Gym</option><option value="home">Home</option></select></label>
          <label>Duration (minutes)<input type="number" min="1" max="180" value={challengeDays[selectedDayIndex].duration_minutes} onChange={(event) => updateDay(selectedDayIndex, (current) => ({ ...current, duration_minutes: Number(event.target.value) }))} /></label>
        </div>
        <label>Find exercises<input type="search" value={exerciseSearch} onChange={(event) => setExerciseSearch(event.target.value)} placeholder="Search name, equipment, or muscle" /></label>
        <div className="dataset-exercise-results challenge-exercise-grid" aria-label={`Exercise choices for day ${selectedDayIndex + 1}`}>
          {matchingExercises.map((exercise) => {
            const selected = challengeDays[selectedDayIndex].exercises.some((item) => item.exercise === exercise.id);
            return <label className={`dataset-exercise-option ${selected ? "is-selected" : ""}`} key={exercise.id}>
              <span className="challenge-exercise-choice-heading"><strong>{exercise.name}</strong><input type="checkbox" checked={selected} onChange={(event) => updateDay(selectedDayIndex, (current) => toggleExercise(current, exercise, event.target.checked))} /></span>
              <small className="challenge-exercise-choice-meta">{[exercise.body_part.replaceAll("_", " "), exercise.equipment].filter(Boolean).join(" · ") || "Bodyweight"}</small>
              <span className="challenge-exercise-choice-action">{selected ? "Added to workout" : "Select exercise"}</span>
            </label>;
          })}
          {matchingExercises.length === 0 && <p className="exercise-picker-empty">{exercises.length === 0 ? "Exercise library is still loading or unavailable." : "No matching exercises. Try another search."}</p>}
        </div>
        {challengeDays[selectedDayIndex].exercises.map((item) => {
          const exercise = exercises.find((candidate) => candidate.id === item.exercise);
          return <div className="challenge-day-exercise" key={item.exercise}><div className="challenge-day-exercise-heading"><strong>{exercise?.name ?? "Exercise"}</strong><button type="button" onClick={() => updateDay(selectedDayIndex, (current) => ({ ...current, exercises: current.exercises.filter((entry) => entry.exercise !== item.exercise) }))}>Remove</button></div><div className="trainer-form-row">
            <label>Sets<input type="number" min="1" max="20" value={item.sets} onChange={(event) => updateDay(selectedDayIndex, (current) => ({ ...current, exercises: current.exercises.map((entry) => entry.exercise === item.exercise ? { ...entry, sets: Number(event.target.value) } : entry) }))} /></label>
            <label>Reps<input value={item.reps} maxLength={30} onChange={(event) => updateDay(selectedDayIndex, (current) => ({ ...current, exercises: current.exercises.map((entry) => entry.exercise === item.exercise ? { ...entry, reps: event.target.value } : entry) }))} /></label>
            <label>Rest (seconds)<input type="number" min="0" max="3600" value={item.rest_seconds} onChange={(event) => updateDay(selectedDayIndex, (current) => ({ ...current, exercises: current.exercises.map((entry) => entry.exercise === item.exercise ? { ...entry, rest_seconds: Number(event.target.value) } : entry) }))} /></label>
          </div></div>;
        })}
        {challengeDays[selectedDayIndex].exercises.length === 0 && <p className="exercise-picker-empty">Add at least one exercise to this day.</p>}
        </>}
        <button type="button" className="button button-dark button-full" onClick={() => setDayEditorOpen(false)}>Done</button>
      </section>
    </Modal>}
  </>;
}
