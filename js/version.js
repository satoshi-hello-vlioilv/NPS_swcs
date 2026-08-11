/**
 * version.js - バージョン情報と改訂履歴
 *
 * ■ 役割
 *   アプリのバージョン番号と改訂履歴を一箇所で管理する。
 *   画面に出るバージョン表記（ヘッダーのバッジ、Welcome画面、ヘルプ）と
 *   書き出しデータのバージョンは、すべてここの APP_VERSION を参照する。
 *
 * ■ 更新のしかた
 *   1. APP_VERSION を新しい番号に更新する
 *   2. APP_CHANGELOG の先頭に同じ番号のエントリを追加する
 *   両方を更新すれば、バッジ・改訂履歴・書き出しデータすべてに反映される。
 *
 * ■ 番号の付け方（セマンティックバージョニング）
 *   メジャー.マイナー.パッチ
 *   - メジャー: 保存データの互換性が失われる変更
 *   - マイナー: 機能追加や仕様変更
 *   - パッチ  : 不具合修正のみ
 */

'use strict';

const APP_VERSION = '1.1.0';

/**
 * 改訂履歴（新しいものから順に並べる）
 * type: 'add'（追加） / 'fix'（修正） / 'change'（変更）
 */
const APP_CHANGELOG = [
    {
        version: '1.1.0',
        date:    '2026-08-11',
        title:   '不具合修正と保存方式の刷新',
        changes: [
            { type: 'fix',    text: '比較ガントが自動送り時間をサイクルタイムに加算していたため、タクト内に収まる工程を「T/T超過」と誤判定していた問題を修正しました。' },
            { type: 'fix',    text: '稼働時間タブの実稼働時間・正味稼働時間・正味生産時間・可動率が、常に0のまま表示されていた問題を修正しました。' },
            { type: 'fix',    text: '書き出したCSVを読み込むと、改善後のみの作業や歩行だけの作業が「形式エラー」として失われる問題を修正しました。' },
            { type: 'fix',    text: '備考に改行を含むCSVで行が壊れ、備考が途中までしか取り込まれない問題を修正しました。' },
            { type: 'fix',    text: '新規作成した作業項目の改善後データが、誤ったキー名で保存される問題を修正しました。旧データも自動で読み替えます。' },
            { type: 'fix',    text: '再読み込み後にファイル名表示が「新規データ」に戻ってしまう問題を修正しました。' },
            { type: 'fix',    text: '作業配分表のY軸で、目盛ラベルとタクトタイムのラベルが重なって読めなくなる問題を修正しました。' },
            { type: 'change', text: '保存先をブラウザのlocalStorageからIndexedDBに変更し、保存できる容量を大幅に広げました。これまでのデータは初回起動時に自動で引き継がれます。' },
            { type: 'add',    text: '保存領域の使用量が8割を超えたときに、バックアップを促すお知らせを表示するようにしました。' },
            { type: 'add',    text: 'オフライン環境でアイコンが表示できない場合に、代替の記号を表示するようにしました。' },
            { type: 'add',    text: 'アプリ名の横のバージョンバッジから、この改訂履歴を開けるようにしました。' }
        ]
    },
    {
        version: '1.0.0',
        date:    '2026-08-11',
        title:   '初回リリース',
        changes: [
            { type: 'add',    text: 'アプリ名の横にバージョン番号を表示するようにしました。' },
            { type: 'add',    text: 'ブラウザのタブに表示されるファビコンを追加しました。' },
            { type: 'change', text: 'バージョンの採番を1.0.0から開始する形に整理し、表示箇所を一箇所で管理するようにしました。' }
        ]
    }
];

const CHANGE_TYPE_LABEL = {
    add:    '追加',
    fix:    '修正',
    change: '変更'
};

/**
 * バージョン表記が入る要素をまとめて更新する
 */
function applyVersionLabels() {
    document.querySelectorAll('[data-app-version]').forEach(el => {
        const prefix = el.getAttribute('data-app-version') || '';
        el.textContent = prefix + APP_VERSION;
    });
}

/**
 * 改訂履歴の中身を組み立てる
 */
function renderChangelog() {
    const body = document.getElementById('changelogBody');
    if (!body) return;

    body.innerHTML = APP_CHANGELOG.map((entry, index) => {
        const items = entry.changes.map(c => `
            <li class="changelog-item">
                <span class="changelog-tag changelog-tag-${c.type}">${CHANGE_TYPE_LABEL[c.type] || c.type}</span>
                <span class="changelog-text">${escapeChangelogText(c.text)}</span>
            </li>
        `).join('');

        return `
            <section class="changelog-entry">
                <div class="changelog-entry-head">
                    <span class="changelog-version">v${escapeChangelogText(entry.version)}</span>
                    ${index === 0 ? '<span class="changelog-current">使用中</span>' : ''}
                    <span class="changelog-date">${escapeChangelogText(entry.date)}</span>
                </div>
                <h3 class="changelog-title">${escapeChangelogText(entry.title)}</h3>
                <ul class="changelog-list">${items}</ul>
            </section>
        `;
    }).join('');
}

/** 最小限のHTMLエスケープ */
function escapeChangelogText(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 改訂履歴を開く */
function openChangelogModal() {
    const modal = document.getElementById('changelogModal');
    if (!modal) return;

    renderChangelog();
    modal.style.display = 'block';

    // ESCキーで閉じる
    document.addEventListener('keydown', handleChangelogEsc);

    const closeBtn = document.getElementById('changelogCloseBtn');
    if (closeBtn) closeBtn.focus();
}

/** 改訂履歴を閉じる */
function closeChangelogModal() {
    const modal = document.getElementById('changelogModal');
    if (modal) modal.style.display = 'none';
    document.removeEventListener('keydown', handleChangelogEsc);
}

function handleChangelogEsc(event) {
    if (event.key === 'Escape') closeChangelogModal();
}

/** 背景クリックで閉じる（中身のクリックでは閉じない） */
function handleChangelogBackdrop(event) {
    if (event.target && event.target.id === 'changelogModal') closeChangelogModal();
}

document.addEventListener('DOMContentLoaded', applyVersionLabels);

if (typeof window !== 'undefined') {
    window.APP_VERSION   = APP_VERSION;
    window.APP_CHANGELOG = APP_CHANGELOG;
}
