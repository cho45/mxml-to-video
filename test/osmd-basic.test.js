import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Note: OSMD must be imported after DOM setup in setup.js
const OSMD = await import('../lib/opensheetmusicdisplay.min.js')

describe('OSMD Basic Functionality in Node.js', () => {
  let osmd;
  let container;

  beforeAll(() => {
    // Create mock DOM container for OSMD
    container = document.createElement('div');
    container.style.width = '1280px';
    container.style.height = '720px';
    document.body.appendChild(container);
  });

  it('should create OSMD instance', () => {
    const OSMDClass = OSMD.OpenSheetMusicDisplay;
    expect(OSMDClass).toBeDefined();
    
    osmd = new OSMDClass(container);
    expect(osmd).toBeDefined();
    
    console.log('OSMD instance properties:', Object.keys(osmd));
    console.log('OSMD cursor:', osmd.cursor);
    
    // Note: cursor might not be available until after loading and rendering
    // Sheet is undefined before loading, not null
    expect(osmd.Sheet).toBeUndefined();
  });

  it('should load a MusicXML file', async () => {
    // Load a simple MusicXML file for testing
    const musicXMLPath = resolve('./sample-basic.musicxml');
    let musicXMLContent;
    
    try {
      musicXMLContent = readFileSync(musicXMLPath, 'utf8');
    } catch (error) {
      // If sample-basic.musicxml doesn't exist, create a minimal one
      musicXMLContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>Guitar</instrument-name>
      </score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>TAB</sign>
          <line>5</line>
        </clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <staff-tuning line="1">
            <tuning-step>E</tuning-step>
            <tuning-octave>4</tuning-octave>
          </staff-tuning>
          <staff-tuning line="2">
            <tuning-step>B</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="3">
            <tuning-step>G</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="4">
            <tuning-step>D</tuning-step>
            <tuning-octave>3</tuning-octave>
          </staff-tuning>
          <staff-tuning line="5">
            <tuning-step>A</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
          <staff-tuning line="6">
            <tuning-step>E</tuning-step>
            <tuning-octave>2</tuning-octave>
          </staff-tuning>
        </staff-details>
      </attributes>
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <technical>
            <string>6</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <technical>
            <string>5</string>
            <fret>0</fret>
          </technical>
        </notations>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    }

    await osmd.load(musicXMLContent);
    
    expect(osmd.Sheet).toBeDefined();
    expect(osmd.Sheet.SourceMeasures).toBeDefined();
    expect(osmd.Sheet.SourceMeasures.length).toBeGreaterThan(0);
  });

  it('should render the loaded score', () => {
    // Set basic options
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

    // Render the score
    osmd.render();
    
    expect(osmd.GraphicSheet).toBeDefined();
    expect(osmd.GraphicSheet.MeasureList).toBeDefined();
  });

  it('should have working cursor functionality', () => {
    console.log('Checking cursor after load and render...');
    console.log('osmd.cursor:', osmd.cursor);
    
    expect(osmd.cursor).toBeDefined();
    
    const cursor = osmd.cursor;
    cursor.show();
    
    console.log('cursor.Iterator:', cursor.Iterator);
    expect(cursor.Iterator).toBeDefined();
    expect(cursor.Iterator.currentMeasureIndex).toBe(0);
    expect(cursor.Iterator.currentTimeStamp).toBeDefined();
    
    // Test cursor movement
    const initialMeasure = cursor.Iterator.currentMeasureIndex;
    const canMove = !cursor.Iterator.EndReached;
    
    if (canMove) {
      cursor.next();
      // Position should have changed or stayed the same if at the end
      expect(cursor.Iterator.currentMeasureIndex).toBeGreaterThanOrEqual(initialMeasure);
    }
    
    // Reset cursor
    cursor.reset();
    expect(cursor.Iterator.currentMeasureIndex).toBe(0);
  });

  it('should have BPM information', () => {
    if (osmd.Sheet.hasBPMInfo) {
      expect(osmd.Sheet.DefaultStartTempoInBpm).toBeDefined();
      expect(typeof osmd.Sheet.DefaultStartTempoInBpm).toBe('number');
    } else {
      // Default BPM should be used
      console.log('No BPM info found, will use default value');
    }
  });
});