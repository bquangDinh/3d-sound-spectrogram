import { CONSTANTS } from "./constants/constants";

/* Renderers */
import { FFT2D } from "./renderers/fft-2d";
import { FFT3D } from "./renderers/fft-3d";
import { FFT3DPointGrid } from "./renderers/fft-3d-point-grid";
import { Renderer } from "./renderers/renderer";

/* Audio Files */
import ValseOp69No1 from './assets/audios/valse_op69_no_1.mp3'
import IllAlwaysRemember from './assets/audios/illalwaysremember.mp3'

import { UIUtils } from "./utils/utils";

export type GraphOptions = 'source' | 'cameraMovement' | 'graph' | 'webworker' | 'soundtrack'

export const GRAPH_OPS = {
	FFT3D: 'fft-3d',
	FFT2D: 'fft-2d',
	FFT3D_POINTGRID: 'fft-3d-point-grid'
}

export const SOURCE_OPS = {
	MIC: 'mic',
	SOUNDTRACK: 'soundtrack'
}

export const CAMERA_MOVEMENT_OPS = {
	LOCK: 'lock',
	FREE: 'free'
}

export const SOUNDTRACKS = {
	ILL_ALWAYS_REMEMBER: '1',
	VALSE_OP_69_N1: '2',
}

export type SourceType = 'mic' | 'soundtrack'

export class Graph {
	private canvas!: HTMLCanvasElement

	private canvasContainer!: HTMLDivElement

	private readonly FFT_SIZE = 512

	private mediaStream: MediaStream | null = null

	private audioContext: AudioContext

	private analyser: AnalyserNode | null = null

	private mic: MediaStreamAudioSourceNode | null = null

	private soundtrack: AudioBufferSourceNode | null = null

	private dataArray: Uint8Array = new Uint8Array()

	private isInitialized = false

	private currentAudioSource: SourceType | null = null

	private currentSoundtrack: string = SOUNDTRACKS.ILL_ALWAYS_REMEMBER

	private audioSourceStatus: 'loading' | 'done' | 'error' | 'none' = 'none'

	private soundConnections = {
		mic: false,
		audio: false
	}

	private options: Record<GraphOptions, string | boolean> = {
		source: 'mic',
		cameraMovement: 'lock',
		graph: '3d',
		webworker: false,
		soundtrack: SOUNDTRACKS.ILL_ALWAYS_REMEMBER
	}

	/* Graph Renderers */
	private renderers: Record<string, Renderer> = {}

	private activeRenderer: Renderer | null = null

	constructor(
		canvasId: string,
		canvasContainerId: string
	) {
		this.canvas = document.getElementById(canvasId) as HTMLCanvasElement
		this.canvasContainer = document.getElementById(canvasContainerId) as HTMLDivElement

		if (!this.canvas || !this.canvasContainer) {
			throw new Error('Canvas Or Container is null')
		}

		this.canvas.width = this.canvasContainer.clientWidth
		this.canvas.height = this.canvasContainer.clientHeight

		this.audioContext = new AudioContext()

		this.renderers = {
			[CONSTANTS.RENDERERS.NAMES.FFT2D]: new FFT2D(this.canvas),
			[CONSTANTS.RENDERERS.NAMES.FFT3D]: new FFT3D(this.canvas),
			[CONSTANTS.RENDERERS.NAMES.FFT3D_POINTGRID]: new FFT3DPointGrid(this.canvas)
		}
	}

	public async init () {
		if (this.isInitialized) {
			console.warn('Graph has been initialized')
			return
		}

		// Init analyser node
		await this.initAnalyser();

		/* Initialize Renderers */
		// this.initRenderers()

		this.isInitialized = true
	}

	private async initAnalyser () {
		const analyser = this.audioContext.createAnalyser()

		analyser.fftSize = this.FFT_SIZE

		this.analyser = analyser

		this.dataArray = new Uint8Array(analyser.frequencyBinCount)
	}

	// private async initRenderers () {
	// 	for (const key of Object.keys(this.renderers)) {
	// 		this.renderers[key].init()
	// 		this.renderers[key].connectDataSource(this.dataArray)
	// 	}
	// }

	public setOption (key: GraphOptions, value: string | boolean) {
		this.options[key] = value
	}

	public run () {
		const fpsText = document.getElementById(CONSTANTS.DOM_ELEMENTS.FPS_TEXT_ID)

		/* Keep track of time */
		let previousTime = 0

		let deltaTime = 0

		const draw = (currentTime: number) => {
			// Convert time to seconds
			currentTime *= 0.001

			deltaTime = currentTime - previousTime

			previousTime = currentTime

			this.setStateBaseOnOptions()

			this.update(deltaTime)

			this.render(deltaTime)

			if (fpsText) {
				fpsText.innerText = `${Math.floor(1 / deltaTime)}`
			}

			requestAnimationFrame(draw)
		}

		requestAnimationFrame(draw)
	}

	private update (dt: number) {
		if (!this.currentAudioSource) {
			// no source connected
			return
		}

		// Update source data
		this.updateSource()

		// Call renderer's updates
		if (this.activeRenderer) {
			this.activeRenderer.update(dt)
		}
	}

	private async render (dt: number) {
		if (this.activeRenderer) {
			this.activeRenderer.render(dt)
		}
	}

	private setStateBaseOnOptions () {
		this.setSource()
		this.setActiveRenderer()
		this.setCameraMovement()
		this.setUseWorker()
	}

	private setActiveRenderer () {
		let renderName: string

		switch (this.options.graph) {
			case GRAPH_OPS.FFT2D:
				renderName = CONSTANTS.RENDERERS.NAMES.FFT2D
				break
			case GRAPH_OPS.FFT3D_POINTGRID:
				renderName = CONSTANTS.RENDERERS.NAMES.FFT3D_POINTGRID
				break
			case GRAPH_OPS.FFT3D:
			default:
				renderName = CONSTANTS.RENDERERS.NAMES.FFT3D
		}

		// Make sure do this once
		if (this.activeRenderer && this.activeRenderer.rendererName !== renderName) {
			this.activeRenderer = this.renderers[renderName]
			this.activeRenderer.init()
			this.activeRenderer.connectDataSource(this.dataArray)

			// Clear other renderers
			for (const key of Object.keys(this.renderers)) {
				if (key !== renderName) {
					this.renderers[key].clear()
					this.renderers[key].existPointerLockMode()
				}
			}
		} else if (!this.activeRenderer) {
			this.activeRenderer = this.renderers[renderName]
			this.activeRenderer.init()
			this.activeRenderer.connectDataSource(this.dataArray)
		}
	}

	private setCameraMovement() {
		if (!this.activeRenderer) {
			return
		}

		// Set camera options
		if (this.activeRenderer.camera) {
			switch (this.options.cameraMovement) {
				case CAMERA_MOVEMENT_OPS.FREE:
					this.activeRenderer.camera.unlockCamera()
					break
				case CAMERA_MOVEMENT_OPS.LOCK:
				default:
					this.activeRenderer.camera.lockCamera()
			}
		}
	}

	private setUseWorker () {
		if (!this.activeRenderer) {
			return
		}

		// Set use web worker option
		this.activeRenderer.setWebWorker(this.options.webworker as boolean)
	}

	private setSource() {
		if (this.currentAudioSource === 'mic' && this.options.source === 'mic') {
			// mic is already set
			return
		}

		if (this.currentAudioSource === 'soundtrack' && this.options.source === 'soundtrack') {
			if (this.currentSoundtrack === this.options.soundtrack) {
				// soundtrack is already set
				return
			}
		}

		if (this.audioSourceStatus === 'loading') {
			// already being loaded
			return;
		}

		let connectSourcePromise: Promise<void>

		this.audioSourceStatus = 'loading'

		UIUtils.setSubHeaderText('Brewing!...', 'loading')

		switch (this.options.source) {
			case SOURCE_OPS.SOUNDTRACK:
				connectSourcePromise = this.connectToSoundtrack(this.options.soundtrack as string)
			case SOURCE_OPS.MIC:
			default:
				connectSourcePromise = this.connectMicrophone()
		}

		connectSourcePromise.then(() => {
			this.audioSourceStatus = 'done'

			UIUtils.setSubHeaderText('Done!', 'info')

			if (this.currentAudioSource === 'mic') {
				// Make sure to disconnect
				this.disconnectAudioSource()
			} else {
				// Make sure to disconnect
				this.disconnectMirophone()
			}

			setTimeout(() => {
				if (this.currentAudioSource === 'mic') {
					UIUtils.setSubHeaderText('From mic', 'microphone-recording')
				} else {
					UIUtils.setSubHeaderText('From soundtrack', 'soundtrack-playing')
				}
			}, 1500)
		})

		this.currentAudioSource = this.options.source as SourceType
		this.currentSoundtrack = this.options.soundtrack as string
	}

	/* Source Functions */
	private async connectMicrophone () {
		if (!this.analyser) {
			throw new Error('No analyser was found!')
		}

		if (!navigator.mediaDevices.getUserMedia) {
			console.warn('Your browser does not support microphone or the app does not have recording permission')
			return;
		}

		if (this.soundConnections.mic) {
			// already connected to microphone
			return;
		}

		const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

		this.mediaStream = stream

		if (!this.mic) {
			const mic = this.audioContext.createMediaStreamSource(stream)

			this.mic = mic
		}

		this.mic.connect(this.analyser)

		this.analyser.connect(this.audioContext.destination)

		this.soundConnections.mic = true
	}

	private disconnectMirophone () {
		if (this.soundConnections.mic) {
			if (!this.analyser) {
				throw new Error('No analyser was found!')
			}

			if (!this.mediaStream) {
				throw new Error('No media stream was found!')
			}

			if (!this.mic) {
				throw new Error('There is no mic source. You may forgot to initialize it')
			}

			this.mic.disconnect(this.analyser)

			this.mic.disconnect()

			this.analyser.disconnect()

			this.mediaStream.getTracks().forEach((track) => track.stop())

			this.clearData()

			this.soundConnections.mic = false
		}
	}

	private async connectToSoundtrack (name: string): Promise<void> {
		if (!this.analyser) {
			throw new Error('No analyser was found!')
		}

		if (this.soundConnections.audio && this.currentSoundtrack === name) {
			// already connected to soundtrack
			return
		}

		if (this.soundConnections.audio) {
			this.disconnectAudioSource()
		}

		let url = ValseOp69No1

		if (name === SOUNDTRACKS.VALSE_OP_69_N1) {
			url = ValseOp69No1
		} else if (name === SOUNDTRACKS.ILL_ALWAYS_REMEMBER) {
			url = IllAlwaysRemember
		}

		return new Promise((resolve, reject) => {
			const source = this.audioContext.createBufferSource()

			const request = new XMLHttpRequest()

			request.open('GET', url, true)

			request.responseType = "arraybuffer";

			request.onload = async () => {
				if (!this.analyser) {
					throw new Error('No analyser avaiable. You may forgot initialize it')
				}

				const audioData = request.response

				const buffer = await this.audioContext.decodeAudioData(audioData)

				source.buffer = buffer

				source.connect(this.analyser)

				this.analyser.connect(this.audioContext.destination)

				source.loop = true

				source.start(0)

				this.soundtrack = source

				this.soundConnections.audio = true

				resolve()
			}

			request.onerror = () => {
				reject('Failed to connect audio source')
			}

			request.send()
		})
	}

	private disconnectAudioSource () {
		if (this.soundConnections.audio) {
			if (!this.analyser) {
				throw new Error('No analyser was found!')
			}

			if (!this.mediaStream) {
				throw new Error('No media stream was found!')
			}

			if (!this.soundtrack) {
				throw new Error('There is no soundtrack source. You may forgot to initialize it')
			}

			this.soundtrack.stop()

			this.soundtrack.disconnect(this.analyser)

			this.analyser.disconnect()

			this.mediaStream.getTracks().forEach((track) => track.stop())

			this.clearData()

			this.soundConnections.audio = false
		}
	}

	private updateSource () {
		if (this.analyser) {
			// In case I forget
			if (this.dataArray.length < this.analyser.frequencyBinCount) {
				this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
			}

			// Fetch dataArray with data from the microphone
			this.analyser.getByteFrequencyData(this.dataArray)
		} else {
			throw new Error('No analyser was found!')
		}
	}

	private clearData () {
		// clear the data buffer

		// DON'T CREATING A NEW BUFFER
		// SINCE THERE ARE STILL SOME NODES THAT REFERENCING TO THIS BUFFER
		// THE OLD BUFFER THUS STILL WILL NOT BE COLLECTED BY THE GARBAGE COLLECTOR
		const view = new DataView(this.dataArray.buffer)

		for (let i = 0; i < this.dataArray.length; ++i) {
			view.setUint8(i, 0)
		}
	}
}