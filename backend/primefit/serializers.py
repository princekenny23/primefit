import math

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from datetime import datetime, time, timedelta
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (Profile, Trainer, Exercise, Workout, WorkoutExercise, WorkoutSession, ActivityRecord,
    Challenge, ChallengeWorkout, ChallengeParticipant, ChallengeCompletion, Post, Comment, Reaction,
    PointTransaction, UserAchievement, OutdoorActivity, Team, TeamMembership, TeamJoinRequest,
    TeamInvitation, AdventureEvent, EventRegistration, ChallengePayment, Competition, CompetitionEntry, FriendRequest,
    Conversation, DirectMessage, NutritionGoal, MealPlan, Meal, NutritionSupplement)

User = get_user_model()

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        exclude = ("user", "created_at", "last_seen")
        read_only_fields = ("photo", "cover_photo")

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    display_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=("member", "trainer"), write_only=True)
    expertise = serializers.CharField(max_length=160, required=False, allow_blank=False, write_only=True)
    experience_years = serializers.IntegerField(min_value=0, max_value=99, required=False, write_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password", "display_name", "role", "expertise", "experience_years")
        read_only_fields = ("id",)

    def validate(self, attrs):
        if attrs["role"] == "trainer" and not attrs.get("expertise"):
            raise serializers.ValidationError({"expertise": "Enter your training expertise."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        display_name = validated_data.pop("display_name", "")
        role = validated_data.pop("role")
        expertise = validated_data.pop("expertise", "")
        experience_years = validated_data.pop("experience_years", 0)
        user = User.objects.create_user(**validated_data)
        Profile.objects.create(user=user, display_name=display_name or user.username)
        if role == "trainer":
            Trainer.objects.create(user=user, expertise=expertise, experience_years=experience_years, status="approved")
        return user

class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    role = serializers.ChoiceField(choices=("member", "trainer", "admin"))

    def validate(self, attrs):
        role = attrs.pop("role")
        data = super().validate(attrs)
        if role == "admin":
            if not self.user.is_staff:
                raise AuthenticationFailed("SaaS administrator access is required.")
        elif self.user.is_staff:
            raise AuthenticationFailed("SaaS administrator accounts must use the admin role.")
        elif role == "trainer":
            if not Trainer.objects.filter(user=self.user).exists():
                raise AuthenticationFailed("This account does not have a trainer profile.")
        data["role"] = role
        return data

class UserSummarySerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    fitness_level = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    cover_photo = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = ("id", "username", "name", "location", "fitness_level", "photo", "cover_photo")
    def get_name(self, obj):
        profile = getattr(obj, "profile", None)
        return (profile.display_name or obj.username) if profile else obj.username
    def get_location(self, obj):
        profile = getattr(obj, "profile", None)
        return ", ".join(filter(None, [profile.city, profile.country])) if profile else ""
    def get_fitness_level(self, obj):
        profile = getattr(obj, "profile", None)
        return profile.fitness_level if profile else "beginner"
    def get_photo(self, obj):
        profile = getattr(obj, "profile", None)
        if not profile or not profile.photo:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(profile.photo.url) if request else profile.photo.url
    def get_cover_photo(self, obj):
        profile = getattr(obj, "profile", None)
        if not profile or not profile.cover_photo:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(profile.cover_photo.url) if request else profile.cover_photo.url

class CommunityMemberSerializer(UserSummarySerializer):
    role = serializers.SerializerMethodField()
    expertise = serializers.SerializerMethodField()
    experience_years = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()

    class Meta(UserSummarySerializer.Meta):
        fields = UserSummarySerializer.Meta.fields + ("role", "expertise", "experience_years", "is_online", "is_following")

    def get_role(self, obj):
        trainer = getattr(obj, "trainer", None)
        return "trainer" if trainer and trainer.status == "approved" else "member"

    def get_expertise(self, obj):
        trainer = getattr(obj, "trainer", None)
        return trainer.expertise if trainer and trainer.status == "approved" else ""

    def get_experience_years(self, obj):
        trainer = getattr(obj, "trainer", None)
        return trainer.experience_years if trainer and trainer.status == "approved" else 0

    def get_is_online(self, obj):
        profile = getattr(obj, "profile", None)
        return bool(profile and profile.last_seen and profile.last_seen >= timezone.now() - timedelta(minutes=2))

    def get_is_following(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.followers.filter(follower=request.user).exists())

class MeSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer()
    points = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "profile", "points")
        read_only_fields = ("id", "points")
    def get_points(self, obj):
        return sum(obj.point_transactions.values_list("points", flat=True))
    @transaction.atomic
    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", {})
        for key, value in validated_data.items(): setattr(instance, key, value)
        instance.save()
        Profile.objects.update_or_create(user=instance, defaults=profile_data)
        return instance

class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = ("id", "name", "instructions", "illustration", "source", "external_id", "equipment", "body_part", "difficulty", "primary_muscles", "goals", "tags", "met")
        read_only_fields = fields

class WorkoutExerciseSerializer(serializers.ModelSerializer):
    exercise = ExerciseSerializer()
    class Meta:
        model = WorkoutExercise
        fields = ("id", "exercise", "order", "sets", "reps", "rest_seconds", "instructions")

class ExerciseInputSerializer(serializers.Serializer):
    exercise = serializers.PrimaryKeyRelatedField(queryset=Exercise.objects.filter(approved=True), required=False)
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    instructions = serializers.CharField(required=False, allow_blank=True)
    sets = serializers.IntegerField(min_value=1, default=3)
    reps = serializers.CharField(max_length=30, default="10")
    rest_seconds = serializers.IntegerField(min_value=0, default=45)

    def validate(self, attrs):
        if not attrs.get("exercise") and not attrs.get("name"):
            raise serializers.ValidationError("Choose an exercise or provide an exercise name.")
        return attrs

class WorkoutSerializer(serializers.ModelSerializer):
    workout_exercises = WorkoutExerciseSerializer(many=True, read_only=True)
    exercise_items = ExerciseInputSerializer(many=True, write_only=True, required=False)
    creator_name = serializers.SerializerMethodField()
    class Meta:
        model = Workout
        fields = ("id", "title", "description", "mode", "difficulty", "goal", "duration_minutes", "creator", "creator_name", "status", "workout_exercises", "exercise_items", "created_at")
        read_only_fields = ("id", "creator", "status", "created_at")
    def get_creator_name(self, obj): return obj.creator.profile.display_name if obj.creator and hasattr(obj.creator, "profile") else "PrimeFit"
    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("exercise_items", [])
        user = self.context["request"].user
        is_admin = user.is_staff
        validated_data["creator"] = user
        validated_data["status"] = "published"
        workout = Workout.objects.create(**validated_data)
        for index, item in enumerate(items):
            exercise = item.get("exercise")
            if exercise is None:
                exercise, _ = Exercise.objects.get_or_create(name=item["name"], defaults={"instructions": item.get("instructions", ""), "created_by": user, "approved": is_admin})
            WorkoutExercise.objects.create(workout=workout, exercise=exercise, order=index, sets=item["sets"], reps=item["reps"], rest_seconds=item["rest_seconds"])
        return workout

class ChallengeRequirementSerializer(serializers.ModelSerializer):
    workout_title = serializers.SerializerMethodField()
    workout_details = WorkoutSerializer(source="workout", read_only=True, allow_null=True)

    def get_workout_title(self, obj):
        return obj.title

    class Meta:
        model = ChallengeWorkout
        fields = ("id", "workout", "workout_title", "workout_details", "activity_type", "day_number", "points")

class ChallengeRequirementInputSerializer(serializers.Serializer):
    day_number = serializers.IntegerField(min_value=1)
    activity_type = serializers.ChoiceField(choices=ChallengeWorkout.ACTIVITY_TYPES, default="workout")
    workout = serializers.PrimaryKeyRelatedField(queryset=Workout.objects.all(), required=False, allow_null=True)
    title = serializers.CharField(max_length=140, required=False, allow_blank=True)
    mode = serializers.ChoiceField(choices=Workout.MODES, default="gym")
    duration_minutes = serializers.IntegerField(min_value=1, max_value=180, default=25)
    exercise_items = ExerciseInputSerializer(many=True, required=False)
    points = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        if attrs["activity_type"] in ("running", "cycling"):
            if attrs.get("workout") or attrs.get("exercise_items"):
                raise serializers.ValidationError("Running and cycling days are completed with GPS tracking, not a workout.")
            attrs.setdefault("title", f"{attrs['activity_type'].title()} · Day {attrs['day_number']}")
            return attrs
        if not attrs.get("workout") and not attrs.get("exercise_items"):
            raise serializers.ValidationError("Choose a workout or add at least one exercise for this day.")
        if attrs.get("exercise_items") and not attrs.get("title"):
            attrs["title"] = f"Challenge day {attrs['day_number']}"
        return attrs


class ChallengeSerializer(serializers.ModelSerializer):
    creator_name = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()
    joined = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    requirements = ChallengeRequirementSerializer(many=True, read_only=True)
    requirements_input = ChallengeRequirementInputSerializer(many=True, write_only=True)
    class Meta:
        model = Challenge
        fields = ("id", "title", "description", "image", "creator", "creator_name", "duration_days", "difficulty", "goal", "activity_category", "rules", "points_per_completion", "registration_fee", "currency", "starts_at", "ends_at", "status", "allow_multiple", "participant_count", "joined", "participants", "requirements", "requirements_input")
        read_only_fields = ("id", "creator", "status", "participant_count", "joined", "ends_at")
    def validate(self, attrs):
        registration_fee = attrs.get(
            "registration_fee",
            self.instance.registration_fee if self.instance else 0,
        )
        if registration_fee < 0:
            raise serializers.ValidationError({"registration_fee": "The registration fee cannot be negative."})
        requirements = attrs.get("requirements_input")
        if requirements is not None:
            duration = attrs.get("duration_days", self.instance.duration_days if self.instance else None)
            days = [item["day_number"] for item in requirements]
            if duration is None or len(days) != duration or set(days) != set(range(1, duration + 1)):
                raise serializers.ValidationError({
                    "requirements_input": "Provide exactly one activity for every challenge day."
                })
            category = attrs.get("activity_category", self.instance.activity_category if self.instance else "general")
            expected_type = category if category in ("running", "cycling") else "workout"
            if any(item["activity_type"] != expected_type for item in requirements):
                raise serializers.ValidationError({
                    "requirements_input": f"Every day in this challenge must be a {expected_type} activity."
                })
        return attrs
    def get_creator_name(self, obj): return obj.creator.profile.display_name if obj.creator and hasattr(obj.creator, "profile") else "PrimeFit"
    def get_participant_count(self, obj):
        if hasattr(obj, "participant_total"):
            return obj.participant_total
        return obj.participants.count()
    def get_participants(self, obj):
        users = [participant.user for participant in obj.participants.select_related("user__profile").all()[:5]]
        return UserSummarySerializer(users, many=True, context=self.context).data
    def get_joined(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.participants.filter(user=request.user).exists())
    @transaction.atomic
    def create(self, validated_data):
        requirements = validated_data.pop("requirements_input", [])
        user = self.context["request"].user
        validated_data["creator"] = user
        validated_data["status"] = "published"
        validated_data.setdefault("starts_at", timezone.localdate())
        validated_data.setdefault("ends_at", validated_data["starts_at"] + timedelta(days=validated_data["duration_days"] - 1))
        challenge = Challenge.objects.create(**validated_data)
        for item in requirements:
            activity_type = item.pop("activity_type", "workout")
            exercise_items = item.pop("exercise_items", [])
            workout = item.pop("workout", None)
            if activity_type in ("running", "cycling"):
                item.pop("title", None)
                item.pop("mode", None)
                item.pop("duration_minutes", None)
                ChallengeWorkout.objects.create(
                    challenge=challenge,
                    activity_type=activity_type,
                    **item,
                )
                continue
            title = item.pop("title", "")
            mode = item.pop("mode", "gym")
            duration_minutes = item.pop("duration_minutes", 25)
            if workout is None:
                workout = Workout.objects.create(
                    title=title,
                    description=f"Workout scheduled for day {item['day_number']} of {challenge.title}.",
                    mode=mode,
                    difficulty=challenge.difficulty,
                    goal=challenge.goal,
                    duration_minutes=duration_minutes,
                    creator=user,
                    status="published",
                )
                for index, exercise_item in enumerate(exercise_items):
                    exercise = exercise_item.pop("exercise", None)
                    exercise_name = exercise_item.pop("name", "")
                    exercise_instructions = exercise_item.pop("instructions", "")
                    if exercise is None:
                        exercise, _ = Exercise.objects.get_or_create(
                            name=exercise_name,
                            defaults={
                                "instructions": exercise_instructions,
                                "created_by": user,
                                "approved": user.is_staff,
                            },
                        )
                    WorkoutExercise.objects.create(
                        workout=workout,
                        exercise=exercise,
                        order=index,
                        instructions=exercise_instructions,
                        **exercise_item,
                    )
            item["workout"] = workout
            ChallengeWorkout.objects.create(challenge=challenge, activity_type="workout", **item)
        return challenge


class FriendRequestSerializer(serializers.ModelSerializer):
    sender = UserSummarySerializer(read_only=True)
    receiver = UserSummarySerializer(read_only=True)

    class Meta:
        model = FriendRequest
        fields = ("id", "sender", "receiver", "status", "created_at")
        read_only_fields = fields


class DirectMessageSerializer(serializers.ModelSerializer):
    sender = UserSummarySerializer(read_only=True)

    class Meta:
        model = DirectMessage
        fields = ("id", "sender", "body", "created_at")
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    member = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ("id", "member", "last_message", "updated_at")
        read_only_fields = fields

    def get_member(self, obj):
        request = self.context.get("request")
        return UserSummarySerializer(obj.other_user(request.user), context=self.context).data

    def get_last_message(self, obj):
        message = obj.messages.select_related("sender", "sender__profile").last()
        return DirectMessageSerializer(message, context=self.context).data if message else None

class WorkoutSessionSerializer(serializers.ModelSerializer):
    workout_title = serializers.CharField(source="workout.title", read_only=True)
    event_registration = serializers.PrimaryKeyRelatedField(
        queryset=EventRegistration.objects.filter(status="registered"), required=False, allow_null=True
    )
    class Meta:
        model = WorkoutSession
        fields = ("id", "workout", "workout_title", "event_registration", "completed_at", "notes", "progress_recorded", "weight_kg", "sets_completed")
        read_only_fields = ("id", "completed_at")
    def validate(self, attrs):
        registration = attrs.get("event_registration")
        if not registration:
            return attrs
        user = self.context["request"].user
        if registration.event.category != "workout" or registration.event.status != "published":
            raise serializers.ValidationError({"event_registration": "Choose an active workout event registration."})
        if registration.team_id:
            participating = registration.team.memberships.filter(user=user, left_at__isnull=True).exists()
        else:
            participating = registration.user_id == user.id
        if not participating:
            raise serializers.ValidationError({"event_registration": "You are not registered for this event."})
        completed_at = timezone.now()
        event_start = timezone.localtime(registration.event.starts_at)
        event_end = timezone.localtime(registration.event.ends_at) if registration.event.ends_at else event_start.replace(
            hour=23, minute=59, second=59, microsecond=999999
        )
        local_completed_at = timezone.localtime(completed_at)
        if local_completed_at < event_start or local_completed_at > event_end:
            raise serializers.ValidationError({"event_registration": "The workout must be completed during the event."})
        if ActivityRecord.objects.filter(user=user, event_registration__event=registration.event).exists():
            raise serializers.ValidationError({"event_registration": "You already submitted an activity for this event."})
        return attrs
    def create(self, validated_data):
        registration = validated_data.pop("event_registration", None)
        validated_data["user"] = self.context["request"].user
        session = super().create(validated_data)
        if registration:
            record = session.activity_record
            record.event_registration = registration
            record.verification_status = "pending"
            record.verified_at = None
            record.save(update_fields=["event_registration", "verification_status", "verified_at"])
        return session

class OutdoorActivitySerializer(serializers.ModelSerializer):
    activity_label = serializers.CharField(source="get_activity_type_display", read_only=True)
    verification_status = serializers.SerializerMethodField()
    challenge_requirement = serializers.PrimaryKeyRelatedField(
        queryset=ChallengeWorkout.objects.select_related("challenge"),
        required=False,
        allow_null=True,
    )
    event_registration = serializers.PrimaryKeyRelatedField(
        queryset=EventRegistration.objects.filter(status="registered"), required=False, allow_null=True
    )
    class Meta:
        model = OutdoorActivity
        fields = ("id", "activity_type", "activity_label", "challenge", "challenge_requirement", "event_registration", "started_at", "duration_seconds", "distance_km", "elevation_gain_m", "notes", "source", "route_data", "verification_status", "created_at")
        read_only_fields = ("id", "activity_label", "source", "verification_status", "created_at")
    def get_verification_status(self, obj):
        record = getattr(obj, "activity_record", None)
        return record.verification_status if record else None
    def validate(self, attrs):
        requirement = attrs.get("challenge_requirement")
        if requirement:
            challenge = requirement.challenge
            attrs["challenge"] = challenge
            if requirement.workout_id:
                raise serializers.ValidationError({"challenge_requirement": "This challenge day requires a workout."})
            if attrs["activity_type"] != requirement.activity_type:
                raise serializers.ValidationError({"activity_type": "Activity type must match the challenge day."})
            if ChallengeCompletion.objects.filter(
                participant__user=self.context["request"].user,
                requirement=requirement,
            ).exists():
                raise serializers.ValidationError({"challenge_requirement": "This challenge day is already complete."})
        route = attrs.get("route_data")
        if requirement and route is None:
            raise serializers.ValidationError({"route_data": "Record this challenge day with GPS tracking."})
        if route is not None:
            if not isinstance(route, list) or not 2 <= len(route) <= 10000:
                raise serializers.ValidationError({"route_data": "A GPS route must contain between 2 and 10,000 points."})
            points = []
            timestamp_field = serializers.DateTimeField()
            for index, point in enumerate(route):
                if not isinstance(point, dict):
                    raise serializers.ValidationError({"route_data": f"GPS point {index + 1} is invalid."})
                try:
                    latitude = float(point["latitude"])
                    longitude = float(point["longitude"])
                    timestamp = timestamp_field.run_validation(point["timestamp"])
                    accuracy = float(point.get("accuracy", 0))
                except (KeyError, TypeError, ValueError, serializers.ValidationError):
                    raise serializers.ValidationError({"route_data": f"GPS point {index + 1} needs valid coordinates and a timestamp."})
                if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                    raise serializers.ValidationError({"route_data": f"GPS point {index + 1} has invalid coordinates."})
                if not math.isfinite(accuracy):
                    raise serializers.ValidationError({"route_data": f"GPS point {index + 1} has invalid accuracy."})
                if accuracy < 0 or accuracy > 100:
                    continue
                points.append((latitude, longitude, timestamp, accuracy))
            if len(points) < 2:
                raise serializers.ValidationError({"route_data": "The GPS route needs at least two accurate location points."})
            distance_meters = 0.0
            for previous, current in zip(points, points[1:]):
                elapsed = (current[2] - previous[2]).total_seconds()
                if elapsed <= 0:
                    raise serializers.ValidationError({"route_data": "GPS timestamps must be in increasing order."})
                lat1, lon1 = math.radians(previous[0]), math.radians(previous[1])
                lat2, lon2 = math.radians(current[0]), math.radians(current[1])
                delta_lat, delta_lon = lat2 - lat1, math.radians(current[1] - previous[1])
                haversine = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
                haversine = min(1.0, max(0.0, haversine))
                segment_meters = 6_371_000 * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))
                maximum_speed = 25 if attrs["activity_type"] == "running" else 45
                if segment_meters / elapsed > maximum_speed:
                    raise serializers.ValidationError({"route_data": "The GPS route contains an implausible speed or location jump."})
                distance_meters += segment_meters
            started_at = attrs.get("started_at", points[0][2])
            duration_seconds = attrs.get("duration_seconds", 0)
            if points[-1][2] <= started_at or (points[-1][2] - started_at).total_seconds() > 6 * 60 * 60:
                raise serializers.ValidationError({"route_data": "The GPS recording duration is invalid."})
            if duration_seconds < 10 or duration_seconds > 6 * 60 * 60:
                raise serializers.ValidationError({"duration_seconds": "GPS activities must last between 10 seconds and 6 hours."})
            if distance_meters < 50:
                raise serializers.ValidationError({"route_data": "Track at least 50 metres to complete a running or cycling challenge day."})
            attrs["started_at"] = started_at
            attrs["duration_seconds"] = int(duration_seconds)
            attrs["distance_km"] = round(distance_meters / 1000, 2)
            attrs["source"] = "gps"
        elif attrs.get("duration_seconds", 0) <= 0 or attrs.get("distance_km", 0) <= 0:
            raise serializers.ValidationError("Duration and distance must be greater than zero.")
        challenge = attrs.get("challenge")
        if challenge:
            user = self.context["request"].user
            if not challenge.participants.filter(user=user).exists():
                raise serializers.ValidationError({"challenge": "Join this challenge before logging an activity."})
            today = timezone.localdate()
            if today < challenge.starts_at or (challenge.ends_at and today > challenge.ends_at):
                raise serializers.ValidationError({"challenge": "This challenge is not active."})
        if requirement:
            activity_date = timezone.localtime(attrs["started_at"]).date()
            scheduled_date = challenge.starts_at + timedelta(days=requirement.day_number - 1)
            current_day = (timezone.localdate() - challenge.starts_at).days + 1
            if activity_date != scheduled_date or requirement.day_number > current_day:
                raise serializers.ValidationError({"challenge_requirement": "This challenge day can only be completed on its scheduled date."})
        registration = attrs.get("event_registration")
        if registration:
            user = self.context["request"].user
            started_at = attrs.get("started_at", timezone.now())
            if registration.status != "registered" or registration.event.status != "published":
                raise serializers.ValidationError({"event_registration": "This event registration is no longer active."})
            if registration.team_id:
                membership = registration.team.memberships.filter(
                    user=user, joined_at__lte=started_at
                ).filter(Q(left_at__isnull=True) | Q(left_at__gt=started_at)).exists()
                is_participant = membership
            else:
                is_participant = registration.user_id == user.id
            if not is_participant:
                raise serializers.ValidationError({"event_registration": "You are not registered for this event."})
            if registration.event.category != attrs["activity_type"]:
                raise serializers.ValidationError({"event_registration": "Activity type must match the event category."})
            event_start = timezone.localtime(registration.event.starts_at)
            event_end = timezone.localtime(registration.event.ends_at) if registration.event.ends_at else timezone.make_aware(
                datetime.combine(event_start.date() + timedelta(days=1), time.min),
                timezone.get_current_timezone(),
            )
            started_at = timezone.localtime(started_at)
            if started_at < event_start or started_at > event_end:
                raise serializers.ValidationError({"started_at": "Activity time must fall during the registered event."})
            if ActivityRecord.objects.filter(
                user=user, event_registration__event=registration.event
            ).exists():
                raise serializers.ValidationError({"event_registration": "You already submitted an activity for this event."})
        return attrs
    @transaction.atomic
    def create(self, validated_data):
        registration = validated_data.pop("event_registration", None)
        requirement = validated_data.pop("challenge_requirement", None)
        validated_data["user"] = self.context["request"].user
        with transaction.atomic():
            activity = super().create(validated_data)
            record = activity.activity_record
            if activity.source == "gps" and requirement:
                record.verification_status = "verified"
                record.verified_at = activity.started_at + timedelta(seconds=activity.duration_seconds)
                record.save(update_fields=["verification_status", "verified_at"])
        if registration:
            record.event_registration = registration
            record.save(update_fields=["event_registration"])
        if requirement:
            user = self.context["request"].user
            participant = ChallengeParticipant.objects.get(user=user, challenge=requirement.challenge)
            points = requirement.points or requirement.challenge.points_per_completion
            try:
                with transaction.atomic():
                    completion = ChallengeCompletion.objects.create(
                        participant=participant,
                        requirement=requirement,
                        activity_record=record,
                        points_awarded=points,
                    )
            except IntegrityError as error:
                raise serializers.ValidationError({"challenge_requirement": "This challenge day is already complete."}) from error
            PointTransaction.objects.create(
                user=user,
                challenge=requirement.challenge,
                points=points,
                reason=f"Day {requirement.day_number} completed",
            )
            Post.objects.create(
                author=user,
                body=f"Completed Day {requirement.day_number} of {requirement.challenge.title} 🎉",
                post_type="progress",
                challenge=requirement.challenge,
            )
            if participant.completions.count() >= requirement.challenge.requirements.count():
                participant.completed_at = completion.completed_at
                participant.save(update_fields=["completed_at"])
            from .services import award_eligible_achievements
            award_eligible_achievements(user)
        return activity

class ActivityRecordSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    activity_label = serializers.CharField(source="get_activity_type_display", read_only=True)
    workout_title = serializers.CharField(source="workout.title", read_only=True, allow_null=True)
    challenge_completions = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = ActivityRecord
        fields = (
            "id", "user", "username", "activity_type", "activity_label", "workout", "workout_title",
            "workout_session", "outdoor_activity", "event_registration", "challenge_completions", "completed_at",
            "duration_seconds", "distance_km", "elevation_gain_m", "weight_kg", "sets_completed", "notes",
            "source", "verification_status", "verified_by", "verified_at", "review_notes", "created_at",
        )
        read_only_fields = fields

class TeamMembershipSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = TeamMembership
        fields = ("id", "user", "role", "joined_at")


class TeamJoinRequestSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = TeamJoinRequest
        fields = ("id", "team", "user", "status", "requested_at")
        read_only_fields = fields


class TeamInvitationSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)
    invitee_name = serializers.CharField(source="invitee.profile.display_name", read_only=True)
    invited_by_name = serializers.CharField(source="invited_by.profile.display_name", read_only=True, allow_null=True)

    class Meta:
        model = TeamInvitation
        fields = ("id", "team", "team_name", "invitee", "invitee_name", "invited_by_name", "status", "created_at")
        read_only_fields = ("id", "team", "team_name", "invitee", "invitee_name", "invited_by_name", "status", "created_at")


class TeamSerializer(serializers.ModelSerializer):
    captain_name = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    is_captain = serializers.SerializerMethodField()
    membership_status = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = (
            "id", "name", "description", "logo", "area", "city", "country", "captain",
            "captain_name", "member_count", "is_member", "is_captain", "membership_status", "created_at",
        )
        read_only_fields = ("id", "captain", "captain_name", "member_count", "is_member", "is_captain", "membership_status", "created_at")

    def validate_logo(self, value):
        if value and value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Team logos must be 5 MB or smaller.")
        return value

    def get_captain_name(self, obj):
        profile = getattr(obj.captain, "profile", None)
        return (profile.display_name or obj.captain.username) if profile else obj.captain.username

    def get_member_count(self, obj):
        return obj.memberships.filter(left_at__isnull=True).count()

    def _membership(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        return obj.memberships.filter(user=request.user, left_at__isnull=True).first()

    def get_is_member(self, obj):
        return self._membership(obj) is not None

    def get_is_captain(self, obj):
        membership = self._membership(obj)
        return bool(membership and membership.role == "captain")

    def get_membership_status(self, obj):
        membership = self._membership(obj)
        if membership:
            return "member"
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            if obj.join_requests.filter(user=request.user, status="pending").exists():
                return "requested"
            if obj.invitations.filter(invitee=request.user, status="pending").exists():
                return "invited"
        return "none"


class AdventureEventSerializer(serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    organizer_team_name = serializers.CharField(source="organizer_team.name", read_only=True, allow_null=True)
    registered_count = serializers.SerializerMethodField()
    registered_by_me = serializers.SerializerMethodField()

    class Meta:
        model = AdventureEvent
        fields = (
            "id", "title", "description", "flyer", "category", "location", "meeting_point", "starts_at",
            "ends_at", "difficulty", "participant_limit", "requirements", "organizer", "organizer_name",
            "registration_fee", "currency", "organizer_team", "organizer_team_name", "status", "registered_count", "registered_by_me", "created_at",
        )
        read_only_fields = ("id", "organizer", "organizer_name", "organizer_team_name", "status", "registered_count", "registered_by_me", "created_at")

    def get_organizer_name(self, obj):
        profile = getattr(obj.organizer, "profile", None)
        return (profile.display_name or obj.organizer.username) if profile else obj.organizer.username

    def get_registered_count(self, obj):
        return obj.registrations.filter(status="registered").aggregate(total=Sum("participant_count"))["total"] or 0

    def get_registered_by_me(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.registrations.filter(
            user=request.user, status="registered", team__isnull=True
        ).exists())

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if ends_at and starts_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "Event end must be after its start."})
        if attrs.get("registration_fee", getattr(self.instance, "registration_fee", 0)) < 0:
            raise serializers.ValidationError({"registration_fee": "The registration fee cannot be negative."})
        flyer = attrs.get("flyer")
        if flyer and flyer.size > 5 * 1024 * 1024:
            raise serializers.ValidationError({"flyer": "Event flyers must be 5 MB or smaller."})
        team = attrs.get("organizer_team", getattr(self.instance, "organizer_team", None))
        request = self.context.get("request")
        if request and team and not team.memberships.filter(
            user=request.user, role="captain", left_at__isnull=True
        ).exists() and not request.user.is_staff:
            raise serializers.ValidationError({"organizer_team": "Only that team's captain can organize for it."})
        return attrs


class EventRegistrationSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_category = serializers.CharField(source="event.category", read_only=True)
    event_starts_at = serializers.DateTimeField(source="event.starts_at", read_only=True)
    event_ends_at = serializers.DateTimeField(source="event.ends_at", read_only=True, allow_null=True)
    team_name = serializers.CharField(source="team.name", read_only=True, allow_null=True)

    class Meta:
        model = EventRegistration
        fields = ("id", "event", "event_title", "event_category", "event_starts_at", "event_ends_at", "user", "team", "team_name", "participant_count", "first_name", "last_name", "email", "phone", "status", "registered_at")
        read_only_fields = fields


class EventCheckoutSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=80)
    last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)


class CompetitionEntrySerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)
    registered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CompetitionEntry
        fields = ("id", "team", "team_name", "registered_by", "registered_by_name", "status", "registered_at")
        read_only_fields = fields

    def get_registered_by_name(self, obj):
        profile = getattr(obj.registered_by, "profile", None)
        return (profile.display_name or obj.registered_by.username) if profile else obj.registered_by.username


class CompetitionSerializer(serializers.ModelSerializer):
    organizer_name = serializers.SerializerMethodField()
    team_count = serializers.SerializerMethodField()
    entered_team_ids = serializers.SerializerMethodField()

    class Meta:
        model = Competition
        fields = (
            "id", "title", "description", "rules", "starts_on", "ends_on", "eligible_activity_types",
            "scoring_mode", "min_team_size", "max_team_size", "organizer", "organizer_name",
            "status", "team_count", "entered_team_ids", "created_at",
        )
        read_only_fields = ("id", "organizer", "organizer_name", "status", "team_count", "entered_team_ids", "created_at")

    def get_organizer_name(self, obj):
        profile = getattr(obj.organizer, "profile", None)
        return (profile.display_name or obj.organizer.username) if profile else obj.organizer.username

    def get_team_count(self, obj):
        return obj.entries.filter(status="registered").count()

    def get_entered_team_ids(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return []
        return list(obj.entries.filter(
            status="registered",
            team__memberships__user=request.user,
            team__memberships__left_at__isnull=True,
            team__memberships__role="captain",
        ).values_list("team_id", flat=True).distinct())

    def validate_eligible_activity_types(self, value):
        valid = {choice[0] for choice in ActivityRecord.TYPES}
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Choose at least one eligible activity type.")
        if any(activity_type not in valid for activity_type in value) or len(set(value)) != len(value):
            raise serializers.ValidationError("Activity types must be distinct supported values.")
        return value

    def validate(self, attrs):
        starts_on = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        ends_on = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if starts_on and ends_on and ends_on < starts_on:
            raise serializers.ValidationError({"ends_on": "Competition end must be on or after its start."})
        min_size = attrs.get("min_team_size", getattr(self.instance, "min_team_size", 1))
        max_size = attrs.get("max_team_size", getattr(self.instance, "max_team_size", None))
        if max_size is not None and max_size < min_size:
            raise serializers.ValidationError({"max_team_size": "Maximum team size must be at least the minimum."})
        mode = attrs.get("scoring_mode", getattr(self.instance, "scoring_mode", None))
        eligible = attrs.get("eligible_activity_types", getattr(self.instance, "eligible_activity_types", []))
        if mode in ("distance_km", "duration_minutes") and "workout" in eligible:
            raise serializers.ValidationError({
                "eligible_activity_types": "Distance and duration scoring require outdoor activities with those measurements."
            })
        return attrs

class ChallengeCompletionSerializer(serializers.ModelSerializer):
    day_number = serializers.IntegerField(source="requirement.day_number", read_only=True)
    workout_title = serializers.SerializerMethodField()
    challenge_title = serializers.CharField(source="requirement.challenge.title", read_only=True)
    activity_record = serializers.PrimaryKeyRelatedField(
        queryset=ActivityRecord.objects.filter(activity_type="workout"), required=False, allow_null=True
    )
    class Meta:
        model = ChallengeCompletion
        fields = ("id", "requirement", "activity_record", "day_number", "workout_title", "challenge_title", "completed_at", "points_awarded")
        read_only_fields = ("id", "completed_at", "points_awarded")
    def get_workout_title(self, obj):
        return obj.requirement.title
    def validate_requirement(self, requirement):
        if not requirement.workout_id:
            raise serializers.ValidationError("This challenge day must be completed with GPS tracking.")
        user = self.context["request"].user
        challenge = requirement.challenge
        today = timezone.localdate()
        if today < challenge.starts_at:
            raise serializers.ValidationError("This challenge has not started yet.")
        if challenge.ends_at and today > challenge.ends_at:
            raise serializers.ValidationError("This challenge has ended.")
        current_day = (today - challenge.starts_at).days + 1
        if requirement.day_number > current_day:
            raise serializers.ValidationError("This challenge requirement is scheduled for a future day.")
        participant = ChallengeParticipant.objects.filter(user=user, challenge=challenge).first()
        if participant is None:
            raise serializers.ValidationError("Join this challenge before logging a completion.")
        if participant.completions.filter(requirement=requirement).exists():
            raise serializers.ValidationError("This challenge requirement is already complete.")
        return requirement
    def validate(self, attrs):
        record = attrs.get("activity_record")
        if record is None:
            return attrs
        requirement = attrs["requirement"]
        challenge = requirement.challenge
        user = self.context["request"].user
        if record.user_id != user.id:
            raise serializers.ValidationError({"activity_record": "Choose one of your own activities."})
        if record.workout_id != requirement.workout_id or record.activity_type != "workout":
            raise serializers.ValidationError({"activity_record": "This activity does not match the required workout."})
        if record.verification_status != "verified":
            raise serializers.ValidationError({"activity_record": "Only verified activities can complete a challenge requirement."})
        activity_date = timezone.localtime(record.completed_at).date()
        if activity_date < challenge.starts_at or activity_date > timezone.localdate():
            raise serializers.ValidationError({"activity_record": "The activity must fall within the active challenge period."})
        if challenge.ends_at and activity_date > challenge.ends_at:
            raise serializers.ValidationError({"activity_record": "The activity was completed after this challenge ended."})
        if record.challenge_completions.filter(participant__user=user, requirement__challenge=challenge).exists():
            raise serializers.ValidationError({"activity_record": "This activity already counts toward this challenge."})
        return attrs
    @transaction.atomic
    def create(self, validated_data):
        user = self.context["request"].user
        requirement = validated_data["requirement"]
        participant = ChallengeParticipant.objects.get(user=user, challenge=requirement.challenge)
        points = requirement.points or requirement.challenge.points_per_completion
        activity_record = validated_data.pop("activity_record", None)
        if activity_record is None:
            activity_record = ActivityRecord.objects.filter(
                user=user,
                workout=requirement.workout,
                activity_type="workout",
                completed_at__date=timezone.localdate(),
                verification_status="verified",
            ).exclude(
                challenge_completions__participant=participant,
            ).order_by("-completed_at", "-id").first()
        if activity_record is None:
            workout_session = WorkoutSession.objects.create(
                user=user,
                workout=requirement.workout,
                completed_at=timezone.now(),
                notes=f"Challenge: {requirement.challenge.title}",
            )
            activity_record = workout_session.activity_record
        try:
            with transaction.atomic():
                completion = ChallengeCompletion.objects.create(
                    participant=participant,
                    requirement=requirement,
                    activity_record=activity_record,
                    points_awarded=points,
                )
        except IntegrityError:
            raise serializers.ValidationError({"requirement": "This challenge requirement is already complete."})
        PointTransaction.objects.create(user=user, challenge=requirement.challenge, points=points, reason=f"Day {requirement.day_number} completed")
        Post.objects.create(author=user, body=f"Completed Day {requirement.day_number} of {requirement.challenge.title} 🎉", post_type="progress", challenge=requirement.challenge)
        requirement_count = requirement.challenge.requirements.count()
        if requirement_count and participant.completions.count() >= requirement_count:
            participant.completed_at = completion.completed_at
            participant.save(update_fields=["completed_at"])
        from .services import award_eligible_achievements
        award_eligible_achievements(user)
        return completion

class CommentSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)
    class Meta:
        model = Comment
        fields = ("id", "post", "author", "body", "created_at")
        read_only_fields = ("id", "author", "created_at")
    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)

class PostSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)
    comments = CommentSerializer(many=True, read_only=True)
    reaction_count = serializers.SerializerMethodField()
    reacted_by_me = serializers.SerializerMethodField()
    class Meta:
        model = Post
        fields = ("id", "author", "body", "image", "post_type", "challenge", "created_at", "comments", "reaction_count", "reacted_by_me")
        read_only_fields = ("id", "author", "created_at")
    def get_reaction_count(self, obj): return obj.reactions.count()
    def get_reacted_by_me(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.reactions.filter(user=request.user).exists())
    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)

class NutritionGoalSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug", read_only=True)

    class Meta:
        model = NutritionGoal
        fields = ("id", "label", "description")

class MealSerializer(serializers.ModelSerializer):
    class Meta:
        model = Meal
        fields = ("id", "name", "time", "ingredients", "quantity", "preparation", "alternative")

class MealPlanSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="slug", read_only=True)
    goal = serializers.SlugRelatedField(read_only=True, slug_field="slug")
    goal_label = serializers.CharField(source="goal.label", read_only=True)
    image = serializers.ImageField(source="cover_image", read_only=True, allow_null=True)
    calories = serializers.CharField(source="nutrition_notes", read_only=True)
    meals = MealSerializer(many=True, read_only=True)

    class Meta:
        model = MealPlan
        fields = (
            "id", "name", "goal", "goal_label", "image", "description", "schedule",
            "duration", "professional", "credentials", "calories", "meals",
        )

class NutritionSupplementSerializer(serializers.ModelSerializer):
    goal = serializers.SlugRelatedField(read_only=True, slug_field="slug")
    goal_label = serializers.CharField(source="goal.label", read_only=True)
    use = serializers.CharField(source="usage_guidance", read_only=True)

    class Meta:
        model = NutritionSupplement
        fields = ("id", "goal", "goal_label", "name", "category", "image", "summary", "use", "note")

class TrainerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trainer
        fields = ("expertise", "experience_years")

class PointTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PointTransaction
        fields = ("points", "reason", "created_at", "challenge")

class UserAchievementSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="achievement.name")
    description = serializers.CharField(source="achievement.description")
    class Meta:
        model = UserAchievement
        fields = ("name", "description", "earned_at")
