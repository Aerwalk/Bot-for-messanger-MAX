"""CLI: стереть db.json (данные пересоздадутся при следующем старте)."""

from pathlib import Path

from .config import config


def _cli_run() -> None:
    path = Path(config.data_dir) / "db.json"
    if path.exists():
        path.unlink()
        print(f"[reset] Удалён {path}")
    else:
        print("[reset] db.json отсутствует — удалять нечего")


if __name__ == "__main__":
    _cli_run()