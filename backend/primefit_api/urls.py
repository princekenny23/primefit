from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from primefit.views import (RegisterView, MeView, ProfilePhotoView, ProfileCoverPhotoView, PublicProfileView, ExerciseViewSet, WorkoutViewSet, ChallengeViewSet,
    WorkoutSessionViewSet, OutdoorActivityViewSet, ActivityRecordViewSet, ChallengeCompletionViewSet, PostViewSet, CommentViewSet,
    LeaderboardView, DashboardView, AdminOverviewView, AdminAccountsView, AdminAccountStatusView,
    AdminTrainersView, AdminTrainerReviewView, TrainerApplicationView, TrainerMetricsView, TeamViewSet, TeamInvitationViewSet,
    AdventureEventViewSet, EventRegistrationViewSet, CompetitionViewSet, FriendStatusView, FriendRequestsView,
    FriendRequestResponseView, ConversationsView, DirectMessagesView, EventPaymentVerifyView,
    ChallengePaymentVerifyView, EventPaymentCallbackView, NutritionGoalViewSet, MealPlanViewSet,
    NutritionSupplementViewSet)
from primefit.views import CommunityMembersView, MemberFollowView, MemberPresenceView
from primefit.serializers import RoleTokenObtainPairSerializer

router = DefaultRouter()
router.register("exercises", ExerciseViewSet, basename="exercise")
router.register("workouts", WorkoutViewSet, basename="workout")
router.register("challenges", ChallengeViewSet, basename="challenge")
router.register("workout-sessions", WorkoutSessionViewSet, basename="workout-session")
router.register("outdoor-activities", OutdoorActivityViewSet, basename="outdoor-activity")
router.register("activity-records", ActivityRecordViewSet, basename="activity-record")
router.register("teams", TeamViewSet, basename="team")
router.register("team-invitations", TeamInvitationViewSet, basename="team-invitation")
router.register("events", AdventureEventViewSet, basename="event")
router.register("event-registrations", EventRegistrationViewSet, basename="event-registration")
router.register("competitions", CompetitionViewSet, basename="competition")
router.register("challenge-completions", ChallengeCompletionViewSet, basename="challenge-completion")
router.register("posts", PostViewSet, basename="post")
router.register("comments", CommentViewSet, basename="comment")
router.register("nutrition-goals", NutritionGoalViewSet, basename="nutrition-goal")
router.register("nutrition-meal-plans", MealPlanViewSet, basename="nutrition-meal-plan")
router.register("nutrition-supplements", NutritionSupplementViewSet, basename="nutrition-supplement")

class RoleTokenObtainPairView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", RegisterView.as_view(), name="register"),
    path("api/auth/token/", RoleTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/me/", MeView.as_view(), name="me"),
    path("api/me/photo/", ProfilePhotoView.as_view(), name="profile-photo"),
    path("api/me/cover-photo/", ProfileCoverPhotoView.as_view(), name="profile-cover-photo"),
    path("api/presence/", MemberPresenceView.as_view(), name="member-presence"),
    path("api/members/", CommunityMembersView.as_view(), name="community-members"),
    path("api/members/<int:pk>/follow/", MemberFollowView.as_view(), name="member-follow"),
    path("api/members/<int:pk>/", PublicProfileView.as_view(), name="public-profile"),
    path("api/friends/status/", FriendStatusView.as_view(), name="friend-status"),
    path("api/friends/", FriendRequestsView.as_view(), name="friend-requests"),
    path("api/friends/requests/<int:pk>/respond/", FriendRequestResponseView.as_view(), name="friend-request-response"),
    path("api/conversations/", ConversationsView.as_view(), name="conversations"),
    path("api/conversations/<int:pk>/messages/", DirectMessagesView.as_view(), name="direct-messages"),
    path("api/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/admin/overview/", AdminOverviewView.as_view(), name="admin-overview"),
    path("api/admin/accounts/", AdminAccountsView.as_view(), name="admin-accounts"),
    path("api/admin/accounts/<int:pk>/status/", AdminAccountStatusView.as_view(), name="admin-account-status"),
    path("api/admin/trainers/", AdminTrainersView.as_view(), name="admin-trainers"),
    path("api/admin/trainers/<int:pk>/review/", AdminTrainerReviewView.as_view(), name="admin-trainer-review"),
    path("api/leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    path("api/trainer/apply/", TrainerApplicationView.as_view(), name="trainer-apply"),
    path("api/trainer/metrics/", TrainerMetricsView.as_view(), name="trainer-metrics"),
    path("api/event-payments/verify/", EventPaymentVerifyView.as_view(), name="event-payment-verify"),
    path("api/challenge-payments/verify/", ChallengePaymentVerifyView.as_view(), name="challenge-payment-verify"),
    path("api/event-payments/callback/", EventPaymentCallbackView.as_view(), name="event-payment-callback"),
    path("api/", include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
