"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Dumbbell, Sparkles, Trophy, Users, Zap } from "lucide-react";
import { ActivityChart, challengeDaysLeft, ComposeCard, Leaderboard, PostCard, SectionHeading, StatCard } from "@/components/product-ui";
import { usePrimeFit } from "@/providers/app-provider";

export default function HomePage() {
  const { challenges, posts, points, workoutCount, completedChallengeCount, weeklyActivity, authenticated, toggleReaction, loading } = usePrimeFit();
  const router = useRouter();
  const activeChallenges = authenticated ? challenges.filter((item) => item.joined) : [];
  const displayPosts = posts.slice(0, 2);
  return <>
    <section className="hero-card">
      <div className="hero-copy">
        <span className="hero-kicker"><Sparkles size={14} /> YOUR JOURNEY, YOUR PACE</span>
        <h2>Work Out Together.<br /><em>Grow Stronger Together.</em></h2>
        <p>Small, steady steps turn into something<br className="desktop-only" /> amazing. Let’s make today count.</p>
        <button className="button button-lime" onClick={() => router.push("/challenges")}>Explore challenges <ArrowRight size={16} /></button>
        <div className="hero-proof"><span><strong>Every member starts somewhere.</strong> Find a pace that works for you.</span></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-sun" /><div className="hero-person">🏃🏾‍♀️</div><div className="hero-float float-top"><span><b>Keep your rhythm</b><small>One day at a time</small></span></div><div className="hero-float float-bottom"><span className="float-tick"><CheckCircle2 size={13} /></span><span><b>One workout at a time</b><small>That’s how it’s done</small></span></div><span className="hero-sparkle spark-a">✳</span><span className="hero-sparkle spark-b">✦</span></div>
      <div className="hero-bottom-label"><span>01</span> FIND YOUR REASON <i /> MOVE WITH PURPOSE</div>
    </section>
    {authenticated && <div className="stats-row">
        <StatCard icon={<Zap size={17} />} label="YOUR POINTS" value={points.toLocaleString()} change="earned so far" tone="lime" />
        <StatCard icon={<Dumbbell size={17} />} label="WORKOUTS DONE" value={String(workoutCount).padStart(2, "0")} change="every effort counts" tone="peach" />
        <StatCard icon={<Users size={17} />} label="ACTIVE CHALLENGES" value={String(challenges.filter((item) => item.joined).length)} change="your current goals" tone="lavender" />
        <StatCard icon={<Trophy size={17} />} label="CHALLENGES DONE" value={String(completedChallengeCount)} change="milestones reached" tone="mint" />
    </div>}
    <div className="dashboard-grid">
      <div className="dashboard-main-column">
        <section className="challenge-section">
          <SectionHeading eyebrow="SHOW UP, GROW STRONG" title={activeChallenges.length > 1 ? "Your challenges" : "Your challenge"} action="All challenges" href="/challenges" />
          {activeChallenges.length ? <div className="active-challenges-list">{activeChallenges.map((challenge) => {
            const daysLeft = challengeDaysLeft(challenge);
            return <div className="challenge-feature" key={challenge.id}><div className="challenge-art"><span>{challenge.art}</span><div className="challenge-level"><span className="live-dot" /> IN PROGRESS</div><div className="challenge-index">{daysLeft ? `${daysLeft} DAYS LEFT` : "ENDED"}</div></div><div className="challenge-content"><div className="challenge-head"><div><span className="eyebrow">YOUR ACTIVE CHALLENGE</span><h3>{challenge.title}</h3></div><span className="challenge-points"><Zap size={14} fill="currentColor" />{challenge.points_per_completion} pts</span></div><p>{challenge.description}</p><div className="progress-row"><span>YOUR PROGRESS</span><strong>{challenge.progress}%</strong></div><div className="progress-track"><span style={{ width: `${challenge.progress}%` }} /></div><div className="challenge-footer"><span><Users size={15} />{challenge.participant_count.toLocaleString()} members</span><button className="button button-lime" onClick={() => router.push("/challenges")}><ArrowRight size={16} />View challenge workouts</button></div></div></div>;
          })}</div> : <div className="empty-state"><Trophy size={24} /><h3>No active challenge</h3><p>Browse the challenge list and join one when you’re ready.</p><button className="text-action" onClick={() => router.push("/challenges")}>Explore challenges <ArrowRight size={14} /></button></div>}
        </section>
        <section className="community-section">
          <SectionHeading eyebrow="ONE COMMUNITY, EVERY WIN" title="Moving together" action="See all" href="/community" />
          <ComposeCard onClick={() => router.push(authenticated ? "/community" : "/login?next=/community")} name={authenticated ? "You" : "Member"} />
          {displayPosts.map((post) => <PostCard key={post.id} post={post} onLike={() => void toggleReaction(post)} onComment={() => router.push("/community")} />)}
          {!displayPosts.length && <div className="empty-state"><Users size={24} /><h3>No community updates yet</h3><p>Updates from members will show here.</p></div>}
        </section>
      </div>
      <aside className="dashboard-side-column">
        <Leaderboard />
        <ActivityChart weeklyActivity={weeklyActivity} />
      </aside>
    </div>
    {loading && <div className="page-loading"><span />Loading your PrimeFit space…</div>}
  </>;
}
