import { describe, it, expect, beforeEach } from 'vitest'
import { MusicStepGenerator } from '../src/MusicStepGenerator.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Note } from 'tonal';

const OSMD = await import('../lib/opensheetmusicdisplay.min.js')

// カスタムマッチャーの定義
expect.extend({
  toBeSameSteps(received, expected) {
    const { isNot, utils } = this

    if (received.length !== expected.length) {
      return {
        message: () => `Expected ${expected.length} steps, but received ${received.length}`,
        pass: false
      }
    }

    for (let i = 0; i < expected.length; i++) {
      const actualStep = received[i]
      const expectedStep = expected[i]

      // 浮動小数点数の比較（デフォルト精度5桁）
      if (Math.abs(actualStep.ts - expectedStep.ts) > 1e-5) {
        return {
          message: () => `Step ${i}: ts expected ${expectedStep.ts}, but received ${actualStep.ts}`,
          pass: false
        }
      }

      if (Math.abs(actualStep.stepDuration - expectedStep.stepDuration) > 1e-5) {
        return {
          message: () => `Step ${i}: stepDuration expected ${expectedStep.stepDuration}, but received ${actualStep.stepDuration}`,
          pass: false
        }
      }

      // 整数フィールドの比較
      if (actualStep.virtualMeasure !== expectedStep.virtualMeasure) {
        return {
          message: () => `Step ${i}: virtualMeasure expected ${expectedStep.virtualMeasure}, but received ${actualStep.virtualMeasure}`,
          pass: false
        }
      }

      if (actualStep.physicalMeasure !== expectedStep.physicalMeasure) {
        return {
          message: () => `Step ${i}: physicalMeasure expected ${expectedStep.physicalMeasure}, but received ${actualStep.physicalMeasure}`,
          pass: false
        }
      }

      if (actualStep.virtualPosition !== expectedStep.virtualPosition) {
        return {
          message: () => `Step ${i}: virtualPosition expected ${expectedStep.virtualPosition}, but received ${actualStep.virtualPosition}`,
          pass: false
        }
      }

      // notes配列の比較
      if (actualStep.notes.length !== expectedStep.notes.length) {
        return {
          message: () => `Step ${i}: expected ${expectedStep.notes.length} notes, but received ${actualStep.notes.length}`,
          pass: false
        }
      }

      for (let j = 0; j < expectedStep.notes.length; j++) {
        const actualNote = actualStep.notes[j]
        const expectedNote = expectedStep.notes[j]

        if (Math.abs(actualNote.duration - expectedNote.duration) > 1e-5) {
          return {
            message: () => `Step ${i}, Note ${j}: duration expected ${expectedNote.duration}, but received ${actualNote.duration}`,
            pass: false
          }
        }

        if (actualNote.volume !== expectedNote.volume) {
          return {
            message: () => `Step ${i}, Note ${j}: volume expected ${expectedNote.volume}, but received ${actualNote.volume}`,
            pass: false
          }
        }

        if (actualNote.string !== expectedNote.string) {
          return {
            message: () => `Step ${i}, Note ${j}: string expected ${expectedNote.string}, but received ${actualNote.string}`,
            pass: false
          }
        }

        if (actualNote.fret !== expectedNote.fret) {
          return {
            message: () => `Step ${i}, Note ${j}: fret expected ${expectedNote.fret}, but received ${actualNote.fret}`,
            pass: false
          }
        }

        if (actualNote.fretboardNote !== expectedNote.fretboardNote) {
          return {
            message: () => `Step ${i}, Note ${j}: fretboardNote expected ${expectedNote.fretboardNote}, but received ${actualNote.fretboardNote}`,
            pass: false
          }
        }
      }
    }

    return {
      message: () => `Steps are ${isNot ? 'unexpectedly ' : ''}the same`,
      pass: true
    }
  }
})

describe('generateSteps() - Music XML Test Files', () => {
  let container;
  const OSMDClass = OSMD.OpenSheetMusicDisplay;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1280px';
    container.style.height = '720px';
    document.body.appendChild(container);
  });

  async function setupGenerator(filename, options = {}) {
    const filePath = resolve(`./test/assets/${filename}`);
    const musicXMLContent = readFileSync(filePath, 'utf8');

    const osmd = new OSMDClass(container);
    await osmd.load(musicXMLContent);

    osmd.setOptions({
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawCredits: false,
      drawLyricist: false,
      drawPartAbbreviations: false,
      drawPartNames: false,
      drawMeasureNumbers: false,
      autoResize: true,
      renderSingleHorizontalStaffline: true,
    });

    osmd.render();

    const fretboardNotes = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].reverse().map(n => {
      const open = Note.get(n).midi;
      return Array(24).fill().map((_, i) => {
        return Note.fromMidi(open + i);
      });
    });

    const defaultOptions = { bpm: 1, fretboardNotes: fretboardNotes };
    return new MusicStepGenerator(osmd, { ...defaultOptions, ...options });
  }

  describe('sample-basic.musicxml', () => {
    it('should generate expected steps for basic 4/4 guitar tab', async () => {
      // 131 BPM: quarter note = 60/131 ≈ 0.4580152671... seconds
      const quarterNoteTime = 60 / 131;

      const expectedBasic = [
        {
          "ts": 0,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": quarterNoteTime, // 四分音符の時間（秒）
          "notes": [
            {
              "duration": quarterNoteTime, // 四分音符の時間（秒）
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": "E4"
            }
          ]
        },
        {
          "ts": quarterNoteTime,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 1,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": "F4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 2,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 2,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": "G4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 3,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 3,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": "A4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 4,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": "B3"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 5,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": "C4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 6,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 6,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": "D4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 7,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 7,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": "E4"
            }
          ]
        }
      ];

      const generator = await setupGenerator('sample-basic.musicxml');
      const steps = await generator.generateSteps();

      expect(steps).toBeSameSteps(expectedBasic);
    });
  });

  describe('sample-3-4.musicxml', () => {
    it('should generate expected steps for 3/4 time signature', async () => {
      // 131 BPM: quarter note = 60/131 ≈ 0.4580152671... seconds
      const quarterNoteTime = 60 / 131;

      const expectedThreeFour = [
        {
          "ts": 0,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": "C4"
            }
          ]
        },
        {
          "ts": quarterNoteTime,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 1,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": "D4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 2,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 2,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": "E4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 3,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 3,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": "F4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 4,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": "G4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 5,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": "A4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 6,
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 6,
          "stepDuration": quarterNoteTime * 3,
          "notes": [
            {
              "duration": quarterNoteTime * 3, // 付点半音符（秒）
              "volume": 1,
              "string": 3,
              "fret": 0,
              "fretboardNote": "G3"
            }
          ]
        }
      ];

      const generator = await setupGenerator('sample-3-4.musicxml');
      const steps = await generator.generateSteps();

      expect(steps).toBeSameSteps(expectedThreeFour);
    });
  });

  describe('sample-repeat.musicxml', () => {
    it('should generate expected steps with repeat processing', async () => {
      // 131 BPM: quarter note = 60/131 ≈ 0.4580152671... seconds
      const quarterNoteTime = 60 / 131;

      const expectedRepeat = [
        {
          "ts": 0,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": "E4"
            }
          ]
        },
        {
          "ts": quarterNoteTime,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 1,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": "F4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 2,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 2,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": "G4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 3,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 3,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": "A4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 4,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": "B3"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 5,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": "C4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 6,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 6,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": "D4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 7,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 7,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": "E4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 8,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 8,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": "E4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 9,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 9,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": "F4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 10,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 10,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": "G4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 11,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 11,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": "A4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 12,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 12,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": "B3"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 13,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 13,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": "C4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 14,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 14,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": "D4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 15,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 15,
          "stepDuration": quarterNoteTime,
          "notes": [
            {
              "duration": quarterNoteTime,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": "E4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 16,
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 16,
          "stepDuration": quarterNoteTime * 2, // 半音符（秒）
          "notes": [
            {
              "duration": quarterNoteTime * 2, // 半音符（秒）
              "volume": 1,
              "string": 3,
              "fret": 0,
              "fretboardNote": "G3"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 18,
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 17,
          "stepDuration": quarterNoteTime * 2,
          "notes": [
            {
              "duration": quarterNoteTime * 2,
              "volume": 1,
              "string": 3,
              "fret": 5,
              "fretboardNote": "C4"
            }
          ]
        },
        {
          "ts": quarterNoteTime * 20,
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 18,
          "stepDuration": quarterNoteTime * 4,
          "notes": [
            {
              "duration": quarterNoteTime * 4,
              "volume": 1,
              "string": 3,
              "fret": 5,
              "fretboardNote": "C4",
            }
          ]
        }
      ];

      const generator = await setupGenerator('sample-repeat.musicxml');
      const steps = await generator.generateSteps();

      expect(steps).toBeSameSteps(expectedRepeat);
    });
  });

  describe('sample-tempo.musicxml', () => {
    it('should generate expected steps with repeat processing', async () => {
      // 131 BPM: quarter note = 60/131 ≈ 0.4580152671... seconds
      const quarterNoteTime = 60 / 80;

      const expectedRepeat = [
        {
          "ts": 0,
          "notes": [

          ],
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": 3
        },
        {
          "ts": 3,
          "notes": [
            {
              "duration": 0.375,
              "volume": 1,
              "string": 5,
              "fret": 0,
              "fretboardNote": "A2"
            }
          ],
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 1,
          "stepDuration": 0.375
        },
        {
          "ts": 3.375,
          "notes": [
            {
              "duration": 0.375,
              "volume": 1,
              "string": 3,
              "fret": 2,
              "fretboardNote": "A3"
            }
          ],
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 2,
          "stepDuration": 0.375
        },
        {
          "ts": 3.75,
          "notes": [
            {
              "duration": 0.375,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": "B3"
            }
          ],
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 3,
          "stepDuration": 0.375
        },
        {
          "ts": 4.125,
          "notes": [
            {
              "duration": 1.5,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": "E4"
            }
          ],
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": 1.5
        },
        {
          "ts": 5.625,
          "notes": [

          ],
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": 0.375
        },
        {
          "ts": 6,
          "notes": [

          ],
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 6,
          "stepDuration": 3
        },
        {
          "ts": 9,
          "notes": [
            {
              "duration": 0.375,
              "volume": 1,
              "string": 5,
              "fret": 0,
              "fretboardNote": "A2"
            }
          ],
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 7,
          "stepDuration": 0.375
        },
        {
          "ts": 9.375,
          "notes": [
            {
              "duration": 0.375,
              "volume": 1,
              "string": 3,
              "fret": 2,
              "fretboardNote": "A3"
            }
          ],
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 8,
          "stepDuration": 0.375
        },
        {
          "ts": 9.75,
          "notes": [
            {
              "duration": 0.375,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": "B3"
            }
          ],
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 9,
          "stepDuration": 0.375
        },
        {
          "ts": 10.125,
          "notes": [
            {
              "duration": 1.5,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": "E4"
            }
          ],
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 10,
          "stepDuration": 1.5
        },
        {
          "ts": 11.625,
          "notes": [

          ],
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 11,
          "stepDuration": 0.375
        },
        {
          "ts": 12,
          "notes": [

          ],
          "virtualMeasure": 4,
          "physicalMeasure": 4,
          "virtualPosition": 12,
          "stepDuration": 0.75
        }
      ];

      const generator = await setupGenerator('sample-tempo.musicxml');
      const steps = await generator.generateSteps();
      steps.forEach(step => {
        step.notes.forEach(note => {
          delete note.note;
        });
        delete step.voiceEntry;
      });
      console.log(JSON.stringify(steps));

      expect(steps).toBeSameSteps(expectedRepeat);
    });
  });
});
