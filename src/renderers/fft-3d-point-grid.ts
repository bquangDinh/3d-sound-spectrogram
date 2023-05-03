/* Constants */
import { CONSTANTS } from '../constants/constants'

/* Utils */
import { max } from 'lodash'
import { NumberUtils } from '../utils/utils'
import { glMatrix, mat4, vec3 } from 'gl-matrix'

/* WebGL */
import { Shader } from '../webgl/shader'
import { ShaderProgram } from '../webgl/shader-program'
import { Renderer } from './renderer'
import { Camera } from '../webgl/camera'

/* Worker */
import Worker from '../workers/fft-3d-pointgrid.worker?worker'

export class FFT3DPointGrid extends Renderer {
	public _rendererName = CONSTANTS.RENDERERS.NAMES.FFT3D_POINTGRID

	public readonly supportWebWorker = true

	private shaderProgram: ShaderProgram | null = null

	private keysMap: Record<string, boolean> = {}

	// eslint-disable-next-line @typescript-eslint/ban-types
	private uniformSetters: Record<string, Function> = {}

	private positionAttributeLocation = -1

	private densityAttributeLocation = -1

	/* Reserver Buffers */
	private VAO: WebGLVertexArrayObject | null = null

	private verticesBuffer: WebGLBuffer | null = null

	/* Buffer Data */
	private vertices: number[] = []

	/* Double Buffering */
	/* Only use when using Worker */
	private v1: number[] = []

	private v2: number[] = []

	// Current active buffer index
	private activeBuffer = 1

	// Flag to check whether it should send the data to the worker for the first time
	private initSendingBuffer = false

	/* FFT data */
	private ffts: Uint8Array[] = []

	/* Marching Cube Configurations */
	private readonly DIMENSIONS: vec3 = [512, 24, 65]

	private readonly VOXEL_SIZE = 2

	/* Workers */
	worker: Worker | null = null

	public init(): void {
		if (this.isInitialized) {
			this.log('log', 'FFT3D has been initialized!')
			return
		}

		if (!this.isWebGLSupported) {
			this.log(
				'error',
				'No WebGL2 Rendering Context found! Your browser may not support WebGL2',
			)

			// Since Marching Cube is solely based on WebGL2
			// If there is no webgl2 available, then don't initialize it
			return
		}

		this.initCamera()

		this.initWebGL()

		this.initData()

		this.initEvents()

		if (this.useWebWorker && this.supportWebWorker) {
			this.initWorker()
		}

		this._isInitialized = true

		this.log('log', 'Initialized')
	}

	private initCamera() {
		this.camera = new Camera()

		this.camera.positionText = document.getElementById(
			CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_POS_SPAN_ID,
		)
		this.camera.rotationText = document.getElementById(
			CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_ROT_SPAN_ID,
		)

		this.camera.setSpecular(
			CONSTANTS.CAMERA.FFT3D_POINTGRID.SPECULAR_POS,
			CONSTANTS.CAMERA.FFT3D_POINTGRID.SPECULAR_ROT,
		)

		this.camera.lockCamera()
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

		// Set GL viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)

		// Create Shaders
		const vertexShader = Shader.fromScript(
			gl,
			CONSTANTS.SHADER_SCRIPTS.FFT3D_POINTGRID.VERTEX_SCRIPT_ID,
		)

		const fragmentShader = Shader.fromScript(
			gl,
			CONSTANTS.SHADER_SCRIPTS.FFT3D_POINTGRID.FRAGMENT_SCRIPT_ID,
		)

		// Create Shader Program
		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		this.shaderProgram = shaderProgram

		shaderProgram.use()

		// Get Uniform Setters
		this.uniformSetters = shaderProgram.createUniformSetters()

		// Calculating aspect by canvas.width / canvas.height is not recommended since CSS may influenced the size
		// Should use canvas.clientWidth and canvas.clientHeight since those are constants and not influeced by CSS
		shaderProgram.setUniforms(this.uniformSetters, {
			projection: mat4.perspective(
				mat4.create(),
				glMatrix.toRadian(45.0),
				(gl.canvas as HTMLCanvasElement).clientWidth /
					(gl.canvas as HTMLCanvasElement).clientHeight,
				0.1,
				300,
			),
		})

		// Save attribute locations
		this.positionAttributeLocation = gl.getAttribLocation(
			shaderProgram.program,
			'a_position',
		)

		this.densityAttributeLocation = gl.getAttribLocation(
			shaderProgram.program,
			'a_density',
		)

		// Create VAO and Array Buffers
		this.VAO = gl.createVertexArray()

		if (!this.VAO) {
			this.log('error', 'Cannot create VAO!')
			return
		}

		gl.bindVertexArray(this.VAO)

		this.verticesBuffer = gl.createBuffer()

		if (!this.verticesBuffer) {
			this.log('error', 'Cannot create buffer!')
			return
		}

		// Unbind VAO
		gl.bindVertexArray(null)

		// Turn on culling. By default backfacing triangles
		// will be culled.
		gl.enable(gl.CULL_FACE)

		// Enable the depth buffer
		gl.enable(gl.DEPTH_TEST)
	}

	private initData() {
		// Initialize vertices data array
		// Each data is a vec4 contains x, y, z coordinate of the point and density value as 0
		// call z -> y -> z is COLUMN-MAJOR order
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					this.vertices.push(
						x * this.VOXEL_SIZE,
						y * this.VOXEL_SIZE,
						z * this.VOXEL_SIZE,
						0,
					)
				}
			}
		}
	}

	private initEvents() {
		document.addEventListener('keydown', this.onKeyboardDown.bind(this))

		document.addEventListener('keyup', this.onKeyboardUp.bind(this))

		document.addEventListener('mousemove', this.onMouseInput.bind(this))

		this.canvas.addEventListener('click', this.onCanvasClick.bind(this))
	}

	private initWorker() {
		// Check if browser support web worker
		if (window.Worker) {
			this.worker = new Worker()

			this.worker.onmessage = (ev: MessageEvent<unknown>) => {
				this.receiveDataFromWorker(ev.data)
			}

			this.log('log', 'Created worker')
		} else {
			this.log('warn', 'Web browser does not support Web Worker')
		}
	}

	public render(dt: number): void {
		if (!this.isWebGLSupported) return

		if (!this.camera) {
			throw new Error('You forgot to init camera for FFT3D')
		}

		if (this.isInitialized) {
			this.resizeCanvasToDisplaySize()

			this.renderMarchingCubes(dt)

			// Update view matrix
			if (this.shaderProgram && this.gl) {
				this.shaderProgram.use()

				this.shaderProgram.setUniforms(this.uniformSetters, {
					view: this.camera.getViewMatrix(),
				})

				// Unbind program
				this.gl.useProgram(null)
			}
		}
	}

	public update(dt: number): void {
		if (this.isInitialized) {
			if (!this.worker) {
				this.updateFFT()

				this.updateData()
			} else {
				// If using worker, updating data is already done in worker
				// transfer new data to workers
				if (!this.initSendingBuffer) {
					// If this is the first time to send data to the worker
					this.transferDataToWorker(1)
					this.initSendingBuffer = true
				}
			}

			this.processKeyInput(dt)
		}
	}

	public clear(): void {
		this.clearData()

		this.clearWebGL()

		this.clearEvents()

		this.clearWorker()

		super.clear()
	}

	private clearData() {
		this.ffts = []
		this.vertices = []
		this.v1 = []
		this.v2 = []
	}

	private clearWebGL() {
		const gl = this.gl

		if (gl) {
			gl.bindVertexArray(this.VAO)

			gl.deleteBuffer(this.verticesBuffer)
			gl.deleteVertexArray(this.VAO)
		}

		if (this.shaderProgram) {
			this.shaderProgram.deleteProgram()
		}

		this.keysMap = {}

		this.uniformSetters = {}

		this.positionAttributeLocation = -1

		this.densityAttributeLocation = -1

		this.VAO = null

		this.verticesBuffer = null

		if (this.camera) {
			this.camera = null
		}
	}

	private clearEvents() {
		document.removeEventListener('keydown', this.onKeyboardDown)

		document.removeEventListener('keyup', this.onKeyboardUp)

		document.removeEventListener('mousemove', this.onMouseInput)

		this.canvas.removeEventListener('click', this.onCanvasClick)
	}

	private clearWorker() {
		if (this.worker) {
			this.worker.terminate()
			this.initSendingBuffer = false
			this.worker = null
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private renderMarchingCubes(_: number) {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		if (!this.shaderProgram) {
			throw new Error('No shader program!')
		}

		if (this.worker) {
			if (this.activeBuffer === 1) {
				this.vertices = this.v1
			} else {
				this.vertices = this.v2
			}
		}

		this.shaderProgram.use()

		// Use VAO
		gl.bindVertexArray(this.VAO)

		// Tell WebGL to use verticesBuffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		// Fetch data into buffer
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array(this.vertices),
			gl.DYNAMIC_DRAW,
		)

		// Fetch data into position attribute from the buffer
		// Enable the attribute in the shader program
		gl.enableVertexAttribArray(this.positionAttributeLocation)

		// Instruct WebGL how to read the buffer
		let size = 3 // x, y, z components
		const type = gl.FLOAT
		const normalize = false
		let stride = 16
		let offset = 0

		// Fetch instruction to Shader Program
		gl.vertexAttribPointer(
			this.positionAttributeLocation,
			size,
			type,
			normalize,
			stride,
			offset,
		)

		// Fetch data into density attribute from the buffer
		gl.enableVertexAttribArray(this.densityAttributeLocation)

		size = 1
		stride = 16
		offset = 12

		// Fetch instruction to Shader Program
		gl.vertexAttribPointer(
			this.densityAttributeLocation,
			size,
			type,
			normalize,
			stride,
			offset,
		)

		gl.bindVertexArray(this.VAO)

		// Make canvas transparent
		// Make background black
		gl.clearColor(0, 0, 0, 1)
		gl.clear(gl.COLOR_BUFFER_BIT)

		gl.drawArrays(gl.POINTS, 0, this.vertices.length / 4)

		// Draw is done
		// Unbind things
		gl.bindVertexArray(null)

		gl.useProgram(null)

		gl.bindBuffer(gl.ARRAY_BUFFER, null)

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
	}

	private updateFFT() {
		if (!this.dataSource) {
			return
		}

		// If the array is full, then throw the old one
		if (this.ffts.length > this.DIMENSIONS[2]) {
			this.ffts.shift()
		}

		// clone fft array
		const clone = new Uint8Array(this.dataSource.length)

		clone.set(this.dataSource)

		// add to ffts
		this.ffts.push(clone)
	}

	private updateData() {
		// If FFT data is empty, then nothing to do here
		if (this.ffts.length === 0) return

		const MAX_HEIGHT = this.VOXEL_SIZE * this.DIMENSIONS[1]

		let height: number,
			value: number,
			index: number,
			maxHeightFFT: number,
			fft: Uint8Array,
			xComp: number

		// Update every vertices's densities
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			// fft[z] is undefined here so skip this iteration
			if (z >= this.ffts.length) {
				continue
			}

			fft = this.ffts[this.ffts.length - 1 - z]

			maxHeightFFT = max(fft) ?? 0

			// For some rare cases
			// Like with the Airpods that has a very powerful noise-canceling tech built-in
			// The FFT graph may come out empty leading to maxHeightFFT = 0
			// Dividing to zero is forbidden
			// So to make sure it doesn't happen, just skip this iteration
			if (maxHeightFFT === 0) continue

			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					index = NumberUtils.getIndexFromXYZ(x, y, z, this.DIMENSIONS)

					index *= 4

					xComp = this.vertices[index] / this.VOXEL_SIZE

					if (xComp >= fft.length) {
						// No data at x, then height is 0
						height = 0
					} else {
						height = NumberUtils.normalize({
							value: fft[xComp],
							fromRange: {
								min: 0,
								max: maxHeightFFT,
							},
							toRange: {
								min: 0,
								max: MAX_HEIGHT - this.VOXEL_SIZE,
							},
						})
					}

					value = height - this.vertices[index + 1]

					// Update densities
					if (value < 0 || height === 0) {
						this.vertices[index + 3] = 0
					} else {
						this.vertices[index + 3] = value / height
					}
				}
			}
		}
	}

	/**
	 * Process Keyboard Input
	 * @param dt
	 */
	private processKeyInput(dt: number) {
		if (!this.camera) {
			return
		}

		if (this.keysMap['KeyW']) {
			this.camera.moveForward(dt)
		}

		if (this.keysMap['KeyS']) {
			this.camera.moveBackward(dt)
		}

		if (this.keysMap['KeyA']) {
			this.camera.turnLeft(dt)
		}

		if (this.keysMap['KeyD']) {
			this.camera.turnRight(dt)
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private receiveDataFromWorker(msg: any) {
		const { type, data, bufferIndex } = msg

		if (!type || !data) {
			throw new Error('Invalid data transfered to main thread')
		}

		if (type === CONSTANTS.WORKER.RESULT_FROM_WORKER) {
			if (!(data instanceof ArrayBuffer) || typeof bufferIndex !== 'number') {
				throw new Error('Invalid data transfered to main thread')
			}

			// Send the current active buffer to web worker for processing
			this.transferDataToWorker(this.activeBuffer)

			if (bufferIndex === 1) {
				// Buffer 1 data is processed
				// Save to the opposite buffer
				this.v2 = this.writeBufferToVertices(data)

				// Make buffer 2 as active
				this.activeBuffer = 2
			} else {
				// Buffer 2 data is processed
				// Save to the opposite buffer
				this.v1 = this.writeBufferToVertices(data)

				// Make buffer 1 as active
				this.activeBuffer = 1
			}
		}
	}

	private transferDataToWorker(bufferIndex: number) {
		if (!this.worker) {
			throw new Error('Worker has not been initialized!')
		}

		if (!this.dataSource || this.dataSource.length === 0) return

		// Pass data source buffer data to worker as a transferable object
		// clone fft array
		const clone = new Uint8Array(this.dataSource.length)

		clone.set(this.dataSource)

		this.worker.postMessage(
			{
				type: CONSTANTS.WORKER.SOURCE_FROM_MAIN_THREAD,
				data: clone.buffer,
				bufferIndex,
			},
			[clone.buffer],
		)
	}

	private writeBufferToVertices(buffer: ArrayBuffer) {
		// make sure the vertices data is clear
		const vertices = []

		const dataView = new DataView(buffer)

		// Float32 is 4 bytes each
		const length = dataView.byteLength / 4

		let value: number

		for (let i = 0; i < length; ++i) {
			value = dataView.getFloat32(i * 4)

			vertices.push(value)
		}

		return vertices
	}

	/* Event Handlers */
	private onMouseInput(ev: MouseEvent) {
		if (!this.camera) {
			return
		}

		this.camera.turnAround(ev.movementX, ev.movementY)
	}

	private onKeyboardUp(ev: KeyboardEvent) {
		this.keysMap[ev.code] = false
	}

	private onKeyboardDown(ev: KeyboardEvent) {
		this.keysMap[ev.code] = true
	}

	private async onCanvasClick() {
		await this.canvas.requestPointerLock()
	}
}
