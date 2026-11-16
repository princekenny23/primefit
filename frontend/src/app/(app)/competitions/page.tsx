"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, Flag, Medal, Trophy, UsersRound } from "lucide-react";
import Link from "next/link";
import { apiList, apiRequest } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

type Competition = {
  id: number;
  title: string;
  description: string;
  rules: string;
  starts_on: string;
  ends_on: string;
  eligible_activity_types: string[];
  scoring_mode: "activity_count" | "distance_km" | "duration_minutes";
  min_team_size: number;
  max_team_size: number | null;
  team_count: number;
  entered_team_ids: number[];
};
type Team = { id: number; name: string; member_count: number; is_captain: boolean };
type MemberContribution = { member: { id: number; name: string }; activity_count: number; distance_km: number; duration_minutes: number; score: number };
type Standing = { rank: number; team_id: number; team_name: string; score: number; activity_count: number; members: MemberContribution[] };
type StandingsResponse = { scoring_mode: string; verified_activities_only: boolean; standings: Standing[] };

const metricLabel = (mode: Competition["scoring_mode"]) =>
  mode === "activity_count" ? "verified activities" : mode === "distance_km" ? "verified km" : "verified minutes";

export default function CompetitionsPage() {
  const { authenticated, role, notify } = usePrimeFit();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<Record<number, Standing[]>>({});
  const [selectedTeams, setSelectedTeams] = useState<Record<number, number | "">>({});
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [competitionRows, teamRows] = await Promise.all([
      apiList<Competition>("/competitions/"),
      apiList<Team>("/teams/"),
    ]);
    setCompetitions(competitionRows);
    setTeams(teamRows);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiList<Competition>("/competitions/"),
      apiList<Team>("/teams/"),
    ]).then(([competitionRows, teamRows]) => {
      if (!active) return;
      setCompetitions(competitionRows);
      setTeams(teamRows);
    }).catch((error) => notify(error instanceof Error ? error.message : "Could not load competitions."));
    return () => { active = false; };
  }, [notify]);
  const captainTeams = teams.filter((team) => team.is_captain);

  async function createCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const eligible = data.getAll("eligible_activity_types").map(String);
    setBusy(true);
    try {
      await apiRequest("/competitions/", { method: "POST", body: JSON.stringify({
        title: data.get("title"),
        description: data.get("description"),
        rules: data.get("rules"),
        starts_on: data.get("starts_on"),
        ends_on: data.get("ends_on"),
        eligible_activity_types: eligible,
        scoring_mode: data.get("scoring_mode"),
        min_team_size: Number(data.get("min_team_size")),
        max_team_size: data.get("max_team_size") ? Number(data.get("max_team_size")) : null,
      }) });
      form.reset();
      await refresh();
      notify("Competition is open for team registration.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create the competition."); }
    finally { setBusy(false); }
  }

  async function enterCompetition(competition: Competition) {
    const teamId = selectedTeams[competition.id];
    if (!teamId) { notify("Choose one of your teams first."); return; }
    try {
      await apiRequest(`/competitions/${competition.id}/join/`, { method: "POST", body: JSON.stringify({ team_id: teamId }) });
      await refresh();
      notify("Your team is entered in the competition.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not enter your team."); }
  }

  async function loadStandings(competition: Competition) {
    try {
      const result = await apiRequest<StandingsResponse>(`/competitions/${competition.id}/standings/`);
      setStandings((current) => ({ ...current, [competition.id]: result.standings }));
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load standings."); }
  }

  async function withdraw(competition: Competition, teamId: number) {
    try {
      await apiRequest(`/competitions/${competition.id}/leave/`, { method: "POST", body: JSON.stringify({ team_id: teamId }) });
      await refresh();
      notify("Team entry withdrawn.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not withdraw the team."); }
  }

  return <>
    <div className="page-intro"><span className="eyebrow">TEAM VS TEAM</span><h1>Earn your <em>place.</em></h1><p>Enter your crew, compete by clear rules, and let verified activities decide the rankings.</p></div>
    <nav className="event-type-tabs competition-type-tabs" aria-label="Event category"><Link href="/events">Activities</Link><Link href="/competitions" aria-current="page" className="active">Competitions</Link></nav>
    {!authenticated && <div className="side-card teams-signin">Sign in and create or join a team to enter a competition. You can browse standings without an account.</div>}
    {authenticated && role === "trainer" && <section className="side-card competition-create-card"><div className="section-heading"><div><span className="eyebrow">SET THE RULES</span><h2>Create a competition</h2></div><Flag size={19} /></div><form className="stack-form competition-form" onSubmit={createCompetition}>
      <label>Competition name<input name="title" maxLength={140} required /></label><label>Description<textarea name="description" rows={2} required /></label><label>Scoring rules<textarea name="rules" rows={2} placeholder="Explain scoring, tie-breaks, and participant requirements." required /></label>
      <div className="trainer-form-row"><label>Starts<input name="starts_on" type="date" required /></label><label>Ends<input name="ends_on" type="date" required /></label></div>
      <div className="trainer-form-row"><label>Scoring<select name="scoring_mode"><option value="activity_count">Number of verified activities</option><option value="distance_km">Verified distance (km)</option><option value="duration_minutes">Verified duration (minutes)</option></select></label><label>Minimum team size<input name="min_team_size" type="number" min="1" defaultValue="1" required /></label></div>
      <label>Maximum team size (optional)<input name="max_team_size" type="number" min="1" /></label>
      <fieldset className="competition-activity-options"><legend>Eligible activities</legend>{["running", "cycling", "hiking", "walking", "other"].map((item) => <label key={item}><input type="checkbox" name="eligible_activity_types" value={item} defaultChecked={item === "running"} />{item}</label>)}</fieldset>
      <button className="button button-dark" disabled={busy}>{busy ? "Creating…" : "Open competition"}<ArrowRight size={15} /></button>
    </form></section>}
    <div className="section-heading"><div><span className="eyebrow">{competitions.length} OPEN COMPETITIONS</span><h2>Find your next rivalry</h2></div></div>
    {competitions.length ? <div className="competition-list">{competitions.map((competition) => {
      const entered = competition.entered_team_ids;
      const availableTeams = captainTeams.filter((team) => !entered.includes(team.id));
      const selectedTeam = selectedTeams[competition.id] || "";
      const rows = standings[competition.id];
      return <article className="side-card competition-card" key={competition.id}>
        <div className="competition-card-head"><span className="competition-mark"><Trophy size={20} /></span><span className="eyebrow">{competition.starts_on} — {competition.ends_on}</span><span className="competition-team-count"><UsersRound size={14} />{competition.team_count} teams</span></div>
        <h3>{competition.title}</h3><p>{competition.description}</p><div className="competition-rules"><strong>Scoring: {metricLabel(competition.scoring_mode)}</strong><span>Activities: {competition.eligible_activity_types.join(", ")}</span><span>Team size: {competition.min_team_size}{competition.max_team_size ? `–${competition.max_team_size}` : "+"}</span><p>{competition.rules}</p></div>
        {entered.length ? <div className="competition-entered"><Medal size={15} />Your team is entered{entered.map((teamId) => <button className="text-action" key={teamId} onClick={() => void withdraw(competition, teamId)}>Withdraw</button>)}</div>
          : availableTeams.length > 0 && <div className="competition-entry-controls"><select aria-label={`Choose team for ${competition.title}`} value={selectedTeam} onChange={(event) => setSelectedTeams((current) => ({ ...current, [competition.id]: event.target.value ? Number(event.target.value) : "" }))}><option value="">Choose your team…</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.member_count} members</option>)}</select><button className="button button-dark" onClick={() => void enterCompetition(competition)}>Enter team</button></div>}
        <button className="text-action competition-standings-button" onClick={() => void loadStandings(competition)}>View verified standings <ArrowRight size={14} /></button>
        {rows && <div className="standings-table"><div className="standings-heading"><span>Rank</span><span>Team</span><span>Score</span></div>{rows.length ? rows.map((row) => <details className="standing-row" key={row.team_id}><summary><span>#{row.rank}</span><strong>{row.team_name}</strong><span>{row.score} <small>{metricLabel(competition.scoring_mode)}</small></span></summary><div className="standing-contributions">{row.members.length ? row.members.map((member) => <div key={member.member.id}><span>{member.member.name}</span><span>{member.score} {metricLabel(competition.scoring_mode)} · {member.activity_count} activities</span></div>) : <small>No verified activities yet.</small>}</div></details>) : <p className="standings-empty">No teams have entered yet.</p>}</div>}
      </article>;
    })}</div> : <div className="empty-state"><Flag size={24} /><h3>No competitions open</h3><p>Competitions will show here when an authorized organizer creates one.</p></div>}
  </>;
}
