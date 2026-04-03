import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODES = ['CHASE CAM', 'COCKPIT', 'FREE CAM'];

export class CameraSystem {
    constructor(renderer, aircraft) {
        this.aircraft = aircraft;
        this.mode = 0;
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 50000);

        // Chase cam state
        this.chasePos = new THREE.Vector3();
        this.chaseLookAt = new THREE.Vector3();

        // Orbit controls (for free cam)
        this.orbitControls = new OrbitControls(this.camera, renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.1;
        this.orbitControls.enabled = false;

        // Transition
        this.transitionProgress = 1;
        this.transitionFrom = new THREE.Vector3();
        this.transitionQFrom = new THREE.Quaternion();

        this._initChase();
    }

    _initChase() {
        const pos = this.aircraft.mesh.position;
        this.chasePos.copy(pos).add(new THREE.Vector3(0, 8, 25));
        this.chaseLookAt.copy(pos);
        this.camera.position.copy(this.chasePos);
        this.camera.lookAt(this.chaseLookAt);
    }

    get activeCamera() { return this.camera; }
    get modeName() { return MODES[this.mode]; }

    setMode(index) {
        if (index === this.mode) return;
        // Save current state for transition
        this.transitionFrom.copy(this.camera.position);
        this.transitionQFrom.copy(this.camera.quaternion);
        this.transitionProgress = 0;

        this.mode = index;
        this.orbitControls.enabled = (index === 2);

        if (index === 2) {
            this.orbitControls.target.copy(this.aircraft.mesh.position);
        }
    }

    resize(w, h) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    update(dt) {
        const ac = this.aircraft.mesh;
        const q = ac.quaternion;

        // Compute target camera pos/lookAt based on mode
        let targetPos, targetLookAt;

        if (this.mode === 0) {
            // Chase camera
            const offset = new THREE.Vector3(0, 6, 20).applyQuaternion(q);
            targetPos = ac.position.clone().add(offset);
            const lookAhead = new THREE.Vector3(0, 1, -20).applyQuaternion(q);
            targetLookAt = ac.position.clone().add(lookAhead);

            this.chasePos.lerp(targetPos, 3 * dt);
            this.chaseLookAt.lerp(targetLookAt, 4 * dt);

            this.camera.position.copy(this.chasePos);
            this.camera.lookAt(this.chaseLookAt);
        } else if (this.mode === 1) {
            // Cockpit
            this.camera.fov = 75;
            this.camera.updateProjectionMatrix();
            const cockpitOffset = new THREE.Vector3(0, 0.8, -2).applyQuaternion(q);
            this.camera.position.copy(ac.position).add(cockpitOffset);
            this.camera.quaternion.copy(q);
        } else if (this.mode === 2) {
            // Free cam (orbit)
            this.orbitControls.target.lerp(ac.position, 3 * dt);
            this.orbitControls.update();
        }

        // Smooth transition
        if (this.transitionProgress < 1) {
            this.transitionProgress = Math.min(1, this.transitionProgress + dt * 3);
            const t = this.transitionProgress;
            const smoothT = t * t * (3 - 2 * t); // smoothstep

            const currentPos = this.camera.position.clone();
            const currentQ = this.camera.quaternion.clone();

            this.camera.position.lerpVectors(this.transitionFrom, currentPos, smoothT);
            this.camera.quaternion.slerpQuaternions(this.transitionQFrom, currentQ, smoothT);
        }

        // Reset FOV for non-cockpit
        if (this.mode !== 1 && this.camera.fov !== 60) {
            this.camera.fov = 60;
            this.camera.updateProjectionMatrix();
        }
    }
}
