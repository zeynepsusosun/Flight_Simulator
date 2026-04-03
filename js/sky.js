import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const WEATHER_TYPES = ['clear', 'cloudy', 'foggy', 'stormy'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const DAY_DURATION = 300; // seconds for a full day cycle (5 min)

export class SkySystem {
    constructor(scene) {
        this.scene = scene;

        // ── Sky shader ──
        const sky = new Sky();
        sky.scale.setScalar(50000);
        scene.add(sky);
        this.skyRef = sky;
        this.uniforms = sky.material.uniforms;

        // ── Time & weather ──
        this.timeOfDay = 0.3; // 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset
        this.weather = 'clear';
        this.season = 'summer';
        this.weatherTimer = 0;
        this.weatherInterval = 60; // change weather every 60 seconds
        this.seasonTimer = 0;
        this.seasonIndex = 1; // start summer

        // Sun position
        this.sunPosition = new THREE.Vector3();
        this._updateSky();

        // ── Lighting ──
        this.dirLight = new THREE.DirectionalLight(0xfff4e0, 2.0);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.set(2048, 2048);
        const s = 200;
        this.dirLight.shadow.camera.left   = -s;
        this.dirLight.shadow.camera.right  =  s;
        this.dirLight.shadow.camera.top    =  s;
        this.dirLight.shadow.camera.bottom = -s;
        this.dirLight.shadow.camera.near   = 1;
        this.dirLight.shadow.camera.far    = 1000;
        this.dirLight.shadow.bias = -0.001;
        scene.add(this.dirLight);
        scene.add(this.dirLight.target);

        this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x443322, 0.4);
        scene.add(this.hemiLight);

        this.ambientLight = new THREE.AmbientLight(0x404060, 0.3);
        scene.add(this.ambientLight);

        // ── Fog ──
        scene.fog = new THREE.FogExp2(0x8eb8d4, 0.00025);
        this.baseFogDensity = 0.00025;

        // ── Clouds ──
        this._buildClouds(scene);

        // ── Rain particles ──
        this._buildRain(scene);
    }

    _updateSky() {
        // Sun elevation follows a sine curve: -90 (midnight) to +90 (noon)
        const sunAngle = Math.sin(this.timeOfDay * Math.PI * 2) * 90;
        const sunAzimuth = (this.timeOfDay * 360 + 180) % 360;

        const phi = THREE.MathUtils.degToRad(90 - sunAngle);
        const theta = THREE.MathUtils.degToRad(sunAzimuth);
        this.sunPosition.setFromSphericalCoords(1, phi, theta);

        // Sky shader params based on time
        const isDay = sunAngle > -5;
        const dayFactor = THREE.MathUtils.clamp((sunAngle + 10) / 40, 0, 1);

        let turbidity, rayleigh, mieCoeff;
        if (this.weather === 'clear') {
            turbidity = 2 + (1 - dayFactor) * 6;
            rayleigh = isDay ? 2 : 0.1;
            mieCoeff = 0.005;
        } else if (this.weather === 'cloudy') {
            turbidity = 8;
            rayleigh = isDay ? 1.5 : 0.1;
            mieCoeff = 0.02;
        } else if (this.weather === 'foggy') {
            turbidity = 10;
            rayleigh = isDay ? 1 : 0.05;
            mieCoeff = 0.05;
        } else { // stormy
            turbidity = 15;
            rayleigh = isDay ? 0.8 : 0.05;
            mieCoeff = 0.08;
        }

        this.uniforms['turbidity'].value = turbidity;
        this.uniforms['rayleigh'].value = rayleigh;
        this.uniforms['mieCoefficient'].value = mieCoeff;
        this.uniforms['mieDirectionalG'].value = 0.8;
        this.uniforms['sunPosition'].value.copy(this.sunPosition);

        // Light intensity & color based on time
        const sunIntensity = Math.max(0.05, dayFactor * 2.0);
        const weatherDim = this.weather === 'stormy' ? 0.3 :
                           this.weather === 'foggy'  ? 0.5 :
                           this.weather === 'cloudy' ? 0.7 : 1.0;

        if (this.dirLight) {
            this.dirLight.intensity = sunIntensity * weatherDim;
            // Warm at sunrise/sunset, white at noon, blue at night
            if (dayFactor > 0.7) {
                this.dirLight.color.setHex(0xfff8f0);
            } else if (dayFactor > 0.2) {
                this.dirLight.color.setHex(0xffcc88); // golden hour
            } else {
                this.dirLight.color.setHex(0x4466aa); // moonlight
            }
        }

        if (this.hemiLight) {
            this.hemiLight.intensity = 0.1 + dayFactor * 0.4 * weatherDim;
        }
        if (this.ambientLight) {
            this.ambientLight.intensity = 0.1 + dayFactor * 0.3 * weatherDim;
            this.ambientLight.color.setHex(isDay ? 0x404060 : 0x101030);
        }

        // Fog density
        if (this.scene.fog) {
            let fogDensity = this.baseFogDensity;
            if (this.weather === 'foggy')  fogDensity *= 4;
            if (this.weather === 'stormy') fogDensity *= 2.5;
            if (this.weather === 'cloudy') fogDensity *= 1.5;
            if (!isDay) fogDensity *= 1.5;
            this.scene.fog.density = fogDensity;
        }
    }

    _buildClouds(scene) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        const cloudTex = new THREE.CanvasTexture(canvas);

        const cloudGeo = new THREE.PlaneGeometry(120, 120);
        this.cloudMat = new THREE.MeshBasicMaterial({
            map: cloudTex, transparent: true, depthWrite: false,
            opacity: 0.7, fog: true, side: THREE.DoubleSide
        });

        this.cloudCount = 200;
        this.clouds = new THREE.InstancedMesh(cloudGeo, this.cloudMat, this.cloudCount);
        this.cloudOffsets = [];

        const dummy = new THREE.Object3D();
        for (let i = 0; i < this.cloudCount; i++) {
            const x = (Math.random() - 0.5) * 4000;
            const z = (Math.random() - 0.5) * 4000;
            const y = 600 + Math.random() * 1200;
            const scale = 0.5 + Math.random() * 2;
            dummy.position.set(x, y, z);
            dummy.rotation.x = -Math.PI / 2;
            dummy.scale.set(scale, scale, 1);
            dummy.updateMatrix();
            this.clouds.setMatrixAt(i, dummy.matrix);
            this.cloudOffsets.push({
                x, y, z, scale,
                driftX: (Math.random() - 0.5) * 5,
                driftZ: (Math.random() - 0.5) * 5
            });
        }
        this.clouds.instanceMatrix.needsUpdate = true;
        scene.add(this.clouds);
        this._dummy = dummy;
    }

    _buildRain(scene) {
        const rainGeo = new THREE.BufferGeometry();
        const rainCount = 3000;
        const positions = new Float32Array(rainCount * 3);
        for (let i = 0; i < rainCount; i++) {
            positions[i * 3]     = (Math.random() - 0.5) * 400;
            positions[i * 3 + 1] = Math.random() * 300;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 400;
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.rainMat = new THREE.PointsMaterial({
            color: 0xaaaacc, size: 0.5, transparent: true, opacity: 0.5
        });
        this.rain = new THREE.Points(rainGeo, this.rainMat);
        this.rain.visible = false;
        scene.add(this.rain);
        this.rainPositions = positions;
        this.rainCount = rainCount;
    }

    get isNight() {
        const sunAngle = Math.sin(this.timeOfDay * Math.PI * 2) * 90;
        return sunAngle < 0;
    }

    get timeString() {
        const hours = Math.floor(this.timeOfDay * 24);
        const minutes = Math.floor((this.timeOfDay * 24 - hours) * 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    get seasonName() { return this.season; }
    get weatherName() { return this.weather; }

    update(dt, playerPos) {
        // Advance time of day
        this.timeOfDay += dt / DAY_DURATION;
        if (this.timeOfDay >= 1) this.timeOfDay -= 1;

        // Weather change timer
        this.weatherTimer += dt;
        if (this.weatherTimer > this.weatherInterval) {
            this.weatherTimer = 0;
            this._changeWeather();
        }

        // Season change (every 4 weather cycles)
        this.seasonTimer += dt;
        if (this.seasonTimer > this.weatherInterval * 4) {
            this.seasonTimer = 0;
            this.seasonIndex = (this.seasonIndex + 1) % 4;
            this.season = SEASONS[this.seasonIndex];
        }

        this._updateSky();

        // Move shadow light
        if (playerPos) {
            this.dirLight.target.position.copy(playerPos);
            this.dirLight.position.copy(playerPos).add(
                this.sunPosition.clone().multiplyScalar(300)
            );
        }

        // Drift clouds
        const dummy = this._dummy;
        // Adjust cloud opacity per weather
        const cloudOpacity = this.weather === 'clear'  ? 0.4 :
                             this.weather === 'cloudy' ? 0.8 :
                             this.weather === 'foggy'  ? 0.9 :
                             0.95; // stormy
        this.cloudMat.opacity = cloudOpacity;

        // Darken clouds at night
        const sunAngle = Math.sin(this.timeOfDay * Math.PI * 2) * 90;
        const dayF = THREE.MathUtils.clamp((sunAngle + 10) / 40, 0, 1);
        const gray = 0.3 + dayF * 0.7;
        this.cloudMat.color.setRGB(gray, gray, gray);

        for (let i = 0; i < this.cloudCount; i++) {
            const o = this.cloudOffsets[i];
            o.x += o.driftX * dt;
            o.z += o.driftZ * dt;

            if (playerPos) {
                const dx = o.x - playerPos.x;
                const dz = o.z - playerPos.z;
                if (dx * dx + dz * dz > 4000000) {
                    o.x = playerPos.x + (Math.random() - 0.5) * 3000;
                    o.z = playerPos.z + (Math.random() - 0.5) * 3000;
                    o.y = 600 + Math.random() * 1200;
                }
            }

            dummy.position.set(o.x, o.y, o.z);
            dummy.rotation.x = -Math.PI / 2;
            dummy.scale.set(o.scale, o.scale, 1);
            dummy.updateMatrix();
            this.clouds.setMatrixAt(i, dummy.matrix);
        }
        this.clouds.instanceMatrix.needsUpdate = true;

        // Rain
        const showRain = this.weather === 'stormy';
        this.rain.visible = showRain;
        if (showRain && playerPos) {
            this.rain.position.set(playerPos.x, playerPos.y, playerPos.z);
            const pos = this.rainPositions;
            for (let i = 0; i < this.rainCount; i++) {
                pos[i * 3 + 1] -= 150 * dt; // fall speed
                if (pos[i * 3 + 1] < -150) {
                    pos[i * 3 + 1] = 150;
                    pos[i * 3]     = (Math.random() - 0.5) * 400;
                    pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
                }
            }
            this.rain.geometry.attributes.position.needsUpdate = true;
        }
    }

    _changeWeather() {
        // Weighted random based on season
        const weights = {
            spring: { clear: 3, cloudy: 4, foggy: 2, stormy: 1 },
            summer: { clear: 5, cloudy: 2, foggy: 1, stormy: 2 },
            autumn: { clear: 2, cloudy: 4, foggy: 3, stormy: 1 },
            winter: { clear: 2, cloudy: 3, foggy: 3, stormy: 2 }
        };
        const w = weights[this.season];
        const total = Object.values(w).reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (const [type, weight] of Object.entries(w)) {
            r -= weight;
            if (r <= 0) { this.weather = type; return; }
        }
        this.weather = 'clear';
    }
}
