/**
 * storage.js - アプリケーションの永続化レイヤ（IndexedDB）
 *
 * ■ 役割
 *   保存データを IndexedDB に格納する。localStorage は文字列で約5MBという
 *   容量上限があり、保存データ（作業項目・頻度作業・時間帯・バラつき等）が
 *   増えると書き込みに失敗するため、容量に余裕のある IndexedDB を使う。
 *
 * ■ 特徴
 *   - キー・バリュー形式。既存コードの localStorage 呼び出しと同じ感覚で使える
 *     （ただし戻り値は Promise）
 *   - 初回起動時に localStorage の既存データを自動で引き継ぐ
 *   - IndexedDB が使えない環境（プライベートモード等）では
 *     localStorage に自動でフォールバックする
 *   - 書き込みはキーごとに直列化し、オートセーブが重なっても順序が壊れない
 */

const AppStorage = (() => {
    'use strict';

    const DB_NAME    = 'NPS_swcs';
    const DB_VERSION = 1;
    const STORE_NAME = 'keyValue';

    // localStorage から引き継ぐ対象キー
    const LEGACY_KEYS = [
        'workAnalysisDataList',
        'workAnalysisCurrentData',
        'workAnalysisSelectedDataIds',
        'dataManagementState'
    ];
    const MIGRATION_FLAG = '__migratedFromLocalStorage';

    let dbPromise      = null;
    let useFallback    = false;   // IndexedDB が使えない場合に true
    const writeChains  = new Map(); // キーごとの書き込み直列化

    // ── IndexedDB を開く ────────────────────────────────────────────────
    function openDB() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                reject(new Error('IndexedDB is not available'));
                return;
            }

            let request;
            try {
                request = indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                reject(e);
                return;
            }

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                // 別タブが新しいバージョンを開いた場合は接続を閉じる
                // 閉じた接続を使い続けると以降の保存がすべて失敗するため、次回は開き直す
                db.onversionchange = () => {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };
            request.onerror   = () => reject(request.error || new Error('IndexedDB open failed'));
            request.onblocked = () => reject(new Error('IndexedDB open blocked'));
        }).catch((error) => {
            console.warn('[AppStorage] IndexedDBが使えないため localStorage を使用します:', error);
            useFallback = true;
            return null;
        });

        return dbPromise;
    }

    // ── 低レベル操作 ───────────────────────────────────────────────────
    function idbRequest(db, mode, action) {
        return new Promise((resolve, reject) => {
            let tx;
            try {
                tx = db.transaction(STORE_NAME, mode);
            } catch (e) {
                reject(e);
                return;
            }
            const store   = tx.objectStore(STORE_NAME);
            const request = action(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror   = () => reject(request.error);
            tx.onabort        = () => reject(tx.error || new Error('transaction aborted'));
        });
    }

    async function rawGet(key) {
        const db = await openDB();
        if (!db) return localStorage.getItem(key);
        const value = await idbRequest(db, 'readonly', (store) => store.get(key));
        return value === undefined ? null : value;
    }

    async function rawSet(key, value) {
        const db = await openDB();
        if (!db) { localStorage.setItem(key, value); return; }
        await idbRequest(db, 'readwrite', (store) => store.put(value, key));
    }

    async function rawRemove(key) {
        const db = await openDB();
        if (!db) { localStorage.removeItem(key); return; }
        await idbRequest(db, 'readwrite', (store) => store.delete(key));
    }

    // ── localStorage からの引き継ぎ ─────────────────────────────────────
    async function migrateFromLocalStorage() {
        if (useFallback) return;                 // フォールバック時は移行不要
        if (typeof localStorage === 'undefined') return;

        const done = await rawGet(MIGRATION_FLAG);
        if (done) return;

        const moved = [];
        try {
            for (const key of LEGACY_KEYS) {
                const value = localStorage.getItem(key);
                if (value === null) continue;
                // IndexedDB 側に既に値がある場合は上書きしない
                const existing = await rawGet(key);
                if (existing !== null) continue;
                await rawSet(key, value);
                moved.push(key);
            }

            await rawSet(MIGRATION_FLAG, new Date().toISOString());

            // すべて書き込めてから localStorage 側を片付ける
            // （途中で失敗した場合は消さないので、データは失われない）
            moved.forEach((key) => {
                try { localStorage.removeItem(key); } catch (e) { /* 消せなくても実害なし */ }
            });

            if (moved.length > 0) {
                console.info(`[AppStorage] localStorage から ${moved.length} 件を IndexedDB へ移行しました`);
            }
        } catch (error) {
            console.warn('[AppStorage] 移行に失敗しました。localStorage のデータは保持されます:', error);
        }
    }

    let readyPromise = null;

    /** 初期化（DBを開き、必要なら localStorage から引き継ぐ） */
    function ready() {
        if (!readyPromise) {
            readyPromise = openDB().then(migrateFromLocalStorage).catch((error) => {
                console.warn('[AppStorage] 初期化に失敗しました:', error);
            });
        }
        return readyPromise;
    }

    // ── 公開API ────────────────────────────────────────────────────────

    /**
     * 値を取得する
     * @param {string} key
     * @returns {Promise<string|null>}
     */
    async function getItem(key) {
        await ready();
        try {
            return await rawGet(key);
        } catch (error) {
            console.warn(`[AppStorage] 読み込みに失敗しました (${key}):`, error);
            return null;
        }
    }

    /**
     * 値を保存する。同じキーへの書き込みは順番に処理される
     * @param {string} key
     * @param {string} value
     * @returns {Promise<void>}
     */
    function setItem(key, value) {
        const previous = writeChains.get(key) || Promise.resolve();
        const next = previous
            .catch(() => {})            // 前回の失敗で連鎖を止めない
            .then(() => ready())
            .then(() => rawSet(key, value));

        writeChains.set(key, next);
        // 連鎖が伸び続けないよう、完了したら破棄する
        // （finally は失敗をそのまま伝えて未処理の reject になるため、catch で受けてから片付ける）
        next.catch(() => {}).then(() => {
            if (writeChains.get(key) === next) writeChains.delete(key);
        });
        return next;
    }

    /**
     * 値を削除する
     * @param {string} key
     * @returns {Promise<void>}
     */
    async function removeItem(key) {
        await ready();
        return rawRemove(key);
    }

    /**
     * 保存に使っている領域の推定使用量を返す（対応ブラウザのみ）
     * @returns {Promise<{usage:number, quota:number, ratio:number}|null>}
     */
    async function estimateUsage() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const { usage = 0, quota = 0 } = await navigator.storage.estimate();
                return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
            }
        } catch (e) { /* 取得できない環境では null を返す */ }
        return null;
    }

    /** 現在 localStorage フォールバックで動作しているか */
    function isFallback() {
        return useFallback;
    }

    return { ready, getItem, setItem, removeItem, estimateUsage, isFallback };
})();

if (typeof window !== 'undefined') {
    window.AppStorage = AppStorage;
}
