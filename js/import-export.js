
// ========================================
// CSV文字化け対策 - 修正版
// ========================================

/**
 * BOM付きUTF-8でCSVファイルを生成する汎用関数
 * @param {string} csvContent - CSV文字列
 * @param {string} filename - ファイル名
 */
function createCSVFile(csvContent, filename) {
    try {
        // UTF-8 BOMを追加（Excelでの文字化け防止）
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { 
            type: 'text/csv;charset=utf-8' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
        
        return true;
    } catch (error) {
        console.error('CSV file creation error:', error);
        return false;
    }
}

/**
 * CSVサンプルデータを生成・ダウンロード（文字化け対策版）
 */
function generateCSVSample() {
    try {
        const sampleData = [
            {
                name: 'ベースクレーンでライン投入', manualTime: 240, autoTime: 0, walkTime: 90,
                category: 'normal', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 180, autoTime: 0, walkTime: 60 },
                notes: 'クレーン操作・フック着脱含む'
            },
            {
                name: 'フロント溶接データのフィルム貼り', manualTime: 180, autoTime: 0, walkTime: 60,
                category: 'normal', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 180, autoTime: 0, walkTime: 60 },
                notes: ''
            },
            {
                name: 'ベースに溶接をセット', manualTime: 120, autoTime: 0, walkTime: 60,
                category: 'normal', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 90, autoTime: 0, walkTime: 60 },
                notes: ''
            },
            {
                name: '自動溶接ライン走行（監視）', manualTime: 90, autoTime: 300, walkTime: 60,
                category: 'monitor', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 60, autoTime: 240, walkTime: 30 },
                notes: '起動後ライン全体を巡回監視'
            },
            {
                name: '品質記録（手書き）', manualTime: 240, autoTime: 0, walkTime: 60,
                category: 'normal', process: 'lot2', targetScope: 'current-only',
                improved: { manualTime: 0, autoTime: 0, walkTime: 0 },
                notes: '改善後はシステム自動記録に置き換え'
            },
            {
                name: '品質データの自動送信', manualTime: 0, autoTime: 0, walkTime: 0,
                category: 'normal', process: 'lot2', targetScope: 'improved-only',
                improved: { manualTime: 60, autoTime: 0, walkTime: 0 },
                notes: 'タブレットでのワンタップ送信'
            },
            {
                name: '完成品の搬出・置き場整理', manualTime: 150, autoTime: 0, walkTime: 90,
                category: 'normal', process: 'lot2', targetScope: 'common',
                improved: { manualTime: 150, autoTime: 0, walkTime: 90 },
                notes: ''
            },
            {
                name: '自動走行完了までの手待ち', manualTime: 600, autoTime: 0, walkTime: 0,
                category: 'wait', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 480, autoTime: 0, walkTime: 0 },
                notes: '自動走行が完了するまで設備前で待機'
            }
        ];

        const csvContent = generateCSVContent(sampleData);
        const dateStr = new Date().toISOString().split('T')[0];
        const success = createCSVFile(csvContent, `作業項目サンプル_${dateStr}.csv`);
        if (success && typeof showNotificationBanner === 'function') {
            showNotificationBanner('CSVサンプルファイルを生成しました。', 'success', 2500);
        }
    } catch (error) {
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('CSVサンプル生成に失敗しました。', 'error', 3000);
        }
    }
}

/**
 * 最小単位のCSVサンプルを生成（文字化け対策版）
 */
function generateMinimalCSVSample() {
    try {
        const minimalData = [
            {
                name: '作業1', manualTime: 300, autoTime: 0, walkTime: 0,
                category: 'normal', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 240, autoTime: 0, walkTime: 0 },
                notes: ''
            },
            {
                name: '作業2（自動送りあり）', manualTime: 60, autoTime: 180, walkTime: 120,
                category: 'normal', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 60, autoTime: 120, walkTime: 60 },
                notes: '自動送り中は監視'
            },
            {
                name: '監視作業', manualTime: 120, autoTime: 0, walkTime: 60,
                category: 'monitor', process: 'lot1', targetScope: 'common',
                improved: { manualTime: 120, autoTime: 0, walkTime: 60 },
                notes: ''
            }
        ];

        const csvContent = generateCSVContent(minimalData);
        const dateStr = new Date().toISOString().split('T')[0];
        const success = createCSVFile(csvContent, `最小単位サンプル_${dateStr}.csv`);
        if (success && typeof showNotificationBanner === 'function') {
            showNotificationBanner('最小単位CSVサンプルを生成しました。', 'success', 2500);
        }
    } catch (error) {
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('最小単位CSVサンプル生成に失敗しました。', 'error', 3000);
        }
    }
}

/**
 * 現在の作業項目データをCSVとしてエクスポート（文字化け対策版）
 */
function exportCurrentDataAsCSV() {
    try {
        if (!workItems || workItems.length === 0) {
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('エクスポートする作業項目がありません。', 'warning', 2500);
            }
            return;
        }

        // CSVコンテンツ生成
        const csvContent = generateCSVContent(workItems);
        
        // ファイル名生成
        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toTimeString().substr(0, 5).replace(':', '');
        const productName = document.getElementById('productName')?.value || '';
        const productSuffix = productName ? `_${sanitizeFilename(productName)}` : '';
        
        const filename = `作業項目データ${productSuffix}_${dateStr}_${timeStr}.csv`;
        
        // BOM付きCSVファイル作成
        const success = createCSVFile(csvContent, filename);
        
        if (success && typeof showNotificationBanner === 'function') {
            showNotificationBanner(`現在の作業項目データをCSV形式で出力しました。(${workItems.length}項目)`, 'success', 3000);
        }
        
    } catch (error) {
        console.error('CSV export error:', error);
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('CSVエクスポートに失敗しました。', 'error', 3000);
        }
    }
}

/**
 * 作業項目データからCSVコンテンツを生成
 * 列構成（11列）:
 *   作業項目名, 手作業時間(秒), 自動送り時間(秒), 歩行時間(秒), 作業分類,
 *   工程, 対象区分,
 *   改善後手作業時間(秒), 改善後自動送り時間(秒), 改善後歩行時間(秒),
 *   備考
 * @param {Array} data - 作業項目データ配列
 * @returns {string} - CSV文字列
 */
function generateCSVContent(data) {
    const headers = [
        '作業項目名', '手作業時間', '自動送り時間', '歩行時間', '作業分類',
        '工程', '対象区分',
        '改善後手作業時間', '改善後自動送り時間', '改善後歩行時間',
        '備考'
    ];

    let csvContent = headers.join(',') + '\n';

    data.forEach(item => {
        const imp = item.improved || {};
        const row = [
            escapeCSVField(item.name || ''),
            item.manualTime || 0,
            item.autoTime   || 0,
            item.walkTime   || 0,
            item.category   || 'normal',
            item.process    || 'lot1',
            item.targetScope || 'common',
            imp.manualTime != null ? imp.manualTime : (item.manualTime || 0),
            imp.autoTime   != null ? imp.autoTime   : (item.autoTime   || 0),
            imp.walkTime   != null ? imp.walkTime   : (item.walkTime   || 0),
            escapeCSVField(item.notes || '')
        ];
        csvContent += row.join(',') + '\n';
    });

    return csvContent;
}

/**
 * CSVフィールドのエスケープ処理
 * @param {string} field - エスケープするフィールド
 * @returns {string} - エスケープされたフィールド
 */
function escapeCSVField(field) {
    if (typeof field !== 'string') {
        return field;
    }
    
    // カンマ、改行、ダブルクォートが含まれている場合はダブルクォートで囲む
    if (field.includes(',') || field.includes('\n') || field.includes('\r') || field.includes('"')) {
        // ダブルクォートをエスケープして全体をダブルクォートで囲む
        return '"' + field.replace(/"/g, '""') + '"';
    }
    
    return field;
}

/**
 * ファイル名用文字列のサニタイズ
 * @param {string} filename - サニタイズするファイル名
 * @returns {string} - サニタイズされたファイル名
 */
function sanitizeFilename(filename) {
    // ファイル名に使用できない文字を除去
    return filename.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
}

/**
 * CSVファイルをインポート（文字化け対策版・エンコーディング自動判定）
 */
// CSVインポート保留データ（プレビュー確認待ち）
let _csvPendingItems = [];
let _csvSkippedCount = 0;

async function importCSVFile(file) {
    try {
        showProgressIndicator('CSVを解析中...', true);
        const text = await readCSVFileWithAutoEncoding(file);
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSVファイルにデータが不足しています。');
        const { dataLines, hasHeader } = detectCSVStructure(lines);
        const items = [];
        let skipped = 0;
        for (let i = 0; i < dataLines.length; i++) {
            const line = dataLines[i].trim();
            if (!line) continue;
            const cols = parseCSVLineAdvanced(line);
            if (cols.length < 4) { skipped++; continue; }

            // 旧形式（5列）・新形式（11列）両対応
            // [0]作業項目名 [1]手作業時間 [2]自動送り時間 [3]歩行時間 [4]作業分類
            // [5]工程 [6]対象区分
            // [7]改善後手作業時間 [8]改善後自動送り時間 [9]改善後歩行時間
            // [10]備考
            const [name, manualRaw, autoRaw, walkRaw, catRaw,
                   processRaw, scopeRaw,
                   impManualRaw, impAutoRaw, impWalkRaw,
                   notesRaw] = cols;

            const pm  = Math.max(0, parseInt(manualRaw) || 0);
            const pa  = Math.max(0, parseInt(autoRaw)   || 0);
            const pw  = Math.max(0, parseInt(walkRaw)   || 0);
            if (pm === 0 && pa === 0) { skipped++; continue; }

            // 改善後時間（列が存在しない旧形式の場合は改善前と同値）
            const ipm = cols.length >= 8 ? Math.max(0, parseInt(impManualRaw) || 0) : pm;
            const ipa = cols.length >= 9 ? Math.max(0, parseInt(impAutoRaw)   || 0) : pa;
            const ipw = cols.length >= 10 ? Math.max(0, parseInt(impWalkRaw)  || 0) : pw;

            items.push({
                id:          Date.now() + i,
                name:        (name || '').trim() || `作業項目${i + 1}`,
                manualTime:  pm, autoTime: pa, walkTime: pw,
                category:    validateCategory(catRaw),
                process:     validateProcess(processRaw),
                targetScope: validateTargetScope(scopeRaw),
                notes:       (notesRaw || '').trim(),
                improved:    { manualTime: ipm, autoTime: ipa, walkTime: ipw }
            });
        }
        showProgressIndicator('', false);
        if (items.length === 0) throw new Error('有効なデータが見つかりませんでした。');
        _csvPendingItems = items;
        _csvSkippedCount = skipped;
        _showCSVPreviewModal(items, skipped);
    } catch (error) {
        showProgressIndicator('', false);
        showNotificationBanner(`CSVエラー: ${error.message}`, 'error', 3000);
    }
}

function _showCSVPreviewModal(items, skipped) {
    const modal = document.getElementById('csvImportModal');
    if (!modal) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('csvPreviewCount', items.length);
    set('csvPreviewNewCount', items.length);
    set('csvPreviewCurrentCount', typeof workItems !== 'undefined' ? workItems.length : 0);
    const skippedEl = document.getElementById('csvPreviewSkipped');
    const skippedTxt = document.getElementById('csvPreviewSkippedText');
    if (skippedEl) skippedEl.style.display = skipped > 0 ? 'flex' : 'none';
    if (skippedTxt) skippedTxt.textContent = `${skipped}行は形式エラーでスキップされました`;
    const tbody = document.getElementById('csvPreviewTableBody');
    const catLabels = { normal:'通常', monitor:'監視', hold:'保持', wait:'手待ち' };
    if (tbody) tbody.innerHTML = items.slice(0, 5).map((item, i) => `
        <tr>
            <td class="csv-pt-num">${i + 1}</td>
            <td class="csv-pt-name">${item.name}</td>
            <td class="csv-pt-time">${item.manualTime}秒</td>
            <td class="csv-pt-time">${item.autoTime}秒</td>
            <td class="csv-pt-time">${item.walkTime}秒</td>
            <td><span class="csv-pt-cat csv-cat-${item.category}">${catLabels[item.category] || item.category}</span></td>
        </tr>`).join('');
    const moreEl = document.getElementById('csvPreviewMore');
    if (moreEl) {
        moreEl.style.display = items.length > 5 ? 'block' : 'none';
        if (items.length > 5) moreEl.textContent = `他 ${items.length - 5} 件`;
    }
    modal.style.display = 'block';
}

function confirmCSVImport() {
    if (!_csvPendingItems || _csvPendingItems.length === 0) return;
    workItems = _csvPendingItems;
    _csvPendingItems = [];
    initializeWorkOrders();
    updateChart();
    triggerAutoSave();
    closeCsvImportModal();
    if (typeof _mgNotifyDataListChanged === 'function') _mgNotifyDataListChanged();
    showNotificationBanner(`${workItems.length}件の作業項目を読み込みました。`, 'success', 2500);
}

/**
 * 複数エンコーディング対応のCSVファイル読み込み
 * @param {File} file - 読み込むファイル
 * @returns {Promise<string>} - ファイル内容
 */
async function readCSVFileWithAutoEncoding(file) {
    try {
        // まずUTF-8で読み込みを試行
        const text = await readFileAsText(file, 'utf-8');
        
        // UTF-8として正常に読み込めたかチェック
        if (isValidUTF8Text(text)) {
            return text;
        }
        
        // UTF-8で読み込めない場合の処理
        console.warn('UTF-8 reading failed, file may be in different encoding');
        
        // ユーザーに文字化けの可能性を通知
        const userChoice = confirm(
            'ファイルが正しく読み込めない可能性があります。\n' +
            'UTF-8エンコーディングで保存されたCSVファイルを使用することをお勧めします。\n\n' +
            'そのまま続行しますか？（文字化けする可能性があります）'
        );
        
        if (!userChoice) {
            throw new Error('ユーザーによってインポートがキャンセルされました。');
        }
        
        return text; // とりあえずそのまま返す
        
    } catch (error) {
        throw new Error(`ファイル読み込みエラー: ${error.message}`);
    }
}

/**
 * ファイルをテキストとして読み込み
 * @param {File} file - 読み込むファイル
 * @param {string} encoding - エンコーディング
 * @returns {Promise<string>} - ファイル内容
 */
function readFileAsText(file, encoding = 'utf-8') {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        
        reader.onerror = function() {
            reject(new Error('ファイル読み込みエラー'));
        };
        
        reader.readAsText(file, encoding);
    });
}

/**
 * UTF-8テキストとして有効かチェック
 * @param {string} text - チェックするテキスト
 * @returns {boolean} - 有効かどうか
 */
function isValidUTF8Text(text) {
    // 基本的なチェック：制御文字や置換文字の存在を確認
    const hasReplacementChar = text.includes('\uFFFD'); // 置換文字
    const hasUnusualControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text);
    
    // 日本語文字の存在をチェック（日本語ファイルの場合）
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    
    if (hasJapanese && hasReplacementChar) {
        console.warn('Japanese characters detected with replacement characters - possible encoding issue');
        return false;
    }
    
    if (hasUnusualControlChars) {
        console.warn('Unusual control characters detected - possible encoding issue');
        return false;
    }
    
    return true;
}

/**
 * CSV構造の検出（ヘッダー行の自動判定）
 * @param {Array} lines - CSVの行配列
 * @returns {Object} - {dataLines, hasHeader}
 */
function detectCSVStructure(lines) {
    if (lines.length === 0) {
        return { dataLines: [], hasHeader: false };
    }
    
    // 最初の行を解析
    const firstLine = parseCSVLineAdvanced(lines[0]);
    
    // ヘッダー行の判定条件
    const possibleHeaders = [
        '作業項目名', '手作業時間', '自動送り時間', '歩行時間', '作業分類',
        '工程', '対象区分', '改善後手作業時間', '改善後自動送り時間', '改善後歩行時間', '備考',
        'name', 'manual', 'auto', 'walk', 'category', 'process', 'scope', 'notes'
    ];
    
    const hasHeaderKeywords = firstLine.some(cell => 
        possibleHeaders.some(header => 
            cell.toLowerCase().includes(header.toLowerCase()) || 
            header.toLowerCase().includes(cell.toLowerCase())
        )
    );
    
    // 数値が含まれているかチェック（ヘッダー行は通常数値を含まない）
    const hasNumbers = firstLine.slice(1).some(cell => /^\d+$/.test(cell.trim()));
    
    const hasHeader = hasHeaderKeywords && !hasNumbers;
    
    return {
        dataLines: hasHeader ? lines.slice(1) : lines,
        hasHeader: hasHeader
    };
}

/**
 * CSV行を解析（強化版・エスケープ処理対応）
 * @param {string} line - CSV行
 * @returns {Array} - 解析された列の配列
 */
function parseCSVLineAdvanced(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // エスケープされたダブルクォート
                current += '"';
                i += 2;
            } else {
                // ダブルクォートの開始/終了
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            // 区切り文字
            result.push(current.trim());
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }
    
    // 最後の列を追加
    result.push(current.trim());
    
    return result.map(item => item.replace(/^"|"$/g, '').trim());
}

/**
 * 作業分類の検証
 * @param {string} category - 作業分類
 * @returns {string} - 検証済み作業分類
 */
function validateCategory(category) {
    if (!category || typeof category !== 'string') {
        return 'normal';
    }
    
    const validCategories = ['normal', 'monitor', 'wait', 'hold'];
    const normalizedCategory = category.trim().toLowerCase();
    
    return validCategories.includes(normalizedCategory) ? normalizedCategory : 'normal';
}

/**
 * 工程値の検証
 * @param {string} value - 工程値
 * @returns {string} - 検証済み工程値
 */
function validateProcess(value) {
    if (!value || typeof value !== 'string') return 'lot1';
    const v = value.trim().toLowerCase();
    // 後方互換: current→lot1, next→lot2
    if (v === 'current') return 'lot1';
    if (v === 'next')    return 'lot2';
    return /^lot\d+$/.test(v) ? v : 'lot1';
}

/**
 * 対象区分値の検証
 * @param {string} value - 対象区分値
 * @returns {string} - 検証済み対象区分値
 */
function validateTargetScope(value) {
    if (!value || typeof value !== 'string') return 'common';
    const valid = ['common', 'current-only', 'improved-only'];
    const v = value.trim().toLowerCase();
    return valid.includes(v) ? v : 'common';
}
// ========================================
// JSON エクスポート
// ========================================

function exportData() {
    try {
        if (typeof showProgressIndicator === 'function') showProgressIndicator('書き出し中...', true);
        const data = (typeof getCurrentDataObject === 'function') ? getCurrentDataObject() : {};
        data.exportMetadata = {
            exportType: 'single', exportTimestamp: new Date().toISOString(),
            applicationVersion: '4.0.0',
            exportScope: ['標準作業組合せ票','工程確認チャート','頻度作業チャート','作業配分表','稼働時間データ','比較ガントチャート']
        };
        _downloadJSON(data, _buildSingleFilename(data));
        if (typeof showProgressIndicator === 'function') showProgressIndicator('', false);
        const sc = data.statistics || {};
        const parts = [];
        if ((sc.workItemCount||0)>0) parts.push(`作業項目 ${sc.workItemCount}件`);
        if ((sc.frequencyWorkCount||0)>0) parts.push(`頻度作業 ${sc.frequencyWorkCount}件`);
        if (typeof showNotificationBanner === 'function')
            showNotificationBanner(`現在のデータを書き出しました${parts.length?'（'+parts.join('・')+'）':''}`, 'success', 3000);
    } catch(e) {
        if (typeof showProgressIndicator === 'function') showProgressIndicator('', false);
        if (typeof showNotificationBanner === 'function') showNotificationBanner('書き出しに失敗しました。', 'error', 3000);
    }
}

function exportAllData() {
    try {
        if (!Array.isArray(dataList) || dataList.length === 0) {
            if (typeof showNotificationBanner === 'function') showNotificationBanner('保存済みデータがありません。', 'warning', 2500);
            return;
        }
        if (typeof showProgressIndicator === 'function') showProgressIndicator('全件書き出し中...', true);
        const bundle = {
            exportType: 'all', exportTimestamp: new Date().toISOString(),
            applicationVersion: '4.0.0', totalCount: dataList.length,
            dataList: dataList.map(d => ({...d})),
            exportMetadata: { exportedBy: '標準作業組合せ票', exportScope: 'dataList全件バックアップ' }
        };
        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toTimeString().substr(0,5).replace(':','');
        _downloadJSON(bundle, `標準作業組合せ票_全件バックアップ_${dateStr}_${timeStr}.json`);
        if (typeof showProgressIndicator === 'function') showProgressIndicator('', false);
        if (typeof showNotificationBanner === 'function')
            showNotificationBanner(`全${dataList.length}件を書き出しました。`, 'success', 3000);
    } catch(e) {
        if (typeof showProgressIndicator === 'function') showProgressIndicator('', false);
        if (typeof showNotificationBanner === 'function') showNotificationBanner('全件書き出しに失敗しました。', 'error', 3000);
    }
}

// ========================================
// JSON インポート（3種）
// ========================================

function importData() {
    _openFilePicker('.json,application/json', (file) => {
        _readJSON(file, (data) => {
            if (data.exportType === 'all') {
                if (typeof showNotificationBanner === 'function')
                    showNotificationBanner('このファイルは全件バックアップ形式です。「全件読み込み」を使用してください。', 'warning', 4000);
                return;
            }
            if (!_validateSingleData(data)) return;
            const hasData = (typeof window.workItems !== 'undefined' && window.workItems.length > 0);
            const doImport = () => {
                if (typeof loadDataFromObject === 'function') loadDataFromObject(data);
                if (typeof triggerAutoSave === 'function') triggerAutoSave();
                // loadDataFromObject 内で _mgNotifyDataListChanged が呼ばれるが
                // dataList への影響がない単票インポートでは念のため再呼出し
                if (typeof _mgNotifyDataListChanged === 'function') _mgNotifyDataListChanged();
                const parts = _buildImportSummaryParts(data);
                if (typeof showNotificationBanner === 'function')
                    showNotificationBanner(`現在のデータを置き換えました${parts.length?'（'+parts.join('・')+'）':''}`, 'success', 4000);
                if (typeof performDataIntegrityCheck === 'function') setTimeout(()=>performDataIntegrityCheck(data),1000);
            };
            if (hasData) {
                _showConfirmDialog({
                    title: '現在のデータを置き換えます',
                    message: `<b>${_buildImportScopeLabel(data)}</b> を読み込みます。<br>現在画面に表示中のデータは上書きされます。`,
                    confirmLabel: '置き換える', confirmClass: 'fmp-btn-danger', onConfirm: doImport
                });
            } else { doImport(); }
        });
    });
}

function importAddToList() {
    _openFilePicker('.json,application/json', (file) => {
        _readJSON(file, (data) => {
            let itemsToAdd = [];
            if (data.exportType === 'all') {
                if (!Array.isArray(data.dataList) || data.dataList.length === 0) {
                    if (typeof showNotificationBanner === 'function') showNotificationBanner('追加できるデータが見つかりませんでした。', 'warning', 3000);
                    return;
                }
                itemsToAdd = data.dataList;
            } else {
                if (!_validateSingleData(data)) return;
                const name = data.product || `インポート_${new Date().toLocaleDateString('ja-JP')}`;
                itemsToAdd = [{ id: null, name, data, createdAt: data.exportMetadata?.exportTimestamp || new Date().toISOString() }];
            }
            const existingNames = new Set(dataList.map(d => d.name));
            const conflicts = itemsToAdd.filter(item => existingNames.has(item.name));
            const executeAdd = (policy) => {
                let addedCount = 0, skippedCount = 0;
                itemsToAdd.forEach(item => {
                    const isConflict = existingNames.has(item.name);
                    if (isConflict) {
                        if (policy === 'skip') { skippedCount++; return; }
                        if (policy === 'overwrite') {
                            const existing = dataList.find(d => d.name === item.name);
                            if (existing) { existing.data = item.data; existing.createdAt = new Date().toISOString(); addedCount++; return; }
                        }
                        item = { ...item, name: _resolveNameConflict(item.name) };
                    }
                    dataList.push({ id: Date.now().toString()+Math.random().toString(36).substr(2,5), name: item.name, data: item.data, createdAt: new Date().toISOString() });
                    existingNames.add(item.name);
                    addedCount++;
                });
                if (typeof updateDataListSelect === 'function') updateDataListSelect();
                if (typeof updateDataSelectionList === 'function') updateDataSelectionList();
                if (typeof triggerAutoSave === 'function') triggerAutoSave();
                if (typeof _mgNotifyDataListChanged === 'function') _mgNotifyDataListChanged();
                let msg = `${addedCount}件を一覧に追加しました。`;
                if (skippedCount > 0) msg += `（${skippedCount}件スキップ）`;
                if (typeof showNotificationBanner === 'function') showNotificationBanner(msg, 'success', 3000);
            };
            if (conflicts.length > 0) {
                _showConflictPolicyDialog(conflicts.map(c => c.name), executeAdd);
            } else { executeAdd('rename'); }
        });
    });
}

function importAllData() {
    _openFilePicker('.json,application/json', (file) => {
        _readJSON(file, (data) => {
            if (data.exportType !== 'all') {
                if (typeof showNotificationBanner === 'function')
                    showNotificationBanner('このファイルは全件バックアップ形式ではありません。「一覧に追加」または「現在を置き換え」を使用してください。', 'warning', 5000);
                return;
            }
            if (!Array.isArray(data.dataList) || data.dataList.length === 0) {
                if (typeof showNotificationBanner === 'function') showNotificationBanner('ファイル内にデータが見つかりませんでした。', 'warning', 3000);
                return;
            }
            _showConfirmDialog({
                title: '⚠ 全件データを上書き復元します',
                message: `現在の保存済みデータ <b>全${dataList.length}件</b> がすべて削除され、<br>ファイル内の <b>${data.dataList.length}件</b> に置き換えられます。<br><br><span style="color:#dc2626;font-weight:700;">この操作は取り消せません。</span>`,
                confirmLabel: `全件を上書き復元（${data.dataList.length}件）`, confirmClass: 'fmp-btn-danger',
                onConfirm: () => {
                    dataList = data.dataList.map(d => ({ id: d.id||Date.now().toString()+Math.random().toString(36).substr(2,5), name: d.name||'名称未設定', data: d.data, createdAt: d.createdAt||new Date().toISOString() }));
                    selectedDataIds = []; currentDataId = null;
                    if (typeof clearAllData === 'function') clearAllData(false);
                    if (typeof updateDataListSelect === 'function') updateDataListSelect();
                    if (typeof updateDataSelectionList === 'function') updateDataSelectionList();
                    if (typeof triggerAutoSave === 'function') triggerAutoSave();
                    if (typeof _mgNotifyDataListChanged === 'function') _mgNotifyDataListChanged();
                    if (typeof showNotificationBanner === 'function') showNotificationBanner(`全${dataList.length}件を復元しました。`, 'success', 3000);
                }
            });
        });
    });
}

// ========================================
// 競合ポリシーダイアログ（方針A）
// ========================================
function _showConflictPolicyDialog(conflictNames, onConfirm) {
    const existing = document.getElementById('conflictPolicyDialog');
    if (existing) existing.remove();
    const count = conflictNames.length;
    const previewList = conflictNames.slice(0,5).map(n=>`<li>${n}</li>`).join('');
    const moreText = count>5?`<li style="color:var(--text-muted)">他 ${count-5} 件...</li>`:'';
    const overlay = document.createElement('div');
    overlay.id = 'conflictPolicyDialog';
    overlay.className = 'conflict-dialog-overlay';
    overlay.innerHTML = `<div class="conflict-dialog">
        <div class="conflict-dialog-header"><i class="fas fa-exclamation-circle" style="color:#f59e0b;font-size:18px;"></i><span>同名データが ${count} 件あります</span></div>
        <div class="conflict-dialog-body">
            <p class="conflict-dialog-desc">以下のデータ名が既に保存済み一覧に存在します。どのように処理しますか？</p>
            <ul class="conflict-name-list">${previewList}${moreText}</ul>
            <div class="conflict-policy-options">
                <label class="conflict-policy-item"><input type="radio" name="conflictPolicy" value="overwrite" checked>
                    <div class="conflict-policy-content"><span class="conflict-policy-title"><i class="fas fa-redo"></i> 既存を上書き</span><span class="conflict-policy-desc">同名の既存データをファイルの内容で上書きします</span></div></label>
                <label class="conflict-policy-item"><input type="radio" name="conflictPolicy" value="skip">
                    <div class="conflict-policy-content"><span class="conflict-policy-title"><i class="fas fa-forward"></i> スキップ</span><span class="conflict-policy-desc">同名のデータは追加しません（既存を保持）</span></div></label>
                <label class="conflict-policy-item"><input type="radio" name="conflictPolicy" value="rename">
                    <div class="conflict-policy-content"><span class="conflict-policy-title"><i class="fas fa-copy"></i> 別名で追加</span><span class="conflict-policy-desc">「製品A (2)」のように連番をつけて両方残します</span></div></label>
            </div>
        </div>
        <div class="conflict-dialog-footer">
            <button class="btn conflict-btn-cancel" onclick="document.getElementById('conflictPolicyDialog').remove()">キャンセル</button>
            <button class="btn conflict-btn-confirm" onclick="const p=document.querySelector('#conflictPolicyDialog input[name=conflictPolicy]:checked')?.value||'skip';document.getElementById('conflictPolicyDialog').remove();_conflictPolicyCallback(p);">
                <i class="fas fa-check"></i> この方針で追加する
            </button>
        </div></div>`;
    document.body.appendChild(overlay);
    window._conflictPolicyCallback = (policy) => { delete window._conflictPolicyCallback; onConfirm(policy); };
}

function _showConfirmDialog(opts) {
    const existing = document.getElementById('importConfirmDialog');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'importConfirmDialog';
    overlay.className = 'conflict-dialog-overlay';
    overlay.innerHTML = `<div class="conflict-dialog">
        <div class="conflict-dialog-header"><i class="fas fa-info-circle" style="color:var(--primary-color);font-size:18px;"></i><span>${opts.title}</span></div>
        <div class="conflict-dialog-body"><p class="conflict-dialog-desc" style="line-height:1.7;">${opts.message}</p></div>
        <div class="conflict-dialog-footer">
            <button class="btn conflict-btn-cancel" onclick="document.getElementById('importConfirmDialog').remove()">キャンセル</button>
            <button class="btn ${opts.confirmClass||'fmp-btn-save'}" id="importConfirmOkBtn">${opts.confirmLabel||'確認'}</button>
        </div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('importConfirmOkBtn').addEventListener('click', () => { overlay.remove(); opts.onConfirm(); });
}

// ========================================
// 内部ユーティリティ
// ========================================
function _openFilePicker(accept, onFile) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = e => { const f = e.target.files[0]; if (f) onFile(f); };
    input.click();
}
function _readJSON(file, onData) {
    if (file.size > 10*1024*1024) { if (typeof showNotificationBanner==='function') showNotificationBanner('ファイルサイズが10MBを超えています。','error',3000); return; }
    if (typeof showProgressIndicator==='function') showProgressIndicator('読み込み中...',true);
    const reader = new FileReader();
    reader.onload = e => { if (typeof showProgressIndicator==='function') showProgressIndicator('',false); try { onData(JSON.parse(e.target.result)); } catch { if (typeof showNotificationBanner==='function') showNotificationBanner('有効なJSONファイルではありません。','error',3000); } };
    reader.onerror = () => { if (typeof showProgressIndicator==='function') showProgressIndicator('',false); if (typeof showNotificationBanner==='function') showNotificationBanner('ファイルの読み込みに失敗しました。','error',3000); };
    reader.readAsText(file,'utf-8');
}
function _validateSingleData(data) {
    if (!data || typeof data !== 'object') { if (typeof showNotificationBanner==='function') showNotificationBanner('無効なデータ形式です。','error',3000); return false; }
    for (const f of ['workItems','frequencyWorkItems','timeSlots']) {
        if (data[f]!==undefined && !Array.isArray(data[f])) { if (typeof showNotificationBanner==='function') showNotificationBanner(`データ形式エラー: ${f}が正しくありません。`,'error',3000); return false; }
    }
    return true;
}
function _buildSingleFilename(data) {
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().substr(0,5).replace(':','');
    const p = data.product ? `_${data.product.replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g,'')}` : '';
    return `標準作業組合せ票${p}_${dateStr}_${timeStr}.json`;
}
function _buildImportScopeLabel(data) {
    const parts=[];
    if (Array.isArray(data.workItems)&&data.workItems.length>0) parts.push('標準作業組合せ票');
    if (Array.isArray(data.frequencyWorkItems)&&data.frequencyWorkItems.length>0) parts.push('頻度作業チャート');
    if (data.distributionVariability&&Object.keys(data.distributionVariability).length>0) parts.push('作業配分表');
    if ((Array.isArray(data.timeSlots)&&data.timeSlots.length>0)||data.scheduleConfig) parts.push('稼働時間データ');
    return parts.length>0?parts.join('・'):'設定データ';
}
function _buildImportSummaryParts(data) {
    const parts=[];
    if (Array.isArray(data.workItems)&&data.workItems.length>0) parts.push(`作業項目 ${data.workItems.length}件`);
    if (Array.isArray(data.frequencyWorkItems)&&data.frequencyWorkItems.length>0) parts.push(`頻度作業 ${data.frequencyWorkItems.length}件`);
    if (Array.isArray(data.timeSlots)&&data.timeSlots.length>0) parts.push(`時間帯 ${data.timeSlots.length}件`);
    return parts;
}
function _resolveNameConflict(name) {
    const existingNames = new Set(dataList.map(d => d.name));
    const baseMatch = name.match(/^(.*?)\s*\((\d+)\)$/);
    const baseName = baseMatch ? baseMatch[1].trim() : name;
    let candidate = name, n = 2;
    while (existingNames.has(candidate)) candidate = `${baseName} (${n++})`;
    return candidate;
}
function _downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
