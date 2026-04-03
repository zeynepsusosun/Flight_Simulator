import * as THREE from 'three';
import { getHeight } from './terrain.js';

// Runway position (world coords)
export const RUNWAY_POS = new THREE.Vector3(2000, 0, -2000);
const RUNWAY_LENGTH = 200;
const RUNWAY_WIDTH = 30;
const RUNWAY_HEADING = 0; // aligned with North (-Z)

export class Runway {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        // Flatten terrain height at runway position
        const h = getHeight(RUNWAY_POS.x, RUNWAY_POS.z);
        RUNWAY_POS.y = h + 0.5;

        // Main runway surface
        const runwayGeo = new THREE.PlaneGeometry(RUNWAY_WIDTH, RUNWAY_LENGTH);
        const runwayMat = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.9, metalness: 0.0
        });
        const runway = new THREE.Mesh(runwayGeo, runwayMat);
        runway.rotation.x = -Math.PI / 2;
        runway.receiveShadow = true;
        this.group.add(runway);

        // Center line (dashed)
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = -8; i <= 8; i++) {
            const dash = new THREE.Mesh(
                new THREE.PlaneGeometry(0.6, 8),
                lineMat
            );
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.05, i * 12);
            this.group.add(dash);
        }

        // Threshold markings
        for (const endZ of [-RUNWAY_LENGTH / 2 + 10, RUNWAY_LENGTH / 2 - 10]) {
            for (let x = -10; x <= 10; x += 5) {
                if (Math.abs(x) < 2) continue;
                const mark = new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 12),
                    lineMat
                );
                mark.rotation.x = -Math.PI / 2;
                mark.position.set(x, 0.05, endZ);
                this.group.add(mark);
            }
        }

        // Edge lights (simple colored boxes)
        const lightGeoGreen = new THREE.BoxGeometry(0.5, 0.8, 0.5);
        const lightGeoRed = new THREE.BoxGeometry(0.5, 0.8, 0.5);
        const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });

        for (let z = -RUNWAY_LENGTH / 2; z <= RUNWAY_LENGTH / 2; z += 20) {
            for (const side of [-RUNWAY_WIDTH / 2 - 1, RUNWAY_WIDTH / 2 + 1]) {
                const isEnd = Math.abs(z) > RUNWAY_LENGTH / 2 - 15;
                const light = new THREE.Mesh(
                    isEnd ? lightGeoRed : lightGeoGreen,
                    isEnd ? redMat : greenMat
                );
                light.position.set(side, 0.4, z);
                this.group.add(light);
            }
        }

        // PAPI lights (approach slope indicator) - 4 lights on left side
        const papiGroup = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const papi = new THREE.Mesh(
                new THREE.BoxGeometry(0.8, 0.6, 0.8),
                new THREE.MeshBasicMaterial({ color: 0xff4400 })
            );
            papi.position.set(-RUNWAY_WIDTH / 2 - 4, 0.3, RUNWAY_LENGTH / 2 + 5 + i * 3);
            this.group.add(papi);
        }

        // Windsock pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x888888 })
        );
        pole.position.set(RUNWAY_WIDTH / 2 + 8, 4, 0);
        this.group.add(pole);

        // Windsock (cone)
        const sock = new THREE.Mesh(
            new THREE.ConeGeometry(0.8, 3, 6),
            new THREE.MeshBasicMaterial({ color: 0xff6600 })
        );
        sock.rotation.z = -Math.PI / 2;
        sock.position.set(RUNWAY_WIDTH / 2 + 9.5, 7.5, 0);
        this.group.add(sock);
        this.windsock = sock;

        this.group.position.copy(RUNWAY_POS);
        scene.add(this.group);

        // Beacon (tall visible marker)
        const beaconGeo = new THREE.CylinderGeometry(0.3, 0.3, 40, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
        this.beacon = new THREE.Mesh(beaconGeo, beaconMat);
        this.beacon.position.set(RUNWAY_POS.x, RUNWAY_POS.y + 20, RUNWAY_POS.z);
        scene.add(this.beacon);

        // Beacon light on top
        const beaconLight = new THREE.PointLight(0xff4400, 50, 200);
        beaconLight.position.set(RUNWAY_POS.x, RUNWAY_POS.y + 42, RUNWAY_POS.z);
        scene.add(beaconLight);
        this.beaconLight = beaconLight;

        this.time = 0;
    }

    update(dt) {
        this.time += dt;
        // Pulse beacon light
        this.beaconLight.intensity = 30 + Math.sin(this.time * 3) * 25;
        // Animate windsock
        this.windsock.rotation.y = Math.sin(this.time * 0.5) * 0.3;
    }

    checkLanding(aircraft) {
        const pos = aircraft.mesh.position;
        const dx = pos.x - RUNWAY_POS.x;
        const dz = pos.z - RUNWAY_POS.z;

        // Must be within runway bounds
        const onRunway = Math.abs(dx) < RUNWAY_WIDTH / 2 &&
                         Math.abs(dz) < RUNWAY_LENGTH / 2;

        if (!onRunway) return false;

        // Must be at ground level
        const altAboveRunway = pos.y - RUNWAY_POS.y;
        if (altAboveRunway > 5) return false;

        // Must be slow enough
        if (aircraft.speed > 35) return false;

        // Must be roughly level (not more than 15 degrees pitch/roll)
        if (Math.abs(aircraft.pitch) > 0.26) return false;
        if (Math.abs(aircraft.roll) > 0.26) return false;

        // Gear must be down
        if (!aircraft.gearDown) return false;

        return true;
    }

    getDistanceAndBearing(aircraftPos) {
        const dx = RUNWAY_POS.x - aircraftPos.x;
        const dz = RUNWAY_POS.z - aircraftPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const bearing = ((Math.atan2(-dx, -dz) * 180 / Math.PI) + 360) % 360;
        return { distance, bearing };
    }
}
