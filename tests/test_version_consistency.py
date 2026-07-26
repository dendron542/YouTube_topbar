import json
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = PROJECT_ROOT / "manifest.json"
CHANGELOG_PATH = PROJECT_ROOT / "CHANGELOG.md"
CHROME_VERSION_PATTERN = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def test_manifest_and_changelog_versions_match() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest_version = manifest["version"]
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    latest_version = re.search(r"^## \[(\d+\.\d+\.\d+)\]", changelog, re.MULTILINE)

    assert CHROME_VERSION_PATTERN.fullmatch(manifest_version)
    assert latest_version is not None
    assert latest_version.group(1) == manifest_version


def test_changelog_records_retroactive_version_history() -> None:
    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    expected_releases = {
        "1.0.0": "e8a3dd7",
        "1.0.1": "496b7b8",
        "1.1.0": "1e34e26",
        "1.2.0": "31e1196",
        "1.2.1": "373fc31",
        "1.2.2": "b6f3ae4",
        "1.2.3": "f6a9a68",
    }

    for version, commit in expected_releases.items():
        assert f"## [{version}]" in changelog
        assert f"`{commit}`" in changelog
