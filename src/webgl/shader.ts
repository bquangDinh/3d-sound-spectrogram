export class Shader {
	private _shader: WebGLShader

	static fromScript(scriptTagId: string, shaderType: number, gl: WebGL2RenderingContext) {
		const source = document.querySelector(`#${scriptTagId}`)

		if (!source) {
			throw new Error(`Scipt not found with ID: ${scriptTagId}`)
		}

		const content = source.innerHTML.trim()

		return new Shader(gl, content, shaderType)
	}

	constructor(
		private gl: WebGL2RenderingContext,
		source: string,
		shaderType: number
	) {
		const shader = gl.createShader(shaderType)

		if (!shader) {
			throw new Error('Unable to create shader')
		}

		gl.shaderSource(shader, source)

		gl.compileShader(shader)

		// Check if the shader has been compiled successfully
		const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS)

		if (success) {
			// Save shader ID
			this._shader = shader

			console.log('SHADER::COMPILING::SUCCESS')
		} else {
			const error = gl.getShaderInfoLog(shader)

			console.log('SHADER::COMPILING::FAILED', error)

			throw new Error('SHADER::COMPILING::FAILED')
		}
	}

	get shader(): WebGLShader {
		return this._shader
	}

	public delete() {
		this.gl.deleteShader(this.shader)
	}
}