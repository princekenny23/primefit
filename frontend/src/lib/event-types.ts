export type EventCategory = "running" | "cycling" | "hiking" | "walking" | "other" | "workout";

export type AdventureEvent = {
  id: number;
  title: string;
  description: string;
  flyer: string | null;
  category: EventCategory;
  location: string;
  meeting_point: string;
  starts_at: string;
  ends_at: string | null;
  difficulty: string;
  participant_limit: number | null;
  registration_fee: string | number;
  currency: string;
  requirements: string;
  organizer_name: string;
  organizer_team_name: string | null;
  registered_count: number;
  registered_by_me: boolean;
};

export type EventTeam = { id: number; name: string; is_captain: boolean };
export type EventRegistration = { id: number; event: number; team: number | null; status: string };
