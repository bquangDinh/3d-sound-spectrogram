/* Renderers */
import { FFT2D } from "./renderers/fft-2d";

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

export class Graph {
	private canvas!: HTMLCanvasElement

	private canvasContainer!: HTMLDivElement

	private readonly FFT_SIZE = 512

	private analyser: AnalyserNode | null = null

	private dataArray: Uint8Array = new Uint8Array()

	private isInitialized = false

	private options: Record<GraphOptions, string> = {
		source: 'mic',
		cameraMovement: 'lock',
		graph: '3d',
	}

	/* Graph Renderers */
	private fft2dRenderer: FFT2D

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

		this.fft2dRenderer = new FFT2D(this.canvas)
	}

	public async init () {
		if (this.isInitialized) {
			console.warn('Graph has been initialized')
			return
		}

		// Init analyser node
		await this.initAnalyser();

		/* Initialize Renderers */
		this.initRenderers()

		this.isInitialized = true
	}

	private async initAnalyser () {
		if (!navigator.mediaDevices.getUserMedia) {
			// Browser does not support microphone
			this.analyser = null
		} else {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

			const audioContext = new AudioContext()

			const mic = audioContext.createMediaStreamSource(stream)

			const analyser = audioContext.createAnalyser()

			analyser.fftSize = this.FFT_SIZE

			mic.connect(analyser)

			analyser.connect(audioContext.destination)

			this.analyser = analyser

			this.dataArray = new Uint8Array(analyser.frequencyBinCount)
		}
	}

	private async initRenderers () {
		this.fft2dRenderer.init()
		this.fft2dRenderer.connectDataSource(this.dataArray)
	}

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

			this.update(deltaTime)

			this.render(deltaTime)

			requestAnimationFrame(draw)
		}

		requestAnimationFrame(draw)
	}

	private update (_: number) {
		switch (this.options.source) {
			case SOURCE_OPS.MIC:
				this.updateSourceFromMic()
		}
	}

	private async render (dt: number) {
		switch (this.options.graph) {
			case GRAPH_OPS.FFT2D:
				this.fft2dRenderer.render(dt)
		}
	}

	/* Source Functions */
	private updateSourceFromMic () {
		if (this.analyser) {
			// In case I forget
			if (this.dataArray.length < this.analyser.frequencyBinCount) {
				this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
			}

			// Fetch dataArray with data from the microphone
			this.analyser.getByteFrequencyData(this.dataArray)
		} else {
			console.warn('No analyser node found! Your browser may not support or block using microphone')
		}
	}
}