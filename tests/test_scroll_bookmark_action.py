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


def test_comment_timestamp_click_uses_shared_scroll_bookmark_save_flow() -> None:
    script = read_text("content/youtube-controls.js")

    assert "saveCurrentScrollBookmark()" in script
    assert script.count("this.saveCurrentScrollBookmark();") >= 2
    assert "handleCommentTimestampClick(event)" in script
    assert (
        "document.addEventListener('click', this.commentTimestampClickHandler, true);"
        in script
    )
    assert "findCommentTimestampAnchor(event.target)" in script


def test_scroll_bookmark_state_is_persisted_across_same_tab_navigation() -> None:
    script = read_text("content/youtube-controls.js")

    assert "this.scrollBookmarkStorageKey" in script
    assert "loadStoredScrollBookmark()" in script
    assert "persistScrollBookmark()" in script
    assert "clearStoredScrollBookmark()" in script
    assert "this.scrollBookmarkWindowNamePrefix" in script
    assert "sessionStorage.getItem(this.scrollBookmarkStorageKey)" in script
    assert "sessionStorage.setItem(" in script
    assert "this.scrollBookmarkStorageKey" in script
    assert "sessionStorage.removeItem(this.scrollBookmarkStorageKey)" in script
    assert "window.name" in script


def test_scroll_bookmark_action_is_available_in_options() -> None:
    options = read_text("options/options.js")

    assert (
        "{ value: 'scrollBookmark', label: 'スクロール位置をブックマーク/復帰' }"
        in options
    )
