from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("primefit", "0013_profile_last_seen_follow"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="cover_photo",
            field=models.ImageField(blank=True, upload_to="profile_covers/"),
        ),
    ]
