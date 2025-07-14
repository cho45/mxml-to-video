/**
 * MusicStepGenerator - MusicXMLリピート処理とステップ生成
 * script.jsからgenerateSteps関連メソッドを抽出
 */
export class MusicStepGenerator {
    constructor(osmd, options = {}) {
        this.osmd = osmd;
        this.bpm = options.bpm || 120;
        
        // デフォルトのフレットボード音階（標準チューニング）
        this.fretboardNotes = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].reverse().map(n => {
            const open = this.noteToMidi(n);
            return Array(24).fill().map((_, i) => {
                return this.midiToNote(open + i);
            });
        });
        
        // ハーフステップダウンチューニング対応
        if (options.halfStepDown) {
            this.fretboardNotes = ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'].reverse().map(n => {
                const open = this.noteToMidi(n);
                return Array(24).fill().map((_, i) => {
                    return this.midiToNote(open + i);
                });
            });
        }
        
        // リピート処理用の状態変数
        this.virtualToPhysicalMap = null;
        this.virtualCursorPosition = 0;
    }
    
    // ノート名からMIDI番号への変換（簡易版）
    noteToMidi(noteName) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const match = noteName.match(/^([A-G]#?)(\d+)$/);
        if (!match) return 60; // デフォルト値
        
        const note = match[1];
        const octave = parseInt(match[2]);
        const noteIndex = noteNames.indexOf(note);
        return (octave + 1) * 12 + noteIndex;
    }
    
    // MIDI番号からノート名への変換（簡易版）
    midiToNote(midi) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = noteNames[midi % 12];
        return { name: note + octave, midi: midi };
    }

    async generateSteps() {
        const { osmd } = this;
        const wholeNoteLength = 60 / this.bpm * 4;

        // Initialize virtual cursor that handles repeats
        this.initRepeatedCursor();

        // Build step sequence with timing information
        const steps = [];
        let currentTime = 0;
        let stepIndex = 0;

        this.resetRepeatedCursor();
        
        // Process each virtual position using nextWithRepeated() wrapper
        while (this.virtualCursorPosition < this.virtualToPhysicalMap.length) {
            const virtualStep = this.getCurrentVirtualStep();
            const cursor = osmd.cursor;
            
            // Verify cursor position
            const actualMeasure = cursor.Iterator.currentMeasureIndex;
            const actualTimestamp = cursor.Iterator.currentTimeStamp.realValue;
            
            let step = {
                ts: currentTime,
                notes: [],
                stepIndex: stepIndex++,
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
            
            // Calculate time based on timestamp difference to next position
            let stepDuration = 0.25; // Default quarter note length
            
            // Get current and next timestamps to calculate actual duration
            const currentTimestamp = actualTimestamp;
            let nextTimestamp = currentTimestamp + 0.25; // Default
            
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
                    // Different measure: use timestamp to end of current measure
                    nextTimestamp = Math.floor(currentTimestamp) + 1.0; // Next integer measure
                }
            }
            
            stepDuration = nextTimestamp - currentTimestamp;
            
            // Ensure duration is always positive and reasonable
            if (stepDuration <= 0) {
                console.warn(`Invalid duration ${stepDuration} at step ${stepIndex-1}, using default 0.25`);
                stepDuration = 0.25;
            }
            
            // Store the calculated duration in the step
            step.stepDuration = stepDuration;
            
            steps.push(step);
            console.log(`Step ${stepIndex-1}: virtual=${this.virtualCursorPosition}, measure=${actualMeasure}, timestamp=${actualTimestamp}, notes=${step.notes.length}, duration=${stepDuration}`);
            
            // Move to next position using the wrapper
            const hasNext = this.nextWithRepeated();
            if (!hasNext) break;
            
            currentTime += stepDuration * wholeNoteLength;
        }

        console.log('Generated steps with virtual cursor:', steps.length);
        
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
                cursor.next();
                if (cursor.Iterator.currentMeasureIndex > currentMeasure) {
                    currentMeasure = cursor.Iterator.currentMeasureIndex;
                }
            }
            
            // If we overshot or need to go back, use reset (rare case for first occurrence)
            if (cursor.Iterator.currentMeasureIndex !== measureInfo.measureIndex) {
                cursor.reset();
                while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex < measureInfo.measureIndex) {
                    cursor.next();
                }
                currentMeasure = cursor.Iterator.currentMeasureIndex;
            }
            
            // Record all positions in this measure
            while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex === measureInfo.measureIndex) {
                // Record current position BEFORE moving to next
                this.virtualToPhysicalMap[virtualPosition] = {
                    physicalMeasure: cursor.Iterator.currentMeasureIndex,
                    physicalTimestamp: cursor.Iterator.currentTimeStamp.realValue,
                    virtualMeasure: measureInfo.measureIndex, // The logical measure in repeat sequence
                    virtualPosition: virtualPosition // For debugging
                };
                virtualPosition++;
                cursor.next();
            }
            
            // Update current measure for next iteration
            if (!cursor.Iterator.EndReached) {
                currentMeasure = cursor.Iterator.currentMeasureIndex;
            }
        }
        
        console.log('Virtual cursor map created:', this.virtualToPhysicalMap.length, 'positions');
        console.log('First few mappings:');
        for (let i = 0; i < Math.min(15, this.virtualToPhysicalMap.length); i++) {
            const mapping = this.virtualToPhysicalMap[i];
            console.log(`  ${i}: virtual=${mapping.virtualMeasure}, physical=${mapping.physicalMeasure}, timestamp=${mapping.physicalTimestamp}`);
        }
        
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
        
        console.log(`Moving from virtual ${this.virtualCursorPosition} to ${this.virtualCursorPosition + 1}: measure ${current.physicalMeasure}@${current.physicalTimestamp} -> ${next.physicalMeasure}@${next.physicalTimestamp}`);
        
        // Calculate relative movement needed
        if (next.physicalMeasure === current.physicalMeasure && 
            next.physicalTimestamp > current.physicalTimestamp) {
            // Same measure, forward movement
            console.log(`  Forward movement within measure ${next.physicalMeasure}`);
            cursor.next();
        } else if (next.physicalMeasure === current.physicalMeasure + 1) {
            // Next measure
            console.log(`  Moving to next measure ${next.physicalMeasure}`);
            cursor.next();
        } else if (next.physicalMeasure < current.physicalMeasure || 
                  (next.physicalMeasure === current.physicalMeasure && next.physicalTimestamp < current.physicalTimestamp)) {
            // Repeat jump backward (measure or timestamp)
            console.log(`  Repeat jump: measure ${current.physicalMeasure}@${current.physicalTimestamp} -> ${next.physicalMeasure}@${next.physicalTimestamp}`);
            const measureDiff = current.physicalMeasure - next.physicalMeasure;
            const timestampDiff = current.physicalTimestamp - next.physicalTimestamp;
            
            // Calculate approximate steps to go back
            // Each measure typically has 4 quarter-note positions (0, 0.25, 0.5, 0.75)
            const stepsBack = Math.round(measureDiff * 4 + timestampDiff * 4);
            console.log(`  Going back ${stepsBack} steps (${measureDiff} measures + ${timestampDiff} timestamp diff)`);
            
            for (let i = 0; i < stepsBack; i++) {
                if (!cursor.Iterator.FrontReached) {
                    cursor.previous();
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
                    console.log(`  Fine-tuned to correct position: ${curMeasure}@${curTimestamp}`);
                    break;
                } else if (curMeasure < next.physicalMeasure || 
                          (curMeasure === next.physicalMeasure && curTimestamp < next.physicalTimestamp)) {
                    cursor.next();
                } else {
                    cursor.previous();
                }
                iterations++;
            }
        } else {
            // Other cases - fallback to single next()
            console.log(`  Fallback: single next() movement`);
            cursor.next();
        }
        
        // Verify final position
        const finalMeasure = cursor.Iterator.currentMeasureIndex;
        const finalTimestamp = cursor.Iterator.currentTimeStamp.realValue;
        console.log(`  Final position: ${finalMeasure}@${finalTimestamp} (expected: ${next.physicalMeasure}@${next.physicalTimestamp})`);
        
        this.virtualCursorPosition++;
        return true;
    }

    getCurrentVirtualStep() {
        if (this.virtualCursorPosition < this.virtualToPhysicalMap.length) {
            return this.virtualToPhysicalMap[this.virtualCursorPosition];
        }
        return null;
    }

    async syncCursorToVirtualPosition(targetVirtualPos) {
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
        
        console.log('Building playback sequence for', sheet.SourceMeasures.length, 'measures');
        
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
                console.log(`Measure ${i} firstRepetitionInstructions:`, sourceMeasure.firstRepetitionInstructions);
                for (let instr of sourceMeasure.firstRepetitionInstructions) {
                    console.log(`  -> type: ${instr.type}, constructor: ${instr.constructor.name}`);
                    if (instr.type === 0) { // Start repeat
                        measureInfo.hasStartRepeat = true;
                        console.log(`Measure ${i}: start repeat detected`);
                        break;
                    }
                }
            }
            
            if (sourceMeasure.lastRepetitionInstructions && sourceMeasure.lastRepetitionInstructions.length > 0) {
                console.log(`Measure ${i} lastRepetitionInstructions:`, sourceMeasure.lastRepetitionInstructions);
                for (let instr of sourceMeasure.lastRepetitionInstructions) {
                    console.log(`  -> type: ${instr.type}, constructor: ${instr.constructor.name}`);
                    if (instr.type === 1 || instr.type === 2) { // End repeat
                        measureInfo.hasEndRepeat = true;
                        console.log(`Measure ${i}: end repeat detected`);
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

        console.log('=== Building playback sequence ===');
        while (i < measures.length) {
            const measure = measures[i];
            console.log(`Processing measure ${i}: start=${measure.hasStartRepeat}, end=${measure.hasEndRepeat}`);

            if (measure.hasStartRepeat) {
                repeatStack.push(i);
                console.log(`  -> Added start repeat at ${i}, stack:`, repeatStack);
            }

            playbackSequence.push(measure);
            console.log(`  -> Added measure ${i} to sequence`);

            if (measure.hasEndRepeat) {
                console.log(`  -> End repeat found at measure ${i}`);
                if (repeatStack.length > 0) {
                    const startRepeatIndex = repeatStack.pop();
                    console.log(`  -> Repeating from ${startRepeatIndex} to ${i}`);
                    // Add the repeated section once
                    for (let j = startRepeatIndex; j <= i; j++) {
                        playbackSequence.push(measures[j]);
                        console.log(`    -> Added repeated measure ${j}`);
                    }
                } else {
                    console.log(`  -> No start repeat, repeating from beginning to ${i}`);
                    // End repeat without start repeat - repeat from beginning
                    for (let j = 0; j <= i; j++) {
                        playbackSequence.push(measures[j]);
                        console.log(`    -> Added repeated measure ${j}`);
                    }
                }
            }

            i++;
        }

        console.log(`Generated ${playbackSequence.length} measures from ${measures.length} original measures`);
        return playbackSequence;
    }
}