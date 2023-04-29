import { Shader } from "./shader"
import { mat4, vec2, vec3 } from "gl-matrix"

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
					shader.delete()
				} else {
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

	public deleteProgram() {
		this.gl.deleteProgram(this.program)
	}
}