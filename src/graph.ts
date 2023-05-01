import { CONSTANTS } from "./constants";

/* Renderers */
import { FFT2D } from "./renderers/fft-2d";
import { FFT3D } from "./renderers/fft-3d";
import { FFT3DPointGrid } from "./renderers/fft-3d-point-grid";
import { Renderer } from "./renderers/renderer";

export type GraphOptions = 'source' | 'cameraMovement' | 'graph'

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

export class Graph {
	private canvas!: HTMLCanvasElement

	private canvasContainer!: HTMLDivElement

	private readonly FFT_SIZE = 512

	private mediaStream: MediaStream | null = null

	private audioContext: AudioContext

	private analyser: AnalyserNode | null = null

	private dataArray: Uint8Array = new Uint8Array()

	private isInitialized = false

	private isMicrophoneConnected = false

	private options: Record<GraphOptions, string> = {
		source: 'mic',
		cameraMovement: 'lock',
		graph: '3d',
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

	public setOption (key: GraphOptions, value: string) {
		this.options[key] = value
	}

	public run () {
		/* Keep track of time */
		let previousTime = 0

		let deltaTime = 0

		const draw = (currentTime: number) => {
			// Convert time to seconds
			currentTime *= 0.001

			deltaTime = currentTime - previousTime

			previousTime = currentTime

			this.setActiveRenderer()

			this.setBasedOnOptions()

			this.update(deltaTime)

			this.render(deltaTime)

			requestAnimationFrame(draw)
		}

		requestAnimationFrame(draw)
	}

	private update (dt: number) {
		switch (this.options.source) {
			case SOURCE_OPS.MIC:
				if (!this.isMicrophoneConnected) {
					this.connectMicrophone().then(() => {
						this.updateSourceFromMic()
					})
				} else {
					this.updateSourceFromMic()
				}
				break
			case SOURCE_OPS.SOUNDTRACK:
				// Make sure to disconnect the microphone
				this.disconnectMirophone()
		}

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

	private setBasedOnOptions () {
		if (!this.activeRenderer) {
			return
		}

		// Set camera options
		if (!this.activeRenderer.camera) {
			return
		}

		switch (this.options.cameraMovement) {
			case CAMERA_MOVEMENT_OPS.FREE:
				this.activeRenderer.camera.unlockCamera()
				break
			case CAMERA_MOVEMENT_OPS.LOCK:
			default:
				this.activeRenderer.camera.lockCamera()
		}
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

		if (this.isMicrophoneConnected) {
			return;
		}

		const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

		this.mediaStream = stream

		const mic = this.audioContext.createMediaStreamSource(stream)

		mic.connect(this.analyser)

		this.analyser.connect(this.audioContext.destination)

		this.isMicrophoneConnected = true
	}

	private disconnectMirophone () {
		if (this.isMicrophoneConnected) {
			if (!this.analyser) {
				throw new Error('No analyser was found!')
			}

			if (!this.mediaStream) {
				throw new Error('No media stream was found!')
			}

			if (this.analyser) {
				this.analyser.disconnect()
			}

			if (this.mediaStream) {
				this.mediaStream.getTracks().forEach((track) => track.stop())
			}

			this.clearData()

			this.isMicrophoneConnected = false;
		}
	}

	private updateSourceFromMic () {
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