from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_content_script() -> str:
    return (ROOT / "content/youtube-controls.js").read_text(encoding="utf-8")


def test_recreated_toolbar_reapplies_current_collapse_state() -> None:
    script = read_content_script()
    create_method = script.split("    createTopControlBar() {", 1)[1].split(
        "    waitForVideoReadyAndApplyLayout()", 1
    )[0]

    assert "this.applyCollapseState();" in create_method
    assert "applyCollapseState()" in script


def test_reinitialized_toolbar_inherits_current_collapse_state() -> None:
    script = read_content_script()
    init_function = script.split("function initExtension() {", 1)[1].split(
        "// ページ読み込み時とURL変更時に初期化", 1
    )[0]

    assert "youtubeTopControls?.isCollapsed ?? false" in init_function
    assert "new YouTubeTopControls(wasCollapsed)" in init_function
