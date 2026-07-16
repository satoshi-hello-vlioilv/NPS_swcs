// アプリバージョン
const APP_VERSION = '1.0.0';

// グローバル変数
// 設定・初期構成
let taktTime = 36.0;
let chartScaleMode = 'manual'; // 'auto', 'main', 'frequency'
let manualScaleValue = 36;

// まとめづくり設定
let batchMode = false;               // まとめづくりモードON/OFF
let batchQuantity = 1;               // まとめ数（1=無効、2以上=有効）
let batchQuantityMemory = 2;         // 最後に設定した有効値（ONに戻した時に復元）
let batchShowIndividualLines = true; // 個別T/T補助線の表示

// 標準手持ち（Standard WIP）
let standardWIP = 0;                 // 標準手持ち数（0=手持ちなし、1以上=サイクル内に複数ロット混在）

// マルチサイクル描画設定
let cycleCount = 1;                  // 描画サイクル数（1=1サイクルのみ, N=Nサイクル連続描画）
// 後方互換ゲッター: chart-renderer.jsの既存参照を維持
Object.defineProperty(window, 'showDualCycle', {
    get: () => cycleCount >= 2,
    configurable: true
});

// ===================================================
// 線スタイル設定（T/T線・改善前C/T線・改善後C/T線）
// ===================================================
const LINE_STYLE_DEFAULTS = {
    taktTime:   { color: '#dc2626', width: 3,   dash: 'solid'  }, // T/T線: 赤 実線
    currentCT:  { color: '#1f2937', width: 2,   dash: 'solid'  }, // 改善前C/T: 黒 細線
    improvedCT: { color: '#dc2626', width: 2,   dash: 'solid'  }  // 改善後C/T: 赤 細線
};
let lineStyles = JSON.parse(JSON.stringify(LINE_STYLE_DEFAULTS));

/** dashキー → Canvas setLineDash パターン */
const LINE_DASH_PATTERNS = {
    'solid':    [],
    'dashed':   [8, 4],
    'dotted':   [3, 3],
    'dash-dot': [8, 3, 2, 3]
};
let currentMainTab = 'gantt'; // 'gantt', 'distribution', 'schedule'
let displayMode = 'current'; // 'current', 'improved', 'both'
let showWorkItemLabels = true;
let showGanttChart = true;
let isCanvasReady = false;
let isDistributionCanvasReady = false;
let isScheduleCanvasReady = false;
let isFrequencyCanvasReady = false;
let isProcessCanvasReady = false;
let frequencyChartMode = 'actual'; // 'actual', 'converted'

// 遅延実行キュー
let pendingChartUpdates = [];

// 作業項目・並び順・データ
let workItems = [];
let frequencyWorkItems = []; // 頻度作業項目
let currentWorkOrder = []; // 改善前の並び順
let improvedWorkOrder = []; // 改善後の並び順
let dataList = [];
let currentDataId = null;
let selectedDataIds = []; // 作業配分表用の選択データ
let currentVariabilityData = {}; // 現在のバラつきデータを保持

// 編集・挿入状態
let currentEditingId = null;
let distributionDisplayMode = 'current';
let distributionErrorBarMode = 'none'; // 'none', 'person', 'work', 'both'
let currentEditingFrequencyId = null; // 編集中の頻度作業ID
let currentEditingTimeSlotId = null; // 編集中の時間帯ID
let insertPosition = -1;
let insertRowIndex = -1;

// 作業配分表のレイアウト設定
let distBarWidth = 100;
let distGroupSpacing = 40;

function updateDistributionLayoutSettings() {
    distBarWidth = parseInt(document.getElementById('distBarWidthSlider').value, 10);
    distGroupSpacing = parseInt(document.getElementById('distGroupSpacingSlider').value, 10);
    document.getElementById('distBarWidthValue').textContent = distBarWidth + 'px';
    document.getElementById('distGroupSpacingValue').textContent = distGroupSpacing + 'px';
    
    if (currentMainTab === 'distribution') {
        adjustDistributionCanvasWidth();
        updateDistributionChart();
    }
    triggerAutoSave();
}

function resetDistributionLayoutSettings() {
    document.getElementById('distBarWidthSlider').value = 100;
    document.getElementById('distGroupSpacingSlider').value = 40;
    updateDistributionLayoutSettings();
}

function adjustDistributionCanvasWidth() {
    const distributionCanvasContainer = document.getElementById('distributionCanvasContainer');
    const distributionCanvas = document.getElementById('distributionCanvas');
    
    if (!distributionCanvasContainer || !distributionCanvas) return;

    const selectedData = dataList.filter(data => selectedDataIds.includes(data.id));
    const dataCount = selectedData.length;
    
    const leftMargin = 80;
    const rightMargin = 40;
    
    let requiredChartWidth = 0;
    
    if (dataCount > 0) {
        if (distributionDisplayMode === 'both-grouped') {
            requiredChartWidth = dataCount * (distBarWidth * 2 + 10) + (dataCount + 1) * distGroupSpacing;
        } else if (distributionDisplayMode === 'both-separated') {
            requiredChartWidth = (dataCount * distBarWidth + (dataCount + 1) * distGroupSpacing) * 2 + 40; 
        } else {
            requiredChartWidth = dataCount * distBarWidth + (dataCount + 1) * distGroupSpacing;
        }
    }
    
    const requiredTotalWidth = requiredChartWidth + leftMargin + rightMargin;
    
    const containerRect = distributionCanvasContainer.getBoundingClientRect();
    const minWidth = Math.max(950, containerRect.width - 35);
    
    const newWidth = Math.max(minWidth, requiredTotalWidth);
    const newHeight = Math.max(360, containerRect.height - 35);
    
    const devicePixelRatio = window.devicePixelRatio || 1;
    const currentDisplayWidth = distributionCanvas.width / devicePixelRatio;
    
    if (Math.abs(newWidth - currentDisplayWidth) > 1) {
        distributionCanvasWidth = newWidth;
        distributionCanvasHeight = newHeight;
        setupHighDPICanvas(distributionCanvas, distributionCtx, distributionCanvasWidth, distributionCanvasHeight);
    }
}

// レイアウト設定とグループ設定
let rowHeightFactor = 1.0;
let fontSizeFactor = 1.0;
let currentWorkGroups = [];
let improvedWorkGroups = [];

function getEffectiveRowHeight() {
    return Math.max(15, 45 * (rowHeightFactor || 1.0));
}
function getEffectiveFontSize(baseSize) {
    return Math.max(6, Math.round(baseSize * (fontSizeFactor || 1.0)));
}
function getEffectiveFont(weight, baseSize, family = '"Segoe UI", sans-serif') {
    return `${weight} ${getEffectiveFontSize(baseSize)}px ${family}`;
}

function updateLayoutSettings() {
    rowHeightFactor = parseFloat(document.getElementById('rowHeightSlider').value);
    fontSizeFactor = parseFloat(document.getElementById('fontSizeSlider').value);
    document.getElementById('rowHeightValue').textContent = rowHeightFactor.toFixed(1) + 'x';
    document.getElementById('fontSizeValue').textContent = fontSizeFactor.toFixed(1) + 'x';
    updateChart();
    updateProcessChart();
    updateFrequencyChart();
    triggerAutoSave();
}

function resetLayoutSettings() {
    document.getElementById('rowHeightSlider').value = 1.0;
    document.getElementById('fontSizeSlider').value = 1.0;
    updateLayoutSettings();
}

// 時間帯・スケジュール設定
let timeSlots = []; // 時間帯管理
let scheduleConfig = { // 稼働時間設定
startTime: '',
workHours: 8,
endTime: ''
};

// キャンバスとコンテキスト
let canvas, ctx;
let distributionCanvas, distributionCtx;
let scheduleCanvas, scheduleCtx; // 稼働時間チャート
let frequencyCanvas, frequencyCtx; // 頻度作業チャート
let processCanvas, processCtx; // 工程確認チャート

let showFrequencyChart = true; // 頻度作業チャート

// キャンバスサイズ
let canvasWidth = 1400;
let canvasHeight = 500;
let distributionCanvasWidth = 1400;
let distributionCanvasHeight = 600;
let scheduleCanvasWidth = 1400;
let scheduleCanvasHeight = 350;
let frequencyCanvasWidth = 1400;
let frequencyCanvasHeight = 300;
let processCanvasWidth = 1400;
let processCanvasHeight = 80;

// 表示用定数
const ROW_HEIGHT = 45;
const TOP_MARGIN = 65; // ラベル上部にオーバーレイトグルボタン用の余白を確保（旧40→65）
const BOTTOM_MARGIN = 30;

const SCHEDULE_BAR_HEIGHT = 90;
const SCHEDULE_ROW_HEIGHT = 45;
const SCHEDULE_TOP_MARGIN = 100;
const SCHEDULE_BOTTOM_MARGIN = 30;

const FREQUENCY_ROW_HEIGHT = 45;
const FREQUENCY_TOP_MARGIN = 65; // ガント・工程チャートと統一（オーバーレイボタン + 横軸ラベル非干渉）
const FREQUENCY_BOTTOM_MARGIN = 30;

const PROCESS_ROW_HEIGHT = 45;
const PROCESS_TOP_MARGIN = 65;    // ガント・頻度チャートと統一（3チャート一貫したトップマージン）
const PROCESS_BOTTOM_MARGIN = 30;

// UIドラッグ操作管理
let hoveredRowIndex = -1;
let selectedRowIndices = []; // 複数選択用（右クリック・まとめ機能向け）
let lastSelectedRowIndex = -1; // Shiftクリック用
let canvasDragMode = false;
let dragStartY = 0;
let draggedRowIndex = -1;
let dropTargetIndex = -1;
let hoveredProcessRowIndex = -1;  // 工程確認チャート用
let hoveredFrequencyRowIndex = -1;  // 頻度作業チャート用
let mouseDownPos = null;
let dragThreshold = 5;

// 自動送り干渉バッジ（標準作業組合せ票オーバーレイ）位置管理
// 再描画してもユーザーが移動した位置を保持する
let ganttConflictBadgeUserPos = null; // null = デフォルト右上、{left, top} = ユーザー移動後
let ganttConflictBadgeDismissed = false; // 閉じるボタンで一時非表示にした状態

// スケジュールチャート用ドラッグ状態
let scheduleDragMode = false;
let draggedTimeSlot = null;
let draggedTimeSlotId = null;
let draggedTimeSlotEdge = null; // 'start', 'end', 'move'
let scheduleMouseDownPos = null;
let scheduleDragSensitivity = 10; // ピクセル単位で感度調整

// 工程確認チャート用キャッシュ
let showProcessChart = false;
let processChartLotMode = 'lot'; // 'lot': ロットビュー(行分解), 'cycle': サイクルビュー(1行集約+ロット番号)

// オートセーブタイマー
let autoSaveTimer = null;

/**
 * チャート更新を安全に実行またはキューに追加
 * @param {string} chartType - チャートタイプ ('main', 'frequency', 'schedule', 'process', 'distribution')
 * @param {function} updateFunction - 実行する更新関数
 */
function safeUpdateChart(chartType, updateFunction) {
    const readyFlags = {
        'main': isCanvasReady,
        'frequency': isFrequencyCanvasReady,
        'schedule': isScheduleCanvasReady,
        'process': isProcessCanvasReady,
        'distribution': isDistributionCanvasReady
    };
    
    if (readyFlags[chartType]) {
        try {
            updateFunction();
        } catch (error) {
            console.error(`Error updating ${chartType} chart:`, error);
        }
    } else {
        // キューに追加
        pendingChartUpdates.push({ chartType, updateFunction });
    }
}

/**
 * 保留中のチャート更新を実行
 * @param {string} chartType - 初期化完了したチャートタイプ
 */
function processPendingUpdates(chartType) {
    const pendingUpdates = pendingChartUpdates.filter(update => update.chartType === chartType);
    
    pendingUpdates.forEach(update => {
        try {
            update.updateFunction();
        } catch (error) {
            console.error(`Error processing pending ${chartType} chart update:`, error);
        }
    });
    
    // 実行済みの更新をキューから削除
    pendingChartUpdates = pendingChartUpdates.filter(update => update.chartType !== chartType);
}

/**
 * Canvas を高解像度ディスプレイ対応にする（Welcome画面移行対応強化版・エラーハンドリング強化）
 * @param {HTMLCanvasElement} canvas - 対象のキャンバス
 * @param {CanvasRenderingContext2D} ctx - キャンバスのコンテキスト
 * @param {number} width - 表示幅
 * @param {number} height - 表示高さ
 * @returns {number} - devicePixelRatio
 */
function setupHighDPICanvas(canvas, ctx, width, height) {

    if (
        !canvas ||
        !ctx ||
        typeof width !== 'number' || width <= 0 ||
        typeof height !== 'number' || height <= 0 ||
        !canvas.parentNode
    ) {
        return 1;
    }
    
    // Welcome画面からの移行時は特別な確認を実行
    const isFromWelcomeTransition = !document.getElementById('welcomeScreen') && 
                                   Date.now() - (window._lastWelcomeHideTime || 0) < 5000;
    
    if (isFromWelcomeTransition) {
        
        // Welcome画面移行時にコンテナサイズを再確認
        const container = canvas.parentNode;
        if (container && container.getBoundingClientRect) {
            const containerRect = container.getBoundingClientRect();
            if (containerRect.width > 0 && Math.abs(containerRect.width - width) > 100) {
                const adjustedWidth = Math.max(1150, containerRect.width - 35);
                width = adjustedWidth;
            }
        }
    }
    
    try {
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // 現在の設定と比較して変更が必要かチェック
        const currentDisplayWidth = canvas.width / devicePixelRatio;
        const currentDisplayHeight = canvas.height / devicePixelRatio;
        const currentDPR = canvas._currentDevicePixelRatio || 1;
        
        const needsUpdate = 
            Math.abs(currentDisplayWidth - width) > 0.5 ||
            Math.abs(currentDisplayHeight - height) > 0.5 ||
            Math.abs(currentDPR - devicePixelRatio) > 0.1 ||
            isFromWelcomeTransition; // Welcome画面移行時は強制更新
        
        if (needsUpdate) {
            
            // Canvas の実際のサイズを devicePixelRatio 倍にする
            canvas.width = Math.floor(width * devicePixelRatio);
            canvas.height = Math.floor(height * devicePixelRatio);
            
            // CSS での表示サイズは元のサイズのまま
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            
            // コンテキストの変換行列をリセット
            try {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                
                // 描画時のスケールを devicePixelRatio 倍にする
                ctx.scale(devicePixelRatio, devicePixelRatio);
                
                // 現在のdevicePixelRatioを記録
                canvas._currentDevicePixelRatio = devicePixelRatio;
                
                // Welcome画面移行時のタイムスタンプを記録
                if (isFromWelcomeTransition) {
                    canvas._welcomeTransitionTime = Date.now();
                    window._lastWelcomeHideTime = Date.now(); // グローバルにも記録
                }
                
            } catch (contextError) {
                console.error('Error setting up canvas context:', contextError);
                return 1;
            }
        }
        
        return devicePixelRatio;
        
    } catch (error) {
        console.error('Error in setupHighDPICanvas:', error);
        
        // エラー時のフォールバック処理
        try {
            canvas.width = width;
            canvas.height = height;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
        } catch (fallbackError) {
            console.error('Fallback canvas setup also failed:', fallbackError);
        }
        
        return 1;
    }
}

/**
 * Canvas のサイズを更新（高解像度対応）
 * @param {HTMLCanvasElement} canvas - 対象のキャンバス
 * @param {CanvasRenderingContext2D} ctx - キャンバスのコンテキスト
 * @param {number} width - 新しい表示幅
 * @param {number} height - 新しい表示高さ
 * @returns {number} - devicePixelRatio
 */
function updateHighDPICanvas(canvas, ctx, width, height) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // 現在のサイズと比較して変更が必要かチェック
    const currentDisplayWidth = Math.round(canvas.width / devicePixelRatio);
    const currentDisplayHeight = Math.round(canvas.height / devicePixelRatio);
    
    if (currentDisplayWidth !== width || currentDisplayHeight !== height) {
        return setupHighDPICanvas(canvas, ctx, width, height);
    }
    
    return devicePixelRatio;
}

/**
 * マウス座標を Canvas 座標に変換（高解像度対応）
 * @param {HTMLCanvasElement} canvas - 対象キャンバス
 * @param {MouseEvent} event - マウスイベント
 * @returns {Object} - {x, y} 座標
 */
function getCanvasMousePosition(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // CSS での表示サイズベースで計算
    const x = (event.clientX - rect.left) * (canvas.width / devicePixelRatio / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / devicePixelRatio / rect.height);
    
    return { x, y };
}

// ========================================
// Enhanced Scale Synchronization System (強化されたスケール同期システム)
// ========================================

/**
 * 統一スケール計算（標準作業組合せ票と頻度作業の完全同期版・手動スライダー対応）
 * @returns {Object} - スケール情報
 */
function calculateUnifiedScale() {
    const displayItems = getDisplayWorkItems();

    let cycleTime = 0;
    displayItems.forEach(item => {
        if (displayMode === 'improved' && item.improved) {
            cycleTime += item.improved.manualTime + item.improved.walkTime;
        } else if (displayMode === 'both') {
            const currentTime = item.manualTime + item.walkTime;
            const improvedTime = item.improved ? item.improved.manualTime + item.improved.walkTime : currentTime;
            cycleTime += Math.max(currentTime, improvedTime);
        } else {
            cycleTime += item.manualTime + item.walkTime;
        }
    });

    let frequencyMaxTime = 0;
    if (frequencyWorkItems && frequencyWorkItems.length > 0) {
        if (frequencyChartMode === 'converted') {
            // 換算時間モードの場合、全アイテムの影響時間の最大値を取得
            const impactTimes = frequencyWorkItems.flatMap(item => {
                const currentImpact = calculateFrequencyImpactWithFormula(item.workTime, item.frequency, 'current').impactTime;
                const improvedData = item.improved || { workTime: item.workTime, frequency: item.frequency };
                const improvedImpact = calculateFrequencyImpactWithFormula(improvedData.workTime, improvedData.frequency, 'improved').impactTime;
                return [currentImpact, improvedImpact];
            });
            frequencyMaxTime = Math.max(0, ...impactTimes);
        } else {
            // 実時間モードの場合
            const workTimes = frequencyWorkItems.flatMap(item => {
                const improvedWorkTime = item.improved ? item.improved.workTime : item.workTime;
                return [item.workTime, improvedWorkTime];
            });
            frequencyMaxTime = Math.max(0, ...workTimes);
        }
    }

    const currentTaktTime = taktTime || 36;
    
    // まとめづくりモード：表示基準タクトタイムはN×T/T
    const effectiveTaktTime = (batchMode && batchQuantity > 1) ? currentTaktTime * batchQuantity : currentTaktTime;
    
    // スライダーの最大値（自動調整ロジック）を計算
    const autoMaxValue = Math.max(frequencyMaxTime, effectiveTaktTime * 1.2, cycleTime * 1.2);

    let baseTime;
    switch (chartScaleMode) {
        case 'main':
            baseTime = Math.max(effectiveTaktTime * 1.2, cycleTime * 1.2);
            break;
        case 'frequency':
            baseTime = frequencyMaxTime > 0 ? frequencyMaxTime : effectiveTaktTime;
            break;
        case 'manual':
        default:
            baseTime = manualScaleValue; // スライダーの値を基準時間とする
            break;
    }

    if (!isFinite(baseTime) || baseTime <= 0) {
        baseTime = effectiveTaktTime;
    }
    
    // Nサイクル表示時は (サイクルタイムとT/Tの大きい方) × N を下限に確保
    const multiCycleMin = cycleCount >= 2
        ? Math.max(cycleTime, effectiveTaktTime) * cycleCount * 1.05
        : 0;
    const finalScale = Math.max(baseTime, effectiveTaktTime * 1.05, multiCycleMin);

    // スライダーの最大値もNサイクル時は拡張
    let extendedAutoMaxValue = autoMaxValue;
    if (cycleCount >= 2) {
        extendedAutoMaxValue = Math.max(autoMaxValue, Math.max(cycleTime, effectiveTaktTime) * cycleCount * 1.2);
    }

    return {
        maxTime: finalScale,
        standardWorkTotalTime: cycleTime,
        frequencyMaxTime: frequencyMaxTime,
        taktTime: currentTaktTime,
        baseTime: baseTime,
        mode: chartScaleMode,
        sliderMax: extendedAutoMaxValue // 拡張されたスライダーの最大値を返す
    };
}

// チャートスケールの切替処理

/**
 * チャートスケールの切替処理（修正版：安全なチャート更新）
 * @param {string} mode - スケールモード（'manual', 'main', 'frequency'）
 */
function switchChartScale(mode) {
    const previousMode = chartScaleMode;
    chartScaleMode = mode;
    
    // ボタンモードが選択された場合、スライダーの値もそのモードの基準値に更新
    if (mode === 'main' || mode === 'frequency') {
        const scaleInfo = calculateUnifiedScale();
        manualScaleValue = scaleInfo.maxTime;
    }
    
    // UIを更新
    if (typeof updateScaleUI === 'function') {
        updateScaleUI();
    }
    
    try {
        // ★修正：安全なチャート更新
        safeUpdateChart('main', () => {
            if (typeof updateChart === 'function') updateChart();
        });
        
        safeUpdateChart('frequency', () => {
            if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
        });
        
        safeUpdateChart('process', () => {
            if (typeof updateProcessChart === 'function') updateProcessChart();
        });
        
        triggerAutoSave();
    } catch (error) {
        chartScaleMode = previousMode;
        if (typeof updateScaleUI === 'function') {
            updateScaleUI();
        }
    }
}

// ========================================
// まとめづくり設定管理
// ========================================

/**
 * まとめづくり設定を更新（UIから呼び出し）
 */
function updateBatchSettings() {
    const quantityEl     = document.getElementById('batchQuantityInput');
    const indivEl        = document.getElementById('batchIndivLinesChk');
    const containerEl    = document.getElementById('batchSettingsContainer');
    const ttLabelEl      = document.getElementById('batchTTLabel');
    const ttValueEl      = document.getElementById('batchTTValue');
    const badgeEl        = document.getElementById('batchModeBadge');
    const ttRowEl        = document.getElementById('batchTTRow');

    if (!quantityEl) return;

    // 数値を検証（1以上の整数）
    const rawVal = parseInt(quantityEl.value, 10);
    batchQuantity = isNaN(rawVal) || rawVal < 1 ? 1 : Math.min(rawVal, 999);
    quantityEl.value = batchQuantity;

    // quantity が 2以上なら有効値をメモリに保存
    if (batchQuantity >= 2) {
        batchQuantityMemory = batchQuantity;
    }

    // batchMode は quantity から自動決定
    batchMode = (batchQuantity >= 2);

    // 数値入力スタイル切替（有効時はアクセント色）
    if (quantityEl) {
        quantityEl.classList.toggle('is-active', batchMode);
    }

    // バッジ更新
    if (badgeEl) {
        badgeEl.textContent = batchMode ? 'ON' : 'OFF';
        badgeEl.className   = 'batch-mode-badge ' + (batchMode ? 'batch-mode-on' : 'batch-mode-off');
    }

    // 追加設定コンテナ表示切替
    if (containerEl) {
        containerEl.style.display = batchMode ? 'block' : 'none';
    }

    // 描画T/T行の表示切替
    if (ttRowEl) {
        ttRowEl.style.display = batchMode ? 'block' : 'none';
    }

    // アコーディオン高さ再計算
    const batchSection = document.getElementById('batchProductionSection');
    if (batchSection) {
        const categoryContent = batchSection.querySelector('.category-content');
        if (categoryContent && categoryContent.classList.contains('active')) {
            categoryContent.style.maxHeight = '3000px';
        }
    }

    if (batchMode) {
        batchShowIndividualLines = indivEl ? indivEl.checked : true;
        const effectiveTime = taktTime * batchQuantity;
        if (ttLabelEl) ttLabelEl.textContent = `${batchQuantity}T/T`;
        if (ttValueEl) ttValueEl.textContent  = `= ${formatTimeDisplay(Math.round(effectiveTime))}`;
    }

    // スケール自動拡張（manualモードで不足する場合）
    if (batchMode && chartScaleMode === 'manual') {
        const requiredMin = taktTime * batchQuantity * 1.05;
        if (manualScaleValue < requiredMin) {
            manualScaleValue = Math.ceil(requiredMin);
            if (typeof updateScaleUI === 'function') updateScaleUI();
        }
    }

    safeUpdateChart('main', () => { if (typeof updateChart === 'function') updateChart(); });
    safeUpdateChart('frequency', () => { if (typeof updateFrequencyChart === 'function') updateFrequencyChart(); });
    triggerAutoSave();
}

/**
 * まとめづくり数値入力操作時の処理
 * - 1 → 自動でOFF、メモリは変更しない
 * - 2以上 → 自動でON、メモリを更新
 */
function onBatchInputChange() {
    updateBatchSettings();
}

/**
 * まとめ数を delta 分増減する（±ボタン用）
 * @param {number} delta - 変化量（+1 または -1）
 */
function adjustBatchQuantity(delta) {
    const quantityEl = document.getElementById('batchQuantityInput');
    if (!quantityEl) return;
    const current = parseInt(quantityEl.value, 10) || 1;
    const next = Math.max(1, Math.min(current + delta, 999));
    quantityEl.value = next;
    updateBatchSettings();
}

/**
 * マルチサイクル描画の設定を更新（UIから呼び出し）
 */
function updateDualCycleSettings() {
    const toggleEl = document.getElementById('multiCycleToggle');
    const countEl  = document.getElementById('cycleCountInput');
    const containerEl = document.getElementById('cycleCountContainer');

    if (!toggleEl) return;

    const enabled = toggleEl.checked;

    if (containerEl) containerEl.style.display = enabled ? 'block' : 'none';

    if (enabled) {
        const raw = countEl ? parseInt(countEl.value, 10) : 2;
        cycleCount = isNaN(raw) || raw < 2 ? 2 : Math.min(raw, 10);
        if (countEl) countEl.value = cycleCount;
    } else {
        cycleCount = 1;
    }

    /// Nサイクル ON時にスケールが不足していれば自動拡張
    if (cycleCount >= 2 && chartScaleMode === 'manual') {
        const ct = calculateTotalCycleTimeForMode(displayMode === 'improved' ? 'improved' : 'current');
        const tt = (typeof taktTime !== 'undefined' && taktTime > 0) ? taktTime : 36;
        const effectiveTT = (typeof batchMode !== 'undefined' && batchMode && typeof batchQuantity !== 'undefined' && batchQuantity > 1) ? tt * batchQuantity : tt;
        
        const requiredMin = Math.max(ct, effectiveTT) * cycleCount * 1.05;
        if (manualScaleValue < requiredMin) {
            manualScaleValue = Math.ceil(requiredMin);
            if (typeof updateScaleUI === 'function') updateScaleUI();
        }
    }

    syncScaleControlsDisabledState();
    _updateCycleCountBadge();

    safeUpdateChart('main', () => { if (typeof updateChart === 'function') updateChart(); });
    triggerAutoSave();
}

/**
 * サイクル数入力変更時の処理（countInputのonchangeから呼び出し）
 */
function onCycleCountInputChange() {
    const toggleEl = document.getElementById('multiCycleToggle');
    if (!toggleEl || !toggleEl.checked) return;
    updateDualCycleSettings();
}

/** バッジ表示を更新 */
function _updateCycleCountBadge() {
    const badge = document.getElementById('cycleCountBadge');
    if (!badge) return;
    if (cycleCount >= 2) {
        badge.textContent = `${cycleCount}サイクル`;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

/**
 * マルチサイクルUIを現在の状態に同期（データロード時）
 */
function syncDualCycleUI() {
    const toggleEl = document.getElementById('multiCycleToggle');
    const countEl  = document.getElementById('cycleCountInput');
    const containerEl = document.getElementById('cycleCountContainer');

    const enabled = cycleCount >= 2;
    if (toggleEl) toggleEl.checked = enabled;
    if (containerEl) containerEl.style.display = enabled ? 'block' : 'none';
    if (countEl && enabled) countEl.value = cycleCount;

    _updateCycleCountBadge();
    syncScaleControlsDisabledState();
}

/**
 * クイック選択ボタンからサイクル数を直接設定
 * @param {number} n - 設定するサイクル数
 */
function setCycleCount(n) {
    const toggleEl = document.getElementById('multiCycleToggle');
    const countEl  = document.getElementById('cycleCountInput');
    if (!toggleEl) return;
    toggleEl.checked = true;
    if (countEl) countEl.value = n;
    updateDualCycleSettings();
}

// ===================================================
// 線スタイル設定 関数群
// ===================================================

/**
 * 線スタイルの1プロパティを更新してチャートを再描画
 * @param {string} key  - 'taktTime' | 'currentCT' | 'improvedCT'
 * @param {string} prop - 'color' | 'width' | 'dash'
 * @param {*}      val  - 設定値
 */
// ── 現在ポップオーバーで編集中の線キー ──────────────────────────────
let _currentLSKey = null;

// ── パレットカラー定義 ────────────────────────────────────────────────
const LS_PALETTE_COLORS = [
    { hex: '#dc2626', label: '赤'     },
    { hex: '#1f2937', label: '黒'     },
    { hex: '#2563eb', label: '青'     },
    { hex: '#16a34a', label: '緑'     },
    { hex: '#d97706', label: '橙'     },
    { hex: '#7c3aed', label: '紫'     },
    { hex: '#64748b', label: 'グレー' },
];

/** 線スタイルの1プロパティを更新してチャートを再描画 */
function updateLineStyle(key, prop, val) {
    if (!lineStyles[key]) return;
    lineStyles[key][prop] = val;
    _updateLineStylePreview(key);
    _syncRowSwatch(key);
    // ポップオーバーが該当キーで開いていれば内部UIも更新
    if (_currentLSKey === key) _syncPopoverUI(key);
    safeUpdateChart('main', () => { if (typeof updateChart === 'function') updateChart(); });
    triggerAutoSave();
}

/** 線スタイル設定をUIに全同期（データロード時等） */
function syncLineStylesUI() {
    ['taktTime', 'currentCT', 'improvedCT'].forEach(key => {
        _updateLineStylePreview(key);
        _syncRowSwatch(key);
    });
    if (_currentLSKey) _syncPopoverUI(_currentLSKey);
}

/** 行のスウォッチ色だけ更新 */
function _syncRowSwatch(key) {
    const el = document.getElementById(`ls-row-swatch-${key}`);
    if (el) el.style.background = lineStyles[key].color;
}

/** プレビューCanvasを描画 */
function _updateLineStylePreview(key) {
    const canvas = document.getElementById(`ls-preview-${key}`);
    if (!canvas) return;
    const s    = lineStyles[key];
    const c    = canvas.getContext('2d');
    const dpr  = window.devicePixelRatio || 1;
    const w    = canvas.offsetWidth  || 120;
    const h    = canvas.offsetHeight || 18;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.strokeStyle = s.color;
    c.lineWidth   = Math.min(s.width, 6) * dpr;
    c.setLineDash((LINE_DASH_PATTERNS[s.dash] || []).map(v => v * dpr));
    c.lineCap = 'round';
    const y = canvas.height / 2;
    c.beginPath();
    c.moveTo(8 * dpr, y);
    c.lineTo((w - 8) * dpr, y);
    c.stroke();
    c.restore();
}

/** ポップオーバー内UIをキーの状態に同期 */
function _syncPopoverUI(key) {
    const s = lineStyles[key];
    // タイトル
    const labels = { taktTime:'T/T線', currentCT:'改善前 C/T線', improvedCT:'改善後 C/T線' };
    const titleEl = document.getElementById('lsPopTitle');
    if (titleEl) titleEl.textContent = labels[key] || key;
    // 色スウォッチ
    const swatchEl = document.getElementById('lsPopSwatch');
    if (swatchEl) swatchEl.style.background = s.color;
    const pickerEl = document.getElementById('lsPopColorInput');
    if (pickerEl) pickerEl.value = s.color;
    // パレット selected 状態
    document.querySelectorAll('#lsPopPalette .ls-ps').forEach(el => {
        el.classList.toggle('ls-ps--sel', el.dataset.color === s.color);
    });
    // 線種 active
    document.querySelectorAll('#lsPopDashGroup .ls-db').forEach(btn => {
        btn.classList.toggle('ls-db--active', btn.dataset.dash === s.dash);
    });
    // 太さ
    const wDisp = document.getElementById('lsPopWidthDisplay');
    const wSlider = document.getElementById('lsPopWidthSlider');
    if (wDisp)   wDisp.textContent   = s.width + 'px';
    if (wSlider) {
        wSlider.value = s.width;
        // スライダーの塗り位置をCSS変数で更新（1〜8の範囲）
        const pct = ((s.width - 1) / 7 * 100).toFixed(1) + '%';
        wSlider.style.setProperty('--val', pct);
        wSlider.style.background = `linear-gradient(to right, #6366f1 0%, #6366f1 ${pct}, #d1d5db ${pct})`;
    }
}

/**
 * 線スタイルポップオーバーを開く
 * @param {string} key - 'taktTime'|'currentCT'|'improvedCT'
 * @param {HTMLElement} triggerEl - 開くトリガーボタン
 */
function openLineStylePopup(key, triggerEl) {
    // 同じキーで既に開いていれば閉じる（トグル）
    if (_currentLSKey === key && document.getElementById('lsPopover')?.style.display !== 'none') {
        closeLineStylePopup();
        return;
    }
    _currentLSKey = key;
    const pop = document.getElementById('lsPopover');
    if (!pop) return;

    // ポップオーバー内UIを構築（初回のみ生成、以後は内容を差し替え）
    _buildPopoverContent(key);
    _syncPopoverUI(key);
    pop.style.display = 'block';

    // 位置計算：トリガーボタンを基準にパネル右端に固定配置
    const rect = triggerEl.getBoundingClientRect();
    const popW = 240;
    let left = rect.right + 6;
    let top  = rect.top - 8;
    // 画面からはみ出ないよう調整
    if (left + popW > window.innerWidth - 8) left = rect.left - popW - 6;
    if (top + pop.offsetHeight > window.innerHeight - 8) top = window.innerHeight - pop.offsetHeight - 8;
    if (top < 8) top = 8;
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';

    // ポップオーバー外クリックで閉じる（次イベントループで登録）
    setTimeout(() => {
        document.addEventListener('mousedown', _lsPopOutsideHandler);
    }, 0);
}

function closeLineStylePopup() {
    const pop = document.getElementById('lsPopover');
    if (pop) pop.style.display = 'none';
    _currentLSKey = null;
    document.removeEventListener('mousedown', _lsPopOutsideHandler);
}

function _lsPopOutsideHandler(e) {
    const pop = document.getElementById('lsPopover');
    if (pop && !pop.contains(e.target)) closeLineStylePopup();
}

/** ポップオーバー内コンテンツを構築（初回のみ再生成） */
function _buildPopoverContent(key) {
    const pop = document.getElementById('lsPopover');
    if (!pop) return;
    // 既にビルド済みならスキップ（以後は _syncPopoverUI で差し替えるだけ）
    if (pop.dataset.built === '1') return;
    pop.dataset.built = '1';

    const colors = LS_PALETTE_COLORS.map(c =>
        `<button class="ls-ps" data-color="${c.hex}" title="${c.label}"
            style="background:${c.hex}"
            onclick="updateLineStyle(_currentLSKey,'color','${c.hex}')"></button>`
    ).join('');

    const dashDefs = [
        { k:'solid',    title:'実線',    d:'' },
        { k:'dashed',   title:'破線',    d:'6,4' },
        { k:'dotted',   title:'点線',    d:'2,4' },
        { k:'dash-dot', title:'一点鎖線',d:'8,3,2,3' },
    ];
    const dashBtns = dashDefs.map(dd =>
        `<button class="ls-db" data-dash="${dd.k}" title="${dd.title}"
            onclick="updateLineStyle(_currentLSKey,'dash','${dd.k}')">
            <svg width="28" height="8" viewBox="0 0 28 8">
                <line x1="1" y1="4" x2="27" y2="4" stroke="currentColor" stroke-width="2"
                    ${dd.d ? `stroke-dasharray="${dd.d}"` : ''} stroke-linecap="round"/>
            </svg>
        </button>`
    ).join('');

    pop.innerHTML = `
        <div class="ls-pop-header">
            <span id="lsPopTitle" class="ls-pop-title">T/T線</span>
            <button class="ls-pop-close" onclick="closeLineStylePopup()" title="閉じる">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="ls-pop-body">
            <div class="ls-pop-label">色</div>
            <div class="ls-pop-color-row">
                <button class="ls-pop-swatch-btn" id="lsPopSwatch" title="カスタムカラー"
                    onclick="document.getElementById('lsPopColorInput').click()">
                    <input type="color" id="lsPopColorInput" class="ls-hidden-picker"
                        oninput="updateLineStyle(_currentLSKey,'color',this.value)"
                        onchange="updateLineStyle(_currentLSKey,'color',this.value)">
                </button>
                <div class="ls-pop-palette" id="lsPopPalette">${colors}</div>
            </div>
            <div class="ls-pop-label" style="margin-top:10px;">線種</div>
            <div class="ls-pop-dash-group" id="lsPopDashGroup">${dashBtns}</div>
            <div class="ls-pop-label" style="margin-top:10px;">太さ</div>
            <div class="ls-pop-width-row">
                <button class="ls-pop-w-btn" onclick="(function(){var v=Math.max(1,+document.getElementById('lsPopWidthSlider').value-0.5);updateLineStyle(_currentLSKey,'width',v)})()">
                    <i class="fas fa-minus"></i>
                </button>
                <input type="range" id="lsPopWidthSlider" min="1" max="8" step="0.5" value="3"
                    class="ls-pop-slider"
                    oninput="(function(el){var p=((el.value-1)/7*100).toFixed(1)+'%';el.style.background='linear-gradient(to right,#6366f1 0%,#6366f1 '+p+',#d1d5db '+p+')';updateLineStyle(_currentLSKey,'width',parseFloat(el.value))})(this)">
                <button class="ls-pop-w-btn" onclick="(function(){var v=Math.min(8,+document.getElementById('lsPopWidthSlider').value+0.5);updateLineStyle(_currentLSKey,'width',v)})()">
                    <i class="fas fa-plus"></i>
                </button>
                <span id="lsPopWidthDisplay" class="ls-pop-w-display">3px</span>
            </div>
        </div>
        <div class="ls-pop-footer">
            <button class="ls-pop-reset-btn" onclick="resetCurrentLineStyle()" title="この線をデフォルトに戻す">
                <i class="fas fa-rotate-left"></i>この線をリセット
            </button>
        </div>`;
}

/** 現在編集中の線のみデフォルトに戻す */
function resetCurrentLineStyle() {
    if (!_currentLSKey) return;
    lineStyles[_currentLSKey] = JSON.parse(JSON.stringify(LINE_STYLE_DEFAULTS[_currentLSKey]));
    _updateLineStylePreview(_currentLSKey);
    _syncRowSwatch(_currentLSKey);
    _syncPopoverUI(_currentLSKey);
    safeUpdateChart('main', () => { if (typeof updateChart === 'function') updateChart(); });
    triggerAutoSave();
}

/** 全線スタイルをデフォルトにリセット */
function resetLineStyles() {
    lineStyles = JSON.parse(JSON.stringify(LINE_STYLE_DEFAULTS));
    syncLineStylesUI();
    safeUpdateChart('main', () => { if (typeof updateChart === 'function') updateChart(); });
    triggerAutoSave();
}


function syncBatchUI() {
    const quantityEl     = document.getElementById('batchQuantityInput');
    const indivEl        = document.getElementById('batchIndivLinesChk');
    const containerEl    = document.getElementById('batchSettingsContainer');
    const ttLabelEl      = document.getElementById('batchTTLabel');
    const ttValueEl      = document.getElementById('batchTTValue');
    const badgeEl        = document.getElementById('batchModeBadge');
    const ttRowEl        = document.getElementById('batchTTRow');

    if (quantityEl) {
        quantityEl.value = batchQuantity;
        quantityEl.classList.toggle('is-active', batchMode);
    }
    if (containerEl) containerEl.style.display = batchMode ? 'block' : 'none';
    if (ttRowEl) ttRowEl.style.display = batchMode ? 'block' : 'none';
    if (indivEl) indivEl.checked = batchShowIndividualLines;

    if (badgeEl) {
        badgeEl.textContent = batchMode ? 'ON' : 'OFF';
        badgeEl.className   = 'batch-mode-badge ' + (batchMode ? 'batch-mode-on' : 'batch-mode-off');
    }

    if (batchMode) {
        const effectiveTime = taktTime * batchQuantity;
        if (ttLabelEl) ttLabelEl.textContent = `${batchQuantity}T/T`;
        if (ttValueEl) ttValueEl.textContent  = `= ${formatTimeDisplay(Math.round(effectiveTime))}`;
    }
}



// ========================================
// Enhanced Schedule Management Functions (横方向積み上げグラフ対応)
// ========================================

/**
 * 稼働時間設定を更新（修正版：安全なチャート更新）
 */
function updateScheduleConfig() {
    
    const startTime = document.getElementById('scheduleStartTime').value;
    const workHours = parseFloat(document.getElementById('scheduleWorkHours').value) || 8;
    
    scheduleConfig.startTime = startTime;
    scheduleConfig.workHours = workHours;
    
    // 基本終了時間を計算
    if (startTime) {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        let totalMinutes = startHour * 60 + startMinute + (workHours * 60);
        
        // 非稼働時間（休憩、朝礼、清掃、段替、チョコ停、手待ち）を含む総時間を計算
        const nonWorkingTime = calculateTotalNonWorkingTime();
        totalMinutes += nonWorkingTime;
        
        const endHour = Math.floor(totalMinutes / 60) % 24;
        const endMinute = totalMinutes % 60;
        
        scheduleConfig.endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
        
    } else {
        scheduleConfig.endTime = '';
    }
    
    // 表示を更新
    const scheduleEndTimeDisplay = document.getElementById('scheduleEndTimeDisplay');
    if (scheduleEndTimeDisplay) {
        scheduleEndTimeDisplay.textContent = scheduleConfig.endTime || '未設定';
    }
    
    // 稼働時間も更新（分単位）
    const operatingTimeElement = document.getElementById('operatingTime');
    if (operatingTimeElement) {
        const operatingTimeMinutes = workHours * 60;
        operatingTimeElement.value = operatingTimeMinutes;
    }
    
    // 各種時間を計算
    updateWorkingTimeDisplay();
    
    // タクトタイムを再計算（警告バナーは表示しない）
    calculateTaktTime(false);
    
    // ★修正：安全なチャート更新
    safeUpdateChart('schedule', () => {
        if (typeof updateScheduleChart === 'function') {
            updateScheduleChart();
        } else {
            console.error('updateScheduleChart function not available');
        }
    });
    
    // メインチャートも更新（タクトタイム変更の影響があるため）
    safeUpdateChart('main', () => {
        if (typeof updateChart === 'function') {
            updateChart();
        }
    });
    
    // 頻度作業チャートも更新（タクトタイム線の位置変更）
    safeUpdateChart('frequency', () => {
        if (typeof updateFrequencyChart === 'function') {
            updateFrequencyChart();
        }
    });
    
    // オートセーブを実行
    triggerAutoSave();
}


/**
 * 非稼働時間を計算（指定タイプの合計）
 * @param {Array} types - 時間帯タイプの配列
 * @returns {number} - 非稼働時間（分）
 */
function calculateNonWorkingTime(types) {
    let totalMinutes = 0;
    
    const sortedTimeSlots = [...timeSlots]
        .filter(slot => types.includes(slot.type))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    
    // 重複する時間帯をマージして計算
    const mergedSlots = mergeOverlappingTimeSlots(sortedTimeSlots);
    
    mergedSlots.forEach(slot => {
        const duration = calculateTimeDurationInMinutes(slot.startTime, slot.endTime);
        totalMinutes += duration;
    });
    
    return totalMinutes;
}

/**
 * 各種稼働時間を計算して表示（強化版：カード表示対応）
 */
function updateWorkingTimeDisplay() {
    const workingTimeInfo = calculateWorkingTime();
   
    // 稼働時間設定表示も更新 (ui-manager.js の関数があれば呼び出す)
    if (typeof updateScheduleConfigDisplay === 'function') {
        updateScheduleConfigDisplay();
    }
}

/**
 * 実稼働時間を計算（強化版：正味時間・可動率対応）
 */
function calculateWorkingTime() {
    if (!scheduleConfig.startTime || !scheduleConfig.workHours) {
        return { 
            totalMinutes: 0, 
            workingMinutes: 0, 
            nonWorkingMinutes: 0,
            netWorkingMinutes: 0,
            netProductionMinutes: 0
        };
    }
    
    const totalMinutes = scheduleConfig.workHours * 60;
    
    // 非稼働時間（休憩、朝礼、清掃）
    const nonWorkingMinutes = calculateNonWorkingTime(['break', 'meeting', 'cleaning']);
    
    // 段替時間
    const setupChangeMinutes = calculateNonWorkingTime(['setup']);
    
    // チョコ停・手待ち時間
    const lossMinutes = calculateNonWorkingTime(['chokotei', 'wait_time']);
    
    // 稼働時間 = 所定就業時間 - 休憩 - 朝礼 - 清掃
    const workingMinutes = Math.max(0, totalMinutes - nonWorkingMinutes);
    
    // 正味稼働時間 = 稼働時間 - 段替
    const netWorkingMinutes = Math.max(0, workingMinutes - setupChangeMinutes);
    
    // 正味生産時間 = 正味稼働時間 - チョコ停 - 手待ち
    const netProductionMinutes = Math.max(0, netWorkingMinutes - lossMinutes);
    
    return { 
        totalMinutes, 
        workingMinutes, 
        nonWorkingMinutes,
        netWorkingMinutes,
        netProductionMinutes
    };
}

/**
 * 時間文字列を分に変換
 * @param {string} timeStr - 時間文字列 (HH:MM)
 * @returns {number} - 分
 */
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * 分を時間文字列に変換
 * @param {number} minutes - 分
 * @returns {string} - 時間文字列 (HH:MM)
 */
function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60) % 24;
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * 重複する時間帯をマージ
 * @param {Array} timeSlots - ソート済み時間帯配列
 * @returns {Array} - マージされた時間帯配列
 */
function mergeOverlappingTimeSlots(timeSlots) {
    if (timeSlots.length === 0) return [];
    
    const merged = [];
    let currentSlot = { ...timeSlots[0] };
    
    for (let i = 1; i < timeSlots.length; i++) {
        const nextSlot = timeSlots[i];
        const currentEnd = timeToMinutes(currentSlot.endTime);
        const nextStart = timeToMinutes(nextSlot.startTime);
        const nextEnd = timeToMinutes(nextSlot.endTime);
        
        if (nextStart <= currentEnd) {
            // 重複している場合はマージ
            currentSlot.endTime = minutesToTime(Math.max(currentEnd, nextEnd));
        } else {
            // 重複していない場合は現在のスロットを追加
            merged.push(currentSlot);
            currentSlot = { ...nextSlot };
        }
    }
    
    merged.push(currentSlot);
    return merged;
}

/**
 * 時間の長さを計算（分単位）
 * @param {string} startTime - 開始時間 (HH:MM)
 * @param {string} endTime - 終了時間 (HH:MM)
 * @returns {number} - 分数
 */
function calculateTimeDurationInMinutes(startTime, endTime) {
    const startMinutes = timeToMinutes(startTime);
    let endMinutes = timeToMinutes(endTime);
    
    // 翌日にまたがる場合の処理
    if (endMinutes < startMinutes) {
        endMinutes += 24 * 60;
    }
    
    return endMinutes - startMinutes;
}

/**
 * 全非稼働時間を計算（すべてのタイプを含む）
 * @returns {number} - 非稼働時間（分）
 */
function calculateTotalNonWorkingTime() {
    if (!timeSlots || timeSlots.length === 0) {
        return 0;
    }
    
    let totalMinutes = 0;
    
    // 全時間帯をソートして重複を処理
    const sortedTimeSlots = [...timeSlots]
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    
    // 重複する時間帯をマージして計算
    const mergedSlots = mergeOverlappingTimeSlots(sortedTimeSlots);
    
    mergedSlots.forEach(slot => {
        const duration = calculateTimeDurationInMinutes(slot.startTime, slot.endTime);
        totalMinutes += duration;
    });
    
    return totalMinutes;
}


/**
 * 表示範囲を計算（修正版：稼働時間と時間帯を含む範囲の前後1時間で表示）
 */
function calculateDisplayRange() {
    if (scheduleConfig.startTime && scheduleConfig.workHours) {
        // 実際の稼働時間範囲を計算
        const workStartMinutes = timeToMinutes(scheduleConfig.startTime);
        const workDurationMinutes = scheduleConfig.workHours * 60;
        let workEndMinutes = workStartMinutes + workDurationMinutes;
        
        // 非稼働時間による終了時間延長を含める
        const totalNonWorkingMinutes = calculateTotalNonWorkingTime();
        const actualEndMinutes = workStartMinutes + workDurationMinutes + totalNonWorkingMinutes;
        
        // 時間帯がある場合の範囲拡張をチェック
        let overallStartMinutes = workStartMinutes;
        let overallEndMinutes = actualEndMinutes;
        
        if (timeSlots && timeSlots.length > 0) {
            // 全時間帯の開始・終了時間を取得
            const timeSlotBounds = timeSlots.map(slot => {
                const startMinutes = timeToMinutes(slot.startTime);
                const endMinutes = timeToMinutes(slot.endTime);
                
                // 翌日にまたがる場合の処理
                const adjustedEndMinutes = endMinutes < startMinutes ? endMinutes + 24 * 60 : endMinutes;
                
                return {
                    start: startMinutes,
                    end: adjustedEndMinutes
                };
            });
            
            // 時間帯を含めた全体範囲を計算
            const earliestTimeSlotStart = Math.min(...timeSlotBounds.map(bound => bound.start));
            const latestTimeSlotEnd = Math.max(...timeSlotBounds.map(bound => bound.end));
            
            // 稼働時間範囲と時間帯範囲を統合
            overallStartMinutes = Math.min(overallStartMinutes, earliestTimeSlotStart);
            overallEndMinutes = Math.max(overallEndMinutes, latestTimeSlotEnd);
        }
        
        // 仕様通り：統合範囲の前後1時間を描画範囲とする
        let displayStartMinutes = overallStartMinutes - 60;
        let displayEndMinutes = overallEndMinutes + 60;
        
        // 24時間制限内に収める
        displayStartMinutes = Math.max(0, displayStartMinutes);
        displayEndMinutes = Math.min(24 * 60, displayEndMinutes);
        
        // 最小表示幅を保証（4時間以上）
        const minDisplayMinutes = 4 * 60;
        const currentDisplayMinutes = displayEndMinutes - displayStartMinutes;
        
        if (currentDisplayMinutes < minDisplayMinutes) {
            const additionalMinutes = minDisplayMinutes - currentDisplayMinutes;
            const halfAdditional = Math.floor(additionalMinutes / 2);
            
            // 両端に均等に追加
            displayStartMinutes = Math.max(0, displayStartMinutes - halfAdditional);
            displayEndMinutes = Math.min(24 * 60, displayEndMinutes + (additionalMinutes - halfAdditional));
            
            // まだ不足している場合は片側に追加
            const remainingShortage = minDisplayMinutes - (displayEndMinutes - displayStartMinutes);
            if (remainingShortage > 0) {
                if (displayStartMinutes > 0) {
                    displayStartMinutes = Math.max(0, displayStartMinutes - remainingShortage);
                } else if (displayEndMinutes < 24 * 60) {
                    displayEndMinutes = Math.min(24 * 60, displayEndMinutes + remainingShortage);
                }
            }
        }
        
        const totalMinutes = displayEndMinutes - displayStartMinutes;
        
        return {
            startMinutes: displayStartMinutes,
            totalMinutes: totalMinutes,
            endMinutes: displayEndMinutes,
            // 実際の稼働範囲を保持
            actualStartMinutes: workStartMinutes,
            actualEndMinutes: actualEndMinutes,
            // 設定上の基本範囲も保持
            configWorkingMinutes: scheduleConfig.workHours * 60,
            fullDay: false
        };
    } else {
        // 開始時刻が指定されていない場合は1日表示
        return {
            startMinutes: 0,
            totalMinutes: 24 * 60, // 1440分
            endMinutes: 24 * 60,
            actualStartMinutes: 0,
            actualEndMinutes: 24 * 60,
            configWorkingMinutes: 0,
            fullDay: true
        };
    }
}

/**
 * 時間帯を追加
 */
function addTimeSlot() {
    openTimeSlotModal();
}

/**
 * 時間帯をリセット
 */
function resetSchedule() {
    if (confirm('すべての時間帯設定をリセットしますか？\n\nこの操作は取り消せません。')) {
        timeSlots = [];
        scheduleConfig = {
            startTime: '',
            workHours: 8,
            endTime: ''
        };
        
        // フォームもリセット
        document.getElementById('scheduleStartTime').value = '';
        document.getElementById('scheduleWorkHours').value = '8';
        document.getElementById('scheduleEndTimeDisplay').textContent = '未設定';
        
        updateWorkingTimeDisplay();
        updateScheduleChart();
        updateTimeSlotList();
        triggerAutoSave();
        
        showNotificationBanner('稼働時間設定をリセットしました。', 'success', 2000);
    }
}

/**
 * 全時間帯を削除
 */
function clearAllTimeSlots() {
    if (confirm('すべての時間帯を削除しますか？\n\nこの操作は取り消せません。')) {
        timeSlots = [];
        updateWorkingTimeDisplay();
        updateScheduleChart();
        updateTimeSlotList();
        triggerAutoSave();
        showNotificationBanner('すべての時間帯を削除しました。', 'success', 2000);
    }
}

/**
 * 時間帯リストを更新（アコーディオン対応版）
 */
function updateTimeSlotList() {
    const listContainer = document.getElementById('timeSlotList');
    
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (timeSlots.length === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">時間帯が設定されていません</div>';
    } else {
        // 開始時間順でソート
        const sortedTimeSlots = [...timeSlots].sort((a, b) => {
            const timeA = a.startTime.replace(':', '');
            const timeB = b.startTime.replace(':', '');
            return timeA.localeCompare(timeB);
        });
        
        sortedTimeSlots.forEach(slot => {
            const item = document.createElement('div');
            item.className = 'time-slot-item';
            item.onclick = () => openTimeSlotModal(slot.id);
            
            const duration = calculateTimeDurationInMinutes(slot.startTime, slot.endTime);
            
            item.innerHTML = `
                <div class="time-slot-type-indicator ${slot.type}"></div>
                <div class="time-slot-content">
                    <div class="time-slot-name">${slot.name}</div>
                    <div class="time-slot-details">
                        <div class="time-slot-time">
                            <i class="fas fa-clock"></i>
                            ${slot.startTime} - ${slot.endTime} (${Math.floor(duration / 60)}h${duration % 60}m)
                        </div>
                        <div class="time-slot-type">
                            <i class="fas fa-tag"></i>
                            ${getTimeSlotTypeLabel(slot.type)}
                        </div>
                    </div>
                </div>
            `;
            
            listContainer.appendChild(item);
        });
    }

    // ★★★ アコーディオンの高さ調整ロジックを追加 ★★★
    const wrapper = listContainer.closest('.category-content-wrapper');
    if (wrapper) {
        const parentContent = wrapper.parentElement;
        if (parentContent && parentContent.classList.contains('active')) {
            requestAnimationFrame(() => {
                parentContent.style.maxHeight = wrapper.scrollHeight + 'px';
            });
        }
    }
}

/**
 * 時間帯タイプのラベルを取得（強化版：新タイプ対応）
 * @param {string} type - 時間帯タイプ
 * @returns {string} - ラベル
 */
function getTimeSlotTypeLabel(type) {
    const labels = {
        break: '休憩',
        meeting: '朝礼',
        inspection: '点検',
        cleaning: '清掃',
        setup: '段替',
        chokotei: 'チョコ停',
        wait_time: '手待ち',
        other: 'その他'
    };
    return labels[type] || 'その他';
}

/**
 * 稼働時間チャート更新（修正版：初期化状態チェック強化）
 */
function updateScheduleChart() {
    safeUpdateChart('schedule', () => {
        if (!scheduleCanvas || !scheduleCtx) return;
        
        // キャンバス高さを調整
        adjustScheduleCanvasHeight();
        
        // チャートを描画
        drawScheduleChart();
    });
}

/**
 * 稼働時間チャートキャンバス高さを調整（凡例表示対応版）
 */
function adjustScheduleCanvasHeight() {
    if (!scheduleCanvas) return;
    
    // 基本的な要素の高さを計算
    const titleHeight = 60;        // タイトル部分
    const chartHeight = SCHEDULE_BAR_HEIGHT; // チャート本体
    const topMargin = SCHEDULE_TOP_MARGIN;
    const legendHeight = 120;      // 凡例部分（2行分）
    const bottomPadding = 20;      // 下部余白
    
    // 必要な総高さを計算
    const requiredHeight = titleHeight + topMargin + chartHeight + legendHeight + bottomPadding;
    
    // 現在の高さと比較して調整が必要かチェック
    const devicePixelRatio = window.devicePixelRatio || 1;
    const currentDisplayHeight = scheduleCanvas.height / devicePixelRatio;
    
    if (Math.abs(currentDisplayHeight - requiredHeight) > 10) {
        scheduleCanvasHeight = requiredHeight;
        updateHighDPICanvas(scheduleCanvas, scheduleCtx, scheduleCanvasWidth, scheduleCanvasHeight);
        updateScheduleChart();
    }
}

/**
 * 作業配分表の表示モードを切り替え（併記分離モード対応版）
 * @param {string} mode - 表示モード ('current', 'improved', 'both-grouped', 'both-separated')
 */
function switchDistributionMode(mode) {
    // 旧併記モード'both'を'both-grouped'にマップ（後方互換性）
    if (mode === 'both') {
        mode = 'both-grouped';
    }
    
    distributionDisplayMode = mode;

    // チャートを再描画
    if (typeof adjustDistributionCanvasWidth === 'function') adjustDistributionCanvasWidth();
    updateDistributionChart();

    // 状態メッセージの表示
    const modeNames = {
        'current': '改善前',
        'improved': '改善後',
        'both-grouped': '併記（グループ）',
        'both-separated': '併記（分離）'
    };

    const modeName = modeNames[mode] || mode;
    showNotificationBanner(`作業配分表の表示モードを「${modeName}」に変更しました。`, 'info', 2000);
}

// ========================================
// 作業配分表 独立トグルボタン制御
// ========================================

/**
 * 改善前 / 改善後 トグルボタンの ON/OFF を切り替え、
 * 表示モードを決定して switchDistributionMode を呼ぶ。
 * 両方 OFF になる操作は無効（最低1つは必ずON）。
 * @param {'current'|'improved'} type
 */
function toggleDistributionButton(type) {
    const currentBtn  = document.getElementById('distCurrentToggle');
    const improvedBtn = document.getElementById('distImprovedToggle');
    if (!currentBtn || !improvedBtn) return;

    const wasCurrent  = currentBtn.classList.contains('active');
    const wasImproved = improvedBtn.classList.contains('active');

    // 両方 OFF になる操作はキャンセル
    if (type === 'current'  && wasCurrent  && !wasImproved) return;
    if (type === 'improved' && wasImproved && !wasCurrent)  return;

    if (type === 'current')  currentBtn.classList.toggle('active');
    else                     improvedBtn.classList.toggle('active');

    const isCurrent  = currentBtn.classList.contains('active');
    const isImproved = improvedBtn.classList.contains('active');

    const combinedPanel = document.getElementById('distributionCombinedMode');
    const switchEl      = document.getElementById('combinedModeSwitch');

    if (isCurrent && isImproved) {
        // 両方ON → 併記パネルを表示し、スイッチ状態でサブモードを決定
        if (combinedPanel) combinedPanel.style.display = 'flex';
        switchDistributionMode(switchEl && switchEl.checked ? 'both-separated' : 'both-grouped');
    } else {
        // 片方のみON → 併記パネルを非表示
        if (combinedPanel) combinedPanel.style.display = 'none';
        switchDistributionMode(isCurrent ? 'current' : 'improved');
    }
}

/**
 * 併記サブモードスイッチの切替
 * @param {HTMLInputElement} switchEl
 */
function toggleCombinedMode(switchEl) {
    switchDistributionMode(switchEl.checked ? 'both-separated' : 'both-grouped');
}

/**
 * distributionDisplayMode の値を新 UI に反映する（データ復元時などに使用）
 */
function syncDistributionModeUI() {
    const currentBtn    = document.getElementById('distCurrentToggle');
    const improvedBtn   = document.getElementById('distImprovedToggle');
    const combinedPanel = document.getElementById('distributionCombinedMode');
    const switchEl      = document.getElementById('combinedModeSwitch');
    if (!currentBtn || !improvedBtn) return;

    const mode = distributionDisplayMode || 'current';
    const isBoth = mode === 'both-grouped' || mode === 'both-separated';

    currentBtn.classList.toggle('active',  mode === 'current'  || isBoth);
    improvedBtn.classList.toggle('active', mode === 'improved' || isBoth);

    if (combinedPanel) combinedPanel.style.display = isBoth ? 'flex' : 'none';
    if (switchEl)      switchEl.checked = (mode === 'both-separated');
}

// ========================================
// Frequency Work Management Functions (新規：頻度作業管理)
// ========================================

/**
 * 頻度作業を追加
 */
function addFrequencyWork() {
    try {
        openFrequencyWorkModal();
    } catch (error) {
        console.error('Error opening frequency work modal:', error);
    }
}

/**
 * 頻度作業リストを更新
 */
function updateFrequencyWorkList() {
    const listContainer = document.getElementById('frequencyWorkList');
    
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (frequencyWorkItems.length === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">頻度作業が設定されていません</div>';
        return;
    }
    
    frequencyWorkItems.forEach(work => {
        const item = document.createElement('div');
        item.className = 'frequency-work-item';
        item.onclick = () => openFrequencyWorkModal(work.id);
        
        // 頻度オブジェクトを整形された文字列に変換するヘルパー関数
        const formatFrequency = (freq) => {
            if (!freq) return 'N/A';
            // 後方互換性：古い文字列形式のデータも表示可能にする
            if (typeof freq === 'string') {
                return freq;
            }

            if (freq.type === 'count') {
                return `${freq.value || ''}回に1回`;
            }
            if (freq.type === 'time') {
                const unitLabels = { d: '日', h: '時間', m: '分', s: '秒' };
                return `${freq.value || ''}${unitLabels[freq.unit] || '単位'}に1回`;
            }
            return 'N/A';
        };

        const formattedFrequency = formatFrequency(work.frequency);
        
        item.innerHTML = `
            <div class="frequency-work-content">
                <div class="frequency-work-name">${work.name}</div>
                <div class="frequency-work-details">
                    <div class="frequency-work-time">
                        <i class="fas fa-clock"></i>
                        ${formatTimeDisplay(work.workTime)}
                    </div>
                    <div class="frequency-work-frequency">
                        <i class="fas fa-redo-alt"></i>
                        ${formattedFrequency}
                    </div>
                </div>
            </div>
        `;
        
        listContainer.appendChild(item);
    });
}


/**
 * 頻度作業チャートのマウス移動処理（高解像度対応版）
 */
function handleFrequencyCanvasMouseMove(event) {
    // 右クリックメニューが表示されている場合はツールチップを出さない
    const contextMenu = document.getElementById('chartContextMenu');
    if (contextMenu && contextMenu.style.display === 'block') {
        hideDynamicTooltip();
        return;
    }

    // 高解像度対応の座標取得
    const pos = getCanvasMousePosition(frequencyCanvas, event);
    const x = pos.x;
    const y = pos.y;
    
    // 行インデックスを計算
    const relativeY = y - FREQUENCY_TOP_MARGIN;
    let newHoveredRowIndex = -1;
    
    if (relativeY >= 0 && relativeY <= frequencyWorkItems.length * FREQUENCY_ROW_HEIGHT) {
        newHoveredRowIndex = Math.floor(relativeY / FREQUENCY_ROW_HEIGHT);
        if (newHoveredRowIndex < 0 || newHoveredRowIndex >= frequencyWorkItems.length) {
            newHoveredRowIndex = -1;
        }
    }
    
    // 行が変わった場合はチャートを再描画
    if (newHoveredRowIndex !== hoveredFrequencyRowIndex) {
        hoveredFrequencyRowIndex = newHoveredRowIndex;
        updateFrequencyChart();
    }
    
    // ツールチップ表示
    if (newHoveredRowIndex >= 0 && newHoveredRowIndex < frequencyWorkItems.length) {
        const item = frequencyWorkItems[newHoveredRowIndex];
        const tooltipContent = `
            <strong>${item.name}</strong><br>
            作業時間: ${formatTimeDisplay(item.workTime)}<br>
            ${item.frequency ? `頻度: ${item.frequency}<br>` : ''}
            <em>ダブルクリックで編集</em>
        `;
        showDynamicTooltip(event, tooltipContent, 'frequency');
    } else {
        hideDynamicTooltip();
    }
}

/**
 * 頻度作業チャートのマウス離脱処理（行ハイライト対応）
 */
function handleFrequencyCanvasMouseLeave(event) {
    hideDynamicTooltip();
    if (hoveredFrequencyRowIndex !== -1) {
        hoveredFrequencyRowIndex = -1;
        updateFrequencyChart();
    }
}

/**
 * 頻度作業チャートのダブルクリック処理
 */
function handleFrequencyCanvasDoubleClick(event) {
    const rect = frequencyCanvas.getBoundingClientRect();
    const y = (event.clientY - rect.top) * (frequencyCanvas.height / rect.height);
    
    // クリック位置に基づいて編集対象を特定
    const rowIndex = Math.floor((y - FREQUENCY_TOP_MARGIN) / FREQUENCY_ROW_HEIGHT);
    
    if (rowIndex >= 0 && rowIndex < frequencyWorkItems.length) {
        // 既存項目を編集
        const targetItem = frequencyWorkItems[rowIndex];
        openFrequencyWorkModal(targetItem.id);
    } else if (rowIndex === frequencyWorkItems.length || rowIndex < 0) {
        // 新規項目を追加
        openFrequencyWorkModal();
    }
}

/**
 * 全頻度作業を削除（修正版：確認ダイアログ強化）
 */
function clearAllFrequencyWork() {
    if (!frequencyWorkItems || frequencyWorkItems.length === 0) {
        showNotificationBanner('削除する頻度作業がありません。', 'info', 1500);
        return;
    }
    
    const itemCount = frequencyWorkItems.length;
    
    if (confirm(`${itemCount}個の頻度作業をすべて削除しますか？\n\nこの操作は取り消せません。`)) {
        try {
            frequencyWorkItems = [];
            updateFrequencyWorkList();
            updateFrequencyWorkStatistics();
            updateFrequencyWorkButtons();
            updateChart();
            updateFrequencyChart();
            triggerAutoSave();
            showNotificationBanner(`${itemCount}個の頻度作業を削除しました。`, 'success', 2000);
        } catch (error) {
            console.error('Error clearing frequency work:', error);
            showNotificationBanner('頻度作業の削除中にエラーが発生しました。', 'error', 2500);
        }
    }
}

// ========================================
// Schedule Chart Event Handlers (継続)
// ========================================

/**
 * スケジュールチャートのマウスダウン処理（座標系修正版）
 */
function handleScheduleMouseDown(event) {
    const pos = getCanvasMousePosition(scheduleCanvas, event); // 統一された座標取得
    scheduleMouseDownPos = { x: pos.x, y: pos.y };

    const hitTest = getTimeSlotHitTest(pos.x, pos.y); // Canvas 座標でヒットテスト
    if (hitTest) {
        scheduleDragMode = true;
        draggedTimeSlot = hitTest.timeSlot;
        draggedTimeSlotId = hitTest.timeSlot.id;
        draggedTimeSlotEdge = hitTest.edge;

        // ドラッグ開始時の時間帯の状態を保存
        dragInitialSlotState = {
            id: draggedTimeSlot.id,
            startTimeMinutes: timeToMinutes(draggedTimeSlot.startTime),
            endTimeMinutes: timeToMinutes(draggedTimeSlot.endTime)
        };
        
        event.preventDefault();
    }
}

/**
 * スケジュールチャートのマウス移動処理（座標系修正版）
 */
function handleScheduleMouseMove(event) {
    if (!scheduleDragMode) {
        // カーソル形状の変更 - 統一された座標取得を使用
        const pos = getCanvasMousePosition(scheduleCanvas, event);
        const x = pos.x;
        const y = pos.y;
        
        const hitTest = getTimeSlotHitTest(x, y);
        if (hitTest) {
            scheduleCanvas.style.cursor = hitTest.edge === 'move' ? 'grab' : 'col-resize';
        } else {
            scheduleCanvas.style.cursor = 'default';
        }
    }
}

/**
 * スケジュールチャートのマウス離脱処理
 */
function handleScheduleMouseLeave(event) {
    if (!scheduleDragMode) {
        scheduleCanvas.style.cursor = 'default';
    }
}

/**
 * スケジュールチャートのダブルクリック処理（座標系修正版）
 */
function handleScheduleDoubleClick(event) {
    // 統一された座標取得を使用
    const pos = getCanvasMousePosition(scheduleCanvas, event);
    const x = pos.x;
    const y = pos.y;
    
    const hitTest = getTimeSlotHitTest(x, y);
    if (hitTest) {
        // 既存の時間帯を編集
        openTimeSlotModal(hitTest.timeSlot.id);
    } else {
        // 新しい時間帯を追加（稼働時間範囲内制限）
        const displayRange = calculateDisplayRange();
        const leftMargin = 80;
        const rightMargin = 40;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const canvasDisplayWidth = scheduleCanvas.width / devicePixelRatio;
        const chartWidth = canvasDisplayWidth - leftMargin - rightMargin;
        
        if (x >= leftMargin && x <= canvasDisplayWidth - rightMargin) {
            const relativeX = x - leftMargin;
            const timeRatio = relativeX / chartWidth;
            const clickedMinutes = displayRange.startMinutes + (timeRatio * displayRange.totalMinutes);
            
            // 15分単位にスナップ
            const snappedMinutes = Math.round(clickedMinutes / 15) * 15;
            
            // 稼働時間範囲内制限
            const workingRange = calculateWorkingRange();
            if (snappedMinutes < workingRange.startMinutes || snappedMinutes > workingRange.endMinutes) {
                showNotificationBanner('稼働時間範囲内でのみ時間帯を追加できます。', 'warning', 2500);
                return;
            }
            
            const startTime = minutesToTime(snappedMinutes);
            const endTime = minutesToTime(Math.min(snappedMinutes + 60, workingRange.endMinutes)); // デフォルト1時間または範囲内
            
            // 新しい時間帯を作成
            const newTimeSlot = {
                id: Date.now(),
                name: '新しい時間帯',
                type: 'break',
                startTime: startTime,
                endTime: endTime,
                notes: ''
            };
            
            timeSlots.push(newTimeSlot);
            updateWorkingTimeDisplay();
            updateScheduleChart();
            updateTimeSlotList();
            triggerAutoSave();
            
            // モーダルを開いて編集
            openTimeSlotModal(newTimeSlot.id);
        }
    }
}


/**
 * 稼働時間範囲を計算（修正版：表示範囲全体を使用）
 */
function calculateWorkingRange() {
    // 表示範囲全体をドラッグ可能範囲とする
    const displayRange = calculateDisplayRange();
    return {
        startMinutes: displayRange.startMinutes,
        endMinutes: displayRange.endMinutes
    };
}

/**
 * スケジュールチャートのグローバルマウス移動処理（座標系修正版）
 */
function handleScheduleGlobalMouseMove(event) {
    if (scheduleDragMode && draggedTimeSlot && scheduleMouseDownPos && dragInitialSlotState) {
        // getCanvasMousePositionを使用して統一された座標取得
        const pos = getCanvasMousePosition(scheduleCanvas, event);
        const currentCanvasX = pos.x;

        // ドラッグ開始からの総移動量 (Canvasピクセル - 既に適切にスケールされている)
        const totalDeltaCanvasX = currentCanvasX - scheduleMouseDownPos.x;

        // Canvas ピクセルを分に変換するための情報
        const displayRange = calculateDisplayRange();
        const leftMarginPx = 60; // 表示ピクセル単位でのマージン
        const rightMarginPx = 30;
        const chartRenderWidthPx = scheduleCanvas.width / (window.devicePixelRatio || 1) - leftMarginPx - rightMarginPx;

        if (chartRenderWidthPx <= 0) return; // 描画幅が0以下なら処理しない

        // 総移動量 (分単位)
        const totalDeltaMinutes = (totalDeltaCanvasX / chartRenderWidthPx) * displayRange.totalMinutes;
        const snappedTotalDeltaMinutes = Math.round(totalDeltaMinutes / 5) * 5; // 5分単位にスナップ

        // 時間が実際に変更された場合のみ処理を実行
        let previousStartTime = timeToMinutes(draggedTimeSlot.startTime);
        let previousEndTime = timeToMinutes(draggedTimeSlot.endTime);

        updateTimeSlotPositionOnDrag(draggedTimeSlotId, draggedTimeSlotEdge, snappedTotalDeltaMinutes);

        let newStartTime = timeToMinutes(draggedTimeSlot.startTime);
        let newEndTime = timeToMinutes(draggedTimeSlot.endTime);

        // 時間が実際に変更された場合のみチャートを再描画
        if (newStartTime !== previousStartTime || newEndTime !== previousEndTime) {
            updateScheduleChart();
        }
    }
}

/**
 * ドラッグ中の時間帯位置更新（稼働時間接触制約版）
 * @param {number} timeSlotId - 時間帯ID
 * @param {string} edge - 操作対象（'start', 'end', 'move'）
 * @param {number} snappedTotalDeltaMinutes - スナップされた総移動分（分単位）
 */
function updateTimeSlotPositionOnDrag(timeSlotId, edge, snappedTotalDeltaMinutes) {
    const timeSlot = timeSlots.find(slot => slot.id === timeSlotId);
    if (!timeSlot || !dragInitialSlotState || dragInitialSlotState.id !== timeSlotId) return;

    let newStartMinutes = dragInitialSlotState.startTimeMinutes;
    let newEndMinutes = dragInitialSlotState.endTimeMinutes;
    const initialDuration = dragInitialSlotState.endTimeMinutes - dragInitialSlotState.startTimeMinutes;

    const minDuration = 5; // 最小の継続時間（分）
    
    // 稼働時間制約：稼働時間または既存の時間帯と必ず接する必要がある
    const constraints = calculateTimeSlotConstraints(timeSlotId);

    switch (edge) {
        case 'start':
            newStartMinutes = dragInitialSlotState.startTimeMinutes + snappedTotalDeltaMinutes;
            // 開始時間制約の適用
            newStartMinutes = Math.max(constraints.minStartTime, newStartMinutes);
            newStartMinutes = Math.min(newStartMinutes, dragInitialSlotState.endTimeMinutes - minDuration);
            newEndMinutes = dragInitialSlotState.endTimeMinutes;
            break;
            
        case 'end':
            newEndMinutes = dragInitialSlotState.endTimeMinutes + snappedTotalDeltaMinutes;
            // 終了時間制約の適用
            newEndMinutes = Math.min(constraints.maxEndTime, newEndMinutes);
            newEndMinutes = Math.max(newEndMinutes, dragInitialSlotState.startTimeMinutes + minDuration);
            newStartMinutes = dragInitialSlotState.startTimeMinutes;
            break;
            
        case 'move':
            newStartMinutes = dragInitialSlotState.startTimeMinutes + snappedTotalDeltaMinutes;
            newEndMinutes = newStartMinutes + initialDuration;

            // 移動制約の適用：稼働時間範囲内かつ他の時間帯と重複しない
            if (newStartMinutes < constraints.minStartTime) {
                newStartMinutes = constraints.minStartTime;
                newEndMinutes = newStartMinutes + initialDuration;
            }
            
            if (newEndMinutes > constraints.maxEndTime) {
                newEndMinutes = constraints.maxEndTime;
                newStartMinutes = newEndMinutes - initialDuration;
                // 再度開始時間をチェック
                if (newStartMinutes < constraints.minStartTime) {
                    // 期間を縮小して制約内に収める
                    newStartMinutes = constraints.minStartTime;
                    newEndMinutes = Math.min(constraints.maxEndTime, newStartMinutes + initialDuration);
                }
            }
            break;
    }

    // 最終的な制約チェック：稼働時間と接触していることを確認
    const finalConstraintCheck = verifyTimeSlotConstraints(newStartMinutes, newEndMinutes, timeSlotId);
    if (!finalConstraintCheck.isValid) {
        console.warn('Time slot would violate constraints, adjustment needed:', finalConstraintCheck.reason);
        // 制約に違反する場合は最も近い有効な位置に調整
        const adjusted = adjustToValidPosition(newStartMinutes, newEndMinutes, constraints);
        newStartMinutes = adjusted.startMinutes;
        newEndMinutes = adjusted.endMinutes;
    }

    // 時間を更新
    if (isFinite(newStartMinutes) && isFinite(newEndMinutes) && newEndMinutes > newStartMinutes) {
        const finalStartMinutes = Math.round(newStartMinutes / 5) * 5;
        const finalEndMinutes = Math.round(newEndMinutes / 5) * 5;
        
        timeSlot.startTime = minutesToTime(finalStartMinutes);
        timeSlot.endTime = minutesToTime(finalEndMinutes);

    } else {
        console.warn("Could not update time slot position due to invalid new times:", {
            newStartMinutes,
            newEndMinutes,
            edge,
            snappedTotalDeltaMinutes
        });
    }
}

/**
 * 有効な位置に調整
 * @param {number} startMinutes - 希望開始時間
 * @param {number} endMinutes - 希望終了時間
 * @param {Object} constraints - 制約情報
 * @returns {Object} - 調整された時間
 */
function adjustToValidPosition(startMinutes, endMinutes, constraints) {
    const duration = endMinutes - startMinutes;
    
    // まず範囲内に収める
    let adjustedStart = Math.max(constraints.minStartTime, startMinutes);
    let adjustedEnd = Math.min(constraints.maxEndTime, endMinutes);
    
    // 継続時間を維持しようとする
    if (adjustedEnd - adjustedStart < duration) {
        if (adjustedStart === constraints.minStartTime) {
            adjustedEnd = Math.min(constraints.maxEndTime, adjustedStart + duration);
        } else if (adjustedEnd === constraints.maxEndTime) {
            adjustedStart = Math.max(constraints.minStartTime, adjustedEnd - duration);
        }
    }
    
    return {
        startMinutes: adjustedStart,
        endMinutes: adjustedEnd
    };
}

/**
 * 時間帯制約の検証
 * @param {number} startMinutes - 開始時間（分）
 * @param {number} endMinutes - 終了時間（分）
 * @param {number} excludeSlotId - 除外する時間帯ID
 * @returns {Object} - 検証結果
 */
function verifyTimeSlotConstraints(startMinutes, endMinutes, excludeSlotId) {
    const constraints = calculateTimeSlotConstraints(excludeSlotId);
    
    // 基本的な時間範囲チェック
    if (startMinutes < constraints.minStartTime || endMinutes > constraints.maxEndTime) {
        return {
            isValid: false,
            reason: `時間範囲制約違反: ${minutesToTime(startMinutes)}-${minutesToTime(endMinutes)} は範囲 ${constraints.allowedRange} を超えています`
        };
    }
    
    // 稼働時間との接触チェック：時間帯が稼働時間または既存の時間帯と接している必要がある
    const touchesWorkingTime = (startMinutes <= constraints.actualWorkEnd && endMinutes >= constraints.actualWorkStart);
    const touchesExistingSlot = constraints.existingSlots.some(slot => 
        !(endMinutes <= slot.startMinutes || startMinutes >= slot.endMinutes)
    );
    
    if (!touchesWorkingTime && !touchesExistingSlot) {
        return {
            isValid: false,
            reason: '稼働時間または既存の時間帯と接していません'
        };
    }
    
    return {
        isValid: true,
        reason: '制約を満たしています'
    };
}




/**
 * 時間帯の制約を計算（稼働時間接触制約）
 * @param {number} excludeSlotId - 除外する時間帯ID（移動中の時間帯）
 * @returns {Object} - 制約情報
 */
function calculateTimeSlotConstraints(excludeSlotId) {
    const displayRange = calculateDisplayRange();
    
    // 基本制約：稼働時間範囲内
    let minStartTime = displayRange.actualStartMinutes;
    let maxEndTime = displayRange.actualEndMinutes;
    
    // 既存の時間帯を取得（移動中のものを除く）
    const existingSlots = timeSlots
        .filter(slot => slot.id !== excludeSlotId)
        .map(slot => ({
            id: slot.id,
            startMinutes: timeToMinutes(slot.startTime),
            endMinutes: timeToMinutes(slot.endTime)
        }))
        .sort((a, b) => a.startMinutes - b.startMinutes);
    
    // 稼働時間の拡張：既存の時間帯がある場合はその範囲も含める
    if (existingSlots.length > 0) {
        const earliestSlot = Math.min(...existingSlots.map(slot => slot.startMinutes));
        const latestSlot = Math.max(...existingSlots.map(slot => slot.endMinutes));
        
        minStartTime = Math.min(minStartTime, earliestSlot);
        maxEndTime = Math.max(maxEndTime, latestSlot);
    }
    
    return {
        minStartTime: minStartTime,
        maxEndTime: maxEndTime,
        actualWorkStart: displayRange.actualStartMinutes,
        actualWorkEnd: displayRange.actualEndMinutes,
        existingSlots: existingSlots,
        allowedRange: `${minutesToTime(minStartTime)} - ${minutesToTime(maxEndTime)}`
    };
}




/**
 * 稼働時間チャートのドラッグ終了処理（修正版：終了時間再計算）
 */
function handleScheduleGlobalMouseUp(event) {
    if (scheduleDragMode) {
        scheduleDragMode = false;
        draggedTimeSlot = null;
        draggedTimeSlotId = null;
        draggedTimeSlotEdge = null;
        scheduleMouseDownPos = null;
        dragInitialSlotState = null;

        scheduleCanvas.style.cursor = 'default';

        // 時間帯変更により稼働時間設定を再計算
        updateScheduleConfig();
        
        updateWorkingTimeDisplay();
        updateTimeSlotList();
        triggerAutoSave();
        
        // 変更通知
        showNotificationBanner('時間帯を変更しました。終了時間が再計算されました。', 'success', 2500);
    }
}

/**
 * 時間帯のヒットテスト（座標系修正版）
 * @param {number} x - X座標（getCanvasMousePositionから取得した座標）
 * @param {number} y - Y座標（getCanvasMousePositionから取得した座標）
 * @returns {object|null} - ヒットした時間帯情報
 */
function getTimeSlotHitTest(x, y) {
    const barBaseY = SCHEDULE_TOP_MARGIN;
    if (y < barBaseY || y > barBaseY + SCHEDULE_BAR_HEIGHT) return null;

    for (const slot of timeSlots) {
        if (slot._renderInfo) {
            const info = slot._renderInfo;
            // ヒットテスト: x, y が slot._renderInfo の範囲内にあるか
            // _renderInfo の座標は既に表示ピクセル単位で保存されているので、そのまま比較
            if (x >= info.x && x <= info.x + info.width &&
                y >= info.y && y <= info.y + info.height) {

                const edgeThreshold = 12; // エッジ判定の感度 (表示ピクセル単位)
                if (x <= info.x + edgeThreshold) {
                    return { timeSlot: slot, edge: 'start' };
                } else if (x >= info.x + info.width - edgeThreshold) {
                    return { timeSlot: slot, edge: 'end' };
                } else {
                    return { timeSlot: slot, edge: 'move' };
                }
            }
        }
    }
    return null;
}

// ========================================
// Local Storage Management (Business Enhanced with Schedule and Frequency Work)
// ========================================



/**
 * ローカルストレージにデータを保存
 */
function saveToLocalStorage() {
    try {
        localStorage.setItem('workAnalysisDataList', JSON.stringify(dataList));
        
        const currentData = getCurrentDataObject();
        localStorage.setItem('workAnalysisCurrentData', JSON.stringify(currentData));

        localStorage.setItem('workAnalysisSelectedDataIds', JSON.stringify(selectedDataIds));
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
        showNotificationBanner('データの保存に失敗しました。', 'error', 2500);
    }
}

/**
 * オートセーブを実行（ビジネス用最適化）
 */
function triggerAutoSave() {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    autoSaveTimer = setTimeout(() => {
        saveToLocalStorage();
    }, 800); // ビジネス用に高速化
}

/**
 * 現在のデータをオブジェクトとして取得（併記モード対応・全設定項目網羅・強化版）
 */
function getCurrentDataObject() {
    try {
        // 安全な総サイクルタイム計算
        let totalCurrentCycleTime = 0;
        let totalImprovedCycleTime = 0;
        
        try {
            totalCurrentCycleTime = calculateTotalCycleTimeForMode('current');
            totalImprovedCycleTime = calculateTotalCycleTimeForMode('improved');
        } catch (error) {
            console.error('Error calculating cycle times for data object:', error);
        }
        
        return {
            // バージョン情報
            version: APP_VERSION,
            formatVersion: "enhanced-business-with-text-positions",
            
            // 基本設定
            operatingTime: document.getElementById('operatingTime')?.value ?? '420',
            requiredQuantity: document.getElementById('requiredQuantity')?.value ?? '800',
            taktTime: taktTime ?? 36,
            operator: document.getElementById('operatorName')?.value ?? '',
            product: document.getElementById('productName')?.value ?? '',
            
            // 作業項目データ
            workItems: (workItems && Array.isArray(workItems)) ? workItems.map(item => ({
                ...item,
                category: item.category || 'normal',
                process: item.process || 'lot1',
                targetScope: item.targetScope || 'common',
                improved: item.improved || {
                    manualTime: item.manualTime || 0,
                    autoTime: item.autoTime || 0,
                    walkTime: item.walkTime || 0
                }
            })) : [],
            
            // 頻度作業データ (改善前後対応)
            frequencyWorkItems: (frequencyWorkItems && Array.isArray(frequencyWorkItems)) ? frequencyWorkItems.map(item => ({
                ...item,
                // 後方互換性のため、improvedがない場合は現在の値で作成
                improved: item.improved || {
                    workTime: item.workTime,
                    frequency: item.frequency
                }
            })) : [],
            
            // 時間帯データ
            timeSlots: (timeSlots && Array.isArray(timeSlots)) ? timeSlots : [],
            
            // 稼働時間設定
            scheduleConfig: {
                startTime: (scheduleConfig && scheduleConfig.startTime) || '',
                workHours: (scheduleConfig && scheduleConfig.workHours) || 8,
                endTime: (scheduleConfig && scheduleConfig.endTime) || ''
            },
            
            // 作業順序
            currentWorkOrder: (currentWorkOrder && Array.isArray(currentWorkOrder)) ? currentWorkOrder : [],
            improvedWorkOrder: (improvedWorkOrder && Array.isArray(improvedWorkOrder)) ? improvedWorkOrder : [],
            
            // グループ・レイアウト設定
            currentWorkGroups: (currentWorkGroups && Array.isArray(currentWorkGroups)) ? currentWorkGroups : [],
            improvedWorkGroups: (improvedWorkGroups && Array.isArray(improvedWorkGroups)) ? improvedWorkGroups : [],
            rowHeightFactor: rowHeightFactor || 1.0,
            fontSizeFactor: fontSizeFactor || 1.0,
            
            // 表示設定
            displayMode: displayMode || 'current',
            showGanttChart: showGanttChart !== undefined ? showGanttChart : true,
            showProcessChart: showProcessChart !== undefined ? showProcessChart : false,
            showFrequencyChart: showFrequencyChart !== undefined ? showFrequencyChart : true,
            processChartLotMode: (typeof processChartLotMode !== 'undefined') ? processChartLotMode : 'lot',
            currentMainTab: currentMainTab || 'gantt',
            
            // チャート設定
            chartScaleMode: chartScaleMode || 'manual',
            frequencyChartMode: frequencyChartMode || 'actual', // 追加
            distributionDisplayMode: distributionDisplayMode || 'current',
            manualScaleValue: manualScaleValue || 36,
            distBarWidth: typeof distBarWidth !== 'undefined' ? distBarWidth : 100,
            distGroupSpacing: typeof distGroupSpacing !== 'undefined' ? distGroupSpacing : 40,
            
            // まとめづくり設定
            batchMode: batchMode || false,
            batchQuantity: batchQuantity || 1,
            batchQuantityMemory: batchQuantityMemory || 2,
            batchShowIndividualLines: batchShowIndividualLines !== undefined ? batchShowIndividualLines : true,

            // 標準手持ち設定
            standardWIP: standardWIP || 0,

            // 2サイクル表示設定
            cycleCount: cycleCount || 1,
            showDualCycle: cycleCount >= 2, // 後方互換
            lineStyles: JSON.parse(JSON.stringify(lineStyles)),
            showDistributionItemLabels: typeof showDistributionItemLabels !== 'undefined' ? showDistributionItemLabels : true,
            distributionVariability: currentVariabilityData || {},

            // データリスト
            selectedDataIds: (selectedDataIds && Array.isArray(selectedDataIds)) ? selectedDataIds : [],
            currentDataId: currentDataId || null,

            // 比較ガントチャート状態
            mgDisplayMode:   (typeof mgDisplayMode  !== 'undefined') ? mgDisplayMode  : 'current',
            mgSelectedIds:   (typeof mgSelectedIds   !== 'undefined' && Array.isArray(mgSelectedIds)) ? [...mgSelectedIds] : [],
            
            // テキスト位置調整設定
            textPositionAdjustments: textPositionAdjustments ? JSON.parse(JSON.stringify(textPositionAdjustments)) : JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS)),
            
            // ビジネス設定
            businessConfig: {
                colorScheme: 'current-black-improved-red',
                designMode: 'business',
                scheduleEnabled: true,
                horizontalChart: true,
                operatingRateEnabled: true,
                frequencyWorkEnabled: true,
                processChartEnabled: true,
                enhancedTooltips: true,
                responsiveDesign: true,
                textPositionAdjustmentEnabled: true
            },
            
            // メタデータ
            lastModified: new Date().toISOString(),
            exportDate: new Date().toISOString(),
            totalCurrentCycleTime: totalCurrentCycleTime,
            totalImprovedCycleTime: totalImprovedCycleTime,
            
            // 統計情報
            statistics: calculateStatisticsSafely()
        };
    } catch (error) {
        console.error('Error in getCurrentDataObject:', error);
        // フォールバック：最小限のデータオブジェクトを返す
        return {
            version: APP_VERSION,
            formatVersion: "enhanced-business-with-text-positions",
            operatingTime: "420",
            requiredQuantity: "800",
            taktTime: 36,
            operator: "",
            product: "",
            workItems: [],
            frequencyWorkItems: [],
            timeSlots: [],
            scheduleConfig: { startTime: '', workHours: 8, endTime: '' },
            currentWorkOrder: [],
            improvedWorkOrder: [],
            displayMode: 'current',
            showWorkItemLabels: true,
            showProcessChart: false,
            currentMainTab: 'gantt',
            chartScaleMode: 'manual',
            frequencyChartMode: 'actual',
            distributionDisplayMode: 'current',
            showDistributionItemLabels: true,
            standardWIP: 0,
            selectedDataIds: [],
            currentDataId: null,
            textPositionAdjustments: JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS)),
            businessConfig: {
                colorScheme: 'current-black-improved-red',
                designMode: 'business',
                scheduleEnabled: true,
                textPositionAdjustmentEnabled: true
            },
            lastModified: new Date().toISOString(),
            exportDate: new Date().toISOString(),
            totalCurrentCycleTime: 0,
            totalImprovedCycleTime: 0,
            statistics: {
                workItemCount: 0,
                frequencyWorkCount: 0,
                timeSlotCount: 0,
                hasImprovements: false,
                categoryBreakdown: { normal: 0, monitor: 0, hold: 0, wait: 0 },
                averageCycleTime: 0,
                improvementRate: 0
            }
        };
    }
}

/**
 * 表示モードに応じた総サイクルタイムを計算（修正版：空配列対策・エラーハンドリング強化）
 * @param {string|Array} modeOrItems - モード文字列（'current', 'improved', 'both'）または表示項目配列
 * @returns {number} - 総サイクルタイム
 */
function calculateTotalCycleTimeForMode(modeOrItems) {
    try {
        // 引数が文字列の場合（モード指定）の処理
        if (typeof modeOrItems === 'string') {
            const mode = modeOrItems;
            
            // workItems が未初期化または空の場合の安全処理
            if (!workItems || !Array.isArray(workItems) || workItems.length === 0) {
                return 0;
            }
            
            if (mode === 'improved') {
                // 改善後モードの場合：improvedWorkOrderを使用して正確に計算
                if (!improvedWorkOrder || !Array.isArray(improvedWorkOrder)) {
                    return 0;
                }
                
                let improvedTotal = 0;
                improvedWorkOrder.forEach(id => {
                    const item = workItems.find(i => i.id === id);
                    if (item && (item.targetScope || 'common') !== 'current-only') {
                        const improvedData = item.improved || { 
                            manualTime: item.manualTime || 0, 
                            autoTime: item.autoTime || 0, 
                            walkTime: item.walkTime || 0 
                        };
                        improvedTotal += (improvedData.manualTime || 0) + (improvedData.walkTime || 0);
                    }
                });
                return improvedTotal;
            } else if (mode === 'current') {
                // 改善前モードの場合：currentWorkOrderを使用
                if (!currentWorkOrder || !Array.isArray(currentWorkOrder)) {
                    return 0;
                }
                
                let currentTotal = 0;
                currentWorkOrder.forEach(id => {
                    const item = workItems.find(i => i.id === id);
                    if (item && (item.targetScope || 'common') !== 'improved-only') {
                        currentTotal += (item.manualTime || 0) + (item.walkTime || 0);
                    }
                });
                return currentTotal;
            } else if (mode === 'both') {
                if (!improvedWorkOrder || !Array.isArray(improvedWorkOrder)) {
                    return 0;
                }
                
                let improvedTotal = 0;
                improvedWorkOrder.forEach(id => {
                    const item = workItems.find(i => i.id === id);
                    if (item && (item.targetScope || 'common') !== 'current-only') {
                        const improvedData = item.improved || { 
                            manualTime: item.manualTime || 0, 
                            autoTime: item.autoTime || 0, 
                            walkTime: item.walkTime || 0 
                        };
                        improvedTotal += (improvedData.manualTime || 0) + (improvedData.walkTime || 0);
                    }
                });
                return improvedTotal;
            } else {
                console.warn('Unknown mode in calculateTotalCycleTimeForMode:', mode);
                return 0;
            }
        }
        
        // 引数が配列の場合（従来の処理・後方互換性のため保持）
        const displayItems = Array.isArray(modeOrItems) ? modeOrItems : [];
        
        if (displayItems.length === 0) {
            // 空配列の場合は警告を出すが、処理は継続
            console.warn('Empty display items array in calculateTotalCycleTimeForMode - returning 0');
            return 0;
        }
        
        // 現在のdisplayModeに応じて計算
        return displayItems.reduce((total, item) => {
            if (!item) return total;
            
            let manualTime, walkTime;
            
            if (displayMode === 'improved' && item.improved) {
                manualTime = item.improved.manualTime || 0;
                walkTime = item.improved.walkTime || 0;
            } else {
                manualTime = item.manualTime || 0;
                walkTime = item.walkTime || 0;
            }
            
            return total + manualTime + walkTime;
        }, 0);
        
    } catch (error) {
        console.error('Error in calculateTotalCycleTimeForMode:', error);
        return 0; // エラー時は0を返して処理を継続
    }
}


/**
 * 統計情報を安全に計算
 */
function calculateStatisticsSafely() {
    try {
        return {
            workItemCount: (workItems && Array.isArray(workItems)) ? workItems.length : 0,
            frequencyWorkCount: (frequencyWorkItems && Array.isArray(frequencyWorkItems)) ? frequencyWorkItems.length : 0,
            timeSlotCount: (timeSlots && Array.isArray(timeSlots)) ? timeSlots.length : 0,
            hasImprovements: (workItems && Array.isArray(workItems)) ? workItems.some(item => item.improved) : false,
            categoryBreakdown: getCategoryBreakdown(),
            averageCycleTime: getAverageCycleTime(),
            improvementRate: getImprovementRate()
        };
    } catch (error) {
        console.warn('Error calculating statistics:', error);
        return {
            workItemCount: 0,
            frequencyWorkCount: 0,
            timeSlotCount: 0,
            hasImprovements: false,
            categoryBreakdown: { normal: 0, monitor: 0, hold: 0, wait: 0 },
            averageCycleTime: 0,
            improvementRate: 0
        };
    }
}

/**
 * カテゴリ別集計を取得
 */
function getCategoryBreakdown() {
    const breakdown = { normal: 0, monitor: 0, hold: 0, wait: 0 };
    
    if (!workItems || !Array.isArray(workItems)) {
        return breakdown;
    }
    
    workItems.forEach(item => {
        const category = item.category || 'normal';
        if (breakdown.hasOwnProperty(category)) {
            breakdown[category]++;
        } else {
            breakdown.normal++; // 不明なカテゴリは通常に分類
        }
    });
    
    return breakdown;
}

/**
 * インポートデータの検証
 */
function validateImportData(data) {
    try {
        // 基本構造のチェック
        if (!data || typeof data !== 'object') {
            showNotificationBanner('無効なデータ形式です。', 'error', 3000);
            return false;
        }
        
        // 必須フィールドのチェック
        const requiredFields = ['version'];
        for (const field of requiredFields) {
            if (!(field in data)) {
                console.warn(`Missing required field: ${field}`);
            }
        }
        
        // 配列型フィールドのチェック
        const arrayFields = ['workItems', 'frequencyWorkItems', 'timeSlots'];
        for (const field of arrayFields) {
            if (data[field] && !Array.isArray(data[field])) {
                showNotificationBanner(`${field}が正しい形式ではありません。`, 'error', 3000);
                return false;
            }
        }
        
        // 作業項目データの詳細検証
        if (data.workItems) {
            for (let i = 0; i < data.workItems.length; i++) {
                const item = data.workItems[i];
                if (!item.name || typeof item.name !== 'string') {
                    console.warn(`Invalid work item at index ${i}: missing or invalid name`);
                }
                if (typeof item.manualTime !== 'number' || item.manualTime < 0) {
                    console.warn(`Invalid work item at index ${i}: invalid manualTime`);
                }
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Data validation error:', error);
        showNotificationBanner('データの検証中にエラーが発生しました。', 'error', 3000);
        return false;
    }
}

/**
 * 平均サイクルタイムを取得（整数秒単位修正版）
 * @returns {number} - 平均サイクルタイム（整数秒）
 */
function getAverageCycleTime() {
    if (!workItems || workItems.length === 0) return 0;
    
    let totalTime = 0;
    workItems.forEach(item => {
        const manualTime = Math.round(parseInt(item.manualTime) || 0);
        const walkTime = Math.round(parseInt(item.walkTime) || 0);
        totalTime += manualTime + walkTime;
    });
    
    return Math.round(totalTime / workItems.length);
}

/**
 * 改善率を取得（整数秒ベース計算・修正版）
 * @returns {number} - 改善率（パーセント）
 */
function getImprovementRate() {
    if (!workItems || workItems.length === 0) return 0;
    
    let currentTotal = 0;
    let improvedTotal = 0;
    
    workItems.forEach(item => {
        const currentManual = Math.round(parseInt(item.manualTime) || 0);
        const currentWalk = Math.round(parseInt(item.walkTime) || 0);
        const currentItemTotal = currentManual + currentWalk;
        currentTotal += currentItemTotal;
        
        if (item.improved) {
            const improvedManual = Math.round(parseInt(item.improved.manualTime) || currentManual);
            const improvedWalk = Math.round(parseInt(item.improved.walkTime) || currentWalk);
            improvedTotal += improvedManual + improvedWalk;
        } else {
            improvedTotal += currentItemTotal;
        }
    });
    
    if (currentTotal === 0) return 0;
    const improvementRate = ((currentTotal - improvedTotal) / currentTotal) * 100;
    return Math.round(improvementRate * 10) / 10; // 小数点第1位まで
}

/**
 * データチェックサムを計算（データ整合性検証用）
 */
function calculateDataChecksum(data) {
    const dataString = JSON.stringify({
        workItems: data.workItems,
        frequencyWorkItems: data.frequencyWorkItems,
        timeSlots: data.timeSlots
    });
    
    // 簡易ハッシュ計算
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32bit整数に変換
    }
    return hash.toString(16);
}

/**
 * インポート要約を取得
 */
function getImportSummary(data) {
    const workItemCount = data.workItems ? data.workItems.length : 0;
    const frequencyWorkCount = data.frequencyWorkItems ? data.frequencyWorkItems.length : 0;
    const timeSlotCount = data.timeSlots ? data.timeSlots.length : 0;
    
    const parts = [];
    if (workItemCount > 0) parts.push(`作業項目${workItemCount}件`);
    if (frequencyWorkCount > 0) parts.push(`頻度作業${frequencyWorkCount}件`);
    if (timeSlotCount > 0) parts.push(`時間帯${timeSlotCount}件`);
    
    return parts.length > 0 ? `(${parts.join('、')})` : '';
}

/**
 * データ整合性チェック
 */
function performDataIntegrityCheck(importedData) {
    const issues = [];
    
    // 作業順序の整合性チェック
    const workItemIds = workItems.map(item => item.id);
    const invalidCurrentOrder = currentWorkOrder.filter(id => !workItemIds.includes(id));
    const invalidImprovedOrder = improvedWorkOrder.filter(id => !workItemIds.includes(id));
    
    if (invalidCurrentOrder.length > 0) {
        issues.push('改善前の作業順序に無効な項目があります');
    }
    if (invalidImprovedOrder.length > 0) {
        issues.push('改善後の作業順序に無効な項目があります');
    }
    
    // データの修復
    if (issues.length > 0) {
        currentWorkOrder = currentWorkOrder.filter(id => workItemIds.includes(id));
        improvedWorkOrder = improvedWorkOrder.filter(id => workItemIds.includes(id));
        
        // 不足している項目を追加
        const missingInCurrent = workItemIds.filter(id => !currentWorkOrder.includes(id));
        const missingInImproved = workItemIds.filter(id => !improvedWorkOrder.includes(id));
        
        currentWorkOrder.push(...missingInCurrent);
        improvedWorkOrder.push(...missingInImproved);
        
        showNotificationBanner(`データの整合性を修復しました: ${issues.join('、')}`, 'warning', 3000);
        
        // チャートを再更新
        updateChart();
    }
}

/**
 * データオブジェクトから設定を読み込み
 */
function loadDataFromObject(data) {
    try {
        // グローバル変数の初期化確認
        if (typeof workItems === 'undefined') window.workItems = [];
        if (typeof frequencyWorkItems === 'undefined') window.frequencyWorkItems = [];
        if (typeof timeSlots === 'undefined') window.timeSlots = [];
        if (typeof scheduleConfig === 'undefined') window.scheduleConfig = { startTime: '', workHours: 8, endTime: '' };
        if (typeof currentWorkOrder === 'undefined') window.currentWorkOrder = [];
        if (typeof improvedWorkOrder === 'undefined') window.improvedWorkOrder = [];
        if (typeof selectedDataIds === 'undefined') window.selectedDataIds = [];
        if (typeof textPositionAdjustments === 'undefined') window.textPositionAdjustments = JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS));
        
        currentVariabilityData = data.distributionVariability || {};

        // バージョンチェックと互換性処理
        const dataVersion = data.version || "1.0.0";
        const formatVersion = data.formatVersion || "basic";
                
        // 基本設定の復元
        if (data.operatingTime) {
            const operatingTimeEl = document.getElementById('operatingTime');
            if (operatingTimeEl) operatingTimeEl.value = data.operatingTime;
        }
        if (data.requiredQuantity) {
            const requiredQuantityEl = document.getElementById('requiredQuantity');
            if (requiredQuantityEl) requiredQuantityEl.value = data.requiredQuantity;
        }
        if (data.operator) {
            const operatorEl = document.getElementById('operatorName');
            if (operatorEl) operatorEl.value = data.operator;
        }
        if (data.product) {
            const productEl = document.getElementById('productName');
            if (productEl) productEl.value = data.product;
        }
        
        // 作業項目データの復元
        workItems = (data.workItems && Array.isArray(data.workItems)) ? data.workItems.map((item, index) => {
            const restoredItem = {
                id: item.id || Date.now() + index,
                name: item.name || `作業項目${index + 1}`,
                manualTime: Math.max(0, parseInt(item.manualTime) || 0),
                autoTime: Math.max(0, parseInt(item.autoTime) || 0),
                walkTime: Math.max(0, parseInt(item.walkTime) || 0),
                category: item.category || 'normal',
                process: normalizeProcessValue(item.process), 
                targetScope: item.targetScope || 'common'
            };
            
            restoredItem.improved = item.improved ? {
                manualTime: Math.max(0, parseInt(item.improved.manualTime) || 0),
                autoTime: Math.max(0, parseInt(item.improved.autoTime) || 0),
                walkTime: Math.max(0, parseInt(item.improved.walkTime) || 0)
            } : {
                manualTime: restoredItem.manualTime,
                autoTime: restoredItem.autoTime,
                walkTime: restoredItem.walkTime
            };
            
            return restoredItem;
        }) : [];
        
        // 頻度作業データの復元 (改善前後・後方互換性対応)
        frequencyWorkItems = (data.frequencyWorkItems && Array.isArray(data.frequencyWorkItems)) ? data.frequencyWorkItems.map((item, index) => {
            const parseFrequency = (freq) => {
                if (typeof freq === 'object' && freq !== null && freq.type) {
                    return freq;
                }
                if (typeof freq === 'string') {
                    let match = freq.match(/(\d+)\s*(?:個|回)/);
                    if (match) return { type: 'count', value: parseInt(match[1]) };
                    
                    match = freq.match(/(\d+)\s*(日|時間|分|秒)/);
                    if(match) {
                        const unitMap = { '日': 'd', '時間': 'h', '分': 'm', '秒': 's' };
                        return { type: 'time', value: parseInt(match[1]), unit: unitMap[match[2]] || 'h' };
                    }
                }
                return { type: 'count', value: 10 }; // デフォルト
            };

            const currentFrequency = parseFrequency(item.frequency);
            let improvedFrequency;
            if (item.improved && item.improved.frequency) {
                improvedFrequency = parseFrequency(item.improved.frequency);
            } else {
                improvedFrequency = currentFrequency;
            }

            return {
                id: item.id || Date.now() + 10000 + index,
                name: item.name || `頻度作業${index + 1}`,
                workTime: Math.max(1, parseInt(item.workTime) || 0),
                notes: item.notes || '',
                frequency: currentFrequency,
                improved: {
                    workTime: (item.improved && item.improved.workTime != null) ? Math.max(0, parseInt(item.improved.workTime) || 0) : item.workTime,
                    frequency: improvedFrequency
                }
            };
        }) : [];
        
        if (data.distributionVariability) {
            const currentDataInList = dataList.find(d => d.id === data.currentDataId);
            if(currentDataInList) {
                currentDataInList.data.distributionVariability = data.distributionVariability;
            }
        }

        // 時間帯データの復元
        timeSlots = (data.timeSlots && Array.isArray(data.timeSlots)) ? data.timeSlots.map((slot, index) => ({
            id: slot.id || Date.now() + 20000 + index,
            name: slot.name || `時間帯${index + 1}`,
            type: slot.type || 'break',
            startTime: slot.startTime || '09:00',
            endTime: slot.endTime || '10:00',
            notes: slot.notes || ''
        })) : [];
        
        // 稼働時間設定の復元
        if (data.scheduleConfig) {
            scheduleConfig = {
                startTime: data.scheduleConfig.startTime || '',
                workHours: parseFloat(data.scheduleConfig.workHours) || 8,
                endTime: data.scheduleConfig.endTime || ''
            };
            
            const scheduleStartTimeEl = document.getElementById('scheduleStartTime');
            const scheduleWorkHoursEl = document.getElementById('scheduleWorkHours');
            const scheduleEndTimeDisplayEl = document.getElementById('scheduleEndTimeDisplay');
            
            if (scheduleStartTimeEl) scheduleStartTimeEl.value = scheduleConfig.startTime;
            if (scheduleWorkHoursEl) scheduleWorkHoursEl.value = scheduleConfig.workHours;
            if (scheduleEndTimeDisplayEl) scheduleEndTimeDisplayEl.textContent = scheduleConfig.endTime || '未設定';
        } else {
            scheduleConfig = { startTime: '', workHours: 8, endTime: '' };
        }
        
        // テキスト位置調整設定の復元
        if (data.textPositionAdjustments && typeof data.textPositionAdjustments === 'object') {
            Object.keys(DEFAULT_TEXT_POSITION_ADJUSTMENTS).forEach(category => {
                textPositionAdjustments[category] = data.textPositionAdjustments[category] ? {
                    x: parseInt(data.textPositionAdjustments[category].x) || 0,
                    y: parseInt(data.textPositionAdjustments[category].y) || 0
                } : { x: 0, y: 0 };
            });
        } else {
            textPositionAdjustments = JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS));
        }
        
        // 作業順序の復元（存在しないIDは除外）
        const allWorkItemIds = workItems.map(item => item.id);
        currentWorkOrder = (data.currentWorkOrder && Array.isArray(data.currentWorkOrder)) 
            ? data.currentWorkOrder.filter(id => allWorkItemIds.includes(id))
            : [];
        improvedWorkOrder = (data.improvedWorkOrder && Array.isArray(data.improvedWorkOrder))
            ? data.improvedWorkOrder.filter(id => allWorkItemIds.includes(id))
            : [];
            
        // グループ・レイアウト設定の復元
        currentWorkGroups = data.currentWorkGroups || [];
        improvedWorkGroups = data.improvedWorkGroups || [];
        rowHeightFactor = data.rowHeightFactor || 1.0;
        fontSizeFactor = data.fontSizeFactor || 1.0;
        
        const rowSlider = document.getElementById('rowHeightSlider');
        const fontSlider = document.getElementById('fontSizeSlider');
        if (rowSlider) rowSlider.value = rowHeightFactor;
        if (fontSlider) fontSlider.value = fontSizeFactor;
        const rowVal = document.getElementById('rowHeightValue');
        const fontVal = document.getElementById('fontSizeValue');
        if (rowVal) rowVal.textContent = rowHeightFactor.toFixed(1) + 'x';
        if (fontVal) fontVal.textContent = fontSizeFactor.toFixed(1) + 'x';
        
        // 表示設定の復元
        const targetDisplayMode = data.displayMode || 'current';
        
        showGanttChart = data.showGanttChart !== undefined ? data.showGanttChart : true;
        showProcessChart = data.showProcessChart !== undefined ? data.showProcessChart : false;
        showFrequencyChart = data.showFrequencyChart !== undefined ? data.showFrequencyChart : true;
        
        // 後方互換: 旧モード名を新モード名にマッピング
        const rawLotMode = data.processChartLotMode || 'lot';
        const lotModeMap = { breakdown: 'lot', single: 'cycle' };
        processChartLotMode = lotModeMap[rawLotMode] || rawLotMode;
        
        const showGanttChartCheckbox = document.getElementById('showGanttChart');
        if (showGanttChartCheckbox) showGanttChartCheckbox.checked = showGanttChart;
        
        const showProcessChartCheckbox = document.getElementById('showProcessChart');
        if (showProcessChartCheckbox) showProcessChartCheckbox.checked = showProcessChart;

        const showFrequencyChartCheckbox = document.getElementById('showFrequencyChart');
        if (showFrequencyChartCheckbox) showFrequencyChartCheckbox.checked = showFrequencyChart;

        // 工程確認チャートのモードボタン同期
        if (typeof syncProcessChartLotModeButtons === 'function') syncProcessChartLotModeButtons();
        
        const ganttChartOptionsContainer = document.getElementById('ganttChartOptionsContainer');
        if (ganttChartOptionsContainer) {
            if (showGanttChart) {
                ganttChartOptionsContainer.classList.add('visible');
            } else {
                ganttChartOptionsContainer.classList.remove('visible');
            }
        }

        // チャート設定の復元
        chartScaleMode = (data.chartScaleMode === 'auto' ? 'manual' : data.chartScaleMode) || 'manual';
        frequencyChartMode = data.frequencyChartMode || 'actual'; // 追加
        manualScaleValue = data.manualScaleValue || 36;
        distributionDisplayMode = data.distributionDisplayMode || 'current';
        distBarWidth = data.distBarWidth || 100;
        distGroupSpacing = data.distGroupSpacing || 40;
        
        const distBarWidthSlider = document.getElementById('distBarWidthSlider');
        const distGroupSpacingSlider = document.getElementById('distGroupSpacingSlider');
        if (distBarWidthSlider) distBarWidthSlider.value = distBarWidth;
        if (distGroupSpacingSlider) distGroupSpacingSlider.value = distGroupSpacing;
        const distBarVal = document.getElementById('distBarWidthValue');
        const distSpaceVal = document.getElementById('distGroupSpacingValue');
        if (distBarVal) distBarVal.textContent = distBarWidth + 'px';
        if (distSpaceVal) distSpaceVal.textContent = distGroupSpacing + 'px';

        if (typeof syncDistributionModeUI === 'function') syncDistributionModeUI();
        
        // まとめづくり設定の復元
        batchQuantity = data.batchQuantity || 1;
        batchQuantityMemory = data.batchQuantityMemory || (batchQuantity >= 2 ? batchQuantity : 2);
        batchMode = (batchQuantity >= 2);
        batchShowIndividualLines = data.batchShowIndividualLines !== undefined ? data.batchShowIndividualLines : true;
        if (typeof syncBatchUI === 'function') syncBatchUI();

        // マルチサイクル描画設定の復元（後方互換: cycleCount未保存データはshowDualCycleから判断）
        if (typeof data.cycleCount === 'number' && data.cycleCount >= 1) {
            cycleCount = data.cycleCount;
        } else {
            cycleCount = data.showDualCycle ? 2 : 1;
        }
        
        // 標準手持ち設定の復元
        standardWIP = (typeof data.standardWIP === 'number') ? Math.max(0, data.standardWIP) : 0;
        const standardWIPEl = document.getElementById('standardWIPInput');
        if (standardWIPEl) standardWIPEl.value = standardWIP;
        const lotCountEl = document.getElementById('standardWIPLotCount');
        if (lotCountEl) lotCountEl.textContent = standardWIP + 1;
        if (typeof updateLotOptions === 'function') updateLotOptions();
        if (typeof syncDualCycleUI === 'function') syncDualCycleUI();

        // 線スタイル設定の復元
        if (data.lineStyles && typeof data.lineStyles === 'object') {
            ['taktTime', 'currentCT', 'improvedCT'].forEach(key => {
                if (data.lineStyles[key]) {
                    lineStyles[key] = Object.assign(
                        JSON.parse(JSON.stringify(LINE_STYLE_DEFAULTS[key])),
                        data.lineStyles[key]
                    );
                }
            });
        } else {
            lineStyles = JSON.parse(JSON.stringify(LINE_STYLE_DEFAULTS));
        }
        if (typeof syncLineStylesUI === 'function') syncLineStylesUI();
        
        if (typeof window.showDistributionItemLabels !== 'undefined') {
            window.showDistributionItemLabels = data.showDistributionItemLabels !== undefined ? data.showDistributionItemLabels : true;
        }
        
        // データ選択状態の復元
        selectedDataIds = (data.selectedDataIds && Array.isArray(data.selectedDataIds)) ? data.selectedDataIds : [];
        currentDataId = data.currentDataId || null;
        
        // メインタブの復元
        const targetMainTab = data.currentMainTab || 'gantt';
        
        // --- 全ての更新処理をここから実行 ---

        // データ依存の初期化
        if (typeof initializeWorkOrders === 'function') initializeWorkOrders();
        if (typeof calculateTaktTime === 'function') calculateTaktTime(false);
        
        // UIリストの更新
        if (typeof updateWorkingTimeDisplay === 'function') updateWorkingTimeDisplay();
        if (typeof updateTimeSlotList === 'function') updateTimeSlotList();
        if (typeof updateFrequencyWorkList === 'function') updateFrequencyWorkList();
        if (typeof updateFrequencyWorkStatistics === 'function') updateFrequencyWorkStatistics();
        if (typeof updateFrequencyWorkButtons === 'function') updateFrequencyWorkButtons();
        if (typeof updateDataSelectionList === 'function') updateDataSelectionList();
        if (typeof updateTextPositionUI === 'function') updateTextPositionUI();
        
        // 表示モードとスケールのUI更新
        if (typeof switchDisplayMode === 'function') switchDisplayMode(targetDisplayMode);
        if (typeof switchFrequencyChartMode === 'function') switchFrequencyChartMode(data.frequencyChartMode || 'actual'); // 修正：データから読み込んだモードでUIを更新
        if (typeof updateScaleUI === 'function') updateScaleUI();
        
        // メインタブ切替
        if (typeof switchMainTab === 'function') switchMainTab(targetMainTab);
        
        try {
            safeUpdateChart('main', () => { if (typeof updateChart === 'function') updateChart(); });
            safeUpdateChart('schedule', () => { if (typeof updateScheduleChart === 'function') updateScheduleChart(); });
            safeUpdateChart('distribution', () => { if (typeof updateDistributionChart === 'function') updateDistributionChart(); });
            safeUpdateChart('frequency', () => { if (typeof updateFrequencyChart === 'function') updateFrequencyChart(); });
            safeUpdateChart('process', () => { if (typeof updateProcessChart === 'function') updateProcessChart(); });
        } catch (chartError) {
            console.error('Error updating charts during data load:', chartError);
        }
        
        if (typeof updateUIElements === 'function') updateUIElements();
        if (typeof updateProcessChartVisibilityStable === 'function') updateProcessChartVisibilityStable();

        // 比較ガントチャート状態の復元
        if (typeof mgDisplayMode !== 'undefined') {
            const restoredMgMode = data.mgDisplayMode || 'current';
            mgDisplayMode = (restoredMgMode === 'improved') ? 'improved' : 'current';
            // モードボタンのUI同期
            document.querySelectorAll('.mg-mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mgDisplayMode);
            });
        }
        if (typeof mgSelectedIds !== 'undefined' && Array.isArray(data.mgSelectedIds) && data.mgSelectedIds.length > 0) {
            // 保存済みの選択IDのうち現在 dataList に存在するものだけを復元
            const validIds = (dataList || []).map(d => d.id);
            mgSelectedIds = data.mgSelectedIds.filter(id => validIds.includes(id));
        }
        // 比較ガントのリスト・描画を更新
        _mgNotifyDataListChanged();
        
    } catch (error) {
        console.error('Error in loadDataFromObject:', error);
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('データの読み込み中にエラーが発生しました。一部のデータが正しく復元されない可能性があります。', 'warning', 4000);
        }
        if (typeof switchDisplayMode === 'function') {
            switchDisplayMode('current');
        }
    }
}

// ========================================
// Main Tab Management (Business Enhanced with Schedule)
// ========================================

/**
 * メインタブを切り替える
 */
function switchMainTab(tab) {
    currentMainTab = tab;
    
    // タブボタンのアクティブ状態を更新
    document.querySelectorAll('.main-tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tab}Tab`).classList.add('active');
    
    // タブコンテンツの表示を更新
    document.querySelectorAll('.main-tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tab}TabContent`).classList.add('active');
    
    // 右パネルの表示制御
    const ganttControls        = document.getElementById('ganttPanelControls');
    const distributionControls = document.getElementById('distributionPanelControls');
    const scheduleControls     = document.getElementById('schedulePanelControls');
    const multiGanttControls   = document.getElementById('multiGanttPanelControls');
    
    if (ganttControls)        ganttControls.style.display        = (tab === 'gantt')        ? 'block' : 'none';
    if (distributionControls) distributionControls.style.display = (tab === 'distribution') ? 'block' : 'none';
    if (scheduleControls)     scheduleControls.style.display     = (tab === 'schedule')     ? 'block' : 'none';
    if (multiGanttControls)   multiGanttControls.style.display   = (tab === 'multiGantt')  ? 'block' : 'none';
    
    // 各タブに切り替えた際の初期化/更新処理
    if (tab === 'distribution') {
        updateDataSelectionList();
        updateVariabilityEditor();
        initializeDistributionCanvas();
        if (typeof adjustDistributionCanvasWidth === 'function') adjustDistributionCanvasWidth();
        updateDistributionChart();
    } else if (tab === 'schedule') {
        updateTimeSlotList();
        updateWorkingTimeDisplay();
        initializeScheduleCanvas();
        updateScheduleChart();
    } else if (tab === 'gantt') {
        updateFrequencyWorkList();
        updateFrequencyWorkStatistics();
        updateFrequencyWorkButtons();
        updateChart();
        // ★★★ 修正箇所: 頻度チャートの更新呼び出しを追加 ★★★
        updateFrequencyChart(); 
    } else if (tab === 'multiGantt') {
        // multi-gantt.js 側で処理（スクリプトロード後に定義済みの場合のみ）
        if (typeof mgInitCanvas === 'function') {
            mgInitCanvas();
            mgSyncSelectionFromDataList();
            mgUpdateSelectionList();
            mgUpdateHeaderInfo();
            mgRedraw();
        }
    }
    
    triggerAutoSave();
}

// ========================================
// Data List Management (Business Enhanced)
// ========================================

/**
 * データリストのセレクトボックスUIを更新します。
 */
function updateDataListSelect() {
    const select = document.getElementById('dataListSelect');
    if (!select) return;
    select.innerHTML = '<option value="">新規データ</option>';
    
    // 作成日時の降順（新しいものが上）でソート
    const sortedDataList = [...dataList].sort((a, b) => 
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    
    sortedDataList.forEach(data => {
        const option = document.createElement('option');
        option.value = data.id;
        option.textContent = data.name;
        select.appendChild(option);
    });

    // 現在選択中のデータをセレクトボックスに反映
    if (currentDataId) {
        select.value = currentDataId;
    } else {
        select.value = "";
    }
    
    // 削除ボタンの表示/非表示を更新
    const deleteBtn = document.getElementById('deleteDataFromListBtn');
    if (deleteBtn) deleteBtn.style.display = select.value ? 'inline-flex' : 'none';
    if (typeof updateCurrentFileDisplay === 'function') updateCurrentFileDisplay();
    if (typeof renderFileManagerList === 'function') renderFileManagerList();

    // 比較ガントチャートのデータリストを同期
    _mgNotifyDataListChanged();
}

// ========================================
// Multi-Gantt 連携ユーティリティ
// dataList が変更された際に比較ガントの
// 選択リスト・ヘッダー・キャンバスを一括更新する。
// multi-gantt.js が未ロードの場合は何もしない。
// ========================================
function _mgNotifyDataListChanged() {
    if (typeof mgSyncSelectionFromDataList === 'function') mgSyncSelectionFromDataList();
    if (typeof mgUpdateSelectionList       === 'function') mgUpdateSelectionList();
    if (typeof mgUpdateHeaderInfo          === 'function') mgUpdateHeaderInfo();
    if (typeof mgRedraw                    === 'function') mgRedraw();
}

/**
 * データリストセレクトボックスの選択に応じてデータを読み込みます。
 * ユーザーの確認なしで即座に切り替わります。
 */
function loadDataFromList() {
    const select = document.getElementById('dataListSelect');
    const selectedId = select.value;

    if (selectedId) {
        // --- 保存済みデータの読み込み ---
        const selectedData = dataList.find(data => data.id === selectedId);
        if (selectedData) {
            loadDataFromObject(selectedData.data);
            currentDataId = selectedId;
            currentVariabilityData = selectedData.data.distributionVariability || {};
        }
    } else {
        // --- 新規データ作成モードへの切り替え ---
        if (currentDataId !== null) { // 現在何かしらのデータを編集中だった場合のみクリア
            clearAllData(false); // アプリケーションの状態をクリア
        }
        currentDataId = null;
        currentVariabilityData = {};
    }
    
    // 状態に応じてUIを更新
    updateSaveButtonUI();
    updateDeleteButtonVisibility();
    if (typeof updateVariabilityEditor === 'function') {
         updateVariabilityEditor();
    }
    triggerAutoSave();
}

/**
 * 保存ボタンのメイン機能。
 * 編集中のデータがあれば確認なしで上書き保存し、
 * 新規データの場合は「名前を付けて保存」モーダルを開きます。
 */
function saveOrUpdateData() {
    if (currentDataId) {
        // --- 上書き保存の処理 (確認なし) ---
        try {
            const currentData = dataList.find(d => d.id === currentDataId);
            if (currentData) {
                currentData.data = getCurrentDataObject();
                currentData.createdAt = new Date().toISOString();

                const existingIndex = dataList.findIndex(data => data.id === currentDataId);
                if (existingIndex !== -1) {
                    dataList[existingIndex] = currentData;
                }

                showNotificationBanner(`「${currentData.name}」を上書き保存しました。`, 'success', 1500);
                triggerAutoSave();
                updateDataSelectionList();
            } else {
                 throw new Error("保存対象のデータが見つかりません。");
            }
        } catch (error) {
            console.error("Error overwriting data:", error);
            showNotificationBanner("上書き保存中にエラーが発生しました。", "error", 3000);
        }
    } else {
        // --- 新規保存モーダルを開く ---
        saveDataAs();
    }
}

/**
 * 「名前を付けて保存」処理。
 * 現在の作業内容を新しい名前で保存するために、常に名前入力モーダルを開きます。
 */
function saveDataAs() {
    const nameInput = document.getElementById('dataListName');
    const currentName = currentDataId ? dataList.find(d => d.id === currentDataId)?.name : document.getElementById('productName').value;
    
    // 既存の名前があれば「〜のコピー」を提案
    nameInput.value = currentName ? `${currentName}のコピー` : '';
    document.getElementById('dataNameModal').style.display = 'block';
    nameInput.focus();
    nameInput.select();
}

/**
 * 現在のデータをリストに保存します。
 * - 既存データ編集中は「上書き保存」の確認を行います。
 * - 新規データ作成中は「名前を付けて保存」モーダルを開きます。
 */
function saveCurrentDataToList() {
    if (currentDataId) {
        const currentData = dataList.find(d => d.id === currentDataId);
        if (currentData) {
            try {
                currentData.data = getCurrentDataObject();
                currentData.createdAt = new Date().toISOString();
                const existingIndex = dataList.findIndex(data => data.id === currentDataId);
                if (existingIndex !== -1) dataList[existingIndex] = currentData;
                showNotificationBanner(`「${currentData.name}」を保存しました。`, 'success', 1800);
                triggerAutoSave();
                updateDataListSelect();
                updateDataSelectionList();
            } catch (error) {
                showNotificationBanner('データの保存中にエラーが発生しました。', 'error', 3000);
            }
        }
    } else {
        const nameInput = document.getElementById('dataListName');
        nameInput.value = document.getElementById('productName')?.value || '';
        document.getElementById('dataNameModal').style.display = 'block';
        nameInput.focus();
        nameInput.select();
    }
}

/**
 * データ名入力モーダルで「保存」ボタンが押された際の処理。
 * 新しいデータとしてリストに追加します。
 */
function confirmSaveDataToList() {
    const nameInput = document.getElementById('dataListName');
    const name = nameInput.value.trim();

    if (!name) {
        showNotificationBanner('データ名を入力してください。', 'warning');
        return;
    }

    if (dataList.some(data => data.name === name)) {
        if (!confirm(`「${name}」は既に存在します。上書きしますか？`)) {
            return;
        }
        // 既存のデータを上書きする場合
        const existingData = dataList.find(data => data.name === name);
        existingData.data = getCurrentDataObject();
        existingData.createdAt = new Date().toISOString();
        currentDataId = existingData.id;
    } else {
        // 新規データとして追加する場合
        const newData = {
            id: Date.now().toString(),
            name: name,
            data: getCurrentDataObject(),
            createdAt: new Date().toISOString()
        };
        dataList.push(newData);
        currentDataId = newData.id;
    }

    // UIを更新して新しいデータが選択された状態にする
    updateDataListSelect();
    updateSaveButtonUI();
    updateDeleteButtonVisibility();
    updateDataSelectionList();

    closeDataNameModal();
    triggerAutoSave();
    showNotificationBanner(`「${name}」を保存しました。`, 'success', 2000);
}

/**
 * 保存ボタンのUI（アイコンとツールチップ）を現在の状態に合わせて更新します。
 */
function updateSaveButtonUI() {
    const saveBtn = document.getElementById('saveDataToListBtn');
    if (!saveBtn) return;
    const saveIcon = saveBtn.querySelector('i');

    if (currentDataId) {
        // 上書き保存モード
        saveBtn.title = '上書き保存 (Ctrl+S)';
        if(saveIcon) saveIcon.className = 'fas fa-save'; // アイコンは統一
    } else {
        // 新規保存モード
        saveBtn.title = '名前を付けて保存 (Ctrl+S)';
        if(saveIcon) saveIcon.className = 'fas fa-save';
    }
}

/**
 * 選択中のデータをリストから確認なしで即時削除します。
 */
function deleteDataFromList() {
    const select = document.getElementById('dataListSelect');
    const selectedId = select.value;

    if (!selectedId) return;

    const selectedData = dataList.find(data => data.id === selectedId);
    if (!selectedData) return;

    // データリストから削除
    dataList = dataList.filter(data => data.id !== selectedId);

    // 作業配分表の選択リストからも削除
    selectedDataIds = selectedDataIds.filter(id => id !== selectedId);

    // 削除したデータが現在表示中だった場合、新規データ状態にリセット
    if (currentDataId === selectedId) {
        clearAllData(false);
        currentDataId = null;
    }

    // UIを完全に更新
    updateDataListSelect();
    updateSaveButtonUI();
    updateDeleteButtonVisibility();
    updateDataSelectionList();
    triggerAutoSave();
    showNotificationBanner(`「${selectedData.name}」を削除しました。`, 'info', 1500);
}

/**
 * 削除ボタンの表示/非表示を更新します。(新規追加)
 */
function updateDeleteButtonVisibility() {
    const deleteBtn = document.getElementById('deleteDataFromListBtn');
    if(deleteBtn) {
        deleteBtn.style.display = currentDataId ? 'inline-flex' : 'none';
    }
}

/**
 * データ名前入力モーダルを閉じる
 */
function closeDataNameModal() {
    document.getElementById('dataNameModal').style.display = 'none';
    document.getElementById('dataListName').value = '';
}

// ========================================
// Data Selection Management (for Distribution Chart)
// ========================================

/**
 * データ選択リストを更新（アコーディオン対応版）
 */
function updateDataSelectionList() {
    const listContainer = document.getElementById('dataSelectionList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    
    if (dataList.length === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #64748b; font-size: 12px;">保存されたデータがありません</div>';
        updateDataSelectionCount();
        // コンテンツが少ない場合でも高さ更新をトリガー
    } else {
        // 日付順でソート（新しい順）
        const sortedDataList = [...dataList].sort((a, b) => 
            new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        
        sortedDataList.forEach(data => {
            const item = document.createElement('div');
            item.className = 'data-selection-item';
            if (selectedDataIds.includes(data.id)) {
                item.classList.add('selected');
            }
            
            const totalWorkTime = calculateDataTotalWorkTime(data.data, distributionDisplayMode);
            const itemCount = data.data.workItems ? data.data.workItems.length : 0;
            
            item.innerHTML = `
                <input type="checkbox" class="data-selection-checkbox" 
                       ${selectedDataIds.includes(data.id) ? 'checked' : ''} 
                       onchange="toggleDataSelection('${data.id}')">
                <div class="data-selection-name">${data.name}</div>
                <div class="data-selection-info">${itemCount}項目 ${formatTimeDisplay(totalWorkTime)}</div>
            `;
            
            listContainer.appendChild(item);
        });
        
        updateDataSelectionCount();
    }
    
    // ★★★ アコーディオンの高さ調整ロジックを追加 ★★★
    // listContainer を含む .category-content-wrapper を探す
    const wrapper = listContainer.closest('.category-content-wrapper');
    if (wrapper) {
        const parentContent = wrapper.parentElement; // .category-content
        // アコーディオンが開いている場合のみ高さを再計算
        if (parentContent && parentContent.classList.contains('active')) {
            requestAnimationFrame(() => {
                parentContent.style.maxHeight = wrapper.scrollHeight + 'px';
            });
        }
    }
}

/**
 * データの総作業時間を計算（作業配分表用・修正版）
 * @param {Object} data - データオブジェクト
 * @param {string} mode - 'current' または 'improved'
 * @returns {number} - 総作業時間
 */
function calculateDataTotalWorkTime(data, mode) {
    if (!data || !data.workItems) return 0;
    
    if (mode === 'improved') {
        // 改善後の場合：improvedWorkOrderがあればそれを使用、なければworkItemsから計算
        if (data.improvedWorkOrder && Array.isArray(data.improvedWorkOrder)) {
            let total = 0;
            data.improvedWorkOrder.forEach(id => {
                const item = data.workItems.find(i => i.id === id);
                if (item && (item.targetScope || 'common') !== 'current-only') {
                    const improvedData = item.improved || {
                        manualTime: item.manualTime || 0,
                        walkTime: item.walkTime || 0
                    };
                    total += improvedData.manualTime + improvedData.walkTime;
                }
            });
            return total;
        } else {
            // improvedWorkOrderがない場合はworkItemsから改善後データを計算
            return data.workItems.reduce((total, item) => {
                if ((item.targetScope || 'common') === 'current-only') return total;
                const improvedData = item.improved || {
                    manualTime: item.manualTime || 0,
                    walkTime: item.walkTime || 0
                };
                return total + improvedData.manualTime + improvedData.walkTime;
            }, 0);
        }
    } else {
        // 改善前の場合：currentWorkOrderがあればそれを使用、なければworkItemsから計算
        if (data.currentWorkOrder && Array.isArray(data.currentWorkOrder)) {
            let total = 0;
            data.currentWorkOrder.forEach(id => {
                const item = data.workItems.find(i => i.id === id);
                if (item && (item.targetScope || 'common') !== 'improved-only') {
                    total += (item.manualTime || 0) + (item.walkTime || 0);
                }
            });
            return total;
        } else {
            // currentWorkOrderがない場合はworkItemsから改善前データを計算
            return data.workItems.reduce((total, item) => {
                if ((item.targetScope || 'common') === 'improved-only') return total;
                return total + (item.manualTime || 0) + (item.walkTime || 0);
            }, 0);
        }
    }
}


/**
 * データ選択を切り替え
 */
function toggleDataSelection(dataId) {
    const index = selectedDataIds.indexOf(dataId);
    if (index >= 0) {
        selectedDataIds.splice(index, 1);
    } else {
        selectedDataIds.push(dataId);
    }
    
    updateDataSelectionList();
    triggerAutoSave();
    
    if (currentMainTab === 'distribution') {
        if (typeof adjustDistributionCanvasWidth === 'function') adjustDistributionCanvasWidth();
        updateDistributionChart();
    }
    updateVariabilityEditor();
}

/**
 * 全データを選択
 */
function selectAllData() {
    selectedDataIds = dataList.map(data => data.id);
    updateDataSelectionList();
    triggerAutoSave();
    
    if (currentMainTab === 'distribution') {
        if (typeof adjustDistributionCanvasWidth === 'function') adjustDistributionCanvasWidth();
        updateDistributionChart();
    }
    updateVariabilityEditor(); 
}

/**
 * 全選択を解除
 */
function clearAllSelections() {
    selectedDataIds = [];
    updateDataSelectionList();
    triggerAutoSave();
    
    if (currentMainTab === 'distribution') {
        if (typeof adjustDistributionCanvasWidth === 'function') adjustDistributionCanvasWidth();
        updateDistributionChart();
    }
    updateVariabilityEditor();
}

/**
 * 作業配分表更新（修正版：初期化状態チェック強化）
 */
function updateDistributionChart() {
    safeUpdateChart('distribution', () => {
        if (!distributionCanvas || !distributionCtx) return;
        
        const selectedData = dataList.filter(data => selectedDataIds.includes(data.id));
        
        if (selectedData.length === 0) {
            drawEmptyDistributionChart();
            return;
        }
        
        drawDistributionChart(selectedData);
    });
}

// app.js

/**
 * 空の作業配分表を描画
 */
function drawEmptyDistributionChart() {
    distributionCtx.clearRect(0, 0, distributionCanvas.width, distributionCanvas.height);
    
    // 背景
    distributionCtx.fillStyle = '#ffffff';
    distributionCtx.fillRect(0, 0, distributionCanvas.width, distributionCanvas.height);

    // 高解像度対応のため、表示上の幅と高さを取得
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = distributionCanvas.width / devicePixelRatio;
    const canvasDisplayHeight = distributionCanvas.height / devicePixelRatio;
    
    // メッセージ（ビジネス用デザイン）
    distributionCtx.fillStyle = '#64748b';
    distributionCtx.font = '16px "Segoe UI", sans-serif';
    distributionCtx.textAlign = 'center';
    distributionCtx.fillText(
        'データを選択して作業配分表を表示してください',
        canvasDisplayWidth / 2,
        canvasDisplayHeight / 2
    );
    
    // サブメッセージ
    distributionCtx.fillStyle = '#94a3b8';
    distributionCtx.font = '12px "Segoe UI", sans-serif';
    distributionCtx.fillText(
        '左パネルからデータを選択できます',
        canvasDisplayWidth / 2, // 修正点：表示幅の中央に配置
        canvasDisplayHeight / 2 + 30
    );
}

// ========================================
// CSV Import/Export Functions (Business Enhanced)
// ========================================

/**
 * CSVインポート情報モーダルを表示
 */
function showCSVImportInfo() {
    selectCSVFile();
}

/**
 * CSVインポート情報モーダルを閉じる
 */
function closeCsvImportModal() {
    document.getElementById('csvImportModal').style.display = 'none';
}

/**
 * CSVファイル選択
 */
function selectCSVFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            importCSVFile(file);
        }
    };
    input.click();
}



// ========================================
// Work Order Alignment Function
// ========================================

/**
 * 改善後の並び順を改善前に揃える（強化版：視覚的フィードバック・プログレス表示付き）
 */
function alignImprovedOrder() {
    if (currentWorkOrder.length === 0) {
        showNotificationBanner('改善前の作業項目がありません。', 'warning', 2000);
        return;
    }
    
    // より詳細な確認ダイアログ
    const currentCount = currentWorkOrder.length;
    const improvedCount = improvedWorkOrder.length;
    const willChange = JSON.stringify(currentWorkOrder) !== JSON.stringify(improvedWorkOrder);
    
    if (!willChange) {
        showNotificationBanner('改善前と改善後の並び順は既に同じです。', 'info', 2000);
        return;
    }
    
    const confirmMessage = `改善後の並び順を改善前と同じにしますか？\n\n` +
        `📋 改善前: ${currentCount}項目\n` +
        `📋 改善後: ${improvedCount}項目\n\n` +
        `この操作により改善後の作業順序が変更されます。`;
    
    if (confirm(confirmMessage)) {
        // 視覚的フィードバックの開始
        const alignButton = document.querySelector('button[onclick="alignImprovedOrder()"]');
        const originalButtonContent = alignButton.innerHTML;
        
        // ボタンをローディング状態に変更
        alignButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>処理中...';
        alignButton.disabled = true;
        alignButton.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        alignButton.style.transform = 'scale(0.98)';
        
        // プログレス表示用のバナー
        showProgressBanner('作業順序を整列しています...', 'processing');
        
        // 実際の処理を少し遅延して実行（視覚的フィードバックのため）
        setTimeout(() => {
            try {
                // 元の順序を保存（Undo機能のため）
                const previousImprovedOrder = [...improvedWorkOrder];
                
                // 改善前の順序を改善後にコピー
                improvedWorkOrder = [...currentWorkOrder];
                
                // 成功エフェクト
                alignButton.style.background = 'linear-gradient(135deg, var(--success-color) 0%, #047857 100%)';
                alignButton.innerHTML = '<i class="fas fa-check"></i>完了';
                
                setTimeout(() => {
                    // ボタンを元に戻す
                    alignButton.innerHTML = originalButtonContent;
                    alignButton.disabled = false;
                    alignButton.style.background = '';
                    alignButton.style.transform = '';
                    
                    // チャートを更新
                    updateChart();
                    triggerAutoSave();
                    
                    // 成功バナーに変更
                    showProgressBanner('', 'complete');
                    
                    // 詳細な成功通知
                    const successMessage = `✅ 改善後の並び順を改善前に揃えました。\n` +
                        `📊 ${currentWorkOrder.length}項目の順序が更新されました。`;
                    
                    showNotificationBanner(successMessage, 'success', 3000);
                    
                    // Undo機能の提供（10秒間）
                    setTimeout(() => {
                        showUndoOption(previousImprovedOrder);
                    }, 500);
                    
                }, 800);
                
            } catch (error) {
                console.error('Error in alignImprovedOrder:', error);
                
                // エラー処理
                alignButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>エラー';
                alignButton.style.background = 'linear-gradient(135deg, var(--accent-color) 0%, #b91c1c 100%)';
                
                setTimeout(() => {
                    alignButton.innerHTML = originalButtonContent;
                    alignButton.disabled = false;
                    alignButton.style.background = '';
                    alignButton.style.transform = '';
                }, 2000);
                
                showNotificationBanner('並び順の整列中にエラーが発生しました。', 'error', 3000);
                showProgressBanner('', 'error');
            }
        }, 600);
    }
}

/**
 * プログレス表示バナー（新規追加）
 * @param {string} message - 表示メッセージ
 * @param {string} type - バナータイプ ('processing', 'complete', 'error')
 */
function showProgressBanner(message, type) {
    // 既存のプログレスバナーを削除
    const existingBanner = document.getElementById('progressBanner');
    if (existingBanner) {
        existingBanner.remove();
    }
    
    if (!message && type === 'complete') {
        return; // 完了時にメッセージがない場合は何もしない
    }
    
    if (!message) {
        return; // メッセージがない場合は表示しない
    }
    
    // プログレスバナーを作成
    const banner = document.createElement('div');
    banner.id = 'progressBanner';
    banner.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2500;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
        backdrop-filter: blur(8px);
    `;
    
    switch (type) {
        case 'processing':
            banner.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            banner.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>${message}`;
            break;
        case 'complete':
            banner.style.background = 'linear-gradient(135deg, var(--success-color) 0%, #047857 100%)';
            banner.innerHTML = `<i class="fas fa-check" style="margin-right: 8px;"></i>${message}`;
            break;
        case 'error':
            banner.style.background = 'linear-gradient(135deg, var(--accent-color) 0%, #b91c1c 100%)';
            banner.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>${message}`;
            break;
    }
    
    document.body.appendChild(banner);
    
    // フェードイン
    requestAnimationFrame(() => {
        banner.style.opacity = '1';
        banner.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    // 自動消去
    setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateX(-50%) translateY(-10px)';
        setTimeout(() => {
            if (banner.parentNode) {
                banner.remove();
            }
        }, 300);
    }, 2500);
}

/**
 * Undo機能の提供（新規追加）
 * @param {Array} previousOrder - 以前の改善後順序
 */
function showUndoOption(previousOrder) {
    // Undoバナーを作成
    const undoBanner = document.createElement('div');
    undoBanner.id = 'undoBanner';
    undoBanner.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2500;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        background: linear-gradient(135deg, #374151 0%, #4b5563 100%);
        color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        transition: all 0.3s ease;
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 300px;
    `;
    
    undoBanner.innerHTML = `
        <i class="fas fa-undo" style="color: #fbbf24;"></i>
        <span style="flex: 1;">並び順を元に戻しますか？</span>
        <button id="undoButton" style="
            background: #fbbf24; 
            color: #1f2937; 
            border: none; 
            border-radius: 4px; 
            padding: 4px 8px; 
            font-size: 11px; 
            font-weight: 600; 
            cursor: pointer; 
            transition: all 0.2s ease;
        ">戻す</button>
        <button id="dismissUndo" style="
            background: transparent; 
            color: #94a3b8; 
            border: none; 
            padding: 4px; 
            font-size: 16px; 
            cursor: pointer; 
            transition: all 0.2s ease;
        ">×</button>
    `;
    
    document.body.appendChild(undoBanner);
    
    // フェードイン
    requestAnimationFrame(() => {
        undoBanner.style.opacity = '1';
        undoBanner.style.transform = 'translateX(0)';
    });
    
    // Undoボタンのイベントリスナー
    document.getElementById('undoButton').addEventListener('click', () => {
        improvedWorkOrder = [...previousOrder];
        updateChart();
        triggerAutoSave();
        
        // Undoバナーを削除
        undoBanner.style.opacity = '0';
        undoBanner.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (undoBanner.parentNode) {
                undoBanner.remove();
            }
        }, 300);
        
        showNotificationBanner('並び順を元に戻しました。', 'info', 2000);
    });
    
    // 閉じるボタンのイベントリスナー
    document.getElementById('dismissUndo').addEventListener('click', () => {
        undoBanner.style.opacity = '0';
        undoBanner.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (undoBanner.parentNode) {
                undoBanner.remove();
            }
        }, 300);
    });
    
    // 10秒後に自動消去
    setTimeout(() => {
        if (undoBanner.parentNode) {
            undoBanner.style.opacity = '0';
            undoBanner.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (undoBanner.parentNode) {
                    undoBanner.remove();
                }
            }, 300);
        }
    }, 10000);
}

// ========================================
// Data Management Functions (Business Enhanced)
// ========================================

/**
 * 全データをクリア（修正版：稼働時間管理のデフォルト値設定を追加）
 */
function clearAllData(showConfirm = true) {
    const shouldClear = showConfirm ? 
        confirm('すべてのデータをクリアしますか？\n\nこの操作は取り消せません。') : 
        true;
    
    if (shouldClear) {
        // 基本データをリセット
        workItems = [];
        frequencyWorkItems = [];
        currentWorkOrder = [];
        improvedWorkOrder = [];
        taktTime = 36.0;
        currentEditingId = null;
        currentEditingFrequencyId = null;
        currentEditingTimeSlotId = null;
        insertPosition = -1;
        hoveredRowIndex = -1;
        selectedRowIndices = [];
        lastSelectedRowIndex = -1;
        insertRowIndex = -1;
        currentDataId = null;
        selectedDataIds = []; 
        
        // デフォルトの時間帯データを設定
        timeSlots = [
            { id: Date.now() + 1, name: '朝礼', type: 'meeting', startTime: '08:00', endTime: '08:30', notes: '' },
            { id: Date.now() + 2, name: '始業点検', type: 'inspection', startTime: '08:30', endTime: '09:00', notes: '' },
            { id: Date.now() + 3, name: '午前休憩', type: 'break', startTime: '10:30', endTime: '10:45', notes: '' },
            { id: Date.now() + 4, name: '昼休憩', type: 'break', startTime: '12:00', endTime: '13:00', notes: '' },
            { id: Date.now() + 5, name: '午後休憩', type: 'break', startTime: '15:00', endTime: '15:30', notes: '' },
            { id: Date.now() + 6, name: '清掃', type: 'cleaning', startTime: '17:00', endTime: '17:30', notes: '' },
            { id: Date.now() + 7, name: 'その他', type: 'other', startTime: '17:30', endTime: '18:00', notes: '' }
        ];
        
        // デフォルトの稼働時間設定
        scheduleConfig = {
            startTime: '08:00',
            workHours: 8,
            endTime: '' // updateScheduleConfigで再計算
        };

        // フォームをリセットまたはデフォルト値に設定
        document.getElementById('productName').value = '';
        document.getElementById('operatorName').value = '';
        document.getElementById('operatingTime').value = '420';
        document.getElementById('requiredQuantity').value = '800';
        
        // 標準手持ちをリセット
        standardWIP = 0;
        const standardWIPResetEl = document.getElementById('standardWIPInput');
        if (standardWIPResetEl) standardWIPResetEl.value = 0;
        const standardWIPLotCountEl = document.getElementById('standardWIPLotCount');
        if (standardWIPLotCountEl) standardWIPLotCountEl.textContent = 1;
        if (typeof updateLotOptions === 'function') updateLotOptions();
        
        // チャート表示設定をデフォルトにリセット
        // グローバル変数とチェックボックスを同時に同期する（不一致バグ修正）
        showGanttChart     = true;
        showProcessChart   = false;
        showFrequencyChart = true;

        const showGanttChartCheckbox = document.getElementById('showGanttChart');
        if (showGanttChartCheckbox) showGanttChartCheckbox.checked = showGanttChart;

        const showProcessChartCheckbox = document.getElementById('showProcessChart');
        if (showProcessChartCheckbox) showProcessChartCheckbox.checked = showProcessChart;

        const showFrequencyChartCheckbox = document.getElementById('showFrequencyChart');
        if (showFrequencyChartCheckbox) showFrequencyChartCheckbox.checked = showFrequencyChart;

        const ganttChartOptionsContainer = document.getElementById('ganttChartOptionsContainer');
        if (ganttChartOptionsContainer) ganttChartOptionsContainer.classList.add('visible');
        
        // 稼働時間設定フォームにデフォルト値を反映
        document.getElementById('scheduleStartTime').value = '08:00';
        document.getElementById('scheduleWorkHours').value = '8';
        
        // データリスト選択をリセット
        document.getElementById('dataListSelect').value = '';
        document.getElementById('deleteDataFromListBtn').style.display = 'none';
        
        // 表示モードをリセット
        switchDisplayMode('current');
        switchMainTab('gantt');
        
        // UI更新
        calculateTaktTime(false);
        updateScheduleConfig();
        updateTimeSlotList();
        updateFrequencyWorkList();
        updateWorkingTimeDisplay();
        updateChart();
        updateScheduleChart();
        triggerAutoSave();
        
        if (showConfirm) {
            showNotificationBanner('すべてのデータをクリアし、デフォルト値を設定しました。', 'success', 2000);
        }
    }
}

// ========================================
// Utility Functions (Business Enhanced)
// ========================================

/**
 * 時間表示フォーマット関数（整数秒前提・修正版）
 * @param {number} totalSeconds - 総秒数（整数）
 * @returns {string} - フォーマットされた時間文字列
 */
function formatTimeDisplay(totalSeconds) {
    // 入力値を整数秒に確実に変換
    const seconds = Math.round(Math.abs(totalSeconds || 0));
    
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        
        let result = `${hours}h`;
        if (minutes > 0) result += `${minutes}m`;
        if (remainingSeconds > 0) result += `${remainingSeconds}s`;
        return result;
    }
}

/**
 * 頻度作業チャート専用：小数点第1位まで表示するフォーマッタ
 * 換算値など小数秒が生じるケースで精度を落とさず表示する。
 * 例: 5.3s / 1m30.5s / 1h2m30.5s
 * @param {number} totalSeconds - 秒数（小数可）
 * @returns {string}
 */
function formatTimeDisplayDecimal(totalSeconds) {
    const absVal = Math.abs(totalSeconds || 0);
    if (absVal < 60) {
        // 小数第1位、末尾の .0 は省略
        const rounded = Math.round(absVal * 10) / 10;
        return rounded % 1 === 0 ? `${rounded}s` : `${rounded.toFixed(1)}s`;
    } else if (absVal < 3600) {
        const minutes = Math.floor(absVal / 60);
        const remSec  = Math.round((absVal - minutes * 60) * 10) / 10;
        const secStr  = remSec > 0
            ? (remSec % 1 === 0 ? `${remSec}s` : `${remSec.toFixed(1)}s`)
            : '';
        return `${minutes}m${secStr}`;
    } else {
        const hours   = Math.floor(absVal / 3600);
        const remMin  = Math.floor((absVal % 3600) / 60);
        const remSec  = Math.round((absVal % 60) * 10) / 10;
        let result    = `${hours}h`;
        if (remMin  > 0) result += `${remMin}m`;
        if (remSec  > 0) result += remSec % 1 === 0 ? `${remSec}s` : `${remSec.toFixed(1)}s`;
        return result;
    }
}

/**
 * 秒を時分秒コンポーネントに分解（整数秒前提・修正版）
 * @param {number} totalSeconds - 総秒数（整数）
 * @returns {object} - {hours, minutes, seconds}
 */
function secondsToComponents(totalSeconds) {
    const seconds = Math.round(Math.abs(totalSeconds || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return { hours, minutes, seconds: remainingSeconds };
}

/**
 * 時分秒コンポーネントから総秒数を計算（整数秒返却・修正版）
 * @param {number} hours - 時間
 * @param {number} minutes - 分
 * @param {number} seconds - 秒
 * @returns {number} - 総秒数（整数）
 */
function componentsToSeconds(hours, minutes, seconds) {
    const totalSeconds = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0);
    return Math.round(totalSeconds);
}

/**
 * Y座標から行インデックスを取得（併記モード対応版・正確な計算）
 * @param {number} y - Y座標（Canvas座標系）
 * @returns {number} - 行インデックス（-1: 無効）
 */
function getRowIndexFromY(y) {
    const relativeY = y - TOP_MARGIN;
    
    // Y座標が上部マージンより上の場合は無効
    if (relativeY < 0) return -1;
    
    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    const index = Math.floor(relativeY / effectiveRowHeight);
    
    // ★★★ 修正：統一された行数計算を使用して範囲チェック ★★★
    const totalDisplayRows = getTotalDisplayRows();
    
    // 総行数の範囲内のみ有効（範囲チェックを厳密に）
    if (index >= 0 && index < totalDisplayRows) {
        // さらに詳細な範囲チェック：行の境界を正確に判定
        const rowStartY = TOP_MARGIN + (index * effectiveRowHeight);
        const rowEndY = rowStartY + effectiveRowHeight;
        
        if (y >= rowStartY && y < rowEndY) {
            return index;
        }
    }
    
    return -1;
}

/**
 * 頻度作業ピルボタンのトグルハンドラ
 * ボタンクリックで ON/OFF を反転し、ラベルと表示を更新する。
 *
 * Stateful Button Pattern:
 *   OFF → ラベル「頻度作業含まず」: クリックすると頻度作業込みC/Tを開示
 *   ON  → ラベル「頻度作業含む」 : クリックすると非表示に戻す
 */
function toggleFreqIncludedDisplay() {
    // グローバル状態をトグル
    window.freqIncludedOn = !window.freqIncludedOn;
    // 再計算でUI全体を更新
    calculateImprovementEffectsIntegrated();
}

/**
 * 改善効果を計算（修正版：エラーハンドリング強化・空データ対策）
 */
function calculateImprovementEffectsIntegrated() {
    try {
        // データの存在チェック
        if (!workItems || !Array.isArray(workItems) || workItems.length === 0) {
            const improvementSummary = document.getElementById('improvementSummary');
            if (improvementSummary) improvementSummary.style.display = 'none';
            updateIntegratedCycleTimeDisplay(0, 0, 0, 0);
            return;
        }

        // ★ チャートと同じ計算関数を使用（targetScope・workOrderフィルタを統一）
        // これによりチャート上のC/T線とKPIパネルの値が完全に一致する
        const currentTotal  = Math.round(calculateTotalCycleTimeForMode('current'));
        const improvedTotal = Math.round(calculateTotalCycleTimeForMode('improved'));

        const timeReduction = Math.round(currentTotal - improvedTotal);
        const efficiencyGain = currentTotal > 0 ? ((timeReduction / currentTotal) * 100) : 0;

        updateIntegratedCycleTimeDisplay(currentTotal, improvedTotal, timeReduction, efficiencyGain);

    } catch (error) {
        console.error('Error in calculateImprovementEffectsIntegrated:', error);
        try { updateIntegratedCycleTimeDisplay(0, 0, 0, 0); } catch (e) {}
    }
}


/**
 * 頻度作業の換算時間合計を計算する
 * @param {string} mode - 'current' | 'improved'
 * @returns {number} 全頻度作業の換算時間合計（秒）
 */
function calculateTotalFrequencyImpact(mode) {
    if (!frequencyWorkItems || !Array.isArray(frequencyWorkItems) || frequencyWorkItems.length === 0) return 0;
    return frequencyWorkItems.reduce((sum, item) => {
        try {
            let workTime, frequency;
            if (mode === 'improved' && item.improved) {
                workTime  = item.improved.workTime  ?? item.workTime;
                frequency = item.improved.frequency ?? item.frequency;
            } else {
                workTime  = item.workTime;
                frequency = item.frequency;
            }
            const { impactTime } = calculateFrequencyImpactWithFormula(workTime, frequency, mode);
            return sum + (isFinite(impactTime) ? impactTime : 0);
        } catch (e) { return sum; }
    }, 0);
}

/**
 * 統合サイクルタイム表示の更新
 * ─────────────────────────────────────────────────────
 * 表示レイアウト（認知心理学設計）:
 *
 *  [改善前] 36s  [まとめ 12s/個]    ← 主要値 + まとめ換算（同行・軽量表示）
 *  頻度込み  42s  (+6s)  ⚠          ← 派生値（独立行・T/T超過時アラート色）
 *  短縮: -4s  効率: +10%            ← 改善効果（改善後/併記時のみ）
 *
 * 設計根拠：
 * ・近接の法則：実C/T ↔ まとめ換算は同行に。頻度込みは独立行で明示
 * ・段階的開示：頻度作業0件 → 頻度行非表示 / まとめOFF → まとめ非表示
 * ・意味の階層：主値(大) > 換算(中) > 補足(小) の視覚的重みで認知負荷を低減
 * ・T/T超過警告：赤色 + アイコンで「収まっていない」を即時認識させる
 * ─────────────────────────────────────────────────────
 * @param {number} currentTotal  - 改善前総時間（整数秒）
 * @param {number} improvedTotal - 改善後総時間（整数秒）
 * @param {number} timeReduction - 時間短縮（整数秒）
 * @param {number} efficiencyGain - 効率向上率（%）
 */
function updateIntegratedCycleTimeDisplay(currentTotal, improvedTotal, timeReduction, efficiencyGain) {
    try {
        const mainTimeDisplay       = document.getElementById('mainTotalTimeDisplay');
        const cycleTimeModeDisplay  = document.getElementById('cycleTimeMode');
        const improvementSummary    = document.getElementById('improvementSummary');
        const timeReductionCompact  = document.getElementById('timeReductionCompact');
        const efficiencyGainCompact = document.getElementById('efficiencyGainCompact');

        if (!mainTimeDisplay) return;

        const roundedCurrentTotal  = Math.round(currentTotal  || 0);
        const roundedImprovedTotal = Math.round(improvedTotal || 0);
        const roundedTimeReduction = Math.round(timeReduction || 0);

        // ── ① プライマリ C/T 表示 ────────────────────────────────
        let displayTime, modeText;
        switch (displayMode) {
            case 'improved': case 'both':
                displayTime = roundedImprovedTotal; modeText = '改善後'; break;
            case 'current': default:
                displayTime = roundedCurrentTotal;  modeText = '改善前';
        }
        mainTimeDisplay.textContent = formatTimeDisplay(displayTime);
        if (cycleTimeModeDisplay) cycleTimeModeDisplay.textContent = modeText;

        // ── ② まとめづくり換算バッジ（同行・コンパクト） ──────────
        // 実C/T（N個分）のすぐ右に「まとめ NN s/個」を省スペースで付加する。
        // T/Tと比較するための1個当たり換算値が即座に読み取れる。
        const batchBadge      = document.getElementById('batchInlineBadge');
        const batchBadgeTime  = document.getElementById('batchBadgeTime');
        const batchBadgeNote  = document.getElementById('batchBadgeNote');

        const isBatch  = (typeof batchMode !== 'undefined') && batchMode &&
                         (typeof batchQuantity !== 'undefined') && batchQuantity > 1;
        const batchQty = isBatch ? batchQuantity : 1;

        if (batchBadge) {
            if (isBatch && displayTime > 0) {
                const convertedPerItem = Math.round(displayTime / batchQty);
                if (batchBadgeTime) batchBadgeTime.textContent = formatTimeDisplay(convertedPerItem);
                if (batchBadgeNote) batchBadgeNote.textContent = `/個 (÷${batchQty})`;
                batchBadge.style.display = 'inline-flex';
            } else {
                batchBadge.style.display = 'none';
            }
        }

        // ── ③ 頻度作業込みC/T（ピルボタン連動・Stateful Button Pattern） ──
        // デフォルトOFF → ボタンクリックで開示する段階的開示設計。
        // ボタン文字が状態を示す（「含まず」→クリックで「含む」に変化）。
        const freqRow       = document.getElementById('freqIncludedRow');
        const freqTimeEl    = document.getElementById('freqIncludedTime');
        const freqDeltaEl   = document.getElementById('freqIncludedDelta');
        const freqAlertEl   = document.getElementById('freqIncludedAlert');
        const freqCard      = document.getElementById('mainTotalWorkTimeCard');
        const freqToggleRow = document.getElementById('freqToggleRow');
        const freqPillBtn   = document.getElementById('freqToggleBtn');
        const freqLabel     = document.getElementById('freqIncludedLabel');

        const freqMode      = (displayMode === 'improved' || displayMode === 'both') ? 'improved' : 'current';
        const freqImpact    = Math.round(calculateTotalFrequencyImpact(freqMode));
        const hasFreqItems  = frequencyWorkItems && frequencyWorkItems.length > 0;

        if (freqRow) {
            if (hasFreqItems && displayTime > 0) {
                // 頻度作業あり: エリア全体を表示
                if (freqToggleRow) freqToggleRow.style.display = 'flex';

                // T/T超過判定（ON/OFF問わず計算）
                const freqTotal   = displayTime + freqImpact;
                const effectiveTT = (typeof taktTime !== 'undefined' && taktTime > 0) ? taktTime : 0;
                const compareTT   = isBatch ? effectiveTT * batchQty : effectiveTT;
                const isOver      = compareTT > 0 && freqTotal > compareTT;

                const isOn = !!window.freqIncludedOn;

                // ── ピルボタンの状態スタイル更新 ──
                if (freqPillBtn) {
                    freqPillBtn.classList.toggle('active', isOn);
                    freqPillBtn.classList.toggle('over-takt', isOn && isOver);
                }
                if (freqLabel) {
                    freqLabel.textContent = isOn ? '頻度作業含む' : '頻度作業含まず';
                }

                if (isOn) {
                    // ON: 頻度込みC/T値行を表示
                    if (freqTimeEl) {
                        freqTimeEl.textContent = formatTimeDisplay(freqTotal);
                        freqTimeEl.classList.toggle('over-takt', isOver);
                    }
                    if (freqDeltaEl) {
                        freqDeltaEl.textContent  = `(+${formatTimeDisplay(freqImpact)})`;
                        freqDeltaEl.style.display = freqImpact > 0 ? 'inline' : 'none';
                    }
                    if (freqAlertEl) freqAlertEl.style.display = isOver ? 'inline' : 'none';
                    freqRow.style.display = 'flex';
                    if (freqCard) freqCard.classList.toggle('cycle-card-freq-over', isOver);
                } else {
                    // OFF: 値行を隠す
                    freqRow.style.display = 'none';
                    if (freqCard) freqCard.classList.remove('cycle-card-freq-over');
                }
            } else {
                // 頻度作業なし or C/T=0: エリア全体を非表示・状態リセット
                if (freqToggleRow) freqToggleRow.style.display = 'none';
                window.freqIncludedOn = false;
                if (freqPillBtn) {
                    freqPillBtn.classList.remove('active', 'over-takt');
                }
                if (freqLabel) freqLabel.textContent = '頻度作業含まず';
                freqRow.style.display = 'none';
                if (freqCard) freqCard.classList.remove('cycle-card-freq-over');
            }
        }

        // ── ④ 改善効果表示（短縮・効率）：カードからはみ出すため非表示 ──
        if (improvementSummary) {
            improvementSummary.style.display = 'none';
        }

    } catch (error) {
        console.error('Critical error in updateIntegratedCycleTimeDisplay:', error);
    }
}

/**
 * 表示モード切り替え処理（修正版：安全なチャート更新）
 * @param {string} mode - 表示モード（'current', 'improved', 'both'）
 */
/**
 * オーバーレイトグルボタンの視覚状態を displayMode に同期する
 * @param {string} mode - 'current' | 'improved' | 'both'
 */
function syncDisplayModeOverlay(mode) {
    const currentBtn  = document.getElementById('dmCurrentBtn');
    const improvedBtn = document.getElementById('dmImprovedBtn');
    const overlay     = document.getElementById('displayModeOverlay');
    if (!currentBtn || !improvedBtn) return;

    const isCurrentOn  = (mode === 'current'  || mode === 'both');
    const isImprovedOn = (mode === 'improved' || mode === 'both');

    currentBtn.classList.toggle('active',  isCurrentOn);
    improvedBtn.classList.toggle('active', isImprovedOn);

    if (overlay) {
        overlay.classList.toggle('mode-both',     mode === 'both');
        overlay.classList.toggle('mode-improved', mode === 'improved' && mode !== 'both');
    }
}

/**
 * オーバーレイトグルボタン押下時のロジック
 * ・両方 ON → 'both'
 * ・改善前のみ ON → 'current'
 * ・改善後のみ ON → 'improved'
 * ・最後の1つを OFF しようとした場合は操作を無視（常に1つ以上アクティブを保証）
 * @param {string} type - 'current' | 'improved'
 */
function toggleDisplayModeButton(type) {
    const currentBtn  = document.getElementById('dmCurrentBtn');
    const improvedBtn = document.getElementById('dmImprovedBtn');
    if (!currentBtn || !improvedBtn) return;

    const currentOn  = currentBtn.classList.contains('active');
    const improvedOn = improvedBtn.classList.contains('active');

    let newCurrentOn  = currentOn;
    let newImprovedOn = improvedOn;

    if (type === 'current') {
        newCurrentOn = !currentOn;
    } else {
        newImprovedOn = !improvedOn;
    }

    // 両方OFF になる操作は無視（少なくとも1つはON）
    if (!newCurrentOn && !newImprovedOn) return;

    let newMode;
    if (newCurrentOn && newImprovedOn) newMode = 'both';
    else if (newCurrentOn)             newMode = 'current';
    else                               newMode = 'improved';

    switchDisplayMode(newMode);
}

function switchDisplayMode(mode) {
    try {
        const previousMode = displayMode;
        displayMode = mode;
        // 表示モード変更時は干渉バッジの非表示状態をリセット
        if (typeof resetGanttConflictBadgeDismiss === 'function') resetGanttConflictBadgeDismiss();
        
        // ボタンのアクティブ状態更新（エラーハンドリング付き）
        try {
            // オーバーレイトグルボタンを同期
            syncDisplayModeOverlay(mode);
            // 旧 .mode-button との後方互換（他にあれば更新）
            document.querySelectorAll('.mode-button').forEach(btn => {
                if (btn) btn.classList.remove('active');
            });
            const targetButton = document.getElementById(`${mode}ModeBtn`);
            if (targetButton) {
                targetButton.classList.add('active');
            }
        } catch (buttonError) {
            console.warn('Error updating mode buttons:', buttonError);
            // ボタン更新エラーでも処理は継続
        }
        
        // 改善効果計算（安全な実行）
        try {
            if (mode === 'improved' || mode === 'both') {
                // データが存在する場合のみ改善効果を計算
                if (workItems && workItems.length > 0) {
                    calculateImprovementEffectsIntegrated();
                } else {
                    // データが無い場合は改善効果を非表示
                    const improvementSummary = document.getElementById('improvementSummary');
                    if (improvementSummary) {
                        improvementSummary.style.display = 'none';
                    }
                }
            } else {
                // 改善前モードでは改善効果を非表示
                const improvementSummary = document.getElementById('improvementSummary');
                if (improvementSummary) {
                    improvementSummary.style.display = 'none';
                }
                
                // サイクルタイム表示を更新（安全な実行）
                try {
                    updateIntegratedCycleTimeDisplay(
                        calculateTotalCycleTimeForMode('current'),
                        calculateTotalCycleTimeForMode('improved'),
                        0,
                        0
                    );
                } catch (cycleTimeError) {
                    console.warn('Error updating cycle time display:', cycleTimeError);
                }
            }
        } catch (improvementError) {
            console.warn('Error calculating improvement effects:', improvementError);
        }
        
        // ★修正：安全なチャート更新
        try {
            safeUpdateChart('main', () => {
                if (typeof updateChart === 'function') updateChart();
            });
        } catch (chartError) {
            console.warn('Error updating main chart:', chartError);
        }
        
        try {
            safeUpdateChart('frequency', () => {
                if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
            });
        } catch (frequencyError) {
            console.warn('Error updating frequency chart:', frequencyError);
        }
        
        // オートセーブ実行
        try {
            if (typeof triggerAutoSave === 'function') {
                triggerAutoSave();
            }
        } catch (saveError) {
            console.warn('Error triggering auto save:', saveError);
        }
        
        // モード切替通知
        try {
            const modeLabels = {
                current: '改善前',
                improved: '改善後', 
                both: '併記'
            };
            
            const modeName = modeLabels[mode] || mode;
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner(`表示モードを「${modeName}」に変更しました。`, 'info', 1500);
            }
        } catch (notificationError) {
            console.warn('Error showing notification:', notificationError);
        }
        
    } catch (error) {
        console.error('Critical error in switchDisplayMode:', error);
        
        // 致命的エラー時は元のモードに戻す
        try {
            if (previousMode && previousMode !== mode) {
                displayMode = previousMode;
                syncDisplayModeOverlay(previousMode);
                const fallbackButton = document.getElementById(`${previousMode}ModeBtn`);
                if (fallbackButton) {
                    document.querySelectorAll('.mode-button').forEach(btn => {
                        if (btn) btn.classList.remove('active');
                    });
                    fallbackButton.classList.add('active');
                }
            }
        } catch (fallbackError) {
            console.error('Error in fallback mode restoration:', fallbackError);
        }
        
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('表示モードの切り替えでエラーが発生しました。前のモードに戻しました。', 'error', 2500);
        }
    }
}

/**
 * 改善後モード用の表示項目取得（修正版：正確な順序とデータ）
 * @returns {Array} - 表示用作業項目リスト
 */
function getImprovedModeDisplayItems() {
    // improvedWorkOrderを使用して正確な順序で項目を取得
    return improvedWorkOrder
        .map(id => workItems.find(item => item.id === id))
        .filter(item => {
            if (!item) return false;
            const targetScope = item.targetScope || 'common';
            // 改善前のみの項目は除外
            return targetScope !== 'current-only';
        });
}

/**
 * 表示用作業項目リストを取得（グループ・まとめ機能対応版）
 * @returns {Array} - 表示用作業項目リスト
 */
function getDisplayWorkItems() {
    try {
        if (!workItems || !Array.isArray(workItems)) return [];
        if (!currentWorkOrder || !Array.isArray(currentWorkOrder)) return [];
        
        let targetOrder = displayMode === 'improved' ? improvedWorkOrder : currentWorkOrder;
        let groups = displayMode === 'improved' ? improvedWorkGroups : currentWorkGroups;
        
        // 併記モードの場合はグループ化を無視してフラットに表示
        if (displayMode === 'both') {
            return currentWorkOrder
                .map(id => workItems.find(item => item.id === id))
                .filter(item => item && (item.targetScope || 'common') !== 'improved-only');
        }
        
        let result = [];
        let i = 0;
        while (i < targetOrder.length) {
            const id = targetOrder[i];
            const group = groups.find(g => g.itemIds.includes(id));
            
            if (group && group.itemIds[0] === id) {
                // グループの開始
                const groupItems = group.itemIds.map(gid => workItems.find(it => it.id === gid)).filter(Boolean);
                
                // 対象スコープのフィルタリング
                const validGroupItems = groupItems.filter(item => {
                    const scope = item.targetScope || 'common';
                    if (displayMode === 'improved') return scope !== 'current-only';
                    return scope !== 'improved-only';
                });
                
                if (validGroupItems.length > 0) {
                    if (group.collapsed) {
                        // まとめて1行にするダミー要素
                        // 単純加算ではなく、手作業・歩行を優先し、自動送りが重なる場合ははみ出る部分のみを加算する
                        let sumManual = 0, sumAuto = 0, sumWalk = 0;
                        let currentTime = 0;
                        let maxAutoEnd = 0;

                        validGroupItems.forEach(item => {
                            let mTime = 0, aTime = 0, wTime = 0;
                            if (displayMode === 'improved' && item.improved) {
                                mTime = item.improved.manualTime || 0;
                                aTime = item.improved.autoTime || 0;
                                wTime = item.improved.walkTime || 0;
                            } else {
                                mTime = item.manualTime || 0;
                                aTime = item.autoTime || 0;
                                wTime = item.walkTime || 0;
                            }

                            sumManual += mTime;
                            sumWalk += wTime;

                            // 自動送りが手作業終了後に始まり、後続の手作業・歩行と重なる場合を考慮
                            if (aTime > 0) {
                                let autoEnd = currentTime + mTime + aTime;
                                if (autoEnd > maxAutoEnd) {
                                    maxAutoEnd = autoEnd;
                                }
                            }

                            currentTime += mTime + wTime;
                        });

                        // 自動送り時間は、全ての手作業と歩行の合計時間(currentTime)をはみ出した分だけを描画対象とする
                        sumAuto = Math.max(0, maxAutoEnd - currentTime);
                        
                        result.push({
                            id: group.id,
                            isGroup: true,
                            collapsed: true,
                            name: '▶ ' + group.name,
                            category: 'normal',
                            process: validGroupItems[0].process,
                            targetScope: 'common',
                            manualTime: sumManual,
                            autoTime: sumAuto,
                            walkTime: sumWalk,
                            improved: { manualTime: sumManual, autoTime: sumAuto, walkTime: sumWalk },
                            itemIds: group.itemIds
                        });
                    } else {
                        // 展開表示
                        result.push({
                            id: group.id,
                            isGroupHeader: true,
                            collapsed: false,
                            name: '▼ ' + group.name,
                            category: 'normal',
                            process: validGroupItems[0].process,
                            targetScope: 'common',
                            manualTime: 0, autoTime: 0, walkTime: 0,
                            improved: { manualTime: 0, autoTime: 0, walkTime: 0 }
                        });
                        
                        validGroupItems.forEach(item => {
                            result.push({ ...item, inGroup: group.id, name: '　└ ' + item.name });
                        });
                    }
                }
                i += group.itemIds.length;
            } else if (group) {
                // 矛盾が生じた場合は単独で追加
                const item = workItems.find(it => it.id === id);
                if (item) {
                    const scope = item.targetScope || 'common';
                    if (displayMode === 'improved' ? scope !== 'current-only' : scope !== 'improved-only') {
                        result.push(item);
                    }
                }
                i++;
            } else {
                // 通常項目
                const item = workItems.find(it => it.id === id);
                if (item) {
                    const scope = item.targetScope || 'common';
                    if (displayMode === 'improved' ? scope !== 'current-only' : scope !== 'improved-only') {
                        result.push(item);
                    }
                }
                i++;
            }
        }
        return result;
    } catch (error) {
        console.error('Error in getDisplayWorkItems:', error);
        return [];
    }
}



/**
 * 作業項目を順序配列から削除
 * @param {number} workId - 作業項目ID
 */
function removeFromWorkOrder(workId) {
    currentWorkOrder = currentWorkOrder.filter(id => id !== workId);
    improvedWorkOrder = improvedWorkOrder.filter(id => id !== workId);
}

// ========================================
// Work Order Management Functions (Business Enhanced)
// ========================================

/**
 * 並び替え管理モーダルを開く（修正版：元の順序を保存）
 * @param {string} mode - 並び替えモード（'current' または 'improved'）
 */
function manageWorkOrder(mode) {
    const modal = document.getElementById('workOrderManagementModal');
    const title = document.getElementById('orderModalTitle');
    
    currentOrderMode = mode;
    
    // 元の順序を保存（元に戻す用）
    if (mode === 'current') {
        originalWorkOrder = [...currentWorkOrder];
        title.textContent = '改善前 並び替え管理';
        title.style.color = 'var(--current-color)';
    } else {
        originalWorkOrder = [...improvedWorkOrder];
        title.textContent = '改善後 並び替え管理';
        title.style.color = 'var(--improved-color)';
    }
    
    renderWorkOrderList(mode);
    modal.style.display = 'block';
    
    // モーダル表示時のアニメーション強化
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
    });
}

/**
 * 作業順序リストを描画（グループ機能対応版）
 * @param {string} mode - 並び替えモード
 */
function renderWorkOrderList(mode) {
    const listContainer = document.getElementById('workOrderList');
    const orderArray = mode === 'current' ? currentWorkOrder : improvedWorkOrder;
    const groups = mode === 'current' ? currentWorkGroups : improvedWorkGroups;
    
    listContainer.innerHTML = '';
    
    if (orderArray.length === 0) {
        listContainer.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #64748b;">
                <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">📝</div>
                <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">表示できる作業項目がありません</p>
                <p style="font-size: 13px; line-height: 1.4;">
                    ${mode === 'current' ? '改善前' : '改善後'}で表示される項目（共通項目と${mode === 'current' ? '改善前のみ' : '改善後のみ'}項目）がありません
                </p>
            </div>
        `;
        return;
    }
    
    let i = 0;
    let orderNumber = 1;
    
    while (i < orderArray.length) {
        const id = orderArray[i];
        const group = groups.find(g => g.itemIds.includes(id));
        
        if (group && group.itemIds[0] === id) {
            // グループアイテムを描画
            const groupItems = group.itemIds.map(gid => workItems.find(it => it.id === gid)).filter(Boolean);
            
            // 対象スコープのフィルタリング
            const validGroupItems = groupItems.filter(item => {
                const targetScope = item.targetScope || 'common';
                if (mode === 'current') return targetScope === 'common' || targetScope === 'current-only';
                return targetScope === 'common' || targetScope === 'improved-only';
            });
            
            if (validGroupItems.length > 0) {
                const itemEl = document.createElement('div');
                itemEl.className = `work-order-item work-order-item-${mode}`;
                itemEl.draggable = true;
                itemEl.dataset.groupId = group.id;
                
                let sumManual = 0, sumWalk = 0;
                let currentTime = 0;
                let maxAutoEnd = 0;
                validGroupItems.forEach(gi => {
                    let mt = 0, at = 0, wt = 0;
                    if (mode === 'improved' && gi.improved) {
                        mt = gi.improved.manualTime || 0;
                        at = gi.improved.autoTime || 0;
                        wt = gi.improved.walkTime || 0;
                    } else {
                        mt = gi.manualTime || 0;
                        at = gi.autoTime || 0;
                        wt = gi.walkTime || 0;
                    }
                    sumManual += mt;
                    sumWalk += wt;
                    if (at > 0) {
                        let autoEnd = currentTime + mt + at;
                        if (autoEnd > maxAutoEnd) maxAutoEnd = autoEnd;
                    }
                    currentTime += mt + wt;
                });
                let sumAuto = Math.max(0, maxAutoEnd - currentTime);
                const totalTime = sumManual + sumAuto + sumWalk;
                
                itemEl.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; margin-right:8px;">
                        <input type="checkbox" class="order-cb" value="${group.id}" data-is-group="true">
                        <div class="work-order-handle"><i class="fas fa-folder"></i></div>
                    </div>
                    <div class="work-order-content">
                        <div class="work-order-header">
                            <div class="work-order-name">
                                <i class="fas fa-layer-group"></i>
                                <span>[まとめ] ${group.name} (${validGroupItems.length}項目)</span>
                            </div>
                        </div>
                        <div class="work-order-details">
                            <div class="work-order-time" style="background: var(--primary-color); color: white; font-weight: 700;">
                                <i class="fas fa-stopwatch" style="color: white;"></i>
                                計 ${formatTimeDisplay(totalTime)}
                            </div>
                        </div>
                    </div>
                `;
                
                itemEl.addEventListener('dragstart', handleOrderDragStart);
                itemEl.addEventListener('dragover', handleOrderDragOver);
                itemEl.addEventListener('dragenter', handleOrderDragEnter);
                itemEl.addEventListener('dragleave', handleOrderDragLeave);
                itemEl.addEventListener('drop', handleOrderDrop);
                itemEl.addEventListener('dragend', handleOrderDragEnd);
                listContainer.appendChild(itemEl);
                orderNumber++;
            }
            i += group.itemIds.length;
            
        } else if (group) {
            // 矛盾要素はスキップ
            i++;
        } else {
            // 通常アイテム
            const workItem = workItems.find(it => it.id === id);
            if (!workItem) { i++; continue; }
            
            const targetScope = workItem.targetScope || 'common';
            if ((mode === 'current' && targetScope === 'improved-only') ||
                (mode === 'improved' && targetScope === 'current-only')) {
                i++; continue;
            }
            
            const itemEl = document.createElement('div');
            itemEl.className = `work-order-item work-order-item-${mode}`;
            itemEl.draggable = true;
            itemEl.dataset.workId = workItem.id;
            
            let manualTime, autoTime, walkTime;
            if (mode === 'improved' && workItem.improved) {
                manualTime = workItem.improved.manualTime; autoTime = workItem.improved.autoTime; walkTime = workItem.improved.walkTime;
            } else {
                manualTime = workItem.manualTime; autoTime = workItem.autoTime; walkTime = workItem.walkTime;
            }
            const totalTime = manualTime + autoTime + walkTime;
            
            let scopeLabel = '';
            let scopeClass = '';
            switch (targetScope) {
                case 'common': scopeLabel = '共通'; scopeClass = 'scope-common'; break;
                case 'current-only': scopeLabel = '改善前のみ'; scopeClass = 'scope-current-only'; break;
                case 'improved-only': scopeLabel = '改善後のみ'; scopeClass = 'scope-improved-only'; break;
            }
            
            const categoryIcons = {
                normal: '<i class="fas fa-hand-paper" title="実作業"></i>',
                monitor: '<i class="fas fa-eye" title="監視作業"></i>',
                wait: '<i class="fas fa-clock" title="手待ち作業"></i>',
                hold: '<i class="fas fa-square" title="保持作業"></i>'
            };
            
            itemEl.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-right:8px;">
                    <input type="checkbox" class="order-cb" value="${workItem.id}">
                    <div class="work-order-handle">${orderNumber}</div>
                </div>
                <div class="work-order-content">
                    <div class="work-order-header">
                        <div class="work-order-name">
                            ${categoryIcons[workItem.category] || categoryIcons.normal}
                            <span>${workItem.name}</span>
                        </div>
                        <div class="work-order-scope ${scopeClass}">
                            <i class="fas fa-tag"></i>
                            ${scopeLabel}
                        </div>
                    </div>
                    <div class="work-order-details">
                        <div class="work-order-time" title="合計時間" style="background: var(--primary-color); color: white; font-weight: 700;">
                            <i class="fas fa-stopwatch" style="color:white;"></i>
                            ${formatTimeDisplay(totalTime)}
                        </div>
                    </div>
                </div>
            `;
            
            itemEl.addEventListener('dragstart', handleOrderDragStart);
            itemEl.addEventListener('dragover', handleOrderDragOver);
            itemEl.addEventListener('dragenter', handleOrderDragEnter);
            itemEl.addEventListener('dragleave', handleOrderDragLeave);
            itemEl.addEventListener('drop', handleOrderDrop);
            itemEl.addEventListener('dragend', handleOrderDragEnd);
            listContainer.appendChild(itemEl);
            
            i++;
            orderNumber++;
        }
    }
}

// まとめ機能のアクション関数
function groupSelectedWorkItems() {
    const checkboxes = document.querySelectorAll('.order-cb:checked');
    if (checkboxes.length < 2) {
        showNotificationBanner('まとめる項目を2つ以上選択してください。', 'warning');
        return;
    }
    
    const hasGroup = Array.from(checkboxes).some(cb => cb.dataset.isGroup === 'true');
    if (hasGroup) {
        showNotificationBanner('すでにまとめられている項目を含めることはできません。', 'warning');
        return;
    }
    
    const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const orderArray = currentOrderMode === 'current' ? currentWorkOrder : improvedWorkOrder;
    const indices = selectedIds.map(id => orderArray.indexOf(id)).sort((a, b) => a - b);
    
    let isContinuous = true;
    for (let i = 0; i < indices.length - 1; i++) {
        if (indices[i+1] - indices[i] !== 1) {
            isContinuous = false;
            break;
        }
    }
    
    if (!isContinuous) {
        showNotificationBanner('まとめる項目は連続している必要があります。', 'warning');
        return;
    }
    
    const groupName = prompt('まとめの表示名を入力してください:', '新しいまとめ');
    if (!groupName) return;
    
    const newGroup = {
        id: 'group_' + Date.now(),
        name: groupName,
        itemIds: indices.map(idx => orderArray[idx]),
        collapsed: true
    };
    
    if (currentOrderMode === 'current') {
        currentWorkGroups.push(newGroup);
    } else {
        improvedWorkGroups.push(newGroup);
    }
    
    renderWorkOrderList(currentOrderMode);
    updateChart();
    triggerAutoSave();
    showNotificationBanner('項目をまとめました。', 'success', 2000);
}

function ungroupSelectedWorkItems() {
    const checkboxes = document.querySelectorAll('.order-cb:checked[data-is-group="true"]');
    if (checkboxes.length === 0) {
        showNotificationBanner('解除するまとめ（フォルダ）を選択してください。', 'warning');
        return;
    }
    
    const groups = currentOrderMode === 'current' ? currentWorkGroups : improvedWorkGroups;
    
    checkboxes.forEach(cb => {
        const groupId = cb.value;
        const idx = groups.findIndex(g => g.id === groupId);
        if (idx !== -1) {
            groups.splice(idx, 1);
        }
    });
    
    renderWorkOrderList(currentOrderMode);
    updateChart();
    triggerAutoSave();
    showNotificationBanner('まとめを解除しました。', 'info', 2000);
}

/**
 * ドラッグ開始処理（強化版：視覚的フィードバック向上）
 * @param {Event} event - ドラッグイベント
 */
function handleOrderDragStart(event) {
    draggedOrderItem = event.currentTarget;
    event.currentTarget.classList.add('dragging');
    
    // ドラッグ効果を設定
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', event.currentTarget.outerHTML);
    
    // ドラッグ中の透明度とスケールアニメーション
    setTimeout(() => {
        if (draggedOrderItem) {
            draggedOrderItem.style.opacity = '0.5';
            draggedOrderItem.style.transform = 'scale(0.95)';
        }
    }, 0);
    
    // 他の項目にドロップゾーンのヒントを表示
    const allItems = document.querySelectorAll('.work-order-item:not(.dragging)');
    allItems.forEach(item => {
        item.style.transition = 'all 0.3s ease';
        item.style.borderColor = 'var(--border-strong)';
        item.style.backgroundColor = 'var(--background-subtle)';
    });
}

/**
 * ドラッグオーバー処理（強化版：ドロップターゲット明確化）
 * @param {Event} event - ドラッグイベント
 */
function handleOrderDragOver(event) {
    if (event.preventDefault) {
        event.preventDefault();
    }
    
    event.dataTransfer.dropEffect = 'move';
    
    // ドロップターゲットの明確化
    const targetItem = event.currentTarget;
    if (targetItem !== draggedOrderItem) {
        targetItem.classList.add('drop-target');
    }
    
    const afterElement = getDragAfterElement(event.currentTarget.parentNode, event.clientY);
    const container = event.currentTarget.parentNode;
    
    if (afterElement == null) {
        container.appendChild(draggedOrderItem);
    } else {
        container.insertBefore(draggedOrderItem, afterElement);
    }
    
    return false;
}

/**
 * ドラッグエンター処理（新規追加：ホバー効果強化）
 * @param {Event} event - ドラッグイベント
 */
function handleOrderDragEnter(event) {
    const targetItem = event.currentTarget;
    if (targetItem !== draggedOrderItem) {
        targetItem.style.transform = 'scale(1.02)';
        targetItem.style.boxShadow = '0 8px 25px rgba(37, 99, 235, 0.15)';
    }
}

/**
 * ドラッグリーブ処理（新規追加：ホバー効果リセット）
 * @param {Event} event - ドラッグイベント
 */
function handleOrderDragLeave(event) {
    const targetItem = event.currentTarget;
    if (targetItem !== draggedOrderItem) {
        targetItem.classList.remove('drop-target');
        targetItem.style.transform = '';
        targetItem.style.boxShadow = '';
    }
}

/**
 * 削除された旧保存処理（互換性のため空の関数として残す）
 */
function saveWorkOrder() {
    // この関数は使用されなくなったが、他の箇所から呼び出される可能性があるため
    // 空の関数として残しておく
    console.warn('saveWorkOrder() is deprecated. Changes are now saved automatically.');
    confirmWorkOrderChanges();
}

/**
 * 並び替え管理キャンセル処理
 */
function closeWorkOrderManagement() {
    if (originalWorkOrder.length > 0) {
        const currentArray = currentOrderMode === 'current' ? currentWorkOrder : improvedWorkOrder;
        const hasChanges = JSON.stringify(currentArray) !== JSON.stringify(originalWorkOrder);
        
        if (hasChanges) {
            const modeLabel = currentOrderMode === 'current' ? '改善前' : '改善後';
            if (confirm(`${modeLabel}の並び順を開始時の状態に戻しますか？\n\n現在の変更は失われます。`)) {
                // 元の順序を復元
                if (currentOrderMode === 'current') {
                    currentWorkOrder.splice(0, currentWorkOrder.length, ...originalWorkOrder);
                } else {
                    improvedWorkOrder.splice(0, improvedWorkOrder.length, ...originalWorkOrder);
                }
                
                // チャートを更新して復元状態を反映
                updateChart();
                triggerAutoSave();
                
                showNotificationBanner(`${modeLabel}の並び順を開始時の状態に戻しました。`, 'info', 2000);
            } else {
                // キャンセルした場合はモーダルを閉じない
                return;
            }
        }
    }
    
    // モーダルを閉じる
    const modal = document.getElementById('workOrderManagementModal');
    modal.style.display = 'none';
    currentOrderMode = null;
    originalWorkOrder = [];
}

/**
 * 並び替え確定処理
 */
function confirmWorkOrderChanges() {
    // 変更がある場合の確認メッセージ
    if (originalWorkOrder.length > 0) {
        const currentArray = currentOrderMode === 'current' ? currentWorkOrder : improvedWorkOrder;
        const hasChanges = JSON.stringify(currentArray) !== JSON.stringify(originalWorkOrder);
        
        if (hasChanges) {
            const modeLabel = currentOrderMode === 'current' ? '改善前' : '改善後';
            const itemCount = currentArray.length;
            showNotificationBanner(`${modeLabel}の並び順（${itemCount}項目）を保存しました。`, 'success', 2000);
        }
    }
    
    // モーダルを閉じる（保存済みとして扱う）
    const modal = document.getElementById('workOrderManagementModal');
    modal.style.display = 'none';
    currentOrderMode = null;
    originalWorkOrder = [];
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.work-order-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * 並び替え管理での統計情報表示（無効化済み）
 * @param {string} mode - 並び替えモード
 * @param {Array} items - 表示項目リスト
 */
function displayOrderStatistics(mode, items) {
    // この関数は無効化されました
    // 統計情報は表示しません
    
    // 既存の統計情報コンテナがある場合は削除
    let statsContainer = document.getElementById('orderStatistics');
    if (statsContainer) {
        statsContainer.remove();
    }
    
    // 呼び出し元との互換性のため、空の関数として保持
    console.debug('displayOrderStatistics is disabled for compact view');
}

let currentOrderMode = null;
let draggedOrderItem = null;
let originalWorkOrder = []; // 元の順序を保存

/**
 * ドロップ処理（修正版：エフェクト強化）
 * @param {Event} event - ドロップイベント
 */
function handleOrderDrop(event) {
    if (event.stopPropagation) {
        event.stopPropagation();
    }
    
    // ドロップエフェクトの追加
    const targetItem = event.currentTarget;
    targetItem.classList.remove('drop-target');
    
    // 成功エフェクト
    targetItem.style.background = 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)';
    targetItem.style.borderColor = 'var(--success-color)';
    
    setTimeout(() => {
        targetItem.style.background = '';
        targetItem.style.borderColor = '';
        targetItem.style.transform = '';
        targetItem.style.boxShadow = '';
    }, 600);
    
    return false;
}

/**
 * ドラッグ終了処理（修正版：即座に自動保存）
 * @param {Event} event - ドラッグイベント
 */
function handleOrderDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    
    // ドラッグ効果をリセット
    if (draggedOrderItem) {
        draggedOrderItem.style.opacity = '';
        draggedOrderItem.style.transform = '';
    }
    
    // 全ての項目のドロップゾーン効果をリセット
    const allItems = document.querySelectorAll('.work-order-item');
    allItems.forEach(item => {
        item.classList.remove('drop-target');
        item.style.transition = '';
        item.style.borderColor = '';
        item.style.backgroundColor = '';
        item.style.transform = '';
        item.style.boxShadow = '';
    });
    
    const groups = currentOrderMode === 'current' ? currentWorkGroups : improvedWorkGroups;
    const newOrder = [];
    
    // 新しい順序を取得（グループの場合は内包するIDを展開）
    Array.from(event.currentTarget.parentNode.children).forEach(el => {
        if (el.dataset.groupId) {
            const g = groups.find(g => g.id === el.dataset.groupId);
            if (g) newOrder.push(...g.itemIds);
        } else if (el.dataset.workId) {
            newOrder.push(parseInt(el.dataset.workId));
        }
    });
    
    // 対象区分に応じて元の配列を更新
    // 予期しないエラー（DOMでの重複や配列の不整合）を防ぐため、安全な再構築を行う
    if (currentOrderMode === 'current') {
        // 改善前：表示されていない項目（improved-only）は元の位置を保持
        const hiddenIds = currentWorkOrder.filter(id => {
            const item = workItems.find(work => work.id === id);
            return item && (item.targetScope === 'improved-only');
        });
        
        const updatedOrder = [...newOrder];
        hiddenIds.forEach(id => {
            if (!updatedOrder.includes(id)) {
                const originalIndex = currentWorkOrder.indexOf(id);
                const insertIndex = Math.min(updatedOrder.length, originalIndex);
                updatedOrder.splice(insertIndex, 0, id);
            }
        });
        
        // IDの重複を排除し、完全なリストを作成
        const uniqueOrder = [...new Set(updatedOrder)];
        currentWorkOrder.splice(0, currentWorkOrder.length, ...uniqueOrder);
    } else {
        // 改善後：表示されていない項目（current-only）は元の位置を保持
        const hiddenIds = improvedWorkOrder.filter(id => {
            const item = workItems.find(work => work.id === id);
            return item && (item.targetScope === 'current-only');
        });
        
        const updatedOrder = [...newOrder];
        hiddenIds.forEach(id => {
            if (!updatedOrder.includes(id)) {
                const originalIndex = improvedWorkOrder.indexOf(id);
                const insertIndex = Math.min(updatedOrder.length, originalIndex);
                updatedOrder.splice(insertIndex, 0, id);
            }
        });
        
        // IDの重複を排除し、完全なリストを作成
        const uniqueOrder = [...new Set(updatedOrder)];
        improvedWorkOrder.splice(0, improvedWorkOrder.length, ...uniqueOrder);
    }
    
    // グループの要素順序も配列に合わせて完全同期する
    for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i];
        const targetArr = currentOrderMode === 'current' ? currentWorkOrder : improvedWorkOrder;
        g.itemIds = g.itemIds.filter(id => targetArr.includes(id));
        if (g.itemIds.length <= 1) {
            groups.splice(i, 1);
        } else {
            g.itemIds.sort((a, b) => targetArr.indexOf(a) - targetArr.indexOf(b));
        }
    }
    
    // ★★★ 修正：即座に自動保存を実行 ★★★
    try {
        updateChart();
        triggerAutoSave();
        
        // 成功フィードバック（短時間表示）
        showNotificationBanner(
            `${currentOrderMode === 'current' ? '改善前' : '改善後'}の作業順序を更新しました。`,
            'success',
            1500
        );
    } catch (error) {
        console.error('Error saving work order:', error);
        showNotificationBanner('並び順の保存中にエラーが発生しました。', 'error', 2000);
    }
    
    // リストを再描画して順序番号を更新
    renderWorkOrderList(currentOrderMode);
    draggedOrderItem = null;
}

/**
 * 作業順序を workItems の targetScope に基づいて初期化する。
 *
 * - current-only  → currentWorkOrder のみ（改善後チャートには出ない）
 * - improved-only → improvedWorkOrder のみ（改善前チャートには出ない）
 * - common        → 両方に含める
 */
function initializeWorkOrders() {
    currentWorkOrder = workItems
        .filter(item => item.targetScope !== 'improved-only')
        .map(item => item.id);
    improvedWorkOrder = workItems
        .filter(item => item.targetScope !== 'current-only')
        .map(item => item.id);
}

/**
 * SAMPLE_DATA（sample-data.js で定義）をアプリへ読み込む。
 *
 * ■ 設計方針
 *   SAMPLE_DATA.workers を順番に dataList へ登録し、全員を selectedDataIds に追加する。
 *   これにより、作業配分表（配分チャート）は初期表示から複数作業者の比較状態になる。
 *   メイン編集対象（currentDataId）は先頭の作業者（workers[0]）を使用する。
 */
function loadSampleData() {
    if (typeof SAMPLE_DATA === 'undefined') {
        console.error('[loadSampleData] SAMPLE_DATA が未定義です。sample-data.js が正しく読み込まれているか確認してください。');
        return;
    }

    const sd = SAMPLE_DATA;

    // ── 既存データをクリア ──────────────────────────────────────────────────
    workItems          = [];
    frequencyWorkItems = [];
    timeSlots          = [];
    dataList           = [];
    selectedDataIds    = [];
    currentDataId      = null;

    // チャート表示グローバル変数をデフォルトにリセット（スライドスイッチ不一致バグ修正）
    // サンプルデータ読み込み時はチェックボックスとグローバル変数が同期されるよう明示的に設定する。
    showGanttChart     = true;
    showProcessChart   = false;
    showFrequencyChart = true;

    // ── 共通データ（頻度作業・時間帯）をセット ──────────────────────────────
    frequencyWorkItems = JSON.parse(JSON.stringify(sd.frequencyWorkItems));

    const baseId = Date.now();
    timeSlots = sd.timeSlotDefs.map(def => ({
        id:        baseId + def.offset,
        name:      def.name,
        type:      def.type,
        startTime: def.startTime,
        endTime:   def.endTime,
        notes:     '',
    }));

    // ── スケジュール設定 ─────────────────────────────────────────────────────
    scheduleConfig = { startTime: sd.schedule.startTime, workHours: sd.schedule.workHours, endTime: '' };
    document.getElementById('scheduleStartTime').value = sd.schedule.startTime;
    document.getElementById('scheduleWorkHours').value = String(sd.schedule.workHours);

    // ── 標準手持ち数（lot2 がモーダル選択肢に出るために必須） ─────────────────
    standardWIP = sd.schedule.standardWIP;
    const standardWIPEl = document.getElementById('standardWIPInput');
    if (standardWIPEl) standardWIPEl.value = standardWIP;
    const lotCountEl = document.getElementById('standardWIPLotCount');
    if (lotCountEl) lotCountEl.textContent = String(standardWIP + 1);

    // ── 画面入力欄（メタ情報）───────────────────────────────────────────────
    const productEl  = document.getElementById('productName');
    const opTimeEl   = document.getElementById('operatingTime');
    const reqQtyEl   = document.getElementById('requiredQuantity');
    if (productEl) productEl.value = sd.meta.productName;
    if (opTimeEl)  opTimeEl.value  = sd.meta.operatingTime;
    if (reqQtyEl)  reqQtyEl.value  = sd.meta.requiredQuantity;

    // ── 各作業者を dataList に登録 ───────────────────────────────────────────
    // workers が未定義の場合は後方互換として workItems を単独登録
    const workers = (sd.workers && sd.workers.length > 0)
        ? sd.workers
        : [{ operatorName: '', workItems: sd.workItems }];

    workers.forEach((worker, index) => {
        // この作業者の workItems をセット（getCurrentDataObject で参照される）
        workItems = JSON.parse(JSON.stringify(worker.workItems));

        // 担当者名を入力欄に反映（getCurrentDataObject で product/operator を取得するため）
        const operatorEl = document.getElementById('operatorName');
        if (operatorEl) operatorEl.value = worker.operatorName || '';

        // 作業順序・タクトタイムを作業者ごとに再計算
        initializeWorkOrders();
        calculateTaktTime(false);

        const entryId = `sample-${baseId}-${index}`;
        dataList.push({
            id:        entryId,
            name:      worker.operatorName || `作業者${index + 1}`,
            data:      getCurrentDataObject(),
            createdAt: new Date().toISOString(),
        });
        selectedDataIds.push(entryId);
    });

    // ── 編集対象は先頭作業者に固定 ──────────────────────────────────────────
    // workItems・currentDataId を先頭作業者の状態に戻す
    const firstWorker = workers[0];
    workItems     = JSON.parse(JSON.stringify(firstWorker.workItems));
    currentDataId = `sample-${baseId}-0`;

    const operatorEl = document.getElementById('operatorName');
    if (operatorEl) operatorEl.value = firstWorker.operatorName || '';

    initializeWorkOrders();
    calculateTaktTime(false);
    updateScheduleConfig();

    // ── meta.operatingTime を再セット ─────────────────────────────────────────
    // updateScheduleConfig() は workHours×60 で operatingTime を強制上書きし、
    // 内部で calculateTaktTime() も呼ぶため、taktTime 変数も誤った値になる。
    // meta.operatingTime（休憩控除後の実稼働時間）を再セットした上で
    // calculateTaktTime を再実行し、T/T を正しく確定させる。
    const opTimeElFinal = document.getElementById('operatingTime');
    if (opTimeElFinal && sd.meta && sd.meta.operatingTime != null) {
        opTimeElFinal.value = sd.meta.operatingTime;
        if (typeof calculateTaktTime === 'function') calculateTaktTime(false);
    }

    // ── UI 一括更新 ─────────────────────────────────────────────────────────
    updateTimeSlotList();
    updateFrequencyWorkList();
    updateWorkingTimeDisplay();
    if (typeof updateFrequencyWorkStatistics === 'function') updateFrequencyWorkStatistics();
    if (typeof updateFrequencyWorkButtons    === 'function') updateFrequencyWorkButtons();
    updateDataListSelect();
    updateSaveButtonUI();
    updateDeleteButtonVisibility();
    updateDataSelectionList();
    if (typeof syncDisplayModeOverlay === 'function') syncDisplayModeOverlay(displayMode);
    if (typeof syncDistributionModeUI === 'function') syncDistributionModeUI();

    // ── チャート描画 ─────────────────────────────────────────────────────────
    updateChart();
    updateScheduleChart();
    updateDistributionChart();

    // 比較ガントチャートのリストを同期（全作業者が登録済みの状態で実行）
    _mgNotifyDataListChanged();

    triggerAutoSave();
}


/**
 * キャンバス初期化の続行（修正版：フラグ設定追加）
 */
function continueCanvasInitialization() {
    try {
        if (!canvas) return;
        
        ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // コンテナサイズを再確認してキャンバス幅を決定
        // chartsScrollWrapper を優先し updateChart() と同じ参照元で一貫させる
        const scrollWrapper = document.getElementById('chartsScrollWrapper');
        const refEl = scrollWrapper || document.getElementById('canvasContainer');
        if (refEl) {
            const containerRect = refEl.getBoundingClientRect();
            if (containerRect.width > 0) {
                canvasWidth = Math.max(1150, containerRect.width - 35);
            }
        }
        
        canvasHeight = calculateRequiredCanvasHeight();
        setupHighDPICanvas(canvas, ctx, canvasWidth, canvasHeight);

        // ★★★ 工程確認チャートキャンバスの初期サイズを同期的に設定 ★★★
        // setupHighDPICanvas(canvas) の直後に processCanvas も同じ幅に合わせる。
        // これにより welcome.js の showMainApplication() で 1400px に設定されていた
        // 初期値を、最初の描画前に正しい値に上書きできる。
        if (processCanvas && processCtx && processCanvasWidth !== canvasWidth) {
            processCanvasWidth = canvasWidth;
            updateHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
        }

        removeExistingCanvasListeners();
        addCanvasEventListeners();
        
        // 頻度作業ゴーストゾーンのイベント初期化（DOM確定後に設定）
        if (typeof initFrequencyAddZone === 'function') {
            initFrequencyAddZone();
        }
        
        // ★重要：メインキャンバス初期化完了フラグを設定
        isCanvasReady = true;

        // キャンバス初期化直後にゴーストゾーン表示状態を同期
        // （processPendingUpdates 前に実行して初回描画前に表示を確定させる）
        updateChartContainerVisibility();
        
        // 保留中の更新を実行
        processPendingUpdates('main');
        
        // 初期化完了後、工程確認チャートが表示状態なら幅を強制同期
        // 起動時のウィンドウ幅に依存した初期描画ズレを防ぐ
        if (showProcessChart) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (typeof forceProcessChartSizeSync === 'function') {
                        forceProcessChartSizeSync();
                    }
                    if (typeof updateProcessChart === 'function') {
                        updateProcessChart();
                    }
                });
            });
        }
        
    } catch (error) {
        console.error('Error in continueCanvasInitialization:', error);
    }
}

/**
 * キャンバスからマウスが離れた時の処理
 */
function handleCanvasMouseLeave(event) {
    // ツールチップを非表示にする
    hideDynamicTooltip();
    
    // ホバーしている行の情報をリセット
    if (hoveredRowIndex !== -1) {
        hoveredRowIndex = -1;
        updateChart(); // チャートを再描画してハイライトを消す
    }
}

/**
 * キャンバスイベントリスナーを追加
 */
function addCanvasEventListeners() {
    if (!canvas) return;
    
    try {
        // 高解像度対応の座標取得を使用
        canvas.addEventListener('dblclick', handleCanvasDoubleClick);
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        canvas.addEventListener('mouseleave', handleCanvasMouseLeave); 
        canvas.addEventListener('mousedown', handleCanvasMouseDown);
        canvas.addEventListener('contextmenu', handleCanvasContextMenu);
    } catch (error) {
        console.error('Error adding canvas event listeners:', error);
    }
}

/**
 * 既存のキャンバスイベントリスナーを削除
 */
function removeExistingCanvasListeners() {
    if (!canvas) return;
    
    try {
        // 既存のリスナーを削除（クローンして置き換える方法）
        const newCanvas = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(newCanvas, canvas);
        canvas = newCanvas;
        ctx = canvas.getContext('2d');
    } catch (error) {
        console.warn('Could not remove existing listeners:', error);
    }
}

/**
 * フォールバックキャンバスの作成
 */
function createFallbackCanvas() {
    try {        
        const canvasContainer = document.getElementById('canvasContainer');
        if (!canvasContainer) {
            console.error('Canvas container not found, cannot create fallback');
            return;
        }
        
        // 既存のキャンバスがあれば削除
        const existingCanvas = document.getElementById('ganttCanvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }
        
        // 新しいキャンバスを作成
        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'ganttCanvas';
        newCanvas.style.display = 'block';
        newCanvas.style.border = '1px solid #ddd';
        
        canvasContainer.appendChild(newCanvas);
        
        // グローバル変数を更新
        canvas = newCanvas;
        ctx = canvas.getContext('2d');
        
        // 初期化を続行
        continueCanvasInitialization();
                
    } catch (error) {
        console.error('Error creating fallback canvas:', error);
    }
}

/**
 * チャートコンテナの表示制御
 */
function updateChartContainerVisibility() {
    try {
        // ── ガントチャート: JSで全要素を明示的に制御（CSS !importantに依存しない）──
        const ganttContainer     = document.getElementById('ganttChartContainer');
        const canvasContainer    = document.getElementById('canvasContainer');
        const ghostZone          = document.getElementById('ganttAddGhostZone');
        const displayModeOverlay = document.getElementById('displayModeOverlay');
        const chartHighlight     = document.getElementById('chartHighlight');
        const hasWorkItems       = !!(workItems && workItems.length > 0);

        if (ganttContainer) {
            if (hasWorkItems) {
                // データあり: チャートを表示、ゴーストを隠す
                ganttContainer.removeAttribute('data-empty');
                ganttContainer.style.paddingBottom = '';
                if (canvasContainer) {
                    canvasContainer.style.display    = 'block';
                    canvasContainer.style.visibility = 'visible';
                    canvasContainer.style.opacity    = '1';
                }
                if (displayModeOverlay) displayModeOverlay.style.display = 'flex';
                if (chartHighlight)     chartHighlight.style.display     = 'block';
                if (ghostZone)          ghostZone.style.display          = 'none';
            } else {
                // データなし: ゴーストを表示、チャートを隠す
                ganttContainer.setAttribute('data-empty', 'true');
                ganttContainer.style.paddingBottom = '6px';
                if (canvasContainer)    canvasContainer.style.display    = 'none';
                if (displayModeOverlay) displayModeOverlay.style.display = 'none';
                if (chartHighlight)     chartHighlight.style.display     = 'none';
                if (ghostZone)          ghostZone.style.display          = 'block';
            }
        }

        // ── 頻度作業チャートコンテナ ──
        if (typeof updateFrequencyChartVisibility === 'function') updateFrequencyChartVisibility();

        // ── 工程確認チャートコンテナ ──
        const processContainer      = document.getElementById('processChartContainer');
        const processGhostZone      = document.getElementById('processGhostZone');
        const processCanvasContainer = document.getElementById('processCanvasContainer');
        if (processContainer) {
            if (showProcessChart && processCanvas && processCtx) {
                processContainer.style.display = 'block';
                // データなし → 空状態バーを表示してキャンバスを隠す
                if (processGhostZone)       processGhostZone.style.display        = hasWorkItems ? 'none'  : 'block';
                if (processCanvasContainer) processCanvasContainer.style.display  = hasWorkItems ? ''      : 'none';
            } else {
                processContainer.style.display = 'none';
                if (processGhostZone) processGhostZone.style.display = 'none';
            }
        }

    } catch (error) {
        console.error('Error updating chart container visibility:', error);
    }
}

/**
 * Welcome画面表示状態をチェック（強化版・確実な判定）
 */
function isWelcomeScreenVisible() {
    try {
        const welcomeScreen = document.getElementById('welcomeScreen');
        
        if (!welcomeScreen) {
            return false;
        }
        
        // 複数の条件でチェック
        const isDisplayed = welcomeScreen.style.display !== 'none' && 
                           welcomeScreen.style.display !== '';
        
        const isVisible = welcomeScreen.style.visibility !== 'hidden';
        
        const hasOpacity = welcomeScreen.style.opacity !== '0';
        
        const isInDOM = document.contains(welcomeScreen);
        
        const hasShowClass = welcomeScreen.classList.contains('welcome-screen-show');
        
        // 総合的な判定
        const isWelcomeVisible = isInDOM && 
                                (isDisplayed || hasShowClass) && 
                                isVisible && 
                                hasOpacity;
        
        return isWelcomeVisible;
        
    } catch (error) {
        console.warn('Error checking welcome screen visibility:', error);
        return false;
    }
}

/**
 * ガントチャート更新
 */
function updateChart() {
    // ゴーストゾーン表示制御: safeUpdateChart（isCanvasReady待ち）の外で即時実行
    // これにより canvas 未初期化時でも必ず正しい表示状態に切り替わる
    updateChartContainerVisibility();

    safeUpdateChart('main', () => {
        try {
            // 基本的な要素存在チェック
            if (!canvas || !ctx) {
                return; // 警告メッセージを削除し、静かに終了
            }

            // コンテナサイズの取得（安全な実行）
            const canvasContainer = document.getElementById('canvasContainer');
            if (!canvasContainer) {
                return;
            }

            // サイズ計算（エラーハンドリング付き）
            let newWidth, newHeight;
            try {
                // 共有横スクロールラッパーを優先して幅を取得
                // ラッパーがある場合はその表示幅を基準にする（スクロール前の可視幅）
                const scrollWrapper = document.getElementById('chartsScrollWrapper');
                const referenceEl = scrollWrapper || canvasContainer;
                const containerRect = referenceEl.getBoundingClientRect();
                newWidth = Math.max(1150, containerRect.width - 35);
                newHeight = calculateRequiredCanvasHeight();
            } catch (sizeError) {
                console.warn('Error calculating canvas size:', sizeError);
                newWidth = canvasWidth || 1150;
                newHeight = canvasHeight || 500;
            }
            
            // グローバル変数を更新
            canvasWidth = newWidth;
            canvasHeight = newHeight;
            
            // Canvasの物理サイズと高解像度設定を更新（安全な実行）
            try {
                updateHighDPICanvas(canvas, ctx, canvasWidth, canvasHeight);
            } catch (canvasUpdateError) {
                console.warn('Error updating canvas size:', canvasUpdateError);
            }

            // ★★★ 工程確認チャートキャンバスサイズの同期的設定 ★★★
            // drawGanttChart()より前、かつ同一実行コンテキスト内で行うことが重要。
            // rAF（非同期）で後から合わせると初期起動時に1フレーム以上ズレて見える。
            // 表示中かどうかに関わらずサイズだけ同期しておくことで、
            // 表示切り替え時のちらつきも防ぐ。
            if (processCanvas && processCtx) {
                try {
                    if (processCanvasWidth !== canvasWidth) {
                        processCanvasWidth = canvasWidth;
                        updateHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
                    }
                } catch (processSyncError) {
                    // 失敗しても描画は続行する
                }
            }

            // 描画処理を呼び出し（安全な実行）
            // workItemsが0件の時はキャンバスが非表示なので描画をスキップ
            if (workItems && workItems.length > 0) {
                try {
                    drawGanttChart();
                } catch (drawError) {
                    console.warn('Error drawing gantt chart:', drawError);
                }
            }
            
            // 工程確認チャートの再描画（サイズは上で既に同期済みのため、内容の更新のみ）
            if (showProcessChart && processCanvas && processCtx) {
                requestAnimationFrame(() => {
                    if (typeof updateProcessChart === 'function') {
                        updateProcessChart();
                    }
                });
            }
            
            // 改善効果計算（安全な実行）
            try {
                calculateImprovementEffectsIntegrated();
            } catch (improvementError) {
                console.warn('Error calculating improvement effects:', improvementError);
            }
            
            // UI要素更新（安全な実行）
            try {
                if (typeof updateUIElements === 'function') {
                    updateUIElements();
                }
            } catch (uiError) {
                console.warn('Error updating UI elements:', uiError);
            }

            // ★★★ 修正箇所: 他のチャートの更新トリガーを削除 ★★★
            // 他のチャートの更新は、それぞれのUI管理関数やタブ切り替え関数に任せる

            // ★スケール同期: 頻度作業チャートをメインチャートと同一コンテキストで更新。
            //   スライダー操作時にメインチャートのみ更新されるケース（boot.js等が
            //   updateChart()のみ呼ぶ場合）でもスケールが連動するよう、ここで必ず同期する。
            //   ・rAF/setTimeout を挟まないことで canvasWidth 確定後の即時同期を保証。
            //   ・canvas/ctx の存在チェックで未初期化時は安全にスキップ。
            if (showFrequencyChart && frequencyCanvas && frequencyCtx &&
                frequencyWorkItems && frequencyWorkItems.length > 0) {
                try {
                    // frequencyCanvasWidth を canvasWidth（確定済みの唯一の真値）に強制同期
                    if (frequencyCanvasWidth !== canvasWidth) {
                        frequencyCanvasWidth = canvasWidth;
                        updateHighDPICanvas(frequencyCanvas, frequencyCtx, frequencyCanvasWidth, frequencyCanvasHeight);
                    }
                    drawFrequencyChart();
                } catch (freqError) {
                    // 頻度チャートのエラーはメイン描画に影響させない
                }
            }

            // 課題6: 更新のたびにWIP不一致チェック
            checkWIPMismatch();
            
        } catch (error) {
            console.error('Critical error in updateChart:', error);
        }
    });
}


/**
 * 課題6: 標準手持ち設定と登録データのロット数不一致を検知してアラートを表示
 *
 * 理論: 工程確認チャートの行数 = standardWIP + 1
 * 登録データの最大ロット番号が (standardWIP + 1) と一致しない場合にアラート表示。
 *
 * シナリオA: actualMaxLot < standardWIP + 1
 *   → 設定より少ないデータ → 空行が発生する可能性
 * シナリオB: actualMaxLot > standardWIP + 1
 *   → 設定より多いロットのデータが存在 → チャートが意図外に拡張
 */
function checkWIPMismatch() {
    const badge = document.getElementById('wipMismatchAlert');

    // 登録データから実際の最大ロット番号を取得
    const allItems = (typeof workItems !== 'undefined') ? workItems : [];
    let actualMaxLot = 0;
    allItems.forEach(item => {
        const normalized = (typeof normalizeProcessValue === 'function')
            ? normalizeProcessValue(item.process || '')
            : (item.process || '');
        const match = normalized.match(/^lot(\d+)$/);
        if (match) {
            actualMaxLot = Math.max(actualMaxLot, parseInt(match[1]));
        }
    });

    const expected = (typeof standardWIP !== 'undefined' ? standardWIP : 0) + 1;
    // データが0件 or 一致している場合はアラート不要
    const mismatch = (actualMaxLot > 0) && (actualMaxLot !== expected);

    // ── KPIカード内バッジ ─────────────────────────────────────────────
    if (badge) {
        if (mismatch) {
            const tip = expected > actualMaxLot
                ? `標準手持ち(${standardWIP}個) → ${expected}行表示予定\nデータ最大ロット: lot${actualMaxLot}\n→ 空行が発生します`
                : `標準手持ち(${standardWIP}個) → ${expected}行表示予定\nデータ最大ロット: lot${actualMaxLot}\n→ lot${actualMaxLot}まで表示されます`;
            badge.title = tip;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // ── 工程確認チャート：オーバーレイバッジ ─────────────────────────
    const chartAlert = document.getElementById('processChartWIPAlert');
    if (chartAlert) {
        const processContainer = document.getElementById('processChartContainer');
        const chartVisible = processContainer && processContainer.style.display !== 'none';
        chartAlert.style.display = (mismatch && chartVisible) ? 'flex' : 'none';
    }

    // ── モーダルバナー更新 ──────────────────────────────────────────
    updateModalWIPBanner();
}

/**
 * モーダル内WIP不一致バナーを更新する。
 * モーダルが開いている場合のみ表示。
 * 工程内分類が現在の standardWIP 許容範囲を超えている場合に警告。
 */
function updateModalWIPBanner() {
    const banner = document.getElementById('modalWIPMismatchBanner');
    if (!banner) return;

    const modal = document.getElementById('workModal');
    const isOpen = modal && modal.style.display === 'block';
    if (!isOpen) { banner.style.display = 'none'; return; }

    const processSelect = document.getElementById('workProcess');
    if (!processSelect) { banner.style.display = 'none'; return; }

    const lotMatch = (processSelect.value || 'lot1').match(/^lot(\d+)$/);
    const currentLot = lotMatch ? parseInt(lotMatch[1]) : 1;
    const allowed = (typeof standardWIP === 'number') ? standardWIP + 1 : 1;

    if (currentLot > allowed) {
        const descEl = document.getElementById('modalWIPMismatchText');
        if (descEl) {
            descEl.textContent =
                `この作業は lot${currentLot}（手持ち${currentLot - 1}個目）に設定されていますが、` +
                `現在の標準手持ち（${standardWIP}個）では lot${allowed} までしか使用できません。` +
                `「当ロットに修正」で lot1 に変更するか、標準手持ちを ${currentLot - 1} 以上に設定してください。`;
        }
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}

/**
 * モーダルバナーの「当ロットに修正」ボタン処理。
 * workProcess セレクトを lot1 に変更し、バナーを消す。
 */
function fixModalLotToAllowed() {
    const processSelect = document.getElementById('workProcess');
    if (processSelect) {
        processSelect.value = 'lot1';
    }
    updateModalWIPBanner();
}

/**
 * 工程確認チャートのWIPアラートバッジ「修正する」ハンドラ。
 * 標準手持ち入力欄へスクロール・フォーカスして修正を促す。
 */
function openWIPMismatchResolver() {
    const wipInput = document.getElementById('standardWIPInput');
    if (wipInput) {
        wipInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wipInput.focus();
        wipInput.classList.add('wip-input-highlight');
        setTimeout(() => wipInput.classList.remove('wip-input-highlight'), 2000);
    }
}

/**
 * 工程内分類セレクトの選択肢を standardWIP に応じて動的生成する。
 * lot1 = 当ロット、lot2以上 = 手持ちN個目
 * onStandardWIPChange から呼ばれる。
 */
function updateLotOptions() {
    const processSelect = document.getElementById('workProcess');
    if (!processSelect) return;

    const currentVal = processSelect.value || 'lot1';
    const maxLots = (typeof standardWIP === 'number' && standardWIP >= 0) ? standardWIP + 1 : 1;

    // 選択肢を再構築
    processSelect.innerHTML = '';
    for (let i = 1; i <= maxLots; i++) {
        const opt = document.createElement('option');
        opt.value = `lot${i}`;
        opt.textContent = i === 1 ? '当ロット' : `手持ち${i - 1}個目（lot${i}）`;
        processSelect.appendChild(opt);
    }

    // 前の値が有効なら復元、無効なら lot1 に戻す
    const isValid = [...processSelect.options].some(o => o.value === currentVal);
    processSelect.value = isValid ? currentVal : 'lot1';

    // バナー状態を更新
    updateModalWIPBanner();
}

/**
 * workModal の表示状態を監視し、開いた際に WIP バナーを更新する。
 * DOMContentLoaded 後に一度呼び出す。
 */
function initWorkModalObserver() {
    const modal = document.getElementById('workModal');
    if (!modal) return;
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.attributeName === 'style') {
                // モーダルが開いた瞬間にバナー・ロット選択肢を更新
                if (modal.style.display === 'block') {
                    updateLotOptions();
                    updateModalWIPBanner();
                }
            }
        });
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['style'] });
}

// workProcess セレクト変更時もバナーを更新（モーダル内での手動変更に対応）
document.addEventListener('DOMContentLoaded', () => {
    initWorkModalObserver();
    const processSelect = document.getElementById('workProcess');
    if (processSelect) {
        processSelect.addEventListener('change', updateModalWIPBanner);
    }
    initGanttConflictBadgeDrag();
    // 線スタイルUIをデフォルト値で初期化（レイアウト確定後に再描画）
    if (typeof syncLineStylesUI === 'function') {
        syncLineStylesUI();
        // 初回はcanvas offsetWidth が 0 の場合があるため少し遅延して再描画
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (typeof syncLineStylesUI === 'function') syncLineStylesUI();
            });
        });
    }
});

// ════════════════════════════════════════════════════════════════════════
// 自動送り干渉バッジ管理（標準作業組合せ票上のドラッグ可能HTMLオーバーレイ）
//
// 認知心理学設計方針:
//   ・前注意的特徴（赤系・⚠ アイコン）で即時リスク知覚
//   ・コンパクトな構造（ヘッドライン + 折り畳み明細）で認知負荷を抑制
//   ・ドラッグで自由移動 → チャートの重要情報を遮蔽しない
//   ・閉じるボタンで一時隠蔽可能（データ変更時に自動復活）
//   ・位置記憶でリドロー毎の戻りを防ぎ操作感を向上
// ════════════════════════════════════════════════════════════════════════

/**
 * 自動送り干渉バッジの表示・内容を更新する。
 * chart-renderer.js の detectGanttAutoFeedConflicts() から呼ばれる。
 *
 * @param {Array} conflicts - { key, itemName, mode, overlapSec }[]
 */
function updateGanttAutoFeedConflictBadge(conflicts) {
    const badge = document.getElementById('ganttAutoFeedConflictBadge');
    if (!badge) return;

    // 干渉なし → 非表示にし、状態リセット
    if (!conflicts || conflicts.length === 0) {
        badge.style.display = 'none';
        ganttConflictBadgeDismissed = false;
        return;
    }

    // ユーザーが手動で閉じた状態 → 内容更新のみ（再表示しない）
    if (ganttConflictBadgeDismissed) {
        _fillGanttConflictBadgeContent(badge, conflicts);
        return;
    }

    _fillGanttConflictBadgeContent(badge, conflicts);
    badge.style.display = 'flex';

    // ユーザーが移動していない場合はスクロール位置に合わせてビューポート右上に配置
    if (!ganttConflictBadgeUserPos) {
        _syncGanttConflictBadgeToViewport();
    }
}

/**
 * バッジをキャンバスコンテナのスクロール位置に合わせて
 * 常にビューポート右上に表示する。
 * ドラッグ移動後は呼ばれない（ganttConflictBadgeUserPos が設定済みのため）。
 */
function _syncGanttConflictBadgeToViewport() {
    const badge     = document.getElementById('ganttAutoFeedConflictBadge');
    const container = document.getElementById('canvasContainer');
    if (!badge || !container || badge.style.display === 'none') return;

    const scrollLeft   = container.scrollLeft;
    const scrollTop    = container.scrollTop;
    const visibleWidth = container.clientWidth;
    const badgeWidth   = badge.offsetWidth || 200;

    const newLeft = scrollLeft + visibleWidth - badgeWidth - 12;
    const newTop  = scrollTop + 12;

    badge.style.left   = Math.max(scrollLeft, newLeft) + 'px';
    badge.style.top    = newTop + 'px';
    badge.style.right  = 'auto';
    badge.style.bottom = 'auto';
}

/**
 * バッジ内テキストを構築する内部ヘルパー。
 */
function _fillGanttConflictBadgeContent(badge, conflicts) {
    const headline = badge.querySelector('.gafc-headline');
    const details  = badge.querySelector('.gafc-details');
    if (headline) {
        headline.textContent = `自動送り干渉 (${conflicts.length}件)`;
    }
    if (details) {
        details.innerHTML = conflicts.map(c => {
            const modeTag = c.mode === 'improved'
                ? '<span class="gafc-tag gafc-tag--improved">改善後</span>'
                : '<span class="gafc-tag gafc-tag--current">改善前</span>';
            return `<span class="gafc-detail-row">${modeTag}${c.itemName}: <strong>+${formatTimeDisplay(c.overlapSec)}</strong></span>`;
        }).join('');
    }
}

/**
 * 干渉バッジのドラッグ操作を初期化する。
 * DOMContentLoaded 後に一度だけ呼ぶこと。
 */
function initGanttConflictBadgeDrag() {
    const badge     = document.getElementById('ganttAutoFeedConflictBadge');
    const container = document.getElementById('canvasContainer');
    if (!badge || !container) return;

    let isDragging  = false;
    let startMouseX = 0, startMouseY = 0;
    let startLeft   = 0, startTop    = 0;

    badge.addEventListener('mousedown', e => {
        if (e.target.closest('.gafc-close')) return;

        isDragging  = true;
        startMouseX = e.clientX;
        startMouseY = e.clientY;

        const rect      = badge.getBoundingClientRect();
        const cRect     = container.getBoundingClientRect();
        // コンテナのスクロールオフセットを含む絶対位置（content基準）
        startLeft = rect.left - cRect.left + container.scrollLeft;
        startTop  = rect.top  - cRect.top  + container.scrollTop;

        badge.style.left   = startLeft + 'px';
        badge.style.right  = 'auto';
        badge.style.top    = startTop + 'px';
        badge.style.bottom = 'auto';
        badge.style.cursor = 'grabbing';
        badge.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;

        // content座標系での制約（画面外への飛び出し防止）
        const contentW = container.scrollWidth;
        const contentH = container.scrollHeight;
        const bw = badge.offsetWidth;
        const bh = badge.offsetHeight;

        const newLeft = Math.max(0, Math.min(startLeft + dx, contentW - bw));
        const newTop  = Math.max(0, Math.min(startTop  + dy, contentH - bh));

        badge.style.left = newLeft + 'px';
        badge.style.top  = newTop  + 'px';

        // ユーザーが明示的に移動した位置を記憶（スクロール同期を止める）
        ganttConflictBadgeUserPos = { left: newLeft, top: newTop };
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        badge.style.cursor     = 'grab';
        badge.style.transition = '';
    });

    // スクロール時: ユーザーが移動していない場合はビューポート追従
    container.addEventListener('scroll', () => {
        if (!ganttConflictBadgeUserPos && badge.style.display !== 'none') {
            _syncGanttConflictBadgeToViewport();
        }
    });

    // 閉じるボタン
    const closeBtn = badge.querySelector('.gafc-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', e => {
            e.stopPropagation();
            badge.style.display = 'none';
            ganttConflictBadgeDismissed = true;
            ganttConflictBadgeUserPos   = null;
        });
    }
}

/**
 * ユーザー操作によるバッジ非表示を解除する。
 * displayMode 変更・workItems 更新など干渉条件が変わった場合に呼ぶ。
 */
function resetGanttConflictBadgeDismiss() {
    ganttConflictBadgeDismissed = false;
    ganttConflictBadgeUserPos   = null;
}


/**
 * マウス座標を Canvas 座標に変換（高解像度対応）
 * @param {HTMLCanvasElement} canvas - 対象キャンバス
 * @param {MouseEvent} event - マウスイベント
 * @returns {Object} - {x, y} 座標
 */
function getCanvasMousePosition(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // CSS での表示サイズベースで計算
    const x = (event.clientX - rect.left) * (canvas.width / devicePixelRatio / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / devicePixelRatio / rect.height);
    
    return { x, y };
}

/**
 * 工程確認チャート更新（修正版：初期化状態チェック強化）
 */
function updateProcessChart() {
    safeUpdateChart('process', () => {
        // 表示条件チェック
        if (!showProcessChart) {
            return;
        }
        
        if (!processCanvas || !processCtx) {
            return; // 初期化関数は呼ばず、静かに終了
        }
        
        // 動的にロット数を取得してサイズ調整
        const maxLotNumber = getMaxLotNumber();
        window.maxLotNumber = maxLotNumber;
        
        // 必要な高さを動的に計算
        const requiredHeight = PROCESS_TOP_MARGIN + (maxLotNumber * PROCESS_ROW_HEIGHT) + PROCESS_BOTTOM_MARGIN;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const currentDisplayHeight = processCanvas.height / devicePixelRatio;
        const currentDisplayWidth = processCanvas.width / devicePixelRatio;
        
        // メインキャンバスとの幅同期チェック（重要な修正）
        const mainCanvasDisplayWidth = canvas ? canvas.width / devicePixelRatio : processCanvasWidth;
        const needsWidthSync = Math.abs(currentDisplayWidth - mainCanvasDisplayWidth) > 1;
        const needsHeightAdjustment = Math.abs(currentDisplayHeight - requiredHeight) > 20;
        
        // 幅または高さの調整が必要な場合はキャンバスサイズを更新
        if (needsWidthSync || needsHeightAdjustment) {
            processCanvasWidth = mainCanvasDisplayWidth;
            processCanvasHeight = requiredHeight;
            
            updateHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
            
            // サイズ変更後は一度描画を中止して、次のフレームで再実行
            requestAnimationFrame(() => {
                drawProcessChart();
            });
            return;
        }
        
        // 描画実行（エラーハンドリング強化）
        try {
            drawProcessChart();
        } catch (error) {
            console.error('Process chart drawing error:', error);
            // エラー時は工程確認チャートを一時的に非表示
            const processContainer = document.getElementById('processChartContainer');
            if (processContainer) {
                processContainer.style.display = 'none';
            }
        }
    });
}

/**
 * 工程確認チャート切り替え（修正版：安全なチャート更新）
 */
/**
 * 工程確認チャートのロット表示モードを切り替える
 * @param {string} mode - 'breakdown': ロット分解モード / 'single': 単一ラインモード
 */
function switchProcessChartLotMode(mode) {
    processChartLotMode = mode;
    syncProcessChartLotModeButtons();
    updateProcessChart();
    triggerAutoSave();
}

/**
 * 工程確認チャートのモードボタンのアクティブ状態を同期する
 */
function syncProcessChartLotModeButtons() {
    const lotBtn   = document.getElementById('processLotBtn');
    const cycleBtn = document.getElementById('processCycleBtn');
    if (!lotBtn || !cycleBtn) return;
    const mode = (typeof processChartLotMode !== 'undefined') ? processChartLotMode : 'lot';
    const isCycleMode = (mode === 'cycle' || mode === 'single');
    lotBtn.classList.toggle('active', !isCycleMode);
    cycleBtn.classList.toggle('active', isCycleMode);
}

function toggleProcessChart() {
    const checkbox = document.getElementById('showProcessChart');
    showProcessChart = checkbox.checked;
    
    if (showProcessChart) {
        // まず即座に表示状態に変更
        const processContainer = document.getElementById('processChartContainer');
        if (processContainer) {
            processContainer.style.display = 'block';
        }
        
        // DOM更新とレンダリングを確実に完了させる
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // 強制的にサイズ同期を実行（高さ修正版）
                if (typeof forceProcessChartSizeSync === 'function') {
                    forceProcessChartSizeSync();
                }
                
                // 同期完了後に安全なチャート描画
                setTimeout(() => {
                    safeUpdateChart('process', () => {
                        if (typeof updateProcessChart === 'function') {
                            updateProcessChart();
                            
                            // 追加の安全措置として再描画
                            setTimeout(() => {
                                safeUpdateChart('process', () => {
                                    updateProcessChart();
                                });
                            }, 120);
                        }
                    });
                }, 70);
            });
        });
    } else {
        // 非表示にする場合：通常の処理
        if (typeof updateProcessChartVisibilityStable === 'function') {
            updateProcessChartVisibilityStable();
        }
    }
    
    // 設定を保存
    triggerAutoSave();
    
    // 簡潔なフィードバック
    const status = showProcessChart ? '表示' : '非表示';
    showNotificationBanner(`工程確認チャートを${status}にしました。`, 'info', 1500);
}


/**
 * 頻度作業チャート更新
 * ★修正: safeUpdateChart('frequency', ...) 依存を除去。
 *   旧: isFrequencyCanvasReady フラグが立つまで全更新がキューに積まれ、
 *       processPendingUpdates('frequency') が呼ばれないと永遠に実行されなかった。
 *   新: canvas/ctx の存在チェックのみで判定し、確定次第即時実行する。
 *       これによりスライダー操作・スケールモード切替・タブ復帰いずれの経路でも
 *       メインチャートと同一フレーム内でスケールが同期される。
 */
function updateFrequencyChart() {
    // canvas/ctx が未初期化ならペンディングに積んで終了
    if (!frequencyCanvas || !frequencyCtx) {
        pendingChartUpdates.push({ chartType: 'frequency', updateFunction: updateFrequencyChart });
        return;
    }
    // 初期化済みとして isFrequencyCanvasReady を自動補完（boot.js で設定漏れがあっても動作する）
    if (!isFrequencyCanvasReady) {
        isFrequencyCanvasReady = true;
    }

    {
        if (!showFrequencyChart) {
            if (typeof updateFrequencyChartVisibility === 'function') updateFrequencyChartVisibility();
            return;
        }

        if (!frequencyCanvas || !frequencyCtx) return;

        // 頻度作業の有無に応じたコンテナ表示制御（ゴーストゾーン含む）を委譲
        if (typeof updateFrequencyChartVisibility === 'function') updateFrequencyChartVisibility();
        if (frequencyWorkItems.length === 0) return;

        // 高さを動的に調整
        const requiredHeight = FREQUENCY_TOP_MARGIN + (frequencyWorkItems.length * FREQUENCY_ROW_HEIGHT) + FREQUENCY_BOTTOM_MARGIN;
        if (Math.abs(requiredHeight - frequencyCanvasHeight) > 10) {
            frequencyCanvasHeight = requiredHeight;
            updateHighDPICanvas(frequencyCanvas, frequencyCtx, frequencyCanvasWidth, frequencyCanvasHeight);
        }

        // ★修正: グローバル canvasWidth（ガントチャートの唯一の真値）を基準に幅を強制同期。
        //   旧: canvas.width / dpr を参照し閾値 >1px のみ同期 → 初期値 1400px が一致したまま
        //       スケール計算の基準値（canvasWidth）と実キャンバス幅がズレ続ける原因となっていた。
        //   新: 閾値なし（厳密一致）、かつグローバル canvasWidth を直接参照して確実に同期する。
        const devicePixelRatio = window.devicePixelRatio || 1;
        const targetWidth = (typeof canvasWidth === 'number' && canvasWidth > 0) ? canvasWidth
                          : (canvas && canvas.width > 0) ? canvas.width / devicePixelRatio
                          : frequencyCanvasWidth;
        if (frequencyCanvasWidth !== targetWidth) {
            frequencyCanvasWidth = targetWidth;
            updateHighDPICanvas(frequencyCanvas, frequencyCtx, frequencyCanvasWidth, frequencyCanvasHeight);
        }

        // 描画実行
        drawFrequencyChart();
    }
}


/**
 * キャンバスダブルクリック処理（併記モード対応版）
 */
function handleCanvasDoubleClick(event) {
    // 高解像度対応の座標取得
    const pos = getCanvasMousePosition(canvas, event);
    const y = pos.y;
    
    const displayItems = getDisplayWorkItems();
    
    // 挿入位置でのダブルクリック対応
    if (insertRowIndex >= 0) {
        openWorkModal(null, insertRowIndex);
        return;
    }
    
    const rowIndex = getRowIndexFromY(y);
    
    // 登録項目の範囲内でのダブルクリック
    if (rowIndex >= 0 && rowIndex < displayItems.length) {
        const targetItem = displayItems[rowIndex];
        openWorkModal(targetItem.id);
        return;
    }
    
    // ★★★ 修正：統一された行数計算を使用 ★★★
    const totalDisplayRows = getTotalDisplayRows();
    
    // 登録項目の最後の項目を超えた場合は新規追加
    // 併記モードでは総行数で判定
    if (rowIndex === -1 && y > TOP_MARGIN + (totalDisplayRows * ROW_HEIGHT)) {
        openWorkModal(null, Math.min(displayItems.length, totalDisplayRows));
    }
}

/**
 * キャンバスマウスダウン処理（高解像度対応版・座標計算修正・複数選択対応）
 */
function handleCanvasMouseDown(event) {
    // 左クリック以外（右クリックなど）はここでは無視
    if (event.button !== 0) return;

    // 高解像度対応の統一座標取得
    const pos = getCanvasMousePosition(canvas, event);
    const x = pos.x;
    const y = pos.y;
    
    mouseDownPos = { x, y };
    
    const rowIndex = getRowIndexFromY(y);
    const displayItems = getDisplayWorkItems();

    // コンテキストメニューが開いていれば閉じる
    if (typeof closeChartContextMenu === 'function') {
        closeChartContextMenu();
    }
    
    if (rowIndex >= 0 && rowIndex < displayItems.length) {
        // Shiftキーが押されている場合（範囲選択）
        if (event.shiftKey && lastSelectedRowIndex !== -1) {
            const start = Math.min(lastSelectedRowIndex, rowIndex);
            const end = Math.max(lastSelectedRowIndex, rowIndex);
            selectedRowIndices = [];
            for (let i = start; i <= end; i++) {
                selectedRowIndices.push(i);
            }
        } 
        // Ctrl/Meta(Cmd)キーが押されている場合（トグル選択）
        else if (event.ctrlKey || event.metaKey) {
            const idx = selectedRowIndices.indexOf(rowIndex);
            if (idx > -1) {
                selectedRowIndices.splice(idx, 1);
            } else {
                selectedRowIndices.push(rowIndex);
            }
            lastSelectedRowIndex = rowIndex;
        } 
        // 通常のクリック（単一選択）
        else {
            selectedRowIndices = [rowIndex];
            lastSelectedRowIndex = rowIndex;
        }

        draggedRowIndex = rowIndex;
        dragStartY = y;
        
        updateChart(); // 選択状態を描画反映
        event.preventDefault();
    } else {
        // 何もないところをクリックした場合、選択解除
        selectedRowIndices = [];
        lastSelectedRowIndex = -1;
        updateChart();
    }
}

/**
 * キャンバスコンテキストメニュー処理（右クリック）
 */
function handleCanvasContextMenu(event) {
    event.preventDefault();
    
    const pos = getCanvasMousePosition(canvas, event);
    const rowIndex = getRowIndexFromY(pos.y);
    const displayItems = getDisplayWorkItems();

    if (rowIndex >= 0 && rowIndex < displayItems.length) {
        // 右クリックした項目が現在の選択範囲に含まれていない場合、選択をその項目のみにする
        if (typeof selectedRowIndices === 'undefined' || !selectedRowIndices.includes(rowIndex)) {
            selectedRowIndices = [rowIndex];
            lastSelectedRowIndex = rowIndex;
            updateChart();
        }
        
        if (typeof showChartContextMenu === 'function') {
            showChartContextMenu(event.pageX, event.pageY, rowIndex, displayItems);
        }
    } else {
        // 余白を右クリックした場合は「新規追加」などのメニューを出す
        selectedRowIndices = [];
        lastSelectedRowIndex = -1;
        updateChart();
        
        if (typeof showChartContextMenu === 'function') {
            showChartContextMenu(event.pageX, event.pageY, -1, displayItems);
        }
    }
}

function handleGlobalMouseMove(event) {
    if (mouseDownPos && draggedRowIndex >= 0 && !canvasDragMode) {
        // 高解像度対応の統一座標取得
        const pos = getCanvasMousePosition(canvas, event);
        const currentX = pos.x;
        const currentY = pos.y;
        
        const distance = Math.sqrt(
            Math.pow(currentX - mouseDownPos.x, 2) + 
            Math.pow(currentY - mouseDownPos.y, 2)
        );
        
        if (distance > dragThreshold) {
            canvasDragMode = true;
            canvas.style.cursor = 'grabbing';
            
            document.getElementById('canvasContainer').classList.add('drag-active');
            const displayItems = getDisplayWorkItems();
            const draggedItem = displayItems[draggedRowIndex];
            showDragFeedback(event, draggedItem.name);
        }
    }
    
    if (canvasDragMode && draggedRowIndex >= 0) {
        // 高解像度対応の統一座標取得
        const pos = getCanvasMousePosition(canvas, event);
        const y = pos.y;
        
        updateDragFeedback(event);
        
        // ★★★ 修正：統一された行数計算を使用してより正確なドロップターゲット計算 ★★★
        const totalDisplayRows = getTotalDisplayRows();
        const relativeY = y - TOP_MARGIN;
        const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
        
        let newTargetIndex = -1;
        
        if (relativeY < 0) {
            // 最初の項目の前
            newTargetIndex = 0;
        } else if (relativeY >= totalDisplayRows * effectiveRowHeight) {
            // 最後の項目の後
            newTargetIndex = totalDisplayRows;
        } else {
            // 項目間
            newTargetIndex = Math.round(relativeY / effectiveRowHeight);
            newTargetIndex = Math.max(0, Math.min(totalDisplayRows, newTargetIndex));
        }
        
        if (newTargetIndex !== dropTargetIndex) {
            dropTargetIndex = newTargetIndex;
            updateChart();
        }
    }
}

/**
 * ディスプレイアイテムを安全に取得するヘルパー関数
 */
function getDisplayItemByIndexSafe(index) {
    const displayItems = getDisplayWorkItems();
    if (displayMode !== 'both') {
        return displayItems[index];
    }
    if (index < displayItems.length) {
        return displayItems[index];
    }
    const improvedOnlyItems = improvedWorkOrder
        .map(id => workItems.find(item => item.id === id))
        .filter(item => item && (item.targetScope === 'improved-only'));
    const improvedOnlyIndex = index - displayItems.length;
    if (improvedOnlyIndex >= 0 && improvedOnlyIndex < improvedOnlyItems.length) {
        return improvedOnlyItems[improvedOnlyIndex];
    }
    return null;
}

/**
 * グローバルマウスアップ処理（修正版：インデックス変換対応・グループD&D修正・併記モードエラー解消）
 */
function handleGlobalMouseUp(event) {
    if (canvasDragMode) {
        canvasDragMode = false;
        canvas.style.cursor = 'pointer';
        
        document.getElementById('canvasContainer').classList.remove('drag-active');
        hideDragFeedback();
        
        if (dropTargetIndex >= 0 && dropTargetIndex !== draggedRowIndex) {
            const draggedItem = getDisplayItemByIndexSafe(draggedRowIndex);
            
            if (draggedItem) {
                try {
                    let draggedIds = [];
                    let sourceGroupId = null;

                    // ドラッグされたアイテム(群)の特定
                    if (draggedItem.isGroup || draggedItem.isGroupHeader) {
                        const groups = displayMode === 'improved' ? improvedWorkGroups : currentWorkGroups;
                        const grp = groups.find(g => g.id === draggedItem.id);
                        if (grp) {
                            draggedIds = [...grp.itemIds];
                            sourceGroupId = grp.id;
                        } else {
                            draggedIds = draggedItem.itemIds ? [...draggedItem.itemIds] : [];
                            sourceGroupId = draggedItem.id;
                        }
                    } else {
                        // 複数選択された項目をドラッグする場合の対応
                        if (selectedRowIndices && selectedRowIndices.length > 1 && selectedRowIndices.includes(draggedRowIndex)) {
                            draggedIds = selectedRowIndices.map(idx => {
                                const item = getDisplayItemByIndexSafe(idx);
                                return item && !item.isGroup && !item.isGroupHeader ? item.id : null;
                            }).filter(Boolean);
                            
                            // 複数選択された項目が同じグループに属しているか確認
                            const firstItem = getDisplayItemByIndexSafe(selectedRowIndices[0]);
                            if (firstItem && firstItem.inGroup) {
                                const allSameGroup = selectedRowIndices.every(idx => {
                                    const item = getDisplayItemByIndexSafe(idx);
                                    return item && item.inGroup === firstItem.inGroup;
                                });
                                if (allSameGroup) {
                                    sourceGroupId = firstItem.inGroup;
                                }
                            }
                        } else {
                            draggedIds = [draggedItem.id];
                            if (draggedItem.inGroup) {
                                sourceGroupId = draggedItem.inGroup;
                            }
                        }
                    }

                    if (draggedIds.length === 0) throw new Error('ドラッグ対象のIDが特定できませんでした。');

                    let targetGroupId = null;
                    let referenceId = null;
                    let targetItem = null;

                    if (dropTargetIndex < getTotalDisplayRows()) {
                        targetItem = getDisplayItemByIndexSafe(dropTargetIndex);
                    }

                    const activeGroups = displayMode === 'improved' ? improvedWorkGroups : currentWorkGroups;
                    
                    // ドラッグ対象がグループ全体かどうかの判定を前倒しで実行
                    let isDraggingWholeGroup = false;
                    if (sourceGroupId) {
                        const srcGroup = activeGroups.find(g => g.id === sourceGroupId);
                        if (srcGroup) {
                            isDraggingWholeGroup = srcGroup.itemIds.length === draggedIds.length && 
                                srcGroup.itemIds.every(id => draggedIds.includes(id));
                        }
                    }

                    // ターゲットと挿入位置(referenceId)の特定
                    if (!targetItem) {
                        // 末尾への追加
                        referenceId = null;
                        targetGroupId = null;
                    } else {
                        if (targetItem.isGroup || targetItem.isGroupHeader) {
                            const grp = activeGroups.find(g => g.id === targetItem.id);
                            if (grp && grp.itemIds.length > 0) {
                                referenceId = grp.itemIds[0];
                            }
                            
                            // 所属するグループのヘッダーにドロップした場合はグループ内先頭への移動とみなす
                            if (sourceGroupId === targetItem.id && !isDraggingWholeGroup) {
                                targetGroupId = sourceGroupId;
                            } else {
                                targetGroupId = null; // まとめの外に配置
                            }
                        } else if (targetItem.inGroup) {
                            referenceId = targetItem.id;
                            targetGroupId = targetItem.inGroup;
                        } else {
                            referenceId = targetItem.id;
                            targetGroupId = null;
                        }
                    }

                    // ★ グループ内の並べ替えにおける境界判定の改善
                    // 単一・複数アイテムを移動した際、移動先が自分のグループの末尾境界だった場合はグループを維持する
                    if (!isDraggingWholeGroup && sourceGroupId && targetGroupId !== sourceGroupId) {
                        let prevItem = null;
                        if (dropTargetIndex > 0) {
                            prevItem = getDisplayItemByIndexSafe(dropTargetIndex - 1);
                        }
                        // 直前の要素が自分のグループの要素（または自分のヘッダー）なら、グループ内に留まる
                        if (prevItem && (prevItem.inGroup === sourceGroupId || prevItem.id === sourceGroupId)) {
                            targetGroupId = sourceGroupId;
                        }
                    }

                    // ★ グループ全体移動時の他グループ破壊防止
                    // グループ全体をドラッグしていて、ドロップ先が他のグループの場合、ターゲットグループの前に配置する
                    if (isDraggingWholeGroup && targetGroupId) {
                        const tgtGroup = activeGroups.find(g => g.id === targetGroupId);
                        if (tgtGroup && tgtGroup.itemIds.length > 0) {
                            referenceId = tgtGroup.itemIds[0];
                        }
                        targetGroupId = null; 
                    }

                    // 複数アイテム（まとめ全体以外）を別のまとめに入れる操作は禁止
                    if (sourceGroupId && draggedIds.length > 1 && !isDraggingWholeGroup && targetGroupId) {
                        targetGroupId = null; 
                    }

                    // 併記モードのバリデーションと更新対象の確定
                    let arraysToUpdate = [];
                    if (displayMode === 'both') {
                        if (draggedItem.isGroup || draggedItem.inGroup || draggedItem.isGroupHeader || targetGroupId) {
                            showNotificationBanner('併記モードではまとめ項目の並べ替えはできません。改善前または改善後モードで操作してください。', 'warning', 4000);
                            throw new Error('both mode group sort block');
                        }
                        
                        const dragScope = draggedItem.targetScope || 'common';
                        const targetScope = targetItem ? (targetItem.targetScope || 'common') : null;
                        
                        const isDragCurrentArea = (dragScope === 'common' || dragScope === 'current-only');
                        const currentAreaLength = getDisplayWorkItems().length; // current順ベースでの表示件数
                        const isTargetCurrentArea = targetItem ? (targetScope === 'common' || targetScope === 'current-only') : (dropTargetIndex <= currentAreaLength);

                        if (isDragCurrentArea !== isTargetCurrentArea) {
                            showNotificationBanner('併記モードでは改善前と改善後の領域をまたいだ並べ替えはできません。', 'warning', 4000);
                            throw new Error('both mode cross area block');
                        }

                        if (isDragCurrentArea) {
                            arraysToUpdate = [{ arr: currentWorkOrder, groups: currentWorkGroups }];
                        } else {
                            arraysToUpdate = [{ arr: improvedWorkOrder, groups: improvedWorkGroups }];
                        }
                    } else {
                        if (displayMode === 'improved') {
                            arraysToUpdate = [{ arr: improvedWorkOrder, groups: improvedWorkGroups }];
                        } else {
                            arraysToUpdate = [{ arr: currentWorkOrder, groups: currentWorkGroups }];
                        }
                    }

                    // 順序とまとめ(グループ)状態の更新
                    arraysToUpdate.forEach(({ arr, groups }) => {
                        // ① ドラッグ先の referenceId がドラッグアイテム自身に含まれている場合は無効
                        if (referenceId !== null && draggedIds.includes(referenceId)) {
                            return; // スキップ
                        }

                        // ② 元の配列 (arr) における、挿入目標インデックスを計算する
                        let insertIdx = arr.length;
                        if (referenceId !== null) {
                            insertIdx = arr.indexOf(referenceId);
                            if (insertIdx === -1) insertIdx = arr.length;
                        }

                        // ドラッグされるアイテムが、挿入目標インデックスより前に何個あるか数える
                        // これにより、削除後の正しい挿入インデックスを算出できる
                        let shiftCount = 0;
                        for (let i = 0; i < insertIdx; i++) {
                            if (draggedIds.includes(arr[i])) {
                                shiftCount++;
                            }
                        }
                        const finalInsertIdx = insertIdx - shiftCount;

                        // ③ 元の配列 (arr) からドラッグ対象をすべて抽出（削除）
                        const extracted = [];
                        for (let i = 0; i < arr.length; i++) {
                            if (draggedIds.includes(arr[i])) {
                                extracted.push(arr[i]);
                            }
                        }
                        for (let i = arr.length - 1; i >= 0; i--) {
                            if (draggedIds.includes(arr[i])) {
                                arr.splice(i, 1);
                            }
                        }

                        // ④ 正しい位置に挿入
                        arr.splice(finalInsertIdx, 0, ...extracted);

                        // ⑤ グループ所属の更新
                        if (isDraggingWholeGroup) {
                            // グループ全体を移動した場合は何もしない（そのままグループを維持）
                            // ただし、グループ内の順序をarrに合わせて同期させる
                            const srcGroup = groups.find(g => g.id === sourceGroupId);
                            if (srcGroup) {
                                srcGroup.itemIds.sort((a, b) => arr.indexOf(a) - arr.indexOf(b));
                            }
                        } else {
                            // 単一アイテムの移動の場合
                            const draggedId = draggedIds[0];

                            // もともとグループに所属していた場合、そこから除外する
                            // ただし、移動先が同じグループ（targetGroupId === sourceGroupId）の場合は除外しない
                            if (sourceGroupId && sourceGroupId !== targetGroupId) {
                                const srcGroup = groups.find(g => g.id === sourceGroupId);
                                if (srcGroup) {
                                    srcGroup.itemIds = srcGroup.itemIds.filter(id => id !== draggedId);
                                }
                            }

                            // 新しいグループに参加する場合
                            if (targetGroupId && sourceGroupId !== targetGroupId) {
                                const tgtGroup = groups.find(g => g.id === targetGroupId);
                                if (tgtGroup) {
                                    tgtGroup.itemIds.push(draggedId);
                                    tgtGroup.itemIds.sort((a, b) => arr.indexOf(a) - arr.indexOf(b));
                                }
                            }
                        }

                        // ⑥ グループのクリーンアップとアイテム順序の完全同期
                        for (let i = groups.length - 1; i >= 0; i--) {
                            const g = groups[i];
                            // arr に存在しない要素をクリーンアップ
                            g.itemIds = g.itemIds.filter(id => arr.includes(id));

                            if (g.itemIds.length <= 1) {
                                groups.splice(i, 1);
                            } else {
                                // グループ内の要素が連続しているかチェックし、連続していなければ分断する
                                // 連続するように強制的に寄せるのではなく、現在の配列上で連続している部分だけをグループとして残す
                                g.itemIds.sort((a, b) => arr.indexOf(a) - arr.indexOf(b));
                                
                                const continuousChunks = [];
                                let currentChunk = [g.itemIds[0]];
                                
                                for (let j = 1; j < g.itemIds.length; j++) {
                                    const prevIdx = arr.indexOf(g.itemIds[j-1]);
                                    const currIdx = arr.indexOf(g.itemIds[j]);
                                    if (currIdx === prevIdx + 1) {
                                        currentChunk.push(g.itemIds[j]);
                                    } else {
                                        continuousChunks.push(currentChunk);
                                        currentChunk = [g.itemIds[j]];
                                    }
                                }
                                continuousChunks.push(currentChunk);
                                
                                // 最も大きいチャンクをそのグループとして残し、他はグループから外す
                                continuousChunks.sort((a, b) => b.length - a.length);
                                const mainChunk = continuousChunks[0];
                                
                                if (mainChunk.length <= 1) {
                                    // 最大チャンクでも1つ以下ならグループ解散
                                    groups.splice(i, 1);
                                } else {
                                    g.itemIds = mainChunk;
                                }
                            }
                        }
                    });

                    updateChart();
                    triggerAutoSave();
                    
                    if (targetGroupId && sourceGroupId !== targetGroupId) {
                        showNotificationBanner('項目をまとめ内に移動しました。', 'success', 2000);
                    } else if (sourceGroupId && !targetGroupId) {
                        showNotificationBanner('項目をまとめから外しました。', 'success', 2000);
                    } else {
                        showNotificationBanner('作業項目の順序を変更しました。', 'success', 1000);
                    }

                } catch (error) {
                    if(error.message !== 'both mode group sort block' && error.message !== 'both mode cross area block'){
                        console.error('Error during drag and drop:', error);
                    }
                }
            }
        }
        
        draggedRowIndex = -1;
        dropTargetIndex = -1;
        updateChart();
    }
    
    mouseDownPos = null;
    draggedRowIndex = -1;
}

/**
 * グローバルマウス移動処理（修正版：ドロップターゲット計算精度向上）
 */
function handleGlobalMouseMove(event) {
    if (mouseDownPos && draggedRowIndex >= 0 && !canvasDragMode) {
        // 高解像度対応の統一座標取得
        const pos = getCanvasMousePosition(canvas, event);
        const currentX = pos.x;
        const currentY = pos.y;
        
        const distance = Math.sqrt(
            Math.pow(currentX - mouseDownPos.x, 2) + 
            Math.pow(currentY - mouseDownPos.y, 2)
        );
        
        if (distance > dragThreshold) {
            canvasDragMode = true;
            canvas.style.cursor = 'grabbing';
            
            document.getElementById('canvasContainer').classList.add('drag-active');
            const displayItems = getDisplayWorkItems();
            const draggedItem = displayItems[draggedRowIndex];
            showDragFeedback(event, draggedItem.name);
        }
    }
    
    if (canvasDragMode && draggedRowIndex >= 0) {
        // 高解像度対応の統一座標取得
        const pos = getCanvasMousePosition(canvas, event);
        const y = pos.y;
        
        updateDragFeedback(event);
        
        // ★★★ 修正：より正確なドロップターゲット計算 ★★★
        const displayItems = getDisplayWorkItems();
        
        // 併記モードの場合は改善後のみの項目も含める
        let totalDisplayRows = displayItems.length;
        if (displayMode === 'both') {
            const improvedOnlyItems = improvedWorkOrder
                .map(id => workItems.find(item => item.id === id))
                .filter(item => {
                    if (!item) return false;
                    const targetScope = item.targetScope || 'common';
                    return targetScope === 'improved-only';
                });
            totalDisplayRows += improvedOnlyItems.length;
        }
        const relativeY = y - TOP_MARGIN;
        const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
        
        let newTargetIndex = -1;
        
        if (relativeY < 0) {
            // 最初の項目の前
            newTargetIndex = 0;
        } else if (relativeY >= totalDisplayRows * effectiveRowHeight) {
            // 最後の項目の後
            newTargetIndex = totalDisplayRows;
        } else {
            // 項目間 - より正確な境界判定
            const rowFloat = relativeY / effectiveRowHeight;
            const rowFloor = Math.floor(rowFloat);
            const rowFraction = rowFloat - rowFloor;
            
            // 行の中央より上なら行の前、下なら行の後に挿入
            if (rowFraction < 0.5) {
                newTargetIndex = rowFloor;
            } else {
                newTargetIndex = rowFloor + 1;
            }
            
            // 範囲内に収める
            newTargetIndex = Math.max(0, Math.min(totalDisplayRows, newTargetIndex));
        }
        
        if (newTargetIndex !== dropTargetIndex) {
            dropTargetIndex = newTargetIndex;
            updateChart();
        }
    }
}

/**
 * キャンバスダブルクリック処理（グループ開閉対応版）
 */
function handleCanvasDoubleClick(event) {
    // 高解像度対応の座標取得
    const pos = getCanvasMousePosition(canvas, event);
    const y = pos.y;
    
    const displayItems = getDisplayWorkItems();
    
    // 併記モードの場合は改善後のみの項目も含める
    let totalDisplayItems = displayItems.length;
    if (displayMode === 'both') {
        const improvedOnlyItems = improvedWorkOrder
            .map(id => workItems.find(item => item.id === id))
            .filter(item => {
                if (!item) return false;
                const targetScope = item.targetScope || 'common';
                return targetScope === 'improved-only';
            });
        totalDisplayItems += improvedOnlyItems.length;
    }
    
    // 挿入位置でのダブルクリック対応
    if (insertRowIndex >= 0) {
        openWorkModal(null, insertRowIndex);
        return;
    }
    
    const rowIndex = getRowIndexFromY(y);
    
    // 登録項目の範囲内でのダブルクリック
    if (rowIndex >= 0 && rowIndex < totalDisplayItems) {
        // 実際の表示項目から対象項目を取得
        let targetItem = null;
        if (rowIndex < displayItems.length) {
            targetItem = displayItems[rowIndex];
        } else if (displayMode === 'both') {
            // 改善後のみの項目から取得
            const improvedOnlyItems = improvedWorkOrder
                .map(id => workItems.find(item => item.id === id))
                .filter(item => {
                    if (!item) return false;
                    const targetScope = item.targetScope || 'common';
                    return targetScope === 'improved-only';
                });
            const improvedOnlyIndex = rowIndex - displayItems.length;
            if (improvedOnlyIndex >= 0 && improvedOnlyIndex < improvedOnlyItems.length) {
                targetItem = improvedOnlyItems[improvedOnlyIndex];
            }
        }
        
        if (targetItem) {
            // グループ項目の場合は開閉をトグルする
            if (targetItem.isGroup || targetItem.isGroupHeader) {
                const groups = displayMode === 'improved' ? improvedWorkGroups : currentWorkGroups;
                const group = groups.find(g => g.id === targetItem.id);
                if (group) {
                    group.collapsed = !group.collapsed;
                    updateChart();
                    triggerAutoSave();
                }
                return;
            }
            openWorkModal(targetItem.id);
        }
        return;
    }
    
    // ★★★ 修正：新規追加時の位置計算 ★★★
    const relativeY = y - TOP_MARGIN;
    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    
    // 表示項目領域を超えた場合は最後に追加
    if (relativeY > totalDisplayItems * effectiveRowHeight) {
        openWorkModal(null, totalDisplayItems);
        return;
    }
    
    // その他の場合は項目間への挿入位置を計算
    if (relativeY >= 0) {
        const insertPos = Math.min(totalDisplayItems, Math.ceil(relativeY / effectiveRowHeight));
        openWorkModal(null, insertPos);
    }
}

/**
 * キャンバスマウス移動処理（修正版：挿入位置計算修正）
 */
function handleCanvasMouseMove(event) {
    if (canvasDragMode) return;
    
    // 高解像度対応の統一座標取得
    const pos = getCanvasMousePosition(canvas, event);
    const x = pos.x;
    const y = pos.y;
    
    const displayItems = getDisplayWorkItems();
    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    
    // 併記モードの場合は改善後のみの項目も含める
    let totalDisplayItems = displayItems.length;
    if (displayMode === 'both') {
        const improvedOnlyItems = improvedWorkOrder
            .map(id => workItems.find(item => item.id === id))
            .filter(item => {
                if (!item) return false;
                const targetScope = item.targetScope || 'common';
                return targetScope === 'improved-only';
            });
        totalDisplayItems += improvedOnlyItems.length;
    }
    
    let newInsertRowIndex = -1;
    let newHoveredRowIndex = -1;
    
    // ★★★ 修正：項目間の境界線チェック（挿入位置精度向上） ★★★
    for (let i = 0; i <= totalDisplayItems; i++) {
        const boundaryY = TOP_MARGIN + (i * effectiveRowHeight);
        if (Math.abs(y - boundaryY) <= 15) {
            newInsertRowIndex = i;
            // 横位置を作業項目名の開始位置（leftMarginの少し手前など）に合わせる
            const canvasRect = canvas.getBoundingClientRect();
            const targetX = canvasRect.left + window.scrollX + 40;
            // オレンジ系ツールチップで表示
            showDynamicTooltip(event, 'ここに新しい作業項目を追加（ダブルクリック）', 'insert', targetX);
            canvas.style.cursor = 'copy';
            break;
        }
    }
    
    if (newInsertRowIndex === -1) {
        // 既存項目のマウスオーバー（半透過グレーツールチップ）
        for (let i = 0; i < displayItems.length; i++) {
            const rowY = TOP_MARGIN + (i * effectiveRowHeight);
            if (y >= rowY && y <= rowY + effectiveRowHeight) {
                newHoveredRowIndex = i;
                
                const item = displayItems[i];
                let hoverMode = displayMode;
                if (displayMode === 'both') {
                    const midY = rowY + effectiveRowHeight / 2;
                    hoverMode = y < midY ? 'current' : 'improved';
                }
                
                let manualTime, autoTime, walkTime;
                if (hoverMode === 'improved' && item.improved) {
                    manualTime = item.improved.manualTime;
                    autoTime = item.improved.autoTime;
                    walkTime = item.improved.walkTime;
                } else {
                    manualTime = item.manualTime;
                    autoTime = item.autoTime;
                    walkTime = item.walkTime;
                }
                
                const modeLabel = hoverMode === 'improved' ? '改善後' : '改善前';
                const categoryLabels = {
                    normal: '通常',
                    monitor: '監視',
                    wait: '手待ち'
                };
                
                // 半透過グレーツールチップで表示
                const tooltipContent = `
                    <strong>${item.name}</strong> (${modeLabel})<br>
                    分類: ${categoryLabels[item.category] || '通常'}<br>
                    手作業: ${manualTime}秒<br>
                    自動送り: ${autoTime}秒<br>
                    歩行: ${walkTime}秒<br>
                    <em>ダブルクリックで編集 | ドラッグで移動</em>
                `;
                showDynamicTooltip(event, tooltipContent, 'default');
                canvas.style.cursor = 'grab';
                
                hoveredRowIndex = i;
                break;
            }
        }
    }

    // insertRowIndex の状態が変化した場合、再描画
    if (newInsertRowIndex !== insertRowIndex) {
        insertRowIndex = newInsertRowIndex;
        updateChart();
    }
    
    // hoveredRowIndex の状態が変化した場合、再描画
    if (newHoveredRowIndex !== hoveredRowIndex) {
        hoveredRowIndex = newHoveredRowIndex;
        updateChart();
    }

    // どの行もホバーしていない場合
    if (newInsertRowIndex === -1 && newHoveredRowIndex === -1) {
        hideDynamicTooltip();
        canvas.style.cursor = 'default';
    }
    
    if (hoveredRowIndex !== -1) {
        updateChart();
    }
}

// ========================================
// Mouse Event Handlers (高解像度対応版)
// ========================================

/**
 * キャンバスマウス移動処理（併記モード対応版・座標計算修正）
 */
function handleCanvasMouseMove(event) {
    if (canvasDragMode) return;
    
    // 右クリックメニューが表示されている場合はツールチップを出さない
    const contextMenu = document.getElementById('chartContextMenu');
    if (contextMenu && contextMenu.style.display === 'block') {
        hideDynamicTooltip();
        canvas.style.cursor = 'default';
        return;
    }
    
    // 高解像度対応の統一座標取得
    const pos = getCanvasMousePosition(canvas, event);
    const x = pos.x;
    const y = pos.y;
    
    // ★★★ 統一された行数計算を使用 ★★★
    const totalDisplayRows = getTotalDisplayRows();
    const displayItems = getDisplayWorkItems(); // マウスオーバー表示用
    
    let newInsertRowIndex = -1;
    let newHoveredRowIndex = -1;
    
    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    
    // 項目間の境界線チェック（項目追加・オレンジ系ツールチップ）
    for (let i = 0; i <= totalDisplayRows; i++) {
        const boundaryY = TOP_MARGIN + (i * effectiveRowHeight);
        if (Math.abs(y - boundaryY) <= 15) {
            newInsertRowIndex = i;
            // 最下端（最後の行の下）は「末尾に追加」を明示
            const tipText = (i === totalDisplayRows && totalDisplayRows > 0)
                ? '末尾に作業項目を追加（ダブルクリック）'
                : 'ここに作業項目を挿入（ダブルクリック）';
            
            // 横位置を作業項目名の開始位置に合わせる
            const canvasRect = canvas.getBoundingClientRect();
            const targetX = canvasRect.left + window.scrollX + 40;
            
            showDynamicTooltip(event, tipText, 'insert', targetX);
            canvas.style.cursor = 'copy';
            break;
        }
    }
    
    if (newInsertRowIndex === -1) {
        // 既存項目のマウスオーバー（半透過グレーツールチップ）
        // 注意：併記モードでは実際の表示項目数と総行数が異なるため、
        // マウスオーバーは表示項目の範囲内でのみ実行
        for (let i = 0; i < Math.min(displayItems.length, totalDisplayRows); i++) {
            const rowY = TOP_MARGIN + (i * effectiveRowHeight);
            if (y >= rowY && y <= rowY + effectiveRowHeight) {
                newHoveredRowIndex = i;
                
                // displayItemsの範囲内でのみアクセス
                if (i < displayItems.length) {
                    const item = displayItems[i];

                    let hoverMode = displayMode;
                    if (displayMode === 'both') {
                        const midY = rowY + effectiveRowHeight / 2;
                        hoverMode = y < midY ? 'current' : 'improved';
                    }
                    
                    let manualTime, autoTime, walkTime;
                    if (hoverMode === 'improved' && item.improved) {
                        manualTime = item.improved.manualTime;
                        autoTime = item.improved.autoTime;
                        walkTime = item.improved.walkTime;
                    } else {
                        manualTime = item.manualTime;
                        autoTime = item.autoTime;
                        walkTime = item.walkTime;
                    }
                    
                    const modeLabel = hoverMode === 'improved' ? '改善後' : '改善前';
                    const categoryLabels = {
                        normal: '通常',
                        monitor: '監視',
                        wait: '手待ち'
                    };
                    
                    // 半透過グレーツールチップで表示
                    const tooltipContent = `
                        <strong>${item.name}</strong> (${modeLabel})<br>
                        分類: ${categoryLabels[item.category] || '通常'}<br>
                        手作業: ${manualTime}秒<br>
                        自動送り: ${autoTime}秒<br>
                        歩行: ${walkTime}秒<br>
                        <em>ダブルクリックで編集 | ドラッグで移動</em>
                    `;
                    showDynamicTooltip(event, tooltipContent, 'default');
                    canvas.style.cursor = 'grab';
                    
                    hoveredRowIndex = i;
                }
                break;
            }
        }
    }

    // insertRowIndex の状態が変化した場合、再描画
    if (newInsertRowIndex !== insertRowIndex) {
        insertRowIndex = newInsertRowIndex;
        updateChart();
    }
    
    // hoveredRowIndex の状態が変化した場合、再描画
    if (newHoveredRowIndex !== hoveredRowIndex) {
        hoveredRowIndex = newHoveredRowIndex;
        updateChart();
    }

    // どの行もホバーしていない場合
    if (newInsertRowIndex === -1 && newHoveredRowIndex === -1) {
        hideDynamicTooltip();
        canvas.style.cursor = 'default';
    }
    
    if (hoveredRowIndex !== -1) {
        updateChart();
    }
}

/**
 * 工程確認チャートのマウス移動処理（修正版：動的ロット数対応）
 */
function handleProcessCanvasMouseMove(event) {
    // 表示されていない場合は処理しない
    if (!showProcessChart) {
        return;
    }
    
    // 右クリックメニューが表示されている場合はツールチップを出さない
    const contextMenu = document.getElementById('chartContextMenu');
    if (contextMenu && contextMenu.style.display === 'block') {
        hideDynamicTooltip();
        return;
    }
    
    // 高解像度対応の座標取得
    const pos = getCanvasMousePosition(processCanvas, event);
    const x = pos.x;
    const y = pos.y;
    
    // 動的に最大ロット数を取得
    const maxLotNumber = getMaxLotNumber();
    
    // 行インデックスを計算（動的ロット数対応）
    const relativeY = y - PROCESS_TOP_MARGIN;
    let newHoveredRowIndex = -1;
    
    // 全ロット分の高さに対応
    if (relativeY >= 0 && relativeY <= maxLotNumber * PROCESS_ROW_HEIGHT) {
        newHoveredRowIndex = Math.floor(relativeY / PROCESS_ROW_HEIGHT);
        // 有効な範囲内かチェック（0からmaxLotNumber-1まで）
        if (newHoveredRowIndex < 0 || newHoveredRowIndex >= maxLotNumber) {
            newHoveredRowIndex = -1;
        }
    }
    
    // 行が変わった場合はチャートを再描画
    if (newHoveredRowIndex !== hoveredProcessRowIndex) {
        hoveredProcessRowIndex = newHoveredRowIndex;
        updateProcessChart();
    }
    
    checkProcessHover(x, y, event);
}

/**
 * 工程確認チャートのマウス離脱処理
 */
function handleProcessCanvasMouseLeave(event) {
    hideDynamicTooltip();
    if (hoveredProcessRowIndex !== -1) {
        hoveredProcessRowIndex = -1;
        updateProcessChart();
    }
}

/**
 * 工程確認チャートのダブルクリック処理
 * ダブルクリックした作業項目の編集モーダルを開く
 */
function handleProcessCanvasDoubleClick(event) {
    if (!showProcessChart) return;

    const pos = getCanvasMousePosition(processCanvas, event);
    const x = pos.x;
    const y = pos.y;

    const displayItems = getDisplayWorkItems();
    const settings = getChartCommonSettings();
    const { timeScale, leftMargin } = settings;
    const maxLotNumber = getMaxLotNumber();

    let foundItem = null;
    let cumulativeTime = 0;

    for (const item of displayItems) {
        let manualTime, autoTime, walkTime;
        if (displayMode === 'improved' && item.improved) {
            manualTime = item.improved.manualTime;
            autoTime  = item.improved.autoTime;
            walkTime  = item.improved.walkTime;
        } else {
            manualTime = item.manualTime;
            autoTime  = item.autoTime;
            walkTime  = item.walkTime;
        }

        const totalWorkTime = manualTime + autoTime + walkTime;
        const startX = leftMargin + cumulativeTime * timeScale;
        const endX   = leftMargin + (cumulativeTime + totalWorkTime) * timeScale;

        const normalizedProcess = normalizeProcessValue(item.process);
        let lotNumber = 1;
        if (normalizedProcess && normalizedProcess.startsWith('lot')) {
            const n = parseInt(normalizedProcess.substring(3), 10);
            if (!isNaN(n) && n >= 1 && n <= maxLotNumber) lotNumber = n;
        }

        const rowY    = PROCESS_TOP_MARGIN + (lotNumber - 1) * PROCESS_ROW_HEIGHT;
        const rowEndY = rowY + PROCESS_ROW_HEIGHT;

        if (x >= startX && x <= endX && y >= rowY && y <= rowEndY) {
            foundItem = item;
            break;
        }
        cumulativeTime += manualTime + walkTime;
    }

    if (foundItem) {
        if (typeof openWorkModal === 'function') {
            openWorkModal(foundItem.id);
        }
    }
}

/**
 * 工程確認チャートのマウスオーバーチェック（修正版：動的ロット数・正確な工程判定対応）
 */
function checkProcessHover(mouseX, mouseY, event) {
    const displayItems = getDisplayWorkItems();
    const settings = getChartCommonSettings();
    const { timeScale, leftMargin } = settings;
    const maxLotNumber = getMaxLotNumber();
    
    let foundItem = null;
    let cumulativeTime = 0;
    
    displayItems.forEach((item, index) => {
        let manualTime, autoTime, walkTime;
        if (displayMode === 'improved' && item.improved) {
            manualTime = item.improved.manualTime;
            autoTime = item.improved.autoTime;
            walkTime = item.improved.walkTime;
        } else {
            manualTime = item.manualTime;
            autoTime = item.autoTime;
            walkTime = item.walkTime;
        }
        
        const totalWorkTime = manualTime + autoTime + walkTime;
        const startX = leftMargin + (cumulativeTime * timeScale);
        const endX = leftMargin + ((cumulativeTime + totalWorkTime) * timeScale);
        
        // 工程値の正規化と解析
        const normalizedProcess = normalizeProcessValue(item.process);
        let lotNumber = 1; // デフォルト
        
        if (normalizedProcess && normalizedProcess.startsWith('lot')) {
            const extractedLotNumber = parseInt(normalizedProcess.substring(3), 10);
            if (!isNaN(extractedLotNumber) && extractedLotNumber >= 1 && extractedLotNumber <= maxLotNumber) {
                lotNumber = extractedLotNumber;
            }
        }
        
        // 対応する行のY座標を計算
        const rowIndex = lotNumber - 1; // 0-indexed
        const processRowY = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
        const processRowEndY = processRowY + PROCESS_ROW_HEIGHT;
        
        // ヒットテスト：X座標とY座標両方が範囲内かチェック
        if (mouseX >= startX && mouseX <= endX && 
            mouseY >= processRowY && mouseY <= processRowEndY) {
            foundItem = {
                item: item,
                startTime: cumulativeTime,
                endTime: cumulativeTime + totalWorkTime,
                totalWorkTime: totalWorkTime,
                manualTime: manualTime,
                autoTime: autoTime,
                walkTime: walkTime,
                process: normalizedProcess,
                lotNumber: lotNumber,
                rowIndex: rowIndex,
                event: event
            };
        }
        
        cumulativeTime += manualTime + walkTime; // 歩行時間も含めて累積
    });
    
    if (foundItem) {
        showProcessTooltip(foundItem);
    } else {
        hideDynamicTooltip();
    }
}


/**
 * 工程確認チャートのツールチップ表示（修正版：ロット番号表示対応・位置調整対応）
 */
function showProcessTooltip(itemInfo) {
    const lotLabel = `${itemInfo.lotNumber}ロット目${itemInfo.lotNumber === 1 ? ' (当)' : itemInfo.lotNumber === 2 ? ' (次)' : ''}`;
    
    const content = `
        <strong>${itemInfo.item.name}</strong><br>
        工程: ${lotLabel}<br>
        手作業時間: ${formatTimeDisplay(itemInfo.manualTime)}<br>
        自動送り時間: ${formatTimeDisplay(itemInfo.autoTime)}<br>
        歩行時間: ${formatTimeDisplay(itemInfo.walkTime)}<br>
        合計時間: ${formatTimeDisplay(itemInfo.totalWorkTime)}
    `;
    
    showDynamicTooltip(itemInfo.event, content, 'process');
}



// ========================================
// Drag Feedback Functions (Business Enhanced)
// ========================================

function showDragFeedback(event, itemName) {
    const feedback = document.getElementById('dragFeedback');
    feedback.innerHTML = `<i class="fas fa-arrows-alt"></i><span style="margin-left:6px;">${itemName}</span>`;
    feedback.style.display = 'flex';
    feedback.style.alignItems = 'center';
    feedback.style.left = (event.pageX + 15) + 'px';
    feedback.style.top = (event.pageY - 10) + 'px';
}

function updateDragFeedback(event) {
    const feedback = document.getElementById('dragFeedback');
    if (feedback.style.display === 'block') {
        feedback.style.left = (event.pageX + 15) + 'px';
        feedback.style.top = (event.pageY - 10) + 'px';
    }
}

function hideDragFeedback() {
    document.getElementById('dragFeedback').style.display = 'none';
}

/**
 * 標準作業（ガントチャート）の表示/非表示を切り替える（依存関係制御付き）
 */
function toggleGanttChart() {
    const checkbox = document.getElementById('showGanttChart');
    showGanttChart = checkbox.checked;

    const ganttContainer = document.getElementById('ganttChartContainer');
    const optionsContainer = document.getElementById('ganttChartOptionsContainer');

    if (showGanttChart) {
        // --- 表示する場合 ---
        if (ganttContainer) ganttContainer.style.display = 'block';
        if (optionsContainer) optionsContainer.classList.add('visible');
        updateChart();
    } else {
        // --- 非表示にする場合 ---
        if (ganttContainer) ganttContainer.style.display = 'none';
        if (optionsContainer) optionsContainer.classList.remove('visible');
    }

    triggerAutoSave();
    const status = showGanttChart ? '有効' : '無効';
    showNotificationBanner(`標準作業組合せ票を${status}にしました。`, 'info', 1500);
}

/**
 * データ出力（修正版：包括的エクスポート）
 */
function exportData() {
    try {
        if (typeof showProgressIndicator === 'function') {
            showProgressIndicator('データを出力中...', true);
        }
        
        const data = getCurrentDataObject();
        
        // 出力用の追加メタデータ
        data.exportMetadata = {
            exportedBy: '標準作業組合せ票',
            exportTimestamp: new Date().toISOString(),
            applicationVersion: APP_VERSION,
            browserInfo: navigator.userAgent,
            dataIntegrity: calculateDataChecksum(data)
        };
        
        // JSONファイルとして出力
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        
        // ファイル名の生成（日本語ファイル名対応）
        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toTimeString().substr(0, 5).replace(':', '');
        const productName = data.product ? `_${data.product.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')}` : '';
        
        a.download = `標準作業組合せ票${productName}_${dateStr}_${timeStr}.json`;
        
        // ダウンロードを実行
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // URL解放
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
        
        if (typeof showProgressIndicator === 'function') {
            showProgressIndicator('', false);
        }
        
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner(`データを出力しました。(ファイル名: ${a.download})`, 'success', 3000);
        }
        
        // エクスポート統計の表示
        const stats = data.statistics;
        if (stats && typeof showNotificationBanner === 'function') {
            setTimeout(() => {
                showNotificationBanner(
                    `出力データ: 作業項目${stats.workItemCount}件、頻度作業${stats.frequencyWorkCount}件、時間帯${stats.timeSlotCount}件`, 
                    'info', 
                    2000
                );
            }, 1000);
        }
        
    } catch (error) {
        console.error('Export error:', error);
        if (typeof showProgressIndicator === 'function') {
            showProgressIndicator('', false);
        }
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('データの出力に失敗しました。', 'error', 3000);
        }
    }
}

/**
 * データ読み込み（修正版：包括的インポート）
 */
function importData() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.multiple = false;
        
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            // ファイルサイズチェック（10MB制限）
            if (file.size > 10 * 1024 * 1024) {
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner('ファイルサイズが大きすぎます。10MB以下のファイルを選択してください。', 'error', 3000);
                }
                return;
            }
            
            if (typeof showProgressIndicator === 'function') {
                showProgressIndicator('データを読み込み中...', true);
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const jsonString = e.target.result;
                    const data = JSON.parse(jsonString);
                    
                    // データ形式の検証
                    if (!validateImportData(data)) {
                        if (typeof showProgressIndicator === 'function') {
                            showProgressIndicator('', false);
                        }
                        return;
                    }
                    
                    // バックアップの確認
                    const hasCurrentData = (window.workItems && window.workItems.length > 0) || 
                                         (window.frequencyWorkItems && window.frequencyWorkItems.length > 0) || 
                                         (window.timeSlots && window.timeSlots.length > 0);
                    
                    if (hasCurrentData) {
                        if (!confirm('現在のデータを新しいデータで置き換えますか？\n\n現在のデータは失われます。')) {
                            if (typeof showProgressIndicator === 'function') {
                                showProgressIndicator('', false);
                            }
                            return;
                        }
                    }
                    
                    // データの読み込み実行
                    loadDataFromObject(data);
                    
                    // オートセーブを実行
                    if (typeof triggerAutoSave === 'function') {
                        triggerAutoSave();
                    }
                    
                    if (typeof showProgressIndicator === 'function') {
                        showProgressIndicator('', false);
                    }
                    
                    // インポート成功の通知
                    const importInfo = getImportSummary(data);
                    if (typeof showNotificationBanner === 'function') {
                        showNotificationBanner(`データを読み込みました。${importInfo}`, 'success', 4000);
                    }
                    
                    // データ整合性チェック
                    setTimeout(() => {
                        performDataIntegrityCheck(data);
                    }, 1000);
                    
                } catch (error) {
                    console.error('Import error:', error);
                    if (typeof showProgressIndicator === 'function') {
                        showProgressIndicator('', false);
                    }
                    
                    if (typeof showNotificationBanner === 'function') {
                        if (error instanceof SyntaxError) {
                            showNotificationBanner('ファイル形式が正しくありません。有効なJSONファイルを選択してください。', 'error', 4000);
                        } else {
                            showNotificationBanner(`データの読み込みに失敗しました: ${error.message}`, 'error', 4000);
                        }
                    }
                }
            };
            
            reader.onerror = function() {
                if (typeof showProgressIndicator === 'function') {
                    showProgressIndicator('', false);
                }
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner('ファイルの読み込みに失敗しました。', 'error', 3000);
                }
            };
            
            reader.readAsText(file, 'utf-8');
        };
        
        input.click();
    } catch (error) {
        console.error('Import initialization error:', error);
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('データ読み込み機能の初期化に失敗しました。', 'error', 3000);
        }
    }
}



// ========================================
// Enhanced Schedule Chart Drawing Functions (横方向積み上げグラフ対応)
// ========================================

/**
 * 横方向積み上げ稼働時間チャートを描画（凡例表示修正版）
 */
function drawScheduleChart() {
    if (!scheduleCanvas || !scheduleCtx) return;
    
    // キャンバスクリア
    scheduleCtx.clearRect(0, 0, scheduleCanvas.width, scheduleCanvas.height);
    
    // 高解像度対応の描画サイズ取得
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = scheduleCanvas.width / devicePixelRatio;
    const canvasDisplayHeight = scheduleCanvas.height / devicePixelRatio;

    // 背景
    scheduleCtx.fillStyle = '#ffffff';
    scheduleCtx.fillRect(0, 0, scheduleCanvas.width, scheduleCanvas.height);
    
    const displayRange = calculateDisplayRange();
    
    // マージンを画面サイズに応じて動的調整（凡例分の下部余白を確保）
    const leftMargin = Math.max(50, Math.min(80, canvasDisplayWidth * 0.08));
    const rightMargin = Math.max(40, Math.min(80, canvasDisplayWidth * 0.08));
    const bottomMarginForLegend = 120; // 凡例用の下部余白を確保
    
    // 有効なチャート幅を計算（画面内収束対応）
    const chartWidth = canvasDisplayWidth - leftMargin - rightMargin;
    
    // チャート幅が最小限確保されているかチェック
    if (chartWidth < 200) {
        // チャート幅が狭すぎる場合はマージンを調整
        const adjustedLeftMargin = Math.max(30, canvasDisplayWidth * 0.05);
        const adjustedRightMargin = Math.max(20, canvasDisplayWidth * 0.03);
        const adjustedChartWidth = canvasDisplayWidth - adjustedLeftMargin - adjustedRightMargin;
        
        // 調整された値を使用
        drawScheduleChartWithMargins(displayRange, adjustedLeftMargin, adjustedRightMargin, adjustedChartWidth, bottomMarginForLegend);
    } else {
        // 通常のマージンを使用
        drawScheduleChartWithMargins(displayRange, leftMargin, rightMargin, chartWidth, bottomMarginForLegend);
    }
    
    // 凡例を確実に描画（最後に描画）
    drawScheduleLegend(leftMargin, rightMargin);
}

/**
 * 稼働時間チャート描画の定数調整（間隔改善版）
 * 既存のSCHEDULE_TOP_MARGINを大きくして、タイトルとチャートの間隔を確保
 */
const SCHEDULE_TOP_MARGIN_IMPROVED = 120; // 元の100から115に増加

/**
 * 指定されたマージンで稼働時間チャートを描画（間隔改善版）
 */
function drawScheduleChartWithMargins(displayRange, leftMargin, rightMargin, chartWidth, bottomMarginForLegend) {
    const barY = SCHEDULE_TOP_MARGIN_IMPROVED; // 改善されたマージンを使用
    
    // タイトル描画
    drawScheduleTitle(displayRange, leftMargin, rightMargin);
    
    // X軸（時間軸）とグリッドを描画
    drawScheduleTimeAxis(displayRange, leftMargin, rightMargin, chartWidth);
    
    // 稼働時間範囲の背景を描画
    drawWorkingTimeBackground(displayRange, leftMargin, chartWidth, barY);
    
    // 時間帯を横方向積み上げで描画
    drawHorizontalTimeSlots(displayRange, leftMargin, chartWidth, barY);
}

/**
 * スケジュールタイトルを描画（間隔改善版：チャートとの十分な間隔を確保）
 * @param {Object} displayRange - 表示範囲情報
 * @param {number} leftMargin - 左マージン
 * @param {number} rightMargin - 右マージン
 */
function drawScheduleTitle(displayRange, leftMargin = 60, rightMargin = 30) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = scheduleCanvas.width / devicePixelRatio;
    const chartAreaWidth = canvasDisplayWidth - leftMargin - rightMargin;
    const chartCenterX = leftMargin + (chartAreaWidth / 2);
    
    // メインタイトル（上部に配置）
    scheduleCtx.fillStyle = '#1f2937';
    scheduleCtx.font = 'bold 20px "Segoe UI", sans-serif';
    scheduleCtx.textAlign = 'center';
    scheduleCtx.fillText('稼働時間スケジュール', chartCenterX, 25);
    
    if (!displayRange.fullDay && scheduleConfig.startTime) {
        // 基本稼働時間情報（メインタイトルから適度な間隔）
        const workingHours = Math.floor(scheduleConfig.workHours);
        const workingMinutes = Math.round((scheduleConfig.workHours - workingHours) * 60);
        const workingTimeText = workingMinutes > 0 ? 
            `${workingHours}時間${workingMinutes}分` : 
            `${workingHours}時間`;
        
        // 実際の時間範囲（重要な情報として強調）
        const actualStartTime = minutesToTime(displayRange.actualStartMinutes);
        const actualEndTime = minutesToTime(displayRange.actualEndMinutes);
        
        scheduleCtx.fillStyle = '#2563eb';
        scheduleCtx.font = '13px "Segoe UI", sans-serif';
        scheduleCtx.fillText(`実際の就業範囲: ${actualStartTime} ～ ${actualEndTime}`, chartCenterX, 60);
        
        // 補助情報（非稼働時間がある場合のみ表示、控えめに）
        const totalNonWorkingMinutes = calculateTotalNonWorkingTime();
        if (totalNonWorkingMinutes > 0 && timeSlots && timeSlots.length > 0) {
            const nonWorkingHours = Math.floor(totalNonWorkingMinutes / 60);
            const nonWorkingMins = totalNonWorkingMinutes % 60;
            
            let nonWorkingText = '';
            if (nonWorkingHours > 0 && nonWorkingMins > 0) {
                nonWorkingText = `非稼働: ${nonWorkingHours}h${nonWorkingMins}m`;
            } else if (nonWorkingHours > 0) {
                nonWorkingText = `非稼働: ${nonWorkingHours}h`;
            } else {
                nonWorkingText = `非稼働: ${nonWorkingMins}m`;
            }
            
            scheduleCtx.fillStyle = '#64748b';
            scheduleCtx.font = '11px "Segoe UI", sans-serif';
            scheduleCtx.fillText(nonWorkingText, chartCenterX, 75);
        }
        
    } else {
        // 24時間表示の場合のシンプルな説明
        scheduleCtx.fillStyle = '#64748b';
        scheduleCtx.font = '13px "Segoe UI", sans-serif';
        scheduleCtx.fillText('24時間全体を表示', chartCenterX, 45);
    }
}

/**
 * 時間軸とグリッドを描画（修正版：新しい描画範囲計算に対応）
 * @param {Object} displayRange - 表示範囲情報
 * @param {number} leftMargin - 左マージン
 * @param {number} rightMargin - 右マージン
 * @param {number} chartWidth - チャート幅
 */
function drawScheduleTimeAxis(displayRange, leftMargin, rightMargin, chartWidth) {
    // 固定の目盛り間隔を取得
    const timeScaleInfo = calculateScheduleTimeScale(displayRange);
    const { tickInterval, majorTickInterval, labelInterval } = timeScaleInfo;
    
    scheduleCtx.font = '11px "Segoe UI", sans-serif';
    scheduleCtx.textAlign = 'center';
    
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = scheduleCanvas.width / devicePixelRatio;
    
    // 描画範囲の開始時間を時間単位に丸める（キリの良い時間から開始）
    const displayStartHour = Math.floor(displayRange.startMinutes / 60);
    const roundedStartMinutes = displayStartHour * 60;
    
    // 描画範囲に対する相対オフセットを計算
    const offsetMinutes = roundedStartMinutes - displayRange.startMinutes;
 
    // グリッド線と目盛りを描画
    for (let minutes = offsetMinutes; minutes <= displayRange.totalMinutes + Math.abs(offsetMinutes); minutes += tickInterval) {
        const currentMinutes = displayRange.startMinutes + minutes;
        
        // 表示範囲外の時間は描画しない
        if (currentMinutes < displayRange.startMinutes || currentMinutes > displayRange.endMinutes) {
            continue;
        }
        
        const x = leftMargin + (minutes / displayRange.totalMinutes) * chartWidth;

        // キャンバス内に収まるかの厳密なチェック
        if (x > canvasDisplayWidth - rightMargin) break;
        if (x < leftMargin) continue;
        
        // 目盛りとラベルの判定（roundedStartMinutesからの経過時間で計算）
        const minutesFromRounded = currentMinutes - roundedStartMinutes;
        const isSubTick = (minutesFromRounded % tickInterval) === 0; // 15分毎のサブ補助線
        const isMajorTick = (minutesFromRounded % majorTickInterval) === 0; // 30分毎のメイン補助線
        const isLabelTick = (minutesFromRounded % labelInterval) === 0; // 1時間毎の主要目盛り
        
        // グリッド線の描画
        if (isLabelTick) {
            // 主要目盛り（1時間毎）- 最も太く濃い線
            scheduleCtx.strokeStyle = '#374151';
            scheduleCtx.lineWidth = 1.5;
        } else if (isMajorTick) {
            // メイン補助線（30分毎）- 中程度の線
            scheduleCtx.strokeStyle = '#64748b';
            scheduleCtx.lineWidth = 1;
        } else if (isSubTick) {
            // サブ補助線（15分毎）- 細い線
            scheduleCtx.strokeStyle = '#94a3b8';
            scheduleCtx.lineWidth = 0.5;
        } else {
            continue; // 該当しない場合はスキップ
        }
        
        // 縦線を描画
        scheduleCtx.beginPath();
        scheduleCtx.moveTo(x, SCHEDULE_TOP_MARGIN_IMPROVED - 15);
        scheduleCtx.lineTo(x, SCHEDULE_TOP_MARGIN_IMPROVED + SCHEDULE_BAR_HEIGHT + 20);
        scheduleCtx.stroke();
        
        // 時間ラベル（1時間毎のみ表示）
        if (isLabelTick) {
            const timeLabel = minutesToTime(Math.round(currentMinutes) % (24 * 60));
            scheduleCtx.fillStyle = '#374151';
            scheduleCtx.font = 'bold 12px "Segoe UI", sans-serif';
            scheduleCtx.fillText(timeLabel, x, SCHEDULE_TOP_MARGIN_IMPROVED - 25);
        }
    }
    
    // 基準線（チャート上下）
    scheduleCtx.strokeStyle = '#374151';
    scheduleCtx.lineWidth = 2;
    scheduleCtx.beginPath();
    scheduleCtx.moveTo(leftMargin, SCHEDULE_TOP_MARGIN_IMPROVED);
    scheduleCtx.lineTo(leftMargin + chartWidth, SCHEDULE_TOP_MARGIN_IMPROVED);
    scheduleCtx.moveTo(leftMargin, SCHEDULE_TOP_MARGIN_IMPROVED + SCHEDULE_BAR_HEIGHT);
    scheduleCtx.lineTo(leftMargin + chartWidth, SCHEDULE_TOP_MARGIN_IMPROVED + SCHEDULE_BAR_HEIGHT);
    scheduleCtx.stroke();
}


/**
 * スケールに応じた時間軸の目盛り間隔を計算（修正版：固定間隔・1時間毎主要目盛り）
 * @param {Object} displayRange - 表示範囲情報
 * @returns {Object} - 目盛り情報
 */
function calculateScheduleTimeScale(displayRange) {
    // 固定の目盛り間隔設定
    // ユーザー要求：1時間毎に主要目盛り、30分毎にメイン補助線、15分毎にサブ補助線
    return {
        tickInterval: 15,      // 15分毎にサブ補助線
        majorTickInterval: 30, // 30分毎にメイン補助線
        labelInterval: 60      // 1時間毎に主要目盛り（ラベル表示）
    };
}

/**
 * 稼働時間範囲の背景を描画（修正版：実際の稼働範囲を表示）
 * @param {Object} displayRange - 表示範囲情報
 * @param {number} leftMargin - 左マージン
 * @param {number} chartWidth - チャート幅
 * @param {number} barY - バーのY座標
 */
function drawWorkingTimeBackground(displayRange, leftMargin, chartWidth, barY) {
    if (!displayRange.fullDay) {
        // 実際の稼働範囲の背景（薄い青）
        const actualStartRatio = (displayRange.actualStartMinutes - displayRange.startMinutes) / displayRange.totalMinutes;
        const actualEndRatio = (displayRange.actualEndMinutes - displayRange.startMinutes) / displayRange.totalMinutes;
        
        const actualStartX = leftMargin + (actualStartRatio * chartWidth);
        const actualEndX = leftMargin + (actualEndRatio * chartWidth);
        const actualWidth = actualEndX - actualStartX;
        
        if (actualWidth > 0) {
            // 実際の稼働範囲背景
            scheduleCtx.fillStyle = 'rgba(37, 99, 235, 0.1)';
            scheduleCtx.fillRect(actualStartX, barY, actualWidth, SCHEDULE_BAR_HEIGHT);
            
            // 稼働範囲の境界線
            scheduleCtx.strokeStyle = '#2563eb';
            scheduleCtx.lineWidth = 2;
            scheduleCtx.strokeRect(actualStartX, barY, actualWidth, SCHEDULE_BAR_HEIGHT);
        }
        
        // 表示範囲全体の境界線（薄いグレー）
        scheduleCtx.strokeStyle = '#e2e8f0';
        scheduleCtx.lineWidth = 1;
        scheduleCtx.strokeRect(leftMargin, barY, chartWidth, SCHEDULE_BAR_HEIGHT);
    }
}


/**
 * 横方向積み上げ時間帯を描画（座標系修正版）
 * @param {Object} displayRange - 表示範囲情報
 * @param {number} leftMargin - 左マージン
 * @param {number} chartWidth - チャート幅
 * @param {number} barY - バーのY座標
 */
function drawHorizontalTimeSlots(displayRange, leftMargin, chartWidth, barY) {
    // 高解像度対応の描画サイズ取得
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = scheduleCanvas.width / devicePixelRatio;
    
    // 時間帯を開始時間順でソート
    const sortedTimeSlots = [...timeSlots].sort((a, b) => {
        const timeA = timeToMinutes(a.startTime);
        const timeB = timeToMinutes(b.startTime);
        return timeA - timeB;
    });
    
    sortedTimeSlots.forEach((slot, index) => {
        const startMinutes = timeToMinutes(slot.startTime);
        const endMinutes = timeToMinutes(slot.endTime);
        
        // 表示範囲内での相対位置を計算
        const relativeStartMinutes = Math.max(0, startMinutes - displayRange.startMinutes);
        const relativeEndMinutes = Math.min(displayRange.totalMinutes, endMinutes - displayRange.startMinutes);
        
        // 表示範囲外の場合はスキップ
        if (relativeEndMinutes <= 0 || relativeStartMinutes >= displayRange.totalMinutes) {
            return;
        }
        
        const startX = leftMargin + (relativeStartMinutes / displayRange.totalMinutes) * chartWidth;
        const endX = leftMargin + (relativeEndMinutes / displayRange.totalMinutes) * chartWidth;
        const width = endX - startX;
        
        if (width <= 0) return;
        
        // 描画範囲内チェック（画面内収束対応）
        const maxRightX = leftMargin + chartWidth;
        const clippedStartX = Math.max(leftMargin, startX);
        const clippedEndX = Math.min(maxRightX, endX);
        const clippedWidth = clippedEndX - clippedStartX;
        
        if (clippedWidth <= 0) return;
        
        // 時間帯の色を取得
        const color = getTimeSlotColor(slot.type);
        
        // 時間帯バーを描画（クリッピング適用）
        scheduleCtx.fillStyle = color;
        scheduleCtx.fillRect(clippedStartX, barY, clippedWidth, SCHEDULE_BAR_HEIGHT);
        
        // 境界線
        scheduleCtx.strokeStyle = darkenColor(color, 0.3);
        scheduleCtx.lineWidth = 2;
        scheduleCtx.strokeRect(clippedStartX, barY, clippedWidth, SCHEDULE_BAR_HEIGHT);
        
        // ラベル（幅が十分にある場合のみ・画面内収束対応）
        if (clippedWidth > 30) {
            scheduleCtx.fillStyle = '#ffffff';
            scheduleCtx.textAlign = 'center';

            // 名前用フォントサイズを幅で調整
            const nameFontSize = clippedWidth > 100 ? 16 : clippedWidth > 60 ? 12 : 10;
            scheduleCtx.font = `${nameFontSize}px "Segoe UI", sans-serif`;
            
            // ラベル位置を調整（クリッピング範囲内）
            const labelX = clippedStartX + clippedWidth / 2;
            
            // 名前の文字数制限（クリッピング幅に応じて）
            let displayName = slot.name;
            const maxNameChars = Math.floor(clippedWidth / (nameFontSize * 0.6));
            if (displayName.length > maxNameChars) {
                displayName = displayName.substring(0, Math.max(1, maxNameChars - 1)) + '…';
            }
            
            scheduleCtx.fillText(displayName, labelX, barY + SCHEDULE_BAR_HEIGHT / 2 - 5);

            // 時間用フォントサイズ（幅が広いと表示、大きさも変化）
            if (clippedWidth > 40) {
                const timeFontSize = clippedWidth > 100 ? 14 : 12;
                scheduleCtx.font = `${timeFontSize}px "Segoe UI", sans-serif`;

                const duration = calculateTimeDurationInMinutes(slot.startTime, slot.endTime);
                let durationText = `${Math.floor(duration / 60)}h${duration % 60}m`;
                
                // 時間表示の文字数制限
                const maxTimeChars = Math.floor(clippedWidth / (timeFontSize * 0.6));
                if (durationText.length > maxTimeChars) {
                    durationText = `${Math.floor(duration / 60)}h`;
                }

                scheduleCtx.fillText(durationText, labelX, barY + SCHEDULE_BAR_HEIGHT / 2 + 12);
            }
        }
        
        // ドラッグ用の情報を保存（座標系修正版 - 表示ピクセル単位で保存）
        slot._renderInfo = {
            x: clippedStartX,               // 実際の描画開始X（表示ピクセル単位）
            y: barY,                        // 描画開始Y（表示ピクセル単位）
            width: clippedWidth,            // 実際の描画幅（表示ピクセル単位）
            height: SCHEDULE_BAR_HEIGHT,    // バーの高さ（表示ピクセル単位）
            id: slot.id,                    // 時間帯のID
            originalStartTimeMinutes: timeToMinutes(slot.startTime),
            originalEndTimeMinutes: timeToMinutes(slot.endTime),
            isClipped: clippedWidth < width // クリッピングされているかどうか
        };
    });
}

/**
 * 時間帯タイプに応じた色を取得（強化版：新タイプ対応）
 * @param {string} type - 時間帯タイプ
 * @returns {string} - 色コード
 */
function getTimeSlotColor(type) {
    const colors = {
        break: '#f59e0b',      // オレンジ（休憩）
        meeting: '#10b981',    // グリーン（朝礼）
        inspection: '#8b5cf6', // パープル（点検）
        cleaning: '#ef4444',   // レッド（清掃）
        setup: '#6366f1',      // インディゴ（段替）
        chokotei: '#f97316',   // オレンジレッド（チョコ停）
        wait_time: '#facc15',  // イエロー（手待ち）
        other: '#64748b'       // グレー（その他）
    };
    return colors[type] || colors.other;
}

/**
 * 色を暗くする汎用関数（強化版：エラーハンドリング付き）
 * @param {string} color - 元の色（16進数）
 * @param {number} factor - 暗くする度合い（0-1）
 * @returns {string} - 暗くされた色
 */
function darkenColor(color, factor) {
    try {
        if (!color || !color.startsWith('#') || color.length !== 7) {
            return color || '#000000';
        }
        
        // 16進数カラーコードをRGBに変換
        let r = parseInt(color.substring(1, 3), 16);
        let g = parseInt(color.substring(3, 5), 16);
        let b = parseInt(color.substring(5, 7), 16);

        // NaNチェック
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return color;
        }

        // factorに基づいて各成分を暗くする
        r = Math.max(0, Math.floor(r * (1 - factor)));
        g = Math.max(0, Math.floor(g * (1 - factor)));
        b = Math.max(0, Math.floor(b * (1 - factor)));

        // RGBを16進数カラーコードに戻す
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (error) {
        console.warn('Error in darkenColor:', error);
        return color || '#000000';
    }
}

/**
 * スケジュール凡例を描画（修正版：確実な表示・位置調整・中央配置対応）
 * @param {number} leftMargin - 左マージン
 * @param {number} rightMargin - 右マージン
 */
function drawScheduleLegend(leftMargin = 60, rightMargin = 30) {
    // 高解像度対応
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = scheduleCanvas.width / devicePixelRatio;
    const canvasDisplayHeight = scheduleCanvas.height / devicePixelRatio;
    
    // チャート描画エリアの幅を計算
    const chartAreaWidth = canvasDisplayWidth - leftMargin - rightMargin;
    
    // 凡例の基本設定
    const legendStartY = canvasDisplayHeight - 110; // 下部から110pxの位置
    const itemWidth = Math.max(120, chartAreaWidth / 8); // チャート幅に応じて調整
    const itemHeight = 25;
    const itemsPerRow = Math.floor(chartAreaWidth / itemWidth);
    
    const legendItems = [
        { type: 'work', color: 'rgba(37, 99, 235, 0.3)', label: '稼働時間範囲' },
        { type: 'break', color: '#f59e0b', label: '休憩' },
        { type: 'meeting', color: '#10b981', label: '朝礼' },
        { type: 'inspection', color: '#8b5cf6', label: '点検' },
        { type: 'cleaning', color: '#ef4444', label: '清掃' },
        { type: 'setup', color: '#6366f1', label: '段替' },
        { type: 'chokotei', color: '#f97316', label: 'チョコ停' },
        { type: 'wait_time', color: '#facc15', label: '手待ち' }
    ];
    
    // 実際の凡例幅を計算
    const actualLegendWidth = Math.min(chartAreaWidth, itemsPerRow * itemWidth);
    
    // チャート描画エリアの中央に凡例を配置
    const legendStartX = leftMargin + (chartAreaWidth - actualLegendWidth) / 2;
    
    // 凡例背景を描画
    const legendWidth = actualLegendWidth + 40;
    const legendHeight = Math.ceil(legendItems.length / itemsPerRow) * itemHeight + 40;
    
    scheduleCtx.fillStyle = 'rgba(248, 250, 252, 0.95)';
    scheduleCtx.fillRect(legendStartX - 20, legendStartY - 20, legendWidth, legendHeight);
    scheduleCtx.strokeStyle = '#e2e8f0';
    scheduleCtx.lineWidth = 1;
    scheduleCtx.strokeRect(legendStartX - 20, legendStartY - 20, legendWidth, legendHeight);
    
    // 凡例タイトル
    scheduleCtx.fillStyle = '#1f2937';
    scheduleCtx.font = 'bold 14px "Segoe UI", sans-serif';
    scheduleCtx.textAlign = 'left';
    scheduleCtx.fillText('時間帯の種類', legendStartX - 10, legendStartY - 5);
    
    // 凡例項目を描画
    legendItems.forEach((item, index) => {
        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;
        const x = legendStartX + (col * itemWidth);
        const y = legendStartY + 15 + (row * itemHeight);
        
        // 色サンプル（少し大きめに）
        scheduleCtx.fillStyle = item.color;
        scheduleCtx.fillRect(x, y, 20, 14);
        scheduleCtx.strokeStyle = '#ffffff';
        scheduleCtx.lineWidth = 1;
        scheduleCtx.strokeRect(x, y, 20, 14);
        
        // ラベル
        scheduleCtx.fillStyle = '#374151';
        scheduleCtx.font = '12px "Segoe UI", sans-serif';
        scheduleCtx.textAlign = 'left';
        
        // ラベルの文字数制限（画面サイズに応じて）
        let displayLabel = item.label;
        const maxLabelChars = Math.floor((itemWidth - 30) / 7);
        if (displayLabel.length > maxLabelChars) {
            displayLabel = displayLabel.substring(0, maxLabelChars - 1) + '…';
        }
        
        scheduleCtx.fillText(displayLabel, x + 26, y + 10);
    });
    
    // 凡例の説明テキスト
    scheduleCtx.fillStyle = '#64748b';
    scheduleCtx.font = '10px "Segoe UI", sans-serif';
    scheduleCtx.textAlign = 'left';
    scheduleCtx.fillText('※時間帯をダブルクリックで編集、ドラッグで調整できます', legendStartX - 10, legendStartY + legendHeight - 5);
}

// ========================================
// Chart Renderer Synchronized Scale Functions (完全スケール同期版)
// ========================================

/**
 * 頻度作業チャート描画（グリッド基準時間修正版）
 */
function drawFrequencyChart() {
    if (!frequencyCanvas || !frequencyCtx) return;
 
    frequencyCtx.clearRect(0, 0, frequencyCanvas.width, frequencyCanvas.height);
    frequencyCtx.fillStyle = '#ffffff';
    frequencyCtx.fillRect(0, 0, frequencyCanvas.width, frequencyCanvas.height);
    
    const settings = getChartCommonSettings();
    const { maxTime, leftMargin, rightMargin, timeScale } = settings;

    if (!canvas) return;

    drawFrequencyChartTitle();
    drawFrequencyRowHighlights();
    
    // グリッド描画（共通関数呼び出し）
    // ★修正: canvasWidth を settings.canvasDisplayWidth（= グローバル canvasWidth）に統一。
    //   旧: frequencyCanvas.width / dpr を使用 → ガントチャートと参照元が異なりグリッド密度・
    //       スケールがズレる原因となっていた。
    //   新: ガントチャートの gridConfig と同じ基準値を使うことで3チャートが完全同一スケールになる。
    const gridConfig = {
        ctx: frequencyCtx,
        canvasWidth: settings.canvasDisplayWidth,
        chartHeight: frequencyWorkItems.length * FREQUENCY_ROW_HEIGHT,
        maxTime: maxTime,
        timeScale: timeScale,
        leftMargin: leftMargin,
        rightMargin: rightMargin,
        topMargin: FREQUENCY_TOP_MARGIN,
        rowHeight: FREQUENCY_ROW_HEIGHT,
        totalRows: frequencyWorkItems.length,
        drawBothModeCenterLine: (displayMode === 'both')
    };
    drawStandardizedGrid(gridConfig);
    
    // 表示モードに応じてバーとラベルを描画
    if (displayMode === 'both') {
        drawBothModeFrequencyBars(timeScale, leftMargin);
    } else {
        drawSingleModeFrequencyBars(timeScale, leftMargin);
    }
    
    if (showWorkItemLabels) {
        drawFrequencyWorkLabels(leftMargin);
    }
    
    drawFrequencyTaktTimeLine(taktTime, timeScale, leftMargin);
}


/**
 * 頻度作業バー描画（単一モード・統一バー高さルール適用版）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
function drawSingleModeFrequencyBars(timeScale, leftMargin) {
    const settings = getChartCommonSettings();
    const chartWidth = settings.chartWidth;

    frequencyWorkItems.forEach((item, index) => {
        const y = FREQUENCY_TOP_MARGIN + (index * FREQUENCY_ROW_HEIGHT);

        const barHeight  = FREQUENCY_ROW_HEIGHT / 3;
        const barTop     = y + (FREQUENCY_ROW_HEIGHT / 2) - (barHeight / 2);
        const barCenterY = barTop + barHeight / 2;

        let workTime = 0;
        const mode = displayMode === 'improved' ? 'improved' : 'current';

        if (frequencyChartMode === 'converted') {
            const freqData = (mode === 'improved' && item.improved) ? item.improved : item;
            workTime = calculateFrequencyImpactWithFormula(freqData.workTime, freqData.frequency, mode).impactTime;
        } else {
            workTime = (mode === 'improved' && item.improved) ? item.improved.workTime : item.workTime;
        }

        const fullWidth     = workTime * timeScale;
        const startX        = leftMargin;
        const chartAreaEndX = leftMargin + chartWidth;
        const barColor      = (displayMode === 'improved') ? '#dc2626' : '#1f2937';

        let clippedWidth = fullWidth;
        let isOmitted    = false;
        if (startX + fullWidth > chartAreaEndX) {
            clippedWidth = chartAreaEndX - startX;
            isOmitted    = true;
        }

        frequencyCtx.fillStyle = barColor;
        frequencyCtx.fillRect(startX, barTop, clippedWidth, barHeight);

        if (isOmitted) {
            drawOmissionSymbol(frequencyCtx, chartAreaEndX, y, FREQUENCY_ROW_HEIGHT, 'rgba(222,41,24,0.7)');
        }

        if (workTime > 0) {
            _drawFreqBarLabel(frequencyCtx, formatTimeDisplayDecimal(workTime),
                startX, clippedWidth, fullWidth, barCenterY, barColor, isOmitted, chartAreaEndX);
        }
    });
}


/**
 * 頻度作業チャート バーラベル描画ヘルパー
 * ・バー幅にテキストが収まる → バー内中央に白抜き文字
 * ・バー幅が狭い（収まらない） → バー右横にバー同色文字
 * ・バーがクリップされている（isOmitted）→ チャート領域右端の外側に同色文字
 *
 * @param {CanvasRenderingContext2D} fCtx - 頻度チャートのコンテキスト
 * @param {string}  text         - 表示するラベル文字列
 * @param {number}  barStartX    - バー左端X座標
 * @param {number}  clippedWidth - 実際に描画したバー幅（クリップ後）
 * @param {number}  fullWidth    - クリップ前のバー本来の幅
 * @param {number}  barCenterY   - バーの垂直中心Y座標
 * @param {string}  barColor     - バーの色（外置き時に使用）
 * @param {boolean} isOmitted    - バーがチャート右端でクリップされているか
 * @param {number}  chartAreaEndX - チャート描画領域の右端X座標
 */
function _drawFreqBarLabel(fCtx, text, barStartX, clippedWidth, fullWidth,
                            barCenterY, barColor, isOmitted, chartAreaEndX) {
    fCtx.save();
    fCtx.font = 'bold 10px "Segoe UI", sans-serif';
    fCtx.textBaseline = 'middle';
    const textW       = fCtx.measureText(text).width;
    const innerPadding = 6; // 内置きに必要な左右余白（片側3px）

    if (!isOmitted && clippedWidth >= textW + innerPadding) {
        // ── バー内：白抜き中央配置 ─────────────────────────────────────
        fCtx.fillStyle = 'rgba(255,255,255,0.95)';
        fCtx.textAlign = 'center';
        fCtx.fillText(text, barStartX + clippedWidth / 2, barCenterY);
    } else {
        // ── バー右横：バー色でバー終端の外に配置 ─────────────────────
        // isOmitted 時はクリップ端（chartAreaEndX）から少し右、
        // 通常時は fullWidth の終端から少し右
        const labelX = isOmitted ? chartAreaEndX + 4 : barStartX + fullWidth + 4;
        fCtx.fillStyle = barColor;
        fCtx.textAlign = 'left';
        fCtx.fillText(text, labelX, barCenterY);
    }
    fCtx.restore();
}

/**
 * 頻度作業バー描画（併記モード・統一バー高さルール適用版）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
function drawBothModeFrequencyBars(timeScale, leftMargin) {
    const settings = getChartCommonSettings();
    const chartWidth = settings.chartWidth;
    const chartAreaEndX = leftMargin + chartWidth;

    frequencyWorkItems.forEach((item, index) => {
        const y = FREQUENCY_TOP_MARGIN + (index * FREQUENCY_ROW_HEIGHT);
        const barHeight = FREQUENCY_ROW_HEIGHT / 4;

        // --- 改善前のバー（行の上半分・中央） ---
        let currentWorkTime = 0;
        if (frequencyChartMode === 'converted') {
            currentWorkTime = calculateFrequencyImpactWithFormula(item.workTime, item.frequency, 'current').impactTime;
        } else {
            currentWorkTime = item.workTime || 0;
        }

        if (currentWorkTime > 0) {
            const currentBarTop    = y + (FREQUENCY_ROW_HEIGHT / 4) - (barHeight / 2);
            const currentBarCenterY = currentBarTop + barHeight / 2;
            const currentFullWidth = currentWorkTime * timeScale;
            const currentClipped   = Math.min(currentFullWidth, chartAreaEndX - leftMargin);
            const currentOmitted   = leftMargin + currentFullWidth > chartAreaEndX;

            frequencyCtx.fillStyle = '#1f2937';
            frequencyCtx.fillRect(leftMargin, currentBarTop, currentClipped, barHeight);

            if (currentOmitted) {
                drawOmissionSymbol(frequencyCtx, chartAreaEndX, y, FREQUENCY_ROW_HEIGHT / 2, '#dc2626');
            }
            _drawFreqBarLabel(frequencyCtx, formatTimeDisplayDecimal(currentWorkTime),
                leftMargin, currentClipped, currentFullWidth,
                currentBarCenterY, '#1f2937', currentOmitted, chartAreaEndX);
        }

        // --- 改善後のバー（行の下半分・中央） ---
        let improvedWorkTime = 0;
        const improvedData = item.improved || { workTime: item.workTime, frequency: item.frequency };
        if (frequencyChartMode === 'converted') {
            improvedWorkTime = calculateFrequencyImpactWithFormula(improvedData.workTime, improvedData.frequency, 'improved').impactTime;
        } else {
            improvedWorkTime = improvedData.workTime;
        }

        if (improvedWorkTime > 0) {
            const improvedBarTop    = y + (FREQUENCY_ROW_HEIGHT * 3 / 4) - (barHeight / 2);
            const improvedBarCenterY = improvedBarTop + barHeight / 2;
            const improvedFullWidth = improvedWorkTime * timeScale;
            const improvedClipped   = Math.min(improvedFullWidth, chartAreaEndX - leftMargin);
            const improvedOmitted   = leftMargin + improvedFullWidth > chartAreaEndX;

            frequencyCtx.fillStyle = '#dc2626';
            frequencyCtx.fillRect(leftMargin, improvedBarTop, improvedClipped, barHeight);

            if (improvedOmitted) {
                drawOmissionSymbol(frequencyCtx, chartAreaEndX, y + FREQUENCY_ROW_HEIGHT / 2, FREQUENCY_ROW_HEIGHT / 2, '#dc2626');
            }
            _drawFreqBarLabel(frequencyCtx, formatTimeDisplayDecimal(improvedWorkTime),
                leftMargin, improvedClipped, improvedFullWidth,
                improvedBarCenterY, '#dc2626', improvedOmitted, chartAreaEndX);
        }
    });
}



/**
 * 頻度作業チャートタイトル（位置調整対応版）
 */
function drawFrequencyChartTitle() {
    // 基準位置
    const baseX = 20;
    const baseY = 25;
    
    // 位置調整を適用
    const adjustedPos = applyTextPositionAdjustment('chartTitle', baseX, baseY);
    
    const modeText = frequencyChartMode === 'converted' ? '換算時間' : '実時間';
    const titleText = `頻度作業 (${modeText})`;
    
    frequencyCtx.fillStyle = '#1f2937';
    frequencyCtx.font = 'bold 12px "Segoe UI", sans-serif';
    frequencyCtx.textAlign = 'left';
    frequencyCtx.fillText(titleText, adjustedPos.x, adjustedPos.y);
}

/**
 * 頻度作業チャートのタクトタイムライン描画（位置調整対応版）
 * @param {number} taktTimeValue - タクトタイム
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
function drawFrequencyTaktTimeLine(taktTimeValue, timeScale, leftMargin) {
    const x = leftMargin + (taktTimeValue * timeScale);
    const chartHeight = frequencyWorkItems.length * FREQUENCY_ROW_HEIGHT;
    
    frequencyCtx.strokeStyle = '#dc2626';
    frequencyCtx.lineWidth = 3;
    frequencyCtx.setLineDash([6, 3]);
    frequencyCtx.beginPath();
    frequencyCtx.moveTo(x, FREQUENCY_TOP_MARGIN - 18);
    frequencyCtx.lineTo(x, FREQUENCY_TOP_MARGIN + chartHeight);
    frequencyCtx.stroke();
    frequencyCtx.setLineDash([]);
    
    // 基準位置
    const baseX = x;
    const baseY = FREQUENCY_TOP_MARGIN - 24;
    
    // 位置調整を適用
    const adjustedPos = applyTextPositionAdjustment('taktTimeLabel', baseX, baseY);
    
    frequencyCtx.fillStyle = '#dc2626';
    frequencyCtx.font = 'bold 12px "Segoe UI", sans-serif';
    frequencyCtx.textAlign = 'center';
    // ★修正: ガントチャートの表記（T/T）に統一（旧: タクトタイム）
    frequencyCtx.fillText(`T/T  ${formatTimeDisplay(Math.round(taktTimeValue))}`, adjustedPos.x, adjustedPos.y);
}

/**
 * 頻度作業バーを描画（はみ出し表現対応・修正版）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
function drawFrequencyWorkBars(timeScale, leftMargin) {
    const settings = getChartCommonSettings();
    const chartWidth = settings.chartWidth;

    frequencyWorkItems.forEach((item, index) => {
        const y = FREQUENCY_TOP_MARGIN + (index * FREQUENCY_ROW_HEIGHT);
        const barHeight = FREQUENCY_ROW_HEIGHT / 2;
        const centerY = y + (FREQUENCY_ROW_HEIGHT / 2) - (barHeight / 2);
        
        const fullWidth = item.workTime * timeScale;
        const startX = leftMargin;
        const chartAreaEndX = leftMargin + chartWidth; // 描画領域の右端X座標

        const barColor = '#2563eb';
        const strokeColor = 'rgba(210, 215, 229, 0.7)';
        const waveColor = 'rgba(222, 41, 24, 0.7)';

        let clippedWidth = fullWidth;
        let isOmitted = false;

        // バーの右端が描画領域の右端を超えるかチェック
        if (startX + fullWidth > chartAreaEndX) {
            // ★修正点：描画領域の右端からバーの開始位置を引いて、クリップ後の幅を正確に計算
            clippedWidth = chartAreaEndX - startX;
            isOmitted = true;
        }

        // バーの描画（クリップされた幅で描画）
        frequencyCtx.fillStyle = barColor;
        frequencyCtx.fillRect(startX, centerY, clippedWidth, barHeight);
        
        // はみ出し記号の描画
        if (isOmitted) {
            // ★修正点：省略記号の描画位置を、クリップされたバーの右端（chartAreaEndX）に設定
            drawOmissionSymbol(frequencyCtx, chartAreaEndX, y, FREQUENCY_ROW_HEIGHT, waveColor);
        }
        
        // ラベル描画（位置調整対応）
        const labelWidth = clippedWidth;
        if (labelWidth > 30) {
            const baseX = startX + labelWidth / 2;
            const baseY = centerY + barHeight / 2 + 3;
            
            const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);
            
            frequencyCtx.fillStyle = '#ffffff';
            frequencyCtx.font = 'bold 10px "Segoe UI", sans-serif';
            frequencyCtx.textAlign = 'center';
            // 表示する時間はクリップされても実際の作業時間
            const timeText = formatTimeDisplay(item.workTime); 
            frequencyCtx.fillText(timeText, adjustedPos.x, adjustedPos.y);
        }
    });
}

/**
 * はみ出しを示す省略記号（縦の波線）を描画する（修正版）
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} x - 描画するX座標（クリップされたバーの右端）
 * @param {number} y - バーの上端Y座標
 * @param {number} height - バーの高さ
 * @param {string} color - 線の色
 */
function drawOmissionSymbol(ctx, x, y, height, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;//太さ
    ctx.setLineDash([]); 

    const waveAmplitude = 1.5;
    const waveFrequency = 6;
    const lineSpacing = 4;
    
    // 1本目の波線
    const line1X = x - lineSpacing - 2; // バーの端から少し内側に
    ctx.beginPath();
    ctx.moveTo(line1X, y);
    for (let i = 0; i <= height; i++) {
        const angle = (i / height) * Math.PI * waveFrequency;
        const xOffset = Math.sin(angle) * waveAmplitude;
        ctx.lineTo(line1X + xOffset, y + i);
    }
    ctx.stroke();

    // 2本目の波線
    const line2X = x - 2; // 1本目の線の右側
    ctx.beginPath();
    ctx.moveTo(line2X, y);
    for (let i = 0; i <= height; i++) {
        const angle = (i / height) * Math.PI * waveFrequency;
        const xOffset = Math.sin(angle) * waveAmplitude;
        ctx.lineTo(line2X + xOffset, y + i);
    }
    ctx.stroke();

    ctx.restore();
}

/**
 * 頻度作業ラベルを描画（標準作業と色を統一・改善前後併記対応・右寄せ情報表示版）
 * @param {number} leftMargin - 左マージン
 */
function drawFrequencyWorkLabels(leftMargin) {
    frequencyWorkItems.forEach((item, index) => {
        const y = FREQUENCY_TOP_MARGIN + (index * FREQUENCY_ROW_HEIGHT);
        const centerY = y + (FREQUENCY_ROW_HEIGHT / 2);
        
        // --- 背景と境界線（表示モードに応じて色を変更） ---
        const gradient = frequencyCtx.createLinearGradient(0, y, 0, y + FREQUENCY_ROW_HEIGHT);
        let borderColor;

        if (displayMode === 'improved') {
            gradient.addColorStop(0, '#fef2f2');
            gradient.addColorStop(0.5, '#fee2e2');
            gradient.addColorStop(1, '#fecaca');
            borderColor = '#fecaca';
        } else if (displayMode === 'both') {
            gradient.addColorStop(0, '#f1f5f9');
            gradient.addColorStop(0.5, '#e2e8f0');
            gradient.addColorStop(1, '#cbd5e1');
            borderColor = '#cbd5e1';
        } else {
            gradient.addColorStop(0, '#f9fafb');
            gradient.addColorStop(0.5, '#f3f4f6');
            gradient.addColorStop(1, '#e5e7eb');
            borderColor = '#d1d5db';
        }
        
        frequencyCtx.fillStyle = gradient;
        frequencyCtx.fillRect(0, y + 1, leftMargin - 1, FREQUENCY_ROW_HEIGHT - 2);
        
        frequencyCtx.strokeStyle = borderColor;
        frequencyCtx.lineWidth = 1;
        frequencyCtx.beginPath();
        frequencyCtx.moveTo(leftMargin - 1, y);
        frequencyCtx.lineTo(leftMargin - 1, y + FREQUENCY_ROW_HEIGHT);
        frequencyCtx.stroke();
        
        let numberColor = (displayMode === 'improved') ? '#dc2626' : '#1f2937';
        frequencyCtx.fillStyle = numberColor;
        frequencyCtx.font = 'bold 13px "Segoe UI", sans-serif';
        frequencyCtx.textAlign = 'center';
        frequencyCtx.fillText(`${index + 1}`, 25, centerY + 2);
        
        let nameColor = (displayMode === 'improved') ? '#991b1b' : (displayMode === 'both') ? '#334155' : '#0f172a';
        frequencyCtx.fillStyle = nameColor;
        frequencyCtx.font = 'bold 12px "Segoe UI", sans-serif';
        frequencyCtx.textAlign = 'left';
        
        const maxNameWidth = leftMargin - 55;
        const nameLines = wrapTextByWidth(frequencyCtx, item.name, maxNameWidth, 1);
        const truncatedName = nameLines[0] || '';

        // 頻度オブジェクトを整形された文字列に変換するヘルパー関数
        const formatFrequency = (freq) => {
            if (!freq) return 'N/A';
            if (typeof freq === 'string') return freq; // 後方互換性
            if (freq.type === 'count') return `${freq.value || ''}回に1回`;
            if (freq.type === 'time') {
                const unitLabels = { d: '日', h: '時間', m: '分', s: '秒' };
                return `${freq.value || ''}${unitLabels[freq.unit] || '単位'}に1回`;
            }
            return 'N/A';
        };
        
        if (displayMode === 'both') {
            frequencyCtx.fillText(truncatedName, 45, centerY - 8);

            frequencyCtx.textAlign = 'left';
            frequencyCtx.font = '10px "Segoe UI", sans-serif';

            // 改善前
            const currentWorkTime = item.workTime || 0;
            const currentFrequency = item.frequency;
            const currentDetailText = `前: ${formatTimeDisplay(currentWorkTime)} (${formatFrequency(currentFrequency)})`;
            const { impactTime: currentImpact } = calculateFrequencyImpactWithFormula(currentWorkTime, currentFrequency, 'current');
            const currentFullText = currentImpact > 0 ? `${currentDetailText} (影響: ${formatTimeDisplay(currentImpact)})` : currentDetailText;
            
            frequencyCtx.fillStyle = '#1f2937';
            frequencyCtx.fillText(wrapTextByWidth(frequencyCtx, currentFullText, maxNameWidth, 1)[0], 45, centerY + 4);

            // 改善後
            const improvedWorkTime = item.improved ? item.improved.workTime : currentWorkTime;
            const improvedFrequency = item.improved ? item.improved.frequency : currentFrequency;
            const improvedDetailText = `後: ${formatTimeDisplay(improvedWorkTime)} (${formatFrequency(improvedFrequency)})`;
            const { impactTime: improvedImpact } = calculateFrequencyImpactWithFormula(improvedWorkTime, improvedFrequency, 'improved');
            const improvedFullText = improvedImpact > 0 ? `${improvedDetailText} (影響: ${formatTimeDisplay(improvedImpact)})` : improvedDetailText;

            frequencyCtx.fillStyle = '#dc2626';
            frequencyCtx.fillText(wrapTextByWidth(frequencyCtx, improvedFullText, maxNameWidth, 1)[0], 45, centerY + 14);

        } else {
            frequencyCtx.fillText(truncatedName, 45, centerY - 6);
            
            const mode = displayMode === 'improved' ? 'improved' : 'current';
            const workTime = (mode === 'improved' && item.improved) ? item.improved.workTime : item.workTime;
            const frequency = (mode === 'improved' && item.improved) ? item.improved.frequency : item.frequency;
            
            const detailText = `時間:${formatTimeDisplay(workTime)} 頻度:${formatFrequency(frequency)}`;
            const { impactTime } = calculateFrequencyImpactWithFormula(workTime, frequency, mode);
            const fullText = impactTime > 0 ? `${detailText} (影響: ${formatTimeDisplay(impactTime)})` : detailText;

            let detailColor = (mode === 'improved') ? '#dc2626' : '#64748b';
            frequencyCtx.fillStyle = detailColor;
            frequencyCtx.font = '10px "Segoe UI", sans-serif';
            frequencyCtx.textAlign = 'left';
            frequencyCtx.fillText(wrapTextByWidth(frequencyCtx, fullText, maxNameWidth, 1)[0], 45, centerY + 8);
        }
    });
}

/**
 * デバウンス関数（ビジネス用最適化）
 * @param {Function} func - 実行する関数
 * @param {number} wait - 待機時間（ミリ秒）
 * @returns {Function} - デバウンスされた関数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * エラーハンドリング（ビジネス用）
 */
window.addEventListener('error', function(event) {
    console.error('Application error:', event.error);
    showNotificationBanner('予期しないエラーが発生しました。ページを再読み込みしてください。', 'error', 5000);
});

// 未処理のPromise拒否をキャッチ
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotificationBanner('システムエラーが発生しました。', 'error', 3000);
    event.preventDefault();
});

// ========================================
// Browser Support Check (Business)
// ========================================

/**
 * 標準手持ち数のステッパーボタン処理
 * @param {number} delta - 増減量（+1 or -1）
 */
function adjustStandardWIP(delta) {
    const input = document.getElementById('standardWIPInput');
    if (!input) return;
    const newVal = Math.max(0, Math.min(99, (parseInt(input.value) || 0) + delta));
    input.value = newVal;
    onStandardWIPChange();
}

/**
 * 標準手持ち数の入力変更ハンドラ。
 * グローバル変数を更新し、ロット選択肢・ヒント・チャートを再描画する。
 */
function onStandardWIPChange() {
    const input = document.getElementById('standardWIPInput');
    if (!input) return;
    const raw = parseInt(input.value);
    standardWIP = isNaN(raw) ? 0 : Math.max(0, Math.min(99, raw));
    input.value = standardWIP; // 範囲補正をDOMに反映

    // ヒント表示を更新
    const lotCountEl = document.getElementById('standardWIPLotCount');
    if (lotCountEl) lotCountEl.textContent = standardWIP + 1;

    // モーダルが開いていればロット選択肢を更新
    if (typeof updateLotOptions === 'function') updateLotOptions();

    // チャートを再描画（行数が変わる可能性があるため）
    safeUpdateChart('main', () => {
        if (typeof updateChart === 'function') updateChart();
    });
    safeUpdateChart('process', () => {
        if (typeof updateProcessChart === 'function') updateProcessChart();
    });

    // 課題6: WIP不一致チェック
    checkWIPMismatch();

    triggerAutoSave();
}

/**
 * 工程内分類の値を新しい形式に変換します（後方互換性のため）。
 * 古い 'current'/'next' 形式を新しい 'lot1'/'lot2' 形式に正規化します。
 * @param {string} processValue - 古い可能性のある工程内分類の値。
 * @returns {string} - 新しい形式の値 ('lot1', 'lot2', etc.)。
 */
function normalizeProcessValue(processValue) {
    if (processValue === 'current') {
        return 'lot1';
    }
    if (processValue === 'next') {
        return 'lot2';
    }
    // 未設定または新しい形式の場合はそのまま返すか、デフォルトの'lot1'を返す
    return processValue || 'lot1';
}

/**
 * 登録されている作業項目から最大のロット数を取得（修正版：実際の登録数に基づく表示）
 * @returns {number} - 存在する最大のロット番号（最小でも1を返す）
 */
/**
 * 1サイクル分のロット数を返す（2サイクル表示の有無に関わらず）
 * drawProcessWorkBars 等の1サイクル目描画で使用する基準値
 */
function getLotsPerCycle() {
    try {
        if (!workItems || workItems.length === 0) return 1;
        let maxLot = 0;
        workItems.forEach((item) => {
            if (!item || !item.process) return;
            const normalizedProcess = normalizeProcessValue(item.process);
            if (normalizedProcess && normalizedProcess.startsWith('lot')) {
                const lotNum = parseInt(normalizedProcess.substring(3), 10);
                if (!isNaN(lotNum) && lotNum > maxLot) maxLot = lotNum;
            }
        });
        const wipBasedLots = (typeof standardWIP === 'number' && standardWIP >= 0) ? standardWIP + 1 : 1;
        return Math.max(wipBasedLots, maxLot);
    } catch (error) {
        return 1;
    }
}

/**
 * 工程確認チャートの総行数を返す
 * - サイクルビュー(cycle) / 単一ライン(single): cycleCount行（各行=1サイクル）
 * - ロットビュー(lot) / breakdown モード: lotsPerCycle * (cycleCount-1) + lotsPerCycle 行
 *   ※Nサイクル時は各サイクルが1ロットシフトして追加行が生じる
 */
function getMaxLotNumber() {
    try {
        const isMulti = cycleCount >= 2;
        const mode = (typeof processChartLotMode !== 'undefined') ? processChartLotMode : 'lot';
        // サイクルビュー・単一ライン: cycleCount行（各行=1サイクル）
        if (mode === 'single' || mode === 'cycle') {
            return isMulti ? cycleCount : 1;
        }
        // ロットビュー・breakdown モード（デフォルト）
        const lotsPerCycle = getLotsPerCycle();
        return isMulti ? lotsPerCycle + (cycleCount - 1) : lotsPerCycle;
    } catch (error) {
        return 1;
    }
}

/**
 * 作業配分表のエラーバー表示モードを切り替えます。
 * @param {string} mode - 表示モード ('none', 'person', 'work', 'both')
 */
function switchErrorBarMode(mode) {
    distributionErrorBarMode = mode;

    // ボタンのアクティブ状態を更新（dist-option-btnクラスを対象に）
    document.querySelectorAll('#errorBarNoneBtn, #errorBarPersonBtn').forEach(btn => btn.classList.remove('active'));
    const activeButton = document.getElementById(`errorBar${mode.charAt(0).toUpperCase() + mode.slice(1)}Btn`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // チャートを再描画
    updateDistributionChart();
    triggerAutoSave();
}

/**
 * バラつきデータをフィールドごとに保存します。
 * @param {string} dataId - データID
 * @param {string} field - 保存するフィールド名 (e.g., 'currentMin')
 * @param {number} value - 保存する値（秒単位）
 */
function saveVariabilityData(dataId, field, value) {
    const targetData = dataList.find(d => d.id === dataId);
    if (!targetData) return;

    if (!targetData.data.distributionVariability) {
        targetData.data.distributionVariability = {};
    }

    // 値が0またはNaNでなければ保存、そうでなければプロパティを削除してデータをクリーンに保つ
    if (value && !isNaN(value) && value > 0) {
        targetData.data.distributionVariability[field] = value;
    } else {
        delete targetData.data.distributionVariability[field];
    }
}

/**
 * 頻度作業の影響時間を計算し、計算式も返す（汎用版）
 * @param {number} workTime - 頻度作業の作業時間（秒）
 * @param {object} frequency - 頻度オブジェクト {type, value, unit}
 * @param {string} mode - 'current' or 'improved'。サイクルタイム計算用
 * @returns {object} - { impactTime: number, formula: string }
 */
function calculateFrequencyImpactWithFormula(workTime, frequency, mode) {
    if (!frequency || workTime <= 0) {
        return { impactTime: 0, formula: '作業時間または頻度が未設定です。' };
    }

    let impactTime = 0;
    let formula = '';
    const cycleTime = calculateTotalCycleTimeForMode(mode);

    if (frequency.type === 'count') {
        const count = frequency.value || 1;
        if (count > 0) {
            impactTime = workTime / count;
            formula = `計算式: ${formatTimeDisplay(workTime)} ÷ ${count}回`;
        } else {
            formula = '頻度の回数は1以上で入力してください。';
        }
    } else if (frequency.type === 'time') {
        if (cycleTime <= 0) {
            return { impactTime: 0, formula: 'サイクルタイムが0のため計算できません。' };
        }

        let frequencyInSeconds = 0;
        const timeValue = frequency.value || 1;
        switch(frequency.unit) {
            case 'd': frequencyInSeconds = timeValue * 24 * 60 * 60; break;
            case 'h': frequencyInSeconds = timeValue * 60 * 60; break;
            case 'm': frequencyInSeconds = timeValue * 60; break;
            case 's': frequencyInSeconds = timeValue; break;
        }

        if (frequencyInSeconds > 0) {
            impactTime = (workTime * cycleTime) / frequencyInSeconds;
            formula = `計算式: (${formatTimeDisplay(workTime)} × ${formatTimeDisplay(cycleTime)}) ÷ ${formatTimeDisplay(frequencyInSeconds)}`;
        } else {
            formula = '頻度の単位が無効です。';
        }
    }

    return { impactTime: impactTime || 0, formula };
}

/* ============================================================
   Panel Sub-Tab Switching
   パネル内サブタブの切り替え
============================================================ */
function switchPanelTab(group, tab, clickedBtn) {
    const nav = clickedBtn.closest('.panel-sub-nav');
    const container = nav.parentElement;

    // 同グループのタブボタンを全て非アクティブ化
    nav.querySelectorAll('.panel-sub-tab').forEach(t => t.classList.remove('active'));

    // 同グループのコンテンツを全て非表示化
    container.querySelectorAll('.panel-sub-content').forEach(c => c.classList.remove('active'));

    // クリックされたタブとターゲットコンテンツをアクティブ化
    clickedBtn.classList.add('active');
    const targetId = group + tab + 'Panel';
    const target = document.getElementById(targetId);
    if (target) target.classList.add('active');
}

/* ============================================================
/* ============================================================
   Scale Controls Constraint Sync
   2サイクル表示ON時: 無効化ではなくスライダー最小値を制約値に設定
   ユーザーは制約範囲内で自由にスケール調整が可能
============================================================ */
function syncScaleControlsDisabledState() {
    const slider  = document.getElementById('scaleSlider');
    const mainBtn = document.getElementById('mainScaleBtn');
    const freqBtn = document.getElementById('frequencyScaleBtn');
    const section = document.getElementById('scaleModeSection');
    const infoEl  = document.getElementById('scaleConstraintInfo');
    const labelEl = document.getElementById('scaleMinConstraintLabel');

    if (cycleCount >= 2) {
        // 最小必要スケール = (サイクルタイムとT/Tの大きい方) × N × 1.05
        const cycleTime = (typeof calculateTotalCycleTimeForMode === 'function')
            ? calculateTotalCycleTimeForMode(displayMode === 'improved' ? 'improved' : 'current')
            : 0;
        const tt = (typeof taktTime !== 'undefined' && taktTime > 0) ? taktTime : 36;
        const effectiveTT = (typeof batchMode !== 'undefined' && batchMode && typeof batchQuantity !== 'undefined' && batchQuantity > 1) ? tt * batchQuantity : tt;
        
        const minRequired = Math.max(10, Math.ceil(Math.max(cycleTime, effectiveTT) * cycleCount * 1.05));

        if (slider) {
            slider.min     = minRequired;
            slider.disabled = false;
            // 現在値が制約下限を下回る場合は補正
            if (parseInt(slider.value, 10) < minRequired) {
                slider.value   = minRequired;
                manualScaleValue = minRequired;
            }
        }

        // コントロールボタンは有効のまま
        if (mainBtn) mainBtn.disabled = false;
        if (freqBtn) freqBtn.disabled = false;

        // 制約インジケーター表示
        if (infoEl)  infoEl.style.display  = 'flex';
        if (labelEl && typeof formatTimeDisplay === 'function') {
            labelEl.textContent = formatTimeDisplay(minRequired);
        }
        // 制約理由ラベルをNサイクル数で更新
        const reasonEl = document.querySelector('.scale-constraint-reason');
        if (reasonEl) reasonEl.textContent = `（${cycleCount}サイクル制約）`;

        // 視覚クラス: 制約モード（グレーアウトではなく枠線で示す）
        if (section) {
            section.classList.remove('controls-disabled');
            section.classList.add('controls-constrained');
        }
    } else {
        // ── 2サイクルOFF: 制約を解除、通常の最小値に戻す ──
        const sliderMin = Math.max(10, Math.ceil((taktTime || 36) * 0.1));
        if (slider) {
            slider.min      = sliderMin;
            slider.disabled = false;
        }
        if (mainBtn) mainBtn.disabled = false;
        if (freqBtn) freqBtn.disabled = false;

        if (infoEl) infoEl.style.display = 'none';

        if (section) {
            section.classList.remove('controls-disabled');
            section.classList.remove('controls-constrained');
        }
    }
}

// ========================================
// File Manager Panel (ファイル管理パネル)
// ========================================
let _fileManagerOpen = false;
function toggleFileManagerPanel() {
    const panel = document.getElementById('fileManagerPanel');
    if (!panel) return;
    _fileManagerOpen = !_fileManagerOpen;
    panel.style.display = _fileManagerOpen ? 'block' : 'none';
    const chevron = document.getElementById('fileManagerChevron');
    if (chevron) chevron.style.transform = _fileManagerOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (_fileManagerOpen) {
        updateCurrentFileDisplay(); renderFileManagerList();
        setTimeout(() => document.addEventListener('mousedown', _fmpOutsideClickHandler), 0);
    } else { document.removeEventListener('mousedown', _fmpOutsideClickHandler); }
}
function _fmpOutsideClickHandler(e) {
    const panel = document.getElementById('fileManagerPanel');
    const trigger = document.getElementById('currentFileDisplay');
    if (!panel) return;
    if (!panel.contains(e.target) && !trigger?.contains(e.target)) closeFileManagerPanel();
}
function closeFileManagerPanel() {
    const panel = document.getElementById('fileManagerPanel');
    if (panel) panel.style.display = 'none';
    _fileManagerOpen = false;
    const chevron = document.getElementById('fileManagerChevron');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    document.removeEventListener('mousedown', _fmpOutsideClickHandler);
}
function renderFileManagerList() {
    const container = document.getElementById('fileManagerListContainer');
    const countEl = document.getElementById('fmpCount');
    if (!container) return;
    if (countEl) countEl.textContent = `${dataList.length}件`;
    if (dataList.length === 0) {
        container.innerHTML = '<div class="fmp-empty"><i class="fas fa-inbox"></i><br>保存済みデータはありません</div>';
        return;
    }
    const sorted = [...dataList].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    container.innerHTML = sorted.map(d => {
        const isActive = d.id === currentDataId;
        const date = new Date(d.createdAt || 0);
        const diffDays = Math.floor((Date.now() - date) / 86400000);
        const dateStr = diffDays === 0 ? '今日' : diffDays === 1 ? '昨日' : `${date.getMonth()+1}/${date.getDate()}`;
        const wc = d.data?.workItems?.length || 0, fc = d.data?.frequencyWorkItems?.length || 0, sc = d.data?.timeSlots?.length || 0;
        const parts = []; if (wc>0) parts.push(`作業${wc}件`); if (fc>0) parts.push(`頻度${fc}件`); if (sc>0) parts.push(`時間帯${sc}件`);
        return `<div class="fmp-item${isActive?' active':''}" onclick="selectFileFromManager('${d.id}')">
            <div class="fmp-item-check">${isActive?'<i class="fas fa-check"></i>':''}</div>
            <div class="fmp-item-info"><div class="fmp-item-name">${d.name}</div>
            <div class="fmp-item-meta">${parts.join('　')||'データなし'}　<span class="fmp-item-date">${dateStr}</span></div></div>
            <button class="fmp-delete-btn" onclick="event.stopPropagation();deleteFileFromManager('${d.id}')" title="削除"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    }).join('');
}
function selectFileFromManager(id) {
    if (id === currentDataId) { closeFileManagerPanel(); return; }
    const target = dataList.find(d => d.id === id);
    if (!target) return;
    loadDataFromObject(target.data); currentDataId = id;
    currentVariabilityData = target.data.distributionVariability || {};
    updateDataListSelect(); updateSaveButtonUI(); updateDeleteButtonVisibility();
    if (typeof updateVariabilityEditor === 'function') updateVariabilityEditor();
    triggerAutoSave(); closeFileManagerPanel();
}
function deleteFileFromManager(id) {
    const data = dataList.find(d => d.id === id);
    if (!data || !confirm(`「${data.name}」を削除しますか？\nこの操作は取り消せません。`)) return;
    dataList = dataList.filter(d => d.id !== id);
    selectedDataIds = selectedDataIds.filter(sid => sid !== id);
    if (currentDataId === id) { clearAllData(false); currentDataId = null; }
    updateDataListSelect(); updateSaveButtonUI(); updateDeleteButtonVisibility();
    updateDataSelectionList(); triggerAutoSave();
    showNotificationBanner(`「${data.name}」を削除しました。`, 'info', 1500);
}
function updateCurrentFileDisplay() {
    const entry = currentDataId ? dataList.find(d => d.id === currentDataId) : null;
    const displayName = entry?.name || '新規データ';
    const iconClass = currentDataId ? 'fas fa-file-alt' : 'fas fa-file';
    const wc = Array.isArray(workItems) ? workItems.length : 0;
    const fc = Array.isArray(frequencyWorkItems) ? frequencyWorkItems.length : 0;
    const sc = Array.isArray(timeSlots) ? timeSlots.length : 0;
    const parts = []; if (wc>0) parts.push(`作業${wc}件`); if (fc>0) parts.push(`頻度${fc}件`); if (sc>0) parts.push(`時間帯${sc}件`);
    const meta = parts.join('　') || 'データなし';
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    const setClass = (id,c) => { const el=document.getElementById(id); if(el) el.className=c; };
    set('currentFileName', displayName); set('currentFileCount', meta); setClass('currentFileIcon', iconClass);
    set('fmpCurrentName', displayName); set('fmpCurrentMeta', meta);
    setClass('fmpCurrentIcon', iconClass + ' fmp-current-icon');
    const sl = document.getElementById('fmpSaveBtnLabel');
    if (sl) sl.textContent = currentDataId ? '上書き保存' : '新規保存';
}
