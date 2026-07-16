// ========================================
// Text Position Adjustment Settings (テキスト位置調整設定) - アコーディオンUI改善版
// ========================================

/**
 * テキスト位置調整設定のグローバルオブジェクト
 * 各テキスト要素の相対位置調整値（ピクセル単位）
 */
let textPositionAdjustments = {
    workItemLabels: { x: 0, y: 0 },      // 作業項目ラベル（作業名、時間詳細）
    timeAxisLabels: { x: 0, y: 0 },      // 時間軸ラベル（グリッド上の時間表示）
    workTimeLabels: { x: 0, y: 0 },      // 作業時間ラベル（バー上の時間表示）
    taktTimeLabel: { x: 0, y: 0 },       // タクトタイムラベル
    chartTitle: { x: 0, y: 0 },          // チャートタイトル
    statusLabels: { x: 0, y: 0 },        // ステータスラベル（手待ち、オーバータイム）
    processLabels: { x: 0, y: 0 },       // 工程ラベル（ロット表示）
    frequencyLabels: { x: 0, y: 0 },     // 頻度作業ラベル
    completionLabels: { x: 0, y: 0 }     // 完了線ラベル
};

// ========================================
// テキストフラッシュアニメーション状態管理
// 認知心理学的根拠: 変化検出（Change Detection）- 対象文字自体を脈動させることで
// 「この調整がチャートのどの文字に対応するか」をユーザーが即座に把握できる。
// ========================================

/** 現在フラッシュ中のカテゴリ名（null = 非アクティブ） */
let activeTextFlashCategory = null;

/** フラッシュ開始時刻（performance.now() ベース） */
let textFlashStartTime = 0;

/** requestAnimationFrame の ID（キャンセル用） */
let textFlashAnimationId = null;

/** フラッシュ継続時間（ms） */
const TEXT_FLASH_DURATION = 2000;

/**
 * 指定カテゴリのテキストをパルスアニメーションで強調する。
 * アニメーション期間中、updateChart / updateFrequencyChart / updateProcessChart
 * を rAF ループで呼び出すことで Canvas が連続再描画され、
 * chart-renderer.js 側の applyTextFlashStyles() が各フレームで呼ばれる。
 *
 * @param {string} category - textPositionAdjustments のキー
 */
function triggerTextPulseAnimation(category) {
    // 既存アニメーションをキャンセル
    if (textFlashAnimationId !== null) {
        cancelAnimationFrame(textFlashAnimationId);
        textFlashAnimationId = null;
    }

    activeTextFlashCategory = category;
    textFlashStartTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - textFlashStartTime;
        if (elapsed < TEXT_FLASH_DURATION) {
            if (typeof updateChart === 'function')          updateChart();
            if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
            if (typeof updateProcessChart === 'function')   updateProcessChart();
            textFlashAnimationId = requestAnimationFrame(animate);
        } else {
            // アニメーション終了 → 最終描画でフラッシュ解除
            activeTextFlashCategory = null;
            textFlashAnimationId = null;
            if (typeof updateChart === 'function')          updateChart();
            if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
            if (typeof updateProcessChart === 'function')   updateProcessChart();
        }
    }
    textFlashAnimationId = requestAnimationFrame(animate);
}

/**
 * Canvas コンテキストに対してテキストフラッシュスタイルを適用する。
 * chart-renderer.js 側の各テキスト描画ブロックから呼び出す。
 *
 * 呼び出し規約:
 *   1. ctx.save() を事前に呼んでおく
 *   2. 通常のフォント・色を設定した後、fillText() の直前にこの関数を呼ぶ
 *   3. fillText() の後に ctx.restore() でシャドウ等をクリーンアップ
 *
 * @param {CanvasRenderingContext2D} ctx - 対象のCanvas 2D コンテキスト
 * @param {string} category - テキストカテゴリ名
 * @returns {boolean} フラッシュスタイルを適用したか
 */
function applyTextFlashStyles(ctx, category) {
    if (activeTextFlashCategory !== category || !textFlashStartTime) return false;

    const elapsed = performance.now() - textFlashStartTime;
    if (elapsed >= TEXT_FLASH_DURATION) {
        activeTextFlashCategory = null;
        return false;
    }

    // サイン波でパルスエフェクト（0.0 〜 1.0）
    const pulse = (Math.sin((elapsed / 130) * Math.PI * 2) + 1) / 2;

    // フォント: 既存サイズに +3px 上乗せ（太字化）
    const currentFont = ctx.font || '12px "Segoe UI", sans-serif';
    const sizeMatch = currentFont.match(/(\d+(?:\.\d+)?)px/);
    const baseSize = sizeMatch ? parseFloat(sizeMatch[1]) : 12;
    const flashSize = baseSize + Math.round(pulse * 3);
    ctx.font = currentFont.replace(/(\d+(?:\.\d+)?)px/, `${flashSize}px`)
                          .replace(/^(?!bold)/, 'bold ');

    // 色: Amber パルス
    const alpha = 0.75 + pulse * 0.25;
    ctx.fillStyle = `rgba(245, 158, 11, ${alpha.toFixed(2)})`;

    // 光彩（グロー）効果
    ctx.shadowColor  = `rgba(245, 158, 11, ${(0.6 + pulse * 0.4).toFixed(2)})`;
    ctx.shadowBlur   = 4 + pulse * 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    return true;
}

/**
 * テキスト位置調整のデフォルト値
 */
const DEFAULT_TEXT_POSITION_ADJUSTMENTS = {
    workItemLabels: { x: 0, y: 0 },
    timeAxisLabels: { x: 0, y: 0 },
    workTimeLabels: { x: 0, y: 0 },
    taktTimeLabel: { x: 0, y: 0 },
    chartTitle: { x: 0, y: 0 },
    statusLabels: { x: 0, y: 0 },
    processLabels: { x: 0, y: 0 },
    frequencyLabels: { x: 0, y: 0 },
    completionLabels: { x: 0, y: 0 }
};

/**
 * テキスト位置調整値を適用する汎用関数
 * @param {string} category - 調整カテゴリ
 * @param {number} baseX - 基準X座標
 * @param {number} baseY - 基準Y座標
 * @returns {Object} - 調整済み座標 {x, y}
 */
function applyTextPositionAdjustment(category, baseX, baseY) {
    const adjustment = textPositionAdjustments[category] || { x: 0, y: 0 };
    return {
        x: baseX + adjustment.x,
        y: baseY - adjustment.y
    };
}

/**
 * テキスト位置調整UIの値を更新
 */
function updateTextPositionUI() {
    Object.keys(textPositionAdjustments).forEach(category => {
        const xInput = document.getElementById(`textPos_${category}_x`);
        const yInput = document.getElementById(`textPos_${category}_y`);
        
        if (xInput && yInput) {
            xInput.value = textPositionAdjustments[category].x;
            yInput.value = textPositionAdjustments[category].y;
        }
    });
}

/**
 * テキスト位置調整値を変更
 * @param {string} category - 調整カテゴリ
 * @param {string} axis - 軸（'x' または 'y'）
 * @param {number} value - 調整値
 */
function updateTextPositionAdjustment(category, axis, value) {
    if (!textPositionAdjustments[category]) {
        textPositionAdjustments[category] = { x: 0, y: 0 };
    }
    
    textPositionAdjustments[category][axis] = parseInt(value) || 0;
    
    // チャートを即座に再描画
    updateChart();
    updateFrequencyChart();
    updateProcessChart();
    
    // 設定を保存
    triggerAutoSave();
}

/**
 * 特定カテゴリの位置調整をリセット
 * @param {string} category - リセットするカテゴリ
 */
function resetTextPositionCategory(category) {
    if (textPositionAdjustments[category]) {
        textPositionAdjustments[category] = { x: 0, y: 0 };
        
        // UIを更新
        const xInput = document.getElementById(`textPos_${category}_x`);
        const yInput = document.getElementById(`textPos_${category}_y`);
        
        if (xInput && yInput) {
            xInput.value = 0;
            yInput.value = 0;
        }
        
        // チャートを再描画
        updateChart();
        updateFrequencyChart();
        updateProcessChart();
        
        triggerAutoSave();
        showNotificationBanner(`${getCategoryDisplayName(category)}の位置をリセットしました。`, 'success', 2000);
    }
}

/**
 * 全ての位置調整をリセット
 */
function resetAllTextPositions() {
    if (confirm('全ての文字位置調整をリセットしますか？')) {
        textPositionAdjustments = JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS));
        
        // UIを更新
        updateTextPositionUI();
        
        // チャートを再描画
        updateChart();
        updateFrequencyChart();
        updateProcessChart();
        
        triggerAutoSave();
        showNotificationBanner('全ての文字位置をリセットしました。', 'success', 2000);
    }
}

/**
 * カテゴリの表示名を取得
 * @param {string} category - カテゴリ名
 * @returns {string} - 表示名
 */
function getCategoryDisplayName(category) {
    const displayNames = {
        workItemLabels: '作業項目ラベル',
        timeAxisLabels: '時間軸ラベル',
        workTimeLabels: '作業時間ラベル',
        taktTimeLabel: 'タクトタイムラベル',
        chartTitle: 'チャートタイトル',
        statusLabels: 'ステータスラベル',
        processLabels: '工程ラベル',
        frequencyLabels: '頻度作業ラベル',
        completionLabels: '完了線ラベル'
    };
    
    return displayNames[category] || category;
}

/**
 * テキスト位置調整UIを動的に作成
 */
function createTextPositionUI() {
    const container = document.getElementById('textPositionPanelContainer');
    if (!container) {
        console.error('textPositionPanelContainer not found. UI cannot be created.');
        return;
    }

    container.innerHTML = `
        <div id="textPositionPanel" class="text-position-panel">
            <div class="text-position-header">
                <div class="text-position-description">
                    各テキスト要素の表示位置を微調整できます。
                </div>
                <button type="button" onclick="resetAllTextPositions()" class="btn btn-secondary btn-small" title="全ての設定をリセット">
                    <i class="fas fa-undo"></i> 全リセット
                </button>
            </div>
            <div class="text-position-categories">
                ${Object.keys(textPositionAdjustments).map(category => createCategoryControl(category)).join('')}
            </div>
        </div>
    `;

    addTextPositionStyles();
    setupTextPositionEventListeners();
}

/**
 * カテゴリ別アコーディオンコントロールのHTMLを生成
 * @param {string} category - カテゴリ名
 * @returns {string} - HTML文字列
 */
function createCategoryControl(category) {
    const displayName = getCategoryDisplayName(category);
    const currentX = textPositionAdjustments[category].x;
    const currentY = textPositionAdjustments[category].y;

    return `
        <div class="tp-accordion-item">
            <div class="tp-accordion-header" data-category="${category}">
                <span class="tp-accordion-title">${displayName}</span>
                <i class="fas fa-chevron-down tp-accordion-toggle"></i>
            </div>
            <div class="tp-accordion-content">
                <div class="tp-accordion-content-inner">
                    <div class="category-controls">
                        <div class="control-group">
                            <label for="textPos_${category}_x">X:</label>
                            <input type="number" 
                                   id="textPos_${category}_x" 
                                   value="${currentX}" 
                                   min="-100" 
                                   max="100" 
                                   step="1"
                                   onchange="updateTextPositionAdjustment('${category}', 'x', this.value)"
                                   oninput="updateTextPositionAdjustment('${category}', 'x', this.value)">
                            <span class="unit">px</span>
                        </div>
                        <div class="control-group">
                            <label for="textPos_${category}_y">Y:</label>
                            <input type="number" 
                                   id="textPos_${category}_y" 
                                   value="${currentY}" 
                                   min="-100" 
                                   max="100" 
                                   step="1"
                                   onchange="updateTextPositionAdjustment('${category}', 'y', this.value)"
                                   oninput="updateTextPositionAdjustment('${category}', 'y', this.value)">
                            <span class="unit">px</span>
                        </div>
                    </div>
                    <button type="button" onclick="resetTextPositionCategory('${category}')" 
                            class="btn-reset-category" title="${displayName}の設定をリセット">
                        <i class="fas fa-undo"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * テキスト位置調整パネル用のCSSスタイルを動的に追加
 */
function addTextPositionStyles() {
    const existingStyle = document.getElementById('textPositionStyles');
    if (existingStyle) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'textPositionStyles';
    styleElement.textContent = `
        .text-position-panel {
            background: transparent;
            padding: 8px;
        }
        .text-position-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            gap: 8px;
        }
        .text-position-description {
            font-size: 11px;
            color: #475569;
            line-height: 1.4;
            flex-grow: 1;
        }
        .text-position-categories {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        /* Accordion Item Styles */
        .tp-accordion-item {
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background-color: var(--background-white);
            transition: all 0.2s ease;
        }
        .tp-accordion-item:hover {
            border-color: var(--border-strong);
        }
        .tp-accordion-item.active {
            border-color: var(--primary-color);
            background-color: #f7f9ff;
        }
        .tp-accordion-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            user-select: none;
        }
        .tp-accordion-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
        }
        .tp-accordion-toggle {
            font-size: 12px;
            color: var(--text-secondary);
            transition: transform 0.3s ease;
        }
        .tp-accordion-item.active .tp-accordion-toggle {
            transform: rotate(180deg);
            color: var(--primary-color);
        }

        /* Accordion Content Styles */
        .tp-accordion-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }
        .tp-accordion-content-inner {
            padding: 4px 12px 12px 12px;
            border-top: 1px solid var(--border-light);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        .category-controls {
            display: flex;
            gap: 10px;
            flex-grow: 1;
        }
        .control-group {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .control-group label {
            font-size: 11px;
            color: #64748b;
        }
        .control-group input[type="number"] {
            width: 50px;
            padding: 4px;
            font-size: 11px;
            text-align: center;
            border: 1px solid var(--border-color);
            border-radius: 4px;
        }
        .control-group input[type="number"]:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }
        .control-group .unit {
            font-size: 10px;
            color: #94a3b8;
        }
        .btn-reset-category {
            background: var(--background-subtle);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 10px;
            padding: 5px 8px;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        .btn-reset-category:hover {
            background: #e2e8f0;
            color: var(--text-primary);
        }
    `;
    document.head.appendChild(styleElement);
}

/**
 * テキスト位置調整パネルのイベントリスナーを設定
 */
function setupTextPositionEventListeners() {
    // 1. アコーディオンの開閉リスナー
    const headers = document.querySelectorAll('.tp-accordion-header');
    headers.forEach(header => {
        header.addEventListener('click', function() {
            const item = this.parentElement;
            const content = this.nextElementSibling;
            
            if (item.classList.contains('active')) {
                // 閉じる
                item.classList.remove('active');
                content.style.maxHeight = null;
            } else {
                // 開く
                item.classList.add('active');
                // コンテンツの実際の高さを取得して設定
                const contentInner = content.querySelector('.tp-accordion-content-inner');
                content.style.maxHeight = contentInner.scrollHeight + "px";

                // ── テキストフラッシュアニメーション起動 ─────────────────────────
                // 認知心理学（空間的マッピング + 変化検出）:
                //   サブメニューを開いた瞬間にCanvas上の対象テキスト自体が
                //   Amberパルスで脈打つことで、「このコントロール = あの文字」
                //   という直感的な対応付けをユーザーに即座に伝える。
                const category = this.dataset.category;
                if (category && typeof triggerTextPulseAnimation === 'function') {
                    triggerTextPulseAnimation(category);
                }
            }
        });
    });

    // 2. 既存のinput[type=number]のwheelイベントリスナー
    Object.keys(textPositionAdjustments).forEach(category => {
        ['x', 'y'].forEach(axis => {
            const input = document.getElementById(`textPos_${category}_${axis}`);
            if (input) {
                // 既存のリスナーがあれば削除
                if (input.wheelListener) {
                    input.removeEventListener('wheel', input.wheelListener);
                }
                
                // 新しいリスナーを追加
                const wheelListener = function(event) {
                    if (document.activeElement === input) {
                        event.preventDefault();
                        const delta = event.deltaY > 0 ? -1 : 1;
                        const currentValue = parseInt(input.value) || 0;
                        const newValue = currentValue + delta;
                        
                        if (newValue >= -100 && newValue <= 100) {
                            input.value = newValue;
                            updateTextPositionAdjustment(category, axis, newValue);
                        }
                    }
                };
                
                input.addEventListener('wheel', wheelListener);
                input.wheelListener = wheelListener; // リスナーを保存
            }
        });
    });
}