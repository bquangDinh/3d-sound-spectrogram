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
		HEADER_ID: 'header',
		CANVAS_CONTAINER_ID: 'canvas-container',
		CANVAS_ID: 'spectrogram-canvas',
		CONTROLLERS_CONTAINER_ID: 'controller-container',
		CONTROLLER_CLASSNAME: 'controller',
		APP_SELECT_CLASSNAME: 'app-select',
		OPTION_BTNS_CLASSNAME: 'options-btn',
		OPTION_BTN_CLASSNAME: 'option-btn',
		SUB_HEADER_TEXT_ID: 'sub-header-text',
		FPS_TEXT_ID: 'fps-text',
		USE_WEBWORKER_CHECKBOX_ID: 'use-web-worker-cb',
		WEBWORKER_CHECKBOX_CONTAINER_ID: 'webworker-cb-container'
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
	},
	WORKER: {
		SOURCE_FROM_MAIN_THREAD: '0',
		RESULT_FROM_WORKER: '1',
	}
}