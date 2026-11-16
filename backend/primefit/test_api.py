from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from unittest.mock import patch
from rest_framework.test import APIClient
from .models import (Profile, Exercise, Workout, Challenge, ChallengeWorkout,
    ChallengeParticipant, ChallengeCompletion, PointTransaction, Post, Reaction, Trainer, WorkoutSession, OutdoorActivity,
    ActivityRecord, Team, TeamMembership, AdventureEvent, EventRegistration, Competition, CompetitionEntry,
    FriendRequest, Conversation, DirectMessage, WorkoutExercise, EventPayment, ChallengePayment,
    NutritionGoal, MealPlan, Meal, NutritionSupplement)

User = get_user_model()

class PrimeFitApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="member", password="SafePass123!")
        Profile.objects.create(user=self.user, display_name="Test Member", city="Lilongwe", country="Malawi")
        exercise = Exercise.objects.create(name="Squat", instructions="Sit back and stand tall.")
        self.workout = Workout.objects.create(title="Starter strength", description="A first session", mode="gym", difficulty="beginner", duration_minutes=20)
        self.workout.exercises.add(exercise, through_defaults={"order": 0})
        self.challenge = Challenge.objects.create(title="Week one", description="Move every day", duration_days=1, difficulty="beginner", starts_at=date.today(), points_per_completion=50)
        self.requirement = ChallengeWorkout.objects.create(challenge=self.challenge, workout=self.workout, day_number=1)
        response = self.client.post("/api/auth/token/", {"username": "member", "password": "SafePass123!", "role": "member"}, format="json")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_member_directory_presence_and_follow(self):
        trainer_user = User.objects.create_user(username="coach", password="SafePass123!")
        Profile.objects.create(user=trainer_user, display_name="Coach Lee", photo="")
        Trainer.objects.create(user=trainer_user, expertise="Strength coaching", status="approved")

        directory = self.client.get("/api/members/")
        self.assertEqual(directory.status_code, 200)
        coach = next(item for item in directory.data["results"] if item["id"] == trainer_user.id)
        self.assertEqual(coach["role"], "trainer")
        self.assertFalse(coach["is_online"])
        self.assertFalse(coach["is_following"])

        followed = self.client.post(f"/api/members/{trainer_user.id}/follow/", {}, format="json")
        self.assertEqual(followed.status_code, 200)
        self.assertTrue(followed.data["following"])
        trainer_client = APIClient()
        token = trainer_client.post("/api/auth/token/", {
            "username": "coach",
            "password": "SafePass123!",
            "role": "trainer",
        }, format="json").data["access"]
        trainer_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        presence = trainer_client.post("/api/presence/", {}, format="json")
        self.assertEqual(presence.status_code, 200)
        updated = self.client.get("/api/members/")
        coach = next(item for item in updated.data["results"] if item["id"] == trainer_user.id)
        self.assertTrue(coach["is_following"])
        self.assertTrue(coach["is_online"])

        trainers = self.client.get("/api/members/?type=trainer")
        self.assertEqual([item["id"] for item in trainers.data["results"]], [trainer_user.id])
        unfollowed = self.client.delete(f"/api/members/{trainer_user.id}/follow/")
        self.assertEqual(unfollowed.status_code, 200)
        self.assertFalse(unfollowed.data["following"])

    def test_posts_can_be_filtered_to_a_member(self):
        other = User.objects.create_user(username="other", password="SafePass123!")
        own_post = Post.objects.create(author=self.user, body="My community update")
        Post.objects.create(author=other, body="Another member's update")

        response = self.client.get(f"/api/posts/?author={self.user.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], own_post.id)

    def test_joined_member_can_complete_requirement_once_for_points(self):
        existing_session = WorkoutSession.objects.create(
            user=self.user, workout=self.workout, completed_at=timezone.now()
        )
        joined = self.client.post(f"/api/challenges/{self.challenge.id}/join/", {}, format="json")
        self.assertEqual(joined.status_code, 200)
        result = self.client.post("/api/challenge-completions/", {"requirement": self.requirement.id}, format="json")
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data["points_awarded"], 50)
        self.assertEqual(PointTransaction.objects.filter(user=self.user, challenge=self.challenge).count(), 1)
        duplicate = self.client.post("/api/challenge-completions/", {"requirement": self.requirement.id}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(ChallengeCompletion.objects.filter(participant__user=self.user).count(), 1)
        self.assertIsNotNone(ChallengeParticipant.objects.get(user=self.user, challenge=self.challenge).completed_at)
        self.assertEqual(Post.objects.filter(author=self.user, post_type="progress").count(), 1)
        activity_record = existing_session.activity_record
        self.assertEqual(result.data["activity_record"], activity_record.id)
        self.assertEqual(activity_record.challenge_completions.count(), 1)
        self.assertEqual(WorkoutSession.objects.filter(user=self.user).count(), 1)

    def test_challenge_detail_includes_workout_sets_and_joined_members(self):
        challenge = self.client.get(f"/api/challenges/{self.challenge.id}/")
        self.assertEqual(challenge.status_code, 200)
        requirement = challenge.data["requirements"][0]
        self.assertEqual(requirement["workout_details"]["title"], self.workout.title)
        self.assertEqual(requirement["workout_details"]["workout_exercises"][0]["sets"], 3)
        self.assertEqual(requirement["workout_details"]["workout_exercises"][0]["exercise"]["name"], "Squat")
        self.assertEqual(challenge.data["participants"], [])

        self.client.post(f"/api/challenges/{self.challenge.id}/join/", {}, format="json")
        joined_challenge = self.client.get(f"/api/challenges/{self.challenge.id}/")
        self.assertEqual(joined_challenge.status_code, 200)
        self.assertEqual(joined_challenge.data["participants"][0]["name"], "Test Member")
        roster = self.client.get(f"/api/challenges/{self.challenge.id}/members/?page=1")
        self.assertEqual(roster.status_code, 200)
        self.assertEqual(roster.data["results"][0]["name"], "Test Member")
        public_roster = APIClient().get(f"/api/challenges/{self.challenge.id}/members/?page=1")
        self.assertEqual(public_roster.status_code, 200)
        self.assertEqual(public_roster.data["results"][0]["name"], "Test Member")

    def test_challenges_ignore_activity_category_filters(self):
        boxing = Challenge.objects.create(
            title="Boxing foundations",
            description="A beginner boxing challenge",
            duration_days=1,
            difficulty="beginner",
            activity_category="boxing",
        )
        response = self.client.get("/api/challenges/?category=boxing")
        self.assertEqual(response.status_code, 200)
        challenge_ids = {item["id"] for item in response.data["results"]}
        self.assertIn(boxing.id, challenge_ids)
        self.assertIn(self.challenge.id, challenge_ids)

    def test_current_challenges_endpoint_excludes_future_and_expired_challenges(self):
        today = timezone.localdate()
        expired = Challenge.objects.create(
            title="Expired challenge",
            description="Already ended",
            duration_days=2,
            difficulty="beginner",
            starts_at=today - timedelta(days=4),
        )
        future = Challenge.objects.create(
            title="Future challenge",
            description="Not started yet",
            duration_days=2,
            difficulty="beginner",
            starts_at=today + timedelta(days=1),
        )
        active = Challenge.objects.create(
            title="Active challenge",
            description="In progress now",
            duration_days=3,
            difficulty="beginner",
            starts_at=today - timedelta(days=1),
        )

        response = APIClient().get("/api/challenges/current/")

        self.assertEqual(response.status_code, 200)
        ids = {challenge["id"] for challenge in response.data}
        self.assertIn(self.challenge.id, ids)
        self.assertIn(active.id, ids)
        self.assertNotIn(expired.id, ids)
        self.assertNotIn(future.id, ids)

    def test_nutrition_api_reads_published_library_from_database(self):
        goal = NutritionGoal.objects.get(slug="balanced")
        plan = MealPlan.objects.create(
            slug="database-plan",
            goal=goal,
            name="Database meal plan",
            description="A plan managed in the database.",
            schedule="Three meals each day.",
            duration="4 weeks",
            professional="Registered dietitian",
            credentials="RD",
            nutrition_notes="Flexible portions",
            is_published=True,
        )
        Meal.objects.create(
            meal_plan=plan,
            name="Breakfast",
            time="8:00 AM",
            ingredients="Oats and fruit",
            quantity="60 g oats",
            preparation="Cook until soft.",
            alternative="Use seasonal fruit.",
        )
        NutritionSupplement.objects.create(
            goal=goal,
            name="Database supplement",
            category="Powder",
            summary="Summary from the database.",
            usage_guidance="Follow professional guidance.",
            note="Check with a clinician.",
            is_published=True,
        )
        MealPlan.objects.create(
            slug="draft-plan",
            goal=goal,
            name="Draft plan",
            description="Not published.",
            schedule="",
            duration="1 week",
            professional="",
            is_published=False,
        )

        client = APIClient()
        goals = client.get("/api/nutrition-goals/")
        plans = client.get("/api/nutrition-meal-plans/?goal=balanced")
        details = client.get("/api/nutrition-meal-plans/database-plan/")
        supplements = client.get("/api/nutrition-supplements/?goal=balanced")

        self.assertEqual(goals.status_code, 200)
        self.assertIn("balanced", {item["id"] for item in goals.data["results"]})
        self.assertEqual(plans.status_code, 200)
        self.assertEqual([item["id"] for item in plans.data["results"]], ["database-plan"])
        self.assertEqual(plans.data["results"][0]["meals"][0]["name"], "Breakfast")
        self.assertEqual(details.data["goal_label"], "Balanced nutrition")
        self.assertEqual(supplements.status_code, 200)
        self.assertEqual(supplements.data["results"][0]["name"], "Database supplement")

    def test_trainer_can_create_challenge_days_with_configured_exercises(self):
        Trainer.objects.create(user=self.user, expertise="Strength coaching", status="approved")
        exercise = Exercise.objects.get(name="Squat")
        response = self.client.post("/api/challenges/", {
            "title": "Boxing basics",
            "description": "Build a steady boxing routine.",
            "duration_days": 1,
            "goal": "core",
            "activity_category": "boxing",
            "points_per_completion": 25,
            "starts_at": date.today().isoformat(),
            "requirements_input": [{
                "day_number": 1,
                "title": "Footwork and strength",
                "mode": "home",
                "duration_minutes": 30,
                "exercise_items": [{
                    "exercise": exercise.id,
                    "sets": 4,
                    "reps": "12 each side",
                    "rest_seconds": 60,
                }],
            }],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        challenge = Challenge.objects.get(pk=response.data["id"])
        self.assertEqual(challenge.status, "published")
        self.assertEqual(response.data["status"], "published")
        self.assertEqual(challenge.activity_category, "boxing")
        self.assertEqual(challenge.goal, "core")
        self.assertEqual(challenge.difficulty, "beginner")
        requirement = challenge.requirements.select_related("workout").get(day_number=1)
        self.assertEqual(requirement.workout.title, "Footwork and strength")
        self.assertEqual(requirement.workout.status, "published")
        public_challenges = APIClient().get("/api/challenges/?category=boxing")
        self.assertIn(challenge.id, {item["id"] for item in public_challenges.data["results"]})
        self.assertIn(self.challenge.id, {item["id"] for item in public_challenges.data["results"]})
        exercise_plan = WorkoutExercise.objects.get(workout=requirement.workout)
        self.assertEqual((exercise_plan.sets, exercise_plan.reps, exercise_plan.rest_seconds), (4, "12 each side", 60))

    def test_running_challenge_creates_gps_days_and_completes_from_recorded_route(self):
        Trainer.objects.create(user=self.user, expertise="Running coach", status="approved")
        created = self.client.post("/api/challenges/", {
            "title": "20 day morning jog",
            "description": "Take a morning run each day.",
            "duration_days": 1,
            "difficulty": "beginner",
            "goal": "fitness",
            "activity_category": "running",
            "points_per_completion": 25,
            "starts_at": timezone.localdate().isoformat(),
            "requirements_input": [{"day_number": 1, "activity_type": "running"}],
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        requirement = ChallengeWorkout.objects.get(challenge_id=created.data["id"])
        self.assertIsNone(requirement.workout)
        self.assertEqual(requirement.activity_type, "running")

        self.client.post(f"/api/challenges/{created.data['id']}/join/", {}, format="json")
        started = timezone.now() - timedelta(seconds=30)
        route = [
            {"latitude": -13.9626, "longitude": 33.7741, "timestamp": (started + timedelta(seconds=2)).isoformat(), "accuracy": 8},
            {"latitude": -13.9620, "longitude": 33.7741, "timestamp": (started + timedelta(seconds=29)).isoformat(), "accuracy": 8},
        ]
        tracked = self.client.post("/api/outdoor-activities/", {
            "activity_type": "running",
            "challenge": created.data["id"],
            "challenge_requirement": requirement.id,
            "started_at": started.isoformat(),
            "duration_seconds": 27,
            "distance_km": 0.01,
            "route_data": route,
        }, format="json")
        self.assertEqual(tracked.status_code, 201, tracked.data)
        self.assertEqual(tracked.data["source"], "gps")
        self.assertEqual(tracked.data["verification_status"], "verified")
        completion = ChallengeCompletion.objects.get(requirement=requirement)
        self.assertEqual(completion.points_awarded, 25)
        self.assertEqual(str(completion.activity_record.distance_km), "0.07")
        self.assertEqual(PointTransaction.objects.filter(challenge_id=created.data["id"], user=self.user).count(), 1)

        duplicate = self.client.post("/api/outdoor-activities/", {
            "activity_type": "running",
            "challenge_requirement": requirement.id,
            "started_at": started.isoformat(),
            "duration_seconds": 27,
            "distance_km": 0.01,
            "route_data": route,
        }, format="json")
        self.assertEqual(duplicate.status_code, 400)

    def test_friend_requests_and_direct_messages_require_friendship(self):
        other = User.objects.create_user(username="friend", password="SafePass123!")
        Profile.objects.create(user=other, display_name="Friend Member")
        sent = self.client.post("/api/friends/", {"member_id": other.id}, format="json")
        self.assertEqual(sent.status_code, 201)
        request_id = sent.data["id"]

        other_client = APIClient()
        other_client.force_authenticate(user=other)
        pending = other_client.get(f"/api/friends/status/?member_id={self.user.id}")
        self.assertEqual(pending.data["status"], "incoming")
        denied = self.client.post("/api/conversations/", {"member_id": other.id}, format="json")
        self.assertEqual(denied.status_code, 403)

        accepted = other_client.post(f"/api/friends/requests/{request_id}/respond/", {"decision": "accept"}, format="json")
        self.assertEqual(accepted.status_code, 200)
        conversation = self.client.post("/api/conversations/", {"member_id": other.id}, format="json")
        self.assertEqual(conversation.status_code, 200)
        message = self.client.post(
            f"/api/conversations/{conversation.data['id']}/messages/",
            {"body": "Good work on your challenge!"},
            format="json",
        )
        self.assertEqual(message.status_code, 201)
        self.assertEqual(message.data["sender"]["id"], self.user.id)
        self.assertEqual(DirectMessage.objects.count(), 1)

        received = other_client.get(f"/api/conversations/{conversation.data['id']}/messages/")
        self.assertEqual(received.status_code, 200)
        self.assertEqual(received.data[0]["body"], "Good work on your challenge!")
        self.assertEqual(FriendRequest.objects.get(pk=request_id).status, "accepted")
        self.assertEqual(Conversation.objects.count(), 1)

    def test_friend_request_cannot_be_sent_to_self(self):
        response = self.client.post("/api/friends/", {"member_id": self.user.id}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_one_activity_can_count_toward_distinct_challenges(self):
        other_challenge = Challenge.objects.create(
            title="Another week",
            description="Move again",
            duration_days=1,
            difficulty="beginner",
            starts_at=date.today(),
        )
        other_requirement = ChallengeWorkout.objects.create(
            challenge=other_challenge, workout=self.workout, day_number=1
        )
        self.client.post(f"/api/challenges/{self.challenge.id}/join/", {}, format="json")
        self.client.post(f"/api/challenges/{other_challenge.id}/join/", {}, format="json")
        session = WorkoutSession.objects.create(user=self.user, workout=self.workout, completed_at=timezone.now())

        first = self.client.post(
            "/api/challenge-completions/", {"requirement": self.requirement.id}, format="json"
        )
        second = self.client.post(
            "/api/challenge-completions/", {"requirement": other_requirement.id}, format="json"
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data["activity_record"], session.activity_record.id)
        self.assertEqual(second.data["activity_record"], session.activity_record.id)
        self.assertEqual(session.activity_record.challenge_completions.count(), 2)
        self.assertEqual(WorkoutSession.objects.filter(user=self.user).count(), 1)

    def test_member_can_react_and_toggle_reaction(self):
        post = Post.objects.create(author=self.user, body="Completed a session.")
        first = self.client.post(f"/api/posts/{post.id}/react/", {}, format="json")
        self.assertTrue(first.data["reacted"])
        self.assertEqual(Reaction.objects.filter(post=post).count(), 1)
        second = self.client.post(f"/api/posts/{post.id}/react/", {}, format="json")
        self.assertFalse(second.data["reacted"])
        self.assertEqual(Reaction.objects.filter(post=post).count(), 0)

    def test_trainer_content_requires_approval(self):
        trainer = Trainer.objects.create(user=self.user, expertise="Strength coaching", experience_years=3)
        self.assertEqual(trainer.status, "pending")
        response = self.client.post("/api/workouts/", {"title": "My workout", "description": "A session", "mode": "gym", "difficulty": "beginner", "goal": "strength", "duration_minutes": 20}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_approved_trainer_workouts_are_published_immediately(self):
        Trainer.objects.create(
            user=self.user, expertise="Strength coaching", experience_years=3, status="approved"
        )
        response = self.client.post("/api/workouts/", {
            "title": "My workout",
            "description": "A session",
            "mode": "gym",
            "difficulty": "beginner",
            "goal": "strength",
            "duration_minutes": 20,
        }, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "published")
        self.assertTrue(Workout.objects.filter(id=response.data["id"], status="published").exists())

    def test_dashboard_activity_counts_saved_workouts_for_the_current_week(self):
        WorkoutSession.objects.create(user=self.user, workout=self.workout)
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, 200)
        activity = response.data["weekly_activity"]
        self.assertEqual(len(activity), 7)
        today = next(day for day in activity if day["is_today"])
        self.assertEqual(today["count"], 1)
        self.assertEqual(response.data["workout_count"], 1)
        self.assertEqual(response.data["activity_count"], 1)
        self.assertEqual(len(response.data["recent_activities"]), 1)

    def test_leaderboard_shows_points_from_ongoing_challenges(self):
        ChallengeParticipant.objects.create(user=self.user, challenge=self.challenge)
        PointTransaction.objects.create(user=self.user, challenge=self.challenge, points=50, reason="Day 1 completed")
        completed_member = User.objects.create_user(username="completed_member", password="SafePass123!")
        Profile.objects.create(user=completed_member, display_name="Completed Member")
        ChallengeParticipant.objects.create(
            user=completed_member,
            challenge=self.challenge,
            completed_at=timezone.now(),
        )
        PointTransaction.objects.create(
            user=completed_member,
            challenge=self.challenge,
            points=1000,
            reason="Completed challenge points",
        )
        past_member = User.objects.create_user(username="past_member", password="SafePass123!")
        Profile.objects.create(user=past_member, display_name="Past Member")
        past_challenge = Challenge.objects.create(
            title="Past challenge",
            description="This challenge has ended",
            duration_days=2,
            difficulty="beginner",
            starts_at=date.today() - timedelta(days=3),
            ends_at=date.today() - timedelta(days=2),
        )
        ChallengeParticipant.objects.create(user=past_member, challenge=past_challenge)
        PointTransaction.objects.create(user=past_member, challenge=past_challenge, points=5000, reason="Past points")
        trainer_user = User.objects.create_user(username="trainer", password="SafePass123!")
        Profile.objects.create(user=trainer_user, display_name="Trainer")
        Trainer.objects.create(user=trainer_user, expertise="Strength coaching", status="approved")
        admin_user = User.objects.create_user(username="admin", password="SafePass123!", is_staff=True)
        Profile.objects.create(user=admin_user, display_name="Admin")

        response = APIClient().get("/api/leaderboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [completed_member.id, self.user.id])
        self.assertEqual(response.data[0]["point_sources"], [{"challenge_id": self.challenge.id, "name": self.challenge.title, "points": 1000}])
        self.assertEqual(response.data[0]["points"], 1000)
        self.assertEqual(response.data[1]["point_sources"], [{"challenge_id": self.challenge.id, "name": self.challenge.title, "points": 50}])
        self.assertEqual(response.data[1]["points"], 50)

    def test_member_can_log_an_outdoor_activity(self):
        response = self.client.post("/api/outdoor-activities/", {
            "activity_type": "running",
            "started_at": timezone.now().isoformat(),
            "duration_seconds": 1800,
            "distance_km": "5.20",
            "elevation_gain_m": 40,
            "notes": "Morning run",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["activity_type"], "running")
        self.assertEqual(OutdoorActivity.objects.filter(user=self.user).count(), 1)
        record = ActivityRecord.objects.get(outdoor_activity_id=response.data["id"])
        self.assertEqual(record.distance_km, 5.2)
        self.assertEqual(record.verification_status, "pending")
        self.assertEqual(response.data["verification_status"], "pending")

    def test_only_saas_admin_can_verify_a_manual_activity(self):
        activity = OutdoorActivity.objects.create(
            user=self.user,
            activity_type="walking",
            duration_seconds=1800,
            distance_km="2.00",
        )
        record = ActivityRecord.objects.get(outdoor_activity=activity)
        denied = self.client.post(f"/api/activity-records/{record.id}/verify/", {}, format="json")
        self.assertEqual(denied.status_code, 403)

        admin = User.objects.create_user(username="saasadmin", password="AdminPass123!")
        admin.is_staff = True
        admin.save(update_fields=["is_staff"])
        login = self.client.post("/api/auth/token/", {
            "username": "saasadmin",
            "password": "AdminPass123!",
            "role": "admin",
        }, format="json")
        self.assertEqual(login.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        verified = self.client.post(
            f"/api/activity-records/{record.id}/verify/",
            {"review_notes": "Checked against submitted details."},
            format="json",
        )
        self.assertEqual(verified.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.verification_status, "verified")
        self.assertEqual(record.verified_by, admin)
        self.assertIsNotNone(record.verified_at)

        duplicate_review = self.client.post(f"/api/activity-records/{record.id}/reject/", {}, format="json")
        self.assertEqual(duplicate_review.status_code, 400)

    def test_activity_record_list_is_limited_to_the_signed_in_member(self):
        own_session = WorkoutSession.objects.create(user=self.user, workout=self.workout)
        other = User.objects.create_user(username="other", password="SafePass123!")
        other_session = WorkoutSession.objects.create(user=other, workout=self.workout)
        response = self.client.get("/api/activity-records/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["user"] for item in response.data["results"]], [self.user.id])
        self.assertEqual(response.data["results"][0]["id"], own_session.activity_record.id)
        self.assertNotIn(other_session.activity_record.id, [item["id"] for item in response.data["results"]])

    def test_team_join_requests_require_captain_approval(self):
        team = Team.objects.create(name="Lake Runners", captain=self.user, created_by=self.user)
        TeamMembership.objects.create(team=team, user=self.user, role="captain")
        applicant = User.objects.create_user(username="applicant", password="SafePass123!")
        self.client.force_authenticate(user=applicant)
        joined = self.client.post(f"/api/teams/{team.id}/join/", {}, format="json")
        self.assertEqual(joined.status_code, 201)
        self.assertEqual(TeamMembership.objects.filter(team=team, user=applicant).count(), 0)

        self.client.force_authenticate(user=self.user)
        requests = self.client.get(f"/api/teams/{team.id}/requests/")
        self.assertEqual(requests.status_code, 200)
        request_id = requests.data[0]["id"]
        approved = self.client.post(
            f"/api/teams/{team.id}/approve_request/",
            {"request_id": request_id},
            format="json",
        )
        self.assertEqual(approved.status_code, 200)
        self.assertTrue(TeamMembership.objects.filter(team=team, user=applicant, left_at__isnull=True).exists())

    def test_team_event_registration_reserves_places_and_counts_team_members(self):
        team = Team.objects.create(name="Trail Crew", captain=self.user, created_by=self.user)
        TeamMembership.objects.create(team=team, user=self.user, role="captain")
        event = AdventureEvent.objects.create(
            title="Sunrise hike",
            description="A local trail outing",
            category="hiking",
            location="Lilongwe",
            meeting_point="Nature Sanctuary entrance",
            starts_at=timezone.now() + timedelta(days=2),
            difficulty="beginner",
            participant_limit=1,
            organizer=self.user,
            organizer_team=team,
        )
        joined = self.client.post(f"/api/events/{event.id}/join/", {"team_id": team.id}, format="json")
        self.assertEqual(joined.status_code, 201)
        registration = EventRegistration.objects.get(event=event, team=team)
        self.assertEqual(registration.participant_count, 1)

        full = self.client.post(f"/api/events/{event.id}/join/", {}, format="json")
        self.assertEqual(full.status_code, 400)
        self.assertEqual(event.registrations.filter(status="registered").count(), 1)

    def test_published_events_remain_visible_after_they_end_until_unpublished(self):
        now = timezone.now()
        event = AdventureEvent.objects.create(
            title="Completed community hike",
            description="A past published event",
            category="hiking",
            location="Lilongwe",
            meeting_point="Nature Sanctuary entrance",
            starts_at=now - timedelta(days=3),
            ends_at=now - timedelta(days=2),
            difficulty="beginner",
            organizer=self.user,
        )

        response = self.client.get("/api/events/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(event.id, [item["id"] for item in response.data["results"]])

        event.status = "cancelled"
        event.save(update_fields=["status"])
        response = self.client.get("/api/events/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(event.id, [item["id"] for item in response.data["results"]])

    @patch("primefit.views.verify_event_payment")
    @patch("primefit.views.initiate_event_payment", return_value="https://checkout.paychangu.example/session")
    def test_paid_event_checkout_registers_member_only_after_verified_payment(self, _initiate, verify):
        event = AdventureEvent.objects.create(
            title="Paid cycling clinic",
            description="A coached ride",
            category="cycling",
            location="Lilongwe",
            meeting_point="City center",
            starts_at=timezone.now() + timedelta(days=2),
            difficulty="beginner",
            registration_fee="2500.00",
            currency="MWK",
            organizer=self.user,
        )
        bypass = self.client.post(f"/api/events/{event.id}/join/", {}, format="json")
        self.assertEqual(bypass.status_code, 400)
        self.assertFalse(EventRegistration.objects.filter(event=event, user=self.user).exists())
        checkout = self.client.post(f"/api/events/{event.id}/checkout/", {
            "first_name": "Test",
            "last_name": "Member",
            "email": "member@example.com",
            "phone": "+265991234567",
        }, format="json")
        self.assertEqual(checkout.status_code, 201, checkout.data)
        payment = EventPayment.objects.get(event=event, user=self.user)
        self.assertEqual(payment.status, "pending")
        self.assertFalse(EventRegistration.objects.filter(event=event, user=self.user).exists())
        self.assertIn("checkout_url", checkout.data)

        verify.return_value = {
            "tx_ref": str(payment.tx_ref),
            "status": "success",
            "amount": "2500.00",
            "currency": "MWK",
            "reference": "provider-123",
        }
        confirmation = self.client.post(
            "/api/event-payments/verify/", {"tx_ref": str(payment.tx_ref)}, format="json"
        )
        self.assertEqual(confirmation.status_code, 200, confirmation.data)
        self.assertEqual(confirmation.data["status"], "paid")
        self.assertTrue(confirmation.data["registered"])
        payment.refresh_from_db()
        registration = EventRegistration.objects.get(event=event, user=self.user)
        self.assertEqual(payment.registration, registration)
        self.assertEqual(registration.email, "member@example.com")

    @patch("primefit.views.verify_event_payment")
    @patch("primefit.views.initiate_challenge_payment", return_value="https://checkout.paychangu.example/session")
    def test_paid_challenge_requires_checkout_and_joins_after_verified_payment(self, _initiate, verify):
        challenge = Challenge.objects.create(
            title="Strength series",
            description="A paid training plan",
            duration_days=1,
            registration_fee="1800.00",
            currency="MWK",
            starts_at=timezone.localdate(),
            ends_at=timezone.localdate() + timedelta(days=1),
        )
        bypass = self.client.post(f"/api/challenges/{challenge.id}/join/", {}, format="json")
        self.assertEqual(bypass.status_code, 400)
        self.assertFalse(ChallengeParticipant.objects.filter(challenge=challenge, user=self.user).exists())

        checkout = self.client.post(f"/api/challenges/{challenge.id}/checkout/", {
            "first_name": "Test",
            "last_name": "Member",
            "email": "member@example.com",
            "phone": "+265991234567",
        }, format="json")
        self.assertEqual(checkout.status_code, 201, checkout.data)
        payment = ChallengePayment.objects.get(challenge=challenge, user=self.user)
        self.assertEqual(payment.status, "pending")
        self.assertFalse(ChallengeParticipant.objects.filter(challenge=challenge, user=self.user).exists())

        verify.return_value = {
            "tx_ref": str(payment.tx_ref),
            "status": "success",
            "amount": "1800.00",
            "currency": "MWK",
            "reference": "challenge-provider-123",
        }
        confirmation = self.client.post(
            "/api/challenge-payments/verify/", {"tx_ref": str(payment.tx_ref)}, format="json"
        )
        self.assertEqual(confirmation.status_code, 200, confirmation.data)
        self.assertEqual(confirmation.data["status"], "paid")
        self.assertTrue(confirmation.data["registered"])
        self.assertTrue(ChallengeParticipant.objects.filter(challenge=challenge, user=self.user).exists())

    def test_competition_standings_only_score_verified_eligible_activity(self):
        Trainer.objects.create(user=self.user, expertise="Endurance coaching", status="approved")
        team = Team.objects.create(name="Distance Makers", captain=self.user, created_by=self.user)
        TeamMembership.objects.create(team=team, user=self.user, role="captain")
        today = timezone.localdate()
        created = self.client.post("/api/competitions/", {
            "title": "Verified distance cup",
            "description": "Distance challenge",
            "rules": "Verified kilometres count.",
            "starts_on": today.isoformat(),
            "ends_on": (today + timedelta(days=7)).isoformat(),
            "eligible_activity_types": ["running"],
            "scoring_mode": "distance_km",
            "min_team_size": 1,
        }, format="json")
        self.assertEqual(created.status_code, 201)
        competition_id = created.data["id"]
        entered = self.client.post(
            f"/api/competitions/{competition_id}/join/",
            {"team_id": team.id},
            format="json",
        )
        self.assertEqual(entered.status_code, 201)

        activity = OutdoorActivity.objects.create(
            user=self.user,
            activity_type="running",
            started_at=timezone.now(),
            duration_seconds=1800,
            distance_km="6.25",
        )
        record = activity.activity_record
        record.verification_status = "verified"
        record.save(update_fields=["verification_status"])
        pending = OutdoorActivity.objects.create(
            user=self.user,
            activity_type="running",
            started_at=timezone.now(),
            duration_seconds=1800,
            distance_km="3.00",
        )
        standings = self.client.get(f"/api/competitions/{competition_id}/standings/")
        self.assertEqual(standings.status_code, 200)
        self.assertTrue(standings.data["verified_activities_only"])
        leader = standings.data["standings"][0]
        self.assertEqual(leader["team_name"], team.name)
        self.assertEqual(leader["score"], 6.25)
        self.assertEqual(leader["activity_count"], 1)
        self.assertEqual(pending.activity_record.verification_status, "pending")

    def test_trainer_signup_creates_active_trainer_and_role_login_works(self):
        response = self.client.post("/api/auth/register/", {
            "username": "newtrainer",
            "email": "trainer@example.com",
            "password": "SafePass123!",
            "display_name": "New Trainer",
            "role": "trainer",
            "expertise": "Strength coaching",
            "experience_years": 4,
        }, format="json")
        self.assertEqual(response.status_code, 201)
        trainer_user = User.objects.get(username="newtrainer")
        self.assertEqual(trainer_user.trainer.status, "approved")

        login = self.client.post("/api/auth/token/", {
            "username": "newtrainer",
            "password": "SafePass123!",
            "role": "trainer",
        }, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data["role"], "trainer")

    def test_role_mismatch_is_rejected_at_login(self):
        response = self.client.post("/api/auth/token/", {
            "username": "member",
            "password": "SafePass123!",
            "role": "trainer",
        }, format="json")
        self.assertEqual(response.status_code, 401)

    def test_public_signup_cannot_assign_admin_role(self):
        response = self.client.post("/api/auth/register/", {
            "username": "selfappointedadmin",
            "password": "SafePass123!",
            "role": "admin",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="selfappointedadmin").exists())

    def test_member_cannot_sign_in_through_admin_role(self):
        response = self.client.post("/api/auth/token/", {
            "username": "member",
            "password": "SafePass123!",
            "role": "admin",
        }, format="json")
        self.assertEqual(response.status_code, 401)

    def test_saas_admin_cannot_sign_in_through_trainer_role(self):
        admin = User.objects.create_superuser(username="roottrainer", email="roottrainer@example.com", password="SafePass123!")
        Trainer.objects.create(user=admin, expertise="Platform operations", status="approved")
        response = self.client.post("/api/auth/token/", {
            "username": "roottrainer",
            "password": "SafePass123!",
            "role": "trainer",
        }, format="json")
        self.assertEqual(response.status_code, 401)

    def test_superuser_cannot_sign_in_through_member_role(self):
        User.objects.create_superuser(username="rootadmin", email="root@example.com", password="SafePass123!")
        response = self.client.post("/api/auth/token/", {
            "username": "rootadmin",
            "password": "SafePass123!",
            "role": "member",
        }, format="json")
        self.assertEqual(response.status_code, 401)

    def test_custom_admin_portal_requires_staff_and_can_manage_accounts_and_trainers(self):
        denied = self.client.get("/api/admin/overview/")
        self.assertEqual(denied.status_code, 403)

        trainer_user = User.objects.create_user(
            username="pendingcoach",
            email="coach@example.com",
            password="SafePass123!",
        )
        Profile.objects.create(user=trainer_user, display_name="Pending Coach")
        trainer = Trainer.objects.create(
            user=trainer_user,
            expertise="Strength coaching",
            status="pending",
        )
        admin = User.objects.create_superuser(
            username="portaladmin",
            email="admin@example.com",
            password="SafePass123!",
        )
        token = self.client.post("/api/auth/token/", {
            "username": admin.username,
            "password": "SafePass123!",
            "role": "admin",
        }, format="json").data["access"]
        admin_client = APIClient()
        admin_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        overview = admin_client.get("/api/admin/overview/")
        self.assertEqual(overview.status_code, 200)
        self.assertEqual(overview.data["members"], 1)
        self.assertEqual(overview.data["pending_trainers"], 1)

        accounts = admin_client.get("/api/admin/accounts/?search=Test")
        self.assertEqual(accounts.status_code, 200)
        self.assertEqual(accounts.data["results"][0]["name"], "Test Member")

        suspended = admin_client.post(
            f"/api/admin/accounts/{self.user.id}/status/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(suspended.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

        approved = admin_client.post(
            f"/api/admin/trainers/{trainer.id}/review/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(approved.status_code, 200)
        trainer.refresh_from_db()
        self.assertEqual(trainer.status, "approved")
        self.assertIsNotNone(trainer.approved_at)
