import { Game } from './game';
import type { LevelData, ChallengeRules, ChallengeState, ChallengeRecord } from './types';
import { healthCheck, getLevelList, getChallengeRecords, submitChallengeRecord } from './api';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const game = new Game(canvas);

const levelNumEl = document.getElementById('level-num')!;
const creatureNameEl = document.getElementById('creature-name')!;
const connectedCountEl = document.getElementById('connected-count')!;
const totalCountEl = document.getElementById('total-count')!;
const progressFillEl = document.getElementById('progress-fill')!;
const hintTitleEl = document.getElementById('hint-title')!;
const hintTextEl = document.getElementById('hint-text')!;
const completeModal = document.getElementById('complete-modal')!;
const modalTitleEl = document.getElementById('modal-title')!;
const modalDescEl = document.getElementById('modal-desc')!;

const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
const btnMenu = document.getElementById('btn-menu') as HTMLButtonElement;

const menuOverlay = document.getElementById('menu-overlay')!;
const challengeResultOverlay = document.getElementById('challenge-result-overlay')!;
const levelGrid = document.getElementById('level-grid')!;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const modeBtns = document.querySelectorAll('.mode-btn');
const rulesSection = document.getElementById('rules-section')!;
const recordsSection = document.getElementById('records-section')!;
const recordsList = document.getElementById('records-list')!;

const challengeInfoEl = document.getElementById('challenge-info')!;
const challengeTimerEl = document.getElementById('challenge-timer')!;
const challengeErrorsEl = document.getElementById('challenge-errors')!;
const challengeRulesEl = document.getElementById('challenge-rules')!;

const switchTimelimit = document.getElementById('switch-timelimit')!;
const selectTimelimit = document.getElementById('select-timelimit') as HTMLSelectElement;
const switchFreq = document.getElementById('switch-freq')!;
const switchMaxerrors = document.getElementById('switch-maxerrors')!;
const selectMaxerrors = document.getElementById('select-maxerrors') as HTMLSelectElement;

const resultTitleEl = document.getElementById('challenge-result-title')!;
const resultSubtitleEl = document.getElementById('challenge-result-subtitle')!;
const resultScoreEl = document.getElementById('result-score')!;
const resultTimeEl = document.getElementById('result-time')!;
const resultErrorsEl = document.getElementById('result-errors')!;
const resultNewRecordEl = document.getElementById('result-new-record')!;
const btnRetryChallenge = document.getElementById('btn-retry-challenge') as HTMLButtonElement;
const btnRecords = document.getElementById('btn-records') as HTMLButtonElement;
const btnBackMenu = document.getElementById('btn-back-menu') as HTMLButtonElement;

const MAX_LEVELS = 3;

let currentMode: 'normal' | 'challenge' = 'normal';
let selectedLevelId: number = 1;
let availableLevels: Array<{ id: number; name: string; creatureName: string }> = [];
let lastChallengeRules: ChallengeRules | null = null;

function toggleSwitch(el: HTMLElement, active: boolean): void {
  if (active) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

function isSwitchActive(el: HTMLElement): boolean {
  return el.classList.contains('active');
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRulesText(rules: ChallengeRules): string {
  const parts: string[] = [];
  if (rules.timeLimit != null) parts.push(`限时${rules.timeLimit}秒`);
  if (rules.disableFrequencyDisplay) parts.push('隐藏频率');
  if (rules.maxErrors != null) parts.push(`最多${rules.maxErrors}次错误`);
  return parts.length > 0 ? parts.join(' · ') : '无限制';
}

function renderLevelGrid(): void {
  levelGrid.innerHTML = '';
  availableLevels.forEach(lv => {
    const card = document.createElement('div');
    card.className = 'level-card' + (lv.id === selectedLevelId ? ' selected' : '');
    card.innerHTML = `
      <div class="level-num">${lv.id}</div>
      <div class="level-name">${lv.name}</div>
      <div class="creature">${lv.creatureName}</div>
    `;
    card.addEventListener('click', () => {
      selectedLevelId = lv.id;
      renderLevelGrid();
      if (currentMode === 'challenge') {
        loadAndRenderRecords();
      }
    });
    levelGrid.appendChild(card);
  });
}

async function loadAndRenderRecords(): Promise<void> {
  const records = await getChallengeRecords(selectedLevelId);
  renderRecords(records);
}

function renderRecords(records: ChallengeRecord[]): void {
  if (records.length === 0) {
    recordsList.innerHTML = '<div class="empty-records">暂无挑战记录，开始你的第一次挑战吧！</div>';
    return;
  }

  const sorted = [...records].sort((a, b) => b.score - a.score);
  recordsList.innerHTML = '';

  sorted.slice(0, 10).forEach((record, idx) => {
    const item = document.createElement('div');
    item.className = 'record-item' + (idx === 0 ? ' gold' : '');
    const rulesText = formatRulesText(record.rules);
    const date = new Date(record.completedAt);
    item.innerHTML = `
      <div class="record-rank">#${idx + 1}</div>
      <div class="record-info">
        <div class="record-score">${record.score} 分</div>
        <div class="record-meta">
          用时 ${record.timeUsed.toFixed(1)}s · 错误 ${record.errorCount} 次 · ${rulesText}
          <br>${date.toLocaleString('zh-CN')}
        </div>
      </div>
      <div class="record-status ${record.completed ? 'success' : 'fail'}">
        ${record.completed ? '成功' : '失败'}
      </div>
    `;
    recordsList.appendChild(item);
  });
}

function getSelectedChallengeRules(): ChallengeRules {
  return {
    timeLimit: isSwitchActive(switchTimelimit) ? parseInt(selectTimelimit.value) : null,
    disableFrequencyDisplay: isSwitchActive(switchFreq),
    maxErrors: isSwitchActive(switchMaxerrors) ? parseInt(selectMaxerrors.value) : null
  };
}

function updateChallengeUI(state: ChallengeState): void {
  if (state.isActive && state.rules) {
    challengeInfoEl.classList.add('active');

    if (state.rules.timeLimit != null && state.timeRemaining != null) {
      challengeTimerEl.textContent = formatTime(state.timeRemaining);
      if (state.timeRemaining <= 10) {
        challengeTimerEl.classList.add('warning');
      } else {
        challengeTimerEl.classList.remove('warning');
      }
    } else {
      challengeTimerEl.textContent = '∞';
      challengeTimerEl.classList.remove('warning');
    }

    const maxErrors = state.rules.maxErrors;
    if (maxErrors != null) {
      challengeErrorsEl.textContent = `错误: ${state.errorCount} / ${maxErrors}`;
    } else {
      challengeErrorsEl.textContent = `错误: ${state.errorCount}`;
    }

    challengeRulesEl.textContent = formatRulesText(state.rules);
  } else {
    challengeInfoEl.classList.remove('active');
  }
}

async function checkIsNewRecord(levelId: number, score: number): Promise<boolean> {
  const records = await getChallengeRecords(levelId);
  if (records.length === 0) return true;
  const maxScore = Math.max(...records.map(r => r.score));
  return score > maxScore;
}

async function showChallengeResult(
  success: boolean,
  timeUsed: number,
  errorCount: number,
  score: number
): Promise<void> {

  resultTitleEl.textContent = success ? '🎉 挑战成功！' : '💫 挑战失败';
  resultSubtitleEl.textContent = success
    ? '神话生物已在你的连接下显现！'
    : '不要灰心，再来一次吧！';

  resultScoreEl.textContent = String(score);
  resultScoreEl.className = 'stat-value' + (success ? '' : ' fail');
  resultTimeEl.textContent = `${timeUsed.toFixed(1)}s`;
  resultErrorsEl.textContent = String(errorCount);

  if (success) {
    const isNew = await checkIsNewRecord(selectedLevelId, score);
    resultNewRecordEl.style.display = isNew ? 'block' : 'none';
  } else {
    resultNewRecordEl.style.display = 'none';
  }

  challengeResultOverlay.classList.add('show');
}

game.setCallbacks({
  onLevelChange: (level: LevelData) => {
    levelNumEl.textContent = String(level.id);
    creatureNameEl.textContent = level.creatureName;
    totalCountEl.textContent = String(level.edges.length);
    connectedCountEl.textContent = '0';
    progressFillEl.style.width = '0%';
    completeModal.classList.remove('show');

    hintTitleEl.textContent = `关卡 ${level.id}: ${level.name}`;
    hintTextEl.textContent = '寻找闪烁频率成倍数关系的恒星，从一颗星拖动到另一颗星连接它们';
  },
  onProgressChange: (current: number, total: number) => {
    connectedCountEl.textContent = String(current);
    const pct = total > 0 ? (current / total) * 100 : 0;
    progressFillEl.style.width = `${pct}%`;

    if (current < total) {
      if (current === 0) {
        hintTitleEl.textContent = '观察星空';
        hintTextEl.textContent = '仔细观察星星的闪烁节奏，找到频率相同或成倍数的恒星';
      } else if (current < total * 0.3) {
        hintTitleEl.textContent = '初见端倪';
        hintTextEl.textContent = '做得好！继续寻找，你会发现恒星间的谐波共振关系';
      } else if (current < total * 0.6) {
        hintTitleEl.textContent = '星脉初现';
        hintTextEl.textContent = '神话生物的轮廓正在浮现，耐心连接剩余的星脉';
      } else if (current < total) {
        hintTitleEl.textContent = '即将完成';
        hintTextEl.textContent = '只剩最后几颗星了！神话生物即将显现';
      }
    }
  },
  onComplete: (desc: string) => {
    const chState = game.getChallengeState();
    if (chState.isActive) return;

    hintTitleEl.textContent = '✨ 星座完成 ✨';
    hintTextEl.textContent = '星界神话生物已显现！仔细欣赏它的光辉吧';

    modalTitleEl.textContent = `✨ ${creatureNameEl.textContent} 降临 ✨`;
    modalDescEl.textContent = desc;
    completeModal.classList.add('show');

    if (game.getCurrentLevel() >= MAX_LEVELS) {
      btnNext.textContent = '重新开始';
    } else {
      btnNext.textContent = '下一关';
    }
  },
  onChallengeUpdate: (state: ChallengeState) => {
    updateChallengeUI(state);
  },
  onChallengeEnd: async (success: boolean, timeUsed: number, errorCount: number, score: number) => {
    if (lastChallengeRules) {
      await submitChallengeRecord(
        selectedLevelId,
        lastChallengeRules,
        success,
        timeUsed,
        errorCount,
        score
      );
    }
    await showChallengeResult(success, timeUsed, errorCount, score);
  }
});

btnUndo.addEventListener('click', () => {
  game.undoLastConnection();
});

btnReset.addEventListener('click', () => {
  if (confirm('确定要重置本关吗？所有连线将被清除。')) {
    game.resetLevel();
  }
});

btnHint.addEventListener('click', () => {
  if (game.isFrequencyDisplayDisabled()) {
    alert('挑战模式下已禁用频率显示！');
    return;
  }
  const showing = game.toggleFrequencies();
  btnHint.textContent = showing ? '隐藏频率' : '显示频率';
});

btnNext.addEventListener('click', async () => {
  const nextLevel = game.getCurrentLevel() >= MAX_LEVELS
    ? 1
    : game.getCurrentLevel() + 1;

  completeModal.classList.remove('show');
  btnHint.textContent = '显示频率';
  await game.loadLevel(nextLevel);
});

btnMenu.addEventListener('click', () => {
  completeModal.classList.remove('show');
  challengeResultOverlay.classList.remove('show');
  menuOverlay.classList.add('show');
  btnHint.textContent = '显示频率';
});

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.getAttribute('data-mode') as 'normal' | 'challenge';

    if (currentMode === 'challenge') {
      rulesSection.style.display = 'block';
      recordsSection.style.display = 'block';
      loadAndRenderRecords();
    } else {
      rulesSection.style.display = 'none';
      recordsSection.style.display = 'none';
    }
  });
});

function setupSwitch(
  switchEl: HTMLElement,
  selectEl?: HTMLSelectElement,
  onChange?: (active: boolean) => void
): void {
  switchEl.addEventListener('click', () => {
    const active = !isSwitchActive(switchEl);
    toggleSwitch(switchEl, active);
    if (selectEl) {
      selectEl.disabled = !active;
    }
    onChange?.(active);
  });
}

setupSwitch(switchTimelimit, selectTimelimit);
setupSwitch(switchFreq);
setupSwitch(switchMaxerrors, selectMaxerrors);

btnStart.addEventListener('click', async () => {
  menuOverlay.classList.remove('show');

  if (currentMode === 'challenge') {
    const rules = getSelectedChallengeRules();
    lastChallengeRules = rules;
    await game.startChallenge(selectedLevelId, rules);
  } else {
    lastChallengeRules = null;
    await game.loadLevel(selectedLevelId);
  }
  btnHint.textContent = '显示频率';
});

btnRetryChallenge.addEventListener('click', async () => {
  challengeResultOverlay.classList.remove('show');
  if (lastChallengeRules) {
    await game.startChallenge(selectedLevelId, lastChallengeRules);
  }
});

btnRecords.addEventListener('click', async () => {
  challengeResultOverlay.classList.remove('show');
  menuOverlay.classList.add('show');
  modeBtns.forEach(b => b.classList.remove('active'));
  document.querySelector('.mode-btn[data-mode="challenge"]')?.classList.add('active');
  currentMode = 'challenge';
  rulesSection.style.display = 'block';
  recordsSection.style.display = 'block';
  await loadAndRenderRecords();
});

btnBackMenu.addEventListener('click', () => {
  challengeResultOverlay.classList.remove('show');
  menuOverlay.classList.add('show');
});

async function init(): Promise<void> {
  hintTitleEl.textContent = '加载中...';
  hintTextEl.textContent = '正在连接星界数据库...';

  try {
    const backendOk = await healthCheck();
    if (!backendOk) {
      console.warn('后端未启动，尝试使用嵌入数据...');
    }
  } catch {
    console.warn('后端健康检查失败');
  }

  availableLevels = await getLevelList();
  if (availableLevels.length === 0) {
    availableLevels = [
      { id: 1, name: '苍穹神龙', creatureName: '苍龙' },
      { id: 2, name: '涅槃凤凰', creatureName: '朱雀' },
      { id: 3, name: '祥瑞麒麟', creatureName: '麒麟' }
    ];
  }
  renderLevelGrid();

  menuOverlay.classList.add('show');
  const loaded = await game.loadLevel(1);
  if (!loaded) {
    hintTitleEl.textContent = '⚠️ 加载失败';
    hintTextEl.textContent = '无法加载关卡数据，请确保后端服务器已启动 (npm run dev:backend)';
    return;
  }

  game.start();
}

init().catch(err => {
  console.error('初始化失败:', err);
  hintTitleEl.textContent = '错误';
  hintTextEl.textContent = String(err);
});
