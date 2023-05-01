/* Constants */
import { EdgeVertexIndices, TriangleTable } from "../lookup-table";
import { CONSTANTS } from "../constants";

/* Utils */
import { max } from "lodash";
import { NumberUtils } from "../utils";
import { glMatrix, mat4, vec3, vec4 } from "gl-matrix";

/* WebGL */
import { Shader } from "../webgl/shader";
import { ShaderProgram } from "../webgl/shader-program";
import { Renderer } from "./renderer";
import { Camera } from "../camera";

export class FFT3D extends Renderer {
	protected _rendererName = CONSTANTS.RENDERERS.NAMES.FFT3D

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

		this.camera = new Camera()

		this.initWebGL()

		this.initData()

		this.initEvents()

		this.initDebug()

		this._isInitialized = true

		this.log('log', 'Initialized')
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

	private initDebug () {
		if (this.camera) {
			this.camera.positionText = document.getElementById(CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_POS_SPAN_ID)
			this.camera.rotationText = document.getElementById(CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_ROT_SPAN_ID)
		}
	}

	public render(dt: number): void {
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

			this.updateData()

			this.processKeyInput(dt)
		}
	}

	public clear(): void {
		this.ffts = []
		this.vertices = []
		this.data = []

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

		document.removeEventListener('keydown', this.onKeyboardDown)

		document.removeEventListener('keyup', this.onKeyboardUp)

		document.removeEventListener('mousemove', this.onMouseInput)

		this.canvas.removeEventListener('click', this.onCanvasClick)

		super.clear()
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

		// Clear old buffer data
		this.vertices = []

		// Triangulate based on vertices FFT data
		this.triangulate()

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
		let size = 3 // x, y, z components
		let type = gl.FLOAT
		let normalize = false
		let stride = 24
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

	/**
	 * Process Keyboard Input
	 * @param dt
	 */
	private processKeyInput (dt: number) {
		if (!this.camera) {
			throw new Error('You forgot to init camera for FFT3D')
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
			throw new Error('You forgot to init camera for FFT3D')
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