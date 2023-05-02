/* Constants */
import { EdgeVertexIndices, TriangleTable } from "../constants/lookup-table";
import { CONSTANTS } from "../constants/constants";

/* Utils */
import { max, min } from "lodash";
import { NumberUtils } from "../utils/utils";
import { glMatrix, mat4, vec3, vec4 } from "gl-matrix";

/* WebGL */
import { Shader } from "../webgl/shader";
import { ShaderProgram } from "../webgl/shader-program";
import { Renderer } from "./renderer";
import { Camera } from "../webgl/camera";

/* Worker */
import Worker from '../workers/fft-3d.worker?worker'

export class FFT3D extends Renderer {
	public _rendererName = CONSTANTS.RENDERERS.NAMES.FFT3D

	public readonly supportWebWorker = true

	private shaderProgram: ShaderProgram | null = null

	private keysMap: Record<string, boolean> = {}

	private uniformSetters: Record<string, Function> = {}

	private positionAttributeLocation = -1

	private normalAttributeLocation = -1

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

	private readonly VOXEL_SIZE = 1

	private readonly ISO_LEVEL = 0

	/* Marching Cubes Data */
	// Data format:
	// x, y, z, d
	// x, y, z are point coordinate in marching cube's grid
	// d is the point's density value
	private data: vec4[] = []

	/* Workers */
	worker: Worker | null = null

	public maxX = Number.NEGATIVE_INFINITY

	public minX = Number.POSITIVE_INFINITY

	public maxZ = Number.NEGATIVE_INFINITY

	public minZ = Number.POSITIVE_INFINITY

	public init(): void {
		if (this.isInitialized) {
			this.log('log', 'FFT3D has been initialized!')
			return
		}

		if (!this.isWebGLSupported) {
			this.log('error', 'No WebGL2 Rendering Context found! Your browser may not support WebGL2')

			// Since Marching Cube is solely based on WebGL2
			// If there is no webgl2 available, then don't initialize it
			return
		}

		this.initCamera()

		this.initWebGL()

		this.initData()

		this.initEvents()

		if (this.useWebWorker) {
			this.initWorker()
		}

		this._isInitialized = true

		this.log('log', 'Initialized')
	}

	private initCamera () {
		this.camera = new Camera()

		this.camera.positionText = document.getElementById(CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_POS_SPAN_ID)
		this.camera.rotationText = document.getElementById(CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_ROT_SPAN_ID)

		this.camera.setSpecular(
			CONSTANTS.CAMERA.FFT3D.SPECULAR_POS,
			CONSTANTS.CAMERA.FFT3D.SPECULAR_ROT
		)

		this.camera.lockCamera()
	}

	private initWebGL () {
		const gl = this.gl

		if (!gl) {
			this.log('error', 'No WebGL2 Rendering Context found! Your browser may not support WebGL2')
			return
		}

		// Set GL viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		// Create Shaders
		const vertexShader = Shader.fromScript(gl, CONSTANTS.SHADER_SCRIPTS.FFT3D.VERTEX_SCRIPT_ID)

		const fragmentShader =  Shader.fromScript(gl, CONSTANTS.SHADER_SCRIPTS.FFT3D.FRAGMENT_SCRIPT_ID)

		// Create Shader Program
		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		this.shaderProgram = shaderProgram

		shaderProgram.use()

		// Get Uniform Setters
		this.uniformSetters = shaderProgram.createUniformSetters()

		// Calculating aspect by canvas.width / canvas.height is not recommended since CSS may influenced the size
		// Should use canvas.clientWidth and canvas.clientHeight since those are constants and not influeced by CSS
		shaderProgram.setUniforms(this.uniformSetters, {
			'projection': mat4.perspective(mat4.create(), glMatrix.toRadian(45.0), (gl.canvas as HTMLCanvasElement).clientWidth / (gl.canvas as HTMLCanvasElement).clientHeight, 0.1, 300),
			'lightPos': [0.5, 0.7, 1],
			'maxHeight': this.DIMENSIONS[1] * this.VOXEL_SIZE,
		})

		// Save attribute locations
		this.positionAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_position')

		this.normalAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_normal')

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
		gl.enable(gl.CULL_FACE);

		// Enable the depth buffer
		gl.enable(gl.DEPTH_TEST);
	}

	private initData () {
		// Initialize vertices data array
		// Each data is a vec4 contains x, y, z coordinate of the point and density value as 0
		// call z -> y -> z is COLUMN-MAJOR order
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					this.data.push(
						vec4.fromValues(x * this.VOXEL_SIZE, y * this.VOXEL_SIZE, z * this.VOXEL_SIZE, 0)
					)
				}
			}
		}
	}

	private initEvents () {
		document.addEventListener('keydown', this.onKeyboardDown.bind(this))

		document.addEventListener('keyup', this.onKeyboardUp.bind(this))

		document.addEventListener('mousemove', this.onMouseInput.bind(this))

		this.canvas.addEventListener('click', this.onCanvasClick.bind(this))
	}

	private initWorker () {
		// Check if browser support web worker
		if (window.Worker) {
			this.worker = new Worker()

			this.worker.onmessage = (ev: MessageEvent<any>) => {
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
					'view': this.camera.getViewMatrix()
				})

				// Unbind program
				this.gl.useProgram(null)
			}
		}
	}

	public update(dt: number): void {
		if (this.isInitialized) {
			this.updateFFT()

			// Using worker
			if (this.worker) {
				// transfer new data to workers
				if (!this.initSendingBuffer) {
					// If this is the first time to send data to the worker
					this.transferDataToWorker(1)
					this.initSendingBuffer = true
				}
			} else {
				// Not using worker
				// update data as normal
				this.updateData()
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

	private clearData () {
		this.ffts = []
		this.vertices = []
		this.data = []
		this.v1 = []
		this.v2 = []
	}

	private clearWebGL () {
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

		this.normalAttributeLocation = -1

		this.VAO = null

		this.verticesBuffer = null

		if (this.camera) {
			this.camera = null
		}
	}

	private clearEvents () {
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

	private renderMarchingCubes(_: number) {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		if (!this.shaderProgram) {
			throw new Error('No shader program!')
		}

		this.shaderProgram.use()

		if (!this.worker) {
			this.vertices = []

			this.minX = Number.POSITIVE_INFINITY

			this.maxX = Number.NEGATIVE_INFINITY

			this.minZ = Number.POSITIVE_INFINITY

			this.maxZ = Number.NEGATIVE_INFINITY

			// Triangulate based on vertices FFT data
			this.triangulate()
		} else {
			// Triangulate logic already been handled from the worker
			// Just need to wait for data
			// Clear old buffer data
			if (this.activeBuffer === 1) {
				this.vertices = this.v1
			} else {
				this.vertices = this.v2
			}
		}

		// Use VAO
		gl.bindVertexArray(this.VAO)

		// Tell WebGL to use verticesBuffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		// Fetch data into buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW)

		// Fetch data into position attribute from the buffer
		// Enable the attribute in the shader program
		gl.enableVertexAttribArray(this.positionAttributeLocation)

		// Instruct WebGL how to read the buffer
		const size = 3 // x, y, z components
		const type = gl.FLOAT
		const normalize = false
		const stride = 24
		let offset = 0

		// Fetch instruction to Shader Program
		gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset)

		gl.enableVertexAttribArray(this.normalAttributeLocation)

		offset = 12

		gl.vertexAttribPointer(this.normalAttributeLocation, size, type, normalize, stride, offset)

		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		gl.bindVertexArray(this.VAO)

		// Make canvas transparent
		// Make background black
		gl.clearColor(0, 0, 0, 1)
		gl.clear(gl.COLOR_BUFFER_BIT)

		gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 6)

		// Draw is done
		// Unbind things
		gl.bindVertexArray(null)

		gl.useProgram(null)

		gl.bindBuffer(gl.ARRAY_BUFFER, null)

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)

		// console.log(`minx: ${this.minX} | minz: ${this.minZ} | maxx: ${this.maxX} | maxz: ${this.maxZ}`)
	}

	private triangulate () {
		let cube: vec4[] = []

		let index: number

		for (let z = 0; z < this.DIMENSIONS[2] - 1; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1] - 1; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0] - 1; ++x) {
					// Get 8 points of a voxel
					/**
					 * i = 0  (binary: 000)
						i = 1  (binary: 001)
						i = 2  (binary: 010)
						i = 3  (binary: 011)
						i = 4  (binary: 100)
						i = 5  (binary: 101)
						i = 6  (binary: 110)
						i = 7  (binary: 111)
					 */
					for (let i = 0; i < 8; ++i) {
						index = NumberUtils.getIndexFromXYZ(
							x + (i & 1), // access the least significant bit
							y + ((i >> 1) & 1), // shift right and access the least significant bit
							z + ((i >> 2) & 1), // shift right two times and access the least significant bit
							this.DIMENSIONS
						)

						cube.push(this.data[index])
					}

					this.triangulateCube([...cube])

					cube = []
				}
			}
		}
	}

	// Construct the mesh from cube configuration
	// Implementation is inspired from https://www.youtube.com/watch?v=M3iI2l0ltbE&t=270s
	private triangulateCube(cube: vec4[]) {
		let cubeIndex = 0

		for (let i = 0; i < 8; ++i) {
			if (cube[i][3] > this.ISO_LEVEL) {
				cubeIndex |= 1 << i
			}
		}

		// Look up the triangulation for the current cubeIndex
		// Each entry is the index of the edge
		const triangulation = TriangleTable[cubeIndex]

		// The last number in triangulation is -1 indicates termination
		// I don't need it here, so I skip the last number
		let edgeIndex: number
		let i1: number, i2: number

		let vertexPos: vec3[] = []

		for (let i = 0; i < triangulation.length - 1; ++i) {
			edgeIndex = triangulation[i]

			// Lookup the indices of the corner points making up the current edge
			i1 = EdgeVertexIndices[edgeIndex][0]
			i2 = EdgeVertexIndices[edgeIndex][1]

			// Interpolate
			vertexPos.push(this.vertexInterp(cube[i1], cube[i2]))
		}

		for (let i = 0; i < vertexPos.length; i += 3) {
			this.addTriangle(vertexPos[i], vertexPos[i + 1], vertexPos[i + 2])
		}
	}

	// Interpolate between two points based on iso level
	// Point is a vec4 that contains x, y, x, d
	// d is the density value of the point
	// x, y, z is the coordinate of the point in world space
	private vertexInterp(p1: vec4, p2: vec4, iso?: number) {
		const isoLevel = iso ?? this.ISO_LEVEL

		if (Math.abs(isoLevel - p1[3]) < Number.EPSILON) return vec3.fromValues(p1[0], p1[1], p1[2])
		if (Math.abs(isoLevel - p2[3]) < Number.EPSILON) return vec3.fromValues(p2[0], p2[1], p2[2])
		if (Math.abs(p2[3] - p1[3]) < Number.EPSILON || (p2[3] === 0 && p1[3] === 0)) return vec3.fromValues(p1[0], p1[1], p1[2])

		const mu = (isoLevel - p1[3]) / (p2[3] - p1[3])

		const p: vec3 = vec3.fromValues(
			p1[0] + mu * (p2[0] - p1[0]),
			p1[1] + mu * (p2[1] - p1[1]),
			p1[2] + mu * (p2[2] - p1[2])
		)

		return p
	}

	/**
	 * Add triangle points and its normal surface to vertices array buffer
	 * @param p1 1st point
	 * @param p2 2nd point
	 * @param p3 3rd point
	 */
	private addTriangle(p1: vec3, p2: vec3, p3: vec3) {
		// Calculate normal vector
		const p12 = vec3.sub(vec3.create(), p1, p2)
		const p13 = vec3.sub(vec3.create(), p1, p3)

		const normal = vec3.cross(vec3.create(), p12, p13)

		this.minX = min([this.minX, p1[0], p2[0], p3[0]]) ?? Number.POSITIVE_INFINITY

		this.maxX = max([this.maxX, p1[0], p2[0], p3[0]]) ?? Number.NEGATIVE_INFINITY

		this.minZ = min([this.minZ, p1[2], p2[2], p3[2]]) ?? Number.POSITIVE_INFINITY

		this.maxZ = max([this.maxZ, p1[2], p2[2], p3[2]]) ?? Number.NEGATIVE_INFINITY

		this.vertices.push(
			p1[0], p1[1], p1[2], normal[0], normal[1], normal[2],
			p2[0], p2[1], p2[2], normal[0], normal[1], normal[2],
			p3[0], p3[1], p3[2], normal[0], normal[1], normal[2],
		)
	}

	private updateFFT () {
		if (!this.dataSource) {
			return
		}

		// Using worker
		// no need to update ffts array since data is already been sent to the worker
		if (this.worker) {
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

	private updateData () {
		// If FFT data is empty, then nothing to do here
		if (this.ffts.length === 0) return

		const MAX_HEIGHT = this.VOXEL_SIZE * this.DIMENSIONS[1]

		let height: number,
			value: number,
			index: number,
			maxHeightFFT: number,
			fft: Uint8Array

		let zIndex = 0

		// Update every vertices's densities
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			zIndex = this.DIMENSIONS[2] - 1 - z

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
					index = NumberUtils.getIndexFromXYZ(x, y, zIndex, this.DIMENSIONS)

					if (x >= fft.length) {
						// No data at x, then height is 0
						height = 0
					} else {
						height = NumberUtils.normalize({
							value: fft[x],
							fromRange: {
								min: 0,
								max: maxHeightFFT
							},
							toRange: {
								min: 0,
								max: MAX_HEIGHT - this.VOXEL_SIZE
							}
						})
					}

					value = height - this.data[index][1]

					// Update densities
					if (value < 0 || height === 0) {
						this.data[index][3] = 0
					} else {
						this.data[index][3] = value / height
					}
				}
			}
		}
	}

	private transferDataToWorker (bufferIndex: number) {
		if (!this.worker) {
			throw new Error('Worker has not been initialized!')
		}

		if (!this.dataSource || this.dataSource.length === 0) return

		// Pass data source buffer data to worker as a transferable object
		// clone fft array
		const clone = new Uint8Array(this.dataSource.length)

		clone.set(this.dataSource)

		this.worker.postMessage({
			type: CONSTANTS.WORKER.SOURCE_FROM_MAIN_THREAD,
			data: clone.buffer,
			bufferIndex
		}, [clone.buffer])
	}

	private receiveDataFromWorker (msg: any) {
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

	private writeBufferToVertices (buffer: ArrayBuffer) {
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

	/**
	 * Process Keyboard Input
	 * @param dt
	 */
	private processKeyInput (dt: number) {
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

	/* Event Handlers */
	private onMouseInput (ev: MouseEvent) {
		if (!this.camera) {
			return
		}

		this.camera.turnAround(ev.movementX, ev.movementY)
	}

	private onKeyboardUp (ev: KeyboardEvent) {
		this.keysMap[ev.code] = false
	}

	private onKeyboardDown (ev: KeyboardEvent) {
		this.keysMap[ev.code] = true
	}

	private async onCanvasClick () {
		await this.canvas.requestPointerLock()
	}
}