import { CONSTANTS } from '../constants/constants'

/* WebGL */
import { Shader } from '../webgl/shader'
import { ShaderProgram } from '../webgl/shader-program'
import { Renderer } from './renderer'

import { max } from 'lodash'

export class FFT2D extends Renderer {
	public _rendererName = CONSTANTS.RENDERERS.NAMES.FFT2D

	public readonly supportWebWorker = false

	private shaderProgram: ShaderProgram | null = null

	// eslint-disable-next-line @typescript-eslint/ban-types
	private uniformSetters: Record<string, Function> = {}

	private positionAttributeLocation = -1

	/* Reserver Buffers */
	private VAO: WebGLVertexArrayObject | null = null

	private verticesBuffer: WebGLBuffer | null = null

	private indicesBuffer: WebGLBuffer | null = null

	/* Buffer Data */
	private vertices: number[] = []

	private indices: number[] = []

	public init() {
		if (this.isInitialized) {
			this.log('log', 'FFT2D has been initialized!')
			return
		}

		if (this.isWebGLSupported) {
			this.initWebGL()
		}

		this._isInitialized = true

		this.log('log', 'Initialized')
	}

	private initWebGL() {
		const gl = this.gl

		if (!gl) {
			this.log(
				'error',
				'No WebGL2 Rendering Context found! Your browser may not support WebGL2',
			)
			return
		}

		// Set WebGL Viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

		// Create Shaders
		const vertexShader = Shader.fromScript(
			gl,
			CONSTANTS.SHADER_SCRIPTS.FFT2D.VERTEX_SCRIPT_ID,
		)

		const fragmentShader = Shader.fromScript(
			gl,
			CONSTANTS.SHADER_SCRIPTS.FFT2D.FRAGMENT_SCRIPT_ID,
		)

		// Create Shader Program
		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		this.shaderProgram = shaderProgram

		shaderProgram.use()

		// Get Uniform Setters
		this.uniformSetters = shaderProgram.createUniformSetters()

		// Set uniforms
		shaderProgram.setUniforms(this.uniformSetters, {
			u_resolution: [gl.canvas.width, gl.canvas.height],
		})

		// Get attribute locations
		this.positionAttributeLocation = gl.getAttribLocation(
			shaderProgram.program,
			'a_position',
		)

		this.VAO = gl.createVertexArray()

		if (!this.VAO) {
			this.log('error', 'Cannot create VAO!')
			return
		}

		gl.bindVertexArray(this.VAO)

		this.verticesBuffer = gl.createBuffer()

		this.indicesBuffer = gl.createBuffer()

		if (!this.verticesBuffer || !this.indicesBuffer) {
			this.log('error', 'Cannot create buffer!')
			return
		}

		// Unbind VAO
		gl.bindVertexArray(null)

		// Disable DEPTH_TEST
		// Since this is 2D
		gl.disable(gl.DEPTH_TEST)
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public update(_: number): void {
		// nothing here to update
	}

	public render(dt: number): void {
		if (!this.isInitialized) {
			return
		}

		if (this.isWebGLSupported) {
			this.resizeCanvasToDisplaySize()
			this.renderUsingWebGL(dt)
		} else {
			this.renderUsingCanvas(dt)
		}
	}

	public clear(): void {
		this.clearData()

		this.clearWebGL()

		super.clear()
	}

	private clearData() {
		this.vertices = []

		this.indices = []
	}

	private clearWebGL() {
		const gl = this.gl

		if (gl) {
			gl.bindVertexArray(this.VAO)

			gl.deleteBuffer(this.verticesBuffer)
			gl.deleteBuffer(this.indicesBuffer)
			gl.deleteVertexArray(this.VAO)
		}

		if (this.shaderProgram) {
			this.shaderProgram.deleteProgram()
		}

		this.uniformSetters = {}

		this.positionAttributeLocation = -1

		this.VAO = null

		this.verticesBuffer = null

		this.indicesBuffer = null
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private renderUsingWebGL(_: number) {
		if (!this.gl) {
			this.log('error', 'Your browser may not support WebGL2 Rendering Context')
			return
		}

		if (!this.shaderProgram) {
			throw new Error(
				`[${this.rendererName}] Shader Program is null. You maybe forger to create it`,
			)
		}

		if (!this.dataSource) {
			// no datasource
			return
		}

		const gl = this.gl

		const dataSource = this.dataSource

		const numData = dataSource.length

		// Clear old data
		this.vertices = []

		this.indices = []

		const DELTAX = gl.canvas.width / numData

		const MAX = max(dataSource) ?? 0

		// Start drawing from the bottom-left corner of the canvas
		let lastX = 0,
			lastY = 0

		let y: number

		this.vertices.push(lastX, lastY)

		// indices should be added here but there is a bug which make this doesn't work
		// I have no idea
		for (let i = 0; i < numData; ++i) {
			y = dataSource[i]

			this.vertices.push(
				// x y
				lastX + DELTAX,
				y,
			)

			this.indices.push(i, i + 1)

			// Update lastX, lastY
			lastX += DELTAX
			lastY = y
		}

		// Bind VAO
		gl.bindVertexArray(this.VAO)

		// Tell WebGL to use the vertices array buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		// Fetch vertices data into the vertices buffer
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array(this.vertices),
			gl.DYNAMIC_DRAW,
		)

		// Tell WebGL to use the indices array buffer
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indicesBuffer)

		// Fetch indices data into the indices buffer
		gl.bufferData(
			gl.ELEMENT_ARRAY_BUFFER,
			new Uint16Array(this.indices),
			gl.DYNAMIC_DRAW,
		)

		// Tell WebGL to use the vertices array buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		// Instruct WebGL how to read the vertices buffer
		gl.enableVertexAttribArray(this.positionAttributeLocation)

		// Instruct WebGL how to read the buffer
		const size = 2 // x, y components
		const type = gl.FLOAT
		const normalize = false
		const stride = 0
		const offset = 0

		gl.vertexAttribPointer(
			this.positionAttributeLocation,
			size,
			type,
			normalize,
			stride,
			offset,
		)

		// Tell WebGL to use the indices array buffer
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indicesBuffer)

		// Make canvas black
		gl.clearColor(0, 0, 0, 1)

		gl.clear(gl.COLOR_BUFFER_BIT)

		this.shaderProgram.use()

		// Set uniform
		this.shaderProgram.setUniforms(this.uniformSetters, {
			maxHeight: MAX,
		})

		gl.bindVertexArray(this.VAO)

		gl.drawElements(gl.LINES, this.indices.length, gl.UNSIGNED_SHORT, 0)

		// Draw is done
		// Unbind things
		gl.bindVertexArray(null)

		gl.useProgram(null)

		gl.bindBuffer(gl.ARRAY_BUFFER, null)

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private renderUsingCanvas(_: number) {
		if (!this.ctx) {
			this.log('error', 'Your browser may not support Canvas 2D Rendering Context')
			return
		}

		if (!this.dataSource) {
			// no datasource
			return
		}

		const canvas = this.canvas

		const ctx = this.ctx

		const dataSource = this.dataSource

		const numData = dataSource.length

		// Fill canvas background
		ctx.fillStyle = 'rgb(0, 0, 0)'

		ctx.fillRect(0, 0, canvas.width, canvas.height)

		const barWidth = (canvas.width / numData) * 2.5

		let barHeight: number
		let x = 0

		for (let i = 0; i < numData; i++) {
			barHeight = dataSource[i]

			ctx.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)'
			ctx.fillRect(x, this.canvas.height - barHeight / 2, barWidth, barHeight / 2)

			x += barWidth + 1
		}
	}
}
