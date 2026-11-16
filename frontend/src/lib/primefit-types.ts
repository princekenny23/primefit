import type { ApiChallenge, ApiPost, ApiWorkout } from "@/lib/api";

export type Workout = ApiWorkout & { art: string; accent: string };
export type Challenge = ApiChallenge & { art: string; progress: number };
export type FeedPost = ApiPost & { time: string };
export type Member = { id: number; name: string; location: string; points: number; fitness_level: string; photo?: string | null };
export type Achievement = { name: string; description: string; earned_at: string };
export type Profile = {
  display_name: string;
  bio?: string;
  fitness_level: string;
  fitness_goal: string;
  workout_preference: string;
  area: string;
  city: string;
  country: string;
  photo?: string | null;
  cover_photo?: string | null;
};

export const CHALLENGE_GOALS = [
  { value: "weight", label: "Weight management" },
  { value: "strength", label: "Strength & muscle building" },
  { value: "cardio", label: "Cardio & fat burning" },
  { value: "core", label: "Core & abs" },
  { value: "fitness", label: "Full body fitness" },
  { value: "lower_body", label: "Lower body fitness" },
  { value: "upper_body", label: "Upper body fitness" },
  { value: "mobility", label: "Flexibility and mobility" },
  { value: "endurance", label: "Muscle endurance" },
] as const;

export function challengeGoalLabel(goal: string): string {
  return CHALLENGE_GOALS.find((item) => item.value === goal)?.label ?? goal.replaceAll("_", " ");
}

export function mapWorkout(workout: ApiWorkout): Workout {
  return {
    ...workout,
    art: workout.mode === "gym" ? "🏋️" : "🌿",
    accent: workout.mode === "gym" ? "peach" : "mint",
  };
}

export function mapChallenge(challenge: ApiChallenge): Challenge {
  const art = challenge.goal === "strength" ? "🏋️" : challenge.goal === "mobility" ? "🌱" : "✨";
  return { ...challenge, art, progress: 0 };
}

export function mapPost(post: ApiPost): FeedPost {
  return {
    ...post,
    time: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(post.created_at)),
  };
}
