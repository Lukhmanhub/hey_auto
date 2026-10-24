import * as THREE from 'three';

// GPU-driven weather and smoke. Everything animates in the vertex shader from a time
// uniform, so rain, splashes and puffs cost almost nothing on the CPU.

const RAIN_N = 9000, SPLASH_N = 700, PUFF_N = 220;

export class VFX {
  constructor(scene) {
    this.t = 0;
    // ---------------- rain streaks ----------------
    const rg = new THREE.BufferGeometry();
    const seed = new Float32Array(RAIN_N * 2 * 3), end = new Float32Array(RAIN_N * 2);
    for (let i = 0; i < RAIN_N; i++) {
      const x = (Math.random() - 0.5) * 90, y = Math.random() * 40, z = (Math.random() - 0.5) * 90;
      seed.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1;
    }
    rg.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: 0 }, uAmt: { value: 0 }, uColor: { value: new THREE.Color('#c9d2d6') } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uTime, uWind, uAmt; uniform vec3 uCenter; attribute float aEnd; varying float vA;
        void main(){
          vec3 s = position;
          float y = mod(s.y - uTime * 26.0, 40.0);
          vec3 p = vec3(uCenter.x + mod(s.x - uCenter.x + 45.0, 90.0) - 45.0, uCenter.y - 14.0 + y, uCenter.z + mod(s.z - uCenter.z + 45.0, 90.0) - 45.0);
          p += aEnd * vec3(-uWind * 0.09, 0.85, -uWind * 0.03);       // streak slants into the wind
          vA = (aEnd > 0.5 ? 0.0 : 1.0) * uAmt * step(fract(s.x * 7.13 + s.z * 3.7), uAmt * 1.05);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * 0.42); }`,
    }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // ---------------- splashes on the ground ----------------
    const sg = new THREE.InstancedBufferGeometry();
    sg.index = new THREE.PlaneGeometry(1, 1).index;
    sg.setAttribute('position', new THREE.PlaneGeometry(1, 1).getAttribute('position'));
    sg.setAttribute('uv', new THREE.PlaneGeometry(1, 1).getAttribute('uv'));
    const ss = new Float32Array(SPLASH_N * 3);
    for (let i = 0; i < SPLASH_N; i++) ss.set([(Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, Math.random()], i * 3);
    sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(ss, 3));
    sg.instanceCount = SPLASH_N;
    this.splashU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmt: { value: 0 } };
    this.splash = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      uniforms: this.splashU, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime, uAmt; uniform vec3 uCenter; attribute vec3 aSeed; varying vec2 vUv; varying float vLife;
        void main(){
          float life = fract(uTime * 1.7 + aSeed.z);
          float cyc = floor(uTime * 1.7 + aSeed.z);
          vec2 jit = vec2(fract(sin(cyc * 12.9 + aSeed.z * 78.2) * 43758.5), fract(sin(cyc * 39.3 + aSeed.x) * 12543.1)) * 6.0 - 3.0;
          vec2 xz = uCenter.xz + mod(aSeed.xy + jit - uCenter.xz + 25.0, 50.0) - 25.0;
          float sc = (0.08 + life * 0.42) * step(fract(aSeed.z * 17.0), uAmt);
          vec3 p = vec3(xz.x + position.x * sc, 0.06, xz.y - position.y * sc);
          vUv = uv; vLife = life;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uAmt; varying vec2 vUv; varying float vLife;
        void main(){ float d = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.62, 0.8, d) * (1.0 - smoothstep(0.8, 1.0, d));
          gl_FragColor = vec4(0.86, 0.9, 0.92, ring * (1.0 - vLife) * 0.55 * uAmt); }`,
    }));
    this.splash.frustumCulled = false;
    scene.add(this.splash);

    // ---------------- smoke / dust / spray puffs ----------------
    const pg = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    pg.index = quad.index;
    pg.setAttribute('position', quad.getAttribute('position'));
    pg.setAttribute('uv', quad.getAttribute('uv'));
    this.pOrigin = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_N * 3), 3);
    this.pVel = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_N * 3), 3);
    this.pBirth = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_N).fill(-99), 1);
    this.pLife = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_N).fill(1), 1);
    this.pSize = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_N * 2), 2);
    this.pColor = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_N * 4), 4);
    for (const [k, a] of Object.entries({ aOrigin: this.pOrigin, aVel: this.pVel, aBirth: this.pBirth, aLife: this.pLife, aSize: this.pSize, aColor: this.pColor })) {
      a.setUsage(THREE.DynamicDrawUsage); pg.setAttribute(k, a);
    }
    pg.instanceCount = PUFF_N;
    this.puffU = { uTime: { value: 0 } };
    this.puffs = new THREE.Mesh(pg, new THREE.ShaderMaterial({
      uniforms: this.puffU, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; attribute vec3 aOrigin, aVel; attribute float aBirth, aLife; attribute vec2 aSize; attribute vec4 aColor;
        varying vec2 vUv; varying float vA; varying vec3 vC;
        void main(){
          float age = (uTime - aBirth) / aLife;
          float alive = step(0.0, age) * step(age, 1.0);
          float t = uTime - aBirth;
          vec3 p = aOrigin + aVel * t * (1.0 - age * 0.5) + vec3(0.0, aSize.y * t, 0.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          mv.xy += position.xy * aSize.x * (0.35 + age * 1.8) * alive;
          vUv = uv; vC = aColor.rgb; vA = aColor.a * (1.0 - age) * smoothstep(0.0, 0.08, age) * alive;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec2 vUv; varying float vA; varying vec3 vC;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
    }));
    this.puffs.frustumCulled = false;
    this.puffs.renderOrder = 2;
    scene.add(this.puffs);
    this.next = 0;
    this.acc = new Map();

    // ---------------- dust motes hanging in the warm air, glinting where the sun catches them ----------------
    const MOTES = 2600;
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(MOTES * 3), ms = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) { mp.set([(Math.random() - 0.5) * 60, Math.random() * 14, (Math.random() - 0.5) * 60], i * 3); ms[i] = Math.random(); }
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
    this.moteU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmt: { value: 1 }, uSun: { value: new THREE.Vector3(0.45, 0.62, 0.35).normalize() }, uPix: { value: 1 } };
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: this.moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uPix; uniform vec3 uCenter; attribute float aSeed; varying float vA; varying float vGlint;
        void main(){
          vec3 s = position;
          vec3 drift = vec3(sin(uTime * 0.13 + aSeed * 40.0) * 2.0 + uTime * 0.35, sin(uTime * 0.21 + aSeed * 17.0) * 0.6, cos(uTime * 0.11 + aSeed * 23.0) * 2.0);
          vec3 p = s + drift;
          p.x = uCenter.x + mod(p.x - uCenter.x + 30.0, 60.0) - 30.0;
          p.z = uCenter.z + mod(p.z - uCenter.z + 30.0, 60.0) - 30.0;
          p.y = mod(p.y, 14.0) + 0.2;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          vA = smoothstep(1.5, 4.0, dist) * (1.0 - smoothstep(18.0, 30.0, dist));
          vGlint = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 60.0);
          gl_PointSize = uPix * (1.4 + aSeed * 2.2) * (18.0 / max(dist, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uAmt; varying float vA; varying float vGlint;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * uAmt * (0.10 + 0.22 * vGlint);
          if (a < 0.004) discard; gl_FragColor = vec4(1.0, 0.86, 0.66, a); }`,
    }));
    this.motes.frustumCulled = false;
    scene.add(this.motes);
  }

  // Emit one puff. size = [start size, rise speed], color = [r,g,b,alpha]
  puff(origin, vel, life, size, color) {
    const i = this.next; this.next = (this.next + 1) % PUFF_N;
    this.pOrigin.setXYZ(i, origin.x, origin.y, origin.z);
    this.pVel.setXYZ(i, vel.x, vel.y, vel.z);
    this.pBirth.setX(i, this.t); this.pLife.setX(i, life);
    this.pSize.setXY(i, size[0], size[1]);
    this.pColor.setXYZW(i, color[0], color[1], color[2], color[3]);
    for (const a of [this.pOrigin, this.pVel, this.pBirth, this.pLife, this.pSize, this.pColor]) a.needsUpdate = true;
  }
  // rate-limited emitter: emits `rate` puffs per second for a given key
  emit(key, rate, dt, fn) {
    let a = (this.acc.get(key) ?? 0) + rate * dt;
    while (a >= 1) { fn(); a -= 1; }
    this.acc.set(key, a);
  }

  update(dt, camera, rainAmt, wind) {
    this.t += dt;
    for (const u of [this.rainU, this.splashU, this.puffU]) u.uTime.value = this.t;
    this.rainU.uCenter.value.copy(camera.position);
    this.rainU.uWind.value = wind;
    this.rainU.uAmt.value = rainAmt;
    this.rain.visible = rainAmt > 0.01;
    this.splashU.uCenter.value.copy(camera.position);
    this.splashU.uAmt.value = rainAmt;
    this.splash.visible = rainAmt > 0.01;
    // rain washes the dust out of the air
    this.moteU.uTime.value = this.t; this.moteU.uCenter.value.copy(camera.position); this.moteU.uAmt.value = 1 - rainAmt;
    this.moteU.uPix.value = Math.min(window.devicePixelRatio, 1.5) * (window.innerHeight / 800);
    this.motes.visible = false;   // removed: read as specks jumping in the sky
  }
}
