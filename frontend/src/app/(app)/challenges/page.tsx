"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Trophy, Users } from "lucide-react";
import { ChallengeCard, ChallengeDetailsDialog, ChallengeGoalOptions, Leaderboard, SectionHeading } from "@/components/product-ui";
import { Challenge, Workout } from "@/lib/primefit-types";
import { usePrimeFit } from "@/providers/app-provider";

export default function ChallengesPage() {
  const { challenges, authenticated, completeWorkout, completeChallengeDay } = usePrimeFit();
  const [goal, setGoal] = useState("all");
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const router = useRouter();
  const filtered = useMemo(() => challenges.filter((item) => goal === "all" || item.goal === goal), [challenges, goal]);

  function join(challenge: Challenge) {
    const registrationPath = `/challenges/${challenge.id}/register`;
    router.push(authenticated ? registrationPath : `/login?mode=register&role=member&next=${encodeURIComponent(registrationPath)}`);
  }

  async function completeWorkoutForChallenge(workout: Workout, challenge: Challenge, requirementId: number, tracking?: { progress_recorded: boolean; sets_completed?: number; weight_kg?: number }) {
    if (!authenticated) { router.push("/login?next=/challenges"); return false; }
    if (!await completeWorkout(workout, tracking)) return false;
    return completeChallengeDay(challenge, requirementId);
  }

  return <>
    <div className="page-intro"><span className="eyebrow">BETTER, TOGETHER</span><h1>Choose a <em>challenge.</em></h1><p>Pick a goal that feels right. We’ll take it one day at a time.</p></div>
    <div className="challenge-summary"><div><span className="challenge-summary-icon"><Trophy size={18} /></span><span><strong>{challenges.length} open challenges</strong><small>Programs built around real fitness goals</small></span></div><div><span className="challenge-summary-icon peach-icon"><Users size={18} /></span><span><strong>{challenges.reduce((total, item) => total + item.participant_count, 0).toLocaleString()} members in motion</strong><small>Find your people and keep going</small></span></div><span className="challenge-summary-spark"><Sparkles size={20} /></span></div>
    <ChallengeGoalOptions value={goal} onChange={setGoal} includeAll />
    <div className="challenges-layout"><aside><Leaderboard /><div className="side-card challenge-note"><span className="eyebrow">HOW POINTS WORK</span><h3>Clear rules. Fair play.</h3><p>Complete the scheduled workout once to earn the points shown on each challenge. A daily requirement can only score once.</p></div></aside><section><SectionHeading eyebrow={`${filtered.length} PROGRAMS · SIMPLE DAILY WINS`} title="Find your next goal" />{filtered.length ? <div className="challenge-grid">{filtered.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} onView={setSelectedChallenge} onJoin={join} />)}</div> : <div className="empty-state"><Trophy size={24} /><h3>No challenges match yet</h3><p>Try another fitness goal.</p></div>}</section></div>
    {selectedChallenge && <ChallengeDetailsDialog challenge={challenges.find((item) => item.id === selectedChallenge.id) ?? selectedChallenge} onClose={() => setSelectedChallenge(null)} onJoin={async (challenge) => { join(challenge); return false; }} onCompleteWorkout={completeWorkoutForChallenge} />}
  </>;
}
