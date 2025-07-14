import { describe, it, expect, beforeEach } from 'vitest'
import { MusicStepGenerator } from '../src/MusicStepGenerator.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OSMD = await import('../lib/opensheetmusicdisplay.min.js')

describe('generateSteps() - Music XML Test Files', () => {
  let container;
  const OSMDClass = OSMD.OpenSheetMusicDisplay;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1280px';
    container.style.height = '720px';
    document.body.appendChild(container);
  });

  function serializeSteps(steps) {
    return steps.map(step => ({
      ts: step.ts,
      stepIndex: step.stepIndex,
      virtualMeasure: step.virtualMeasure,
      physicalMeasure: step.physicalMeasure,
      virtualPosition: step.virtualPosition,
      stepDuration: step.stepDuration,
      notes: step.notes.map(note => ({
        duration: note.duration,
        volume: note.volume,
        string: note.string,
        fret: note.fret,
        fretboardNote: note.fretboardNote
      }))
    }));
  }

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
    
    const defaultOptions = { bpm: 120 };
    return new MusicStepGenerator(osmd, { ...defaultOptions, ...options });
  }

  describe('sample-basic.musicxml', () => {
    it('should generate expected steps for basic 4/4 guitar tab', async () => {
      const expectedBasic = [
        {
          "ts": 0,
          "stepIndex": 0,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        },
        {
          "ts": 0.5,
          "stepIndex": 1,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 1,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": {
                "name": "F4",
                "midi": 65
              }
            }
          ]
        },
        {
          "ts": 1,
          "stepIndex": 2,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 2,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": {
                "name": "G4",
                "midi": 67
              }
            }
          ]
        },
        {
          "ts": 1.5,
          "stepIndex": 3,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 3,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": {
                "name": "A4",
                "midi": 69
              }
            }
          ]
        },
        {
          "ts": 2,
          "stepIndex": 4,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": {
                "name": "B3",
                "midi": 59
              }
            }
          ]
        },
        {
          "ts": 2.5,
          "stepIndex": 5,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": {
                "name": "C4",
                "midi": 60
              }
            }
          ]
        },
        {
          "ts": 3,
          "stepIndex": 6,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 6,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": {
                "name": "D4",
                "midi": 62
              }
            }
          ]
        },
        {
          "ts": 3.5,
          "stepIndex": 7,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 7,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        }
      ];

      const generator = await setupGenerator('sample-basic.musicxml');
      const steps = await generator.generateSteps();
      const actualSteps = serializeSteps(steps);
      
      
      expect(actualSteps).toStrictEqual(expectedBasic);
    });
  });

  describe('sample-3-4.musicxml', () => {
    it('should generate expected steps for 3/4 time signature', async () => {
      const expectedThreeFour = [
        {
          "ts": 0,
          "stepIndex": 0,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": {
                "name": "C4",
                "midi": 60
              }
            }
          ]
        },
        {
          "ts": 0.5,
          "stepIndex": 1,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 1,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": {
                "name": "D4",
                "midi": 62
              }
            }
          ]
        },
        {
          "ts": 1,
          "stepIndex": 2,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 2,
          "stepDuration": 0.5,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        },
        {
          "ts": 1.5,
          "stepIndex": 3,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 3,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": {
                "name": "F4",
                "midi": 65
              }
            }
          ]
        },
        {
          "ts": 2,
          "stepIndex": 4,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": {
                "name": "G4",
                "midi": 67
              }
            }
          ]
        },
        {
          "ts": 2.5,
          "stepIndex": 5,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": {
                "name": "A4",
                "midi": 69
              }
            }
          ]
        },
        {
          "ts": 3,
          "stepIndex": 6,
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 6,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 1.5,
              "volume": 1,
              "string": 3,
              "fret": 0,
              "fretboardNote": {
                "name": "G3",
                "midi": 55
              }
            }
          ]
        }
      ];

      const generator = await setupGenerator('sample-3-4.musicxml');
      const steps = await generator.generateSteps();
      const actualSteps = serializeSteps(steps);
      
      
      expect(actualSteps).toStrictEqual(expectedThreeFour);
    });
  });

  describe('sample-repeat.musicxml', () => {
    it('should generate expected steps with repeat processing', async () => {
      const expectedRepeat = [
        {
          "ts": 0,
          "stepIndex": 0,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 0,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        },
        {
          "ts": 0.5,
          "stepIndex": 1,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 1,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": {
                "name": "F4",
                "midi": 65
              }
            }
          ]
        },
        {
          "ts": 1,
          "stepIndex": 2,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 2,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": {
                "name": "G4",
                "midi": 67
              }
            }
          ]
        },
        {
          "ts": 1.5,
          "stepIndex": 3,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 3,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": {
                "name": "A4",
                "midi": 69
              }
            }
          ]
        },
        {
          "ts": 2,
          "stepIndex": 4,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 4,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": {
                "name": "B3",
                "midi": 59
              }
            }
          ]
        },
        {
          "ts": 2.5,
          "stepIndex": 5,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 5,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": {
                "name": "C4",
                "midi": 60
              }
            }
          ]
        },
        {
          "ts": 3,
          "stepIndex": 6,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 6,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": {
                "name": "D4",
                "midi": 62
              }
            }
          ]
        },
        {
          "ts": 3.5,
          "stepIndex": 7,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 7,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        },
        {
          "ts": 4,
          "stepIndex": 8,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 8,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 0,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        },
        {
          "ts": 4.5,
          "stepIndex": 9,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 9,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 1,
              "fretboardNote": {
                "name": "F4",
                "midi": 65
              }
            }
          ]
        },
        {
          "ts": 5,
          "stepIndex": 10,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 10,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 3,
              "fretboardNote": {
                "name": "G4",
                "midi": 67
              }
            }
          ]
        },
        {
          "ts": 5.5,
          "stepIndex": 11,
          "virtualMeasure": 0,
          "physicalMeasure": 0,
          "virtualPosition": 11,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 1,
              "fret": 5,
              "fretboardNote": {
                "name": "A4",
                "midi": 69
              }
            }
          ]
        },
        {
          "ts": 6,
          "stepIndex": 12,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 12,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 0,
              "fretboardNote": {
                "name": "B3",
                "midi": 59
              }
            }
          ]
        },
        {
          "ts": 6.5,
          "stepIndex": 13,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 13,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 1,
              "fretboardNote": {
                "name": "C4",
                "midi": 60
              }
            }
          ]
        },
        {
          "ts": 7,
          "stepIndex": 14,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 14,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 3,
              "fretboardNote": {
                "name": "D4",
                "midi": 62
              }
            }
          ]
        },
        {
          "ts": 7.5,
          "stepIndex": 15,
          "virtualMeasure": 1,
          "physicalMeasure": 1,
          "virtualPosition": 15,
          "stepDuration": 0.25,
          "notes": [
            {
              "duration": 0.5,
              "volume": 1,
              "string": 2,
              "fret": 5,
              "fretboardNote": {
                "name": "E4",
                "midi": 64
              }
            }
          ]
        },
        {
          "ts": 8,
          "stepIndex": 16,
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 16,
          "stepDuration": 1,
          "notes": [
            {
              "duration": 1,
              "volume": 1,
              "string": 3,
              "fret": 0,
              "fretboardNote": {
                "name": "G3",
                "midi": 55
              }
            }
          ]
        },
        {
          "ts": 9,
          "stepIndex": 17,
          "virtualMeasure": 2,
          "physicalMeasure": 2,
          "virtualPosition": 17,
          "stepDuration": 1,
          "notes": [
            {
              "duration": 1,
              "volume": 1,
              "string": 3,
              "fret": 5,
              "fretboardNote": {
                "name": "C4",
                "midi": 60
              }
            }
          ]
        },
        {
          "ts": 10,
          "stepIndex": 18,
          "virtualMeasure": 3,
          "physicalMeasure": 3,
          "virtualPosition": 18,
          "stepDuration": 4,
          "notes": [
            {
              "duration": 2,
              "volume": 1,
              "string": 3,
              "fret": 5,
              "fretboardNote": {
                "name": "C4",
                "midi": 60
              }
            }
          ]
        }
      ];

      const generator = await setupGenerator('sample-repeat.musicxml');
      const steps = await generator.generateSteps();
      const actualSteps = serializeSteps(steps);
      
      
      expect(actualSteps).toStrictEqual(expectedRepeat);
    });
  });

  describe('Cross-file validation', () => {
    it('should generate consistent fretboard note mappings', async () => {
      const files = ['sample-basic.musicxml', 'sample-3-4.musicxml', 'sample-repeat.musicxml'];
      
      for (let filename of files) {
        const generator = await setupGenerator(filename);
        
        // Check fretboard notes consistency across files
        expect(generator.fretboardNotes).toBeDefined();
        expect(generator.fretboardNotes.length).toBe(6); // 6 strings
        
        generator.fretboardNotes.forEach((stringNotes, stringIndex) => {
          expect(stringNotes.length).toBe(24); // 24 frets
          stringNotes.forEach((note, fretIndex) => {
            expect(note).toHaveProperty('name');
            expect(note).toHaveProperty('midi');
            expect(typeof note.name).toBe('string');
            expect(typeof note.midi).toBe('number');
          });
        });
      }
    });
    
    it('should handle different BPM settings', async () => {
      const generator120 = await setupGenerator('sample-basic.musicxml', { bpm: 120 });
      const generator240 = await setupGenerator('sample-basic.musicxml', { bpm: 240 });
      
      const steps120 = await generator120.generateSteps();
      const steps240 = await generator240.generateSteps();
      
      // Should generate same number of steps regardless of BPM
      expect(steps120.length).toBe(steps240.length);
      
      // BPM should affect total duration (higher BPM = shorter duration)
      const totalDuration120 = steps120[steps120.length - 1].ts + steps120[steps120.length - 1].stepDuration;
      const totalDuration240 = steps240[steps240.length - 1].ts + steps240[steps240.length - 1].stepDuration;
      
      expect(totalDuration240).toBeLessThan(totalDuration120);
    });
  });
});