/**
 * MusicStepGenerator - MusicXMLリピート処理とステップ生成
 * note.Length.realValue: 0.25              // 四分音符 = 0.25単位
 * actualTimestamp: 0, 0.25, 0.5, 0.75...   // 四分音符刻み
 * stepDuration: 0.25                        // 四分音符間隔 = 0.25単位 
 * 3/4 拍子でも同じ。
 * note.Length.realValue
 *
 * 四分音符: 0.25
 * 半音符:   0.5
 * 全音符:   1.0
 * 付点半音符: 0.75（3/4拍子の最後の音）
 * cursor.Iterator.currentTimeStamp.realValue
 * // 4/4拍子
 * 0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0...
 * // 3/4拍子  
 * 0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5...
 */
export class MusicStepGenerator {
    constructor(osmd, options = {}) {
        this.osmd = osmd;
        this.defaultBpm = options.bpm || 120;
        this.fretboardNotes = options.fretboardNotes || [];
        
        // 楽譜からBPMを取得、なければデフォルト値を使用
        this.bpm = this.extractBpmFromScore() || this.defaultBpm;
        
        // リピート処理用の状態変数
        this.virtualToPhysicalMap = null;
        this.virtualCursorPosition = 0;
    }
    
    /**
     * 楽譜から時系列の演奏ステップを生成
     * @returns {Array<Object>} steps - 演奏ステップの配列
     * @returns {number} steps[].ts - ステップ開始時刻(秒)
     * @returns {number} steps[].virtualMeasure - 論理小節番号(リピート展開後)
     * @returns {number} steps[].physicalMeasure - 物理小節番号(楽譜上の実際の小節)
     * @returns {number} steps[].virtualPosition - リピート展開後の線形演奏順序における位置インデックス
     * @returns {number} steps[].stepDuration - 次ステップまでの継続時間(秒)
     * @returns {Array<Object>} steps[].notes - 同時演奏音符の配列
     * @returns {Object} steps[].notes[].note - OSMD音符オブジェクト
     * @returns {number} steps[].notes[].duration - 音符継続時間(秒)
     * @returns {number} steps[].notes[].volume - 音量
     * @returns {number} steps[].notes[].string - 弦番号(1-6)
     * @returns {number} steps[].notes[].fret - フレット番号
     * @returns {string} steps[].notes[].fretboardNote - 音名
     */
    async generateSteps() {
        const { osmd } = this;
        const wholeNoteLength = 60 / this.bpm * 4;
        

        // Initialize virtual cursor that handles repeats
        this.initRepeatedCursor();

        // Build step sequence with timing information
        const steps = [];
        let currentTime = 0;

        // Process each virtual position using nextWithRepeated() wrapper
        while (this.virtualCursorPosition < this.virtualToPhysicalMap.length) {
            const virtualStep = this.getCurrentVirtualStep();
            const cursor = osmd.cursor;
            
            // Use virtual mapping for consistent measure/timestamp info
            const actualMeasure = virtualStep.physicalMeasure;
            const actualTimestamp = virtualStep.physicalTimestamp;
            
            let step = {
                ts: currentTime,
                notes: [],
                virtualMeasure: virtualStep.virtualMeasure,
                physicalMeasure: actualMeasure,
                virtualPosition: this.virtualCursorPosition,
                stepDuration: 0 // Will be calculated later
            };

            // Collect notes at current position
            const currentVoiceEntries = cursor.Iterator.CurrentVoiceEntries;
            if (currentVoiceEntries && currentVoiceEntries.length) {
                for (let entry of currentVoiceEntries) {
                    if (!entry.ParentSourceStaffEntry.ParentStaff.isTab) continue;

                    for (let note of entry.Notes) {
                        if (note.isRest()) continue;
                        
                        
                        let duration = note.Length.realValue * wholeNoteLength;
                        if (note.NoteTie) {
                            if (note.NoteTie.StartNote === note) {
                                duration += note.NoteTie.Notes[1].Length.realValue * wholeNoteLength;
                            } else {
                                continue;
                            }
                        }

                        let volume = note.ParentVoiceEntry.ParentVoice.Volume;
                        const string = note.StringNumberTab;
                        const fret = note.FretNumber;
                        step.notes.push({
                            note, duration, volume, string, fret,
                            fretboardNote: this.fretboardNotes[string - 1][fret],
                        });
                    }
                }
            }
            
            
            // Get current timestamp from virtual position
            const currentTimestamp = actualTimestamp;
            // Next timestamps to calculate actual duration
            let nextTimestamp;
            // Calculate time based on timestamp difference to next position
            let stepDuration;
            
            // Look ahead to next virtual position to get real timestamp difference
            if (this.virtualCursorPosition < this.virtualToPhysicalMap.length - 1) {
                const nextVirtualStep = this.virtualToPhysicalMap[this.virtualCursorPosition + 1];
                
                // Check if this is a repeat jump (backward movement)
                const isRepeatJump = (nextVirtualStep.physicalMeasure < actualMeasure || 
                                        (nextVirtualStep.physicalMeasure === actualMeasure && nextVirtualStep.physicalTimestamp < currentTimestamp));
                
                if (isRepeatJump) {
                    // For repeat jumps, use duration to end of current measure
                    nextTimestamp = Math.floor(currentTimestamp) + 1.0;
                } else if (nextVirtualStep.physicalMeasure === actualMeasure) {
                    // Same measure: use timestamp difference
                    nextTimestamp = nextVirtualStep.physicalTimestamp;
                } else {
                    // Different measure: use next step's timestamp directly
                    nextTimestamp = nextVirtualStep.physicalTimestamp;
                }
            } else {
                // Last step: use maximum note duration from all notes in this step
                let maxNoteDuration = 0.25; // Default quarter note
                if (currentVoiceEntries && currentVoiceEntries.length) {
                    for (let entry of currentVoiceEntries) {
                        if (!entry.ParentSourceStaffEntry.ParentStaff.isTab) continue;
                        for (let note of entry.Notes) {
                            if (note.isRest()) continue;
                            maxNoteDuration = Math.max(maxNoteDuration, note.Length.realValue);
                        }
                    }
                }
                stepDuration = maxNoteDuration;
            }
            
            // Only calculate from timestamps if not the last step
            if (this.virtualCursorPosition < this.virtualToPhysicalMap.length - 1) {
                stepDuration = nextTimestamp - currentTimestamp;
                
            }
            
            // Ensure duration is always positive and reasonable
            if (stepDuration <= 0) {
                console.warn(`Invalid duration ${stepDuration} at step ${this.virtualCursorPosition}, using default 0.25`);
                stepDuration = 0.25;
            }
            
            // Convert stepDuration from OSMD units to seconds
            const stepDurationInSeconds = stepDuration * wholeNoteLength;
            step.stepDuration = stepDurationInSeconds;
            
            steps.push(step);
            
            // Move to next position using the wrapper
            const hasNext = this.nextWithRepeated();
            if (!hasNext) break;
            
            currentTime += stepDurationInSeconds;
        }

        // Reset cursor to beginning for playback
        this.resetRepeatedCursor();
        return steps;
    }

    // Cursor wrapper that handles repeats transparently
    initRepeatedCursor() {
        const { osmd } = this;
        const cursor = osmd.cursor;
        
        // Build the virtual sequence that includes repeats
        const playbackSequence = this.buildPlaybackSequence();
        
        // Map virtual positions to physical positions
        this.virtualToPhysicalMap = [];
        let virtualPosition = 0;
        
        // Start from the beginning
        cursor.reset();
        let currentMeasure = 0;
        
        for (let measureInfo of playbackSequence) {
            // Navigate to target measure using relative movement
            while (currentMeasure < measureInfo.measureIndex && !cursor.Iterator.EndReached) {
                cursor.Iterator.moveToNext();
                if (cursor.Iterator.currentMeasureIndex > currentMeasure) {
                    currentMeasure = cursor.Iterator.currentMeasureIndex;
                }
            }
            
            // If we overshot or need to go back, use reset (rare case for first occurrence)
            if (cursor.Iterator.currentMeasureIndex !== measureInfo.measureIndex) {
                cursor.reset();
                while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex < measureInfo.measureIndex) {
                    cursor.Iterator.moveToNext();
                }
                currentMeasure = cursor.Iterator.currentMeasureIndex;
            }
            
            // Record all positions in this measure
            while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex === measureInfo.measureIndex) {
                // Record current position BEFORE moving to next
                this.virtualToPhysicalMap[virtualPosition] = {
                    physicalMeasure: cursor.Iterator.currentMeasureIndex,
                    physicalTimestamp: cursor.Iterator.currentTimeStamp.realValue,
                    virtualMeasure: measureInfo.measureIndex, // The logical measure in repeat sequenc
                    virtualPosition: virtualPosition // For debugging
                };
                virtualPosition++;
                cursor.Iterator.moveToNext();
            }
            
            // Update current measure for next iteration
            if (!cursor.Iterator.EndReached) {
                currentMeasure = cursor.Iterator.currentMeasureIndex;
            }
        }

        cursor.update();

        // Initialize virtual cursor state
        this.virtualCursorPosition = 0;
        this.resetRepeatedCursor();
    }

    resetRepeatedCursor() {
        const { osmd } = this;
        const cursor = osmd.cursor;
        cursor.reset();
        this.virtualCursorPosition = 0;
    }

    nextWithRepeated() {
        const { osmd } = this;
        const cursor = osmd.cursor;
        
        if (this.virtualCursorPosition >= this.virtualToPhysicalMap.length - 1) {
            return false; // End reached
        }
        
        const current = this.virtualToPhysicalMap[this.virtualCursorPosition];
        const next = this.virtualToPhysicalMap[this.virtualCursorPosition + 1];
        
        // Calculate relative movement needed
        if (next.physicalMeasure === current.physicalMeasure && 
            next.physicalTimestamp > current.physicalTimestamp) {
            // Same measure, forward movement
            cursor.Iterator.moveToNext();
        } else 
        if (next.physicalMeasure === current.physicalMeasure + 1) {
            // Next measure
            cursor.Iterator.moveToNext();
        } else
        if (
            next.physicalMeasure < current.physicalMeasure || 
            (next.physicalMeasure === current.physicalMeasure && next.physicalTimestamp < current.physicalTimestamp)
        ) {
            // Repeat jump backward (measure or timestamp)
            const measureDiff = current.physicalMeasure - next.physicalMeasure;
            const timestampDiff = current.physicalTimestamp - next.physicalTimestamp;
            
            // Calculate approximate steps to go back
            // Each measure typically has 4 quarter-note positions (0, 0.25, 0.5, 0.75)
            const stepsBack = Math.round(measureDiff * 4 + timestampDiff * 4);
            
            for (let i = 0; i < stepsBack; i++) {
                if (!cursor.Iterator.FrontReached) {
                    cursor.Iterator.moveToPrevious();
                } else {
                    console.warn(`  Hit front boundary after ${i} steps`);
                    break;
                }
            }
            
            // Fine-tune position if needed
            let iterations = 0;
            while (iterations < 10 && !cursor.Iterator.EndReached) {
                const curMeasure = cursor.Iterator.currentMeasureIndex;
                const curTimestamp = cursor.Iterator.currentTimeStamp.realValue;
                
                if (curMeasure === next.physicalMeasure && 
                    Math.abs(curTimestamp - next.physicalTimestamp) < 0.01) {
                    break;
                } else if (curMeasure < next.physicalMeasure || 
                          (curMeasure === next.physicalMeasure && curTimestamp < next.physicalTimestamp)) {
                    cursor.Iterator.moveToNext();
                } else {
                    cursor.Iterator.moveToPrevious();
                }
                iterations++;
            }
        } else {
            // Other cases - fallback to single next()
            cursor.Iterator.moveToNext();
        }
        cursor.update();
        
        this.virtualCursorPosition++;
        return true;
    }

    getCurrentVirtualStep() {
        if (this.virtualCursorPosition < this.virtualToPhysicalMap.length) {
            return this.virtualToPhysicalMap[this.virtualCursorPosition];
        }
        return null;
    }

    syncCursorToVirtualPosition(targetVirtualPos) {
        if (targetVirtualPos < 0 || targetVirtualPos >= this.virtualToPhysicalMap.length) {
            console.warn(`Invalid virtual position: ${targetVirtualPos}`);
            return;
        }

        const currentVirtual = this.virtualCursorPosition;
        
        // If already at target position, no movement needed
        if (currentVirtual === targetVirtualPos) {
            return;
        }

        // Use nextWithRepeated() for efficient relative movement
        if (targetVirtualPos > currentVirtual) {
            // Forward movement
            while (this.virtualCursorPosition < targetVirtualPos) {
                if (!this.nextWithRepeated()) break;
            }
        } else {
            // Backward movement - reset and move forward to target
            // This is rare during normal playback
            this.resetRepeatedCursor();
            while (this.virtualCursorPosition < targetVirtualPos) {
                if (!this.nextWithRepeated()) break;
            }
        }
    }

    buildPlaybackSequence() {
        const { osmd } = this;
        const sheet = osmd.Sheet;
        
        // Safety check: limit processing for very large files
        const maxMeasures = 200;
        if (sheet.SourceMeasures.length > maxMeasures) {
            console.warn(`File has ${sheet.SourceMeasures.length} measures. Processing only first ${maxMeasures} measures for performance.`);
        }
        const measureCount = Math.min(sheet.SourceMeasures.length, maxMeasures);

        // Use OSMD's built-in repetition handling through Parts structure
        const measures = [];
        
        // First, analyze repeat information from the musical structure
        for (let i = 0; i < measureCount; i++) {
            const sourceMeasure = sheet.SourceMeasures[i];
            const measureInfo = {
                measureIndex: i,
                measureNumber: sourceMeasure.MeasureNumber,
                hasStartRepeat: false,
                hasEndRepeat: false,
                endingsCount: 2  // Default: play once + repeat once = 2 total times
            };

            // Check OSMD's firstRepetitionInstructions and lastRepetitionInstructions
            if (sourceMeasure.firstRepetitionInstructions && sourceMeasure.firstRepetitionInstructions.length > 0) {
                for (let instr of sourceMeasure.firstRepetitionInstructions) {
                    if (instr.type === 0) { // Start repeat
                        measureInfo.hasStartRepeat = true;
                        break;
                    }
                }
            }
            
            if (sourceMeasure.lastRepetitionInstructions && sourceMeasure.lastRepetitionInstructions.length > 0) {
                for (let instr of sourceMeasure.lastRepetitionInstructions) {
                    if (instr.type === 1 || instr.type === 2) { // End repeat
                        measureInfo.hasEndRepeat = true;
                        break;
                    }
                }
            }

            // Also check GraphicSheet for completeness
            if (osmd.GraphicSheet?.MeasureList[i]) {
                const graphicMeasure = osmd.GraphicSheet.MeasureList[i][0];
                if (graphicMeasure?.beginRepeat) measureInfo.hasStartRepeat = true;
                if (graphicMeasure?.endRepeat) measureInfo.hasEndRepeat = true;
            }
            
            measures.push(measureInfo);
        }

        // Build playback sequence with repeat handling (simplified logic)
        const playbackSequence = [];
        let i = 0;
        let repeatStack = [];

        while (i < measures.length) {
            const measure = measures[i];

            if (measure.hasStartRepeat) {
                repeatStack.push(i);
            }

            playbackSequence.push(measure);

            if (measure.hasEndRepeat) {
                if (repeatStack.length > 0) {
                    const startRepeatIndex = repeatStack.pop();
                    // Add the repeated section once
                    for (let j = startRepeatIndex; j <= i; j++) {
                        playbackSequence.push(measures[j]);
                    }
                } else {
                    // End repeat without start repeat - repeat from beginning
                    for (let j = 0; j <= i; j++) {
                        playbackSequence.push(measures[j]);
                    }
                }
            }

            i++;
        }

        return playbackSequence;
    }

    getTimeSignatureForMeasure(measureIndex) {
        const { osmd } = this;
        const sheet = osmd.Sheet;
        
        // Default to 4/4 if not found
        let timeSignature = { numerator: 4, denominator: 4 };
        
        // Look for time signature in current measure or previous measures
        for (let i = measureIndex; i >= 0; i--) {
            if (i < sheet.SourceMeasures.length) {
                const measure = sheet.SourceMeasures[i];
                if (measure.ActiveTimeSignature) {
                    timeSignature = {
                        numerator: measure.ActiveTimeSignature.Numerator,
                        denominator: measure.ActiveTimeSignature.Denominator
                    };
                    break;
                }
            }
        }
        
        return timeSignature;
    }

    extractBpmFromScore() {
        const { osmd } = this;
        const sheet = osmd.Sheet;
        
        // 楽譜からテンポ情報を検索
        if (sheet && sheet.SourceMeasures && sheet.SourceMeasures.length > 0) {
            // 最初の小節から開始してテンポ情報を探す
            for (let measureIndex = 0; measureIndex < sheet.SourceMeasures.length; measureIndex++) {
                const measure = sheet.SourceMeasures[measureIndex];
                
                // テンポ表現を確認
                if (measure.TempoExpressions && measure.TempoExpressions.length > 0) {
                    for (let tempoExpr of measure.TempoExpressions) {
                        if (tempoExpr.TempoInBpm) {
                            console.warn(`Found tempo expression in measure ${measureIndex}: ${tempoExpr.TempoInBpm} BPM`);
                            return tempoExpr.TempoInBpm;
                        }
                    }
                }
                
                // ソースから直接テンポを確認
                if (measure.FirstInstructionsStaffEntries) {
                    for (let staffEntry of measure.FirstInstructionsStaffEntries) {
                        if (staffEntry && staffEntry.Instructions) {
                            for (let instruction of staffEntry.Instructions) {
                                if (instruction.TempoInBpm) {
                                    console.warn(`Found tempo instruction in measure ${measureIndex}: ${instruction.TempoInBpm} BPM`);
                                    return instruction.TempoInBpm;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // OSMD Sheet のデフォルトテンポを確認
        if (sheet && sheet.DefaultStartTempoInBpm && sheet.DefaultStartTempoInBpm > 0) {
            console.warn(`Using default tempo from OSMD Sheet: ${sheet.DefaultStartTempoInBpm} BPM`);
            return sheet.DefaultStartTempoInBpm;
        }
        
        // OSMD からのテンポ情報を確認
        if (osmd.Sheet && osmd.Sheet.tempoInBPM && osmd.Sheet.tempoInBPM > 0) {
            console.warn(`Using tempo from OSMD Sheet: ${osmd.Sheet.tempoInBPM} BPM`);
            return osmd.Sheet.tempoInBPM;
        }
        
        console.warn('No BPM information found in score, using default:', this.defaultBpm);
        return null;
    }
}
