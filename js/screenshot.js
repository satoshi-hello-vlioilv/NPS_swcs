/**
 * screenshot.js - チャート画像出力モジュール
 * 工程管理チャート / 標準作業組合せ票 / 頻度作業チャートを
 * PNG画像として1枚または指定枚数に分割して出力する
 */

const ScreenshotManager = (() => {
    'use strict';

    // ─── チャート定義 ───────────────────────────────────────────────────────────
    const CHART_DEFS = [
        {
            id          : 'processCanvas',
            containerId : 'processChartContainer',
            checkboxId  : 'showProcessChart',
            label       : '工程管理チャート',
            icon        : 'fa-project-diagram',
        },
        {
            id          : 'ganttCanvas',
            containerId : 'ganttChartContainer',
            checkboxId  : 'showGanttChart',
            label       : '標準作業組合せ票',
            icon        : 'fa-chart-gantt',
        },
        {
            id          : 'frequencyCanvas',
            containerId : 'frequencyChartContainer',
            checkboxId  : 'showFrequencyChart',
            label       : '頻度作業チャート',
            icon        : 'fa-redo-alt',
        },
    ];

    // ─── 内部ユーティリティ ─────────────────────────────────────────────────────

    /** 現在 ON かつ DOM に表示されているチャートの情報を返す */
    function getVisibleCharts() {
        return CHART_DEFS.filter(def => {
            const container = document.getElementById(def.containerId);
            const checkbox  = document.getElementById(def.checkboxId);
            if (!container || !checkbox) return false;
            const isChecked = checkbox.checked;
            const isVisible = window.getComputedStyle(container).display !== 'none';
            return isChecked && isVisible;
        }).map(def => ({
            ...def,
            canvas: document.getElementById(def.id),
        })).filter(item => item.canvas && item.canvas.width > 0);
    }

    /**
     * 複数 Canvas を縦方向に結合して 1 枚の高解像度 Canvas を返す
     * @param {Array} items - getVisibleCharts() の戻り値
     * @returns {{canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number}|null}
     */
    function mergeCanvases(items) {
        if (!items.length) return null;

        const dpr = window.devicePixelRatio || 1;

        // 各キャンバスの論理サイズ（CSS px）を取得
        const sized = items.map(item => {
            const c = item.canvas;
            // style.width が設定されていればそれを優先（高 DPI 対応）
            const lw = parseFloat(c.style.width)  || Math.round(c.width  / dpr);
            const lh = parseFloat(c.style.height) || Math.round(c.height / dpr);
            return { ...item, lw, lh };
        });

        const maxLw      = Math.max(...sized.map(s => s.lw));
        const totalLh    = sized.reduce((sum, s) => sum + s.lh, 0);
        const physW      = Math.round(maxLw   * dpr);
        const physH      = Math.round(totalLh * dpr);

        const out    = document.createElement('canvas');
        out.width    = physW;
        out.height   = physH;
        const outCtx = out.getContext('2d');

        // 白背景
        outCtx.fillStyle = '#ffffff';
        outCtx.fillRect(0, 0, physW, physH);

        // 各チャートを縦に積む
        let yOffset = 0;
        sized.forEach(item => {
            const destH = Math.round(item.lh * dpr);
            const destW = Math.round(item.lw * dpr);
            outCtx.drawImage(item.canvas, 0, yOffset, destW, destH);
            yOffset += destH;
        });

        return { canvas: out, logicalWidth: maxLw, logicalHeight: totalLh };
    }

    /**
     * Canvas を PNG Blob としてダウンロードさせる
     * @param {HTMLCanvasElement} canvas
     * @param {string} filename
     */
    function downloadCanvas(canvas, filename) {
        canvas.toBlob(blob => {
            if (!blob) { showToast('画像の生成に失敗しました。', 'error'); return; }
            const url = URL.createObjectURL(blob);
            const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    /** 出力ファイル名のベース部分を生成 */
    function getBaseName() {
        const product = (document.getElementById('productName')?.value?.trim()) || 'chart';
        const now  = new Date();
        const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        // ファイル名に使えない文字を除去
        const safe = product.replace(/[\\/:*?"<>|]/g, '_');
        return `${safe}_${date}`;
    }

    // ─── トースト通知 ────────────────────────────────────────────────────────────

    function showToast(message, type = 'success') {
        let toast = document.getElementById('screenshotToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'screenshotToast';
            document.body.appendChild(toast);
        }
        toast.className = `screenshot-toast screenshot-toast--${type}`;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'warn' ? 'fa-exclamation-circle' : 'fa-times-circle'}"></i><span>${message}</span>`;
        toast.classList.add('screenshot-toast--visible');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove('screenshot-toast--visible'), 3000);
    }

    // ─── 進捗オーバーレイ ────────────────────────────────────────────────────────

    function showProgress(message) {
        let el = document.getElementById('screenshotProgress');
        if (!el) {
            el = document.createElement('div');
            el.id = 'screenshotProgress';
            el.className = 'screenshot-progress-overlay';
            el.innerHTML = '<div class="screenshot-progress-box"><i class="fas fa-spinner fa-spin"></i><span id="screenshotProgressMsg"></span></div>';
            document.body.appendChild(el);
        }
        document.getElementById('screenshotProgressMsg').textContent = message;
        el.classList.add('screenshot-progress-overlay--visible');
    }

    function hideProgress() {
        document.getElementById('screenshotProgress')?.classList.remove('screenshot-progress-overlay--visible');
    }

    // ─── 公開 API ────────────────────────────────────────────────────────────────

    /**
     * 表示中のチャートを 1 枚の PNG として出力する
     */
    function exportSingle() {
        const visibles = getVisibleCharts();
        if (!visibles.length) {
            showToast('表示中のチャートがありません。チャートをONにしてください。', 'warn');
            return;
        }

        showProgress('画像を生成中…');
        // レンダリングが確実に終わってから実行
        requestAnimationFrame(() => {
            try {
                const merged = mergeCanvases(visibles);
                if (!merged) { hideProgress(); showToast('画像の結合に失敗しました。', 'error'); return; }
                downloadCanvas(merged.canvas, `${getBaseName()}_chart.png`);
                hideProgress();
                showToast(`${visibles.length}件のチャートを1枚の画像で出力しました。`);
            } catch (err) {
                hideProgress();
                showToast('エラーが発生しました: ' + err.message, 'error');
            }
        });
    }

    /**
     * 表示中のチャートを n 枚に分割して PNG として出力する
     * @param {number} n - 分割枚数 (2〜20)
     */
    function exportSplit(n) {
        n = parseInt(n, 10);
        if (!Number.isInteger(n) || n < 2 || n > 20) {
            showToast('分割数は 2〜20 の整数を指定してください。', 'warn');
            return;
        }

        const visibles = getVisibleCharts();
        if (!visibles.length) {
            showToast('表示中のチャートがありません。チャートをONにしてください。', 'warn');
            return;
        }

        showProgress(`${n}枚に分割して出力中…`);
        requestAnimationFrame(() => {
            try {
                const merged = mergeCanvases(visibles);
                if (!merged) { hideProgress(); showToast('画像の結合に失敗しました。', 'error'); return; }

                const { canvas } = merged;
                const totalH     = canvas.height;
                const sliceH     = totalH / n;
                const base       = getBaseName();

                for (let i = 0; i < n; i++) {
                    const yStart  = Math.floor(i * sliceH);
                    const yEnd    = (i === n - 1) ? totalH : Math.floor((i + 1) * sliceH);
                    const height  = yEnd - yStart;

                    const part    = document.createElement('canvas');
                    part.width    = canvas.width;
                    part.height   = height;
                    const pCtx    = part.getContext('2d');
                    pCtx.fillStyle = '#ffffff';
                    pCtx.fillRect(0, 0, part.width, part.height);
                    pCtx.drawImage(canvas, 0, yStart, canvas.width, height, 0, 0, canvas.width, height);

                    downloadCanvas(part, `${base}_chart_${i + 1}of${n}.png`);
                }

                hideProgress();
                showToast(`${n}枚に分割して出力しました。`);
            } catch (err) {
                hideProgress();
                showToast('エラーが発生しました: ' + err.message, 'error');
            }
        });
    }

    // ─── 分割出力ダイアログ ──────────────────────────────────────────────────────

    /** ダイアログ DOM を生成またはキャッシュして返す */
    function ensureDialog() {
        let modal = document.getElementById('screenshotSplitModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id        = 'screenshotSplitModal';
        modal.className = 'screenshot-modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'screenshotModalTitle');
        modal.innerHTML = `
            <div class="screenshot-modal" role="document">
                <div class="screenshot-modal-header">
                    <div class="screenshot-modal-title-group">
                        <i class="fas fa-cut screenshot-modal-icon"></i>
                        <h3 id="screenshotModalTitle">分割出力</h3>
                    </div>
                    <button class="screenshot-modal-close" onclick="ScreenshotManager.closeSplitDialog()" aria-label="閉じる">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div class="screenshot-modal-body">
                    <!-- 対象チャートの状態サマリ -->
                    <p class="screenshot-modal-desc">出力対象チャート（表示ONのもの）</p>
                    <div class="screenshot-chart-status" id="screenshotChartStatus"></div>

                    <!-- 分割数コントロール -->
                    <div class="screenshot-split-section">
                        <label class="screenshot-split-label" for="screenshotSplitCount">分割枚数</label>
                        <div class="screenshot-split-control">
                            <button class="screenshot-split-adj" onclick="ScreenshotManager.adjustSplit(-1)" aria-label="減らす">
                                <i class="fas fa-minus"></i>
                            </button>
                            <input
                                type  = "number"
                                id    = "screenshotSplitCount"
                                class = "screenshot-split-input"
                                value = "2"
                                min   = "2"
                                max   = "20"
                                aria-label="分割枚数"
                            >
                            <button class="screenshot-split-adj" onclick="ScreenshotManager.adjustSplit(1)" aria-label="増やす">
                                <i class="fas fa-plus"></i>
                            </button>
                            <span class="screenshot-split-unit">枚</span>
                        </div>
                        <p class="screenshot-split-hint">各ページは高さを均等に分割します（2〜20）</p>
                    </div>
                </div>

                <div class="screenshot-modal-footer">
                    <button class="btn btn-secondary" onclick="ScreenshotManager.closeSplitDialog()">
                        キャンセル
                    </button>
                    <button class="btn btn-primary screenshot-export-btn" onclick="ScreenshotManager.confirmSplit()">
                        <i class="fas fa-images"></i>分割して出力
                    </button>
                </div>
            </div>
        `;

        // オーバーレイクリックで閉じる
        modal.addEventListener('click', e => { if (e.target === modal) closeSplitDialog(); });
        // Escape キーで閉じる
        modal.addEventListener('keydown', e => { if (e.key === 'Escape') closeSplitDialog(); });

        document.body.appendChild(modal);
        return modal;
    }

    /** 分割ダイアログを開く */
    function showSplitDialog() {
        const modal    = ensureDialog();
        const visibles = getVisibleCharts();

        // チャート状態サマリを更新
        const statusEl = document.getElementById('screenshotChartStatus');
        if (statusEl) {
            statusEl.innerHTML = CHART_DEFS.map(def => {
                const on = visibles.some(v => v.id === def.id);
                return `
                    <div class="screenshot-chart-item ${on ? 'screenshot-chart-item--on' : 'screenshot-chart-item--off'}">
                        <i class="fas ${on ? 'fa-check-circle' : 'fa-circle'} screenshot-chart-item-icon"></i>
                        <i class="fas ${def.icon} screenshot-chart-item-type"></i>
                        <span>${def.label}</span>
                        <span class="screenshot-chart-badge ${on ? 'screenshot-chart-badge--on' : 'screenshot-chart-badge--off'}">${on ? 'ON' : 'OFF'}</span>
                    </div>`;
            }).join('');
        }

        // 出力ボタンの活性/非活性
        const exportBtn = modal.querySelector('.screenshot-export-btn');
        if (exportBtn) {
            exportBtn.disabled = visibles.length === 0;
        }

        modal.style.display = 'flex';
        // アクセシビリティ：フォーカス移動
        setTimeout(() => document.getElementById('screenshotSplitCount')?.focus(), 100);
    }

    /** 分割ダイアログを閉じる */
    function closeSplitDialog() {
        const modal = document.getElementById('screenshotSplitModal');
        if (modal) modal.style.display = 'none';
    }

    /** 分割数を ±1 する */
    function adjustSplit(delta) {
        const input = document.getElementById('screenshotSplitCount');
        if (!input) return;
        const next = parseInt(input.value, 10) + delta;
        input.value = Math.max(2, Math.min(20, next));
    }

    /** ダイアログの「出力」ボタンから呼ばれる */
    function confirmSplit() {
        const count = document.getElementById('screenshotSplitCount')?.value;
        closeSplitDialog();
        exportSplit(count);
    }

    // ─── パネル内チャート状態バッジの更新（サイドパネル向け） ─────────────────

    /**
     * サイドパネルの出力セクション内にある対象チャート表示バッジを更新する
     * index.html 側の toggleProcessChart / toggleGanttChart / toggleFrequencyChart 完了後に呼ぶ
     */
    function updatePanelBadges() {
        const visibles = getVisibleCharts();
        CHART_DEFS.forEach(def => {
            const badge = document.getElementById(`screenshotBadge_${def.id}`);
            if (!badge) return;
            const on = visibles.some(v => v.id === def.id);
            badge.className = `screenshot-panel-badge ${on ? 'screenshot-panel-badge--on' : 'screenshot-panel-badge--off'}`;
            badge.textContent = on ? 'ON' : 'OFF';
        });

        // 対象件数表示
        const countEl = document.getElementById('screenshotTargetCount');
        if (countEl) {
            countEl.textContent = `${visibles.length}件対象`;
        }
    }

    // チャート切り替えイベントにフック（DOM 準備後に呼ぶ）
    function init() {
        // チェックボックスの change イベントを傍受してバッジ更新
        ['showProcessChart', 'showGanttChart', 'showFrequencyChart'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', updatePanelBadges);
        });
        // 初回バッジ反映
        updatePanelBadges();
    }

    // ─── DOMContentLoaded フック ────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // すでに読み込み済みの場合（スクリプト遅延ロード時）
        setTimeout(init, 0);
    }

    // ─── 公開インターフェース ────────────────────────────────────────────────────
    return {
        exportSingle,
        exportSplit,
        showSplitDialog,
        closeSplitDialog,
        adjustSplit,
        confirmSplit,
        updatePanelBadges,
    };
})();
