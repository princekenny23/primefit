from django.db import migrations


def publish_trainer_workouts(apps, schema_editor):
    Workout = apps.get_model("primefit", "Workout")
    Workout.objects.filter(status="pending", creator__isnull=False).update(status="published")


class Migration(migrations.Migration):
    dependencies = [
        ("primefit", "0007_activityrecord_event_registration"),
    ]

    operations = [
        migrations.RunPython(publish_trainer_workouts, migrations.RunPython.noop),
    ]
