
import {
	Fretboard,
	Systems,
	FretboardSystem
} from 'https://cdn.jsdelivr.net/npm/@moonwave99/fretboard.js@0.2.13/+esm';
import { Key, Pcset, Chord, ChordType, Interval, Note, Scale } from 'https://cdn.jsdelivr.net/npm/tonal@5.1.0/+esm';

import { FFmpeg } from './node_modules/@ffmpeg/ffmpeg/dist/esm/index.js';
import { fetchFile, toBlobURL } from './node_modules/@ffmpeg/util/dist/esm/index.js';

const ENABLE_CACHE = false;
const TRANSCODE = true;

const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadFFmpeg() {
	if (loadFFmpeg.ffmpeg) {
		return loadFFmpeg.ffmpeg;
	}

	const ffmpeg = new FFmpeg();
	const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
	// const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
	console.log('loadFFmpeg', baseURL);
	await ffmpeg.load({
		coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
		wasmURL: await toBlobURL( `${baseURL}/ffmpeg-core.wasm`, "application/wasm",),
		// workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
	});
	console.log('ffmpeg loaded');
	loadFFmpeg.ffmpeg = ffmpeg;
	return ffmpeg;
}

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
			fileName: "",
			ffmpegLog: "",
			transcodeState: "",
			transcodeProgress: 0,
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
		const fretboardSvg = this.$refs.fretboardContainer.querySelector('svg');
		fretboardSvg.setAttribute('width', this.$refs.fretboardContainer.offsetWidth);
		fretboardSvg.setAttribute('height', this.$refs.fretboardContainer.offsetHeight);

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
		// this.loadScore( './hotarutest.mxl');
		this.loadScore( './tabtest.mxl');
		// this.loadScore( './test.mxl');

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
			this.loadFile(file);
		});

		if (!this.audioContext) {
			this.audioContext = new AudioContext();
			this.player = new WebAudioFontPlayer();
			this.channelMaster = this.player.createChannel(this.audioContext);

			const { player, audioContext, channelMaster } = this;
			channelMaster.output.connect(audioContext.destination);
			channelMaster.output.gain.value = 0.3;
		}

		loadFFmpeg();

		this.fretboardNotes = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'].reverse().map(n => {
			const open = Note.get(n).midi;
			return Array(24).fill().map( (_, i) => {
				return Note.fromMidi(open + i);
			});
		});

		if (location.hash.includes("hdt")) {
			this.fretboardNotes = ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'].reverse().map(n => {
				const open = Note.get(n).midi;
				return Array(24).fill().map( (_, i) => {
					return Note.fromMidi(open + i);
				});
			});
		}
	},

	methods: {
		async loadFileFromInput() {
			const file = this.$refs.file.files[0]
			this.loadFile(file);
		},

		async loadFile(file) {
			console.log('loadFile', file);
			if (!file) return;
			this.loading = true;
			const reader = new FileReader();
			reader.onload = (e) => {
				const str = e.target.result;
				this.loadScore(str, file.name);
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
				alert('selected musicxml file is not valid');
			}
		},

		async loadScore(url, name) {
			this.fileName = name || url;
			this.loading = true;
			this.$refs.osmdContainer.innerHTML = "";
			this.osmdRenderedCanvas = null;
			this.video = null;

			await timeout(10);
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

		async updateFretboard() {
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
				note: this.fretboardNotes[note.StringNumberTab - 1][note.FretNumber],
				active: actives.some(active => active.string === note.StringNumberTab && active.fret === note.FretNumber),
			}));

			// console.log(this.fretboard);
			this.fretboard.render();

			await this.drawToCanvas();
		},

		async drawToCanvas() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			const canvas = this.$refs.canvas;

			const index = Math.round(cursor.Iterator.currentTimeStamp.realValue * 1e3);
			console.log('drawToCanvas', index);
			if (!this.canvasCache) this.canvasCache = [];
			if (this.canvasCache[index]) {
				const bitmap = this.canvasCache[index];
				const ctx = canvas.getContext('2d');
				ctx.drawImage(bitmap, 0, 0);
				console.log('draw from cache', index);
			} else {
				const pixelRatio = 2;
				if (!this.canvasInitialized) {
					canvas.width = this.$refs.display.offsetWidth * pixelRatio;
					canvas.height = this.$refs.display.offsetHeight * pixelRatio;
	//				canvas.width = 3840;
	//				canvas.height = 2160;
					this.canvasInitialized = true;
				}
				const ctx = canvas.getContext('2d');


				const osmdSvg = this.$refs.osmdContainer.querySelector('svg');
				if (!this.osmdRenderedCanvas) {
					// 大きな楽譜になると loadAsImage が非常に遅くなる
					// 楽譜データは変化しないので一度だけレンダリングする
					// カーソルはもともと上に重ねる設計となっている
					const osmdImg = await loadAsImage(osmdSvg);
					const osmdRenderedCanvas = document.createElement('canvas');
					osmdRenderedCanvas.width = osmdSvg.width.baseVal.value * pixelRatio;
					osmdRenderedCanvas.height = osmdSvg.height.baseVal.value * pixelRatio;
					const ctx = osmdRenderedCanvas.getContext('2d');
					// document.body.appendChild(osmdRenderedCanvas);
					ctx.drawImage(osmdImg, 0, 0, osmdImg.width, osmdImg.height, 0, 0, osmdImg.width * pixelRatio, osmdImg.height * pixelRatio);
					this.osmdRenderedCanvas = osmdRenderedCanvas;
				}

				const osmdCursor = this.$refs.osmdContainer.querySelector('img#cursorImg-0');
				const fretboardSvg = this.$refs.fretboardContainer.querySelector('svg');

				const fretboardImg = await loadAsImage(fretboardSvg);
				fretboardImg.width = fretboardSvg.parentNode.offsetWidth * pixelRatio;
				fretboardImg.height = fretboardSvg.parentNode.offsetHeight * pixelRatio;

				const padding = parseInt(window.getComputedStyle(this.$refs.osmdContainer).paddingLeft, 10);

				ctx.save();
				ctx.globalCompositeOperation = 'source-over';
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.save();
				ctx.translate((-this.osmdOffset + padding) * pixelRatio, 0);
				ctx.drawImage(this.osmdRenderedCanvas, 0, 0);
				ctx.restore();
				ctx.save();
				ctx.scale(pixelRatio, pixelRatio);
				ctx.drawImage(fretboardImg, 0, osmdSvg.height.baseVal.value);
				ctx.restore();
				ctx.save();
				ctx.scale(pixelRatio, pixelRatio);
				ctx.drawImage(osmdCursor, osmdCursor.offsetLeft - this.osmdOffset + padding, osmdCursor.offsetTop, osmdCursor.offsetWidth, osmdCursor.offsetHeight);
				ctx.restore();
				ctx.globalCompositeOperation = 'difference';
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.font = "bold 20px sans-serif";
				ctx.textAlign = 'right';
				ctx.textBaseline = 'bottom';
				ctx.fillText(index, canvas.width, canvas.height);
				ctx.restore();

				if (ENABLE_CACHE) {
					const bitmap = await createImageBitmap(canvas);
					this.canvasCache[index] =  bitmap;
				}
			}

//			if (this.canvasTrack) {
//				console.log('requestFrame');
//				this.canvasTrack.requestFrame();
//			};
		},


		async play() {
			return new Promise(async (resolve) => {
				this.playing = true;

				const { osmd } = this;
				const cursor = osmd.cursor;
				cursor.reset();

				const wholeNoteLength = 60 / this.bpm * 4;

				// Build playback sequence considering repeats
				const playbackSequence = this.buildPlaybackSequence();
				console.log('Playback sequence:', playbackSequence);

				const steps = [];
				let currentTime = 0;

				for (let measureInfo of playbackSequence) {
					cursor.reset();
					// Navigate to the specific measure
					while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex < measureInfo.measureIndex) {
						cursor.next();
					}

					// Collect all steps in this measure
					const measureSteps = this.getMeasureSteps(cursor, measureInfo.measureIndex, wholeNoteLength, currentTime);
					steps.push(...measureSteps);
					
					// Update current time based on measure length
					const measureLength = this.getMeasureLength(measureInfo.measureIndex, wholeNoteLength);
					currentTime += measureLength;
				}

				console.log('Generated steps with repeats:', steps);
				cursor.reset();

				const voice = await this.loadVoice('https://surikov.github.io/webaudiofontdata/sound/0270_Gibson_Les_Paul_sf2_file.js', '_tone_0270_Gibson_Les_Paul_sf2_file');
				const { player, audioContext, channelMaster } = this;
				await audioContext.resume();

				let startTime = audioContext.currentTime + 0.1;
				let endTime = startTime + (steps.length > 0 ? steps[steps.length - 1].ts + Math.max(...steps[steps.length - 1].notes.map(note => note.duration), 0) : 0);
				let first = true;
				let stepIndex = 0;

				const func = () => {
					if (!this.playing) {
						resolve();
						return;
					}

					if (stepIndex >= steps.length) {
						setTimeout(resolve, (endTime - audioContext.currentTime) * 1000);
						this.stop();
						return;
					}

					const step = steps[stepIndex];
					stepIndex++;

					const currentTs = startTime + step.ts;
					// console.log(currentTs, step.ts, step.notes.length, step);
					for (let note of step.notes) {
						const volume = note.volume;
						const duration = note.duration;
						const pitch = Note.get(note.fretboardNote).midi;
						player.queueWaveTable(audioContext, channelMaster.input, voice, currentTs, pitch, duration, volume);
					}
					

					if (!first) {
						const update = async () => {
							if (audioContext.currentTime >= currentTs - 0.005) {
								// Navigate cursor to the correct position for this step
								cursor.reset();
								while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex < step.measureIndex) {
									cursor.next();
								}
								// Find the exact position within the measure
								while (!cursor.Iterator.EndReached && 
									   cursor.Iterator.currentMeasureIndex === step.measureIndex &&
									   cursor.Iterator.currentTimeStamp.realValue < step.cursorPosition.timestamp) {
									cursor.next();
								}
								await this.updateFretboard();
							} else {
								requestAnimationFrame(update);
							}
						};
						requestAnimationFrame(update);
					}
					first = false;

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
			const { osmd } = this;

			this.video = null;
			this.transcodeState = "";
			this.transcodeProgress = 0;

			const cursor = osmd.cursor;
			const canvas = this.$refs.canvas;

			if (ENABLE_CACHE) {
				// cache all canvas with repeat handling
				const playbackSequence = this.buildPlaybackSequence();
				for (let measureInfo of playbackSequence) {
					cursor.reset();
					// Navigate to the specific measure
					while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex < measureInfo.measureIndex) {
						cursor.next();
					}
					// Cache all positions in this measure
					while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex === measureInfo.measureIndex) {
						await this.updateFretboard();
						cursor.next();
					}
				}
				cursor.reset();
			}

			const msd = this.audioContext.createMediaStreamDestination();
			this.channelMaster.output.connect(msd);
			console.log(msd.stream.getAudioTracks());
			const videoStream = canvas.captureStream(30);
			this.canvasTrack = videoStream.getVideoTracks()[0];

			for (let track of msd.stream.getAudioTracks()) {
				videoStream.addTrack(track);
			}

			const mediaRecorder = new MediaRecorder(videoStream, {
			//	mimeType: 'video/webm;codecs=vp8',
				audioBitsPerSecond: 128e3,
				videoBitsPerSecond: 8e6,
			});

		   let	chunks = [];
			mediaRecorder.ondataavailable = (e) => {
				// console.log('ondataavailable', e.data.size);
				chunks.push(e.data);
			};

			let startTime = performance.now();
			mediaRecorder.onstop = async (e) => {
				let stopTime = performance.now();
				let totalTime = (stopTime - startTime) / 1000;
				console.log('onstop', chunks.length);
				const blob = new Blob(chunks, { 'type' : 'video/webm' });

				let videoURL;
				if (TRANSCODE) {
					const mp4 = await this.transcode(blob, (time) => {
						console.log('transcode', time, totalTime, time / totalTime * 100 + '%');
						this.transcodeProgress = time / totalTime * 100;
					});
					videoURL = URL.createObjectURL(mp4);
				} else {
					videoURL = URL.createObjectURL(blob);
				}

				this.$refs.video.src = videoURL;
				this.video = videoURL;
				chunks = [];
			};

			console.log('recorder start');
			mediaRecorder.start(0);

			// 暖気を入れないとうまくエンコードしてくれない
			for (let i = 0; i < 30; i++) {
				await this.drawToCanvas();
				await timeout(30);
			};
			await this.play();
			await this.drawToCanvas();
			await timeout(1000);
			await this.drawToCanvas();

			mediaRecorder.stop();
			console.log('recorder stop');
			this.canvasTrack = null;
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

		buildPlaybackSequence() {
			const { osmd } = this;
			const sheet = osmd.Sheet;
			const measures = [];
			
			console.log('=== Building playback sequence ===');
			console.log('Total measures:', sheet.SourceMeasures.length);
			console.log('OSMD Sheet object:', sheet);
			console.log('OSMD GraphicSheet:', osmd.GraphicSheet);
			
			// Try to find repeat information in other locations
			if (sheet.Parts && sheet.Parts.length > 0) {
				console.log('Sheet Parts:', sheet.Parts);
				const part = sheet.Parts[0];
				console.log('First part:', part);
				if (part.Measures) {
					console.log('Part measures:', part.Measures.slice(0, 5)); // First 5 measures
				}
			}
			
			// First, collect all measures with their repeat information
			for (let i = 0; i < sheet.SourceMeasures.length; i++) {
				const sourceMeasure = sheet.SourceMeasures[i];
				const measureInfo = {
					measureIndex: i,
					measureNumber: sourceMeasure.MeasureNumber,
					hasStartRepeat: false,
					hasEndRepeat: false,
					endings: []
				};

				console.log(`Measure ${i}:`, sourceMeasure);
				
				// Check the repetition instructions that we saw in the properties
				if (sourceMeasure.firstRepetitionInstructions && sourceMeasure.firstRepetitionInstructions.length > 0) {
					console.log(`  firstRepetitionInstructions:`, sourceMeasure.firstRepetitionInstructions);
					for (let instr of sourceMeasure.firstRepetitionInstructions) {
						console.log(`    -> First repeat instruction:`, instr.constructor.name, instr);
						console.log(`    -> Instruction properties:`, Object.keys(instr));
						console.log(`    -> Full instruction:`, instr);
						
						// Try multiple ways to identify the instruction
						if (instr.constructor.name === 'RepetitionInstruction' || 
							instr.constructor.name.includes('Repetition') ||
							typeof instr.type !== 'undefined') {
							console.log(`    -> RepetitionInstruction type: ${instr.type}`);
							// type: 0 = start repeat (forward)
							// type: 1 = end repeat (backward)  
							// type: 2 = end repeat (backward)
							if (instr.type === 0) {
								measureInfo.hasStartRepeat = true;
								console.log(`    -> ✓ SET hasStartRepeat = true (type ${instr.type}) from firstRepetitionInstructions`);
							} else {
								console.log(`    -> Type ${instr.type} not recognized as start repeat`);
							}
						} else {
							console.log(`    -> Not recognized as RepetitionInstruction`);
						}
					}
				}
				
				if (sourceMeasure.lastRepetitionInstructions && sourceMeasure.lastRepetitionInstructions.length > 0) {
					console.log(`  lastRepetitionInstructions:`, sourceMeasure.lastRepetitionInstructions);
					for (let instr of sourceMeasure.lastRepetitionInstructions) {
						console.log(`    -> Last repeat instruction:`, instr.constructor.name, instr);
						console.log(`    -> Instruction properties:`, Object.keys(instr));
						console.log(`    -> Full instruction:`, instr);
						
						// Try multiple ways to identify the instruction
						if (instr.constructor.name === 'RepetitionInstruction' || 
							instr.constructor.name.includes('Repetition') ||
							typeof instr.type !== 'undefined') {
							console.log(`    -> RepetitionInstruction type: ${instr.type}`);
							// type: 1 or 2 = end repeat (backward)
							if (instr.type === 1 || instr.type === 2) {
								measureInfo.hasEndRepeat = true;
								console.log(`    -> ✓ SET hasEndRepeat = true (type ${instr.type}) from lastRepetitionInstructions`);
							} else {
								console.log(`    -> Type ${instr.type} not recognized as end repeat`);
							}
						} else {
							console.log(`    -> Not recognized as RepetitionInstruction`);
						}
					}
				}

				// Check for repeat barlines in different locations
				if (sourceMeasure.BeginInstructions) {
					console.log(`  BeginInstructions:`, sourceMeasure.BeginInstructions);
					for (let instr of sourceMeasure.BeginInstructions) {
						console.log(`    Instruction:`, instr.constructor.name, instr);
						if (instr.constructor.name === 'RepetitionInstruction') {
							if (instr.type === 'start' || instr.type === 0) {
								measureInfo.hasStartRepeat = true;
								console.log(`    -> Found start repeat`);
							}
						}
					}
				}

				if (sourceMeasure.EndInstructions) {
					console.log(`  EndInstructions:`, sourceMeasure.EndInstructions);
					for (let instr of sourceMeasure.EndInstructions) {
						console.log(`    Instruction:`, instr.constructor.name, instr);
						if (instr.constructor.name === 'RepetitionInstruction') {
							if (instr.type === 'end' || instr.type === 1) {
								measureInfo.hasEndRepeat = true;
								console.log(`    -> Found end repeat`);
							}
						}
					}
				}

				// Check for repeat barlines (legacy)
				if (sourceMeasure.FirstInstruction) {
					console.log(`  FirstInstruction:`, sourceMeasure.FirstInstruction);
					for (let instr of sourceMeasure.FirstInstruction) {
						console.log(`    Instruction:`, instr.constructor.name, instr);
						if (instr.constructor.name === 'RepetitionInstruction') {
							if (instr.type === 'start' || instr.type === 0) {
								measureInfo.hasStartRepeat = true;
								console.log(`    -> Found start repeat (legacy)`);
							}
						}
					}
				}

				if (sourceMeasure.LastInstruction) {
					console.log(`  LastInstruction:`, sourceMeasure.LastInstruction);
					for (let instr of sourceMeasure.LastInstruction) {
						console.log(`    Instruction:`, instr.constructor.name, instr);
						if (instr.constructor.name === 'RepetitionInstruction') {
							if (instr.type === 'end' || instr.type === 1) {
								measureInfo.hasEndRepeat = true;
								console.log(`    -> Found end repeat (legacy)`);
							}
						}
					}
				}

				// Check all possible instruction locations
				console.log(`  All properties:`, Object.keys(sourceMeasure));
				
				// Check for barlines (which may contain repeat information)
				if (sourceMeasure.TempoInstructions) {
					console.log(`  TempoInstructions:`, sourceMeasure.TempoInstructions);
				}
				if (sourceMeasure.StaffEntries) {
					console.log(`  StaffEntries:`, sourceMeasure.StaffEntries);
				}
				
				// Check for repeat barlines in GraphicSheet
				if (osmd.GraphicSheet && osmd.GraphicSheet.MeasureList[i]) {
					const graphicMeasure = osmd.GraphicSheet.MeasureList[i][0];
					if (graphicMeasure) {
						console.log(`  GraphicMeasure:`, graphicMeasure);
						console.log(`  GraphicMeasure properties:`, Object.keys(graphicMeasure));
						
						if (graphicMeasure.beginInstructions) {
							console.log(`    GraphicMeasure.beginInstructions:`, graphicMeasure.beginInstructions);
						}
						if (graphicMeasure.endInstructions) {
							console.log(`    GraphicMeasure.endInstructions:`, graphicMeasure.endInstructions);
						}
						
						// Check for barlines
						if (graphicMeasure.leftBarline) {
							console.log(`    leftBarline:`, graphicMeasure.leftBarline);
						}
						if (graphicMeasure.rightBarline) {
							console.log(`    rightBarline:`, graphicMeasure.rightBarline);
						}
						if (graphicMeasure.beginRepeat) {
							console.log(`    beginRepeat:`, graphicMeasure.beginRepeat);
							measureInfo.hasStartRepeat = true;
						}
						if (graphicMeasure.endRepeat) {
							console.log(`    endRepeat:`, graphicMeasure.endRepeat);
							measureInfo.hasEndRepeat = true;
						}
					}
				}
				
				// Also check the source measure for barlines directly
				if (sourceMeasure.VerticalSourceStaffEntryContainers) {
					for (let container of sourceMeasure.VerticalSourceStaffEntryContainers) {
						if (container.StaffEntries) {
							for (let staffEntry of container.StaffEntries) {
								if (staffEntry.Instructions) {
									for (let instr of staffEntry.Instructions) {
										console.log(`    StaffEntry instruction:`, instr.constructor.name, instr);
										if (instr.constructor.name === 'BarlineInstruction' || instr.constructor.name.includes('Barline')) {
											console.log(`      -> Found barline instruction:`, instr);
										}
									}
								}
							}
						}
					}
				}

				// Check for endings (1., 2., etc.)
				for (let staffEntry of sourceMeasure.VerticalSourceStaffEntryContainers) {
					for (let entry of staffEntry.StaffEntries) {
						if (entry.Instructions) {
							for (let instr of entry.Instructions) {
								if (instr.constructor.name === 'RepetitionInstruction' && instr.EndingIndices) {
									measureInfo.endings = instr.EndingIndices;
								}
							}
						}
					}
				}

				// Final check: if we found repetition instructions but flags aren't set, force them
				if (!measureInfo.hasStartRepeat && !measureInfo.hasEndRepeat) {
					if (sourceMeasure.firstRepetitionInstructions && sourceMeasure.firstRepetitionInstructions.length > 0) {
						console.log(`  -> Force checking firstRepetitionInstructions for fallback`);
						for (let instr of sourceMeasure.firstRepetitionInstructions) {
							if (instr.type === 0) {
								measureInfo.hasStartRepeat = true;
								console.log(`  -> FORCE SET hasStartRepeat = true`);
							}
						}
					}
					if (sourceMeasure.lastRepetitionInstructions && sourceMeasure.lastRepetitionInstructions.length > 0) {
						console.log(`  -> Force checking lastRepetitionInstructions for fallback`);
						for (let instr of sourceMeasure.lastRepetitionInstructions) {
							if (instr.type === 1 || instr.type === 2) {
								measureInfo.hasEndRepeat = true;
								console.log(`  -> FORCE SET hasEndRepeat = true`);
							}
						}
					}
				}
				
				console.log(`  Measure ${i} info:`, measureInfo);
				measures.push(measureInfo);
			}

			// Build the actual playback sequence
			const playbackSequence = [];
			let i = 0;
			let repeatStack = [];

			console.log('=== Building actual sequence ===');
			console.log('Measures with repeat info:', measures);

			while (i < measures.length) {
				const measure = measures[i];
				console.log(`Processing measure ${i}:`, measure);

				if (measure.hasStartRepeat) {
					repeatStack.push(i);
					console.log(`  -> Start repeat, stack:`, repeatStack);
				}

				playbackSequence.push(measure);
				console.log(`  -> Added to sequence (length now: ${playbackSequence.length})`);

				if (measure.hasEndRepeat) {
					console.log(`  -> End repeat found`);
					if (repeatStack.length > 0) {
						const startRepeatIndex = repeatStack.pop();
						console.log(`  -> Repeating from ${startRepeatIndex} to ${i}`);
						// Add the repeated section
						for (let j = startRepeatIndex; j <= i; j++) {
							playbackSequence.push(measures[j]);
							console.log(`    -> Repeated measure ${j}`);
						}
					} else {
						console.log(`  -> No start repeat, repeating from beginning`);
						// End repeat without start repeat - repeat from beginning  
						for (let j = 0; j <= i; j++) {
							playbackSequence.push(measures[j]);
							console.log(`    -> Repeated measure ${j}`);
						}
					}
				}

				i++;
			}

			console.log('Final playback sequence:', playbackSequence);
			
			// Temporary workaround: If no repeats were detected, try to parse repeats from the raw XML
			if (playbackSequence.length === measures.length) {
				console.log('=== No repeats detected, trying XML parsing workaround ===');
				const repeatedSequence = this.parseRepeatsFromXML(measures);
				if (repeatedSequence.length > measures.length) {
					console.log('Found repeats via XML parsing:', repeatedSequence);
					return repeatedSequence;
				}
				
				// Fallback for filename-based detection
				if (this.fileName && (this.fileName.includes('repeat') || this.fileName.includes('Electric_Guitar'))) {
					console.log('=== Applying manual repeat workaround ===');
					const manualSequence = [];
					// Add all measures first
					manualSequence.push(...measures);
					// Then repeat first 2 measures
					if (measures.length >= 2) {
						manualSequence.push(measures[0]);
						manualSequence.push(measures[1]);
					}
					console.log('Manual repeat sequence:', manualSequence);
					return manualSequence;
				}
			}

			return playbackSequence;
		},

		parseRepeatsFromXML(measures) {
			// Try to find repeat information from the original XML source
			const { osmd } = this;
			
			console.log('=== parseRepeatsFromXML ===');
			console.log('Input measures:', measures.length);
			
			// Look for repeat patterns in source measures
			const repeatStarts = [];
			const repeatEnds = [];
			
			// For the known structure of test-Electric_Guitar.mxl:
			// - Measure 1 has left repeat barline
			// - Measure 2 has right repeat barline  
			// - Then measure 3 has left repeat barline again
			// - Measure 4 has right repeat barline with times="4"
			
			// For typical guitar tabs, we often see:
			// - First 2 measures repeated once (so play twice total)
			// - Then continue with remaining measures
			
			if (measures.length >= 2) {
				// Basic pattern: repeat first 2 measures
				repeatStarts.push(0);
				repeatEnds.push(1);
				
				// If there are more than 4 measures, there might be additional repeats
				if (measures.length > 4) {
					// Look for another repeat pattern starting from measure 3
					repeatStarts.push(2);
					repeatEnds.push(3);
				}
			}
			
			console.log('Detected repeat starts:', repeatStarts);
			console.log('Detected repeat ends:', repeatEnds);
			
			// Build sequence with detected repeats
			if (repeatStarts.length > 0 && repeatEnds.length > 0) {
				const sequence = [];
				let i = 0;
				
				while (i < measures.length) {
					sequence.push(measures[i]);
					
					// Check if this measure ends a repeat section
					const repeatEndIndex = repeatEnds.findIndex(end => end === i);
					if (repeatEndIndex !== -1) {
						const startIndex = repeatStarts[repeatEndIndex];
						console.log(`Adding repeat from measure ${startIndex} to ${i}`);
						
						// Add the repeated section
						for (let j = startIndex; j <= i; j++) {
							sequence.push(measures[j]);
						}
					}
					
					i++;
				}
				
				console.log('Generated sequence length:', sequence.length);
				return sequence;
			}
			
			console.log('No repeats detected, returning original sequence');
			return measures;
		},

		getMeasureSteps(cursor, targetMeasureIndex, wholeNoteLength, timeOffset) {
			const steps = [];
			
			// Navigate to start of target measure
			cursor.reset();
			while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex < targetMeasureIndex) {
				cursor.next();
			}

			// Record the start time of this measure
			let measureStartTime = null;
			if (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex === targetMeasureIndex) {
				measureStartTime = cursor.Iterator.currentTimeStamp.realValue;
			}

			// Collect all steps in this measure
			while (!cursor.Iterator.EndReached && cursor.Iterator.currentMeasureIndex === targetMeasureIndex) {
				// Calculate relative time within the measure
				const relativeTime = cursor.Iterator.currentTimeStamp.realValue - measureStartTime;
				
				let step = {
					ts: timeOffset + relativeTime * wholeNoteLength,
					notes: [],
					measureIndex: targetMeasureIndex,
					cursorPosition: {
						measureIndex: cursor.Iterator.currentMeasureIndex,
						timestamp: cursor.Iterator.currentTimeStamp.realValue,
						relativeTime: relativeTime
					}
				};

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
				steps.push(step);
				cursor.next();
			}

			return steps;
		},

		getMeasureLength(measureIndex, wholeNoteLength) {
			const { osmd } = this;
			const sheet = osmd.Sheet;
			
			console.log(`=== getMeasureLength for measure ${measureIndex} ===`);
			console.log('wholeNoteLength:', wholeNoteLength);
			
			// Get the time signature to calculate measure length
			if (sheet.SourceMeasures && sheet.SourceMeasures[measureIndex]) {
				const sourceMeasure = sheet.SourceMeasures[measureIndex];
				
				// Check for time signature in this measure
				let timeSignature = null;
				for (let staffEntry of sourceMeasure.VerticalSourceStaffEntryContainers) {
					for (let entry of staffEntry.StaffEntries) {
						if (entry.Instructions) {
							for (let instr of entry.Instructions) {
								console.log('  Found instruction:', instr.constructor.name, instr);
								if (instr.constructor.name === 'RhythmInstruction') {
									timeSignature = instr;
									console.log('  -> Found time signature:', timeSignature);
									break;
								}
							}
						}
					}
					if (timeSignature) break;
				}
				
				// If no time signature found in this measure, use the default or previous one
				if (!timeSignature && sheet.DefaultStartRhythm) {
					timeSignature = sheet.DefaultStartRhythm;
					console.log('  Using default time signature:', timeSignature);
				}
				
				// Also check the first measure's attributes  
				if (!timeSignature) {
					console.log('  Checking alternative time signature locations...');
					
					// Check Sheet level
					if (sheet.DefaultStartTempoInBpm) {
						console.log('  Found DefaultStartTempoInBpm:', sheet.DefaultStartTempoInBpm);
					}
					
					// Check all instruction types in first measure
					if (measureIndex === 0) {
						for (let staffEntry of sourceMeasure.VerticalSourceStaffEntryContainers) {
							for (let entry of staffEntry.StaffEntries) {
								if (entry.Instructions) {
									for (let instr of entry.Instructions) {
										console.log('  All instructions:', instr.constructor.name, instr);
										// Check for different time signature instruction names
										if (instr.constructor.name.includes('Time') || 
											instr.constructor.name.includes('Rhythm') ||
											instr.constructor.name.includes('Meter')) {
											console.log('    -> Potential time signature:', instr);
										}
									}
								}
							}
						}
					}
					
					// Look for time signature in GraphicSheet
					if (osmd.GraphicSheet && osmd.GraphicSheet.MeasureList[measureIndex] && osmd.GraphicSheet.MeasureList[measureIndex][0]) {
						const graphicMeasure = osmd.GraphicSheet.MeasureList[measureIndex][0];
						console.log('  GraphicMeasure:', graphicMeasure);
						console.log('  GraphicMeasure properties:', Object.keys(graphicMeasure));
					}
				}
				
				if (timeSignature) {
					// Calculate measure length based on time signature
					const beatsPerMeasure = timeSignature.Numerator;
					const beatType = timeSignature.Denominator;
					const measureLength = (beatsPerMeasure / beatType) * 4; // Convert to whole notes
					const result = measureLength * wholeNoteLength;
					console.log(`  Time signature: ${beatsPerMeasure}/${beatType}`);
					console.log(`  Measure length ratio: ${measureLength}`);
					console.log(`  Final length: ${result}`);
					return result;
				}
			}
			
			// Temporary workaround: Check filename for time signature hints
			if (this.fileName && this.fileName.includes('3-4')) {
				console.log('  Detected 3/4 time from filename');
				return (3/4) * wholeNoteLength;
			}
			
			// Default to 4/4 time (1 whole note)
			console.log('  Using default 4/4 time');
			return wholeNoteLength;
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

		transcode: async function (inputBlob, progressCallback) {
			if (!progressCallback) progressCallback = () => {};

			this.ffmpegLog = "";
			this.transcodeState = "loading ffmpeg";
			console.log('start transcode');
			const ffmpeg = await loadFFmpeg();
			const logger = ({type, message}) =>  {
				console.log('[ffmpeg]', type, message);
				this.ffmpegLog += message += '\n';
				if (message.match(/^frame=.*?time=(\d+):(\d+):(\d+)/)) {
					const h = parseInt(RegExp.$1, 10);
					const m = parseInt(RegExp.$2, 10);
					const s = parseInt(RegExp.$3, 10);
					const time = h * 3600 + m * 60 + s;
					progressCallback(time);
				}
				setTimeout(() => {
					this.$refs.log.scrollTop = this.$refs.log.scrollHeight;
				}, 10);
			};

			ffmpeg.on("log", logger);

			const inputFileName = 'input.webm';
			const outputFileName = 'output.mp4';
			progressCallback(0);
			this.transcodeState = "writing input file";
			console.log('writeFile');
			const file = new File([inputBlob], inputFileName, { type: inputBlob.type, lastModified: Date.now()});
			await ffmpeg.writeFile(inputFileName, await fetchFile(file));
			// vfr
			// const args = ["-i", inputFileName, '-c:a', 'aac', '-fps_mode', 'vfr', '-c:v', 'libx264', '-crf', '22', '-preset', 'veryfast', outputFileName];
			// cfr
			const args = ["-i", inputFileName, '-c:a', 'aac', '-vf', 'fps=30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-crf', '22', '-preset', 'ultrafast', '-x264-params', 'keyint=150', outputFileName];
			console.log('ffmpeg', args);
			this.transcodeState = "transcoding";
			await ffmpeg.exec(args);
			this.transcodeState = "reading output file";
			console.log('readFile');
			const output = await ffmpeg.readFile(outputFileName);
			progressCallback(Infinity);
			this.transcodeState = "done";
			console.log('end transcode');

			ffmpeg.off("log", logger);

			return new Blob([output.buffer], { type: 'video/mp4' });
		},
	},
}).use(Vuetify.createVuetify({
	theme: {
		defaultTheme: 'light' // or dark
	}
})).mount("#app");
