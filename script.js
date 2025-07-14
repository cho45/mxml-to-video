
import {
	Fretboard,
	Systems,
	FretboardSystem
} from 'https://cdn.jsdelivr.net/npm/@moonwave99/fretboard.js@0.2.13/+esm';
import { Key, Pcset, Chord, ChordType, Interval, Note, Scale } from 'https://cdn.jsdelivr.net/npm/tonal@5.1.0/+esm';

import { FFmpeg } from './node_modules/@ffmpeg/ffmpeg/dist/esm/index.js';
import { fetchFile, toBlobURL } from './node_modules/@ffmpeg/util/dist/esm/index.js';
import { MusicStepGenerator } from './src/MusicStepGenerator.js';

const ENABLE_CACHE = false;
const TRANSCODE = true;

const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadFFmpeg() {
	if (loadFFmpeg.ffmpeg) {
		return loadFFmpeg.ffmpeg;
	}

	const ffmpeg = new FFmpeg();
	if (false && window.crossOriginIsolated) {
		// chrome だと動かない
		const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';
		console.log('loadFFmpeg', baseURL);
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm",),
			workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
		});
	} else {
		const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
		console.log('loadFFmpeg', baseURL);
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
			wasmURL: await toBlobURL( `${baseURL}/ffmpeg-core.wasm`, "application/wasm",),
		});
	}
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
			userLog: "",
			transcodeState: "",
			transcodeProgress: 0,
			debugMode: false,
		};
	},

	computed: {
		latestLogLine() {
			if (!this.userLog) return 'Ready...';
			const lines = this.userLog.trim().split('\n');
			const lastLine = lines[lines.length - 1];
			// Remove timestamp and emoji from log line for cleaner display
			return lastLine.replace(/^\[\d+:\d+:\d+\]\s*/, '') || 'Ready...';
		}
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

		// Check for debug mode in hash parameters
		const hashParams = new URLSearchParams(location.hash.slice(1));
		if (hashParams.has('debug')) {
			this.debugMode = true;
		}

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
		// User-friendly log system
		addUserLog(message, type = 'info') {
			const timestamp = new Date().toLocaleTimeString();
			const icon = {
				'info': 'ℹ️',
				'success': '✅',
				'warning': '⚠️',
				'error': '❌',
				'progress': '⚙️',
				'ffmpeg': '🎥',
				'audio': '🎵',
				'frames': '🖼️',
			}[type] || 'ℹ️';
			
			const logMessage = `[${timestamp}] ${icon} ${message}`;
			this.userLog += logMessage + '\n';
			
			// Technical debug info still goes to console
			console.log(`[UserLog ${type}]`, message);
			
			// Auto-scroll log container if it exists
			this.$nextTick(() => {
				if (this.$refs.userLogContainer) {
					this.$refs.userLogContainer.scrollTop = this.$refs.userLogContainer.scrollHeight;
				}
			});
		},

		clearUserLog() {
			this.userLog = '';
		},

		async loadFileFromInput() {
			const file = this.$refs.file.files[0]
			this.loadFile(file);
		},

		async loadFile(file) {
			console.log('loadFile', file); // Technical debug
			if (!file) return;
			
			this.loading = true;
			this.addUserLog(`Loading file: ${file.name}`, 'info');
			
			const reader = new FileReader();
			reader.onload = (e) => {
				const str = e.target.result;
				this.addUserLog('File loaded successfully, parsing MusicXML...', 'success');
				this.loadScore(str, file.name);
			};
			reader.onerror = (e) => {
				this.addUserLog(`Failed to read file: ${e.message || 'Unknown error'}`, 'error');
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

			this.addUserLog('Initializing music score renderer...', 'progress');
			
			await timeout(10);
			const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.$refs.osmdContainer);
			this.osmd = osmd;
			
			this.addUserLog('Loading and parsing score data...', 'progress');
			await osmd.load(url);
			console.log(osmd); // Technical debug
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
			
			this.addUserLog('Rendering musical notation...', 'progress');
			osmd.render();

			if (osmd.Sheet.hasBPMInfo) {
				this.bpm = osmd.Sheet.DefaultStartTempoInBpm;
			}

			const cursor = osmd.cursor;
			cursor.show();

			this.addUserLog('Initializing step generator...', 'progress');
			this.stepGenerator = new MusicStepGenerator(osmd, {
				fretboardNotes: this.fretboardNotes,
			});

			this.addUserLog('Initializing fretboard display...', 'progress');
			this.updateFretboard();
			
			this.loading = false;
			this.addUserLog(`Score loaded successfully: ${this.fileName}`, 'success');
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
				const pixelRatio = 1;
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

				const steps = await this.stepGenerator.generateSteps();
				
				// Store current step index for visual tracking
				let visualStepIndex = 0;

				const voice = await this.loadVoice('./assets/0270_Gibson_Les_Paul_sf2_file.js', '_tone_0270_Gibson_Les_Paul_sf2_file');
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
									this.stepGenerator.syncCursorToVirtualPosition(targetStep.virtualPosition);
									await this.updateFretboard();
								}
							}
						} else {
							requestAnimationFrame(update);
						}
					};
					
					if (first) {
						// For the first step, update immediately
						this.stepGenerator.syncCursorToVirtualPosition(0);
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
			this.stepGenerator.resetRepeatedCursor();
			this.updateFretboard();
		},

		async record() {
			const { osmd } = this;

			this.video = null;
			this.transcodeState = "";
			this.transcodeProgress = 0;

			console.log('record: generating steps and frames...');
			this.addUserLog('Generating steps...', 'progress');
			this.transcodeState = "generating steps";

			// ステップ生成（既存のplay()ロジックを流用）
			const steps = await this.stepGenerator.generateSteps();
			console.log('record: generated', steps.length, 'steps');

			// プログレス初期化
			this.audioProgress = 0;
			this.frameProgress = 0;
			this.transcodeProgress = 0;

			// 音声生成と静止画シーケンス生成を並列実行
			this.transcodeState = "generating audio and frames";
			const [audioBlob, frames] = await Promise.all([
				this.generateAudio(steps),
				this.generateFrames(steps)
			]);
			console.log('record: generated audio and', frames.length, 'frames');
			this.transcodeProgress = 50; // 並列処理完了

			// ffmpegで動画合成
			this.transcodeState = "encoding video";
			const mp4 = await this.encodeVideo(frames, audioBlob, (progress) => {
				this.transcodeProgress = progress;
			});

			const videoURL = URL.createObjectURL(mp4);
			this.$refs.video.src = videoURL;
			this.video = videoURL;
			
			this.addUserLog('Video encoding complete', 'success');
			this.transcodeState = "done";
			this.transcodeProgress = 100;
			console.log('record: complete');
		},

		async generateFrames(steps) {
			const { osmd } = this;
			const cursor = osmd.cursor;
			const canvas = this.$refs.canvas;
			const frames = [];

			cursor.reset();

			this.addUserLog(`Generating ${steps.length} frames...`, 'frames');
			
			for (let i = 0; i < steps.length; i++) {
				// カーソーを該当位置に移動
				const targetStep = steps[i];
				this.stepGenerator.syncCursorToVirtualPosition(targetStep.virtualPosition);

				// フレットボード更新
				await this.updateFretboard();
				
				// 静止画として保存
				const blob = await new Promise(resolve => {
					canvas.toBlob(resolve, 'image/png');
				});
				
				frames.push({
					blob,
					timestamp: steps[i].ts,
					duration: i < steps.length - 1 ? steps[i + 1].ts - steps[i].ts : 1.0
				});
				
				if (i % 10 === 0) {
					// 並列実行のためフレーム進捗を保存
					this.frameProgress = (i / steps.length) * 100;
					this.addUserLog(`Generated frame ${i + 1}/${steps.length} (${this.frameProgress.toFixed(2)}%)`, 'frames');
					this.updateCombinedProgress();
				}
			}
			
			cursor.reset();
			this.frameProgress = 100; // フレーム生成完了
			this.addUserLog(`Generated ${frames.length} frames`, 'success');
			return frames;
		},

		async generateAudio(steps) {
			// 音声の総再生時間を計算
			let totalDuration = 0;
			if (steps.length > 0) {
				const lastStep = steps[steps.length - 1];
				const maxNoteDuration = lastStep.notes.length > 0 
					? Math.max(...lastStep.notes.map(note => note.duration))
					: 0;
				totalDuration = lastStep.ts + maxNoteDuration;
			}
			
			if (totalDuration === 0) {
				// 音声なしの場合、無音WAVを作成
				return this.createSilentWav(1.0);
			}

			console.log('generateAudio: total duration', totalDuration, 'seconds');
			this.addUserLog(`Generating audio: total duration ${totalDuration} seconds`, 'audio');

			// OfflineAudioContextで高速レンダリング（メモリ使用量削減のため設定を最適化）
			const sampleRate = 8000; // サンプルレートを下げる
			const channels = 1; // モノラルに変更
			const contextLength = Math.ceil(totalDuration * sampleRate);
			console.log('generateAudio: creating OfflineAudioContext', channels, 'ch,', sampleRate, 'Hz,', contextLength, 'samples');
			const offlineCtx = new OfflineAudioContext(channels, contextLength, sampleRate);
			
			// OfflineAudioContextにはresumeメソッドがないので、ダミーメソッドを追加
			offlineCtx.resume = () => Promise.resolve();
			
			// WebAudioFontプレイヤーのセットアップ
			const player = new WebAudioFontPlayer();
			const voice = await this.loadVoice('./assets/0270_Gibson_Les_Paul_sf2_file.js', '_tone_0270_Gibson_Les_Paul_sf2_file');
			
			// 全音符をスケジューリング
			let totalNotes = 0;
			for (let step of steps) {
				for (let note of step.notes) {
					const pitch = Note.get(note.fretboardNote).midi;
					player.queueWaveTable(offlineCtx, offlineCtx.destination, voice, step.ts, pitch, note.duration, note.volume * 0.5);
					totalNotes++;
				}
			}
			console.log('generateAudio: scheduled', totalNotes, 'notes over', totalDuration.toFixed(2), 'seconds');

			console.log('generateAudio: rendering...');
			this.transcodeProgress = 10;

			// currentTimeを定期的にチェックして進捗計算
			const audioBuffer = await new Promise((resolve, reject) => {
				// 進捗監視のためのinterval
				const progressInterval = setInterval(() => {
					const progress = (offlineCtx.currentTime / totalDuration) * 100;
					console.log('Audio rendering progress:', progress.toFixed(2) + '%');
					this.addUserLog(`Audio rendering progress: ${offlineCtx.currentTime.toFixed(1)}/${totalDuration.toFixed(1)} (${progress.toFixed(2)}%)`, 'audio');
					this.audioProgress = progress;
					this.updateCombinedProgress();
				}, 500); // 0.5秒間隔

				// 完了イベントリスナー
				offlineCtx.oncomplete = (event) => {
					clearInterval(progressInterval);
					console.log('Audio rendering complete');
					resolve(event.renderedBuffer);
				};

				// レンダリング開始
				offlineCtx.startRendering().catch((error) => {
					clearInterval(progressInterval);
					reject(error);
				});
			});
			console.log('generateAudio: rendered', audioBuffer.duration, 'seconds');
			this.addUserLog(`Audio rendering complete: ${audioBuffer.duration.toFixed(2)} seconds`, 'audio');
			this.audioProgress = 100; // 音声生成完了

			// AudioBufferをWAVファイルに変換
			console.log('generateAudio: converting to WAV...');
			const wavBlob = this.audioBufferToWav(audioBuffer);
			console.log('generateAudio: WAV conversion complete');
			this.addUserLog('Audio conversion to WAV complete', 'success');
			return wavBlob;
		},

		audioBufferToWav(audioBuffer) {
			const numberOfChannels = audioBuffer.numberOfChannels;
			const sampleRate = audioBuffer.sampleRate;
			const length = audioBuffer.length;
			
			// WAVヘッダーサイズ + データサイズ
			const buffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
			const view = new DataView(buffer);
			
			// WAVヘッダー書き込み
			const writeString = (offset, string) => {
				for (let i = 0; i < string.length; i++) {
					view.setUint8(offset + i, string.charCodeAt(i));
				}
			};
			
			writeString(0, 'RIFF');
			view.setUint32(4, 36 + length * numberOfChannels * 2, true);
			writeString(8, 'WAVE');
			writeString(12, 'fmt ');
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, numberOfChannels, true);
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * numberOfChannels * 2, true);
			view.setUint16(32, numberOfChannels * 2, true);
			view.setUint16(34, 16, true);
			writeString(36, 'data');
			view.setUint32(40, length * numberOfChannels * 2, true);
			
			// PCMデータ書き込み
			let offset = 44;
			for (let i = 0; i < length; i++) {
				for (let channel = 0; channel < numberOfChannels; channel++) {
					const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
					view.setInt16(offset, sample * 0x7FFF, true);
					offset += 2;
				}
			}
			
			return new Blob([buffer], { type: 'audio/wav' });
		},

		createSilentWav(duration) {
			const sampleRate = 8000; // generateAudioと同じサンプルレート
			const channels = 1; // モノラル
			const length = Math.floor(duration * sampleRate);
			const buffer = new ArrayBuffer(44 + length * channels * 2);
			const view = new DataView(buffer);
			
			// WAVヘッダー（無音）
			const writeString = (offset, string) => {
				for (let i = 0; i < string.length; i++) {
					view.setUint8(offset + i, string.charCodeAt(i));
				}
			};
			
			writeString(0, 'RIFF');
			view.setUint32(4, 36 + length * channels * 2, true);
			writeString(8, 'WAVE');
			writeString(12, 'fmt ');
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, channels, true);
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * channels * 2, true);
			view.setUint16(32, channels * 2, true);
			view.setUint16(34, 16, true);
			writeString(36, 'data');
			view.setUint32(40, length * channels * 2, true);
			
			// データ部分は0で埋める（無音）
			// ArrayBufferは初期化時に0で埋められるので何もしない
			
			return new Blob([buffer], { type: 'audio/wav' });
		},

		async encodeVideo(frames, audioBlob, progressCallback) {
			if (!progressCallback) progressCallback = () => {};
			console.log('encodeVideo: loading ffmpeg');
			const ffmpeg = await loadFFmpeg();
			
			const logger = ({type, message}) => {
				console.log('[ffmpeg]', type, message);
				this.addUserLog(message, 'ffmpeg');
				const timeMatch = message.match(/^frame=.*?time=(\d+):(\d+):(\d+)/);
				if (timeMatch) {
					const h = parseInt(timeMatch[1], 10);
					const m = parseInt(timeMatch[2], 10);
					const s = parseInt(timeMatch[3], 10);
					const time = h * 3600 + m * 60 + s;
					const totalDuration = frames.length > 0 ? frames[frames.length - 1].timestamp : 1;
					progressCallback(50 + (time / totalDuration * 50)); // 50%から100%まで
				}
				setTimeout(() => {
					if (this.$refs.log) {
						this.$refs.log.scrollTop = this.$refs.log.scrollHeight;
					}
				}, 10);
			};

			ffmpeg.on("log", logger);

			try {
				// 音声ファイル書き込み
				console.log('encodeVideo: writing audio file');
				await ffmpeg.writeFile('audio.wav', await fetchFile(audioBlob));

				// 画像フレーム書き込み
				console.log('encodeVideo: writing', frames.length, 'frame files');
				for (let i = 0; i < frames.length; i++) {
					const fileName = `frame_${String(i).padStart(6, '0')}.png`;
					await ffmpeg.writeFile(fileName, await fetchFile(frames[i].blob));
				}

				// frame duration listファイル作成（各フレームの表示時間を指定）
				let frameList = '';
				for (let i = 0; i < frames.length; i++) {
					frameList += `file 'frame_${String(i).padStart(6, '0')}.png'\n`;
					frameList += `duration ${frames[i].duration}\n`;
				}
				// 最後のフレームは追加で指定が必要
				if (frames.length > 0) {
					frameList += `file 'frame_${String(frames.length - 1).padStart(6, '0')}.png'\n`;
				}
				
				await ffmpeg.writeFile('frames.txt', new TextEncoder().encode(frameList));

				// ffmpegで動画生成
				const outputFileName = 'output.mp4';
 				const args = [
 					'-f', 'concat',
 					'-safe', '0',
 					'-i', 'frames.txt',
 					'-i', 'audio.wav',
 					'-c:v', 'libx264',
					'-vf', 'scale=1280:-1',
 					'-tune', 'stillimage',
 					'-preset', 'ultrafast',
 					'-x264-params', 'keyint=150',
 					'-pix_fmt', 'yuv420p',
 					'-crf', '28',
 					'-shortest',
 					'-c:a', 'aac',
 					outputFileName
 				];

				console.log('encodeVideo: running ffmpeg', args);
				await ffmpeg.exec(args);

				console.log('encodeVideo: reading output file');
				const output = await ffmpeg.readFile(outputFileName);
				progressCallback(100);
				console.log('encodeVideo: complete');

				ffmpeg.off("log", logger);
				return new Blob([output.buffer], { type: 'video/mp4' });

			} catch (error) {
				ffmpeg.off("log", logger);
				throw error;
			}
		},

		updateCombinedProgress() {
			const audioProgress = this.audioProgress || 0;
			const frameProgress = this.frameProgress || 0;
			this.transcodeProgress = (audioProgress + frameProgress) / 2 / 2;
		},

		getAllPositionForMeasure(measure) {
			const ret = [];
			for (let container of measure.VerticalSourceStaffEntryContainers) {
				for (let staffEntry of container.StaffEntries) {
					if (!staffEntry.parentStaff.isTab) continue;
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

			this.addUserLog("loading ffmpeg", 'ffmpeg');
			this.transcodeState = "loading ffmpeg";
			console.log('start transcode');
			const ffmpeg = await loadFFmpeg();
			const logger = ({type, message}) =>  {
				console.log('[ffmpeg]', type, message);
				this.addUserLog(message, 'ffmpeg');
				const timeMatch = message.match(/^frame=.*?time=(\d+):(\d+):(\d+)/);
				if (timeMatch) {
					const h = parseInt(timeMatch[1], 10);
					const m = parseInt(timeMatch[2], 10);
					const s = parseInt(timeMatch[3], 10);
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
			this.addUserLog("transcode complete", 'success');

			ffmpeg.off("log", logger);

			return new Blob([output.buffer], { type: 'video/mp4' });
		},
	},
}).use(Vuetify.createVuetify({
	theme: {
		defaultTheme: 'light',
		themes: {
			light: {
				colors: {
					primary: '#6A4C93',     // Deep Purple - メインブランドカラー
					secondary: '#FF6B6B',   // Coral Red - アクセント要素
					accent: '#4ECDC4',      // Teal - 強調表示
					success: '#4CAF50',     // Green - 成功メッセージ
					warning: '#FF9800',     // Orange - 警告
					error: '#F44336',       // Red - エラー
					info: '#2196F3',        // Blue - 情報
					surface: '#FFFFFF',     // White - カード背景
					background: '#F5F5F5'   // Light Gray - 全体背景
				}
			},
			dark: {
				colors: {
					primary: '#8E44AD',     // Lighter Purple for dark mode
					secondary: '#E74C3C',   // Bright Red
					accent: '#1ABC9C',      // Bright Teal
					success: '#27AE60',     // Bright Green
					warning: '#F39C12',     // Bright Orange
					error: '#E74C3C',       // Bright Red
					info: '#3498DB',        // Bright Blue
					surface: '#1E1E1E',     // Dark Gray - カード背景
					background: '#121212'   // Very Dark Gray - 全体背景
				}
			}
		}
	}
})).mount("#app");
