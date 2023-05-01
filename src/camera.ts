import { glMatrix, mat4, vec3 } from "gl-matrix"

export class Camera {
	private readonly CAMERA_SPEED = 10

	private readonly SENSITIVITY = 0.1

	private readonly PITCH_LIMIT = 89.0

	private pitch = 0.0 // up and down

	private yaw = -90.0 // left and right

	public cameraPos: vec3 = [-23, 84, 47] // an arbitrary position so I can see things better

	private cameraFront: vec3 = [0.7, -0.7, 0]

	private cameraUp: vec3 = [0, 1, 0]

	private positionText: HTMLSpanElement | null = null

	constructor() {
		this.positionText = document.getElementById('cam-position')

		this.updatePositionText()
	}

	private updatePositionText () {
		if (this.positionText) {
			this.positionText.innerHTML = `X = ${this.cameraPos[0]} | Y = ${this.cameraPos[1]} | Z = ${this.cameraPos[2]} | frX = ${this.cameraFront[0]} | frY = ${this.cameraFront[1]} | frZ = ${this.cameraFront[2]}`
		}
	}

	public turnAround(offsetX: number, offsetY: number) {
		// Control the speed of turning around by sensitivity
		offsetX *= this.SENSITIVITY
		offsetY *= this.SENSITIVITY

		// Update yaw and pitch value
		this.yaw += offsetX
		this.pitch += offsetY

		// Limit yaw and pitch
		if (this.pitch > this.PITCH_LIMIT) this.pitch = this.PITCH_LIMIT
		if (this.pitch < -this.PITCH_LIMIT) this.pitch = -this.PITCH_LIMIT

		// update camera front vector accordingly
		const cameraFrontVector: vec3 = vec3.create()

		const pitchRad = glMatrix.toRadian(this.pitch)

		const yawRad = glMatrix.toRadian(this.yaw)

		cameraFrontVector[0] = Math.cos(yawRad) * Math.cos(pitchRad)

		// Negate Math.sin(pitchRad) to invert looking up and down
		cameraFrontVector[1] = -Math.sin(pitchRad)

		cameraFrontVector[2] = Math.sin(yawRad) * Math.cos(pitchRad)

		vec3.normalize(this.cameraFront, cameraFrontVector)
	}

	public moveForward(dt: number) {
		const speed = this.CAMERA_SPEED * dt

		const scaledCameraFront: vec3 = [0, 0, 0]

		vec3.scale(scaledCameraFront, this.cameraFront, speed)

		vec3.add(this.cameraPos, this.cameraPos, scaledCameraFront)

		this.updatePositionText()
	}

	public moveBackward(dt: number) {
		const speed = this.CAMERA_SPEED * dt

		const scaledCameraFront: vec3 = [0, 0, 0]

		vec3.scale(scaledCameraFront, this.cameraFront, speed)

		vec3.subtract(this.cameraPos, this.cameraPos, scaledCameraFront)

		this.updatePositionText()
	}

	public turnLeft(dt: number) {
		const speed = this.CAMERA_SPEED * dt

		const cameraRight: vec3 = [0, 0, 0]

		vec3.cross(cameraRight, this.cameraFront, this.cameraUp)

		vec3.normalize(cameraRight, cameraRight)

		vec3.scale(cameraRight, cameraRight, speed)

		vec3.subtract(this.cameraPos, this.cameraPos, cameraRight)

		this.updatePositionText()
	}

	public turnRight(dt: number) {
		const speed = this.CAMERA_SPEED * dt

		const cameraRight: vec3 = [0, 0, 0]

		vec3.cross(cameraRight, this.cameraFront, this.cameraUp)

		vec3.normalize(cameraRight, cameraRight)

		vec3.scale(cameraRight, cameraRight, speed)

		vec3.add(this.cameraPos, this.cameraPos, cameraRight)

		this.updatePositionText()
	}

	public getViewMatrix () {
		let view: mat4 = mat4.create()

		const center: vec3 = [0, 0, 0]

		vec3.add(center, this.cameraFront, this.cameraPos)

		mat4.lookAt(view, this.cameraPos, center, this.cameraUp)

		return view
	}
}