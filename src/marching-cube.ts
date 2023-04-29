import { glMatrix, mat4, vec3, vec4 } from "gl-matrix";
import { Camera } from "./camera";
import { Shader } from "./webgl/shader";
import { ShaderProgram } from "./webgl/shader-program";
import { NumberUtils } from "./utils";
import { max } from "lodash";
import { EdgeVertexIndices, TriangleTable } from "./lookup-table";

export class MarchingCube {
	private shaderProgram!: ShaderProgram

	private camera: Camera = new Camera()

	public keysMap: Record<string, boolean> = {}

	public ffts: Uint8Array = new Uint8Array()

	private perspectiveMatrix: mat4 = mat4.create()

	// Shader Attribute Locations
	private positionAttributeLocation: number = -1

	private normalAttributeLocation: number = -1

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

	private readonly DIMENSIONS: vec3 = [512, 24, 50]

	private readonly VOXEL_SIZE = 1

	private readonly ISO_LEVEL = 0

	private vertices: vec4[] = []

	private mVertices: number[] = []

	private readonly WAIT = 1

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

			in vec3 a_normal;

			uniform mat4 model;
			uniform mat4 view;
			uniform mat4 projection;

			out vec3 v_normal;
			out vec3 v_pos;

			// all shaders have a main function
			void main() {
				gl_Position = projection * view * vec4(a_position, 1.0f);

				// pass to fragment shader
				v_normal = a_normal;
				v_pos = a_position;
			}
		`;

		// Declare Fragment Shader Source
		const fragmentShaderSource = `#version 300 es

			// fragment shaders don't have a default precision so we need
			// to pick one. highp is a good default. It means "high precision"
			precision highp float;

			out vec4 outColor;

			uniform vec3 lightPos;
			uniform float maxHeight;

			in vec3 v_normal;
			in vec3 v_pos;

			void main() {
				float percentage = v_pos[1] / maxHeight;

				vec3 lightColor = vec3(1, 1, 1);
				vec3 objectColor = vec3(1, 0, percentage);
				float ambientStrength = 0.1f;

				vec3 normal = normalize(v_normal);
				vec3 lightDirection = normalize(lightPos - v_pos);

				// calculate the diffuse impact on the fragment
				// if the lightDirection is perpendicular to the surface or parallel to the normal
				// then diffusion will have the greatest impact
				// if the lightDirection is paralell to the surface or perpendicular to the normal
				// then diffusion is zero (no impact on surface)
				float diff = max(dot(normal, lightDirection), 0.0f);

				vec3 diffuse = diff * lightColor;

				vec3 ambient = ambientStrength * lightColor;

				vec3 result = (ambient + diffuse) * objectColor;

				outColor = vec4(result, 1);
			}
		`;

		const vertexShader = new Shader(gl, vertexShaderSource, gl.VERTEX_SHADER)

		const fragmentShader = new Shader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER)

		// Create Shader Program
		const shaderProgram = new ShaderProgram(gl, [vertexShader, fragmentShader])

		this.shaderProgram = shaderProgram

		// Set this current program as default use
		shaderProgram.use()

		this.positionAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_position')

		this.normalAttributeLocation = gl.getAttribLocation(shaderProgram.program, 'a_normal')

		this.VAO = gl.createVertexArray()

		this.verticesBuffer = gl.createBuffer()

		this.indicesBuffer = gl.createBuffer()

		shaderProgram.setVec3('lightPos', [0.5, 0.7, 1])

		shaderProgram.setFloat('maxHeight', this.DIMENSIONS[1] * this.VOXEL_SIZE);

		for (let z = 0; z < this.DIMENSIONS[2]; ++z) {
			for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
				for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
					this.vertices.push(
						vec4.fromValues(x * this.VOXEL_SIZE, y * this.VOXEL_SIZE, z * this.VOXEL_SIZE, 0)
					)
				}
			}
		}
	}

	// Will be called every frame
	public update (dt: number) {
		 // Turn on culling. By default backfacing triangles
		// will be culled.
		this.gl.enable(this.gl.CULL_FACE);

		// Enable the depth buffer
		this.gl.enable(this.gl.DEPTH_TEST);

		this.time += dt

		if (this.time < this.WAIT) {
			this.z_Index = ++this.z_Index % this.DIMENSIONS[2]
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

		// If FFT data is empty, then nothing to do here
		if (this.ffts.length === 0) return

		const MAX_HEIGHT = this.VOXEL_SIZE * this.DIMENSIONS[1]

		const MAX_HEIGHT_FFT = max(this.ffts) ?? 0

		// There are some cases when FFT data is all zero, resulting in MAX_HEIGHT_FFT is also zero
		// To prevent dividing to zero, just terminate here
		if (MAX_HEIGHT_FFT === 0) return

		let height: number, value: number, index: number

		// Fetch FFT data into the vertices array
		// Since x, y, z component of a point are not changed, only the d component is changed by the FFT data
		// so I make some jumpy move here to access the d part
		for (let y = 0; y < this.DIMENSIONS[1]; ++y) {
			for (let x = 0; x < this.DIMENSIONS[0]; ++x) {
				index = NumberUtils.getIndexFromXYZ(x, y, this.z_Index, this.DIMENSIONS)

				if (x >= this.ffts.length) {
					height = 0
				} else {
					height = NumberUtils.normalize({
						value: this.ffts[x],
						fromRange: {
							min: 0,
							max: MAX_HEIGHT_FFT
						},
						toRange: {
							min: 0,
							max: MAX_HEIGHT
						}
					})
				}

				value = height - this.vertices[index][1]

				if (value < 0 || height === 0) {
					this.vertices[index][3] = 0
				} else {
					this.vertices[index][3] = value / height
				}
			}
		}

		// Clear old data
		this.mVertices = []

		// Triangulate based on vertices FFT data
		this.triangulate()

		// Use VAO
		gl.bindVertexArray(this.VAO)

		// Tell WebGL to use verticesBuffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this.verticesBuffer)

		// Fetch data into buffer
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.mVertices), gl.DYNAMIC_DRAW)

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
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)

		gl.drawArrays(gl.TRIANGLES, 0, this.mVertices.length / 6)
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

						// if (index > 73700) {
						// 	console.log(this.vertices[index][2])
						// }

						cube.push(this.vertices[index])
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
			// console.log(cube[i][2]) // z !== 0

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

	private addTriangle(p1: vec3, p2: vec3, p3: vec3) {
		const p12 = vec3.sub(vec3.create(), p1, p2)
		const p13 = vec3.sub(vec3.create(), p1, p3)

		const normal = vec3.cross(vec3.create(), p12, p13)

		this.mVertices.push(
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