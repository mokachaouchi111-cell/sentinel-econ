import * as THREE from "./vendor/three/three.module.js"

const cpuCores = navigator.hardwareConcurrency || 4
const STAR_COUNT = cpuCores <= 4 ? 7500 : 12000
const BRANCHES = 6
const GALAXY_RADIUS = 82
const SHIELD_RADIUS = 14
const CORE_SWIRL_COUNT = cpuCores <= 4 ? 900 : 1500
const SHIELD_PARTICLE_COUNT = cpuCores <= 4 ? 1500 : 2600
const NATURAL_COLOR = new THREE.Color("#42d9ff")
const CORE_SAFE_COLOR = new THREE.Color("#2fd5ff")
const CORE_ALERT_COLOR = new THREE.Color("#ff244d")
const CORE_DEFENSE_COLOR = new THREE.Color("#ff76a8")

const root = document.getElementById("scene-root")
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
root.appendChild(renderer.domElement)
renderer.domElement.style.cursor = "grab"

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2("#050a18", 0.008)

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600)
camera.position.set(0, 16, 96)

const ambient = new THREE.AmbientLight("#6dc8ff", 0.5)
scene.add(ambient)

const coreLight = new THREE.PointLight("#57d8ff", 4.6, 120, 2)
coreLight.position.set(0, 0, 0)
scene.add(coreLight)

const geometry = new THREE.BufferGeometry()
const positions = new Float32Array(STAR_COUNT * 3)
const basePositions = new Float32Array(STAR_COUNT * 3)
const velocities = new Float32Array(STAR_COUNT * 3)
const colors = new Float32Array(STAR_COUNT * 3)
const baseColors = new Float32Array(STAR_COUNT * 3)
const hostility = new Uint8Array(STAR_COUNT)
let hostileCount = 0

const fillGalaxy = () => {
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const i3 = i * 3
    const radius = Math.pow(Math.random(), 0.55) * GALAXY_RADIUS
    const branchAngle = ((i % BRANCHES) / BRANCHES) * Math.PI * 2
    const spin = radius * 0.28
    const noise = Math.pow(Math.random(), 2.2) * 5
    const offsetX = (Math.random() - 0.5) * noise
    const offsetY = Math.pow(Math.random(), 2.4) * (Math.random() < 0.5 ? -1 : 1) * 6 * (1 - radius / GALAXY_RADIUS)
    const offsetZ = (Math.random() - 0.5) * noise
    const angle = branchAngle + spin

    const x = Math.cos(angle) * radius + offsetX
    const y = offsetY
    const z = Math.sin(angle) * radius + offsetZ

    positions[i3] = x
    positions[i3 + 1] = y
    positions[i3 + 2] = z
    basePositions[i3] = x
    basePositions[i3 + 1] = y
    basePositions[i3 + 2] = z

    const shade = 0.75 + Math.random() * 0.25
    baseColors[i3] = NATURAL_COLOR.r * shade
    baseColors[i3 + 1] = NATURAL_COLOR.g * shade
    baseColors[i3 + 2] = 1
    colors[i3] = baseColors[i3]
    colors[i3 + 1] = baseColors[i3 + 1]
    colors[i3 + 2] = baseColors[i3 + 2]
  }
}

fillGalaxy()

geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))

const particles = new THREE.Points(
  geometry,
  new THREE.PointsMaterial({
    size: 0.24,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  }),
)
scene.add(particles)

const core = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 40, 40),
  new THREE.MeshStandardMaterial({
    color: "#04070f",
    metalness: 0.08,
    roughness: 0.35,
    emissive: "#071124",
    emissiveIntensity: 0.95,
  }),
)
scene.add(core)

const coreShell = new THREE.Mesh(
  new THREE.SphereGeometry(4.5, 44, 44),
  new THREE.MeshPhysicalMaterial({
    color: "#7be7ff",
    transparent: true,
    opacity: 0.2,
    roughness: 0.08,
    metalness: 0.42,
    transmission: 0.72,
    thickness: 1.2,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: "#2fd5ff",
    emissiveIntensity: 0.65,
    depthWrite: false,
  }),
)
scene.add(coreShell)

const aura = new THREE.Mesh(
  new THREE.SphereGeometry(5.8, 36, 36),
  new THREE.MeshBasicMaterial({
    color: CORE_SAFE_COLOR,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
scene.add(aura)

const swirlGeometry = new THREE.BufferGeometry()
const swirlPositions = new Float32Array(CORE_SWIRL_COUNT * 3)
const swirlAngles = new Float32Array(CORE_SWIRL_COUNT)
const swirlRadius = new Float32Array(CORE_SWIRL_COUNT)
const swirlHeight = new Float32Array(CORE_SWIRL_COUNT)
const swirlSpeed = new Float32Array(CORE_SWIRL_COUNT)

for (let i = 0; i < CORE_SWIRL_COUNT; i += 1) {
  const i3 = i * 3
  swirlAngles[i] = Math.random() * Math.PI * 2
  swirlRadius[i] = 2.8 + Math.pow(Math.random(), 0.55) * 4.8
  swirlHeight[i] = (Math.random() - 0.5) * 2.6
  swirlSpeed[i] = 0.7 + Math.random() * 1.6
  swirlPositions[i3] = Math.cos(swirlAngles[i]) * swirlRadius[i]
  swirlPositions[i3 + 1] = swirlHeight[i]
  swirlPositions[i3 + 2] = Math.sin(swirlAngles[i]) * swirlRadius[i]
}

swirlGeometry.setAttribute("position", new THREE.BufferAttribute(swirlPositions, 3).setUsage(THREE.DynamicDrawUsage))

const coreSwirl = new THREE.Points(
  swirlGeometry,
  new THREE.PointsMaterial({
    color: "#82edff",
    size: 0.12,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
scene.add(coreSwirl)

const accretionRing = new THREE.Mesh(
  new THREE.TorusGeometry(7.6, 0.16, 22, 180),
  new THREE.MeshPhysicalMaterial({
    color: "#6fe8ff",
    transparent: true,
    opacity: 0.66,
    roughness: 0.12,
    metalness: 0.85,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: "#4ee0ff",
    emissiveIntensity: 0.65,
    blending: THREE.NormalBlending,
  }),
)
accretionRing.rotation.x = Math.PI / 2.5
scene.add(accretionRing)

const shieldUniforms = {
  uTime: { value: 0 },
  uStrength: { value: 0 },
  uReveal: { value: 0 },
  uPulse: { value: 0 },
  uColorA: { value: new THREE.Color("#59d6ff") },
  uColorB: { value: new THREE.Color("#8dfff8") },
  uAttackTint: { value: new THREE.Color("#ff5d86") },
}

const shield = new THREE.Mesh(
  new THREE.SphereGeometry(SHIELD_RADIUS, 72, 36),
  new THREE.ShaderMaterial({
    uniforms: shieldUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform float uStrength;
      uniform float uReveal;
      uniform float uPulse;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uAttackTint;

      float hexCell(vec2 p) {
        p.x *= 1.154700538;
        p.y += mod(floor(p.x), 2.0) * 0.5;
        vec2 gv = abs(fract(p) - 0.5);
        return max(gv.x * 1.35 + gv.y, gv.y * 1.75);
      }

      void main() {
        vec2 uv = vUv * vec2(20.0, 12.0);
        float cell = hexCell(uv + vec2(sin(uTime * 0.3) * 0.25, cos(uTime * 0.4) * 0.18));
        float edge = 1.0 - smoothstep(0.43, 0.53, cell);
        float dist = length((vUv - vec2(0.5, 0.5)) * vec2(1.2, 1.0));
        float revealMask = 1.0 - smoothstep(uReveal, uReveal + 0.16, dist);
        float shimmer = 0.55 + 0.45 * sin(uTime * 6.5 + vWorldPos.y * 1.5 + vWorldPos.x * 0.7);
        float glitch = step(0.96, sin((vUv.y + uTime * 0.7) * 140.0) * 0.5 + 0.5) * 0.55 * uPulse;
        vec3 color = mix(uColorA, uColorB, shimmer);
        color = mix(color, uAttackTint, uPulse * 0.75);
        float alpha = edge * revealMask * uStrength * (0.5 + shimmer * 0.5 + glitch);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  }),
)
shield.rotation.x = Math.PI
shield.position.y = 0
scene.add(shield)

const shieldParticleGeometry = new THREE.BufferGeometry()
const shieldParticlePositions = new Float32Array(SHIELD_PARTICLE_COUNT * 3)
const shieldParticleAngles = new Float32Array(SHIELD_PARTICLE_COUNT)
const shieldParticlePolar = new Float32Array(SHIELD_PARTICLE_COUNT)
const shieldParticleRadius = new Float32Array(SHIELD_PARTICLE_COUNT)
const shieldParticleSpeed = new Float32Array(SHIELD_PARTICLE_COUNT)
const shieldParticleLift = new Float32Array(SHIELD_PARTICLE_COUNT)

for (let i = 0; i < SHIELD_PARTICLE_COUNT; i += 1) {
  const i3 = i * 3
  shieldParticleAngles[i] = Math.random() * Math.PI * 2
  shieldParticlePolar[i] = Math.random() * Math.PI
  shieldParticleRadius[i] = SHIELD_RADIUS * (0.72 + Math.random() * 0.35)
  shieldParticleSpeed[i] = 1.1 + Math.random() * 2.1
  shieldParticleLift[i] = (Math.random() - 0.5) * 0.35
  shieldParticlePositions[i3] = 0
  shieldParticlePositions[i3 + 1] = 0
  shieldParticlePositions[i3 + 2] = 0
}

shieldParticleGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(shieldParticlePositions, 3).setUsage(THREE.DynamicDrawUsage),
)

const shieldParticles = new THREE.Points(
  shieldParticleGeometry,
  new THREE.PointsMaterial({
    color: "#6be8ff",
    size: 0.13,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
shieldParticles.position.y = 0
scene.add(shieldParticles)

const hud = {
  state: document.getElementById("hud-state"),
  threat: document.getElementById("hud-threat"),
  model: document.getElementById("hud-model"),
  auto: document.getElementById("hud-auto"),
  action: document.getElementById("hud-action"),
  pps: document.getElementById("hud-pps"),
  syn: document.getElementById("hud-syn"),
  anomaly: document.getElementById("hud-anomaly"),
  confidence: document.getElementById("hud-confidence"),
  scenario: document.getElementById("hud-scenario"),
  connection: document.getElementById("hud-conn"),
  lossRate: document.getElementById("hud-loss-rate"),
  lossTotal: document.getElementById("hud-loss-total"),
  attackTime: document.getElementById("hud-attack-time"),
  honeypotHits: document.getElementById("hud-honeypot-hits"),
  attacksCount: document.getElementById("hud-attacks-count"),
  defenseCount: document.getElementById("hud-defense-count"),
  incidentFeed: document.getElementById("incident-feed"),
  terminal: document.getElementById("terminal-view"),
  tooltip: document.getElementById("star-tooltip"),
  inspectId: document.getElementById("inspect-id"),
  inspectStatus: document.getElementById("inspect-status"),
  inspectThreat: document.getElementById("inspect-threat"),
  inspectProto: document.getElementById("inspect-proto"),
  inspectSrc: document.getElementById("inspect-src"),
  inspectDst: document.getElementById("inspect-dst"),
  inspectRoute: document.getElementById("inspect-route"),
  inspectDetails: document.getElementById("inspect-details"),
  inspectHex: document.getElementById("inspect-hex"),
}

const dzd = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 })
const runtime = {
  state: "normal",
  hostileRatio: 0.03,
  explosionIntensity: 0.03,
  shieldStrength: 0,
  shieldReveal: 0,
  dataAgeMs: 0,
  attackElapsed: 0,
  scenarioRunning: false,
  packetInspect: null,
}

const cameraLookAt = new THREE.Vector3(0, 1.8, 0)
const cameraTargetPosition = new THREE.Vector3()
let shakeTimer = 0
const dynamicColor = new THREE.Color()
const cameraControl = {
  yaw: Math.PI / 2,
  pitch: 0.16,
  radius: 96,
  targetYaw: Math.PI / 2,
  targetPitch: 0.16,
  targetRadius: 96,
  dragging: false,
  lastX: 0,
  lastY: 0,
  idleSeconds: 0,
}
const raycaster = new THREE.Raycaster()
raycaster.params.Points.threshold = 0.45
const pointer = new THREE.Vector2(2, 2)
const mouseScreen = { x: 0, y: 0 }
const terminalLines = []
let lastHoneypotId = ""
let terminalTypingQueue = Promise.resolve()
const panelMenuButton = document.getElementById("panel-menu-btn")
const panelMenu = document.getElementById("panel-menu")
const panelMenuClose = document.getElementById("panel-menu-close")
const panelMenuList = document.getElementById("panel-menu-list")
const focusButton = document.getElementById("panel-focus-btn")
const resetLayoutButton = document.getElementById("panel-reset-btn")
const panelStorageKey = "sentinel_panel_state_v1"
const panels = Array.from(document.querySelectorAll(".hud"))
const panelStates = {}
let focusMode = false
let dragState = null

const fakeIp = (index) => {
  const a = (index % 200) + 10
  const b = ((index * 7) % 200) + 10
  const c = ((index * 13) % 200) + 10
  return `172.${a}.${b}.${c}`
}

const appendTerminalNow = (line) => {
  terminalLines.push(line)
  while (terminalLines.length > 12) {
    terminalLines.shift()
  }
  if (hud.terminal) {
    hud.terminal.textContent = terminalLines.join("\n")
    hud.terminal.scrollTop = hud.terminal.scrollHeight
  }
}

const typeTerminalLine = (line, cps = 95) => {
  terminalTypingQueue = terminalTypingQueue.then(
    () =>
      new Promise((resolve) => {
        let index = 0
        const draftPrefix = ">"
        const step = () => {
          if (!hud.terminal) {
            resolve()
            return
          }
          if (index === 0) {
            appendTerminalNow(draftPrefix)
          }
          if (index < line.length) {
            terminalLines[terminalLines.length - 1] = `${draftPrefix} ${line.slice(0, index + 1)}`
            hud.terminal.textContent = terminalLines.join("\n")
            hud.terminal.scrollTop = hud.terminal.scrollHeight
            index += 1
            setTimeout(step, Math.max(6, 1000 / cps))
          } else {
            terminalLines[terminalLines.length - 1] = line
            hud.terminal.textContent = terminalLines.join("\n")
            hud.terminal.scrollTop = hud.terminal.scrollHeight
            resolve()
          }
        }
        step()
      }),
  )
}

const glitchText = (element, finalText, durationMs = 700) => {
  if (!element) {
    return
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%"
  const start = performance.now()
  const tick = () => {
    const elapsed = performance.now() - start
    if (elapsed >= durationMs) {
      element.textContent = finalText
      return
    }
    const noisy = finalText
      .split("")
      .map((ch, i) => (Math.random() < elapsed / durationMs && i < finalText.length ? ch : chars[Math.floor(Math.random() * chars.length)]))
      .join("")
    element.textContent = noisy
    requestAnimationFrame(tick)
  }
  tick()
}

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const getPanelTitle = (panel, index) => {
  const heading = panel.querySelector("h1, h2")
  return (heading?.textContent || `Panel ${index + 1}`).trim()
}

const persistPanelState = () => {
  localStorage.setItem(panelStorageKey, JSON.stringify(panelStates))
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

renderer.domElement.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return
  }
  cameraControl.dragging = true
  cameraControl.lastX = event.clientX
  cameraControl.lastY = event.clientY
  cameraControl.idleSeconds = 0
  renderer.domElement.style.cursor = "grabbing"
})

window.addEventListener("mouseup", () => {
  cameraControl.dragging = false
  renderer.domElement.style.cursor = "grab"
})

window.addEventListener("mousemove", (event) => {
  if (!cameraControl.dragging) {
    return
  }
  const dx = event.clientX - cameraControl.lastX
  const dy = event.clientY - cameraControl.lastY
  cameraControl.lastX = event.clientX
  cameraControl.lastY = event.clientY
  cameraControl.targetYaw -= dx * 0.005
  cameraControl.targetPitch = clamp(cameraControl.targetPitch - dy * 0.004, -0.25, 0.52)
  cameraControl.idleSeconds = 0
})

renderer.domElement.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault()
    cameraControl.targetRadius = clamp(cameraControl.targetRadius + event.deltaY * 0.06, 48, 155)
    cameraControl.idleSeconds = 0
  },
  { passive: false },
)

renderer.domElement.addEventListener("dblclick", () => {
  cameraControl.targetYaw = Math.PI / 2
  cameraControl.targetPitch = 0.16
  cameraControl.targetRadius = 96
  cameraControl.idleSeconds = 0
})

const applyPanelPosition = (panelId) => {
  const panel = document.querySelector(`.hud[data-panel-id="${panelId}"]`)
  if (!panel) {
    return
  }
  const state = panelStates[panelId]
  if (!state || !state.customPos) {
    panel.style.left = ""
    panel.style.top = ""
    panel.style.right = ""
    panel.style.bottom = ""
    return
  }
  const width = panel.offsetWidth || 360
  const height = panel.offsetHeight || 120
  const x = clamp(state.x, 4, window.innerWidth - width - 4)
  const y = clamp(state.y, 4, window.innerHeight - height - 4)
  state.x = x
  state.y = y
  panel.style.left = `${x}px`
  panel.style.top = `${y}px`
  panel.style.right = "auto"
  panel.style.bottom = "auto"
}

const applyPanelVisibility = (panelId) => {
  const panel = document.querySelector(`.hud[data-panel-id="${panelId}"]`)
  if (!panel) {
    return
  }
  const state = panelStates[panelId]
  panel.style.display = state.hidden ? "none" : ""
  panel.classList.toggle("collapsed", state.collapsed)
  applyPanelPosition(panelId)
}

const renderPanelMenu = () => {
  if (!panelMenuList) {
    return
  }
  panelMenuList.innerHTML = Object.values(panelStates)
    .map(
      (state) => `
      <div class="panel-item">
        <span>${state.title}</span>
        <button data-menu-action="toggle-visibility" data-panel-id="${state.id}">${state.hidden ? "Show" : "Hide"}</button>
        <button data-menu-action="toggle-collapse" data-panel-id="${state.id}">${state.collapsed ? "Expand" : "Minimize"}</button>
      </div>
    `,
    )
    .join("")
}

const toggleFocusMode = () => {
  focusMode = !focusMode
  for (const panel of panels) {
    const id = panel.dataset.panelId
    if (!id) {
      continue
    }
    const keepVisible = panel.classList.contains("top-left") || panel.classList.contains("bottom-right")
    if (focusMode && !keepVisible) {
      panel.style.display = "none"
    } else {
      applyPanelVisibility(id)
    }
  }
  if (focusButton) {
    focusButton.textContent = focusMode ? "Exit Focus Mode" : "Focus Mode"
  }
}

const setupPanels = () => {
  let savedState = {}
  try {
    savedState = JSON.parse(localStorage.getItem(panelStorageKey) || "{}")
  } catch (_error) {
    savedState = {}
  }

  panels.forEach((panel, index) => {
    const title = getPanelTitle(panel, index)
    const panelId = slug(title) || `panel-${index + 1}`
    panel.dataset.panelId = panelId
    const existing = savedState[panelId] || {}
    panelStates[panelId] = {
      id: panelId,
      title,
      hidden: !!existing.hidden,
      collapsed: !!existing.collapsed,
      customPos: !!existing.customPos,
      x: typeof existing.x === "number" ? existing.x : 0,
      y: typeof existing.y === "number" ? existing.y : 0,
    }

    const minimizeButton = document.createElement("button")
    minimizeButton.className = "panel-min-btn"
    minimizeButton.textContent = "-"
    minimizeButton.title = "Minimize panel"
    minimizeButton.addEventListener("click", () => {
      panelStates[panelId].collapsed = !panelStates[panelId].collapsed
      applyPanelVisibility(panelId)
      persistPanelState()
      renderPanelMenu()
    })
    panel.appendChild(minimizeButton)

    const dragGrip = document.createElement("button")
    dragGrip.className = "panel-drag-grip"
    dragGrip.textContent = "::"
    dragGrip.title = "Move panel"
    dragGrip.addEventListener("pointerdown", (event) => {
      event.preventDefault()
      event.stopPropagation()
      const rect = panel.getBoundingClientRect()
      dragState = {
        id: panelId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      }
      panel.classList.add("dragging")
      panel.setPointerCapture?.(event.pointerId)
    })
    panel.appendChild(dragGrip)

    applyPanelVisibility(panelId)
  })

  renderPanelMenu()
}

window.addEventListener("pointermove", (event) => {
  if (!dragState) {
    return
  }
  const panel = document.querySelector(`.hud[data-panel-id="${dragState.id}"]`)
  if (!panel) {
    return
  }
  const state = panelStates[dragState.id]
  if (!state) {
    return
  }
  const width = panel.offsetWidth || 360
  const height = panel.offsetHeight || 120
  state.customPos = true
  state.x = clamp(event.clientX - dragState.offsetX, 4, window.innerWidth - width - 4)
  state.y = clamp(event.clientY - dragState.offsetY, 4, window.innerHeight - height - 4)
  applyPanelPosition(dragState.id)
})

window.addEventListener("pointerup", () => {
  if (!dragState) {
    return
  }
  const panel = document.querySelector(`.hud[data-panel-id="${dragState.id}"]`)
  panel?.classList.remove("dragging")
  persistPanelState()
  dragState = null
})

const setHudConnection = (text, color = "#f2ffff") => {
  hud.connection.textContent = text
  hud.connection.style.color = color
}

const activateTab = (tabName) => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName)
  })
  document.querySelectorAll(".tab-view").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName)
  })
}

for (const tabButton of document.querySelectorAll(".tab-btn")) {
  tabButton.addEventListener("click", () => activateTab(tabButton.dataset.tab))
}

if (panelMenuButton && panelMenu) {
  panelMenuButton.addEventListener("click", () => panelMenu.classList.toggle("open"))
}
if (panelMenuClose && panelMenu) {
  panelMenuClose.addEventListener("click", () => panelMenu.classList.remove("open"))
}
if (focusButton) {
  focusButton.addEventListener("click", () => {
    toggleFocusMode()
    if (panelMenu) {
      panelMenu.classList.remove("open")
    }
  })
}
if (resetLayoutButton) {
  resetLayoutButton.addEventListener("click", () => {
    for (const state of Object.values(panelStates)) {
      state.hidden = false
      state.collapsed = false
      state.customPos = false
      state.x = 0
      state.y = 0
      applyPanelVisibility(state.id)
    }
    focusMode = false
    if (focusButton) {
      focusButton.textContent = "Focus Mode"
    }
    persistPanelState()
    renderPanelMenu()
  })
}
if (panelMenuList) {
  panelMenuList.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) {
      return
    }
    const panelId = target.dataset.panelId
    const action = target.dataset.menuAction
    if (!panelId || !panelStates[panelId]) {
      return
    }
    if (action === "toggle-visibility") {
      panelStates[panelId].hidden = !panelStates[panelId].hidden
    } else if (action === "toggle-collapse") {
      panelStates[panelId].collapsed = !panelStates[panelId].collapsed
    }
    if (!focusMode) {
      applyPanelVisibility(panelId)
    }
    persistPanelState()
    renderPanelMenu()
  })
}

const updateHud = (payload) => {
  hud.state.textContent = String(payload.state || "normal").toUpperCase()
  hud.threat.textContent = payload.threat_type || "Normal Traffic"
  hud.model.textContent = payload.model_ready ? "IsolationForest Ready" : "Warmup Learning"
  hud.auto.textContent = payload.ops?.auto_defense_status || "Monitoring"
  hud.action.textContent = payload.ops?.recommended_action || "No action needed"
  hud.pps.textContent = `${Math.round(payload.packet_rate || 0)}`
  hud.syn.textContent = Number(payload.syn_ratio || 0).toFixed(2)
  hud.anomaly.textContent = Number(payload.anomaly_score || 0).toFixed(3)
  hud.confidence.textContent = Number(payload.confidence || 0).toFixed(2)
  runtime.scenarioRunning = !!payload.scenario?.running
  hud.scenario.textContent = runtime.scenarioRunning ? "Running" : "Idle"
  hud.lossRate.textContent = `${dzd.format(payload.econ?.current_loss_per_sec || 0)} DA`
  hud.lossTotal.textContent = `${dzd.format(payload.econ?.total_loss || 0)} DA`
  hud.attackTime.textContent = `${Math.round(payload.econ?.active_attack_seconds || 0)}s`
  hud.honeypotHits.textContent = `${payload.incident?.honeypot_hits || 0}`
  hud.attacksCount.textContent = `${payload.incident?.total_attacks || 0}`
  hud.defenseCount.textContent = `${payload.incident?.total_defense_actions || 0}`
}

const applyPacketInspect = (inspect) => {
  if (!inspect || !hud.inspectId) {
    return
  }
  runtime.packetInspect = inspect
  hud.inspectId.textContent = inspect.packet_id ?? "-"
  hud.inspectStatus.textContent = inspect.status ?? "Normal"
  hud.inspectThreat.textContent = inspect.threat_type ?? "Normal Traffic"
  hud.inspectProto.textContent = `${inspect.protocol ?? "TCP"} / ${inspect.flags ?? "-"}`
  hud.inspectSrc.textContent = `${inspect.source?.ip ?? "0.0.0.0"}:${inspect.source?.port ?? 0}`
  hud.inspectDst.textContent = `${inspect.destination?.ip ?? "0.0.0.0"}:${inspect.destination?.port ?? 0}`
  hud.inspectDetails.textContent = inspect.technical_details ?? "No details."
  hud.inspectHex.textContent = inspect.payload_sample ?? "n/a"

  const routeTarget = inspect.routed_to ?? "production-core"
  hud.inspectRoute.textContent = `Route: ${routeTarget}`
  const isHoneypot = routeTarget.includes("honeypot")
  hud.inspectRoute.classList.toggle("honeypot", isHoneypot)
  hud.inspectStatus.style.color = isHoneypot
    ? "#ff86b3"
    : inspect.status === "Malicious" || inspect.status === "Blocked" || inspect.status === "Rerouted"
      ? "#ff6a98"
      : "#dffaff"
}

const renderIncidentFeed = (items) => {
  if (!hud.incidentFeed) {
    return
  }
  if (!items || items.length === 0) {
    hud.incidentFeed.innerHTML = `<div class="feed-item">No events yet</div>`
    return
  }
  hud.incidentFeed.innerHTML = items
    .slice(0, 7)
    .map((item) => {
      const label = item.type === "state_transition" ? `${item.from_state} -> ${item.to_state}` : item.message || item.type
      return `<div class="feed-item"><strong>${label}</strong><br/><span>${item.ts}</span></div>`
    })
    .join("")
}

const refreshFeeds = async () => {
  try {
    const [incidentRes, honeypotRes] = await Promise.all([fetch("/api/incidents?limit=7"), fetch("/api/honeypot/events?limit=5")])
    if (incidentRes.ok) {
      const incidentData = await incidentRes.json()
      renderIncidentFeed(incidentData.events)
    }
    if (honeypotRes.ok) {
      const honeypotData = await honeypotRes.json()
      const latest = honeypotData.events?.[0]
      if (latest && latest.id !== lastHoneypotId) {
        lastHoneypotId = latest.id
        typeTerminalLine(`[${latest.ts}] trap hit ${latest.source_ip} -> user:${latest.username}`, 120)
      }
    }
  } catch (_error) {
    // keep UI responsive even if feed fetch fails
  }
}

const recolorNatural = (i3) => {
  colors[i3] = baseColors[i3]
  colors[i3 + 1] = baseColors[i3 + 1]
  colors[i3 + 2] = baseColors[i3 + 2]
}

const triggerSupernova = (ratio, intensity) => {
  const desiredTotal = Math.floor(STAR_COUNT * THREE.MathUtils.clamp(ratio, 0.08, 0.45))
  const additional = Math.max(0, desiredTotal - hostileCount)
  if (additional === 0) {
    return
  }

  let seeded = 0
  let attempts = 0
  const maxAttempts = STAR_COUNT * 5
  while (seeded < additional && attempts < maxAttempts) {
    attempts += 1
    const i = Math.floor(Math.random() * STAR_COUNT)
    if (hostility[i]) {
      continue
    }
    hostility[i] = 1
    hostileCount += 1
    const i3 = i * 3
    const x = positions[i3]
    const y = positions[i3 + 1]
    const z = positions[i3 + 2]
    const len = Math.hypot(x, y, z) || 1
    const nx = x / len
    const ny = y / len
    const nz = z / len
    const burst = 0.8 + Math.random() * 1.2
    velocities[i3] = (nx + (Math.random() - 0.5) * 0.9) * burst * intensity
    velocities[i3 + 1] = (ny + (Math.random() - 0.5) * 0.9) * burst * intensity
    velocities[i3 + 2] = (nz + (Math.random() - 0.5) * 0.9) * burst * intensity
    seeded += 1
  }
}

const switchState = (next) => {
  if (runtime.state === next) {
    return
  }
  const prev = runtime.state
  runtime.state = next
  runtime.attackElapsed = 0
  if (next === "attack") {
    triggerSupernova(runtime.hostileRatio, runtime.explosionIntensity)
    shakeTimer = 2.0
    runtime.shieldReveal = 0
    document.body.classList.add("attack-overdrive")
    glitchText(hud.state, "ATTACK")
    typeTerminalLine(`[${new Date().toISOString()}] ALERT: intrusion burst detected`, 100)
  } else if (next === "defense") {
    document.body.classList.add("attack-overdrive")
    runtime.shieldReveal = 0
    typeTerminalLine(`[${new Date().toISOString()}] DEFENSE: mitigation policy armed`, 100)
    typeTerminalLine(`[${new Date().toISOString()}] rerouting hostile packets to honeypot-decoy`, 100)
  } else if (next === "recovery") {
    document.body.classList.remove("attack-overdrive")
    typeTerminalLine(`[${new Date().toISOString()}] RECOVERY: restoring service integrity`, 100)
  } else {
    document.body.classList.remove("attack-overdrive")
    runtime.shieldReveal = 0
  }

  if (prev !== next && next !== "attack") {
    glitchText(hud.state, String(next).toUpperCase(), 450)
  }
}

const applyPayload = (payload) => {
  runtime.dataAgeMs = 0
  runtime.hostileRatio = payload.galaxy?.hostile_ratio ?? runtime.hostileRatio
  runtime.explosionIntensity = payload.galaxy?.explosion_intensity ?? runtime.explosionIntensity
  runtime.shieldStrength = payload.galaxy?.shield_strength ?? runtime.shieldStrength
  switchState(payload.state || "normal")

  const coreColor = new THREE.Color(payload.galaxy?.core_color || "#2fd5ff")
  aura.material.color.lerp(coreColor, 0.45)
  coreLight.color.lerp(coreColor, 0.35)
  coreShell.material.color.lerp(coreColor, 0.38)
  coreShell.material.emissive.lerp(coreColor, 0.5)
  updateHud(payload)
  if (payload.packet_inspect) {
    applyPacketInspect(payload.packet_inspect)
  }
}

const socketFactory = window.io
if (!socketFactory) {
  setHudConnection("SOCKET LIB ERROR", "#ff6d9e")
} else {
  const socket = socketFactory({ transports: ["polling", "websocket"] })
  socket.on("connect", () => setHudConnection("ONLINE", "#9bffe4"))
  socket.on("disconnect", () => setHudConnection("OFFLINE", "#ff6d9e"))
  socket.on("connect_error", () => setHudConnection("WAITING BACKEND", "#ffcc8f"))
  socket.on("network_data", applyPayload)
  socket.on("packet_inspect", applyPacketInspect)
}

window.addEventListener("mousemove", (event) => {
  const width = window.innerWidth
  const height = window.innerHeight
  pointer.x = (event.clientX / width) * 2 - 1
  pointer.y = -(event.clientY / height) * 2 + 1
  mouseScreen.x = event.clientX
  mouseScreen.y = event.clientY
})

for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", async () => {
    const mode = button.getAttribute("data-mode")
    try {
      await fetch(`/api/simulate/${mode}`, { method: "POST" })
    } catch (_error) {
      setHudConnection("API ERROR", "#ff6d9e")
    }
  })
}

const scenarioButton = document.getElementById("btn-scenario")
if (scenarioButton) {
  scenarioButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/scenario/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attack_seconds: 18,
          defense_seconds: 10,
          recovery_seconds: 8,
          trap_rate_per_sec: 5,
        }),
      })
      if (!response.ok) {
        const detail = await response.text()
        setHudConnection("SCENARIO BUSY", "#ffcc8f")
        typeTerminalLine(`[${new Date().toISOString()}] scenario launch rejected: ${detail}`, 95)
        return
      }
      typeTerminalLine(`[${new Date().toISOString()}] auto attack scenario started`, 95)
    } catch (_error) {
      setHudConnection("SCENARIO ERROR", "#ff6d9e")
    }
  })
}

const honeypotButton = document.getElementById("btn-honeypot")
if (honeypotButton) {
  honeypotButton.addEventListener("click", async () => {
    try {
      const suffix = Math.floor(Math.random() * 900 + 100)
      activateTab("terminal")
      typeTerminalLine(`[${new Date().toISOString()}] init trap session for intruder${suffix}`, 110)
      typeTerminalLine(`[${new Date().toISOString()}] baiting target with fake credentials vault...`, 110)
      await fetch("/trap/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: `intruder${suffix}`, password: "pass1234!" }),
      })
      typeTerminalLine(`[${new Date().toISOString()}] trap locked: session diverted to decoy node`, 110)
      refreshFeeds()
    } catch (_error) {
      setHudConnection("TRAP API ERROR", "#ff6d9e")
    }
  })
}

const reportButton = document.getElementById("btn-report")
if (reportButton) {
  reportButton.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/report/current")
      const data = await res.json()
      const jsPDF = window.jspdf?.jsPDF
      if (!jsPDF) {
        setHudConnection("PDF LIB MISSING", "#ff6d9e")
        return
      }
      const doc = new jsPDF()
      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.text("Sentinel-Econ Cyber Risk Report", 14, 18)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(11)
      let y = 30
      const lines = [
        `Generated UTC: ${data.generated_at_utc}`,
        `State: ${data.state}`,
        `Threat: ${data.threat_type}`,
        `Anomaly Score: ${data.anomaly_score} (confidence ${data.confidence})`,
        `Loss / Sec (DZD): ${data.economic?.current_loss_per_sec ?? 0}`,
        `Total Loss (DZD): ${data.economic?.total_loss ?? 0}`,
        `Attack Duration (sec): ${data.economic?.active_attack_seconds ?? 0}`,
        `Total Attack Events: ${data.incident_summary?.total_attacks ?? 0}`,
        `Defense Actions: ${data.incident_summary?.total_defense_actions ?? 0}`,
        `Honeypot Hits: ${data.incident_summary?.honeypot_hits ?? 0}`,
      ]
      for (const line of lines) {
        doc.text(line, 14, y)
        y += 7
      }
      doc.setFont("helvetica", "bold")
      doc.text("Top Honeypot Sources", 14, y + 4)
      y += 11
      doc.setFont("helvetica", "normal")
      const topSources = data.incident_summary?.top_sources || []
      if (topSources.length === 0) {
        doc.text("No source hits registered yet.", 14, y)
      } else {
        for (const source of topSources.slice(0, 5)) {
          doc.text(`- ${source.source_ip}: ${source.hits} hit(s)`, 14, y)
          y += 6
        }
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-")
      doc.save(`sentinel-econ-report-${stamp}.pdf`)
    } catch (_error) {
      setHudConnection("REPORT ERROR", "#ff6d9e")
    }
  })
}

let idleAttackCooldown = 0
const maybeRunOfflineMotion = (dt) => {
  runtime.dataAgeMs += dt * 1000
  idleAttackCooldown -= dt
  if (runtime.dataAgeMs < 7000) {
    return
  }
  if (idleAttackCooldown <= 0) {
    const phase = runtime.state === "normal" ? "attack" : runtime.state === "attack" ? "defense" : "normal"
    switchState(phase)
    runtime.hostileRatio = phase === "attack" ? 0.18 : 0.06
    runtime.explosionIntensity = phase === "attack" ? 1.15 : 0.25
    runtime.shieldStrength = phase === "defense" ? 0.9 : 0.0
    idleAttackCooldown = 8.5
  }
}

const clock = new THREE.Clock()
const animate = () => {
  requestAnimationFrame(animate)
  const dt = Math.min(0.05, clock.getDelta())
  const elapsed = clock.getElapsedTime()
  runtime.attackElapsed += dt

  maybeRunOfflineMotion(dt)

  particles.rotation.y += dt * 0.042
  accretionRing.rotation.z += dt * 0.55
  accretionRing.rotation.y += dt * 0.08

  const pulse = 1 + Math.sin(elapsed * (runtime.state === "attack" ? 8 : 2.4)) * 0.09
  aura.scale.setScalar(pulse)
  coreShell.scale.setScalar(1 + Math.sin(elapsed * (runtime.state === "attack" ? 7.8 : 2.1)) * 0.04)
  coreShell.rotation.y += dt * 0.28
  core.rotation.y += dt * 0.16

  const shieldTarget = THREE.MathUtils.clamp(runtime.shieldStrength, 0, 1)
  runtime.shieldReveal += (shieldTarget - runtime.shieldReveal) * dt * 3.6
  const shieldPulse = 1 + Math.sin(elapsed * (runtime.state === "defense" ? 9 : 3.2)) * 0.03
  shield.scale.setScalar(0.85 + runtime.shieldReveal * 0.25 * shieldPulse)
  shieldUniforms.uTime.value = elapsed
  shieldUniforms.uStrength.value = runtime.shieldReveal
  shieldUniforms.uReveal.value = 0.72 - runtime.shieldReveal * 0.72
  shieldUniforms.uPulse.value = runtime.state === "defense" ? 1 : runtime.state === "attack" ? 0.4 : 0.12

  cameraControl.idleSeconds += dt
  if (!cameraControl.dragging && cameraControl.idleSeconds > 1.4) {
    cameraControl.targetYaw += dt * (runtime.state === "attack" ? 0.14 : 0.05)
  }
  cameraControl.yaw += (cameraControl.targetYaw - cameraControl.yaw) * dt * 4.8
  cameraControl.pitch += (cameraControl.targetPitch - cameraControl.pitch) * dt * 4.4
  cameraControl.radius += (cameraControl.targetRadius - cameraControl.radius) * dt * 4.1

  const horizontal = Math.cos(cameraControl.pitch) * cameraControl.radius
  cameraTargetPosition.set(
    Math.cos(cameraControl.yaw) * horizontal,
    Math.sin(cameraControl.pitch) * cameraControl.radius + Math.sin(elapsed * 0.2) * 0.7,
    Math.sin(cameraControl.yaw) * horizontal,
  )

  if (shakeTimer > 0) {
    shakeTimer -= dt
    const strength = Math.max(0, shakeTimer / 2) * 0.6
    camera.position.set(
      cameraTargetPosition.x + (Math.random() - 0.5) * strength,
      cameraTargetPosition.y + (Math.random() - 0.5) * strength,
      cameraTargetPosition.z,
    )
  } else {
    camera.position.lerp(cameraTargetPosition, dt * 2.7)
  }
  camera.lookAt(cameraLookAt)

  const rotSpeed = 0.08 * dt
  const cos = Math.cos(rotSpeed)
  const sin = Math.sin(rotSpeed)

  const swirlPhase = runtime.state === "attack" ? 1.9 : runtime.state === "defense" ? 1.4 : 1
  for (let i = 0; i < CORE_SWIRL_COUNT; i += 1) {
    const i3 = i * 3
    swirlAngles[i] += dt * swirlSpeed[i] * swirlPhase
    const radialPulse = 1 + Math.sin(elapsed * 2.4 + i * 0.011) * 0.09
    const radius = swirlRadius[i] * radialPulse
    swirlPositions[i3] = Math.cos(swirlAngles[i]) * radius
    swirlPositions[i3 + 1] = swirlHeight[i] + Math.sin(swirlAngles[i] * 2.2 + elapsed * 2.8) * 0.65
    swirlPositions[i3 + 2] = Math.sin(swirlAngles[i]) * radius
  }
  swirlGeometry.attributes.position.needsUpdate = true

  const shieldSpin = runtime.state === "defense" ? 1.8 : runtime.state === "attack" ? 1.2 : 0.7
  for (let i = 0; i < SHIELD_PARTICLE_COUNT; i += 1) {
    const i3 = i * 3
    shieldParticleAngles[i] += dt * shieldParticleSpeed[i] * shieldSpin
    const polar = shieldParticlePolar[i] * (0.78 + runtime.shieldReveal * 0.28)
    const radius = shieldParticleRadius[i] * runtime.shieldReveal
    const sinPolar = Math.sin(polar)
    const x = Math.cos(shieldParticleAngles[i]) * sinPolar * radius
    const z = Math.sin(shieldParticleAngles[i]) * sinPolar * radius
    const y = Math.cos(polar) * radius + shieldParticleLift[i] + Math.sin(elapsed * 4.3 + i * 0.02) * 0.06
    shieldParticlePositions[i3] = x
    shieldParticlePositions[i3 + 1] = y
    shieldParticlePositions[i3 + 2] = z
  }
  shieldParticleGeometry.attributes.position.needsUpdate = true

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const i3 = i * 3
    let x = positions[i3]
    let y = positions[i3 + 1]
    let z = positions[i3 + 2]
    let vx = velocities[i3]
    let vy = velocities[i3 + 1]
    let vz = velocities[i3 + 2]

    if (hostility[i]) {
      if (runtime.state === "attack") {
        if (runtime.attackElapsed < 1.15) {
          x += vx * dt * 14
          y += vy * dt * 14
          z += vz * dt * 14
          vx *= 0.985
          vy *= 0.985
          vz *= 0.985
        } else {
          const len = Math.hypot(x, y, z) || 1
          const gx = -x / len
          const gy = -y / len
          const gz = -z / len
          vx += gx * dt * 9.5
          vy += gy * dt * 9.5
          vz += gz * dt * 9.5
          x += vx * dt * 11
          y += vy * dt * 11
          z += vz * dt * 11
          if (len < 3.6) {
            vx = -gx * (1.4 + Math.random() * 2.2)
            vy = -gy * (1.4 + Math.random() * 2.2)
            vz = -gz * (1.4 + Math.random() * 2.2)
          }
        }
        const flicker = 0.5 + Math.sin(elapsed * 22 + i * 0.1) * 0.32
        colors[i3] = 1.0
        colors[i3 + 1] = 0.22 + flicker * 0.33
        colors[i3 + 2] = 0.06
      } else if (runtime.state === "defense") {
        const len = Math.hypot(x, y, z) || 1
        if (len < SHIELD_RADIUS + 0.8) {
          const nx = x / len
          const ny = y / len
          const nz = z / len
          const dot = vx * nx + vy * ny + vz * nz
          vx -= 2 * dot * nx
          vy -= 2 * dot * ny
          vz -= 2 * dot * nz
          vx += nx * 1.8
          vy += ny * 1.8
          vz += nz * 1.8
        }
        vx += x * dt * 0.2
        vy += y * dt * 0.2
        vz += z * dt * 0.2
        x += vx * dt * 8.8
        y += vy * dt * 8.8
        z += vz * dt * 8.8
        vx *= 0.96
        vy *= 0.96
        vz *= 0.96
        colors[i3] = 0.96
        colors[i3 + 1] = 0.28
        colors[i3 + 2] = 0.42
      } else {
        x += (basePositions[i3] - x) * dt * 1.35 + vx * dt * 4
        y += (basePositions[i3 + 1] - y) * dt * 1.35 + vy * dt * 4
        z += (basePositions[i3 + 2] - z) * dt * 1.35 + vz * dt * 4
        vx *= 0.9
        vy *= 0.9
        vz *= 0.9
        colors[i3] += (baseColors[i3] - colors[i3]) * dt * 2.4
        colors[i3 + 1] += (baseColors[i3 + 1] - colors[i3 + 1]) * dt * 2.4
        colors[i3 + 2] += (baseColors[i3 + 2] - colors[i3 + 2]) * dt * 2.4

        const backLen =
          Math.abs(basePositions[i3] - x) + Math.abs(basePositions[i3 + 1] - y) + Math.abs(basePositions[i3 + 2] - z)
        if (backLen < 0.25 && Math.abs(vx) + Math.abs(vy) + Math.abs(vz) < 0.08) {
          hostility[i] = 0
          hostileCount = Math.max(0, hostileCount - 1)
          recolorNatural(i3)
        }
      }
    } else {
      const nx = x * cos - z * sin
      const nz = x * sin + z * cos
      x = nx + (basePositions[i3] - nx) * dt * 0.06
      y += (basePositions[i3 + 1] - y) * dt * 0.06
      z = nz + (basePositions[i3 + 2] - nz) * dt * 0.06
    }

    positions[i3] = x
    positions[i3 + 1] = y
    positions[i3 + 2] = z
    velocities[i3] = vx
    velocities[i3 + 1] = vy
    velocities[i3 + 2] = vz
  }

  const attackBlend = runtime.state === "attack" ? 1 : runtime.state === "defense" ? 0.7 : 0
  aura.material.color.lerpColors(CORE_SAFE_COLOR, CORE_ALERT_COLOR, attackBlend)
  coreLight.intensity = 4.2 + attackBlend * 2.4
  dynamicColor.copy(attackBlend > 0.35 ? CORE_ALERT_COLOR : CORE_SAFE_COLOR)
  accretionRing.material.color.lerp(dynamicColor, 0.28)
  accretionRing.material.emissive.lerp(dynamicColor, 0.25)
  accretionRing.material.emissiveIntensity = 0.6 + attackBlend * 0.85 + runtime.shieldReveal * 0.2
  coreShell.material.opacity = 0.2 + attackBlend * 0.18
  coreShell.material.emissiveIntensity = 0.65 + attackBlend * 0.65
  coreSwirl.material.opacity = 0.72 + attackBlend * 0.2
  coreSwirl.material.size = 0.11 + attackBlend * 0.045
  if (runtime.state === "attack") {
    coreSwirl.material.color.lerp(CORE_ALERT_COLOR, 0.26)
  } else if (runtime.state === "defense") {
    coreSwirl.material.color.lerp(CORE_DEFENSE_COLOR, 0.2)
  } else {
    coreSwirl.material.color.lerp(CORE_SAFE_COLOR, 0.16)
  }
  shieldUniforms.uColorA.value.set(runtime.state === "defense" ? "#5cf3ff" : "#4ac8ff")
  shieldUniforms.uColorB.value.set(runtime.state === "defense" ? "#86fff7" : "#6dd8ff")
  shieldParticles.material.opacity = 0.08 + runtime.shieldReveal * 0.88
  shieldParticles.material.size = 0.09 + runtime.shieldReveal * 0.065
  if (runtime.state === "defense") {
    shieldParticles.material.color.lerp(CORE_DEFENSE_COLOR, 0.06)
    accretionRing.material.emissive.lerp(CORE_DEFENSE_COLOR, 0.15)
  } else {
    shieldParticles.material.color.lerp(CORE_SAFE_COLOR, 0.08)
  }

  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObject(particles, false)[0]
  if (hit && hit.index !== undefined && hud.tooltip) {
    const idx = hit.index
    const status = hostility[idx] ? "Hostile Packet" : "Normal Packet"
    hud.tooltip.innerHTML = `IP: <strong>${fakeIp(idx)}</strong><br/>Status: ${status}<br/>Star ID: ${idx}`
    hud.tooltip.style.left = `${mouseScreen.x}px`
    hud.tooltip.style.top = `${mouseScreen.y}px`
    hud.tooltip.classList.add("show")
  } else if (hud.tooltip) {
    hud.tooltip.classList.remove("show")
  }

  geometry.attributes.position.needsUpdate = true
  geometry.attributes.color.needsUpdate = true
  renderer.render(scene, camera)
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  for (const state of Object.values(panelStates)) {
    applyPanelPosition(state.id)
  }
})

setupPanels()
refreshFeeds()
setInterval(refreshFeeds, 4000)
activateTab("logs")
typeTerminalLine(`[${new Date().toISOString()}] honeypot monitor ready`, 120)
typeTerminalLine(`[${new Date().toISOString()}] camera controls: drag to orbit, wheel to zoom, double-click to reset`, 120)

animate()
