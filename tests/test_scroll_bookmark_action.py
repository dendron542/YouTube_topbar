from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_scroll_bookmark_action_is_available_in_content_script() -> None:
    script = read_text("content/youtube-controls.js")

    assert "action === 'scrollBookmark'" in script
    assert "case 'scrollBookmark':" in script
    assert "toggleScrollBookmark()" in script
    assert "updateScrollBookmarkButton()" in script
    assert "scrollBookmarkY" in script


def test_scroll_bookmark_action_is_available_in_options() -> None:
    options = read_text("options/options.js")

    assert (
        "{ value: 'scrollBookmark', label: 'スクロール位置をブックマーク/復帰' }"
        in options
    )
