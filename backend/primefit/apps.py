from django.apps import AppConfig

class PrimefitConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "primefit"

    def ready(self):
        from . import signals
