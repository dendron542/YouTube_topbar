// YouTube Top Controls Extension
// YouTubeの動画視聴中にスクロールしても上部にコントロールを常に表示

class YouTubeTopControls {
    constructor(isCollapsed = false) {
        this.video = null;
        this.playerRoot = null;
        this.originalControls = null;
        this.topControlBar = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.observer = null;
        this.isCollapsed = isCollapsed;
        this.retryCount = 0;
        this.maxRetries = 10;
        this.retryInterval = 1000;

        this.loopStorageKey = 'youtubeTopControls_loopEnabled';
        this.isLoopEnabled = this.loadLoopEnabled();

        this.buttonConfigStorageKey = 'youtubeTopControls_buttonConfig_v1';
        this.buttonConfig = this.getDefaultButtonConfig();
        this.isButtonConfigLoaded = false;

        this.isLive = false;
        this.isLiveDvr = false;
        this.scrollBookmarkStorageKey = 'youtubeTopControls_scrollBookmark_v1';
        this.scrollBookmarkWindowNamePrefix = '__youtubeTopControlsScrollBookmark__:';
        this.scrollBookmarkY = this.loadStoredScrollBookmark();
        this.isScrollBookmarkActive = this.scrollBookmarkY !== null;
        this.commentTimestampClickHandler = null;
        
        this.init();
    }
    
    init() {
        // ページが完全に読み込まれてから初期化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeWhenReady());
        } else {
            this.initializeWhenReady();
        }
        
        // YouTube特有のイベントもリッスン（フォールバック）
        window.addEventListener('yt-navigate-finish', () => {
            console.log('YouTube Top Controls: YouTube navigation finished, attempting initialization...');
            setTimeout(() => this.initializeWhenReady(), 500);
        });

        // Options page changes (chrome.storage.sync) should reflect without reload when possible
        try {
            chrome?.storage?.onChanged?.addListener?.((changes, areaName) => {
                if (areaName !== 'sync') return;
                if (!changes || !changes[this.buttonConfigStorageKey]) return;

                const nextValue = changes[this.buttonConfigStorageKey].newValue;
                this.buttonConfig = this.sanitizeButtonConfig(nextValue);
                this.buttonConfigLoadPromise = Promise.resolve(this.buttonConfig);
                this.isButtonConfigLoaded = true;

                if (this.isInitialized) {
                    this.createTopControlBar();
                    this.setupEventListeners();
                    this.updatePlayButton();
                    this.updateLoopButton();
                    this.updateVolumeDisplay();
                }
            });
        } catch {
            // ignore
        }
    }
    
    initializeWhenReady() {
        // 既に初期化済み、または初期化中の場合はスキップ
        if (this.isInitialized || this.isInitializing) {
            return;
        }
        
        try {
            this.isInitializing = true;
            
            // YouTube動画ページかチェック
            if (!this.isYouTubeVideoPage()) {
                console.log('YouTube Top Controls: Not a video page, skipping initialization');
                this.isInitializing = false;
                return;
            }
            
            // YouTube の読み込み状態を確認してから初期化
            const initWithDelay = () => {
                // YouTube プレイヤーの存在を確認
                const playerContainer = document.querySelector('#movie_player, .html5-video-player, ytd-player');
                if (!playerContainer && this.retryCount < 3) {
                    console.log('YouTube Top Controls: Player container not found, will retry shortly...');
                    this.isInitializing = false; // リトライ時に initializeWhenReady が早期returnしないようリセット
                    this.handleRetry();
                    return;
                }
                
                if (this.findVideoElements()) {
                    this.loadButtonConfig()
                        .catch(() => undefined)
                        .finally(() => {
                            this.createTopControlBar();
                            this.setupEventListeners();
                            this.startObserver();
                            // レイアウト調整を即座に開始（ただしpaddingはまだ適用されない）
                            this.waitForVideoReadyAndApplyLayout();
                            this.retryCount = 0; // 成功時はリトライカウントをリセット
                            this.isInitializing = false; // 初期化完了
                            console.log('YouTube Top Controls: Successfully initialized');
                        });
                } else {
                    this.isInitializing = false; // 初期化失敗、リトライ許可
                    this.handleRetry();
                }
            };
            
            // 適応的な遅延（初回は短く、リトライ時は長く）
            const initialDelay = this.retryCount === 0 ? 800 : Math.min(2000, 1000 + (this.retryCount * 500));
            setTimeout(initWithDelay, initialDelay);
        } catch (error) {
            console.error('YouTube Top Controls: Error during initialization:', error);
            this.isInitializing = false; // エラー時も初期化フラグをリセット
            this.handleRetry();
        }
    }
    
    handleRetry() {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            // より適応的なリトライ間隔（初期は短く、後は長く）
            let nextRetryDelay;
            if (this.retryCount <= 3) {
                nextRetryDelay = 500; // 最初の3回は500ms
            } else if (this.retryCount <= 6) {
                nextRetryDelay = 1500; // 次の3回は1.5秒
            } else {
                nextRetryDelay = 3000; // 残りは3秒
            }
            
            console.log(`YouTube Top Controls: Retry ${this.retryCount}/${this.maxRetries} in ${nextRetryDelay}ms (YouTube dynamic loading detected)`);
            
            setTimeout(() => {
                this.initializeWhenReady();
            }, nextRetryDelay);
        } else {
            console.warn(`YouTube Top Controls: Failed to initialize after ${this.maxRetries} attempts.`);
            console.warn('YouTube Top Controls: This may be due to:');
            console.warn('1. YouTube DOM structure changes');
            console.warn('2. Slow network connection');
            console.warn('3. Ad blockers interfering with video loading');
            console.warn('4. YouTube experiments/A-B testing');
            // 最後のデバッグ情報を出力
            this.logDebugInfo();
            this.isInitializing = false; // 最終的な失敗時もフラグをリセット
        }
    }
    
    logDebugInfo() {
        console.log('YouTube Top Controls: Debug Information:');
        console.log('- Current URL:', window.location.href);
        console.log('- Page readyState:', document.readyState);
        console.log('- Available video elements:', document.querySelectorAll('video').length);
        console.log('- YouTube player element:', document.querySelector('#movie_player') ? 'Found' : 'Not found');
        console.log('- HTML5 player element:', document.querySelector('.html5-video-player') ? 'Found' : 'Not found');
        
        // YouTubeのプレイヤー状態を確認
        const player = document.querySelector('#movie_player');
        if (player) {
            console.log('- Player classes:', player.className);
        }
        
        // すべてのビデオ要素の詳細情報
        const videos = document.querySelectorAll('video');
        videos.forEach((video, index) => {
            console.log(`- Video ${index}:`, {
                src: video.src || 'No src',
                readyState: video.readyState,
                duration: video.duration || 'No duration',
                visible: video.offsetParent !== null,
                width: video.videoWidth || 'Unknown',
                height: video.videoHeight || 'Unknown'
            });
        });
    }

    isYouTubeVideoPage() {
        return window.location.href.includes('/watch') && 
               window.location.hostname.includes('youtube.com');
    }
    
    findVideoElements() {
        try {
            // より包括的なセレクタで動画要素を取得
            const videoSelectors = [
                'video',
                '#movie_player video',
                '.html5-video-player video',
                'ytd-player video',
                '#player video',
                '.player-container video',
                '#ytd-player video',
                'div[id="movie_player"] video',
                'ytd-watch-flexy video'
            ];
            
            this.video = null;
            for (const selector of videoSelectors) {
                const videos = document.querySelectorAll(selector);
                // 複数のビデオ要素がある場合は最初の表示可能なものを選択
                for (const video of videos) {
                    if (video && video.offsetParent !== null && (video.src || video.currentSrc || video.readyState > 0)) {
                        this.video = video;
                        console.log(`YouTube Top Controls: Video found with selector: ${selector}`, video);
                        break;
                    }
                }
                if (this.video) break;
            }
            
            if (!this.video) {
                // すべてのビデオ要素をログ出力してデバッグ
                const allVideos = document.querySelectorAll('video');
                console.log('YouTube Top Controls: Video element not found. Available video elements:', allVideos.length);
                allVideos.forEach((video, index) => {
                    console.log(`Video ${index}:`, {
                        element: video,
                        src: video.src,
                        readyState: video.readyState,
                        visible: video.offsetParent !== null,
                        duration: video.duration
                    });
                });
                return false;
            }
            
            // readyState チェックを緩和し、より柔軟に対応
            if (this.video.readyState === 0 && !this.video.src) {
                console.log('YouTube Top Controls: Video not ready yet (readyState:', this.video.readyState, ', no src), will retry...');
                return false;
            }
            
            console.log('YouTube Top Controls: Video element details:', {
                readyState: this.video.readyState,
                src: this.video.src,
                duration: this.video.duration,
                paused: this.video.paused
            });
            
            // コントロール要素を取得（これらは後から見つかっても良い）
            const playerRoot =
                this.video?.closest?.('.html5-video-player') ||
                document.querySelector('#movie_player') ||
                document.querySelector('.html5-video-player');
            this.playerRoot = playerRoot || null;

            const q = (selector) => playerRoot?.querySelector?.(selector) || document.querySelector(selector);

            this.originalControls = {
                playButton: q('.ytp-play-button'),
                volumeButton: q('.ytp-mute-button'),
                volumeSlider: q('.ytp-volume-slider'),
                progressBar: q('.ytp-progress-bar'),
                timeDisplay: q('.ytp-time-display'),
                settingsButton: q('.ytp-settings-button'),
                fullscreenButton: q('.ytp-fullscreen-button'),
                nextButton: q('.ytp-next-button'),
                prevButton: q('.ytp-prev-button'),
            };

            // ループ設定を現在の動画要素へ反映
            this.applyLoopSettingToVideo();
            this.updateLiveState();
            
            console.log('YouTube Top Controls: Video element found and ready');
            return true;
        } catch (error) {
            console.error('YouTube Top Controls: Error finding video elements:', error);
            return false;
        }
    }
    
    createTopControlBar() {
        if (this.topControlBar) {
            this.topControlBar.remove();
        }
        
        // トップコントロールバーのHTML構造を作成
        this.topControlBar = document.createElement('div');
        this.topControlBar.id = 'youtube-top-controls';
        this.topControlBar.className = 'youtube-top-controls-bar';
        
        this.topControlBar.innerHTML = `
            <div class="top-controls-container">
                <button class="top-collapse-btn left-collapse" id="left-collapse-btn" title="折り畳み">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M7 14l5-5 5 5z" fill="currentColor"/>
                    </svg>
                </button>
                
                <div class="top-controls-left">
                    ${this.renderSlotButtonHTML("leftPrimary", "top-left-primary-btn")}
                    ${this.renderSlotButtonHTML("leftSecondary", "top-left-secondary-btn")}
                    ${this.renderSlotButtonHTML("leftTertiary", "top-left-tertiary-btn")}
                    ${
                        this.renderSlotButtonHTML("volumeToggle", "top-volume-btn") ||
                        this.shouldShowVolumeSlider()
                            ? `
                    <div class="top-volume-control">
                        ${this.renderSlotButtonHTML("volumeToggle", "top-volume-btn")}
                        ${
                            this.shouldShowVolumeSlider()
                                ? `<input type="range" id="top-volume-slider" min="0" max="100" value="100" class="top-volume-slider">`
                                : ''
                        }
                    </div>
                    `
                            : ''
                    }
                    
                    ${
                        this.shouldShowTimeDisplay()
                            ? `
                    <div class="top-time-display">
                        <span id="top-current-time">0:00</span>
                        <span class="time-separator">/</span>
                        <span id="top-duration">0:00</span>
                    </div>
                    `
                            : ''
                    }
                </div>
                
                <div class="top-controls-center">
                    <div class="top-progress-container" id="top-progress-container">
                        <div class="top-progress-track" id="top-progress-bar" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                            <div class="top-progress-fill" id="top-progress-fill"></div>
                            <div class="top-progress-thumb" id="top-progress-thumb"></div>
                        </div>
                    </div>
                </div>
                
                <div class="top-controls-right">
                    ${this.renderActionButtonHTML("top-scroll-bookmark-btn", "scrollBookmark")}
                    ${this.renderSlotButtonHTML("rightExtra", "top-right-extra-btn")}
                    ${this.renderSlotButtonHTML("rightSettings", "top-settings-btn")}
                    ${this.renderSlotButtonHTML("rightFullscreen", "top-fullscreen-btn")}
                </div>
                
                <button class="top-collapse-btn right-collapse" id="right-collapse-btn" title="折り畳み">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M7 14l5-5 5 5z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
            
            <!-- 折り畳み状態用の小さなバー -->
            <div class="top-controls-collapsed" style="display: none;">
                <button class="top-expand-btn" id="expand-btn" title="展開">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M7 10l5 5 5-5z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `;
        
        // ページの先頭に挿入
        document.body.insertBefore(this.topControlBar, document.body.firstChild);
        this.applyCollapseState();
        
        this.isInitialized = true;
        console.log('Top control bar created');
    }
    
    waitForVideoReadyAndApplyLayout() {
        console.log('YouTube Top Controls: Applying layout changes immediately');
        
        // 即座にレイアウト調整を適用（padding-topは常に0に設定される）
        this.applyLayoutChanges();
    }
    
    applyLayoutChanges() {
        try {
            // YouTubeヘッダーとプレイヤーの位置調整を適用
            document.documentElement.style.setProperty('--youtube-top-controls-active', 'true');
            
            // body に専用クラスを追加してCSSを有効化
            document.body.classList.add('youtube-top-controls-active');
            
            // スクロール位置を監視してレイアウト調整を制御
            this.setupScrollListener();
            
            console.log('YouTube Top Controls: Layout changes applied');
        } catch (error) {
            console.error('YouTube Top Controls: Error applying layout changes:', error);
        }
    }
    
    setupScrollListener() {
        // スクロール位置に基づいてレイアウト調整を制御
        const handleScroll = () => {
            const isAtTop = window.scrollY <= 5; // 5px以内を最上位とする
            
            if (isAtTop) {
                // 最上位の場合、controls-at-scrollクラスを削除
                document.body.classList.remove('controls-at-scroll');
            } else {
                // スクロール中の場合、controls-at-scrollクラスを追加（paddingを無効化）
                document.body.classList.add('controls-at-scroll');
            }
        };
        
        // スクロールイベントリスナーを追加（スロットリング付き）
        let scrollThrottle = null;
        window.addEventListener('scroll', () => {
            if (scrollThrottle) return;
            scrollThrottle = setTimeout(() => {
                handleScroll();
                scrollThrottle = null;
            }, 50);
        });
        
        // 初期状態をチェック
        handleScroll();
    }
    
    setupEventListeners() {
        try {
            if (!this.video || !this.topControlBar) {
                console.warn('YouTube Top Controls: Video or control bar not available for event listeners');
                return;
            }
            
            // 全画面状態の監視
            this.setupFullscreenListener();
            this.setupCommentTimestampClickHandler();
            
            const leftPrimaryBtn = this.topControlBar.querySelector('#top-left-primary-btn');
            leftPrimaryBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );
            
            const leftSecondaryBtn = this.topControlBar.querySelector('#top-left-secondary-btn');
            leftSecondaryBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );

            const leftTertiaryBtn = this.topControlBar.querySelector('#top-left-tertiary-btn');
            leftTertiaryBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );
            
            const volumeBtn = this.topControlBar.querySelector('#top-volume-btn');
            volumeBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );

            const rightExtraBtn = this.topControlBar.querySelector('#top-right-extra-btn');
            rightExtraBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );

            const scrollBookmarkBtn = this.topControlBar.querySelector('#top-scroll-bookmark-btn');
            scrollBookmarkBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );
            
            const volumeSlider = this.topControlBar.querySelector('#top-volume-slider');
            volumeSlider?.addEventListener('input', (e) => {
                this.safeExecute(() => {
                    this.setVolume(e.target.value / 100);
                    // スライダー操作時も即座に視覚的フィードバックを更新
                    e.target.style.setProperty('--volume-fill', e.target.value + '%');
                });
            });
            
            // カスタムプログレスバー
            const progressBar = this.topControlBar.querySelector('#top-progress-bar');

            const getSeekPercent = (e) => {
                const rect = progressBar.getBoundingClientRect();
                return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            };

            progressBar?.addEventListener('mousedown', (e) => {
                this.isDraggingProgress = true;
                const pct = getSeekPercent(e);
                this.setProgressVisual(pct * 100);
                this.safeExecute(() => this.seekTo(pct));
            });

            const onMouseMove = (e) => {
                if (!this.isDraggingProgress) return;
                const pct = getSeekPercent(e);
                this.setProgressVisual(pct * 100);
                this.safeExecute(() => this.seekTo(pct));
            };

            const onMouseUp = () => {
                if (!this.isDraggingProgress) return;
                this.isDraggingProgress = false;
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            
            const settingsBtn = this.topControlBar.querySelector('#top-settings-btn');
            settingsBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );
            
            const fullscreenBtn = this.topControlBar.querySelector('#top-fullscreen-btn');
            fullscreenBtn?.addEventListener('click', (e) =>
                this.safeExecute(() => this.handleButtonAction(e.currentTarget?.dataset?.action)),
            );
            
            // 折り畳み/展開ボタン
            const leftCollapseBtn = this.topControlBar.querySelector('#left-collapse-btn');
            const rightCollapseBtn = this.topControlBar.querySelector('#right-collapse-btn');
            // 見た目上はピル全体がボタンなので、内側の#expand-btnではなくピル全体で判定する
            const collapsedPill = this.topControlBar.querySelector('.top-controls-collapsed');

            leftCollapseBtn?.addEventListener('click', () => this.safeExecute(() => this.toggleCollapse()));
            rightCollapseBtn?.addEventListener('click', () => this.safeExecute(() => this.toggleCollapse()));
            collapsedPill?.addEventListener('click', () => this.safeExecute(() => this.toggleCollapse()));
            
            // 動画の状態変化を監視
            this.video.addEventListener('play', () => {
                this.safeExecute(() => this.updatePlayButton());
                this.startProgressLoop();
            });
            this.video.addEventListener('pause', () => {
                this.safeExecute(() => this.updatePlayButton());
                this.stopProgressLoop();
                this.safeExecute(() => this.updateProgress());
            });

            // インスタンス変数として保存
            this.isDraggingProgress = false;

            // 再生中なら即座にループ開始
            if (!this.video.paused) this.startProgressLoop();
            
            this.video.addEventListener('volumechange', () => this.safeExecute(() => this.updateVolumeDisplay()));
            this.video.addEventListener('loadedmetadata', () =>
                this.safeExecute(() => {
                    this.updateLiveState();
                    this.updateDuration();
                    this.updateLiveUiState();
                }),
            );

            // video.loop がYouTubeにリセットされた場合のフォールバック
            this.video.addEventListener('ended', () => {
                this.safeExecute(() => {
                    if (this.isLoopEnabled && !this.isLive && this.video) {
                        this.video.currentTime = 0;
                        this.video.play().catch(() => {});
                    }
                });
            });

            // 定期的な同期（音量・ライブ状態のみ。プログレスはrAFループが担当）
            setInterval(() => {
                this.safeExecute(() => this.updateVolumeDisplay());
                this.safeExecute(() => this.updateLiveState());
                this.safeExecute(() => this.updateLiveUiState());
                // video.loop がYouTubeにリセットされていれば再適用
                this.safeExecute(() => {
                    if (this.isLoopEnabled && !this.isLive && this.video && !this.video.loop) {
                        this.video.loop = true;
                    }
                });
            }, 500); // 500msに短縮
            
            // 初期値を設定
            this.safeExecute(() => this.updateVolumeDisplay());
            this.safeExecute(() => this.updatePlayButton());
            this.safeExecute(() => this.updateLoopButton());
            this.safeExecute(() => this.updateScrollBookmarkButton());
            this.safeExecute(() => this.updateLiveUiState());
            if (this.video.duration) {
                this.safeExecute(() => this.updateDuration());
                this.safeExecute(() => this.updateProgress());
            }
            
            console.log('YouTube Top Controls: Event listeners set up successfully');
        } catch (error) {
            console.error('YouTube Top Controls: Error setting up event listeners:', error);
        }
    }
    
    safeExecute(func) {
        try {
            return func();
        } catch (error) {
            console.error('YouTube Top Controls: Error executing function:', error);
        }
    }

    getDefaultButtonConfig() {
        return {
            leftPrimary: 'playPause',
            leftSecondary: 'rewind10',
            leftTertiary: 'forward10',
            volumeToggle: 'muteToggle',
            showVolumeSlider: true,
            showTimeDisplay: true,
            rightExtra: 'loopToggle',
            rightSettings: 'youtubeSettings',
            rightFullscreen: 'youtubeFullscreen',
        };
    }

    isValidButtonAction(action) {
        return (
            action === 'playPause' ||
            action === 'rewind10' ||
            action === 'forward10' ||
            action === 'replay' ||
            action === 'previousVideo' ||
            action === 'nextVideo' ||
            action === 'loopToggle' ||
            action === 'scrollBookmark' ||
            action === 'muteToggle' ||
            action === 'youtubeSettings' ||
            action === 'youtubeFullscreen' ||
            action === 'none'
        );
    }

    sanitizeButtonConfig(rawConfig) {
        const config = this.getDefaultButtonConfig();
        if (!rawConfig || typeof rawConfig !== 'object') return config;

        for (const key of Object.keys(config)) {
            const value = rawConfig[key];
            if (typeof config[key] === 'boolean') {
                if (typeof value === 'boolean') config[key] = value;
                continue;
            }
            if (typeof value === 'string' && this.isValidButtonAction(value)) config[key] = value;
        }

        return config;
    }

    loadButtonConfig() {
        if (this.buttonConfigLoadPromise) return this.buttonConfigLoadPromise;

        this.buttonConfigLoadPromise = new Promise((resolve) => {
            try {
                if (!chrome?.storage?.sync) {
                    this.isButtonConfigLoaded = true;
                    resolve(this.buttonConfig);
                    return;
                }

                chrome.storage.sync.get({ [this.buttonConfigStorageKey]: null }, (result) => {
                    if (chrome?.runtime?.lastError) {
                        this.isButtonConfigLoaded = true;
                        resolve(this.buttonConfig);
                        return;
                    }

                    const raw = result ? result[this.buttonConfigStorageKey] : null;
                    this.buttonConfig = this.sanitizeButtonConfig(raw);
                    this.isButtonConfigLoaded = true;
                    resolve(this.buttonConfig);
                });
            } catch (error) {
                console.error('YouTube Top Controls: Error loading button config:', error);
                this.isButtonConfigLoaded = true;
                resolve(this.buttonConfig);
            }
        });

        return this.buttonConfigLoadPromise;
    }

    getActionTitle(action) {
        switch (action) {
            case 'playPause':
                return '\u518D\u751F/\u4E00\u6642\u505C\u6B62';
            case 'rewind10':
                return '\uFF11\uFF10\u79D2\u623B\u3057';
            case 'forward10':
                return '\uFF11\uFF10\u79D2\u9001\u308A';
            case 'replay':
                return '\u3082\u3046\u4E00\u56DE\u898B\u308B';
            case 'previousVideo':
                return '\u524D\u306E\u52D5\u753B\u3092\u518D\u751F';
            case 'nextVideo':
                return '\u6B21\u306E\u52D5\u753B\u3092\u518D\u751F';
            case 'loopToggle':
                return `\u30EB\u30FC\u30D7\u518D\u751F: ${this.isLoopEnabled ? 'ON' : 'OFF'}`;
            case 'scrollBookmark':
                return this.isScrollBookmarkActive
                    ? '\u5143\u306E\u30B9\u30AF\u30ED\u30FC\u30EB\u4F4D\u7F6E\u3078\u623B\u308B'
                    : '\u30B9\u30AF\u30ED\u30FC\u30EB\u4F4D\u7F6E\u3092\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u3057\u3066\u52D5\u753B\u3078\u623B\u308B';
            case 'muteToggle':
                return '\u30DF\u30E5\u30FC\u30C8/\u89E3\u9664';
            case 'youtubeSettings':
                return '\u8A2D\u5B9A';
            case 'youtubeFullscreen':
                return '\u30D5\u30EB\u30B9\u30AF\u30EA\u30FC\u30F3';
            default:
                return '';
        }
    }

    renderActionButtonHTML(buttonId, action) {
        if (action === 'none') return '';

        const title = this.getActionTitle(action);
        const commonAttrs = `class="top-control-btn" id="${buttonId}" data-action="${action}" title="${title}"`;

        if (action === 'playPause') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'rewind10') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"/>
                    </svg>
                    <span class="rewind-text">10</span>
                </button>
            `;
        }

        if (action === 'forward10') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" fill="currentColor"/>
                    </svg>
                    <span class="forward-text">10</span>
                </button>
            `;
        }

        if (action === 'replay') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M12 5V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'previousVideo') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M18 6l-8.5 6L18 18V6zm-11 0h-2v12h2V6z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'nextVideo') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M6 18l8.5-6L6 6v12zm9-12v12h2V6h-2z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'loopToggle') {
            const pressed = this.isLoopEnabled ? 'true' : 'false';
            return `
                <button ${commonAttrs} aria-pressed="${pressed}">
                    <svg viewBox="0 0 24 24">
                        <path d="M7 7h11v3l4-4-4-4v3H6c-1.1 0-2 .9-2 2v4h2V7zm13 10v-4h-2v4H7v-3l-4 4 4 4v-3h12c1.1 0 2-.9 2-2z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'scrollBookmark') {
            const pressed = this.isScrollBookmarkActive ? 'true' : 'false';
            return `
                <button ${commonAttrs} aria-pressed="${pressed}">
                    <svg viewBox="0 0 24 24">
                        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" fill="currentColor"/>
                        <path d="M12 7l-4 4h3v3h2v-3h3l-4-4z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'muteToggle') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'youtubeSettings') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47 -0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        if (action === 'youtubeFullscreen') {
            return `
                <button ${commonAttrs}>
                    <svg viewBox="0 0 24 24">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/>
                    </svg>
                </button>
            `;
        }

        return '';
    }

    renderSlotButtonHTML(slotKey, buttonId) {
        const action = this.buttonConfig?.[slotKey] ?? this.getDefaultButtonConfig()[slotKey];
        return this.renderActionButtonHTML(buttonId, action);
    }

    shouldShowVolumeSlider() {
        const action =
            this.buttonConfig?.volumeToggle ?? this.getDefaultButtonConfig().volumeToggle;
        const show = this.buttonConfig?.showVolumeSlider ?? true;
        return show && action === 'muteToggle';
    }

    shouldShowTimeDisplay() {
        return this.buttonConfig?.showTimeDisplay ?? true;
    }

    loadLoopEnabled() {
        try {
            return localStorage.getItem(this.loopStorageKey) === '1';
        } catch {
            return false;
        }
    }

    getCurrentVideoId() {
        try {
            return new URL(window.location.href).searchParams.get('v');
        } catch {
            return null;
        }
    }

    loadStoredScrollBookmark() {
        try {
            const raw =
                sessionStorage.getItem(this.scrollBookmarkStorageKey) ||
                this.loadStoredScrollBookmarkFromWindowName();
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            const scrollY = Number(parsed?.scrollY);
            const videoId = parsed?.videoId;
            const currentVideoId = this.getCurrentVideoId();

            if (!Number.isFinite(scrollY) || scrollY < 0) return null;
            if (videoId && currentVideoId && videoId !== currentVideoId) return null;

            return Math.round(scrollY);
        } catch {
            return null;
        }
    }

    loadStoredScrollBookmarkFromWindowName() {
        try {
            if (!window.name?.startsWith?.(this.scrollBookmarkWindowNamePrefix)) {
                return null;
            }

            return window.name.slice(this.scrollBookmarkWindowNamePrefix.length);
        } catch {
            return null;
        }
    }

    persistScrollBookmark() {
        try {
            if (this.scrollBookmarkY === null || !this.isScrollBookmarkActive) {
                sessionStorage.removeItem(this.scrollBookmarkStorageKey);
                if (window.name?.startsWith?.(this.scrollBookmarkWindowNamePrefix)) {
                    window.name = '';
                }
                return;
            }

            const payload = JSON.stringify({
                videoId: this.getCurrentVideoId(),
                scrollY: this.scrollBookmarkY,
            });
            sessionStorage.setItem(this.scrollBookmarkStorageKey, payload);
            window.name = `${this.scrollBookmarkWindowNamePrefix}${payload}`;
        } catch {
            // sessionStorage が使えない環境は無視
        }
    }

    clearStoredScrollBookmark() {
        try {
            sessionStorage.removeItem(this.scrollBookmarkStorageKey);
            if (window.name?.startsWith?.(this.scrollBookmarkWindowNamePrefix)) {
                window.name = '';
            }
        } catch {
            // sessionStorage が使えない環境は無視
        }
    }

    persistLoopEnabled() {
        try {
            localStorage.setItem(this.loopStorageKey, this.isLoopEnabled ? '1' : '0');
        } catch {
            // localStorage が使えない環境は無視
        }
    }

    applyLoopSettingToVideo() {
        try {
            if (!this.video) return;
            // Live は loop を無効化
            this.video.loop = this.isLive ? false : !!this.isLoopEnabled;
        } catch (error) {
            console.error('YouTube Top Controls: Error applying loop setting:', error);
        }
    }
    updateLoopButton() {
        try {
            if (!this.topControlBar) return;
            const loopButtons = this.topControlBar.querySelectorAll('button[data-action="loopToggle"]');
            if (!loopButtons.length) return;

            loopButtons.forEach((loopBtn) => {
                loopBtn.classList.toggle('is-active', this.isLoopEnabled);
                loopBtn.setAttribute('aria-pressed', this.isLoopEnabled ? 'true' : 'false');
                loopBtn.title = this.getActionTitle('loopToggle');
            });
        } catch (error) {
            console.error('YouTube Top Controls: Error updating loop button:', error);
        }
    }

    toggleLoop() {
        try {
            if (this.isLive) return;
            this.isLoopEnabled = !this.isLoopEnabled;
            this.applyLoopSettingToVideo();
            this.persistLoopEnabled();
            this.updateLoopButton();
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling loop:', error);
        }
    }

    getCurrentScrollY() {
        return Math.max(
            0,
            window.scrollY ||
                window.pageYOffset ||
                document.documentElement?.scrollTop ||
                document.body?.scrollTop ||
                0,
        );
    }

    saveCurrentScrollBookmark() {
        this.scrollBookmarkY = this.getCurrentScrollY();
        this.isScrollBookmarkActive = true;
        this.persistScrollBookmark();
        this.updateScrollBookmarkButton();
    }

    toggleScrollBookmark() {
        try {
            if (this.isScrollBookmarkActive && this.scrollBookmarkY !== null) {
                window.scrollTo({ top: this.scrollBookmarkY, behavior: 'auto' });
                this.scrollBookmarkY = null;
                this.isScrollBookmarkActive = false;
                this.clearStoredScrollBookmark();
                this.updateScrollBookmarkButton();
                return;
            }

            this.saveCurrentScrollBookmark();
            window.scrollTo({ top: this.getVideoTopScrollY(), behavior: 'auto' });
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling scroll bookmark:', error);
        }
    }

    setupCommentTimestampClickHandler() {
        if (this.commentTimestampClickHandler) {
            document.removeEventListener('click', this.commentTimestampClickHandler, true);
        }

        this.commentTimestampClickHandler = (event) =>
            this.safeExecute(() => this.handleCommentTimestampClick(event));
        document.addEventListener('click', this.commentTimestampClickHandler, true);
    }

    handleCommentTimestampClick(event) {
        const anchor = this.findCommentTimestampAnchor(event.target);
        if (!anchor) return;
        this.saveCurrentScrollBookmark();
    }

    findCommentTimestampAnchor(target) {
        const anchor = target?.closest?.('a[href]');
        if (!anchor) return null;
        if (!anchor.closest?.('#comments, ytd-comments, ytd-comment-thread-renderer, ytd-comment-renderer')) {
            return null;
        }

        try {
            const url = new URL(anchor.href, window.location.origin);
            const currentUrl = new URL(window.location.href);
            const currentVideoId = currentUrl.searchParams.get('v');
            const targetVideoId = url.searchParams.get('v');

            if (url.pathname !== '/watch') return null;
            if (!url.searchParams.has('t')) return null;
            if (currentVideoId && targetVideoId && targetVideoId !== currentVideoId) return null;

            return anchor;
        } catch {
            return null;
        }
    }

    getVideoTopScrollY() {
        const target =
            document.querySelector('ytd-player') ||
            document.querySelector('#player') ||
            this.video?.closest?.('ytd-player') ||
            this.video?.closest?.('#player') ||
            this.video;

        if (!target?.getBoundingClientRect) return 0;

        const rect = target.getBoundingClientRect();
        const barHeight = this.topControlBar?.getBoundingClientRect?.().height || 0;
        return Math.max(0, Math.round(rect.top + window.scrollY - barHeight - 8));
    }

    updateScrollBookmarkButton() {
        try {
            if (!this.topControlBar) return;

            const buttons = this.topControlBar.querySelectorAll(
                'button[data-action="scrollBookmark"]',
            );
            buttons.forEach((btn) => {
                btn.classList.toggle('is-active', this.isScrollBookmarkActive);
                btn.setAttribute('aria-pressed', this.isScrollBookmarkActive ? 'true' : 'false');
                btn.title = this.getActionTitle('scrollBookmark');
            });
        } catch (error) {
            console.error('YouTube Top Controls: Error updating scroll bookmark button:', error);
        }
    }

    handleButtonAction(action) {
        try {
            if (!action || action === 'none') return;

            if (action === 'playPause') {
                this.togglePlay();
                return;
            }
            if (action === 'rewind10') {
                this.seekBy(-10);
                return;
            }
            if (action === 'forward10') {
                this.seekBy(10);
                return;
            }
            if (action === 'replay') {
                this.replayVideo();
                return;
            }
            if (action === 'previousVideo') {
                this.playPreviousVideo();
                return;
            }
            if (action === 'nextVideo') {
                this.playNextVideo();
                return;
            }
            if (action === 'loopToggle') {
                this.toggleLoop();
                return;
            }
            if (action === 'scrollBookmark') {
                this.toggleScrollBookmark();
                return;
            }
            if (action === 'muteToggle') {
                this.toggleMute();
                return;
            }
            if (action === 'youtubeSettings') {
                this.openYouTubeSettings();
                return;
            }
            if (action === 'youtubeFullscreen') {
                this.toggleYouTubeFullscreen();
                return;
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error handling button action:', error);
        }
    }

    getPlayerRoot() {
        return (
            this.playerRoot ||
            this.video?.closest?.('.html5-video-player') ||
            document.querySelector('#movie_player') ||
            document.querySelector('.html5-video-player') ||
            null
        );
    }

    computeLiveState() {
        const playerRoot = this.getPlayerRoot();
        // offsetParent !== null で「実際に表示されているバッジ」のみ判定
        const liveBadgeEl = playerRoot?.querySelector?.('.ytp-live-badge');
        const isLiveBadge = !!(liveBadgeEl && liveBadgeEl.offsetParent !== null);

        const durationIsInfinite = this.video?.duration === Infinity;

        const isLive = !!this.video && (isLiveBadge || durationIsInfinite);

        let isDvr = false;
        try {
            if (isLive && this.video?.seekable && this.video.seekable.length > 0) {
                const start = this.video.seekable.start(0);
                const end = this.video.seekable.end(0);
                isDvr = Number.isFinite(start) && Number.isFinite(end) && end - start > 60;
            }
        } catch {
            isDvr = false;
        }

        return { isLive, isDvr };
    }

    updateLiveState() {
        try {
            const { isLive, isDvr } = this.computeLiveState();
            this.isLive = isLive;
            this.isLiveDvr = isDvr;

            // Live では loop を強制OFF
            if (this.isLive && this.isLoopEnabled) {
                this.isLoopEnabled = false;
                this.persistLoopEnabled();
                this.applyLoopSettingToVideo();
                this.updateLoopButton();
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error updating live state:', error);
        }
    }

    canSeek() {
        if (!this.video) return false;
        if (!this.isLive) return true;
        return this.isLiveDvr;
    }

    updateLiveUiState() {
        try {
            if (!this.topControlBar) return;

            const canSeek = this.canSeek();

            const progressBar = this.topControlBar.querySelector('#top-progress-bar');
            if (progressBar) {
                progressBar.classList.toggle('is-disabled', !canSeek);
                progressBar.style.pointerEvents = canSeek ? '' : 'none';
            }

            // Seek系ボタン（rewind/forward/replay）をLive(非DVR)では無効化
            const seekActions = ['rewind10', 'forward10', 'replay'];
            seekActions.forEach((action) => {
                const buttons = this.topControlBar.querySelectorAll(
                    `button[data-action="${action}"]`,
                );
                buttons.forEach((btn) => {
                    btn.toggleAttribute('disabled', !canSeek);
                    btn.classList.toggle('is-disabled', !canSeek);
                });
            });

            // LoopはLiveでは無効化
            const loopButtons = this.topControlBar.querySelectorAll(
                'button[data-action="loopToggle"]',
            );
            loopButtons.forEach((btn) => {
                btn.toggleAttribute('disabled', this.isLive);
                btn.classList.toggle('is-disabled', this.isLive);
                if (this.isLive) btn.title = 'ループ再生: LIVEでは無効';
            });

            // 時間表示をOFFの場合 or Live(非DVR)の場合は非表示
            const timeDisplay = this.topControlBar.querySelector('.top-time-display');
            if (timeDisplay) {
                const shouldShow = this.shouldShowTimeDisplay() && (!this.isLive || this.isLiveDvr);
                timeDisplay.style.display = shouldShow ? '' : 'none';
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error updating live UI state:', error);
        }
    }

    replayVideo() {
        try {
            if (!this.video) return;
            if (this.isLive && !this.isLiveDvr) return;
            this.video.currentTime = 0;
            this.video.play?.();
        } catch (error) {
            console.error('YouTube Top Controls: Error replaying video:', error);
        }
    }

    playNextVideo() {
        try {
            const nextBtn =
                this.originalControls?.nextButton ||
                document.querySelector('button.ytp-next-button') ||
                document.querySelector('.ytp-next-button');

            if (nextBtn && !nextBtn.disabled && !nextBtn.classList?.contains('ytp-button-disabled')) {
                nextBtn.click();
                return;
            }

            const upNext =
                document.querySelector('ytd-compact-video-renderer a#thumbnail') ||
                document.querySelector('ytd-compact-video-renderer a#video-title');

            upNext?.click?.();
        } catch (error) {
            console.error('YouTube Top Controls: Error playing next video:', error);
        }
    }

    playPreviousVideo() {
        try {
            const prevBtn =
                this.originalControls?.prevButton ||
                document.querySelector('button.ytp-prev-button') ||
                document.querySelector('.ytp-prev-button');
            if (prevBtn && !prevBtn.disabled) {
                prevBtn.click();
                return;
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error playing previous video:', error);
        }
    }

    openYouTubeSettings() {
        try {
            const playerRoot =
                this.video?.closest?.('.html5-video-player') ||
                document.querySelector('#movie_player') ||
                document.querySelector('.html5-video-player');

            const btn =
                this.originalControls?.settingsButton ||
                playerRoot?.querySelector?.('.ytp-settings-button') ||
                document.querySelector('.ytp-settings-button');
            btn?.click?.();
        } catch (error) {
            console.error('YouTube Top Controls: Error opening settings:', error);
        }
    }

    toggleYouTubeFullscreen() {
        try {
            const playerRoot =
                this.video?.closest?.('.html5-video-player') ||
                document.querySelector('#movie_player') ||
                document.querySelector('.html5-video-player');

            const btn =
                this.originalControls?.fullscreenButton ||
                playerRoot?.querySelector?.('.ytp-fullscreen-button') ||
                document.querySelector('.ytp-fullscreen-button');
            btn?.click?.();
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling fullscreen:', error);
        }
    }
    
    togglePlay() {
        try {
            if (!this.video) return;
            if (this.video.paused) {
                this.video.play();
            } else {
                this.video.pause();
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling play:', error);
        }
    }
    
    seekBy(seconds) {
        try {
            if (!this.canSeek()) return;
            if (!this.video || !this.video.duration) return;
            const newTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            this.video.currentTime = newTime;
        } catch (error) {
            console.error('YouTube Top Controls: Error seeking by seconds:', error);
        }
    }
    
    seekTo(percentage) {
        try {
            if (!this.canSeek()) return;
            if (!this.video || !this.video.duration || isNaN(percentage)) return;
            const clampedPercentage = Math.max(0, Math.min(1, percentage));
            this.video.currentTime = this.video.duration * clampedPercentage;
        } catch (error) {
            console.error('YouTube Top Controls: Error seeking to percentage:', error);
        }
    }
    
    toggleMute() {
        try {
            if (!this.video) return;
            this.video.muted = !this.video.muted;
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling mute:', error);
        }
    }
    
    setVolume(volume) {
        try {
            if (!this.video || isNaN(volume)) return;
            const clampedVolume = Math.max(0, Math.min(1, volume));
            this.video.volume = clampedVolume;
            this.video.muted = clampedVolume === 0;
        } catch (error) {
            console.error('YouTube Top Controls: Error setting volume:', error);
        }
    }
    
    updatePlayButton() {
        const playButtons = this.topControlBar?.querySelectorAll(
            'button[data-action="playPause"] svg path',
        );
        if (!playButtons || !playButtons.length) return;

        playButtons.forEach((playBtn) => {
            if (this.video.paused) {
                playBtn.setAttribute('d', 'M8 5v14l11-7z');
            } else {
                playBtn.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
            }
        });
    }
    
    setProgressVisual(percentage) {
        const fill = this.topControlBar?.querySelector('#top-progress-fill');
        const thumb = this.topControlBar?.querySelector('#top-progress-thumb');
        const track = this.topControlBar?.querySelector('#top-progress-bar');
        if (!fill || !thumb || !track) return;

        const ratio = Math.max(0, Math.min(1, percentage / 100));
        const trackWidth = track.getBoundingClientRect().width;  // 小数点精度で取得
        const thumbSize = 16;

        // YouTube 方式: fill は scaleX、thumb は translateX(px)
        fill.style.transform = `scaleX(${ratio})`;
        thumb.style.transform = `translateX(${ratio * trackWidth - thumbSize / 2}px) translateY(-50%)`;

        track.setAttribute('aria-valuenow', Math.round(ratio * 100));
    }

    updateProgress() {
        try {
            if (!this.video || !this.video.duration || !this.topControlBar) return;

            const currentTimeSpan = this.topControlBar.querySelector('#top-current-time');

            if (!this.isDraggingProgress) {
                const percentage = (this.video.currentTime / this.video.duration) * 100;
                this.setProgressVisual(percentage);
            }

            if (currentTimeSpan) {
                currentTimeSpan.textContent = this.formatTime(this.video.currentTime);
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error updating progress:', error);
        }
    }
    
    updateVolumeDisplay() {
        try {
            if (!this.video || !this.topControlBar) return;
            
            const volumeSlider = this.topControlBar.querySelector('#top-volume-slider');
            const volumeButtons = this.topControlBar.querySelectorAll(
                'button[data-action="muteToggle"] svg path',
            );
            
            // 現在の音量値を取得
            const currentVolume = this.video.muted ? 0 : this.video.volume;
            const volumePercentage = Math.round(currentVolume * 100);
            
            console.log('YouTube Top Controls: Updating volume display - Volume:', volumePercentage + '%', 'Muted:', this.video.muted);
            
            if (volumeSlider) {
                volumeSlider.value = volumePercentage;
                // CSS変数を更新して視覚的な音量レベルを表示
                volumeSlider.style.setProperty('--volume-fill', volumePercentage + '%');
            }
            
            if (volumeButtons && volumeButtons.length) {
                let iconPath = '';
                if (this.video.muted || currentVolume === 0) {
                    // ミュートアイコン
                    iconPath = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z';
                } else if (currentVolume < 0.5) {
                    // 低音量アイコン
                    iconPath = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z';
                } else {
                    // 高音量アイコン
                    iconPath = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
                }
                volumeButtons.forEach((btn) => btn.setAttribute('d', iconPath));
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error updating volume display:', error);
        }
    }
    
    updateDuration() {
        try {
            if (!this.video || !this.video.duration || !this.topControlBar) return;
            
            const durationSpan = this.topControlBar.querySelector('#top-duration');
            if (durationSpan) {
                durationSpan.textContent = this.formatTime(this.video.duration);
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error updating duration:', error);
        }
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    toggleCollapse() {
        try {
            if (!this.topControlBar) return;
            
            this.isCollapsed = !this.isCollapsed;
            this.applyCollapseState();
            console.log(
                `YouTube Top Controls: Controls ${this.isCollapsed ? 'collapsed' : 'expanded'}`,
            );
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling collapse:', error);
        }
    }

    applyCollapseState() {
        if (!this.topControlBar) return;

        const mainContainer = this.topControlBar.querySelector('.top-controls-container');
        const collapsedContainer = this.topControlBar.querySelector('.top-controls-collapsed');

        this.topControlBar.classList.toggle('collapsed', this.isCollapsed);
        document.body.classList.toggle('controls-collapsed', this.isCollapsed);
        if (mainContainer) mainContainer.style.display = this.isCollapsed ? 'none' : 'flex';
        if (collapsedContainer) collapsedContainer.style.display = this.isCollapsed ? 'block' : 'none';
    }
    
    setupFullscreenListener() {
        try {
            // フルスクリーン状態の変化を監視
            const handleFullscreenChange = () => {
                this.safeExecute(() => {
                    if (!this.topControlBar) {
                        console.warn('YouTube Top Controls: Control bar not available for fullscreen toggle');
                        return;
                    }
                    
                    // デバッグ用ログを追加
                    console.log('YouTube Top Controls: Checking fullscreen state...');
                    
                    // より確実なフルスクリーン状態の検出
                    const isDocumentFullscreen = !!(document.fullscreenElement || 
                                                   document.webkitFullscreenElement || 
                                                   document.mozFullScreenElement ||
                                                   document.msFullscreenElement);
                    
                    // YouTubeプレイヤーのフルスクリーンクラスも確認
                    const youtubePlayer = document.querySelector('#movie_player, .html5-video-player');
                    const isYouTubeFullscreen = youtubePlayer && youtubePlayer.classList.contains('ytp-fullscreen');
                    
                    // ウィンドウサイズベースの検出も追加
                    const isWindowFullscreen = window.innerHeight === screen.height && window.innerWidth === screen.width;
                    
                    // ビデオ要素のフルスクリーン状態も確認
                    const isVideoFullscreen = this.video && (
                        this.video === document.fullscreenElement ||
                        this.video === document.webkitFullscreenElement ||
                        this.video === document.mozFullScreenElement ||
                        this.video === document.msFullscreenElement
                    );
                    
                    const isFullscreen = isDocumentFullscreen || isYouTubeFullscreen || isVideoFullscreen;
                    
                    // デバッグ情報をログ出力
                    console.log('YouTube Top Controls: Fullscreen state:', {
                        isDocumentFullscreen,
                        isYouTubeFullscreen,
                        isWindowFullscreen,
                        isVideoFullscreen,
                        finalIsFullscreen: isFullscreen,
                        youtubePlayerClasses: youtubePlayer ? youtubePlayer.className : 'not found'
                    });
                    
                    if (isFullscreen) {
                        // 全画面時はバーを非表示
                        this.topControlBar.style.display = 'none';
                        this.topControlBar.classList.add('fullscreen-hidden');
                        console.log('YouTube Top Controls: Fullscreen detected, hiding control bar');
                    } else {
                        // 全画面解除時はバーを表示
                        this.topControlBar.style.display = 'flex';
                        this.topControlBar.classList.remove('fullscreen-hidden');
                        console.log('YouTube Top Controls: Fullscreen exited, showing control bar');
                    }
                });
            };
            
            // ポーリングベースの監視も追加（フォールバック）
            const startPolling = () => {
                setInterval(() => {
                    this.safeExecute(() => {
                        const youtubePlayer = document.querySelector('#movie_player, .html5-video-player');
                        const isYouTubeFullscreen = youtubePlayer && youtubePlayer.classList.contains('ytp-fullscreen');
                        
                        if (isYouTubeFullscreen && this.topControlBar && this.topControlBar.style.display !== 'none') {
                            console.log('YouTube Top Controls: Polling detected fullscreen, hiding bar');
                            this.topControlBar.style.display = 'none';
                            this.topControlBar.classList.add('fullscreen-hidden');
                        } else if (!isYouTubeFullscreen && this.topControlBar && this.topControlBar.style.display === 'none') {
                            console.log('YouTube Top Controls: Polling detected fullscreen exit, showing bar');
                            this.topControlBar.style.display = 'flex';
                            this.topControlBar.classList.remove('fullscreen-hidden');
                        }
                    });
                }, 500); // 500msごとにチェック
            };
            
            // 各ブラウザの全画面イベントを監視
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.addEventListener('mozfullscreenchange', handleFullscreenChange);
            document.addEventListener('msfullscreenchange', handleFullscreenChange);
            
            // YouTubeプレイヤーのクラス変更を監視
            const youtubePlayer = document.querySelector('#movie_player, .html5-video-player');
            if (youtubePlayer) {
                this.fullscreenObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            console.log('YouTube Top Controls: Player class changed, checking fullscreen');
                            handleFullscreenChange();
                        }
                    });
                });
                this.fullscreenObserver.observe(youtubePlayer, { attributes: true, attributeFilter: ['class'] });
                console.log('YouTube Top Controls: YouTube player class observer set up');
            }
            
            // キーボードイベントの監視（Escキーでのフルスクリーン解除検出）
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' || event.keyCode === 27) {
                    setTimeout(handleFullscreenChange, 100); // 少し遅延してチェック
                }
            });
            
            // ポーリング開始
            startPolling();
            
            // 初期状態をチェック
            setTimeout(handleFullscreenChange, 100);
            
            console.log('YouTube Top Controls: Enhanced fullscreen listener set up');
        } catch (error) {
            console.error('YouTube Top Controls: Error setting up fullscreen listener:', error);
        }
    }
    
    startObserver() {
        // ページの変更を監視（SPAの場合）
        this.observer = new MutationObserver((mutations) => {
            // URLが変更された場合の処理
            if (window.location.href.includes('/watch')) {
                if (!this.isInitialized) {
                    setTimeout(() => this.initializeWhenReady(), 1000);
                }
            } else {
                // 動画ページ以外では非表示
                if (this.topControlBar) {
                    this.topControlBar.style.display = 'none';
                }
            }
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    startProgressLoop() {
        this.stopProgressLoop();
        const loop = () => {
            this.safeExecute(() => this.updateProgress());
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    stopProgressLoop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    destroy() {
        this.stopProgressLoop();
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.fullscreenObserver) {
            this.fullscreenObserver.disconnect();
        }
        if (this.topControlBar) {
            this.topControlBar.remove();
        }
        if (this.commentTimestampClickHandler) {
            document.removeEventListener('click', this.commentTimestampClickHandler, true);
            this.commentTimestampClickHandler = null;
        }
        document.body.classList.remove('controls-collapsed');
        document.body.classList.remove('youtube-top-controls-active');
        document.body.classList.remove('controls-at-scroll');
    }
}

// 拡張機能を初期化
let youtubeTopControls = null;

function initExtension() {
    try {
        const wasCollapsed = youtubeTopControls?.isCollapsed ?? false;
        if (youtubeTopControls) {
            youtubeTopControls.destroy();
        }
        youtubeTopControls = new YouTubeTopControls(wasCollapsed);
    } catch (error) {
        console.error('YouTube Top Controls: Failed to initialize extension:', error);
        // エラーが発生した場合も少し待ってからリトライ
        setTimeout(() => {
            console.log('YouTube Top Controls: Retrying initialization after error...');
            initExtension();
        }, 3000);
    }
}

// ページ読み込み時とURL変更時に初期化
initExtension();

// SPA（Single Page Application）対応
let currentUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log('YouTube Top Controls: URL changed, reinitializing...');
        // URL変更時はリトライカウントをリセット
        if (youtubeTopControls) {
            youtubeTopControls.retryCount = 0;
        }
        setTimeout(initExtension, 500);
    }
});

urlObserver.observe(document.body, {
    childList: true,
    subtree: true
});
