export abstract class Renderer {
	protected abstract rendererName: string

	protected dataSource: Uint8Array

	protected _isInitialized = false

	protected isWebGLSupported = false

	protected gl: WebGL2RenderingContext | null = null

	protected ctx: CanvasRenderingContext2D | null = null

	constructor(protected canvas: HTMLCanvasElement) {
		this.dataSource = new Uint8Array()

		// Attempt to use WebGL2 context
		this.gl = this.canvas.getContext('webgl2')

		this.ctx = this.canvas.getContext('2d')

		this.isWebGLSupported = this.gl !== null
	}

	get isInitialized () {
		return this._isInitialized
	}

	public abstract init(): void

	public abstract render (dt: number): void

	public abstract connectDataSource (data: Uint8Array): void

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
}