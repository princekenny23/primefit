from .models import Achievement, ActivityRecord, ChallengeParticipant, ChallengeCompletion, UserAchievement

BADGES = [
    ("First steps", "Completed your first workout", "activity"),
    ("Challenge accepted", "Joined your first fitness challenge", "trophy"),
    ("Three challenge days", "Completed three scheduled challenge workouts", "sparkles"),
]

def award_eligible_achievements(user):
    checks = [
        ActivityRecord.objects.filter(user=user, activity_type="workout").exists(),
        ChallengeParticipant.objects.filter(user=user).exists(),
        ChallengeCompletion.objects.filter(participant__user=user).count() >= 3,
    ]
    earned = []
    for (name, description, icon), eligible in zip(BADGES, checks):
        if not eligible:
            continue
        achievement, _ = Achievement.objects.get_or_create(name=name, defaults={"description": description, "icon": icon})
        user_achievement, _ = UserAchievement.objects.get_or_create(user=user, achievement=achievement)
        earned.append(user_achievement)
    return earned
