# PrimeFit

PrimeFit is a mobile-first fitness and community app. The frontend is built with Next.js App Router and the API with Django REST Framework. The frontend reads and writes data through the API; accounts, workouts, challenge progress, points, and community content are stored in the database.

## How the app works

### Visitors

You can open the app without an account and browse published challenges, community posts, public member profiles, leaderboards, and upcoming events. Sign in to join a challenge, register for an event, publish or react to a post, comment, or edit a profile. Hidden posts and comments are not included in public feeds.

### Members

1. Create a member account with a username, password, email, and display name. The API creates a fitness profile at the same time.
2. Sign in by choosing **Member** and entering the account credentials. The frontend receives JWT access and refresh tokens and uses the access token for authenticated API requests.
3. Use the home dashboard to see points, workout count, joined challenges, completed challenges, recent workouts and points, weekly workout activity, and achievements.
4. Open a challenge to review its calendar schedule, configured exercises and sets, and joined-member roster, then join. Browse challenges by activity category (boxing, running, cycling, or all), difficulty, and goal. A challenge may limit members to one active challenge; joining the same challenge again does not create a second participation.
6. Start a scheduled challenge workout using the guided workout flow and record its sets. Completing an eligible requirement awards its points and creates a progress post; a requirement can only be completed once per participant. The challenge is marked complete when all its requirements are done. Achievements are awarded for a first workout, joining a first challenge, and completing three challenge workouts.
7. Share a community post, react to another post, and comment. Open a member profile to send or respond to a friend request; friends can start a private direct-message conversation. A reaction is a toggle: one member can have at most one reaction on a post. Members can update their display name, fitness level, goal, workout preference, area, city, country, and profile photo. Area/city/country can be used to filter leaderboards.

### Trainers

Trainer accounts can use the member features as well as the trainer portal. Trainer registration asks for expertise and years of experience. Sign in by choosing **Trainer** to open `/trainer`, where the trainer can see program metrics and create challenges.

Trainer-created challenges remain **pending** until an administrator publishes them. The challenge builder schedules a custom workout for every challenge day, using approved library exercises and per-exercise sets, reps, and rest times. The backend creates each day’s workout and challenge requirement together. Associated day workouts are published when the challenge is published. Trainer metrics include participant and completion activity, active/returning users, challenge completion percentage, and eligible earnings. PrimeFit administration sets any commission; the app does not calculate a payout formula.

The member-facing navigation currently omits standalone workouts, outdoor activity logging, teams, and competitions. Their existing data and API endpoints are retained for compatibility; workouts continue to power guided challenge sessions.

**Trainer approval behavior in the current code:** public trainer signup currently creates the trainer profile with status `approved`, and the frontend signs the new account in immediately. This differs from the separate `POST /api/trainer/apply/` endpoint, which creates or resets an application to `pending`, and from the admin approval workflow described below. Do not assume that public signup is awaiting review; the API tests currently expect immediate approval.

### Administrators

Administrators are Django staff/superuser accounts, not a public signup role. Create one with `py backend\manage.py createsuperuser`, then sign in to the custom portal at the frontend `/admin` route using the administrator credentials. The portal provides a platform overview, account search and suspension/reactivation, trainer application approvals, and pending activity reviews. The Django Admin at the backend `/admin/` route remains available as a fallback for full model management.

The custom portal uses staff-only API endpoints; permissions are enforced by Django and not by frontend visibility alone. Administrators can still approve exercises and publish, archive, or otherwise manage workouts and challenges through Django Admin. Admin-created and trainer-created workouts are published immediately; trainer-created challenges remain pending until published. Staff users can view non-published workouts and challenges in the API, while public browse endpoints return published content.

### Phase 0 role and activity rules

- **SaaS administrators** are Django `is_staff`/superuser accounts and manage PrimeFit through the custom portal or Django Admin. They cannot be created through public registration; staff accounts use the separate `admin` JWT role and cannot sign in as members or trainers. This release treats staff as platform-wide administrators; it does not yet have tenant-scoped organizations or tenant administrators.
- **Trainers** are regular accounts with a `Trainer` profile. They can use member features and trainer tools subject to trainer approval. Approved trainers can organize events and competitions and verify pending activity records submitted for events they organize.
- **Members** are regular accounts without a trainer profile. Admin status is never selectable during public registration.
- A workout is a plan; a workout session or outdoor log is a completed activity; an event is an organized occasion; a challenge is a structured goal. These remain separate entities.
- Existing workout sessions continue to count as trusted/verified activity for compatibility. New manually submitted outdoor activities are pending administrator review. Pending or rejected outdoor logs remain visible to their owner but are not treated as verified activity.
- Trainer signup continues to create an approved trainer in this version because existing API behavior and tests depend on it. The separate trainer application flow remains pending-review.

### Shared activity records (Phase 1)

`ActivityRecord` is the canonical, private activity ledger. Existing `/workout-sessions/` and `/outdoor-activities/` write routes are preserved and automatically create one linked record each. Workout challenge completion links to a matching workout the member already logged that day, or creates one workout session and links it if none exists. Running/cycling challenges schedule GPS activity requirements instead; a participant starts the day's run or ride from the challenge calendar, and the server computes route distance and awards that day's points after validating the route. One activity can be linked to completions in different challenges, but cannot count twice within the same challenge. Existing workout/outdoor rows and challenge-completion links are backfilled by migrations, and dashboard workout counts and trainer workout metrics read from the ledger.

Running and cycling challenge tracking uses the browser Geolocation API to capture GPS points and Leaflet to display the live route on OpenStreetMap tiles. GPS activity submissions are stored in the `OutdoorActivity` table: the route is saved as JSON, and duration and server-calculated distance are saved in their respective columns. The map uses the public OpenStreetMap tile service and includes required attribution; follow its usage policy and do not bulk-download or offer offline tile access.

Members can read only their own records at `GET /api/activity-records/`. SaaS administrators can filter records with `?verification_status=pending` and review them using `POST /api/activity-records/{id}/verify/` or `/reject/`, optionally supplying `review_notes`. Only pending records can be reviewed. The legacy outdoor log response also includes `verification_status`, which is shown in the member's outdoor log. Event organizers can verify pending records linked to their event; self-verification is not allowed. Competition standings are calculated from verified records for eligible activities during the competition window and the participating members' team-membership periods.

### Teams, events, and competitions (Phases 2–3)

Team discovery is public. Authenticated members can create teams, request membership, accept invitations, and leave a team. Captains manage their roster, approve join requests, invite members, transfer captaincy, and register the team for an event or competition. Each member has at most one active team membership.

Published events can include an admin-uploaded flyer and a free or paid registration fee (MWK or USD). Individual registration opens an attendee form; paid events continue to PayChangu hosted checkout and create a confirmed registration only after server-side payment verification. Free events register directly. Team captains can still register a team for free events. Event-linked workout and outdoor records are kept in the same activity ledger and begin pending verification.

To enable paid event checkout, configure `PAYCHANGU_SECRET_KEY` with a PayChangu API secret and set `PAYCHANGU_CALLBACK_URL` to the publicly reachable `/api/event-payments/callback/` endpoint. Set `FRONTEND_URL` to the public frontend origin. Never expose the API secret in frontend environment variables. Admins can add flyers and event fees through Django Admin; authorized event hosts can also upload a flyer and set the fee from `/events`.

Approved trainers and SaaS administrators can create competitions. Team captains enter eligible teams. Competition standings support activity-count, distance, or duration scoring and include team rankings and member contributions. Only verified eligible activities inside the competition dates and membership windows contribute to scores. Trainer-program assignments to teams or competitions are not included in this phase.

## Main screens

- `/` — member dashboard, suggested workout, active challenge, leaderboard, weekly activity, and recent community posts.
- `/workouts` — searchable, filterable workout library and workout session logging.
- `/activities` — manual outdoor activity log for running, cycling, hiking, walking, and other exercise.
- `/events` — public event discovery, registration, and event creation for authorized organizers.
- `/teams` — public team discovery and member/captain team management.
- `/competitions` — public competition discovery, team entry, verified standings, and contribution details.
- `/challenges` — challenge discovery, joining, completion, and leaderboard.
- `/community` — post feed, post creation, reactions, and comments.
- `/profile` — profile editing, photo upload, points, activity totals, achievements, and sign out.
- `/members/{id}` — public member summary, points, workouts, challenge participation, and achievements.
- `/trainer` — trainer metrics and workout/challenge creation; shown to accounts signed in with the Trainer role.
- `/admin` — custom administrator portal for accounts, trainer approvals, activity reviews, and platform summary.
- `/login` — member/trainer login and registration. The Administrator link opens the custom portal.

## API reference

API base URL: `http://localhost:8000/api/`. Browse endpoints are generally public; endpoints that change account or app data require authentication. The API uses JWT bearer tokens.

| Route | Purpose |
| --- | --- |
| `POST /auth/register/` | Create a member or trainer account; admin cannot be selected. |
| `POST /auth/token/` | Sign in with `username`, `password`, and selected `role: member\|trainer\|admin`. The admin role is limited to Django staff accounts. |
| `POST /auth/token/refresh/` | Exchange a refresh token for a new access token. |
| `GET/PATCH /me/`, `POST /me/photo/` | Read or update the signed-in user's profile and upload a profile photo (up to 5 MB). |
| `GET /dashboard/`, `GET /members/{id}/` | Read the signed-in dashboard or a public member summary. |
| `GET /admin/overview/` | Staff-only counts for members, trainers, pending applications and activities, challenges, and posts. |
| `GET /admin/accounts/?search={query}` | Staff-only paginated member/trainer account directory. |
| `POST /admin/accounts/{id}/status/` | Staff-only account suspension/reactivation using `is_active`. |
| `GET /admin/trainers/?status=pending` | Staff-only paginated trainer applications; `status=all` includes every trainer. |
| `POST /admin/trainers/{id}/review/` | Staff-only trainer application decision using `status: approved\|rejected`. |
| `GET /exercises/` | Browse approved exercises; supports difficulty, equipment, source, and search filters. |
| `GET/POST /workouts/` | Browse published workouts or submit trainer/admin content. Supports mode, difficulty, and goal filters. |
| `GET/POST /workout-sessions/` | Read or record the signed-in user's workout sessions. |
| `GET/POST /outdoor-activities/` | Read or record the signed-in user's outdoor activities. |
| `GET /activity-records/` | Read the signed-in user's unified completed-activity history; SaaS administrators can filter all records by verification status. |
| `POST /activity-records/{id}/verify/`, `POST /activity-records/{id}/reject/` | SaaS administrator review of a pending activity record; optional `review_notes`. |
| `GET/POST /teams/`, `GET/PATCH/DELETE /teams/{id}/` | Discover teams, create a team, or manage a team as its captain. Team actions include join requests, request approval, invitations, roster management, captain transfer, and leaving. |
| `GET/POST /team-invitations/` | Read invitations for the signed-in member; invitation actions accept or decline. |
| `GET/POST /events/`, `GET /events/{id}/` | Discover published events or create an event as an approved trainer, SaaS administrator, or team captain organizing for their team. |
| `POST /events/{id}/join/`, `POST /event-registrations/{id}/cancel/` | Register for a free event or as a team, or cancel a registration when authorized. |
| `POST /events/{id}/checkout/` | Start PayChangu checkout for an event with a registration fee. |
| `POST /event-payments/verify/`, `POST /event-payments/callback/` | Verify payment status with PayChangu and confirm the attendee registration. |
| `POST /outdoor-activities/` | Save an outdoor activity. GPS challenge completion includes `challenge_requirement` and timestamped `route_data` points; distance is recalculated by the server. |
| `GET/POST /competitions/`, `GET /competitions/{id}/standings/` | Discover competitions, create one as an approved trainer or SaaS administrator, and read team standings and member contributions. |
| `POST /competitions/{id}/join/` | Enter a team in an open competition as its captain, subject to team-size requirements. |
| `GET/POST /challenges/` | Browse published challenges or submit trainer/admin content. Supports difficulty, goal, and `category` filters. Challenge creation accepts workout day requirements with configured exercises, or `activity_type: "running"` / `"cycling"` GPS-tracked requirements for each day. |
| `POST /challenges/{id}/join/`, `GET /challenges/{id}/my_progress/`, `GET /challenges/{id}/members/` | Join a challenge, read the signed-in participant's progress, or page through the member roster (`?page=1`). |
| `GET/POST /challenge-completions/` | Read or record the signed-in user's scheduled challenge completions and points. |
| `GET/POST /posts/`, `POST /posts/{id}/react/`, `POST /posts/{id}/report/` | Browse/create posts, toggle a reaction, or submit a report. |
| `GET/POST /comments/` | Browse or add comments. `?post={id}` filters comments by post. |
| `GET/POST /friends/`, `GET /friends/status/?member_id={id}` | List incoming/outgoing friend requests and friends, send a request, or check a member relationship. |
| `POST /friends/requests/{id}/respond/` | Accept or decline an incoming friend request with `decision: accept\|decline`. |
| `GET/POST /conversations/`, `GET/POST /conversations/{id}/messages/` | List/start conversations with accepted friends and read or send direct messages. |
| `GET /leaderboard/?scope=global\|area\|city\|country&challenge={id}` | Rank members by points, optionally filtered by location or challenge. Location scopes accept an optional `location` query value and otherwise use the signed-in user's profile location. |
| `GET/POST /trainer/apply/`, `GET /trainer/metrics/` | Read/update a trainer application or retrieve approved-trainer metrics. |

## Local development

### Prerequisites

- Python and Node.js/npm.
- PostgreSQL running locally. Django uses PostgreSQL by default; a `db.sqlite3` file in the repository does not change that configuration.

### 1. Start the Django API

In PowerShell from the repository root:

```powershell
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
# Edit backend\.env with a local Django secret and PostgreSQL connection details.
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r backend\requirements.txt
py backend\manage.py migrate
py backend\manage.py import_repdb_exercises --dataset-dir .\exercise-dataset-main\exercise-dataset-main --dry-run
py backend\manage.py import_repdb_exercises --dataset-dir .\exercise-dataset-main\exercise-dataset-main
py backend\manage.py runserver
```

The RepDB dataset is not included in this repository. Obtain the free-tier dataset from [RepDB's official dataset repository](https://github.com/RepDB/exercise-dataset) and extract it locally to `exercise-dataset-main\exercise-dataset-main`; do not commit or redistribute the dataset. The free-tier license allows in-app use with attribution, but prohibits redistribution as a dataset. Do not use the paid-tier preview assets in `premium-samples` in production.

The dry run validates the local RepDB JSON file; the import command loads the exercises and illustrations into the configured database and `backend\media`. It is safe to rerun to update the imported records. The API is at `http://localhost:8000/api/` and Django Admin is at `http://localhost:8000/admin/`. Create an administrator with `py backend\manage.py createsuperuser`. A new database has no PrimeFit workouts or challenges; add them through Django Admin or submit trainer content and publish it from Admin. The exercise picker displays the required RepDB attribution.

### 2. Start the Next.js frontend

In a second PowerShell terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The frontend calls `http://localhost:8000/api` by default. Set `NEXT_PUBLIC_API_URL` to use a different API URL. The app loads and saves database-backed content through the running API; when the API or database is unavailable, the frontend cannot persist activity.

### Deploy to Render and Vercel

The root `render.yaml` configures the Django API service. In Render, create a PostgreSQL database and set the service's `DATABASE_URL` to its **internal** connection URL. Set `CORS_ALLOWED_ORIGINS` and `FRONTEND_URL` to the deployed Vercel origin (for example, `https://your-app.vercel.app`). The service uses `primefit_api.wsgi`, installs Gunicorn, collects Django static files, and runs migrations before starting.

In Vercel, import this repository and set the project's **Root Directory** to `frontend`. Add `NEXT_PUBLIC_API_URL` with the Render API URL ending in `/api` (for example, `https://primefit-api.onrender.com/api`), then deploy. If Render assigns a different service hostname, update the API URL and the backend's `DJANGO_ALLOWED_HOSTS` setting accordingly.

Render's local filesystem is ephemeral, and this project does not yet configure persistent/object storage for user uploads. Profile photos, community images, event flyers, and imported exercise images need a durable media-storage solution before relying on them in production.

### Tests and checks

Run the API test suite from the repository root:

```powershell
py backend\manage.py test primefit.test_api
```

Run frontend linting from `frontend` with `npm run lint`, or create a production build with `npm run build`.

## Data and access notes

- Django reads configuration from `backend\.env`; keep it local and do not commit it. The example uses PostgreSQL on `localhost:5432` and allows the local frontend origin.
- Access tokens last 30 minutes and refresh tokens last 7 days. The browser stores JWTs in local storage and sends the access token as a bearer token.
- Member login requires the user to select a role. Trainer login requires a trainer profile; administrators sign in through `/admin` using the `admin` role. Public signup accepts only member or trainer roles.
- Challenge completion and reactions have database uniqueness constraints to prevent duplicate completion rewards and duplicate reactions. Points are recorded as transactions and summed for dashboards and leaderboards.
- Profile photos and other uploaded images use Django media storage locally. Set a strong `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=0`, appropriate `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`, and production-grade private/object media storage before deployment.
- Outdoor activity logging remains manual, not GPS tracking, and is currently hidden from member-facing navigation. Friend requests and direct messages are available between accepted friends; private groups, video, wearables, trainer direct messaging, and automated trainer commission calculations are not implemented.
