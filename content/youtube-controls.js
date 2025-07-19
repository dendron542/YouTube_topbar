// YouTube Top Controls Extension
// YouTubeの動画視聴中にスクロールしても上部にコントロールを常に表示

class YouTubeTopControls {
    constructor() {
        this.video = null;
        this.originalControls = null;
        this.topControlBar = null;
        this.isInitialized = false;
        this.observer = null;
        this.isCollapsed = false;
        
        this.init();
    }
    
    init() {
        // ページが完全に読み込まれてから初期化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeWhenReady());
        } else {
            this.initializeWhenReady();
        }
    }
    
    initializeWhenReady() {
        try {
            // YouTube動画ページかチェック
            if (!this.isYouTubeVideoPage()) {
                return;
            }
            
            // 少し遅延してから初期化（YouTubeの動的読み込み対応）
            setTimeout(() => {
                if (this.findVideoElements()) {
                    this.createTopControlBar();
                    this.setupEventListeners();
                    this.startObserver();
                } else {
                    // 要素が見つからない場合はリトライ
                    setTimeout(() => this.initializeWhenReady(), 2000);
                }
            }, 1000);
        } catch (error) {
            console.error('YouTube Top Controls: Error during initialization:', error);
        }
    }
    
    isYouTubeVideoPage() {
        return window.location.href.includes('/watch') && 
               window.location.hostname.includes('youtube.com');
    }
    
    findVideoElements() {
        try {
            // 動画要素を取得
            this.video = document.querySelector('video');
            
            if (!this.video) {
                console.warn('YouTube Top Controls: Video element not found');
                return false;
            }
            
            // コントロール要素を取得
            this.originalControls = {
                playButton: document.querySelector('.ytp-play-button'),
                volumeButton: document.querySelector('.ytp-mute-button'),
                volumeSlider: document.querySelector('.ytp-volume-slider'),
                progressBar: document.querySelector('.ytp-progress-bar'),
                timeDisplay: document.querySelector('.ytp-time-display'),
                settingsButton: document.querySelector('.ytp-settings-button'),
                fullscreenButton: document.querySelector('.ytp-fullscreen-button')
            };
            
            console.log('YouTube Top Controls: Video element found:', !!this.video);
            console.log('YouTube Top Controls: Original controls found:', this.originalControls);
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
                    <button class="top-control-btn" id="top-play-btn" title="再生/一時停止">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M8 5v14l11-7z" fill="currentColor"/>
                        </svg>
                    </button>
                    
                    <button class="top-control-btn" id="top-rewind-btn" title="10秒戻し">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" fill="currentColor"/>
                        </svg>
                        <span class="rewind-text">10</span>
                    </button>
                    
                    <button class="top-control-btn" id="top-forward-btn" title="10秒送り">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" fill="currentColor"/>
                        </svg>
                        <span class="forward-text">10</span>
                    </button>
                    
                    <div class="top-volume-control">
                        <button class="top-control-btn" id="top-volume-btn" title="音量">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
                            </svg>
                        </button>
                        <input type="range" id="top-volume-slider" min="0" max="100" value="100" class="top-volume-slider">
                    </div>
                    
                    <div class="top-time-display">
                        <span id="top-current-time">0:00</span>
                        <span class="time-separator">/</span>
                        <span id="top-duration">0:00</span>
                    </div>
                </div>
                
                <div class="top-controls-center">
                    <div class="top-progress-container">
                        <input type="range" id="top-progress-bar" min="0" max="100" value="0" class="top-progress-bar">
                    </div>
                </div>
                
                <div class="top-controls-right">
                    <button class="top-control-btn" id="top-settings-btn" title="設定">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                        </svg>
                    </button>
                    
                    <button class="top-control-btn" id="top-fullscreen-btn" title="フルスクリーン">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/>
                        </svg>
                    </button>
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
        
        this.isInitialized = true;
        console.log('Top control bar created');
    }
    
    setupEventListeners() {
        try {
            if (!this.video || !this.topControlBar) {
                console.warn('YouTube Top Controls: Video or control bar not available for event listeners');
                return;
            }
            
            // 再生/一時停止ボタン
            const playBtn = this.topControlBar.querySelector('#top-play-btn');
            playBtn?.addEventListener('click', () => this.safeExecute(() => this.togglePlay()));
            
            // 10秒戻し/送りボタン
            const rewindBtn = this.topControlBar.querySelector('#top-rewind-btn');
            rewindBtn?.addEventListener('click', () => this.safeExecute(() => this.seekBy(-10)));
            
            const forwardBtn = this.topControlBar.querySelector('#top-forward-btn');
            forwardBtn?.addEventListener('click', () => this.safeExecute(() => this.seekBy(10)));
            
            // 音量コントロール
            const volumeBtn = this.topControlBar.querySelector('#top-volume-btn');
            volumeBtn?.addEventListener('click', () => this.safeExecute(() => this.toggleMute()));
            
            const volumeSlider = this.topControlBar.querySelector('#top-volume-slider');
            volumeSlider?.addEventListener('input', (e) => {
                this.safeExecute(() => {
                    this.setVolume(e.target.value / 100);
                    // スライダー操作時も即座に視覚的フィードバックを更新
                    e.target.style.setProperty('--volume-fill', e.target.value + '%');
                });
            });
            
            // プログレスバー（スロットリング付き）
            const progressBar = this.topControlBar.querySelector('#top-progress-bar');
            let progressThrottle = null;
            progressBar?.addEventListener('input', (e) => {
                if (progressThrottle) clearTimeout(progressThrottle);
                progressThrottle = setTimeout(() => {
                    this.safeExecute(() => this.seekTo(e.target.value / 100));
                }, 100);
            });
            
            // 設定・フルスクリーンボタン（元のボタンをクリック）
            const settingsBtn = this.topControlBar.querySelector('#top-settings-btn');
            settingsBtn?.addEventListener('click', () => this.safeExecute(() => this.originalControls.settingsButton?.click()));
            
            const fullscreenBtn = this.topControlBar.querySelector('#top-fullscreen-btn');
            fullscreenBtn?.addEventListener('click', () => this.safeExecute(() => this.originalControls.fullscreenButton?.click()));
            
            // 折り畳み/展開ボタン
            const leftCollapseBtn = this.topControlBar.querySelector('#left-collapse-btn');
            const rightCollapseBtn = this.topControlBar.querySelector('#right-collapse-btn');
            const expandBtn = this.topControlBar.querySelector('#expand-btn');
            
            leftCollapseBtn?.addEventListener('click', () => this.safeExecute(() => this.toggleCollapse()));
            rightCollapseBtn?.addEventListener('click', () => this.safeExecute(() => this.toggleCollapse()));
            expandBtn?.addEventListener('click', () => this.safeExecute(() => this.toggleCollapse()));
            
            // 動画の状態変化を監視（スロットリング付き）
            this.video.addEventListener('play', () => this.safeExecute(() => this.updatePlayButton()));
            this.video.addEventListener('pause', () => this.safeExecute(() => this.updatePlayButton()));
            
            let timeUpdateThrottle = null;
            this.video.addEventListener('timeupdate', () => {
                if (timeUpdateThrottle) return;
                timeUpdateThrottle = setTimeout(() => {
                    this.safeExecute(() => this.updateProgress());
                    timeUpdateThrottle = null;
                }, 100);
            });
            
            this.video.addEventListener('volumechange', () => this.safeExecute(() => this.updateVolumeDisplay()));
            this.video.addEventListener('loadedmetadata', () => this.safeExecute(() => this.updateDuration()));
            
            // 定期的な音量同期（YouTubeの元コントロールとの同期用）
            setInterval(() => {
                this.safeExecute(() => this.updateVolumeDisplay());
            }, 1000);
            
            // 初期値を設定
            this.safeExecute(() => this.updateVolumeDisplay());
            this.safeExecute(() => this.updatePlayButton());
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
            if (!this.video || !this.video.duration) return;
            const newTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
            this.video.currentTime = newTime;
        } catch (error) {
            console.error('YouTube Top Controls: Error seeking by seconds:', error);
        }
    }
    
    seekTo(percentage) {
        try {
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
        const playBtn = this.topControlBar?.querySelector('#top-play-btn svg path');
        if (playBtn) {
            if (this.video.paused) {
                // 再生アイコン
                playBtn.setAttribute('d', 'M8 5v14l11-7z');
            } else {
                // 一時停止アイコン
                playBtn.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
            }
        }
    }
    
    updateProgress() {
        try {
            if (!this.video || !this.video.duration || !this.topControlBar) return;
            
            const progressBar = this.topControlBar.querySelector('#top-progress-bar');
            const currentTimeSpan = this.topControlBar.querySelector('#top-current-time');
            
            if (progressBar) {
                const percentage = (this.video.currentTime / this.video.duration) * 100;
                progressBar.value = Math.max(0, Math.min(100, percentage));
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
            const volumeBtn = this.topControlBar.querySelector('#top-volume-btn svg path');
            
            // 現在の音量値を取得
            const currentVolume = this.video.muted ? 0 : this.video.volume;
            const volumePercentage = Math.round(currentVolume * 100);
            
            console.log('YouTube Top Controls: Updating volume display - Volume:', volumePercentage + '%', 'Muted:', this.video.muted);
            
            if (volumeSlider) {
                volumeSlider.value = volumePercentage;
                // CSS変数を更新して視覚的な音量レベルを表示
                volumeSlider.style.setProperty('--volume-fill', volumePercentage + '%');
            }
            
            if (volumeBtn) {
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
                volumeBtn.setAttribute('d', iconPath);
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
            
            const mainContainer = this.topControlBar.querySelector('.top-controls-container');
            const collapsedContainer = this.topControlBar.querySelector('.top-controls-collapsed');
            
            if (this.isCollapsed) {
                // 折り畳み状態にする
                this.topControlBar.classList.add('collapsed');
                document.body.classList.add('controls-collapsed');
                if (mainContainer) mainContainer.style.display = 'none';
                if (collapsedContainer) collapsedContainer.style.display = 'block';
                
                console.log('YouTube Top Controls: Controls collapsed');
            } else {
                // 展開状態にする
                this.topControlBar.classList.remove('collapsed');
                document.body.classList.remove('controls-collapsed');
                if (mainContainer) mainContainer.style.display = 'flex';
                if (collapsedContainer) collapsedContainer.style.display = 'none';
                
                console.log('YouTube Top Controls: Controls expanded');
            }
        } catch (error) {
            console.error('YouTube Top Controls: Error toggling collapse:', error);
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
    
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.topControlBar) {
            this.topControlBar.remove();
        }
        // クリーンアップ
        document.body.classList.remove('controls-collapsed');
    }
}

// 拡張機能を初期化
let youtubeTopControls = null;

function initExtension() {
    if (youtubeTopControls) {
        youtubeTopControls.destroy();
    }
    youtubeTopControls = new YouTubeTopControls();
}

// ページ読み込み時とURL変更時に初期化
initExtension();

// SPA（Single Page Application）対応
let currentUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(initExtension, 500);
    }
});

urlObserver.observe(document.body, {
    childList: true,
    subtree: true
});