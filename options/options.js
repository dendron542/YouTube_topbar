const STORAGE_KEY = 'youtubeTopControls_buttonConfig_v1';

const DEFAULT_CONFIG = {
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

const ACTIONS = [
  { value: 'playPause', label: '再生/一時停止' },
  { value: 'rewind10', label: '10秒戻し' },
  { value: 'forward10', label: '10秒送り' },
  { value: 'replay', label: 'もう一回見る' },
  { value: 'previousVideo', label: '前の動画を再生' },
  { value: 'nextVideo', label: '次の動画を再生' },
  { value: 'loopToggle', label: 'ループ再生 ON/OFF' },
  { value: 'muteToggle', label: 'ミュート ON/OFF' },
  { value: 'youtubeSettings', label: 'YouTube 設定を開く' },
  { value: 'youtubeFullscreen', label: 'フルスクリーン切替' },
  { value: 'none', label: '表示しない' },
];

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

function storageGet(key) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve({});
      return;
    }
    chrome.storage.sync.get({ [key]: null }, (result) => {
      resolve(result ?? {});
    });
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve();
      return;
    }
    chrome.storage.sync.set(obj, () => resolve());
  });
}

function isValidAction(value) {
  return ACTIONS.some((a) => a.value === value);
}

function sanitizeConfig(raw) {
  const cfg = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== 'object') return cfg;

  for (const k of Object.keys(cfg)) {
    const defVal = cfg[k];
    const v = raw[k];
    if (typeof defVal === 'boolean') {
      if (typeof v === 'boolean') cfg[k] = v;
      continue;
    }
    if (typeof v === 'string' && isValidAction(v)) cfg[k] = v;
  }

  return cfg;
}

function fillSelect(select, currentValue) {
  select.innerHTML = '';
  for (const action of ACTIONS) {
    const opt = document.createElement('option');
    opt.value = action.value;
    opt.textContent = action.label;
    select.appendChild(opt);
  }
  select.value = currentValue;
}

function readForm() {
  return {
    leftPrimary: byId('leftPrimary').value,
    leftSecondary: byId('leftSecondary').value,
    leftTertiary: byId('leftTertiary').value,
    volumeToggle: byId('volumeToggle').value,
    showVolumeSlider: byId('showVolumeSlider').checked,
    showTimeDisplay: byId('showTimeDisplay').checked,
    rightExtra: byId('rightExtra').value,
    rightSettings: byId('rightSettings').value,
    rightFullscreen: byId('rightFullscreen').value,
  };
}

function writeStatus(text) {
  byId('status').textContent = text;
}

async function loadAndRender() {
  const res = await storageGet(STORAGE_KEY);
  const cfg = sanitizeConfig(res[STORAGE_KEY]);

  fillSelect(byId('leftPrimary'), cfg.leftPrimary);
  fillSelect(byId('leftSecondary'), cfg.leftSecondary);
  fillSelect(byId('leftTertiary'), cfg.leftTertiary);
  fillSelect(byId('volumeToggle'), cfg.volumeToggle);
  fillSelect(byId('rightExtra'), cfg.rightExtra);
  fillSelect(byId('rightSettings'), cfg.rightSettings);
  fillSelect(byId('rightFullscreen'), cfg.rightFullscreen);

  byId('showVolumeSlider').checked = !!cfg.showVolumeSlider;
  byId('showTimeDisplay').checked = !!cfg.showTimeDisplay;

  writeStatus('');
}

async function save() {
  const cfg = sanitizeConfig(readForm());
  await storageSet({ [STORAGE_KEY]: cfg });
  writeStatus('保存しました');
  setTimeout(() => writeStatus(''), 1500);
}

async function resetToDefault() {
  await storageSet({ [STORAGE_KEY]: { ...DEFAULT_CONFIG } });
  await loadAndRender();
  writeStatus('デフォルトに戻しました');
  setTimeout(() => writeStatus(''), 1500);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAndRender();

  byId('save').addEventListener('click', () => {
    save().catch((e) => {
      console.error(e);
      writeStatus('保存に失敗しました');
    });
  });

  byId('reset').addEventListener('click', () => {
    resetToDefault().catch((e) => {
      console.error(e);
      writeStatus('リセットに失敗しました');
    });
  });
});
