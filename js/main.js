import * as THREE from 'three';
import { Terrain }      from './terrain.js';
import { Aircraft }     from './aircraft.js';
import { SkySystem }    from './sky.js';
import { Controls }     from './controls.js';
import { CameraSystem } from './camera.js';
import { HUD }          from './hud.js';
import { Runway }       from './runway.js';
import { Audio }        from './audio.js';

class App {
    constructor() {
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingBar    = document.getElementById('loading-bar-fill');
        this.loadingText   = document.getElementById('loading-text');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.gameOverTitle  = document.getElementById('game-over-title');
        this.gameOverMsg    = document.getElementById('game-over-msg');
        this.landingScreen  = document.getElementById('landing-success-screen');

        this._setLoading(10, 'Creating renderer...');

        const canvas = document.getElementById('renderer');
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;

        this.scene = new THREE.Scene();
        this.clock = new THREE.Clock();
        this.gameOver = false;

        this._init();
    }

    async _init() {
        this._setLoading(20, 'Generating sky...');
        this.sky = new SkySystem(this.scene);

        this._setLoading(35, 'Generating terrain...');
        this.terrain = new Terrain(this.scene);

        this._setLoading(50, 'Building runway...');
        this.runway = new Runway(this.scene);

        this._setLoading(65, 'Building aircraft...');
        this.aircraft = new Aircraft(this.scene);

        this._setLoading(80, 'Setting up controls...');
        this.controls = new Controls(this.aircraft);
        this.camera = new CameraSystem(this.renderer, this.aircraft);

        this.controls.onCameraSwitch = (mode) => this.camera.setMode(mode);
        this.controls.onToggleHud = () => this.hud.toggleVisibility();
        this.controls.onToggleHelp = () => this.hud.toggleHelp();
        this.controls.onRestart = () => this._restart();

        this._setLoading(90, 'Initializing HUD...');
        this.hud = new HUD();

        this.terrain.update(this.aircraft.mesh.position);

        this._setLoading(100, 'Ready!');
        setTimeout(() => {
            this.loadingScreen.classList.add('fade-out');
            setTimeout(() => { this.loadingScreen.style.display = 'none'; }, 800);
        }, 400);

        // Restart button click
        document.getElementById('restart-btn')?.addEventListener('click', () => this._restart());
        document.getElementById('restart-btn-2')?.addEventListener('click', () => this._restart());

        window.addEventListener('resize', () => this._onResize());
        this._animate();
    }

    _restart() {
        this.gameOver = false;
        this.controls.disabled = false;
        this.aircraft.reset();
        this.camera._initChase();
        this.gameOverScreen.classList.remove('visible');
        this.landingScreen.classList.remove('visible');
    }

    _showGameOver(title, message) {
        this.gameOver = true;
        this.controls.disabled = true;
        this.gameOverTitle.textContent = title;
        this.gameOverMsg.textContent = message;
        this.gameOverScreen.classList.add('visible');
    }

    _showLandingSuccess() {
        this.gameOver = true;
        this.controls.disabled = true;
        this.landingScreen.classList.add('visible');
        Audio.success();
    }

    _setLoading(pct, text) {
        this.loadingBar.style.width = pct + '%';
        this.loadingText.textContent = text;
    }

    _onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.setSize(w, h);
        this.camera.resize(w, h);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        let dt = this.clock.getDelta();
        dt = Math.min(dt, 1 / 30);

        if (this.controls.paused && !this.gameOver) {
            this.renderer.render(this.scene, this.camera.activeCamera);
            return;
        }

        if (!this.gameOver) {
            this.controls.update(dt);
            const event = this.aircraft.update(dt);

            // Handle aircraft events
            if (event === 'crashed') {
                Audio.crash();
                this._showGameOver('CRASH', 'Your aircraft has been destroyed. Reduce speed before ground contact.');
            } else if (event === 'engine_dead') {
                Audio.engineFail();
                this._showGameOver('ENGINE FAILURE',
                    'Maximum altitude exceeded! Engine shut down. You are gliding down...');
                // Don't fully disable — let them try to glide
                this.gameOver = false;
                this.controls.disabled = false;
                this.aircraft.engineDead = true;
            } else if (event === 'altitude_warning') {
                Audio.altitudeWarning();
            }

            // Stall audio
            if (this.aircraft.isStalling) Audio.stallWarning();

            // Ground proximity audio
            const alt = this.aircraft.altitude * 3.28084;
            if (alt < 300 && this.aircraft.vSpeed < -5) Audio.groundWarning();

            // Check landing
            if (this.runway.checkLanding(this.aircraft)) {
                this._showLandingSuccess();
            }
        }

        this.terrain.update(this.aircraft.mesh.position);
        this.sky.update(dt, this.aircraft.mesh.position);
        this.runway.update(dt);
        this.camera.update(dt);

        // Runway info for HUD compass
        const runwayInfo = this.runway.getDistanceAndBearing(this.aircraft.mesh.position);
        const skyInfo = {
            time: this.sky.timeString,
            weather: this.sky.weatherName,
            season: this.sky.seasonName,
            isNight: this.sky.isNight
        };
        this.hud.update(this.aircraft, this.camera.modeName, dt, runwayInfo, skyInfo);

        this.renderer.render(this.scene, this.camera.activeCamera);
    }
}

new App();
