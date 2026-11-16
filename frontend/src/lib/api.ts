export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");

export type ApiWorkout = {
  id: number;
  title: string;
  description: string;
  mode: "gym" | "home";
  difficulty: string;
  goal: string;
  duration_minutes: number;
  creator_name?: string;
  workout_exercises?: { id: number; order: number; sets: number; reps: string; rest_seconds: number; instructions: string; exercise: { name: string; instructions: string; illustration?: string | null; equipment?: string; primary_muscles?: string[] } }[];
};
export type ApiExercise = {
  id: number;
  name: string;
  instructions: string;
  illustration: string | null;
  source: string;
  external_id: string;
  equipment: string;
  body_part: string;
  difficulty: string;
  primary_muscles: string[];
  goals: string[];
  tags: string[];
  met: string | number | null;
};
export type ApiChallenge = {
  id: number;
  title: string;
  description: string;
  image?: string | null;
  duration_days: number;
  difficulty: string;
  goal: string;
  activity_category: "general" | "boxing" | "running" | "cycling";
  registration_fee: string | number;
  currency: "MWK" | "USD";
  points_per_completion: number;
  participant_count: number;
  joined: boolean;
  starts_at?: string;
  ends_at?: string | null;
  rules?: string;
  participants?: { id: number; username: string; name: string; location: string; fitness_level: string; photo?: string | null }[];
  requirements?: { id: number; day_number: number; activity_type: "workout" | "running" | "cycling"; workout: number | null; workout_title: string; workout_details: ApiWorkout | null; points: number | null }[];
};
export type ApiCurrentChallenge = Pick<ApiChallenge, "id" | "title">;
export type ApiPost = {
  id: number;
  body: string;
  image?: string | null;
  post_type: string;
  challenge?: number | null;
  created_at: string;
  reaction_count: number;
  reacted_by_me: boolean;
  author: { id: number; username: string; name: string; location: string; fitness_level: string; photo?: string | null };
  comments: { id: number; body: string; author: { name: string } }[];
};
export type ApiNutritionGoal = {
  id: string;
  label: string;
  description: string;
};
export type ApiNutritionMeal = {
  id: number;
  name: string;
  time: string;
  ingredients: string;
  quantity: string;
  preparation: string;
  alternative: string;
};
export type ApiNutritionMealPlan = {
  id: string;
  name: string;
  goal: string;
  goal_label: string;
  image: string | null;
  description: string;
  schedule: string;
  duration: string;
  professional: string;
  credentials: string;
  calories: string;
  meals: ApiNutritionMeal[];
};
export type ApiNutritionSupplement = {
  id: number;
  goal: string;
  goal_label: string;
  name: string;
  category: string;
  image: string | null;
  summary: string;
  use: string;
  note: string;
};
export type ApiMember = { id: number; username: string; name: string; location: string; fitness_level: string; photo?: string | null; cover_photo?: string | null };
export type ApiCommunityMember = ApiMember & {
  role: "member" | "trainer";
  expertise: string;
  experience_years: number;
  is_online: boolean;
  is_following: boolean;
};
export type ApiConversation = {
  id: number;
  member: ApiMember;
  last_message: ApiMessage | null;
  updated_at: string;
};
export type ApiMessage = {
  id: number;
  sender: ApiMember;
  body: string;
  created_at: string;
};

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("primefit_access");
}
export function saveTokens(access: string, refresh: string) {
  window.localStorage.setItem("primefit_access", access);
  window.localStorage.setItem("primefit_refresh", refresh);
}
export function clearTokens() {
  window.localStorage.removeItem("primefit_access");
  window.localStorage.removeItem("primefit_refresh");
}

let tokenRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = window.localStorage.getItem("primefit_refresh");
  if (!refresh) {
    clearTokens();
    return null;
  }
  const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!response.ok) {
    clearTokens();
    return null;
  }
  const payload = await response.json() as { access?: string; refresh?: string };
  if (!payload.access) {
    clearTokens();
    return null;
  }
  saveTokens(payload.access, payload.refresh ?? refresh);
  return payload.access;
}

function getRefreshedAccessToken(): Promise<string | null> {
  if (!tokenRefresh) {
    tokenRefresh = refreshAccessToken().finally(() => { tokenRefresh = null; });
  }
  return tokenRefresh;
}

function requestHeaders(options: RequestInit, token: string | null): Headers {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return headers;
}

async function responseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as { detail?: string; non_field_errors?: string[] } | null;
  return new Error(payload?.detail ?? payload?.non_field_errors?.[0] ?? `Request failed (${response.status})`);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const initialToken = readToken();
  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: requestHeaders(options, initialToken),
    cache: "no-store",
  });
  if (response.status === 401 && initialToken && !path.includes("/auth/token")) {
    const refreshedToken = await getRefreshedAccessToken();
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: requestHeaders(options, refreshedToken),
      cache: "no-store",
    });
  }
  if (!response.ok) {
    throw await responseError(response);
  }
  return response.json() as Promise<T>;
}
export async function apiList<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  const baseUrl = new URL(API_BASE);
  let nextPath: string | null = path;
  const visitedPaths = new Set<string>();

  while (nextPath) {
    if (visitedPaths.has(nextPath)) throw new Error("The API returned a repeated pagination link.");
    visitedPaths.add(nextPath);
    const result: T[] | { results: T[]; next: string | null } =
      await apiRequest<T[] | { results: T[]; next: string | null }>(nextPath);
    if (Array.isArray(result)) {
      items.push(...result);
      break;
    }
    items.push(...result.results);
    if (!result.next) break;

    const nextUrl: URL = new URL(result.next, API_BASE);
    if (nextUrl.origin !== baseUrl.origin || !nextUrl.pathname.startsWith(`${baseUrl.pathname}/`)) {
      throw new Error("The API returned a pagination link outside the configured API URL.");
    }
    nextPath = `${nextUrl.pathname.slice(baseUrl.pathname.length)}${nextUrl.search}`;
  }

  return items;
}
