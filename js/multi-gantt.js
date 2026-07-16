// ================================================
// multi-gantt.js  ―  比較ガントチャート
//
// ■ 役割
//   複数作業者（dataList）を縦軸に並べた読み取り専用ガントチャートを
//   提供する。改善前/後の切り替え、ホバーツールチップを備える。
//
// ■ 依存
//   app.js の dataList, taktTime など（グローバル変数参照）
//   app.js の switchMainTab（モンキーパッチで機能拡張）
//
// ■ 設計方針
//   ・app.js / chart-renderer.js を直接変更しない
//   ・switchMainTab をラップしてタブ切り替えを横取り
//   ・Canvas は DPR 対応（setupHighDPICanvas と同等）
// ================================================

'use strict';

// ────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────
let mgSelectedIds   = [];
let mgDisplayMode   = 'current'; // 'current' | 'improved'
let mgCanvas        = null;
let mgCtx           = null;
let mgIsReady       = false;
let mgHoverArea     = null; // 現在ホバー中のヒットエリア
let mgHitAreas      = []; // [{x,y,w,h, workerIdx, item, times}]

// ────────────────────────────────────────────────
// Layout Constants
// ────────────────────────────────────────────────
const MG = {
    LEFT_MARGIN:  175,
    TOP_MARGIN:    54,
    ROW_HEIGHT:    70,
    BOT_MARGIN:    40,
    RIGHT_PAD:     70,
    LABEL_PADH:    10,
    BAR_RATIO:     0.40, // barHeight = ROW_HEIGHT * BAR_RATIO
    MIN_WIDTH:   1200,
};

// ────────────────────────────────────────────────
// Color helpers
// ────────────────────────────────────────────────
const MG_COLOR = {
    current:    '#1f2937',
    improved:   '#dc2626',
    autoNorm:   'rgba(100,116,139,0.14)',
    autoImp:    'rgba(220,38,38,0.10)',
    walkNorm:   'rgba(100,116,139,0.28)',
    walkImp:    'rgba(220,38,38,0.20)',
    ttLine:     '#dc2626',
    grid:       '#e2e8f0',
    rowAlt:     '#f9fafb',
    rowBase:    '#ffffff',
    labelBg:    '#f1f5f9',
    labelBorder:'#cbd5e1',
    axisFg:     '#64748b',
    tooltip:    'rgba(15,23,42,0.93)',
};

function mgMainColor(mode) {
    return mode === 'improved' ? MG_COLOR.improved : MG_COLOR.current;
}

// ────────────────────────────────────────────────
// dataList 変更フック（保存/ロード時に選択リストを自動更新）
// app.js の saveCurrentDataToList などから呼ばれることを想定。
// 実際の呼び出しは app.js 非侵襲のため、比較ガントタブが
// アクティブな場合にのみ再描画する形で自律的に処理する。
// ────────────────────────────────────────────────

// ────────────────────────────────────────────────
// Panel UI
// ────────────────────────────────────────────────

/**
 * dataList の変更に追随して selectedIds を更新する
 * （削除されたIDを除外、全未選択なら全選択を初期値とする）
 */
function mgSyncSelectionFromDataList() {
    if (!Array.isArray(dataList)) return;
    const validIds = dataList.map(d => d.id);

    // 存在しないIDを除外
    mgSelectedIds = mgSelectedIds.filter(id => validIds.includes(id));

    // 初回（空）なら全選択
    if (mgSelectedIds.length === 0 && validIds.length > 0) {
        mgSelectedIds = [...validIds];
    }
}

/** 左パネルの作業者リストを再描画 */
function mgUpdateSelectionList() {
    const container = document.getElementById('mgWorkerList');
    if (!container) return;

    const list = dataList || [];

    if (list.length === 0) {
        container.innerHTML = `
            <div class="mg-empty-list">
                <i class="fas fa-inbox"></i>
                <span>保存済みデータがありません<br>データを保存すると比較できます</span>
            </div>`;
        mgUpdateBadge();
        return;
    }

    const sorted = [...list].sort((a, b) =>
        (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    container.innerHTML = '';
    sorted.forEach(entry => {
        const isSelected = mgSelectedIds.includes(entry.id);
        const data = entry.data || {};
        const ct   = mgCalcCycleTime(data, mgDisplayMode);
        const ctStr = ct > 0 ? mgFmt(ct) : '-';
        const ttVal = data.taktTime || (typeof taktTime !== 'undefined' ? taktTime : 0);
        const overTT = ttVal > 0 && ct > ttVal;

        const div = document.createElement('div');
        div.className = 'data-selection-item' + (isSelected ? ' selected' : '');
        div.dataset.id = entry.id;
        div.onclick = () => mgToggleWorker(entry.id);
        div.innerHTML = `
            <input type="checkbox" class="data-selection-checkbox"
                   ${isSelected ? 'checked' : ''}
                   onclick="event.stopPropagation(); mgToggleWorker('${entry.id}')">
            <span class="data-selection-name" title="${mgEsc(entry.name || '')}">
                ${mgEsc(entry.name || '名前なし')}
            </span>
            <span class="data-selection-info" style="color:${overTT ? '#dc2626' : '#64748b'};">
                ${ctStr}${overTT ? ' ▲' : ''}
            </span>
        `;
        container.appendChild(div);
    });

    mgUpdateBadge();
}

function mgToggleWorker(id) {
    const idx = mgSelectedIds.indexOf(id);
    if (idx === -1) {
        mgSelectedIds.push(id);
    } else {
        mgSelectedIds.splice(idx, 1);
    }
    mgUpdateSelectionList();
    mgUpdateHeaderInfo();
    mgRedraw();
}

function mgSelectAll() {
    mgSelectedIds = (dataList || []).map(d => d.id);
    mgUpdateSelectionList();
    mgUpdateHeaderInfo();
    mgRedraw();
}

function mgClearAll() {
    mgSelectedIds = [];
    mgUpdateSelectionList();
    mgUpdateHeaderInfo();
    mgRedraw();
}

function mgSetDisplayMode(mode) {
    mgDisplayMode = mode;
    document.querySelectorAll('.mg-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    mgUpdateSelectionList(); // C/T値をリフレッシュ
    mgUpdateHeaderInfo();
    mgRedraw();
}

function mgUpdateBadge() {
    const badge = document.getElementById('mgCountBadge');
    if (badge) badge.textContent = `${mgSelectedIds.length}件選択`;
}

function mgUpdateHeaderInfo() {
    const area = document.getElementById('mgHeaderInfo');
    if (!area) return;

    const mode = mgDisplayMode;
    const modeLabel = mode === 'improved' ? '改善後' : '改善前';
    const modeClass = mode === 'improved' ? 'mode-improved' : 'mode-current';
    const modeIcon  = mode === 'improved' ? 'fa-rocket' : 'fa-tasks';

    const tt = typeof taktTime !== 'undefined' && taktTime > 0 ? taktTime : 0;
    const ttStr = tt > 0 ? mgFmt(tt) : '-';

    area.innerHTML = `
        <span class="mg-info-chip ${modeClass}">
            <i class="fas ${modeIcon}"></i>${modeLabel}
        </span>
        <span class="mg-info-chip">
            <i class="fas fa-users"></i>${mgSelectedIds.length}名表示
        </span>
        ${tt > 0 ? `<span class="mg-info-chip">
            <i class="fas fa-tachometer-alt" style="color:#dc2626;"></i>T/T ${ttStr}
        </span>` : ''}
    `;
}

// ────────────────────────────────────────────────
// Data helpers
// ────────────────────────────────────────────────

/** 表示モードに応じてフィルタ・ソートした作業項目配列を返す */
function mgGetItems(data, mode) {
    if (!data || !Array.isArray(data.workItems)) return [];

    const order = mode === 'improved'
        ? (data.improvedWorkOrder || [])
        : (data.currentWorkOrder  || []);

    const map = {};
    data.workItems.forEach(it => { map[it.id] = it; });

    let items;
    if (order.length > 0) {
        items = order.map(id => map[id]).filter(Boolean);
        // orderに含まれなかった新規アイテムを末尾に追加
        const inOrder = new Set(order);
        data.workItems.forEach(it => { if (!inOrder.has(it.id)) items.push(it); });
    } else {
        items = [...data.workItems];
    }

    // targetScope フィルタ
    return items.filter(it => {
        if (mode === 'current')  return it.targetScope !== 'improved-only';
        if (mode === 'improved') return it.targetScope !== 'current-only';
        return true;
    });
}

/** 作業項目の時間を改善前/後に応じて取得 */
function mgTimes(item, mode) {
    if (mode === 'improved') {
        const imp = item.improved || {};
        return {
            manual: imp.manualTime || 0,
            auto:   imp.autoTime   || 0,
            walk:   imp.walkTime   || 0,
        };
    }
    return {
        manual: item.manualTime || 0,
        auto:   item.autoTime   || 0,
        walk:   item.walkTime   || 0,
    };
}

/** サイクルタイム合計を計算 */
function mgCalcCycleTime(data, mode) {
    return mgGetItems(data, mode).reduce((sum, it) => {
        const t = mgTimes(it, mode);
        return sum + t.manual + t.auto + t.walk;
    }, 0);
}

/** 秒 → 表示文字列（s / m / ms 形式） */
function mgFmt(sec) {
    if (sec <= 0)   return '0s';
    if (sec < 60)   return `${Math.round(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m}m${s}s` : `${m}m`;
}

/** 最小 HTML エスケープ */
function mgEsc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ────────────────────────────────────────────────
// Canvas setup
// ────────────────────────────────────────────────

function mgInitCanvas() {
    mgCanvas = document.getElementById('multiGanttCanvas');
    if (!mgCanvas) return;
    mgCtx = mgCanvas.getContext('2d');
    mgIsReady = true;

    mgCanvas.removeEventListener('mousemove',  mgOnMouseMove);
    mgCanvas.removeEventListener('mouseleave', mgOnMouseLeave);
    mgCanvas.addEventListener('mousemove',  mgOnMouseMove);
    mgCanvas.addEventListener('mouseleave', mgOnMouseLeave);
}

function mgSetupDPR(logicW, logicH) {
    const dpr = window.devicePixelRatio || 1;
    mgCanvas.width  = Math.floor(logicW * dpr);
    mgCanvas.height = Math.floor(logicH * dpr);
    mgCanvas.style.width  = logicW + 'px';
    mgCanvas.style.height = logicH + 'px';
    mgCtx.setTransform(1, 0, 0, 1, 0, 0);
    mgCtx.scale(dpr, dpr);
    return dpr;
}

// ────────────────────────────────────────────────
// Main redraw entry point
// ────────────────────────────────────────────────

function mgRedraw() {
    if (!mgIsReady || !mgCanvas || !mgCtx) return;

    const container = document.getElementById('mgCanvasContainer');
    if (!container) return;

    const containerW = container.clientWidth || MG.MIN_WIDTH;
    const chartW     = Math.max(MG.MIN_WIDTH, containerW - 4);

    // 選択中の作業者エントリを取得
    const list = dataList || [];
    const selected = mgSelectedIds
        .map(id => list.find(d => d.id === id))
        .filter(Boolean);

    if (selected.length === 0) {
        mgDrawEmpty(chartW, list.length === 0);
        return;
    }

    // グローバルタクトタイムを基準スケールとして利用
    const tt = (typeof taktTime !== 'undefined' && taktTime > 0) ? taktTime : 60;

    // X軸の最大時間 = T/T × 1.25 と全作業者C/T最大値のうち大きい方
    let maxTime = tt * 1.25;
    selected.forEach(entry => {
        const ct = mgCalcCycleTime(entry.data || {}, mgDisplayMode);
        if (ct > maxTime) maxTime = ct * 1.05;
    });

    const numRows    = selected.length;
    const chartH     = MG.TOP_MARGIN + numRows * MG.ROW_HEIGHT + MG.BOT_MARGIN;
    const chartAreaW = chartW - MG.LEFT_MARGIN - MG.RIGHT_PAD;
    const timeScale  = chartAreaW / maxTime;

    mgSetupDPR(chartW, chartH);

    const ctx = mgCtx;
    mgHitAreas = [];

    // ── 全体背景
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, chartW, chartH);

    // ── 行ストライプ背景（チャートエリアのみ）
    selected.forEach((_, ri) => {
        const rowY = MG.TOP_MARGIN + ri * MG.ROW_HEIGHT;
        ctx.fillStyle = ri % 2 === 0 ? MG_COLOR.rowBase : MG_COLOR.rowAlt;
        ctx.fillRect(MG.LEFT_MARGIN, rowY, chartAreaW + MG.RIGHT_PAD, MG.ROW_HEIGHT);
    });

    // ── グリッド線（縦）
    mgDrawGrid(ctx, chartW, chartH, timeScale, maxTime, tt);

    // ── T/T線
    mgDrawTTLine(ctx, tt, timeScale, chartH);

    // ── 各作業者行
    selected.forEach((entry, ri) => {
        mgDrawWorkerRow(ctx, entry, ri, timeScale, chartW);
    });

    // ── 行区切り線（全幅）
    ctx.save();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let ri = 0; ri <= numRows; ri++) {
        const lineY = MG.TOP_MARGIN + ri * MG.ROW_HEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(chartW, lineY);
        ctx.stroke();
    }
    ctx.restore();

    // ── 左ラベルエリア（上から重ね書き）
    ctx.fillStyle = MG_COLOR.labelBg;
    ctx.fillRect(0, MG.TOP_MARGIN, MG.LEFT_MARGIN, numRows * MG.ROW_HEIGHT);

    ctx.save();
    ctx.strokeStyle = MG_COLOR.labelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MG.LEFT_MARGIN, 0);
    ctx.lineTo(MG.LEFT_MARGIN, chartH);
    ctx.stroke();
    ctx.restore();

    // ── 作業者名ラベル
    selected.forEach((entry, ri) => {
        mgDrawWorkerLabel(ctx, entry, ri);
    });

    // ── 上部時間軸（最前面）
    mgDrawTimeAxis(ctx, timeScale, maxTime, chartW);

    // ── ホバーツールチップ
    // (HTMLベースの showDynamicTooltip に移行したため Canvas への描画は行いません)
}

// ────────────────────────────────────────────────
// Drawing sub-functions
// ────────────────────────────────────────────────

/** グリッド縦線と目盛りラベル */
function mgDrawGrid(ctx, chartW, chartH, timeScale, maxTime, tt) {
    const interval = mgNiceInterval(timeScale, 55);

    ctx.save();
    ctx.strokeStyle = MG_COLOR.grid;
    ctx.lineWidth   = 1;

    for (let t = 0; t <= maxTime + interval; t += interval) {
        const x = MG.LEFT_MARGIN + t * timeScale;
        if (x > chartW - MG.RIGHT_PAD + 2) break;
        ctx.beginPath();
        ctx.moveTo(x, MG.TOP_MARGIN);
        ctx.lineTo(x, chartH - MG.BOT_MARGIN);
        ctx.stroke();
    }
    ctx.restore();
}

/** T/T垂直ライン */
function mgDrawTTLine(ctx, tt, timeScale, chartH) {
    const x = MG.LEFT_MARGIN + tt * timeScale;
    ctx.save();
    ctx.strokeStyle = MG_COLOR.ttLine;
    ctx.lineWidth   = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(x, MG.TOP_MARGIN - 10);
    ctx.lineTo(x, chartH - MG.BOT_MARGIN);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

/** 上部時間軸（ヘッダーバー） */
function mgDrawTimeAxis(ctx, timeScale, maxTime, chartW) {
    // ヘッダー背景
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, chartW, MG.TOP_MARGIN);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, MG.TOP_MARGIN);
    ctx.lineTo(chartW, MG.TOP_MARGIN);
    ctx.stroke();

    const interval = mgNiceInterval(timeScale, 55);

    ctx.fillStyle   = MG_COLOR.axisFg;
    ctx.font        = '10px "Segoe UI", sans-serif';
    ctx.textAlign   = 'center';

    for (let t = 0; t <= maxTime + interval; t += interval) {
        const x = MG.LEFT_MARGIN + t * timeScale;
        if (x > chartW - MG.RIGHT_PAD + 2) break;

        // ティック
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, MG.TOP_MARGIN - 5);
        ctx.lineTo(x, MG.TOP_MARGIN);
        ctx.stroke();

        // ラベル
        ctx.fillText(mgFmt(t), x, MG.TOP_MARGIN - 8);
    }

    // T/T ラベル（軸上部）
    const ttVal = (typeof taktTime !== 'undefined' && taktTime > 0) ? taktTime : 0;
    if (ttVal > 0) {
        const ttX = MG.LEFT_MARGIN + ttVal * timeScale;
        ctx.fillStyle  = MG_COLOR.ttLine;
        ctx.font       = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText('T/T', ttX, 14);
        ctx.fillText(mgFmt(ttVal), ttX, 26);
    }

    // 左上「作業者」ヘッダーセル
    ctx.fillStyle  = '#475569';
    ctx.font       = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign  = 'center';
    ctx.fillText('作業者', MG.LEFT_MARGIN / 2, MG.TOP_MARGIN / 2 + 5);

    ctx.restore();
}

/** 作業者名ラベル（左パネル部分） */
function mgDrawWorkerLabel(ctx, entry, ri) {
    const rowY   = MG.TOP_MARGIN + ri * MG.ROW_HEIGHT;
    const midY   = rowY + MG.ROW_HEIGHT / 2;
    const data   = entry.data || {};
    const name   = entry.name || data.operator || '名前なし';
    const ct     = mgCalcCycleTime(data, mgDisplayMode);
    const ttVal  = data.taktTime || (typeof taktTime !== 'undefined' ? taktTime : 0);
    const overTT = ttVal > 0 && ct > ttVal;
    const padL   = MG.LABEL_PADH + 6;
    const maxW   = MG.LEFT_MARGIN - padL - 10;

    ctx.save();

    // モードカラードット
    ctx.fillStyle = mgMainColor(mgDisplayMode);
    ctx.beginPath();
    ctx.arc(padL - 2, midY - 7, 4, 0, Math.PI * 2);
    ctx.fill();

    // 名前（折り返しなし、省略あり）
    ctx.fillStyle = '#1e293b';
    ctx.font      = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    let displayName = mgTruncateText(ctx, name, maxW - 4);
    ctx.fillText(displayName, padL + 6, midY - 2);

    // C/T値
    ctx.font      = 'bold 11px "Consolas", monospace';
    ctx.fillStyle = overTT ? '#dc2626' : '#059669';
    ctx.fillText(mgFmt(ct), padL + 6, midY + 13);

    // T/T超過バッジ
    if (overTT) {
        ctx.font      = '9px "Segoe UI", sans-serif';
        ctx.fillStyle = '#dc2626';
        ctx.fillText('▲ T/T超過', padL + 6, midY + 24);
    }

    ctx.restore();
}

/** 1作業者分のバーを描画 */
function mgDrawWorkerRow(ctx, entry, ri, timeScale, chartW) {
    const data   = entry.data || {};
    const items  = mgGetItems(data, mgDisplayMode);
    const rowY   = MG.TOP_MARGIN + ri * MG.ROW_HEIGHT;
    const barH   = MG.ROW_HEIGHT * MG.BAR_RATIO;
    const barY   = rowY + (MG.ROW_HEIGHT - barH) / 2;
    const mode   = mgDisplayMode;
    const mColor = mgMainColor(mode);

    let curX = MG.LEFT_MARGIN;

    items.forEach((item, itemIdx) => {
        const t = mgTimes(item, mode);

        // ── 手作業時間
        if (t.manual > 0) {
            const w = t.manual * timeScale;
            if (curX + w <= chartW + 2) {
                mgDrawManualBar(ctx, item, curX, barY, w, barH, mColor, mode);
                // ヒットエリア登録（ラベル表示のある手作業のみ）
                mgHitAreas.push({
                    x: curX, y: rowY, w, h: MG.ROW_HEIGHT,
                    workerIdx: ri, item, times: t, entry,
                });
            }
            curX += w;
        }

        // ── 自動送り時間
        if (t.auto > 0) {
            const w = t.auto * timeScale;
            if (curX + w <= chartW + 2) {
                mgDrawAutoBar(ctx, curX, barY, w, barH, mColor, mode);
            }
            curX += w;
        }

        // ── 歩行時間
        if (t.walk > 0) {
            const w = t.walk * timeScale;
            if (curX + w <= chartW + 2) {
                mgDrawWalkBar(ctx, curX, barY, w, barH, mColor, mode);
            }
            curX += w;
        }
    });

    // ── C/Tエンドマーカー
    const ct = mgCalcCycleTime(data, mode);
    if (ct > 0) {
        const markerX = MG.LEFT_MARGIN + ct * timeScale;
        if (markerX < chartW - 2) {
            ctx.save();
            ctx.strokeStyle = mColor;
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.moveTo(markerX, barY - 3);
            ctx.lineTo(markerX, barY + barH + 3);
            ctx.stroke();

            ctx.font      = 'bold 9px "Consolas", monospace';
            ctx.fillStyle = mColor;
            ctx.textAlign = 'left';
            const ctLabel = mgFmt(ct);
            const labelX  = markerX + 3;
            const labelY  = barY - 5;
            ctx.fillText(ctLabel, labelX, labelY);
            ctx.restore();
        }
    }
}

// ────────────────────────────────────────────────
// Bar drawing helpers
// ────────────────────────────────────────────────

function mgDrawManualBar(ctx, item, x, y, w, h, color, mode) {
    if (w < 0.5) return;
    const cat = item.category || 'normal';
    ctx.save();

    switch (cat) {
        case 'normal': {
            // 塗りつぶし角丸矩形
            ctx.globalAlpha = 0.84;
            ctx.fillStyle   = color;
            mgRoundRect(ctx, x, y, Math.max(1, w), h, 2);
            ctx.fill();
            // 薄いハイライト（上部）
            ctx.globalAlpha = 0.15;
            ctx.fillStyle   = '#ffffff';
            mgRoundRect(ctx, x, y, Math.max(1, w), h * 0.45, 2);
            ctx.fill();
            break;
        }
        case 'monitor': {
            // 薄い塗り + 点線枠
            ctx.globalAlpha = 0.12;
            ctx.fillStyle   = color;
            mgRoundRect(ctx, x, y, Math.max(1, w), h, 2);
            ctx.fill();
            ctx.globalAlpha  = 0.75;
            ctx.strokeStyle  = color;
            ctx.lineWidth    = 1.5;
            ctx.setLineDash([4, 3]);
            mgRoundRect(ctx, x, y, Math.max(1, w), h, 2);
            ctx.stroke();
            ctx.setLineDash([]);
            break;
        }
        case 'hold': {
            // 薄い塗り + 上実線 + 下点線
            ctx.globalAlpha = 0.18;
            ctx.fillStyle   = color;
            ctx.fillRect(x, y, Math.max(1, w), h);
            ctx.globalAlpha = 0.80;
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(x, y);         ctx.lineTo(x + w, y);         ctx.stroke();
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(x, y + h);     ctx.lineTo(x + w, y + h);     ctx.stroke();
            ctx.setLineDash([]);
            // 左右の縦線
            ctx.beginPath(); ctx.moveTo(x,     y); ctx.lineTo(x,     y + h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.stroke();
            break;
        }
        case 'wait': {
            // 二重線＋矢頭（手待ちパターン）
            ctx.globalAlpha = 0.70;
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([]);
            const y1 = y + h * 0.28;
            const y2 = y + h * 0.72;
            const mid = y + h / 2;
            const aw = Math.min(8, w * 0.25); // 矢頭サイズ

            // 左矢頭
            ctx.beginPath();
            ctx.moveTo(x + aw, y1);
            ctx.lineTo(x,      mid);
            ctx.lineTo(x + aw, y2);
            ctx.stroke();

            // 上下二重線
            ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x + w, y1); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x + w, y2); ctx.stroke();

            // 右矢頭
            ctx.beginPath();
            ctx.moveTo(x + w - aw, y1);
            ctx.lineTo(x + w,      mid);
            ctx.lineTo(x + w - aw, y2);
            ctx.stroke();
            break;
        }
    }

    // ── バー内ラベル（幅が充分なら）
    if (w > 24 && cat !== 'wait') {
        ctx.globalAlpha = 1;
        ctx.fillStyle   = cat === 'normal' ? '#ffffff' : color;
        ctx.font        = 'bold 9px "Segoe UI", sans-serif';
        ctx.textAlign   = 'center';
        const label = mgTruncateText(ctx, item.name || '', w - 6);
        if (label) ctx.fillText(label, x + w / 2, y + h / 2 + 3.5);
    }

    ctx.restore();
}

function mgDrawAutoBar(ctx, x, y, w, h, mainColor, mode) {
    if (w < 0.5) return;
    ctx.save();

    // 薄い背景
    ctx.globalAlpha = 0.65;
    ctx.fillStyle   = mode === 'improved' ? MG_COLOR.autoImp : MG_COLOR.autoNorm;
    ctx.fillRect(x, y, Math.max(1, w), h);

    // 中心点線
    ctx.globalAlpha  = 0.55;
    ctx.strokeStyle  = mode === 'improved' ? 'rgba(220,38,38,0.5)' : 'rgba(100,116,139,0.5)';
    ctx.lineWidth    = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x,     y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

function mgDrawWalkBar(ctx, x, y, w, h, mainColor, mode) {
    if (w < 0.5) return;
    ctx.save();
    ctx.globalAlpha = 0.60;
    ctx.fillStyle   = mode === 'improved' ? MG_COLOR.walkImp : MG_COLOR.walkNorm;
    ctx.fillRect(x, y, Math.max(1, w), h);

    // 斜線ハッチング
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, Math.max(1, w), h);
    ctx.clip();
    ctx.globalAlpha  = 0.35;
    ctx.strokeStyle  = mode === 'improved' ? 'rgba(220,38,38,0.6)' : 'rgba(100,116,139,0.6)';
    ctx.lineWidth    = 1;
    const sp = 5;
    for (let xi = x - h; xi < x + w; xi += sp) {
        ctx.beginPath();
        ctx.moveTo(xi,     y + h);
        ctx.lineTo(xi + h, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
}

// ────────────────────────────────────────────────
// Empty state
// ────────────────────────────────────────────────

function mgDrawEmpty(chartW, noData) {
    const h = 220;
    mgSetupDPR(chartW, h);
    const ctx = mgCtx;
    ctx.clearRect(0, 0, chartW, h);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, chartW, h);

    ctx.fillStyle  = '#94a3b8';
    ctx.textAlign  = 'center';

    if (noData) {
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.fillText('保存済みデータがありません', chartW / 2, h / 2 - 14);
        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillText('ガントチャートタブでデータを作成・保存すると比較できます', chartW / 2, h / 2 + 8);
    } else {
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.fillText('左パネルから表示する作業者を選択してください', chartW / 2, h / 2);
    }
}

// ────────────────────────────────────────────────
// Utility drawing
// ────────────────────────────────────────────────

function mgRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
}

function mgTruncateText(ctx, text, maxW) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) {
        t = t.slice(0, -1);
    }
    return t + '…';
}

/** 目盛間隔を、ピクセル最小幅を満たす最小値で返す */
function mgNiceInterval(timeScale, minPx) {
    const candidates = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 600, 900, 1800];
    return candidates.find(i => i * timeScale >= minPx) || candidates[candidates.length - 1];
}

// ────────────────────────────────────────────────
// Hover & Tooltip
// ────────────────────────────────────────────────

function mgOnMouseMove(event) {
    if (!mgCanvas) return;
    
    // Canvas内部の座標を取得
    const rect   = mgCanvas.getBoundingClientRect();
    const scaleX = parseFloat(mgCanvas.style.width)  / rect.width  || 1;
    const scaleY = parseFloat(mgCanvas.style.height) / rect.height || 1;
    const mx     = (event.clientX - rect.left) * scaleX;
    const my     = (event.clientY - rect.top)  * scaleY;

    let found = null;
    for (const area of mgHitAreas) {
        if (mx >= area.x && mx <= area.x + area.w &&
            my >= area.y && my <= area.y + area.h) {
            found = area;
            break;
        }
    }

    if (found !== mgHoverArea) {
        mgHoverArea = found;
        mgRedraw(); // 他のハイライトがある場合の再描画
        
        if (found) {
            const item  = found.item;
            const times = found.times;
            const catNames = { normal:'通常', monitor:'監視', hold:'保持', wait:'手待ち' };
            const total = times.manual + times.auto + times.walk;
            
            // HTMLベースのグローバルツールチップへ表示内容を構築
            let tooltipContent = `<strong>${mgEsc(item.name || '（名称なし）')}</strong><br>`;
            tooltipContent += `手作業: ${mgFmt(times.manual)}<br>`;
            if (times.auto > 0) tooltipContent += `自動送り: ${mgFmt(times.auto)}<br>`;
            if (times.walk > 0) tooltipContent += `歩行: ${mgFmt(times.walk)}<br>`;
            tooltipContent += `合計: <strong>${mgFmt(total)}</strong><br>`;
            tooltipContent += `分類: ${catNames[item.category] || item.category}`;
            
            if (typeof showDynamicTooltip === 'function') {
                showDynamicTooltip(event, tooltipContent, 'default');
            }
        } else {
            if (typeof hideDynamicTooltip === 'function') {
                hideDynamicTooltip();
            }
        }
    } else if (found) {
        // 既に表示されている場合、マウス移動に追従させる
        const tooltip = document.getElementById('tooltip');
        if (tooltip && tooltip.style.display === 'block') {
            const x = event.pageX + 12;
            const y = event.pageY - 12;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let adjustedX = x;
            let adjustedY = y;
            
            // ツールチップの概算サイズではみ出しチェック
            if (x + 200 > viewportWidth) adjustedX = event.pageX - 200 - 12;
            if (y + 100 > viewportHeight) adjustedY = event.pageY - 100 - 12;
            
            adjustedX = Math.max(8, adjustedX);
            adjustedY = Math.max(8, adjustedY);
            
            tooltip.style.left = adjustedX + 'px';
            tooltip.style.top = adjustedY + 'px';
        }
    }
    
    mgCanvas.style.cursor = found ? 'crosshair' : 'default';
}

function mgOnMouseLeave() {
    if (mgHoverArea) {
        mgHoverArea = null;
        mgRedraw();
    }
    if (typeof hideDynamicTooltip === 'function') {
        hideDynamicTooltip();
    }
}

// Canvas内部で描画していた関数は削除
function mgDrawTooltip(ctx, area, chartW, chartH) {
    // 使用されなくなったため空にします
}
