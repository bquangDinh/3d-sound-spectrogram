import { glMatrix, mat4, vec3 } from "gl-matrix";
import { Camera } from "./camera";
import { Shader } from "./webgl/shader";
import { ShaderProgram } from "./webgl/shader-program";
import { NumberUtils } from "./utils";
import { max } from "lodash";

export class MarchingCube {
	private shaderProgram!: ShaderProgram

	private camera: Camera = new Camera()

	public keysMap: Record<string, boolean> = {}

	public ffts: Uint8Array = new Uint8Array()

	private perspectiveMatrix: mat4 = mat4.create()

	// Shader Attribute Locations
	private positionAttributeLocation: number = -1

	private densityAttributeLocation: number = -1

	// Buffer
	private verticesBuffer: WebGLBuffer | null = null

	private indicesBuffer: WebGLBuffer | null = null

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

	private readonly DIMENSIONS: vec3 = [512, 12, 12]

	private readonly VOXEL_SIZE = 0.5

	private vertices: number[] = []

	private readonly WAIT = 0.5

	private time = 0

	private z_Index = 0
	constructor(
		private gl: WebGL2RenderingContext
	) {
		mat4.perspective(this.perspectiveMatrix, glMatrix.toRadian(45.0), gl.canvas.width / gl.canvas.height, 0.1, 200)
	}

	public init () {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		// Set GL viewport
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

		// Declare Vertex Shader Source
		const vertexShaderSource = `#version 300 es

			// an attribute is an input (in) to a vertex shader.
			// It will receive data from a buffer
			in vec3 a_position;

			in float a_density;

			uniform mat4 model;
			uniform mat4 view;
			uniform mat4 projection;

			out float out_density;

			// all shaders have a main function
			void main() {
				gl_Position = projection * view * vec4(a_position, 1.0f);
				gl_PointSize = 5.0f;
				out_density = a_density;
			}
		`;

		// Declare Fragment Shader Source
		const fragmentShaderSource = `#version 300 es

			// fragment shaders don't have a default precision so we need
			// to pick one. highp is a good default. It means "high precision"
			precision highp float;

			in float out_density;

			// we need to declare an output for the fragment shader
			out vec4 outColor;

			void main() {
				// Just set the output to a constant reddish-purple
				outColor = vec4(1, 0, 0, out_density);
			}
		`;

		const vertexShader = new Shader(gl, vertexShaderSource, gl.VERTEX_SHADER)

		const fragmentShader = new Shader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER)

		// Create Shader Program
		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		this.shaderProgram = shaderProgram

		this.positionAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_position')

		this.densityAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_density')

		this.VAO = gl.createVertexArray()

		this.verticesBuffer = gl.createBuffer()

		this.indicesBuffer = gl.createBuffer()

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

	// Will be called every frame
	public update (dt: number) {
		this.time += dt

		if (this.time < this.WAIT) {
			this.z_Index = ++this.z_Index % 12
			this.time = 0
		}

		this.testDrawingFFt()

		this.shaderProgram.setMatrix4('projection', this.perspectiveMatrix)
		this.shaderProgram.setMatrix4('view', this.camera.getViewMatrix())
	}

	private testDrawingFFt () {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		const MAX_HEIGHT = this.VOXEL_SIZE * this.DIMENSIONS[1]

		const MAX_HEIGHT_FFT = max(this.ffts) ?? 0

		let height: number, value: number

		for (let i = 3 + 24576 * this.z_Index; i < 24576 * (this.z_Index + 1); i += 4) {
			height = NumberUtils.normalize({
				value: this.ffts[this.vertices[i - 3] / this.VOXEL_SIZE],
				fromRange: {
					min: 0,
					max: MAX_HEIGHT_FFT
				},
				toRange: {
					min: 0,
					max: MAX_HEIGHT
				}
			})

			value = height - this.vertices[i - 2] * this.VOXEL_SIZE

			if (value < 0) {
				this.vertices[i] = 0
			} else {
				this.vertices[i] = value / height
			}
		}

		gl.bindVertexArray(this.VAO)

		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW)

		gl.enableVertexAttribArray(this.positionAttributeLocation)

		// Instruct WebGL how to read the buffer
		let size = 3 // x, y, z components
		const type = gl.FLOAT
		const normalize = false
		let stride = 16
		let offset = 0

		gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset)

		gl.enableVertexAttribArray(this.densityAttributeLocation)

		size = 1
		stride = 16
		offset = 12

		gl.vertexAttribPointer(this.densityAttributeLocation, size, type, normalize, stride, offset)

		// Make canvas transparent
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)

		this.shaderProgram.use()

		gl.bindVertexArray(this.VAO)

		gl.drawArrays(gl.POINTS, 0, this.vertices.length / 4)
	}

	private testDrawVoxels () {
		const gl = this.gl

		if (!gl) {
			throw new Error('No WebGL2Context found')
		}

		gl.bindVertexArray(this.VAO)

		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW)

		gl.enableVertexAttribArray(this.positionAttributeLocation)

		// Instruct WebGL how to read the buffer
		const size = 3 // x, y, z components
		const type = gl.FLOAT
		const normalize = false
		const stride = 0
		const offset = 0

		gl.vertexAttribPointer(this.positionAttributeLocation, size, type, normalize, stride, offset)

		// Make canvas transparent
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)

		this.shaderProgram.use()

		gl.bindVertexArray(this.VAO)

		gl.drawArrays(gl.POINTS, 0, this.vertices.length / 3)
	}

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

	public processMouseInput (mouseX: number, mouseY: number) {
		this.camera.turnAround(mouseX, mouseY)
	}
}