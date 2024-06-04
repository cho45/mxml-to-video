
import {
	Fretboard,
	Systems,
	FretboardSystem
} from 'https://cdn.jsdelivr.net/npm/@moonwave99/fretboard.js@0.2.13/+esm';
import { Key, Pcset, Chord, ChordType, Interval, Note, Scale } from 'https://cdn.jsdelivr.net/npm/tonal@5.1.0/+esm';

const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fretboardNotes = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].reverse().map(n => {
	const open = Note.get(n).midi;
	return Array(24).fill().map( (_, i) => {
		return Note.fromMidi(open + i);
	});
});

async function loadAsImage(svg) {
	return new Promise((resolve, reject) => {
		const svgXml = new XMLSerializer().serializeToString(svg);

		const blob = new Blob([svgXml], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);

		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = (e) => {
			URL.revokeObjectURL(url);
			reject(e);
		};
		img.src = url;
	});
}

Vue.createApp({
	data() {
		return {
			loading: false,
			playing: false,
			video: null,
		};
	},

	computed: {
	},

	watch: {
	},

	mounted() {
		const commonOpts = {
			stringWidth: 1,
			fretCount: 22,
			fretWidth: 1.5,
			fretColor: '#333333',
			stringColor: "#333333",
			nutWidth: 7,
			nutColor: '#000000',
			scaleFrets: true,
			middleFretColor: "#000000",
			middleFretWidth: 2,
			height: 200,
			width: 1280,
			dotSize: 30,
			dotStrokeWidth: 2,
			dotTextSize: 15,
			showFretNumbers: true,
			fretNumbersHeight: 40,
			fretNumbersMargin: 5,
			fretNumbersColor: "#000000",
			topPadding: 20,
			bottomPadding: 10,
			leftPadding: 20,
			rightPadding: 20,
			font: "Noto Sans Display",
			dotText: ({ note, octave, interval }) => `${Note.enharmonic(note)}`,
			dotStrokeColor: ({ interval, active, note}) =>
				active
				? "#666666"
				: "#aaaaaa",
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

		const { wrapper, positions } = this.fretboard;
		const dotOffset = this.fretboard.getDotOffset();
		const fretMarkerSize = 20;
		const fretMarkerColor = "#cccccc";
		const fretMarkerGroup = wrapper.append('g').attr('class', 'fret-marker-group');
		fretMarkerGroup
			.selectAll('circle')
			.data([
				{ string: 3, fret: 3 }, 
				{ string: 3, fret: 5 }, 
				{ string: 3, fret: 7 }, 
				{ string: 3, fret: 9 }, 
				{ string: 2, fret: 12 }, 
				{ string: 4, fret: 12 }, 
				{ string: 3, fret: 15 }, 
				{ string: 3, fret: 17 }, 
				{ string: 3, fret: 19 }, 
				{ string: 3, fret: 21 }, 
				{ string: 2, fret: 24 }, 
				{ string: 4, fret: 24 }, 
			])
			.enter()
			.filter(({ fret }) => fret >= 0 && fret <= this.fretboard.options.fretCount + dotOffset)
			.append('circle')
			.attr('class', 'position-mark')
			.attr('cx', ({ string, fret }) => `${positions[string - 1][fret - dotOffset].x}%`)
			.attr('cy', ({ string, fret }) => (positions[string - 1][fret - dotOffset].y + positions[string][fret - dotOffset].y) / 2)
			.attr('r', fretMarkerSize * 0.5)
			.attr('fill', fretMarkerColor);
		wrapper.node().appendChild(document.getElementById('fretboard-style'));

		// this.loadScore( './winonaryderandroid-Electric_Guitar.mxl');
		this.loadScore( './hotarutest.mxl');

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
			this.loading = true;
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
			reader.onerror = (e) => {
				alert(e);
				this.loading = false;
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
				this.loading = false;
				alert('drop musicxml file is not valid');
			}
		});

		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			this.player = new WebAudioFontPlayer();
			this.channelMaster = this.player.createChannel(this.audioContext);

			const { player, audioContext, channelMaster } = this;
			channelMaster.output.connect(audioContext.destination);
			channelMaster.output.gain.value = 0.3;
		}
	},

	methods: {
		async loadScore(url) {
			this.loading = true;
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
			this.loading = false;
		},

		next() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			if (cursor.Iterator.EndReached) return;
			cursor.next();
			this.updateFretboard();
		},

		prev() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			if (cursor.Iterator.FrontReached) return;
			cursor.previous();
			this.updateFretboard();
		},

		updateFretboard() {
			const { osmd } = this;
			const cursor = osmd.cursor;

			{
				const i = cursor.Iterator.currentMeasureIndex;
				if (!osmd.GraphicSheet.MeasureList[i]) return;
				const measure = osmd.GraphicSheet.MeasureList[i][0];
				if (!measure) return;
				if (i % 2 === 0) {
					const pos = measure.PositionAndShape.absolutePosition.x * osmd.zoom * 10;
					this.$refs.osmdContainer.style.left = -pos + 'px';
					this.osmdOffset = pos;
				}
				// console.log(cursor.GNotesUnderCursor());

			}
			
			if (!cursor.Iterator.currentVoiceEntries.length) {
				return;
			}

			const actives = [];
			for (let entry of cursor.Iterator.CurrentVoiceEntries) {
				if (entry.parentSourceStaffEntry.parentStaff.isTab) {
					for (let note of entry.Notes) {
						// console.log(note.length.realValue);
						if (note.isRest()) continue;
						actives.push({ string: note.StringNumberTab, fret: note.FretNumber });
					}
				}
			}

			const measureNotes = this.getAllPositionForMeasure(cursor.Iterator.CurrentMeasure);
			this.fretboard.dots = measureNotes.map(note => ({
				string: note.StringNumberTab,
				fret: note.FretNumber,
				note: fretboardNotes[note.StringNumberTab - 1][note.FretNumber],
				active: actives.some(active => active.string === note.StringNumberTab && active.fret === note.FretNumber),
			}));

			console.log(this.fretboard);
			this.fretboard.render();

			this.drawToCanvas();
		},

		async drawToCanvas() {
			const canvas = this.$refs.canvas;
			if (!this.canvasInitialized) {
				console.log(this.$refs.display.offsetWidth, this.$refs.display.offsetHeight);
				canvas.width = this.$refs.display.offsetWidth;
				canvas.height = this.$refs.display.offsetHeight;
				this.canvasInitialized = true;
			}
			const ctx = canvas.getContext('2d');


			const osmdSvg = this.$refs.osmdContainer.querySelector('svg');
			const osmdCursor = this.$refs.osmdContainer.querySelector('img#cursorImg-0');
			const fretboardSvg = this.$refs.fretboardContainer.querySelector('svg');

			const osmdImg = await loadAsImage(osmdSvg);
			const fretboardImg = await loadAsImage(fretboardSvg);

			ctx.globalCompositeOperation = 'source-over';
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.save();
			ctx.translate(-this.osmdOffset, 0);
			ctx.drawImage(osmdImg, 0, 0);
			ctx.restore();
			ctx.drawImage(osmdCursor, osmdCursor.offsetLeft - this.osmdOffset, osmdCursor.offsetTop, osmdCursor.offsetWidth, osmdCursor.offsetHeight);
			ctx.drawImage(fretboardImg, 0, osmdImg.height);
			ctx.globalCompositeOperation = 'difference';
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		},


		async play() {
			return new Promise(async (resolve) => {
				this.playing = true;

				const { osmd } = this;
				const cursor = osmd.cursor;
				cursor.reset();

				const wholeNoteLength = 60 / this.bpm * 4;

				const steps = [];
				while (!cursor.Iterator.EndReached) {
					let step = {
						ts : cursor.Iterator.currentTimeStamp.realValue * wholeNoteLength,
						notes: [],
					};
					const currentVoiceEntries =  cursor.Iterator.CurrentVoiceEntries;
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
									fretboardNote: fretboardNotes[string - 1][fret],
								});
							}
						}
					}
					steps.push(step);
					cursor.next();
				}
				console.log(steps);
				cursor.reset();

				const voice = await this.loadVoice('https://surikov.github.io/webaudiofontdata/sound/0270_Gibson_Les_Paul_sf2_file.js', '_tone_0270_Gibson_Les_Paul_sf2_file');
				const { player, audioContext, channelMaster } = this;
				await audioContext.resume();

				let startTime = audioContext.currentTime + 0.1;

				const func = () => {
					if (!this.playing) {
						resolve();
						return;
					}

					const step = steps.shift();
					if (!step) {
						resolve();
						this.stop();
						return;
					}


					const currentTs = startTime + step.ts;
					console.log(currentTs, step.ts, step.notes.length, step);
					for (let note of step.notes) {
						const volume = note.volume;
						const duration = note.duration;
						const pitch = Note.get(note.fretboardNote).midi;
						player.queueWaveTable(audioContext, channelMaster.input, voice, currentTs, pitch, duration, volume);
					}

					const update = () => {
						if (audioContext.currentTime >= currentTs - 0.015) {
							cursor.next();
							this.updateFretboard();
						} else {
							requestAnimationFrame(update);
						}
					};
					requestAnimationFrame(update);

					setTimeout(func, (currentTs - audioContext.currentTime - 0.1) * 1000);
				};

				setTimeout(func, 10);
			});
		},

		stop() {
			this.playing = false;
		},

		reset() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			cursor.reset();
			this.updateFretboard();
		},

		async record() {
			const canvas = this.$refs.canvas;

			const msd = this.audioContext.createMediaStreamDestination();
			this.channelMaster.output.connect(msd);
			console.log(msd.stream.getAudioTracks());
			const videoStream = canvas.captureStream(30);

			for (let track of msd.stream.getAudioTracks()) {
				videoStream.addTrack(track);
			}

			const mediaRecorder = new MediaRecorder(videoStream);

		   let	chunks = [];
			mediaRecorder.ondataavailable = (e) => {
				chunks.push(e.data);
			};

			mediaRecorder.onstop = (e) => {
				const blob = new Blob(chunks, { 'type' : 'video/mp4' });
				const videoURL = URL.createObjectURL(blob);
				this.$refs.video.src = videoURL;
				this.video = videoURL;
				chunks = [];
			};
			mediaRecorder.ondataavailable = (e) => {
				chunks.push(e.data);
			};

			mediaRecorder.start();
			this.drawToCanvas();

			await timeout(500);
			await this.play();
			await timeout(500);

			mediaRecorder.stop();
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
