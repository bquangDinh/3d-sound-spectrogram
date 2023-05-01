import { Camera } from "../camera"

export abstract class Renderer {
	protected abstract _rendererName: string

	protected dataSource: Uint8Array | null = null

	protected _isInitialized = false

	protected isWebGLSupported = false

	protected gl: WebGL2RenderingContext | null = null

	protected ctx: CanvasRenderingContext2D | null = null

	public camera: Camera | null = null

	constructor(protected canvas: HTMLCanvasElement) {
		// Attempt to use WebGL2 context
		this.gl = this.canvas.getContext('webgl2')

		this.ctx = this.canvas.getContext('2d')

		this.isWebGLSupported = this.gl !== null
	}

	get isInitialized () {
		return this._isInitialized
	}

	get rendererName () {
		return this._rendererName
	}

	public abstract init(): void

	public abstract render (dt: number): void

	public abstract update (dt: number): void

	protected log (type: 'log' | 'warn' | 'error' = 'log', ...data: any[]) {
		switch (type) {
			case 'error':
				console.error(`Renderer [${this.rendererName}]`, data)
				break
			case 'warn':
				console.warn(`Renderer [${this.rendererName}]`, data)
			case 'log':
			default:
				console.log(`Renderer [${this.rendererName}]`, data)
		}
	}

	public clear () {
		this._isInitialized = false
	}

	public connectDataSource(data: Uint8Array): void {
		this.dataSource = data
	}

	public disconnectDataSource(): void {
		this.dataSource = null
	}

	// Detech changes in canvas size and change canvas size accordingly
	// Only call when WebGL is supported
	protected resizeCanvasToDisplaySize () {
		if (this.gl) {
			const width = (this.gl.canvas as HTMLCanvasElement).clientWidth
			const height = (this.gl.canvas as HTMLCanvasElement).clientHeight

			if (this.gl.canvas.width !== width || this.gl.canvas.height !== height) {
				this.gl.canvas.width = width
				this.gl.canvas.height = height
			}
		}
	}
}