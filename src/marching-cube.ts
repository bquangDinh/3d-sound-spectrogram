import { glMatrix, mat4, vec3, vec4 } from "gl-matrix";
import { Camera } from "./camera";
import { Shader } from "./webgl/shader";
import { ShaderProgram } from "./webgl/shader-program";
import { NumberUtils } from "./utils";
import { max } from "lodash";
import { EdgeVertexIndices, TriangleTable } from "./lookup-table";

export class MarchingCube {
	private shaderProgram!: ShaderProgram

	private shadowShaderProgram!: ShaderProgram

	private camera: Camera = new Camera()

	public keysMap: Record<string, boolean> = {}

	private ffts: Uint8Array[] = []

	/* Shader Program Properties */
	private uniformSetters: Record<string, Function> = {}

	private shadowUniformSetters: Record<string, Function> = {}

	// Shader Attribute Locations
	private positionAttributeLocation: number = -1

	private normalAttributeLocation: number = -1

	// Buffer
	private verticesBuffer: WebGLBuffer | null = null

	private indicesBuffer: WebGLBuffer | null = null

	private depthFrameBuffer: WebGLFramebuffer | null = null

	private depthTexture: WebGLTexture | null = null

	private VAO: WebGLVertexArrayObject | null = null

	// TEST CUBE
	private cube_vertices = [
		-0.5, -0.5, -0.5,
		0.5, -0.5, -0.5,
		0.5, 0.5, -0.5,
		-0.5, 0.5, -0.5,
		-0.5, -0.5, 0.5,
		0.5, -0.5, 0.5,
		0.5, 0.5, 0.5,
		-0.5, 0.5, 0.5
	]

	private cube_indices = [
		0, 1, 3, 3, 1, 2,
		1, 5, 2, 2, 5, 6,
		5, 4, 6, 6, 4, 7,
		4, 0, 7, 7, 0, 3,
		3, 2, 7, 7, 2, 6,
		4, 5, 0, 0, 5, 1
	]

	// Grid dimensions
	private readonly DIMENSIONS: vec3 = [512, 24, 50]

	// Voxel size is the distance between 2 data points
	private readonly VOXEL_SIZE = 1

	private readonly ISO_LEVEL = 0

	private readonly SHADOW_WIDTH = 1024

	private readonly SHADOW_HEIGHT = 1024

	// Hold grid data of FFTs
	private data: vec4[] = []

	// Hold vertices data for WebGL draw call
	private vertices: number[] = []

	constructor(
		private gl: WebGL2RenderingContext
	) {}

	public init () {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		// Create Shaders
		const vertexShader = Shader.fromScript('vertex-shader', gl.VERTEX_SHADER, gl)

		const fragmentShader =  Shader.fromScript('fragment-shader', gl.FRAGMENT_SHADER, gl)

		// Shaders for shadow
		const sVertexShader = Shader.fromScript('shadow-vertex-shader', gl.VERTEX_SHADER, gl)

		const sFragmentShader = Shader.fromScript('shadow-fragment-shader', gl.FRAGMENT_SHADER, gl)

		// Create Shader Program
		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		this.shaderProgram = shaderProgram

		// Create shadow Shader Program
		const shadowShaderProgram = new ShaderProgram(gl, [sVertexShader, sFragmentShader])

		this.shadowShaderProgram = shadowShaderProgram

		// // Set this current program as default use
		// // Since there is only one program so I don't need to switch
		// shaderProgram.use()

		// Get Uniform Setters
		this.uniformSetters = shaderProgram.createUniformSetters()

		this.shadowUniformSetters = shadowShaderProgram.createUniformSetters()

		/* Set uniforms for shader program */
		/* Calculate lightSpaceMatrix */
		const lightPos = vec3.fromValues(50, 100, 20)

		const lightProjection = mat4.ortho(
			mat4.create(),
			-(gl.canvas as HTMLCanvasElement).clientWidth / 2,
			(gl.canvas as HTMLCanvasElement).clientWidth / 2,
			-(gl.canvas as HTMLCanvasElement).clientHeight / 2,
			(gl.canvas as HTMLCanvasElement).clientHeight / 2,
			0.1,
			200
		)

		// lookAt from the light source location to the center of the space (0,0,0)
		const lightView = mat4.lookAt(mat4.create(), lightPos, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0))

		// Construct lightSpaceMatrix
		const lightSpaceMatrix = mat4.multiply(mat4.create(), lightProjection, lightView)

		// Save some matrixs at initialization
		// Calculating aspect by canvas.width / canvas.height is not recommended since CSS may influenced the size
		// Should use canvas.clientWidth and canvas.clientHeight since those are constants and not influeced by CSS
		shaderProgram.use()

		shaderProgram.setUniforms(this.uniformSetters, {
			'projection': mat4.perspective(mat4.create(), glMatrix.toRadian(45.0), (gl.canvas as HTMLCanvasElement).clientWidth / (gl.canvas as HTMLCanvasElement).clientHeight, 0.1, 200),
			'lightPos': lightPos,
			'maxHeight': this.DIMENSIONS[1] * this.VOXEL_SIZE,
			'lightSpaceMatrix': lightSpaceMatrix,
		})

		// Save attribute locations
		this.positionAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_position')

		this.normalAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_normal')

		shadowShaderProgram.use()

		/* Set uniforms for shadow shader program */
		shadowShaderProgram.setUniforms(this.shadowUniformSetters, {
			'lightSpaceMatrix': lightSpaceMatrix
		})

		gl.useProgram(null)

		// Create VAO and Array Buffers
		this.VAO = gl.createVertexArray()

		this.verticesBuffer = gl.createBuffer()

		this.indicesBuffer = gl.createBuffer()

		this.depthFrameBuffer = gl.createFramebuffer()

		// Generate depth texture
		this.depthTexture = gl.createTexture()

		gl.bindTexture(gl.TEXTURE_2D, this.depthTexture)

		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.DEPTH_COMPONENT24, // internal format
			1024, // width
			1024, // height
			0, // border,
			gl.DEPTH_COMPONENT, // format
			gl.UNSIGNED_INT, // type
			null // no pixels at this moment
		)

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

		// Attach depth texture to depth buffer
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFrameBuffer)

		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.TEXTURE_2D,
			this.depthTexture,
			0
		)

		// Attach color texture to depth buffer (won't be used but still required)
		const unusedTexture = gl.createTexture()

		gl.bindTexture(gl.TEXTURE_2D, unusedTexture)

		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1024,
			1024,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		)

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

		// Attach color texture to depth frame buffer
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			unusedTexture,
			0
		)

		// Since setting up the depth frame buffer is now done
		// We can switch back to our default frame buffer
		gl.bindFramebuffer(gl.FRAMEBUFFER, null)

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

	// Will be called every frame
	public update (dt: number) {
		this.resizeCanvasToDisplaySize()

		// Updating states for the program
		this.updateFFT()

		// Render scene
		this.render()
	}

	private updateFFT () {
		// If FFT data is empty, then nothing to do here
		if (this.ffts.length === 0) return

		const MAX_HEIGHT = this.VOXEL_SIZE * this.DIMENSIONS[1]

		let height: number, value: number, index: number, maxHeightFFT: number, fft: Uint8Array

		// Update every vertices's densities
		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			// fft[z] is undefined here so skip this iteration
			if (z >= this.ffts.length) {
				continue
			}

			fft = this.ffts[z]

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
								max: MAX_HEIGHT
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

	private render () {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		// Turn on culling. By default backfacing triangles
		// will be culled.
		gl.enable(gl.CULL_FACE);

		// Enable the depth buffer
		gl.enable(gl.DEPTH_TEST);

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		this.shadowShaderProgram.use()

		gl.viewport(0, 0, this.SHADOW_WIDTH, this.SHADOW_HEIGHT)

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFrameBuffer)

		// Make canvas transparent
		gl.clearColor(0, 0, 0, 0)

		gl.clear(gl.DEPTH_BUFFER_BIT)

		// Magic here
		this.drawScene(this.shadowShaderProgram)

		// Reset to normal
		// Set GL viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null)

		// Bind the shadow map (after rendered in shadow stage) to the main shader program
		if (this.depthTexture) {
			this.shaderProgram.setUniforms(this.uniformSetters, {
				'depthMap': this.depthTexture
			})
		} else {
			console.warn('Depth Texture is null')
		}

		this.drawScene()

		this.shaderProgram.use()

		// Update view matrix
		this.shaderProgram.setUniforms(this.uniformSetters, {
			'view': this.camera.getViewMatrix()
		})

		gl.useProgram(null)
	}

	// Detech changes in canvas size and change canvas size accordingly
	private resizeCanvasToDisplaySize () {
		const width = (this.gl.canvas as HTMLCanvasElement).clientWidth
		const height = (this.gl.canvas as HTMLCanvasElement).clientHeight

		if (this.gl.canvas.width !== width || this.gl.canvas.height !== height) {
			this.gl.canvas.width = width
			this.gl.canvas.height = height
		}
	}

	private drawScene (program?: ShaderProgram) {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		const shaderProgram = program ?? this.shaderProgram

		// Clear old data
		this.vertices = []

		// Triangulate based on vertices FFT data
		this.triangulate()

		// Use this program to render
		shaderProgram.use()

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

		gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 6)

		// Unbind VAO
		gl.bindVertexArray(null)
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

		// const p = vec4.add(vec4.create(), p1, p2)

		// vec4.scale(p, p, 1 / 2)

		// return vec3.fromValues(p[0], p[1], p[2])
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

	// private testDrawVoxels () {
	// 	const gl = this.gl

	// 	if (!gl) {
	// 		throw new Error('No WebGL2Context found')
	// 	}

	// 	gl.bindVertexArray(this.VAO)

	// 	gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

	// 	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW)

	// 	gl.enableVertexAttribArray(this.positionAttributeLocation)

	// 	// Instruct WebGL how to read the buffer
	// 	const size = 3 // x, y, z components
	// 	const type = gl.FLOAT
	// 	const normalize = false
	// 	const stride = 0
	// 	const offset = 0

	// 	gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset)

	// 	// Make canvas transparent
	// 	gl.clearColor(0, 0, 0, 0)
	// 	gl.clear(gl.COLOR_BUFFER_BIT)

	// 	this.shaderProgram.use()

	// 	gl.bindVertexArray(this.VAO)

	// 	gl.drawArrays(gl.POINTS, 0, this.vertices.length / 3)
	// }

	private testDrawCube () {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		gl.bindVertexArray(this.VAO)

		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		// Fetch vertices into buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.cube_vertices), gl.STATIC_DRAW)

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indicesBuffer)

		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.cube_indices), gl.STATIC_DRAW)

		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		gl.enableVertexAttribArray(this.positionAttributeLocation)

		// Instruct WebGL how to read the buffer
		const size = 3 // x, y, z components
		const type = gl.FLOAT
		const normalize = false
		const stride = 0
		const offset = 0

		gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset)

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indicesBuffer)

		// Make canvas transparent
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)

		this.shaderProgram.use()

		gl.bindVertexArray(this.VAO)

		gl.drawElements(gl.TRIANGLES, this.cube_indices.length, gl.UNSIGNED_SHORT, 0)
	}

	/**
	 * Process Keyboard Input
	 * @param dt
	 */
	public processKeyInput (dt: number) {
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

	/**
	 * Process Mouse Input
	 * @param mouseX
	 * @param mouseY
	 */
	public processMouseInput (mouseX: number, mouseY: number) {
		this.camera.turnAround(mouseX, mouseY)
	}

	/**
	 * Add FFT data to the grid
	 * @param fft
	 */
	public addFFT(fft: Uint8Array) {
		// If the array is full, then throw the old one
		if (this.ffts.length > this.DIMENSIONS[2]) {
			this.ffts.shift()
		}

		// clone fft array
		const clone = new Uint8Array(fft.length)

		clone.set(fft)

		// add to ffts
		this.ffts.push(clone)
	}
}