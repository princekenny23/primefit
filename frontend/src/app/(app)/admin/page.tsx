"use client";

import { FormEvent, useEffect, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Check, Dumbbell, LogOut, Search, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { apiRequest, saveTokens } from "@/lib/api";
import { AccountRole, usePrimeFit } from "@/providers/app-provider";

type AdminTab = "overview" | "accounts" | "trainers" | "activities";
type AdminOverview = {
  members: number;
  trainers: number;
  pending_trainers: number;
  pending_activities: number;
  challenges: number;
  posts: number;
};
type PageResult<T> = { count: number; next: string | null; previous: string | null; results: T[] };
type AdminAccount = {
  id: number;
  username: string;
  email: string;
  name: string;
  role: "member" | "trainer";
  trainer_status: string | null;
  is_active: boolean;
  joined_at: string;
};
type AdminTrainer = {
  id: number;
  user_id: number;
  username: string;
  email: string;
  name: string;
  expertise: string;
  experience_years: number;
  status: "pending" | "approved" | "rejected";
  applied_at: string;
};
type AdminActivity = {
  id: number;
  username: string;
  activity_type: string;
  activity_label: string;
  completed_at: string;
  duration_seconds: number | null;
  distance_km: string | null;
  notes: string;
  source: string;
};

const tabs: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "trainers", label: "Trainer approvals" },
  { id: "activities", label: "Activity reviews" },
];

export default function AdminPage() {
  const { authenticated, role, loading, signOut } = usePrimeFit();
  const isAdmin = authenticated && role === "admin";

  if (loading) return <div className="page-loading"><span />Loading PrimeFit admin…</div>;
  if (!isAdmin) {
    return <AdminSignIn
      authenticated={authenticated}
      role={role}
      signOut={signOut}
    />;
  }
  return <AdminDashboard />;
}

function AdminSignIn({
  authenticated,
  role,
  signOut,
}: {
  authenticated: boolean;
  role: AccountRole | null;
  signOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const tokens = await apiRequest<{ access: string; refresh: string; role: AccountRole }>("/auth/token/", {
        method: "POST",
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
          role: "admin",
        }),
      });
      if (tokens.role !== "admin") throw new Error("This account is not authorized for the admin portal.");
      saveTokens(tokens.access, tokens.refresh);
      window.localStorage.setItem("primefit_role", tokens.role);
      window.location.assign("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in. Check your administrator credentials.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="admin-login">
    <div className="admin-login-mark"><ShieldCheck size={23} /></div>
    <span className="eyebrow">PRIMEFIT ADMINISTRATION</span>
    <h1>Welcome back.</h1>
    <p>Sign in with an administrator account to manage PrimeFit.</p>
    {authenticated && role !== "admin" && <div className="admin-notice" role="status">
      This account does not have administrator access. Sign out before using another account.
      <button className="button button-outline" type="button" onClick={signOut}><LogOut size={14} />Sign out</button>
    </div>}
    <form className="stack-form admin-login-form" onSubmit={submit}>
      <label>Username<input name="username" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="button button-dark button-full" type="submit" disabled={busy || (authenticated && role !== "admin")}>
        {busy ? "Signing in…" : "Sign in securely"}<ArrowRight size={15} />
      </button>
    </form>
  </main>;
}

function AdminDashboard() {
  const { signOut } = usePrimeFit();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [accountsCount, setAccountsCount] = useState(0);
  const [trainersCount, setTrainersCount] = useState(0);
  const [activitiesCount, setActivitiesCount] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [trainersPage, setTrainersPage] = useState(1);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyKey, setBusyKey] = useState("");
  const [loadingTab, setLoadingTab] = useState<AdminTab | null>("overview");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<AdminOverview>("/admin/overview/")
      .then((result) => { if (!cancelled) setOverview(result); })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the admin overview.");
      })
      .finally(() => { if (!cancelled) setLoadingTab(null); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    if (tab !== "accounts") return;
    let cancelled = false;
    setLoadingTab("accounts");
    setError("");
    apiRequest<PageResult<AdminAccount>>(`/admin/accounts/?page=${accountsPage}&search=${encodeURIComponent(search)}`)
      .then((result) => {
        if (cancelled) return;
        setAccounts(result.results);
        setAccountsCount(result.count);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load accounts.");
      })
      .finally(() => { if (!cancelled) setLoadingTab(null); });
    return () => { cancelled = true; };
  }, [accountsPage, refreshKey, search, tab]);

  useEffect(() => {
    if (tab !== "trainers") return;
    let cancelled = false;
    setLoadingTab("trainers");
    setError("");
    apiRequest<PageResult<AdminTrainer>>(`/admin/trainers/?status=pending&page=${trainersPage}`)
      .then((result) => {
        if (cancelled) return;
        setTrainers(result.results);
        setTrainersCount(result.count);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load trainer applications.");
      })
      .finally(() => { if (!cancelled) setLoadingTab(null); });
    return () => { cancelled = true; };
  }, [refreshKey, tab, trainersPage]);

  useEffect(() => {
    if (tab !== "activities") return;
    let cancelled = false;
    setLoadingTab("activities");
    setError("");
    apiRequest<PageResult<AdminActivity>>(`/activity-records/?verification_status=pending&page=${activitiesPage}`)
      .then((result) => {
        if (cancelled) return;
        setActivities(result.results);
        setActivitiesCount(result.count);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load pending activities.");
      })
      .finally(() => { if (!cancelled) setLoadingTab(null); });
    return () => { cancelled = true; };
  }, [activitiesPage, refreshKey, tab]);

  async function setAccountActive(account: AdminAccount) {
    const isActive = !account.is_active;
    if (!isActive && !window.confirm(`Suspend ${account.name}'s account? They will no longer be able to sign in.`)) return;
    setBusyKey(`account-${account.id}`);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/accounts/${account.id}/status/`, {
        method: "POST",
        body: JSON.stringify({ is_active: isActive }),
      });
      setMessage(isActive ? `${account.name}'s account is active.` : `${account.name}'s account has been suspended.`);
      setRefreshKey((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this account.");
    } finally {
      setBusyKey("");
    }
  }

  async function reviewTrainer(trainer: AdminTrainer, status: "approved" | "rejected") {
    setBusyKey(`trainer-${trainer.id}`);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/admin/trainers/${trainer.id}/review/`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setMessage(`${trainer.name}'s application was ${status}.`);
      setRefreshKey((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review this application.");
    } finally {
      setBusyKey("");
    }
  }

  async function reviewActivity(activity: AdminActivity, decision: "verify" | "reject") {
    setBusyKey(`activity-${activity.id}`);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/activity-records/${activity.id}/${decision}/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(`Activity #${activity.id} was ${decision === "verify" ? "verified" : "rejected"}.`);
      setRefreshKey((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review this activity.");
    } finally {
      setBusyKey("");
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setAccountsPage(1);
  }

  const date = (value: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));

  return <div className="admin-portal">
    <header className="admin-header">
      <div>
        <span className="eyebrow">PRIMEFIT ADMINISTRATION</span>
        <h1>Control <em>room.</em></h1>
        <p>Manage accounts, trainer applications, and member activity.</p>
      </div>
      <button className="button button-outline" type="button" onClick={signOut}><LogOut size={15} />Sign out</button>
    </header>
    <nav className="admin-tabs" aria-label="Admin sections">
      {tabs.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={tab === item.id}
        className={tab === item.id ? "active" : ""}
        onClick={() => { setTab(item.id); setError(""); setMessage(""); }}
      >{item.label}</button>)}
    </nav>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {message && <p className="admin-success" role="status">{message}</p>}
    {tab === "overview" && <section className="admin-stat-grid" aria-label="Platform summary">
      {[
        { label: "Members", value: overview?.members, icon: <Users size={18} /> },
        { label: "Trainers", value: overview?.trainers, icon: <Dumbbell size={18} /> },
        { label: "Trainer applications", value: overview?.pending_trainers, icon: <UserRound size={18} /> },
        { label: "Activities to review", value: overview?.pending_activities, icon: <Activity size={18} /> },
        { label: "Challenges", value: overview?.challenges, icon: <ShieldCheck size={18} /> },
        { label: "Community posts", value: overview?.posts, icon: <Users size={18} /> },
      ].map((item) => <article className="admin-stat-card" key={item.label}>
        <span>{item.icon}{item.label}</span>
        <strong>{item.value ?? (loadingTab === "overview" ? "…" : "—")}</strong>
      </article>)}
      <section className="side-card admin-shortcuts">
        <div className="section-heading"><div><span className="eyebrow">QUICK ACTIONS</span><h2>Needs your attention</h2></div></div>
        <button type="button" onClick={() => setTab("trainers")}>Review pending trainer applications<ArrowRight size={15} /></button>
        <button type="button" onClick={() => setTab("activities")}>Review member activities<ArrowRight size={15} /></button>
      </section>
    </section>}
    {tab === "accounts" && <section className="side-card admin-section-card">
      <div className="section-heading">
        <div><span className="eyebrow">MEMBER DIRECTORY</span><h2>Accounts <small>{accountsCount}</small></h2></div>
      </div>
      <form className="admin-search" onSubmit={submitSearch}>
        <label><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, username, or email" /></label>
        <button className="button button-dark" type="submit">Search</button>
      </form>
      {loadingTab === "accounts" ? <div className="page-loading"><span />Loading accounts…</div> : accounts.length ? <div className="admin-list">
        {accounts.map((account) => <article className="admin-row" key={account.id}>
          <div className="admin-row-main"><span className="admin-row-icon"><UserRound size={17} /></span><span><strong>{account.name}</strong><small>@{account.username} · {account.email || "No email"}</small></span></div>
          <div className="admin-row-meta"><span className={`admin-status ${account.is_active ? "status-active" : "status-inactive"}`}>{account.is_active ? "Active" : "Suspended"}</span><small>{account.role === "trainer" ? `Trainer · ${account.trainer_status}` : "Member"} · Joined {date(account.joined_at)}</small></div>
          <button className={`button ${account.is_active ? "button-outline" : "button-lime"}`} type="button" disabled={busyKey === `account-${account.id}`} onClick={() => void setAccountActive(account)}>
            {busyKey === `account-${account.id}` ? "Saving…" : account.is_active ? "Suspend" : "Reactivate"}
          </button>
        </article>)}
      </div> : <div className="admin-empty">No accounts match your search.</div>}
      <AdminPagination page={accountsPage} count={accountsCount} onChange={setAccountsPage} />
    </section>}
    {tab === "trainers" && <section className="side-card admin-section-card">
      <div className="section-heading"><div><span className="eyebrow">TRAINER MANAGEMENT</span><h2>Pending applications <small>{trainersCount}</small></h2></div></div>
      {loadingTab === "trainers" ? <div className="page-loading"><span />Loading applications…</div> : trainers.length ? <div className="admin-list">
        {trainers.map((trainer) => <article className="admin-row admin-trainer-row" key={trainer.id}>
          <div className="admin-row-main"><span className="admin-row-icon"><Dumbbell size={17} /></span><span><strong>{trainer.name}</strong><small>@{trainer.username} · {trainer.email || "No email"}</small></span></div>
          <div className="admin-row-meta"><strong>{trainer.expertise}</strong><small>{trainer.experience_years} years of experience · Applied {date(trainer.applied_at)}</small></div>
          <div className="admin-row-actions">
            <button className="button button-lime" type="button" disabled={busyKey === `trainer-${trainer.id}`} onClick={() => void reviewTrainer(trainer, "approved")}><Check size={14} />Approve</button>
            <button className="button button-outline" type="button" disabled={busyKey === `trainer-${trainer.id}`} onClick={() => void reviewTrainer(trainer, "rejected")}><X size={14} />Reject</button>
          </div>
        </article>)}
      </div> : <div className="admin-empty">There are no pending trainer applications.</div>}
      <AdminPagination page={trainersPage} count={trainersCount} onChange={setTrainersPage} />
    </section>}
    {tab === "activities" && <section className="side-card admin-section-card">
      <div className="section-heading"><div><span className="eyebrow">ACTIVITY SAFETY</span><h2>Pending activity reviews <small>{activitiesCount}</small></h2></div></div>
      {loadingTab === "activities" ? <div className="page-loading"><span />Loading activities…</div> : activities.length ? <div className="admin-list">
        {activities.map((activity) => <article className="admin-row admin-activity-row" key={activity.id}>
          <div className="admin-row-main"><span className="admin-row-icon"><Activity size={17} /></span><span><strong>{activity.activity_label} · @{activity.username}</strong><small>{date(activity.completed_at)} · {activity.source} submission</small></span></div>
          <div className="admin-row-meta"><strong>{activity.distance_km ? `${Number(activity.distance_km).toFixed(2)} km` : `${Math.round((activity.duration_seconds ?? 0) / 60)} min`}</strong><small>{activity.notes || "No member notes"}</small></div>
          <div className="admin-row-actions">
            <button className="button button-lime" type="button" disabled={busyKey === `activity-${activity.id}`} onClick={() => void reviewActivity(activity, "verify")}><Check size={14} />Verify</button>
            <button className="button button-outline" type="button" disabled={busyKey === `activity-${activity.id}`} onClick={() => void reviewActivity(activity, "reject")}><X size={14} />Reject</button>
          </div>
        </article>)}
      </div> : <div className="admin-empty">There are no pending activities to review.</div>}
      <AdminPagination page={activitiesPage} count={activitiesCount} onChange={setActivitiesPage} />
    </section>}
  </div>;
}

function AdminPagination({ page, count, onChange }: { page: number; count: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(count / 20));
  if (pageCount <= 1) return null;
  return <div className="admin-pagination">
    <button className="button button-outline" type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}><ArrowLeft size={14} />Previous</button>
    <span>Page {page} of {pageCount}</span>
    <button className="button button-outline" type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Next<ArrowRight size={14} /></button>
  </div>;
}
