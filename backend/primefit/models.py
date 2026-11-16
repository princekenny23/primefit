import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

User = settings.AUTH_USER_MODEL

class Profile(models.Model):
    LEVELS = [("beginner", "Beginner"), ("intermediate", "Intermediate"), ("advanced", "Advanced")]
    GOALS = [
        ("strength", "Strength & muscle building"),
        ("fitness", "Full body fitness"),
        ("weight", "Weight management"),
        ("mobility", "Flexibility and mobility"),
        ("cardio", "Cardio & fat burning"),
        ("core", "Core & abs"),
        ("lower_body", "Lower body fitness"),
        ("upper_body", "Upper body fitness"),
        ("endurance", "Muscle endurance"),
    ]
    PREFERENCES = [("gym", "Gym"), ("home", "Home"), ("both", "Both")]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=80, blank=True)
    bio = models.CharField(max_length=240, blank=True)
    fitness_level = models.CharField(max_length=20, choices=LEVELS, default="beginner")
    fitness_goal = models.CharField(max_length=20, choices=GOALS, default="fitness")
    workout_preference = models.CharField(max_length=10, choices=PREFERENCES, default="both")
    area = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=80, blank=True)
    country = models.CharField(max_length=80, blank=True, default="Malawi")
    photo = models.ImageField(upload_to="profiles/", blank=True)
    cover_photo = models.ImageField(upload_to="profile_covers/", blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self): return self.display_name or self.user.username

class NutritionGoal(models.Model):
    slug = models.SlugField(max_length=60, unique=True)
    label = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "label"]

    def __str__(self): return self.label

class MealPlan(models.Model):
    slug = models.SlugField(max_length=100, unique=True)
    goal = models.ForeignKey(NutritionGoal, on_delete=models.PROTECT, related_name="meal_plans")
    name = models.CharField(max_length=140)
    cover_image = models.ImageField(upload_to="nutrition/plans/", blank=True)
    description = models.TextField()
    schedule = models.TextField()
    duration = models.CharField(max_length=80)
    professional = models.CharField(max_length=120)
    credentials = models.CharField(max_length=160, blank=True)
    nutrition_notes = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self): return self.name

class Meal(models.Model):
    meal_plan = models.ForeignKey(MealPlan, on_delete=models.CASCADE, related_name="meals")
    name = models.CharField(max_length=140)
    time = models.CharField(max_length=120)
    ingredients = models.TextField()
    quantity = models.TextField()
    preparation = models.TextField()
    alternative = models.TextField(blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self): return self.name

class NutritionSupplement(models.Model):
    goal = models.ForeignKey(NutritionGoal, on_delete=models.PROTECT, related_name="supplements")
    name = models.CharField(max_length=140)
    category = models.CharField(max_length=100)
    image = models.ImageField(upload_to="nutrition/supplements/", blank=True)
    summary = models.TextField()
    usage_guidance = models.TextField()
    note = models.TextField()
    position = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ["position", "name", "id"]

    def __str__(self): return self.name

class Trainer(models.Model):
    STATUS = [("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="trainer")
    expertise = models.CharField(max_length=160)
    experience_years = models.PositiveSmallIntegerField(default=0)
    eligible_earnings = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=12, choices=STATUS, default="pending")
    applied_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

class Exercise(models.Model):
    name = models.CharField(max_length=100)
    instructions = models.TextField()
    illustration = models.ImageField(upload_to="exercises/", blank=True)
    source = models.CharField(max_length=30, default="primefit")
    external_id = models.CharField(max_length=160, blank=True)
    equipment = models.CharField(max_length=100, blank=True)
    body_part = models.CharField(max_length=100, blank=True)
    difficulty = models.CharField(max_length=20, blank=True)
    primary_muscles = models.JSONField(default=list, blank=True)
    goals = models.JSONField(default=list, blank=True)
    tags = models.JSONField(default=list, blank=True)
    met = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    approved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("source", "external_id"), name="unique_exercise_source_id"),
        ]
    def __str__(self): return self.name

class Workout(models.Model):
    MODES = [("gym", "Gym"), ("home", "Home")]
    LEVELS = Profile.LEVELS
    STATUS = [("draft", "Draft"), ("pending", "Pending approval"), ("published", "Published"), ("archived", "Archived")]
    title = models.CharField(max_length=140)
    description = models.TextField()
    mode = models.CharField(max_length=8, choices=MODES)
    difficulty = models.CharField(max_length=20, choices=LEVELS)
    goal = models.CharField(max_length=20, choices=Profile.GOALS, default="fitness")
    duration_minutes = models.PositiveSmallIntegerField(default=20)
    creator = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="workouts")
    status = models.CharField(max_length=12, choices=STATUS, default="published")
    created_at = models.DateTimeField(auto_now_add=True)
    exercises = models.ManyToManyField(Exercise, through="WorkoutExercise", related_name="workouts")
    class Meta: ordering = ["difficulty", "title"]
    def __str__(self): return self.title

class WorkoutExercise(models.Model):
    workout = models.ForeignKey(Workout, on_delete=models.CASCADE, related_name="workout_exercises")
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT)
    order = models.PositiveSmallIntegerField(default=0)
    sets = models.PositiveSmallIntegerField(default=3)
    reps = models.CharField(max_length=30, default="10")
    rest_seconds = models.PositiveSmallIntegerField(default=45)
    instructions = models.TextField(blank=True)
    class Meta:
        ordering = ["order"]
        unique_together = [("workout", "order")]

class WorkoutSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workout_sessions")
    workout = models.ForeignKey(Workout, on_delete=models.PROTECT, related_name="sessions")
    completed_at = models.DateTimeField(default=timezone.now)
    notes = models.CharField(max_length=240, blank=True)
    progress_recorded = models.BooleanField(default=False)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    sets_completed = models.PositiveSmallIntegerField(null=True, blank=True)
    class Meta: ordering = ["-completed_at"]

class Challenge(models.Model):
    LEVELS = Profile.LEVELS
    ACTIVITY_CATEGORIES = [
        ("general", "General fitness"),
        ("boxing", "Boxing"),
        ("running", "Running"),
        ("cycling", "Cycling"),
    ]
    STATUS = [("draft", "Draft"), ("pending", "Pending approval"), ("published", "Published"), ("archived", "Archived")]
    title = models.CharField(max_length=140)
    description = models.TextField()
    image = models.ImageField(upload_to="challenges/", blank=True)
    creator = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_challenges")
    duration_days = models.PositiveSmallIntegerField(default=14)
    difficulty = models.CharField(max_length=20, choices=LEVELS, default="beginner")
    goal = models.CharField(max_length=20, choices=Profile.GOALS, default="fitness")
    activity_category = models.CharField(max_length=12, choices=ACTIVITY_CATEGORIES, default="general")
    rules = models.TextField(blank=True)
    points_per_completion = models.PositiveSmallIntegerField(default=50)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, choices=[("MWK", "MWK"), ("USD", "USD")], default="MWK")
    starts_at = models.DateField(default=timezone.localdate)
    ends_at = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default="published")
    allow_multiple = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    workouts = models.ManyToManyField(Workout, through="ChallengeWorkout", related_name="challenges")
    class Meta: ordering = ["starts_at", "title"]
    def __str__(self): return self.title

class ChallengeWorkout(models.Model):
    ACTIVITY_TYPES = [("workout", "Workout"), ("running", "Running"), ("cycling", "Cycling")]
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="requirements")
    workout = models.ForeignKey(Workout, null=True, blank=True, on_delete=models.PROTECT)
    activity_type = models.CharField(max_length=8, choices=ACTIVITY_TYPES, default="workout")
    day_number = models.PositiveSmallIntegerField()
    points = models.PositiveSmallIntegerField(null=True, blank=True)

    @property
    def title(self):
        if self.workout_id:
            return self.workout.title
        return f"{self.get_activity_type_display()} · Day {self.day_number}"

    class Meta:
        ordering = ["day_number"]
        unique_together = [("challenge", "day_number", "workout")]

class ChallengeParticipant(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="challenge_participations")
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="participants")
    joined_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        unique_together = [("user", "challenge")]
        ordering = ["joined_at"]

class OutdoorActivity(models.Model):
    TYPES = [("running", "Running"), ("cycling", "Cycling"), ("hiking", "Hiking"), ("walking", "Walking"), ("other", "Other")]
    SOURCES = [("manual", "Manual"), ("gps", "GPS"), ("imported", "Imported")]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="outdoor_activities")
    challenge = models.ForeignKey(Challenge, null=True, blank=True, on_delete=models.SET_NULL, related_name="outdoor_activities")
    challenge_requirement = models.ForeignKey(
        ChallengeWorkout, null=True, blank=True, on_delete=models.SET_NULL, related_name="outdoor_activities"
    )
    activity_type = models.CharField(max_length=8, choices=TYPES)
    started_at = models.DateTimeField(default=timezone.now)
    duration_seconds = models.PositiveIntegerField()
    distance_km = models.DecimalField(max_digits=7, decimal_places=2)
    elevation_gain_m = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=240, blank=True)
    source = models.CharField(max_length=8, choices=SOURCES, default="manual")
    route_data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-started_at"]

class ActivityRecord(models.Model):
    TYPES = [
        ("workout", "Workout"),
        ("running", "Running"),
        ("cycling", "Cycling"),
        ("hiking", "Hiking"),
        ("walking", "Walking"),
        ("other", "Other"),
    ]
    SOURCES = [("workout", "Workout session"), ("manual", "Manual"), ("gps", "GPS"), ("imported", "Imported")]
    VERIFICATION_STATUSES = [
        ("pending", "Pending verification"),
        ("verified", "Verified"),
        ("rejected", "Rejected"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activity_records")
    activity_type = models.CharField(max_length=8, choices=TYPES)
    workout = models.ForeignKey(Workout, null=True, blank=True, on_delete=models.PROTECT, related_name="activity_records")
    workout_session = models.OneToOneField(
        WorkoutSession, null=True, blank=True, on_delete=models.CASCADE, related_name="activity_record"
    )
    outdoor_activity = models.OneToOneField(
        OutdoorActivity, null=True, blank=True, on_delete=models.CASCADE, related_name="activity_record"
    )
    event_registration = models.ForeignKey(
        "EventRegistration", null=True, blank=True, on_delete=models.SET_NULL, related_name="activity_records"
    )
    completed_at = models.DateTimeField(default=timezone.now)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    distance_km = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    elevation_gain_m = models.PositiveIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    sets_completed = models.PositiveSmallIntegerField(null=True, blank=True)
    notes = models.CharField(max_length=240, blank=True)
    source = models.CharField(max_length=8, choices=SOURCES)
    verification_status = models.CharField(max_length=12, choices=VERIFICATION_STATUSES, default="pending")
    verified_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="verified_activity_records"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_at", "-id"]

    def __str__(self):
        return f"{self.get_activity_type_display()} by {self.user} at {self.completed_at:%Y-%m-%d %H:%M}"

class ChallengeCompletion(models.Model):
    participant = models.ForeignKey(ChallengeParticipant, on_delete=models.CASCADE, related_name="completions")
    requirement = models.ForeignKey(ChallengeWorkout, on_delete=models.PROTECT, related_name="completions")
    activity_record = models.ForeignKey(
        ActivityRecord, null=True, blank=True, on_delete=models.SET_NULL, related_name="challenge_completions"
    )
    completed_at = models.DateTimeField(default=timezone.now)
    points_awarded = models.PositiveSmallIntegerField()
    class Meta:
        unique_together = [("participant", "requirement")]
        constraints = [
            models.UniqueConstraint(
                fields=("participant", "activity_record"),
                condition=models.Q(activity_record__isnull=False),
                name="unique_challenge_participant_activity",
            ),
        ]
        ordering = ["-completed_at"]

class PointTransaction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="point_transactions")
    challenge = models.ForeignKey(Challenge, null=True, blank=True, on_delete=models.SET_NULL, related_name="point_transactions")
    points = models.IntegerField()
    reason = models.CharField(max_length=140)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: ordering = ["-created_at"]

class Post(models.Model):
    TYPES = [("progress", "Workout progress"), ("achievement", "Achievement"), ("community", "Community")]
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="posts")
    body = models.CharField(max_length=1000)
    image = models.ImageField(upload_to="community/", blank=True)
    post_type = models.CharField(max_length=16, choices=TYPES, default="community")
    challenge = models.ForeignKey(Challenge, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    is_hidden = models.BooleanField(default=False)
    class Meta: ordering = ["-created_at"]

class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="comments")
    body = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    is_hidden = models.BooleanField(default=False)
    class Meta: ordering = ["created_at"]


class FriendRequest(models.Model):
    STATUSES = [("pending", "Pending"), ("accepted", "Accepted"), ("declined", "Declined")]
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friend_requests_sent")
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friend_requests_received")
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=("sender", "receiver"), name="unique_friend_request_direction"),
            models.CheckConstraint(condition=~models.Q(sender=models.F("receiver")), name="friend_request_not_self"),
        ]


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following")
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name="followers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("follower", "following"), name="unique_member_follow"),
            models.CheckConstraint(condition=~models.Q(follower=models.F("following")), name="follow_not_self"),
        ]


class Conversation(models.Model):
    user_a = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conversations_as_a")
    user_b = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conversations_as_b")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=("user_a", "user_b"), name="unique_conversation_pair"),
            models.CheckConstraint(condition=models.Q(user_a__lt=models.F("user_b")), name="conversation_users_in_order"),
        ]

    def other_user(self, user):
        return self.user_b if self.user_a_id == user.id else self.user_a


class DirectMessage(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="direct_messages")
    body = models.CharField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Reaction(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reactions")
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta: unique_together = [("post", "user")]

class Achievement(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=240)
    icon = models.CharField(max_length=32, default="trophy")

class UserAchievement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="achievements")
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE)
    earned_at = models.DateTimeField(auto_now_add=True)
    class Meta: unique_together = [("user", "achievement")]

class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    message = models.CharField(max_length=240)
    link = models.CharField(max_length=240, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Report(models.Model):
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports_made")
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE)
    comment = models.ForeignKey(Comment, null=True, blank=True, on_delete=models.CASCADE)
    reason = models.CharField(max_length=240)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Team(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    logo = models.ImageField(upload_to="teams/", blank=True)
    area = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=80, blank=True)
    country = models.CharField(max_length=80, blank=True, default="Malawi")
    captain = models.ForeignKey(User, on_delete=models.PROTECT, related_name="captained_teams")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_teams")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class TeamMembership(models.Model):
    ROLES = [("captain", "Captain"), ("member", "Member")]
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="team_memberships")
    role = models.CharField(max_length=10, choices=ROLES, default="member")
    joined_at = models.DateTimeField(default=timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["joined_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=("user",),
                condition=models.Q(left_at__isnull=True),
                name="unique_active_team_per_user",
            ),
            models.UniqueConstraint(
                fields=("team",),
                condition=models.Q(role="captain", left_at__isnull=True),
                name="unique_active_team_captain",
            ),
        ]


class TeamJoinRequest(models.Model):
    STATUSES = [("pending", "Pending"), ("accepted", "Accepted"), ("rejected", "Rejected"), ("cancelled", "Cancelled")]
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="join_requests")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="team_join_requests")
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-requested_at"]
        constraints = [
            models.UniqueConstraint(
                fields=("team", "user"),
                condition=models.Q(status="pending"),
                name="unique_pending_team_join_request",
            ),
        ]


class TeamInvitation(models.Model):
    STATUSES = [("pending", "Pending"), ("accepted", "Accepted"), ("declined", "Declined"), ("revoked", "Revoked")]
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="invitations")
    invitee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="team_invitations")
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="team_invitations_sent")
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=("team", "invitee"),
                condition=models.Q(status="pending"),
                name="unique_pending_team_invitation",
            ),
        ]


class AdventureEvent(models.Model):
    CATEGORIES = OutdoorActivity.TYPES + [("workout", "Workout")]
    DIFFICULTIES = Profile.LEVELS
    STATUSES = [("published", "Published"), ("cancelled", "Cancelled")]
    title = models.CharField(max_length=140)
    description = models.TextField()
    flyer = models.ImageField(upload_to="events/flyers/", blank=True)
    category = models.CharField(max_length=8, choices=CATEGORIES)
    location = models.CharField(max_length=160)
    meeting_point = models.CharField(max_length=240)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTIES)
    participant_limit = models.PositiveIntegerField(null=True, blank=True)
    registration_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, choices=[("MWK", "MWK"), ("USD", "USD")], default="MWK")
    requirements = models.TextField(blank=True)
    organizer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="organized_events")
    organizer_team = models.ForeignKey(
        Team, null=True, blank=True, on_delete=models.SET_NULL, related_name="organized_events"
    )
    status = models.CharField(max_length=10, choices=STATUSES, default="published")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["starts_at", "title"]

    def __str__(self):
        return self.title


class EventRegistration(models.Model):
    STATUSES = [("registered", "Registered"), ("cancelled", "Cancelled")]
    event = models.ForeignKey(AdventureEvent, on_delete=models.CASCADE, related_name="registrations")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="event_registrations")
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.CASCADE, related_name="event_registrations")
    status = models.CharField(max_length=12, choices=STATUSES, default="registered")
    participant_count = models.PositiveIntegerField(default=1)
    first_name = models.CharField(max_length=80, blank=True)
    last_name = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["registered_at"]
        constraints = [
            models.UniqueConstraint(
                fields=("event", "user"),
                condition=models.Q(status="registered", team__isnull=True),
                name="unique_active_individual_event_registration",
            ),
            models.UniqueConstraint(
                fields=("event", "team"),
                condition=models.Q(status="registered", team__isnull=False),
                name="unique_active_team_event_registration",
            ),
        ]


class EventPayment(models.Model):
    STATUSES = [("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed")]
    event = models.ForeignKey(AdventureEvent, on_delete=models.CASCADE, related_name="payments")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="event_payments")
    tx_ref = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    provider_reference = models.CharField(max_length=120, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    registration = models.OneToOneField(
        EventRegistration, null=True, blank=True, on_delete=models.SET_NULL, related_name="payment"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event.title} · {self.tx_ref}"


class ChallengePayment(models.Model):
    STATUSES = EventPayment.STATUSES
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="payments")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="challenge_payments")
    tx_ref = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    provider_reference = models.CharField(max_length=120, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.challenge.title} · {self.tx_ref}"


class Competition(models.Model):
    SCORING_MODES = [
        ("activity_count", "Number of verified activities"),
        ("distance_km", "Verified distance (km)"),
        ("duration_minutes", "Verified duration (minutes)"),
    ]
    STATUSES = [("open", "Open"), ("cancelled", "Cancelled")]
    title = models.CharField(max_length=140)
    description = models.TextField()
    rules = models.TextField()
    starts_on = models.DateField()
    ends_on = models.DateField()
    eligible_activity_types = models.JSONField(default=list)
    scoring_mode = models.CharField(max_length=20, choices=SCORING_MODES)
    min_team_size = models.PositiveSmallIntegerField(default=1)
    max_team_size = models.PositiveSmallIntegerField(null=True, blank=True)
    organizer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="organized_competitions")
    status = models.CharField(max_length=10, choices=STATUSES, default="open")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["starts_on", "title"]

    def __str__(self):
        return self.title


class CompetitionEntry(models.Model):
    STATUSES = [("registered", "Registered"), ("withdrawn", "Withdrawn")]
    competition = models.ForeignKey(Competition, on_delete=models.CASCADE, related_name="entries")
    team = models.ForeignKey(Team, on_delete=models.PROTECT, related_name="competition_entries")
    registered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="competition_entries")
    status = models.CharField(max_length=12, choices=STATUSES, default="registered")
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["registered_at"]
        constraints = [
            models.UniqueConstraint(
                fields=("competition", "team"),
                condition=models.Q(status="registered"),
                name="unique_active_competition_team",
            ),
        ]
