
import {
	Fretboard,
	Systems,
	FretboardSystem
} from 'https://cdn.jsdelivr.net/npm/@moonwave99/fretboard.js@0.2.13/+esm';
import { Key, Pcset, Chord, ChordType, Interval, Note, Scale } from 'https://cdn.jsdelivr.net/npm/tonal@5.1.0/+esm';

const fretboardNotes = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].reverse().map(n => {
	const open = Note.get(n).midi;
	return Array(24).fill().map( (_, i) => {
		return Note.fromMidi(open + i);
	});
});

Vue.createApp({
	data() {
		return {
			playing: false,
		};
	},

	computed: {
	},

	watch: {
	},

	mounted() {
		const commonOpts = {
			stringWidth: [1, 1, 1, 1.5, 2, 2.5],
			fretCount: 22,
			fretWidth: 1.5,
			fretColor: '#999999',
			nutWidth: 7,
			nutColor: '#666666',
			scaleFrets: true,
			middleFretColor: "#333333",
			middleFretWidth: 1.5,
			height: 200,
			width: 1280,
			dotSize: 30,
			dotStrokeWidth: 2,
			dotTextSize: 15,
			showFretNumbers: true,
			fretNumbersHeight: 40,
			fretNumbersMargin: 5,
			fretNumbersColor: "#333333",
			topPadding: 20,
			bottomPadding: 0,
			leftPadding: 20,
			rightPadding: 20,
			font: "Roboto",
			dotText: ({ note, octave, interval }) => `${Note.enharmonic(note)}`,
			dotStrokeColor: ({ interval, active, note}) => "#000000",
			dotFill: ({ interval, active, note }) =>
				active 
				? "#000000"
				: "#999999",
		};

		this.fretboard = new Fretboard({
			el: '#fretboard',
			...commonOpts
		});

		this.fretboard.render();

		this.loadScore( './winonaryderandroid-Electric_Guitar.mxl');

		window.addEventListener('dragenter', (e) => {
			e.preventDefault();
		});
		window.addEventListener('dragover', (e) => {
			e.preventDefault();
		});
		window.addEventListener('dragleave', (e) => {
		});
		window.addEventListener('drop', (e) => {
			e.preventDefault();
			const file = e.dataTransfer.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (e) => {
				const str = e.target.result;
				this.loadScore(str);
//				this.osmd.load(str).then(() => {
//					this.osmd.render();
//					this.osmd.cursor.reset();
//					this.osmd.cursor.show();
//				});
			};
			const filename = file.name;
			if (filename.match(/\.(xml|musicxml)$/i)) {
				reader.readAsText(file);
				return;
			} else
			if (filename.match(/\.(mxl)$/i)) {
				reader.readAsBinaryString(file);
				return;
			} else {
				alert('drop musicxml file is not valid');
			}
		});

		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			this.player = new WebAudioFontPlayer();
			this.channelMaster = this.player.createChannel(this.audioContext);

			const { player, audioContext, channelMaster } = this;
			channelMaster.output.connect(audioContext.destination);
			channelMaster.output.gain.value = 0.5;
		}
	},

	methods: {
		async loadScore(url) {
			this.$refs.osmdContainer.innerHTML = "";
			const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.$refs.osmdContainer);
			this.osmd = osmd;
			await osmd.load(url);
			console.log(osmd);
			osmd.setOptions({
				drawTitle: false,
				drawSubtitle: false,
				drawComposer: false,
				drawCredits: false,
				drawLyricist: false,
				// drawMetronomeMarks: false,
				drawPartAbbreviations: false,
				drawPartNames: false,
				drawMeasureNumbers: false,
				autoResize: true,
//				drawFromMeasureNumber: 1,
//				drawUpToMeasureNumber: 2,
				renderSingleHorizontalStaffline: true,
				cursorsOptions: [
					{
						alpha: 0.5,
						color: "#666666",
						follow: true,
						type: 0,
					}
				],
				drawingParameters: "compacttight",
				spacingFactorSoftmax: 5,
			});
			osmd.render();

			if (osmd.Sheet.hasBPMInfo) {
				this.bpm = osmd.Sheet.DefaultStartTempoInBpm;
			}

			const cursor = osmd.cursor;
			cursor.show();

			this.updateFretboard();


//			const measures = osmd.Sheet.SourceMeasures;
//			for (let measure of measures) {
//				for (let container of measure.VerticalSourceStaffEntryContainers) {
//					for (let staffEntry of container.StaffEntries) {
//						if (!staffEntry.parentStaff.isTab) continue;
//						const ts = staffEntry.AbsoluteTimestamp.realValue;
//						for (let voiceEntry of staffEntry.VoiceEntries) {
//							for (let note of voiceEntry.Notes) {
//								if (note.isRestFlag) {
//									console.log(ts, voiceEntry.Timestamp.realValue, 'R');
//								} else {
//									console.log(ts, voiceEntry.Timestamp.realValue, note.StringNumberTab, note.FretNumber, note);
//								}
//							}
//						}
//					}
//				}
//			}
		},

		next() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			if (cursor.Iterator.EndReached) return;
			cursor.next();
			return this.updateFretboard();
		},

		prev() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			if (cursor.Iterator.FrontReached) return;
			cursor.previous();
			return this.updateFretboard();
		},

		updateFretboard() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			cursor.next();
			console.log(Object.assign({}, cursor.Iterator));
			// const ts = Object.assign({}, cursor.Iterator.CurrentEnrolledTimestamp);
			const ts = Object.assign({}, cursor.Iterator.currentTimeStamp);
			cursor.previous();

			{
				const i = cursor.Iterator.currentMeasureIndex;
				const measure = osmd.GraphicSheet.MeasureList[i][0];
				if (!measure) return ts;
				if (i % 2 === 0) {
					const pos = measure.PositionAndShape.absolutePosition.x * osmd.zoom * 10;
					this.$refs.osmdContainer.style.left = -pos + 'px';
				}
				// console.log(cursor.GNotesUnderCursor());

			}
			
			if (!cursor.Iterator.currentVoiceEntries.length) {
				return ts;
			}

			const actives = [];
			for (let note of cursor.Iterator.CurrentVoiceEntries[1].Notes) {
				// console.log(note.length.realValue);
				actives.push({ string: note.StringNumberTab, fret: note.FretNumber });
			}

			const measureNotes = this.getAllPositionForMeasure(cursor.Iterator.CurrentMeasure);
			this.fretboard.dots = measureNotes.map(note => ({
				string: note.StringNumberTab,
				fret: note.FretNumber,
				note: fretboardNotes[note.StringNumberTab - 1][note.FretNumber],
				active: actives.some(active => active.string === note.StringNumberTab && active.fret === note.FretNumber),
			}));
			this.fretboard.render();

			console.log(ts);
			return ts;
		},


		async play() {
			this.playing = true;

//			const voice = await this.loadVoice('https://surikov.github.io/webaudiofontdata/sound/0270_Gibson_Les_Paul_sf2_file.js', '_tone_0270_Gibson_Les_Paul_sf2_file');
//			const { player, audioContext, channelMaster } = this;
//			audioContext.resume();
//
//			let startTime = audioContext.currentTime + 0.1;
//			const volume = 0.7;
//			const duration = 1;
//			const pitch = Note.get('C3').midi;
//			// player.adjustPreset(audioContext, voice);
//			const r = player.queueWaveTable(audioContext, channelMaster.input, voice, startTime, pitch, duration, volume);
//			console.log(voice, r);


			let prev = 0;
			const func = () => {
				if (!this.playing) return;
				const wholeNote = 60 / this.bpm * this.osmd.Sheet.playbackSettings.rhythm.denominator * 1000;
				const ts = this.next();
				const diff = ts.realValue - prev;
				console.log(ts.realValue, diff);
				if (this.osmd.cursor.Iterator.EndReached) {
					this.stop();
					return;
				}
				setTimeout(func, diff  * wholeNote);
				prev = ts.realValue;
			};

			func();
		},

		stop() {
			this.playing = false;
		},

		getAllPositionForMeasure(measure) {
			const ret = [];
			for (let container of measure.VerticalSourceStaffEntryContainers) {
				for (let staffEntry of container.StaffEntries) {
					if (!staffEntry.parentStaff.isTab) continue;
					const ts = staffEntry.AbsoluteTimestamp.realValue;
					for (let voiceEntry of staffEntry.VoiceEntries) {
						for (let note of voiceEntry.Notes) {
							if (typeof note.StringNumberTab === 'undefined') continue;
							ret.push(note);
						}
					}
				}
			}
			return ret;
		},

		loadVoice: async function (src, name) {
			const { player, audioContext } = this;
			if (window[name]) {
				return Promise.resolve(window[name]);
			} else {
				console.log('loading', src, name);
				return new Promise( (resolve) => {
					player.loader.startLoad(audioContext, src, name);
					player.loader.waitLoad(() => {
						resolve(window[name]);
					});
				});
			}
		},
	},
}).use(Vuetify.createVuetify({
	theme: {
		defaultTheme: 'light' // or dark
	}
})).mount("#app");
