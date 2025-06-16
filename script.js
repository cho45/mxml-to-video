
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
				
				// Store current step index for visual tracking
				let visualStepIndex = 0;

				const voice = await this.loadVoice('https://surikov.github.io/webaudiofontdata/sound/0270_Gibson_Les_Paul_sf2_file.js', '_tone_0270_Gibson_Les_Paul_sf2_file');
				const { player, audioContext, channelMaster } = this;
				await audioContext.resume();

				let startTime = audioContext.currentTime + 0.1;
				let endTime = startTime + (steps.length > 0 ? steps[steps.length - 1].ts + 2 : 0);
				let first = true;
				let playStepIndex = 0;

				const func = async () => {
					if (!this.playing) {
						resolve();
						return;
					}

					if (playStepIndex >= steps.length) {
						setTimeout(resolve, (endTime - audioContext.currentTime) * 1000);
						this.stop();
						return;
					}

					const step = steps[playStepIndex];
					playStepIndex++;

					const currentTs = startTime + step.ts;
					// console.log(currentTs, step.ts, step.notes.length, step);
					for (let note of step.notes) {
						const volume = note.volume;
						const duration = note.duration;
						const pitch = Note.get(note.fretboardNote).midi;
						player.queueWaveTable(audioContext, channelMaster.input, voice, currentTs, pitch, duration, volume);
					}
					

					const update = async () => {
						if (audioContext.currentTime >= currentTs - 0.005) {
							// Move visual cursor to match current step
							if (playStepIndex <= steps.length) {
								const targetStep = steps[playStepIndex - 1];
								if (targetStep) {
									// Sync physical cursor to target step's position
									await this.syncCursorToVirtualPosition(targetStep.virtualPosition);
									await this.updateFretboard();
								}
							}
						} else {
							requestAnimationFrame(update);
						}
					};
					
					if (first) {
						// For the first step, update immediately
						await this.syncCursorToVirtualPosition(0);
						await this.updateFretboard();
						first = false;
					} else {
						requestAnimationFrame(update);
					}

					setTimeout(func, (currentTs - audioContext.currentTime - 0.1) * 1000);
				};

				setTimeout(func, 10);
			});
		},

		stop() {
			this.playing = false;
		},

		reset() {
			if (this.virtualToPhysicalMap) {
				this.resetRepeatedCursor();
			} else {
				const { osmd } = this;
				const cursor = osmd.cursor;
				cursor.reset();
			}
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
		},

		resetRepeatedCursor() {
			const { osmd } = this;
			const cursor = osmd.cursor;
			cursor.reset();
			this.virtualCursorPosition = 0;
		},

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
		},

		getCurrentVirtualStep() {
			if (this.virtualCursorPosition < this.virtualToPhysicalMap.length) {
				return this.virtualToPhysicalMap[this.virtualCursorPosition];
			}
			return null;
		},

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
		},

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
			
			// Use OSMD's built-in time signature detection
			let timeSignature = null;
			
			// First check if there's a time signature at this specific measure
			if (sheet.SourceMeasures?.[measureIndex]) {
				const sourceMeasure = sheet.SourceMeasures[measureIndex];
				
				// Look for RhythmInstruction in this measure
				for (let container of sourceMeasure.VerticalSourceStaffEntryContainers) {
					for (let entry of container.StaffEntries) {
						const rhythmInstruction = entry.Instructions?.find(instr => 
							instr.constructor.name === 'RhythmInstruction'
						);
						if (rhythmInstruction) {
							timeSignature = rhythmInstruction;
							break;
						}
					}
					if (timeSignature) break;
				}
			}
			
			// Fall back to sheet's default time signature
			if (!timeSignature && sheet.DefaultStartRhythm) {
				timeSignature = sheet.DefaultStartRhythm;
			}
			
			// Fall back to first part's time signature
			if (!timeSignature && sheet.Parts?.[0]?.Measures?.[0]) {
				const firstMeasure = sheet.Parts[0].Measures[0];
				timeSignature = firstMeasure.timeSignature;
			}
			
			if (timeSignature) {
				const beatsPerMeasure = timeSignature.Numerator || 4;
				const beatType = timeSignature.Denominator || 4;
				const measureLength = (beatsPerMeasure / beatType) * 4; // Convert to whole notes
				return measureLength * wholeNoteLength;
			}
			
			// Default to 4/4 time
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
