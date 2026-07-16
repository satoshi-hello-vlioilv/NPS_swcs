// ========================================
// Enhanced Modal Manager - Work Item, Time Slot & Frequency Work Modal Management (Business Optimized)
// ========================================

// タブ管理用のグローバル変数
let currentActiveTab = 'current';
let currentActiveFrequencyTab = 'current'; // 頻度作業モーダル専用
let originalWorkItemData = null;
let originalFrequencyWorkData = null;

/**
 * 標準手持ち数に基づいて工程内分類（ロット）の選択肢を動的に生成する。
 * standardWIP = N のとき、サイクル内には N+1 ロットが混在するため、
 * lot1 〜 lot(N+1) の選択肢を構築する。
 * 現在の選択値を可能な限り維持し、範囲外の場合は lot1 に戻す。
 */
function updateLotOptions() {
    const select = document.getElementById('workProcess');
    if (!select) return;

    const totalLots = (typeof standardWIP === 'number' && standardWIP >= 0)
        ? standardWIP + 1
        : 1;

    // ロットラベル生成（lot1=当ロット、lot2=次ロット、lot3以降=Nロット目）
    const getLotLabel = (n) => {
        if (n === 1) return '当ロット';
        if (n === 2) return '次ロット';
        return `${n}ロット目`;
    };

    const prevValue = select.value || 'lot1';
    select.innerHTML = '';

    for (let i = 1; i <= totalLots; i++) {
        const opt = document.createElement('option');
        opt.value = `lot${i}`;
        opt.textContent = getLotLabel(i);
        select.appendChild(opt);
    }

    // 前の選択値が有効な範囲内なら維持、範囲外なら lot1 に戻す
    const prevLotNum = parseInt(prevValue.replace('lot', ''), 10);
    select.value = (prevLotNum >= 1 && prevLotNum <= totalLots) ? prevValue : 'lot1';
}

/**
 * 作業項目モーダルのタブを切り替える
 * @param {string} tabName - タブ名（'current' または 'improved'）
 */
function switchTab(tabName) {
    // タブボタンの状態を更新
    document.querySelectorAll('#workModal .tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`#workModal #${tabName}Tab`).classList.add('active');

    // タブコンテンツの表示を更新
    document.querySelectorAll('#workModal .tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`#workModal #${tabName}Content`).classList.add('active');

    currentActiveTab = tabName;

    // スライダーとイベントリスナーを再設定
    setupTimeInputListeners();
}

/**
 * 頻度作業モーダルのタブを切り替える (新規関数)
 * @param {string} tabName - タブ名（'current' または 'improved'）
 */
function switchFrequencyTab(tabName) {
    // タブボタンの状態を更新
    document.querySelectorAll('#frequencyWorkModal .tab-button').forEach(btn => btn.classList.remove('active'));
    const activeButton = document.querySelector(`#frequencyWorkModal #${tabName}FrequencyTab`);
    if (activeButton) activeButton.classList.add('active');

    // タブコンテンツの表示を更新
    document.querySelectorAll('#frequencyWorkModal .tab-content').forEach(content => content.classList.remove('active'));
    const activeContent = document.querySelector(`#frequencyWorkModal #${tabName}FrequencyContent`);
    if (activeContent) activeContent.classList.add('active');

    currentActiveFrequencyTab = tabName;
}

// ========================================
// 作業項目ナビゲーター (Work Item Navigator)
// 認知心理学：位置の明示 / 再認優先 / 境界の可視化 / 操作の確実性
// ========================================

/** ナビゲーターのキーボードハンドラ参照（teardown用） */
let _workItemNavKeyHandler = null;

/**
 * 作業項目ナビゲーターUIを生成・更新する。
 * 既存作業を編集中 (workId != null) かつ displayItems が 2件以上のとき表示。
 * @param {number|null} workId - 現在編集中の作業項目ID
 */
function renderWorkItemNavigator(workId) {
    // ナビゲーターコンテナを取得または初期生成
    let navBar = document.getElementById('workItemNavBar');
    if (!navBar) {
        const header = document.querySelector('#workModal .modal-header');
        if (!header) return;
        navBar = document.createElement('div');
        navBar.id = 'workItemNavBar';
        header.insertAdjacentElement('afterend', navBar);
    }

    // 非表示条件：新規作成 or 表示項目が1件以下
    const displayItems = (typeof getDisplayWorkItems === 'function') ? getDisplayWorkItems() : [];
    if (!workId || displayItems.length < 2) {
        navBar.style.display = 'none';
        return;
    }

    const idx   = displayItems.findIndex(it => it.id === workId);
    if (idx === -1) { navBar.style.display = 'none'; return; }

    const total   = displayItems.length;
    const hasPrev = idx > 0;
    const hasNext = idx < total - 1;
    const prevName = hasPrev ? (displayItems[idx - 1].name || '（名称未設定）') : null;
    const nextName = hasNext ? (displayItems[idx + 1].name || '（名称未設定）') : null;

    navBar.style.cssText = [
        'display:flex', 'align-items:center', 'height:38px',
        'background:linear-gradient(to bottom,#f0f4ff,#e8eeff)',
        'border-bottom:1px solid #c7d2fe',
        'user-select:none', 'overflow:hidden', 'flex-shrink:0',
    ].join(';');
    navBar.innerHTML = '';

    // ── 前へボタン ──
    navBar.appendChild(_makeNavBtn(
        hasPrev, 'fa-chevron-left',
        hasPrev ? `前の作業項目へ\n${prevName}\n（Alt+←）` : '最初の作業項目です',
        () => _navigateWorkItem(idx - 1, displayItems)
    ));

    // ── 中央：バッジ + 項目名 ──
    const center = document.createElement('div');
    center.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;gap:9px;padding:0 4px;overflow:hidden;min-width:0;';

    const badge = document.createElement('span');
    badge.style.cssText = [
        'flex-shrink:0', 'font-size:11px', 'font-weight:700',
        'color:#fff', 'background:#3b5bdb',
        'padding:2px 9px', 'border-radius:10px',
        'letter-spacing:0.04em', 'white-space:nowrap',
    ].join(';');
    badge.textContent = `${idx + 1} / ${total}`;

    const nameLbl = document.createElement('span');
    const curName = displayItems[idx].name || '（名称未設定）';
    nameLbl.style.cssText = [
        'font-size:12px', 'font-weight:600', 'color:#1e3a8a',
        'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
        'max-width:240px',
    ].join(';');
    nameLbl.title = curName;
    nameLbl.textContent = curName;

    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:10px;color:#6272a4;white-space:nowrap;flex-shrink:0;';
    hint.textContent = 'Alt+← / Alt+→';

    center.appendChild(badge);
    center.appendChild(nameLbl);
    center.appendChild(hint);
    navBar.appendChild(center);

    // ── 次へボタン ──
    navBar.appendChild(_makeNavBtn(
        hasNext, 'fa-chevron-right',
        hasNext ? `次の作業項目へ\n${nextName}\n（Alt+→）` : '最後の作業項目です',
        () => _navigateWorkItem(idx + 1, displayItems)
    ));
}

/**
 * ナビゲーターの前へ/次へボタンを生成する内部ヘルパー。
 * @param {boolean} active - 操作可能か
 * @param {string} iconClass - FontAwesome クラス（fa-chevron-left 等）
 * @param {string} titleText - ツールチップ文字列
 * @param {Function} onClick - クリック時コールバック
 * @returns {HTMLButtonElement}
 */
function _makeNavBtn(active, iconClass, titleText, onClick) {
    const btn = document.createElement('button');
    btn.type  = 'button';
    btn.title = titleText;
    btn.innerHTML = `<i class="fas ${iconClass}"></i>`;

    const base = [
        'width:40px', 'height:38px',
        'display:flex', 'align-items:center', 'justify-content:center',
        'border:none', 'outline:none',
        'font-size:13px',
        'flex-shrink:0',
        'transition:background 0.12s, color 0.12s',
    ].join(';');

    if (active) {
        btn.style.cssText = base + ';cursor:pointer;color:#3b5bdb;background:transparent;';
        btn.onmouseenter = () => { btn.style.background = '#c5cfff'; btn.style.color = '#1e3a8a'; };
        btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = '#3b5bdb'; };
        btn.onclick = onClick;
    } else {
        btn.style.cssText = base + ';cursor:default;color:#a5b4fc;background:transparent;';
        btn.disabled = true;
    }
    return btn;
}

/**
 * 指定インデックスの作業項目へナビゲートする。
 * 現在の編集内容を即時保存してからモーダルを開き直す。
 * @param {number} targetIdx - 移動先インデックス
 * @param {Array} displayItems - 表示項目配列
 */
async function _navigateWorkItem(targetIdx, displayItems) {
    if (targetIdx < 0 || targetIdx >= displayItems.length) return;
    // 編集内容を即時保存（debounce をスキップして同期的に）
    if (typeof saveWork === 'function') await saveWork();
    openWorkModal(displayItems[targetIdx].id);
}

/**
 * Alt+← / Alt+→ でナビゲートするキーボードハンドラを設定する。
 * openWorkModal 呼び出しごとに付け替えるため、既存ハンドラは削除してから追加。
 */
function setupWorkItemNavKeyboard() {
    teardownWorkItemNavKeyboard();
    _workItemNavKeyHandler = (e) => {
        if (!e.altKey) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        // モーダルが表示されていなければ無視
        const modal = document.getElementById('workModal');
        if (!modal || modal.style.display !== 'block') return;
        e.preventDefault();
        const displayItems = (typeof getDisplayWorkItems === 'function') ? getDisplayWorkItems() : [];
        const idx = displayItems.findIndex(it => it.id === currentEditingId);
        if (idx === -1) return;
        const targetIdx = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
        _navigateWorkItem(targetIdx, displayItems);
    };
    document.addEventListener('keydown', _workItemNavKeyHandler);
}

/** Alt+← / Alt+→ のキーボードハンドラを解除する。 */
function teardownWorkItemNavKeyboard() {
    if (_workItemNavKeyHandler) {
        document.removeEventListener('keydown', _workItemNavKeyHandler);
        _workItemNavKeyHandler = null;
    }
}

/**
 * 作業項目モーダルを開く（オートセーブ対応版）
 * @param {number|null} workId - 作業項目ID（nullの場合は新規作成）
 * @param {number} position - 挿入位置
 */
function openWorkModal(workId = null, position = -1) {
    currentEditingId = workId;
    insertPosition = position;
    const modal = document.getElementById('workModal');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteBtn');
    const revertBtn = document.querySelector('#workModal .modal-header-actions .btn-secondary');

    let targetScope = 'common';

    if (workId) {
        const work = workItems.find(item => item.id === workId);
        originalWorkItemData = JSON.parse(JSON.stringify(work)); // 元のデータを保存
        title.textContent = '作業項目を編集';

        document.getElementById('workName').value = work.name;
        document.getElementById('workCategory').value = work.category || 'normal';
        
        // ロット選択肢を標準手持ち数に基づいて更新してから値をセット
        updateLotOptions();
        document.getElementById('workProcess').value = normalizeProcessValue(work.process);
        
        targetScope = work.targetScope || 'common';
        document.getElementById('workTargetScope').value = targetScope;

        setTimeComponentsFromSeconds('manualTime', work.manualTime);
        setTimeComponentsFromSeconds('autoTime', work.autoTime);
        setTimeComponentsFromSeconds('walkTime', work.walkTime);

        if (work.improved) {
            setTimeComponentsFromSeconds('improvedManualTime', work.improved.manualTime || 0);
            setTimeComponentsFromSeconds('improvedAutoTime', work.improved.autoTime || 0);
            setTimeComponentsFromSeconds('improvedWalkTime', work.improved.walkTime || 0);
        } else {
            setTimeComponentsFromSeconds('improvedManualTime', work.manualTime);
            setTimeComponentsFromSeconds('improvedAutoTime', work.autoTime);
            setTimeComponentsFromSeconds('improvedWalkTime', work.walkTime);
        }

        deleteBtn.style.display = 'inline-flex';
        revertBtn.style.display = 'none'; // 初期状態は変更なしなので非表示
        updateCategoryLegendPreview(work.category || 'normal');
    } else {
        title.textContent = '作業項目を追加';
        const newWorkData = {
            name: '', category: 'normal', process: 'lot1', targetScope: 'common',
            manualTime: 0, autoTime: 0, walkTime: 0,
            improved: { manualTime: 0, autoTime: 0, walkTime: 0 }
        };
        originalWorkItemData = newWorkData; // 新規作成時の元データ

        document.getElementById('workName').value = '';
        document.getElementById('workCategory').value = 'normal';
        // ロット選択肢を更新してからデフォルト値をセット
        updateLotOptions();
        document.getElementById('workProcess').value = 'lot1';
        document.getElementById('workTargetScope').value = 'common';
        setTimeComponentsFromSeconds('manualTime', 0);
        setTimeComponentsFromSeconds('autoTime', 0);
        setTimeComponentsFromSeconds('walkTime', 0);
        setTimeComponentsFromSeconds('improvedManualTime', 0);
        setTimeComponentsFromSeconds('improvedAutoTime', 0);
        setTimeComponentsFromSeconds('improvedWalkTime', 0);

        deleteBtn.style.display = 'none';
        revertBtn.style.display = 'none'; // 新規作成時は元に戻すボタンも非表示
        updateCategoryLegendPreview('normal');
    }
    
    handleTargetScopeChange(targetScope);

    let initialTab = (displayMode === 'improved' && targetScope !== 'current-only') ? 'improved' : 'current';
    if(targetScope === 'improved-only') initialTab = 'improved';
    
    switchTab(initialTab);
    handleCategoryChange();
    modal.style.display = 'block';
    renderWorkItemNavigator(workId);
    setupWorkItemNavKeyboard();
    
    // ボタンの初期状態を更新
    setTimeout(updateWorkModalButtons, 0);
    setupTimeInputListeners();
    document.getElementById('workName').focus();
    setupWorkModalCloseControl();

    // 全ての入力フィールドにオートセーブ用リスナーを設定
    const debouncedSave = debounce(saveWork, 400);
    const formElements = modal.querySelectorAll('input, select, textarea');
    formElements.forEach(el => {
        el.addEventListener('input', debouncedSave);
        el.addEventListener('change', debouncedSave);
    });
}

/**
 * 作業項目の変更を元に戻す
 */
function revertWorkChanges() {
    if (!originalWorkItemData) return;

    if (confirm("現在の変更を破棄し、このモーダルを開いた時点の状態に戻しますか？")) {
        const work = originalWorkItemData;
        
        // フォームを元のデータで再設定
        document.getElementById('workName').value = work.name;
        document.getElementById('workCategory').value = work.category || 'normal';
        document.getElementById('workProcess').value = normalizeProcessValue(work.process);
        document.getElementById('workTargetScope').value = work.targetScope || 'common';

        setTimeComponentsFromSeconds('manualTime', work.manualTime);
        setTimeComponentsFromSeconds('autoTime', work.autoTime);
        setTimeComponentsFromSeconds('walkTime', work.walkTime);
        setTimeComponentsFromSeconds('improvedManualTime', work.improved.manualTime);
        setTimeComponentsFromSeconds('improvedAutoTime', work.improved.autoTime);
        setTimeComponentsFromSeconds('improvedWalkTime', work.improved.walkTime);

        handleTargetScopeChange(work.targetScope || 'common');
        handleCategoryChange();

        // データを再保存してアプリケーションの状態を更新
        saveWork();
        
        showNotificationBanner("変更を元に戻しました。", "info", 2000);
    }
}


/**
 * 対象区分変更時の処理（新規関数）
 * @param {string} targetScope - 対象区分（'common', 'current-only', 'improved-only'）
 */
function handleTargetScopeChange(targetScope = null) {
    if (!targetScope) {
        targetScope = document.getElementById('workTargetScope').value;
    }

    const currentTab = document.getElementById('currentTab');
    const improvedTab = document.getElementById('improvedTab');
    const currentContent = document.getElementById('currentContent');
    const improvedContent = document.getElementById('improvedContent');

    // タブ表示制御
    switch (targetScope) {
        case 'current-only':
            // 改善前のみ：改善後タブを非表示
            improvedTab.style.display = 'none';
            currentTab.style.display = 'block';

            // 改善前タブを強制的にアクティブ化
            switchTab('current');
            break;

        case 'improved-only':
            // 改善後のみ：改善前タブを非表示
            currentTab.style.display = 'none';
            improvedTab.style.display = 'block';

            // 改善後タブを強制的にアクティブ化
            switchTab('improved');
            break;

        case 'common':
        default:
            // 共通：両方のタブを表示
            currentTab.style.display = 'block';
            improvedTab.style.display = 'block';

            // デフォルトで改善前タブをアクティブ化
            switchTab('current');
            break;
    }

    // フォームフィールドの有効/無効制御
    updateFormFieldsBasedOnTargetScope(targetScope);
}

/**
 * 対象区分に基づくフォームフィールドの有効/無効制御（新規関数）
 * @param {string} targetScope - 対象区分
 */
function updateFormFieldsBasedOnTargetScope(targetScope) {
    const currentFields = ['manualTimeHours', 'manualTimeMinutes', 'manualTimeSeconds',
                          'autoTimeHours', 'autoTimeMinutes', 'autoTimeSeconds',
                          'walkTimeHours', 'walkTimeMinutes', 'walkTimeSeconds'];

    const improvedFields = ['improvedManualTimeHours', 'improvedManualTimeMinutes', 'improvedManualTimeSeconds',
                           'improvedAutoTimeHours', 'improvedAutoTimeMinutes', 'improvedAutoTimeSeconds',
                           'improvedWalkTimeHours', 'improvedWalkTimeMinutes', 'improvedWalkTimeSeconds'];

    switch (targetScope) {
        case 'current-only':
            // 改善前のみ：改善後フィールドを無効化
            currentFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.disabled = false;
            });
            improvedFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.disabled = true;
                    field.value = 0; // 値をクリア
                }
            });
            break;

        case 'improved-only':
            // 改善後のみ：改善前フィールドを無効化
            improvedFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.disabled = false;
            });
            currentFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.disabled = true;
                    field.value = 0; // 値をクリア
                }
            });
            break;

        case 'common':
        default:
            // 共通：全フィールド有効
            [...currentFields, ...improvedFields].forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) field.disabled = false;
            });
            break;
    }
}

/**
 * 作業項目モーダルを閉じる
 */
function closeWorkModal() {
    document.getElementById('workModal').style.display = 'none';
    currentEditingId = null;
    insertPosition = -1;
    currentActiveTab = 'current';
    teardownWorkItemNavKeyboard();

    // 状態をリセット
    insertRowIndex = -1;
    if (typeof updateUIElements === 'function') { // ui-manager.js にある想定
        updateUIElements();
    }
}

/**
 * 作業項目を保存（オートセーブ用）
 */
async function saveWork() {
    // モーダルが表示されていない場合は何もしない
    if (document.getElementById('workModal').style.display !== 'block') return;

    const name = document.getElementById('workName').value.trim();
    const category = document.getElementById('workCategory').value;
    const process = document.getElementById('workProcess').value;
    const targetScope = document.getElementById('workTargetScope').value;

    const manualTime = targetScope === 'improved-only' ? 0 : getSecondsFromTimeComponents('manualTime');
    const autoTime = (category === 'wait' || targetScope === 'improved-only') ? 0 : getSecondsFromTimeComponents('autoTime');
    const walkTime = targetScope === 'improved-only' ? 0 : getSecondsFromTimeComponents('walkTime');

    const improvedManualTime = targetScope === 'current-only' ? 0 : getSecondsFromTimeComponents('improvedManualTime');
    const improvedAutoTime = (category === 'wait' || targetScope === 'current-only') ? 0 : getSecondsFromTimeComponents('improvedAutoTime');
    const improvedWalkTime = targetScope === 'current-only' ? 0 : getSecondsFromTimeComponents('improvedWalkTime');

    // 簡易バリデーション：名前が空でもデータは更新するが、フォーカスアウト時に警告するなどのUI改善が望ましい
    if (!name && currentEditingId) { // 既存の項目の名前が空になった場合
        // 処理を中断するのではなく、警告を出すに留める
        // console.warn("作業内容が空です。");
    }

    try {
        if (currentEditingId) {
            const work = workItems.find(item => item.id === currentEditingId);
            if(work){
                work.name = name;
                work.category = category;
                work.process = process;
                work.targetScope = targetScope;
                work.manualTime = manualTime;
                work.autoTime = autoTime;
                work.walkTime = walkTime;
                work.improved = {
                    manualTime: improvedManualTime,
                    autoTime: improvedAutoTime,
                    walkTime: improvedWalkTime
                };
            }
        } else {
            // 新規作成の場合：最初の入力でIDを確定し、編集モードに移行
            const newWork = {
                id: Date.now(),
                name, category, process, targetScope,
                manualTime, autoTime, walkTime,
                improved: { improvedManualTime, improvedAutoTime, improvedWalkTime }
            };
            workItems.push(newWork);
            addToWorkOrderWithTargetScope(newWork.id, insertPosition, targetScope);

            currentEditingId = newWork.id; // IDを確定
            originalWorkItemData = JSON.parse(JSON.stringify(newWork)); // 元データを更新
            document.getElementById('deleteBtn').style.display = 'inline-flex';
            document.querySelector('#workModal .modal-header-actions .btn-secondary').style.display = 'inline-flex';
        }
        
        if (typeof calculateTaktTime === 'function') calculateTaktTime();
        if (typeof triggerAutoSave === 'function') triggerAutoSave();
        
        // 変更状態を評価してボタンUIを更新
        updateWorkModalButtons();
        
    } catch (error) {
        console.error('Save work error:', error);
        showNotificationBanner('データの更新中にエラーが発生しました。', 'error', 2500);
    }
}


/**
 * 対象区分を考慮して作業項目を順序配列に追加（新規関数）
 * @param {number} workId - 作業項目ID
 * @param {number} position - 挿入位置
 * @param {string} targetScope - 対象区分
 */
function addToWorkOrderWithTargetScope(workId, position = -1, targetScope = 'common') {
    switch (targetScope) {
        case 'current-only':
            // 改善前のみ：改善前の順序にのみ追加
            if (position >= 0 && position <= currentWorkOrder.length) {
                currentWorkOrder.splice(position, 0, workId);
            } else {
                currentWorkOrder.push(workId);
            }
            // 改善後には追加しない
            break;

        case 'improved-only':
            // 改善後のみ：改善後の順序にのみ追加
            if (position >= 0 && position <= improvedWorkOrder.length) {
                improvedWorkOrder.splice(position, 0, workId);
            } else {
                improvedWorkOrder.push(workId);
            }
            // 改善前には追加しない
            break;

        case 'common':
        default:
            // 共通：既存の処理と同じ
            if (position >= 0 && position <= currentWorkOrder.length) {
                currentWorkOrder.splice(position, 0, workId);
            } else {
                currentWorkOrder.push(workId);
            }

            if (position >= 0 && position <= improvedWorkOrder.length) {
                improvedWorkOrder.splice(position, 0, workId);
            } else {
                improvedWorkOrder.push(workId);
            }
            break;
    }
}

/**
 * 作業項目を削除
 */
async function deleteWork() {
    if (!currentEditingId) return;

    const work = workItems.find(item => item.id === currentEditingId);
    const workName = work ? work.name : '選択された作業項目';

    if (confirm(`「${workName}」を削除しますか？\n\nこの操作は取り消せません。`)) {
        try {
            workItems = workItems.filter(item => item.id !== currentEditingId);

            if (typeof removeFromWorkOrder === 'function') removeFromWorkOrder(currentEditingId); 

            showNotificationBanner('作業項目を削除しました。', 'success', 2000);
            closeWorkModal();
            if (typeof updateChart === 'function') updateChart();
            if (typeof updateFrequencyChart === 'function') updateFrequencyChart(); 
            if (typeof triggerAutoSave === 'function') triggerAutoSave(); 

            const mainTotalWorkTimeCard = document.getElementById('mainTotalWorkTimeCard');
            if(mainTotalWorkTimeCard && typeof showFeedbackAnimation === 'function') showFeedbackAnimation(mainTotalWorkTimeCard, 'warning');

        } catch (error) {
            console.error('Delete work error:', error);
            showNotificationBanner('削除中にエラーが発生しました。', 'error', 2500);
        }
    }
}


// ========================================
// Enhanced Time Slot Modal Management Functions (稼働時間管理強化版)
// ========================================

/**
 * 時間帯モーダルを開く（強化版：5分単位調整対応）
 * @param {number|null} timeSlotId - 時間帯ID（nullの場合は新規作成）
 */
function openTimeSlotModal(timeSlotId = null) {
    currentEditingTimeSlotId = timeSlotId;
    const modal = document.getElementById('timeSlotModal');
    const title = document.getElementById('timeSlotModalTitle');
    const deleteBtn = document.getElementById('deleteTimeSlotBtn');

    if (timeSlotId) {
        const timeSlot = timeSlots.find(slot => slot.id === timeSlotId);
        if (timeSlot) {
            title.textContent = '時間帯を編集';

            // 基本情報設定
            document.getElementById('timeSlotName').value = timeSlot.name;
            document.getElementById('timeSlotType').value = timeSlot.type;
            document.getElementById('timeSlotStartTime').value = timeSlot.startTime;
            document.getElementById('timeSlotEndTime').value = timeSlot.endTime;
            document.getElementById('timeSlotNotes').value = timeSlot.notes || '';

            deleteBtn.style.display = 'inline-block';
        }
    } else {
        title.textContent = '時間帯を追加';

        // デフォルト値を現在時刻に基づいて設定（5分単位）
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const snappedMinutes = Math.round(currentMinutes / 5) * 5; // 5分単位にスナップ

        const defaultStartTime = minutesToTime(snappedMinutes);
        const defaultEndTime = minutesToTime(snappedMinutes + 60); // デフォルト1時間

        // フィールドクリア
        document.getElementById('timeSlotName').value = '';
        document.getElementById('timeSlotType').value = 'break';
        document.getElementById('timeSlotStartTime').value = defaultStartTime;
        document.getElementById('timeSlotEndTime').value = defaultEndTime;
        document.getElementById('timeSlotNotes').value = '';

        deleteBtn.style.display = 'none';
    }

    // 時間入力フィールドに5分単位調整機能を追加
    setupTimeSlotInputListeners();

    modal.style.display = 'block';
    document.getElementById('timeSlotName').focus();

}

/**
 * 時間帯モーダルを閉じる
 */
function closeTimeSlotModal() {
    document.getElementById('timeSlotModal').style.display = 'none';
    currentEditingTimeSlotId = null;
}

/**
 * 時間帯保存後の処理（修正版：終了時間再計算）
 */
async function saveTimeSlot() {
    const name = document.getElementById('timeSlotName').value.trim();
    const type = document.getElementById('timeSlotType').value;
    const startTime = document.getElementById('timeSlotStartTime').value;
    const endTime = document.getElementById('timeSlotEndTime').value;
    const notes = document.getElementById('timeSlotNotes').value.trim();

    // 基本的な検証は既存のコードと同じ
    if (!name) {
        showNotificationBanner('時間帯名を入力してください。', 'error', 2500);
        document.getElementById('timeSlotName').focus();
        return;
    }

    if (!startTime || !endTime) {
        showNotificationBanner('開始時間と終了時間を入力してください。', 'error', 2500);
        return;
    }

    if (startTime >= endTime) {
        showNotificationBanner('終了時間は開始時間より後に設定してください。', 'warning', 2500);
        return;
    }

    try {
        if (currentEditingTimeSlotId) {
            const timeSlot = timeSlots.find(slot => slot.id === currentEditingTimeSlotId);
            if (timeSlot) {
                timeSlot.name = name;
                timeSlot.type = type;
                timeSlot.startTime = startTime;
                timeSlot.endTime = endTime;
                timeSlot.notes = notes;

                showNotificationBanner('時間帯を更新しました。', 'success', 2000);
            }
        } else {
            const newTimeSlot = {
                id: Date.now(),
                name: name,
                type: type,
                startTime: startTime,
                endTime: endTime,
                notes: notes
            };

            timeSlots.push(newTimeSlot);
            showNotificationBanner('時間帯を追加しました。', 'success', 2000);
        }

        closeTimeSlotModal();
        
        updateScheduleConfig();
        
        if (typeof updateTimeSlotList === 'function') {
            updateTimeSlotList();
        }
        
        if (typeof updateWorkingTimeDisplay === 'function') {
            updateWorkingTimeDisplay();
        }
        
        if (typeof updateScheduleChart === 'function') {
            updateScheduleChart();
        }
        
        if (typeof triggerAutoSave === 'function') {
            triggerAutoSave();
        }

    } catch (error) {
        console.error('Save time slot error:', error);
        showNotificationBanner('保存中にエラーが発生しました。', 'error', 2500);
    }
}

/**
 * 時間帯削除後の処理（修正版：終了時間再計算）
 */
async function deleteTimeSlot() {
    if (!currentEditingTimeSlotId) return;

    const timeSlot = timeSlots.find(slot => slot.id === currentEditingTimeSlotId);
    const timeSlotName = timeSlot ? timeSlot.name : '選択された時間帯';

    if (confirm(`「${timeSlotName}」を削除しますか？\n\nこの操作は取り消せません。`)) {
        try {
            timeSlots = timeSlots.filter(slot => slot.id !== currentEditingTimeSlotId);

            showNotificationBanner('時間帯を削除しました。', 'success', 2000);
            closeTimeSlotModal();
            
            updateScheduleConfig();
            
            if (typeof updateTimeSlotList === 'function') {
                updateTimeSlotList();
            }
            
            if (typeof updateWorkingTimeDisplay === 'function') {
                updateWorkingTimeDisplay();
            }
            
            if (typeof updateScheduleChart === 'function') {
                updateScheduleChart();
            }
            
            if (typeof triggerAutoSave === 'function') {
                triggerAutoSave();
            }

        } catch (error) {
            console.error('Delete time slot error:', error);
            showNotificationBanner('削除中にエラーが発生しました。', 'error', 2500);
        }
    }
}

/**
 * 時間帯入力フィールドに5分単位調整機能を設定
 */
function setupTimeSlotInputListeners() {
    const timeInputs = ['timeSlotStartTime', 'timeSlotEndTime'];

    timeInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.addEventListener('change', function() {
            const timeValue = this.value;
            if (!timeValue) return;

            try {
                const minutes = timeToMinutes(timeValue);
                const adjustedMinutes = Math.round(minutes / 5) * 5;
                const adjustedTime = minutesToTime(adjustedMinutes);

                if (adjustedTime !== timeValue) {
                    this.value = adjustedTime;
                    showNotificationBanner(`時間を5分単位に調整しました: ${timeValue} → ${adjustedTime}`, 'info', 2000);
                }
            } catch (error) {
                console.warn('Invalid time format:', timeValue);
            }
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();

                const timeValue = this.value;
                if (!timeValue) return;

                try {
                    const minutes = timeToMinutes(timeValue);
                    const delta = e.key === 'ArrowUp' ? 5 : -5;
                    const newMinutes = Math.max(0, Math.min(24 * 60 - 5, minutes + delta));
                    this.value = minutesToTime(newMinutes);

                    if (inputId === 'timeSlotStartTime') {
                        adjustEndTimeIfNeeded();
                    }
                } catch (error) {
                    console.warn('Invalid time format:', timeValue);
                }
            }
        });
    });
}

/**
 * 終了時間の自動調整（開始時間変更時）
 */
function adjustEndTimeIfNeeded() {
    const startTimeInput = document.getElementById('timeSlotStartTime');
    const endTimeInput = document.getElementById('timeSlotEndTime');

    if (!startTimeInput.value || !endTimeInput.value) return;

    try {
        const startMinutes = timeToMinutes(startTimeInput.value);
        const endMinutes = timeToMinutes(endTimeInput.value);

        if (endMinutes <= startMinutes) {
            const newEndMinutes = startMinutes + 30; // デフォルト30分後
            endTimeInput.value = minutesToTime(Math.min(newEndMinutes, 24 * 60 - 5));
            showNotificationBanner('終了時間を自動調整しました。', 'info', 1500);
        }
    } catch (error) {
        console.warn('Error adjusting end time:', error);
    }
}

// ========================================
// Enhanced Frequency Work Modal Management Functions (頻度作業管理強化版)
// ========================================

/**
 * 頻度作業モーダルを開く（オートセーブ対応版）
 */
function openFrequencyWorkModal(frequencyId = null) {
    currentEditingFrequencyId = frequencyId;
    const modal = document.getElementById('frequencyWorkModal');
    const title = document.getElementById('frequencyModalTitle');
    const deleteBtn = document.getElementById('deleteFrequencyBtn');
    const revertBtn = document.querySelector('#frequencyWorkModal .modal-header-actions .btn-secondary');

    modal.style.display = 'block';

    const setupForm = (work) => {
        document.getElementById('frequencyWorkName').value = work.name || '';
        document.getElementById('frequencyWorkNotes').value = work.notes || '';

        setTimeComponentsFromSeconds('frequencyWorkTime', work.workTime, 'current');
        const freq = work.frequency || { type: 'count', value: 10 };
        if (freq.type === 'time') {
            document.querySelector('input[name="frequencyType"][value="time"]').checked = true;
            onFrequencyTypeChange('time', 'current');
            document.getElementById('frequencyWorkTimeValue').value = freq.value;
            document.getElementById('frequencyWorkTimeUnit').value = freq.unit;
        } else {
            document.querySelector('input[name="frequencyType"][value="count"]').checked = true;
            onFrequencyTypeChange('count', 'current');
            document.getElementById('frequencyWorkCount').value = freq.value;
        }

        const improvedData = work.improved || { workTime: work.workTime, frequency: work.frequency };
        setTimeComponentsFromSeconds('frequencyWorkTime', improvedData.workTime, 'improved');
        const improvedFreq = improvedData.frequency || freq;
        if (improvedFreq.type === 'time') {
            document.querySelector('input[name="improvedFrequencyType"][value="time"]').checked = true;
            onFrequencyTypeChange('time', 'improved');
            document.getElementById('improvedFrequencyWorkTimeValue').value = improvedFreq.value;
            document.getElementById('improvedFrequencyWorkTimeUnit').value = improvedFreq.unit;
        } else {
            document.querySelector('input[name="improvedFrequencyType"][value="count"]').checked = true;
            onFrequencyTypeChange('count', 'improved');
            document.getElementById('improvedFrequencyWorkCount').value = improvedFreq.value;
        }

        updateFrequencyImpactDisplay('current');
        updateFrequencyImpactDisplay('improved');
    };

    if (frequencyId) {
        const work = frequencyWorkItems.find(item => item.id === frequencyId);
        originalFrequencyWorkData = JSON.parse(JSON.stringify(work));
        title.textContent = '頻度作業を編集';
        deleteBtn.style.display = 'inline-flex';
        revertBtn.style.display = 'inline-flex';
        setupForm(work);
    } else {
        const newWorkData = {
            name: '', notes: '', workTime: 0, frequency: { type: 'count', value: 10 },
            improved: { workTime: 0, frequency: { type: 'count', value: 10 } }
        };
        originalFrequencyWorkData = newWorkData;
        title.textContent = '頻度作業を追加';
        deleteBtn.style.display = 'none';
        revertBtn.style.display = 'none';
        setupForm(newWorkData);
    }

    const initialTab = (displayMode === 'improved') ? 'improved' : 'current';
    switchFrequencyTab(initialTab);
    document.getElementById('frequencyWorkName').focus();

    const debouncedSave = debounce(saveFrequencyWork, 400);
    const formElements = modal.querySelectorAll('input, select, textarea');
    formElements.forEach(el => {
        el.addEventListener('input', debouncedSave);
        el.addEventListener('change', debouncedSave);
    });
}

/**
 * 頻度作業の変更を元に戻す
 */
function revertFrequencyWorkChanges() {
    if (!originalFrequencyWorkData) return;
    
    if (confirm("現在の変更を破棄し、このモーダルを開いた時点の状態に戻しますか？")) {
        // originalFrequencyWorkData を使ってフォームを再設定するロジックは
        // openFrequencyWorkModal内のsetupFormとほぼ同じなので、再利用する。
        // ここでは簡略化のために再度同じロジックを書く。
        const work = originalFrequencyWorkData;

        document.getElementById('frequencyWorkName').value = work.name;
        document.getElementById('frequencyWorkNotes').value = work.notes || '';

        setTimeComponentsFromSeconds('frequencyWorkTime', work.workTime, 'current');
        const freq = work.frequency || { type: 'count', value: 10 };
        if (freq.type === 'time') {
            document.querySelector('input[name="frequencyType"][value="time"]').checked = true;
            onFrequencyTypeChange('time', 'current');
            document.getElementById('frequencyWorkTimeValue').value = freq.value;
            document.getElementById('frequencyWorkTimeUnit').value = freq.unit;
        } else {
            document.querySelector('input[name="frequencyType"][value="count"]').checked = true;
            onFrequencyTypeChange('count', 'current');
            document.getElementById('frequencyWorkCount').value = freq.value;
        }

        const improvedData = work.improved || { workTime: work.workTime, frequency: work.frequency };
        setTimeComponentsFromSeconds('frequencyWorkTime', improvedData.workTime, 'improved');
        const improvedFreq = improvedData.frequency || freq;
        if (improvedFreq.type === 'time') {
            document.querySelector('input[name="improvedFrequencyType"][value="time"]').checked = true;
            onFrequencyTypeChange('time', 'improved');
            document.getElementById('improvedFrequencyWorkTimeValue').value = improvedFreq.value;
            document.getElementById('improvedFrequencyWorkTimeUnit').value = improvedFreq.unit;
        } else {
            document.querySelector('input[name="improvedFrequencyType"][value="count"]').checked = true;
            onFrequencyTypeChange('count', 'improved');
            document.getElementById('improvedFrequencyWorkCount').value = improvedFreq.value;
        }

        updateFrequencyImpactDisplay('current');
        updateFrequencyImpactDisplay('improved');

        saveFrequencyWork();
        showNotificationBanner("変更を元に戻しました。", "info", 2000);
    }
}

/**
 * 頻度作業モーダルを閉じる
 */
function closeFrequencyWorkModal() {
    document.getElementById('frequencyWorkModal').style.display = 'none';
    currentEditingFrequencyId = null;
    currentActiveFrequencyTab = 'current';
}

/**
 * 頻度作業を保存（オートセーブ用）
 */
async function saveFrequencyWork() {
    if (document.getElementById('frequencyWorkModal').style.display !== 'block') return;

    const name = document.getElementById('frequencyWorkName').value.trim();
    const notes = document.getElementById('frequencyWorkNotes').value.trim();
    
    const workTime = getSecondsFromTimeComponents('frequencyWorkTime', 'current');
    const freqTypeCurrentValue = document.querySelector('input[name="frequencyType"]:checked').value;
    let frequency;
    if (freqTypeCurrentValue === 'count') {
        frequency = { type: 'count', value: parseInt(document.getElementById('frequencyWorkCount').value) || 1 };
    } else {
        frequency = { type: 'time', value: parseInt(document.getElementById('frequencyWorkTimeValue').value) || 1, unit: document.getElementById('frequencyWorkTimeUnit').value };
    }

    const improvedWorkTime = getSecondsFromTimeComponents('frequencyWorkTime', 'improved');
    const freqTypeImprovedValue = document.querySelector('input[name="improvedFrequencyType"]:checked').value;
    let improvedFrequency;
    if (freqTypeImprovedValue === 'count') {
        improvedFrequency = { type: 'count', value: parseInt(document.getElementById('improvedFrequencyWorkCount').value) || 1 };
    } else {
        improvedFrequency = { type: 'time', value: parseInt(document.getElementById('improvedFrequencyWorkTimeValue').value) || 1, unit: document.getElementById('improvedFrequencyWorkTimeUnit').value };
    }

    try {
        const workData = {
            name, notes, workTime, frequency,
            improved: { workTime: improvedWorkTime, frequency: improvedFrequency }
        };

        if (currentEditingFrequencyId) {
            const work = frequencyWorkItems.find(item => item.id === currentEditingFrequencyId);
            if(work) Object.assign(work, workData);
        } else {
            const newWork = { id: Date.now(), ...workData };
            frequencyWorkItems.push(newWork);
            currentEditingFrequencyId = newWork.id;
            originalFrequencyWorkData = JSON.parse(JSON.stringify(newWork));
            document.getElementById('deleteFrequencyBtn').style.display = 'inline-flex';
            document.querySelector('#frequencyWorkModal .modal-header-actions .btn-secondary').style.display = 'inline-flex';
        }

        if (typeof updateFrequencyWorkList === 'function') updateFrequencyWorkList();
        if (typeof updateFrequencyWorkStatistics === 'function') updateFrequencyWorkStatistics();
        if (typeof updateFrequencyWorkButtons === 'function') updateFrequencyWorkButtons();
        if (typeof updateChart === 'function') updateChart();
        if (typeof updateFrequencyChart === 'function') updateFrequencyChart();
        if (typeof triggerAutoSave === 'function') triggerAutoSave();

    } catch (error) {
        console.error('Save frequency work error:', error);
        showNotificationBanner('データの更新中にエラーが発生しました。', 'error', 2500);
    }
}


/**
 * 頻度作業を削除
 */
async function deleteFrequencyWork() {
    if (!currentEditingFrequencyId) return;

    const work = frequencyWorkItems.find(item => item.id === currentEditingFrequencyId);
    const frequencyWorkName = work ? work.name : '選択された頻度作業';

    if (confirm(`「${frequencyWorkName}」を削除しますか？\n\nこの操作は取り消せません。`)) {
        try {
            frequencyWorkItems = frequencyWorkItems.filter(item => item.id !== currentEditingFrequencyId);

            showNotificationBanner('頻度作業を削除しました。', 'success', 2000);
            closeFrequencyWorkModal();

            if (typeof updateFrequencyWorkList === 'function') updateFrequencyWorkList();
            if (typeof updateFrequencyWorkStatistics === 'function') updateFrequencyWorkStatistics();
            if (typeof updateFrequencyWorkButtons === 'function') updateFrequencyWorkButtons();
            if (typeof updateChart === 'function') updateChart();
            if (typeof updateFrequencyChart === 'function') updateFrequencyChart();

            if (typeof triggerAutoSave === 'function') triggerAutoSave();

        } catch (error) {
            console.error('Delete frequency work error:', error);
            showNotificationBanner('削除中にエラーが発生しました。', 'error', 2500);
        }
    }
}

// ========================================
// Enhanced Time Input Functions (Business Optimized with Frequency Work Support)
// ========================================

/**
 * 秒数から時分秒コンポーネントに設定（汎用版・nullチェック強化・ID修正版）
 * @param {string} baseId - フィールドのベースID (e.g., 'manualTime', 'frequencyWorkTime')
 * @param {number} totalSeconds - 総秒数
 * @param {string} [scope] - スコープ ('current' or 'improved')。頻度作業モーダル用。
 */
function setTimeComponentsFromSeconds(baseId, totalSeconds, scope) {
    const components = secondsToComponents(totalSeconds);
    
    let hoursId, minutesId, secondsId;
    
    // 頻度作業の場合の特別なID構築ロジック
    if (baseId === 'frequencyWorkTime') {
        if (scope === 'improved') {
            hoursId = 'improvedFrequencyWorkTimeHours';
            minutesId = 'improvedFrequencyWorkTimeMinutes';
            secondsId = 'improvedFrequencyWorkTimeSeconds';
        } else {
            hoursId = 'frequencyWorkTimeHours';
            minutesId = 'frequencyWorkTimeMinutes';
            secondsId = 'frequencyWorkTimeSeconds';
        }
    } else {
        // 通常の作業項目の場合の従来ロジック
        const prefix = scope === 'improved' ? 'improved' : scope === 'current' ? '' : baseId.startsWith('improved') ? 'improved' : '';
        const cleanBaseId = baseId.replace(/^improved/, '');
        
        hoursId = `${prefix}${cleanBaseId}Hours`;
        minutesId = `${prefix}${cleanBaseId}Minutes`;
        secondsId = `${prefix}${cleanBaseId}Seconds`;
    }
    
    const hoursElement = document.getElementById(hoursId);
    const minutesElement = document.getElementById(minutesId);
    const secondsElement = document.getElementById(secondsId);
    
    if (hoursElement) {
        hoursElement.value = components.hours;
    } else {
        console.warn(`Element not found: ${hoursId}`);
    }
    
    if (minutesElement) {
        minutesElement.value = components.minutes;
    } else {
        console.warn(`Element not found: ${minutesId}`);
    }
    
    if (secondsElement) {
        secondsElement.value = components.seconds;
    } else {
        console.warn(`Element not found: ${secondsId}`);
    }
}

/**
 * 時分秒コンポーネントから総秒数を計算（汎用版・nullチェック強化・ID修正版）
 * @param {string} baseId - フィールドのベースID (e.g., 'manualTime', 'frequencyWorkTime')
 * @param {string} [scope] - スコープ ('current' or 'improved')。頻度作業モーダル用。
 * @returns {number} - 総秒数（整数）
 */
function getSecondsFromTimeComponents(baseId, scope) {
    let hoursId, minutesId, secondsId;
    
    // 頻度作業の場合の特別なID構築ロジック
    if (baseId === 'frequencyWorkTime') {
        if (scope === 'improved') {
            hoursId = 'improvedFrequencyWorkTimeHours';
            minutesId = 'improvedFrequencyWorkTimeMinutes';
            secondsId = 'improvedFrequencyWorkTimeSeconds';
        } else {
            hoursId = 'frequencyWorkTimeHours';
            minutesId = 'frequencyWorkTimeMinutes';
            secondsId = 'frequencyWorkTimeSeconds';
        }
    } else {
        // 通常の作業項目の場合の従来ロジック
        const prefix = scope === 'improved' ? 'improved' : scope === 'current' ? '' : baseId.startsWith('improved') ? 'improved' : '';
        const cleanBaseId = baseId.replace(/^improved/, '');
        
        hoursId = `${prefix}${cleanBaseId}Hours`;
        minutesId = `${prefix}${cleanBaseId}Minutes`;
        secondsId = `${prefix}${cleanBaseId}Seconds`;
    }
    
    const hoursElement = document.getElementById(hoursId);
    const minutesElement = document.getElementById(minutesId);
    const secondsElement = document.getElementById(secondsId);
    
    const hours = hoursElement ? (parseInt(hoursElement.value) || 0) : 0;
    const minutes = minutesElement ? (parseInt(minutesElement.value) || 0) : 0;
    const seconds = secondsElement ? (parseInt(secondsElement.value) || 0) : 0;
    
    if (!hoursElement) console.warn(`Element not found: ${hoursId}`);
    if (!minutesElement) console.warn(`Element not found: ${minutesId}`);
    if (!secondsElement) console.warn(`Element not found: ${secondsId}`);
    
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 時間入力のイベントリスナーを設定（ビジネス用最適化版）
 */
function setupTimeInputListeners() {
    const prefixes = ['manualTime', 'autoTime', 'walkTime', 'improvedManualTime', 'improvedAutoTime', 'improvedWalkTime'];
    let currentFocusedField = null;
    let currentFocusedComponent = null;

    // 統合スライダーの取得
    const unifiedSlider = document.getElementById('unifiedTimeSlider');
    const sliderMaxLabel = document.getElementById('sliderMaxLabel');
    const sliderMiddleLabel = document.getElementById('sliderMiddleLabel');
    const sliderMaxDisplay = document.getElementById('sliderMaxDisplay');

    // 以前のフォーカス状態をクリア
    function clearPreviousFocus() {
        document.querySelectorAll('.time-component').forEach(field => {
            field.classList.remove('slider-focused');
        });
        document.querySelectorAll('.time-input-table tbody tr').forEach(row => {
            row.classList.remove('has-slider-focus');
            row.style.background = ''; // 背景色をリセット
        });
    }

    // フォーカス状態を設定（ビジネス用の色に対応）
    function setFieldFocus(field, component) {
        clearPreviousFocus();

        if (field) {
            field.classList.add('slider-focused');
            const tableRow = field.closest('tr');
            if (tableRow) {
                tableRow.classList.add('has-slider-focus');

                // 改善前/改善後に応じた色を適用
                if (field.id.includes('improved')) {
                    tableRow.style.background = 'rgba(220, 38, 38, 0.05)'; // 改善後は赤系
                } else {
                    tableRow.style.background = 'rgba(31, 41, 55, 0.05)'; // 改善前は黒系
                }
            }

            // スライダーの設定を更新
            updateSliderConfiguration(component);
            updateSliderFromFocusedField(field);
        }
    }

    prefixes.forEach(prefix => {
        ['Hours', 'Minutes', 'Seconds'].forEach(component => {
            const field = document.getElementById(`${prefix}${component}`);
            if (field) {
                // 入力値の検証とリアルタイム更新
                field.addEventListener('input', () => {
                    validateTimeComponent(field, component);
                    updateTimePreview(prefix);

                    // フォーカス中のフィールドの場合、スライダーの値も更新
                    if (currentFocusedField === field) {
                        updateSliderFromFocusedField(field);
                    }

                    // オートセーブをトリガー
                    if (typeof triggerAutoSave === 'function') {
                        triggerAutoSave();
                    }
                });

                // フォーカス時の処理
                field.addEventListener('focus', () => {
                    field.select();
                    currentFocusedField = field;
                    currentFocusedComponent = component;

                    // 視覚的フィードバック
                    setFieldFocus(field, component);
                });

                // フォーカス離脱時の処理
                field.addEventListener('blur', () => {
                    setTimeout(() => {
                        // スライダーにフォーカスが移った場合は状態を保持
                        if (document.activeElement !== unifiedSlider) {
                            if (currentFocusedField === field) {
                                currentFocusedField = null;
                                currentFocusedComponent = null;
                                clearPreviousFocus();
                            }
                        }
                    }, 100);
                });

                // キーボード操作
                field.addEventListener('keydown', (e) => {
                    handleTimeInputKeydown(e, field, component);
                });
            }
        });
    });

    // 統合スライダーのイベントリスナー
    if (unifiedSlider) {
        // スライダーの値変更時
        unifiedSlider.addEventListener('input', (event) => {
            if (currentFocusedField) {
                const value = parseInt(event.target.value);
                currentFocusedField.value = value;

                // 検証とプレビュー更新
                validateTimeComponent(currentFocusedField, currentFocusedComponent);
                const prefix = currentFocusedField.id.replace(/Hours|Minutes|Seconds/, '');
                updateTimePreview(prefix);

                // オートセーブをトリガー
                if (typeof triggerAutoSave === 'function') {
                    triggerAutoSave();
                }
            } else {
                // フォーカスがない場合のメッセージ表示
                showNotificationBanner('先に時間入力欄をクリックしてからスライダーを操作してください', 'warning', 2000);

                // スライダーを0に戻す（操作が無効であることを視覚的に示す）
                event.target.value = 0;
            }
        });

        // スライダーフォーカス時（フォーカス状態を維持）
        unifiedSlider.addEventListener('focus', () => {
            if (currentFocusedField) {
                setFieldFocus(currentFocusedField, currentFocusedComponent);
            }
        });

        // スライダー離脱時
        unifiedSlider.addEventListener('blur', () => {
            setTimeout(() => {
                // 対応するフィールドにフォーカスが戻らない場合はクリア
                if (currentFocusedField && document.activeElement !== currentFocusedField) {
                    const fieldHasFocus = prefixes.some(prefix =>
                        ['Hours', 'Minutes', 'Seconds'].some(component =>
                            document.activeElement === document.getElementById(`${prefix}${component}`)
                        )
                    );

                    if (!fieldHasFocus) {
                        currentFocusedField = null;
                        currentFocusedComponent = null;
                        clearPreviousFocus();
                    }
                }
            }, 100);
        });
    }

    /**
     * コンポーネントタイプの最大値を取得
     */
    function getMaxValueForComponent(component) {
        const maxValues = {
            'Hours': 23,
            'Minutes': 59,
            'Seconds': 59
        };
        return maxValues[component] || 59;
    }

    /**
     * スライダーの設定を更新（最大値、ラベルなど）
     * @param {string} component - コンポーネントタイプ（Hours, Minutes, Seconds）
     */
    function updateSliderConfiguration(component) {
        if (!unifiedSlider) return;

        const maxValue = getMaxValueForComponent(component);
        unifiedSlider.max = maxValue;

        // ラベル更新（フォントサイズ改善に対応）
        if (sliderMaxLabel) {
            sliderMaxLabel.textContent = maxValue;
            sliderMaxLabel.style.fontSize = '11px'; // 明示的にサイズ指定
            sliderMaxLabel.style.fontWeight = '600';
        }
        if (sliderMiddleLabel) {
            sliderMiddleLabel.textContent = Math.floor(maxValue / 2);
            sliderMiddleLabel.style.fontSize = '11px';
            sliderMiddleLabel.style.fontWeight = '600';
        }
        if (sliderMaxDisplay) {
            sliderMaxDisplay.textContent = maxValue;
            sliderMaxDisplay.style.fontSize = '11px';
            sliderMaxDisplay.style.fontWeight = '700';
            sliderMaxDisplay.style.color = 'var(--primary-color)';
        }
    }

    /**
     * フォーカスされたフィールドの値からスライダーを更新
     * @param {HTMLInputElement} field - フォーカスされたフィールド
     */
    function updateSliderFromFocusedField(field) {
        if (!unifiedSlider || !field) return;

        const value = parseInt(field.value) || 0;
        const maxValue = parseInt(unifiedSlider.max);

        // 値が最大値を超える場合は最大値に制限
        const clampedValue = Math.min(Math.max(0, value), maxValue);
        unifiedSlider.value = clampedValue;
    }
}

/**
 * 時間コンポーネントの値を検証
 * @param {HTMLInputElement} field - 入力フィールド
 * @param {string} component - コンポーネントタイプ（Hours, Minutes, Seconds）
 */
function validateTimeComponent(field, component) {
    let value = parseInt(field.value);

    // 数値でない場合は0にリセット
    if (isNaN(value) || value < 0) {
        value = 0;
    }

    // 最大値チェック
    const maxValues = {
        'Hours': 23,
        'Minutes': 59,
        'Seconds': 59
    };

    if (value > maxValues[component]) {
        value = maxValues[component];
    }

    field.value = value;
}

/**
 * 時間入力のキーボード操作を処理
 * @param {KeyboardEvent} event - キーボードイベント
 * @param {HTMLInputElement} field - 入力フィールド
 * @param {string} component - コンポーネントタイプ
 */
function handleTimeInputKeydown(event, field, component) {
    const currentValue = parseInt(field.value) || 0;

    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            incrementTimeComponent(field, component, 1);
            break;

        case 'ArrowDown':
            event.preventDefault();
            incrementTimeComponent(field, component, -1);
            break;

        case 'PageUp':
            event.preventDefault();
            incrementTimeComponent(field, component, 5);
            break;

        case 'PageDown':
            event.preventDefault();
            incrementTimeComponent(field, component, -5);
            break;

        case 'Home':
            event.preventDefault();
            field.value = 0;
            updateTimePreview(field.id.replace(/Hours|Minutes|Seconds/, ''));
            if (typeof triggerAutoSave === 'function') triggerAutoSave();
            break;

        case 'End':
            event.preventDefault();
            const maxValues = { 'Hours': 23, 'Minutes': 59, 'Seconds': 59 };
            field.value = maxValues[component];
            updateTimePreview(field.id.replace(/Hours|Minutes|Seconds/, ''));
            if (typeof triggerAutoSave === 'function') triggerAutoSave();
            break;

        case 'Tab':
            // Tabキーによる移動は自然な流れに任せる
            break;

        case 'Enter':
            event.preventDefault();
            // 次のフィールドに移動
            focusNextTimeField(field);
            break;
    }
}

/**
 * 時間コンポーネントの値を増減
 * @param {HTMLInputElement} field - 入力フィールド
 * @param {string} component - コンポーネントタイプ
 * @param {number} delta - 増減値
 */
function incrementTimeComponent(field, component, delta) {
    const currentValue = parseInt(field.value) || 0;
    const newValue = currentValue + delta;

    field.value = newValue;
    validateTimeComponent(field, component);
    updateTimePreview(field.id.replace(/Hours|Minutes|Seconds/, ''));

    // スライダーも更新
    const unifiedSlider = document.getElementById('unifiedTimeSlider');
    if (unifiedSlider && field === document.activeElement) {
        const maxValue = parseInt(unifiedSlider.max);
        unifiedSlider.value = Math.min(parseInt(field.value), maxValue);
    }

    // オートセーブをトリガー
    if (typeof triggerAutoSave === 'function') {
        triggerAutoSave();
    }
}

/**
 * 次の時間入力フィールドにフォーカス
 * @param {HTMLInputElement} currentField - 現在のフィールド
 */
function focusNextTimeField(currentField) {
    const fieldOrder = [
        'manualTimeHours', 'manualTimeMinutes', 'manualTimeSeconds',
        'autoTimeHours', 'autoTimeMinutes', 'autoTimeSeconds',
        'walkTimeHours', 'walkTimeMinutes', 'walkTimeSeconds',
        'improvedManualTimeHours', 'improvedManualTimeMinutes', 'improvedManualTimeSeconds',
        'improvedAutoTimeHours', 'improvedAutoTimeMinutes', 'improvedAutoTimeSeconds',
        'improvedWalkTimeHours', 'improvedWalkTimeMinutes', 'improvedWalkTimeSeconds'
    ];

    const currentIndex = fieldOrder.indexOf(currentField.id);
    if (currentIndex >= 0 && currentIndex < fieldOrder.length - 1) {
        const nextField = document.getElementById(fieldOrder[currentIndex + 1]);
        if (nextField && !nextField.disabled) {
            // 次のフィールドが改善後タブにある場合は、改善後タブに切り替え
            if (nextField.id.includes('improved') && currentActiveTab !== 'improved') {
                switchTab('improved');
                nextField.focus();
                nextField.select();
            } else {
                nextField.focus();
                nextField.select();
            }
        }
    } else {
        // 最後のフィールドの場合は保存ボタンにフォーカス
        const saveBtn = document.querySelector('#workModal .modal-footer .btn-primary');
        if (saveBtn) {
            saveBtn.focus();
        }
    }
}

/**
 * 時間プレビューを更新（リアルタイム表示）
 * @param {string} prefix - フィールドのプレフィックス
 */
function updateTimePreview(prefix) {
    const totalSeconds = getSecondsFromTimeComponents(prefix);
    const formattedTime = formatTimeDisplay(totalSeconds); // app.js にある想定

    // プレビュー表示要素があれば更新
    const previewElement = document.querySelector(`[data-time-preview="${prefix}"]`);
    if (previewElement) {
        previewElement.textContent = formattedTime;
    }

    // より視覚的なフィードバック（ビジネス用の色に対応）
    const container = document.querySelector(`#${prefix}Hours`).closest('tr'); // tr をターゲットに変更
    if (container) {
        // 値が設定されている場合のハイライト
        if (totalSeconds > 0) {
            if (prefix.includes('improved')) {
                container.style.backgroundColor = 'rgba(220, 38, 38, 0.03)';
            } else {
                container.style.backgroundColor = 'rgba(31, 41, 55, 0.03)';
            }
        } else {
            container.style.backgroundColor = '#ffffff';
        }
    }
}

// ========================================
// Enhanced Category-specific Input Validation (Business Optimized)
// ========================================

/**
 * 作業分類変更時の処理（通知メッセージなし版）
 */
function handleCategoryChange() {
    const categorySelect = document.getElementById('workCategory');
    const category = categorySelect.value;

    // 手待ち分類の場合、自動送り時間の入力を無効化
    const autoTimeRows = document.querySelectorAll('#autoTimeRow, #improvedAutoTimeRow');
    const autoTimeInputs = document.querySelectorAll('#autoTimeHours, #autoTimeMinutes, #autoTimeSeconds, #improvedAutoTimeHours, #improvedAutoTimeMinutes, #improvedAutoTimeSeconds');

    if (category === 'wait') {
        autoTimeRows.forEach(row => {
            row.classList.add('disabled');
            row.style.opacity = '0.5';
        });
        autoTimeInputs.forEach(input => {
            input.disabled = true;
            input.value = 0;
            input.style.backgroundColor = '#f8fafc';
        });

        document.getElementById('manualTimeLabel').textContent = '手待ち時間';
        document.getElementById('improvedManualTimeLabel').textContent = '手待ち時間';
    } else {
        autoTimeRows.forEach(row => {
            row.classList.remove('disabled');
            row.style.opacity = '1';
        });
        autoTimeInputs.forEach(input => {
            input.disabled = false;
            input.style.backgroundColor = '#ffffff';
        });

        // ラベルを変更
        if (category === 'monitor') {
            document.getElementById('manualTimeLabel').textContent = '監視時間';
            document.getElementById('improvedManualTimeLabel').textContent = '監視時間';
        } else if (category === 'hold') {
            document.getElementById('manualTimeLabel').textContent = '保持時間';
            document.getElementById('improvedManualTimeLabel').textContent = '保持時間';
        } else {
            document.getElementById('manualTimeLabel').textContent = '手作業時間';
            document.getElementById('improvedManualTimeLabel').textContent = '手作業時間';
        }
    }

    // 凡例プレビューを更新
    updateCategoryLegendPreview(category);

    // 視覚的フィードバック
    applyCategoryVisualFeedback(category);

    if (typeof triggerAutoSave === 'function') {
        triggerAutoSave();
    }
}

/**
 * 作業分類の凡例プレビューを更新
 * @param {string} category - 作業分類
 */
function updateCategoryLegendPreview(category) {
    const previewContainer = document.getElementById('categoryLegendPreview');
    const selectContainer = document.querySelector('.category-select-container');

    if (!previewContainer || !selectContainer) return;

    // アニメーション効果
    previewContainer.classList.add('updating');
    setTimeout(() => {
        previewContainer.classList.remove('updating');
    }, 200);

    // 既存のクラスを削除
    selectContainer.classList.remove('category-normal', 'category-monitor', 'category-hold', 'category-wait');
    selectContainer.classList.add(`category-${category}`);

    // 凡例の表示を更新
    let legendHTML = '';

    switch (category) {
        case 'normal':
            legendHTML = '<div class="legend-line legend-manual"></div>';
            break;
        case 'monitor':
            legendHTML = '<div class="legend-line legend-monitor"></div>';
            break;
        case 'hold':
            legendHTML = '<div class="legend-line legend-hold"></div>';
            break;
        case 'wait':
            legendHTML = '<svg class="legend-wait-svg" viewBox="0 0 36 10" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><polygon points="0,5 7,1 7,9" fill="white" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="7" y1="3.5" x2="29" y2="3.5" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="6.5" x2="29" y2="6.5" stroke="currentColor" stroke-width="1.5"/><polygon points="36,5 29,1 29,9" fill="white" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
            break;
        default:
            legendHTML = '<div class="legend-line legend-manual"></div>';
    }

    previewContainer.innerHTML = legendHTML;
}

/**
 * 作業分類に応じた視覚的フィードバック（ビジネス最適化）
 * @param {string} category - 作業分類
 */
function applyCategoryVisualFeedback(category) {
    const modal = document.getElementById('workModal');
    if (!modal) return;

    // 既存の分類クラスを削除
    modal.classList.remove('category-normal', 'category-monitor', 'category-wait', 'category-hold');

    // 新しい分類クラスを追加
    modal.classList.add(`category-${category}`);

    // モーダルヘッダーの色を変更
    const modalHeader = modal.querySelector('.modal-header');
    if (modalHeader) {
        switch (category) {
            case 'monitor':
                modalHeader.style.borderBottomColor = '#7c3aed';
                break;
            case 'hold':
                modalHeader.style.borderBottomColor = '#10b981'; // 保持は緑系など、テーマに合わせる
                break;
            case 'wait':
                modalHeader.style.borderBottomColor = '#f59e0b';
                break;
            case 'normal':
            default:
                modalHeader.style.borderBottomColor = '#e2e8f0';
                break;
        }
    }
}

// ========================================
// Enhanced Form Validation (Business Logic)
// ========================================

/**
 * フォーム全体の検証（ビジネスルール適用）
 * @returns {boolean} - 検証結果
 */
function validateWorkForm() {
    const name = document.getElementById('workName').value.trim();
    const category = document.getElementById('workCategory').value;

    // 基本検証
    if (!name) {
        showNotificationBanner('作業内容は必須項目です。', 'error', 2500);
        return false;
    }

    if (name.length > 50) {
        showNotificationBanner('作業内容は50文字以内で入力してください。', 'warning', 2500);
        return false;
    }

    // 時間の検証
    const currentTime = getSecondsFromTimeComponents('manualTime') + getSecondsFromTimeComponents('autoTime');
    const improvedTime = getSecondsFromTimeComponents('improvedManualTime') + getSecondsFromTimeComponents('improvedAutoTime');
    const targetScope = document.getElementById('workTargetScope').value;


    if (targetScope === 'current-only' || targetScope === 'common') {
        if (currentTime === 0) {
            showNotificationBanner('改善前の作業時間（手作業時間または自動送り時間）を設定してください。', 'warning', 3000);
            return false;
        }
    }

    if (targetScope === 'improved-only' || targetScope === 'common') {
         if (improvedTime === 0 && (getSecondsFromTimeComponents('improvedManualTime') > 0 || getSecondsFromTimeComponents('improvedAutoTime') > 0) ) {
            // This case means improved times are set, but sum is 0. This is fine for deletion type improvement.
         } else if (improvedTime === 0) {
            // If improved times are meant to be filled but are zero.
            showNotificationBanner('改善後の作業時間（手作業時間または自動送り時間）を設定してください。', 'warning', 3000);
            return false;
         }
    }


    // ビジネスルール：改善後時間が改善前時間より長い場合の警告
    if (targetScope === 'common' && improvedTime > currentTime) {
        const confirmed = confirm('改善後の時間が改善前より長くなっています。\nこのまま保存しますか？');
        if (!confirmed) {
            return false;
        }
    }

    return true;
}

/**
 * 時間帯フォーム全体の検証（ビジネスルール適用）
 * @returns {boolean} - 検証結果
 */
function validateTimeSlotForm() {
    const name = document.getElementById('timeSlotName').value.trim();
    const startTime = document.getElementById('timeSlotStartTime').value;
    const endTime = document.getElementById('timeSlotEndTime').value;

    // 基本検証
    if (!name) {
        showNotificationBanner('時間帯名は必須項目です。', 'error', 2500);
        return false;
    }

    if (name.length > 30) {
        showNotificationBanner('時間帯名は30文字以内で入力してください。', 'warning', 2500);
        return false;
    }

    if (!startTime || !endTime) {
        showNotificationBanner('開始時間と終了時間は必須です。', 'error', 2500);
        return false;
    }

    if (startTime >= endTime) {
        showNotificationBanner('終了時間は開始時間より後に設定してください。', 'warning', 2500);
        return false;
    }

    return true;
}

// ========================================
// Modal Initialization (Business Setup)
// ========================================




/**
 * 作業項目モーダル専用の閉じる制御関数
 * ESCキーまたは明示的なボタンクリックでのみ閉じる
 */
function setupWorkModalCloseControl() {
    const workModal = document.getElementById('workModal');
    if (!workModal) return;

    // 既存のリスナーをクリア（複数回呼び出される可能性があるため）
    const modalContent = workModal.querySelector('.modal-content');
    if (modalContent && modalContent._clickListener) {
        modalContent.removeEventListener('click', modalContent._clickListener);
    }
    const closeButtons = workModal.querySelectorAll('.modal-close, .btn-secondary[onclick*="closeWorkModal"], .modal-footer .btn-secondary'); //より具体的に
    closeButtons.forEach(button => {
        if (button._clickListener) {
            button.removeEventListener('click', button._clickListener);
        }
    });


    // モーダル内の閉じるボタンにイベントリスナーを設定
    const newCloseButtons = workModal.querySelectorAll('.modal-close, .btn-secondary[onclick*="closeWorkModal"], .modal-footer .btn-secondary');
    newCloseButtons.forEach(button => {
        const listener = function(e) {
            e.stopPropagation(); // イベントの伝播を停止
            closeWorkModal();
        };
        button.addEventListener('click', listener);
        button._clickListener = listener; // リスナーを保存して後で削除できるようにする
    });

    /// モーダルの内容部分をクリックした時の処理（閉じないようにする）
    if (modalContent) {
        const listener = function(e) {
            e.stopPropagation(); // モーダル外クリックイベントの伝播を停止
        };
        modalContent.addEventListener('click', listener);
        modalContent._clickListener = listener; // リスナーを保存
    }

    // モーダル外側のクリック処理（windowオブジェクトへのイベント追加）
    if (!window._workModalOutsideClickListenerRegistered) {
        window.addEventListener('click', function(e) {
            const currentWorkModal = document.getElementById('workModal');
            if (e.target === currentWorkModal && currentWorkModal.style.display === 'block') {
                if (typeof isWorkItemChanged === 'function' && isWorkItemChanged()) {
                    if (confirm("変更が反映されています。このままモーダルを閉じますか？\n（キャンセルを選ぶと編集を継続します）")) {
                        closeWorkModal();
                    }
                } else {
                    closeWorkModal();
                }
            }
        });
        window._workModalOutsideClickListenerRegistered = true;
    }
}

/**
 * 編集中の作業項目が変更されたかどうかを判定
 */
function isWorkItemChanged() {
    if (!currentEditingId || !originalWorkItemData) return false;
    const current = workItems.find(item => item.id === currentEditingId);
    if (!current) return false;

    // 基本プロパティと各時間値の比較
    return current.name !== originalWorkItemData.name ||
        current.category !== originalWorkItemData.category ||
        current.process !== originalWorkItemData.process ||
        current.targetScope !== originalWorkItemData.targetScope ||
        current.manualTime !== originalWorkItemData.manualTime ||
        current.autoTime !== originalWorkItemData.autoTime ||
        current.walkTime !== originalWorkItemData.walkTime ||
        current.improved.manualTime !== originalWorkItemData.improved.manualTime ||
        current.improved.autoTime !== originalWorkItemData.improved.autoTime ||
        current.improved.walkTime !== originalWorkItemData.improved.walkTime;
}

/**
 * 変更状態に応じてモーダルヘッダーのボタン表示を切り替える
 */
function updateWorkModalButtons() {
    const saveAndCloseBtn = document.getElementById('saveAndCloseBtn');
    const workModalCloseBtn = document.getElementById('workModalCloseBtn');
    const revertBtn = document.querySelector('#workModal .modal-header-actions .btn-secondary');
    if (!saveAndCloseBtn || !workModalCloseBtn) return;
    
    if (isWorkItemChanged()) {
        saveAndCloseBtn.style.display = 'inline-flex';
        workModalCloseBtn.style.display = 'none';
        if (revertBtn) revertBtn.style.display = 'inline-flex';
    } else {
        saveAndCloseBtn.style.display = 'none';
        workModalCloseBtn.style.display = 'inline-flex';
        if (revertBtn) revertBtn.style.display = 'none';
    }
}


/**
 * モーダル固有の検証を設定
 */
function setupModalSpecificValidation() {
    // 作業項目モーダルの保存ボタン
    const workSaveButton = document.querySelector('#workModal .modal-footer .btn-primary');
    if (workSaveButton) {
        workSaveButton.addEventListener('click', function(e) {
            // 作業項目モーダルが表示されている場合のみ検証
            const workModal = document.getElementById('workModal');
            if (workModal && workModal.style.display === 'block') {
                if (!validateWorkForm()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });
    }

    // 時間帯モーダルの保存ボタン
    const timeSlotSaveButton = document.querySelector('#timeSlotModal .modal-footer .btn-primary');
    if (timeSlotSaveButton) {
        timeSlotSaveButton.addEventListener('click', function(e) {
            // 時間帯モーダルが表示されている場合のみ検証
            const timeSlotModal = document.getElementById('timeSlotModal');
            if (timeSlotModal && timeSlotModal.style.display === 'block') {
                if (!validateTimeSlotForm()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });
    }

    // 頻度作業モーダルの保存ボタン
    const frequencySaveButton = document.querySelector('#frequencyWorkModal .modal-footer .btn-primary');
    if (frequencySaveButton) {
        frequencySaveButton.addEventListener('click', function(e) {
            // 頻度作業モーダルが表示されている場合のみ検証
            const frequencyModal = document.getElementById('frequencyWorkModal');
            if (frequencyModal && frequencyModal.style.display === 'block') {
                if (!validateFrequencyWorkForm()) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });
    }
}

/**
 * 頻度作業フォーム全体の検証
 * @returns {boolean} - 検証結果
 */
function validateFrequencyWorkForm() {
    const name = document.getElementById('frequencyWorkName').value.trim();
    const workTime = parseInt(document.getElementById('frequencyWorkTime').value) || 0;

    // 基本検証
    if (!name) {
        showNotificationBanner('作業名は必須項目です。', 'error', 2500);
        document.getElementById('frequencyWorkName').focus();
        return false;
    }

    if (name.length > 50) {
        showNotificationBanner('作業名は50文字以内で入力してください。', 'warning', 2500);
        document.getElementById('frequencyWorkName').focus();
        return false;
    }

    if (workTime <= 0 || isNaN(workTime)) {
        showNotificationBanner('作業時間は1秒以上の数値を入力してください。', 'warning', 2500);
        document.getElementById('frequencyWorkTime').focus();
        return false;
    }

    // 作業時間の上限チェック（警告のみ）
    if (workTime > 3600) {
        const confirmed = confirm(`作業時間が1時間（${formatTimeDisplay(3600)}）を超えています。\nこのまま保存しますか？`);
        if (!confirmed) {
            document.getElementById('frequencyWorkTime').focus();
            return false;
        }
    }

    return true;
}

/**
 * 頻度入力のタイプが変更されたときのUI切り替え
 * @param {string} type - 'count' または 'time'
 * @param {string} scope - 'current' または 'improved'
 */
function onFrequencyTypeChange(type, scope) {
    const countContainer = document.getElementById(`frequencyCountContainer_${scope}`);
    const timeContainer = document.getElementById(`frequencyTimeContainer_${scope}`);
    
    if (type === 'count') {
        countContainer.style.display = 'flex';
        timeContainer.style.display = 'none';
    } else {
        countContainer.style.display = 'none';
        timeContainer.style.display = 'flex';
    }
    // 頻度タイプ変更時にも影響度を再計算・表示
    updateFrequencyImpactDisplay(scope);
}

/**
 * 頻度作業の影響時間表示を更新する
 * @param {string} scope - 'current' または 'improved'
 */
function updateFrequencyImpactDisplay(scope) {
    const isImproved = scope === 'improved';

    // UIから値を取得
    const workTime = getSecondsFromTimeComponents('frequencyWorkTime', scope);
    const freqTypeRadio = document.querySelector(`input[name="${isImproved ? 'improvedFrequencyType' : 'frequencyType'}"]:checked`);
    
    if (!freqTypeRadio) {
        const formulaElement = document.getElementById(`frequencyImpactFormula_${scope}`);
        if(formulaElement) formulaElement.textContent = '頻度タイプを選択してください。';
        return;
    }

    const freqType = freqTypeRadio.value;
    let frequency;
    if (freqType === 'count') {
        const countInput = document.getElementById(`${isImproved ? 'improvedFrequencyWorkCount' : 'frequencyWorkCount'}`);
        frequency = { type: 'count', value: parseInt(countInput.value, 10) || 1 };
    } else {
        const timeValueInput = document.getElementById(`${isImproved ? 'improvedFrequencyWorkTimeValue' : 'frequencyWorkTimeValue'}`);
        const timeUnitSelect = document.getElementById(`${isImproved ? 'improvedFrequencyWorkTimeUnit' : 'frequencyWorkTimeUnit'}`);
        frequency = { type: 'time', value: parseInt(timeValueInput.value, 10) || 1, unit: timeUnitSelect.value };
    }

    // app.jsの新しい関数を呼び出す
    const { impactTime, formula } = calculateFrequencyImpactWithFormula(workTime, frequency, scope);
    
    // UIを更新
    const impactTimeElement = document.getElementById(`frequencyImpactTime_${scope}`);
    const formulaElement = document.getElementById(`frequencyImpactFormula_${scope}`);
    
    if (impactTimeElement) {
        let displayValue;
        if (impactTime > 0 && impactTime < 1) {
            displayValue = `${impactTime.toFixed(2)}s`;
        } else {
            displayValue = typeof formatTimeDisplay === 'function' ? formatTimeDisplay(impactTime) : `${Math.round(impactTime)}s`;
        }
        impactTimeElement.textContent = displayValue;
    }
    
    if (formulaElement) {
        formulaElement.textContent = formula;
    }
}