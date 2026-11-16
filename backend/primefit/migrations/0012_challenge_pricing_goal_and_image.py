import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


CHALLENGE_GOALS = [
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


class Migration(migrations.Migration):

    dependencies = [
        ("primefit", "0011_challengeworkout_activity_type_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="profile",
            name="fitness_goal",
            field=models.CharField(choices=CHALLENGE_GOALS, default="fitness", max_length=20),
        ),
        migrations.AlterField(
            model_name="workout",
            name="goal",
            field=models.CharField(choices=CHALLENGE_GOALS, default="fitness", max_length=20),
        ),
        migrations.AlterField(
            model_name="challenge",
            name="goal",
            field=models.CharField(choices=CHALLENGE_GOALS, default="fitness", max_length=20),
        ),
        migrations.AlterField(
            model_name="challenge",
            name="difficulty",
            field=models.CharField(choices=[("beginner", "Beginner"), ("intermediate", "Intermediate"), ("advanced", "Advanced")], default="beginner", max_length=20),
        ),
        migrations.AddField(
            model_name="challenge",
            name="image",
            field=models.ImageField(blank=True, upload_to="challenges/"),
        ),
        migrations.AddField(
            model_name="challenge",
            name="registration_fee",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="challenge",
            name="currency",
            field=models.CharField(choices=[("MWK", "MWK"), ("USD", "USD")], default="MWK", max_length=3),
        ),
        migrations.CreateModel(
            name="ChallengePayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tx_ref", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("provider_reference", models.CharField(blank=True, max_length=120)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=10)),
                ("currency", models.CharField(max_length=3)),
                ("first_name", models.CharField(max_length=80)),
                ("last_name", models.CharField(blank=True, max_length=80)),
                ("email", models.EmailField(max_length=254)),
                ("phone", models.CharField(blank=True, max_length=32)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("paid", "Paid"), ("failed", "Failed")], default="pending", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("challenge", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payments", to="primefit.challenge")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="challenge_payments", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
