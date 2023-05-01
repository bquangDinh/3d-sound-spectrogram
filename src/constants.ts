import { vec3 } from "gl-matrix";

export const CONSTANTS = {
	SHADER_SCRIPTS: {
		FFT3D: {
			VERTEX_SCRIPT_ID: 'fft3d-vertex-shader',
			FRAGMENT_SCRIPT_ID: 'fft3d-fragment-shader'
		},
		FFT2D: {
			VERTEX_SCRIPT_ID: 'fft2d-vertex-shader',
			FRAGMENT_SCRIPT_ID: 'fft2d-fragment-shader'
		},
		FFT3D_POINTGRID: {
			VERTEX_SCRIPT_ID: 'fft3d-pg-vertex-shader',
			FRAGMENT_SCRIPT_ID: 'fft3d-pg-fragment-shader'
		}
	},
	DOM_ELEMENTS: {
		CAMERA_DEBUG_POS_SPAN_ID: 'camera-pos',
		CAMERA_DEBUG_ROT_SPAN_ID: 'camera-rot',
	},
	RENDERERS: {
		NAMES: {
			FFT2D: 'fft-2d',
			FFT3D: 'fft-3d',
			FFT3D_POINTGRID: 'fft-3d-point-grid'
		}
	},
	CAMERA: {
		FFT3D: {
			SPECULAR_POS: vec3.fromValues(-31.9, 50.8, 38.7),
			SPECULAR_ROT: vec3.fromValues(0.9, -0.44, 0.02),
		},
		FFT3D_POINTGRID: {
			SPECULAR_POS: vec3.fromValues(-57, 7, -46),
			SPECULAR_ROT: vec3.fromValues(0.75, 0.2, 0.64)
		}
	}
}