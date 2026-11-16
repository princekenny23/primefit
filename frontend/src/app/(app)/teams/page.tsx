"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Check, Crown, MapPin, Plus, UsersRound, X } from "lucide-react";
import { apiList, apiRequest } from "@/lib/api";
import { usePrimeFit } from "@/providers/app-provider";

type Team = {
  id: number;
  name: string;
  description: string;
  logo: string | null;
  city: string;
  country: string;
  captain_name: string;
  member_count: number;
  is_member: boolean;
  is_captain: boolean;
  membership_status: "none" | "member" | "requested" | "invited";
};
type JoinRequest = { id: number; user: { id: number; name: string; username: string } };
type Membership = { user: { id: number; name: string; username: string }; role: "captain" | "member" };
type Invitation = { id: number; team: number; team_name: string; status: string };

export default function TeamsPage() {
  const { authenticated, notify } = usePrimeFit();
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [requests, setRequests] = useState<Record<number, JoinRequest[]>>({});
  const [members, setMembers] = useState<Record<number, Membership[]>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [teamRows, inviteRows] = await Promise.all([
      apiList<Team>("/teams/"),
      authenticated ? apiList<Invitation>("/team-invitations/") : Promise.resolve([]),
    ]);
    setTeams(teamRows);
    setInvitations(inviteRows.filter((item) => item.status === "pending"));
  }, [authenticated]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiList<Team>("/teams/"),
      authenticated ? apiList<Invitation>("/team-invitations/") : Promise.resolve([]),
    ]).then(([teamRows, inviteRows]) => {
      if (!active) return;
      setTeams(teamRows);
      setInvitations(inviteRows.filter((item) => item.status === "pending"));
    }).catch((error) => notify(error instanceof Error ? error.message : "Could not load teams."));
    return () => { active = false; };
  }, [authenticated, notify]);

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = new FormData();
    ["name", "description", "city", "country"].forEach((key) => payload.set(key, String(values.get(key) || "")));
    const logo = values.get("logo");
    if (logo instanceof File && logo.size) payload.set("logo", logo);
    setBusy(true);
    try {
      await apiRequest<Team>("/teams/", { method: "POST", body: payload });
      form.reset();
      setCreateOpen(false);
      await refresh();
      notify("Your team is ready.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create the team."); }
    finally { setBusy(false); }
  }

  async function joinTeam(team: Team) {
    if (!authenticated) { notify("Sign in to request to join a team."); return; }
    try {
      await apiRequest(`/teams/${team.id}/join/`, { method: "POST", body: "{}" });
      await refresh();
      notify(`Join request sent to ${team.name}.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not request team membership."); }
  }

  async function respondToInvite(invitation: Invitation, decision: "accept" | "decline") {
    try {
      await apiRequest(`/team-invitations/${invitation.id}/${decision}/`, { method: "POST", body: "{}" });
      await refresh();
      notify(decision === "accept" ? `You joined ${invitation.team_name}.` : "Invitation declined.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not respond to the invitation."); }
  }

  async function openTeam(team: Team) {
    if (expanded === team.id) { setExpanded(null); return; }
    setExpanded(team.id);
    if (!team.is_member) return;
    try {
      const roster = await apiRequest<Membership[]>(`/teams/${team.id}/members/`);
      setMembers((current) => ({ ...current, [team.id]: roster }));
      if (team.is_captain) {
        const pending = await apiRequest<JoinRequest[]>(`/teams/${team.id}/requests/`);
        setRequests((current) => ({ ...current, [team.id]: pending }));
      }
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load team details."); }
  }

  async function reviewRequest(team: Team, request: JoinRequest, decision: "approve_request" | "reject_request") {
    try {
      await apiRequest(`/teams/${team.id}/${decision}/`, { method: "POST", body: JSON.stringify({ request_id: request.id }) });
      const [roster, pending] = await Promise.all([
        apiRequest<Membership[]>(`/teams/${team.id}/members/`),
        apiRequest<JoinRequest[]>(`/teams/${team.id}/requests/`),
      ]);
      setMembers((current) => ({ ...current, [team.id]: roster }));
      setRequests((current) => ({ ...current, [team.id]: pending }));
      await refresh();
      notify(decision === "approve_request" ? `${request.user.name} joined the team.` : "Join request declined.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not review the join request."); }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>, team: Team) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = new FormData(form).get("username");
    try {
      await apiRequest(`/teams/${team.id}/invite/`, { method: "POST", body: JSON.stringify({ username }) });
      form.reset();
      notify("Team invitation sent.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not send the invitation."); }
  }

  async function leaveTeam(team: Team) {
    try {
      await apiRequest(`/teams/${team.id}/leave/`, { method: "POST", body: "{}" });
      await refresh();
      setExpanded(null);
      notify("You left the team.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not leave the team."); }
  }

  async function appointCaptain(team: Team, userId: number) {
    try {
      await apiRequest(`/teams/${team.id}/set_captain/`, { method: "POST", body: JSON.stringify({ user_id: userId }) });
      await refresh();
      setExpanded(null);
      notify("Team captain updated.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not update the team captain."); }
  }

  return <>
    <div className="teams-title-row"><div className="page-intro"><span className="eyebrow">FIND YOUR PEOPLE</span><h1>Better <em>together.</em></h1><p>Discover local teams, meet your next training crew, or build a team of your own.</p></div>{authenticated && <button className="button button-dark" onClick={() => setCreateOpen(true)}><Plus size={16} />Create a team</button>}</div>
    {!authenticated && <div className="side-card teams-signin">Sign in to create a team, request to join, or respond to invitations.</div>}
    {createOpen && <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCreateOpen(false); }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="create-team-title"><div className="modal-topline"><span className="eyebrow">START A CREW</span><button type="button" onClick={() => setCreateOpen(false)} className="modal-close" aria-label="Close" disabled={busy}><X size={18} /></button></div><h2 id="create-team-title">Create a team</h2><form className="stack-form team-create-form" onSubmit={createTeam}><label>Team name<input name="name" maxLength={100} required /></label><label>About your team<textarea name="description" rows={2} maxLength={4000} /></label><div className="trainer-form-row"><label>City<input name="city" maxLength={80} /></label><label>Country<input name="country" maxLength={80} defaultValue="Malawi" /></label></div><label>Logo<input name="logo" type="file" accept="image/*" /></label><button className="button button-dark button-full" disabled={busy}>{busy ? "Creating…" : "Create team"}<ArrowRight size={15} /></button></form></section></div>}
    {invitations.length > 0 && <section className="team-invitations"><h2>Team invitations</h2>{invitations.map((invite) => <article className="side-card team-invite-row" key={invite.id}><span><strong>{invite.team_name}</strong><small>Invited you to join</small></span><div><button className="button button-dark" onClick={() => void respondToInvite(invite, "accept")}><Check size={14} />Accept</button><button className="button button-outline" onClick={() => void respondToInvite(invite, "decline")}>Decline</button></div></article>)}</section>}
    <div className="section-heading"><div><span className="eyebrow">{teams.length} DISCOVERABLE TEAMS</span><h2>Find your crew</h2></div></div>
    {teams.length ? <div className="team-grid">{teams.map((team) => <article className="side-card team-card" key={team.id}>
      <div className="team-card-heading">{team.logo ? <Image src={team.logo} alt="" width={48} height={48} unoptimized /> : <span className="team-logo-placeholder"><UsersRound size={22} /></span>}<div><h3>{team.name}</h3><span><MapPin size={12} />{[team.city, team.country].filter(Boolean).join(", ") || "Location not set"}</span></div></div>
      <p>{team.description || "A PrimeFit community team."}</p>
      <div className="team-card-meta"><span><UsersRound size={14} />{team.member_count} members</span><span><Crown size={14} />{team.captain_name}</span></div>
      {team.is_captain ? <button className="button button-outline button-full" onClick={() => void openTeam(team)}>Manage team</button>
        : team.is_member ? <div className="team-member-actions"><button className="button button-outline" onClick={() => void openTeam(team)}>View members</button><button className="text-action" onClick={() => void leaveTeam(team)}>Leave</button></div>
          : team.membership_status === "requested" ? <button className="button button-outline button-full" disabled>Request pending</button>
            : team.membership_status === "invited" ? <button className="button button-outline button-full" onClick={() => { const invite = invitations.find((item) => item.team === team.id); if (invite) void respondToInvite(invite, "accept"); }}>Accept invitation</button>
              : <button className="button button-dark button-full" disabled={!authenticated} onClick={() => void joinTeam(team)}>Request to join <ArrowRight size={14} /></button>}
      {expanded === team.id && <div className="team-management">
        <h4>Team members</h4>
        {(members[team.id] ?? []).map((member) => <div className="team-member-row" key={member.user.id}><span>{member.user.name}{member.role === "captain" && <small> · Captain</small>}</span>{team.is_captain && member.role !== "captain" && <button className="text-action" onClick={() => void appointCaptain(team, member.user.id)}>Make captain</button>}</div>)}
        {team.is_captain && <><h4>Join requests</h4>{(requests[team.id] ?? []).map((joinRequest) => <div className="team-member-row" key={joinRequest.id}><span>{joinRequest.user.name} <small>@{joinRequest.user.username}</small></span><span><button className="text-action" onClick={() => void reviewRequest(team, joinRequest, "approve_request")}>Approve</button><button className="text-action" onClick={() => void reviewRequest(team, joinRequest, "reject_request")}>Decline</button></span></div>)}{!(requests[team.id] ?? []).length && <small>No pending requests.</small>}<form className="team-invite-form" onSubmit={(event) => void inviteMember(event, team)}><input name="username" placeholder="Member username" required /><button className="button button-outline">Invite</button></form></>}
      </div>}
    </article>)}</div> : <div className="empty-state"><UsersRound size={24} /><h3>No teams to discover yet</h3><p>Create the first PrimeFit team to get things moving.</p></div>}
  </>;
}
