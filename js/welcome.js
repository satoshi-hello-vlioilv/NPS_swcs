// ========================================
// Welcome Screen Action Functions (Welcome画面アクション関数)
// ========================================

/**
 * 新規データでアプリケーションを開始
 */
function startNewData() {
    try {

        // 既存データをクリア
        if (typeof clearAllData === 'function') {
            clearAllData(false); // 確認なしでクリア
        } else {
            // フォールバック
            workItems = [];
            frequencyWorkItems = [];
            timeSlots = [];
        }

        // Welcome画面を非表示にし、メインアプリの初期化と表示を行う
        hideWelcomeScreen();
        
    } catch (error) {
        console.error('Error starting new data:', error);
        hideWelcomeScreen();
    }
}

/**
 * Welcome画面からインポートオプションを表示
 */
function showWelcomeImportOptions() {
    const importOptions = document.getElementById('welcomeImportOptions');
    if (importOptions) {
        // ★★★ 修正箇所: dataListの有無をチェックして「保存済みデータから読み込み」の表示を制御 ★★★
        const loadFromDataListBtn = document.getElementById('loadFromDataListOption');
        if (loadFromDataListBtn) {
            if (dataList && dataList.length > 0) {
                loadFromDataListBtn.style.display = 'flex';
            } else {
                loadFromDataListBtn.style.display = 'none';
            }
        }

        const isVisible = importOptions.style.display !== 'none';
        
        if (isVisible) {
            // 非表示にする
            importOptions.style.display = 'none';
        } else {
            // 表示する
            importOptions.style.display = 'grid';
            
            // アニメーション効果
            importOptions.style.opacity = '0';
            importOptions.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
                importOptions.style.transition = 'all 0.3s ease';
                importOptions.style.opacity = '1';
                importOptions.style.transform = 'translateY(0)';
            }, 10);
        }
    }
}

/**
 * Welcome画面からCSVインポート
 */
function importWelcomeCSV() {
    try {
        hideWelcomeScreen();
        
        // CSVインポート機能を呼び出し
        setTimeout(() => {
            if (typeof selectCSVFile === 'function') {
                selectCSVFile();
            } else if (typeof showCSVImportInfo === 'function') {
                showCSVImportInfo();
            } else {
                // フォールバック
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file && typeof importCSVFile === 'function') {
                        importCSVFile(file);
                    }
                };
                input.click();
            }
        }, 300);
        
    } catch (error) {
        console.error('Error importing CSV from welcome:', error);
        hideWelcomeScreen();
    }
}

/**
 * Welcome画面からJSONインポート
 */
function importWelcomeJSON() {
    try {
        hideWelcomeScreen();
        
        // JSONインポート機能を呼び出し
        setTimeout(() => {
            if (typeof importData === 'function') {
                importData();
            } else {
                // フォールバック
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            try {
                                const data = JSON.parse(e.target.result);
                                if (typeof loadDataFromObject === 'function') {
                                    loadDataFromObject(data);
                                }
                            } catch (error) {
                                console.error('JSON import error:', error);
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            }
        }, 300);
        
    } catch (error) {
        console.error('Error importing JSON from welcome:', error);
        hideWelcomeScreen();
    }
}

// ========================================
// Welcome Screen Help Functions (Welcome画面ヘルプ機能)
// ========================================

/**
 * 使い方ガイドを表示（デザイン改善・階層構造強化・スクロールアンカー追加版）
 */
function showWelcomeHelp() {
    const helpContent = `
        <div class="welcome-help-content">
            <div class="help-section">
                <h3 id="basic-usage-guide"><i class="fas fa-stream"></i> 基本的な使い方</h3>
                <div class="help-flow-container">
                    <!-- Step 1 -->
                    <div class="flow-step">
                        <div class="flow-step-number-container">
                            <div class="flow-step-number">1</div>
                            <div class="flow-step-line"></div>
                        </div>
                        <div class="flow-step-content">
                            <div class="flow-step-title">情報の入力と設定</div>
                            <div class="flow-step-detail">
                                まず、画面上部のカードに「製品名」や「作業者名」を入力します。「稼働時間」と「必要数」を設定すると、目標となる<strong>タクトタイム</strong>が自動で計算されます。
                            </div>
                        </div>
                    </div>
                    <!-- Step 2 -->
                    <div class="flow-step">
                        <div class="flow-step-number-container">
                            <div class="flow-step-number">2</div>
                            <div class="flow-step-line"></div>
                        </div>
                        <div class="flow-step-content">
                            <div class="flow-step-title">作業項目の登録</div>
                            <div class="flow-step-detail">
                                右パネルの「作業項目を追加」ボタン、またはチャートの空きスペースをダブルクリックして、個々の作業を登録します。手作業・自動送り・歩行の各時間を入力してください。
                            </div>
                        </div>
                    </div>
                    <!-- Step 3 -->
                    <div class="flow-step">
                         <div class="flow-step-number-container">
                            <div class="flow-step-number">3</div>
                            <div class="flow-step-line"></div>
                        </div>
                        <div class="flow-step-content">
                            <div class="flow-step-title">改善案の入力と比較</div>
                            <div class="flow-step-detail">
                                各作業項目の編集画面で「改善後」タブに切り替え、改善後の時間を入力します。右パネルの「改善後」または「併記」モードを選択すると、改善効果が即座にチャートに反映され、比較できます。
                            </div>
                        </div>
                    </div>
                    <!-- Step 4 -->
                    <div class="flow-step">
                         <div class="flow-step-number-container">
                            <div class="flow-step-number">4</div>
                        </div>
                        <div class="flow-step-content">
                            <div class="flow-step-title">詳細分析と最適化</div>
                            <div class="flow-step-detail">
                                <strong>「稼働時間」タブ</strong>で休憩などを設定し、より現実に即した分析を行います。<br>
                                <strong>「作業配分表」タブ</strong>で複数の改善パターンを保存・比較し、最適な作業バランスを検討します。
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="help-section">
                <h3><i class="fas fa-tools"></i> 主要機能</h3>
                <div class="feature-grid">
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-chart-gantt"></i></div>
                        <div class="feature-content">
                            <h4>標準作業組合せ票</h4>
                            <p>作業時間をガントチャートで可視化。改善前後の比較やタクトタイムとの対比が可能です。</p>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-project-diagram"></i></div>
                        <div class="feature-content">
                            <h4>工程確認チャート</h4>
                            <p>ロットごとの作業の流れを俯瞰し、工程間の連携や待ち時間を確認できます。</p>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-clock"></i></div>
                        <div class="feature-content">
                            <h4>稼働時間管理</h4>
                            <p>実際の就業スケジュールに基づき、休憩や段取り時間などを設定して正確な稼働率を分析します。</p>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-chart-bar"></i></div>
                        <div class="feature-content">
                            <h4>作業配分表</h4>
                            <p>保存した複数の改善パターンを横並びで比較し、最適な作業配分を検討できます。</p>
                        </div>
                    </div>
                     <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-arrows-alt-v"></i></div>
                        <div class="feature-content">
                            <h4>バラつき分析</h4>
                            <p>作業配分表で、作業時間の実績バラつき（エラーバー）を表示し、安定性を評価できます。</p>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-redo-alt"></i></div>
                        <div class="feature-content">
                            <h4>頻度作業管理</h4>
                            <p>定期的な点検や清掃など、サイクル外で発生する作業の影響を管理・分析できます。</p>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-arrows-alt"></i></div>
                        <div class="feature-content">
                            <h4>直感的な操作</h4>
                            <p>ドラッグ&ドロップでの作業順序変更や、CSV/JSON形式でのデータ入出力に対応しています。</p>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon"><i class="fas fa-font"></i></div>
                        <div class="feature-content">
                            <h4>文字位置調整</h4>
                            <p>チャート上の各ラベル位置を微調整し、印刷やレポート用に最適なレイアウトを作成できます。</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showWelcomeModal('使い方ガイド', helpContent, 'help');
}

/**
 * キーボードショートカットを表示（最新機能反映版）
 */
function showWelcomeShortcuts() {
    const shortcutsContent = `
        <div class="welcome-shortcuts-content">
            <div class="shortcuts-section">
                <h3><i class="fas fa-desktop"></i> 表示とタブの切り替え</h3>
                <div class="shortcut-grid">
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>1</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">改善前表示</span><span class="shortcut-detail">現在の作業時間で表示</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>2</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">改善後表示</span><span class="shortcut-detail">改善案の時間で表示</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>3</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">併記表示</span><span class="shortcut-detail">改善前後を同時表示</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>G</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">標準作業組合せ票</span><span class="shortcut-detail">メインの分析画面に切替</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>D</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">作業配分表</span><span class="shortcut-detail">複数データの比較画面に切替</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>H</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">稼働時間</span><span class="shortcut-detail">スケジュール管理画面に切替</span></div>
                    </div>
                </div>
            </div>
            
            <div class="shortcuts-section">
                <h3><i class="fas fa-edit"></i> 編集と追加</h3>
                <div class="shortcut-grid">
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><span class="key-combo">ダブルクリック</span></div>
                        <div class="shortcut-desc"><span class="shortcut-name">項目編集 / 追加</span><span class="shortcut-detail">チャート上で直接操作</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>F</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">頻度作業追加</span><span class="shortcut-detail">定期作業を登録</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>M</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">並び替え / 追加</span><span class="shortcut-detail">ガントチャートで並び替え、稼働時間で時間帯追加</span></div>
                    </div>
                     <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">モーダルで保存</span><span class="shortcut-detail">開いている編集画面を保存</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Esc</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">モーダルを閉じる</span><span class="shortcut-detail">編集画面をキャンセル</span></div>
                    </div>
                </div>
            </div>

            <div class="shortcuts-section">
                <h3><i class="fas fa-database"></i> データ操作</h3>
                <div class="shortcut-grid">
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>S</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">データ保存</span><span class="shortcut-detail">現在のデータをリストに保存/上書き</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>E</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">データ出力</span><span class="shortcut-detail">JSONファイルとしてエクスポート</span></div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>I</kbd></div>
                        <div class="shortcut-desc"><span class="shortcut-name">データ読込</span><span class="shortcut-detail">JSONファイルからインポート</span></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showWelcomeModal('キーボードショートカット', shortcutsContent, 'shortcuts');
}

function showWelcomeModal(title, content, type = 'default') {

    const existingModal = document.getElementById('welcomeModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHTML = `
        <div id="welcomeModal" class="welcome-modal welcome-modal-${type}" onclick="closeWelcomeModal(event)">
            <div class="welcome-modal-content" onclick="event.stopPropagation()">
                <div class="welcome-modal-header">
                    <h2>${title}</h2>
                    <div class="welcome-modal-controls">
                        ${type === 'help' ? '<button class="modal-action-btn" onclick="printWelcomeHelp()" title="印刷"><i class="fas fa-print"></i></button>' : ''}
                        ${type === 'shortcuts' ? '<button class="modal-action-btn" onclick="downloadShortcuts()" title="ダウンロード"><i class="fas fa-download"></i></button>' : ''}
                        <button class="welcome-modal-close" onclick="closeWelcomeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="welcome-modal-body">
                    ${content}
                </div>
                <div class="welcome-modal-footer">
                    <div class="modal-footer-info">
                        <span class="modal-version">Ver ${APP_VERSION}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // モーダル用スタイルを追加
    addWelcomeModalStyles();
    
    // フェードイン効果
    const modal = document.getElementById('welcomeModal');
    setTimeout(() => {
        modal.classList.add('welcome-modal-show');
    }, 10);
    
    // ESCキーでモーダルを閉じる
    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            closeWelcomeModal();
            document.removeEventListener('keydown', handleEscKey);
        }
    };
    document.addEventListener('keydown', handleEscKey);
}

/**
 * Welcome画面用モーダルを閉じる
 */
function closeWelcomeModal(event) {
    const modal = document.getElementById('welcomeModal');
    if (modal) {
        modal.classList.add('welcome-modal-hide');
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

/**
 * Welcome画面用モーダルのスタイルを追加（デザイン刷新・フロー表示対応版）
 */
function addWelcomeModalStyles() {
    if (document.getElementById('welcomeModalStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'welcomeModalStyles';
    style.textContent = `
        /* --- Modal Base --- */
        .welcome-modal {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.6); /* ダークブルーの背景 */
            display: flex; align-items: center; justify-content: center;
            z-index: 6000; opacity: 0;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(4px);
        }
        .welcome-modal-show { opacity: 1; }
        .welcome-modal-hide { opacity: 0; }
        
        /* --- Modal Content --- */
        .welcome-modal-content {
            background: #ffffff; 
            border-radius: 8px;
            max-width: 850px; width: 95%; max-height: 90vh;
            display: flex; flex-direction: column;
            transform: translateY(-20px) scale(0.98);
            transition: transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            border: 1px solid #e2e8f0;
            overflow: hidden;
        }
        .welcome-modal-show .welcome-modal-content { transform: translateY(0) scale(1); }
        
        /* --- Modal Header --- */
        .welcome-modal-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e2e8f0;
            background-color: #f8fafc;
        }
        .welcome-modal-header h2 {
            margin: 0; font-size: 20px; font-weight: 600;
            color: #1f2937;
        }
        .welcome-modal-controls { display: flex; align-items: center; gap: 8px; }
        .modal-action-btn, .welcome-modal-close {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            font-size: 14px;
            color: #475569;
            cursor: pointer; padding: 6px;
            border-radius: 6px;
            transition: all 0.2s ease;
        }
        .modal-action-btn:hover, .welcome-modal-close:hover {
            color: #1f2937; background: #e2e8f0;
            border-color: #cbd5e1;
        }
        
        /* --- Modal Body --- */
        .welcome-modal-body {
            padding: 24px 28px; overflow-y: auto;
            background-color: #ffffff;
        }
        .help-section, .shortcuts-section { margin-bottom: 24px; }
        .help-section h3, .shortcuts-section h3 {
            font-size: 16px; color: #1e40af;
            border-bottom: 2px solid #dbeafe;
            padding-bottom: 6px; margin-bottom: 16px;
            display: flex; align-items: center; gap: 8px;
        }

        /* ★★★★★ ここからが新しいスタイル ★★★★★ */
        /* --- Help Flow Styles for "基本的な使い方" --- */
        .help-flow-container {
            display: flex;
            flex-direction: column;
        }
        .flow-step {
            display: flex;
            gap: 20px;
            position: relative;
        }
        .flow-step-number-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex-shrink: 0;
        }
        .flow-step-number {
            width: 32px;
            height: 32px;
            background-color: #eef2ff;
            color: #3730a3;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 14px;
            border: 2px solid #c7d2fe;
            z-index: 1;
        }
        .flow-step-line {
            width: 2px;
            background-color: #c7d2fe;
            flex-grow: 1;
        }
        .flow-step-content {
            padding-bottom: 28px;
            flex-grow: 1;
        }
        .flow-step-title {
            font-size: 16px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 6px;
        }
        .flow-step-detail {
            font-size: 14px;
            color: #475569;
            line-height: 1.6;
        }
        .flow-step-detail strong {
            color: #1e40af;
            font-weight: 600;
        }
        /* ★★★★★ ここまでが新しいスタイル ★★★★★ */
        
        /* --- Help Modal Styles --- */
        .feature-grid, .tips-grid { display: grid; gap: 16px; }
        .feature-grid { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
        .feature-item {
            display: flex; align-items: center; gap: 16px;
            background: #f8fafc; padding: 16px; border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .feature-item .feature-icon {
            width: 40px; height: 40px; border-radius: 8px;
            background: #dbeafe; color: #4338ca;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px;
        }
        .feature-item h4 { font-size: 15px; margin: 0 0 4px 0; color: #1e293b; }
        .feature-item p { font-size: 13px; margin: 0; color: #475569; line-height: 1.5; }
        
        .tips-grid { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
        .tip-item {
            display: flex; align-items: center; gap: 10px;
            font-size: 13px; color: #334155;
            background-color: #f1f5f9; padding: 10px; border-radius: 6px;
        }
        .tip-item i { color: #2563eb; }
        
        /* --- Shortcuts Modal Styles --- */
        .shortcut-grid {
            display: grid; gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        }
        .shortcut-item {
            display: flex; align-items: center; gap: 16px;
            background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;
        }
        .shortcut-keys { display: flex; align-items: center; gap: 6px; }
        .shortcut-keys kbd, .shortcut-keys .key-combo {
            background: #e2e8f0; border: 1px solid #cbd5e1;
            border-bottom-width: 2px; border-radius: 4px;
            padding: 4px 10px; font-size: 14px; font-weight: 600;
            color: #334155;
        }
        .shortcut-desc { display: flex; flex-direction: column; }
        .shortcut-name { font-weight: 600; color: #1f2937; }
        .shortcut-detail { font-size: 12px; color: #64748b; }
        
        /* --- Modal Footer --- */
        .welcome-modal-footer {
            padding: 12px 24px; 
            border-top: 1px solid #e2e8f0;
            background: #f8fafc;
            display: flex;
            justify-content: space-between; align-items: center;
        }
        .modal-version {
            font-size: 11px; color: #9ca3af; font-weight: 500;
        }
        .modal-help-text {
            font-size: 11px; color: #64748b;
        }
        .help-link { color: #2563eb; cursor: pointer; text-decoration: underline; }
        
        /* --- Responsive --- */
        @media (max-width: 768px) {
            .feature-grid, .shortcut-grid { grid-template-columns: 1fr; }
            .welcome-modal-header h2 { font-size: 18px; }
            .welcome-modal-body { padding: 16px; }
        }
    `;
    
    document.head.appendChild(style);
}

// ========================================
// Integration with Existing App Initialization (既存アプリ初期化との統合)
// ========================================



/**
 * ヘルプ内容を印刷
 * welcome.js に追加
 */
function printWelcomeHelp() {
    const printContent = document.querySelector('.welcome-help-content').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>標準作業組合せ票 - 使い方ガイド</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
                    h3 { font-size: 1.2em; color: #1e40af; border-bottom: 2px solid #dbeafe; padding-bottom: 8px; margin-top: 24px; }
                    ol { list-style: none; padding-left: 0; counter-reset: step-counter; }
                    li { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
                    li::before {
                        content: counter(step-counter); counter-increment: step-counter;
                        background: #dbeafe; color: #1e3a8a; font-weight: 700;
                        width: 24px; height: 24px; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center;
                        flex-shrink: 0; font-size: 12px;
                    }
                    strong { color: #1f2937; display: block; }
                    .feature-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
                    .feature-item { border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; }
                    .tips-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
                </style>
            </head>
            <body>
                <h1>標準作業組合せ票 - 使い方ガイド</h1>
                ${printContent}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

/**
 * ショートカット一覧をダウンロード
 * welcome.js に追加
 */
function downloadShortcuts() {
    const shortcuts = [
        'キーボードショートカット一覧',
        '',
        '■ 表示モード切り替え:',
        '  Ctrl + 1: 改善前表示',
        '  Ctrl + 2: 改善後表示', 
        '  Ctrl + 3: 併記表示',
        '',
        '■ タブ切り替え:',
        '  Ctrl + G: ガントチャート',
        '  Ctrl + D: 作業配分表',
        '  Ctrl + H: 稼働時間',
        '',
        '■ データ操作:',
        '  Ctrl + S: データ保存',
        '  Ctrl + E: データ出力 (JSON)',
        '  Ctrl + I: データ読み込み (JSON)',
        '  Ctrl + M: 並び替え管理',
        '',
        '■ 追加・編集:',
        '  Ctrl + F: 頻度作業追加',
        '  ダブルクリック: チャート上で項目編集・追加',
        '  Esc: モーダルを閉じる',
        '  Ctrl + Enter: モーダル内で保存'
    ].join('\n');
    
    const blob = new Blob([shortcuts], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '標準作業組合せ票_ショートカット一覧.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Welcome画面から通常画面への統合切り替え処理
 * 全ての修正された関数を統合して確実な切り替えを実現
 */

/**
 * サンプルデータでアプリケーションを開始（修正版：フォールバック処理改善）
 */
function loadWelcomeSampleData() {
    try {
        
        // 確認モーダル用CSSを事前に追加
        addWelcomeConfirmModalStyles();
        
        // initiateSampleDataLoad の存在チェック（より確実な方法）
        if (typeof window.initiateSampleDataLoad === 'function') {
            // 既存の関数が利用可能な場合
            window.initiateSampleDataLoad(hideWelcomeScreen);
        } else {
            // フォールバック：独自の確認モーダルを表示
            showWelcomeConfirmModal(
                'サンプルデータの読み込み',
                '現在の作業データはすべてクリアされ、サンプルデータで置き換えられます。<br><br><strong>この操作は取り消せません。</strong><br><br>続行しますか？',
                () => {
                    // 確認後の処理
                    try {
                        // サンプルデータの読み込み
                        if (typeof loadSampleData === 'function') {
                            loadSampleData();
                        } else {
                            createEnhancedSampleData();
                        }
                        
                        // Welcome画面を非表示
                        hideWelcomeScreen();
                        
                        // 成功メッセージ
                        setTimeout(() => {
                            if (typeof showNotificationBanner === 'function') {
                                showNotificationBanner('サンプルデータを読み込みました。さっそく作業分析を始めましょう！', 'success', 3000);
                            }
                        }, 500);
                        
                    } catch (error) {
                        console.error('Error loading sample data:', error);
                        if (typeof showNotificationBanner === 'function') {
                            showNotificationBanner('サンプルデータの読み込みに失敗しました。', 'error', 3000);
                        }
                    }
                }
            );
        }
        
    } catch (error) {
        console.error('Error in loadWelcomeSampleData:', error);
        
        // エラー時のフォールバック
        hideWelcomeScreen();
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('サンプルデータの読み込み中にエラーが発生しました。', 'error', 3000);
        }
    }
}


/**
 * Welcome画面用の確認モーダルを表示（修正版：スタイル適用改善）
 * @param {string} title - モーダルのタイトル
 * @param {string} message - 表示するメッセージ (HTML可)
 * @param {function} onConfirm - 「はい」が押されたときに実行されるコールバック
 */
function showWelcomeConfirmModal(title, message, onConfirm) {
    try {
        
        // 既存のモーダルがあれば削除
        closeWelcomeConfirmModal();
        
        // CSSスタイルを確実に適用
        addWelcomeConfirmModalStyles();
        
        const modalHTML = `
            <div id="welcomeConfirmModal" class="welcome-confirm-modal">
                <div class="welcome-confirm-overlay"></div>
                <div class="welcome-confirm-content">
                    <div class="welcome-confirm-header">
                        <div class="welcome-confirm-icon">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 class="welcome-confirm-title">${title}</h3>
                    </div>
                    <div class="welcome-confirm-body">
                        <div class="welcome-confirm-message">${message}</div>
                    </div>
                    <div class="welcome-confirm-footer">
                        <button id="welcomeConfirmCancel" class="welcome-confirm-btn btn-cancel">
                            <i class="fas fa-times"></i>
                            キャンセル
                        </button>
                        <button id="welcomeConfirmOK" class="welcome-confirm-btn btn-confirm">
                            <i class="fas fa-check"></i>
                            はい、読み込みます
                        </button>
                    </div>
                </div>
            </div>
        `;

        // モーダルをDOMに追加
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 要素の取得
        const modal = document.getElementById('welcomeConfirmModal');
        const confirmBtn = document.getElementById('welcomeConfirmOK');
        const cancelBtn = document.getElementById('welcomeConfirmCancel');
        const overlay = modal.querySelector('.welcome-confirm-overlay');
        
        if (!modal || !confirmBtn || !cancelBtn) {
            throw new Error('Modal elements not found after insertion');
        }
        
        // イベントリスナーの設定
        confirmBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeWelcomeConfirmModal();
            if (typeof onConfirm === 'function') {
                setTimeout(onConfirm, 100); // 少し遅延させて確実に実行
            }
        };
        
        cancelBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeWelcomeConfirmModal();
        };
        
        // オーバーレイクリックで閉じる
        overlay.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeWelcomeConfirmModal();
        };
        
        // コンテンツクリックでは閉じない
        modal.querySelector('.welcome-confirm-content').onclick = (e) => {
            e.stopPropagation();
        };
        
        // ESCキーでモーダルを閉じる
        const handleEscKey = (e) => {
            if (e.key === 'Escape') {
                closeWelcomeConfirmModal();
                document.removeEventListener('keydown', handleEscKey);
            }
        };
        document.addEventListener('keydown', handleEscKey);
        
        // 表示アニメーション（確実な実行）
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        });
        
    } catch (error) {
        console.error('Error in showWelcomeConfirmModal:', error);
        
        // エラー時のフォールバック：ブラウザの標準confirm
        const userConfirmed = confirm(`${title}\n\n${message.replace(/<[^>]*>/g, '')}\n\n続行しますか？`);
        if (userConfirmed && typeof onConfirm === 'function') {
            onConfirm();
        }
    }
}


/**
 * Welcome画面用の確認モーダルを閉じる（修正版：エラーハンドリング強化）
 */
function closeWelcomeConfirmModal() {
    try {
        const modal = document.getElementById('welcomeConfirmModal');
        if (modal) {
            modal.classList.remove('show');
            modal.classList.add('hide');
            
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.remove();
                }
            }, 300);
        }
    } catch (error) {
        console.error('Error in closeWelcomeConfirmModal:', error);
        
        // エラー時の強制削除
        try {
            const modal = document.getElementById('welcomeConfirmModal');
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        } catch (forceError) {
            console.error('Force removal also failed:', forceError);
        }
    }
}

/**
 * Welcome画面用確認モーダルのスタイルを追加（新規：専用CSS）
 */
function addWelcomeConfirmModalStyles() {
    // 既に追加済みの場合はスキップ
    if (document.getElementById('welcomeConfirmModalStyles')) {
        return;
    }
    
    try {
        const style = document.createElement('style');
        style.id = 'welcomeConfirmModalStyles';
        style.textContent = `
            /* Welcome Confirm Modal Base Styles */
            .welcome-confirm-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .welcome-confirm-modal.show {
                opacity: 1;
                visibility: visible;
            }
            
            .welcome-confirm-modal.hide {
                opacity: 0;
                visibility: hidden;
            }
            
            .welcome-confirm-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(15, 23, 42, 0.8);
                backdrop-filter: blur(4px);
            }
            
            .welcome-confirm-content {
                position: relative;
                background: white;
                border-radius: 12px;
                max-width: 480px;
                width: 90%;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
                transform: translateY(-20px) scale(0.95);
                transition: transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            }
            
            .welcome-confirm-modal.show .welcome-confirm-content {
                transform: translateY(0) scale(1);
            }
            
            /* Header Styles */
            .welcome-confirm-header {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 24px 28px 16px 28px;
                border-bottom: 1px solid #e2e8f0;
            }
            
            .welcome-confirm-icon {
                width: 48px;
                height: 48px;
                background: #fef3c7;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #d97706;
                font-size: 24px;
                flex-shrink: 0;
            }
            
            .welcome-confirm-title {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                color: #1f2937;
                line-height: 1.3;
            }
            
            /* Body Styles */
            .welcome-confirm-body {
                padding: 20px 28px;
            }
            
            .welcome-confirm-message {
                font-size: 15px;
                line-height: 1.6;
                color: #374151;
            }
            
            .welcome-confirm-message strong {
                color: #dc2626;
                font-weight: 600;
            }
            
            /* Footer Styles */
            .welcome-confirm-footer {
                display: flex;
                gap: 12px;
                padding: 20px 28px 24px 28px;
                justify-content: flex-end;
            }
            
            .welcome-confirm-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                min-width: 120px;
                justify-content: center;
            }
            
            .welcome-confirm-btn:focus {
                outline: none;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
            }
            
            .btn-cancel {
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #d1d5db;
            }
            
            .btn-cancel:hover {
                background: #e5e7eb;
                color: #1f2937;
                transform: translateY(-1px);
            }
            
            .btn-confirm {
                background: #dc2626;
                color: white;
                border: 1px solid #dc2626;
            }
            
            .btn-confirm:hover {
                background: #b91c1c;
                border-color: #b91c1c;
                transform: translateY(-1px);
            }
            
            /* Responsive */
            @media (max-width: 640px) {
                .welcome-confirm-content {
                    width: 95%;
                    margin: 16px;
                }
                
                .welcome-confirm-header {
                    padding: 20px 20px 16px 20px;
                }
                
                .welcome-confirm-body {
                    padding: 16px 20px;
                }
                
                .welcome-confirm-footer {
                    padding: 16px 20px 20px 20px;
                    flex-direction: column;
                }
                
                .welcome-confirm-btn {
                    width: 100%;
                    min-width: auto;
                }
            }
        `;
        
        document.head.appendChild(style);
   
    } catch (error) {
        console.error('Error adding welcome confirm modal styles:', error);
    }
}

/**
 * 強化されたサンプルデータの読み込み
 */
function loadEnhancedSampleData() {
    try {
        
        // 既存のサンプルデータ読み込み関数を使用
        if (typeof loadSampleData === 'function') {
            loadSampleData();
        } else {
            // フォールバック：手動でサンプルデータを作成
            createEnhancedSampleData();
        }
        
        // データ読み込み後の初期化
        setTimeout(() => {
            initializeAfterSampleData();
        }, 200);
        
    } catch (error) {
        console.error('Error in loadEnhancedSampleData:', error);
        createEnhancedSampleData();
    }
}

/**
 * サンプルデータ読み込み後の初期化
 */
function initializeAfterSampleData() {
    try {
        
        // 基本初期化
        if (typeof initializeWorkOrders === 'function') {
            initializeWorkOrders();
        }
        
        if (typeof calculateTaktTime === 'function') {
            calculateTaktTime();
        }
        
        // UI更新
        if (typeof updateTimeSlotList === 'function') {
            updateTimeSlotList();
        }
        
        if (typeof updateFrequencyWorkList === 'function') {
            updateFrequencyWorkList();
        }
        
        if (typeof updateWorkingTimeDisplay === 'function') {
            updateWorkingTimeDisplay();
        }
        
        // チャート更新
        setTimeout(() => {
            updateAllChartsAfterDataLoad();
        }, 100);
        
        // 成功メッセージ
        setTimeout(() => {
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('サンプルデータを読み込みました。さっそく作業分析を始めましょう！', 'success', 3000);
            }
        }, 500);
        
    } catch (error) {
        console.error('Error in initializeAfterSampleData:', error);
    }
}

/**
 * 強化されたサンプルデータの作成（フォールバック用）
 */
function createEnhancedSampleData() {
    try {
        
        // 作業項目データ
        window.workItems = [
            { 
                id: 1, 
                name: 'ベースクレーンでライン投入', 
                manualTime: 4, 
                autoTime: 0, 
                walkTime: 1,
                category: 'normal',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 3, autoTime: 0, walkTime: 1 }
            },
            { 
                id: 2, 
                name: 'フロント溶接データのフィルム貼り', 
                manualTime: 3, 
                autoTime: 0, 
                walkTime: 1,
                category: 'normal',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 2, autoTime: 0, walkTime: 1 }
            },
            { 
                id: 3, 
                name: 'ベースに溶接をセット', 
                manualTime: 2, 
                autoTime: 0, 
                walkTime: 1,
                category: 'normal',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 2, autoTime: 0, walkTime: 0 }
            },
            { 
                id: 4, 
                name: 'リブフレーム溶接', 
                manualTime: 2, 
                autoTime: 5, 
                walkTime: 1,
                category: 'normal',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 1, autoTime: 5, walkTime: 1 }
            },
            { 
                id: 5, 
                name: 'ベース内周フィクサー溶布', 
                manualTime: 3, 
                autoTime: 0, 
                walkTime: 0,
                category: 'normal',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 2, autoTime: 0, walkTime: 0 }
            },
            { 
                id: 6, 
                name: '検査・品質確認', 
                manualTime: 2, 
                autoTime: 0, 
                walkTime: 1,
                category: 'monitor',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 2, autoTime: 0, walkTime: 1 }
            },
            { 
                id: 7, 
                name: '次ロットへの移送', 
                manualTime: 1, 
                autoTime: 3, 
                walkTime: 0,
                category: 'normal',
                process: 'lot1',
                targetScope: 'common',
                improved: { manualTime: 1, autoTime: 3, walkTime: 0 }
            }
        ];
        
        // 頻度作業データ
        window.frequencyWorkItems = [
            {
                id: 1,
                name: '品質チェック',
                workTime: 30,
                frequency: '10個に1回',
                notes: '寸法測定と外観検査'
            },
            {
                id: 2,
                name: '設備清掃',
                workTime: 180,
                frequency: '1時間に1回',
                notes: 'チップ除去と潤滑'
            }
        ];
        
        // 時間帯データ
        window.timeSlots = [
            {
                id: 1,
                name: '朝礼',
                type: 'meeting',
                startTime: '08:00',
                endTime: '08:30',
                notes: '今日の作業予定と安全確認'
            },
            {
                id: 2,
                name: '午前休憩',
                type: 'break',
                startTime: '10:00',
                endTime: '10:15',
                notes: '15分間の休憩'
            },
            {
                id: 3,
                name: '昼休み',
                type: 'break',
                startTime: '12:00',
                endTime: '12:45',
                notes: '昼食休憩'
            }
        ];
        
        // 基本設定
        const productNameEl = document.getElementById('productName');
        const operatorNameEl = document.getElementById('operatorName');
        const operatingTimeEl = document.getElementById('operatingTime');
        const requiredQuantityEl = document.getElementById('requiredQuantity');
        
        if (productNameEl) productNameEl.value = '溶接ベースアッセンブリ';
        if (operatorNameEl) operatorNameEl.value = 'サンプル作業者';
        if (operatingTimeEl) operatingTimeEl.value = '420';
        if (requiredQuantityEl) requiredQuantityEl.value = '800';
        
        // 稼働時間設定
        window.scheduleConfig = {
            startTime: '08:00',
            workHours: 8,
            endTime: '17:00'
        };
        
        const scheduleStartTimeEl = document.getElementById('scheduleStartTime');
        const scheduleWorkHoursEl = document.getElementById('scheduleWorkHours');
        
        if (scheduleStartTimeEl) scheduleStartTimeEl.value = '08:00';
        if (scheduleWorkHoursEl) scheduleWorkHoursEl.value = '8';
        
  
    } catch (error) {
        console.error('Error creating enhanced sample data:', error);
    }
}

/**
 * Welcome画面からのインポート処理の修正
 */
function importWelcomeCSV() {
    try {
        // Welcome画面を非表示
        hideWelcomeScreen();
        
        // CSV インポート処理（遅延実行）
        setTimeout(() => {
            if (typeof selectCSVFile === 'function') {
                selectCSVFile();
            } else if (typeof showCSVImportInfo === 'function') {
                showCSVImportInfo();
            } else {
                // フォールバック
                triggerCSVFileSelection();
            }
        }, 300);
        
    } catch (error) {
        console.error('Error importing CSV from welcome:', error);
        hideWelcomeScreen();
    }
}

/**
 * CSV ファイル選択のトリガー（フォールバック）
 */
function triggerCSVFileSelection() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (file && typeof importCSVFile === 'function') {
                importCSVFile(file);
            }
        };
        input.click();
    } catch (error) {
        console.error('Error in triggerCSVFileSelection:', error);
    }
}

/**
 * Welcome画面からのJSONインポート処理の修正
 */
function importWelcomeJSON() {
    try {
        // Welcome画面を非表示
        hideWelcomeScreen();
        
        // JSON インポート処理（遅延実行）
        setTimeout(() => {
            if (typeof importData === 'function') {
                importData();
            } else {
                // フォールバック
                triggerJSONFileSelection();
            }
        }, 300);
        
    } catch (error) {
        console.error('Error importing JSON from welcome:', error);
        hideWelcomeScreen();
    }
}

/**
 * JSON ファイル選択のトリガー（フォールバック）
 */
function triggerJSONFileSelection() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (typeof loadDataFromObject === 'function') {
                            loadDataFromObject(data);
                        }
                    } catch (error) {
                        console.error('JSON import error:', error);
                        if (typeof showNotificationBanner === 'function') {
                            showNotificationBanner('JSONファイルの読み込みに失敗しました。', 'error', 3000);
                        }
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    } catch (error) {
        console.error('Error in triggerJSONFileSelection:', error);
    }
}

/**
 * 保存済みデータから読み込み
 */
function loadFromWelcomeDataList() {
    try {
        if (!dataList || dataList.length === 0) {
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('保存済みデータがありません。', 'warning', 2500);
            }
            return;
        }
        // 最新のデータを取得 (createdAtで降順ソートして最初の要素)
        const latestData = [...dataList].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

        if (latestData) {
            // 最新データを読み込む
            if (typeof loadDataFromObject === 'function') {
                loadDataFromObject(latestData.data);
            }
            // 現在のデータIDを設定
            currentDataId = latestData.id;

            // チャートの表示設定を強制的にONにする
            showGanttChart = true;
            showProcessChart = true;
            showFrequencyChart = true;

            // メインタブをガントチャートに設定
            currentMainTab = 'gantt';

            // Welcome画面を非表示にしてメインアプリへ
            hideWelcomeScreen();

            // 画面遷移後にUIを更新
            setTimeout(() => {
                // セレクトボックスの値を更新
                const select = document.getElementById('dataListSelect');
                if(select) {
                    select.value = currentDataId;
                    updateDeleteButtonVisibility(); // 削除ボタンの表示も更新
                    updateSaveButtonUI(); // 保存ボタンのUIも更新
                }
                
                // 表示設定トグルスイッチの状態を更新
                const ganttToggle = document.getElementById('showGanttChart');
                const processToggle = document.getElementById('showProcessChart');
                const freqToggle = document.getElementById('showFrequencyChart');
                if(ganttToggle) ganttToggle.checked = true;
                if(processToggle) processToggle.checked = true;
                if(freqToggle) freqToggle.checked = true;

                // メインタブのUIを更新
                 if (typeof switchMainTab === 'function') {
                    switchMainTab('gantt');
                }

                // 全てのチャートを再描画
                if(typeof updateAllChartsAfterDataLoad === 'function') {
                    updateAllChartsAfterDataLoad();
                }

                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner(`最新データ「${latestData.name}」を読み込み、推奨設定で表示しました。`, 'success', 3000);
                }
            }, 500); // 画面遷移のアニメーションを待つ
        } else {
            // データがない場合は通常通り新規作成フローへ
            startNewData();
        }

    } catch (error) {
        console.error('Error loading from data list:', error);
        hideWelcomeScreen();
    }
}