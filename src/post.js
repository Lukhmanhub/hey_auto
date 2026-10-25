import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, LUT3DEffect, LookupTexture, HueSaturationEffect, NoiseEffect, BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// The "Kerala look": warm, humid, a little hazy. Built procedurally as a 3D LUT so it can be tuned live.
export function keralaGrade({ warmth = 0.55, lift = 1.35, greens = 1.8, size = 32 } = {}) {
  const lut = LookupTexture.createNeutral(size);
  const d = lut.image.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // humid haze: lift the blacks slightly toward a soft green-grey
    const lf = 0.035 * lift * (1 - l);
    r += lf * 0.94; g += lf * 1.0; b += lf * 0.97;
    // golden highlights, faintly teal shadows
    const hi = Math.max(0, l - 0.45) * 0.12 * warmth, lo = Math.max(0, 0.4 - l) * 0.06 * warmth;
    r += hi; g += hi * 0.55; b -= hi * 0.35;
    r -= lo * 0.4; g += lo * 0.1; b += lo * 0.35;
    // lush greens: push yellow-greens a touch deeper and richer
    const greenness = Math.max(0, g - Math.max(r, b));
    g += greenness * 0.12 * greens; r -= greenness * 0.08 * greens; b -= greenness * 0.04 * greens;
    // monsoon foliage reads deep and saturated: darken mid greens a touch so they don't go lime
    const leafy = Math.min(1, greenness * 6);
    r *= 1 - leafy * 0.04 * greens; g *= 1 - leafy * 0.02 * greens; b *= 1 - leafy * 0.05 * greens;
    // gentle filmic S-curve
    const s = (x) => x + 0.06 * Math.sin((x - 0.5) * Math.PI) * 0.5;
    d[i] = Math.min(1, Math.max(0, s(r))); d[i + 1] = Math.min(1, Math.max(0, s(g))); d[i + 2] = Math.min(1, Math.max(0, s(b)));
  }
  lut.needsUpdate = true;
  return lut;
}

export class Post {
  // Phones can be put on a safer graphics level (main.js does it when a phone shows a blank screen):
  //   level 0 = full chain · 1 = no multisampling, no AO, small shadows · 2 = no post chain at all
  constructor(renderer, scene, camera, { mobile = false, level = 0 } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.mobile = mobile; this.level = level; this.quality = 'high';
    renderer.toneMapping = THREE.NoToneMapping;       // tone mapping happens in the effect chain
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: level ? 0 : Math.min(mobile ? 2 : 4, renderer.capabilities.maxSamples) });
    this.composer.addPass(new RenderPass(scene, camera));

    this.ao = new N8AOPostPass(scene, camera, w, h);
    Object.assign(this.ao.configuration, { aoRadius: 2.2, distanceFalloff: 1.2, intensity: 2.2, halfRes: true, color: new THREE.Color('#2a2418') });
    this.ao.setQualityMode('Low');
    this.composer.addPass(this.ao);

    // low threshold, wide radius: bright sky and sunlit walls bleed a soft glare into the haze
    this.bloom = new BloomEffect({ intensity: 0.5, luminanceThreshold: 0.62, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.82 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.grade = new LUT3DEffect(keralaGrade());
    this.sat = new HueSaturationEffect({ saturation: 0.02 });
    // fine film grain: takes the digital crispness off, like a real lens in dusty air
    this.grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.grain.blendMode.opacity.value = 0.12;
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    this.composer.addPass(new EffectPass(camera, this.bloom, this.tone, this.grade, this.sat, this.vignette, this.grain));
    this.exposure = 1;
  }
  setGrade(opts) { const old = this.grade.lut; this.grade.lut = keralaGrade(opts); old.dispose(); }
  setSize(w, h) { this.composer.setSize(w, h); }
  // High: AO + 4× MSAA + bloom · Medium: 2× MSAA, no AO · Low: no AO, no MSAA, no bloom, smaller shadows
  setQuality(q, sun) {
    this.quality = q; this.sun = sun;
    const safe = this.level > 0;
    this.bypass = this.level >= 2;
    this.ao.enabled = q === 'high' && !safe;
    this.composer.multisampling = safe ? 0 : q === 'high' ? Math.min(4, this.renderer.capabilities.maxSamples) : q === 'medium' ? 2 : 0;
    this.bloom.blendMode.opacity.value = q === 'low' ? 0 : 1;
    this.grain.blendMode.opacity.value = q === 'low' ? 0 : 0.12;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'low' ? 1 : this.maxDpr ?? 1.5));
    this.composer.setSize(window.innerWidth, window.innerHeight);
    if (sun) { const s = q === 'low' || (this.mobile && (q !== 'high' || safe)) ? 1024 : 2048; if (sun.shadow.mapSize.x !== s) { sun.shadow.mapSize.set(s, s); sun.shadow.map?.dispose(); sun.shadow.map = null; } }
  }
  setLevel(level) { this.level = level; this.setQuality(this.quality, this.sun); }
  render(dt) {
    const r = this.renderer;
    r.toneMappingExposure = this.exposure;
    if (this.bypass) {
      // straight to the screen: the renderer does the tone mapping the effect chain normally would
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    r.toneMapping = THREE.NoToneMapping;
    this.composer.render(dt);
  }
}

// Image-based lighting from Poly Haven HDRIs (CC0). Clear tropical sky by day, overcast in the monsoon.
export async function loadSkies(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const loader = new RGBELoader();
  const load = (f) => new Promise((res) => loader.load(`${import.meta.env.BASE_URL}hdri/${f}`, (t) => { const env = pmrem.fromEquirectangular(t).texture; t.dispose(); res(env); }, undefined, () => res(null)));
  const [clear, overcast] = await Promise.all([load('kloofendal_48d_partly_cloudy_puresky_1k.hdr'), load('kloofendal_overcast_puresky_1k.hdr')]);
  pmrem.dispose();
  return { clear, overcast };
}
