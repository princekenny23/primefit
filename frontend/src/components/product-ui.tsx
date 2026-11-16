"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowRight, Check, Dumbbell, Flame, Heart, MessageCircle, MoreHorizontal, Sparkles, Users, X, Zap } from "lucide-react";
import { apiList, apiRequest, ApiChallenge, ApiMember } from "@/lib/api";
import { CHALLENGE_GOALS, challengeGoalLabel, Challenge, FeedPost, mapWorkout, Member, Workout } from "@/lib/primefit-types";
import { usePrimeFit } from "@/providers/app-provider";
import { GpsChallengeTracker } from "@/components/gps-challenge-tracker";

export function Avatar({ name, small = false, photo }: { name: string; small?: boolean; photo?: string | null }) {
  const initials = name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  return <span className={`avatar ${small ? "avatar-small" : ""}`}>{photo ? <Image src={photo} alt="" width={40} height={40} unoptimized className="avatar-image" /> : initials}</span>;
}
export function SectionHeading({ eyebrow, title, action, href }: { eyebrow: string; title: string; action?: string; href?: string }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action && href && <Link className="text-action" href={href}>{action}<ArrowRight size={15} /></Link>}</div>;
}
export function WorkoutCard({ workout, onOpen, compact = false }: { workout: Workout; onOpen?: (workout: Workout) => void; compact?: boolean }) {
  const illustration = workout.workout_exercises?.[0]?.exercise.illustration;
  return <article className={`workout-card ${compact ? "workout-card-compact" : ""}`}><div className={`workout-art ${workout.accent}`}>{illustration ? <Image className="workout-card-illustration" src={illustration} alt={`${workout.title} exercise preview`} width={220} height={170} unoptimized /> : <span className="art-emoji">{workout.art}</span>}<span className="art-label">{workout.mode === "gym" ? "STRENGTH STUDIO" : "MOVE AT HOME"}</span></div><div className="workout-card-content"><div className="tag-row"><span className="pill pill-soft">{workout.difficulty}</span><span className="text-muted">{workout.duration_minutes} min</span></div><h3>{workout.title}</h3><p>{workout.description}</p><div className="workout-card-bottom"><span><Dumbbell size={14} /> {workout.workout_exercises?.length ?? 0} exercises</span><button className="round-arrow" onClick={() => onOpen?.(workout)} aria-label={`Start ${workout.title}`}><ArrowRight size={17} /></button></div></div></article>;
}
export function WorkoutDialog({ workout, onClose, onComplete }: { workout: Workout; onClose: () => void; onComplete: (workout: Workout, tracking?: { progress_recorded: boolean; sets_completed?: number; weight_kg?: number; event_registration?: number }) => Promise<boolean> }) {
  const [started, setStarted] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [completedSets, setCompletedSets] = useState<Record<number, number[]>>({});
  const [weight, setWeight] = useState("");
  const [eventRegistration, setEventRegistration] = useState("");
  const [restSeconds, setRestSeconds] = useState(0);
  const [workoutEvents, setWorkoutEvents] = useState<{ id: number; event_title: string; event_starts_at: string; event_ends_at: string | null }[]>([]);
  const { authenticated, notify } = usePrimeFit();
  const rows = workout.workout_exercises ?? [];
  const row = rows[currentExercise];
  const exerciseCompletedSets = row ? completedSets[row.id] ?? [] : [];
  const completedSetCount = Object.values(completedSets).reduce((total, exerciseSets) => total + exerciseSets.length, 0);

  useEffect(() => {
    if (!authenticated) return;
    apiList<{ id: number; event_category: string; event_title: string; event_starts_at: string; event_ends_at: string | null; status: string }>("/event-registrations/")
      .then((rows) => setWorkoutEvents(rows.filter((item) => item.status === "registered" && item.event_category === "workout")))
      .catch((error) => notify(error instanceof Error ? error.message : "Could not load your workout event registrations."));
  }, [authenticated, notify]);
  useEffect(() => {
    if (restSeconds === 0) return;
    const timer = window.setTimeout(() => setRestSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [restSeconds]);

  function toggleSet(exerciseId: number, setNumber: number) {
    setCompletedSets((current) => {
      const currentSets = current[exerciseId] ?? [];
      return {
        ...current,
        [exerciseId]: currentSets.includes(setNumber)
          ? currentSets.filter((item) => item !== setNumber)
          : [...currentSets, setNumber],
      };
    });
  }

  const tracking = {
    progress_recorded: true,
    sets_completed: completedSetCount,
    ...(weight ? { weight_kg: Number(weight) } : {}),
    ...(eventRegistration ? { event_registration: Number(eventRegistration) } : {}),
  };
  const instructions = (row?.instructions || row?.exercise.instructions || "Use controlled movement and stop if you feel pain.")
    .split(/\n+/)
    .map((instruction) => instruction.trim())
    .filter(Boolean);

  return <Modal title={workout.title} eyebrow={`${workout.mode.toUpperCase()} WORKOUT · ${workout.difficulty.toUpperCase()}`} onClose={onClose}>
    <div className={`modal-workout-art ${workout.accent}`}><span>{workout.art}</span><div><strong>{workout.duration_minutes} min</strong><small>{rows.length} exercises · Move at your own pace</small></div></div>
    {!started ? <>
      <p className="modal-intro">{workout.description}</p>
      {rows.length ? <div className="workout-preview-list">{rows.map((item, index) => <div className="workout-preview-row" key={item.id}>
        {item.exercise.illustration ? <Image src={item.exercise.illustration} alt={`${item.exercise.name} demonstration`} width={64} height={64} unoptimized /> : <span className="workout-preview-placeholder"><Dumbbell size={20} /></span>}
        <span><strong>{index + 1}. {item.exercise.name}</strong><small>{item.sets} sets · {item.reps} reps · {item.rest_seconds}s rest</small></span>
      </div>)}</div> : <p className="empty-state">This workout has no exercises yet. You can still log it when you finish.</p>}
      {workoutEvents.length > 0 && <label className="event-link-select">Link to a registered workout event<select value={eventRegistration} onChange={(event) => setEventRegistration(event.target.value)}><option value="">Personal workout</option>{workoutEvents.map((item) => <option key={item.id} value={item.id}>{item.event_title}</option>)}</select></label>}
      <button className="button button-lime button-full modal-complete" onClick={() => rows.length ? setStarted(true) : void onComplete(workout, { progress_recorded: false, ...(eventRegistration ? { event_registration: Number(eventRegistration) } : {}) })}>
        {rows.length ? "Start workout" : "Mark workout complete"} <ArrowRight size={16} />
      </button>
    </> : row ? <>
      <div className="workout-session-progress"><span>EXERCISE {currentExercise + 1} OF {rows.length}</span><strong>{completedSetCount} sets complete</strong></div>
      <div className="workout-session-progress-track"><span style={{ width: `${((currentExercise + (exerciseCompletedSets.length / row.sets)) / rows.length) * 100}%` }} /></div>
      <section className="active-exercise">
        {row.exercise.illustration ? <Image className="active-exercise-image" src={row.exercise.illustration} alt={`${row.exercise.name} exercise demonstration`} width={480} height={320} unoptimized /> : <div className="active-exercise-placeholder"><Dumbbell size={42} /></div>}
        <div className="active-exercise-heading"><div><span className="eyebrow">YOUR MOVE</span><h3>{row.exercise.name}</h3></div><span className="pill pill-soft">{row.exercise.equipment || "Bodyweight"}</span></div>
        <div className="active-exercise-meta"><span><strong>{row.sets}</strong> sets</span><span><strong>{row.reps}</strong> reps each</span><span><strong>{row.rest_seconds}s</strong> rest</span></div>
        <div className="exercise-instructions"><strong>How to do it</strong>{instructions.length > 1 ? <ol>{instructions.map((instruction, index) => <li key={`${index}-${instruction}`}>{instruction}</li>)}</ol> : <p>{instructions[0]}</p>}</div>
      </section>
      <div className="set-checklist"><strong>Complete each set</strong>{Array.from({ length: row.sets }, (_, index) => {
        const setNumber = index + 1;
        const done = exerciseCompletedSets.includes(setNumber);
        return <button type="button" className={`set-check ${done ? "set-check-done" : ""}`} key={setNumber} onClick={() => toggleSet(row.id, setNumber)}><span>{done ? <Check size={15} /> : setNumber}</span><strong>Set {setNumber}</strong><small>{row.reps} reps</small></button>;
      })}</div>
      {exerciseCompletedSets.length > 0 && exerciseCompletedSets.length < row.sets && <div className="rest-timer"><span>{restSeconds ? `Rest: ${restSeconds}s` : `Rest ${row.rest_seconds}s between sets`}</span><button type="button" className="button button-outline" onClick={() => setRestSeconds(row.rest_seconds)} disabled={restSeconds > 0}>{restSeconds ? "Resting…" : "Start rest timer"}</button></div>}
      <div className="tracking-fields"><label>Weight used (kg)<input type="number" min="0" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="Optional" /></label></div>
      <div className="workout-session-actions">
        {currentExercise > 0 && <button className="button button-outline" onClick={() => setCurrentExercise((index) => index - 1)}>Previous</button>}
        {currentExercise < rows.length - 1
          ? <button className="button button-dark" disabled={exerciseCompletedSets.length < row.sets} onClick={() => { setCurrentExercise((index) => index + 1); setRestSeconds(0); }}>Next exercise <ArrowRight size={15} /></button>
          : <button className="button button-lime" disabled={exerciseCompletedSets.length < row.sets} onClick={() => void onComplete(workout, tracking)}><Check size={15} />Finish workout</button>}
      </div>
      {workoutEvents.length > 0 && <label className="event-link-select">Link to a registered workout event<select value={eventRegistration} onChange={(event) => setEventRegistration(event.target.value)}><option value="">Personal workout</option>{workoutEvents.map((item) => <option key={item.id} value={item.id}>{item.event_title}</option>)}</select></label>}
      <p className="modal-footnote">Take your time. You can go back and change completed sets if needed.</p>
    </> : null}
  </Modal>;
}
export function ChallengeGoalOptions({ value, onChange, includeAll = false }: { value: string; onChange: (goal: string) => void; includeAll?: boolean }) {
  return <div className="challenge-goal-options" role="group" aria-label="Fitness goals">
    {includeAll && <button type="button" className={`challenge-goal-option ${value === "all" ? "selected" : ""}`} aria-pressed={value === "all"} onClick={() => onChange("all")}>All goals</button>}
    {CHALLENGE_GOALS.map((goal) => <button type="button" key={goal.value} className={`challenge-goal-option ${value === goal.value ? "selected" : ""}`} aria-pressed={value === goal.value} onClick={() => onChange(goal.value)}>{goal.label}</button>)}
  </div>;
}

export function challengeDaysLeft(challenge: Pick<ApiChallenge, "ends_at" | "starts_at" | "duration_days">): number {
  const endDate = challenge.ends_at
    ? new Date(`${challenge.ends_at}T00:00:00`)
    : challenge.starts_at
      ? new Date(new Date(`${challenge.starts_at}T00:00:00`).getTime() + (challenge.duration_days - 1) * 86400000)
      : null;
  if (!endDate || Number.isNaN(endDate.getTime())) return challenge.duration_days;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / 86400000) + 1);
}

export function ChallengeCard({ challenge, onView, onJoin }: { challenge: Challenge; onView: (challenge: Challenge) => void; onJoin: (challenge: Challenge) => void }) {
  const daysLeft = challengeDaysLeft(challenge);
  return <article className="challenge-card">
    <div className={`challenge-card-art challenge-tone-${challenge.id % 4}`}>
      {challenge.image ? <Image className="challenge-card-image" src={challenge.image} alt={`${challenge.title} challenge`} fill unoptimized /> : <span>{challenge.art}</span>}
      <div className="challenge-days">{daysLeft ? <>{daysLeft}<small>{daysLeft === 1 ? "DAY LEFT" : "DAYS LEFT"}</small></> : "Ended"}</div>
    </div>
    <div className="challenge-card-body">
      <div className="tag-row"><span className="challenge-points"><Zap size={13} fill="currentColor" />{challenge.points_per_completion} pts / day</span></div>
      <h3>{challenge.title}</h3><p>{challenge.description}</p>
      <div className="challenge-card-meta"><span><Users size={14} />{challenge.participant_count.toLocaleString()} joined</span><span><Activity size={14} />{challengeGoalLabel(challenge.goal)}</span></div>
      {challenge.joined && <div className="challenge-progress"><div className="progress-row"><span>YOUR PROGRESS</span><strong>{challenge.progress}%</strong></div><div className="progress-track"><span style={{ width: `${challenge.progress}%` }} /></div></div>}
      <div className="challenge-card-actions">
        <button className={`button ${challenge.joined ? "button-lime" : "button-dark"}`} onClick={() => challenge.joined ? onView(challenge) : onJoin(challenge)}>{challenge.joined ? <>View challenge <ArrowRight size={15} /></> : <>Join challenge <ArrowRight size={15} /></>}</button>
        {!challenge.joined && <button className="challenge-details-link" onClick={() => onView(challenge)}>Details</button>}
      </div>
    </div>
  </article>;
}

export function ChallengeDetailsDialog({ challenge, onClose, onJoin, onCompleteWorkout }: { challenge: Challenge; onClose: () => void; onJoin: (challenge: Challenge) => Promise<boolean>; onCompleteWorkout: (workout: Workout, challenge: Challenge, requirementId: number, tracking?: { progress_recorded: boolean; sets_completed?: number; weight_kg?: number }) => Promise<boolean> }) {
  const [selectedWorkout, setSelectedWorkout] = useState<{ workout: Workout; requirementId: number } | null>(null);
  const [completedRequirements, setCompletedRequirements] = useState<number[]>([]);
  const [progressLoaded, setProgressLoaded] = useState(!challenge.joined);
  const [joining, setJoining] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterPage, setRosterPage] = useState(1);
  const [roster, setRoster] = useState<{ count: number; results: ApiMember[] } | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [gpsTrackerRequirementId, setGpsTrackerRequirementId] = useState<number | null>(null);
  const { authenticated, notify } = usePrimeFit();
  const requirements = challenge.requirements ?? [];
  const gpsTrackerRequirement = requirements.find((requirement) => requirement.id === gpsTrackerRequirementId);
  const challengeStartDate = challenge.starts_at ? new Date(`${challenge.starts_at}T00:00:00Z`) : null;
  const calendarLeadingCells = challengeStartDate?.getUTCDay() ?? 0;
  const nextRequirementIndex = requirements.findIndex((requirement) => !completedRequirements.includes(requirement.id));

  useEffect(() => {
    let cancelled = false;
    if (!challenge.joined || !authenticated) return;
    apiRequest<{ completed: { requirement: number }[] }>(`/challenges/${challenge.id}/my_progress/`)
      .then((result) => {
        if (!cancelled) setCompletedRequirements(result.completed.map((item) => item.requirement));
      })
      .catch((error: unknown) => {
        if (!cancelled) notify(error instanceof Error ? error.message : "Could not load challenge progress.");
      })
      .finally(() => { if (!cancelled) setProgressLoaded(true); });
    return () => { cancelled = true; };
  }, [authenticated, challenge.id, challenge.joined, notify]);

  useEffect(() => {
    let cancelled = false;
    if (!rosterOpen) return;
    apiRequest<{ count: number; results: ApiMember[] }>(`/challenges/${challenge.id}/members/?page=${rosterPage}`)
      .then((result) => {
        if (!cancelled) { setRoster(result); setRosterError(""); }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRosterError(error instanceof Error ? error.message : "Could not load challenge members.");
          notify(error instanceof Error ? error.message : "Could not load challenge members.");
        }
      });
    return () => { cancelled = true; };
  }, [challenge.id, notify, rosterOpen, rosterPage]);

  async function join() {
    setJoining(true);
    try {
      if (await onJoin(challenge)) setProgressLoaded(true);
    } finally {
      setJoining(false);
    }
  }

  async function finishWorkout(workout: Workout, tracking?: { progress_recorded: boolean; sets_completed?: number; weight_kg?: number }) {
    if (!selectedWorkout) return false;
    const saved = await onCompleteWorkout(workout, challenge, selectedWorkout.requirementId, tracking);
    if (saved) {
      setCompletedRequirements((current) => [...current, selectedWorkout.requirementId]);
      setSelectedWorkout(null);
    }
    return saved;
  }

  function continueChallenge() {
    if (!progressLoaded) return;
    if (nextRequirementIndex < 0) {
      notify("You’ve completed every day of this challenge.");
      return;
    }
    const requirement = requirements[nextRequirementIndex];
    setSelectedDayIndex(nextRequirementIndex);
    if (requirement.activity_type === "workout" && requirement.workout_details) {
      setSelectedWorkout({ workout: mapWorkout(requirement.workout_details), requirementId: requirement.id });
      return;
    }
    const scheduledDate = challengeStartDate
      ? new Date(challengeStartDate.getTime() + nextRequirementIndex * 86400000)
      : null;
    if (scheduledDate?.toDateString() === new Date().toDateString()) {
      setGpsTrackerRequirementId(requirement.id);
    } else {
      notify("This GPS activity can only be started on its scheduled day.");
    }
  }

  function closeDialog() {
    if (gpsTrackerRequirementId !== null) {
      setGpsTrackerRequirementId(null);
      return;
    }
    onClose();
  }

  return <>
    <Modal
      title={gpsTrackerRequirement
        ? `Day ${gpsTrackerRequirement.day_number} ${gpsTrackerRequirement.activity_type === "running" ? "run" : "ride"}`
        : challenge.title}
      eyebrow={gpsTrackerRequirement ? "GPS CHALLENGE TRACKER" : `${challenge.duration_days} DAY CHALLENGE`}
      onClose={closeDialog}
      className={`challenge-detail-modal ${gpsTrackerRequirement ? "gps-challenge-dialog" : ""}`}
    >
      {gpsTrackerRequirement && gpsTrackerRequirement.activity_type !== "workout" && challenge.joined
        ? <GpsChallengeTracker
          activityType={gpsTrackerRequirement.activity_type}
          challengeId={challenge.id}
          requirementId={gpsTrackerRequirement.id}
          onComplete={() => {
            setCompletedRequirements((current) => [...current, gpsTrackerRequirement.id]);
            setGpsTrackerRequirementId(null);
          }}
        />
        : <>
      <p className="modal-intro">{challenge.description}</p>
      {challenge.rules && <p className="challenge-rules">{challenge.rules}</p>}
      <div className="challenge-detail-summary"><button className="challenge-participant-count" onClick={() => { setRosterOpen((open) => !open); setRosterPage(1); }}><strong>{challenge.participant_count}</strong> members joined <span>View all</span></button><span><strong>{challenge.points_per_completion}</strong> points per day</span></div>
      {!challenge.joined && <p className="challenge-registration-hint">Your account name and email will be prefilled. Add any missing contact details, then continue to payment if this challenge has a fee.</p>}
      <button
        className="button button-lime button-full"
        onClick={() => challenge.joined ? continueChallenge() : void join()}
        disabled={joining || (challenge.joined && !progressLoaded)}
      >
        {joining ? "Opening registration…" : challenge.joined ? progressLoaded ? "Continue challenge" : "Loading progress…" : "Join & register"}
        <ArrowRight size={15} />
      </button>
      {rosterOpen && <section className="challenge-detail-members"><div className="challenge-roster-heading"><h3><Users size={16} /> All members ({challenge.participant_count})</h3><button className="text-action" onClick={() => setRosterOpen(false)}>Close</button></div>{rosterError ? <p className="member-empty">{rosterError}</p> : roster?.results.length ? <><div className="challenge-member-list">{roster.results.map((member) => <Link className="challenge-member" key={member.id} href={`/members/${member.id}`}><Avatar name={member.name} small photo={member.photo} /><span><strong>{member.name}</strong><small>{member.location || member.fitness_level}</small></span></Link>)}</div><div className="roster-pagination"><button className="button button-outline" disabled={rosterPage <= 1} onClick={() => setRosterPage((page) => page - 1)}>Previous</button><span>Page {rosterPage} of {Math.max(1, Math.ceil(roster.count / 20))}</span><button className="button button-outline" disabled={rosterPage >= Math.ceil(roster.count / 20)} onClick={() => setRosterPage((page) => page + 1)}>Next</button></div></> : <p className="member-empty">{roster ? "No members have joined yet. Be the first!" : "Loading members…"}</p>}</section>}
      <section className="challenge-detail-workouts"><h3>Challenge schedule</h3>{requirements.length ? <>
        <div className="challenge-month-calendar challenge-view-calendar">
          <header className="challenge-month-calendar-header"><div><h3>Challenge schedule</h3><span>{challengeStartDate ? `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(challengeStartDate)} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(challengeStartDate.getTime() + (challenge.duration_days - 1) * 86400000))}` : `${requirements.length} scheduled days`}</span></div></header>
          <div className="challenge-month-grid challenge-view-calendar-grid" role="group" aria-label="Scheduled challenge workouts">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => <span className="challenge-month-weekday" key={weekday}>{weekday}</span>)}
            {Array.from({ length: calendarLeadingCells }, (_, index) => <span className="challenge-month-empty" key={`calendar-empty-${index}`} />)}
            {requirements.map((requirement, index) => {
              const scheduledDate = challengeStartDate ? new Date(challengeStartDate.getTime() + index * 86400000) : null;
              const complete = completedRequirements.includes(requirement.id);
              return <button type="button" key={requirement.id} aria-label={`Start day ${requirement.day_number}: ${requirement.workout_title || requirement.activity_type}`} aria-pressed={index === selectedDayIndex} className={`challenge-month-date challenge-view-date has-challenge-day ${index === selectedDayIndex ? "selected" : ""} ${complete ? "is-complete" : ""}`} onClick={() => {
                setSelectedDayIndex(index);
                if (!challenge.joined || !progressLoaded || complete) return;
                if (requirement.activity_type === "workout" && requirement.workout_details) {
                  setSelectedWorkout({ workout: mapWorkout(requirement.workout_details), requirementId: requirement.id });
                  return;
                }
                const isScheduledToday = scheduledDate?.toDateString() === new Date().toDateString();
                if (isScheduledToday) setGpsTrackerRequirementId(requirement.id);
                else notify("GPS activities can only be started on their scheduled day.");
              }}>
                <span className="challenge-month-date-number">{scheduledDate ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(scheduledDate) : `#${requirement.day_number}`}</span><small>DAY {requirement.day_number}</small><span className="challenge-view-date-title">{requirement.activity_type === "workout" ? requirement.workout_title : requirement.activity_type === "running" ? "GPS run" : "GPS ride"}</span><i className={complete ? "calendar-day-indicator-ready" : ""} />
              </button>;
            })}
          </div>
          <div className="challenge-calendar-legend"><span><i /> Scheduled activity</span><span><i className="legend-ready" /> Day complete</span></div>
        </div>
      </> : <p className="member-empty">This challenge has no scheduled workouts yet.</p>}</section>
        </>}
    </Modal>
    {selectedWorkout && <WorkoutDialog workout={selectedWorkout.workout} onClose={() => setSelectedWorkout(null)} onComplete={finishWorkout} />}
  </>;
}
export function PostCard({ post, onLike, onComment }: { post: FeedPost; onLike: () => void; onComment?: () => void }) {
  return <article className="post-card"><div className="post-top"><Avatar name={post.author.name} photo={post.author.photo} /><div className="post-author"><Link className="post-member-link" href={`/members/${post.author.id}`}><strong>{post.author.name}<span className="verified"><Check size={9} /></span></strong></Link><small>{post.author.location || "PrimeFit member"} <i>·</i> {post.time}</small></div><button className="dots-button" aria-label="Post actions"><MoreHorizontal size={18} /></button></div><p className="post-body">{post.body}</p>{post.image && <Image className="community-image" src={post.image} width={800} height={600} unoptimized alt="Image shared with this workout update" />}<div className="post-actions"><button aria-label="Like post" className={`post-action ${post.reacted_by_me ? "is-liked" : ""}`} onClick={onLike}><Heart size={17} fill={post.reacted_by_me ? "currentColor" : "none"} />{post.reaction_count}</button><button aria-label="View comments" className="post-action" onClick={onComment}><MessageCircle size={17} />{post.comments.length}</button></div></article>;
}
export function Leaderboard() {
  const { profile, authenticated } = usePrimeFit();
  const [scope, setScope] = useState<"area" | "city" | "country">("city");
  const [members, setMembers] = useState<(Member & { point_sources?: { challenge_id: number | null; name: string; points: number }[] })[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ scope });
    if (scope === "area" && profile.area) query.set("location", profile.area);
    if (scope === "city" && profile.city) query.set("location", profile.city);
    if (scope === "country" && profile.country) query.set("location", profile.country);
    apiList<Member & { point_sources?: { challenge_id: number | null; name: string; points: number }[] }>(`/leaderboard/?${query}`).then((items) => {
      if (!cancelled) { setMembers(items); setError(""); }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the leaderboard.");
    });
    return () => { cancelled = true; };
  }, [scope, profile.area, profile.city, profile.country]);
  return <section className="side-card leaderboard-card"><div className="side-card-header"><div><span className="eyebrow">{scope.toUpperCase()} · ACTIVE CHALLENGE POINTS</span><h3>Challenge leaderboard</h3></div></div>{authenticated && <div className="leader-tabs">{(["area", "city", "country"] as const).map((value) => <button key={value} className={`leader-tab ${scope === value ? "active" : ""}`} onClick={() => setScope(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>}<div className="leader-list">{members.map((member, index) => <Link className="leader-row leader-link" key={member.id} href={`/members/${member.id}`}><span className={`rank ${index === 0 ? "rank-gold" : index === 1 ? "rank-silver" : index === 2 ? "rank-bronze" : ""}`}>{String(index + 1).padStart(2, "0")}</span><Avatar name={member.name} small photo={member.photo} /><span className="leader-person"><strong>{member.name}</strong><small>{member.fitness_level} · {member.location}</small>{member.point_sources?.slice(0, 2).map((source) => <small key={source.challenge_id ?? "other"}>{source.name}: {source.points} pts</small>)}</span><span className="leader-points">{member.points.toLocaleString()}<small>pts</small></span></Link>)}</div>{error ? <p className="member-empty">{error}</p> : !members.length && <p className="member-empty">No active challenge participants yet.</p>}<Link className="leader-full" href="/challenges">View challenges <ArrowRight size={15} /></Link></section>;
}
export function Modal({ title, eyebrow, children, onClose, className = "" }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; className?: string }) {
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onClose]);
  return <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-topline"><span className="eyebrow">{eyebrow}</span><button onClick={onClose} className="modal-close" aria-label="Close dialog"><X size={19} /></button></div><h2>{title}</h2>{children}</section></div>;
}
export function ComposeCard({ name, onClick }: { name: string; onClick: () => void }) { return <button className="compose-prompt" onClick={onClick}><Avatar name={name} small /><span>Share a win, a thought, or a little encouragement...</span><span className="compose-plus"><Sparkles size={16} /></span></button>; }
export function StatCard({ icon, label, value, change, tone }: { icon: ReactNode; label: string; value: string; change: string; tone: string }) { return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-change"><Flame size={12} />{change}</span></div>; }
export function ActivityChart({ weeklyActivity }: { weeklyActivity: { weekday: string; count: number; is_today: boolean }[] }) {
  const { authenticated } = usePrimeFit();
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const days = weeklyActivity.length ? weeklyActivity : ["M", "T", "W", "T", "F", "S", "S"].map((weekday) => ({ weekday, count: 0, is_today: false }));
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const linePoints = days.map((day, index) => `${days.length === 1 ? 50 : 7 + index * 86 / (days.length - 1)},${90 - day.count / maxCount * 70}`).join(" ");
  return <div className="side-card week-card"><div className="side-card-header"><div><span className="eyebrow">YOUR ACTIVITY</span><h3>This week</h3></div></div><div className="chart-style-tabs" role="group" aria-label="Choose chart style">{(["bar", "line"] as const).map((type) => <button type="button" aria-pressed={chartType === type} className={chartType === type ? "active" : ""} key={type} onClick={() => setChartType(type)}>{type === "bar" ? "Bar chart" : "Line chart"}</button>)}</div><div className={`week-chart ${chartType === "line" ? "week-chart-line" : ""}`}><div className="chart-grid"><span /><span /><span /></div>{chartType === "line" && <svg className="activity-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={linePoints} />{days.map((day, index) => <circle key={`${day.weekday}-${index}`} cx={days.length === 1 ? 50 : 7 + index * 86 / (days.length - 1)} cy={90 - day.count / maxCount * 70} r="2.5" />)}</svg>}{days.map((day, index) => <div className="chart-column" key={`${day.weekday}-${index}`}><div className={`chart-bar ${day.count ? "chart-done" : ""} ${day.is_today ? "chart-today" : ""}`} style={{ height: `${day.count ? Math.max(7, day.count / maxCount * 100) : 0}%` }}>{day.is_today && <i />}</div><span>{day.weekday}</span></div>)}</div><div className="week-footer"><span><i /> Activity</span><strong>{total} this week</strong></div>{!total && <p className="member-empty">{authenticated ? "Your activity will appear here." : "Sign in to see your activity."}</p>}</div>;
}
export function PostComposer({ onPublish }: { onPublish: (body: string, image?: File) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { profile } = usePrimeFit();
  const previewUrl = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);
  function chooseImage(file?: File) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrl.current);
    setImage(file);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await onPublish(body, image)) { setBody(""); chooseImage(); setOpen(false); }
  }
  return <>{!open ? <button className="compose-prompt" onClick={() => setOpen(true)}><Avatar name={profile.display_name || "You"} photo={profile.photo} small /><span>Create a post</span><span className="compose-plus"><Sparkles size={16} /></span></button> : <form className="post-composer-form side-card instagram-composer" onSubmit={(event) => void submit(event)}>
    <div className="post-composer-header"><Avatar name={profile.display_name || "You"} photo={profile.photo} small /><span><strong>{profile.display_name || "Your community"}</strong><small>Share an update with your community</small></span></div>
    <textarea rows={4} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a caption..." required />
    {preview && <div className="composer-preview"><Image src={preview} alt="Selected post preview" width={800} height={500} unoptimized /><button type="button" onClick={() => chooseImage()} aria-label="Remove selected photo"><X size={15} /></button></div>}
    <div className="composer-controls"><label className="upload-image">Add photo<input type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} /></label><span>{image?.name ?? `${body.length}/1000`}</span><div className="composer-actions"><button className="button button-outline" type="button" onClick={() => { setOpen(false); setBody(""); chooseImage(); }}>Cancel</button><button className="button button-dark" type="submit">Post <ArrowRight size={14} /></button></div></div>
  </form>}</>;
}
