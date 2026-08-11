// ========================================
// Enhanced UI Manager - User Interface Management (Business Optimized - Enhanced with Schedule and Frequency Work)
// ========================================

let originalVariabilityData = null; // バラつき編集モーダルの「元に戻す」用

/**
 * UI要素の更新（プラスアイコン、挿入ゾーンハイライトなど）
 */
function updateUIElements() {
    if (isWelcomeScreenVisible()) return; // WELCOME画面表示中はスキップ
    if (currentMainTab === 'gantt') {
        updateGanttUIElements();
    } else if (currentMainTab === 'distribution') {
        updateDistributionUIElements();
    } else if (currentMainTab === 'schedule') {
        updateScheduleUIElements();
    }
}

/**
 * ガントチャート用のUI要素更新
 */
function updateGanttUIElements() {
    const displayItems = getDisplayWorkItems();
    
    // ドロップゾーンハイライト（ドラッグ中）
    const canvasContainer = document.getElementById('canvasContainer');
    const existingElements = document.querySelectorAll('.drop-zone-highlight, .chart-row-highlight');
    existingElements.forEach(element => element.remove());
    
    if (canvasDragMode && dropTargetIndex >= 0) {
        createDropZoneHighlight(canvasContainer, dropTargetIndex, displayItems);
    }
    
    // 改善効果表示の更新（改善後モードまたは併記モードの場合）
    if (displayMode === 'improved' || displayMode === 'both') {
        calculateImprovementEffectsIntegrated();
    }
    
    // 並び替えセクションの表示更新
    updateReorderSectionVisibility();
    
    // データリスト管理UIの更新
    updateDataListUI();
    
    // ★★★ 修正箇所: 頻度作業チャートの表示制御を追加 ★★★
    // 頻度作業チャートの表示/非表示を更新
    updateFrequencyChartVisibility();
    // 頻度作業チャートのモードボタン（実時間/換算値）の状態を更新
    updateFrequencyChartModeButtons();
}

/**
 * 工程確認キャンバスのリサイズ
 */
function handleProcessCanvasResize() {
    const processCanvasContainer = document.getElementById('processChartContainer');
    const processCanvas = document.getElementById('processCanvas');
    
    // キャンバスとコンテキストの存在チェックを追加
    if (!processCanvasContainer || !processCanvas || !processCtx) return;
    
    // 表示されていない場合はリサイズしない
    if (processCanvasContainer.style.display === 'none') return;
    
    try {
        // 現在のdevicePixelRatioを取得（モニター間移動対応）
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // メインチャートと完全に幅を同期
        const mainCanvas = document.getElementById('ganttCanvas');
        
        if (!mainCanvas) {
            console.warn('Main canvas not found for process canvas resize');
            return;
        }
        
        const mainCanvasDisplayWidth = mainCanvas.width / devicePixelRatio;
        const currentProcessWidth = processCanvas.width / devicePixelRatio;
        const currentProcessHeight = processCanvas.height / devicePixelRatio;
        
        // サイズの変更またはdevicePixelRatioの変更を検知
        const widthChanged = Math.abs(currentProcessWidth - mainCanvasDisplayWidth) > 0.5;
        const dprChanged = Math.abs(devicePixelRatio - (processCanvas._lastDevicePixelRatio || devicePixelRatio)) > 0.1;
        
        if (widthChanged || dprChanged) {
            
            // グローバル変数を更新
            processCanvasWidth = mainCanvasDisplayWidth;
            
            // devicePixelRatioを記録
            processCanvas._lastDevicePixelRatio = devicePixelRatio;
            
            // 高解像度対応でキャンバス更新（強制的にスケール再設定）
            setupHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
            
            // スケール情報を強制的に同期
            if (typeof getChartCommonSettings === 'function') {
                const settings = getChartCommonSettings();
                window.processChartScaleInfo = {
                    maxTime: settings.maxTime,
                    timeScale: settings.timeScale,
                    leftMargin: settings.leftMargin,
                    rightMargin: settings.rightMargin,
                    devicePixelRatio: devicePixelRatio,
                    syncTime: new Date().toISOString(),
                    resizeTriggered: true
                };
            }
            
            // リサイズ後は描画を確実に実行（工程確認チャート表示時のみ）
            if (showProcessChart && typeof updateProcessChart === 'function') {
                // リサイズ直後の描画は少し待つ
                requestAnimationFrame(() => {
                    updateProcessChart();
                    
                    // さらに確実にするため、もう一度描画
                    setTimeout(() => {
                        updateProcessChart();
                    }, 100);
                });
            }
        }
        
    } catch (error) {
        console.error('Error in handleProcessCanvasResize:', error);
    }
}

/**
 * 工程確認チャートの強制サイズ同期（高さ修正版対応）
 */
function forceProcessChartSizeSync() {
    // キャンバス要素の存在チェックを追加
    if (!processCanvas || !canvas) {
        // console.warn('Canvas elements not available for size sync');
        return false;
    }
    
    try {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const mainCanvasDisplayWidth = canvas.width / devicePixelRatio;
        const currentProcessWidth = processCanvas.width / devicePixelRatio;
        
        // 動的にロット数を取得して高さ計算
        const maxLotNumber = getMaxLotNumber();
        const requiredHeight = PROCESS_TOP_MARGIN + (maxLotNumber * PROCESS_ROW_HEIGHT) + PROCESS_BOTTOM_MARGIN;
        const currentProcessHeight = processCanvas.height / devicePixelRatio;
        
        const needsWidthSync = Math.abs(currentProcessWidth - mainCanvasDisplayWidth) > 0.1;
        const needsHeightSync = Math.abs(currentProcessHeight - requiredHeight) > 5;
        
        if (needsWidthSync || needsHeightSync) {
           
            // グローバル変数を更新
            processCanvasWidth = mainCanvasDisplayWidth;
            processCanvasHeight = requiredHeight;
            
            // キャンバスサイズを更新
            updateHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
            
            // スケール情報をクリア（再計算を強制）
            window.processChartScaleInfo = null;

            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error in forceProcessChartSizeSync:', error);
        return false;
    }
}


/**
 * 作業配分表用のUI要素更新
 */
function updateDistributionUIElements() {
    // データ選択状態の更新
    updateDataSelectionCount();
    
    // データリスト管理UIの更新
    updateDataListUI();
}

/**
 * 稼働時間タブ用のUI要素更新（新規）
 */
function updateScheduleUIElements() {
    // 稼働時間カードの更新
    updateWorkingTimeCardsCompact();
    
    // 時間帯リストの更新
    updateTimeSlotList();
    
    // データリスト管理UIの更新
    updateDataListUI();
}

/**
 * データ選択数の表示を更新
 */
function updateDataSelectionCount() {
    const countDisplay = document.getElementById('selectedDataCount');
    if (countDisplay) {
        // ユーザーが選択したデータ数を直接表示する
        const selectedCount = selectedDataIds ? selectedDataIds.length : 0;
        
        // アニメーション効果を追加して更新を視覚的にフィードバック
        if (countDisplay.textContent !== selectedCount.toString()) {
            countDisplay.classList.add('updating');
            setTimeout(() => {
                countDisplay.textContent = selectedCount.toString();
                countDisplay.classList.remove('updating');
            }, 200);
        } else {
            countDisplay.textContent = selectedCount.toString();
        }
    }
}

/**
 * 並び替えセクションの表示を更新
 */
function updateReorderSectionVisibility() {
    const reorderSection = document.getElementById('orderManagementSection');
    if (!reorderSection) return;
    
    // 作業項目が2個以上ある場合のみ表示
    if (workItems.length >= 2) {
        reorderSection.style.display = 'block';
    } else {
        reorderSection.style.display = 'none';
    }
}

/**
 * 頻度作業チャートの表示制御（新規）
 */
function updateFrequencyChartVisibility() {
    const frequencyContainer    = document.getElementById('frequencyChartContainer');
    const freqTimeModeContainer = document.getElementById('freqTimeModeContainer');
    const freqModeOverlay       = document.getElementById('frequencyModeOverlay');
    const ghostZone             = document.getElementById('frequencyAddGhostZone');
    const canvasContainer       = document.getElementById('frequencyCanvasContainer');
    if (!frequencyContainer || !freqTimeModeContainer) return;

    const hasItems = !!(frequencyWorkItems && frequencyWorkItems.length > 0);

    if (!showFrequencyChart) {
        // 表示トグルOFF: コンテナごと非表示
        frequencyContainer.style.display = 'none';
        freqTimeModeContainer.classList.remove('visible');
        if (freqModeOverlay) freqModeOverlay.classList.remove('visible');
        return;
    }

    // 表示トグルON: コンテナは常に表示
    frequencyContainer.style.display = 'block';

    if (hasItems) {
        // 入力済み: キャンバスを表示、ゴーストゾーンを隠す
        if (ghostZone)       ghostZone.style.display       = 'none';
        if (canvasContainer) canvasContainer.style.display = '';
        freqTimeModeContainer.classList.add('visible');
        if (freqModeOverlay) freqModeOverlay.classList.add('visible');
    } else {
        // 未入力: ゴーストゾーンを表示、キャンバスを隠す
        if (ghostZone)       ghostZone.style.display       = 'block';
        if (canvasContainer) canvasContainer.style.display = 'none';
        freqTimeModeContainer.classList.remove('visible');
        if (freqModeOverlay) freqModeOverlay.classList.remove('visible');

        // コンテキスト感知ヒント: ガントデータの有無でメッセージ・スタイルを切り替え
        const hintEl = document.getElementById('freqEmptyHint');
        if (hintEl) {
            const hasGanttData = !!(typeof workItems !== 'undefined' && workItems && workItems.length > 0);
            if (hasGanttData) {
                // ガントデータあり → ヒント不要（非表示）
                hintEl.textContent = '';
                hintEl.className = 'fes-context-hint';
            } else {
                // ガントデータなし → 警告ヒントを表示
                hintEl.textContent = '⚠ 先に「標準作業組合せ票」タブで作業を登録してください';
                hintEl.className = 'fes-context-hint hint-warning';
            }
        }
    }
}

/**
 * 頻度作業チャートサイズの調整（高解像度対応版・完全修正・完全スケール同期）
 */
function adjustFrequencyChartSize() {
    // グローバル変数 frequencyCanvas / frequencyCtx が初期化済みであればそちらを優先利用。
    // 未初期化（welcome遷移前など）の場合は DOM から取得してグローバルに反映する。
    if (!window.frequencyCanvas || !window.frequencyCtx) {
        const el = document.getElementById('frequencyCanvas');
        if (!el) return;
        window.frequencyCanvas = el;
        window.frequencyCtx    = el.getContext('2d');
        if (!window.frequencyCtx) return;
    }
    const freqCanvas = window.frequencyCanvas;
    const freqCtx    = window.frequencyCtx;

    if (!freqCanvas || !freqCtx || !frequencyWorkItems) return;
    
    try {
        // 現在のdevicePixelRatioを取得（モニター間移動対応）
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // 頻度作業項目数に応じて高さを動的調整
        const requiredHeight = FREQUENCY_TOP_MARGIN + 
                              (frequencyWorkItems.length * FREQUENCY_ROW_HEIGHT) + 
                              FREQUENCY_BOTTOM_MARGIN;
        
        // 最小高さと最大高さを設定
        const minHeight = 150;
        const maxHeight = 400;
        const adjustedHeight = Math.max(minHeight, Math.min(maxHeight, requiredHeight));
        
        // メインチャートと完全に幅を同期
        // ★グローバル canvasWidth（updateChart が確定した唯一の真値）を使用
        const mainCanvasDisplayWidth = (typeof canvasWidth === 'number' && canvasWidth > 0)
            ? canvasWidth
            : (document.getElementById('ganttCanvas')?.width / devicePixelRatio || frequencyCanvasWidth);
        
        const currentDisplayWidth  = freqCanvas.width  / devicePixelRatio;
        const currentDisplayHeight = freqCanvas.height / devicePixelRatio;
        
        // サイズの変更またはdevicePixelRatioの変更を検知
        const heightChanged = Math.abs(currentDisplayHeight - adjustedHeight) > 10;
        const widthChanged  = Math.abs(currentDisplayWidth - mainCanvasDisplayWidth) > 1;
        const dprChanged    = Math.abs(devicePixelRatio - (freqCanvas._lastDevicePixelRatio || devicePixelRatio)) > 0.1;
        
        if (heightChanged || widthChanged || dprChanged) {
            // グローバル変数を更新
            frequencyCanvasHeight = adjustedHeight;
            frequencyCanvasWidth  = mainCanvasDisplayWidth;
            
            // devicePixelRatioを記録
            freqCanvas._lastDevicePixelRatio = devicePixelRatio;
            
            // 高解像度対応でキャンバス更新（グローバル ctx を渡す）
            setupHighDPICanvas(freqCanvas, freqCtx, frequencyCanvasWidth, frequencyCanvasHeight);
            
            // ★修正: rAF を除去し同期実行に変更。
            //   旧: requestAnimationFrame(() => updateFrequencyChart()) → 既に rAF コンテキスト内で
            //       呼ばれる場合、二重 rAF となり canvasWidth との同期タイミングがズレていた。
            //   新: setupHighDPICanvas 直後に同期実行（canvas サイズ確定済みで安全）。
            if (typeof updateFrequencyChart === 'function') {
                updateFrequencyChart();
            }
        }
        
    } catch (error) {
        console.error('Error in adjustFrequencyChartSize:', error);
    }
}

/**
 * データリスト管理UIの更新
 */
function updateDataListUI() {
    const select = document.getElementById('dataListSelect');
    const deleteBtn = document.getElementById('deleteDataFromListBtn');
    
    if (select && deleteBtn) {
        // 削除ボタンの表示制御
        deleteBtn.style.display = select.value ? 'inline-flex' : 'none';
    }
}

/**
 * ドロップゾーンハイライトを作成（改良版：正確な位置計算）
 * @param {HTMLElement} container - コンテナ要素
 * @param {number} targetIndex - ドロップターゲットインデックス
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function createDropZoneHighlight(container, targetIndex, displayItems) {
    const highlight = document.createElement('div');
    highlight.className = 'drop-zone-highlight';
    
    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT; // 常にROW_HEIGHTを使用
    let highlightY;
    
    // 正確な位置計算（登録項目内のみ）
    if (targetIndex >= displayItems.length) {
        // 最後の項目の下
        highlightY = TOP_MARGIN + (displayItems.length * effectiveRowHeight) - 2;
    } else {
        // 通常の項目間
        highlightY = TOP_MARGIN + (targetIndex * effectiveRowHeight) - 2;
    }
    
    highlight.style.top = `${highlightY}px`;
    
    container.appendChild(highlight);
}

// ========================================
// Enhanced Working Time Cards Management (稼働時間カード強化版 - コンパクト表示)
// ========================================

/**
 * 稼働時間カードをコンパクト表示で更新（新規：横1行表示）
 */
function updateWorkingTimeCardsCompact() {
    const workingTimeInfo = calculateWorkingTime();
    
    // コンパクトカード群を更新
    updateCompactWorkingTimeCards(workingTimeInfo);
    
    // 稼働時間設定表示も更新
    updateScheduleConfigDisplay();
}

/**
 * コンパクト稼働時間カードの更新（新規：横1行配置）
 * @param {Object} workingTimeInfo - 稼働時間情報
 */
function updateCompactWorkingTimeCards(workingTimeInfo) {
    // 実稼働時間カード
    updateSingleCompactCard('workingTimeCard', workingTimeInfo.workingMinutes, workingTimeInfo.totalMinutes, {
        label: '実稼働時間',
        showPercentage: true,
        color: 'var(--schedule-work-color)' // schedule-work-color を使用
    });

    // 正味稼働時間カード
    updateSingleCompactCard('netWorkingTimeCard', workingTimeInfo.netWorkingMinutes, workingTimeInfo.workingMinutes, {
        label: '正味稼働時間',
        showPercentage: false,
        color: 'var(--success-color)' // 成功色
    });

    // 正味生産時間カード
    updateSingleCompactCard('netProductionTimeCard', workingTimeInfo.netProductionMinutes, workingTimeInfo.netWorkingMinutes, {
        label: '正味生産時間',
        showPercentage: false,
        color: 'var(--accent-color)' // アクセント色
    });

    // 可動率カード
    const operatingRate = workingTimeInfo.workingMinutes > 0 ?
        (workingTimeInfo.netProductionMinutes / workingTimeInfo.workingMinutes * 100) : 0;

    updateOperatingRateCard(operatingRate);
}

/**
 * 単一のコンパクトカードを更新（新規）
 * @param {string} cardId - カードID
 * @param {number} value - 値（分）
 * @param {number} total - 総計（分）
 * @param {Object} options - オプション
 */
function updateSingleCompactCard(cardId, value, total, options) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    const timeText = `${hours}h${minutes.toString().padStart(2, '0')}m`;
    
    // 値を更新
    const valueElement = card.querySelector('.card-value');
    if (valueElement) {
        valueElement.textContent = timeText;
        valueElement.style.color = options.color;
    }
    
    // パーセンテージ表示（必要な場合）
    if (options.showPercentage && total > 0) {
        const percentage = (value / total * 100).toFixed(1);
        const percentageElement = card.querySelector('.card-percentage');
        if (percentageElement) {
            percentageElement.textContent = `${percentage}%`;
            percentageElement.style.color = options.color;
        }
    }
    
    // ラベル更新
    const labelElement = card.querySelector('.card-label');
    if (labelElement) {
        labelElement.textContent = options.label;
    }
    
    // カードの視覚的フィードバック
    updateCardVisualFeedback(card, value, total, options.color);
}

/**
 * 可動率カードの更新（新規：色分け強化）
 * @param {number} operatingRate - 可動率（%）
 */
function updateOperatingRateCard(operatingRate) {
    const card = document.getElementById('operatingRateCard');
    if (!card) return;
    
    const valueElement = card.querySelector('.card-value');
    const labelElement = card.querySelector('.card-label');
    
    if (valueElement) {
        valueElement.textContent = `${operatingRate.toFixed(1)}%`;
        
        // 可動率に応じた色分け（強化版）
        let color, status;
        if (operatingRate >= 90) {
            color = '#059669'; // 緑：優秀
            status = '優秀';
        } else if (operatingRate >= 75) {
            color = '#2563eb'; // 青：良好
            status = '良好';
        } else if (operatingRate >= 60) {
            color = '#d97706'; // オレンジ：注意
            status = '注意';
        } else {
            color = '#dc2626'; // 赤：要改善
            status = '要改善';
        }
        
        valueElement.style.color = color;
        
        // ステータス表示
        if (labelElement) {
            labelElement.textContent = `可動率 (${status})`;
            labelElement.style.color = color;
        }
        
        // カードの背景色も調整
        updateCardVisualFeedback(card, operatingRate, 100, color);
    }
}

/**
 * カードの視覚的フィードバック更新（新規）
 * @param {HTMLElement} card - カード要素
 * @param {number} value - 値
 * @param {number} total - 総計
 * @param {string} color - 色
 */
function updateCardVisualFeedback(card, value, total, color) {
    if (!card) return;
    
    // プログレスバー（カード下部）
    let progressBar = card.querySelector('.card-progress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.className = 'card-progress';
        card.appendChild(progressBar);
    }
    
    const percentage = total > 0 ? (value / total * 100) : 0;
    progressBar.style.width = `${Math.min(100, percentage)}%`;
    progressBar.style.backgroundColor = color;
    progressBar.style.opacity = '0.2';
    
    // ホバー効果
    card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-1px)';
        this.style.boxShadow = `0 4px 12px ${color}20`;
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    });
}

/**
 * 稼働時間設定表示の更新（新規）
 */
function updateScheduleConfigDisplay() {
    const startTimeDisplay = document.getElementById('scheduleStartTimeDisplay');
    const workHoursDisplay = document.getElementById('scheduleWorkHoursDisplay');
    const endTimeDisplay = document.getElementById('scheduleEndTimeDisplay');
    
    if (startTimeDisplay) {
        startTimeDisplay.textContent = scheduleConfig.startTime || '未設定';
    }
    
    if (workHoursDisplay) {
        workHoursDisplay.textContent = scheduleConfig.workHours ? `${scheduleConfig.workHours}h` : '未設定';
    }
    
    if (endTimeDisplay) {
        endTimeDisplay.textContent = scheduleConfig.endTime || '未設定';
    }
}

// ========================================
// Interactive Helper Functions (Business Optimized - Enhanced Tooltip)
// ========================================

/**
 * 動的なツールチップ表示（強化版：半透過グレー＆項目追加時オレンジ系・頻度作業対応）
 * @param {Event} event - マウスイベント
 * @param {string} content - ツールチップ内容
 * @param {string} type - ツールチップタイプ（'default', 'insert', 'frequency'）
 * @param {number|null} customX - カスタムX座標
 */
function showDynamicTooltip(event, content, type = 'default', customX = null) {
    const tooltip = document.getElementById('tooltip');
    
    tooltip.innerHTML = content;
    
    // ツールチップのクラス設定（半透過グレー・オレンジ系・頻度作業対応）
    tooltip.className = 'tooltip';
    if (type === 'insert') {
        tooltip.classList.add('insert-tooltip');
    } else if (type === 'frequency') {
        tooltip.classList.add('frequency-tooltip');
    }
    
    // 位置調整（改良版）
    const x = customX !== null ? customX : event.pageX + 12;
    const y = event.pageY - 12;
    
    // 画面端での調整（改良版）
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let adjustedX = x;
    let adjustedY = y;
    
    // 右端チェック
    if (x + 250 > viewportWidth) { // ツールチップの最大幅を考慮
        adjustedX = event.pageX - 250 - 12;
    }
    
    // 下端チェック
    if (y + 100 > viewportHeight) { // ツールチップの推定高さを考慮
        adjustedY = event.pageY - 100 - 12;
    }
    
    // 左端・上端の最小値保証
    adjustedX = Math.max(8, adjustedX);
    adjustedY = Math.max(8, adjustedY);
    
    tooltip.style.left = adjustedX + 'px';
    tooltip.style.top = adjustedY + 'px';
    
    // フェードイン効果
    tooltip.classList.add('show');
    tooltip.style.display = 'block';
    
    // ツールチップの自動非表示（長時間表示時）
    if (type === 'insert' || type === 'frequency') {
        setTimeout(() => {
            if (tooltip.style.display === 'block' && 
                (tooltip.classList.contains('insert-tooltip') || tooltip.classList.contains('frequency-tooltip'))) {
                hideDynamicTooltip();
            }
        }, 5000); // 特殊ツールチップは5秒で自動非表示
    }
}

/**
 * ツールチップを非表示にする（改良版）
 */
function hideDynamicTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.classList.add('hide');
        setTimeout(() => {
            tooltip.style.display = 'none';
            tooltip.classList.remove('show', 'hide', 'insert-tooltip', 'frequency-tooltip');
        }, 150); // フェードアウトアニメーションの時間
    }
}

/**
 * フィードバックアニメーション（ビジネス用色統一版・頻度作業対応）
 * @param {HTMLElement} element - アニメーション対象要素
 * @param {string} animationType - アニメーションタイプ
 */
function showFeedbackAnimation(element, animationType = 'success') {
    if (!element) return;
    
    const originalTransform = element.style.transform;
    const originalBackground = element.style.background;
    
    switch (animationType) {
        case 'success':
            element.style.background = '#059669';
            element.style.transform = 'scale(1.02)';
            break;
        case 'error':
            element.style.background = '#dc2626';
            element.style.transform = 'scale(1.02)';
            break;
        case 'warning':
            element.style.background = '#d97706';
            element.style.transform = 'scale(1.02)';
            break;
        case 'improved':
            element.style.background = '#dc2626'; // 改善後は赤系に統一
            element.style.transform = 'scale(1.02)';
            break;
        case 'current':
            element.style.background = '#1f2937'; // 改善前は黒系に統一
            element.style.transform = 'scale(1.02)';
            break;
        case 'both':
            element.style.background = '#6366f1';
            element.style.transform = 'scale(1.02)';
            break;
        case 'monitor':
            element.style.background = '#374151'; // 監視作業：黒系に統一
            element.style.transform = 'scale(1.02)';
            break;
        case 'wait':
            element.style.background = '#4b5563'; // 手待ち作業：黒系に統一
            element.style.transform = 'scale(1.02)';
            break;
        case 'insert':
            element.style.background = '#f97316'; // 項目追加：オレンジ系
            element.style.transform = 'scale(1.02)';
            break;
        case 'frequency':
            element.style.background = '#8b5cf6'; // 頻度作業：パープル系
            element.style.transform = 'scale(1.02)';
            break;
        case 'schedule':
            element.style.background = '#2563eb'; // 稼働時間：青系
            element.style.transform = 'scale(1.02)';
            break;
    }
    
    setTimeout(() => {
        element.style.transform = originalTransform;
        element.style.background = originalBackground;
    }, 180);
}

/**
 * 進捗インジケーター表示（ビジネス用最適化デザイン）
 * @param {string} message - 表示メッセージ
 * @param {boolean} show - 表示/非表示
 */
function showProgressIndicator(message, show = true) {
    let indicator = document.getElementById('progressIndicator');
    
    if (!indicator && show) {
        indicator = document.createElement('div');
        indicator.id = 'progressIndicator';
        indicator.className = 'progress-indicator';
        indicator.innerHTML = `
            <div class="progress-content">
                <div class="progress-spinner"></div>
                <span class="progress-message">${message}</span>
            </div>
        `;
        document.body.appendChild(indicator);
        
        // スタイルを動的に追加（ビジネス用最適化デザイン）
        if (!document.getElementById('progressIndicatorStyles')) {
            const style = document.createElement('style');
            style.id = 'progressIndicatorStyles';
            style.textContent = `
                .progress-indicator {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 3000;
                    backdrop-filter: blur(3px);
                }
                .progress-content {
                    background: white;
                    padding: 16px 24px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                    border: 1px solid #e2e8f0;
                }
                .progress-spinner {
                    width: 18px;
                    height: 18px;
                    border: 2px solid #e2e8f0;
                    border-top: 2px solid #2563eb;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                .progress-message {
                    font-weight: 500;
                    color: #0f172a;
                    font-size: 13px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
    } else if (indicator && !show) {
        indicator.remove();
    } else if (indicator && show) {
        indicator.querySelector('.progress-message').textContent = message;
    }
}

/**
 * 通知バナー表示（ビジネス用最適化デザイン）
 * @param {string} message - 通知メッセージ
 * @param {string} type - 通知タイプ（success, error, warning, info）
 * @param {number} duration - 表示時間（ミリ秒）
 */
function showNotificationBanner(message, type = 'info', duration = 2500) {
    const banner = document.createElement('div');
    banner.className = `notification-banner notification-${type}`;
    banner.innerHTML = `
        <div class="notification-content">
            <i class="notification-icon fas ${getNotificationIcon(type)}"></i>
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // スタイルを動的に追加
    if (!document.getElementById('notificationBannerStyles')) {
        const style = document.createElement('style');
        style.id = 'notificationBannerStyles';
        style.textContent = `
            .notification-banner {
                position: fixed;
                bottom: 16px; 
                left: 16px;   
                min-width: 260px;
                max-width: 360px;
                padding: 10px 14px;
                border-radius: 5px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 2500;
                animation: notificationSlideIn 0.3s ease-out;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .notification-success {
                background: #059669;
                color: white;
            }
            .notification-error {
                background: #dc2626;
                color: white;
            }
            .notification-warning {
                background: #d97706;
                color: white;
            }
            .notification-info {
                background: #2563eb;
                color: white;
            }
            .notification-content {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .notification-icon {
                font-size: 14px;
                flex-shrink: 0;
            }
            .notification-message {
                flex: 1;
                font-weight: 500;
                font-size: 12px;
                line-height: 1.4;
            }
            .notification-close {
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                padding: 2px;
                border-radius: 3px;
                transition: background-color 0.2s;
                flex-shrink: 0;
            }
            .notification-close:hover {
                background-color: rgba(255, 255, 255, 0.2);
            }
            @keyframes notificationSlideIn {
                from {
                    transform: translateY(100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(banner);
    
    // 自動削除
    if (duration > 0) {
        setTimeout(() => {
            if (banner.parentNode) {
                banner.style.animation = 'notificationSlideIn 0.3s ease-out reverse';
                setTimeout(() => banner.remove(), 300);
            }
        }, duration);
    }
}

/**
 * 通知タイプに応じたアイコンを取得
 * @param {string} type - 通知タイプ
 * @returns {string} - Font Awesomeアイコンクラス
 */
function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'info': return 'fa-info-circle';
        default: return 'fa-info-circle';
    }
}

// ========================================
// Enhanced Frequency Work UI Management (頻度作業UI管理強化版)
// ========================================

/**
 * 頻度作業ボタンの状態更新
 */
function updateFrequencyWorkButtons() {
    const addBtn = document.getElementById('addFrequencyWorkBtn');
    const clearBtn = document.getElementById('clearFrequencyWorkBtn');
    
    if (clearBtn) {
        // 頻度作業が存在する場合のみクリアボタンを有効化
        if (frequencyWorkItems && frequencyWorkItems.length > 0) {
            clearBtn.disabled = false;
            clearBtn.style.opacity = '1';
        } else {
            clearBtn.disabled = true;
            clearBtn.style.opacity = '0.5';
        }
    }
    
    if (addBtn) {
        // 追加ボタンは常に有効
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
    }
}

/**
 * 頻度作業統計の表示更新（新規）
 */
function updateFrequencyWorkStatistics() {
    const statsElement = document.getElementById('frequencyWorkStats');
    if (!statsElement) return;
    
    if (!frequencyWorkItems || frequencyWorkItems.length === 0) {
        statsElement.textContent = '頻度作業なし';
        statsElement.style.color = '#64748b';
        return;
    }
    
    const totalTime = frequencyWorkItems.reduce((sum, item) => sum + item.workTime, 0);
    const avgTime = totalTime / frequencyWorkItems.length;
    
    statsElement.innerHTML = `
        <span class="frequency-count">${frequencyWorkItems.length}項目</span>
        <span class="frequency-total">合計:${formatTimeDisplay(totalTime)}</span>
        <span class="frequency-average">平均:${formatTimeDisplay(Math.round(avgTime))}</span>
    `;
    statsElement.style.color = '#374151';
}

// ========================================
// Context Menu (Right Click Menu)
// ========================================

/**
 * コンテキストメニューを表示する
 * @param {number} pageX - マウスX座標
 * @param {number} pageY - マウスY座標
 * @param {number} rowIndex - 右クリックされた行インデックス（-1は空の場所）
 * @param {Array} displayItems - 表示中のアイテム配列
 */
function showChartContextMenu(pageX, pageY, rowIndex, displayItems) {
    const menu = document.getElementById('chartContextMenu');
    if (!menu) return;

    menu.innerHTML = '';
    
    const isMultipleSelected = typeof selectedRowIndices !== 'undefined' && selectedRowIndices.length > 1;
    let html = '';

    if (rowIndex === -1 && !isMultipleSelected) {
        // 空の場所をクリック
        html += `
            <div class="context-menu-item" onclick="openWorkModal(null)">
                <i class="fas fa-plus text-primary"></i>
                <span>新規作業を追加</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="manageWorkOrder(displayMode === 'improved' ? 'improved' : 'current')">
                <i class="fas fa-sort-amount-down"></i>
                <span>並び替え・まとめ管理を開く</span>
            </div>
        `;
    } else if (isMultipleSelected) {
        // 複数選択時
        html += `
            <div class="context-menu-item" onclick="groupSelectedFromChart()">
                <i class="fas fa-folder-plus" style="color: #2563eb;"></i>
                <span style="font-weight: 700; color: #2563eb;">選択項目をまとめる</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="clearChartSelection()">
                <i class="fas fa-times-circle"></i>
                <span>選択を解除</span>
            </div>
        `;
    } else {
        // 単一選択時
        const item = displayItems[rowIndex];
        const isGroup = item.isGroup;
        const isGroupHeader = item.isGroupHeader;

        const idArg = typeof item.id === 'string' ? `'${item.id}'` : item.id;

        if (isGroup) {
            html += `
                <div class="context-menu-item" onclick="toggleGroupFromChart(${idArg})">
                    <i class="fas fa-folder-open"></i>
                    <span>まとめを展開</span>
                </div>
                <div class="context-menu-item" onclick="ungroupFromChart(${idArg})">
                    <i class="fas fa-folder-minus"></i>
                    <span>まとめを解除</span>
                </div>
            `;
        } else if (isGroupHeader) {
            html += `
                <div class="context-menu-item" onclick="toggleGroupFromChart(${idArg})">
                    <i class="fas fa-folder"></i>
                    <span>まとめを折り畳む</span>
                </div>
            `;
        } else {
            html += `
                <div class="context-menu-item" onclick="openWorkModal(${idArg})">
                    <i class="fas fa-pen"></i>
                    <span>編集</span>
                </div>
                <div class="context-menu-item" onclick="duplicateWorkItem(${idArg})">
                    <i class="fas fa-copy"></i>
                    <span>複製</span>
                </div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="openWorkModal(null, ${rowIndex})">
                    <i class="fas fa-arrow-up"></i>
                    <span>上に挿入</span>
                </div>
                <div class="context-menu-item" onclick="openWorkModal(null, ${rowIndex + 1})">
                    <i class="fas fa-arrow-down"></i>
                    <span>下に挿入</span>
                </div>
            `;
        }

        if (!isGroup && !isGroupHeader) {
            html += `
                <div class="context-menu-separator"></div>
                <div class="context-menu-item danger" onclick="deleteWorkItemDirectly(${idArg})">
                    <i class="fas fa-trash"></i>
                    <span>削除</span>
                </div>
            `;
        }
        
        // 操作ヒントの追加
        if (!isGroup && !isGroupHeader) {
            html += `
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" style="pointer-events: none; opacity: 0.7; cursor: default; background: transparent; display: flex; align-items: flex-start;">
                    <i class="fas fa-info-circle" style="margin-top: 2px;"></i>
                    <span style="font-size: 10px; line-height: 1.4; color: var(--text-muted);">
                        💡 Shift+クリックで複数選択し、<br>右クリックで「まとめる」ことができます
                    </span>
                </div>
            `;
        }
    }

    menu.innerHTML = html;
    menu.style.display = 'block';

    // 画面外にはみ出ないように位置を調整
    const rect = menu.getBoundingClientRect();
    let x = pageX;
    let y = pageY;

    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - 10;
    }
    if (y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - 10;
    }

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

/**
 * コンテキストメニューを閉じる
 */
function closeChartContextMenu() {
    const menu = document.getElementById('chartContextMenu');
    if (menu) menu.style.display = 'none';
}

/**
 * 画面外クリックでメニューを閉じるリスナー
 */
document.addEventListener('click', function(event) {
    if (event.button !== 2) { // 右クリック以外
        closeChartContextMenu();
    }
});

// ESCキーでメニューと選択をクリア
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeChartContextMenu();
        clearChartSelection();
    }
});

/**
 * 選択をクリアする
 */
function clearChartSelection() {
    if (typeof selectedRowIndices !== 'undefined') {
        selectedRowIndices = [];
        lastSelectedRowIndex = -1;
        updateChart();
    }
}

/**
 * チャート上から直接アイテムを複製
 */
function duplicateWorkItem(id) {
    closeChartContextMenu();
    const target = workItems.find(w => String(w.id) === String(id));
    if (!target) return;

    const newId = Date.now();
    const duplicate = JSON.parse(JSON.stringify(target));
    duplicate.id = newId;
    duplicate.name = duplicate.name + ' (コピー)';

    workItems.push(duplicate);

    // 現在表示されているモードの配列に挿入
    const scope = target.targetScope || 'common';
    let targetArr = (displayMode === 'improved') ? improvedWorkOrder : currentWorkOrder;
    const index = targetArr.indexOf(id);
    if (index !== -1) {
        targetArr.splice(index + 1, 0, newId);
    } else {
        targetArr.push(newId);
    }
    
    // 対象区分が共通ならもう一方の配列にも同じように挿入
    if (scope === 'common') {
        const otherArr = (displayMode === 'improved') ? currentWorkOrder : improvedWorkOrder;
        const otherIndex = otherArr.indexOf(id);
        if (otherIndex !== -1) {
            otherArr.splice(otherIndex + 1, 0, newId);
        } else {
            otherArr.push(newId);
        }
    }

    clearChartSelection();
    updateChart();
    triggerAutoSave();
    showNotificationBanner('作業項目を複製しました。', 'success', 2000);
}

/**
 * チャート上から直接削除
 */
function deleteWorkItemDirectly(id) {
    closeChartContextMenu();
    const work = workItems.find(item => String(item.id) === String(id));
    if (!work) return;

    if (confirm(`「${work.name}」を削除しますか？\n\nこの操作は取り消せません。`)) {
        workItems = workItems.filter(item => String(item.id) !== String(id));
        currentWorkOrder = currentWorkOrder.filter(wId => String(wId) !== String(id));
        improvedWorkOrder = improvedWorkOrder.filter(wId => String(wId) !== String(id));
        
        clearChartSelection();
        updateChart();
        triggerAutoSave();
        showNotificationBanner('作業項目を削除しました。', 'success', 2000);
    }
}

/**
 * グループの展開/折り畳みトグル
 */
function toggleGroupFromChart(groupId) {
    closeChartContextMenu();
    const groups = displayMode === 'improved' ? improvedWorkGroups : currentWorkGroups;
    const group = groups.find(g => String(g.id) === String(groupId));
    if (group) {
        group.collapsed = !group.collapsed;
        updateChart();
        triggerAutoSave();
    }
}

/**
 * グループ（まとめ）解除
 */
function ungroupFromChart(groupId) {
    closeChartContextMenu();
    const groups = displayMode === 'improved' ? improvedWorkGroups : currentWorkGroups;
    const idx = groups.findIndex(g => String(g.id) === String(groupId));
    if (idx !== -1) {
        groups.splice(idx, 1);
        clearChartSelection();
        updateChart();
        triggerAutoSave();
        showNotificationBanner('まとめを解除しました。', 'info', 2000);
    }
}

/**
 * チャート上で複数選択された項目からグループ（まとめ）を作成
 */
function groupSelectedFromChart() {
    closeChartContextMenu();
    if (!selectedRowIndices || selectedRowIndices.length < 2) return;

    if (displayMode === 'both') {
        showNotificationBanner('併記モードではまとめ機能を使用できません。改善前または改善後モードで操作してください。', 'warning');
        return;
    }

    const displayItems = getDisplayWorkItems();
    
    // 選択されたインデックスをソート
    const sortedIndices = [...selectedRowIndices].sort((a, b) => a - b);
    
    // 連続しているかチェック
    let isContinuous = true;
    for (let i = 0; i < sortedIndices.length - 1; i++) {
        if (sortedIndices[i + 1] - sortedIndices[i] !== 1) {
            isContinuous = false;
            break;
        }
    }

    if (!isContinuous) {
        showNotificationBanner('まとめる項目は連続している必要があります。\nShiftキーを使って連続選択してください。', 'warning');
        return;
    }

    // 既にグループが含まれていないかチェック
    const selectedItems = sortedIndices.map(idx => displayItems[idx]);
    const hasGroup = selectedItems.some(item => item.isGroup || item.isGroupHeader || item.inGroup);
    if (hasGroup) {
        showNotificationBanner('すでにまとめられている項目を含めることはできません。', 'warning');
        return;
    }

    // グループ名を入力
    const groupName = prompt('まとめの表示名を入力してください:', '新しいまとめ');
    if (!groupName) return;

    // 実際のIDリストを取得
    const itemIds = selectedItems.map(item => item.id);

    const newGroup = {
        id: 'group_' + Date.now(),
        name: groupName,
        itemIds: itemIds,
        collapsed: true
    };

    // 現在表示されているモードにのみ追加するか、両方に追加するか
    if (displayMode === 'improved' || displayMode === 'both') {
        improvedWorkGroups.push(newGroup);
    }
    if (displayMode === 'current' || displayMode === 'both') {
        currentWorkGroups.push(newGroup);
    }

    clearChartSelection();
    updateChart();
    triggerAutoSave();
    showNotificationBanner('項目をまとめました。', 'success', 2000);
}

// ========================================
// Enhanced Interaction Helpers (Business Optimized)
// ========================================

/**
 * キャンバス領域のダイナミックリサイズ（Welcome画面移行対応強化版）
*/
function handleCanvasResize() {
    const canvasContainer = document.getElementById('canvasContainer');
    const canvas = document.getElementById('ganttCanvas');
    
    if (!canvasContainer || !canvas) return;
    
    try {
        // Welcome画面からの移行直後かどうかを判定
        const isFromWelcomeTransition = !document.getElementById('welcomeScreen') && 
                                       Date.now() - (window._lastWelcomeHideTime || 0) < 5000;
        
        const containerRect = canvasContainer.getBoundingClientRect();
        
        // Welcome画面移行時は特別な確認を実行
        if (isFromWelcomeTransition && (containerRect.width <= 0 || containerRect.height <= 0)) {
            console.warn('Container dimensions not ready during welcome transition, forcing refresh...');
            
            // DOM要素を強制的にリフレッシュ
            canvasContainer.style.display = 'none';
            canvasContainer.offsetHeight; // 強制的にレンダリングを実行
            canvasContainer.style.display = '';
            
            // 再度サイズを取得
            const refreshedRect = canvasContainer.getBoundingClientRect();
        }
        
        // 最終的なコンテナサイズを取得
        // chartsScrollWrapper（外側スクロールラッパー）を基準にすることで
        // updateChart()と同じ参照元を使い、幅計算を一貫させる
        const scrollWrapper = document.getElementById('chartsScrollWrapper');
        const referenceEl = scrollWrapper || canvasContainer;
        const finalRect = referenceEl.getBoundingClientRect();
        const newWidth = Math.max(1150, finalRect.width - 35);
        
        // 現在のdevicePixelRatioを取得（モニター間移動対応）
        const devicePixelRatio = window.devicePixelRatio || 1;
        const currentDisplayWidth = canvas.width / devicePixelRatio;
        
        // 幅の変更またはdevicePixelRatioの変更を検知
        const widthChanged = Math.abs(newWidth - (window.canvasWidth || currentDisplayWidth)) > 50;
        const dprChanged = Math.abs(devicePixelRatio - (canvas._lastDevicePixelRatio || devicePixelRatio)) > 0.1;
        
        // Welcome画面移行時は強制的にリサイズを実行
        const forceResize = isFromWelcomeTransition && Math.abs(currentDisplayWidth - newWidth) > 10;
        
        if (widthChanged || dprChanged || forceResize) {
            
            // グローバル変数を更新
            window.canvasWidth = newWidth;
            
            // devicePixelRatioを記録
            canvas._lastDevicePixelRatio = devicePixelRatio;
            
            // 高解像度対応でキャンバス更新（強制的にスケール再設定）
            if (typeof setupHighDPICanvas === 'function') {
                setupHighDPICanvas(canvas, ctx, window.canvasWidth, window.canvasHeight);
            }
            
            // スケール計算を強制的にリセット
            if (typeof calculateUnifiedScale === 'function') {
                const scaleInfo = calculateUnifiedScale();
            }
            
            // チャート更新（確実に実行）
            requestAnimationFrame(() => {
                if (typeof updateChart === 'function') {
                    updateChart();
                    // ★修正: 頻度作業チャートをメインと同一 rAF フレームで更新。
                    //   旧: setTimeout(..., 50) で50ms遅延 → updateChart()による canvasWidth
                    //       確定とのタイミングが非同期になりスケールズレが発生していた。
                    //   新: updateChart() の直後（canvasWidth確定済み）で同期実行するため
                    //       adjustFrequencyChartSize() の setTimeout/rAF 二重非同期も不要。
                }
                
                // 頻度作業チャートのリサイズ＋再描画（canvasWidth確定後の同一フレームで実行）
                if (typeof adjustFrequencyChartSize === 'function') {
                    adjustFrequencyChartSize();
                }
                // updateChart() 内の同期更新で既に描画済みだが、
                // adjustFrequencyChartSize() がサイズ変更を検知した場合の二重チェックとして残す
                // （updateFrequencyChart 内で isFrequencyCanvasReady チェック不要になったので安全）
                if (typeof updateFrequencyChart === 'function') {
                    updateFrequencyChart();
                }
                
                // 工程確認チャートも同時にリサイズ
                if (window.showProcessChart) {
                    setTimeout(() => {
                        if (typeof forceProcessChartSizeSync === 'function') {
                            forceProcessChartSizeSync();
                        }
                        if (typeof updateProcessChart === 'function') {
                            updateProcessChart();
                        }
                    }, 100);
                }
                
                // Welcome画面移行の完了を記録
                if (isFromWelcomeTransition) {
                    window._welcomeTransitionCompleted = true;
                }
            });
        }
        
    } catch (error) {
        console.error('Error in handleCanvasResize:', error);
    }
}

/**
 * 作業配分表キャンバスのリサイズ（高解像度対応版・完全修正）
 */
function handleDistributionCanvasResize() {
    const distributionCanvasContainer = document.getElementById('distributionCanvasContainer');
    const distributionCanvas = document.getElementById('distributionCanvas');
    
    if (!distributionCanvasContainer || !distributionCanvas) return;
    
    try {
        if (typeof adjustDistributionCanvasWidth === 'function') {
            adjustDistributionCanvasWidth();
        } else {
            const containerRect = distributionCanvasContainer.getBoundingClientRect();
            const newWidth = Math.max(950, containerRect.width - 35);
            const newHeight = Math.max(360, containerRect.height - 35);
            
            const devicePixelRatio = window.devicePixelRatio || 1;
            const currentDisplayWidth = distributionCanvas.width / devicePixelRatio;
            const currentDisplayHeight = distributionCanvas.height / devicePixelRatio;
            
            const widthChanged = Math.abs(newWidth - distributionCanvasWidth) > 50;
            const heightChanged = Math.abs(newHeight - distributionCanvasHeight) > 50;
            const dprChanged = Math.abs(devicePixelRatio - (distributionCanvas._lastDevicePixelRatio || devicePixelRatio)) > 0.1;
            
            if (widthChanged || heightChanged || dprChanged) {
                distributionCanvasWidth = newWidth;
                distributionCanvasHeight = newHeight;
                distributionCanvas._lastDevicePixelRatio = devicePixelRatio;
                setupHighDPICanvas(distributionCanvas, distributionCtx, distributionCanvasWidth, distributionCanvasHeight);
            }
        }
        
        requestAnimationFrame(() => {
            if (typeof updateDistributionChart === 'function') {
                updateDistributionChart();
            }
        });
    } catch (error) {
        console.error('Error in handleDistributionCanvasResize:', error);
    }
}

/**
 * 稼働時間キャンバスのリサイズ
 */
function handleScheduleCanvasResize() {
    const scheduleCanvasContainer = document.getElementById('scheduleCanvasContainer');
    const scheduleCanvas = document.getElementById('scheduleCanvas');

    if (!scheduleCanvasContainer || !scheduleCanvas) return;

    try {
        const containerRect = scheduleCanvasContainer.getBoundingClientRect();
        
        // 現在のdevicePixelRatioを取得（モニター間移動対応）
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // コンテナの実際の表示幅から、左右のマージンを考慮して新しい幅を計算
        const containerPadding = 20; // コンテナの左右パディング合計
        const safetyMargin = 10; // 追加の安全マージン
        const newWidth = Math.max(600, containerRect.width - containerPadding - safetyMargin);
        
        // 現在の表示幅と比較して変更が必要かチェック
        const currentDisplayWidth = scheduleCanvas.width / devicePixelRatio;
        const currentDisplayHeight = scheduleCanvas.height / devicePixelRatio;
        
        // サイズの変更またはdevicePixelRatioの変更を検知
        const widthChanged = Math.abs(newWidth - currentDisplayWidth) > 1;
        const dprChanged = Math.abs(devicePixelRatio - (scheduleCanvas._lastDevicePixelRatio || devicePixelRatio)) > 0.1;
        
        if (widthChanged || dprChanged) {
            
            // グローバル変数を更新
            scheduleCanvasWidth = newWidth;
            
            // devicePixelRatioを記録
            scheduleCanvas._lastDevicePixelRatio = devicePixelRatio;
            
            // 高解像度対応でキャンバス更新（強制的にスケール再設定）
            setupHighDPICanvas(scheduleCanvas, scheduleCtx, scheduleCanvasWidth, scheduleCanvasHeight);
            
            // チャート更新（確実に実行）
            requestAnimationFrame(() => {
                if (typeof updateScheduleChart === 'function') {
                    updateScheduleChart();
                }
            });
        }
        
    } catch (error) {
        console.error('Error in handleScheduleCanvasResize:', error);
    }
}

// ========================================
// Auto-save Status Indicator (Business Optimized)
// ========================================

/**
 * オートセーブ状態インジケーターの表示
 * @param {string} status - 状態（'saving', 'saved', 'error'）
 */
function showAutoSaveStatus(status) {
    let indicator = document.getElementById('autoSaveIndicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'autoSaveIndicator';
        indicator.className = 'auto-save-indicator';
        document.body.appendChild(indicator);
        
        // スタイルを動的に追加
        if (!document.getElementById('autoSaveStyles')) {
            const style = document.createElement('style');
            style.id = 'autoSaveStyles';
            style.textContent = `
                .auto-save-indicator {
                    position: fixed;
                    bottom: 16px;
                    right: 16px;
                    padding: 5px 10px;
                    border-radius: 14px;
                    font-size: 10px;
                    font-weight: 500;
                    z-index: 1000;
                    transition: all 0.3s ease;
                    pointer-events: none;
                }
                .auto-save-saving {
                    background: #2563eb;
                    color: white;
                }
                .auto-save-saved {
                    background: #059669;
                    color: white;
                }
                .auto-save-error {
                    background: #dc2626;
                    color: white;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // 状態に応じた表示
    indicator.className = `auto-save-indicator auto-save-${status}`;
    
    switch (status) {
        case 'saving':
            indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
            indicator.style.opacity = '1';
            break;
        case 'saved':
            indicator.innerHTML = '<i class="fas fa-check"></i> 保存済み';
            indicator.style.opacity = '1';
            setTimeout(() => {
                indicator.style.opacity = '0';
            }, 1200);
            break;
        case 'error':
            indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 保存エラー';
            indicator.style.opacity = '1';
            setTimeout(() => {
                indicator.style.opacity = '0';
            }, 2000);
            break;
    }
}

// ========================================
// Data Selection UI Helpers (Business Optimized)
// ========================================

/**
 * データ選択変更時のフィードバック
 * @param {string} dataId - データID
 * @param {boolean} isSelected - 選択状態
 */
function showDataSelectionFeedback(dataId, isSelected) {
    const dataItem = dataList.find(data => data.id === dataId);
    if (!dataItem) return;
    
    const action = isSelected ? '選択' : '選択解除';
    const type = isSelected ? 'success' : 'info';
    
    showNotificationBanner(
        `「${dataItem.name}」を${action}しました。`,
        type,
        1500
    );
    
    // 作業配分表の更新
    if (currentMainTab === 'distribution') {
        setTimeout(() => {
            updateDistributionChart();
        }, 100);
    }
}

// ========================================
// Event Listeners for Enhanced UI (Business Optimized)
// ========================================

// ウィンドウリサイズ対応を修正（工程確認チャート安定化）
window.addEventListener('resize', debounce(() => {
    if (currentMainTab === 'gantt') {
        handleCanvasResize();
        if (showProcessChart) {
            handleProcessCanvasResize();
        }
    } else if (currentMainTab === 'distribution') {
        handleDistributionCanvasResize();
    } else if (currentMainTab === 'schedule') {
        handleScheduleCanvasResize();
    }
    adjustResponsiveUI();
}, 200));

// ========================================
// Accessibility Enhancements (Business Optimized)
// ========================================



/**
 * ARIAラベルの動的更新
 */
function updateAriaLabels() {
    if (currentMainTab === 'gantt') {
        updateGanttAriaLabels();
    } else if (currentMainTab === 'distribution') {
        updateDistributionAriaLabels();
    } else if (currentMainTab === 'schedule') {
        updateScheduleAriaLabels();
    }
}

/**
 * ガントチャート用ARIAラベル更新
 */
function updateGanttAriaLabels() {
    const displayItems = getDisplayWorkItems();
    
    // 表示モードに応じたARIAラベル
    const canvas = document.getElementById('ganttCanvas');
    if (canvas) {
        let ariaLabel = `標準作業組み合わせ票、${displayItems.length}個の作業項目、`;
        if (displayMode === 'current') {
            ariaLabel += '改善前表示';
        } else if (displayMode === 'improved') {
            ariaLabel += '改善後表示';
        } else {
            ariaLabel += '併記表示';
        }
        
        // 頻度作業の情報も追加
        if (frequencyWorkItems && frequencyWorkItems.length > 0) {
            ariaLabel += `、${frequencyWorkItems.length}個の頻度作業`;
        }
        
        canvas.setAttribute('aria-label', ariaLabel);
    }
    
    // ボタンのARIAラベル更新
    const modeButtons = document.querySelectorAll('.mode-button');
    modeButtons.forEach(btn => {
        if (btn.classList.contains('active')) {
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.setAttribute('aria-pressed', 'false');
        }
    });
}

/**
 * 作業配分表用ARIAラベル更新
 */
function updateDistributionAriaLabels() {
    const canvas = document.getElementById('distributionCanvas');
    if (canvas) {
        const ariaLabel = `作業配分表、${selectedDataIds.length}件のデータを選択中`;
        canvas.setAttribute('aria-label', ariaLabel);
    }
    
    // データ選択チェックボックスのARIAラベル更新
    const checkboxes = document.querySelectorAll('.data-selection-checkbox');
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            checkbox.setAttribute('aria-pressed', 'true');
        } else {
            checkbox.setAttribute('aria-pressed', 'false');
        }
    });
}

/**
 * 稼働時間用ARIAラベル更新
 */
function updateScheduleAriaLabels() {
    const canvas = document.getElementById('scheduleCanvas');
    if (canvas) {
        const timeSlotsCount = timeSlots ? timeSlots.length : 0;
        const ariaLabel = `稼働時間チャート、${timeSlotsCount}個の時間帯を表示中`;
        canvas.setAttribute('aria-label', ariaLabel);
    }
    
    // 稼働時間カードのARIAラベル更新
    const workingTimeCard = document.getElementById('workingTimeCard');
    if (workingTimeCard) {
        const value = workingTimeCard.querySelector('.card-value').textContent;
        workingTimeCard.setAttribute('aria-label', `実稼働時間 ${value}`);
    }
}

// ========================================
// Performance Optimization (Business Optimized)
// ========================================

/**
 * レンダリングの最適化（頻度作業チャート対応）
 */
function optimizeChartRendering() {
    // requestAnimationFrameを使用してレンダリングを最適化
    let isRenderingScheduled = false;
    
    function scheduleRender(updateFunction) {
        if (!isRenderingScheduled) {
            isRenderingScheduled = true;
            requestAnimationFrame(() => {
                updateFunction();
                isRenderingScheduled = false;
            });
        }
    }
    
    // 元の更新関数をラップ
    if (typeof updateChart === 'function') {
        const originalUpdateChart = updateChart;
        window.updateChart = function() {
            scheduleRender(originalUpdateChart);
        };
    }
    
    if (typeof updateFrequencyChart === 'function') {
        const originalUpdateFrequencyChart = updateFrequencyChart;
        window.updateFrequencyChart = function() {
            scheduleRender(originalUpdateFrequencyChart);
        };
    }
}

// ========================================
// Enhanced Mouse Event Handling (Business Optimized)
// ========================================

/**
 * マウスイベントのパフォーマンス最適化
 */
let mouseEventThrottled = false;

// 初期表示時のレスポンシブ調整を修正
window.addEventListener('load', function() {
    setTimeout(() => {
        if (currentMainTab === 'gantt') {
            handleCanvasResize();
            handleProcessCanvasResize(); // 新規追加
        } else if (currentMainTab === 'distribution') {
            handleDistributionCanvasResize();
        } else if (currentMainTab === 'schedule') {
            handleScheduleCanvasResize();
        }
        adjustResponsiveUI();
        updateFrequencyChartVisibility();
    }, 100);
});

// データ選択の変更を監視
const originalToggleDataSelection = window.toggleDataSelection;
if (originalToggleDataSelection) {
    window.toggleDataSelection = function(dataId) {
        const wasSelected = selectedDataIds.includes(dataId);
        originalToggleDataSelection.call(this, dataId);
        const isSelected = selectedDataIds.includes(dataId);
        
        // フィードバック表示
        if (wasSelected !== isSelected) {
            showDataSelectionFeedback(dataId, isSelected);
        }
    };
}

// ========================================
// Enhanced Data Management UI Functions
// ========================================

/**
 * データカテゴリの展開/折りたたみを切り替える
 * @param {HTMLElement} header - クリックされたヘッダー要素
 */
function toggleDataCategory(header) {
    const content = header.nextElementSibling; // .category-content

    header.classList.toggle('active');
    content.classList.toggle('active');

    if (content.classList.contains('active')) {
        // 開くとき: 十分に大きな max-height を設定する。
        content.style.maxHeight = '3000px';

        // ── フラッシュ誘導 ─────────────────────────────────────────
        // 認知心理学（注意誘導 + 空間的マッピング + 変化検出）:
        //   展開と同時に操作対象を視覚的に明示し「どこが動くか」を直感把握させる。
        //
        //   ①親セクション展開 → キャンバス全体にインジゴオーバーレイ（全体告知）
        //   ②子アイテム展開  → キャンバスにアンバーオーバーレイ（局所告知）
        //                    + ヘッダーテキスト自体が太字+アンバーで2回点滅
        //                      ※テキスト自体の変化が「この文字が対象」を直接示す
        const section = header.closest('.data-category');
        if (section) {
            if (section.id === 'textPositionAdjustmentSection') {
                // ① 親セクション展開: キャンバスインジゴフラッシュ
                flashTextPositionIndicator('parent');
            } else if (section.closest('#textPositionPanelContainer')) {
                // ② 子アイテム展開: キャンバスアンバー + ヘッダーテキスト点滅
                const itemLabel = header.querySelector('span')?.textContent?.trim() || '';
                flashTextPositionIndicator('sub', itemLabel);
                flashTextPosHeaderText(header);
            }
        }

    } else {
        // 閉じる時：高さを0に戻す
        content.style.maxHeight = '0px';
    }

    // 状態保存をトリガー
    if (typeof debouncedSaveState === 'function') {
        debouncedSaveState();
    } else if (typeof saveDataManagementState === 'function') {
        saveDataManagementState();
    }

    // フィードバック効果
    // ※ showFeedbackAnimation（scale変形）はヒット領域をズラしてダブルクリック誤動作を
    //   引き起こすため意図的に呼ばない。CSSトランジションのみで状態変化を表現する。
    header.classList.add('accordion-ripple');
    requestAnimationFrame(() => {
        header.addEventListener('animationend', () => {
            header.classList.remove('accordion-ripple');
        }, { once: true });
    });
}

/**
 * 文字位置調整の子アイテムヘッダーのテキストを太字+アンバーで2回点滅させる。
 *
 * 認知心理学（変化検出の原則）:
 *   キャンバス上のどの文字が対象かをユーザーが判断するために、
 *   左パネルのラベルテキスト自体を強調することで
 *   「このラベル = あのチャート上の文字」という対応付けを直感的に伝える。
 *
 * 実装: アニメーションクラスを動的付与 → animationend で自動除去（DOM汚染なし）
 *
 * @param {HTMLElement} header - アコーディオンヘッダー要素
 */
function flashTextPosHeaderText(header) {
    // category-icon 内の span (テキストラベル) を取得
    const textSpan = header.querySelector('.category-icon > span, .category-icon span');
    if (!textSpan) return;

    // 既存アニメーションを一旦リセット（多重展開対策）
    textSpan.classList.remove('text-pos-item-flash-target');
    // reflow をトリガーしてアニメーションを再スタートさせる
    void textSpan.offsetWidth;

    textSpan.classList.add('text-pos-item-flash-target');

    textSpan.addEventListener('animationend', () => {
        textSpan.classList.remove('text-pos-item-flash-target');
    }, { once: true });
}

/**
 * 文字位置調整セクション展開時に、チャートキャンバス上の対象テキストを
 * フラッシュアニメーションで明示する。
 *
 * 認知心理学的根拠:
 *   - 注意誘導（Attention Guidance）: 動きのある視覚刺激は視線を引きつける
 *   - 変化検出（Change Detection）: 点滅・色変化は「どこが操作対象か」を即座に伝える
 *   - 空間的マッピング（Spatial Mapping）: コントロールと対象の位置関係を明確化する
 *
 * @param {'parent'|'sub'} type
 *   'parent': 親セクション展開（インジゴ全体フラッシュ）
 *   'sub'   : 子アイテム展開（アンバー局所フラッシュ）
 * @param {string} [itemLabel] - サブ展開時の項目名（将来の詳細ハイライト拡張用）
 */
function flashTextPositionIndicator(type = 'parent', itemLabel = '') {
    const containers = ['canvasContainer', 'frequencyCanvasContainer', 'processCanvasContainer'];
    const isSub = (type === 'sub');

    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 非表示のコンテナはスキップ
        const style = window.getComputedStyle(container);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        // 既存オーバーレイを全除去（多重展開対策）
        container.querySelectorAll('.text-pos-flash-overlay').forEach(el => el.remove());

        // position が static なら relative に変更（アニメーション後に戻す）
        const originalPosition = container.style.position;
        if (style.position === 'static') {
            container.style.position = 'relative';
        }

        const overlay = document.createElement('div');
        overlay.className = isSub
            ? 'text-pos-flash-overlay flash-sub'
            : 'text-pos-flash-overlay';
        container.appendChild(overlay);

        // アニメーション終了後にクリーンアップ
        overlay.addEventListener('animationend', () => {
            overlay.remove();
            if (originalPosition !== undefined) {
                container.style.position = originalPosition;
            }
        }, { once: true });
    });
}

/**
 * アコーディオンの max-height を再計算して更新する。
 * display:none だった子要素が後から表示された際に呼び出す。
 * @param {HTMLElement} contentEl - .category-content 要素
 */
function refreshAccordionHeight(contentEl) {
    if (contentEl && contentEl.classList.contains('active')) {
        // 既に 3000px を設定しているため再計算は不要だが、
        // 将来 scrollHeight ベースに戻した場合のための安全装置として残す
        contentEl.style.maxHeight = '3000px';
    }
}

/**
 * ボタンインタラクションの強化
 */
function enhanceButtonInteractions() {
    const buttons = document.querySelectorAll('.data-management-section .btn');
    
    buttons.forEach(button => {
        // クリック時のフィードバック効果
        button.addEventListener('click', function(e) {
            // この関数はクリック時のアニメーション等のために残しておいても良いですが、
            // 現在の実装では特に何もないため、空にしておきます。
            // 将来的にクリックアニメーションを追加する場合はここに記述します。
        });
        
        // ★★★ 修正: mouseenter と mouseleave のイベントリスナーを削除 ★★★
        // これにより、ホバーエフェクトは完全にCSSで制御されます。
    });
}

/**
 * データ管理セクションの状態を保存
 */
function saveDataManagementState() {
    try {
        const state = {};
        const categories = document.querySelectorAll('.data-category');
        
        categories.forEach((category, index) => {
            const header = category.querySelector('.category-header');
            const isActive = header.classList.contains('active');
            state[`category_${index}`] = isActive;
        });
        
        AppStorage.setItem('dataManagementState', JSON.stringify(state));
    } catch (error) {
        console.warn('Failed to save data management state:', error);
    }
}

/**
 * 設定オプション
 */
const dataManagementConfig = {
    autoCollapseOtherCategories: false, // 他カテゴリの自動折りたたみ
    enableUsageTracking: true,          // 使用統計の記録
    saveState: true,                    // 状態の保存/復元
    animationDuration: 100              // アニメーション時間（ms）
};

// ========================================
// 初期化とイベントリスナー
// ========================================

// ページ離脱時の状態保存
window.addEventListener('beforeunload', function() {
    if (dataManagementConfig.saveState) {
        saveDataManagementState();
    }
});

// カテゴリ状態変更時の状態保存（デバウンス）
let saveStateTimeout;
function debouncedSaveState() {
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        if (dataManagementConfig.saveState) {
            saveDataManagementState();
        }
    }, 500);
}

/**
 * スケールボタンの状態更新
 */
function updateScaleUI() {
    const slider = document.getElementById('scaleSlider');
    const scaleValueDisplay = document.getElementById('scaleValueDisplay');
    const manualScaleGroup = document.getElementById('manualScaleGroup');
    const mainScaleBtn = document.getElementById('mainScaleBtn');
    const frequencyScaleBtn = document.getElementById('frequencyScaleBtn');
    
    if (!slider || !scaleValueDisplay || !manualScaleGroup || !mainScaleBtn || !frequencyScaleBtn) return;
    
    // スライダーの最大値と最小値を更新
    const scaleInfo = calculateUnifiedScale();
    const sliderMax = Math.ceil(scaleInfo.sliderMax);
    const sliderMin = Math.max(10, Math.ceil(taktTime * 0.1));

    if (slider.max != sliderMax) slider.max = sliderMax;
    if (slider.min != sliderMin) slider.min = sliderMin;
    
    // UIの状態をリセット
    manualScaleGroup.classList.remove('active');
    mainScaleBtn.classList.remove('active');
    frequencyScaleBtn.classList.remove('active');

    // 現在のモードに応じてUIを更新
    switch (chartScaleMode) {
        case 'main':
            mainScaleBtn.classList.add('active');
            slider.value = manualScaleValue;
            scaleValueDisplay.textContent = formatTimeDisplay(Math.round(manualScaleValue));
            break;
        case 'frequency':
            frequencyScaleBtn.classList.add('active');
            slider.value = manualScaleValue;
            scaleValueDisplay.textContent = formatTimeDisplay(Math.round(manualScaleValue));
            break;
        case 'manual':
        default:
            manualScaleGroup.classList.add('active');
            slider.value = manualScaleValue;
            scaleValueDisplay.textContent = formatTimeDisplay(Math.round(manualScaleValue));
            break;
    }
}

/**
 * Welcome画面表示状態をチェック（安全版）
 * ui-manager.jsの関数を強化
 */
function isWelcomeScreenVisible() {
    try {
        const welcomeScreen = document.getElementById('welcomeScreen');
        return welcomeScreen && welcomeScreen.style.display !== 'none' && 
               welcomeScreen.style.display !== '' && 
               welcomeScreen.style.display === 'flex';
    } catch (error) {
        console.warn('Error checking welcome screen visibility:', error);
        return false;
    }
}

/**
 * 頻度作業チャートの表示モードを切り替える（新規・修正版）
 * @param {string} mode - 'actual' または 'converted'
 */
function switchFrequencyChartMode(mode) {
    // グローバル変数が同じなら何もしない
    if (frequencyChartMode === mode) return;

    frequencyChartMode = mode;

    // ボタンのUI状態を更新
    updateFrequencyChartModeButtons();

    // スケールを自動で再計算
    const scaleInfo = calculateUnifiedScale();
    if (chartScaleMode === 'frequency') {
        manualScaleValue = scaleInfo.maxTime;
        updateScaleUI();
    }

    // チャートを再描画
    updateFrequencyChart();
    triggerAutoSave();
}

/**
 * 頻度作業チャートモードボタンの状態を更新
 */
function updateFrequencyChartModeButtons() {
    const actualBtn = document.getElementById('freqActualTimeBtn');
    const convertedBtn = document.getElementById('freqConvertedTimeBtn');

    if (actualBtn && convertedBtn) {
        // 全てのボタンのactiveクラスを一旦削除
        actualBtn.classList.remove('active');
        convertedBtn.classList.remove('active');

        // 現在のモードに応じてactiveクラスを追加
        if (frequencyChartMode === 'actual') {
            actualBtn.classList.add('active');
        } else if (frequencyChartMode === 'converted') {
            convertedBtn.classList.add('active');
        }
    }
}

/**
 * 頻度作業チャート切り替え（修正版：安全なチャート更新）
 */
function toggleFrequencyChart() {
    const checkbox = document.getElementById('showFrequencyChart');
    showFrequencyChart = checkbox.checked;

    updateFrequencyChartVisibility(); // UI表示状態を更新

    if (showFrequencyChart) {
        safeUpdateChart('frequency', () => {
            if (typeof updateFrequencyChart === 'function') {
                updateFrequencyChart();
            }
        });
    }

    triggerAutoSave();
    const status = showFrequencyChart ? '表示' : '非表示';
    showNotificationBanner(`頻度作業チャートを${status}にしました。`, 'info', 1500);
}

/**
 * バラつきデータ表示UIを更新（表示特化・モーダル連携・アコーディオン対応版）
 */
function updateVariabilityEditor() {
    // 修正: コンテナは内側のラッパーを指すように変更
    const wrapper = document.querySelector('#variabilityEditorContent .category-content-wrapper');
    if (!wrapper) {
        // wrapper が見つからない場合は処理を中断
        console.error("Variability editor's content wrapper not found.");
        return;
    }

    let innerHTML = '';

    if (selectedDataIds.length === 0) {
        innerHTML = `<div class="variability-editor-info">グラフで比較したいデータを、右パネル上部の「データ選択」から1つ以上選んでください。</div>`;
    } else {
        let itemListHTML = '<div class="variability-item-list">';
        selectedDataIds.forEach(dataId => {
            const dataItem = dataList.find(d => d.id === dataId);
            if (!dataItem) return;

            const variabilityData = dataItem.data.distributionVariability || {};
            
            const currentMinText = formatTimeDisplay(variabilityData.currentMin || 0);
            const currentMaxText = formatTimeDisplay(variabilityData.currentMax || 0);
            const improvedMinText = formatTimeDisplay(variabilityData.improvedMin || 0);
            const improvedMaxText = formatTimeDisplay(variabilityData.improvedMax || 0);

            itemListHTML += `
                <div class="variability-item display-only" onclick="openVariabilityModal('${dataId}')">
                    <div class="variability-item-name" title="${dataItem.name}">${dataItem.name}</div>
                    <div class="variability-display-row">
                        <span class="variability-display-label current">改善前</span>
                        <span class="variability-display-value current">-${currentMinText} / +${currentMaxText}</span>
                    </div>
                    <div class="variability-display-row">
                        <span class="variability-display-label improved">改善後</span>
                        <span class="variability-display-value improved">-${improvedMinText} / +${improvedMaxText}</span>
                    </div>
                </div>
            `;
        });
        itemListHTML += '</div>';
        innerHTML = itemListHTML;
    }

    // 修正: ラッパーの中身だけを更新
    wrapper.innerHTML = innerHTML;

    // 修正: アコーディオンが開いている場合は、高さを再計算してスムーズに表示
    const parentContent = wrapper.parentElement; // .category-content を取得
    if (parentContent && parentContent.classList.contains('active')) {
        // requestAnimationFrame を使って、DOM更新後の正しい高さを取得
        requestAnimationFrame(() => {
            parentContent.style.maxHeight = wrapper.scrollHeight + 'px';
        });
    }
}

/**
 * バラつき編集モーダルの入力行順序を「上限→下限」に統一する（初回のみ実行・冪等）
 * 認知心理学：上が大きい・下が小さいという空間メタファーに対応し、
 * 直感的な数値入力を実現する（スキーマ一貫性の原則）。
 */
function ensureVariabilityModalRowOrder() {
    ['current', 'improved'].forEach(prefix => {
        const minInput = document.getElementById(`${prefix}_min_h`);
        const maxInput = document.getElementById(`${prefix}_max_h`);
        if (!minInput || !maxInput) return;

        const minRow = minInput.closest('tr');
        const maxRow = maxInput.closest('tr');
        if (!minRow || !maxRow) return;

        const tbody = minRow.parentElement;
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const minIdx = rows.indexOf(minRow);
        const maxIdx = rows.indexOf(maxRow);

        // minRowがmaxRowより前にある（=上限が下にある）場合のみ入れ替え
        if (minIdx < maxIdx) {
            tbody.insertBefore(maxRow, minRow);
        }
    });
}

/**
 * バラつき編集モーダルを開く（オートセーブ・元に戻す対応版）
 * @param {string} dataId - 編集対象のデータID
 */
function openVariabilityModal(dataId) {
    const dataItem = dataList.find(d => d.id === dataId);
    if (!dataItem) return;

    // 元のデータをディープコピーして保存
    originalVariabilityData = JSON.parse(JSON.stringify(dataItem.data.distributionVariability || {}));

    document.getElementById('variabilityModalTitle').textContent = `「${dataItem.name}」のバラつきを編集`;
    document.getElementById('variabilityEditingDataId').value = dataId;

    const variabilityData = dataItem.data.distributionVariability || {};

    // 秒数をh,m,sに分解して各入力欄に設定
    const setHms = (prefix, totalSeconds) => {
        const components = secondsToComponents(Math.abs(totalSeconds || 0));
        document.getElementById(`${prefix}_h`).value = components.hours;
        document.getElementById(`${prefix}_m`).value = components.minutes;
        document.getElementById(`${prefix}_s`).value = components.seconds;
    };
    
    setHms('current_min', variabilityData.currentMin);
    setHms('current_max', variabilityData.currentMax);
    setHms('improved_min', variabilityData.improvedMin);
    setHms('improved_max', variabilityData.improvedMax);

    document.getElementById('variabilityModal').style.display = 'block';

    // 上限を上・下限を下の直感的な順序に統一（初回のみDOM操作・冪等）
    ensureVariabilityModalRowOrder();

    // オートセーブ用のイベントリスナーを設定
    const debouncedSave = debounce(() => saveVariabilityChanges(dataId), 400);
    const formElements = document.querySelectorAll('#variabilityModal .time-component');
    formElements.forEach(el => {
        // 既存のリスナーを削除してから追加（二重登録防止）
        if (el._saveListener) {
            el.removeEventListener('input', el._saveListener);
        }
        el._saveListener = debouncedSave;
        el.addEventListener('input', el._saveListener);
    });
}

/**
 * 特定データのバラつき情報を削除
 */
function deleteVariability() {
    const dataId = document.getElementById('variabilityEditingDataId').value;
    if (!dataId) return;
    const dataItem = dataList.find(d => d.id === dataId);
    if (!dataItem) return;

    if (confirm(`「${dataItem.name}」のバラつき情報を全て削除しますか？\nこの操作は元に戻せません。`)) {
        dataItem.data.distributionVariability = {}; // 空のオブジェクトでリセット
        closeVariabilityModal();
        updateVariabilityEditor();
        updateDistributionChart();
        triggerAutoSave();
        showNotificationBanner(`「${dataItem.name}」のバラつき情報を削除しました。`, 'info', 2000);
    }
}

/**
 * バラつきの変更を元に戻す
 */
function revertVariabilityChanges() {
    const dataId = document.getElementById('variabilityEditingDataId').value;
    if (!dataId || originalVariabilityData === null) return;
    const dataItem = dataList.find(d => d.id === dataId);
    if (!dataItem) return;

    if (confirm('このモーダルを開いた時点の状態に戻しますか？\n現在の変更は失われます。')) {
        // データを元に戻す
        dataItem.data.distributionVariability = JSON.parse(JSON.stringify(originalVariabilityData));

        // モーダル内のフォームを再設定
        const setHms = (prefix, totalSeconds) => {
            const components = secondsToComponents(Math.abs(totalSeconds || 0));
            document.getElementById(`${prefix}_h`).value = components.hours;
            document.getElementById(`${prefix}_m`).value = components.minutes;
            document.getElementById(`${prefix}_s`).value = components.seconds;
        };
        
        setHms('current_min', originalVariabilityData.currentMin);
        setHms('current_max', originalVariabilityData.currentMax);
        setHms('improved_min', originalVariabilityData.improvedMin);
        setHms('improved_max', originalVariabilityData.improvedMax);

        // UIを更新
        updateVariabilityEditor();
        updateDistributionChart();
        triggerAutoSave();
        showNotificationBanner('変更を元に戻しました。', 'info', 2000);
    }
}

/**
 * バラつきデータを保存（オートセーブ用）
 * @param {string} dataId - データID
 */
function saveVariabilityChanges(dataId) {
    if (!dataId) return;

    const getSeconds = (prefix) => {
        const h = parseInt(document.getElementById(`${prefix}_h`).value) || 0;
        const m = parseInt(document.getElementById(`${prefix}_m`).value) || 0;
        const s = parseInt(document.getElementById(`${prefix}_s`).value) || 0;
        return componentsToSeconds(h, m, s);
    };

    const newData = {
        currentMin: getSeconds('current_min'),
        currentMax: getSeconds('current_max'),
        improvedMin: getSeconds('improved_min'),
        improvedMax: getSeconds('improved_max')
    };

    saveVariabilityData(dataId, 'currentMin', newData.currentMin);
    saveVariabilityData(dataId, 'currentMax', newData.currentMax);
    saveVariabilityData(dataId, 'improvedMin', newData.improvedMin);
    saveVariabilityData(dataId, 'improvedMax', newData.improvedMax);
    
    updateVariabilityEditor();
    updateDistributionChart();
    triggerAutoSave();
}

/**
 * バラつき編集モーダルを閉じる
 */
function closeVariabilityModal() {
    document.getElementById('variabilityModal').style.display = 'none';
}

/**
 * 右パネルのデータカテゴリにテーマクラスを適用する
 */
function applyThemeToDataCategories() {
    // テーマと、そのテーマを適用するセクションのタイトルのマッピング
    const themeMapping = [
        // ガントチャートタブのセクション
        { panelSelector: '#ganttPanelControls', titleText: 'チャート設定', themeClass: 'theme-display' },
        { panelSelector: '#ganttPanelControls', titleText: 'チャート編集', themeClass: 'theme-edit' },
        // 作業配分表タブのセクション
        { panelSelector: '#distributionPanelControls', titleText: '作業配分設定', themeClass: 'theme-distribution' },
        // 稼働時間タブのセクション
        { panelSelector: '#schedulePanelControls', titleText: '稼働時間設定', themeClass: 'theme-schedule' },
        // 共通セクション
        { panelSelector: '.control-panel', titleText: 'データ管理', themeClass: 'theme-data' },
        // ★修正: 'アプリケーション'セクションに、危険操作を示す'theme-danger'クラスを適用するよう変更
        { panelSelector: '.control-panel', titleText: 'アプリケーション', themeClass: 'theme-danger' }
    ];

    themeMapping.forEach(({ panelSelector, titleText, themeClass }) => {
        const panel = document.querySelector(panelSelector);
        if (!panel) return;

        // 指定されたパネル内のすべてのタイトルを検索
        const titles = panel.querySelectorAll('.panel-title');
        
        titles.forEach(title => {
            if (title.textContent.trim() === titleText) {
                // ★修正: panel-title自体にもテーマクラスを付与し、タイトルとカテゴリの一貫性を保つ
                title.classList.add(themeClass);
                
                // タイトルに続く data-category 要素にテーマクラスを付与
                let nextElement = title.nextElementSibling;
                while (nextElement && !nextElement.classList.contains('panel-title')) {
                    if (nextElement.classList.contains('data-category')) {
                        nextElement.classList.add(themeClass);
                    }
                    nextElement = nextElement.nextElementSibling;
                }
            }
        });
    });
}