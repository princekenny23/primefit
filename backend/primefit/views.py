from datetime import timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, F, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (Profile, Trainer, Exercise, Workout, WorkoutSession, OutdoorActivity, ActivityRecord, Challenge, ChallengeParticipant,
    ChallengeCompletion, ChallengeWorkout, Post, Comment, Reaction, PointTransaction, Report, Team,
    TeamMembership, TeamJoinRequest, TeamInvitation, AdventureEvent, EventRegistration, EventPayment, ChallengePayment, Competition, CompetitionEntry,
    FriendRequest, Conversation, DirectMessage, Follow, NutritionGoal, MealPlan, NutritionSupplement)
from .serializers import (RegisterSerializer, MeSerializer, ExerciseSerializer, WorkoutSerializer, OutdoorActivitySerializer, ActivityRecordSerializer, ChallengeSerializer,
    WorkoutSessionSerializer, ChallengeCompletionSerializer, PostSerializer, CommentSerializer,
    TrainerSerializer, UserSummarySerializer, PointTransactionSerializer, UserAchievementSerializer, TeamSerializer,
    TeamMembershipSerializer, TeamJoinRequestSerializer, TeamInvitationSerializer, AdventureEventSerializer,
    EventRegistrationSerializer, EventCheckoutSerializer, CompetitionSerializer, CompetitionEntrySerializer,
    NutritionGoalSerializer, MealPlanSerializer, NutritionSupplementSerializer)
from .serializers import FriendRequestSerializer, ConversationSerializer, DirectMessageSerializer, CommunityMemberSerializer
from .payments import PayChanguError, initiate_challenge_payment, initiate_event_payment, verify_event_payment

User = get_user_model()

def is_approved_trainer(user):
    trainer = getattr(user, "trainer", None)
    return bool(trainer and trainer.status == "approved")


def verify_and_register_event_payment(payment):
    if payment.status == "paid":
        return True
    if payment.status == "failed":
        return False
    provider_data = verify_event_payment(str(payment.tx_ref))
    if str(provider_data.get("tx_ref")) != str(payment.tx_ref):
        raise ValidationError({"payment": "Payment verification reference did not match."})
    provider_status = provider_data.get("status")
    if provider_status != "success":
        if provider_status in ("failed", "cancelled"):
            EventPayment.objects.filter(pk=payment.pk, status="pending").update(status="failed")
        return False
    try:
        verified_amount = Decimal(str(provider_data.get("amount")))
    except (InvalidOperation, TypeError):
        raise ValidationError({"payment": "Payment verification returned an invalid amount."})
    if verified_amount != payment.amount or provider_data.get("currency") != payment.currency:
        EventPayment.objects.filter(pk=payment.pk, status="pending").update(status="failed")
        raise ValidationError({"payment": "The verified payment amount or currency did not match the event fee."})

    with transaction.atomic():
        locked_payment = EventPayment.objects.select_for_update().select_related("event").get(pk=payment.pk)
        if locked_payment.status == "paid":
            return True
        if locked_payment.status == "failed":
            return False
        event = AdventureEvent.objects.select_for_update().get(pk=locked_payment.event_id)
        if event.status != "published" or event.starts_at <= timezone.now():
            locked_payment.status = "failed"
            locked_payment.save(update_fields=["status"])
            return False
        attendee_count = event_attendee_count(event)
        if event.participant_limit is not None and attendee_count >= event.participant_limit:
            locked_payment.status = "failed"
            locked_payment.save(update_fields=["status"])
            return False
        registration, _ = EventRegistration.objects.get_or_create(
            event=event,
            user=locked_payment.user,
            team=None,
            status="registered",
            defaults={
                "participant_count": 1,
                "first_name": locked_payment.first_name,
                "last_name": locked_payment.last_name,
                "email": locked_payment.email,
                "phone": locked_payment.phone,
            },
        )
        locked_payment.status = "paid"
        locked_payment.provider_reference = str(provider_data.get("reference") or "")[:120]
        locked_payment.registration = registration
        locked_payment.paid_at = timezone.now()
        locked_payment.save(update_fields=["status", "provider_reference", "registration", "paid_at"])
    return True


def verify_and_join_challenge_payment(payment):
    if payment.status == "paid":
        return True
    if payment.status == "failed":
        return False
    provider_data = verify_event_payment(str(payment.tx_ref))
    if str(provider_data.get("tx_ref")) != str(payment.tx_ref):
        raise ValidationError({"payment": "Payment verification reference did not match."})
    provider_status = provider_data.get("status")
    if provider_status != "success":
        if provider_status in ("failed", "cancelled"):
            ChallengePayment.objects.filter(pk=payment.pk, status="pending").update(status="failed")
        return False
    try:
        verified_amount = Decimal(str(provider_data.get("amount")))
    except (InvalidOperation, TypeError):
        raise ValidationError({"payment": "Payment verification returned an invalid amount."})
    if verified_amount != payment.amount or provider_data.get("currency") != payment.currency:
        ChallengePayment.objects.filter(pk=payment.pk, status="pending").update(status="failed")
        raise ValidationError({"payment": "The verified payment amount or currency did not match the challenge fee."})

    with transaction.atomic():
        locked_payment = ChallengePayment.objects.select_for_update().select_related("challenge").get(pk=payment.pk)
        if locked_payment.status == "paid":
            return True
        if locked_payment.status == "failed":
            return False
        challenge = Challenge.objects.select_for_update().get(pk=locked_payment.challenge_id)
        if challenge.status != "published" or (challenge.ends_at and timezone.localdate() > challenge.ends_at):
            locked_payment.status = "failed"
            locked_payment.save(update_fields=["status"])
            return False
        if (
            not challenge.allow_multiple
            and locked_payment.user.challenge_participations.filter(completed_at__isnull=True)
            .exclude(challenge=challenge).exists()
        ):
            locked_payment.status = "failed"
            locked_payment.save(update_fields=["status"])
            return False
        ChallengeParticipant.objects.get_or_create(user=locked_payment.user, challenge=challenge)
        locked_payment.status = "paid"
        locked_payment.provider_reference = str(provider_data.get("reference") or "")[:120]
        locked_payment.paid_at = timezone.now()
        locked_payment.save(update_fields=["status", "provider_reference", "paid_at"])
    return True


def is_team_captain(user, team):
    return team.memberships.filter(user=user, role="captain", left_at__isnull=True).exists()


def can_organize(user):
    return user.is_staff or is_approved_trainer(user)


def parse_positive_id(value, field):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValidationError({field: "Provide a valid positive ID."})
    if parsed < 1:
        raise ValidationError({field: "Provide a valid positive ID."})
    return parsed


def event_attendee_count(event):
    return event.registrations.filter(status="registered").aggregate(total=Sum("participant_count"))["total"] or 0


def validate_team_capacity_for_competitions(team):
    active_size = team.memberships.filter(left_at__isnull=True).count()
    competitions = Competition.objects.filter(
        entries__team=team, entries__status="registered", max_team_size__isnull=False
    )
    if competitions.filter(max_team_size__lte=active_size).exists():
        raise ValidationError({"team": "This team has reached the maximum size for an active competition."})


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]
    def get_object(self):
        Profile.objects.get_or_create(user=self.request.user, defaults={"display_name": self.request.user.username})
        return self.request.user

class ProfilePhotoView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    file_field = "photo"
    image_label = "Profile"

    def post(self, request):
        photo = request.FILES.get(self.file_field)
        if not photo:
            raise ValidationError({self.file_field: "Choose an image to upload."})
        if photo.size > 5 * 1024 * 1024:
            raise ValidationError({self.file_field: f"{self.image_label} images must be 5 MB or smaller."})
        if not (photo.content_type or "").startswith("image/"):
            raise ValidationError({self.file_field: "Upload an image file."})
        profile, _ = Profile.objects.get_or_create(user=request.user, defaults={"display_name": request.user.username})
        setattr(profile, self.file_field, photo)
        profile.save(update_fields=[self.file_field])
        return Response({self.file_field: request.build_absolute_uri(getattr(profile, self.file_field).url)})


class ProfileCoverPhotoView(ProfilePhotoView):
    file_field = "cover_photo"
    image_label = "Cover"

class PublicProfileView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request, pk):
        try:
            user = User.objects.select_related("profile").get(pk=pk, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Member not found."}, status=404)
        participations = ChallengeParticipant.objects.filter(user=user).select_related("challenge")
        member_data = UserSummarySerializer(user, context={"request": request}).data
        member_data["is_following"] = bool(
            request.user.is_authenticated and Follow.objects.filter(follower=request.user, following=user).exists()
        )
        return Response({
            "member": member_data,
            "points": user.point_transactions.aggregate(total=Sum("points"))["total"] or 0,
            "workout_count": ActivityRecord.objects.filter(user=user, activity_type="workout").count(),
            "active_challenges": ChallengeSerializer([p.challenge for p in participations if p.completed_at is None], many=True, context={"request": request}).data,
            "completed_challenges": ChallengeSerializer([p.challenge for p in participations if p.completed_at is not None], many=True, context={"request": request}).data,
            "achievements": UserAchievementSerializer(user.achievements.select_related("achievement"), many=True).data,
            "achievements": UserAchievementSerializer(user.achievements.select_related("achievement"), many=True).data,
        })


class CommunityMembersView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        members = User.objects.filter(is_active=True).exclude(pk=request.user.pk).select_related(
            "profile", "trainer"
        ).order_by("username")
        if request.query_params.get("type") == "trainer":
            members = members.filter(trainer__status="approved")
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(members, request)
        return paginator.get_paginated_response(
            CommunityMemberSerializer(page, many=True, context={"request": request}).data
        )


class MemberPresenceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        profile, _ = Profile.objects.get_or_create(
            user=request.user,
            defaults={"display_name": request.user.username},
        )
        profile.last_seen = timezone.now()
        profile.save(update_fields=["last_seen"])
        return Response({"online": True})


class MemberFollowView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if pk == request.user.pk:
            raise ValidationError({"member": "You cannot follow yourself."})
        member = User.objects.filter(pk=pk, is_active=True).first()
        if not member:
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
        Follow.objects.get_or_create(follower=request.user, following=member)
        return Response({"following": True}, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        Follow.objects.filter(follower=request.user, following_id=pk).delete()
        return Response({"following": False}, status=status.HTTP_200_OK)


class FriendStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        member_id = parse_positive_id(request.query_params.get("member_id"), "member_id")
        if member_id == request.user.id:
            return Response({"status": "self", "request_id": None})
        if not User.objects.filter(pk=member_id, is_active=True).exists():
            return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
        relation = FriendRequest.objects.filter(
            Q(sender=request.user, receiver_id=member_id) | Q(sender_id=member_id, receiver=request.user)
        ).order_by("-created_at").first()
        if not relation:
            return Response({"status": "none", "request_id": None})
        if relation.status == "accepted":
            return Response({"status": "friends", "request_id": relation.id})
        if relation.sender_id == request.user.id:
            return Response({"status": relation.status + "_sent", "request_id": relation.id})
        return Response({"status": "incoming", "request_id": relation.id})


class FriendRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        received = FriendRequest.objects.filter(receiver=request.user, status="pending").select_related(
            "sender", "sender__profile"
        )
        sent = FriendRequest.objects.filter(sender=request.user, status="pending").select_related(
            "receiver", "receiver__profile"
        )
        accepted = FriendRequest.objects.filter(
            Q(sender=request.user) | Q(receiver=request.user), status="accepted"
        ).select_related("sender", "sender__profile", "receiver", "receiver__profile")
        friends = [
            UserSummarySerializer(item.receiver if item.sender_id == request.user.id else item.sender, context={"request": request}).data
            for item in accepted
        ]
        return Response({
            "incoming": FriendRequestSerializer(received, many=True, context={"request": request}).data,
            "outgoing": FriendRequestSerializer(sent, many=True, context={"request": request}).data,
            "friends": friends,
        })

    def post(self, request):
        member_id = parse_positive_id(request.data.get("member_id"), "member_id")
        if member_id == request.user.id:
            raise ValidationError({"member_id": "You cannot send a friend request to yourself."})
        recipient = User.objects.filter(pk=member_id, is_active=True).first()
        if not recipient:
            raise ValidationError({"member_id": "Member not found."})
        existing = FriendRequest.objects.filter(
            Q(sender=request.user, receiver=recipient) | Q(sender=recipient, receiver=request.user),
            status="accepted",
        ).exists()
        if existing:
            return Response({"status": "friends"}, status=status.HTTP_200_OK)
        incoming = FriendRequest.objects.filter(sender=recipient, receiver=request.user, status="pending").first()
        if incoming:
            raise ValidationError({"detail": "This member has already sent you a request. Accept it from your friend requests."})
        relation, created = FriendRequest.objects.get_or_create(
            sender=request.user,
            receiver=recipient,
            defaults={"status": "pending"},
        )
        if not created:
            relation.status = "pending"
            relation.responded_at = None
            relation.save(update_fields=["status", "responded_at"])
        return Response(
            FriendRequestSerializer(relation, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class FriendRequestResponseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        decision = request.data.get("decision")
        if decision not in ("accept", "decline"):
            raise ValidationError({"decision": "Choose accept or decline."})
        relation = FriendRequest.objects.filter(pk=pk, receiver=request.user, status="pending").first()
        if not relation:
            raise ValidationError({"request": "No pending friend request exists."})
        relation.status = "accepted" if decision == "accept" else "declined"
        relation.responded_at = timezone.now()
        relation.save(update_fields=["status", "responded_at"])
        return Response({"status": relation.status})


class ConversationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.filter(
            Q(user_a=request.user) | Q(user_b=request.user)
        ).select_related("user_a", "user_a__profile", "user_b", "user_b__profile").prefetch_related("messages")
        return Response(ConversationSerializer(conversations, many=True, context={"request": request}).data)

    def post(self, request):
        member_id = parse_positive_id(request.data.get("member_id"), "member_id")
        if member_id == request.user.id:
            raise ValidationError({"member_id": "You cannot start a conversation with yourself."})
        other = User.objects.filter(pk=member_id, is_active=True).first()
        if not other:
            raise ValidationError({"member_id": "Member not found."})
        are_friends = FriendRequest.objects.filter(
            Q(sender=request.user, receiver=other) | Q(sender=other, receiver=request.user),
            status="accepted",
        ).exists()
        if not are_friends:
            raise PermissionDenied("Send and accept a friend request before starting a conversation.")
        first, second = sorted((request.user, other), key=lambda user: user.pk)
        conversation, _ = Conversation.objects.get_or_create(user_a=first, user_b=second)
        return Response(
            ConversationSerializer(conversation, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class DirectMessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _conversation(self, request, pk):
        conversation = Conversation.objects.filter(pk=pk).filter(
            Q(user_a=request.user) | Q(user_b=request.user)
        ).first()
        if not conversation:
            raise PermissionDenied("You do not have access to this conversation.")
        return conversation

    def get(self, request, pk):
        conversation = self._conversation(request, pk)
        messages = conversation.messages.select_related("sender", "sender__profile").order_by("-created_at")[:100]
        return Response(DirectMessageSerializer(reversed(list(messages)), many=True, context={"request": request}).data)

    def post(self, request, pk):
        conversation = self._conversation(request, pk)
        body = request.data.get("body")
        if not isinstance(body, str) or not body.strip() or len(body) > 2000:
            raise ValidationError({"body": "Messages must contain 1 to 2000 characters."})
        message = DirectMessage.objects.create(conversation=conversation, sender=request.user, body=body.strip())
        conversation.save(update_fields=["updated_at"])
        return Response(
            DirectMessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ApprovedTrainerWriteMixin:
    def check_trainer_or_admin(self):
        if self.request.user.is_staff:
            return
        trainer = getattr(self.request.user, "trainer", None)
        if not trainer or trainer.status != "approved":
            raise PermissionDenied("Approved trainer access is required to publish content.")

class ExerciseViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ExerciseSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Exercise.objects.filter(approved=True)
        params = self.request.query_params
        if params.get("difficulty"): queryset = queryset.filter(difficulty=params["difficulty"])
        if params.get("equipment"): queryset = queryset.filter(equipment__iexact=params["equipment"])
        if params.get("source"): queryset = queryset.filter(source=params["source"])
        if params.get("search"): queryset = queryset.filter(name__icontains=params["search"])
        return queryset.order_by("name")

class WorkoutViewSet(ApprovedTrainerWriteMixin, viewsets.ModelViewSet):
    serializer_class = WorkoutSerializer
    def get_queryset(self):
        qs = Workout.objects.filter(status="published").select_related("creator").prefetch_related("workout_exercises__exercise")
        if self.request.user.is_authenticated and self.request.user.is_staff:
            qs = Workout.objects.all().select_related("creator").prefetch_related("workout_exercises__exercise")
        params = self.request.query_params
        if params.get("mode"): qs = qs.filter(mode=params["mode"])
        if params.get("difficulty"): qs = qs.filter(difficulty=params["difficulty"])
        if params.get("goal"): qs = qs.filter(goal=params["goal"])
        return qs
    def create(self, request, *args, **kwargs):
        self.check_trainer_or_admin()
        return super().create(request, *args, **kwargs)
    def perform_update(self, serializer):
        if not self.request.user.is_staff and serializer.instance.creator_id != self.request.user.id:
            raise PermissionDenied()
        self.check_trainer_or_admin()
        serializer.save()
    def perform_destroy(self, instance):
        if not self.request.user.is_staff and instance.creator_id != self.request.user.id:
            raise PermissionDenied()
        instance.delete()

class ChallengeViewSet(ApprovedTrainerWriteMixin, viewsets.ModelViewSet):
    serializer_class = ChallengeSerializer
    def get_queryset(self):
        qs = Challenge.objects.filter(status="published").select_related("creator").annotate(
            participant_total=Count("participants")
        ).prefetch_related("requirements__workout__workout_exercises__exercise")
        if self.request.user.is_authenticated and self.request.user.is_staff:
            qs = Challenge.objects.all().select_related("creator").annotate(
                participant_total=Count("participants")
            ).prefetch_related("requirements__workout__workout_exercises__exercise")
        params = self.request.query_params
        if params.get("goal"): qs = qs.filter(goal=params["goal"])
        return qs.order_by("starts_at", "title", "id")
    @action(detail=False, methods=["get"], permission_classes=[permissions.AllowAny])
    def current(self, request):
        today = timezone.localdate()
        queryset = (
            Challenge.objects.filter(status="published", starts_at__lte=today)
            .only("id", "title", "starts_at", "ends_at", "duration_days")
            .order_by("starts_at", "title", "id")
        )
        challenges = [
            challenge
            for challenge in queryset
            if (challenge.ends_at or challenge.starts_at + timedelta(days=challenge.duration_days - 1)) >= today
        ]
        return Response([{"id": challenge.id, "title": challenge.title} for challenge in challenges])
    def create(self, request, *args, **kwargs):
        self.check_trainer_or_admin()
        return super().create(request, *args, **kwargs)
    def perform_update(self, serializer):
        if not self.request.user.is_staff and serializer.instance.creator_id != self.request.user.id:
            raise PermissionDenied()
        self.check_trainer_or_admin()
        challenge = serializer.save()
        if challenge.status == "published":
            for workout in Workout.objects.filter(requirements__challenge=challenge, status="pending"):
                workout.status = "published"
                workout.save(update_fields=["status"])

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def checkout(self, request, pk=None):
        challenge = self.get_object()
        if challenge.status != "published":
            raise ValidationError({"challenge": "This challenge is not open for registration."})
        today = timezone.localdate()
        if challenge.ends_at and today > challenge.ends_at:
            raise ValidationError({"challenge": "This challenge has ended."})
        if challenge.participants.filter(user=request.user).exists():
            return Response({"joined": True, "already_joined": True})
        if challenge.registration_fee <= 0:
            raise ValidationError({"challenge": "This challenge is free. Use the join endpoint."})
        if (
            not challenge.allow_multiple
            and request.user.challenge_participations.filter(completed_at__isnull=True)
            .exclude(challenge=challenge).exists()
        ):
            raise ValidationError({"challenge": "This challenge does not allow multiple active challenges."})
        checkout_data = EventCheckoutSerializer(data=request.data)
        checkout_data.is_valid(raise_exception=True)
        payment = ChallengePayment.objects.create(
            challenge=challenge,
            user=request.user,
            amount=challenge.registration_fee,
            currency=challenge.currency,
            **checkout_data.validated_data,
        )
        try:
            checkout_url = initiate_challenge_payment(payment)
        except PayChanguError as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"checkout_url": checkout_url, "tx_ref": str(payment.tx_ref)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], permission_classes=[permissions.AllowAny])
    def members(self, request, pk=None):
        challenge = self.get_object()
        participants = challenge.participants.select_related("user", "user__profile").order_by("joined_at")
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(participants, request, view=self)
        return paginator.get_paginated_response(
            UserSummarySerializer([item.user for item in page], many=True, context={"request": request}).data
        )
    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        challenge = self.get_object()
        if challenge.status != "published":
            raise ValidationError({"challenge": "This challenge is not open for registration."})
        if challenge.registration_fee > 0:
            raise ValidationError({"challenge": "This challenge requires payment. Use the checkout registration flow."})
        today = timezone.localdate()
        if challenge.ends_at and today > challenge.ends_at:
            return Response({"detail": "This challenge has ended."}, status=status.HTTP_400_BAD_REQUEST)
        if not challenge.allow_multiple and request.user.challenge_participations.filter(completed_at__isnull=True).exclude(challenge=challenge).exists():
            return Response({"detail": "This challenge does not allow multiple active challenges."}, status=status.HTTP_400_BAD_REQUEST)
        participant, created = ChallengeParticipant.objects.get_or_create(user=request.user, challenge=challenge)
        member = UserSummarySerializer(request.user, context={"request": request}).data
        return Response({"joined": True, "already_joined": not created, "participant_id": participant.id, "participant": member}, status=status.HTTP_200_OK)
    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def my_progress(self, request, pk=None):
        challenge = self.get_object()
        participant = ChallengeParticipant.objects.filter(user=request.user, challenge=challenge).first()
        if not participant: return Response({"detail": "Join this challenge first."}, status=404)
        completions = ChallengeCompletionSerializer(participant.completions.select_related("requirement__workout"), many=True).data
        return Response({"completed": completions, "points": participant.completions.aggregate(total=Sum("points_awarded"))["total"] or 0})

class WorkoutSessionViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]
    def get_queryset(self): return WorkoutSession.objects.filter(user=self.request.user).select_related("workout")
    def perform_create(self, serializer):
        workout = serializer.validated_data["workout"]
        if workout.status != "published": raise ValidationError("This workout is not available.")
        serializer.save(user=self.request.user)
        from .services import award_eligible_achievements
        award_eligible_achievements(self.request.user)

class OutdoorActivityViewSet(viewsets.ModelViewSet):
    serializer_class = OutdoorActivitySerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]
    def get_queryset(self):
        queryset = OutdoorActivity.objects.filter(user=self.request.user).select_related("challenge")
        if self.request.query_params.get("activity_type"):
            queryset = queryset.filter(activity_type=self.request.query_params["activity_type"])
        return queryset
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class ActivityRecordViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ActivityRecord.objects.select_related(
            "user", "workout", "workout_session", "outdoor_activity", "event_registration",
            "event_registration__event", "event_registration__event__organizer_team",
            "event_registration__event__organizer", "verified_by",
        ).prefetch_related("challenge_completions")
        if not self.request.user.is_staff:
            queryset = queryset.filter(user=self.request.user)
        status_filter = self.request.query_params.get("verification_status")
        if status_filter:
            if status_filter not in dict(ActivityRecord.VERIFICATION_STATUSES):
                raise ValidationError({"verification_status": "Choose pending, verified, or rejected."})
            queryset = queryset.filter(verification_status=status_filter)
        activity_type = self.request.query_params.get("activity_type")
        if activity_type:
            if activity_type not in dict(ActivityRecord.TYPES):
                raise ValidationError({"activity_type": "Choose a supported activity type."})
            queryset = queryset.filter(activity_type=activity_type)
        return queryset

    def update_verification(self, request, status_value):
        record = self.get_object()
        can_review = request.user.is_staff
        registration = record.event_registration
        if registration and record.user_id != request.user.id:
            event = registration.event
            can_review = can_review or event.organizer_id == request.user.id
            can_review = can_review or bool(
                event.organizer_team_id and is_team_captain(request.user, event.organizer_team)
            )
        if not can_review:
            raise PermissionDenied("Only the event organizer or a SaaS administrator can review this activity.")
        if record.verification_status != "pending":
            raise ValidationError({"verification_status": "Only pending activity records can be reviewed."})
        review_notes = request.data.get("review_notes", "")
        if not isinstance(review_notes, str) or len(review_notes) > 240:
            raise ValidationError({"review_notes": "Review notes must be 240 characters or fewer."})
        record.verification_status = status_value
        record.verified_by = request.user
        record.verified_at = timezone.now()
        record.review_notes = review_notes
        record.save(update_fields=["verification_status", "verified_by", "verified_at", "review_notes"])
        return Response(self.get_serializer(record).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def verify(self, request, pk=None):
        return self.update_verification(request, "verified")

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def reject(self, request, pk=None):
        return self.update_verification(request, "rejected")

class TeamViewSet(viewsets.ModelViewSet):
    serializer_class = TeamSerializer
    queryset = Team.objects.select_related("captain").prefetch_related("memberships", "join_requests", "invitations")
    permission_classes = [permissions.AllowAny]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if TeamMembership.objects.filter(user=self.request.user, left_at__isnull=True).exists():
            raise ValidationError({"team": "Leave your current team before creating another."})
        try:
            with transaction.atomic():
                team = serializer.save(captain=self.request.user, created_by=self.request.user)
                TeamMembership.objects.create(team=team, user=self.request.user, role="captain")
        except IntegrityError:
            raise ValidationError({"team": "You already belong to another active team."})

    def perform_update(self, serializer):
        if not (self.request.user.is_staff or is_team_captain(self.request.user, serializer.instance)):
            raise PermissionDenied("Only the team captain can update team details.")
        serializer.save()

    def perform_destroy(self, instance):
        if not (self.request.user.is_staff or is_team_captain(self.request.user, instance)):
            raise PermissionDenied("Only the team captain can remove this team.")
        instance.delete()

    def _captain_team(self):
        team = self.get_object()
        if not (self.request.user.is_staff or is_team_captain(self.request.user, team)):
            raise PermissionDenied("Team captain access is required.")
        return team

    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        team = self.get_object()
        active = TeamMembership.objects.filter(user=request.user, left_at__isnull=True).first()
        if active:
            if active.team_id == team.id:
                return Response({"status": "member", "already_member": True})
            raise ValidationError({"team": "Leave your current team before joining another."})
        join_request, created = TeamJoinRequest.objects.get_or_create(
            team=team, user=request.user, status="pending"
        )
        return Response(
            {"status": "requested", "already_requested": not created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        team = self.get_object()
        membership = TeamMembership.objects.filter(team=team, user=request.user, left_at__isnull=True).first()
        if not membership:
            raise ValidationError({"team": "You are not an active member of this team."})
        if membership.role == "captain":
            raise ValidationError({"team": "Appoint another captain before leaving the team."})
        membership.left_at = timezone.now()
        membership.save(update_fields=["left_at"])
        return Response({"left": True})

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        team = self.get_object()
        if not (request.user.is_staff or team.memberships.filter(user=request.user, left_at__isnull=True).exists()):
            raise PermissionDenied("Team membership is required to view its member list.")
        memberships = team.memberships.filter(left_at__isnull=True).select_related("user", "user__profile")
        return Response(TeamMembershipSerializer(memberships, many=True, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def requests(self, request, pk=None):
        team = self._captain_team()
        requests = team.join_requests.filter(status="pending").select_related("user", "user__profile")
        return Response(TeamJoinRequestSerializer(requests, many=True, context={"request": request}).data)

    def _review_join_request(self, request, decision):
        team = self._captain_team()
        try:
            request_id = parse_positive_id(request.data.get("request_id"), "request_id")
            join_request = team.join_requests.select_related("user").get(
                pk=request_id, status="pending"
            )
        except TeamJoinRequest.DoesNotExist:
            raise ValidationError({"request_id": "No pending join request exists for this team."})
        if decision == "accepted":
            existing = TeamMembership.objects.filter(user=join_request.user, left_at__isnull=True).first()
            if existing and existing.team_id != team.id:
                raise ValidationError({"user": "This member already belongs to another team."})
            if not existing:
                try:
                    with transaction.atomic():
                        validate_team_capacity_for_competitions(team)
                        TeamMembership.objects.create(team=team, user=join_request.user)
                except IntegrityError:
                    raise ValidationError({"user": "This member already belongs to another team."})
        join_request.status = decision
        join_request.reviewed_at = timezone.now()
        join_request.save(update_fields=["status", "reviewed_at"])
        return Response({"status": decision})

    @action(detail=True, methods=["post"])
    def approve_request(self, request, pk=None):
        return self._review_join_request(request, "accepted")

    @action(detail=True, methods=["post"])
    def reject_request(self, request, pk=None):
        return self._review_join_request(request, "rejected")

    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        team = self._captain_team()
        username = request.data.get("username")
        if not isinstance(username, str) or not username.strip():
            raise ValidationError({"username": "Enter the member's username."})
        invitee = User.objects.filter(username__iexact=username.strip(), is_active=True).first()
        if not invitee:
            raise ValidationError({"username": "No active member has that username."})
        if TeamMembership.objects.filter(user=invitee, left_at__isnull=True).exists():
            raise ValidationError({"username": "This member already belongs to a team."})
        validate_team_capacity_for_competitions(team)
        invitation, created = TeamInvitation.objects.get_or_create(
            team=team, invitee=invitee, status="pending", defaults={"invited_by": request.user}
        )
        return Response(
            TeamInvitationSerializer(invitation, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def set_captain(self, request, pk=None):
        team = self._captain_team()
        user_id = parse_positive_id(request.data.get("user_id"), "user_id")
        membership = team.memberships.filter(
            user_id=user_id, left_at__isnull=True
        ).first()
        if not membership:
            raise ValidationError({"user_id": "Choose an active member of this team."})
        if membership.role == "captain":
            return Response({"captain_id": membership.user_id})
        with transaction.atomic():
            team.memberships.filter(role="captain", left_at__isnull=True).update(role="member")
            membership.role = "captain"
            membership.save(update_fields=["role"])
            team.captain = membership.user
            team.save(update_fields=["captain"])
        return Response({"captain_id": membership.user_id})


class TeamInvitationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TeamInvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return TeamInvitation.objects.filter(invitee=self.request.user).select_related(
            "team", "invitee__profile", "invited_by__profile"
        )

    def _respond(self, request, decision):
        invitation = self.get_object()
        if invitation.status != "pending":
            raise ValidationError({"invitation": "This invitation has already been answered."})
        if decision == "accepted":
            active = TeamMembership.objects.filter(user=request.user, left_at__isnull=True).first()
            if active and active.team_id != invitation.team_id:
                raise ValidationError({"invitation": "Leave your current team before accepting another invitation."})
            if not active:
                try:
                    with transaction.atomic():
                        validate_team_capacity_for_competitions(invitation.team)
                        TeamMembership.objects.create(team=invitation.team, user=request.user)
                except IntegrityError:
                    raise ValidationError({"invitation": "You already belong to another team."})
        invitation.status = decision
        invitation.responded_at = timezone.now()
        invitation.save(update_fields=["status", "responded_at"])
        return Response({"status": decision})

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        return self._respond(request, "accepted")

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        return self._respond(request, "declined")


class AdventureEventViewSet(viewsets.ModelViewSet):
    serializer_class = AdventureEventSerializer
    permission_classes = [permissions.AllowAny]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        queryset = AdventureEvent.objects.filter(status="published").select_related(
            "organizer", "organizer__profile", "organizer_team"
        )
        if self.request.user.is_authenticated and self.request.user.is_staff:
            queryset = AdventureEvent.objects.all().select_related("organizer", "organizer__profile", "organizer_team")
        category = self.request.query_params.get("category")
        location = self.request.query_params.get("location")
        if category:
            queryset = queryset.filter(category=category)
        if location:
            queryset = queryset.filter(location__icontains=location)
        return queryset

    def perform_create(self, serializer):
        team = serializer.validated_data.get("organizer_team")
        if team:
            if not is_team_captain(self.request.user, team) and not self.request.user.is_staff:
                raise PermissionDenied("Only that team's captain can organize for it.")
        elif not can_organize(self.request.user):
            raise PermissionDenied("Approved trainer or SaaS administrator access is required to organize events.")
        serializer.save(organizer=self.request.user)

    def perform_update(self, serializer):
        event = serializer.instance
        if not (
            self.request.user.is_staff
            or event.organizer_id == self.request.user.id
            or (event.organizer_team_id and is_team_captain(self.request.user, event.organizer_team))
        ):
            raise PermissionDenied("Only the event organizer can update it.")
        serializer.save()

    def perform_destroy(self, instance):
        if not (self.request.user.is_staff or instance.organizer_id == self.request.user.id):
            raise PermissionDenied("Only the event organizer can remove it.")
        instance.delete()

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def checkout(self, request, pk=None):
        event = self.get_object()
        if event.status != "published" or event.starts_at <= timezone.now():
            raise ValidationError({"event": "Registration is closed for this event."})
        if event.registration_fee <= 0:
            raise ValidationError({"event": "This event is free. Use the registration button to join."})
        if event.registrations.filter(user=request.user, team__isnull=True, status="registered").exists():
            return Response({"registered": True})

        attendee_count = event_attendee_count(event)
        if event.participant_limit is not None and attendee_count >= event.participant_limit:
            raise ValidationError({"event": "There are no places available for this registration."})
        checkout_data = EventCheckoutSerializer(data=request.data)
        checkout_data.is_valid(raise_exception=True)
        payment = EventPayment.objects.create(
            event=event,
            user=request.user,
            amount=event.registration_fee,
            currency=event.currency,
            **checkout_data.validated_data,
        )
        try:
            checkout_url = initiate_event_payment(payment)
        except PayChanguError as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"checkout_url": checkout_url, "tx_ref": str(payment.tx_ref)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        event = self.get_object()
        if event.status != "published" or event.starts_at <= timezone.now():
            raise ValidationError({"event": "Registration is closed for this event."})
        if event.registration_fee > 0:
            raise ValidationError({"event": "This event requires payment. Use the checkout registration flow."})
        team_id = request.data.get("team_id")
        team = None
        if team_id:
            team_id = parse_positive_id(team_id, "team_id")
            team = Team.objects.filter(pk=team_id).first()
            if not team:
                raise ValidationError({"team_id": "Team not found."})
            if not is_team_captain(request.user, team):
                raise PermissionDenied("Only a team captain can register a team.")
        elif TeamMembership.objects.filter(user=request.user, left_at__isnull=True).exists():
            # Team members may still register individually.
            pass
        contact_data = {}
        if team is None and any(key in request.data for key in ("first_name", "last_name", "email", "phone")):
            checkout_data = EventCheckoutSerializer(data=request.data)
            checkout_data.is_valid(raise_exception=True)
            contact_data = checkout_data.validated_data

        with transaction.atomic():
            event = AdventureEvent.objects.select_for_update().get(pk=event.pk)
            existing = EventRegistration.objects.filter(
                event=event, status="registered", team=team
            )
            if team is None:
                existing = existing.filter(user=request.user)
            existing = existing.first()
            if existing:
                return Response({"registered": True, "already_registered": True})
            attendee_count = event_attendee_count(event)
            additional = team.memberships.filter(left_at__isnull=True).count() if team else 1
            if event.participant_limit is not None and attendee_count + additional > event.participant_limit:
                raise ValidationError({"event": "There are not enough available places for this registration."})
            EventRegistration.objects.create(
                event=event,
                user=request.user,
                team=team,
                participant_count=additional,
                first_name=contact_data.get("first_name") or (
                    request.user.profile.display_name.split(" ", 1)[0]
                    if hasattr(request.user, "profile") and request.user.profile.display_name
                    else request.user.username
                ),
                last_name=contact_data.get("last_name", ""),
                email=contact_data.get("email") or request.user.email,
                phone=contact_data.get("phone", ""),
            )
        return Response({"registered": True, "already_registered": False}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        event = self.get_object()
        if not (
            request.user.is_staff
            or event.organizer_id == request.user.id
            or (event.organizer_team_id and is_team_captain(request.user, event.organizer_team))
        ):
            raise PermissionDenied("Only the event organizer can cancel it.")
        event.status = "cancelled"
        event.save(update_fields=["status"])
        return Response({"cancelled": True})


class EventRegistrationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = EventRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = EventRegistration.objects.select_related("event", "team", "user")
        if not self.request.user.is_staff:
            queryset = queryset.filter(Q(user=self.request.user) | Q(team__memberships__user=self.request.user, team__memberships__left_at__isnull=True)).distinct()
        return queryset

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        registration = self.get_object()
        is_manager = registration.team_id and is_team_captain(request.user, registration.team)
        if registration.user_id != request.user.id and not is_manager and not request.user.is_staff:
            raise PermissionDenied("Only the registrant or team captain can cancel.")
        if registration.status == "cancelled":
            return Response({"cancelled": True, "already_cancelled": True})
        registration.status = "cancelled"
        registration.save(update_fields=["status"])
        return Response({"cancelled": True})


class EventPaymentVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tx_ref = request.data.get("tx_ref")
        if not tx_ref:
            raise ValidationError({"tx_ref": "A payment reference is required."})
        try:
            tx_ref = UUID(str(tx_ref))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"tx_ref": "Payment reference is invalid."})
        payment = EventPayment.objects.filter(tx_ref=tx_ref, user=request.user).select_related("event").first()
        if not payment:
            raise ValidationError({"tx_ref": "Payment not found."})
        try:
            paid = verify_and_register_event_payment(payment)
        except PayChanguError as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        payment.refresh_from_db()
        return Response({
            "status": "paid" if paid else payment.status,
            "event_title": payment.event.title,
            "registered": bool(paid and payment.registration_id),
        })


class ChallengePaymentVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tx_ref = request.data.get("tx_ref")
        if not tx_ref:
            raise ValidationError({"tx_ref": "A payment reference is required."})
        try:
            tx_ref = UUID(str(tx_ref))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"tx_ref": "Payment reference is invalid."})
        payment = ChallengePayment.objects.filter(tx_ref=tx_ref, user=request.user).select_related("challenge").first()
        if not payment:
            raise ValidationError({"tx_ref": "Payment not found."})
        try:
            paid = verify_and_join_challenge_payment(payment)
        except PayChanguError as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        payment.refresh_from_db()
        return Response({
            "status": "paid" if paid else payment.status,
            "challenge_title": payment.challenge.title,
            "registered": paid and payment.challenge.participants.filter(user=request.user).exists(),
        })


class EventPaymentCallbackView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        tx_ref = request.data.get("tx_ref") or request.query_params.get("tx_ref")
        if not tx_ref:
            raise ValidationError({"tx_ref": "A payment reference is required."})
        try:
            tx_ref = UUID(str(tx_ref))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"tx_ref": "Payment reference is invalid."})
        payment = EventPayment.objects.filter(tx_ref=tx_ref).first()
        challenge_payment = ChallengePayment.objects.filter(tx_ref=tx_ref).first()
        if not payment and not challenge_payment:
            raise ValidationError({"tx_ref": "Payment not found."})
        try:
            if payment:
                verify_and_register_event_payment(payment)
            else:
                verify_and_join_challenge_payment(challenge_payment)
        except PayChanguError as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"received": True})


class CompetitionViewSet(viewsets.ModelViewSet):
    serializer_class = CompetitionSerializer
    permission_classes = [permissions.AllowAny]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "standings"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        queryset = Competition.objects.filter(status="open").select_related("organizer", "organizer__profile").prefetch_related("entries")
        if self.request.user.is_authenticated and self.request.user.is_staff:
            queryset = Competition.objects.all().select_related("organizer", "organizer__profile").prefetch_related("entries")
        return queryset

    def perform_create(self, serializer):
        if not can_organize(self.request.user):
            raise PermissionDenied("Approved trainer or SaaS administrator access is required to organize competitions.")
        serializer.save(organizer=self.request.user)

    def perform_update(self, serializer):
        competition = serializer.instance
        if not (self.request.user.is_staff or competition.organizer_id == self.request.user.id):
            raise PermissionDenied("Only the competition organizer can update it.")
        immutable = ("starts_on", "ends_on", "eligible_activity_types", "scoring_mode", "min_team_size", "max_team_size")
        if competition.entries.filter(status="registered").exists() and any(
            serializer.validated_data.get(field, getattr(competition, field)) != getattr(competition, field)
            for field in immutable
        ):
            raise ValidationError({"competition": "Scoring and eligibility rules cannot change after teams register."})
        serializer.save()

    def perform_destroy(self, instance):
        if not (self.request.user.is_staff or instance.organizer_id == self.request.user.id):
            raise PermissionDenied("Only the competition organizer can remove it.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        competition = self.get_object()
        if competition.status != "open" or timezone.localdate() > competition.ends_on:
            raise ValidationError({"competition": "Team registration is closed."})
        team_id = parse_positive_id(request.data.get("team_id"), "team_id")
        team = Team.objects.filter(pk=team_id).first()
        if not team:
            raise ValidationError({"team_id": "Choose a team to enter."})
        if not is_team_captain(request.user, team):
            raise PermissionDenied("Only the team captain can enter a competition.")
        member_count = team.memberships.filter(left_at__isnull=True).count()
        if member_count < competition.min_team_size:
            raise ValidationError({"team": f"This competition requires at least {competition.min_team_size} active team members."})
        if competition.max_team_size is not None and member_count > competition.max_team_size:
            raise ValidationError({"team": f"This competition allows at most {competition.max_team_size} team members."})
        try:
            with transaction.atomic():
                entry, created = CompetitionEntry.objects.get_or_create(
                    competition=competition,
                    team=team,
                    status="registered",
                    defaults={"registered_by": request.user},
                )
        except IntegrityError:
            entry = competition.entries.get(team=team, status="registered")
            created = False
        if not created:
            return Response({"entered": True, "already_entered": True, "entry_id": entry.id})
        return Response({"entered": True, "already_entered": False, "entry_id": entry.id}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        competition = self.get_object()
        entry = competition.entries.filter(
            status="registered",
            team__memberships__user=request.user,
            team__memberships__role="captain",
            team__memberships__left_at__isnull=True,
        ).first()
        if not entry and not request.user.is_staff:
            raise PermissionDenied("An entered team's captain must withdraw it.")
        if not entry:
            team_id = parse_positive_id(request.data.get("team_id"), "team_id")
            entry = competition.entries.filter(team_id=team_id, status="registered").first()
        if not entry:
            raise ValidationError({"team_id": "No active entry found."})
        entry.status = "withdrawn"
        entry.save(update_fields=["status"])
        return Response({"withdrawn": True})

    @action(detail=True, methods=["get"])
    def standings(self, request, pk=None):
        competition = self.get_object()
        entries = competition.entries.filter(status="registered").select_related("team").order_by("registered_at")
        results = []
        for entry in entries:
            memberships = list(TeamMembership.objects.filter(team=entry.team).select_related("user", "user__profile"))
            member_ids = [membership.user_id for membership in memberships]
            activities = ActivityRecord.objects.filter(
                user_id__in=member_ids,
                activity_type__in=competition.eligible_activity_types,
                verification_status="verified",
                completed_at__date__gte=competition.starts_on,
                completed_at__date__lte=competition.ends_on,
            ).select_related("user", "user__profile").order_by("completed_at", "id")
            member_windows = {}
            for membership in memberships:
                member_windows.setdefault(membership.user_id, []).append((membership.joined_at, membership.left_at))
            contributions = {}
            for activity in activities:
                windows = member_windows.get(activity.user_id, [])
                if not any(
                    activity.completed_at >= joined_at and (left_at is None or activity.completed_at < left_at)
                    for joined_at, left_at in windows
                ):
                    continue
                user_row = contributions.setdefault(activity.user_id, {
                    "member": UserSummarySerializer(activity.user, context={"request": request}).data,
                    "activity_count": 0,
                    "distance_km": 0.0,
                    "duration_minutes": 0.0,
                    "score": 0.0,
                })
                user_row["activity_count"] += 1
                user_row["distance_km"] += float(activity.distance_km or 0)
                user_row["duration_minutes"] += (activity.duration_seconds or 0) / 60
            for row in contributions.values():
                if competition.scoring_mode == "activity_count":
                    row["score"] = row["activity_count"]
                elif competition.scoring_mode == "distance_km":
                    row["score"] = round(row["distance_km"], 2)
                else:
                    row["score"] = round(row["duration_minutes"], 2)
                row["distance_km"] = round(row["distance_km"], 2)
                row["duration_minutes"] = round(row["duration_minutes"], 2)
            score = sum(row["score"] for row in contributions.values())
            results.append({
                "team_id": entry.team_id,
                "team_name": entry.team.name,
                "score": round(score, 2),
                "activity_count": sum(row["activity_count"] for row in contributions.values()),
                "members": sorted(contributions.values(), key=lambda row: (-row["score"], row["member"]["name"])),
            })
        results.sort(key=lambda row: (-row["score"], row["team_name"].casefold()))
        for rank, row in enumerate(results, start=1):
            row["rank"] = rank
        return Response({
            "competition": CompetitionSerializer(competition, context={"request": request}).data,
            "scoring_mode": competition.scoring_mode,
            "verified_activities_only": True,
            "standings": results,
        })

class ChallengeCompletionViewSet(viewsets.ModelViewSet):
    serializer_class = ChallengeCompletionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]
    def get_queryset(self): return ChallengeCompletion.objects.filter(participant__user=self.request.user).select_related("requirement__workout", "requirement__challenge")
    def perform_create(self, serializer):
        if serializer.validated_data["requirement"].challenge.status != "published": raise ValidationError("This challenge is not available.")
        serializer.save()

class NutritionGoalViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NutritionGoalSerializer
    permission_classes = [permissions.AllowAny]
    queryset = NutritionGoal.objects.filter(is_active=True)

class MealPlanViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MealPlanSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        queryset = MealPlan.objects.filter(is_published=True, goal__is_active=True).select_related("goal").prefetch_related("meals")
        goal = self.request.query_params.get("goal")
        if goal:
            if not NutritionGoal.objects.filter(slug=goal, is_active=True).exists():
                raise ValidationError({"goal": "Choose an active nutrition goal."})
            queryset = queryset.filter(goal__slug=goal)
        return queryset

class NutritionSupplementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NutritionSupplementSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = NutritionSupplement.objects.filter(is_published=True, goal__is_active=True).select_related("goal")
        goal = self.request.query_params.get("goal")
        if goal:
            if not NutritionGoal.objects.filter(slug=goal, is_active=True).exists():
                raise ValidationError({"goal": "Choose an active nutrition goal."})
            queryset = queryset.filter(goal__slug=goal)
        return queryset

class PostViewSet(viewsets.ModelViewSet):
    serializer_class = PostSerializer
    def get_queryset(self):
        queryset = Post.objects.filter(is_hidden=False).select_related(
            "author", "author__profile", "challenge"
        ).prefetch_related("comments__author__profile", "reactions")
        author_id = self.request.query_params.get("author")
        if author_id:
            queryset = queryset.filter(author_id=parse_positive_id(author_id, "author"))
        return queryset
    def perform_update(self, serializer):
        if serializer.instance.author_id != self.request.user.id and not self.request.user.is_staff: raise PermissionDenied()
        serializer.save()
    def perform_destroy(self, instance):
        if instance.author_id != self.request.user.id and not self.request.user.is_staff: raise PermissionDenied()
        instance.delete()
    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def react(self, request, pk=None):
        post = self.get_object()
        reaction, created = Reaction.objects.get_or_create(post=post, user=request.user)
        if not created:
            reaction.delete()
            return Response({"reacted": False, "count": post.reactions.count()})
        return Response({"reacted": True, "count": post.reactions.count()})
    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def report(self, request, pk=None):
        post = self.get_object()
        reason = str(request.data.get("reason", "Community guideline concern"))[:240]
        Report.objects.create(reporter=request.user, post=post, reason=reason)
        return Response({"reported": True}, status=status.HTTP_201_CREATED)

class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]
    def get_queryset(self):
        qs = Comment.objects.filter(is_hidden=False).select_related("author", "author__profile")
        if self.request.query_params.get("post"): qs = qs.filter(post_id=self.request.query_params["post"])
        return qs
    def perform_destroy(self, instance):
        if instance.author_id != self.request.user.id and not self.request.user.is_staff: raise PermissionDenied()
        instance.delete()

class LeaderboardView(APIView):
    permission_classes = [permissions.AllowAny]
    def get(self, request):
        challenge_id = request.query_params.get("challenge")
        scope = request.query_params.get("scope", "city")
        if scope not in ("area", "city", "country"):
            raise ValidationError({"scope": "Choose area, city, or country."})
        profile = getattr(request.user, "profile", None) if request.user.is_authenticated else None
        today = timezone.localdate()
        ongoing_challenge_ids = [
            challenge.id
            for challenge in Challenge.objects.filter(status="published", starts_at__lte=today).only(
                "id", "starts_at", "ends_at", "duration_days"
            )
            if (challenge.ends_at or challenge.starts_at + timedelta(days=challenge.duration_days - 1)) >= today
        ]
        active_participations = ChallengeParticipant.objects.filter(
            user_id=OuterRef("pk"),
            challenge_id__in=ongoing_challenge_ids,
        )
        active_point_transactions = PointTransaction.objects.filter(
            user_id=OuterRef("pk"),
            challenge_id__in=ongoing_challenge_ids,
            challenge__participants__user_id=OuterRef("pk"),
        )
        if challenge_id:
            active_participations = active_participations.filter(challenge_id=challenge_id)
            active_point_transactions = active_point_transactions.filter(challenge_id=challenge_id)
        active_point_total = active_point_transactions.order_by().values("user_id").annotate(
            total=Sum("points")
        ).values("total")[:1]
        entries = User.objects.filter(
            is_active=True,
            is_staff=False,
            trainer__isnull=True,
        ).filter(Exists(active_participations)).select_related("profile").annotate(
            points_total=Coalesce(Subquery(active_point_total), 0)
        )
        location = request.query_params.get("location", "") or (getattr(profile, scope, "") if profile else "")
        if location:
            entries = entries.filter(**{f"profile__{scope}": location})
        rows = []
        people = list(entries.order_by("-points_total", "username")[:100])
        point_sources = {}
        sources = PointTransaction.objects.filter(
            user_id__in=[person.id for person in people],
            challenge_id__in=ongoing_challenge_ids,
            challenge__participants__user_id=F("user_id"),
        )
        if challenge_id: sources = sources.filter(challenge_id=challenge_id)
        for source in sources.values("user_id", "challenge_id", "challenge__title").annotate(total=Sum("points")).order_by("-total"):
            point_sources.setdefault(source["user_id"], []).append({
                "challenge_id": source["challenge_id"],
                "name": source["challenge__title"] or "Other points",
                "points": source["total"],
            })
        for person in people:
            summary = UserSummarySerializer(person, context={"request": request}).data
            rows.append({**summary, "points": person.points_total or 0, "point_sources": point_sources.get(person.id, [])})
        return Response(rows)

class DashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        user = request.user
        Profile.objects.get_or_create(user=user, defaults={"display_name": user.username})
        participations = ChallengeParticipant.objects.filter(user=user, completed_at__isnull=True).select_related("challenge")
        sessions = WorkoutSession.objects.filter(user=user).select_related("workout")
        activity_records = ActivityRecord.objects.filter(user=user).select_related("workout").prefetch_related("challenge_completions")
        workout_records = activity_records.filter(activity_type="workout")
        points = sum(user.point_transactions.values_list("points", flat=True))
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        activity_by_day = {
            row["completed_day"]: row["count"]
            for row in workout_records.filter(completed_at__date__gte=week_start, completed_at__date__lte=today)
            .annotate(completed_day=TruncDate("completed_at"))
            .values("completed_day")
            .annotate(count=Count("id"))
        }
        return Response({
            "user": MeSerializer(user, context={"request": request}).data,
            "points": points,
            "active_challenges": ChallengeSerializer([p.challenge for p in participations], many=True, context={"request": request}).data,
            "workout_count": workout_records.count(),
            "activity_count": activity_records.count(),
            "recent_activities": ActivityRecordSerializer(activity_records[:10], many=True, context={"request": request}).data,
            "completed_challenge_count": ChallengeParticipant.objects.filter(user=user, completed_at__isnull=False).count(),
            "recent_workouts": WorkoutSessionSerializer(sessions[:5], many=True).data,
            "recent_points": PointTransactionSerializer(user.point_transactions.all()[:5], many=True).data,
            "achievements": UserAchievementSerializer(user.achievements.select_related("achievement"), many=True).data,
            "weekly_activity": [
                {"weekday": (week_start + timedelta(days=offset)).strftime("%a")[0],
                 "count": activity_by_day.get(week_start + timedelta(days=offset), 0),
                 "is_today": week_start + timedelta(days=offset) == today}
                for offset in range(7)
            ],
        })


class AdminOverviewView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({
            "members": User.objects.filter(is_staff=False, trainer__isnull=True).count(),
            "trainers": Trainer.objects.count(),
            "pending_trainers": Trainer.objects.filter(status="pending").count(),
            "pending_activities": ActivityRecord.objects.filter(verification_status="pending").count(),
            "challenges": Challenge.objects.count(),
            "posts": Post.objects.count(),
        })


class AdminAccountsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        accounts = User.objects.filter(is_staff=False).select_related("profile", "trainer")
        search = request.query_params.get("search", "").strip()[:100]
        if search:
            accounts = accounts.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(profile__display_name__icontains=search)
            )
        accounts = accounts.order_by("-date_joined", "id")
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(accounts, request)
        results = []
        for account in page:
            profile = getattr(account, "profile", None)
            trainer = getattr(account, "trainer", None)
            results.append({
                "id": account.id,
                "username": account.username,
                "email": account.email,
                "name": (profile.display_name or account.username) if profile else account.username,
                "role": "trainer" if trainer else "member",
                "trainer_status": trainer.status if trainer else None,
                "is_active": account.is_active,
                "joined_at": account.date_joined,
            })
        return paginator.get_paginated_response(results)


class AdminAccountStatusView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        is_active = request.data.get("is_active")
        if not isinstance(is_active, bool):
            raise ValidationError({"is_active": "Choose whether this account is active."})
        account = User.objects.filter(pk=pk, is_staff=False).first()
        if not account:
            return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
        if account.pk == request.user.pk and not is_active:
            raise PermissionDenied("You cannot suspend your own administrator account.")
        account.is_active = is_active
        account.save(update_fields=["is_active"])
        return Response({"id": account.pk, "is_active": account.is_active})


class AdminTrainersView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        trainers = Trainer.objects.select_related("user", "user__profile")
        status_filter = request.query_params.get("status", "pending")
        if status_filter != "all":
            if status_filter not in dict(Trainer.STATUS):
                raise ValidationError({"status": "Choose pending, approved, rejected, or all."})
            trainers = trainers.filter(status=status_filter)
        trainers = trainers.order_by("-applied_at", "id")
        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(trainers, request)
        results = [{
            "id": trainer.id,
            "user_id": trainer.user_id,
            "username": trainer.user.username,
            "email": trainer.user.email,
            "name": trainer.user.profile.display_name if hasattr(trainer.user, "profile") else trainer.user.username,
            "expertise": trainer.expertise,
            "experience_years": trainer.experience_years,
            "status": trainer.status,
            "applied_at": trainer.applied_at,
        } for trainer in page]
        return paginator.get_paginated_response(results)


class AdminTrainerReviewView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        decision = request.data.get("status")
        if decision not in ("approved", "rejected"):
            raise ValidationError({"status": "Choose approved or rejected."})
        trainer = Trainer.objects.filter(pk=pk).first()
        if not trainer:
            return Response({"detail": "Trainer application not found."}, status=status.HTTP_404_NOT_FOUND)
        if trainer.status != "pending":
            raise ValidationError({"status": "Only pending trainer applications can be reviewed."})
        trainer.status = decision
        trainer.approved_at = timezone.now() if decision == "approved" else None
        trainer.save(update_fields=["status", "approved_at"])
        return Response({"id": trainer.pk, "status": trainer.status, "approved_at": trainer.approved_at})


class TrainerApplicationView(APIView):
    def get(self, request):
        trainer = getattr(request.user, "trainer", None)
        if not trainer: return Response({"status": "not_applied"})
        return Response({**TrainerSerializer(trainer).data, "status": trainer.status})
    def post(self, request):
        serializer = TrainerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trainer, created = Trainer.objects.update_or_create(user=request.user, defaults={**serializer.validated_data, "status": "pending"})
        return Response({**TrainerSerializer(trainer).data, "status": trainer.status}, status=201 if created else 200)

class TrainerMetricsView(APIView):
    def get(self, request):
        trainer = getattr(request.user, "trainer", None)
        if not trainer or trainer.status != "approved": raise PermissionDenied("Approved trainer access is required.")
        workouts = Workout.objects.filter(creator=request.user)
        challenges = Challenge.objects.filter(creator=request.user)
        participant_count = ChallengeParticipant.objects.filter(challenge__in=challenges).values("user").distinct().count()
        completions = ChallengeCompletion.objects.filter(requirement__challenge__in=challenges).count()
        possible = ChallengeParticipant.objects.filter(challenge__in=challenges).count()
        finished = ChallengeParticipant.objects.filter(challenge__in=challenges, completed_at__isnull=False).count()
        workout_records = ActivityRecord.objects.filter(workout__in=workouts, activity_type="workout")
        returning_users = workout_records.values("user").annotate(sessions=Count("id")).filter(sessions__gt=1).count()
        return Response({
            "participants": participant_count,
            "workout_completions": workout_records.count(),
            "challenge_completions": completions,
            "active_users": ChallengeParticipant.objects.filter(challenge__in=challenges, completed_at__isnull=True).values("user").distinct().count(),
            "returning_users": returning_users,
            "challenge_completion_percent": round(finished / possible * 100) if possible else 0,
            "eligible_earnings": trainer.eligible_earnings,
            "commission_note": "Commission is set by PrimeFit administration.",
        })
