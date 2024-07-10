
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
									fretboardNote: this.fretboardNotes[string - 1][fret],
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
				let endTime = startTime + steps[steps.length - 1].ts + Math.max.apply(null, steps[steps.length - 1].notes.map(note => note.duration));
				let first = true;

				const func = () => {
					if (!this.playing) {
						resolve();
						return;
					}

					const step = steps.shift();
					if (!step) {
						setTimeout(resolve, (endTime - audioContext.currentTime) * 1000);
						this.stop();
						return;
					}


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
								cursor.next();
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
				// cache all canvas
				while (!cursor.Iterator.EndReached) {
					cursor.next();
					await this.updateFretboard();
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
