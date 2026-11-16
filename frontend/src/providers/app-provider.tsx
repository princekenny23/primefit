"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type PropsWithChildren } from "react";
import { apiList, apiRequest, ApiChallenge, ApiPost, ApiWorkout, clearTokens, readToken, saveTokens } from "@/lib/api";
import { ApiExercise } from "@/lib/api";
import { Achievement, Challenge, FeedPost, mapChallenge, mapPost, mapWorkout, Profile, Workout } from "@/lib/primefit-types";

export type AuthValues = {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
  role: "member" | "trainer";
  expertise?: string;
  experience_years?: number;
};
export type AccountRole = "member" | "trainer" | "admin";
type WorkoutTracking = { progress_recorded: boolean; sets_completed?: number; weight_kg?: number; event_registration?: number };
type WeeklyActivity = { weekday: string; count: number; is_today: boolean };
type AppContextValue = {
  workouts: Workout[]; exercises: ApiExercise[]; challenges: Challenge[]; posts: FeedPost[]; profile: Profile; points: number; workoutCount: number; completedChallengeCount: number; achievements: Achievement[];
  weeklyActivity: WeeklyActivity[]; role: AccountRole | null; authenticated: boolean; apiOnline: boolean; apiError: string; loading: boolean; toast: string;
  notify: (message: string) => void; signIn: (values: AuthValues) => Promise<void>; register: (values: AuthValues) => Promise<void>;
  signOut: () => void; joinChallenge: (challenge: Challenge) => Promise<boolean>; refreshChallenges: () => Promise<void>; refreshPosts: () => Promise<void>; completeWorkout: (workout: Workout, tracking?: WorkoutTracking) => Promise<boolean>;
  completeChallengeDay: (challenge: Challenge, requirementId: number) => Promise<boolean>; toggleReaction: (post: FeedPost) => Promise<void>;
  publishPost: (body: string, image?: File) => Promise<boolean>; addComment: (post: FeedPost, body: string) => Promise<boolean>;
  saveProfile: (values: Partial<Profile>) => Promise<boolean>;
  uploadProfilePhoto: (photo: File) => Promise<boolean>;
  uploadProfileCoverPhoto: (photo: File) => Promise<boolean>;
};
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<ApiExercise[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [profile, setProfile] = useState<Profile>({ display_name: "", fitness_level: "beginner", fitness_goal: "fitness", workout_preference: "both", area: "", city: "", country: "" });
  const [points, setPoints] = useState(0);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [completedChallengeCount, setCompletedChallengeCount] = useState(0);
  const [weeklyActivity, setWeeklyActivity] = useState<WeeklyActivity[]>([]);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3200); }, []);

  const refreshPosts = useCallback(async () => {
    const postData = await apiList<ApiPost>("/posts/");
    setPosts(postData.map(mapPost));
  }, []);

  const loadDashboard = useCallback(async () => {
    const data = await apiRequest<{ user: { username: string; profile: Profile }; points: number; workout_count: number; completed_challenge_count: number; active_challenges: ApiChallenge[]; achievements: Achievement[]; weekly_activity: WeeklyActivity[] }>("/dashboard/");
    setProfile(data.user.profile);
    setPoints(data.points);
    setWorkoutCount(data.workout_count);
    setCompletedChallengeCount(data.completed_challenge_count);
    setAchievements(data.achievements);
    setWeeklyActivity(data.weekly_activity);
    setChallenges((current) => current.map((challenge) => {
      const active = data.active_challenges.find((item) => item.id === challenge.id);
      return active ? { ...challenge, joined: true } : challenge;
    }));
    const progressResults = await Promise.all(data.active_challenges.map(async (challenge) => {
      const progress = await apiRequest<{ completed: unknown[] }>(`/challenges/${challenge.id}/my_progress/`);
      return {
        id: challenge.id,
        progress: Math.min(100, Math.round(progress.completed.length / Math.max(challenge.duration_days, 1) * 100)),
      };
    }));
    setChallenges((current) => current.map((challenge) => {
      const progress = progressResults.find((item) => item.id === challenge.id);
      return { ...challenge, joined: data.active_challenges.some((item) => item.id === challenge.id), progress: progress?.progress ?? challenge.progress };
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [workoutData, exerciseData, challengeData, postData] = await Promise.all([
          apiList<ApiWorkout>("/workouts/"),
          apiList<ApiExercise>("/exercises/"),
          apiList<ApiChallenge>("/challenges/"),
          apiList<ApiPost>("/posts/"),
        ]);
        if (cancelled) return;
        setWorkouts(workoutData.map(mapWorkout));
        setExercises(exerciseData);
        setChallenges(challengeData.map(mapChallenge));
        setPosts(postData.map(mapPost));
        setApiOnline(true);
        setApiError("");
        if (readToken()) {
          try {
            setRole(window.localStorage.getItem("primefit_role") as AccountRole | null);
            await loadDashboard();
            if (!cancelled) setAuthenticated(true);
          } catch {
            clearTokens();
            setApiError("Your saved session is no longer valid. Please sign in again.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setApiOnline(false);
          setApiError(error instanceof Error ? error.message : "Unable to connect to the PrimeFit API.");
        }
      }
      if (!cancelled) setLoading(false);
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [loadDashboard]);

  const signIn = useCallback(async (values: AuthValues) => {
    const tokens = await apiRequest<{ access: string; refresh: string; role: AccountRole }>("/auth/token/", { method: "POST", body: JSON.stringify({ username: values.username, password: values.password, role: values.role }) });
    saveTokens(tokens.access, tokens.refresh);
    window.localStorage.setItem("primefit_role", tokens.role);
    setRole(tokens.role);
    await loadDashboard();
    setAuthenticated(true); setApiOnline(true);
  }, [loadDashboard]);

  const register = useCallback(async (values: AuthValues) => {
    await apiRequest("/auth/register/", { method: "POST", body: JSON.stringify(values) });
    await signIn(values);
  }, [signIn]);

  const signOut = useCallback(() => {
    clearTokens();
    window.localStorage.removeItem("primefit_role");
    setRole(null);
    setAuthenticated(false);
    setProfile({ display_name: "", fitness_level: "beginner", fitness_goal: "fitness", workout_preference: "both", area: "", city: "", country: "" });
    setPoints(0);
    setWorkoutCount(0);
    setCompletedChallengeCount(0);
    setWeeklyActivity([]);
    setAchievements([]);
    setChallenges((current) => current.map((challenge) => ({ ...challenge, joined: false, progress: 0 })));
    notify("You’ve signed out.");
  }, [notify]);

  const joinChallenge = useCallback(async (challenge: Challenge) => {
    if (!authenticated) return false;
    try {
      const result = await apiRequest<{ already_joined: boolean; participant: NonNullable<ApiChallenge["participants"]>[number] }>(`/challenges/${challenge.id}/join/`, { method: "POST", body: "{}" });
      setChallenges((current) => current.map((item) => {
        if (item.id !== challenge.id) return item;
        const participants = item.participants ?? [];
        return {
          ...item,
          joined: true,
          participant_count: item.participant_count + (result.already_joined ? 0 : 1),
          participants: participants.some((member) => member.id === result.participant.id) ? participants : [...participants, result.participant],
        };
      }));
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn't join this challenge."); return false; }
    notify(`You’re in — ${challenge.title} starts now.`); return true;
  }, [authenticated, notify]);

  const refreshChallenges = useCallback(async () => {
    const challengeRows = await apiList<ApiChallenge>("/challenges/");
    setChallenges((current) => challengeRows.map((item) => ({
      ...mapChallenge(item),
      progress: current.find((challenge) => challenge.id === item.id)?.progress ?? 0,
    })));
  }, []);

  const completeWorkout = useCallback(async (workout: Workout, tracking: WorkoutTracking = { progress_recorded: false }) => {
    if (!authenticated) { notify("Sign in to save your workout."); return false; }
    if (apiOnline) {
      try { await apiRequest("/workout-sessions/", { method: "POST", body: JSON.stringify({ workout: workout.id, notes: "Completed from PrimeFit", ...tracking }) }); await loadDashboard(); notify("Workout complete — one more good thing you did today."); return true; }
      catch (error) { notify(error instanceof Error ? error.message : "Could not save this workout."); return false; }
    }
    notify("The API is unavailable, so this workout could not be saved."); return false;
  }, [apiOnline, authenticated, loadDashboard, notify]);

  const completeChallengeDay = useCallback(async (challenge: Challenge, requirementId: number) => {
    if (!authenticated) { notify("Sign in to save your challenge progress."); return false; }
    if (!challenge.joined) return false;
    if (apiOnline) {
      try {
        const requirement = challenge.requirements?.find((item) => item.id === requirementId);
        if (!requirement) { notify("This challenge has no scheduled requirement for today."); return false; }
        await apiRequest("/challenge-completions/", { method: "POST", body: JSON.stringify({ requirement: requirement.id }) });
        await loadDashboard();
        notify(`Day complete. You earned ${challenge.points_per_completion} points.`);
        return true;
      } catch (error) { notify(error instanceof Error ? error.message : "Could not record your challenge day."); return false; }
    }
    notify("The API is unavailable, so this challenge could not be saved."); return false;
  }, [apiOnline, authenticated, loadDashboard, notify]);

  const toggleReaction = useCallback(async (post: FeedPost) => {
    if (!authenticated) { notify("Sign in to cheer on the community."); return; }
    if (apiOnline) {
      try {
        const result = await apiRequest<{ reacted: boolean; count: number }>(`/posts/${post.id}/react/`, { method: "POST", body: "{}" });
        setPosts((current) => current.map((item) => item.id === post.id ? { ...item, reacted_by_me: result.reacted, reaction_count: result.count } : item)); return;
      } catch (error) { notify(error instanceof Error ? error.message : "Couldn't save your reaction."); return; }
    }
    notify("The API is unavailable, so your reaction could not be saved.");
  }, [apiOnline, authenticated, notify]);

  const publishPost = useCallback(async (body: string, image?: File) => {
    if (!body.trim()) return false;
    if (!authenticated) { notify("Sign in to publish to the community."); return false; }
    const payload = image ? new FormData() : null;
    if (payload && image) { payload.set("body", body.trim()); payload.set("post_type", "community"); payload.set("image", image); }
    try { const result = await apiRequest<ApiPost>("/posts/", { method: "POST", body: payload ?? JSON.stringify({ body: body.trim(), post_type: "community" }) }); setPosts((current) => [mapPost(result), ...current]); notify("Your update is live in the community."); return true; }
    catch (error) { notify(error instanceof Error ? error.message : "Your update couldn't be shared."); return false; }
  }, [authenticated, notify]);

  const addComment = useCallback(async (post: FeedPost, body: string) => {
    if (!authenticated) { notify("Sign in to join the conversation."); return false; }
    try {
      await apiRequest("/comments/", { method: "POST", body: JSON.stringify({ post: post.id, body }) });
      const refreshedPosts = await apiList<ApiPost>("/posts/");
      setPosts(refreshedPosts.map(mapPost));
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn't add your comment."); return false; }
  }, [authenticated, notify]);

  const saveProfile = useCallback(async (values: Partial<Profile>) => {
    if (!authenticated) { notify("Sign in to save your profile."); return false; }
    try {
      const result = await apiRequest<{ profile: Profile }>("/me/", { method: "PATCH", body: JSON.stringify({ profile: values }) });
      setProfile(result.profile);
      notify("Your profile has been updated.");
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn't save your profile."); return false; }
  }, [authenticated, notify]);

  const uploadProfileImage = useCallback(async (photo: File, field: "photo" | "cover_photo") => {
    if (!authenticated) { notify("Sign in to save profile images."); return false; }
    const form = new FormData(); form.set(field, photo);
    try {
      const path = field === "photo" ? "/me/photo/" : "/me/cover-photo/";
      const result = await apiRequest<{ photo?: string; cover_photo?: string }>(path, { method: "POST", body: form });
      const imageUrl = field === "photo" ? result.photo : result.cover_photo;
      if (!imageUrl) throw new Error("The server did not return the uploaded image.");
      setProfile((current) => ({ ...current, [field]: imageUrl }));
      notify(field === "photo" ? "Profile photo updated." : "Cover photo updated.");
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : "Couldn't upload the photo."); return false; }
  }, [authenticated, notify]);
  const uploadProfilePhoto = useCallback((photo: File) => uploadProfileImage(photo, "photo"), [uploadProfileImage]);
  const uploadProfileCoverPhoto = useCallback((photo: File) => uploadProfileImage(photo, "cover_photo"), [uploadProfileImage]);

  const value = useMemo(() => ({ workouts, exercises, challenges, posts, profile, points, workoutCount, completedChallengeCount, weeklyActivity, achievements, role, authenticated, apiOnline, apiError, loading, toast, notify, signIn, register, signOut, joinChallenge, refreshChallenges, refreshPosts, completeWorkout, completeChallengeDay, toggleReaction, publishPost, addComment, saveProfile, uploadProfilePhoto, uploadProfileCoverPhoto }), [workouts, exercises, challenges, posts, profile, points, workoutCount, completedChallengeCount, weeklyActivity, achievements, role, authenticated, apiOnline, apiError, loading, toast, notify, signIn, register, signOut, joinChallenge, refreshChallenges, refreshPosts, completeWorkout, completeChallengeDay, toggleReaction, publishPost, addComment, saveProfile, uploadProfilePhoto, uploadProfileCoverPhoto]);
  return <AppContext.Provider value={value}>{children}{toast && <div className="toast"><span>✓</span>{toast}<button onClick={() => setToast("")} aria-label="Dismiss">×</button></div>}</AppContext.Provider>;
}

export function usePrimeFit() {
  const value = useContext(AppContext);
  if (!value) throw new Error("usePrimeFit must be used within AppProvider");
  return value;
}
export function readAuthForm(event: FormEvent<HTMLFormElement>): AuthValues {
  const form = new FormData(event.currentTarget);
  const role = form.get("role") === "trainer" ? "trainer" : "member";
  return {
    username: String(form.get("username") ?? ""),
    password: String(form.get("password") ?? ""),
    email: String(form.get("email") ?? ""),
    display_name: String(form.get("display_name") ?? ""),
    role,
    expertise: String(form.get("expertise") ?? ""),
    experience_years: Number(form.get("experience_years") ?? 0),
  };
}
