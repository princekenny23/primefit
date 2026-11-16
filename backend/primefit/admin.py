from django.contrib import admin
from django.utils import timezone
from .models import (Profile, Trainer, Exercise, Workout, WorkoutExercise, WorkoutSession, OutdoorActivity, ActivityRecord,
    Challenge, ChallengeWorkout, ChallengeParticipant, ChallengeCompletion, PointTransaction,
    Post, Comment, Reaction, Achievement, UserAchievement, Notification, Report, Team, TeamMembership,
    TeamJoinRequest, TeamInvitation, AdventureEvent, EventRegistration, EventPayment, ChallengePayment, Competition, CompetitionEntry,
    NutritionGoal, MealPlan, Meal, NutritionSupplement)

class WorkoutExerciseInline(admin.TabularInline):
    model = WorkoutExercise
    extra = 0
class ChallengeWorkoutInline(admin.TabularInline):
    model = ChallengeWorkout
    extra = 0

class MealInline(admin.TabularInline):
    model = Meal
    extra = 0

@admin.register(NutritionGoal)
class NutritionGoalAdmin(admin.ModelAdmin):
    list_display = ("label", "slug", "position", "is_active")
    list_editable = ("position", "is_active")
    search_fields = ("label", "slug")

@admin.register(MealPlan)
class MealPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "goal", "professional", "is_published", "updated_at")
    list_filter = ("goal", "is_published")
    search_fields = ("name", "description", "professional")
    prepopulated_fields = {"slug": ("name",)}
    inlines = (MealInline,)

@admin.register(NutritionSupplement)
class NutritionSupplementAdmin(admin.ModelAdmin):
    list_display = ("name", "goal", "category", "position", "is_published")
    list_filter = ("goal", "is_published")
    search_fields = ("name", "category", "summary")

@admin.register(Workout)
class WorkoutAdmin(admin.ModelAdmin):
    list_display = ("title", "mode", "difficulty", "status", "creator")
    list_filter = ("status", "mode", "difficulty", "goal")
    search_fields = ("title", "description")
    inlines = (WorkoutExerciseInline,)

@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "source", "equipment", "body_part", "difficulty", "approved")
    list_filter = ("source", "difficulty", "approved")
    search_fields = ("name", "external_id", "equipment", "body_part")

@admin.register(Challenge)
class ChallengeAdmin(admin.ModelAdmin):
    list_display = ("title", "activity_category", "registration_fee", "currency", "status", "starts_at", "creator")
    list_filter = ("status", "activity_category", "goal")
    search_fields = ("title", "description")
    exclude = ("difficulty",)
    inlines = (ChallengeWorkoutInline,)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if obj.status == "published":
            for requirement in obj.requirements.select_related("workout").filter(workout__status="pending"):
                requirement.workout.status = "published"
                requirement.workout.save(update_fields=["status"])
@admin.register(Trainer)
class TrainerAdmin(admin.ModelAdmin):
    list_display = ("user", "expertise", "status", "applied_at", "eligible_earnings")
    list_filter = ("status",)
    actions = ("approve_trainers",)
    @admin.action(description="Approve selected trainer applications")
    def approve_trainers(self, request, queryset):
        from django.utils import timezone
        queryset.update(status="approved", approved_at=timezone.now())

for model in (Profile, WorkoutSession, OutdoorActivity, ChallengeParticipant, ChallengeCompletion,
              PointTransaction, Post, Comment, Reaction, Achievement, UserAchievement,
              Notification, Report):
    admin.site.register(model)

@admin.register(ActivityRecord)
class ActivityRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "activity_type", "completed_at", "source", "verification_status", "verified_by")
    list_filter = ("activity_type", "source", "verification_status")
    search_fields = ("user__username", "notes", "review_notes")
    readonly_fields = ("created_at",)
    actions = ("verify_records", "reject_records")

    @admin.action(description="Verify selected pending activity records")
    def verify_records(self, request, queryset):
        queryset.filter(verification_status="pending").update(
            verification_status="verified",
            verified_by=request.user,
            verified_at=timezone.now(),
        )

    @admin.action(description="Reject selected pending activity records")
    def reject_records(self, request, queryset):
        queryset.filter(verification_status="pending").update(
            verification_status="rejected",
            verified_by=request.user,
            verified_at=timezone.now(),
        )

class TeamMembershipInline(admin.TabularInline):
    model = TeamMembership
    extra = 0

@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "captain", "city", "country", "created_at")
    search_fields = ("name", "city", "country", "captain__username")
    inlines = (TeamMembershipInline,)

@admin.register(TeamJoinRequest)
class TeamJoinRequestAdmin(admin.ModelAdmin):
    list_display = ("team", "user", "status", "requested_at", "reviewed_at")
    list_filter = ("status",)
    search_fields = ("team__name", "user__username")

@admin.register(TeamInvitation)
class TeamInvitationAdmin(admin.ModelAdmin):
    list_display = ("team", "invitee", "invited_by", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("team__name", "invitee__username", "invited_by__username")

@admin.register(AdventureEvent)
class AdventureEventAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "registration_fee", "currency", "location", "starts_at", "organizer", "status")
    list_filter = ("category", "difficulty", "status")
    search_fields = ("title", "location", "organizer__username")
    readonly_fields = ("created_at",)
    fieldsets = (
        ("Event details", {"fields": ("title", "description", "flyer", "category", "difficulty", "requirements")}),
        ("Schedule and location", {"fields": ("starts_at", "ends_at", "location", "meeting_point")}),
        ("Registration", {"fields": ("registration_fee", "currency", "participant_limit")}),
        ("Organizer", {"fields": ("organizer", "organizer_team", "status", "created_at")}),
    )

@admin.register(EventRegistration)
class EventRegistrationAdmin(admin.ModelAdmin):
    list_display = ("event", "user", "team", "status", "registered_at")
    list_filter = ("status",)
    search_fields = ("event__title", "user__username", "team__name")

@admin.register(EventPayment)
class EventPaymentAdmin(admin.ModelAdmin):
    list_display = ("event", "user", "amount", "currency", "status", "tx_ref", "created_at")
    list_filter = ("status", "currency")
    search_fields = ("event__title", "user__username", "tx_ref", "provider_reference")
    readonly_fields = ("tx_ref", "provider_reference", "amount", "currency", "user", "event", "created_at", "paid_at", "registration")


@admin.register(ChallengePayment)
class ChallengePaymentAdmin(admin.ModelAdmin):
    list_display = ("challenge", "user", "amount", "currency", "status", "tx_ref", "created_at")
    list_filter = ("status", "currency")
    search_fields = ("challenge__title", "user__username", "tx_ref", "provider_reference")
    readonly_fields = ("tx_ref", "provider_reference", "amount", "currency", "user", "challenge", "created_at", "paid_at")


class CompetitionEntryInline(admin.TabularInline):
    model = CompetitionEntry
    extra = 0

@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    list_display = ("title", "starts_on", "ends_on", "scoring_mode", "status", "organizer")
    list_filter = ("status", "scoring_mode")
    search_fields = ("title", "organizer__username")
    inlines = (CompetitionEntryInline,)
