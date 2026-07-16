/* boot.js をアプリケーションの唯一の起動点とする */

/**
 * 拡張されたアプリケーション初期化
 */
function initializeAppWithWelcome() {
    try {
        // 1. ローカルストレージからデータを先に読み込み
        loadFromLocalStorage();

        // 2. Welcome画面の表示要否をチェック
        const shouldShow = shouldShowWelcomeScreen();

        if (shouldShow) {
            // 3a. Welcome画面を表示
            showWelcomeScreen();
        } else {
            // 3b. メインアプリケーションを表示
            showMainApplication();
        }
        
        // 4. その他のUI関連の初期化（どちらのフローでも実行）
        if (typeof initializeEnhancedModalControl === 'function') {
            initializeEnhancedModalControl();
        }
        
    } catch (error) {
        console.error('Critical error in enhanced app initialization:', error);
        // エラー時はフォールバックとしてメインアプリ表示を試みる
        showMainApplication();
    }
}

/**
 * データ有無をチェックしてWelcome画面の表示要否を判定
 * @returns {boolean} - Welcome画面を表示すべきかどうか
 */
function shouldShowWelcomeScreen() {
    try {
        
        // グローバル変数の存在確認とデフォルト値設定
        if (typeof workItems === 'undefined') window.workItems = [];
        if (typeof dataList === 'undefined') window.dataList = [];
        if (typeof frequencyWorkItems === 'undefined') window.frequencyWorkItems = [];
        
        // ★★★ 修正箇所 ★★★
        // 判定ロジックを変更。
        // dataList（保存済みデータ）の有無に関わらず、現在の作業データがなければWelcome画面を表示する。
        // 稼働時間関連のデータ（timeSlots, scheduleConfig）はデフォルト値が入るため、判定条件から除外する。
        
        // 1. 作業項目データの有無をチェック
        const hasWorkItems = Array.isArray(workItems) && workItems.length > 0;
        
        // 2. 頻度作業データの有無をチェック
        const hasFrequencyWork = Array.isArray(frequencyWorkItems) && frequencyWorkItems.length > 0;
        
        // 3. 基本設定（製品名・作業者名）の入力有無をチェック
        const productNameElement = document.getElementById('productName');
        const operatorNameElement = document.getElementById('operatorName');
        const hasProductName = productNameElement && productNameElement.value && productNameElement.value.trim() !== '';
        const hasOperatorName = operatorNameElement && operatorNameElement.value && operatorNameElement.value.trim() !== '';
        const hasBasicSettings = hasProductName || hasOperatorName;
        
        // ★★★ 修正: 以下のいずれかのデータが存在する場合は、Welcome画面をスキップ（メイン画面へ） ★★★
        const hasAnyActiveData = hasWorkItems || hasFrequencyWork || hasBasicSettings;
        
        // アクティブなデータが何もない場合にWelcome画面を表示
        const shouldShow = !hasAnyActiveData;
        
        return shouldShow;
        
    } catch (error) {
        console.error('Error in shouldShowWelcomeScreen:', error);
        // エラー時はWelcome画面を表示（安全側に倒す）
        return true;
    }
}

/**
 * Welcome画面を表示（エラーハンドリング強化版）
 */
function showWelcomeScreen() {
    try {

        // メインアプリケーションを非表示
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'none';
        }
        
        // Welcome画面のHTML構造を作成
        if (typeof createWelcomeScreenHTML === 'function') {
            createWelcomeScreenHTML();
        } else {
            throw new Error('createWelcomeScreenHTML function not available');
        }
        
        // Welcome画面のスタイルを追加
        if (typeof addWelcomeScreenStyles === 'function') {
            addWelcomeScreenStyles();
        } else {
            console.warn('addWelcomeScreenStyles function not available');
        }
        
        // Welcome画面のイベントリスナーを設定
        if (typeof setupWelcomeScreenEvents === 'function') {
            setupWelcomeScreenEvents();
        } else {
            console.warn('setupWelcomeScreenEvents function not available');
        }
        
        // Welcome画面を表示
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'flex';
            
            // フェードイン効果
            setTimeout(() => {
                welcomeScreen.classList.add('welcome-screen-show');
            }, 100);
        } else {
            throw new Error('Welcome screen element not found after creation');
        }
        
    } catch (error) {
        console.error('Error showing welcome screen:', error);
        
        // エラー時はメインアプリケーションを表示
        hideWelcomeScreen();
    }
}

/**
 * Welcome画面を非表示にしてメインアプリケーションを表示
 */
function hideWelcomeScreen() {
    try {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.add('welcome-screen-hide');
            setTimeout(() => {
                if(welcomeScreen.parentNode) welcomeScreen.remove();
            }, 300);
        }
        showMainApplication();
    } catch (error) {
        showMainApplication();
    }
}

/**
 * Welcome画面のHTML構造を作成（デザイン刷新版）
 */
function createWelcomeScreenHTML() {
    // 既存のWelcome画面があれば削除
    const existingWelcome = document.getElementById('welcomeScreen');
    if (existingWelcome) {
        existingWelcome.remove();
    }
    
    const welcomeHTML = `
        <div id="welcomeScreen" class="welcome-screen">
            <div class="welcome-container">
                <!-- ヘッダーセクション -->
                <div class="welcome-header">
                    <div class="welcome-logo">
                        <i class="fas fa-tasks"></i>
                    </div>
                    <h1 class="welcome-title">標準作業組合せ票</h1>
                    <p class="welcome-subtitle">作業内容の視覚化・作業分析ツール</p>
                </div>
                
                <!-- 機能紹介＆アクションカード -->
                <div class="welcome-main-actions">
                    <div class="action-card" onclick="startNewData()">
                        <div class="action-card-icon-wrapper">
                            <i class="fas fa-plus-circle action-card-icon"></i>
                        </div>
                        <div class="action-card-content">
                            <h3 class="action-card-title">新規作成</h3>
                            <p class="action-card-description">新しい作業分析を開始します。作業項目をゼロから登録・設定します。</p>
                        </div>
                        <i class="fas fa-chevron-right action-card-arrow"></i>
                    </div>

                    <div class="action-card" onclick="initiateSampleDataLoad()">
                        <div class="action-card-icon-wrapper">
                            <i class="fas fa-flask action-card-icon"></i>
                        </div>
                        <div class="action-card-content">
                            <h3 class="action-card-title">サンプルデータで始める</h3>
                            <p class="action-card-description">具体的なデータ例を読み込み、ツールの主要な機能をすぐに試せます。</p>
                        </div>
                        <i class="fas fa-chevron-right action-card-arrow"></i>
                    </div>

                    <div class="action-card" onclick="showWelcomeImportOptions()">
                        <div class="action-card-icon-wrapper">
                            <i class="fas fa-file-import action-card-icon"></i>
                        </div>
                        <div class="action-card-content">
                            <h3 class="action-card-title">データをインポート</h3>
                            <p class="action-card-description">既存のCSVまたはJSONファイルを読み込んで、作業を再開・共有します。</p>
                        </div>
                        <i class="fas fa-chevron-right action-card-arrow"></i>
                    </div>
                </div>

                <!-- インポートオプション（初期非表示） -->
                <div id="welcomeImportOptions" class="import-options" style="display: none;">
                    <div class="import-option" onclick="importWelcomeCSV()">
                        <i class="fas fa-file-csv"></i>
                        <span>CSVファイルをインポート</span>
                    </div>
                    <div class="import-option" onclick="importWelcomeJSON()">
                        <i class="fas fa-file-alt"></i>
                        <span>JSONファイルをインポート</span>
                    </div>
                    <!-- ★★★ 修正箇所: 「保存済みデータから読み込み」の項目を追加 ★★★ -->
                    <div class="import-option" onclick="loadFromWelcomeDataList()" id="loadFromDataListOption" style="display: none;">
                        <i class="fas fa-database"></i>
                        <span>保存済みデータから読み込み</span>
                    </div>
                </div>
                
                <!-- フッターセクション -->
                <div class="welcome-footer">
                    <div class="help-links">
                        <span onclick="showWelcomeHelp()" class="help-link">
                            <i class="fas fa-question-circle"></i>
                            使い方ガイド
                        </span>
                        <span onclick="showWelcomeShortcuts()" class="help-link">
                            <i class="fas fa-keyboard"></i>
                            キーボードショートカット
                        </span>
                    </div>
                    
                    <div class="version-info">
                        Version 3.8.0 - Business Enhanced
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', welcomeHTML);
}

/**
 * Welcome画面のスタイルを追加（デザイン刷新版）
 */
function addWelcomeScreenStyles() {
    // 既存のスタイルがあれば削除
    const existingStyles = document.getElementById('welcomeScreenStyles');
    if (existingStyles) {
        existingStyles.remove();
    }
    
    const style = document.createElement('style');
    style.id = 'welcomeScreenStyles';
    style.textContent = `
        /* Welcome Screen Base Styles */
        .welcome-screen {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #f1f5f9; /* より明るいビジネスグレー */
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5000;
            opacity: 0;
            transition: opacity 0.3s ease;
            font-family: 'Segoe UI', sans-serif;
        }
        .welcome-screen-show { opacity: 1; }
        .welcome-screen-hide { opacity: 0; }
        
        /* App Fade-in Animation */
        .app-container-show {
            animation: appFadeIn 0.4s ease-out;
        }
        @keyframes appFadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* Welcome Container */
        .welcome-container {
            background: white;
            border-radius: 16px; /* 大きめの角丸 */
            padding: 40px 48px;
            max-width: 800px; /* 少しコンパクトに */
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
            text-align: center;
            border: 1px solid #e2e8f0;
        }
        
        /* Header Section */
        .welcome-header { margin-bottom: 32px; }
        .welcome-logo {
            width: 72px; height: 72px;
            background: linear-gradient(145deg, #3b82f6, #6366f1); /* 青から紫へ */
            border-radius: 16px;
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 20px;
            box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.2);
        }
        .welcome-logo i { font-size: 32px; color: white; }
        .welcome-title {
            font-size: 28px; font-weight: 700;
            color: #1e293b; margin: 0 0 8px 0;
        }
        .welcome-subtitle {
            font-size: 16px; color: #64748b; margin: 0;
        }
        
        /* ★★★ デザイン刷新箇所 ★★★ */
        /* Main Actions (Card-based) */
        .welcome-main-actions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
            margin-bottom: 32px;
        }
        .action-card {
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            text-align: left;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .action-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.08);
            border-color: #a5b4fc; /* ホバー時に境界線を強調 */
            background: #ffffff;
        }
        .action-card-icon-wrapper {
            width: 52px; height: 52px;
            flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            border-radius: 12px;
        }
        .action-card-icon { font-size: 24px; }
        .action-card-content { flex-grow: 1; }
        .action-card-title {
            font-size: 16px; font-weight: 600;
            margin: 0 0 4px 0;
        }
        .action-card-description {
            font-size: 14px; color: #64748b;
            margin: 0; line-height: 1.5;
        }
        .action-card-arrow {
            font-size: 16px; color: #94a3b8;
            transition: transform 0.2s ease;
        }
        .action-card:hover .action-card-arrow {
            transform: translateX(4px);
            color: #4f46e5;
        }

        /* Card Color Themes */
        .action-card:nth-child(1) .action-card-icon-wrapper { background-color: #e0f2fe; } /* 新規作成: Light Blue */
        .action-card:nth-child(1) .action-card-icon { color: #0284c7; }
        .action-card:nth-child(1) .action-card-title { color: #0c4a6e; }

        .action-card:nth-child(2) .action-card-icon-wrapper { background-color: #f0fdf4; } /* サンプル: Light Green */
        .action-card:nth-child(2) .action-card-icon { color: #16a34a; }
        .action-card:nth-child(2) .action-card-title { color: #14532d; }

        .action-card:nth-child(3) .action-card-icon-wrapper { background-color: #fefce8; } /* インポート: Light Yellow */
        .action-card:nth-child(3) .action-card-icon { color: #ca8a04; }
        .action-card:nth-child(3) .action-card-title { color: #713f12; }
        
        /* Import Options */
        .import-options {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px; margin-top: -16px; margin-bottom: 24px;
            padding: 20px; background: #f1f5f9; border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .import-option {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 16px; background: white; border: 1px solid #e2e8f0;
            border-radius: 6px; cursor: pointer; transition: all 0.3s ease;
            font-size: 14px; color: #374151;
        }
        .import-option:hover {
            border-color: #6366f1; background: #eef2ff; transform: translateY(-1px);
        }
        .import-option i { font-size: 18px; color: #6366f1; }
        
        /* Footer Section */
        .welcome-footer {
            margin-top: 32px; padding-top: 24px;
            border-top: 1px solid #e2e8f0;
            display: flex; justify-content: space-between; align-items: center;
            flex-wrap: wrap; gap: 16px;
        }
        .help-links { display: flex; gap: 24px; }
        .help-link {
            color: #4f46e5; font-size: 13px; cursor: pointer;
            transition: color 0.3s ease; display: flex; align-items: center; gap: 6px;
        }
        .help-link:hover { color: #312e81; }
        .version-info { font-size: 12px; color: #94a3b8; font-weight: 500; }

        /* Confirm Modal Styles */
        /* (省略) ... 既存の確認モーダルスタイルは変更なし ... */

        /* Responsive Design */
        @media (max-width: 768px) {
            .welcome-container { padding: 24px; margin: 20px; }
            .welcome-title { font-size: 24px; }
            .welcome-subtitle { font-size: 14px; }
            .welcome-footer { flex-direction: column; text-align: center; }
            .help-links { justify-content: center; }
            .action-card { flex-direction: column; text-align: center; gap: 12px; }
            .action-card-arrow { display: none; }
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Welcome画面のイベントリスナーを設定
 */
function setupWelcomeScreenEvents() {
    // ESCキーでWelcome画面を閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const welcomeScreen = document.getElementById('welcomeScreen');
            if (welcomeScreen && welcomeScreen.style.display !== 'none') {
                startNewData(); // 新規データで開始
            }
        }
    });
}

/**
 * メインアプリケーションを表示し、初期化を完了させる (修正版：段階的初期化・テーマ適用)
 */
function showMainApplication() {
    const appContainer = document.querySelector('.app-container');

    // 1. メインコンテナを表示状態にする
    if (appContainer) {
        appContainer.style.display = 'grid';
        setTimeout(() => {
            appContainer.style.opacity = '1';
            appContainer.classList.add('app-container-show');
        }, 50);
    }

    // 2. DOMのレンダリングを待ってから、初期化処理を開始する
    setTimeout(() => {
        // 3. イベントリスナーと基本設定の初期化
        if (typeof setupEventListeners === 'function') {
            setupEventListeners();
        }
        if (typeof setupScaleControls === 'function') {
            setupScaleControls();
        }
        if (typeof initializeTextPositionAdjustment === 'function') {
            initializeTextPositionAdjustment();
        }
        if (typeof initializeWorkOrders === 'function') {
            initializeWorkOrders();
        }
        if (typeof calculateTaktTime === 'function') {
            calculateTaktTime(false);
        }
        // 標準手持ちの初期化（ロット選択肢を生成）
        if (typeof updateLotOptions === 'function') {
            updateLotOptions();
        }

        // 4. キャンバスの初期化 (段階的に実行)
        if (typeof initializeCanvas === 'function') initializeCanvas();
        
        // 5. その他のキャンバス初期化（遅延実行で確実に）
        setTimeout(() => {
            if (typeof initializeDistributionCanvas === 'function') initializeDistributionCanvas();
            if (typeof initializeScheduleCanvas === 'function') initializeScheduleCanvas();
            if (typeof initializeFrequencyCanvas === 'function') initializeFrequencyCanvas();
            if (typeof initializeProcessCanvas === 'function') initializeProcessCanvas();
            if (typeof setupDragAndDrop === 'function') setupDragAndDrop();
        }, 100);
        
        // 6. UI要素とチャートの更新（キャンバス初期化後）
        setTimeout(() => {
            if (typeof updateUIElements === 'function') updateUIElements();
            if (typeof updateAllChartsAfterDataLoad === 'function') {
                updateAllChartsAfterDataLoad();
            } else {
                safeUpdateChart('main', () => {
                    if (typeof updateChart === 'function') updateChart();
                });
                safeUpdateChart('frequency', () => {
                    if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
                });
                safeUpdateChart('schedule', () => {
                    if (typeof updateScheduleChart === 'function') updateScheduleChart();
                });
            }
            if (typeof updateProcessChartVisibilityStable === 'function') {
                updateProcessChartVisibilityStable();
            }
            
            // ★★★ ここでテーマクラスを適用 ★★★
            if (typeof applyThemeToDataCategories === 'function') {
                applyThemeToDataCategories();
            }

            // ★★★ UIの状態を最後に復元 ★★★
            if (dataManagementConfig.saveState) {
                if (typeof restoreDataManagementState === 'function') {
                    restoreDataManagementState();
                }
            } else {
                if (typeof initializeDataManagementUI === 'function') {
                    initializeDataManagementUI();
                }
            }

            // ★ 画像出力パネルのバッジをチャート描画完了後に同期
            // DOMContentLoaded時点では frequencyChartContainer が display:none のため
            // チャートが実際にレンダリングされた後に更新する必要がある
            setTimeout(() => {
                if (typeof ScreenshotManager !== 'undefined' &&
                    typeof ScreenshotManager.updatePanelBadges === 'function') {
                    ScreenshotManager.updatePanelBadges();
                }
            }, 150);
        }, 300);
    }, 150);
}

/**
 * 強制的にメインアプリケーションを表示（エラー時のフォールバック）
 */
function forceShowMainApplication() {
    try {
        
        // Welcome画面を確実に非表示
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
            if (welcomeScreen.parentNode) {
                welcomeScreen.remove();
            }
        }
        
        // メインアプリケーションを強制表示
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.display = 'grid';
            appContainer.style.opacity = '1';
        }
        
        // 基本的なキャンバス初期化を試行
        setTimeout(() => {
            try {
                if (typeof initializeCanvas === 'function') {
                    initializeCanvas();
                }
                
                // 基本的な更新を実行
                if (typeof updateUIElements === 'function') {
                    updateUIElements();
                }
            } catch (initError) {
                console.error('Error in forced initialization:', initError);
            }
        }, 200);
                
    } catch (error) {
        console.error('Error in forceShowMainApplication:', error);
    }
}

/**
 * グローバル変数の確実な初期化
 */
function initializeGlobalVariables() {
    
    // 主要なデータ配列の初期化
    if (typeof window.workItems === 'undefined') {
        window.workItems = [];
    }
    
    if (typeof window.frequencyWorkItems === 'undefined') {
        window.frequencyWorkItems = [];
    }
    
    if (typeof window.timeSlots === 'undefined') {
        window.timeSlots = [];
    }
    
    if (typeof window.dataList === 'undefined') {
        window.dataList = [];
    }
    
    // 作業順序配列の初期化
    if (typeof window.currentWorkOrder === 'undefined') {
        window.currentWorkOrder = [];
    }
    
    if (typeof window.improvedWorkOrder === 'undefined') {
        window.improvedWorkOrder = [];
    }
    
    // 設定オブジェクトの初期化
    if (typeof window.scheduleConfig === 'undefined') {
        window.scheduleConfig = {
            startTime: '',
            workHours: 8,
            endTime: ''
        };
    }
    
    // 選択状態の初期化
    if (typeof window.selectedDataIds === 'undefined') {
        window.selectedDataIds = [];
    }
    
    // 表示モードの初期化
    if (typeof window.displayMode === 'undefined') {
        window.displayMode = 'current';
    }
    
    if (typeof window.currentMainTab === 'undefined') {
        window.currentMainTab = 'gantt';
    }
    
    // タクトタイムの初期化
    if (typeof window.taktTime === 'undefined') {
        window.taktTime = 36.0;
    }
    
    // テキスト位置調整の初期化
    if (typeof window.textPositionAdjustments === 'undefined') {
        window.textPositionAdjustments = {};
    }
    
}

/**
 * ローカルストレージからデータを読み込み
 */
function loadFromLocalStorage() {
    try {
        const savedDataList = localStorage.getItem('workAnalysisDataList');
        if (savedDataList) {
            dataList = JSON.parse(savedDataList);
            updateDataListSelect();
            updateDataSelectionList();
        }

        const savedCurrentData = localStorage.getItem('workAnalysisCurrentData');
        if (savedCurrentData) {
            const data = JSON.parse(savedCurrentData);
            loadDataFromObject(data);
        }

        const savedSelectedDataIds = localStorage.getItem('workAnalysisSelectedDataIds');
        if (savedSelectedDataIds) {
            selectedDataIds = JSON.parse(savedSelectedDataIds);
            updateDataSelectionList();
        }

        // 比較ガントの選択状態を dataList に合わせて同期
        // （loadDataFromObject 内でも呼ばれるが、dataList が先に確定した後で
        //   再度実行することで削除済みIDの除外と初期全選択を確実に行う）
        if (typeof _mgNotifyDataListChanged === 'function') {
            _mgNotifyDataListChanged();
        }
    } catch (error) {
        console.error('Failed to load from localStorage:', error);
        showNotificationBanner('データの読み込みに失敗しました。', 'error', 2500);
    }
}

/**
 * 作業順序配列を初期化
 */
function initializeWorkOrders() {
    const existingIds = workItems.map(item => item.id);
    
    currentWorkOrder = existingIds.filter(id => !currentWorkOrder.includes(id)).concat(currentWorkOrder.filter(id => existingIds.includes(id)));
    improvedWorkOrder = existingIds.filter(id => !improvedWorkOrder.includes(id)).concat(improvedWorkOrder.filter(id => existingIds.includes(id)));
}

/**
 * タクトタイム計算（修正版：安全なチャート更新）
 * @param {boolean} showAlerts - 警告バナーを表示するかどうかのフラグ
 */
function calculateTaktTime(showAlerts = true) {
    const operatingTime = parseFloat(document.getElementById('operatingTime').value) || 420;
    const requiredQuantity = parseFloat(document.getElementById('requiredQuantity').value) || 800;
    
    if (requiredQuantity <= 0) {
        // showAlertsがtrueの場合のみバナーを表示
        if (showAlerts) {
            showNotificationBanner('必要数は1以上の値を入力してください。', 'warning', 2000);
        }
        // タクトタイムをリセット
        taktTime = 0;
        document.getElementById('taktTimeDisplay').textContent = '---';
    } else {
        // 0より大きい場合のみタクトタイムを計算
        taktTime = (operatingTime * 60) / requiredQuantity;
        document.getElementById('taktTimeDisplay').textContent = formatTimeDisplay(Math.round(taktTime));
    }
    
    // 安全なチャート更新（デバウンスなし）
    safeUpdateChart('main', () => {
        if (typeof updateChart === 'function') updateChart();
    });
    
    safeUpdateChart('frequency', () => {
        if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
    });
    
    safeUpdateChart('schedule', () => {
        if (typeof updateScheduleChart === 'function') updateScheduleChart();
    });
}

/**
 * データ管理セクションの状態を復元
 */
function restoreDataManagementState() {
    try {
        const state = JSON.parse(localStorage.getItem('dataManagementState') || '{}');
        const categories = document.querySelectorAll('.data-category');
        
        categories.forEach((category, index) => {
            const header = category.querySelector('.category-header');
            const content = category.querySelector('.category-content');
            const stateKey = `category_${index}`;
            
            if (state.hasOwnProperty(stateKey)) {
                if (state[stateKey]) {
                    header.classList.add('active');
                    content.classList.add('active');
                    // scrollHeight はレンダリング前に 0 を返すため固定値を使用する。
                    // active クラスがあるのに maxHeight=0 という矛盾状態（2クリック問題）を防ぐ。
                    content.style.maxHeight = '3000px';
                } else {
                    header.classList.remove('active');
                    content.classList.remove('active');
                    content.style.maxHeight = '0px';
                }
            }
        });
    } catch (error) {
        console.warn('Failed to restore data management state:', error);
        // フォールバック：デフォルト状態に設定
        initializeDataManagementUI();
    }
}

/**
 * 全キャンバスの初期化
 */
function initializeAllCanvases() {
    try {
        
        const canvasInitializers = [
            { name: 'Main Canvas', func: 'initializeCanvas' },
            { name: 'Distribution Canvas', func: 'initializeDistributionCanvas' },
            { name: 'Schedule Canvas', func: 'initializeScheduleCanvas' },
            { name: 'Frequency Canvas', func: 'initializeFrequencyCanvas' },
            { name: 'Process Canvas', func: 'initializeProcessCanvas' }
        ];
        
        canvasInitializers.forEach(({ name, func }) => {
            try {
                if (typeof window[func] === 'function') {
                    window[func]();
                } else {
                    console.warn(`${name} initializer not available: ${func}`);
                }
            } catch (canvasError) {
                console.error(`Error initializing ${name}:`, canvasError);
            }
        });
        
        // ドラッグ&ドロップの設定
        try {
            if (typeof setupDragAndDrop === 'function') {
                setupDragAndDrop();
            }
        } catch (dragError) {
            console.error('Error setting up drag and drop:', dragError);
        }
                
    } catch (error) {
        console.error('Error in initializeAllCanvases:', error);
    }
}

/**
 * キャンバス初期化（確実な高解像度対応版・データ有無に関わらず適切に初期化）
 */
function initializeCanvas() {
    try {
        let attempts = 0;
        const maxAttempts = 10;
        const checkInterval = 100;

        const attemptInitialization = () => {
            attempts++;
            const canvasContainer = document.getElementById('canvasContainer');
            
            if (!canvasContainer || !document.getElementById('ganttCanvas')) {
                if (attempts < maxAttempts) {
                    setTimeout(attemptInitialization, checkInterval);
                }
                return;
            }

            const containerRect = canvasContainer.getBoundingClientRect();
            if (containerRect.width <= 0 && attempts < maxAttempts) {
                setTimeout(attemptInitialization, checkInterval);
                return;
            }
            
            canvas = document.getElementById('ganttCanvas');
            continueCanvasInitialization();
        };

        attemptInitialization();
    } catch (error) {
        createFallbackCanvas();
    }
}

/**
 * 作業配分表キャンバスを初期化（修正版：フラグ設定追加）
 */
function initializeDistributionCanvas() {
    distributionCanvas = document.getElementById('distributionCanvas');
    if (!distributionCanvas) return;
    
    distributionCtx = distributionCanvas.getContext('2d');
    
    // 高解像度対応
    setupHighDPICanvas(distributionCanvas, distributionCtx, distributionCanvasWidth, distributionCanvasHeight);
    
    // ★重要：作業配分表キャンバス初期化完了フラグを設定
    isDistributionCanvasReady = true;
    
    // 保留中の更新を実行
    processPendingUpdates('distribution');
}

/**
 * 稼働時間チャートキャンバス初期化（修正版：フラグ設定追加）
 */
function initializeScheduleCanvas() {
    scheduleCanvas = document.getElementById('scheduleCanvas');
    if (!scheduleCanvas) return;
    
    scheduleCtx = scheduleCanvas.getContext('2d');
    
    // 高解像度対応
    setupHighDPICanvas(scheduleCanvas, scheduleCtx, scheduleCanvasWidth, scheduleCanvasHeight);
    
    // イベントリスナー（座標計算は高解像度対応版を使用）
    scheduleCanvas.addEventListener('mousedown', handleScheduleMouseDown);
    scheduleCanvas.addEventListener('mousemove', handleScheduleMouseMove);
    scheduleCanvas.addEventListener('mouseleave', handleScheduleMouseLeave);
    scheduleCanvas.addEventListener('dblclick', handleScheduleDoubleClick);
    
    document.addEventListener('mousemove', handleScheduleGlobalMouseMove);
    document.addEventListener('mouseup', handleScheduleGlobalMouseUp);
    
    // ★重要：稼働時間チャートキャンバス初期化完了フラグを設定
    isScheduleCanvasReady = true;
    
    // 保留中の更新を実行
    processPendingUpdates('schedule');
}

/**
 * 頻度作業チャート初期化（修正版：フラグ設定追加）
 */
function initializeFrequencyCanvas() {
    frequencyCanvas = document.getElementById('frequencyCanvas');
    if (!frequencyCanvas) return;
    
    frequencyCtx = frequencyCanvas.getContext('2d');
    
    // 高解像度対応
    setupHighDPICanvas(frequencyCanvas, frequencyCtx, frequencyCanvasWidth, frequencyCanvasHeight);
    
    // イベントリスナー（座標計算は高解像度対応版を使用）
    frequencyCanvas.addEventListener('mousemove', handleFrequencyCanvasMouseMove);
    frequencyCanvas.addEventListener('mouseleave', handleFrequencyCanvasMouseLeave);
    frequencyCanvas.addEventListener('dblclick', handleFrequencyCanvasDoubleClick);
    
    // ★重要：頻度作業チャート初期化完了フラグを設定
    isFrequencyCanvasReady = true;
    
    // 保留中の更新を実行
    processPendingUpdates('frequency');
}

/**
 * 工程確認チャート初期化（修正版：フラグ設定追加）
 */
function initializeProcessCanvas() {
    processCanvas = document.getElementById('processCanvas');
    if (!processCanvas) {
        console.warn('Process canvas not found');
        return;
    }
    
    processCtx = processCanvas.getContext('2d');
    
    // メインキャンバスとの幅同期（初期化時）
    let initialWidth = processCanvasWidth;
    if (canvas) {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const mainCanvasDisplayWidth = canvas.width / devicePixelRatio;
        initialWidth = mainCanvasDisplayWidth;
    }
    
    // 初期高さ計算（修正版）
    const maxLotNumber = getMaxLotNumber();
    let initialHeight = PROCESS_TOP_MARGIN + (maxLotNumber * PROCESS_ROW_HEIGHT) + PROCESS_BOTTOM_MARGIN;
    initialHeight = Math.max(200, initialHeight); // 最小高さ保証
    initialHeight = Math.min(800, initialHeight); // 最大高さ制限
    
    // グローバル変数を設定
    processCanvasWidth = initialWidth;
    processCanvasHeight = initialHeight;
    
    // 高解像度対応
    setupHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
        
    // イベントリスナー（座標計算は高解像度対応版を使用）
    processCanvas.addEventListener('mousemove', handleProcessCanvasMouseMove);
    processCanvas.addEventListener('mouseleave', handleProcessCanvasMouseLeave);
    processCanvas.addEventListener('dblclick', handleProcessCanvasDoubleClick);
    
    // 初期化完了後にスケール情報をクリア
    window.processChartScaleInfo = null;
    
    // ★重要：工程確認チャート初期化完了フラグを設定
    isProcessCanvasReady = true;
    
    // 保留中の更新を実行
    processPendingUpdates('process');
}


/**
 * ドラッグアンドドロップ設定（ビジネス用強化版）
 */
function setupDragAndDrop() {
    const overlay = document.getElementById('dragDropOverlay');
    
    // ドラッグオーバー時のハイライト
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
            overlay.style.display = 'flex';
            const dz = document.getElementById('csvMenuDropZone');
            if (dz) dz.classList.add('drag-over');
        }
    });
    
    document.addEventListener('dragleave', function(e) {
        if (e.clientX === 0 && e.clientY === 0) {
            overlay.style.display = 'none';
            const dz = document.getElementById('csvMenuDropZone');
            if (dz) dz.classList.remove('drag-over');
        }
    });
    
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        overlay.style.display = 'none';
        const dz = document.getElementById('csvMenuDropZone');
        if (dz) dz.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        const csvFile = files.find(file => file.name.toLowerCase().endsWith('.csv'));
        if (csvFile) {
            importCSVFile(csvFile);
        } else {
            showNotificationBanner('CSVファイルをドロップしてください。', 'warning', 2000);
        }
    });
    
    // オーバーレイ上でのドロップ
    overlay.addEventListener('drop', function(e) {
        e.preventDefault();
        overlay.style.display = 'none';
        
        const files = Array.from(e.dataTransfer.files);
        const csvFile = files.find(file => file.name.toLowerCase().endsWith('.csv'));
        
        if (csvFile) {
            importCSVFile(csvFile);
        }
    });
}

/**
 * グローバルなモーダル制御（外クリック、ESCキー）を設定
 */
function setupGlobalModalControls() {

    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // 表示されているモーダルを順に閉じる
            const activeModals = [
                { modal: document.getElementById('workModal'), closeFn: closeWorkModal },
                { modal: document.getElementById('timeSlotModal'), closeFn: closeTimeSlotModal },
                { modal: document.getElementById('frequencyWorkModal'), closeFn: closeFrequencyWorkModal },
                { modal: document.getElementById('workOrderManagementModal'), closeFn: closeWorkOrderManagement },
                { modal: document.getElementById('csvImportModal'), closeFn: closeCsvImportModal },
                { modal: document.getElementById('dataNameModal'), closeFn: closeDataNameModal }
            ];

            for (const { modal, closeFn } of activeModals) {
                if (modal && modal.style.display === 'block') {
                    if (typeof closeFn === 'function') {
                        closeFn();
                        break; // 1つ閉じたらループを抜ける（多重クローズ防止）
                    }
                }
            }
            // ツールチップも非表示
            if (typeof hideDynamicTooltip === 'function') { // ui-manager.js
                hideDynamicTooltip();
            }
        }
    });
}

/**
 * スケールUIの初期化とイベントリスナー設定（修正版：安全なチャート更新）
 */
function setupScaleControls() {
    const slider = document.getElementById('scaleSlider');
    const mainScaleBtn = document.getElementById('mainScaleBtn');
    const frequencyScaleBtn = document.getElementById('frequencyScaleBtn');

    if (!slider || !mainScaleBtn || !frequencyScaleBtn) return;

    const debouncedUpdate = debounce(() => {
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
    }, 16); // 50ms → 16ms（1フレーム）: 頻度チャートの体感遅延を低減

    slider.addEventListener('input', (e) => {
        // スライダー操作時は必ず手動モードに切り替える
        chartScaleMode = 'manual';
        const minVal = parseInt(e.target.min);
        let val = parseInt(e.target.value);
        
        if (val <= minVal && cycleCount >= 2) {
            // 限界に達した際の警告
            if (!slider._warned) {
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner(`制約により、${formatTimeDisplay(minVal)}以下にはスケールを縮小できません。`, 'warning', 2500);
                }
                slider._warned = true;
                setTimeout(() => { slider._warned = false; }, 3000);
            }
            val = minVal;
            e.target.value = val;
        }
        
        manualScaleValue = val;
        if (typeof updateScaleUI === 'function') {
            updateScaleUI();
        }
        // スライダー操作中はデバウンスで再描画
        debouncedUpdate();
    });

    slider.addEventListener('change', () => {
        // スライダー操作終了時にオートセーブ
        if (typeof triggerAutoSave === 'function') {
            triggerAutoSave();
        }
    });

    mainScaleBtn.addEventListener('click', () => switchChartScale('main'));
    frequencyScaleBtn.addEventListener('click', () => switchChartScale('frequency'));

    // 初期UI更新
    if (typeof updateScaleUI === 'function') {
        updateScaleUI();
    }
}


/**
 * モーダル機能の初期化
 */
function initializeModalFeatures() {

    // 作業分類選択の変更監視
    const categorySelect = document.getElementById('workCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', handleCategoryChange);
    }

    // モーダル固有の検証を設定
    setupModalSpecificValidation();
}

/**
 * モーダル制御の初期化関数
 * DOMContentLoaded時に実行する
 */
function initializeEnhancedModalControl() {
    // 作業項目モーダル専用制御を設定
    setupWorkModalCloseControl();
}

/**
 * データ管理UIの初期化
 */
function initializeDataManagementUI() {
    // 使用頻度に基づいてカテゴリの初期状態を設定
    const categories = document.querySelectorAll('.data-category');
    
    categories.forEach((category, index) => {
        const header = category.querySelector('.category-header');
        const content = category.querySelector('.category-content');
        
        // 修正: ヘッダー自身のクラスで初期表示を判断
        if (header && header.classList.contains('frequency-high')) {
            header.classList.add('active');
            content.classList.add('active');
            // scrollHeight はレンダリング前に 0 を返すため固定値を使用する（2クリック問題対策）
            content.style.maxHeight = '3000px';
        } else {
            // その他は折りたたみ状態
            header.classList.remove('active');
            content.classList.remove('active');
            content.style.maxHeight = '0px';
        }
    });
    
    // ボタンホバー効果の強化
    enhanceButtonInteractions();
    
    // 使用統計の記録（オプション）
    if (typeof trackDataManagementUsage === 'function') {
        trackButtonUsage();
    }
}

/**
 * テキスト位置調整機能の初期化
 */
function initializeTextPositionAdjustment() {
    try {
        if (typeof textPositionAdjustments === 'undefined' || !textPositionAdjustments) {
            window.textPositionAdjustments = JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS));
        }

        Object.keys(DEFAULT_TEXT_POSITION_ADJUSTMENTS).forEach(category => {
            if (!textPositionAdjustments[category]) {
                textPositionAdjustments[category] = { x: 0, y: 0 };
            }
        });

        createTextPositionUI();
    } catch (error) {
        console.error('Error initializing text position adjustment:', error);
        window.textPositionAdjustments = JSON.parse(JSON.stringify(DEFAULT_TEXT_POSITION_ADJUSTMENTS));
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('文字位置調整機能の初期化中にエラーが発生しました。', 'warning', 3000);
        }
    }
}

/**
 * 作業配分表のマウスオーバー対応（高解像度対応版・座標計算修正）
 */
function setupDistributionMouseEvents() {
    if (!distributionCanvas) return;

    distributionCanvas.addEventListener('mousemove', function(event) {
        // 高解像度対応の統一座標取得を使用
        const pos = getCanvasMousePosition(distributionCanvas, event);
        const x = pos.x;
        const y = pos.y;

        checkDistributionHover(x, y, event);
    });

    distributionCanvas.addEventListener('mouseleave', function() {
        hideDistributionTooltip();
    });
}

/**
 * キーボードナビゲーション強化
 */
function enhanceKeyboardNavigation() {
    // フォーカス可能要素の管理
    const focusableElements = [
        'button',
        'input',
        'select',
        'textarea',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            const focusable = Array.from(document.querySelectorAll(focusableElements))
                .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
            
            const currentIndex = focusable.indexOf(document.activeElement);
            
            if (e.shiftKey) {
                // Shift+Tab（逆方向）
                if (currentIndex <= 0) {
                    e.preventDefault();
                    focusable[focusable.length - 1].focus();
                }
            } else {
                // Tab（順方向）
                if (currentIndex >= focusable.length - 1) {
                    e.preventDefault();
                    focusable[0].focus();
                }
            }
        }
    });
}

/**
 * パフォーマンス最適化のためのUIレンダリング制御
 */
function optimizeUIRendering() {
    // インターセクションオブザーバーでの可視性チェック
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // 可視エリアに入った時の処理
                entry.target.classList.add('visible');
            } else {
                // 可視エリアから出た時の処理
                entry.target.classList.remove('visible');
            }
        });
    });
    
    // パフォーマンス重要な要素を監視
    const performanceElements = document.querySelectorAll('.canvas-container, .distribution-canvas-container, .schedule-canvas-container, .frequency-chart-container');
    performanceElements.forEach(element => {
        if (element) {
            observer.observe(element);
        }
    });
}

/**
 * レスポンシブ対応のUI調整
 */
function adjustResponsiveUI() {

    try {
        const viewportWidth = window.innerWidth;
        const appContainer = document.querySelector('.app-container');
        
        if (!appContainer) return;
        
        // devicePixelRatioの変更も検知
        const devicePixelRatio = window.devicePixelRatio || 1;
        const lastDPR = window._lastResponsiveDevicePixelRatio || devicePixelRatio;
        const dprChanged = Math.abs(devicePixelRatio - lastDPR) > 0.1;
        
        if (dprChanged) {
            window._lastResponsiveDevicePixelRatio = devicePixelRatio;
        }
        
        // レスポンシブレイアウト設定
        if (viewportWidth < 768) {
            // モバイル表示
            appContainer.style.gridTemplateColumns = '1fr';
            appContainer.style.gridTemplateRows = 'auto 1fr';
            
        } else if (viewportWidth < 1024) {
            // タブレット表示
            appContainer.style.gridTemplateColumns = '24% 76%';
            appContainer.style.gridTemplateRows = '1fr';
            
        } else {
            // デスクトップ表示
            appContainer.style.gridTemplateColumns = '17% 83%';
            appContainer.style.gridTemplateRows = '1fr';
            
        }
        
        // devicePixelRatioが変更された場合は全キャンバスを更新
        if (dprChanged) {
            setTimeout(() => {
                
                // メインキャンバス
                if (canvas && ctx) {
                    setupHighDPICanvas(canvas, ctx, canvasWidth, canvasHeight);
                    if (typeof updateChart === 'function') {
                        updateChart();
                    }
                }
                
                // 作業配分表キャンバス
                if (distributionCanvas && distributionCtx) {
                    setupHighDPICanvas(distributionCanvas, distributionCtx, distributionCanvasWidth, distributionCanvasHeight);
                    if (typeof updateDistributionChart === 'function') {
                        updateDistributionChart();
                    }
                }
                
                // 稼働時間キャンバス
                if (scheduleCanvas && scheduleCtx) {
                    setupHighDPICanvas(scheduleCanvas, scheduleCtx, scheduleCanvasWidth, scheduleCanvasHeight);
                    if (typeof updateScheduleChart === 'function') {
                        updateScheduleChart();
                    }
                }
                
                // 頻度作業キャンバス
                if (frequencyCanvas && frequencyCtx) {
                    setupHighDPICanvas(frequencyCanvas, frequencyCtx, frequencyCanvasWidth, frequencyCanvasHeight);
                    if (typeof updateFrequencyChart === 'function') {
                        updateFrequencyChart();
                    }
                }
                
                // 工程確認キャンバス
                if (processCanvas && processCtx && showProcessChart) {
                    setupHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
                    if (typeof updateProcessChart === 'function') {
                        updateProcessChart();
                    }
                }
            }, 100);
        }
        
    } catch (error) {
        console.error('Error in adjustResponsiveUI:', error);
    }
}

/**
 * 初回描画を段階的に実行
 */
function executeInitialDrawing() {
    
    // 1段階目：キャンバスの準備確認
    requestAnimationFrame(() => {
        if (!canvas || !ctx) {
            console.error('Canvas not ready, retrying...');
            setTimeout(executeInitialDrawing, 100);
            return;
        }
              
        // 2段階目：強制的にガントチャート描画
        requestAnimationFrame(() => {
            try {
                updateChart();
                
                // 3段階目：その他のチャート描画
                requestAnimationFrame(() => {
                    if (currentMainTab === 'schedule') {
                        updateScheduleChart();
                    }
                    updateFrequencyChart();
                });
            } catch (error) {
                console.error('Chart drawing error:', error);
            }
        });
    });
}

/**
 * データ読み込み後の全チャート更新
 */
function updateAllChartsAfterDataLoad() {
    try {

        safeUpdateChart('main', () => {
            if (canvas && ctx && typeof updateChart === 'function') {
                updateChart();
            }
        });
        
        safeUpdateChart('frequency', () => {
            if (typeof updateFrequencyChart === 'function') {
                updateFrequencyChart();
            }
        });
        
        safeUpdateChart('schedule', () => {
            if (typeof updateScheduleChart === 'function') {
                updateScheduleChart();
            }
        });
        
        safeUpdateChart('process', () => {
            if (typeof updateProcessChartVisibilityStable === 'function') {
                updateProcessChartVisibilityStable();
            }
        });

    } catch (error) {
        console.error('Error updating charts after data load:', error);
    }
}

/**
 * 工程確認チャートの表示制御
 */
function updateProcessChartVisibilityStable() {
    const processContainer = document.getElementById('processChartContainer');
    if (!processContainer) return;

    const lotModeOverlay = document.getElementById('processLotModeOverlay');

    if (showProcessChart) {
        // 表示する場合
        processContainer.style.display = 'block';

        // ロット/サイクル切替オーバーレイを表示
        if (lotModeOverlay) lotModeOverlay.classList.add('visible');
        
        // 段階的に初期化と同期を実行
        setTimeout(() => {
            // 1. キャンバス初期化確認
            if (!processCanvas || !processCtx) {
                initializeProcessCanvas();
            }
            
            // 2. 強制サイズ同期
            if (typeof forceProcessChartSizeSync === 'function') {
                forceProcessChartSizeSync();
            }
            
            // 3. チャート描画
            setTimeout(() => {
                if (typeof updateProcessChart === 'function') {
                    updateProcessChart();
                    
                    // 4. 描画確認のための再描画
                    setTimeout(() => {
                        updateProcessChart();
                    }, 100);
                }
            }, 50);
        }, 50);
    } else {
        // 非表示にする場合
        processContainer.style.display = 'none';

        // ロット/サイクル切替オーバーレイを非表示
        if (lotModeOverlay) lotModeOverlay.classList.remove('visible');
    }
}

/**
 * サンプルデータ読み込みを開始する共通トリガー関数（確認モーダル・画面遷移対応版）
 * @param {function} onComplete - データ読み込み完了後に実行するオプションのコールバック
 */
function initiateSampleDataLoad(onComplete) {

    // ★★★ 修正箇所: 汎用的な確認モーダル showWelcomeConfirmModal を使用するように変更 ★★★
    showWelcomeConfirmModal(
        'サンプルデータの読み込み',
        '現在の作業データはすべてクリアされます。<br>サンプルデータを読み込みますか？',
        () => {
            try {
                // サンプルデータを実際に読み込む
                if (typeof loadSampleData === 'function') {
                    loadSampleData();
                } else {
                    console.error("loadSampleData function is not available.");
                    // フォールバックとして基本的なサンプルデータを作成
                    if (typeof createEnhancedSampleData === 'function') {
                        createEnhancedSampleData();
                    }
                }

                // WELCOME画面が表示されている場合、メイン画面へ遷移させる
                if (isWelcomeScreenVisible()) {
                    hideWelcomeScreen();
                }
                
                // 読み込み完了後のオプションのコールバックを実行
                if (typeof onComplete === 'function') {
                    onComplete();
                }
                
                // 成功メッセージ（画面遷移後に表示されるように少し遅延）
                setTimeout(() => {
                    if (typeof showNotificationBanner === 'function') {
                        showNotificationBanner('サンプルデータを読み込みました。', 'success', 2500);
                    }
                }, 500); // 遷移アニメーションを考慮して遅延

            } catch (error) {
                console.error("Error initiating sample data load:", error);
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner('サンプルデータの読み込みに失敗しました。', 'error', 3000);
                }
                // エラー時でも画面遷移は試みる
                if (isWelcomeScreenVisible()) {
                    hideWelcomeScreen();
                }
            }
        }
    );
}


// ========================================
// Event Listeners & Initialization (Business Enhanced with Advanced Schedule and Frequency Work)
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    // エラーの原因となっていた未定義関数の呼び出しと、
    // welcome.js の初期化処理と重複する部分を削除します。
    // アプリケーションのメインの初期化は welcome.js の initializeAppWithWelcome が担当します。

    // UIコンポーネントのイベントリスナー設定は、初期化後に行われるため、ここに残しても安全です。
    const dataListSelect = document.getElementById('dataListSelect');
    if (dataListSelect) {
        dataListSelect.addEventListener('change', loadDataFromList);
    }

    // 保存・削除ボタンの初期状態設定。
    // これらはメインの初期化処理(loadFromLocalStorage)の後で適切に状態が更新されるため、
    // ここで呼び出しても問題ありません。
    updateSaveButtonUI();
    updateDeleteButtonVisibility();
});

// キーボードショートカット
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeWorkModal();
        closeTimeSlotModal(); 
        closeFrequencyWorkModal(); 
        closeWorkOrderManagement();
        closeCsvImportModal();
        closeDataNameModal();
        hideDynamicTooltip(); // ツールチップも非表示
    }
    
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case '1':
                e.preventDefault();
                switchDisplayMode('current');
                break;
            case '2':
                e.preventDefault();
                switchDisplayMode('improved');
                break;
            case '3':
                e.preventDefault();
                switchDisplayMode('both');
                break;
            case 'g':
                e.preventDefault();
                switchMainTab('gantt');
                break;
            case 'd':
                e.preventDefault();
                switchMainTab('distribution');
                break;
            case 'h': // 稼働時間タブのショートカット
                e.preventDefault();
                switchMainTab('schedule');
                break;
            case 'f': // 頻度作業追加のショートカット
                e.preventDefault();
                addFrequencyWork();
                break;
            case 'm':
                e.preventDefault();
                if (currentMainTab === 'gantt') {
                    if (displayMode === 'current') {
                        manageWorkOrder('current');
                    } else {
                        manageWorkOrder('improved');
                    }
                } else if (currentMainTab === 'schedule') {
                    addTimeSlot(); // 稼働時間タブでは時間帯追加
                }
                break;
            case 's':
                e.preventDefault();
                saveCurrentDataToList();
                break;
            case 'e':
                e.preventDefault();
                exportData();
                break;
            case 'i':
                e.preventDefault();
                importData();
                break;
        }
    }
    
    // モーダル内でのショートカット
    const workModal = document.getElementById('workModal');
    const timeSlotModal = document.getElementById('timeSlotModal'); // 新規
    const frequencyModal = document.getElementById('frequencyWorkModal'); // 新規
    const orderModal = document.getElementById('workOrderManagementModal');
    const csvModal = document.getElementById('csvImportModal');
    const dataNameModal = document.getElementById('dataNameModal');
    
    if (workModal && workModal.style.display === 'block') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveWork();
        }
        if (e.key === 'Tab' && e.altKey) {
            e.preventDefault();
            switchTab(currentActiveTab === 'current' ? 'improved' : 'current');
        }
    }
    
    // 時間帯モーダル内でのショートカット
    if (timeSlotModal && timeSlotModal.style.display === 'block') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveTimeSlot();
        }
    }
    
    // 頻度作業モーダル内でのショートカット
    if (frequencyModal && frequencyModal.style.display === 'block') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveFrequencyWork();
        }
    }
    
    if (dataNameModal && dataNameModal.style.display === 'block') {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmSaveDataToList();
        }
    }
});

// 作業配分表のマウスオーバー対応初期化
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        setupDistributionMouseEvents();

        // 項目名表示切替ボタンの初期状態設定
        const toggleBtn = document.getElementById('distributionLabelToggle');
        if (toggleBtn && showDistributionItemLabels) {
            toggleBtn.classList.add('active');
            toggleBtn.style.backgroundColor = '#2563eb';
            toggleBtn.style.color = 'white';
        }
    }, 500);
});

// DOMContentLoaded時にモーダル機能を初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeModalFeatures();
    initializeEnhancedModalControl(); // 新しい初期化関数を呼び出し

    // ビジネス用スタイルの動的追加
    if (!document.getElementById('modalBusinessStyles')) {
        const style = document.createElement('style');
        style.id = 'modalBusinessStyles';
        style.textContent = `
            /* ビジネス用モーダル拡張スタイル */
            .category-monitor .modal-header {
                border-bottom-color: #7c3aed;
            }
            .category-wait .modal-header {
                border-bottom-color: #f59e0b;
            }
            .category-normal .modal-header {
                border-bottom-color: #e2e8f0;
            }

            /* 改善前/改善後タブの色分け */
            #currentTab.active {
                background: #1f2937;
                color: white;
            }
            #improvedTab.active {
                background: #dc2626;
                color: white;
            }

            /* 時間入力の強化表示 */
            .time-component:focus {
                border-color: #2563eb;
                box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
            }

            /* 無効化された行のスタイル */
            .time-input-table tbody tr.disabled {
                opacity: 0.5;
                background-color: #f8fafc;
            }

            /* 頻度作業モーダルのスタイル */
            .frequency-work-modal { /* このクラスが実際に使われているか確認 */
                max-width: 450px;
            }

            #frequencyWorkModal .modal-content { /* ID指定で確実性向上 */
                 max-width: 450px;
            }


            #frequencyWorkModal .modal-body { /* ID指定で確実性向上 */
                padding: 20px;
            }

            .frequency-work-form-group {
                margin-bottom: 16px;
            }

            .frequency-work-form-group label {
                display: block;
                margin-bottom: 4px;
                font-weight: 500;
                color: #374151;
                font-size: 13px;
            }

            .frequency-work-form-group input,
            .frequency-work-form-group textarea {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 13px;
            }

            .frequency-work-form-group textarea {
                resize: vertical;
                min-height: 60px;
            }
        `;
        document.head.appendChild(style);
    }
});

// DOMContentLoaded時の初期化
document.addEventListener('DOMContentLoaded', function() {
    // データ管理UIの初期化（少し遅れて実行）
    setTimeout(() => {
        if (dataManagementConfig.saveState) {
            restoreDataManagementState();
        } else {
            initializeDataManagementUI();
        }
    }, 100);
});

// UI Manager初期化
document.addEventListener('DOMContentLoaded', function() {
    enhanceKeyboardNavigation();
    adjustResponsiveUI();
    optimizeUIRendering();
    optimizeChartRendering();
    
    // オートセーブのフィードバック設定
    if (typeof triggerAutoSave === 'function') {
        const originalTriggerAutoSave = triggerAutoSave;
        window.triggerAutoSave = function() {
            showAutoSaveStatus('saving');
            originalTriggerAutoSave();
            setTimeout(() => {
                showAutoSaveStatus('saved');
            }, 400);
        };
    }
    
    // 定期的なUI状態更新
    setInterval(() => {
        updateAriaLabels();
        updateFrequencyWorkStatistics();
        updateFrequencyWorkButtons();
    }, 2500);
    
    // ツールチップの初期設定
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        // ツールチップにマウスが入った時の処理
        tooltip.addEventListener('mouseenter', function() {
            this.style.opacity = '1';
        });
        
        // ツールチップからマウスが出た時の処理
        tooltip.addEventListener('mouseleave', function() {
            hideDynamicTooltip();
        });
    }
    
    // 稼働時間カード用スタイルの動的追加
    if (!document.getElementById('workingTimeCardStyles')) {
        const style = document.createElement('style');
        style.id = 'workingTimeCardStyles';
        style.textContent = `
            /* 稼働時間カード用スタイル */
            .working-time-cards-container {
                display: flex;
                gap: 12px;
                flex-wrap: nowrap;
                margin-bottom: 16px;
            }
            
            .working-time-card {
                flex: 1;
                min-width: 120px;
                padding: 8px 12px;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                transition: all 0.2s ease;
                position: relative;
                overflow: hidden;
            }
            
            .working-time-card:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            
            .card-label {
                font-size: 10px;
                color: #64748b;
                font-weight: 500;
                margin-bottom: 2px;
                display: block;
            }
            
            .card-value {
                font-size: 20px;
                font-weight: 700;
                text-align: center;
                font-family: 'Consolas', 'Monaco', monospace;
                line-height: 1.2;
            }
            
            .card-percentage {
                font-size: 12px;
                font-weight: 500;
                text-align: center;
                opacity: 0.8;
                margin-top: 1px;
            }

            /* カード値コンテナの調整 */
            .card-value-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }

            .card-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                background: #2563eb;
                transition: width 0.3s ease;
            }
            
            /* 頻度作業ツールチップ */
            .tooltip.frequency-tooltip {
                background: rgba(139, 92, 246, 0.95);
                border-color: #8b5cf6;
            }
            
            /* レスポンシブ対応 */
            @media (max-width: 768px) {
                .working-time-cards-container {
                    flex-direction: column;
                    gap: 8px;
                }
                
                .working-time-card {
                    min-width: auto;
                }
            }
            
            @media (max-width: 1024px) {
                .working-time-cards-container {
                    flex-wrap: wrap;
                    gap: 10px;
                }
                
                .working-time-card {
                    flex: 1 1 calc(50% - 5px);
                    min-width: 140px;
                }
            }
        `;
        document.head.appendChild(style);
    }

// ui-manager.js のDOMContentLoaded内に追加する処理

    // ★★★ updateChart ラッパーを即時インストール（300msタイムアウト外に移動）★★★
    // 問題: showMainApplication() 内の setTimeout(300ms) と
    //        このブロックの setTimeout(300ms) が同時に発火することで
    //        ラッパー未設定のまま updateChart() が走るレースコンディションが発生していた。
    // 解決: DOMContentLoaded 直後に同期的にインストールすることで確実に適用される。
    (function installUpdateChartWrapper() {
        const originalUpdateChart = window.updateChart;
        if (originalUpdateChart) {
            window.updateChart = function() {
                originalUpdateChart.call(this);
                
                // メインチャート更新後、工程確認チャートも同期
                if (showProcessChart) {
                    requestAnimationFrame(() => {
                        if (typeof forceProcessChartSizeSync === 'function') {
                            forceProcessChartSizeSync();
                        }
                        setTimeout(() => {
                            if (typeof updateProcessChart === 'function') {
                                updateProcessChart();
                            }
                        }, 20);
                    });
                }
            };
        }
    })();

    // 工程確認チャートの安定化処理（processCanvas初期化完了後に実行が必要なため300ms維持）
    setTimeout(() => {
        updateProcessChartVisibilityStable();
        
        // データ変更の監視
        const originalSwitchDisplayMode = window.switchDisplayMode;
        if (originalSwitchDisplayMode) {
            window.switchDisplayMode = function(mode) {
                originalSwitchDisplayMode.call(this, mode);
                // 表示モード変更時は必ず工程確認チャートも同期
                setTimeout(() => {
                    if (showProcessChart) {
                        forceProcessChartSizeSync();
                        setTimeout(() => {
                            updateProcessChart();
                        }, 50);
                    }
                }, 100);
            };
        }
        
        // ウィンドウリサイズ時の処理も強化
        window.addEventListener('resize', debounce(() => {
            if (showProcessChart) {
                forceProcessChartSizeSync();
                setTimeout(() => {
                    handleProcessCanvasResize();
                }, 100);
            }
        }, 200));
        
        // 工程確認チャートが表示状態なら再描画を確実に実行
        // （コンテナが表示されたタイミングで内容が描画されていない場合への対策）
        if (showProcessChart && processCanvas && processCtx) {
            if (typeof updateProcessChart === 'function') {
                updateProcessChart();
            }
        }
        
    }, 300); 

});

/**
 * アプリケーションの主要なイベントリスナーを設定（修正版：安全なタクトタイム計算）
 */
function setupEventListeners() {
    // --- 基本設定の入力フィールドのイベントリスナー ---
    const operatingTimeInput = document.getElementById('operatingTime');
    const requiredQuantityInput = document.getElementById('requiredQuantity');
    const productNameInput = document.getElementById('productName');
    const operatorNameInput = document.getElementById('operatorName');

    // 稼働時間と必要数の変更を監視し、タクトタイムを再計算
    // ★修正：calculateTaktTime は既に安全なチャート更新に対応済み
    if (operatingTimeInput) {
        operatingTimeInput.addEventListener('input', debounce(() => calculateTaktTime(false), 20));
    }
    if (requiredQuantityInput) {
        requiredQuantityInput.addEventListener('input', debounce(() => calculateTaktTime(false), 20));
    }

    // 製品名と作業者名の変更を監視し、オートセーブを実行
    if (productNameInput) {
        productNameInput.addEventListener('input', triggerAutoSave);
    }
    if (operatorNameInput) {
        operatorNameInput.addEventListener('input', triggerAutoSave);
    }

    // 標準手持ち入力の変更を監視
    const standardWIPInput = document.getElementById('standardWIPInput');
    if (standardWIPInput) {
        standardWIPInput.addEventListener('change', debounce(() => onStandardWIPChange(), 100));
    }

    // --- 稼働時間設定の入力フィールドのイベントリスナー（新規追加） ---
    const scheduleStartTimeInput = document.getElementById('scheduleStartTime');
    const scheduleWorkHoursInput = document.getElementById('scheduleWorkHours');

    // 開始時間の変更を監視
    // ★修正：updateScheduleConfig は既に安全なチャート更新に対応済み
    if (scheduleStartTimeInput) {
        scheduleStartTimeInput.addEventListener('change', function() {
            updateScheduleConfig();
        });
        scheduleStartTimeInput.addEventListener('input', debounce(updateScheduleConfig, 300));
    }

    // 稼働時間の変更を監視
    if (scheduleWorkHoursInput) {
        scheduleWorkHoursInput.addEventListener('change', function() {
            updateScheduleConfig();
        });
        scheduleWorkHoursInput.addEventListener('input', debounce(updateScheduleConfig, 300));
    }

    // --- ドラッグ＆ドロップ操作のためのグローバルイベントリスナー ---
    // マウスが動いた時の処理（ドラッグ中）
    document.addEventListener('mousemove', handleGlobalMouseMove);
    // マウスボタンが離された時の処理（ドロップ時）
    document.addEventListener('mouseup', handleGlobalMouseUp);
}

/**
 * イベントリスナーとモーダル制御の設定
 */
function setupEventListenersAndModals() {
    try {
        
        // モーダル制御の初期化
        try {
            if (typeof initializeEnhancedModalControl === 'function') {
                initializeEnhancedModalControl();
            }
            
            if (typeof setupGlobalModalControls === 'function') {
                setupGlobalModalControls();
            }
        } catch (modalError) {
            console.error('Error setting up modal controls:', modalError);
        }
        
        // テキスト位置調整の初期化
        try {
            if (typeof initializeTextPositionAdjustment === 'function') {
                initializeTextPositionAdjustment();
            }
        } catch (textError) {
            console.error('Error initializing text position adjustment:', textError);
        }
        
        
    } catch (error) {
        console.error('Error in setupEventListenersAndModals:', error);
    }
}

// initializeApp関数を置き換える
window.initializeApp = initializeAppWithWelcome;

// initializer.js の末尾
document.addEventListener('DOMContentLoaded', function() {
    if (typeof initializeAppWithWelcome === 'function') {
        initializeAppWithWelcome();
    } else {
        console.error("Initialization function (initializeAppWithWelcome) not found.");
        // フォールバック処理
        if (typeof initializeBasicApp === 'function') {
            initializeBasicApp();
        }
    }
});