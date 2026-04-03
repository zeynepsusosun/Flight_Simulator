import * as THREE from 'three';

const M_TO_FT  = 3.28084;
const MS_TO_KT = 1.94384;
const M_TO_FPM = 196.85;
const SPEED_OF_SOUND = 343;

export class HUD {
    constructor() {
        this.el = {
            speedValue:   document.getElementById('speed-value'),
            altValue:     document.getElementById('alt-value'),
            headingValue: document.getElementById('heading-value'),
            headingTape:  document.getElementById('heading-tape'),
            ahSkyGround:  document.getElementById('ah-sky-ground'),
            throttleFill: document.getElementById('throttle-bar-fill'),
            throttlePct:  document.getElementById('throttle-pct'),
            vspeed:       document.getElementById('vspeed'),
            gforce:       document.getElementById('gforce'),
            mach:         document.getElementById('mach'),
            fps:          document.getElementById('fps-counter'),
            cameraLabel:  document.getElementById('camera-label'),
            stallWarn:    document.getElementById('stall-warning'),
            groundWarn:   document.getElementById('ground-warning'),
            altWarn:      document.getElementById('altitude-warning'),
            hud:          document.getElementById('hud'),
            help:         document.getElementById('controls-help'),
            compass:      document.getElementById('waypoint-compass'),
            compassArrow: document.getElementById('compass-arrow'),
            compassDist:  document.getElementById('compass-distance'),
            timeDisplay:  document.getElementById('time-display'),
            weatherDisplay: document.getElementById('weather-display'),
            engineWarn:   document.getElementById('engine-warning'),
        };

        this.visible = true;
        this.helpVisible = true;
        this.frameCount = 0;
        this.fpsTime = 0;
        this.fpsDisplay = 60;
    }

    toggleVisibility() {
        this.visible = !this.visible;
        // When opening HUD, always close help panel
        if (this.visible) {
            this.helpVisible = false;
            this.el.help.classList.add('hidden');
        }
        this.el.hud.classList.toggle('hidden', !this.visible);
    }

    toggleHelp() {
        this.helpVisible = !this.helpVisible;
        this.el.help.classList.toggle('hidden', !this.helpVisible);
    }

    update(aircraft, cameraModeName, dt, runwayInfo, skyInfo) {
        this.frameCount++;

        // FPS
        this.fpsTime += dt;
        if (this.frameCount % 30 === 0) {
            this.fpsDisplay = Math.round(30 / this.fpsTime);
            this.fpsTime = 0;
        }

        const speed = aircraft.speed * MS_TO_KT;
        const alt   = aircraft.altitude * M_TO_FT;
        const vs    = aircraft.vSpeed * M_TO_FPM;
        const hdg   = Math.round(aircraft.heading);
        const mach  = aircraft.speed / SPEED_OF_SOUND;

        // Speed
        this.el.speedValue.textContent = Math.round(speed);
        this.el.speedValue.style.color = speed < 80 ? '#ff4444' : '#00ff88';

        // Altitude
        this.el.altValue.textContent = Math.round(alt);
        this.el.altValue.style.color = alt < 500 ? '#ff4444' :
                                       aircraft.altitudeWarning ? '#ffaa00' : '#00ff88';

        // Heading
        const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const cardinal = cardinals[Math.round(hdg / 45) % 8];
        this.el.headingValue.textContent = `${hdg}° ${cardinal}`;

        // Heading tape
        const tapeMarks = [];
        for (let offset = -2; offset <= 2; offset++) {
            const deg = ((hdg + offset * 30) % 360 + 360) % 360;
            tapeMarks.push(deg + '°');
        }
        this.el.headingTape.textContent = tapeMarks.join('  ');

        // Artificial horizon
        const pitchDeg = THREE.MathUtils.radToDeg(aircraft.pitch);
        const rollDeg  = THREE.MathUtils.radToDeg(aircraft.roll);
        const pitchOffset = pitchDeg * 2;
        this.el.ahSkyGround.style.transform =
            `translate(-50%, -50%) rotate(${-rollDeg}deg) translateY(${pitchOffset}px)`;

        // Throttle
        const thrPct = Math.round(aircraft.throttle * 100);
        this.el.throttleFill.style.height = thrPct + '%';
        this.el.throttlePct.textContent = thrPct + '%';

        // Flight data
        this.el.vspeed.textContent = `VS: ${vs > 0 ? '+' : ''}${Math.round(vs)} ft/m`;
        this.el.gforce.textContent = `G: ${aircraft.gForce.toFixed(1)}`;
        this.el.mach.textContent   = `M: ${mach.toFixed(2)}`;
        this.el.fps.textContent    = `FPS: ${this.fpsDisplay}`;

        // Camera
        this.el.cameraLabel.textContent = cameraModeName;

        // Warnings
        this.el.stallWarn.classList.toggle('active', aircraft.isStalling);
        this.el.groundWarn.classList.toggle('active', alt < 300 && aircraft.vSpeed < -5);
        this.el.altWarn.classList.toggle('active', aircraft.altitudeWarning);
        this.el.engineWarn.classList.toggle('active', aircraft.engineDead);

        // ── Waypoint compass (GTA style) ──
        if (runwayInfo) {
            const { distance, bearing } = runwayInfo;
            // Relative bearing: difference between heading and bearing to target
            let relBearing = bearing - aircraft.heading;
            if (relBearing > 180) relBearing -= 360;
            if (relBearing < -180) relBearing += 360;

            // Arrow rotation points toward runway
            this.el.compassArrow.style.transform = `rotate(${relBearing}deg)`;

            // Distance display
            if (distance > 1000) {
                this.el.compassDist.textContent = `${(distance / 1000).toFixed(1)} km`;
            } else {
                this.el.compassDist.textContent = `${Math.round(distance)} m`;
            }

            // Color based on proximity
            if (distance < 500) {
                this.el.compass.style.borderColor = '#00ff44';
                this.el.compassArrow.style.borderBottomColor = '#00ff44';
            } else if (distance < 2000) {
                this.el.compass.style.borderColor = '#ffaa00';
                this.el.compassArrow.style.borderBottomColor = '#ffaa00';
            } else {
                this.el.compass.style.borderColor = 'rgba(0,255,136,.5)';
                this.el.compassArrow.style.borderBottomColor = '#00ff88';
            }
        }

        // ── Time & weather display ──
        if (skyInfo) {
            const icon = skyInfo.isNight ? '🌙' : '☀️';
            this.el.timeDisplay.textContent = `${icon} ${skyInfo.time}`;
            const wIcons = { clear: '☀️', cloudy: '☁️', foggy: '🌫️', stormy: '⛈️' };
            this.el.weatherDisplay.textContent =
                `${wIcons[skyInfo.weather] || ''} ${skyInfo.weather.toUpperCase()} | ${skyInfo.season.toUpperCase()}`;
        }
    }
}
