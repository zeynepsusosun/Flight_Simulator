export class Controls {
    constructor(aircraft) {
        this.aircraft = aircraft;
        this.keys = new Set();
        this.smoothPitch = 0;
        this.smoothRoll  = 0;
        this.smoothYaw   = 0;
        this.paused = false;
        this.disabled = false; // for game over
        this.onCameraSwitch = null;
        this.onToggleHud = null;
        this.onToggleHelp = null;
        this.onRestart = null;

        window.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            this._handleKeyDown(e);
        });
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
        });
        window.addEventListener('keydown', (e) => {
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') e.preventDefault();
        });
    }

    _handleKeyDown(e) {
        // Restart always available during game over
        if (this.disabled) {
            if (e.code === 'KeyR') this.onRestart?.();
            return;
        }

        switch (e.code) {
            case 'Digit1': this.onCameraSwitch?.(0); break;
            case 'Digit2': this.onCameraSwitch?.(1); break;
            case 'Digit3': this.onCameraSwitch?.(2); break;
            case 'KeyG':   this.aircraft.toggleGear(); break;
            case 'KeyR':   this.aircraft.reset(); break;
            case 'KeyH':   this.onToggleHud?.(); break;
            case 'KeyP': case 'Escape': this.paused = !this.paused; break;
            case 'KeyF':
                if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
                else document.exitFullscreen?.();
                break;
            case 'Slash':
                if (e.shiftKey) this.onToggleHelp?.();
                break;
        }
    }

    update(dt) {
        if (this.disabled) return;

        // Throttle (disabled if engine dead)
        if (!this.aircraft.engineDead) {
            if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) {
                this.aircraft.throttle = Math.min(1, this.aircraft.throttle + 0.6 * dt);
            }
            if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) {
                this.aircraft.throttle = Math.max(0, this.aircraft.throttle - 0.6 * dt);
            }
        }

        let tp = 0, tr = 0, ty = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    tp = -1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  tp =  1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  tr = -1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) tr =  1;
        if (this.keys.has('KeyQ'))                                ty =  1;
        if (this.keys.has('KeyE'))                                ty = -1;

        const smoothing = 5 * dt;
        this.smoothPitch += (tp - this.smoothPitch) * smoothing;
        this.smoothRoll  += (tr - this.smoothRoll)  * smoothing;
        this.smoothYaw   += (ty - this.smoothYaw)   * smoothing;

        this.aircraft.input.pitch = this.smoothPitch;
        this.aircraft.input.roll  = this.smoothRoll;
        this.aircraft.input.yaw   = this.smoothYaw;
    }
}
