import * as THREE from 'three';
import { getHeight } from './terrain.js';

// ── Physics constants ──
const MASS         = 5000;
const MAX_THRUST   = 55000;
const WING_AREA    = 30;
const AIR_DENSITY  = 1.225;
const DRAG_COEFF   = 0.025;
const FRONTAL_AREA = 6;
const GRAVITY      = 9.81;
const PITCH_RATE   = 1.8;
const ROLL_RATE    = 2.5;
const YAW_RATE     = 0.8;
const STALL_ANGLE  = 0.28; // ~16 degrees
const MAX_ALTITUDE = 3000; // meters — engine ceiling
const WARN_ALTITUDE = 2500; // meters — warning threshold

const _forward = new THREE.Vector3();
const _up      = new THREE.Vector3();
const _right   = new THREE.Vector3();
const _tmpQ    = new THREE.Quaternion();

function liftCoefficient(aoa) {
    const absa = Math.abs(aoa);
    if (absa < STALL_ANGLE) return 2 * Math.PI * aoa;
    const sign = Math.sign(aoa);
    return sign * (2 * Math.PI * STALL_ANGLE) * Math.max(0, 1 - (absa - STALL_ANGLE) * 3);
}

function buildAircraftMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4, metalness: 0.6, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.4, flatShading: true });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xdd3333, roughness: 0.5, metalness: 0.3, flatShading: true });

    // Fuselage
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 8, 8), bodyMat);
    fuse.rotation.z = Math.PI / 2;
    fuse.castShadow = true;
    group.add(fuse);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.5, 8), bodyMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(5, 0, 0);
    nose.castShadow = true;
    group.add(nose);

    // Cockpit canopy
    const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x4488cc, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.6 })
    );
    canopy.position.set(2.5, 0.5, 0);
    canopy.scale.set(1.5, 0.8, 0.8);
    group.add(canopy);

    // Main wings
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 10), bodyMat);
    wingL.castShadow = true;
    group.add(wingL);

    // Wing tips (red)
    const tipGeo = new THREE.BoxGeometry(0.3, 0.15, 0.5);
    const tipL = new THREE.Mesh(tipGeo, accentMat); tipL.position.set(0, 0, -5); group.add(tipL);
    const tipR = new THREE.Mesh(tipGeo, accentMat); tipR.position.set(0, 0, 5);  group.add(tipR);

    // Horizontal stabilizer
    const hstab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 4), bodyMat);
    hstab.position.set(-3.8, 0.2, 0);
    hstab.castShadow = true;
    group.add(hstab);

    // Vertical stabilizer
    const vstab = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.08), bodyMat);
    vstab.position.set(-3.5, 1.2, 0);
    vstab.castShadow = true;
    group.add(vstab);

    // Rudder accent
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.1), accentMat);
    rudder.position.set(-4.2, 1.2, 0);
    group.add(rudder);

    // Engine intakes
    const intakeGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.5, 8);
    const intakeL = new THREE.Mesh(intakeGeo, darkMat);
    intakeL.rotation.z = Math.PI / 2;
    intakeL.position.set(1, -0.3, -1.2);
    group.add(intakeL);
    const intakeR = new THREE.Mesh(intakeGeo, darkMat);
    intakeR.rotation.z = Math.PI / 2;
    intakeR.position.set(1, -0.3, 1.2);
    group.add(intakeR);

    // Propeller
    const propGroup = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.5 });
    for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.3), bladeMat);
        blade.rotation.x = (i * Math.PI * 2) / 3;
        propGroup.add(blade);
    }
    propGroup.position.set(6.2, 0, 0);
    group.add(propGroup);

    // Landing gear
    const gearGroup = new THREE.Group();
    const gearMat = darkMat;
    const frontStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), gearMat);
    frontStrut.position.set(3, -1, 0);
    gearGroup.add(frontStrut);
    const frontWheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 6, 12), gearMat);
    frontWheel.position.set(3, -1.6, 0);
    frontWheel.rotation.y = Math.PI / 2;
    gearGroup.add(frontWheel);
    for (const side of [-1.5, 1.5]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), gearMat);
        strut.position.set(-0.5, -1.1, side);
        gearGroup.add(strut);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 6, 12), gearMat);
        wheel.position.set(-0.5, -1.8, side);
        wheel.rotation.y = Math.PI / 2;
        gearGroup.add(wheel);
    }
    group.add(gearGroup);

    // FIX: rotate so nose (+X) faces forward (-Z in world)
    group.rotation.y = Math.PI / 2;

    const wrapper = new THREE.Group();
    wrapper.add(group);
    return { mesh: wrapper, propeller: propGroup, gear: gearGroup };
}

export class Aircraft {
    constructor(scene) {
        const { mesh, propeller, gear } = buildAircraftMesh();
        this.mesh = mesh;
        this.propeller = propeller;
        this.gear = gear;
        this.gearDown = true;
        this.scene = scene;
        scene.add(this.mesh);

        this.velocity = new THREE.Vector3(0, 0, -60);
        this.speed = 60;
        this.throttle = 0.4;
        this.altitude = 400;
        this.heading = 0;
        this.pitch = 0;
        this.roll = 0;
        this.aoa = 0;
        this.isStalling = false;
        this.gForce = 1;
        this.vSpeed = 0;
        this.prevVelocityY = 0;

        // State flags
        this.crashed = false;
        this.engineDead = false;
        this.altitudeWarning = false;

        this.input = { pitch: 0, roll: 0, yaw: 0 };

        this.mesh.position.set(0, 400, 0);
    }

    toggleGear() {
        if (this.crashed || this.engineDead) return;
        this.gearDown = !this.gearDown;
        this.gear.visible = this.gearDown;
    }

    reset() {
        this.mesh.position.set(0, 400, 0);
        this.mesh.quaternion.identity();
        this.velocity.set(0, 0, -60);
        this.throttle = 0.4;
        this.speed = 60;
        this.crashed = false;
        this.engineDead = false;
        this.altitudeWarning = false;
        this.gearDown = true;
        this.gear.visible = true;
        this.isStalling = false;
    }

    update(dt) {
        if (this.crashed) return 'crashed';

        const q = this.mesh.quaternion;

        // Local axes
        _forward.set(0, 0, -1).applyQuaternion(q);
        _up.set(0, 1, 0).applyQuaternion(q);
        _right.set(1, 0, 0).applyQuaternion(q);

        // ── Rotation ──
        const authority = Math.min(this.speed / 40, 1);

        if (this.input.pitch !== 0) {
            _tmpQ.setFromAxisAngle(_right, this.input.pitch * PITCH_RATE * authority * dt);
            q.premultiply(_tmpQ);
        }
        if (this.input.roll !== 0) {
            _tmpQ.setFromAxisAngle(_forward, this.input.roll * ROLL_RATE * authority * dt);
            q.premultiply(_tmpQ);
        }
        if (this.input.yaw !== 0) {
            _tmpQ.setFromAxisAngle(_up, this.input.yaw * YAW_RATE * authority * dt);
            q.premultiply(_tmpQ);
        }
        q.normalize();

        _forward.set(0, 0, -1).applyQuaternion(q);
        _up.set(0, 1, 0).applyQuaternion(q);

        // ── Forces ──
        const speedSq = this.velocity.lengthSq();
        this.speed = Math.sqrt(speedSq);

        // Angle of attack
        if (this.speed > 1) {
            const velNorm = this.velocity.clone().normalize();
            this.aoa = Math.asin(THREE.MathUtils.clamp(-velNorm.dot(_up), -1, 1));
        } else {
            this.aoa = 0;
        }
        this.isStalling = Math.abs(this.aoa) > STALL_ANGLE && this.speed > 20;

        // Altitude ceiling check
        this.altitudeWarning = this.altitude > WARN_ALTITUDE;
        if (this.altitude > MAX_ALTITUDE && !this.engineDead) {
            this.engineDead = true;
            this.throttle = 0;
            return 'engine_dead';
        }

        // Thrust (zero if engine dead)
        const effectiveThrottle = this.engineDead ? 0 : this.throttle;
        const thrust = _forward.clone().multiplyScalar(MAX_THRUST * effectiveThrottle);

        // Lift
        const cl = liftCoefficient(this.aoa);
        const liftMag = 0.5 * AIR_DENSITY * speedSq * WING_AREA * cl;
        const lift = _up.clone().multiplyScalar(liftMag);

        // Drag
        const dragMag = 0.5 * AIR_DENSITY * speedSq * DRAG_COEFF * FRONTAL_AREA;
        const drag = this.speed > 0.1
            ? this.velocity.clone().normalize().multiplyScalar(-dragMag)
            : new THREE.Vector3();

        // Gravity
        const gravity = new THREE.Vector3(0, -MASS * GRAVITY, 0);

        // Net
        const accel = new THREE.Vector3()
            .add(thrust).add(lift).add(drag).add(gravity)
            .divideScalar(MASS);

        // Stall buffeting
        if (this.isStalling) {
            accel.x += (Math.random() - 0.5) * 8;
            accel.y += (Math.random() - 0.5) * 8;
            accel.z += (Math.random() - 0.5) * 8;
        }

        this.velocity.add(accel.multiplyScalar(dt));
        this.mesh.position.add(this.velocity.clone().multiplyScalar(dt));

        // Auto-alignment
        if (this.speed > 10) {
            const velDir = this.velocity.clone().normalize();
            const targetQ = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, -1), velDir
            );
            q.slerp(targetQ, 0.02);
            q.normalize();
        }

        // ── Ground / water collision → crash ──
        const terrainH = getHeight(this.mesh.position.x, this.mesh.position.z);
        const waterH = -5;
        const groundH = Math.max(terrainH, waterH);
        const minAlt = groundH + 3;

        if (this.mesh.position.y < minAlt) {
            // Crash if speed is too high or descending fast
            if (this.speed > 30 || this.vSpeed < -10) {
                this.crashed = true;
                this.mesh.position.y = minAlt;
                this.velocity.set(0, 0, 0);
                return 'crashed';
            }
            // Gentle ground contact
            this.mesh.position.y = minAlt;
            if (this.velocity.y < 0) this.velocity.y = 0;
            this.velocity.multiplyScalar(0.98);
        }

        // ── Derived values ──
        this.altitude = this.mesh.position.y;
        this.vSpeed = this.velocity.y;

        const headingRad = Math.atan2(-_forward.x, -_forward.z);
        this.heading = ((THREE.MathUtils.radToDeg(headingRad) % 360) + 360) % 360;

        const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        this.pitch = euler.x;
        this.roll = euler.z;

        const accelY = (this.velocity.y - this.prevVelocityY) / Math.max(dt, 0.001);
        this.gForce = (accelY + GRAVITY) / GRAVITY;
        this.prevVelocityY = this.velocity.y;

        // Propeller spin
        this.propeller.rotation.x += effectiveThrottle * 60 * dt;

        if (this.altitudeWarning) return 'altitude_warning';
        return null;
    }
}
