export const SCRIPT_SHADER_TYPES = {
	VERTEX_SHADER: 'x-shader/x-vertex',
	FRAGMENT_SHADER: 'x-shader/x-fragment'
}

export class Shader {
	private _shader: WebGLShader

	static fromScript(gl: WebGL2RenderingContext, scriptTagId: string, type?: number) {
		const source = document.querySelector(`#${scriptTagId}`) as HTMLScriptElement

		if (!source) {
			throw new Error(`Scipt not found with ID: ${scriptTagId}`)
		}

		const content = source.innerHTML.trim()

		let shaderType: number

		if (type) {
			shaderType = type
		} else {
			if (source.type === SCRIPT_SHADER_TYPES.VERTEX_SHADER || source.getAttribute('type') === SCRIPT_SHADER_TYPES.VERTEX_SHADER) {
				shaderType = gl.VERTEX_SHADER
			} else if (source.type === SCRIPT_SHADER_TYPES.FRAGMENT_SHADER || source.getAttribute('type') === SCRIPT_SHADER_TYPES.FRAGMENT_SHADER) {
				shaderType = gl.FRAGMENT_SHADER
			} else {
				throw new Error('Script shader type is not valid')
			}
		}

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