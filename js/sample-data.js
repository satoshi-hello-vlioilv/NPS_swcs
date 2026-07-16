// ========================================
// sample-data.js  ―  サンプルデータ定義 (最新データ構造対応版)
//
// ■ 役割
//   アプリが提供するサンプルデータをすべてここで定義する。
//   app.js の loadSampleData() はこのオブジェクトを参照するだけで良い。
//
// ■ 工程概要
//   アルミニウム製造（アルミコイル スリット仕上加工ライン）
//   1サイクル＝コイル1本の加工
//   ┌ lot2：リコイラ・巻取り側（前工程の完了コイルの結束・搬出）
//   └ lot1：ペイオフ・通板側（次工程の原板セット〜自動走行開始・監視）
//
// ■ 時間設計根拠（時間単位：すべて秒）
//   稼働時間 420分 ÷ 必要数 6本 = タクトタイム 4,200秒（70分/本）
//
//   改善前 C/T = 3,630秒（60.5分） -> タクトタイム内だが余裕が少ない
//   改善後 C/T = 2,520秒（42.0分） -> 大幅な生産性向上（約30%短縮）
//
// ■ 改善のハイライト
//   ・対象区分の活用（current-only / improved-only）による「作業の置き換え」
//   ・自動送り時間（autoTime）の高速化とそれに伴う手待ち時間（wait）の変動
//   ・作業分類（normal, monitor, hold, wait）のフル活用
//   ・頻度作業の改善（回数変更、時間変更、廃止）
// ========================================

'use strict';

const SAMPLE_DATA = {

    // ── 共通設定 ─────────────────────────────────────────────────────────────
    meta: {
        productName:      'アルミコイル 1070-H19 スリット加工',
        operatingTime:    '420',  // 分（基本労働8h − 休憩等1h = 実稼働7h = 420分）
        requiredQuantity: '6',    // 本/日（420分 ÷ T/T 70分 = 6本）
    },

    schedule: {
        startTime:   '08:00',
        workHours:   8,
        standardWIP: 1,  // 1 → lot1(当ロット)・lot2(手持ち1個目) が使用可能
    },

    // ── 作業者データ ────────────────────────────────────────────────────────
    workers:[
        {
            operatorName: '標準モデル（山田）',
            workItems:[
                // lot2：リコイラ・仕上側（前サイクルの完成品処理）
                {
                    id: 1, name: '完了コイル端部結束・テーピング',
                    manualTime: 180, autoTime: 0, walkTime: 30,
                    category: 'normal', process: 'lot2', targetScope: 'common',
                    improved: { manualTime: 60, autoTime: 0, walkTime: 30 }, // 改善: 自動結束機導入
                    notes: 'コイル外周の巻き解け防止テープを手動で巻き付ける'
                },
                {
                    id: 2, name: '完成コイルのクレーン搬出',
                    manualTime: 150, autoTime: 0, walkTime: 90,
                    category: 'normal', process: 'lot2', targetScope: 'common',
                    improved: { manualTime: 150, autoTime: 0, walkTime: 90 }, // 現状維持
                    notes: 'リコイラからコイルを抜き取り、クレーンで置き場へ移送'
                },
                {
                    id: 3, name: '品質記録（検査表への手書き）',
                    manualTime: 240, autoTime: 0, walkTime: 60,
                    category: 'normal', process: 'lot2', targetScope: 'current-only', // 改善前のみ
                    improved: { manualTime: 0, autoTime: 0, walkTime: 0 },
                    notes: '板厚実績・外観・走行速度などを帳票に手書き'
                },
                {
                    id: 4, name: '実績・品質データの自動送信',
                    manualTime: 0, autoTime: 0, walkTime: 0,
                    category: 'normal', process: 'lot2', targetScope: 'improved-only', // 改善後のみ
                    improved: { manualTime: 60, autoTime: 0, walkTime: 0 }, // 改善: タブレットでのワンタップ送信
                    notes: 'システム連動による検査記録の自動転送'
                },
                // lot1：ペイオフ・通板側（新ロットの加工準備〜加工）
                {
                    id: 5, name: '新規原板コイルの吊り込み',
                    manualTime: 240, autoTime: 0, walkTime: 90,
                    category: 'normal', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 180, autoTime: 0, walkTime: 60 }, // 改善: 遠隔操作クレーン導入
                    notes: 'ペイオフリール位置まで往復、クレーンフック着脱'
                },
                {
                    id: 6, name: 'ペイオフリール芯合わせ・固定',
                    manualTime: 180, autoTime: 0, walkTime: 60,
                    category: 'normal', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 120, autoTime: 0, walkTime: 60 }, // 改善: センタリング治具改良
                    notes: 'リールクランプ操作と幅・芯位置の確認'
                },
                {
                    id: 7, name: 'スリッタ刃組の段取り・刃間隔調整',
                    manualTime: 420, autoTime: 0, walkTime: 90,
                    category: 'normal', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 240, autoTime: 0, walkTime: 60 }, // 改善: 刃間隔セット治具のカセット化
                    notes: 'スペーサ組替・刃間隔ゲージ確認'
                },
                {
                    id: 8, name: '先端通板作業',
                    manualTime: 240, autoTime: 0, walkTime: 120,
                    category: 'normal', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 180, autoTime: 0, walkTime: 90 }, // 改善: ガイドロール可動化
                    notes: '各ロールへの通板とテンション付与'
                },
                {
                    id: 9, name: '走行条件（速度・張力）の設定',
                    manualTime: 90, autoTime: 0, walkTime: 30,
                    category: 'normal', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 60, autoTime: 0, walkTime: 30 }, // 改善: 品種別レシピのワンタッチ呼出
                    notes: '操作盤への数値入力と起動確認'
                },
                {
                    id: 10, name: '自動走行起動・表面形状監視',
                    // 改善前: 自動送り1200秒、改善後: 速度UPで自動送り960秒に短縮
                    manualTime: 120, autoTime: 1200, walkTime: 60,
                    category: 'monitor', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 90, autoTime: 960, walkTime: 30 }, // 改善: カメラ監視システム導入で歩行削減
                    notes: '起動後、ライン全体を巡回しながら目視監視'
                },
                {
                    id: 11, name: '巻取り部立ち上げサポート',
                    // 自動走行中に並行して行う保持作業
                    manualTime: 120, autoTime: 0, walkTime: 30,
                    category: 'hold', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 60, autoTime: 0, walkTime: 30 }, // 改善: コイルホルダー治具導入
                    notes: '巻き始めの数十m、コイル端部がずれないよう手で保持'
                },
                {
                    id: 12, name: '自動走行完了までの手待ち',
                    // 自動送りの終了を待つための調整時間
                    // 改善前: auto(1200) - walk(60) - 次作業M(120) - 次作業W(30) = 990秒
                    // 改善後: auto(960) - walk(30) - 次作業M(60) - 次作業W(30) = 840秒
                    manualTime: 990, autoTime: 0, walkTime: 0,
                    category: 'wait', process: 'lot1', targetScope: 'common',
                    improved: { manualTime: 840, autoTime: 0, walkTime: 0 },
                    notes: '自動走行が完了するまで設備前で待機'
                }
            ]
        }
    ],

    // ── 頻度作業（全作業者共通） ─────────────────────────────────────────────
    frequencyWorkItems:[
        {
            id: 1, name: 'スリッタ刃の摩耗点検・清掃',
            workTime: 300, 
            frequency: { type: 'count', value: 5 }, // 5ロットに1回
            notes: '刃先のアルミ粉付着確認と清掃',
            // 改善: エアーブローノズル常設により、頻度を減らし作業時間も短縮
            improved: { workTime: 240, frequency: { type: 'count', value: 10 } }
        },
        {
            id: 2, name: '切削油の濃度・pH確認',
            workTime: 180, 
            frequency: { type: 'time', value: 60, unit: 'm' }, // 60分に1回
            notes: '屈折計での濃度測定',
            // 改善: 自動濃度センサー設置により、異常時の目視確認のみに削減
            improved: { workTime: 120, frequency: { type: 'time', value: 120, unit: 'm' } }
        },
        {
            id: 3, name: '板厚のオフライン抜き取り検査',
            workTime: 240, 
            frequency: { type: 'count', value: 3 }, // 3ロットに1回
            notes: 'マイクロメータによる幅方向5点測定',
            // 改善: インライン板厚計の多点測定化により、オフライン検査を完全廃止（0秒化）
            improved: { workTime: 0, frequency: { type: 'count', value: 3 } }
        }
    ],

    // ── 時間帯定義（全作業者共通） ───────────────────────────────────────────
    timeSlotDefs:[
        { offset: 1, name: '朝礼・KY活動',   type: 'meeting',    startTime: '08:00', endTime: '08:15' },
        { offset: 2, name: '設備始業点検',   type: 'inspection', startTime: '08:15', endTime: '08:30' },
        { offset: 3, name: '午前休憩',       type: 'break',      startTime: '10:00', endTime: '10:15' },
        { offset: 4, name: '昼休憩',         type: 'break',      startTime: '12:00', endTime: '12:45' },
        { offset: 5, name: '午後休憩',       type: 'break',      startTime: '15:00', endTime: '15:15' },
        { offset: 6, name: '終業点検・清掃', type: 'cleaning',   startTime: '16:40', endTime: '17:00' },
    ]
};

// グローバルに公開（script タグで読み込む通常の JS 環境向け）
if (typeof window !== 'undefined') {
    window.SAMPLE_DATA = SAMPLE_DATA;
}