from django.db import migrations, models
import django.db.models.deletion


def create_nutrition_goals(apps, schema_editor):
    NutritionGoal = apps.get_model("primefit", "NutritionGoal")
    database = schema_editor.connection.alias
    goals = [
        ("balanced", "Balanced nutrition", "Build steady, nourishing everyday habits.", 0),
        ("fat-loss", "Weight management", "A practical, satisfying approach to portions.", 1),
        ("muscle-gain", "Build muscle", "Fuel training and support recovery.", 2),
        ("endurance", "Endurance", "Plan energizing meals around active days.", 3),
        ("energy", "Everyday energy", "Keep meals simple, colorful, and satisfying.", 4),
    ]
    NutritionGoal.objects.using(database).bulk_create([
        NutritionGoal(slug=slug, label=label, description=description, position=position)
        for slug, label, description, position in goals
    ])


class Migration(migrations.Migration):

    dependencies = [
        ("primefit", "0014_profile_cover_photo"),
    ]

    operations = [
        migrations.CreateModel(
            name="NutritionGoal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=60, unique=True)),
                ("label", models.CharField(max_length=100)),
                ("description", models.TextField(blank=True)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ["position", "label"]},
        ),
        migrations.CreateModel(
            name="MealPlan",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=100, unique=True)),
                ("name", models.CharField(max_length=140)),
                ("cover_image", models.ImageField(blank=True, upload_to="nutrition/plans/")),
                ("description", models.TextField()),
                ("schedule", models.TextField()),
                ("duration", models.CharField(max_length=80)),
                ("professional", models.CharField(max_length=120)),
                ("credentials", models.CharField(blank=True, max_length=160)),
                ("nutrition_notes", models.TextField(blank=True)),
                ("is_published", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("goal", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="meal_plans", to="primefit.nutritiongoal")),
            ],
            options={"ordering": ["name", "id"]},
        ),
        migrations.CreateModel(
            name="Meal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=140)),
                ("time", models.CharField(max_length=120)),
                ("ingredients", models.TextField()),
                ("quantity", models.TextField()),
                ("preparation", models.TextField()),
                ("alternative", models.TextField(blank=True)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("meal_plan", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="meals", to="primefit.mealplan")),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.CreateModel(
            name="NutritionSupplement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=140)),
                ("category", models.CharField(max_length=100)),
                ("image", models.ImageField(blank=True, upload_to="nutrition/supplements/")),
                ("summary", models.TextField()),
                ("usage_guidance", models.TextField()),
                ("note", models.TextField()),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("is_published", models.BooleanField(default=False)),
                ("goal", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="supplements", to="primefit.nutritiongoal")),
            ],
            options={"ordering": ["position", "name", "id"]},
        ),
        migrations.RunPython(create_nutrition_goals, migrations.RunPython.noop),
    ]
