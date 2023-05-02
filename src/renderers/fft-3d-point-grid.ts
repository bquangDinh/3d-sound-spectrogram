/* Constants */
import { CONSTANTS } from "../constants/constants";

/* Utils */
import { max } from "lodash";
import { NumberUtils } from "../utils/utils";
import { glMatrix, mat4, vec3 } from "gl-matrix";

/* WebGL */
import { Shader } from "../webgl/shader";
import { ShaderProgram } from "../webgl/shader-program";
import { Renderer } from "./renderer";
import { Camera } from "../webgl/camera";

export class FFT3DPointGrid extends Renderer {
	public _rendererName = CONSTANTS.RENDERERS.NAMES.FFT3D_POINTGRID

	public readonly supportWebWorker = false

	private shaderProgram: ShaderProgram | null = null

	private keysMap: Record<string, boolean> = {}

	private uniformSetters: Record<string, Function> = {}

	private positionAttributeLocation = -1

	private densityAttributeLocation = -1

	/* Reserver Buffers */
	private VAO: WebGLVertexArrayObject | null = null

	private verticesBuffer: WebGLBuffer | null = null

	/* Buffer Data */
	private vertices: number[] = []

	/* FFT data */
	private ffts: Uint8Array[] = []

	/* Marching Cube Configurations */
	private readonly DIMENSIONS: vec3 = [512, 24, 65]

	private readonly VOXEL_SIZE = 2

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

		this._isInitialized = true

		this.log('log', 'Initialized')
	}

	private initCamera () {
		this.camera = new Camera()

		this.camera.positionText = document.getElementById(CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_POS_SPAN_ID)
		this.camera.rotationText = document.getElementById(CONSTANTS.DOM_ELEMENTS.CAMERA_DEBUG_ROT_SPAN_ID)

		this.camera.setSpecular(
			CONSTANTS.CAMERA.FFT3D_POINTGRID.SPECULAR_POS,
			CONSTANTS.CAMERA.FFT3D_POINTGRID.SPECULAR_ROT
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
		const vertexShader = Shader.fromScript(gl, CONSTANTS.SHADER_SCRIPTS.FFT3D_POINTGRID.VERTEX_SCRIPT_ID)

		const fragmentShader =  Shader.fromScript(gl, CONSTANTS.SHADER_SCRIPTS.FFT3D_POINTGRID.FRAGMENT_SCRIPT_ID)

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
		})

		// Save attribute locations
		this.positionAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_position')

		this.densityAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_density')

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
					this.vertices.push(
						x * this.VOXEL_SIZE, y * this.VOXEL_SIZE, z * this.VOXEL_SIZE, 0
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

			this.updateData()

			this.processKeyInput(dt)
		}
	}

	public clear(): void {
		this.clearData()

		this.clearWebGL()

		this.clearEvents()

		super.clear()
	}

	private clearData () {
		this.ffts = []
		this.vertices = []
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

		this.densityAttributeLocation = -1

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

	private renderMarchingCubes(_: number) {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		if (!this.shaderProgram) {
			throw new Error('No shader program!')
		}

		this.shaderProgram.use()

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
		const type = gl.FLOAT
		const normalize = false
		let stride = 16
		let offset = 0

		// Fetch instruction to Shader Program
		gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset)

		// Fetch data into density attribute from the buffer
		gl.enableVertexAttribArray(this.densityAttributeLocation)

		size = 1
		stride = 16
		offset = 12

		// Fetch instruction to Shader Program
		gl.vertexAttribPointer(this.densityAttributeLocation, size, type, normalize, stride, offset)

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
					index = NumberUtils.getIndexFromXYZ(x * 4, y, z, [this.DIMENSIONS[0] * 4, this.DIMENSIONS[1], this.DIMENSIONS[2]])

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
								max: maxHeightFFT
							},
							toRange: {
								min: 0,
								max: MAX_HEIGHT - this.VOXEL_SIZE
							}
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