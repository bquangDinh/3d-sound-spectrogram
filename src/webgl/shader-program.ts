import { Shader } from "./shader"
import { mat2, mat3, mat4, vec2, vec3, vec4 } from "gl-matrix"

export type AllowUniformTypes = number | number[] | vec2 | vec3 | vec4 | mat2 | mat3 | mat4

export class ShaderProgram {
	private _shaderProgram: WebGLProgram

	constructor(
		private gl: WebGL2RenderingContext,
		shaders: WebGLShader[] | Shader[]
	) {
		const program = gl.createProgram()

		if (!program) {
			throw new Error('Unable to create shader program')
		}

		for (const shader of shaders) {
			if (shader instanceof Shader) {
				gl.attachShader(program, shader.shader)
			} else {
				gl.attachShader(program, shader)
			}
		}

		gl.linkProgram(program)

		const success = gl.getProgramParameter(program, gl.LINK_STATUS)

		if (success) {
			// Save program
			this._shaderProgram = program

			for (const shader of shaders) {
				// Since the program has linked shaders into memory
				// Separated shaders won't be needed
				if (shader instanceof Shader) {
					gl.detachShader(program, shader.shader)
					shader.delete()
				} else {
					gl.detachShader(program, shader)
					gl.deleteShader(shader)
				}
			}

			console.log('PROGRAM::LINKING::SUCCESS')
		} else {
			const error = gl.getProgramInfoLog(program)

			console.log('PROGRAM::LINKING:FAILED', error)

			throw new Error('PROGRAM::LINKING::FAILED')
		}
	}

	get program() : WebGLProgram {
		return this._shaderProgram
	}

	public use() {
		this.gl.useProgram(this.program)
	}

	public setVec2(name: string, value: vec2) {
		const location = this.gl.getUniformLocation(this.program, name)

		this.gl.uniform2f(location, value[0], value[1])
	}

	public setVec3(name: string, value: vec3) {
		const location = this.gl.getUniformLocation(this.program, name)

		this.gl.uniform3f(location, value[0], value[1], value[2])
	}

	public setFloat(name: string, value: number) {
		const location = this.gl.getUniformLocation(this.program, name);

		this.gl.uniform1f(location, value);
	}

	public setMatrix4(name: string, matrix: mat4) {
		const location = this.gl.getUniformLocation(this.program, name)

		this.gl.uniformMatrix4fv(location, false, matrix)
	}

	// Inspired by https://webglfundamentals.org/webgl/resources/webgl-utils.js
	public createUniformSetters() {
		const gl = this.gl

		/**
		 * Creates a setter for a uniform of the given program with it's
		 * location embedded in the setter.
		 * @param {WebGLProgram} program
		 * @param {WebGLUniformInfo} uniformInfo
		 * @returns {function} the created setter.
		 */
		const createUniformSetter = (uniformInfo: WebGLActiveInfo) => {
			// Get uniform location in the shader program
			const location = gl.getUniformLocation(this.program, uniformInfo.name)

			const type = uniformInfo.type

			// Check if this uniform is an array
			const isArray = uniformInfo.size > 1 && uniformInfo.name.substring(-3) === '[0]'

			if (type === gl.FLOAT && isArray) {
				return function (value: number[]) {
					gl.uniform1fv(location, new Float32Array(value))
				}
			}

			if (type === gl.FLOAT) {
				return function (value: number) {
					gl.uniform1f(location, value)
				}
			}

			if (type === gl.FLOAT_VEC2) {
				// vec2 float numbers
				return function (value: vec2) {
					gl.uniform2fv(location, new Float32Array(value))
				}
			}

			if (type === gl.FLOAT_VEC3) {
				// vec3 float numbers
				return function (value: vec3) {
					gl.uniform3fv(location, new Float32Array(value))
				}
			}

			if (type === gl.FLOAT_VEC4) {
				// vec4 float numbers
				return function (value: vec4) {
					gl.uniform4fv(location, new Float32Array(value))
				}
			}

			if ((type === gl.INT) && isArray) {
				return function (value: number[]) {
					gl.uniform1iv(location, new Int32Array(value))
				}
			}

			if (type === gl.INT) {
				return function (value: number) {
					gl.uniform1i(location, value)
				}
			}

			if (type === gl.INT_VEC2) {
				return function (value: vec2) {
					gl.uniform2iv(location ,new Int32Array(value))
				}
			}

			if (type === gl.INT_VEC3) {
				return function (value: vec3) {
					gl.uniform3iv(location, new Int32Array(value))
				}
			}

			if (type === gl.INT_VEC4) {
				return function (value: vec4) {
					gl.uniform4iv(location, new Int32Array(value))
				}
			}

			if (type === gl.FLOAT_MAT2) {
				return function (value: mat2) {
					gl.uniformMatrix2fv(location, false, new Float32Array(value))
				}
			}

			if (type === gl.FLOAT_MAT3) {
				return function (value: mat3) {
					gl.uniformMatrix3fv(location, false, new Float32Array(value))
				}
			}

			if (type === gl.FLOAT_MAT4) {
				return function (value: mat4) {
					gl.uniformMatrix4fv(location, false, new Float32Array(value))
				}
			}

			throw new Error(`${uniformInfo} is not supported`)
		}

		const uniformSetters: Record<string, Function> = {}

		const numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS)

		for (let i = 0; i < numUniforms; ++i) {
			const uniformInfo = gl.getActiveUniform(this.program, i)

			if (!uniformInfo) {
				break
			}

			let name = uniformInfo.name

			// Remove array surffix
			if (name.substring(-3) === '[0]') {
				name = name.substring(0, name.length - 3)
			}

			const setter = createUniformSetter(uniformInfo)

			uniformSetters[name] = setter
		}

		return uniformSetters
	}

	public setUniforms(setters: Record<string, Function>, values: Record<string, AllowUniformTypes>) {
		Object.keys(values).forEach((name) => {
			const setter = setters[name]

			if (!setter) {
				throw new Error(`No uniform setter found for ${name}`)
			}

			setter(values[name])
		})
	}

	public deleteProgram() {
		this.gl.deleteProgram(this.program)
	}
}