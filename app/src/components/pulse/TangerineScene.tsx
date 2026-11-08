"use client";

// The 3D Tangerine. It receives a resilience value (0–100, or null before an account is loaded) and
// renders that share of the fruit's interior VOLUME as juice. It never computes or changes a score:
// all motion here is animation between values handed in from the financial engine.

import { Environment, Lightformer, OrbitControls, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { bandOf, volumeToHeight } from "@/lib/pulse";

const SQUASH = 0.86; // tangerines are flatter than oranges
const INNER = 0.9; // juice radius relative to the peel
const MAX_BUBBLES = 48;

/* ------------------------------------------------------------------ deterministic helpers */

/** Repeatable pseudo-random numbers, so the fruit looks identical on every visit (purely visual). */
function hash(i: number, k = 0) {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function makePeelGeometry() {
  const g = new THREE.SphereGeometry(1, 160, 120);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const theta = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)); // 0 at the top
    const phi = Math.atan2(v.z, v.x);
    let k = 1;
    k += 0.012 * Math.sin(3 * phi + 0.7) * Math.sin(theta); // gentle natural asymmetry
    k += 0.007 * Math.cos(2 * theta + phi);
    k -= 0.006 * Math.pow(1 - Math.abs(Math.sin(5 * phi)), 6) * Math.sin(theta); // faint segment lines
    k -= 0.07 * Math.exp(-(theta * theta) / 0.035); // stem dimple
    k -= 0.045 * Math.exp(-((Math.PI - theta) ** 2) / 0.05); // navel
    v.multiplyScalar(k);
    v.y *= SQUASH;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function makeCanvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb: boolean) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePeelTextures() {
  const pores = makeCanvasTexture(
    1024,
    512,
    (c) => {
      c.fillStyle = "#8a8a8a";
      c.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 14000; i++) {
        const x = hash(i, 1) * 1024;
        const y = hash(i, 2) * 512;
        const r = 0.6 + hash(i, 3) * 1.5;
        c.fillStyle = `rgba(40,40,40,${0.25 + hash(i, 4) * 0.45})`;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    },
    false,
  );
  const color = makeCanvasTexture(
    512,
    256,
    (c) => {
      c.fillStyle = "#ff8a1a";
      c.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 220; i++) {
        const x = hash(i, 5) * 512;
        const y = hash(i, 6) * 256;
        const r = 8 + hash(i, 7) * 34;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const light = hash(i, 8) > 0.5;
        g.addColorStop(0, light ? "rgba(255,180,80,0.28)" : "rgba(214,90,10,0.22)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
    true,
  );
  return { pores, color };
}

function makeLeafGeometry(len: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.45, len * 0.3, len, 0);
  s.quadraticCurveTo(len * 0.45, -len * 0.3, 0, 0);
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // curl along the length and a soft fold along the midrib
    p.setZ(i, 0.55 * (x * x) / len - 0.06 * (1 - Math.min(1, Math.abs(y) / (len * 0.22))));
  }
  g.computeVertexNormals();
  return g;
}

function makeHaloTexture() {
  return makeCanvasTexture(
    256,
    256,
    (c) => {
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,155,24,0.9)");
      g.addColorStop(0.35, "rgba(255,128,0,0.35)");
      g.addColorStop(1, "rgba(255,128,0,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    },
    true,
  );
}

/* ------------------------------------------------------------------ shared animation state */

interface Anim {
  volume: number; // displayed fill, 0..1 (eased toward the target)
  glow: number;
  wobble: THREE.Vector2;
  wobbleVel: THREE.Vector2;
  level: number; // world-space liquid height
  bottom: number;
  appear: number; // intro scale 0..1
}

/* ------------------------------------------------------------------ juice */

const juiceVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const juiceFragment = /* glsl */ `
  uniform float uLevel;
  uniform float uBottom;
  uniform float uTime;
  uniform float uCalm;
  uniform float uGlow;
  uniform vec2 uWobble;
  uniform vec3 uDeep;
  uniform vec3 uBright;
  uniform vec3 uSurface;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    float wave = (sin(vWorld.x * 7.0 + uTime * 1.7) * 0.010 + sin(vWorld.z * 6.0 - uTime * 1.25) * 0.008) * uCalm;
    float level = uLevel + uWobble.x * vWorld.x + uWobble.y * vWorld.z + wave;
    if (vWorld.y > level) discard;
    vec3 col;
    if (gl_FrontFacing) {
      float depth = clamp((vWorld.y - uBottom) / max(0.001, level - uBottom), 0.0, 1.0);
      col = mix(uDeep, uBright, depth);
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - abs(dot(V, normalize(vNormalW))), 2.5);
      col += fres * uBright * 0.55;
      col *= 0.8 + uGlow * 0.7;
      float edge = smoothstep(0.035, 0.0, level - vWorld.y);
      col = mix(col, uSurface, edge * 0.7);
    } else {
      // the far inner wall seen through the opening reads as the liquid's top surface
      col = uSurface * (0.85 + uGlow * 0.45);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function JuiceFill({ anim, reduced }: { anim: React.RefObject<Anim>; reduced: boolean }) {
  const geom = useMemo(() => new THREE.SphereGeometry(INNER, 96, 64), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: juiceVertex,
        fragmentShader: juiceFragment,
        side: THREE.DoubleSide,
        uniforms: {
          uLevel: { value: -10 },
          uBottom: { value: -1 },
          uTime: { value: 0 },
          uCalm: { value: 1 },
          uGlow: { value: 0.5 },
          uWobble: { value: new THREE.Vector2() },
          uDeep: { value: new THREE.Color("#d9560a") },
          uBright: { value: new THREE.Color("#FF9B18") },
          uSurface: { value: new THREE.Color("#FFB347") },
        },
      }),
    [],
  );
  useEffect(
    () => () => {
      geom.dispose();
      mat.dispose();
    },
    [geom, mat],
  );
  useFrame((s) => {
    const a = anim.current;
    mat.uniforms.uLevel.value = a.volume > 0.001 ? a.level : -10;
    mat.uniforms.uBottom.value = a.bottom;
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    mat.uniforms.uCalm.value = reduced ? 0 : 1;
    mat.uniforms.uGlow.value = a.glow;
    (mat.uniforms.uWobble.value as THREE.Vector2).copy(a.wobble);
  });
  return <mesh geometry={geom} material={mat} scale={[1, SQUASH, 1]} />;
}

/* ------------------------------------------------------------------ bubbles */

function JuiceParticles({ anim, score, reduced }: { anim: React.RefObject<Anim>; score: number | null; reduced: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geom = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff1d0", transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: MAX_BUBBLES }, (_, i) => {
        const ang = hash(i, 11) * Math.PI * 2;
        const rad = Math.sqrt(hash(i, 12)) * 0.8;
        return { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad, speed: 0.06 + hash(i, 13) * 0.1, phase: hash(i, 14), size: 0.008 + hash(i, 15) * 0.016 };
      }),
    [],
  );
  useEffect(
    () => () => {
      geom.dispose();
      mat.dispose();
    },
    [geom, mat],
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((s) => {
    const mesh = ref.current;
    if (!mesh) return;
    const a = anim.current;
    const visible = reduced || score === null ? 0 : Math.round(MAX_BUBBLES * Math.min(1, a.volume) * (0.35 + 0.65 * (score / 100)));
    const c = INNER * SQUASH;
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const b = seeds[i];
      if (i >= visible || a.level - a.bottom < 0.05) {
        m.makeScale(0, 0, 0);
      } else {
        const f = (b.phase + s.clock.elapsedTime * b.speed) % 1;
        const y = a.bottom + 0.03 + f * (a.level - a.bottom - 0.05);
        const local = y - (a.bottom + c); // height relative to the juice centre
        const spread = INNER * Math.sqrt(Math.max(0, 1 - (local / c) ** 2)); // stay inside the fruit
        const sc = b.size * (1 - Math.max(0, f - 0.85) / 0.15);
        m.makeScale(sc, sc, sc).setPosition(b.x * spread + Math.sin(s.clock.elapsedTime * 2 + i) * 0.006, y, b.z * spread);
      }
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geom, mat, MAX_BUBBLES]} renderOrder={2} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ the fruit */

function TangerineFruit({ score, reduced, appearKey }: { score: number | null; reduced: boolean; appearKey: number }) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const hovered = useRef(false);
  const { camera } = useThree();
  const anim = useRef<Anim>({ volume: 0, glow: 0.3, wobble: new THREE.Vector2(), wobbleVel: new THREE.Vector2(), level: -10, bottom: -1, appear: 0 });
  const prevCam = useRef({ az: 0, pol: 0, init: false });

  const peelGeom = useMemo(makePeelGeometry, []);
  const leafGeoms = useMemo(() => [makeLeafGeometry(0.46), makeLeafGeometry(0.36)], []);
  const tex = useMemo(makePeelTextures, []);
  const haloTex = useMemo(makeHaloTexture, []);
  const peelUniforms = useMemo(() => ({ uMinA: { value: 0.26 }, uMaxA: { value: 0.92 } }), []);
  const peelMat = useMemo(() => {
    const mtl = new THREE.MeshPhysicalMaterial({
      map: tex.color,
      bumpMap: tex.pores,
      bumpScale: 1.6,
      roughness: 0.48,
      clearcoat: 0.45,
      clearcoatRoughness: 0.32,
      sheen: 0.35,
      sheenColor: new THREE.Color("#FFB347"),
      emissive: new THREE.Color("#ff6a00"),
      emissiveIntensity: 0.12,
      transparent: true,
      depthWrite: false,
    });
    // glass-like peel: see-through in the middle, solid toward the rim (fresnel), so the juice shows
    mtl.onBeforeCompile = (sh) => {
      sh.uniforms.uMinA = peelUniforms.uMinA;
      sh.uniforms.uMaxA = peelUniforms.uMaxA;
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform float uMinA;\nuniform float uMaxA;\nvoid main() {")
        .replace(
          "#include <opaque_fragment>",
          "#include <opaque_fragment>\nfloat wfFres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 1.6);\ngl_FragColor.a = mix(uMinA, uMaxA, wfFres);",
        );
    };
    return mtl;
  }, [tex, peelUniforms]);
  const pithMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffd2a0", side: THREE.BackSide, transparent: true, opacity: 0.28, depthWrite: false }), []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2fa35a", roughness: 0.55, side: THREE.DoubleSide }), []);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b4423", roughness: 0.8 }), []);
  const haloMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.3 }),
    [haloTex],
  );

  useEffect(
    () => () => {
      [peelGeom, ...leafGeoms].forEach((g) => g.dispose());
      [tex.color, tex.pores, haloTex].forEach((t) => t.dispose());
      [peelMat, pithMat, leafMat, stemMat, haloMat].forEach((m) => m.dispose());
    },
    [peelGeom, leafGeoms, tex, haloTex, peelMat, pithMat, leafMat, stemMat, haloMat],
  );

  // a new account replays the entrance
  useEffect(() => {
    if (!reduced) anim.current.appear = Math.min(anim.current.appear, 0.55);
  }, [appearKey, reduced]);

  const band = score === null ? null : bandOf(score);
  const leafColor = useMemo(() => new THREE.Color(band === "high" ? "#27b35c" : band === "moderate" ? "#3c9a55" : band === "lower" ? "#5f9152" : "#3c9a55"), [band]);
  const peelTint = useMemo(() => new THREE.Color(band === "lower" ? "#e9b48a" : "#ffffff"), [band]);

  useFrame((s, dt) => {
    const a = anim.current;
    const g = group.current;
    if (!g) return;
    const d = Math.min(dt, 0.05);
    const target = score === null ? 0 : score / 100;
    // ease the displayed fill and glow toward the values the financial engine handed us
    a.volume = reduced ? target : a.volume + (target - a.volume) * (1 - Math.exp(-d * 2.4));
    const glowTarget = score === null ? 0.3 : 0.25 + 0.75 * target;
    a.glow = reduced ? glowTarget : a.glow + (glowTarget - a.glow) * (1 - Math.exp(-d * 2));
    a.appear = reduced ? 1 : a.appear + (1 - a.appear) * (1 - Math.exp(-d * 3.2));

    // idle float + hover lift
    const t = s.clock.elapsedTime;
    g.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.035;
    const sc = a.appear * (hovered.current ? 1.035 : 1);
    g.scale.setScalar(g.scale.x + (sc - g.scale.x) * (1 - Math.exp(-d * 8)));

    // liquid slosh: camera orbiting acts like the fruit turning
    const cam = camera.position;
    const az = Math.atan2(cam.x, cam.z);
    const pol = Math.acos(THREE.MathUtils.clamp(cam.y / cam.length(), -1, 1));
    if (prevCam.current.init && !reduced) {
      let dAz = az - prevCam.current.az;
      if (dAz > Math.PI) dAz -= Math.PI * 2;
      if (dAz < -Math.PI) dAz += Math.PI * 2;
      a.wobbleVel.x += dAz * 2.2;
      a.wobbleVel.y += (pol - prevCam.current.pol) * 2.2;
    }
    prevCam.current = { az, pol, init: true };
    // damped spring back to level
    a.wobbleVel.x += (-a.wobble.x * 28 - a.wobbleVel.x * 3.2) * d;
    a.wobbleVel.y += (-a.wobble.y * 28 - a.wobbleVel.y * 3.2) * d;
    a.wobble.x = THREE.MathUtils.clamp(a.wobble.x + a.wobbleVel.x * d, -0.18, 0.18);
    a.wobble.y = THREE.MathUtils.clamp(a.wobble.y + a.wobbleVel.y * d, -0.18, 0.18);

    // world-space liquid height that holds `volume` of the interior
    const c = INNER * SQUASH * g.scale.y;
    a.bottom = g.position.y - c;
    a.level = a.bottom + volumeToHeight(a.volume) * 2 * c;

    peelMat.emissiveIntensity = 0.06 + a.glow * 0.22;
    peelMat.color.lerp(peelTint, 0.05);
    leafMat.color.lerp(leafColor, 0.05);
    haloMat.opacity = 0.08 + a.glow * 0.42;
    if (halo.current) halo.current.quaternion.copy(camera.quaternion);
  });

  const top = (1 - 0.07) * SQUASH;
  return (
    <>
      <mesh ref={halo} material={haloMat} renderOrder={-1}>
        <planeGeometry args={[4.4, 4.4]} />
      </mesh>
      <group ref={group} scale={0.001}>
        <mesh geometry={peelGeom} material={pithMat} scale={0.985} renderOrder={0} />
        <JuiceFill anim={anim} reduced={reduced} />
        <JuiceParticles anim={anim} score={score} reduced={reduced} />
        <mesh
          geometry={peelGeom}
          material={peelMat}
          renderOrder={3}
          onPointerOver={() => {
            hovered.current = true;
            document.body.style.cursor = "grab";
          }}
          onPointerOut={() => {
            hovered.current = false;
            document.body.style.cursor = "";
          }}
        />
        {/* stem and leaves */}
        <mesh position={[0, top + 0.05, 0]} rotation={[0.08, 0, -0.12]} material={stemMat}>
          <cylinderGeometry args={[0.022, 0.04, 0.14, 12]} />
        </mesh>
        <mesh geometry={leafGeoms[0]} material={leafMat} position={[0.01, top + 0.06, 0]} rotation={[-Math.PI / 2 + 0.35, 0, 0.5]} />
        <mesh geometry={leafGeoms[1]} material={leafMat} position={[-0.01, top + 0.055, 0.01]} rotation={[-Math.PI / 2 + 0.45, 0, Math.PI - 0.2]} />
      </group>
    </>
  );
}

/** A soft blob shadow under the fruit (cheaper than a shadow pass, and ignores the glow plane). */
function SoftShadow() {
  const tex = useMemo(
    () =>
      makeCanvasTexture(
        128,
        128,
        (c) => {
          const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
          g.addColorStop(0, "rgba(0,0,0,0.75)");
          g.addColorStop(0.55, "rgba(0,0,0,0.3)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          c.fillStyle = g;
          c.fillRect(0, 0, 128, 128);
        },
        false,
      ),
    [],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, -0.97, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-2}>
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ scene */

function Controls({ resetKey, reduced, interactive }: { resetKey: number; reduced: boolean; interactive: boolean }) {
  const ref = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    if (resetKey) ref.current?.reset();
  }, [resetKey]);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={[0, 0.32, 0]} // aim a little above the fruit so it sits below the score readout
      enablePan={false}
      enableZoom={interactive}
      enableRotate={interactive}
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={6.5}
      minPolarAngle={0.35}
      maxPolarAngle={2.3}
      autoRotate={!reduced}
      autoRotateSpeed={0.6}
      rotateSpeed={0.7}
    />
  );
}

export default function TangerineScene({
  score,
  reduced,
  resetKey,
  appearKey,
  lowPower,
}: {
  score: number | null;
  reduced: boolean;
  resetKey: number;
  appearKey: number;
  lowPower: boolean;
}) {
  const band = score === null ? null : bandOf(score);
  const sparkleCount = reduced ? 0 : lowPower ? 18 : band === "high" ? 60 : band === "moderate" ? 38 : band === "lower" ? 16 : 24;
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 2]}
      camera={{ position: [0, 0.35, 4.9], fov: 35 }}
      // opaque canvas with its own background: avoids colour fringes from compositing transparent WebGL over CSS
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#0b1327"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 2.5]} intensity={2.2} color="#fff4e6" />
      <directionalLight position={[-3, 1.2, -3]} intensity={1.6} color="#FFB347" />
      <directionalLight position={[0, -3, 2]} intensity={0.35} color="#8b5cf6" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[2.5, 3, 3]} scale={[3, 1.6, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.6} color="#FFB347" position={[-3, 1, -2]} scale={2.4} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color="#8b5cf6" position={[0, -3, 0]} scale={[4, 4, 1]} target={[0, 0, 0]} />
      </Environment>
      <TangerineFruit score={score} reduced={reduced} appearKey={appearKey} />
      {sparkleCount > 0 && (
        <Sparkles key={sparkleCount} count={sparkleCount} scale={[4.2, 3.2, 4.2]} size={band === "lower" ? 2.2 : 3} speed={band === "high" ? 0.45 : band === "lower" ? 0.15 : 0.3} color="#FFB347" opacity={0.75} />
      )}
      <SoftShadow />
      <Controls resetKey={resetKey} reduced={reduced} interactive />
    </Canvas>
  );
}
