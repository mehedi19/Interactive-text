"use client";

import React, { useEffect, useRef } from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["900"],
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
  uniform float u_time;

  // Live tunable uniforms
  uniform float u_frostOpacity;
  uniform float u_edgeSmoke;
  uniform float u_rimHighlight;
  uniform float u_warpForce;
  uniform float u_turbulenceSpeed;
  uniform float u_noiseScale;
  uniform float u_grainAmount;
  uniform vec3 u_colorDeep;
  uniform vec3 u_colorMid;
  uniform vec3 u_colorBright;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(
      0.211324865405187,
      0.366025403784439,
      -0.577350269189626,
      0.024390243902439
    );
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
    );
    vec3 m = max(
      0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
      0.0
    );
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    vec2 shift = vec2(100.0);
    // Rotated octave matrix prevents axial grid/banding artifacts
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; i++) {
      value += amplitude * snoise(p);
      p = rot * p * 2.02 + shift;
      amplitude *= 0.5;
    }
    return value;
  }

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 uv = v_uv;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 aspectUV = vec2(uv.x * aspect, uv.y);
    vec2 mouseAspect = vec2(u_mouse.x * aspect, u_mouse.y);

    // 1. Sample smooth 2D fluid velocity trail buffer
    vec4 trail = texture2D(u_trailTexture, uv);
    vec2 trailVel = (trail.rg - 0.5) * 2.0;
    float trailEnergy = trail.b;

    float distToMouse = length(aspectUV - mouseAspect);
    float hoverGlow = smoothstep(0.42, 0.0, distToMouse);

    // 2. Organic multi-octave Simplex FBM cloud drift (rotated to prevent scanline striping)
    float t = u_time * u_turbulenceSpeed;
    vec2 noiseCoord = aspectUV * u_noiseScale;
    float n1 = fbm(noiseCoord + vec2(t * 0.22, -t * 0.17));
    float n2 = fbm(noiseCoord * 1.85 - vec2(t * 0.19, t * 0.24) + vec2(n1 * 0.45));
    float fineCloud = fbm(noiseCoord * 3.4 + vec2(-t * 0.15, t * 0.28) + trailVel * 1.5);

    // 3. Smooth gaseous UV displacement (ambient vapor + interactive cursor fluid wake)
    vec2 smokeDisp = vec2(n1, n2) * (0.011 * u_edgeSmoke);
    vec2 fluidDisp = trailVel * (0.068 * u_warpForce)
                   + vec2(n2, -n1) * trailEnergy * (0.032 * u_warpForce);
    vec2 sampleUV = clamp(uv + smokeDisp + fluidDisp, 0.002, 0.998);

    // 4. Isotropic 8-tap Poisson-style blur sampling on the text mask for silky, band-free edges
    float blurRadius = (0.0045 * u_edgeSmoke) + (trailEnergy * 0.0085 * u_warpForce);
    vec2 o1 = vec2( 0.9238,  0.3826) * blurRadius;
    vec2 o2 = vec2(-0.9238, -0.3826) * blurRadius;
    vec2 o3 = vec2( 0.3826, -0.9238) * blurRadius;
    vec2 o4 = vec2(-0.3826,  0.9238) * blurRadius;
    vec2 o5 = vec2( 0.7071,  0.7071) * blurRadius * 1.55;
    vec2 o6 = vec2(-0.7071, -0.7071) * blurRadius * 1.55;

    vec4 c0 = texture2D(u_textTexture, sampleUV);
    vec4 c1 = texture2D(u_textTexture, clamp(sampleUV + o1, 0.002, 0.998));
    vec4 c2 = texture2D(u_textTexture, clamp(sampleUV + o2, 0.002, 0.998));
    vec4 c3 = texture2D(u_textTexture, clamp(sampleUV + o3, 0.002, 0.998));
    vec4 c4 = texture2D(u_textTexture, clamp(sampleUV + o4, 0.002, 0.998));
    vec4 c5 = texture2D(u_textTexture, clamp(sampleUV + o5, 0.002, 0.998));
    vec4 c6 = texture2D(u_textTexture, clamp(sampleUV + o6, 0.002, 0.998));

    vec4 accum = c0 * 0.26 + (c1 + c2 + c3 + c4) * 0.135 + (c5 + c6) * 0.10;

    // Directional bevel offset toward top-right solar light source
    vec2 lightDir = normalize(vec2(0.76, -0.65)) * (0.008 + trailEnergy * 0.004);
    vec4 lightSample = texture2D(u_textTexture, clamp(sampleUV + lightDir, 0.002, 0.998));
    vec4 shadowSample = texture2D(u_textTexture, clamp(sampleUV - lightDir * 0.85, 0.002, 0.998));

    // Unpack channels: R = crisp glyph contour, G = medium frosted body, B = wide atmospheric mist
    float coreField = accum.r;
    float frostField = accum.g;
    float mistField = accum.b;

    // 5. Authentic Argon 4 Diagonal Atmospheric Background Gradient
    // Deep Midnight Navy (bottom-left) -> Electric Royal Azure (center) -> Solar Icy Cyan (top-right)
    vec2 sunPos = vec2(0.92, 0.06);
    float diag = clamp(1.0 - ((1.0 - uv.x) * 0.56 + uv.y * 0.66), 0.0, 1.0);
    float sunDist = length((uv - sunPos) * vec2(aspect * 0.82, 1.0));
    float sunBloom = exp(-sunDist * 1.55);

    vec3 bg = mix(u_colorDeep, u_colorMid, smoothstep(0.02, 0.58, diag));
    bg = mix(bg, u_colorBright, smoothstep(0.52, 0.98, diag));
    bg = mix(bg, vec3(1.0, 1.0, 1.0), pow(sunBloom, 1.5) * 0.72);

    // Subtle atmospheric FBM cloud modulation in background
    bg += vec3(0.04, 0.11, 0.22) * (n1 * 0.35 + n2 * 0.25);

    // 6. Translucent Frosted Aerogel Glyph Shading (Key Fix: NO opaque white blowout!)
    // Outer smoky boundary feathers smoothly with FBM cloud wisps
    float contourBoundary = coreField * (1.0 - coreField) * 4.0;
    float smokyErosion = (n1 * 0.5 + fineCloud * 0.5) * contourBoundary * (0.34 * u_edgeSmoke + trailEnergy * 0.45);

    float glyphBody = smoothstep(0.08, 0.88, mix(coreField, frostField, 0.46) + smokyErosion);
    float innerHollow = smoothstep(0.45, 0.96, coreField);

    // 3D Inner Bevel Rim Highlight (brighter on edges facing the top-right light & along outer contour)
    float directionalRim = clamp((coreField - lightSample.r) * 1.85, 0.0, 1.0) * glyphBody;
    float backRim = clamp((coreField - shadowSample.r) * 1.35, 0.0, 1.0) * glyphBody;
    float softEdgeRim = pow(contourBoundary, 0.85) * 0.62;
    float totalRim = clamp((directionalRim * 0.75 + backRim * 0.35 + softEdgeRim * 0.65) * u_rimHighlight, 0.0, 1.0);

    // Internal cloudy density: edges are frostier, center is more translucent so background blue shines through
    float internalCloud = 0.82 + 0.18 * (n2 * 0.6 + fineCloud * 0.4);
    float bodyTranslucency = mix(
      glyphBody * 0.82,
      innerHollow * 0.48,
      0.52
    ) * u_frostOpacity * internalCloud;

    // Frosted glass tint blends icy white with the underlying local sky gradient
    vec3 refractedSky = mix(bg, u_colorBright, 0.58 + 0.22 * diag);
    vec3 frostSurface = mix(refractedSky, vec3(0.95, 0.99, 1.0), 0.65);

    // Subtle chromatic dispersion when disturbed by mouse fluid wake
    frostSurface.r += (c1.r - c2.r) * 0.14 * (0.4 + trailEnergy);
    frostSurface.b += (c2.r - c1.r) * 0.18 * (0.4 + trailEnergy);

    // Composite translucent frosted interior over the background
    vec3 color = mix(bg, frostSurface, clamp(bodyTranslucency, 0.0, 0.86));

    // Add outer misty vapor aura & 3D specular rim sheen
    float vaporHalo = clamp(mistField * 0.38 * u_edgeSmoke + trailEnergy * glyphBody * 0.32, 0.0, 1.0);
    color += mix(u_colorMid, u_colorBright, 0.7) * vaporHalo * 0.36;
    color += vec3(0.94, 0.99, 1.0) * totalRim * (0.42 + 0.35 * trailEnergy + 0.18 * hoverGlow);

    // 7. High-frequency tactile film grain (matches Argon 4 reference texture)
    float grain = hash(uv * u_resolution + vec2(fract(u_time * 17.3), fract(u_time * 31.7))) - 0.5;
    float grainMask = (0.052 + 0.024 * contourBoundary) * u_grainAmount;
    color += vec3(grain * grainMask);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }`;

export interface ArgonHeroProps {
  text?: string;
  fontScale?: number;
  letterSpacing?: number;
  frostOpacity?: number;
  edgeSmoke?: number;
  rimHighlight?: number;
  warpForce?: number;
  warpRadius?: number;
  turbulenceSpeed?: number;
  noiseScale?: number;
  grainAmount?: number;
  particleCount?: number;
  colorDeep?: [number, number, number];
  colorMid?: [number, number, number];
  colorBright?: [number, number, number];
}

export default function ArgonHero({
  text = "AI",
  fontScale = 0.54,
  letterSpacing = -0.04,
  frostOpacity = 0.68,
  edgeSmoke = 1.15,
  rimHighlight = 1.05,
  warpForce = 1.25,
  warpRadius = 0.14,
  turbulenceSpeed = 0.55,
  noiseScale = 2.6,
  grainAmount = 1.05,
  particleCount = 190,
  colorDeep = [0.0078, 0.0549, 0.2157],
  colorMid = [0.1412, 0.4863, 0.902],
  colorBright = [0.8941, 0.9765, 1],
}: ArgonHeroProps) {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // 2. High-Resolution Offscreen Multi-Channel Gaussian Text Mask
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
      time: gl.getUniformLocation(program, "u_time"),
      frostOpacity: gl.getUniformLocation(program, "u_frostOpacity"),
      edgeSmoke: gl.getUniformLocation(program, "u_edgeSmoke"),
      rimHighlight: gl.getUniformLocation(program, "u_rimHighlight"),
      warpForce: gl.getUniformLocation(program, "u_warpForce"),
      turbulenceSpeed: gl.getUniformLocation(program, "u_turbulenceSpeed"),
      noiseScale: gl.getUniformLocation(program, "u_noiseScale"),
      grainAmount: gl.getUniformLocation(program, "u_grainAmount"),
      colorDeep: gl.getUniformLocation(program, "u_colorDeep"),
      colorMid: gl.getUniformLocation(program, "u_colorMid"),
      colorBright: gl.getUniformLocation(program, "u_colorBright"),
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

      const str = (text || "AI").slice(0, 8);
      const lengthPenalty = str.length <= 2 ? 1.0 : 2.15 / str.length;
      const fontSize = Math.min(tw * fontScale * lengthPenalty, th * 0.68);

      textCtx.font = `900 ${fontSize}px ${inter.style.fontFamily}, "Inter", sans-serif`;
      textCtx.textAlign = "center";
      textCtx.textBaseline = "middle";
      if ("letterSpacing" in textCtx) {
        (textCtx as any).letterSpacing = `${letterSpacing}em`;
      }

      const cx = tw * 0.5;
      const cy = th * 0.51;

      // B channel: Wide gaseous vapor aura
      textCtx.save();
      textCtx.globalCompositeOperation = "lighter";
      textCtx.filter = `blur(${Math.max(24, fontSize * 0.095)}px)`;
      textCtx.fillStyle = "rgb(0, 0, 255)";
      textCtx.fillText(str, cx, cy);
      textCtx.restore();

      // G channel: Medium frosted aerogel body cushion
      textCtx.save();
      textCtx.globalCompositeOperation = "lighter";
      textCtx.filter = `blur(${Math.max(10, fontSize * 0.036)}px)`;
      textCtx.fillStyle = "rgb(0, 255, 0)";
      textCtx.fillText(str, cx, cy);
      textCtx.restore();

      // R channel: Smooth feathered core contour (avoids aliased pixel steps)
      textCtx.save();
      textCtx.globalCompositeOperation = "lighter";
      textCtx.filter = `blur(${Math.max(3.5, fontSize * 0.011)}px)`;
      textCtx.fillStyle = "rgb(255, 0, 0)";
      textCtx.fillText(str, cx, cy);
      textCtx.restore();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    };

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      phase: number;
      speed: number;
    }
    const particles: Particle[] = [];

    const initParticles = (count: number) => {
      particles.length = 0;
      for (let i = 0; i < count; i++) {
        const nearGlyph = Math.random() < 0.68;
        particles.push({
          x: nearGlyph ? width * (0.22 + Math.random() * 0.56) : Math.random() * width,
          y: nearGlyph ? height * (0.18 + Math.random() * 0.64) : Math.random() * height,
          vx: (Math.random() - 0.5) * 0.32,
          vy: -Math.random() * 0.42 - 0.08,
          size: Math.random() * 1.9 + 0.45,
          alpha: Math.random() * 0.68 + 0.15,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.022 + 0.008,
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
      initParticles(particleCount);
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
        radius: TRAIL_RES * warpRadius * scale,
        age: 0,
        maxAge: 52,
      });
      if (ripples.length > 64) ripples.shift();
    };

    const onPointerMove = (clientX: number, clientY: number) => {
      const nx = clientX / Math.max(width, 1);
      const ny = clientY / Math.max(height, 1);
      const dx = nx - mouse.tx;
      const dy = ny - mouse.ty;
      mouse.tx = nx;
      mouse.ty = ny;
      const speed = Math.hypot(dx, dy);
      if (speed > 0.0008) {
        spawnRipple(nx, ny, dx, dy, Math.min(1.55, 0.78 + speed * 12));
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

      mouse.x += (mouse.tx - mouse.x) * 0.14;
      mouse.y += (mouse.ty - mouse.y) * 0.14;
      mouse.vx = mouse.x - mouse.lx;
      mouse.vy = mouse.y - mouse.ly;
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;

      trailCtx.fillStyle = "rgba(128, 128, 0, 0.078)";
      trailCtx.fillRect(0, 0, TRAIL_RES, TRAIL_RES);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age++;
        if (r.age >= r.maxAge) {
          ripples.splice(i, 1);
          continue;
        }
        const life = 1 - r.age / r.maxAge;
        const rad = r.radius * (0.65 + (1 - life) * 0.82);
        r.x += r.vx * 1.6;
        r.y += r.vy * 1.6;

        const red = Math.floor(128 + r.vx * 127 * life);
        const green = Math.floor(128 + r.vy * 127 * life);
        const blue = Math.floor(255 * life);

        const grad = trailCtx.createRadialGradient(r.x, r.y, 0, r.x, r.y, rad);
        grad.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${life * 0.56})`);
        grad.addColorStop(0.5, `rgba(${red}, ${green}, ${Math.floor(blue * 0.5)}, ${life * 0.25})`);
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
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(uniforms.frostOpacity, frostOpacity);
      gl.uniform1f(uniforms.edgeSmoke, edgeSmoke);
      gl.uniform1f(uniforms.rimHighlight, rimHighlight);
      gl.uniform1f(uniforms.warpForce, warpForce);
      gl.uniform1f(uniforms.turbulenceSpeed, turbulenceSpeed);
      gl.uniform1f(uniforms.noiseScale, noiseScale);
      gl.uniform1f(uniforms.grainAmount, grainAmount);
      gl.uniform3f(uniforms.colorDeep, colorDeep[0], colorDeep[1], colorDeep[2]);
      gl.uniform3f(uniforms.colorMid, colorMid[0], colorMid[1], colorMid[2]);
      gl.uniform3f(uniforms.colorBright, colorBright[0], colorBright[1], colorBright[2]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      pCtx.clearRect(0, 0, width, height);
      const mxPx = mouse.x * width;
      const myPx = mouse.y * height;
      const mvxPx = mouse.vx * width;
      const mvyPx = mouse.vy * height;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += p.speed;
        p.x += p.vx + Math.sin(p.phase) * 0.22;
        p.y += p.vy + Math.cos(p.phase * 0.8) * 0.14;

        const dx = p.x - mxPx;
        const dy = p.y - myPx;
        const distSq = dx * dx + dy * dy;
        const radius = 210;

        if (distSq < radius * radius && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const force = (1 - dist / radius) * warpForce;
          p.x += (dx / dist) * force * 2.0 + (-dy / dist) * force * 1.1 + mvxPx * force * 0.35;
          p.y += (dy / dist) * force * 2.0 + (dx / dist) * force * 1.1 + mvyPx * force * 0.35;
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
  }, [
    text,
    fontScale,
    letterSpacing,
    frostOpacity,
    edgeSmoke,
    rimHighlight,
    warpForce,
    warpRadius,
    turbulenceSpeed,
    noiseScale,
    grainAmount,
    particleCount,
    colorDeep,
    colorMid,
    colorBright,
  ]);

  return (
    <section
      className={`relative w-full h-screen overflow-hidden select-none bg-[#020E37] ${inter.className}`}
    >
      <canvas
        ref={glCanvasRef}
        className="absolute inset-0 w-full h-full block cursor-crosshair"
      />
      <canvas
        ref={particleCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <h1 className="sr-only">{text}</h1>
    </section>
  );
}
