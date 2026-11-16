import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
from pathlib import PurePosixPath
from urllib.request import Request, urlopen

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError

from primefit.models import Exercise


DEFAULT_DATA_URL = "https://exercise-dataset.com/exercises.json"
DEFAULT_IMAGE_BASE_URL = "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/"


class Command(BaseCommand):
    help = "Import or update the RepDB exercise dataset."

    def add_arguments(self, parser):
        parser.add_argument("--data-url", default=DEFAULT_DATA_URL)
        parser.add_argument("--image-base-url", default=DEFAULT_IMAGE_BASE_URL)
        parser.add_argument("--dataset-dir", type=Path)
        parser.add_argument("--limit", type=int)
        parser.add_argument("--skip-images", action="store_true")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        dataset_dir = options["dataset_dir"]
        records = self._load_json(dataset_dir / "exercises.json" if dataset_dir else options["data_url"])
        if options["limit"] is not None:
            records = records[:options["limit"]]
        if options["dry_run"]:
            self.stdout.write(self.style.SUCCESS(f"Validated {len(records)} RepDB exercises."))
            return

        created_count = updated_count = image_count = image_error_count = 0
        for item in records:
            exercise, created = Exercise.objects.update_or_create(
                source="repdb",
                external_id=str(item["id"]),
                defaults=self._defaults(item),
            )
            created_count += int(created)
            updated_count += int(not created)

            if not options["skip_images"] and not exercise.illustration:
                image_path = self._image_path(item)
                if image_path:
                    try:
                        exercise.illustration.save(
                            f"repdb/{item['id']}.webp",
                            ContentFile(self._read_image(dataset_dir / image_path if dataset_dir else self._image_url(image_path))),
                            save=True,
                        )
                        image_count += 1
                    except CommandError as error:
                        image_error_count += 1
                        self.stderr.write(self.style.WARNING(str(error)))

        self.stdout.write(self.style.SUCCESS(
            f"Imported {created_count} new exercises, updated {updated_count}, downloaded {image_count} images, "
            f"skipped {image_error_count} images."
        ))

    def _load_json(self, source):
        try:
            if isinstance(source, Path):
                with source.open(encoding="utf-8") as file:
                    payload = json.load(file)
            else:
                request = Request(source, headers={"User-Agent": "PrimeFit exercise importer"})
                with urlopen(request, timeout=30) as response:
                    payload = json.load(response)
        except Exception as error:
            raise CommandError(f"Could not download RepDB data: {error}") from error
        records = payload.get("exercises") if isinstance(payload, dict) else payload
        if not isinstance(records, list):
            raise CommandError("RepDB data does not contain an exercises list.")
        return records

    def _defaults(self, item):
        instructions = item.get("instructions_en") or []
        try:
            met = Decimal(str(item["met"])) if item.get("met") is not None else None
        except (InvalidOperation, TypeError):
            met = None
        return {
            "name": item.get("name_en") or item["id"],
            "instructions": "\n".join(instructions) if isinstance(instructions, list) else str(instructions),
            "equipment": item.get("equipment") or "",
            "body_part": item.get("body_part") or "",
            "difficulty": item.get("difficulty") or "",
            "primary_muscles": item.get("primary_muscles") or [],
            "goals": item.get("goals") or [],
            "tags": item.get("tags") or [],
            "met": met,
            "approved": True,
        }

    def _image_path(self, item):
        flat = (item.get("images") or {}).get("flat") or {}
        image_path = flat.get("peak") or flat.get("main") or flat.get("start")
        if not image_path:
            return None
        safe_path = PurePosixPath(str(image_path))
        if safe_path.is_absolute() or ".." in safe_path.parts:
            raise CommandError(f"Unsafe image path in RepDB record {item['id']}: {image_path}")
        return Path(*safe_path.parts)

    def _read_image(self, source):
        try:
            if isinstance(source, Path):
                return source.read_bytes()
            request = Request(self._image_url(source), headers={"User-Agent": "PrimeFit exercise importer"})
            with urlopen(request, timeout=30) as response:
                return response.read()
        except Exception as error:
            raise CommandError(f"Could not read RepDB image {source}: {error}") from error

    def _image_url(self, image_path):
        return DEFAULT_IMAGE_BASE_URL.rstrip("/") + "/" + str(image_path).replace("\\", "/")