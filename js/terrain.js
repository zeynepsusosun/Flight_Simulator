import * as THREE from 'three';

// ── Simplex noise (Stefan Gustavson, public domain) ──
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
];
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);
(function seed() {
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
        perm[i] = p[i & 255];
        permMod12[i] = perm[i] % 12;
    }
})();

function simplex2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; const gi = permMod12[ii + perm[jj]]; n0 = t0 * t0 * (grad3[gi][0] * x0 + grad3[gi][1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; const gi = permMod12[ii + i1 + perm[jj + j1]]; n1 = t1 * t1 * (grad3[gi][0] * x1 + grad3[gi][1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; const gi = permMod12[ii + 1 + perm[jj + 1]]; n2 = t2 * t2 * (grad3[gi][0] * x2 + grad3[gi][1] * y2); }
    return 70 * (n0 + n1 + n2);
}

// ── Terrain height via fBm ──
export function getHeight(x, z) {
    let height = 0;
    let amp = 250;
    let freq = 0.0008;
    for (let o = 0; o < 6; o++) {
        height += simplex2(x * freq, z * freq) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return height;
}

// ── Color by altitude ──
function terrainColor(h) {
    if (h < -5)  return new THREE.Color(0.15, 0.35, 0.55); // water-ish
    if (h < 20)  return new THREE.Color(0.22, 0.55, 0.20); // lowland green
    if (h < 80)  return new THREE.Color(0.30, 0.52, 0.18); // forest
    if (h < 150) return new THREE.Color(0.50, 0.42, 0.25); // brown hills
    if (h < 220) return new THREE.Color(0.55, 0.50, 0.45); // rocky
    return new THREE.Color(0.90, 0.92, 0.95);               // snow
}

const CHUNK_SIZE = 512;
const SEGMENTS   = 64;

function buildChunk(cx, cz) {
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + cx * CHUNK_SIZE;
        const wz = pos.getZ(i) + cz * CHUNK_SIZE;
        const h = getHeight(wx, wz);
        pos.setY(i, h);
        const c = terrainColor(h);
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    return mesh;
}

export class Terrain {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.radius = 3; // chunks in each direction

        // Water plane
        const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE * 10, CHUNK_SIZE * 10);
        waterGeo.rotateX(-Math.PI / 2);
        this.water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
            color: 0x1a5276,
            transparent: true,
            opacity: 0.6,
            roughness: 0.3,
            metalness: 0.1
        }));
        this.water.position.y = -5;
        this.water.receiveShadow = true;
        scene.add(this.water);
    }

    update(playerPos) {
        const pcx = Math.round(playerPos.x / CHUNK_SIZE);
        const pcz = Math.round(playerPos.z / CHUNK_SIZE);

        // Add needed chunks
        for (let dx = -this.radius; dx <= this.radius; dx++) {
            for (let dz = -this.radius; dz <= this.radius; dz++) {
                const key = `${pcx + dx},${pcz + dz}`;
                if (!this.chunks.has(key)) {
                    const mesh = buildChunk(pcx + dx, pcz + dz);
                    this.scene.add(mesh);
                    this.chunks.set(key, mesh);
                }
            }
        }

        // Remove far chunks
        for (const [key, mesh] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (Math.abs(cx - pcx) > this.radius + 1 || Math.abs(cz - pcz) > this.radius + 1) {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                this.chunks.delete(key);
            }
        }

        // Move water with player
        this.water.position.x = playerPos.x;
        this.water.position.z = playerPos.z;
    }
}
