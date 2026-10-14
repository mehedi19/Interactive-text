"use client";

import React, { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["800", "900"],
  display: "swap",
});

const VERTEX_SHADER = `attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }`;

const FRAGMENT_SHADER = `precision highp float;

  varying vec2 v_uv;
  uniform sampler2D u_textTexture;
  uniform sampler2D u_trailTexture;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform vec2 u_mouseVel;
  uniform float u_time;
  uniform float u_distortion;
  uniform float u_frostiness;
  uniform float u_grainAmount;
  uniform float u_glowIntensity;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
      + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * snoise(p * frequency);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 aspectUV = vec2(uv.x * aspect, uv.y);
    vec2 mouseAspect = vec2(u_mouse.x * aspect, u_mouse.y);

    // 1. Sample 2D velocity & dissipation trail buffer
    vec4 trail = texture2D(u_trailTexture, uv);
    vec2 trailVelocity = (trail.rg - 0.5) * 2.0;
    float trailStrength = trail.b;

    float distToMouse = length(aspectUV - mouseAspect);
    float mouseProximity = smoothstep(0.45, 0.0, distToMouse);

    // 2. Compute Argon gaseous FBM turbulence & interactive vapor wake
    float slowTime = u_time * 0.16;
    float n1 = fbm(aspectUV * 2.5 + vec2(slowTime, -slowTime * 0.75));
    float n2 = fbm(aspectUV * 5.4 - vec2(slowTime * 0.85, slowTime * 1.1) + n1 * 0.45);

    vec2 ambientOffset = vec2(n1, n2) * 0.009 * u_frostiness;
    vec2 interactiveOffset = trailVelocity * 0.072 * u_distortion 
                           + vec2(n2, -n1) * trailStrength * 0.036 * u_distortion;

    vec2 distortedUV = uv + ambientOffset + interactiveOffset;

    // 3. Multi-tap frosted aerogel sampling with chromatic dispersion
    float spread = (0.0038 * u_frostiness) + (trailStrength * 0.010 * u_distortion);
    vec2 dir1 = vec2(cos(n1 * 6.283), sin(n1 * 6.283)) * spread;
    vec2 dir2 = vec2(cos(n2 * 6.283 + 2.1), sin(n2 * 6.283 + 2.1)) * spread * 1.45;

    vec4 centerSample = texture2D(u_textTexture, distortedUV);
    vec4 tap1 = texture2D(u_textTexture, distortedUV + dir1);
    vec4 tap2 = texture2D(u_textTexture, distortedUV - dir1);
    vec4 tap3 = texture2D(u_textTexture, distortedUV + dir2);
    vec4 tap4 = texture2D(u_textTexture, distortedUV - dir2);

    // 3D inner bevel shift toward top-right solar light source
    vec2 lightShift = normalize(vec2(0.78, -0.62)) * (0.0065 + trailStrength * 0.0055);
    vec4 bevelSample = texture2D(u_textTexture, distortedUV + lightShift);

    float crispAlpha = (centerSample.r * 0.38 + (tap1.r + tap2.r + tap3.r + tap4.r) * 0.155);
    float softBody   = (centerSample.g * 0.34 + (tap1.g + tap2.g + tap3.g + tap4.g) * 0.165);
    float outerHalo  = (centerSample.b * 0.38 + (tap1.b + tap2.b + tap3.b + tap4.b) * 0.155);

    // Smoky contour erosion (replicates the vaporized edges of the '4' in the reference image)
    float edgeZone = crispAlpha * (1.0 - crispAlpha) * 4.0;
    float wispNoise = fbm(aspectUV * 7.8 + trailVelocity * 2.8 + vec2(0.0, -u_time * 0.28));
    float frostedGlyph = clamp(
      mix(crispAlpha, softBody, 0.50 * u_frostiness) + edgeZone * wispNoise * (0.25 + trailStrength * 0.42),
      0.0,
      1.0
    );

    // 4. Exact Argon 4 Diagonal Atmospheric Gradient
    // Bottom-left (#010926 -> #041B5E) -> Center (#1D6CE0 -> #3A95F5) -> Top-Right (#D8F6FF -> #FFFFFF)
    vec2 solarOrigin = vec2(0.90, 0.06);
    float diag = clamp(1.0 - ((1.0 - uv.x) * 0.56 + uv.y * 0.68), 0.0, 1.0);
    float solarGlow = exp(-length((uv - solarOrigin) * vec2(aspect * 0.82, 1.0)) * 1.5);

    vec3 cMidnight = vec3(0.004, 0.035, 0.149); // #010926
    vec3 cSapphire = vec3(0.016, 0.106, 0.369); // #041B5E
    vec3 cRoyal    = vec3(0.114, 0.424, 0.878); // #1D6CE0
    vec3 cAzure    = vec3(0.227, 0.584, 0.961); // #3A95F5
    vec3 cIceCyan  = vec3(0.847, 0.965, 1.000); // #D8F6FF
    vec3 cSolar    = vec3(1.000, 1.000, 1.000); // #FFFFFF

    vec3 bgCol = mix(cMidnight, cSapphire, smoothstep(0.0, 0.30, diag));
    bgCol = mix(bgCol, cRoyal, smoothstep(0.24, 0.58, diag));
    bgCol = mix(bgCol, cAzure, smoothstep(0.50, 0.82, diag));
    bgCol = mix(bgCol, cIceCyan, smoothstep(0.75, 0.98, diag));
    bgCol = mix(bgCol, cSolar, pow(solarGlow, 1.45) * 0.82);

    bgCol += vec3(0.14, 0.38, 0.68) * (trailStrength * 0.24 + mouseProximity * 0.12) * u_glowIntensity;

    // 5. Frosted Aerogel Glyph Refraction & 3D Inner Bevel
    float innerCore = smoothstep(0.32, 0.95, crispAlpha);
    float rimHighlight = clamp((frostedGlyph - bevelSample.r * 0.66), 0.0, 1.0);
    float innerCavity = edgeZone * (0.68 + 0.32 * n2);

    // Subtle chromatic dispersion along the frosted rim
    vec3 frostTint = mix(vec3(0.78, 0.91, 1.0), vec3(0.98, 0.995, 1.0), diag * 0.68 + 0.32);
    frostTint.r += (tap1.r - tap2.r) * 0.12 * (1.0 + trailStrength);
    frostTint.b += (tap2.r - tap1.r) * 0.16 * (1.0 + trailStrength);

    float strokeDensity = mix(frostedGlyph * 0.78, innerCavity * 0.94 + innerCore * 0.50, 0.46);
    vec3 glyphColor = mix(bgCol, frostTint, clamp(strokeDensity + rimHighlight * 0.40, 0.0, 0.95));

    float interactiveSheen = (trailStrength * 0.58 + mouseProximity * 0.26) * frostedGlyph;
    glyphColor += vec3(0.35, 0.70, 1.0) * outerHalo * 0.34 * u_glowIntensity;
    glyphColor += vec3(0.94, 0.99, 1.0) * (rimHighlight * 0.30 + interactiveSheen * 0.48) * u_glowIntensity;

    float finalMask = clamp(frostedGlyph + outerHalo * 0.22 * u_glowIntensity, 0.0, 1.0);
    vec3 finalColor = mix(bgCol, glyphColor, finalMask);

    // 6. Tactile High-Frequency Film Grain
    float grain = hash(uv * u_resolution + vec2(fract(u_time * 19.0), fract(u_time * 37.0))) - 0.5;
    float grainWeight = (0.058 + 0.026 * edgeZone) * u_grainAmount;
    finalColor += vec3(grain * grainWeight);

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
  }`;

export interface ArgonHeroProps {
  initialText?: string;
  initialDistortion?: number;
  initialFrostiness?: number;
  initialGrain?: number;
  initialParticles?: number;
  showControls?: boolean;
}

export default function ArgonHero({
  initialText = "AI",
  initialDistortion = 1.2,
  initialFrostiness = 1.08,
  initialGrain = 1,
  initialParticles = 190,
  showControls = true,
}: ArgonHeroProps) {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [text, setText] = useState(initialText);
  const [distortion, setDistortion] = useState(initialDistortion);
  const [frostiness, setFrostiness] = useState(initialFrostiness);
  const [grainAmount, setGrainAmount] = useState(initialGrain);
  const [particleCount, setParticleCount] = useState(initialParticles);
  const [hudVisible, setHudVisible] = useState(showControls);

  const stateRef = useRef({
    text,
    distortion,
    frostiness,
    grainAmount,
    glowIntensity: 1.15,
    particleCount,
  });

  useEffect(() => {
    stateRef.current = {
      text,
      distortion,
      frostiness,
      grainAmount,
      glowIntensity: 1.15,
      particleCount,
    };
  }, [text, distortion, frostiness, grainAmount, particleCount]);

  const updateTextTextureRef = useRef<() => void>(() => {});

  useEffect(() => {
    updateTextTextureRef.current();
  }, [text]);

  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    const pCanvas = particleCanvasRef.current;
    if (!glCanvas || !pCanvas) return;

    const gl = glCanvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    const pCtx = pCanvas.getContext("2d");
    if (!gl || !pCtx) return;

    let animationFrameId: number;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    // 1. 2D Velocity & Dissipation Fluid Buffer
    const TRAIL_RES = 256;
    const trailCanvas = document.createElement("canvas");
    trailCanvas.width = TRAIL_RES;
    trailCanvas.height = TRAIL_RES;
    const trailCtx = trailCanvas.getContext("2d")!;
    trailCtx.fillStyle = "rgb(128, 128, 0)";
    trailCtx.fillRect(0, 0, TRAIL_RES, TRAIL_RES);

    interface Ripple {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      age: number;
      maxAge: number;
    }
    const ripples: Ripple[] = [];

    // 2. Offscreen Typography Mask Canvas ("AI" in Inter 900 Black)
    const textCanvas = document.createElement("canvas");
    const textCtx = textCanvas.getContext("2d")!;

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const createTexture = (unit: number) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    };

    const textTexture = createTexture(0);
    const trailTexture = createTexture(1);

    const uniforms = {
      textTexture: gl.getUniformLocation(program, "u_textTexture"),
      trailTexture: gl.getUniformLocation(program, "u_trailTexture"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      mouse: gl.getUniformLocation(program, "u_mouse"),
      mouseVel: gl.getUniformLocation(program, "u_mouseVel"),
      time: gl.getUniformLocation(program, "u_time"),
      distortion: gl.getUniformLocation(program, "u_distortion"),
      frostiness: gl.getUniformLocation(program, "u_frostiness"),
      grainAmount: gl.getUniformLocation(program, "u_grainAmount"),
      glowIntensity: gl.getUniformLocation(program, "u_glowIntensity"),
    };

    gl.uniform1i(uniforms.textTexture, 0);
    gl.uniform1i(uniforms.trailTexture, 1);

    const updateTextTexture = () => {
      const texScale = Math.min(dpr, 1.75);
      const tw = Math.max(1, Math.floor(width * texScale));
      const th = Math.max(1, Math.floor(height * texScale));
      textCanvas.width = tw;
      textCanvas.height = th;

      textCtx.fillStyle = "rgb(0, 0, 0)";
      textCtx.fillRect(0, 0, tw, th);

      const str = (stateRef.current.text || "AI").slice(0, 6);
      const scaleFactor = str.length <= 2 ? 0.54 : str.length === 3 ? 0.42 : 0.32;
      const fontSize = Math.min(tw * scaleFactor, th * 0.68);

      textCtx.font = `900 ${fontSize}px ${inter.style.fontFamily}, "Inter", sans-serif`;
      textCtx.textAlign = "center";
      textCtx.textBaseline = "middle";
      if ("letterSpacing" in textCtx) {
        (textCtx as any).letterSpacing = "-0.05em";
      }

      const cx = tw * 0.5;
      const cy = th * 0.51;

      // B channel: Wide atmospheric halo
      textCtx.save();
      textCtx.globalCompositeOperation = "lighter";
      textCtx.filter = `blur(${Math.max(18, fontSize * 0.075)}px)`;
      textCtx.fillStyle = "rgb(0, 0, 255)";
      textCtx.fillText(str, cx, cy);
      textCtx.restore();

      // G channel: Frosted aerogel bevel body
      textCtx.save();
      textCtx.globalCompositeOperation = "lighter";
      textCtx.filter = `blur(${Math.max(7, fontSize * 0.025)}px)`;
      textCtx.fillStyle = "rgb(0, 255, 0)";
      textCtx.fillText(str, cx, cy);
      textCtx.restore();

      // R channel: Crisp inner contour core
      textCtx.save();
      textCtx.globalCompositeOperation = "lighter";
      textCtx.filter = `blur(${Math.max(2, fontSize * 0.0055)}px)`;
      textCtx.fillStyle = "rgb(255, 0, 0)";
      textCtx.fillText(str, cx, cy);
      textCtx.restore();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    };

    updateTextTextureRef.current = updateTextTexture;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      phase: number;
      speed: number;
      nearGlyph: boolean;
    }
    const particles: Particle[] = [];

    const initParticles = (count: number) => {
      particles.length = 0;
      for (let i = 0; i < count; i++) {
        const nearGlyph = Math.random() < 0.65;
        particles.push({
          x: nearGlyph
            ? width * (0.22 + Math.random() * 0.56)
            : Math.random() * width,
          y: nearGlyph
            ? height * (0.18 + Math.random() * 0.64)
            : Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -Math.random() * 0.45 - 0.1,
          size: Math.random() * 2.0 + 0.5,
          alpha: Math.random() * 0.7 + 0.15,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.022 + 0.008,
          nearGlyph,
        });
      }
    };

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      glCanvas.width = Math.floor(width * dpr);
      glCanvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);

      pCanvas.width = Math.floor(width * dpr);
      pCanvas.height = Math.floor(height * dpr);
      pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      updateTextTexture();
      initParticles(stateRef.current.particleCount);
    };

    handleResize();
    document.fonts?.ready.then(updateTextTexture);
    window.addEventListener("resize", handleResize);

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, lx: 0.5, ly: 0.5, vx: 0, vy: 0 };

    const spawnRipple = (nx: number, ny: number, vx: number, vy: number, scale = 1.0) => {
      ripples.push({
        x: nx * TRAIL_RES,
        y: ny * TRAIL_RES,
        vx: Math.max(-1, Math.min(1, vx * 16)),
        vy: Math.max(-1, Math.min(1, vy * 16)),
        radius: TRAIL_RES * 0.135 * scale,
        age: 0,
        maxAge: 48,
      });
      if (ripples.length > 60) ripples.shift();
    };

    const onPointerMove = (clientX: number, clientY: number) => {
      const nx = clientX / Math.max(width, 1);
      const ny = clientY / Math.max(height, 1);
      const dx = nx - mouse.tx;
      const dy = ny - mouse.ty;
      mouse.tx = nx;
      mouse.ty = ny;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.001) {
        spawnRipple(nx, ny, dx, dy, Math.min(1.5, 0.78 + speed * 12));
      }
    };

    const onMouseMove = (e: MouseEvent) => onPointerMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = (now - startTime) * 0.001;
      const cfg = stateRef.current;

      mouse.x += (mouse.tx - mouse.x) * 0.14;
      mouse.y += (mouse.ty - mouse.y) * 0.14;
      mouse.vx = mouse.x - mouse.lx;
      mouse.vy = mouse.y - mouse.ly;
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;

      trailCtx.fillStyle = "rgba(128, 128, 0, 0.082)";
      trailCtx.fillRect(0, 0, TRAIL_RES, TRAIL_RES);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age++;
        if (r.age >= r.maxAge) {
          ripples.splice(i, 1);
          continue;
        }
        const life = 1 - r.age / r.maxAge;
        const rad = r.radius * (0.65 + (1 - life) * 0.78);
        r.x += r.vx * 1.65;
        r.y += r.vy * 1.65;

        const red = Math.floor(128 + r.vx * 127 * life);
        const green = Math.floor(128 + r.vy * 127 * life);
        const blue = Math.floor(255 * life);

        const grad = trailCtx.createRadialGradient(r.x, r.y, 0, r.x, r.y, rad);
        grad.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${life * 0.58})`);
        grad.addColorStop(0.5, `rgba(${red}, ${green}, ${Math.floor(blue * 0.5)}, ${life * 0.26})`);
        grad.addColorStop(1, "rgba(128, 128, 0, 0)");

        trailCtx.fillStyle = grad;
        trailCtx.beginPath();
        trailCtx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        trailCtx.fill();
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, trailTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailCanvas);

      gl.useProgram(program);
      gl.uniform2f(uniforms.resolution, glCanvas.width, glCanvas.height);
      gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
      gl.uniform2f(uniforms.mouseVel, mouse.vx, mouse.vy);
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(uniforms.distortion, cfg.distortion);
      gl.uniform1f(uniforms.frostiness, cfg.frostiness);
      gl.uniform1f(uniforms.grainAmount, cfg.grainAmount);
      gl.uniform1f(uniforms.glowIntensity, cfg.glowIntensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      pCtx.clearRect(0, 0, width, height);
      if (particles.length !== cfg.particleCount) {
        initParticles(cfg.particleCount);
      }

      const mxPx = mouse.x * width;
      const myPx = mouse.y * height;
      const mvxPx = mouse.vx * width;
      const mvyPx = mouse.vy * height;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase) * 0.24;
        p.y += p.vy + Math.cos(p.phase * 0.8) * 0.15;

        const dx = p.x - mxPx;
        const dy = p.y - myPx;
        const distSq = dx * dx + dy * dy;
        const radius = 200;

        if (distSq < radius * radius && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / radius) * cfg.distortion;
          // Radial repulsion + tangential vortex swirl
          p.x += (dx / dist) * force * 2.1 + (-dy / dist) * force * 1.15 + mvxPx * force * 0.35;
          p.y += (dy / dist) * force * 2.1 + (dx / dist) * force * 1.15 + mvyPx * force * 0.35;
        }

        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        const twinkle = 0.55 + 0.45 * Math.sin(p.phase * 2.1);
        pCtx.fillStyle = `rgba(232, 249, 255, ${(p.alpha * twinkle).toFixed(3)})`;
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        pCtx.fill();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <section className={`relative w-full h-screen overflow-hidden select-none bg-[#010926] text-white ${inter.className}`}>
      <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full block cursor-crosshair" />
      <canvas ref={particleCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <h1 className="sr-only">{text} — Argon 4 Interactive Hero</h1>

      {hudVisible && (
        <div className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
            <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse" />
            <span className="text-xs font-semibold tracking-widest uppercase">Argon 4 // {text}</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/40 backdrop-blur-md border border-white/15 rounded-full p-1">
            {["AI", "4", "A4"].map((preset) => (
              <button
                key={preset}
                onClick={() => setText(preset)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  text === preset ? "bg-white text-slate-950" : "text-white/80 hover:text-white"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
