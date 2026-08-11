// ========================================
// Chart Renderer - Enhanced Gantt Chart Drawing with Horizontal Schedule Chart and Frequency Work Chart
// ========================================

// 行の高さと文字サイズの動的取得ラッパー

function _gFont(weight, baseSize, family = '"Segoe UI", sans-serif') {
    if (typeof getEffectiveFont === 'function') {
        return getEffectiveFont(weight, baseSize, family);
    }
    return `${weight} ${baseSize}px ${family}`;
}

function _gRowHeight() {
    if (typeof getEffectiveRowHeight === 'function') {
        return getEffectiveRowHeight();
    }
    return ROW_HEIGHT;
}

// 作業配分表の作業項目名表示制御用
let showDistributionItemLabels = true;

/**
 * lineStyles の1エントリをCanvasコンテキストに適用する共通ヘルパー
 * @param {CanvasRenderingContext2D} context - 適用先コンテキスト
 * @param {string} key - 'taktTime' | 'currentCT' | 'improvedCT'
 * @param {number} [alphaOverride] - 指定した場合 globalAlpha を上書き
 * @param {number} [widthMultiplier] - 太さ倍率（途中サイクル用に 0.5 を渡す等）
 */
function _applyLineStyle(context, key, alphaOverride, widthMultiplier = 1) {
    const s   = (typeof lineStyles !== 'undefined' && lineStyles[key])
                ? lineStyles[key]
                : { color: '#1f2937', width: 2, dash: 'solid' };
    const pat = (typeof LINE_DASH_PATTERNS !== 'undefined')
                ? (LINE_DASH_PATTERNS[s.dash] || [])
                : [];
    context.strokeStyle = s.color;
    context.lineWidth   = s.width * widthMultiplier;
    context.setLineDash(pat);
    if (alphaOverride !== undefined) context.globalAlpha = alphaOverride;
    return s; // 色参照用に返す
}

/**
 * 実際の描画幅を基準にテキストを折り返し、配列として返す（確実な幅制限版）
 * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
 * @param {string} text - 折り返すテキスト
 * @param {number} maxWidth - 1行あたりの最大幅（ピクセル）
 * @param {number} maxLines - 最大行数
 * @returns {Array} - 行の配列
 */
function wrapTextByWidth(ctx, text, maxWidth, maxLines = 2) {
    if (!text || !ctx || maxWidth <= 0) {
        return [text || ''];
    }

    const characters = text.split('');
    const lines = [];
    let currentLine = '';
    let lineCount = 0;

    for (let k = 0; k < characters.length; k++) {
        const char = characters[k];
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && currentLine.length > 0) {
            if (lineCount < maxLines -1) {
                lines.push(currentLine);
                currentLine = char;
                lineCount++;
            } else {
                let fittingText = currentLine;
                while (ctx.measureText(fittingText + '…').width > maxWidth && fittingText.length > 0) {
                    fittingText = fittingText.slice(0, -1);
                }
                lines.push(fittingText + '…');
                currentLine = ''; 
                break;
            }
        } else {
            currentLine = testLine;
        }
    }

    if (currentLine) {
        if (lineCount < maxLines) {
             if (ctx.measureText(currentLine).width > maxWidth && lines.length === maxLines -1) {
                let fittingText = currentLine;
                while (ctx.measureText(fittingText + '…').width > maxWidth && fittingText.length > 0) {
                    fittingText = fittingText.slice(0, -1);
                }
                lines.push(fittingText + '…');
            } else {
                lines.push(currentLine);
            }
        } else if (lines.length > 0 && lines[lines.length-1].slice(-1) !== '…') {
            let lastLine = lines[lines.length-1];
            if(ctx.measureText(lastLine + currentLine).width > maxWidth) {
                while (ctx.measureText(lastLine + '…').width > maxWidth && lastLine.length > 0) {
                    lastLine = lastLine.slice(0, -1);
                }
                lines[lines.length-1] = lastLine + '…';
            } else {
                 lines[lines.length-1] += currentLine; 
            }
        }
    }
    return lines.filter(line => line && line.length > 0);
}

/**
 * 複数行テキストを描画（改良版：正確な上下中央配置＋幅ベース対応）
 * @param {CanvasRenderingContext2D} ctx - キャンバスコンテキスト
 * @param {Array} lines - 行の配列
 * @param {number} x - X座標
 * @param {number} centerY - 中央Y座標
 * @param {number} lineHeight - 行間
 * @param {Object} options - オプション設定
 * @returns {Object} - 描画情報（デバッグ用）
 */
function drawMultilineTextEnhanced(ctx, lines, x, centerY, lineHeight, options = {}) {
    if (!lines || lines.length === 0 || !ctx) return null;

    const defaultOptions = {
        textAlign: 'left',    
        verticalAlign: 'center', 
        lineSpacingFactor: 1.0, 
        debug: false,         
        maxWidth: null        
    };

    const config = { ...defaultOptions, ...options };

    const validLines = lines.filter(line => line && line.trim().length > 0);
    if (validLines.length === 0) return null;

    const actualLineHeight = lineHeight * config.lineSpacingFactor;
    const totalTextHeight = (validLines.length - 1) * actualLineHeight;

    let startY;
    switch (config.verticalAlign) {
        case 'top':
            startY = centerY + (lineHeight / 2) - ((lineHeight - ctx.measureText('M').actualBoundingBoxAscent) / 2);
            break;
        case 'bottom':
            startY = centerY - totalTextHeight - (lineHeight/2) + ((lineHeight - ctx.measureText('M').actualBoundingBoxDescent)/2) ;
            break;
        case 'center':
        default:
            startY = centerY - (totalTextHeight / 2);
            break;
    }


    const originalTextAlign = ctx.textAlign;
    ctx.textAlign = config.textAlign;

    let actualDrawingX = x;

    validLines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            if (config.textAlign === 'center') {
                actualDrawingX = x; 
            } else if (config.textAlign === 'right') {
                actualDrawingX = x; 
            } else {
                actualDrawingX = x; 
            }
            const yPos = startY + (index * actualLineHeight);
            ctx.fillText(trimmedLine, actualDrawingX, yPos);
        }
    });

    ctx.textAlign = originalTextAlign;

    if (config.debug) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - 20, centerY);
        ctx.lineTo(x + 20, centerY);
        ctx.stroke();

        let debugBoxWidth = 0;
        if(config.maxWidth) {
            debugBoxWidth = config.maxWidth;
        } else {
            validLines.forEach(l => {
                debugBoxWidth = Math.max(debugBoxWidth, ctx.measureText(l.trim()).width);
            });
        }
        const debugBoxHeight = totalTextHeight + lineHeight; 
        let debugBoxX = x;
        if(config.textAlign === 'center') debugBoxX = x - debugBoxWidth / 2;
        if(config.textAlign === 'right') debugBoxX = x - debugBoxWidth;

        ctx.strokeRect(debugBoxX, startY - (lineHeight/2) , debugBoxWidth, debugBoxHeight);
        ctx.restore();
    }

    return {
        drawnLines: validLines.length,
        totalHeight: totalTextHeight,
        startY: startY,
        endY: startY + totalTextHeight,
        actualLineHeight: actualLineHeight,
    };
}


/**
 * 単一モード用のラベル描画（改良版：幅ベース折り返し対応・位置調整対応）
 * @param {number} leftMargin - 左マージン
 * @param {number} topMargin - 上マージン
 * @param {number} rowHeight - 行の高さ
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function drawSingleModeLabelsEnhanced(leftMargin, topMargin, rowHeight, displayItems) {
    for (let i = 0; i < displayItems.length; i++) {
        const item = displayItems[i];
        const y = topMargin + (i * rowHeight);
        const centerY = y + (rowHeight / 2);
        
        const isSelected = typeof selectedRowIndices !== 'undefined' && selectedRowIndices.includes(i);

        // --- 背景と境界線の描画 (変更なし) ---
        const gradient = ctx.createLinearGradient(0, y, 0, y + rowHeight);
        if (isSelected) {
            gradient.addColorStop(0, '#eff6ff'); // blue-50
            gradient.addColorStop(0.5, '#dbeafe'); // blue-100
            gradient.addColorStop(1, '#bfdbfe'); // blue-200
        } else if (displayMode === 'improved') {
            gradient.addColorStop(0, '#fef2f2');
            gradient.addColorStop(0.5, '#fee2e2');
            gradient.addColorStop(1, '#fecaca');
        } else {
            gradient.addColorStop(0, '#f9fafb');
            gradient.addColorStop(0.5, '#f3f4f6');
            gradient.addColorStop(1, '#e5e7eb');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, y + 1, leftMargin - 1, rowHeight - 2);

        let borderColor;
        if (isSelected) {
            borderColor = '#93c5fd';
        } else if (displayMode === 'improved') {
            borderColor = '#fecaca';
        } else {
            borderColor = '#d1d5db';
        }
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftMargin - 1, y);
        ctx.lineTo(leftMargin - 1, y + rowHeight);
        ctx.stroke();
        
        // 選択中ハイライトの左端アクセントバー
        if (isSelected) {
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(0, y + 1, 4, rowHeight - 2);
        }
        
        let textColor;
        if (isSelected) {
            textColor = '#1d4ed8';
        } else if (displayMode === 'improved') {
            textColor = '#dc2626';
        } else {
            textColor = '#1f2937';
        }
        
        const numberBaseX = 23;
        const numberBaseY = centerY;
        const numberAdjustedPos = applyTextPositionAdjustment('workItemLabels', numberBaseX, numberBaseY);
        
        ctx.save();
        ctx.fillStyle = textColor;
        ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 13) : 'bold 13px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        applyTextFlashStyles(ctx, 'workItemLabels');
        ctx.fillText(`${i + 1}`, numberAdjustedPos.x, numberAdjustedPos.y);
        ctx.restore();

        // --- 作業名と詳細の描画位置と幅を調整 ---
        const nameAndDetailStartX = 40;
        const rightPadding = 5;
        const availableWidth = leftMargin - nameAndDetailStartX - rightPadding;

        const fFactor = typeof fontSizeFactor !== 'undefined' ? fontSizeFactor : (window.fontSizeFactor || 1.0);
        
        // 基本のフォントサイズ
        let nameFontSize = Math.max(11, 13 * fFactor);
        let detailFontSize = Math.max(9, 10 * fFactor);

        // 最大許容高さ（上下4pxずつパディングをとる）
        const maxContentHeight = rowHeight - 8; 
        
        let nameLineHeight = nameFontSize * 1.2;
        let detailLineHeight = detailFontSize * 1.15;
        const spacingBetweenNameAndDetail = 2;

        // もし行の高さが小さすぎてはみ出しそうな場合、詳細テキストを縮小して枠内に収める
        if (nameLineHeight + detailLineHeight + spacingBetweenNameAndDetail > maxContentHeight) {
            detailFontSize = Math.max(7, maxContentHeight * 0.25);
            detailLineHeight = detailFontSize * 1.15;
            
            const availableForName = maxContentHeight - detailLineHeight - spacingBetweenNameAndDetail;
            nameFontSize = Math.max(9, Math.min(nameFontSize, availableForName / 1.2));
            nameLineHeight = nameFontSize * 1.2;
        }

        const nameColor = displayMode === 'improved' ? '#991b1b' : '#0f172a';
        
        let displayName = item.name;
        let isGroup = !!item.isGroup;
        
        let finalAvailableWidth = availableWidth;
        let nameBaseX = nameAndDetailStartX;

        ctx.font = `bold ${nameFontSize}px "Segoe UI", sans-serif`; 
        const nameLines = wrapTextByWidth(ctx, displayName, finalAvailableWidth, 2);

        let manualTime, autoTime, walkTime;
        if (displayMode === 'improved' && item.improved) {
            manualTime = item.improved.manualTime;
            autoTime = item.improved.autoTime;
            walkTime = item.improved.walkTime;
        } else {
            manualTime = item.manualTime;
            autoTime = item.autoTime;
            walkTime = item.walkTime;
        }
        let timeLabel;
        if (item.category === 'monitor') timeLabel = '監視';
        else if (item.category === 'hold') timeLabel = '保持';
        else if (item.category === 'wait') timeLabel = '手待';
        else timeLabel = '手作';
        
        let detailText = '';
        if (!item.isGroupHeader) {
            detailText = `${timeLabel}:${formatTimeDisplay(manualTime)} 自:${formatTimeDisplay(autoTime)} 歩:${formatTimeDisplay(walkTime)}`;
        }
        
        ctx.font = `normal ${detailFontSize}px "Segoe UI", sans-serif`;
        const detailLines = detailText ? wrapTextByWidth(ctx, detailText, availableWidth, 1) : []; 

        let totalContentHeight = (nameLines.length * nameLineHeight);
        if (detailLines.length > 0 && detailFontSize > 0) {
            totalContentHeight += (detailLines.length * detailLineHeight) + spacingBetweenNameAndDetail;
        }

        const nameBlockStartY = centerY - totalContentHeight / 2 + 3;

        // 作業名を描画
        ctx.save();
        ctx.font = `bold ${nameFontSize}px "Segoe UI", sans-serif`; 
        ctx.fillStyle = nameColor;
        const nameBaseY = nameBlockStartY + (nameLines.length * nameLineHeight) / 2;
        const nameAdjustedPos = applyTextPositionAdjustment('workItemLabels', nameBaseX, nameBaseY);
        applyTextFlashStyles(ctx, 'workItemLabels');
        drawMultilineTextEnhanced(ctx, nameLines, nameAdjustedPos.x, nameAdjustedPos.y, nameLineHeight, {
            textAlign: 'left',
            verticalAlign: 'center', 
            maxWidth: finalAvailableWidth,
        });
        ctx.restore();

        // 時間詳細を描画
        if (!item.isGroupHeader && detailLines.length > 0 && detailLines[0] && detailFontSize > 0) {
            ctx.save();
            ctx.font = `normal ${detailFontSize}px "Segoe UI", sans-serif`; 
            ctx.fillStyle = displayMode === 'improved' ? '#dc2626' : '#64748b';
            const detailBaseX = nameAndDetailStartX;
            const detailBaseY = nameBlockStartY + (nameLines.length * nameLineHeight) + spacingBetweenNameAndDetail + (detailLines.length * detailLineHeight) / 2;
            const detailAdjustedPos = applyTextPositionAdjustment('workItemLabels', detailBaseX, detailBaseY);
            applyTextFlashStyles(ctx, 'workItemLabels');
            drawMultilineTextEnhanced(ctx, detailLines, detailAdjustedPos.x, detailAdjustedPos.y, detailLineHeight, { 
                textAlign: 'left', 
                verticalAlign: 'center', 
                maxWidth: availableWidth,
            });
            ctx.restore();
        }
    }
}

/**
 * 併記モード用のラベル描画（改良版：幅ベース折り返し対応・位置調整対応・番号表示修正版・表示順序連番対応）
 * @param {number} leftMargin - 左マージン
 * @param {number} topMargin - 上マージン
 * @param {number} rowHeight - 行の高さ
 * @param {Array} displayItems - 表示用作業項目リスト（改善前の順序ベース）
 */
function drawBothModeLabelsEnhanced(leftMargin, topMargin, rowHeight, displayItems) {
    // 改善前ベースの項目（common + current-only）を表示順序で取得
    const currentOnlyAndCommonItems = displayItems.filter(item => {
        const targetScope = item.targetScope || 'common';
        return targetScope === 'common' || targetScope === 'current-only';
    });

    // 改善後のみの項目を改善後の順序で取得
    const improvedOnlyItems = improvedWorkOrder
        .map(id => workItems.find(item => item.id === id))
        .filter(item => {
            if (!item) return false;
            const targetScope = item.targetScope || 'common';
            return targetScope === 'improved-only';
        });

    // 全表示項目リスト（表示順序）
    const allDisplayItems = [...currentOnlyAndCommonItems, ...improvedOnlyItems];

    // 改善前表示順序での番号マップを作成（改善前に表示される項目のみ）
    const currentDisplayOrderMap = new Map();
    let currentDisplayNumber = 1;
    currentOnlyAndCommonItems.forEach(item => {
        currentDisplayOrderMap.set(item.id, currentDisplayNumber);
        currentDisplayNumber++;
    });

    // 改善後表示順序での番号マップを作成（改善後に表示される項目のみ）
    const improvedDisplayOrderMap = new Map();
    let improvedDisplayNumber = 1;
    
    // 改善後の順序で番号を割り当て
    improvedWorkOrder.forEach(id => {
        const item = workItems.find(i => i.id === id);
        if (item) {
            const targetScope = item.targetScope || 'common';
            if (targetScope === 'common' || targetScope === 'improved-only') {
                improvedDisplayOrderMap.set(id, improvedDisplayNumber);
                improvedDisplayNumber++;
            }
        }
    });

    // 各項目を描画
    for (let i = 0; i < allDisplayItems.length; i++) {
        const item = allDisplayItems[i];
        const targetScope = item.targetScope || 'common';
        const y = topMargin + (i * rowHeight);
        const centerY = y + (rowHeight / 2);
        
        const isSelected = typeof selectedRowIndices !== 'undefined' && selectedRowIndices.includes(i);

        // --- 背景と境界線の描画ロジック (変更なし) ---
        const gradient = ctx.createLinearGradient(0, y, 0, y + rowHeight);
        if (isSelected) {
            gradient.addColorStop(0, '#eff6ff');
            gradient.addColorStop(0.5, '#dbeafe');
            gradient.addColorStop(1, '#bfdbfe');
        } else if (targetScope === 'improved-only') {
            gradient.addColorStop(0, '#fef2f2'); gradient.addColorStop(0.5, '#fee2e2'); gradient.addColorStop(1, '#fecaca');
        } else {
            gradient.addColorStop(0, '#f1f5f9'); gradient.addColorStop(0.5, '#e2e8f0'); gradient.addColorStop(1, '#cbd5e1');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, y + 1, leftMargin - 1, rowHeight - 2);

        const borderColor = isSelected ? '#93c5fd' : (targetScope === 'improved-only' ? '#fecaca' : '#cbd5e1');
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(leftMargin - 1, y); ctx.lineTo(leftMargin - 1, y + rowHeight); ctx.stroke();
        
        if (isSelected) {
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(0, y + 1, 4, rowHeight - 2);
        }
        
        const nameStartX = 8;
        const numberAreaWidth = 36;
        const rightPadding = 4;
        const availableWidthForName = leftMargin - nameStartX - numberAreaWidth - rightPadding;

        ctx.save();
        const fFactor = typeof fontSizeFactor !== 'undefined' ? fontSizeFactor : (window.fontSizeFactor || 1.0);
        let nameFontSize = Math.max(11, 13 * fFactor);
        
        const maxContentHeight = rowHeight - 4;
        let displayName = item.name;
        let isGroup = !!item.isGroup;

        let nameBaseX = nameStartX;
        let finalAvailableWidthForName = availableWidthForName;
        
        // 一旦ユーザー設定のフォントサイズで折り返し行数を計算する
        ctx.font = `bold ${nameFontSize}px "Segoe UI", sans-serif`;
        let nameLines = wrapTextByWidth(ctx, displayName, finalAvailableWidthForName, 3);
        
        // 実際の折り返し行数に基づき、高さを超える場合のみフォントサイズを縮小する
        let requiredHeight = nameLines.length * nameFontSize * 1.2;
        if (requiredHeight > maxContentHeight && nameLines.length > 0) {
            nameFontSize = Math.max(9, maxContentHeight / (nameLines.length * 1.2));
            ctx.font = `bold ${nameFontSize}px "Segoe UI", sans-serif`;
            // サイズを変えたので再度折り返し計算
            nameLines = wrapTextByWidth(ctx, displayName, finalAvailableWidthForName, 3);
        }
        
        ctx.fillStyle = '#334155';
        
        const nameAdjustedPos = applyTextPositionAdjustment('workItemLabels', nameBaseX, centerY);
        applyTextFlashStyles(ctx, 'workItemLabels');
        drawMultilineTextEnhanced(ctx, nameLines, nameAdjustedPos.x, nameAdjustedPos.y, nameFontSize * 1.2, {
            textAlign: 'left', 
            verticalAlign: 'center', 
            lineSpacingFactor: 0.9, 
            maxWidth: finalAvailableWidthForName 
        });

        ctx.restore();

        // --- 番号表示ロジック ---
        ctx.save();
        ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 10) : 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const numberAreaX = leftMargin - 8;

        if (targetScope === 'improved-only') {
            const improvedNumber = improvedDisplayOrderMap.get(item.id);
            if (improvedNumber) {
                const labelText = `後: ${improvedNumber}`;
                const labelAdjustedPos = applyTextPositionAdjustment('workItemLabels', numberAreaX, centerY);
                ctx.fillStyle = '#dc2626';
                applyTextFlashStyles(ctx, 'workItemLabels');
                ctx.fillText(labelText, labelAdjustedPos.x, labelAdjustedPos.y);
            }
        } else if (targetScope === 'current-only') {
            const currentNumber = currentDisplayOrderMap.get(item.id);
            if (currentNumber) {
                const currentText = `前: ${currentNumber}`;
                const currentLabelAdjustedPos = applyTextPositionAdjustment('workItemLabels', numberAreaX, centerY);
                ctx.fillStyle = '#1f2937';
                applyTextFlashStyles(ctx, 'workItemLabels');
                ctx.fillText(currentText, currentLabelAdjustedPos.x, currentLabelAdjustedPos.y);
            }
        } else {
            const currentNumber = currentDisplayOrderMap.get(item.id);
            const improvedNumber = improvedDisplayOrderMap.get(item.id);

            if (currentNumber) {
                const currentText = `前: ${currentNumber}`;
                const currentLabelAdjustedPos = applyTextPositionAdjustment('workItemLabels', numberAreaX, y + rowHeight / 4);
                ctx.fillStyle = '#1f2937';
                applyTextFlashStyles(ctx, 'workItemLabels');
                ctx.fillText(currentText, currentLabelAdjustedPos.x, currentLabelAdjustedPos.y);
            }

            if (improvedNumber) {
                const improvedText = `後: ${improvedNumber}`;
                const improvedLabelAdjustedPos = applyTextPositionAdjustment('workItemLabels', numberAreaX, y + (rowHeight * 3 / 4));
                ctx.fillStyle = '#dc2626';
                applyTextFlashStyles(ctx, 'workItemLabels');
                ctx.fillText(improvedText, improvedLabelAdjustedPos.x, improvedLabelAdjustedPos.y);
            }
        }
        ctx.restore();
    }
}


function drawWorkItemLabels(leftMargin, topMargin, rowHeight, displayItems) {
    if (displayMode === 'both') {
        drawBothModeLabelsEnhanced(leftMargin, topMargin, rowHeight, displayItems);
    } else {
        drawSingleModeLabelsEnhanced(leftMargin, topMargin, rowHeight, displayItems);
    }
}

/**
 * チャート共通設定を取得
 * @returns {Object} - 共通設定
 */
function getChartCommonSettings() {
    if (!canvas) {
        return {
            displayItems: [],
            maxTime: 100,
            standardWorkTotalTime: 0,
            frequencyMaxTime: 0,
            taktTime: 36,
            baseTime: 100,
            leftMargin: 240,
            rightMargin: 40,
            chartWidth: 1150,
            timeScale: 10,
            scaleMode: 'manual',
            devicePixelRatio: window.devicePixelRatio || 1,
            canvasDisplayWidth: 1150
        };
    }

    const displayItems = getDisplayWorkItems();
    const scaleInfo = calculateUnifiedScale();
    
    const leftMargin = showWorkItemLabels ? 240 : 85;
    const rightMargin = 40;
    
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // ★★★ canvasWidth グローバル変数を使用（getBoundingClientRect を廃止）★★★
    // getBoundingClientRect はDOMのレンダリングタイミングに依存するため、
    // ganttChart と processChart の描画フレームが異なるとスケールがズレる。
    // canvasWidth は updateChart() 内で確定した「唯一の真値」であり、
    // これを使うことで両チャートのタイムスケールが常に完全一致することを保証する。
    const canvasDisplayWidth = (typeof canvasWidth !== 'undefined' && canvasWidth > 0)
        ? canvasWidth
        : canvas.getBoundingClientRect().width; // フォールバック（未初期化時のみ）

    const chartWidth = canvasDisplayWidth - leftMargin - rightMargin;
    const timeScale = chartWidth > 0 ? chartWidth / scaleInfo.maxTime : 0;
    
    return {
        displayItems,
        maxTime: scaleInfo.maxTime,
        standardWorkTotalTime: scaleInfo.standardWorkTotalTime,
        frequencyMaxTime: scaleInfo.frequencyMaxTime,
        taktTime: scaleInfo.taktTime,
        baseTime: scaleInfo.baseTime,
        leftMargin,
        rightMargin,
        chartWidth,
        timeScale,
        scaleMode: scaleInfo.mode,
        devicePixelRatio,
        canvasDisplayWidth
    };
}


/**
 * 標準作業組合せ票タイトルを描画（位置調整対応版）
 */
function drawGanttChartTitle() {
    // 工程確認チャート・頻度作業チャートとタイトル位置を統一（baseX=15, baseY=18）
    const baseX = 15;
    const baseY = 18;
    
    // 位置調整を適用
    const adjustedPos = applyTextPositionAdjustment('chartTitle', baseX, baseY);
    
    // メインのガントチャートのコンテキスト(ctx)を使用
    ctx.save();
    ctx.fillStyle = '#1f2937'; // 文字色
    ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 12) : 'bold 12px "Segoe UI", sans-serif'; // フォントスタイルとサイズ
    ctx.textAlign = 'left'; // テキストを左寄せ
    applyTextFlashStyles(ctx, 'chartTitle');
    ctx.fillText('標準作業組合せ票', adjustedPos.x, adjustedPos.y); // 調整済み座標で描画
    ctx.restore();
}

/**
 * メインのガントチャート描画関数（併記モード行数計算修正版）
 */

/**
 * 2サイクル目のオーバーレイ描画
 * 1サイクル目と同一内容を cycleTime 分だけ右にオフセットして半透明で重ねる。
 * 作業名ラベルは省略し、バー・接続線・歩行線のみ表示。
 * @param {number} timeScale
 * @param {number} leftMargin
 * @param {Array}  displayItems
 */
/**
 * 2〜Nサイクル目のバー描画（グリッド描画の前に呼ぶ）
 */
function drawDualCycleBars(timeScale, leftMargin, displayItems) {
    if (cycleCount < 2) return;

    if (displayMode === 'both') {
        const currentCycleTime  = calculateTotalCycleTimeForMode('current');
        const improvedCycleTime = calculateTotalCycleTimeForMode('improved');

        for (let i = 2; i <= cycleCount; i++) {
            if (currentCycleTime > 0) {
                ctx.save();
                ctx.translate((i - 1) * currentCycleTime * timeScale, 0);
                drawBothModeCurrentHalfOnly(timeScale, leftMargin, displayItems);
                ctx.restore();
            }
            if (improvedCycleTime > 0) {
                ctx.save();
                ctx.translate((i - 1) * improvedCycleTime * timeScale, 0);
                drawBothModeImprovedHalfOnly(timeScale, leftMargin, displayItems);
                ctx.restore();
            }
        }
        return;
    }

    const cycleTime = calculateTotalCycleTimeForMode(displayItems);
    if (!cycleTime || cycleTime <= 0) return;

    for (let i = 2; i <= cycleCount; i++) {
        ctx.save();
        ctx.translate((i - 1) * cycleTime * timeScale, 0);
        drawWorkItems(timeScale, leftMargin, displayItems);
        ctx.restore();
    }
}

/**
 * 併記モード 2サイクル目用：改善前バー（上半分）のみ描画 + 改善前接続線
 * drawBothModeWorkItems の改善前セクションを独立させたもの。
 * ctx.translate で既にオフセット済みの状態で呼ばれることを前提とする。
 */
function drawBothModeCurrentHalfOnly(timeScale, leftMargin, displayItems) {
    const effectiveRowHeight = _gRowHeight();
    let currentCumulativeTime = 0;
    let currentDisplayIndex   = 0;

    displayItems.forEach(item => {
        const targetScope = item.targetScope || 'common';
        if (targetScope === 'common' || targetScope === 'current-only') {
            const y = TOP_MARGIN + (currentDisplayIndex * effectiveRowHeight);
            drawEnhancedWorkItemRow(
                item, currentDisplayIndex, currentCumulativeTime, y,
                timeScale, leftMargin, effectiveRowHeight / 2,
                item.manualTime, item.autoTime, item.walkTime, 'current'
            );
            currentCumulativeTime += item.manualTime + item.walkTime;
            currentDisplayIndex++;
        }
    });

    drawCurrentModeConnectionsInBoth(timeScale, leftMargin, displayItems, effectiveRowHeight);
}

/**
 * 併記モード 2サイクル目用：改善後バー（下半分）のみ描画 + 改善後接続線
 * drawBothModeWorkItems の改善後セクションを独立させたもの。
 * ctx.translate で既にオフセット済みの状態で呼ばれることを前提とする。
 */
function drawBothModeImprovedHalfOnly(timeScale, leftMargin, displayItems) {
    const effectiveRowHeight = _gRowHeight();

    const currentOnlyAndCommonCount = displayItems.filter(item => {
        const s = item.targetScope || 'common';
        return s === 'common' || s === 'current-only';
    }).length;

    let improvedCumulativeTime = 0;
    const improvedOrderItems = improvedWorkOrder
        .map(id => workItems.find(item => item.id === id))
        .filter(Boolean);

    improvedOrderItems.forEach((item, improvedIndexInOrder) => {
        const targetScope = item.targetScope || 'common';
        if (targetScope !== 'common' && targetScope !== 'improved-only') return;

        let displayRowIndex = -1;

        if (targetScope === 'common') {
            let actualDisplayIndex = 0;
            for (let k = 0; k < displayItems.length; k++) {
                const s = displayItems[k].targetScope || 'common';
                if (s !== 'improved-only') {
                    if (displayItems[k].id === item.id) {
                        displayRowIndex = actualDisplayIndex;
                        break;
                    }
                    actualDisplayIndex++;
                }
            }
        } else {
            let relativeImprovedOnlyIndex = 0;
            for (let k = 0; k < improvedIndexInOrder; k++) {
                if ((improvedOrderItems[k].targetScope || 'common') === 'improved-only') {
                    relativeImprovedOnlyIndex++;
                }
            }
            displayRowIndex = currentOnlyAndCommonCount + relativeImprovedOnlyIndex;
        }

        if (displayRowIndex >= 0) {
            const y         = TOP_MARGIN + (displayRowIndex * effectiveRowHeight);
            const improvedY = y + effectiveRowHeight / 2;
            const improvedData = item.improved || {
                manualTime: item.manualTime,
                autoTime:   item.autoTime,
                walkTime:   item.walkTime
            };
            drawEnhancedWorkItemRow(
                item, displayRowIndex, improvedCumulativeTime, improvedY,
                timeScale, leftMargin, effectiveRowHeight / 2,
                improvedData.manualTime, improvedData.autoTime, improvedData.walkTime, 'improved'
            );
            improvedCumulativeTime += improvedData.manualTime + improvedData.walkTime;
        }
    });

    drawImprovedModeConnectionsInBoth(timeScale, leftMargin, displayItems, effectiveRowHeight);
}

/**
 * Nサイクル完了縦線＋ラベルの描画（グリッド描画の後に呼ぶ）
 * 途中サイクル（2〜N-1）は細い破線、最終サイクル（N）は太い実線でラベル付き
 */
function drawDualCycleOverlay(timeScale, leftMargin, displayItems) {
    if (cycleCount < 2) return;
    const cycleTime = calculateTotalCycleTimeForMode(displayItems);
    if (!cycleTime || cycleTime <= 0) return;

    const totalDisplayRows = getTotalDisplayRows();
    const chartHeight = totalDisplayRows * _gRowHeight();
    const chartTop    = TOP_MARGIN - 18;
    const chartBottom = TOP_MARGIN + chartHeight;

    const _drawCycleLine = (x2, styleKey, labelText, isLast) => {
        ctx.save();
        const s = _applyLineStyle(ctx, styleKey, isLast ? 1.0 : 0.55, isLast ? 1.0 : 0.6);
        if (!isLast) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x2, chartTop);
        ctx.lineTo(x2, chartBottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        if (labelText) {
            ctx.fillStyle = s.color;
            ctx.font = isLast
                ? 'bold 12px "Segoe UI", sans-serif'
                : '10px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(labelText, x2, TOP_MARGIN - 22);
        }
        ctx.restore();
    };

    if (displayMode === 'both') {
        const currentCycleTime  = calculateTotalCycleTimeForMode('current');
        const improvedCycleTime = calculateTotalCycleTimeForMode('improved');
        for (let i = 2; i <= cycleCount; i++) {
            const isLast = (i === cycleCount);
            if (currentCycleTime > 0) {
                const label = isLast
                    ? `改善前 ${i}C/T ${formatTimeDisplay(Math.round(currentCycleTime * i))}`
                    : `${i}C`;
                _drawCycleLine(leftMargin + currentCycleTime * i * timeScale, 'currentCT', label, isLast);
            }
            if (improvedCycleTime > 0) {
                const label = isLast
                    ? `改善後 ${i}C/T ${formatTimeDisplay(Math.round(improvedCycleTime * i))}`
                    : `${i}C`;
                _drawCycleLine(leftMargin + improvedCycleTime * i * timeScale, 'improvedCT', label, isLast);
            }
        }
    } else {
        const styleKey = (displayMode === 'improved') ? 'improvedCT' : 'currentCT';
        const prefix   = (displayMode === 'improved') ? '改善後 ' : '';
        for (let i = 2; i <= cycleCount; i++) {
            const isLast = (i === cycleCount);
            const label = isLast
                ? `${prefix}${i}C/T ${formatTimeDisplay(Math.round(cycleTime * i))}`
                : `${i}C`;
            _drawCycleLine(leftMargin + cycleTime * i * timeScale, styleKey, label, isLast);
        }
    }
}

function drawGanttChart() {
    // workItemsが0件の場合はゴーストゾーンが表示されるため描画しない
    if (typeof workItems === 'undefined' || !workItems || workItems.length === 0) return;

    // getChartCommonSettingsは、updateChartで更新された最新のcanvas.widthを元にスケールを計算する
    const settings = getChartCommonSettings();
    const { displayItems, maxTime, leftMargin, rightMargin, timeScale } = settings;

    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    
    // ★★★ 修正：統一された行数計算関数を使用 ★★★
    const totalDisplayRows = getTotalDisplayRows();
    
    // キャンバスクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGanttChartTitle();

    // 表示切替オーバーレイを横軸0位置（leftMargin）の真上中央に動的配置
    const overlay = document.getElementById('displayModeOverlay');
    if (overlay) overlay.style.left = leftMargin + 'px';

    // グリッド描画（共通関数呼び出し）
    const gridConfig = {
        ctx: ctx,
        canvasWidth: settings.canvasDisplayWidth,
        chartHeight: totalDisplayRows * effectiveRowHeight, // 修正した行数で高さを計算
        maxTime: maxTime,
        timeScale: timeScale,
        leftMargin: leftMargin,
        rightMargin: rightMargin,
        topMargin: TOP_MARGIN,
        rowHeight: effectiveRowHeight,
        totalRows: totalDisplayRows, // 修正した行数を渡す
        drawBothModeCenterLine: (displayMode === 'both')
    };
    
    const isDual = cycleCount >= 2;

    if (displayMode === 'both') {
        let currentTotal = 0;
        currentWorkOrder.forEach(id => {
            const item = workItems.find(i => i.id === id);
            if (item && (item.targetScope || 'common') !== 'improved-only') {
                currentTotal += item.manualTime + item.walkTime;
            }
        });
        
        let improvedTotal = 0;
        improvedWorkOrder.forEach(id => {
            const item = workItems.find(i => i.id === id);
            if (item && (item.targetScope || 'common') !== 'current-only') {
                const improvedData = item.improved || { manualTime: item.manualTime, walkTime: item.walkTime };
                improvedTotal += improvedData.manualTime + improvedData.walkTime;
            }
        });

        gridConfig.completionLines = {
            current:  { time: currentTotal,  label: `改善前 C/T ${formatTimeDisplay(currentTotal)}`,  styleKey: 'currentCT'  },
            improved: { time: improvedTotal, label: `改善後 C/T ${formatTimeDisplay(improvedTotal)}`, styleKey: 'improvedCT' }
        };
    } else {
        const cycleTime  = calculateTotalCycleTimeForMode(displayItems);
        const styleKey   = (displayMode === 'improved') ? 'improvedCT' : 'currentCT';
        const modePrefix = (displayMode === 'improved') ? '改善後 ' : '';
        gridConfig.completionLines = {
            main: { time: cycleTime, label: `${modePrefix}C/T ${formatTimeDisplay(cycleTime)}`, styleKey }
        };
    }
    
    // 行ハイライト描画
    drawRowHighlights(timeScale, leftMargin, displayItems);
    drawWorkItemLabels(leftMargin, TOP_MARGIN, effectiveRowHeight, displayItems);
    
    // 1サイクル目の作業項目描画
    if (displayMode === 'both') {
        drawBothModeWorkItems(timeScale, leftMargin, displayItems);
    } else {
        drawWorkItems(timeScale, leftMargin, displayItems);
    }

    // 2サイクル目のバーをグリッド前に描画（グリッド線が上に乗るよう1サイクル目と同レイヤー順序にする）
    drawDualCycleBars(timeScale, leftMargin, displayItems);

    drawStandardizedGrid(gridConfig);

    // 2サイクル完了縦線（グリッドの上に描画）
    drawDualCycleOverlay(timeScale, leftMargin, displayItems);

    // その他の描画要素
    const totalCycleTime = calculateTotalCycleTimeForMode(displayItems);
    drawTimeStatus(totalCycleTime, timeScale, TOP_MARGIN, leftMargin, effectiveRowHeight, displayItems);
    drawDropTargetIndicator(timeScale, leftMargin, displayItems);

    // タクトタイム線を最後（最前面）に描画
    drawEnhancedTaktTimeLine(taktTime, timeScale, TOP_MARGIN, leftMargin, displayItems);

    // 自動送り干渉をGanttチャート上HTMLバッジで表示（干渉なし時は非表示）
    detectGanttAutoFeedConflicts();
}

/**
 * 挿入矢印を描画 (削除済み)
 */
function drawInsertArrow(x, y, color) {
    // 矢印オブジェクトは不要となったため処理を削除
}

/**
 * ドロップターゲットインジケーター描画（修正版：正確な行の高さ計算と位置修正）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function drawDropTargetIndicator(timeScale, leftMargin, displayItems) {
    if (canvasDragMode && dropTargetIndex >= 0 && dropTargetIndex !== draggedRowIndex) {
        const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
        const canvasDisplayWidth = canvas.width / (window.devicePixelRatio || 1);
        
        // ★★★ 修正：表示項目数ベースの正確な位置計算 ★★★
        let totalDisplayItems = displayItems.length;
        if (displayMode === 'both') {
            const improvedOnlyItems = improvedWorkOrder
                .map(id => workItems.find(item => item.id === id))
                .filter(item => {
                    if (!item) return false;
                    const targetScope = item.targetScope || 'common';
                    return targetScope === 'improved-only';
                });
            totalDisplayItems += improvedOnlyItems.length;
        }
        
        let targetY;

        // ★★★ 修正：ドロップターゲット位置の正確な計算 ★★★
        if (dropTargetIndex >= totalDisplayItems) {
            // 最後の項目の下（新規追加位置）
            targetY = TOP_MARGIN + (totalDisplayItems * effectiveRowHeight);
        } else {
            // 指定された項目の上（項目間）
            targetY = TOP_MARGIN + (dropTargetIndex * effectiveRowHeight);
        }

        // より目立つドロップインジケーター（改善版）
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 6;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, targetY);
        ctx.lineTo(canvasDisplayWidth, targetY);
        ctx.stroke();

        // ドロップ位置の視覚的強調
        ctx.fillStyle = '#059669';
        ctx.fillRect(0, targetY - 3, canvasDisplayWidth, 6);

        // ★★★ 修正：ドロップ位置のテキスト表示（位置に応じた説明） ★★★
        ctx.fillStyle = '#059669';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        
        let dropText = 'ここに移動';
        if (dropTargetIndex >= totalDisplayItems) {
            dropText = '最後に移動';
        } else if (dropTargetIndex === 0) {
            dropText = '最初に移動';
        } else {
            dropText = `${dropTargetIndex + 1}番目に移動`;
        }
        
        ctx.fillText(dropText, canvasDisplayWidth / 2, targetY - 8);
    }
}

/**
 * 行のハイライト描画（修正版：挿入位置表示の精度向上）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function drawRowHighlights(timeScale, leftMargin, displayItems) {
    const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    const canvasDisplayWidth = canvas.width / (window.devicePixelRatio || 1);
    
    // 併記モードの場合は改善後のみの項目も含める
    let totalDisplayItems = displayItems.length;
    if (displayMode === 'both') {
        const improvedOnlyItems = improvedWorkOrder
            .map(id => workItems.find(item => item.id === id))
            .filter(item => {
                if (!item) return false;
                const targetScope = item.targetScope || 'common';
                return targetScope === 'improved-only';
            });
        totalDisplayItems += improvedOnlyItems.length;
    }

    // 選択行のハイライト（青系統一・右クリックや複数選択用）
    if (typeof selectedRowIndices !== 'undefined' && selectedRowIndices.length > 0) {
        selectedRowIndices.forEach(idx => {
            if (idx >= 0 && idx < totalDisplayItems) {
                const y = TOP_MARGIN + (idx * effectiveRowHeight);
                
                // 青系の背景ハイライト
                ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
                // ラベル領域より右側（チャート領域）をハイライト
                ctx.fillRect(leftMargin, y, canvasDisplayWidth - leftMargin, effectiveRowHeight);
            }
        });
    }

    // ホバー行のハイライト（黄色系統一）- 選択行と被らないように調整
    if (hoveredRowIndex >= 0 && hoveredRowIndex < totalDisplayItems) {
        if (typeof selectedRowIndices === 'undefined' || !selectedRowIndices.includes(hoveredRowIndex)) {
            const y = TOP_MARGIN + (hoveredRowIndex * effectiveRowHeight);

            // すべてのモードで黄色系統一
            ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
            ctx.fillRect(0, y, canvasDisplayWidth, effectiveRowHeight);
        }
    }

    // ★★★ 修正：挿入位置の罫線強調表示（正確な位置計算） ★★★
    if (insertRowIndex >= 0 && insertRowIndex <= totalDisplayItems) {
        const y = TOP_MARGIN + (insertRowIndex * effectiveRowHeight);

        // 罫線強調のみ（背景色変更なし）
        ctx.strokeStyle = '#f97316'; // オレンジ系の強調色
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasDisplayWidth, y);
        ctx.stroke();
    }

    // ドラッグ中のハイライト
    if (canvasDragMode && draggedRowIndex >= 0 && draggedRowIndex < totalDisplayItems) {
        const y = TOP_MARGIN + (draggedRowIndex * effectiveRowHeight);
        ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
        ctx.fillRect(0, y, canvasDisplayWidth, effectiveRowHeight);
    }
}

/**
 * ドロップ矢印を描画 (削除済み)
 */
function drawDropArrow(x, y, color) {
    // 矢印オブジェクトは不要となったため処理を削除
}

/**
 * 全てのチャートで利用可能な、標準化されたグリッド描画関数
 * @param {object} config - グリッド描画のための設定オブジェクト
 * @param {CanvasRenderingContext2D} config.ctx - 描画対象のキャンバスコンテキスト
 * @param {number} config.canvasWidth - キャンバスの表示幅
 * @param {number} config.chartHeight - グリッドを描画するエリアの高さ (例: totalRows * rowHeight)
 * @param {number} config.maxTime - X軸の最大表示時間
 * @param {number} config.timeScale - 時間スケール
 * @param {number} config.leftMargin - 左マージン
 * @param {number} config.rightMargin - 右マージン
 * @param {number} config.topMargin - 上マージン
 * @param {number} config.rowHeight - 1行の高さ
 * @param {number} config.totalRows - 描画する総行数
 * @param {number} config.baseTimeForGrid - グリッド間隔計算の基準となる時間
 * @param {object} [config.completionLines] - 完了線描画用のオプション情報
 * @param {boolean} [config.drawBothModeCenterLine=false] - 併記モード時に中央線を描画するか
 */
function drawStandardizedGrid(config) {
    const {
        ctx,
        canvasWidth,
        chartHeight,
        maxTime,
        timeScale,
        leftMargin,
        rightMargin,
        topMargin,
        rowHeight,
        totalRows,
        completionLines,
        drawBothModeCenterLine = false
    } = config;

    // --- 1. グリッド間隔の計算（シンプルで堅牢なロジックに修正） ---
    const minLabelSpacingPixels = 60; // ラベルが重ならない最小のピクセル間隔
    const preferredIntervals = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 300, 600, 900, 1800, 3600];
    
    // 描画エリアの幅から、表示すべき最大グリッド数を計算
    const chartRenderWidth = canvasWidth - leftMargin - rightMargin;
    const maxGridCount = Math.floor(chartRenderWidth / minLabelSpacingPixels);

    // 表示時間全体を最大グリッド数で割り、理想的なグリッド間隔（秒）を求める
    const idealIntervalSeconds = maxTime / maxGridCount;

    // 理想的な間隔に最も近い、定義済みのきれいな間隔を選択
    let actualLabelIntervalSeconds = preferredIntervals.find(p => p >= idealIntervalSeconds);
    if (!actualLabelIntervalSeconds) {
        actualLabelIntervalSeconds = preferredIntervals[preferredIntervals.length - 1];
    }
    
    // 小さなグリッドの間隔（主要グリッドの1/2または1/5）
    let minorGridIntervalSeconds;
    if (actualLabelIntervalSeconds % 10 === 0 && actualLabelIntervalSeconds > 10) {
        minorGridIntervalSeconds = actualLabelIntervalSeconds / 5;
    } else if (actualLabelIntervalSeconds % 2 === 0 && actualLabelIntervalSeconds > 2) {
        minorGridIntervalSeconds = actualLabelIntervalSeconds / 2;
    } else {
        minorGridIntervalSeconds = actualLabelIntervalSeconds;
    }
    
    // --- 2. 縦のグリッド線と時間ラベルの描画 ---
    for (let t = 0; t <= maxTime; t += minorGridIntervalSeconds) {
        const x = leftMargin + (t * timeScale);

        if (x > canvasWidth - rightMargin + 5) break;

        const isMajorTick = Math.abs(t % actualLabelIntervalSeconds) < 0.001;

        ctx.lineWidth = isMajorTick ? 1 : 0.5;
        ctx.strokeStyle = isMajorTick ? '#94a3b8' : '#e2e8f0';
        
        // 0秒の線を少し太く
        if (Math.abs(t) < 0.001) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#64748b';
        }

        ctx.beginPath();
        ctx.moveTo(x, topMargin - 18);
        ctx.lineTo(x, topMargin + chartHeight);
        ctx.stroke();

        // 主要なグリッド線にのみ時間ラベルを描画
        if (isMajorTick && x >= leftMargin) {
            const adjustedPos = applyTextPositionAdjustment('timeAxisLabels', x, topMargin - 6);
            ctx.save();
            ctx.fillStyle = '#374151';
            ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 12) : 'bold 12px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            applyTextFlashStyles(ctx, 'timeAxisLabels');
            ctx.fillText(formatTimeDisplay(Math.round(t)), adjustedPos.x, adjustedPos.y);
            ctx.restore();
        }
    }
    
    // --- 3. 完了線の描画 (オプション) ---
    if (completionLines) {
        Object.values(completionLines).forEach(line => {
            if (line && line.time > 0) {
                const lineX     = leftMargin + (line.time * timeScale);
                // line.styleKey があれば lineStyles から取得、なければ line.color/width/dash を直接使用
                const styleKey  = line.styleKey;
                ctx.save();
                if (styleKey) {
                    _applyLineStyle(ctx, styleKey);
                } else {
                    ctx.strokeStyle = line.color || '#1f2937';
                    ctx.lineWidth   = line.width  || 2;
                    ctx.setLineDash((line.dash && LINE_DASH_PATTERNS[line.dash]) || []);
                }
                ctx.beginPath();
                ctx.moveTo(lineX, topMargin - 18);
                ctx.lineTo(lineX, topMargin + chartHeight);
                ctx.stroke();
                ctx.setLineDash([]);

                const resolvedColor = styleKey
                    ? ((typeof lineStyles !== 'undefined' && lineStyles[styleKey]) ? lineStyles[styleKey].color : line.color)
                    : (line.color || '#1f2937');
                const adjustedPos = applyTextPositionAdjustment('completionLabels', lineX, topMargin - 22);
                ctx.fillStyle = resolvedColor;
                ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 12) : 'bold 12px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                applyTextFlashStyles(ctx, 'completionLabels');
                ctx.fillText(line.label, adjustedPos.x, adjustedPos.y);
                ctx.restore();
            }
        });
    }

    // --- 4. 横のグリッド線 (行区切り) の描画 ---
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    for (let i = 0; i <= totalRows; i++) {
        const y = topMargin + (i * rowHeight);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }
    
    // --- 5. 併記モード時の中央線の描画 (オプション) ---
    if (drawBothModeCenterLine) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        for (let i = 0; i < totalRows; i++) {
            const y = topMargin + (i * rowHeight);
            const midY = y + rowHeight / 2;
            ctx.beginPath();
            ctx.moveTo(leftMargin, midY);
            ctx.lineTo(canvasWidth - rightMargin, midY);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
}

/**
 * 強化されたタクトタイムライン描画（まとめづくりバッチモード対応版・位置調整対応）
 * @param {number} taktTimeValue - タクトタイム（1T/T）
 * @param {number} timeScale - 時間スケール
 * @param {number} topMargin - 上マージン
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト（参考用）
 */
function drawEnhancedTaktTimeLine(taktTimeValue, timeScale, topMargin, leftMargin, displayItems) {
    const effectiveRowHeight = _gRowHeight();
    const totalDisplayRows   = getTotalDisplayRows();
    const chartHeight        = totalDisplayRows * effectiveRowHeight;
    const chartBottom        = topMargin + chartHeight;
    const chartTop           = topMargin - 18;

    // ── まとめづくりモード判定 ──────────────────────────────────────────
    const isBatch    = (typeof batchMode !== 'undefined') && batchMode && (typeof batchQuantity !== 'undefined') && batchQuantity > 1;
    const batchQty   = isBatch ? batchQuantity : 1;
    const batchTT    = taktTimeValue * batchQty;          // メイン線の時間位置
    const mainX      = leftMargin + (batchTT * timeScale); // メイン線のX座標

    // ── マルチサイクル表示時のサイクル数 ──────────────────────────────
    const isDual     = cycleCount >= 2;
    const maxCycles  = cycleCount;

    // ── 1. 個別T/T補助線（N-1本、各サイクル分）────────────────────────
    if (isBatch && batchShowIndividualLines) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 3]);
        for (let cycle = 0; cycle < maxCycles; cycle++) {
            const cycleOffset = batchTT * cycle;
            for (let i = 1; i < batchQty; i++) {
                const subX = leftMargin + ((taktTimeValue * i + cycleOffset) * timeScale);
                ctx.beginPath();
                ctx.moveTo(subX, chartTop);
                ctx.lineTo(subX, chartBottom);
                ctx.stroke();

                const subLabelInterval = Math.ceil(batchQty / 10);
                if (i % subLabelInterval === 0) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(220, 38, 38, 0.7)';
                    ctx.font = 'bold 9px "Segoe UI", sans-serif';
                    ctx.textAlign = 'center';
                    const label = cycle === 0 ? `${i}T/T` : `${batchQty + i}T/T`;
                    ctx.fillText(label, subX, topMargin - 26);
                    ctx.setLineDash([6, 3]);
                }
            }
        }
        ctx.restore();
    }

    // ── 2. メインT/T線（各サイクル分）────────────────────────────────
    for (let cycle = 0; cycle < maxCycles; cycle++) {
        const cycleOffset  = batchTT * cycle;
        const cycleMainX   = leftMargin + ((batchTT + cycleOffset) * timeScale);
        const cycleMainTT  = batchTT * (cycle + 1);

        ctx.save();
        const ttStyle = _applyLineStyle(ctx, 'taktTime');
        ctx.beginPath();
        ctx.moveTo(cycleMainX, chartTop);
        ctx.lineTo(cycleMainX, chartBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── 3. ラベル ────────────────────────────────────────────────
        let labelText;
        if (isBatch) {
            const nT = batchQty * (cycle + 1);
            labelText = `${nT}T/T  ${formatTimeDisplay(Math.round(cycleMainTT))}`;
        } else {
            const multiplier = cycle + 1;
            const prefix = multiplier === 1 ? '' : `${multiplier}`;
            labelText = `${prefix}T/T ${formatTimeDisplay(Math.round(taktTimeValue * multiplier))}`;
        }

        const baseY       = topMargin - 24;
        const adjustedPos = applyTextPositionAdjustment('taktTimeLabel', cycleMainX, baseY);

        ctx.fillStyle = ttStyle.color;
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        applyTextFlashStyles(ctx, 'taktTimeLabel');
        ctx.fillText(labelText, adjustedPos.x, adjustedPos.y);

        ctx.restore();
    }
}

/**
 * 作業項目描画（通常モード）- 作業分類対応版・ビジネス最適化
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function drawWorkItems(timeScale, leftMargin, displayItems) {
    let cumulativeTime = 0;
    const effectiveRowHeight = _gRowHeight();

    displayItems.forEach((item, index) => {
        const y = TOP_MARGIN + (index * effectiveRowHeight);

        // 表示モードに応じた時間データを取得
        let manualTime, autoTime, walkTime;
        if (displayMode === 'improved' && item.improved) {
            manualTime = item.improved.manualTime;
            autoTime = item.improved.autoTime;
            walkTime = item.improved.walkTime;
        } else {
            manualTime = item.manualTime;
            autoTime = item.autoTime;
            walkTime = item.walkTime;
        }

        drawEnhancedWorkItemRow(item, index, cumulativeTime, y, timeScale, leftMargin, effectiveRowHeight, manualTime, autoTime, walkTime);

        // 接続線の描画
        if (index < displayItems.length - 1) {
            // 通常の項目間接続線
            const nextY = TOP_MARGIN + ((index + 1) * effectiveRowHeight);
            drawConnectionLine(cumulativeTime + manualTime, y, nextY, timeScale, leftMargin, walkTime);
        } else if (displayItems.length > 1 && walkTime > 0) {
            // 最後の項目から最初の項目への歩行線（循環）
            const firstY = TOP_MARGIN;
            drawConnectionLine(cumulativeTime + manualTime, y, firstY, timeScale, leftMargin, walkTime);
        }

        cumulativeTime += manualTime + walkTime;
    });
}

/**
 * 併記モード用の作業項目描画（対象区分対応版・改善後のみ項目対応強化）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト（改善前の順序ベース）
 */
function drawBothModeWorkItems(timeScale, leftMargin, displayItems) {
    const effectiveRowHeight = _gRowHeight();

    // 改善前項目（common + current-only）の数を計算
    const currentOnlyAndCommonCount = displayItems.filter(item => {
        const targetScope = item.targetScope || 'common';
        return targetScope === 'common' || targetScope === 'current-only';
    }).length;

    // 改善前の項目を表示順序で描画（上半分）
    let currentCumulativeTime = 0;
    let currentDisplayIndex = 0;

    displayItems.forEach((item, itemIndex) => {
        const targetScope = item.targetScope || 'common';

        // 改善前に表示すべき項目のみ処理
        if (targetScope === 'common' || targetScope === 'current-only') {
            const y = TOP_MARGIN + (currentDisplayIndex * effectiveRowHeight);
            const currentY = y;   // 上半分（改善前）

            // 改善前データ
            const currentData = {
                manualTime: item.manualTime,
                autoTime: item.autoTime,
                walkTime: item.walkTime
            };

            // 改善前の作業項目を描画（上半分）
            drawEnhancedWorkItemRow(item, currentDisplayIndex, currentCumulativeTime, currentY, timeScale, leftMargin, ROW_HEIGHT / 2,
                currentData.manualTime, currentData.autoTime, currentData.walkTime, 'current');

            currentCumulativeTime += currentData.manualTime + currentData.walkTime;
            currentDisplayIndex++;
        }
    });

    // 改善後の項目を改善後の順序で描画（下半分）
    let improvedCumulativeTime = 0;
    const improvedOrderItems = improvedWorkOrder.map(id => workItems.find(item => item.id === id)).filter(Boolean);

    improvedOrderItems.forEach((item, improvedIndexInOrder) => {
        const targetScope = item.targetScope || 'common';

        // 改善後に表示すべき項目のみ処理
        if (targetScope === 'common' || targetScope === 'improved-only') {
            let displayRowIndex = -1;

            if (targetScope === 'common') {
                // 共通項目：改善前リストでの位置を探す
                 displayRowIndex = displayItems.findIndex(displayItem => displayItem.id === item.id && (displayItem.targetScope || 'common') !== 'improved-only');
                 // 改善前のみの項目をスキップしてインデックスを調整
                 if(displayRowIndex !== -1) {
                    let actualDisplayIndex = 0;
                    for(let k=0; k < displayItems.length; k++) {
                        if((displayItems[k].targetScope || 'common') !== 'improved-only') {
                            if(displayItems[k].id === item.id) {
                                displayRowIndex = actualDisplayIndex;
                                break;
                            }
                            actualDisplayIndex++;
                        }
                    }
                 }

            } else if (targetScope === 'improved-only') {
                // 改善後のみ項目：改善前項目リストの最後尾に追加
                // allDisplayItems (drawBothModeLabelsEnhanced参照)のロジックに合わせる
                // improvedOnlyItemsのimprovedOrderItems内での相対インデックスを計算
                let relativeImprovedOnlyIndex = 0;
                for(let k=0; k < improvedIndexInOrder; k++) {
                    if((improvedOrderItems[k].targetScope || 'common') === 'improved-only') {
                        relativeImprovedOnlyIndex++;
                    }
                }
                displayRowIndex = currentOnlyAndCommonCount + relativeImprovedOnlyIndex;
            }


            if (displayRowIndex >= 0) {
                const y = TOP_MARGIN + (displayRowIndex * effectiveRowHeight);
                const improvedY = y + effectiveRowHeight / 2;  // 下半分（改善後）

                // 改善後データ
                const improvedData = item.improved || {
                    manualTime: item.manualTime,
                    autoTime: item.autoTime,
                    walkTime: item.walkTime
                };

                // 改善後の作業項目を描画（下半分）
                drawEnhancedWorkItemRow(item, displayRowIndex, improvedCumulativeTime, improvedY, timeScale, leftMargin, ROW_HEIGHT / 2,
                    improvedData.manualTime, improvedData.autoTime, improvedData.walkTime, 'improved');

                improvedCumulativeTime += improvedData.manualTime + improvedData.walkTime;
            }
        }
    });

    // 接続線を描画（改善前・改善後それぞれの順序に従って）
    drawBothModeConnectionLines(timeScale, leftMargin, displayItems);
}

/**
 * 併記モード用の接続線描画（修正版：改善後のみ項目対応・正確な位置計算）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト（改善前の順序ベース）
 */
function drawBothModeConnectionLines(timeScale, leftMargin, displayItems) {
    const effectiveRowHeight = _gRowHeight();

    // 改善前の接続線を描画
    drawCurrentModeConnectionsInBoth(timeScale, leftMargin, displayItems, effectiveRowHeight);

    // 改善後の接続線を描画
    drawImprovedModeConnectionsInBoth(timeScale, leftMargin, displayItems, effectiveRowHeight);
}

/**
 * 併記モードでの改善前接続線描画
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 * @param {number} effectiveRowHeight - 行の高さ
 */
function drawCurrentModeConnectionsInBoth(timeScale, leftMargin, displayItems, effectiveRowHeight) {
    // 改善前に表示される項目のみを抽出（common + current-only）
    const currentItemsToDraw = currentWorkOrder
        .map(id => workItems.find(item => item.id === id))
        .filter(item => {
            if (!item) return false;
            const targetScope = item.targetScope || 'common';
            return targetScope === 'common' || targetScope === 'current-only';
        });


    if (currentItemsToDraw.length === 0) return;

    let currentCumulativeTime = 0;
    // displayItems は改善前順序ベースなので、これを使って描画インデックスを決定
    // ただし、currentItemsToDraw に含まれない改善後のみの項目はスキップする
    let actualDisplayRowIndex = 0;

    for (let i = 0; i < currentItemsToDraw.length; i++) {
        const item = currentItemsToDraw[i];
        const currentData = {
            manualTime: item.manualTime,
            autoTime: item.autoTime,
            walkTime: item.walkTime
        };
        // この項目が displayItems の中で何番目の「改善前に表示されるべき項目」かを見つける
        // これが実際の描画行インデックスになる
        let itemDisplayIndexInCurrentList = -1;
        let countCurrentVisible = 0;
        for(let k=0; k < displayItems.length; k++){
            const ditem = displayItems[k];
            if((ditem.targetScope || 'common') === 'common' || (ditem.targetScope || 'common') === 'current-only'){
                if(ditem.id === item.id) {
                    itemDisplayIndexInCurrentList = countCurrentVisible;
                    break;
                }
                countCurrentVisible++;
            }
        }
        if(itemDisplayIndexInCurrentList === -1) continue; // Should not happen if logic is correct

        const startY = TOP_MARGIN + (itemDisplayIndexInCurrentList * effectiveRowHeight) + effectiveRowHeight / 4; // 上半分の中央

        if (i < currentItemsToDraw.length - 1) {
            const nextItem = currentItemsToDraw[i+1];
             let nextItemDisplayIndexInCurrentList = -1;
             countCurrentVisible = 0;
             for(let k=0; k < displayItems.length; k++){
                const ditem = displayItems[k];
                if((ditem.targetScope || 'common') === 'common' || (ditem.targetScope || 'common') === 'current-only'){
                    if(ditem.id === nextItem.id) {
                        nextItemDisplayIndexInCurrentList = countCurrentVisible;
                        break;
                    }
                    countCurrentVisible++;
                }
            }
            if(nextItemDisplayIndexInCurrentList === -1) continue;

            const endY = TOP_MARGIN + (nextItemDisplayIndexInCurrentList * effectiveRowHeight) + effectiveRowHeight / 4; // 次の上半分の中央

            drawConnectionLine(
                currentCumulativeTime + currentData.manualTime,
                startY,
                endY,
                timeScale,
                leftMargin,
                currentData.walkTime,
                'current'
            );
        } else if (currentItemsToDraw.length > 1 && currentData.walkTime > 0) {
            // 最後の項目から最初の項目への循環線
            const firstItem = currentItemsToDraw[0];
             let firstItemDisplayIndexInCurrentList = -1;
             countCurrentVisible = 0;
             for(let k=0; k < displayItems.length; k++){
                const ditem = displayItems[k];
                if((ditem.targetScope || 'common') === 'common' || (ditem.targetScope || 'common') === 'current-only'){
                     if(ditem.id === firstItem.id) {
                        firstItemDisplayIndexInCurrentList = countCurrentVisible;
                        break;
                    }
                    countCurrentVisible++;
                }
            }
            if(firstItemDisplayIndexInCurrentList === -1) continue;

            const firstY = TOP_MARGIN + (firstItemDisplayIndexInCurrentList * effectiveRowHeight) + effectiveRowHeight / 4; // 最初の上半分の中央
            drawConnectionLine(
                currentCumulativeTime + currentData.manualTime,
                startY,
                firstY,
                timeScale,
                leftMargin,
                currentData.walkTime,
                'current'
            );
        }

        currentCumulativeTime += currentData.manualTime + currentData.walkTime;
    }
}


/**
 * 併記モードでの改善後接続線描画
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト（改善前順序）
 * @param {number} effectiveRowHeight - 行の高さ
 */
function drawImprovedModeConnectionsInBoth(timeScale, leftMargin, displayItems, effectiveRowHeight) {
    // 改善後の順序を取得
    const improvedOrderAll = improvedWorkOrder.map(id => workItems.find(item => item.id === id)).filter(Boolean);

    // 改善後に表示される項目のみを抽出（common + improved-only）
    const improvedItemsToDraw = improvedOrderAll.filter(item => {
        const targetScope = item.targetScope || 'common';
        return targetScope === 'common' || targetScope === 'improved-only';
    });

    if (improvedItemsToDraw.length === 0) return;

    // 改善前項目（common + current-only）の数を計算 (displayItemsから)
    const currentOnlyAndCommonCountInDisplay = displayItems.filter(item => {
        const targetScope = item.targetScope || 'common';
        return targetScope === 'common' || targetScope === 'current-only';
    }).length;

    let improvedCumulativeTime = 0;

    for (let i = 0; i < improvedItemsToDraw.length; i++) {
        const item = improvedItemsToDraw[i];
        const targetScope = item.targetScope || 'common';

        const improvedData = item.improved || {
            manualTime: item.manualTime,
            autoTime: item.autoTime,
            walkTime: item.walkTime
        };

        // この項目の表示行インデックスを決定
        let displayRowIndex = -1;
        if (targetScope === 'common') {
            // 共通項目：displayItems (改善前順序) での位置を探す
            // ただし、改善前のみの項目はスキップしてカウント
            let countCurrentVisible = 0;
            for(let k=0; k < displayItems.length; k++){
                const ditem = displayItems[k];
                if((ditem.targetScope || 'common') === 'common' || (ditem.targetScope || 'common') === 'current-only'){
                     if(ditem.id === item.id) {
                        displayRowIndex = countCurrentVisible;
                        break;
                    }
                    countCurrentVisible++;
                }
            }
        } else if (targetScope === 'improved-only') {
            // 改善後のみ項目：改善前表示項目の後に追加
            // improvedItemsToDraw内での相対インデックスを計算
            let relativeImprovedOnlyIndex = 0;
            for(let k=0; k < i; k++) { // 現在の項目(i)より前のimproved-onlyの数を数える
                if((improvedItemsToDraw[k].targetScope || 'common') === 'improved-only') {
                    relativeImprovedOnlyIndex++;
                }
            }
            displayRowIndex = currentOnlyAndCommonCountInDisplay + relativeImprovedOnlyIndex;
        }

        if (displayRowIndex === -1) continue; // 表示対象外ならスキップ

        const startY = TOP_MARGIN + (displayRowIndex * effectiveRowHeight) + effectiveRowHeight * 3 / 4; // 下半分の中央

        if (i < improvedItemsToDraw.length - 1) {
            const nextItem = improvedItemsToDraw[i + 1];
            const nextTargetScope = nextItem.targetScope || 'common';
            let nextDisplayRowIndex = -1;

            if (nextTargetScope === 'common') {
                let countCurrentVisible = 0;
                for(let k=0; k < displayItems.length; k++){
                    const ditem = displayItems[k];
                    if((ditem.targetScope || 'common') === 'common' || (ditem.targetScope || 'common') === 'current-only'){
                         if(ditem.id === nextItem.id) {
                            nextDisplayRowIndex = countCurrentVisible;
                            break;
                        }
                        countCurrentVisible++;
                    }
                }
            } else if (nextTargetScope === 'improved-only') {
                let relativeImprovedOnlyIndex = 0;
                for(let k=0; k < i + 1; k++) { // 次の項目(i+1)までで、それより前のimproved-onlyの数を数える
                    if((improvedItemsToDraw[k].targetScope || 'common') === 'improved-only') {
                         relativeImprovedOnlyIndex++;
                    }
                }
                 // 改善後のみの項目は、共通項目または改善前のみの項目の後に続くため、
                 // improvedItemsToDraw での improved-only のインデックスを計算
                 let currentImprovedOnlyCount = 0;
                 for(let k=0; k <= i; k++){ // nextItemを含むのでi+1ではなくi
                     if((improvedItemsToDraw[k].targetScope || 'common') === 'improved-only'){
                         currentImprovedOnlyCount++;
                     }
                 }
                // if (nextItem.targetScope === 'improved-only') currentImprovedOnlyCount++; // nextItem自身がimproved-onlyなら加算

                 nextDisplayRowIndex = currentOnlyAndCommonCountInDisplay + currentImprovedOnlyCount;


            }
             if (nextDisplayRowIndex === -1 && nextTargetScope === 'improved-only') { // nextItemがリストの最初に来るimproved-onlyの場合
                nextDisplayRowIndex = currentOnlyAndCommonCountInDisplay;
             }


            if (nextDisplayRowIndex !== -1) {
                const endY = TOP_MARGIN + (nextDisplayRowIndex * effectiveRowHeight) + effectiveRowHeight * 3 / 4;
                drawConnectionLine(
                    improvedCumulativeTime + improvedData.manualTime,
                    startY,
                    endY,
                    timeScale,
                    leftMargin,
                    improvedData.walkTime,
                    'improved'
                );
            }
        } else if (improvedItemsToDraw.length > 1 && improvedData.walkTime > 0) {
            // 最後の項目から最初の項目への循環線
            const firstItem = improvedItemsToDraw[0];
            const firstTargetScope = firstItem.targetScope || 'common';
            let firstDisplayRowIndex = -1;

            if (firstTargetScope === 'common') {
                 let countCurrentVisible = 0;
                 for(let k=0; k < displayItems.length; k++){
                    const ditem = displayItems[k];
                    if((ditem.targetScope || 'common') === 'common' || (ditem.targetScope || 'common') === 'current-only'){
                         if(ditem.id === firstItem.id) {
                            firstDisplayRowIndex = countCurrentVisible;
                            break;
                        }
                        countCurrentVisible++;
                    }
                }
            } else if (firstTargetScope === 'improved-only') {
                firstDisplayRowIndex = currentOnlyAndCommonCountInDisplay; // 最初のimproved-only
            }

            if (firstDisplayRowIndex !== -1) {
                const firstY = TOP_MARGIN + (firstDisplayRowIndex * effectiveRowHeight) + effectiveRowHeight * 3 / 4;
                drawConnectionLine(
                    improvedCumulativeTime + improvedData.manualTime,
                    startY,
                    firstY,
                    timeScale,
                    leftMargin,
                    improvedData.walkTime,
                    'improved'
                );
            }
        }
        improvedCumulativeTime += improvedData.manualTime + improvedData.walkTime;
    }
}


/**
 * 作業項目行描画（統一バー高さルール適用版・作業分類対応・ビジネス最適化・色統一・位置調整対応）
 * @param {object} item - 作業項目
 * @param {number} index - インデックス
 * @param {number} startTime - 開始時間
 * @param {number} y - Y座標
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {number} rowHeight - 行の高さ
 * @param {number} manualTime - 手作業時間
 * @param {number} autoTime - 自動送り時間
 * @param {number} walkTime - 歩行時間
 * @param {string} mode - 描画モード（'improved', 'current', または未指定）
 */
function drawEnhancedWorkItemRow(item, index, startTime, y, timeScale, leftMargin, rowHeight, manualTime, autoTime, walkTime, mode = null) {
    // ★★★ 統一バー高さルール適用 ★★★
    let barHeight;
    const baseRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
    if (displayMode === 'both') {
        // 併記モード時は行の高さの1/4（1本あたり）
        barHeight = baseRowHeight / 4;
    } else {
        // 単一モード時は行の高さの1/3
        barHeight = baseRowHeight / 3;
    }
    const centerY = y + (rowHeight / 2) - (barHeight / 2);

    let currentX = leftMargin + (startTime * timeScale);

    if (manualTime > 0) {
        const width = manualTime * timeScale;

        // 表示モードと描画モード、作業分類に応じて色とスタイルを設定（統一色）
        let strokeColor, lineStyle = 'solid';

        if (item.category === 'monitor') {
            // 監視作業：改善前は黒系、改善後は赤系
            if (mode === 'improved' || (displayMode === 'improved' && !mode)) {
                strokeColor = '#dc2626'; // 改善後監視：赤系（統一）
            } else {
                strokeColor = '#1f2937'; // 改善前監視：黒系（統一）
            }

            // 監視作業の特殊描画
            drawMonitorWorkLine(currentX, centerY + barHeight/2, width, strokeColor);

            // ラベル描画 - 統一されたフォント（位置調整対応）
            if (width > 25) {
                // 基準位置
                const baseX = currentX + width/2;
                const baseY = centerY + barHeight/2 - 6;
                
                // 位置調整を適用
                const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);
                
                ctx.save();
                ctx.fillStyle = strokeColor;
                ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 9) : 'bold 9px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                const timeText = formatTimeDisplay(manualTime);
                applyTextFlashStyles(ctx, 'workTimeLabels');
                ctx.fillText(`監視${timeText}`, adjustedPos.x, adjustedPos.y);
                ctx.restore();
            }

        } else if (item.category === 'hold') {
            // 保持作業：改善前は黒系、改善後は赤系
            if (mode === 'improved' || (displayMode === 'improved' && !mode)) {
                strokeColor = '#dc2626'; // 改善後保持：赤系（統一）
            } else {
                strokeColor = '#1f2937'; // 改善前保持：黒系（統一）
            }

            // 保持作業の特殊描画（上が実線、下が点線）
            drawHoldWorkLine(currentX, centerY + barHeight/2, width, strokeColor);

            // ラベル描画 - 統一されたフォント（位置調整対応）
            if (width > 25) {
                // 基準位置
                const baseX = currentX + width/2;
                const baseY = centerY + barHeight/2 - 6;
                
                // 位置調整を適用
                const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);
                
                ctx.save();
                ctx.fillStyle = strokeColor;
                ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 9) : 'bold 9px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                const timeText = formatTimeDisplay(manualTime);
                applyTextFlashStyles(ctx, 'workTimeLabels');
                ctx.fillText(`保持${timeText}`, adjustedPos.x, adjustedPos.y);
                ctx.restore();
            }

        } else if (item.category === 'wait') {
            // ★★★ 修正：手待ち作業の色を完全統一 ★★★
            if (mode === 'improved' || (displayMode === 'improved' && !mode)) {
                strokeColor = '#dc2626'; // 改善後手待ち：赤系（完全統一）
            } else {
                strokeColor = '#1f2937'; // 改善前手待ち：黒系（完全統一）
            }

            // 手待ち作業の特殊描画（修正された両矢印）
            drawWaitWorkLine(currentX, centerY + barHeight/2, width, strokeColor);

            // ラベル描画 - 統一されたフォント（位置調整対応）
            if (width > 25) {
                // 基準位置
                const baseX = currentX + width/2;
                const baseY = centerY + barHeight/2 - 6;
                
                // 位置調整を適用
                const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);
                
                ctx.save();
                ctx.fillStyle = strokeColor;
                ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 9) : 'bold 9px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                const timeText = formatTimeDisplay(manualTime);
                applyTextFlashStyles(ctx, 'workTimeLabels');
                ctx.fillText(`手待ち${timeText}`, adjustedPos.x, adjustedPos.y);
                ctx.restore();
            }

        } else {
            // 通常作業：改善前は黒系、改善後は赤系
            if (mode === 'improved' || (displayMode === 'improved' && !mode)) {
                strokeColor = '#dc2626'; // 改善後は赤系
            } else if (mode === 'current' && displayMode === 'both') {
                strokeColor = '#1f2937'; // 併記モード下半分は黒系
            } else {
                strokeColor = '#1f2937'; // 改善前は黒系
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 8;
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(currentX, centerY + barHeight/2);
            ctx.lineTo(currentX + width, centerY + barHeight/2);
            ctx.stroke();

            // 「まとめ（グループ）」の場合は、バーの下に「重なり（スタック）」を表現する線を引く
            if (item.isGroup && width > 4) {
                ctx.save();
                ctx.lineWidth = 2;
                ctx.strokeStyle = (mode === 'improved' || (displayMode === 'improved' && !mode)) ? '#fca5a5' : '#9ca3af';
                ctx.beginPath();
                ctx.moveTo(currentX + 2, centerY + barHeight/2 + 6);
                ctx.lineTo(currentX + width - 2, centerY + barHeight/2 + 6);
                ctx.stroke();
                
                ctx.strokeStyle = (mode === 'improved' || (displayMode === 'improved' && !mode)) ? '#fee2e2' : '#e2e8f0';
                ctx.beginPath();
                ctx.moveTo(currentX + 4, centerY + barHeight/2 + 8);
                ctx.lineTo(currentX + width - 4, centerY + barHeight/2 + 8);
                ctx.stroke();
                ctx.restore();
            }

            // ラベル描画 - 統一されたフォント（位置調整対応）
            if (width > 25) {
                // 基準位置
                const baseX = currentX + width/2;
                const baseY = centerY + barHeight/2 - 6;
                
                // 位置調整を適用
                const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);
                
                ctx.save();
                ctx.fillStyle = strokeColor;
                ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 9) : 'bold 9px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                const timeText = formatTimeDisplay(manualTime);
                applyTextFlashStyles(ctx, 'workTimeLabels');
                ctx.fillText(`手作業${timeText}`, adjustedPos.x, adjustedPos.y);
                ctx.restore();
            }
        }

        currentX += width;
    }

    // 自動送り時間の部分（位置調整対応）
    if (autoTime > 0) {
        const width = autoTime * timeScale;

        // 表示モードに応じて自動送り時間の色を統一
        let autoColor;
        if (mode === 'improved' || (displayMode === 'improved' && !mode)) {
            autoColor = '#dc2626'; // 改善後は赤系
        } else if (mode === 'current' && displayMode === 'both') {
            autoColor = '#1f2937'; // 併記モード下半分は黒系
        } else {
            autoColor = '#64748b'; // 改善前はグレー系
        }

        ctx.strokeStyle = autoColor;
        ctx.lineWidth = 8;
        ctx.setLineDash([5, 3]);

        ctx.beginPath();
        ctx.moveTo(currentX, centerY + barHeight/2);
        ctx.lineTo(currentX + width, centerY + barHeight/2);
        ctx.stroke();

        ctx.setLineDash([]);

        if (width > 25) {
            // 基準位置
            const baseX = currentX + width/2;
            const baseY = centerY + barHeight/2 - 6;
            
            // 位置調整を適用
            const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);
            
            ctx.save();
            ctx.fillStyle = autoColor;
            ctx.font = typeof getEffectiveFont === 'function' ? getEffectiveFont('bold', 9) : 'bold 9px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            const timeText = formatTimeDisplay(autoTime);
            applyTextFlashStyles(ctx, 'workTimeLabels');
            ctx.fillText(`自動${timeText}`, adjustedPos.x, adjustedPos.y);
            ctx.restore();
        }
    }
}

/**
 * 保持作業の線を描画（上が実線、下が点線）
 */
function drawHoldWorkLine(startX, y, width, color) {
    // 上部に細い実線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, y - 1.5);
    ctx.lineTo(startX + width, y - 1.5);
    ctx.stroke();

    // 下部に点線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(startX, y + 1.5);
    ctx.lineTo(startX + width, y + 1.5);
    ctx.stroke();

    // 破線をリセット
    ctx.setLineDash([]);
}

/**
 * 監視作業の線を描画（細い実線 + 自動送りの点線のハイブリッド）
 * @param {number} startX - 開始X座標
 * @param {number} y - Y座標
 * @param {number} width - 幅
 * @param {string} color - 色
 */
function drawMonitorWorkLine(startX, y, width, color) {
    // 上部に点線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(startX, y - 1.5);
    ctx.lineTo(startX + width, y - 1.5);
    ctx.stroke();

    // 下部に細い実線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, y + 1.5);
    ctx.lineTo(startX + width, y + 1.5);
    ctx.stroke();
}

/**
 * 手待ち作業の線を描画（隙間を開けた二重線の白抜き両矢印 ⇔）
 * @param {number} startX - 開始X座標
 * @param {number} y - Y座標
 * @param {number} width - 幅
 * @param {string} color - 色
 */
function drawWaitWorkLine(startX, y, width, color) {
    // 2px未満は描画不可（視認できる最小単位）
    if (width < 2) return;

    // 幅に応じて矢印サイズを適応スケーリング（最大7px、最小2px）
    // 両矢印なので width/4 が1つの矢印に使える上限を目安とする
    const arrowSize      = Math.max(2, Math.min(7, Math.floor(width / 4)));
    const arrowHeadHeight = Math.max(1.5, arrowSize * 4 / 7); // 元の比率（4/7）を維持
    const lineWidth      = 2;
    const lineGap        = Math.min(3, arrowHeadHeight * 0.75);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = 'white';
    ctx.lineWidth   = lineWidth;
    ctx.lineJoin    = 'round';

    // --- 左矢印の描画 ---
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + arrowSize, y - arrowHeadHeight);
    ctx.lineTo(startX + arrowSize, y + arrowHeadHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 二重水平線（両矢印の内側に空間がある場合のみ描画）---
    const lineStart = startX + arrowSize;
    const lineEnd   = startX + width - arrowSize;
    if (lineEnd > lineStart) {
        ctx.beginPath();
        ctx.moveTo(lineStart, y - lineGap / 2);
        ctx.lineTo(lineEnd,   y - lineGap / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(lineStart, y + lineGap / 2);
        ctx.lineTo(lineEnd,   y + lineGap / 2);
        ctx.stroke();
    }

    // --- 右矢印の描画 ---
    ctx.beginPath();
    ctx.moveTo(startX + width, y);
    ctx.lineTo(startX + width - arrowSize, y - arrowHeadHeight);
    ctx.lineTo(startX + width - arrowSize, y + arrowHeadHeight);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

/**
 * 作業間の接続線を描画（ビジネス最適化）
 * @param {number} startTime - 開始時間
 * @param {number} startY - 開始Y座標
 * @param {number} endY - 終了Y座標
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {number} walkTime - 歩行時間
 * @param {string} mode - 描画モード（'improved', 'current', または未指定）
 */
function drawConnectionLine(startTime, startY, endY, timeScale, leftMargin, walkTime, mode = null) {
    const startX = leftMargin + (startTime * timeScale);

    // 併記モードでは既に正しいY座標が渡されているので、そのまま使用
    let startCenterY, endCenterY;
    if (displayMode === 'both') {
        startCenterY = startY;
        endCenterY = endY;
    } else {
        startCenterY = startY + (_gRowHeight() / 2);
        endCenterY = endY + (_gRowHeight() / 2);
    }

    if (walkTime > 0) {
        drawWalkingLine(startX, startCenterY, startX + (walkTime * timeScale), endCenterY, walkTime, mode);
    } else {
        // 作業間連結線
        let strokeColor;
        if (mode === 'improved') {
            strokeColor = '#dc2626'; // 改善後は赤系
        } else if (mode === 'current' && displayMode === 'both') {
            strokeColor = '#1f2937'; // 併記モード下半分は黒系
        } else if (displayMode === 'improved') {
            strokeColor = '#dc2626'; // 改善後表示の場合は赤系
        } else {
            strokeColor = '#1f2937'; // 改善前は黒系に統一
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startCenterY);
        ctx.lineTo(startX, endCenterY);
        ctx.stroke();
    }
}

/**
 * 歩行線を滑らかな波線で描画（ビジネス最適化・位置調整対応）
 * @param {number} startX - 開始X座標
 * @param {number} startY - 開始Y座標
 * @param {number} endX - 終了X座標
 * @param {number} endY - 終了Y座標
 * @param {number} walkTime - 歩行時間
 * @param {string} mode - 描画モード（'improved', 'current', または未指定）
 */
function drawWalkingLine(startX, startY, endX, endY, walkTime, mode = null) {
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const segments = Math.max(16, Math.floor(distance / 3));

    // 表示モードと描画モードに応じて色を設定
    let strokeColor, fillColor;
    if (mode === 'improved' || (displayMode === 'improved' && !mode)) {
        strokeColor = '#dc2626'; // 改善後は赤系
        fillColor = '#b91c1c';
    } else if (mode === 'current' && displayMode === 'both') {
        strokeColor = '#1f2937'; // 併記モード下半分は黒系
        fillColor = '#1f2937';
    } else {
        strokeColor = '#1f2937'; // 改善前は黒系に統一
        fillColor = '#1f2937';
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t;

        const amplitude = 2.5;
        const frequency = 6;
        const offset = Math.sin(t * Math.PI * frequency) * amplitude;

        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const normalX = -dy / length;
        const normalY = dx / length;

        ctx.lineTo(x + normalX * offset, y + normalY * offset);
    }

    ctx.stroke();

    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    // 基準位置
    const baseX = midX;
    const baseY = midY + 2;
    
    // 位置調整を適用
    const adjustedPos = applyTextPositionAdjustment('workTimeLabels', baseX, baseY);

    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const timeText = formatTimeDisplay(walkTime);
    applyTextFlashStyles(ctx, 'workTimeLabels');
    ctx.fillText(`歩行${timeText}`, adjustedPos.x, adjustedPos.y);
    ctx.restore();
}

function drawTimeStatus(totalTime, timeScale, topMargin, leftMargin, rowHeight, displayItems) {
    if (displayItems.length === 0) return;

    // まとめづくりモード時はN×T/Tを有効タクトタイムとして使用
    const isBatch        = (typeof batchMode !== 'undefined') && batchMode && (typeof batchQuantity !== 'undefined') && batchQuantity > 1;
    const rawTaktTime    = isBatch ? taktTime * batchQuantity : taktTime;
    const roundedTaktTime = Math.round(rawTaktTime);
    const taktTimeX      = leftMargin + (rawTaktTime * timeScale); // 線の位置は丸めない値で計算

    // ── マルチサイクル表示判定 ──────────────────────────────────────
    const isDual = cycleCount >= 2;
    const maxCycles = cycleCount;

    if (displayMode === 'both') {
        let currentTotal = 0;
        currentWorkOrder.forEach(id => {
            const item = workItems.find(i => i.id === id);
            if (item && (item.targetScope || 'common') !== 'improved-only') {
                currentTotal += item.manualTime + item.walkTime;
            }
        });

        let improvedTotal = 0;
        improvedWorkOrder.forEach(id => {
            const item = workItems.find(i => i.id === id);
            if (item && (item.targetScope || 'common') !== 'current-only') {
                const improvedData = item.improved || { manualTime: item.manualTime, walkTime: item.walkTime };
                improvedTotal += improvedData.manualTime + improvedData.walkTime;
            }
        });

        const currentRowY  = topMargin + (rowHeight / 4);
        const improvedRowY = topMargin + (rowHeight * 3 / 4);

        for (let cycle = 0; cycle < maxCycles; cycle++) {
            const multiplier         = cycle + 1;
            const cycleTaktTimeX     = leftMargin + (rawTaktTime    * multiplier * timeScale);
            const cycleCurrentTotalX = leftMargin + (currentTotal   * multiplier * timeScale);
            const cycleImprovedTotalX= leftMargin + (improvedTotal  * multiplier * timeScale);
            const roundedCurrTotal   = Math.round(currentTotal  * multiplier);
            const roundedImpTotal    = Math.round(improvedTotal * multiplier);
            const roundedCycleTakt   = Math.round(rawTaktTime   * multiplier);

            if (roundedCurrTotal < roundedCycleTakt) {
                const waitTime = roundedCycleTakt - roundedCurrTotal;
                drawWaitArrow(cycleTaktTimeX, cycleCurrentTotalX, currentRowY, '#1f2937', '手待ち', 'left', waitTime);
            } else if (roundedCurrTotal > roundedCycleTakt) {
                const overTime = roundedCurrTotal - roundedCycleTakt;
                drawWaitArrow(cycleTaktTimeX, cycleCurrentTotalX, currentRowY, '#1f2937', 'オーバー', 'right', overTime);
            }

            if (roundedImpTotal < roundedCycleTakt) {
                const waitTime = roundedCycleTakt - roundedImpTotal;
                drawWaitArrow(cycleTaktTimeX, cycleImprovedTotalX, improvedRowY, '#dc2626', '手待ち', 'left', waitTime);
            } else if (roundedImpTotal > roundedCycleTakt) {
                const overTime = roundedImpTotal - roundedCycleTakt;
                drawWaitArrow(cycleTaktTimeX, cycleImprovedTotalX, improvedRowY, '#dc2626', 'オーバー', 'right', overTime);
            }
        }

    } else {
        // 通常モード
        const roundedTotalTime = Math.round(totalTime);
        const color = (displayMode === 'improved') ? '#dc2626' : '#1f2937';
        const firstRowY = topMargin + (rowHeight / 2);

        for (let cycle = 0; cycle < maxCycles; cycle++) {
            const multiplier       = cycle + 1;
            const cycleTaktTimeX   = leftMargin + (rawTaktTime * multiplier * timeScale);
            const cycleTotalTimeX  = leftMargin + (totalTime   * multiplier * timeScale);
            const roundedCycleTime = Math.round(totalTime   * multiplier);
            const roundedCycleTakt = Math.round(rawTaktTime  * multiplier);

            if (roundedCycleTime < roundedCycleTakt) {
                const waitTime = roundedCycleTakt - roundedCycleTime;
                drawWaitArrow(cycleTaktTimeX, cycleTotalTimeX, firstRowY, color, '手待ち', 'left', waitTime);
            } else if (roundedCycleTime > roundedCycleTakt) {
                const overTime = roundedCycleTime - roundedCycleTakt;
                drawWaitArrow(cycleTaktTimeX, cycleTotalTimeX, firstRowY, color, 'オーバー', 'right', overTime);
            }
        }
    }
}

/**
 * 手待ち矢印描画（隙間を開けた二重線の白抜き片側矢印バージョン ← または →）
 * @param {number} taktTimeX - タクトタイムのX座標（矢印の基準点）
 * @param {number} cycleTimeX - サイクルタイムのX座標（矢印の終点）
 * @param {number} y - Y座標
 * @param {string} color - 色
 * @param {string} label - ラベル
 * @param {string} direction - 矢印の向き（'left' または 'right'）
 * @param {number} timeToDisplay - 表示する時間（秒）
 */
function drawWaitArrow(taktTimeX, cycleTimeX, y, color, label, direction, timeToDisplay) {
    const startX = Math.min(taktTimeX, cycleTimeX);
    const endX   = Math.max(taktTimeX, cycleTimeX);
    const width  = endX - startX;

    // 2px未満は描画不可（視認できる最小単位）
    if (width < 2) return;

    // 幅に応じて矢印サイズを適応スケーリング（最大8px、最小2px）
    // 片側矢印なので width/3 が矢印に使える上限を目安とする
    const arrowSize       = Math.max(2, Math.min(8, Math.floor(width / 3)));
    const arrowHeadHeight = Math.max(1.5, arrowSize * 0.5);
    const lineWidth       = 1.5;
    const lineGap         = Math.min(3, arrowHeadHeight * 0.75);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = 'white';
    ctx.lineWidth   = lineWidth;
    ctx.lineJoin    = 'round';

    const isLeftArrow = direction === 'left';

    if (isLeftArrow) {
        // --- 左向き矢印（手待ち）: ← ---
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + arrowSize, y - arrowHeadHeight);
        ctx.lineTo(startX + arrowSize, y + arrowHeadHeight);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 水平二重線（矢印の後ろに空間がある場合のみ）
        if (endX > startX + arrowSize) {
            ctx.beginPath();
            ctx.moveTo(startX + arrowSize, y - lineGap / 2);
            ctx.lineTo(endX, y - lineGap / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(startX + arrowSize, y + lineGap / 2);
            ctx.lineTo(endX, y + lineGap / 2);
            ctx.stroke();

            // 右端の縦線（終端を明確にする）
            ctx.beginPath();
            ctx.moveTo(endX, y - lineGap / 2);
            ctx.lineTo(endX, y + lineGap / 2);
            ctx.stroke();
        }
    } else {
        // --- 右向き矢印（オーバー）: → ---
        ctx.beginPath();
        ctx.moveTo(endX, y);
        ctx.lineTo(endX - arrowSize, y - arrowHeadHeight);
        ctx.lineTo(endX - arrowSize, y + arrowHeadHeight);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 水平二重線（矢印の後ろに空間がある場合のみ）
        if (endX - arrowSize > startX) {
            ctx.beginPath();
            ctx.moveTo(startX, y - lineGap / 2);
            ctx.lineTo(endX - arrowSize, y - lineGap / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(startX, y + lineGap / 2);
            ctx.lineTo(endX - arrowSize, y + lineGap / 2);
            ctx.stroke();

            // 左端の縦線（始端を明確にする）
            ctx.beginPath();
            ctx.moveTo(startX, y - lineGap / 2);
            ctx.lineTo(startX, y + lineGap / 2);
            ctx.stroke();
        }
    }

    ctx.restore();

    // ラベル・時間表示（幅が20px以上の場合のみ表示して視認性を確保）
    if (width >= 20) {
        ctx.fillStyle   = color;
        ctx.textAlign   = 'center';
        const labelX = (startX + endX) / 2;

        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.fillText(label, labelX, y - 10);

        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.fillText(`${formatTimeDisplay(timeToDisplay)}`, labelX, y + 16);
    }
}

/**
 * 作業配分表を描画（併記分離モードとエラーバー修正版）
 */
function drawDistributionChart(selectedData) {
    // CSS変数の色をJavaScriptで取得
    const errorBarPersonColor = getComputedStyle(document.documentElement).getPropertyValue('--error-bar-person-color').trim();
    const errorBarWorkColor = getComputedStyle(document.documentElement).getPropertyValue('--error-bar-work-color').trim();

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = distributionCanvas.width / devicePixelRatio;
    const canvasDisplayHeight = distributionCanvas.height / devicePixelRatio;
    
    const leftMargin = 80;
    const rightMargin = 40;
    const topMargin = 100;
    const bottomMargin = 80;

    const availableWidth = canvasDisplayWidth - leftMargin - rightMargin;
    const availableHeight = canvasDisplayHeight - topMargin - bottomMargin;
    const dataCount = selectedData.length;

    if (dataCount === 0) {
        drawEmptyDistributionChart();
        return;
    }

    distributionCtx.clearRect(0, 0, distributionCanvas.width, distributionCanvas.height);
    distributionCtx.fillStyle = '#ffffff';
    distributionCtx.fillRect(0, 0, distributionCanvas.width, distributionCanvas.height);

    const chartData = selectedData.map(data => ({
        name: data.name,
        totalTimeCurrent: calculateDataTotalWorkTime(data.data, 'current'),
        totalTimeImproved: calculateDataTotalWorkTime(data.data, 'improved'),
        taktTime: data.data.taktTime || 36,
        workItems: data.data.workItems || [],
        distributionVariability: data.data.distributionVariability || {}
    }));
    
    const minTaktTime = Math.min(...chartData.map(d => d.taktTime));
    const maxTime = Math.max(
        ...chartData.flatMap(d => {
            const variability = d.distributionVariability || {};
            // エラーバーの上限も含めてY軸の最大値を計算
            const currentMax = d.totalTimeCurrent + (variability.currentMax || 0);
            const improvedMax = d.totalTimeImproved + (variability.improvedMax || 0);
            return [currentMax, improvedMax];
        }),
        minTaktTime
    );
    const chartHeight = availableHeight;
    const timeScale = chartHeight / (maxTime * 1.1);

    drawDistributionLegendTop();
    drawDistributionGrid(leftMargin, topMargin, chartHeight, maxTime, timeScale, minTaktTime);

    const barWidthSetting = typeof distBarWidth !== 'undefined' ? distBarWidth : 100;
    const groupSpacingSetting = typeof distGroupSpacing !== 'undefined' ? distGroupSpacing : 40;

    if (distributionDisplayMode === 'both-grouped') {
        const innerSpacing = 10; // 改善前・後の棒の隙間
        const groupWidth = barWidthSetting * 2 + innerSpacing;
        
        chartData.forEach((data, index) => {
            const groupX = leftMargin + groupSpacingSetting + index * (groupWidth + groupSpacingSetting);
            
            const xCurrent = groupX;
            drawStackedBar(xCurrent, topMargin, barWidthSetting, data, timeScale, chartHeight, 'current');
            
            const xImproved = groupX + barWidthSetting + innerSpacing;
            drawStackedBar(xImproved, topMargin, barWidthSetting, data, timeScale, chartHeight, 'improved');

            if (distributionErrorBarMode === 'person') {
                const variability = data.distributionVariability || {};

                // 改善前
                const currentMin = variability.currentMin || 0;
                const currentMax = variability.currentMax || 0;
                if (currentMin > 0 || currentMax > 0) {
                    const errorBarTopY = topMargin + chartHeight - ((data.totalTimeCurrent + currentMax) * timeScale);
                    const errorBarBottomY = topMargin + chartHeight - ((data.totalTimeCurrent - currentMin) * timeScale);
                    drawErrorBar(distributionCtx, xCurrent, barWidthSetting, errorBarTopY, errorBarBottomY, errorBarPersonColor);
                }

                // 改善後
                const improvedMin = variability.improvedMin || 0;
                const improvedMax = variability.improvedMax || 0;
                if (improvedMin > 0 || improvedMax > 0) {
                    const errorBarTopY = topMargin + chartHeight - ((data.totalTimeImproved + improvedMax) * timeScale);
                    const errorBarBottomY = topMargin + chartHeight - ((data.totalTimeImproved - improvedMin) * timeScale);
                    drawErrorBar(distributionCtx, xImproved, barWidthSetting, errorBarTopY, errorBarBottomY, errorBarWorkColor);
                }
            }

            const labelX = groupX + groupWidth / 2;
            drawDistributionXAxisLabel(labelX, topMargin + chartHeight, data.name, data.totalTimeCurrent, data.totalTimeImproved, timeScale, groupX, barWidthSetting);
        });

    } else if (distributionDisplayMode === 'both-separated') {
        const sectionWidth = dataCount * barWidthSetting + (dataCount + 1) * groupSpacingSetting;
        const sectionPadding = 40;
        
        // 改善前セクション
        chartData.forEach((data, index) => {
            const xCurrent = leftMargin + groupSpacingSetting + index * (barWidthSetting + groupSpacingSetting);
            drawStackedBar(xCurrent, topMargin, barWidthSetting, data, timeScale, chartHeight, 'current');
            if (distributionErrorBarMode === 'person') {
                const variability = data.distributionVariability || {};
                const currentMin = variability.currentMin || 0;
                const currentMax = variability.currentMax || 0;
                if (currentMin > 0 || currentMax > 0) {
                    const errorBarTopY = topMargin + chartHeight - ((data.totalTimeCurrent + currentMax) * timeScale);
                    const errorBarBottomY = topMargin + chartHeight - ((data.totalTimeCurrent - currentMin) * timeScale);
                    drawErrorBar(distributionCtx, xCurrent, barWidthSetting, errorBarTopY, errorBarBottomY, errorBarPersonColor);
                }
            }
            drawDistributionXAxisLabel(xCurrent + barWidthSetting / 2, topMargin + chartHeight, data.name, data.totalTimeCurrent, data.totalTimeImproved, timeScale, null, null, 'current');
        });
        
        // 改善後セクション
        const improvedStartX = leftMargin + sectionWidth + sectionPadding;

        chartData.forEach((data, index) => {
            const xImproved = improvedStartX + groupSpacingSetting + index * (barWidthSetting + groupSpacingSetting);
            drawStackedBar(xImproved, topMargin, barWidthSetting, data, timeScale, chartHeight, 'improved');
            if (distributionErrorBarMode === 'person') {
                 const variability = data.distributionVariability || {};
                 const improvedMin = variability.improvedMin || 0;
                 const improvedMax = variability.improvedMax || 0;
                 if (improvedMin > 0 || improvedMax > 0) {
                    const errorBarTopY = topMargin + chartHeight - ((data.totalTimeImproved + improvedMax) * timeScale);
                    const errorBarBottomY = topMargin + chartHeight - ((data.totalTimeImproved - improvedMin) * timeScale);
                    drawErrorBar(distributionCtx, xImproved, barWidthSetting, errorBarTopY, errorBarBottomY, errorBarWorkColor);
                 }
            }
            drawDistributionXAxisLabel(xImproved + barWidthSetting / 2, topMargin + chartHeight, data.name, data.totalTimeCurrent, data.totalTimeImproved, timeScale, null, null, 'improved');
        });
        
        // セクション区切り線
        const sectionDividerX = leftMargin + sectionWidth + sectionPadding / 2;
        distributionCtx.strokeStyle = '#e2e8f0';
        distributionCtx.lineWidth = 2;
        distributionCtx.setLineDash([5, 5]);
        distributionCtx.beginPath();
        distributionCtx.moveTo(sectionDividerX, topMargin);
        distributionCtx.lineTo(sectionDividerX, topMargin + chartHeight);
        distributionCtx.stroke();
        distributionCtx.setLineDash([]);
        
        // セクションヘッダー
        distributionCtx.fillStyle = '#374151';
        distributionCtx.font = 'bold 14px "Segoe UI", sans-serif';
        distributionCtx.textAlign = 'center';
        distributionCtx.fillText('改善前', leftMargin + sectionWidth / 2, topMargin - 15);
        distributionCtx.fillText('改善後', improvedStartX + sectionWidth / 2, topMargin - 15);
    } else { // 'current', 'improved' モード
        chartData.forEach((data, index) => {
            const x = leftMargin + groupSpacingSetting + index * (barWidthSetting + groupSpacingSetting);
            
            drawStackedBar(x, topMargin, barWidthSetting, data, timeScale, chartHeight, distributionDisplayMode);
            
            if (distributionErrorBarMode === 'person') {
                const variability = data.distributionVariability || {};
                
                if (distributionDisplayMode === 'current') {
                    const currentMin = variability.currentMin || 0;
                    const currentMax = variability.currentMax || 0;
                    if (currentMin > 0 || currentMax > 0) {
                        const errorBarTopY = topMargin + chartHeight - ((data.totalTimeCurrent + currentMax) * timeScale);
                        const errorBarBottomY = topMargin + chartHeight - ((data.totalTimeCurrent - currentMin) * timeScale);
                        drawErrorBar(distributionCtx, x, barWidthSetting, errorBarTopY, errorBarBottomY, errorBarPersonColor);
                    }
                } else if (distributionDisplayMode === 'improved') {
                     const improvedMin = variability.improvedMin || 0;
                     const improvedMax = variability.improvedMax || 0;
                     if (improvedMin > 0 || improvedMax > 0) {
                        const errorBarTopY = topMargin + chartHeight - ((data.totalTimeImproved + improvedMax) * timeScale);
                        const errorBarBottomY = topMargin + chartHeight - ((data.totalTimeImproved - improvedMin) * timeScale);
                        drawErrorBar(distributionCtx, x, barWidthSetting, errorBarTopY, errorBarBottomY, errorBarWorkColor);
                     }
                }
            }
            
            drawDistributionXAxisLabel(x + barWidthSetting / 2, topMargin + chartHeight, data.name, data.totalTimeCurrent, data.totalTimeImproved, timeScale);
        });
    }

    const chartEndX = distributionCanvas.width / (window.devicePixelRatio || 1) - rightMargin;
    drawDistributionTaktLine(leftMargin, chartEndX, topMargin, minTaktTime, timeScale, chartHeight);
}

/**
 * 作業配分表のグリッドを描画（拡張版）
 */
function drawDistributionGrid(leftMargin, topMargin, chartHeight, maxTime, timeScale, taktTimeValue = 0) {
    const gridSteps = 10;
    const stepValue = Math.ceil(maxTime / gridSteps / 10) * 10;

    // T/Tラベルが占める縦位置。目盛ラベルがここに重なると判読できなくなるため、
    // 近すぎる目盛ラベルは省略する（グリッド線自体は残す）。
    // T/Tラベルは "T/T"(y-3) と時間値(y+9) の2行構成。
    const taktY = taktTimeValue > 0
        ? topMargin + chartHeight - (taktTimeValue * timeScale)
        : null;
    const TAKT_LABEL_CLEARANCE = 14;

    distributionCtx.strokeStyle = '#e2e8f0';
    distributionCtx.lineWidth = 1;
    distributionCtx.font = '11px "Segoe UI", sans-serif';
    distributionCtx.fillStyle = '#64748b';
    distributionCtx.textAlign = 'right';

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasDisplayWidth = distributionCanvas.width / devicePixelRatio;

    // 横線とY軸ラベル
    for (let i = 0; i <= gridSteps; i++) {
        const timeValue = i * stepValue;
        if (timeValue > maxTime * 1.1) break;

        const y = topMargin + chartHeight - (timeValue * timeScale);

        // グリッド線
        distributionCtx.beginPath();
        distributionCtx.moveTo(leftMargin, y);
        distributionCtx.lineTo(canvasDisplayWidth - 40, y);
        distributionCtx.stroke();

        // ラベル（T/Tラベルと重なる位置のものは省く）
        const collidesWithTakt = taktY !== null && Math.abs(y - taktY) < TAKT_LABEL_CLEARANCE;
        if (!collidesWithTakt) {
            distributionCtx.fillText(formatTimeDisplay(timeValue), leftMargin - 10, y + 4);
        }
    }

    // Y軸
    distributionCtx.strokeStyle = '#374151';
    distributionCtx.lineWidth = 2;
    distributionCtx.beginPath();
    distributionCtx.moveTo(leftMargin, topMargin);
    distributionCtx.lineTo(leftMargin, topMargin + chartHeight);
    distributionCtx.stroke();

    // Y軸ラベル
    distributionCtx.save();
    distributionCtx.translate(30, topMargin + chartHeight / 2);
    distributionCtx.rotate(-Math.PI / 2);
    distributionCtx.fillStyle = '#374151';
    distributionCtx.font = 'bold 14px "Segoe UI", sans-serif';
    distributionCtx.textAlign = 'center';
    distributionCtx.fillText('作業時間', 0, 0);
    distributionCtx.restore();
}

/**
 * タクトタイムラインを描画（Y軸左側にT/Tラベル配置版）
 * ・ラベルをグラフ中央に置くと棒グラフと重なるため、
 *   Y軸ラベル側（leftMargin左）に "T/T" + 時間値を縦配置する。
 */
function drawDistributionTaktLine(leftMargin, rightX, topMargin, taktTime, timeScale, chartHeight) {
    const y = topMargin + chartHeight - (taktTime * timeScale);

    // タクトタイムライン
    distributionCtx.strokeStyle = '#dc2626';
    distributionCtx.lineWidth = 3;
    distributionCtx.setLineDash([8, 4]);
    distributionCtx.beginPath();
    distributionCtx.moveTo(leftMargin, y);
    distributionCtx.lineTo(rightX, y);
    distributionCtx.stroke();
    distributionCtx.setLineDash([]);

    // ─── ラベルをY軸ラベル列（leftMargin左側）に配置 ───
    // Y軸の数値ラベルは leftMargin-10 / textAlign='right' で描かれているため、
    // T/T ラベルも同じ右端座標に揃え、時間値は1行下に小さく表示する。
    const labelX = leftMargin - 8;

    distributionCtx.save();
    distributionCtx.fillStyle = '#dc2626';
    distributionCtx.textAlign = 'right';

    // 1行目: "T/T"（太字・小さめ）
    distributionCtx.font = 'bold 10px "Segoe UI", sans-serif';
    distributionCtx.fillText('T/T', labelX, y - 3);

    // 2行目: 時間値（細字・さらに小さめ）
    distributionCtx.font = '9px "Segoe UI", sans-serif';
    distributionCtx.fillText(formatTimeDisplay(Math.round(taktTime)), labelX, y + 9);

    distributionCtx.restore();
}

/**
 * 上部凡例を描画（モード条件付き・柔らかい色版・併記分離モード対応）
 */
function drawDistributionLegendTop() {
    // 併記モード（グループ・分離）の場合は凡例を表示しない
    if (distributionDisplayMode === 'both-grouped' || distributionDisplayMode === 'both-separated') {
        return;
    }

    // 改善前・改善後モードの場合のみ凡例を表示
    const legendX = 100;
    const legendY = 30;
    const itemWidth = 120;
    const itemHeight = 25;

    // 柔らかい色系の凡例項目
    const legendItems = [
        { color: '#93c5fd', label: '通常作業' },    // 柔らかい青系
        { color: '#86efac', label: '監視作業' },    // 柔らかい緑系
        { color: '#c4b5fd', label: '保持作業' },    // 柔らかい紫系
        { color: '#fdba74', label: '手待ち作業' }   // 柔らかいオレンジ系
    ];

    // 凡例背景
    const legendWidth = legendItems.length * itemWidth + 40;
    const legendHeight = 50;
    distributionCtx.fillStyle = '#f8fafc';
    distributionCtx.strokeStyle = '#e2e8f0';
    distributionCtx.lineWidth = 1;
    distributionCtx.fillRect(legendX - 20, legendY - 10, legendWidth, legendHeight);
    distributionCtx.strokeRect(legendX - 20, legendY - 10, legendWidth, legendHeight);

    // 凡例タイトル
    distributionCtx.fillStyle = '#1f2937';
    distributionCtx.font = 'bold 14px "Segoe UI", sans-serif';
    distributionCtx.textAlign = 'left';
    distributionCtx.fillText('作業分類', legendX - 10, legendY + 5);

    // 凡例項目
    distributionCtx.font = '12px "Segoe UI", sans-serif';
    legendItems.forEach((item, index) => {
        const x = legendX + index * itemWidth;
        const y = legendY + 20;

        // 色サンプル
        distributionCtx.fillStyle = item.color;
        distributionCtx.fillRect(x, y, 18, 12);
        distributionCtx.strokeStyle = '#ffffff';
        distributionCtx.lineWidth = 1;
        distributionCtx.strokeRect(x, y, 18, 12);

        // ラベル
        distributionCtx.fillStyle = '#374151';
        distributionCtx.fillText(item.label, x + 25, y + 9);
    });
}

/**
 * 積み上げ棒グラフを描画（モード指定対応版・条件付き色分け版・併記分離モード対応）
 * @param {string} mode - 'current' or 'improved'
 */
function drawStackedBar(x, topMargin, barWidth, data, timeScale, chartHeight, mode) {
    let currentY = topMargin + chartHeight;
    let totalTimeBeforeThisItem = 0;

    data.workItems.forEach((item, itemIndex) => {
        let manualTime, walkTime;

        if (mode === 'improved' && item.improved) {
            manualTime = item.improved.manualTime || 0;
            walkTime = item.improved.walkTime || 0;
        } else {
            manualTime = item.manualTime || 0;
            walkTime = item.walkTime || 0;
        }

        const workTime = manualTime + walkTime;
        const barHeight = workTime * timeScale;

        if (barHeight > 0) {
            currentY -= barHeight;

            let fillColor;
            
            // 併記モード（グループ・分離）かどうかで色分けを変更
            if (distributionDisplayMode === 'both-grouped' || distributionDisplayMode === 'both-separated') {
                // 併記モード：改善前は黒系、改善後は赤系に統一
                const isImproved = (mode === 'improved');
                
                if (isImproved) {
                    // 改善後：赤系統一（作業分類による濃淡の違い）
                    switch (item.category) {
                        case 'monitor':
                            fillColor = '#ef4444'; // 明るい赤（監視作業）
                            break;
                        case 'hold':
                            fillColor = '#dc2626'; // 中間の赤（保持作業）
                            break;
                        case 'wait':
                            fillColor = '#b91c1c'; // 暗い赤（手待ち作業）
                            break;
                        case 'normal':
                        default:
                            fillColor = '#f87171'; // 最も明るい赤（通常作業）
                            break;
                    }
                } else {
                    // 改善前：黒系統一（作業分類による濃淡の違い）
                    switch (item.category) {
                        case 'monitor':
                            fillColor = '#4b5563'; // 中間のグレー（監視作業）
                            break;
                        case 'hold':
                            fillColor = '#374151'; // 暗いグレー（保持作業）
                            break;
                        case 'wait':
                            fillColor = '#1f2937'; // 最も暗いグレー（手待ち作業）
                            break;
                        case 'normal':
                        default:
                            fillColor = '#6b7280'; // 明るいグレー（通常作業）
                            break;
                    }
                }
            } else {
                // 改善前・改善後モード：柔らかい色の作業分類別色分け
                switch (item.category) {
                    case 'monitor':
                        fillColor = '#86efac'; // 柔らかい緑系（監視作業）
                        break;
                    case 'hold':
                        fillColor = '#c4b5fd'; // 柔らかい紫系（保持作業）
                        break;
                    case 'wait':
                        fillColor = '#fdba74'; // 柔らかいオレンジ系（手待ち作業）
                        break;
                    case 'normal':
                    default:
                        fillColor = '#93c5fd'; // 柔らかい青系（通常作業）
                        break;
                }
            }

            distributionCtx.fillStyle = fillColor;
            distributionCtx.fillRect(x, currentY, barWidth, barHeight);

            distributionCtx.strokeStyle = '#ffffff';
            distributionCtx.lineWidth = 2;
            distributionCtx.strokeRect(x, currentY, barWidth, barHeight);

            // 作業項目名表示（背景色削除版）
            if (showDistributionItemLabels && barHeight > 20) {
                distributionCtx.font = 'bold 10px "Segoe UI", sans-serif';
                distributionCtx.textAlign = 'center';
                
                const maxChars = Math.floor(barWidth / 6);
                let itemName = item.name;
                if (itemName.length > maxChars) {
                    itemName = itemName.substring(0, maxChars - 2) + '..';
                }
                
                // 背景色を削除し、テキスト色を背景に応じて設定
                // 柔らかい色の場合は黒文字、濃い色の場合は白文字
                let textColor = '#000000'; // デフォルトは黒文字
                
                if (distributionDisplayMode === 'both-grouped' || distributionDisplayMode === 'both-separated') {
                    // 併記モードでは白文字（濃い色のため）
                    textColor = '#ffffff';
                } else {
                    // 改善前・改善後モードでは黒文字（柔らかい色のため）
                    textColor = '#000000';
                }
                
                distributionCtx.fillStyle = textColor;
                
                // テキストの視認性向上のため、薄い縁取りを追加
                if (distributionDisplayMode === 'both-grouped' || distributionDisplayMode === 'both-separated') {
                    distributionCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                } else {
                    distributionCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                }
                distributionCtx.lineWidth = 3;
                distributionCtx.strokeText(itemName, x + barWidth / 2, currentY + barHeight / 2 + 3);
                
                // メインテキストを描画
                distributionCtx.fillText(itemName, x + barWidth / 2, currentY + barHeight / 2 + 3);
            }

            item._renderInfo = {
                x: x, y: currentY, width: barWidth, height: barHeight,
                dataName: data.name, itemName: item.name, workTime: workTime,
                category: item.category || 'normal', manualTime: manualTime, walkTime: walkTime,
                displayMode: mode
            };
        }

        totalTimeBeforeThisItem += workTime;

    });

    // ─────────────────────────────────────────────────────────────
    // エラーバー描画（ループ外・棒グラフ全体の上端を基準に一度だけ描画）
    // ・barTopY = 棒グラフの頂点 Y 座標（合計時間からスケール換算）
    // ・上方向 (上限): barTopY - maxOffset  → Yが小さい = 上
    // ・下方向 (下限): barTopY + minOffset  → Yが大きい = 下
    // ─────────────────────────────────────────────────────────────
    if (distributionErrorBarMode !== 'none') {
        const variabilityData = data.distributionVariability || {};
        const totalTime = (mode === 'current') ? data.totalTimeCurrent : data.totalTimeImproved;
        const barTopY = topMargin + chartHeight - (totalTime * timeScale);

        // 人のバラつき
        if (distributionErrorBarMode === 'person' || distributionErrorBarMode === 'both') {
            const personMinSec = variabilityData.personMin || 0;
            const personMaxSec = variabilityData.personMax || 0;
            if (personMinSec > 0 || personMaxSec > 0) {
                const topY    = barTopY - (personMaxSec * timeScale); // 上限（上方向）
                const bottomY = barTopY + (personMinSec * timeScale); // 下限（下方向）
                const xOffset = distributionErrorBarMode === 'both' ? -barWidth * 0.15 : 0;
                drawErrorBar(distributionCtx, x, barWidth, topY, bottomY, 'rgba(74, 222, 128, 0.9)', xOffset);
            }
        }

        // 作業のバラつき
        if (distributionErrorBarMode === 'work' || distributionErrorBarMode === 'both') {
            const workMinSec = variabilityData.workMin || 0;
            const workMaxSec = variabilityData.workMax || 0;
            if (workMinSec > 0 || workMaxSec > 0) {
                const topY    = barTopY - (workMaxSec * timeScale);
                const bottomY = barTopY + (workMinSec * timeScale);
                const xOffset = distributionErrorBarMode === 'both' ? barWidth * 0.15 : 0;
                drawErrorBar(distributionCtx, x, barWidth, topY, bottomY, 'rgba(251, 146, 60, 0.9)', xOffset);
            }
        }
    }
}

/**
 * X軸ラベルを描画（時間値は棒グラフ上端の真上に、データ名はX軸下に配置）
 * @param {number} x              - 棒グラフ中央X（名前ラベルの位置）
 * @param {number} y              - X軸Y座標（= topMargin + chartHeight）
 * @param {string} dataName       - データ名
 * @param {number} totalTimeCurrent   - 改善前合計時間
 * @param {number} totalTimeImproved  - 改善後合計時間
 * @param {number} timeScale      - 時間→ピクセル変換スケール
 * @param {number|null} groupX    - both-groupedモード時の棒グラフ左端X
 * @param {number|null} barWidth  - both-groupedモード時の各棒幅
 * @param {string|null} displayOnlyMode - both-separatedモード時の表示対象 ('current'|'improved')
 */
function drawDistributionXAxisLabel(x, y, dataName, totalTimeCurrent, totalTimeImproved, timeScale, groupX = null, barWidth = null, displayOnlyMode = null) {

    // ── ヘルパー: 棒グラフ上端Y座標 ──
    const barTopY = (time) => y - (time * timeScale);

    // ── 時間ラベル描画（棒グラフ上端の真上）──
    // bTop - 16: フォントのベースラインを考慮し、棒グラフ上端から十分な余白を確保
    const drawTimeAboveBar = (centerX, time, color) => {
        const bTop = barTopY(time);
        distributionCtx.save();
        distributionCtx.fillStyle = color;
        distributionCtx.font = 'bold 11px "Segoe UI", sans-serif';
        distributionCtx.textAlign = 'center';
        distributionCtx.fillText(formatTimeDisplay(time), centerX, bTop - 16);
        distributionCtx.restore();
    };

    // ── データ名（X軸下）──
    distributionCtx.fillStyle = '#374151';
    distributionCtx.font = 'bold 11px "Segoe UI", sans-serif';
    distributionCtx.textAlign = 'center';
    distributionCtx.fillText(dataName, x, y + 16);

    if (distributionDisplayMode === 'both-grouped') {
        if (groupX !== null && barWidth !== null) {
            const innerSpacing = 10;
            const currentBarCenterX  = groupX + barWidth / 2;
            const improvedBarCenterX = groupX + barWidth + innerSpacing + barWidth / 2;
            drawTimeAboveBar(currentBarCenterX,  totalTimeCurrent,  '#1f2937');
            drawTimeAboveBar(improvedBarCenterX, totalTimeImproved, '#dc2626');
        } else {
            drawTimeAboveBar(x - 20, totalTimeCurrent,  '#1f2937');
            drawTimeAboveBar(x + 20, totalTimeImproved, '#dc2626');
        }
    } else if (distributionDisplayMode === 'both-separated') {
        if (displayOnlyMode === 'current') {
            drawTimeAboveBar(x, totalTimeCurrent,  '#1f2937');
        } else if (displayOnlyMode === 'improved') {
            drawTimeAboveBar(x, totalTimeImproved, '#dc2626');
        }
    } else {
        // 改善前または改善後の単独表示
        const totalTime = (distributionDisplayMode === 'improved') ? totalTimeImproved : totalTimeCurrent;
        const color     = (distributionDisplayMode === 'improved') ? '#dc2626' : '#1f2937';
        drawTimeAboveBar(x, totalTime, color);
    }
}

/**
 * 作業配分表の作業項目名表示を切り替え
 */
function toggleDistributionItemLabels() {
    showDistributionItemLabels = !showDistributionItemLabels;

    // ボタンの状態を更新
    const toggleBtn = document.getElementById('distributionLabelToggle');
    if (toggleBtn) {
        if (showDistributionItemLabels) {
            toggleBtn.classList.add('active');
            toggleBtn.style.backgroundColor = '#2563eb';
            toggleBtn.style.color = 'white';
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.style.backgroundColor = '#64748b';
            toggleBtn.style.color = 'white';
        }
    }

    updateDistributionChart();

    const status = showDistributionItemLabels ? '表示' : '非表示';
    showNotificationBanner(`作業配分表の項目名を${status}にしました。`, 'info', 1500);
}



/**
 * 作業配分表のマウスオーバーチェック
 */
function checkDistributionHover(mouseX, mouseY, event) {
    const selectedData = dataList.filter(data => selectedDataIds.includes(data.id));
    let foundItem = null;

    // 各データの作業項目をチェック
    selectedData.forEach(data => {
        if (data.data.workItems) {
            data.data.workItems.forEach(item => {
                if (item._renderInfo) {
                    const info = item._renderInfo;
                    if (mouseX >= info.x && mouseX <= info.x + info.width &&
                        mouseY >= info.y && mouseY <= info.y + info.height) {
                        foundItem = {
                            item: item,
                            info: info,
                            event: event
                        };
                    }
                }
            });
        }
    });

    if (foundItem) {
        showDistributionTooltip(foundItem.item, foundItem.info, foundItem.event);
    } else {
        hideDistributionTooltip();
    }
}

/**
 * 作業配分表のツールチップ表示
 */
function showDistributionTooltip(item, info, event) {
    const tooltip = document.getElementById('tooltip');

    const categoryLabels = {
        normal: '通常作業',
        monitor: '監視作業',
        wait: '手待ち作業'
    };

    const categoryLabel = categoryLabels[item.category] || '通常作業';

    tooltip.innerHTML = `
        <strong>${item.name}</strong><br>
        データ: ${info.dataName}<br>
        分類: ${categoryLabel}<br>
        手作業時間: ${formatTimeDisplay(info.manualTime)}<br>
        歩行時間: ${formatTimeDisplay(info.walkTime)}<br>
        合計時間: ${formatTimeDisplay(info.workTime)}
    `;

    // 位置調整
    const x = event.pageX + 12;
    const y = event.pageY - 12;

    // 画面端での調整
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + tooltipRect.width > viewportWidth) {
        adjustedX = event.pageX - tooltipRect.width - 12;
    }

    if (y + tooltipRect.height > viewportHeight) {
        adjustedY = event.pageY - tooltipRect.height - 12;
    }

    tooltip.style.left = adjustedX + 'px';
    tooltip.style.top = adjustedY + 'px';
    tooltip.style.display = 'block';
}

/**
 * 作業配分表のツールチップ非表示
 */
function hideDistributionTooltip() {
    document.getElementById('tooltip').style.display = 'none';
}

/**
 * 工程確認チャート描画（完全スケール同期版・時間軸ずれ修正）
 */
function drawProcessChart() {
    if (!processCanvas || !processCtx) {
        console.warn('Process canvas not ready');
        return;
    }

    // 工程確認チャートが表示されていない場合は描画しない
    const processContainer = document.getElementById('processChartContainer');
    if (!processContainer || processContainer.style.display === 'none') {
        return;
    }

    // キャンバスクリア
    processCtx.clearRect(0, 0, processCanvas.width, processCanvas.height);

    // 背景描画
    processCtx.fillStyle = '#ffffff';
    processCtx.fillRect(0, 0, processCanvas.width, processCanvas.height);

    // 表示項目の確認
    const displayItems = getDisplayWorkItems();
    if (displayItems.length === 0) {
        return;
    }

    try {
        // メインチャートと完全に同じ設定を使用（スケール同期・修正版）
        const settings = getChartCommonSettings();
        const { maxTime, leftMargin, rightMargin, timeScale } = settings;

        // 工程確認チャートキャンバスの幅をメインチャートと完全に合わせる（強化版）
        const devicePixelRatio = window.devicePixelRatio || 1;
        const mainCanvas = document.getElementById('ganttCanvas');
        
        if (!mainCanvas) {
            console.warn('Main canvas not found for process chart sync');
            return;
        }
        
        const mainCanvasDisplayWidth = mainCanvas.width / devicePixelRatio;
        const currentProcessWidth = processCanvas.width / devicePixelRatio;
        
        // より厳密な幅チェック（0.1ピクセル以上の差で同期 - より敏感に）
        if (Math.abs(currentProcessWidth - mainCanvasDisplayWidth) > 0.1) {
            
            // 幅を即座に同期
            processCanvasWidth = mainCanvasDisplayWidth;
            updateHighDPICanvas(processCanvas, processCtx, processCanvasWidth, processCanvasHeight);
            
            // キャンバスサイズ変更後は背景を再描画
            processCtx.fillStyle = '#ffffff';
            processCtx.fillRect(0, 0, processCanvas.width, processCanvas.height);
            
            // サイズ変更直後は一度描画を中止して、次のフレームで再実行
            requestAnimationFrame(() => {
                drawProcessChart();
            });
            return;
        }

        // スケール情報の完全同期確認（デバッグログ強化）
        const currentScale = {
            maxTime: maxTime,
            timeScale: timeScale,
            leftMargin: leftMargin,
            rightMargin: rightMargin,
            canvasWidth: currentProcessWidth,
            mainCanvasWidth: mainCanvasDisplayWidth
        };
        
        // 前回のスケール情報と比較
        if (window.processChartScaleInfo) {
            const prevScale = window.processChartScaleInfo;
            const scaleChanged = Math.abs(currentScale.timeScale - prevScale.timeScale) > 0.001 ||
                               Math.abs(currentScale.canvasWidth - prevScale.canvasWidth) > 0.1;
        }
        
        // 現在のスケール情報を保存
        window.processChartScaleInfo = currentScale;

        // タイトル描画
        drawProcessChartTitle();

        // 行ハイライト描画（最初に描画）
        drawProcessRowHighlights();

        // X軸とグリッドを描画（共通関数呼び出し）
        const maxLotNumber = getMaxLotNumber();
        const gridConfig = {
            ctx: processCtx,
            canvasWidth: processCanvas.width / devicePixelRatio,
            chartHeight: maxLotNumber * PROCESS_ROW_HEIGHT,
            maxTime: maxTime,
            timeScale: timeScale,
            leftMargin: leftMargin,
            rightMargin: rightMargin,
            topMargin: PROCESS_TOP_MARGIN,
            rowHeight: PROCESS_ROW_HEIGHT,
            totalRows: maxLotNumber,
            baseTimeForGrid: Math.max(settings.taktTime, settings.standardWorkTotalTime, 1),
            drawBothModeCenterLine: (displayMode === 'both')
        };

        // ── C/T線をメインチャートと同じロジックで設定 ──────────────────────
        if (displayMode === 'both') {
            let currentTotal = 0;
            currentWorkOrder.forEach(id => {
                const item = workItems.find(i => i.id === id);
                if (item && (item.targetScope || 'common') !== 'improved-only') {
                    currentTotal += item.manualTime + item.walkTime;
                }
            });
            let improvedTotal = 0;
            improvedWorkOrder.forEach(id => {
                const item = workItems.find(i => i.id === id);
                if (item && (item.targetScope || 'common') !== 'current-only') {
                    const improvedData = item.improved || { manualTime: item.manualTime, walkTime: item.walkTime };
                    improvedTotal += improvedData.manualTime + improvedData.walkTime;
                }
            });
            gridConfig.completionLines = {
                current:  { time: currentTotal,  label: `改善前 C/T ${formatTimeDisplay(currentTotal)}`,  styleKey: 'currentCT'  },
                improved: { time: improvedTotal, label: `改善後 C/T ${formatTimeDisplay(improvedTotal)}`, styleKey: 'improvedCT' }
            };
        } else {
            const cycleTime  = calculateTotalCycleTimeForMode(displayItems);
            const styleKey   = (displayMode === 'improved') ? 'improvedCT' : 'currentCT';
            const modePrefix = (displayMode === 'improved') ? '改善後 ' : '';
            gridConfig.completionLines = {
                main: { time: cycleTime, label: `${modePrefix}C/T ${formatTimeDisplay(cycleTime)}`, styleKey }
            };
        }

        // 1サイクル目の作業バーを描画（自動送りはみ出し情報を受け取る）
        const autoOverflows = drawProcessWorkBars(timeScale, leftMargin);

        // Nサイクル目バーを描画（グリッド線が上に乗るよう先に描画）
        if (cycleCount >= 2) {
            drawProcessDualCycleBars(timeScale, leftMargin, displayItems);
        }

        drawStandardizedGrid(gridConfig);

        // サイクルモード: 仕切り線をバー直後・グリッド前に描画
        if ((typeof processChartLotMode !== 'undefined') && processChartLotMode === 'cycle') {
            drawProcessCycleLotBoundaries(timeScale, leftMargin, displayItems);
        }

        // NC/T線をグリッドの上に描画
        if (cycleCount >= 2) {
            drawProcessDualCycleOverlay(timeScale, leftMargin, displayItems);
        }

        // 自動送りはみ出しバーと干渉バッジを最前面に描画
        drawProcessAutoFeedOverflowAndBadge(autoOverflows, timeScale, leftMargin, displayItems);

        // 工程ラベル描画（メインチャートと同じフォントサイズ・同じレイアウト）
        if (showWorkItemLabels) {
            drawProcessLabels(leftMargin);
        }

        // タクトタイムライン描画（最前面・2サイクル・まとめづくり対応）
        drawProcessTaktTimeLine(taktTime, timeScale, leftMargin);

        // サイクルモード: ロット番号バッジを最前面に描画（全バー・線・ラベルの上）
        if ((typeof processChartLotMode !== 'undefined') && processChartLotMode === 'cycle') {
            drawProcessCycleLotBadges(timeScale, leftMargin, displayItems);
        }

    } catch (error) {
        console.error('Error drawing process chart:', error);
        drawProcessChartErrorMessage();
    }
}

/**
 * 工程確認チャートエラーメッセージ描画
 */
/**
 * サイクルモード用: ロット境界縦線を描画
 * 各ロットの作業累計終了時刻に軽い区切り線を引いて視認性を高める
 */
// ── サイクルモード ロット区切り用ヘルパー ───────────────────────────────
// 手動+歩行の連続スパン収集（直前と同一 lotNum のみ結合）
function _buildManualSegments(items, mode) {
    const segs = [];
    let t = 0;
    items.forEach(item => {
        let mt, wt;
        if (mode === 'improved' && item.improved) {
            mt = item.improved.manualTime || 0; wt = item.improved.walkTime || 0;
        } else {
            mt = item.manualTime || 0; wt = item.walkTime || 0;
        }
        const np = normalizeProcessValue(item.process);
        let lotNum = 1;
        if (np && np.startsWith('lot')) {
            const ext = parseInt(np.substring(3), 10);
            if (!isNaN(ext) && ext >= 1) lotNum = ext;
        }
        const end = t + mt + wt;
        const last = segs[segs.length - 1];
        if (last && last.lotNum === lotNum) { last.endTime = end; }
        else { segs.push({ lotNum, startTime: t, endTime: end }); }
        t += mt + wt;
    });
    return segs;
}

// 自動送りスパン収集（直前と同一 lotNum のみ結合）
function _buildAutoSegments(items, mode) {
    const segs = [];
    let t = 0;
    items.forEach(item => {
        let mt, at, wt;
        if (mode === 'improved' && item.improved) {
            mt = item.improved.manualTime || 0; at = item.improved.autoTime || 0; wt = item.improved.walkTime || 0;
        } else {
            mt = item.manualTime || 0; at = item.autoTime || 0; wt = item.walkTime || 0;
        }
        const np = normalizeProcessValue(item.process);
        let lotNum = 1;
        if (np && np.startsWith('lot')) {
            const ext = parseInt(np.substring(3), 10);
            if (!isNaN(ext) && ext >= 1) lotNum = ext;
        }
        if (at > 0) {
            const autoStart = t + mt;
            const autoEnd   = autoStart + at;
            const last = segs[segs.length - 1];
            if (last && last.lotNum === lotNum) { last.endTime = Math.max(last.endTime, autoEnd); }
            else { segs.push({ lotNum, startTime: autoStart, endTime: autoEnd }); }
        }
        t += mt + wt;
    });
    return segs;
}

// ── ① 仕切り線のみ描画（バー描画直後に呼ぶ）────────────────────────────
function drawProcessCycleLotBoundaries(timeScale, leftMargin, displayItems) {
    const isBoth    = (displayMode === 'both');
    const barH_s    = PROCESS_ROW_HEIGHT / 3;  // 単一モードのバー高さ
    const barH_b    = PROCESS_ROW_HEIGHT / 4;  // both モードのバー高さ
    const DIVIDER   = '#eab308';                // yellow-500

    function drawDividers(segs, cycleTime, barTopY, barH) {
        if (!segs || segs.length === 0) return;
        processCtx.save();
        processCtx.strokeStyle = DIVIDER;
        processCtx.lineWidth   = 2;
        processCtx.setLineDash([]);
        for (let ci = 0; ci < cycleCount; ci++) {
            const xOff = ci * cycleTime;
            const yOff = ci * PROCESS_ROW_HEIGHT;
            const topY = barTopY + yOff;
            const botY = topY + barH;
            segs.forEach((seg, idx) => {
                if (idx >= segs.length - 1) return; // 最終スパン後は不要
                const endX = leftMargin + (xOff + seg.endTime) * timeScale;
                processCtx.beginPath();
                processCtx.moveTo(endX, topY);
                processCtx.lineTo(endX, botY);
                processCtx.stroke();
            });
        }
        processCtx.restore();
    }

    const rowY = PROCESS_TOP_MARGIN;

    if (isBoth) {
        const currentItems = (typeof currentWorkOrder !== 'undefined' && currentWorkOrder)
            ? currentWorkOrder.map(id => workItems.find(i => i.id === id)).filter(Boolean)
                               .filter(i => (i.targetScope || 'common') !== 'improved-only')
            : displayItems;
        const improvedItems = (typeof improvedWorkOrder !== 'undefined' && improvedWorkOrder)
            ? improvedWorkOrder.map(id => workItems.find(i => i.id === id)).filter(Boolean)
                               .filter(i => (i.targetScope || 'common') !== 'current-only')
            : displayItems;
        const cCycleT = calculateTotalCycleTimeForMode('current');
        const iCycleT = calculateTotalCycleTimeForMode('improved');
        const cTopY   = rowY + PROCESS_ROW_HEIGHT / 4 - barH_b / 2;
        const iTopY   = rowY + PROCESS_ROW_HEIGHT * 3 / 4 - barH_b / 2;
        drawDividers(_buildManualSegments(currentItems,  'current'),  cCycleT, cTopY, barH_b);
        drawDividers(_buildManualSegments(improvedItems, 'improved'), iCycleT, iTopY, barH_b);
    } else {
        const mode      = displayMode === 'improved' ? 'improved' : 'current';
        const cycleTime = calculateTotalCycleTimeForMode(displayItems);
        const barTopY   = rowY + PROCESS_ROW_HEIGHT / 2 - barH_s / 2;
        drawDividers(_buildManualSegments(displayItems, mode), cycleTime, barTopY, barH_s);
    }
}

// ── ② バッジのみ描画（全バー・グリッド・線の後に呼ぶ = 最前面）──────────
function drawProcessCycleLotBadges(timeScale, leftMargin, displayItems) {
    const isBoth = (displayMode === 'both');
    const barH_s = PROCESS_ROW_HEIGHT / 3;
    const barH_b = PROCESS_ROW_HEIGHT / 4;
    const rowY   = PROCESS_TOP_MARGIN;

    const MANUAL_BG = 'rgba(6, 148, 162, 0.88)';    // cyan-600
    const AUTO_BG   = 'rgba(217, 119, 6, 0.88)';    // amber-600
    const BADGE_H   = 11;
    const BADGE_R   = BADGE_H / 2;
    const PAD_X     = 5;
    const FONT      = `bold 8px "Segoe UI", sans-serif`;

    // ── バッジリスト収集 ────────────────────────────────────────────────
    // badge: { midX, baseMidY, label, bg }
    const badges = [];

    function collectBadges(segs, cycleTime, barTopY, barH, bg) {
        if (!segs || segs.length === 0) return;
        processCtx.font = FONT;
        const fullSuffix = 'ロット目';
        for (let ci = 0; ci < cycleCount; ci++) {
            const xOff   = ci * cycleTime;
            const yOff   = ci * PROCESS_ROW_HEIGHT;
            const ciMidY = barTopY + yOff + barH / 2;
            segs.forEach(seg => {
                const startX = leftMargin + (xOff + seg.startTime) * timeScale;
                const endX   = leftMargin + (xOff + seg.endTime)   * timeScale;
                const spanW  = endX - startX;
                const midX   = (startX + endX) / 2;

                // スパン幅によってラベルを切り替え
                // fullLabel の pillW がスパン幅に収まらなければ数値のみに短縮
                const fullLabel  = seg.lotNum + fullSuffix;
                const shortLabel = String(seg.lotNum);
                const fullW      = processCtx.measureText(fullLabel).width  + PAD_X * 2;
                const shortW     = processCtx.measureText(shortLabel).width + PAD_X * 2;
                const label = (fullW <= spanW) ? fullLabel : shortLabel;
                const pillW = (fullW <= spanW) ? fullW     : shortW;

                badges.push({ midX, baseMidY: ciMidY, barMidY: ciMidY, barH, label, bg, pillW });
            });
        }
    }

    if (isBoth) {
        const currentItems = (typeof currentWorkOrder !== 'undefined' && currentWorkOrder)
            ? currentWorkOrder.map(id => workItems.find(i => i.id === id)).filter(Boolean)
                               .filter(i => (i.targetScope || 'common') !== 'improved-only')
            : displayItems;
        const improvedItems = (typeof improvedWorkOrder !== 'undefined' && improvedWorkOrder)
            ? improvedWorkOrder.map(id => workItems.find(i => i.id === id)).filter(Boolean)
                               .filter(i => (i.targetScope || 'common') !== 'current-only')
            : displayItems;
        const cCycleT = calculateTotalCycleTimeForMode('current');
        const iCycleT = calculateTotalCycleTimeForMode('improved');
        const cTopY   = rowY + PROCESS_ROW_HEIGHT / 4 - barH_b / 2;
        const iTopY   = rowY + PROCESS_ROW_HEIGHT * 3 / 4 - barH_b / 2;
        collectBadges(_buildManualSegments(currentItems,  'current'),  cCycleT, cTopY, barH_b, MANUAL_BG);
        collectBadges(_buildAutoSegments(currentItems,    'current'),  cCycleT, cTopY, barH_b, AUTO_BG);
        collectBadges(_buildManualSegments(improvedItems, 'improved'), iCycleT, iTopY, barH_b, MANUAL_BG);
        collectBadges(_buildAutoSegments(improvedItems,   'improved'), iCycleT, iTopY, barH_b, AUTO_BG);
    } else {
        const mode      = displayMode === 'improved' ? 'improved' : 'current';
        const cycleTime = calculateTotalCycleTimeForMode(displayItems);
        const barTopY   = rowY + PROCESS_ROW_HEIGHT / 2 - barH_s / 2;
        collectBadges(_buildManualSegments(displayItems, mode), cycleTime, barTopY, barH_s, MANUAL_BG);
        collectBadges(_buildAutoSegments(displayItems,   mode), cycleTime, barTopY, barH_s, AUTO_BG);
    }

    if (badges.length === 0) return;

    // ── 重なり検出 + 上下オフセット配置 ───────────────────────────────
    // 【修正】スプレッドコピーをやめてインデックスで元オブジェクトを直接書き換える。
    //   旧実装: { ...b, _i: i } でコピーを作り offsetY を設定 → 元配列に反映されない
    //   新実装: badges の実インデックスをそのまま保持し offsetY を元オブジェクトへ書込
    const STEP = BADGE_H + 2;  // 上下ずらし量（バッジ高さ + 余白）

    // barMidY 別に実インデックスをグループ化
    const byRow = new Map();
    badges.forEach((b, i) => {
        const key = Math.round(b.barMidY);
        if (!byRow.has(key)) byRow.set(key, []);
        byRow.get(key).push(i);          // ← インデックスのみ格納（コピーしない）
    });

    byRow.forEach(idxList => {
        // X 順にソート（元配列インデックスのリスト）
        idxList.sort((a, b) => badges[a].midX - badges[b].midX);

        // 重なりクラスタ構築: クラスタは元配列インデックスの配列
        const clusters = [];
        idxList.forEach(i => {
            const bi    = badges[i];
            const halfW = bi.pillW / 2;
            const found = clusters.find(cl =>
                cl.some(j => {
                    const bj = badges[j];
                    return Math.abs(bj.midX - bi.midX) < (bj.pillW / 2 + halfW);
                })
            );
            if (found) found.push(i);
            else clusters.push([i]);
        });

        // クラスタごとに上下オフセットを元オブジェクトへ直接書き込む
        clusters.forEach(cl => {
            if (cl.length === 1) return;           // 重なりなし
            cl.forEach((i, rank) => {
                const level = Math.ceil(rank / 2);
                const sign  = rank % 2 === 0 ? -1 : 1;
                badges[i].offsetY = sign * level * STEP;  // ← 元オブジェクトに書込
            });
        });
    });

    // ── バッジ描画 ──────────────────────────────────────────────────────
    processCtx.save();
    processCtx.font         = FONT;
    processCtx.textBaseline = 'middle';
    processCtx.textAlign    = 'center';
    processCtx.setLineDash([]);

    badges.forEach(b => {
        const finalMidY = b.barMidY + (b.offsetY || 0);
        const pillX = b.midX - b.pillW / 2;
        const pillY = finalMidY - BADGE_H / 2;

        processCtx.fillStyle = b.bg;
        processCtx.beginPath();
        processCtx.roundRect(pillX, pillY, b.pillW, BADGE_H, BADGE_R);
        processCtx.fill();

        processCtx.fillStyle = '#ffffff';
        processCtx.fillText(b.label, b.midX, finalMidY);
    });

    processCtx.restore();
}

function drawProcessChartErrorMessage() {
    if (!processCtx) return;
    
    processCtx.fillStyle = '#dc2626';
    processCtx.font = '14px "Segoe UI", sans-serif';
    processCtx.textAlign = 'center';
    processCtx.fillText(
        '工程確認チャートの描画でエラーが発生しました',
        (processCanvas.width / (window.devicePixelRatio || 1)) / 2,
        (processCanvas.height / (window.devicePixelRatio || 1)) / 2
    );
}

/**
 * 工程確認チャートタイトル（位置調整対応版）
 */
function drawProcessChartTitle() {
    // 基準位置
    const baseX = 15;
    const baseY = 18;
    
    // 位置調整を適用
    const adjustedPos = applyTextPositionAdjustment('chartTitle', baseX, baseY);
    
    processCtx.save();
    processCtx.fillStyle = '#1f2937';
    processCtx.font = 'bold 12px "Segoe UI", sans-serif';
    processCtx.textAlign = 'left';
    applyTextFlashStyles(processCtx, 'chartTitle');
    processCtx.fillText('工程確認', adjustedPos.x, adjustedPos.y);
    processCtx.restore();
}

/**
 * 併記モード用の工程確認チャート作業バーを描画（統一バー高さルール適用版・動的ロット数対応）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
/**
 * 工程確認チャート 1サイクル目バー描画（bothモード）。
 * 自動送りのはみ出し情報を返す。
 * @returns {Array} overflows
 */
function drawBothModeProcessWorkBars(timeScale, leftMargin) {
    const barHeight       = PROCESS_ROW_HEIGHT / 4;
    const lotsPerCycleBoth = getLotsPerCycle();
    const isSingleBoth    = (typeof processChartLotMode !== 'undefined') && (processChartLotMode === 'single' || processChartLotMode === 'cycle');
    const overflows       = [];

    // ── 改善前（各行の上半分）────────────────────────────────────────────
    let currentCumulativeTime = 0;
    const currentCycleTime    = calculateTotalCycleTimeForMode('current');
    const currentItems = currentWorkOrder.map(id => workItems.find(item => item.id === id)).filter(Boolean);

    currentItems.forEach(item => {
        if ((item.targetScope || 'common') === 'improved-only') return;

        const normalizedProcess = normalizeProcessValue(item.process);
        let lotNumber = 1;
        if (normalizedProcess && normalizedProcess.startsWith('lot')) {
            const ext = parseInt(normalizedProcess.substring(3), 10);
            if (!isNaN(ext) && ext >= 1 && ext <= lotsPerCycleBoth) lotNumber = ext;
        }

        const rowIndex = isSingleBoth ? 0 : lotNumber - 1;
        const y        = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
        const centerY  = y + (PROCESS_ROW_HEIGHT / 4) - (barHeight / 2);
        const currentX = leftMargin + (currentCumulativeTime * timeScale);
        const { manualTime, autoTime, walkTime } = item;
        const color = '#1f2937';

        if (manualTime > 0) {
            processCtx.fillStyle = color;
            processCtx.fillRect(currentX, centerY, manualTime * timeScale, barHeight);
        }

        const manualEndTime  = currentCumulativeTime + manualTime;
        const walkDrawStartX = leftMargin + (manualEndTime * timeScale);

        if (walkTime > 0) {
            processCtx.fillStyle = color + '4D';
            processCtx.fillRect(walkDrawStartX, centerY, walkTime * timeScale, barHeight);
        }

        // ── 自動送りバー（サイクル内部分）描画 + はみ出し検出（改善前）───
        if (autoTime > 0) {
            const autoEnd         = manualEndTime + autoTime;
            const inCycleAutoEnd  = currentCycleTime > 0 ? Math.min(autoEnd, currentCycleTime) : autoEnd;
            _drawProcessAutoFeedDash(
                leftMargin + manualEndTime * timeScale,
                (inCycleAutoEnd - manualEndTime) * timeScale,
                centerY, barHeight, 'current'
            );
            if (currentCycleTime > 0 && autoEnd > currentCycleTime) {
                overflows.push({
                    lotNumber, rowIndex, barHeight, centerY,
                    overflowStart: Math.max(manualEndTime, currentCycleTime),
                    overflowEnd:   autoEnd,
                    mode: 'current'
                });
            }
        }

        currentCumulativeTime += manualTime + walkTime;
    });

    // ── 改善後（各行の下半分）────────────────────────────────────────────
    let improvedCumulativeTime = 0;
    const improvedCycleTime    = calculateTotalCycleTimeForMode('improved');
    const improvedItems = improvedWorkOrder.map(id => workItems.find(item => item.id === id)).filter(Boolean);

    improvedItems.forEach(item => {
        if ((item.targetScope || 'common') === 'current-only') return;

        const normalizedProcess = normalizeProcessValue(item.process);
        let lotNumber = 1;
        if (normalizedProcess && normalizedProcess.startsWith('lot')) {
            const ext = parseInt(normalizedProcess.substring(3), 10);
            if (!isNaN(ext) && ext >= 1 && ext <= lotsPerCycleBoth) lotNumber = ext;
        }

        const rowIndex = isSingleBoth ? 0 : lotNumber - 1;
        const y        = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
        const centerY  = y + (PROCESS_ROW_HEIGHT * 3 / 4) - (barHeight / 2);
        const { manualTime, autoTime, walkTime } = item.improved || item;
        const color = '#dc2626';

        if (manualTime > 0) {
            const startX = leftMargin + (improvedCumulativeTime * timeScale);
            processCtx.fillStyle = color;
            processCtx.fillRect(startX, centerY, manualTime * timeScale, barHeight);
        }

        const manualEndTime  = improvedCumulativeTime + manualTime;
        const walkDrawStartX = leftMargin + (manualEndTime * timeScale);

        if (walkTime > 0) {
            processCtx.fillStyle = color + '4D';
            processCtx.fillRect(walkDrawStartX, centerY, walkTime * timeScale, barHeight);
        }

        // ── 自動送りバー（サイクル内部分）描画 + はみ出し検出（改善後）───
        if (autoTime > 0) {
            const autoEnd         = manualEndTime + autoTime;
            const inCycleAutoEnd  = improvedCycleTime > 0 ? Math.min(autoEnd, improvedCycleTime) : autoEnd;
            _drawProcessAutoFeedDash(
                leftMargin + manualEndTime * timeScale,
                (inCycleAutoEnd - manualEndTime) * timeScale,
                centerY, barHeight, 'improved'
            );
            if (improvedCycleTime > 0 && autoEnd > improvedCycleTime) {
                overflows.push({
                    lotNumber, rowIndex, barHeight, centerY,
                    overflowStart: Math.max(manualEndTime, improvedCycleTime),
                    overflowEnd:   autoEnd,
                    mode: 'improved'
                });
            }
        }

        improvedCumulativeTime += manualTime + walkTime;
    });

    return overflows;
}

/**
 * 工程確認チャートのタクトタイムライン描画（2サイクル・まとめづくり対応版）
 * drawEnhancedTaktTimeLine() と同等のロジックを processCtx で実行する
 * @param {number} taktTimeValue - タクトタイム（1T/T）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
function drawProcessTaktTimeLine(taktTimeValue, timeScale, leftMargin) {
    const maxLotNumber = getMaxLotNumber();
    const chartHeight  = maxLotNumber * PROCESS_ROW_HEIGHT;
    const chartBottom  = PROCESS_TOP_MARGIN + chartHeight;
    const chartTop     = PROCESS_TOP_MARGIN - 18;

    // まとめづくりモード判定
    const isBatch    = (typeof batchMode !== 'undefined') && batchMode && (typeof batchQuantity !== 'undefined') && batchQuantity > 1;
    const batchQty   = isBatch ? batchQuantity : 1;
    const batchTT    = taktTimeValue * batchQty;

    // ── マルチサイクル表示判定 ──────────────────────────────────────
    const isDual     = cycleCount >= 2;
    const maxCycles  = cycleCount;

    // ── 1. 個別T/T補助線（まとめづくりモード時）────────────────────────
    if (isBatch && (typeof batchShowIndividualLines !== 'undefined') && batchShowIndividualLines) {
        processCtx.save();
        processCtx.strokeStyle = 'rgba(220, 38, 38, 0.6)';
        processCtx.lineWidth = 2.5;
        processCtx.setLineDash([6, 3]);
        for (let cycle = 0; cycle < maxCycles; cycle++) {
            const cycleOffset = batchTT * cycle;
            for (let i = 1; i < batchQty; i++) {
                const subX = leftMargin + ((taktTimeValue * i + cycleOffset) * timeScale);
                processCtx.beginPath();
                processCtx.moveTo(subX, chartTop);
                processCtx.lineTo(subX, chartBottom);
                processCtx.stroke();

                const subLabelInterval = Math.ceil(batchQty / 10);
                if (i % subLabelInterval === 0) {
                    processCtx.setLineDash([]);
                    processCtx.fillStyle = 'rgba(220, 38, 38, 0.7)';
                    processCtx.font = 'bold 9px "Segoe UI", sans-serif';
                    processCtx.textAlign = 'center';
                    const label = cycle === 0 ? `${i}T/T` : `${batchQty + i}T/T`;
                    processCtx.fillText(label, subX, PROCESS_TOP_MARGIN - 26);
                    processCtx.setLineDash([6, 3]);
                }
            }
        }
        processCtx.restore();
    }

    // ── 2. メインT/T線（各サイクル分）────────────────────────────────────
    for (let cycle = 0; cycle < maxCycles; cycle++) {
        const cycleOffset = batchTT * cycle;
        const cycleMainX  = leftMargin + ((batchTT + cycleOffset) * timeScale);
        const cycleMainTT = batchTT * (cycle + 1);

        processCtx.save();
        const ttStyleP = _applyLineStyle(processCtx, 'taktTime');
        processCtx.beginPath();
        processCtx.moveTo(cycleMainX, chartTop);
        processCtx.lineTo(cycleMainX, chartBottom);
        processCtx.stroke();
        processCtx.setLineDash([]);

        // ── 3. ラベル ────────────────────────────────────────────────────
        let labelText;
        if (isBatch) {
            const nT = batchQty * (cycle + 1);
            labelText = `${nT}T/T  ${formatTimeDisplay(Math.round(cycleMainTT))}`;
        } else {
            const multiplier = cycle + 1;
            const prefix = multiplier === 1 ? '' : `${multiplier}`;
            labelText = `${prefix}T/T ${formatTimeDisplay(Math.round(taktTimeValue * multiplier))}`;
        }

        const baseY       = PROCESS_TOP_MARGIN - 24;
        const adjustedPos = applyTextPositionAdjustment('taktTimeLabel', cycleMainX, baseY);

        processCtx.fillStyle = ttStyleP.color;
        processCtx.font = 'bold 12px "Segoe UI", sans-serif';
        processCtx.textAlign = 'center';
        applyTextFlashStyles(processCtx, 'taktTimeLabel');
        processCtx.fillText(labelText, adjustedPos.x, adjustedPos.y);

        processCtx.restore();
    }
}

/**
 * 工程別作業バーを描画（統一バー高さルール適用版・動的ロット数対応）
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 */
/**
 * 工程確認チャート 1サイクル目バー描画。
 * 自動送りは「サイクル時間をはみ出した分のみ」を返値で報告する。
 * 実際のはみ出しバー描画・干渉バッジ描画は drawProcessAutoFeedOverflowAndBadge() が担う。
 * @returns {Array} overflows – はみ出し自動送り情報の配列（singleモード時のみ）
 */
function drawProcessWorkBars(timeScale, leftMargin) {
    if (displayMode === 'both') {
        return drawBothModeProcessWorkBars(timeScale, leftMargin);
    }

    const displayItems  = getDisplayWorkItems();
    const lotsPerCycle  = getLotsPerCycle();
    const isSingle      = (typeof processChartLotMode !== 'undefined') && (processChartLotMode === 'single' || processChartLotMode === 'cycle');
    const isCycleMode   = (typeof processChartLotMode !== 'undefined') && processChartLotMode === 'cycle';
    const cycleTime     = calculateTotalCycleTimeForMode(displayItems);
    const mode          = displayMode === 'improved' ? 'improved' : 'current';
    let cumulativeTime  = 0;
    const overflows     = []; // { lotNumber, rowIndex, barHeight, centerY, overflowStart, overflowEnd, mode }

    displayItems.forEach((item) => {
        let manualTime, autoTime, walkTime;
        if (displayMode === 'improved' && item.improved) {
            manualTime = item.improved.manualTime || 0;
            autoTime   = item.improved.autoTime   || 0;
            walkTime   = item.improved.walkTime   || 0;
        } else {
            manualTime = item.manualTime || 0;
            autoTime   = item.autoTime   || 0;
            walkTime   = item.walkTime   || 0;
        }

        const normalizedProcess = normalizeProcessValue(item.process);
        let lotNumber = 1;
        if (normalizedProcess && normalizedProcess.startsWith('lot')) {
            const ext = parseInt(normalizedProcess.substring(3), 10);
            if (!isNaN(ext) && ext >= 1 && ext <= lotsPerCycle) {
                lotNumber = ext;
            } else {
                cumulativeTime += manualTime + walkTime;
                return;
            }
        }

        // サイクルモード: 全ロットを1行に集約 / ロットモード: ロット番号で行配置
        const rowIndex = isSingle ? 0 : lotNumber - 1;
        const y        = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
        const barHeight = PROCESS_ROW_HEIGHT / 3;
        const centerY   = y + (PROCESS_ROW_HEIGHT / 2) - (barHeight / 2);
        const currentX  = leftMargin + (cumulativeTime * timeScale);

        // ── 手作業バー ──────────────────────────────────────────────────────
        if (manualTime > 0) {
            const width = manualTime * timeScale;
            let barColor;
            if (item.category === 'monitor' || item.category === 'hold' || item.category === 'wait') {
                barColor = mode === 'improved'
                    ? (item.category === 'wait' ? '#991b1b' : '#7f1d1d')
                    : (item.category === 'wait' ? '#4b5563' : '#374151');
            } else {
                barColor = mode === 'improved' ? '#dc2626' : '#1f2937';
            }
            processCtx.fillStyle = barColor;
            processCtx.fillRect(currentX, centerY, width, barHeight);

            // サイクルモード: バー内ラベルなし（境界線関数でバッジを描画）
            if (!isCycleMode && width > 30) {
                processCtx.fillStyle = '#ffffff';
                processCtx.font = 'bold 10px "Segoe UI", sans-serif';
                processCtx.textAlign = 'center';
                processCtx.fillText(formatTimeDisplay(manualTime), currentX + width / 2, centerY + barHeight / 2 + 4);
            }
        }

        const manualEndTime    = cumulativeTime + manualTime;
        const walkDrawStartX   = leftMargin + (manualEndTime * timeScale);

        // ── 歩行バー ────────────────────────────────────────────────────────
        if (walkTime > 0) {
            const width     = walkTime * timeScale;
            const walkColor = mode === 'improved' ? '#dc262680' : '#1f293780';
            processCtx.fillStyle = walkColor;
            processCtx.fillRect(walkDrawStartX, centerY, width, barHeight);
            if (width > 25 && !isCycleMode) {
                processCtx.fillStyle = '#374151';
                processCtx.font = 'bold 10px "Segoe UI", sans-serif';
                processCtx.textAlign = 'center';
                processCtx.fillText('歩行', walkDrawStartX + width / 2, centerY + barHeight / 2 + 4);
            }
        }

        // ── 自動送りバー（サイクル内部分）描画 + はみ出し検出 ───────────
        if (autoTime > 0) {
            const autoEndTime      = manualEndTime + autoTime;
            const inCycleAutoEnd   = cycleTime > 0 ? Math.min(autoEndTime, cycleTime) : autoEndTime;
            const inCycleStartX    = leftMargin + manualEndTime * timeScale;
            const inCycleWidth     = (inCycleAutoEnd - manualEndTime) * timeScale;
            _drawProcessAutoFeedDash(inCycleStartX, inCycleWidth, centerY, barHeight, mode);

            if (cycleTime > 0 && autoEndTime > cycleTime) {
                const overflowStart = Math.max(manualEndTime, cycleTime);
                overflows.push({ lotNumber, rowIndex, barHeight, centerY, overflowStart, overflowEnd: autoEndTime, mode });
            }
        }

        cumulativeTime += manualTime + walkTime;
    });

    return overflows;
}

/**
 * サイクルモード: 同一ロット番号の連続バーを1スパンに集約してラベルを描画
 * 隣接する同じ lotNumber のセグメントをマージし、スパン幅に応じてラベル内容を決める。
 * @param {Array}  segments  - { lotNumber, startX, endX, manualTime }[] ループ順
 * @param {number} centerY   - バー中心Y座標
 * @param {number} barHeight - バー高さ
 */

/**
 * 工程ラベルを描画（修正版：動的ロット数対応・併記モード対応・位置調整対応・2サイクル対応）
 * 2サイクル目の行は1サイクル目に続く連番（lotsPerCycle+1, lotsPerCycle+2, ...）で表示する。
 * @param {number} leftMargin - 左マージン
 */
function drawProcessLabels(leftMargin) {
    const maxRows      = getMaxLotNumber(); // モード別の総行数
    const lotsPerCycle = getLotsPerCycle();
    const isSingle     = (typeof processChartLotMode !== 'undefined') && (processChartLotMode === 'single' || processChartLotMode === 'cycle');
    const isCycleLabelMode = (typeof processChartLotMode !== 'undefined') && processChartLotMode === 'cycle';
    const isDual       = cycleCount >= 2;

    for (let rowNum = 0; rowNum < maxRows; rowNum++) {
        const y       = PROCESS_TOP_MARGIN + (rowNum * PROCESS_ROW_HEIGHT);
        const centerY = y + (PROCESS_ROW_HEIGHT / 2);

        // ── 背景グラデーション ───────────────────────────────────────────────
        const gradient = processCtx.createLinearGradient(0, y, 0, y + PROCESS_ROW_HEIGHT);
        if (displayMode === 'both') {
            gradient.addColorStop(0, '#f1f5f9');
            gradient.addColorStop(0.5, '#e2e8f0');
            gradient.addColorStop(1, '#cbd5e1');
        } else if (displayMode === 'improved') {
            gradient.addColorStop(0, '#fef2f2');
            gradient.addColorStop(1, '#fee2e2');
        } else {
            gradient.addColorStop(0, '#f9fafb');
            gradient.addColorStop(1, '#e5e7eb');
        }
        processCtx.fillStyle = gradient;
        processCtx.fillRect(0, y + 1, leftMargin - 1, PROCESS_ROW_HEIGHT - 2);

        // ── 境界線 ──────────────────────────────────────────────────────────
        processCtx.strokeStyle = '#d1d5db';
        processCtx.lineWidth = 1;
        processCtx.beginPath();
        processCtx.moveTo(leftMargin - 1, y);
        processCtx.lineTo(leftMargin - 1, y + PROCESS_ROW_HEIGHT);
        processCtx.stroke();

        processCtx.textBaseline = 'middle';

        if (isSingle) {
            // ── サイクルモード / 単一モード: 行番号 + ラベル（カッコ書きなし・左詰め）──
            const cycleNum    = rowNum + 1;
            const cycleLabel  = isCycleLabelMode ? `サイクル${cycleNum}` : `${cycleNum}C/T`;
            const modeColor   = displayMode === 'improved' ? '#dc2626' : '#1f2937';
            const subColor    = displayMode === 'improved' ? '#ef4444' : '#64748b';
            const bothName    = '#334155';

            // ── 行番号（左端・中央揃え）──
            const numX = 23;
            const labelX = 40;
            const maxLabelWidth = leftMargin - labelX - 5;

            processCtx.save();
            processCtx.font = 'bold 11px "Segoe UI", sans-serif';
            processCtx.textAlign = 'center';
            processCtx.textBaseline = 'middle';
            processCtx.fillStyle = displayMode === 'both' ? '#1f2937' : modeColor;
            const pn = applyTextPositionAdjustment('processLabels', numX, centerY);
            applyTextFlashStyles(processCtx, 'processLabels');
            processCtx.fillText(`${cycleNum}`, pn.x, pn.y);

            // ── サイクルラベル（左詰め）──
            processCtx.textAlign = 'left';
            if (displayMode === 'both') {
                processCtx.fillStyle = bothName;
                processCtx.font = 'bold 11px "Segoe UI", sans-serif';
                const p = applyTextPositionAdjustment('processLabels', labelX, centerY - 6);
                applyTextFlashStyles(processCtx, 'processLabels');
                processCtx.fillText(cycleLabel, p.x, p.y);

                processCtx.fillStyle = '#64748b';
                processCtx.font = '10px "Segoe UI", sans-serif';
                const p2 = applyTextPositionAdjustment('processLabels', labelX, centerY + 6);
                const itemCount = getDisplayWorkItems().length;
                processCtx.fillText(`${itemCount}項目`, p2.x, p2.y);
            } else {
                processCtx.fillStyle = modeColor;
                processCtx.font = 'bold 11px "Segoe UI", sans-serif';
                const p1 = applyTextPositionAdjustment('processLabels', labelX, centerY - 7);
                applyTextFlashStyles(processCtx, 'processLabels');
                processCtx.fillText(cycleLabel, p1.x, p1.y);

                processCtx.fillStyle = subColor;
                processCtx.font = '10px "Segoe UI", sans-serif';
                const p2 = applyTextPositionAdjustment('processLabels', labelX, centerY + 7);
                const itemCount = getDisplayWorkItems().length;
                processCtx.fillText(`${itemCount}項目`, p2.x, p2.y);
            }
            processCtx.restore();
        } else {
            // ── ロット分解モード（カッコ書きなし・左詰め）──────────────────
            const lotNum     = rowNum + 1;
            const labelText  = `${lotNum}ロット目`;

            // 追加サイクル専用行：サブテキストで何サイクル目かを補足表示
            const is2CycleOnlyRow = isDual && rowNum >= lotsPerCycle;
            const cycleLocalLot   = is2CycleOnlyRow ? lotsPerCycle : ((rowNum) % lotsPerCycle) + 1;
            const processItems    = getDisplayWorkItems().filter(item => {
                const np = normalizeProcessValue(item.process);
                return np === `lot${cycleLocalLot}`;
            });
            const cycleTag = is2CycleOnlyRow
                ? `${Math.floor(rowNum / lotsPerCycle) + 1}C/T · ${processItems.length}項目`
                : `${processItems.length}項目`;

            const modeColor = displayMode === 'improved' ? '#dc2626' : '#1f2937';
            const subColor  = displayMode === 'improved' ? '#ef4444' : '#64748b';
            const labelX    = 40;

            processCtx.save();
            processCtx.textBaseline = 'middle';

            // 行番号（左端・中央揃え）
            processCtx.font = 'bold 12px "Segoe UI", sans-serif';
            processCtx.textAlign = 'center';
            processCtx.fillStyle = displayMode === 'both' ? '#1f2937' : modeColor;
            const pn = applyTextPositionAdjustment('processLabels', 23, centerY);
            applyTextFlashStyles(processCtx, 'processLabels');
            processCtx.fillText(`${lotNum}`, pn.x, pn.y);

            // ロットラベル（左詰め）
            processCtx.textAlign = 'left';
            processCtx.fillStyle = displayMode === 'both' ? '#334155' : modeColor;
            processCtx.font = 'bold 12px "Segoe UI", sans-serif';
            const p1 = applyTextPositionAdjustment('processLabels', labelX, centerY - 7);
            applyTextFlashStyles(processCtx, 'processLabels');
            processCtx.fillText(labelText, p1.x, p1.y);

            // サブテキスト（項目数 / サイクル情報）
            processCtx.fillStyle = displayMode === 'both' ? '#64748b' : subColor;
            processCtx.font = '10px "Segoe UI", sans-serif';
            const p2 = applyTextPositionAdjustment('processLabels', labelX, centerY + 7);
            processCtx.fillText(cycleTag, p2.x, p2.y);
            processCtx.restore();
        }

        processCtx.textBaseline = 'alphabetic';
    }
}

/**
 * 工程確認チャート：2サイクル目バーの描画
 * 行の配置：rowIndex = lotsPerCycle + (lotNumber - 1)  ← Y方向に続く
 * バーのX位置：leftMargin + (cycleTime + cumulativeTime) * timeScale  ← X方向に続く
 * ラベルは 1サイクル目と同じ形式（絶対ロット番号で "Xロット目"）。
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function drawProcessDualCycleBars(timeScale, leftMargin, displayItems) {
    const lotsPerCycle = getLotsPerCycle();
    const isSingleDual = (typeof processChartLotMode !== 'undefined') && (processChartLotMode === 'single' || processChartLotMode === 'cycle');
    const isCycleDual  = (typeof processChartLotMode !== 'undefined') && processChartLotMode === 'cycle';

    if (displayMode === 'both') {
        const currentCycleTime  = calculateTotalCycleTimeForMode('current');
        const improvedCycleTime = calculateTotalCycleTimeForMode('improved');

        for (let cycleIdx = 2; cycleIdx <= cycleCount; cycleIdx++) {
            const curOffset = (cycleIdx - 1) * currentCycleTime;
            const impOffset = (cycleIdx - 1) * improvedCycleTime;

            // ── 改善前 ──
            let currentCumulative = 0;
            currentWorkOrder.map(id => workItems.find(item => item.id === id)).filter(Boolean)
            .forEach(item => {
                if ((item.targetScope || 'common') === 'improved-only') return;
                const normalizedProcess = normalizeProcessValue(item.process);
                let lotNumber = 1;
                if (normalizedProcess && normalizedProcess.startsWith('lot')) {
                    const ext = parseInt(normalizedProcess.substring(3), 10);
                    if (!isNaN(ext) && ext >= 1 && ext <= lotsPerCycle) lotNumber = ext;
                }
                const rowIndex  = isSingleDual ? cycleIdx - 1 : lotNumber + (cycleIdx - 2) * lotsPerCycle;
                const y         = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
                const barHeight = PROCESS_ROW_HEIGHT / 4;
                const centerY   = y + (PROCESS_ROW_HEIGHT / 4) - (barHeight / 2);
                const { manualTime, walkTime } = item;
                const color = '#1f2937';
                const xBase = leftMargin + (curOffset + currentCumulative) * timeScale;
                const manualEndTime = curOffset + currentCumulative + manualTime;
                if (manualTime > 0) { processCtx.fillStyle = color; processCtx.fillRect(xBase, centerY, manualTime * timeScale, barHeight); }
                if (walkTime > 0) { processCtx.fillStyle = color + '4D'; processCtx.fillRect(leftMargin + manualEndTime * timeScale, centerY, walkTime * timeScale, barHeight); }
                if (item.autoTime > 0) _drawProcessAutoFeedDash(leftMargin + manualEndTime * timeScale, item.autoTime * timeScale, centerY, barHeight, 'current');
                currentCumulative += manualTime + walkTime;
            });

            // ── 改善後 ──
            let improvedCumulative = 0;
            improvedWorkOrder.map(id => workItems.find(item => item.id === id)).filter(Boolean)
            .forEach(item => {
                if ((item.targetScope || 'common') === 'current-only') return;
                const normalizedProcess = normalizeProcessValue(item.process);
                let lotNumber = 1;
                if (normalizedProcess && normalizedProcess.startsWith('lot')) {
                    const ext = parseInt(normalizedProcess.substring(3), 10);
                    if (!isNaN(ext) && ext >= 1 && ext <= lotsPerCycle) lotNumber = ext;
                }
                const rowIndex  = isSingleDual ? cycleIdx - 1 : lotNumber + (cycleIdx - 2) * lotsPerCycle;
                const y         = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
                const barHeight = PROCESS_ROW_HEIGHT / 4;
                const centerY   = y + (PROCESS_ROW_HEIGHT * 3 / 4) - (barHeight / 2);
                const data      = item.improved || item;
                const { manualTime, walkTime } = data;
                const color = '#dc2626';
                const xBase = leftMargin + (impOffset + improvedCumulative) * timeScale;
                const manualEndTime = impOffset + improvedCumulative + manualTime;
                if (manualTime > 0) { processCtx.fillStyle = color; processCtx.fillRect(xBase, centerY, manualTime * timeScale, barHeight); }
                if (walkTime > 0) { processCtx.fillStyle = color + '4D'; processCtx.fillRect(leftMargin + manualEndTime * timeScale, centerY, walkTime * timeScale, barHeight); }
                const autoTimeImp = data.autoTime || 0;
                if (autoTimeImp > 0) _drawProcessAutoFeedDash(leftMargin + manualEndTime * timeScale, autoTimeImp * timeScale, centerY, barHeight, 'improved');
                improvedCumulative += manualTime + walkTime;
            });
        }

    } else {
        // ── シングルモード（改善前 or 改善後）──
        const cycleTime = calculateTotalCycleTimeForMode(displayItems);
        const mode      = displayMode === 'improved' ? 'improved' : 'current';
        const items     = getDisplayWorkItems();

        for (let cycleIdx = 2; cycleIdx <= cycleCount; cycleIdx++) {
            const cycleOffset  = (cycleIdx - 1) * cycleTime;
            let cumulativeTime = 0;

            items.forEach((item) => {
                let manualTime, autoTime, walkTime;
                if (displayMode === 'improved' && item.improved) {
                    manualTime = item.improved.manualTime || 0;
                    autoTime   = item.improved.autoTime   || 0;
                    walkTime   = item.improved.walkTime   || 0;
                } else {
                    manualTime = item.manualTime || 0;
                    autoTime   = item.autoTime   || 0;
                    walkTime   = item.walkTime   || 0;
                }

                const normalizedProcess = normalizeProcessValue(item.process);
                let lotNumber = 1;
                if (normalizedProcess && normalizedProcess.startsWith('lot')) {
                    const ext = parseInt(normalizedProcess.substring(3), 10);
                    if (!isNaN(ext) && ext >= 1 && ext <= lotsPerCycle) {
                        lotNumber = ext;
                    } else {
                        cumulativeTime += manualTime + walkTime;
                        return;
                    }
                }

                const rowIndex  = isSingleDual ? cycleIdx - 1 : lotNumber + (cycleIdx - 2) * lotsPerCycle;
                const y         = PROCESS_TOP_MARGIN + (rowIndex * PROCESS_ROW_HEIGHT);
                const barHeight = PROCESS_ROW_HEIGHT / 3;
                const centerY   = y + (PROCESS_ROW_HEIGHT / 2) - (barHeight / 2);
                const currentX  = leftMargin + (cycleOffset + cumulativeTime) * timeScale;

                let barColor;
                if (item.category === 'monitor' || item.category === 'hold' || item.category === 'wait') {
                    barColor = mode === 'improved'
                        ? (item.category === 'wait' ? '#991b1b' : '#7f1d1d')
                        : (item.category === 'wait' ? '#4b5563' : '#374151');
                } else {
                    barColor = mode === 'improved' ? '#dc2626' : '#1f2937';
                }

                if (manualTime > 0) {
                    const w = manualTime * timeScale;
                    processCtx.fillStyle = barColor;
                    processCtx.fillRect(currentX, centerY, w, barHeight);
                    // サイクルモード: バー内ラベルなし（境界線関数でバッジを描画）
                    if (!isCycleDual && w > 30) {
                        processCtx.fillStyle = '#ffffff';
                        processCtx.font = 'bold 10px "Segoe UI", sans-serif';
                        processCtx.textAlign = 'center';
                        processCtx.fillText(formatTimeDisplay(manualTime), currentX + w / 2, centerY + barHeight / 2 + 4);
                    }
                }

                const manualEndTime = cycleOffset + cumulativeTime + manualTime;

                if (walkTime > 0) {
                    const w = walkTime * timeScale;
                    const walkColor = mode === 'improved' ? '#dc262680' : '#1f293780';
                    processCtx.fillStyle = walkColor;
                    processCtx.fillRect(leftMargin + manualEndTime * timeScale, centerY, w, barHeight);
                }

                if (autoTime > 0) {
                    _drawProcessAutoFeedDash(leftMargin + manualEndTime * timeScale, autoTime * timeScale, centerY, barHeight, mode);
                }

                cumulativeTime += manualTime + walkTime;
            });
        }
    }

}

/**
 * 工程確認チャート：NC/T縦線の描画
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 */

/**
 * 工程確認チャート：2C/T縦線の描画
 * @param {number} timeScale - 時間スケール
 * @param {number} leftMargin - 左マージン
 * @param {Array} displayItems - 表示用作業項目リスト
 */
function drawProcessDualCycleOverlay(timeScale, leftMargin, displayItems) {
    const maxLotNumber = getMaxLotNumber();
    const chartHeight  = maxLotNumber * PROCESS_ROW_HEIGHT;
    const chartTop     = PROCESS_TOP_MARGIN - 18;
    const chartBottom  = PROCESS_TOP_MARGIN + chartHeight;

    const _drawLine = (x2, styleKey, labelText, isLast) => {
        processCtx.save();
        const s = _applyLineStyle(processCtx, styleKey, isLast ? 1.0 : 0.55, isLast ? 1.0 : 0.6);
        if (!isLast) processCtx.setLineDash([5, 4]);
        processCtx.beginPath();
        processCtx.moveTo(x2, chartTop);
        processCtx.lineTo(x2, chartBottom);
        processCtx.stroke();
        processCtx.setLineDash([]);
        processCtx.globalAlpha = 1.0;
        if (labelText) {
            processCtx.fillStyle = s.color;
            processCtx.font = isLast ? 'bold 12px "Segoe UI", sans-serif' : '10px "Segoe UI", sans-serif';
            processCtx.textAlign = 'center';
            processCtx.fillText(labelText, x2, PROCESS_TOP_MARGIN - 22);
        }
        processCtx.restore();
    };

    if (displayMode === 'both') {
        const currentCycleTime  = calculateTotalCycleTimeForMode('current');
        const improvedCycleTime = calculateTotalCycleTimeForMode('improved');
        for (let i = 2; i <= cycleCount; i++) {
            const isLast = (i === cycleCount);
            if (currentCycleTime  > 0) _drawLine(leftMargin + currentCycleTime  * i * timeScale, 'currentCT',  isLast ? `改善前 ${i}C/T ${formatTimeDisplay(Math.round(currentCycleTime  * i))}` : `${i}C`, isLast);
            if (improvedCycleTime > 0) _drawLine(leftMargin + improvedCycleTime * i * timeScale, 'improvedCT', isLast ? `改善後 ${i}C/T ${formatTimeDisplay(Math.round(improvedCycleTime * i))}` : `${i}C`, isLast);
        }
    } else {
        const cycleTime = calculateTotalCycleTimeForMode(displayItems);
        if (!cycleTime || cycleTime <= 0) return;
        const styleKey = (displayMode === 'improved') ? 'improvedCT' : 'currentCT';
        const prefix   = (displayMode === 'improved') ? '改善後 ' : '';
        for (let i = 2; i <= cycleCount; i++) {
            const isLast = (i === cycleCount);
            _drawLine(leftMargin + cycleTime * i * timeScale, styleKey, isLast ? `${prefix}${i}C/T ${formatTimeDisplay(Math.round(cycleTime * i))}` : `${i}C`, isLast);
        }
    }
}

/**
 * 工程確認チャートの行ハイライト描画（修正版：動的ロット数対応・併記モード対応）
 */
function drawProcessRowHighlights() {
    const maxLotNumber = getMaxLotNumber();
    
    if (hoveredProcessRowIndex >= 0 && hoveredProcessRowIndex < maxLotNumber) {
        const y = PROCESS_TOP_MARGIN + (hoveredProcessRowIndex * PROCESS_ROW_HEIGHT);
        processCtx.fillStyle = 'rgba(251, 191, 36, 0.12)';
        processCtx.fillRect(0, y, processCanvas.width, PROCESS_ROW_HEIGHT);
    }
}

/**
 * 頻度作業チャートの行ハイライト描画
 */
function drawFrequencyRowHighlights() {
    if (hoveredFrequencyRowIndex >= 0 && hoveredFrequencyRowIndex < frequencyWorkItems.length) {
        const y = FREQUENCY_TOP_MARGIN + (hoveredFrequencyRowIndex * FREQUENCY_ROW_HEIGHT);

        // 統一された黄色系ハイライト
        frequencyCtx.fillStyle = 'rgba(251, 191, 36, 0.12)';
        frequencyCtx.fillRect(0, y, frequencyCanvas.width, FREQUENCY_ROW_HEIGHT);
    }
}

/**
 * 併記モード対応：正確な表示行数を計算（統一関数・修正版）
 * @returns {number} - 実際に描画される行数
 */
function getTotalDisplayRows() {
    try {
        if (displayMode === 'both') {
            // ★★★ 修正：併記モードでの正確な行数計算 ★★★
            // 改善前ベースの項目（common + current-only）
            const displayItems = getDisplayWorkItems(); // これは改善前ベースの項目
            
            // 改善後のみの項目で改善後の順序に含まれるもの
            const improvedOnlyItems = improvedWorkOrder
                .map(id => workItems.find(item => item.id === id))
                .filter(item => {
                    if (!item) return false;
                    const targetScope = item.targetScope || 'common';
                    return targetScope === 'improved-only';
                });
            
            const totalRows = displayItems.length + improvedOnlyItems.length;
            return Math.max(1, totalRows);
        } else {
            // 単一モード：表示項目の数がそのまま行数
            const displayItems = getDisplayWorkItems();
            return Math.max(1, displayItems.length);
        }
    } catch (error) {
        console.error('Error in getTotalDisplayRows:', error);
        return 1; // エラー時のフォールバック
    }
}

/**
 * ドラッグアンドドロップ専用：実際の表示項目数を取得
 * @returns {number} - ドラッグアンドドロップ処理で使用する項目数
 */
function getActualDisplayItemCount() {
    try {
        const displayItems = getDisplayWorkItems();
        
        if (displayMode === 'both') {
            // 併記モードでも、ドラッグアンドドロップでは実際の表示項目全体を対象とする
            // 改善前ベースの項目
            const currentBasedItems = displayItems;
            
            // 改善後のみの項目
            const improvedOnlyItems = improvedWorkOrder
                .map(id => workItems.find(item => item.id === id))
                .filter(item => {
                    if (!item) return false;
                    const targetScope = item.targetScope || 'common';
                    return targetScope === 'improved-only';
                });
            
            return currentBasedItems.length + improvedOnlyItems.length;
        } else {
            return displayItems.length;
        }
    } catch (error) {
        console.error('Error in getActualDisplayItemCount:', error);
        return 0;
    }
}

/**
 * 併記モード対応：実際の描画高さを計算
 * @returns {number} - 必要なCanvas高さ
 */
function calculateRequiredCanvasHeight() {
    try {
        const totalRows = getTotalDisplayRows();
        const effectiveRowHeight = typeof getEffectiveRowHeight === 'function' ? getEffectiveRowHeight() : ROW_HEIGHT;
        const requiredHeight = Math.max(
            300, 
            TOP_MARGIN + (totalRows * effectiveRowHeight) + BOTTOM_MARGIN
        );
        return requiredHeight;
    } catch (error) {
        console.error('Error in calculateRequiredCanvasHeight:', error);
        return 300; // エラー時のフォールバック
    }
}

/**
 * エラーバーを描画します。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} x - バーのX座標
 * @param {number} barWidth - バーの幅
 * @param {number} yMin - エラーバーの下限Y座標
 * @param {number} yMax - エラーバーの上限Y座標
 * @param {string} color - バーの色
 * @param {number} xOffset - X方向のオフセット（複数のエラーバー表示用）
 */
function drawErrorBar(ctx, x, barWidth, yMin, yMax, color, xOffset = 0) {
    // Y座標の大小関係を問わず描画できるように修正
    const topY = Math.min(yMin, yMax);
    const bottomY = Math.max(yMin, yMax);

    if (bottomY - topY <= 0) return; // 高さがない場合は描画しない

    const centerX = x + barWidth / 2 + xOffset;
    const whiskerWidth = barWidth * 0.4;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    // 垂直線
    ctx.beginPath();
    ctx.moveTo(centerX, topY);
    ctx.lineTo(centerX, bottomY);
    ctx.stroke();

    // 上ヒゲ
    ctx.beginPath();
    ctx.moveTo(centerX - whiskerWidth / 2, topY);
    ctx.lineTo(centerX + whiskerWidth / 2, topY);
    ctx.stroke();

    // 下ヒゲ
    ctx.beginPath();
    ctx.moveTo(centerX - whiskerWidth / 2, bottomY);
    ctx.lineTo(centerX + whiskerWidth / 2, bottomY);
    ctx.stroke();
    ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════
// 工程確認チャート：自動送りバー共通描画ヘルパー & はみ出し描画
// ════════════════════════════════════════════════════════════════════════

/**
 * 工程確認チャート上に自動送りバーを点線で描画する共通ヘルパー。
 * 1サイクル目（サイクル内）・1サイクル目（はみ出し）・2サイクル目すべてで使用。
 * 色は改善前=黒(#1f2937)、改善後=赤(#dc2626) の点線で統一する。
 *
 * @param {number} startX    - 描画開始 X座標 (px, canvas座標)
 * @param {number} width     - バー幅 (px)
 * @param {number} centerY   - バー中心 Y座標 (px)
 * @param {number} barHeight - バー高さ (px)
 * @param {string} mode      - 'current' | 'improved'
 */
function _drawProcessAutoFeedDash(startX, width, centerY, barHeight, mode) {
    if (width <= 0) return;
    const color = mode === 'improved' ? '#dc2626' : '#1f2937';
    processCtx.save();
    processCtx.strokeStyle = color;
    processCtx.lineWidth   = barHeight;
    processCtx.setLineDash([5, 3]);
    processCtx.lineCap = 'butt';
    processCtx.beginPath();
    processCtx.moveTo(startX,         centerY + barHeight / 2);
    processCtx.lineTo(startX + width, centerY + barHeight / 2);
    processCtx.stroke();
    processCtx.setLineDash([]);
    processCtx.restore();
}

/**
 * 自動送りのはみ出しバー描画（C/T線を超えた部分のみ）と干渉バッジ更新を行う。
 * drawProcessChart から drawProcessWorkBars の後・ラベル描画の前に呼ぶこと。
 *
 * @param {Array}  autoOverflows - drawProcessWorkBars / drawBothModeProcessWorkBars の戻り値
 * @param {number} timeScale     - 時間スケール (px/sec)
 * @param {number} leftMargin    - 左マージン (px)
 * @param {Array}  displayItems  - 表示中作業項目配列
 */
function drawProcessAutoFeedOverflowAndBadge(autoOverflows, timeScale, leftMargin, displayItems) {
    if (!autoOverflows || autoOverflows.length === 0) return;

    // ── はみ出しバー描画（C/T線を超えた部分：黒/赤点線で統一）──────────
    autoOverflows.forEach(ov => {
        const startX = leftMargin + ov.overflowStart * timeScale;
        const width  = (ov.overflowEnd - ov.overflowStart) * timeScale;

        // _drawProcessAutoFeedDash に委譲（色・スタイルを1サイクル内と統一）
        _drawProcessAutoFeedDash(startX, width, ov.centerY, ov.barHeight, ov.mode);

        // はみ出し時間ラベル（幅が十分あれば）
        if (width > 28) {
            const color = ov.mode === 'improved' ? '#dc2626' : '#1f2937';
            const overflowSec = Math.round(ov.overflowEnd - ov.overflowStart);
            processCtx.save();
            processCtx.fillStyle = color;
            processCtx.font      = 'bold 9px "Segoe UI", sans-serif';
            processCtx.textAlign = 'center';
            processCtx.fillText(`+${formatTimeDisplay(overflowSec)}`, startX + width / 2, ov.centerY - 2);
            processCtx.restore();
        }
    });

    // ── 2サイクル目との干渉検出（バッジはGanttチャート側のHTML要素に委譲）──
    // ※ バッジ更新は detectGanttAutoFeedConflicts() → updateGanttAutoFeedConflictBadge() で行う
    // processCtx へのバッジ描画は廃止し、標準作業組合せ票上のドラッグ可能バッジに一本化
}

/**
 * はみ出し自動送りと2サイクル目作業の時間的干渉を検出する。
 * ・同一ロット番号で overflowEnd > 2サイクル目作業開始時間 なら干渉
 *
 * @param {Array} autoOverflows - はみ出し情報配列
 * @param {Array} displayItems  - 表示中作業項目配列
 * @returns {Array} conflicts   - { lotNumber, overflowEnd, conflictStart, overlapSec }
 */
function _detectProcessAutoFeedConflicts(autoOverflows, displayItems) {
    if (cycleCount < 2) return [];

    // 2サイクル目の各ロットの最早開始時刻を計算（= cycleTime + 累積）
    // ロット別・モード別で整理
    const _buildCycle2StartMap = (items, cycleTimeForMode, timeFn) => {
        const map = {}; // lotNumber → earliest start time (absolute)
        let cumulative = 0;
        items.forEach(item => {
            const { manualTime, walkTime } = timeFn(item);
            const normalizedProcess = normalizeProcessValue(item.process);
            let lotNumber = 1;
            if (normalizedProcess && normalizedProcess.startsWith('lot')) {
                const n = parseInt(normalizedProcess.substring(3), 10);
                if (!isNaN(n)) lotNumber = n;
            }
            const startTime = cycleTimeForMode + cumulative;
            if (!(lotNumber in map)) map[lotNumber] = startTime;
            cumulative += manualTime + walkTime;
        });
        return map;
    };

    const conflicts = [];

    autoOverflows.forEach(ov => {
        let cycle2Map;
        if (displayMode === 'both') {
            if (ov.mode === 'current') {
                const ct = calculateTotalCycleTimeForMode('current');
                const items = currentWorkOrder.map(id => workItems.find(i => i.id === id)).filter(Boolean)
                    .filter(i => (i.targetScope || 'common') !== 'improved-only');
                cycle2Map = _buildCycle2StartMap(items, ct, i => ({ manualTime: i.manualTime || 0, walkTime: i.walkTime || 0 }));
            } else {
                const ct = calculateTotalCycleTimeForMode('improved');
                const items = improvedWorkOrder.map(id => workItems.find(i => i.id === id)).filter(Boolean)
                    .filter(i => (i.targetScope || 'common') !== 'current-only');
                cycle2Map = _buildCycle2StartMap(items, ct, i => {
                    const d = i.improved || i;
                    return { manualTime: d.manualTime || 0, walkTime: d.walkTime || 0 };
                });
            }
        } else {
            const ct = calculateTotalCycleTimeForMode(displayItems);
            cycle2Map = _buildCycle2StartMap(displayItems, ct, item => {
                if (displayMode === 'improved' && item.improved) {
                    return { manualTime: item.improved.manualTime || 0, walkTime: item.improved.walkTime || 0 };
                }
                return { manualTime: item.manualTime || 0, walkTime: item.walkTime || 0 };
            });
        }

        const cycle2Start = cycle2Map[ov.lotNumber];
        if (cycle2Start !== undefined && ov.overflowEnd > cycle2Start) {
            const overlapSec = Math.round(ov.overflowEnd - cycle2Start);
            const already = conflicts.find(c => c.lotNumber === ov.lotNumber && c.mode === ov.mode);
            if (!already) {
                conflicts.push({
                    lotNumber:     ov.lotNumber,
                    mode:          ov.mode,
                    overflowEnd:   ov.overflowEnd,
                    conflictStart: cycle2Start,
                    overlapSec
                });
            }
        }
    });

    return conflicts;
}

/**
 * detectGanttAutoFeedConflicts:
 * 標準作業組合せ票（Ganttチャート）上での自動送り干渉を検出する。
 *
 * 【正しい干渉条件の根拠】
 * drawDualCycleBars() は ctx.translate(cycleTime * timeScale, 0) で
 * 2サイクル目を同一行に描画する。
 * そのため行 i での各要素の x 座標（時間値）は：
 *   ・1サイクル目の自動送り: [cumulative_i + manual_i,  cumulative_i + manual_i + auto_i]
 *   ・2サイクル目の作業バー: [cycleTime + cumulative_i, cycleTime + cumulative_i + manual_i]
 * 同一行上での重なり条件：
 *   (cumulative_i + manual_i + auto_i) > (cycleTime + cumulative_i)
 *   ⇒ manual_i + auto_i > cycleTime   ← cumulative_i がキャンセルされる
 *
 * ※ cycleCount=1 のときはサイクル目バーが描画されないため検出不要。
 *
 * @param {Array} conflicts - { key, itemName, mode, overlapSec }[]
 */
function detectGanttAutoFeedConflicts() {
    // マルチサイクル表示がOFFの場合は干渉しようがない → バッジを消して終了
    if (cycleCount < 2) {
        if (typeof updateGanttAutoFeedConflictBadge === 'function') updateGanttAutoFeedConflictBadge([]);
        return;
    }

    if (typeof workItems === 'undefined' || !workItems || workItems.length === 0) {
        if (typeof updateGanttAutoFeedConflictBadge === 'function') updateGanttAutoFeedConflictBadge([]);
        return;
    }

    const conflicts = [];

    /**
     * 各作業について「manual + auto > cycleTime」を判定し、
     * 該当する作業を conflicts に追加する。
     *
     * @param {Array}  items     - 表示対象作業配列（並び順適用済み）
     * @param {string} mode      - 'current' | 'improved'
     * @param {number} cycleTime - そのモードのサイクル時間
     */
    const _checkItems = (items, mode, cycleTime) => {
        if (!cycleTime || cycleTime <= 0) return;

        items.forEach(item => {
            let manualTime, autoTime;
            if (mode === 'improved' && item.improved) {
                manualTime = item.improved.manualTime || 0;
                autoTime   = item.improved.autoTime   || 0;
            } else {
                manualTime = item.manualTime || 0;
                autoTime   = item.autoTime   || 0;
            }

            if (autoTime <= 0) return;

            // ← ここが正しい条件: 累積時間は不要（row座標でキャンセル）
            const overlapSec = (manualTime + autoTime) - cycleTime;
            if (overlapSec > 0) {
                const key = `${item.id}_${mode}`;
                if (!conflicts.find(c => c.key === key)) {
                    conflicts.push({
                        key,
                        itemName:  item.name || '不明',
                        mode,
                        overlapSec: Math.round(overlapSec * 10) / 10
                    });
                }
            }
        });
    };

    if (typeof displayMode !== 'undefined' && displayMode === 'both') {
        const currentItems = (typeof currentWorkOrder !== 'undefined' ? currentWorkOrder : [])
            .map(id => workItems.find(i => i.id === id)).filter(Boolean)
            .filter(i => (i.targetScope || 'common') !== 'improved-only');
        _checkItems(currentItems, 'current', calculateTotalCycleTimeForMode('current'));

        const improvedItems = (typeof improvedWorkOrder !== 'undefined' ? improvedWorkOrder : [])
            .map(id => workItems.find(i => i.id === id)).filter(Boolean)
            .filter(i => (i.targetScope || 'common') !== 'current-only');
        _checkItems(improvedItems, 'improved', calculateTotalCycleTimeForMode('improved'));
    } else {
        const displayItems = getDisplayWorkItems();
        const mode = (typeof displayMode !== 'undefined' && displayMode === 'improved') ? 'improved' : 'current';
        _checkItems(displayItems, mode, calculateTotalCycleTimeForMode(displayItems));
    }

    if (typeof updateGanttAutoFeedConflictBadge === 'function') {
        updateGanttAutoFeedConflictBadge(conflicts);
    }
}


/**
 * Canvas 上に角丸矩形パスを作成するヘルパー。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number|Object} r - 全角同一半径 or { tl, tr, br, bl }
 */
function _roundRect(ctx, x, y, w, h, r) {
    const tl = typeof r === 'object' ? (r.tl || 0) : r;
    const tr = typeof r === 'object' ? (r.tr || 0) : r;
    const br = typeof r === 'object' ? (r.br || 0) : r;
    const bl = typeof r === 'object' ? (r.bl || 0) : r;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
}
