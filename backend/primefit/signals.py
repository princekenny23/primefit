from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ActivityRecord, OutdoorActivity, WorkoutSession


@receiver(post_save, sender=WorkoutSession, dispatch_uid="primefit.record_workout_session")
def record_workout_session(sender, instance, created, **kwargs):
    if not created:
        return
    ActivityRecord.objects.get_or_create(
        workout_session=instance,
        defaults={
            "user_id": instance.user_id,
            "activity_type": "workout",
            "workout_id": instance.workout_id,
            "completed_at": instance.completed_at,
            "weight_kg": instance.weight_kg,
            "sets_completed": instance.sets_completed,
            "notes": instance.notes,
            "source": "workout",
            "verification_status": "verified",
            "verified_at": instance.completed_at,
        },
    )


@receiver(post_save, sender=OutdoorActivity, dispatch_uid="primefit.record_outdoor_activity")
def record_outdoor_activity(sender, instance, created, **kwargs):
    if not created:
        return
    ActivityRecord.objects.get_or_create(
        outdoor_activity=instance,
        defaults={
            "user_id": instance.user_id,
            "activity_type": instance.activity_type,
            "completed_at": instance.started_at,
            "duration_seconds": instance.duration_seconds,
            "distance_km": instance.distance_km,
            "elevation_gain_m": instance.elevation_gain_m,
            "notes": instance.notes,
            "source": instance.source,
            "verification_status": "pending",
        },
    )
