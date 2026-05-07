/* ════════════════════════════════════════════════════════════════════════════
   Mars Scene  ·  Three.js r128
   Six particle behaviors matching the Junto emotion-processing choices:
     stable   (F1 接受它)      — lands, gentle pulse, stays forever
     dissolve (F2 放下它)      — lands, fades to nothing over 4 s
     recolor  (F3 重新理解它)  — lands, shifts to lavender, stays
     flyaway  (F4 说出来)      — lands, then shoots into space
     float    (F5 暂时不处理)  — never lands, orbits Mars indefinitely
     root     (F6 转化为行动)  — lands, grows tendrils into surface
════════════════════════════════════════════════════════════════════════════ */

const RECOLOR_TARGET = '#c8b8ff';

const BEHAVIOR_MSG = {
  stable:   '情绪已稳定留存于火星 ✦',
  dissolve: '情绪正在慢慢消散，归于虚空……',
  recolor:  '情绪以新的理解变色留下 ✦',
  flyaway:  '情绪化光飞走，归于星辰 ✦',
  float:    '情绪在火星轨道漂浮，静静守望 ✦',
  root:     '情绪落地生根，扎进火星深处 ✦',
};

const CORE_ZH = {
  FEAR: '恐惧', ANGER: '愤怒', DISGUST: '厌恶',
  SADNESS: '悲伤', SURPRISE: '惊讶', JOY: '喜悦', LOVE: '爱', NEUTRAL: '平静',
};

// Vivid Lusion-style trail palette
const TRAIL_PAL = [
  0xFF2D55, 0xFF6B35, 0xFFD60A, 0x30D158, 0x00C7FF,
  0xBF5AF2, 0xFF375F, 0x34C759, 0x64D2FF, 0xFF9F0A,
  0xAC8FFF, 0xFF6EC7, 0x00FF9F, 0xFFE234,
];

class MarsScene {
  constructor(containerId) {
    this.container      = document.getElementById(containerId);
    this._active        = [];   // {mesh, phase, behavior, core, …}
    this._orbiters      = [];   // {mesh, orbit}
    this._interactable  = [];   // {mesh, core, baseScale, phaseOff}
    this._sprites       = [];   // Lusion-style trail/burst geo particles
    this._hovered       = null;
    this._lastTrailPos  = null;
    this._t             = 0;
    this._lastT         = performance.now();
    this.raf            = null;
  }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  init() {
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;

    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(52, W / H, 0.1, 200);
    this.camera.position.set(0, 0.8, 6.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0x331a0a, 2.0));
    const sun = new THREE.DirectionalLight(0xffccaa, 3.0);
    sun.position.set(8, 4, 6);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x221133, 0.4);
    fill.position.set(-6, -2, -4);
    this.scene.add(fill);

    this._buildMars();
    this._buildAtmo();
    this._buildStars();
    this._buildTooltip();
    this._initSpriteGeos();
    this._setupRaycaster();

    this._onResize = () => {
      const W2 = this.container.clientWidth, H2 = this.container.clientHeight;
      this.camera.aspect = W2 / H2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(W2, H2);
    };
    window.addEventListener('resize', this._onResize);
    this._loop();
  }

  /* ── Tooltip ──────────────────────────────────────────────────────────── */
  _buildTooltip() {
    this.container.style.position = 'relative';
    this._tooltip = document.createElement('div');
    Object.assign(this._tooltip.style, {
      position:       'absolute',
      pointerEvents:  'none',
      display:        'none',
      padding:        '4px 12px',
      borderRadius:   '20px',
      fontSize:       '0.84rem',
      fontWeight:     '500',
      letterSpacing:  '0.06em',
      whiteSpace:     'nowrap',
      background:     'rgba(0,0,0,0.72)',
      border:         '1px solid rgba(255,255,255,0.18)',
      backdropFilter: 'blur(6px)',
      transform:      'translate(-50%, -100%)',
      zIndex:         '10',
    });
    this.container.appendChild(this._tooltip);
  }

  /* ── Lusion sprite geometry cache ─────────────────────────────────────── */
  _initSpriteGeos() {
    // Triangle (equilateral, unit circumradius)
    const triV = new Float32Array([
       0,      0.667,  0,
      -0.577, -0.333,  0,
       0.577, -0.333,  0,
    ]);
    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute('position', new THREE.BufferAttribute(triV, 3));
    triGeo.setIndex([0, 1, 2]);

    // Diamond (rhombus)
    const diaV = new Float32Array([
       0,    1,   0,
      -0.6,  0,   0,
       0,   -1,   0,
       0.6,  0,   0,
    ]);
    const diaGeo = new THREE.BufferGeometry();
    diaGeo.setAttribute('position', new THREE.BufferAttribute(diaV, 3));
    diaGeo.setIndex([0, 1, 2, 0, 2, 3]);

    // Square & pentagon
    const sqrGeo = new THREE.PlaneGeometry(1, 1);
    const penGeo = new THREE.CircleGeometry(0.65, 5);

    const solid = [triGeo, diaGeo, sqrGeo, penGeo];
    const edges = solid.map(g => new THREE.EdgesGeometry(g));
    this._geos  = { solid, edges };
  }

  /* ── Raycaster + mouse trail ──────────────────────────────────────────── */
  _setupRaycaster() {
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2(-10, -10);

    this._onMouseMove = (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

      // Lusion trail: spawn geometric particles along mouse path
      const wp = this._mouseWorld(4.1);
      const dist = this._lastTrailPos ? this._lastTrailPos.distanceTo(wp) : 1;
      if (dist > 0.055) {
        const vel = this._lastTrailPos
          ? wp.clone().sub(this._lastTrailPos).multiplyScalar(18)
          : new THREE.Vector3();
        const count = Math.min(3, 1 + Math.floor(dist / 0.14));
        this._spawnTrail(wp, count, vel);
        this._lastTrailPos = wp.clone();
      }
    };

    this._onMouseLeave = () => {
      this._mouse.set(-10, -10);
      this._lastTrailPos = null;
    };

    this.renderer.domElement.addEventListener('mousemove',  this._onMouseMove);
    this.renderer.domElement.addEventListener('mouseleave', this._onMouseLeave);
  }

  // Returns 3D world point along mouse ray at given camera-distance.
  _mouseWorld(depth) {
    this._raycaster.setFromCamera(this._mouse, this.camera);
    return this._raycaster.ray.origin.clone()
      .addScaledVector(this._raycaster.ray.direction, depth);
  }

  /* ── Sprite factory ───────────────────────────────────────────────────── */
  _makeSpriteMesh(size, wireframe, color) {
    const idx = Math.floor(Math.random() * 4);
    let mesh;
    if (wireframe) {
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 1, depthWrite: false,
      });
      mesh = new THREE.LineSegments(this._geos.edges[idx], mat);
    } else {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1,
        side: THREE.DoubleSide, depthWrite: false,
      });
      mesh = new THREE.Mesh(this._geos.solid[idx], mat);
    }
    // Random initial orientation for 3D tumbling feel
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    mesh.scale.setScalar(size);
    return mesh;
  }

  /* ── Trail particles ──────────────────────────────────────────────────── */
  _spawnTrail(worldPos, count, mouseVel) {
    for (let i = 0; i < count; i++) {
      const color = new THREE.Color(TRAIL_PAL[Math.floor(Math.random() * TRAIL_PAL.length)]);
      const size  = 0.045 + Math.random() * 0.085;
      const wire  = Math.random() < 0.45;
      const mesh  = this._makeSpriteMesh(size, wire, color);

      mesh.position.copy(worldPos);
      mesh.position.x += (Math.random() - 0.5) * 0.18;
      mesh.position.y += (Math.random() - 0.5) * 0.18;
      mesh.position.z += (Math.random() - 0.5) * 0.12;

      // Radial scatter + mouse-direction bias
      const spd   = 1.6 + Math.random() * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const vel   = new THREE.Vector3(
        spd * Math.sin(phi) * Math.cos(theta),
        spd * Math.sin(phi) * Math.sin(theta),
        spd * Math.cos(phi) * 0.22,
      );
      if (mouseVel.length() > 0.01) {
        vel.addScaledVector(mouseVel.clone().normalize(), spd * 0.45);
      }

      const angSpeed = Math.PI * 2 + Math.random() * Math.PI * 7;
      const angAxis  = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
      ).normalize();

      this.scene.add(mesh);
      this._sprites.push({
        mesh, vel, angAxis, angSpeed,
        life: 0, maxLife: 0.72 + Math.random() * 0.52, baseScale: size,
      });
    }

    // Hard cap to keep GPU happy
    while (this._sprites.length > 110) {
      const old = this._sprites.shift();
      this.scene.remove(old.mesh);
      old.mesh.material.dispose();
    }
  }

  /* ── Burst on hover ───────────────────────────────────────────────────── */
  _spawnBurst(position, emotionColor) {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const vivid = new THREE.Color().setHSL(Math.random(), 0.95, 0.62);
      const color = emotionColor.clone().lerp(vivid, 0.38);
      const size  = 0.032 + Math.random() * 0.052;
      const wire  = Math.random() < 0.55;
      const mesh  = this._makeSpriteMesh(size, wire, color);
      mesh.position.copy(position);

      const spd   = 2.8 + Math.random() * 4.2;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const vel   = new THREE.Vector3(
        spd * Math.sin(phi) * Math.cos(theta),
        spd * Math.sin(phi) * Math.sin(theta),
        spd * Math.cos(phi) * 0.5,
      );

      const angSpeed = Math.PI * 5 + Math.random() * Math.PI * 10;
      const angAxis  = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
      ).normalize();

      this.scene.add(mesh);
      this._sprites.push({
        mesh, vel, angAxis, angSpeed,
        life: 0, maxLife: 0.38 + Math.random() * 0.24, baseScale: size,
      });
    }
  }

  /* ── Sprite update ────────────────────────────────────────────────────── */
  _updateSprites(dt) {
    this._sprites = this._sprites.filter(p => {
      p.life += dt / p.maxLife;
      if (p.life >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        return false;
      }

      // Exponential deceleration — feels like light objects losing momentum
      p.vel.multiplyScalar(Math.exp(-3.2 * dt));
      p.mesh.position.addScaledVector(p.vel, dt);

      // Tumble
      p.mesh.rotateOnAxis(p.angAxis, p.angSpeed * dt);

      // Bell-curve scale: spawn small, peak at 30% life, shrink away
      p.mesh.scale.setScalar(p.baseScale * Math.sin(p.life * Math.PI));

      // Hold opacity then fade in last 40%
      p.mesh.material.opacity = p.life < 0.6
        ? 1
        : 1 - (p.life - 0.6) / 0.4;

      return true;
    });
  }

  /* ── Mars ─────────────────────────────────────────────────────────────── */
  _buildMars() {
    const geo = new THREE.SphereGeometry(2, 64, 64);
    const mat = new THREE.MeshPhongMaterial({
      map: this._marsTexture(), specular: new THREE.Color(0x0a0a0a), shininess: 4,
    });
    this.mars = new THREE.Mesh(geo, mat);
    this.scene.add(this.mars);
  }

  _marsTexture() {
    const W = 1024, H = 512;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0.00, '#c1440e'); bg.addColorStop(0.25, '#d46228');
    bg.addColorStop(0.55, '#b53808'); bg.addColorStop(0.80, '#952f06');
    bg.addColorStop(1.00, '#6f2000');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    [ [0.35,0.42,0.13,'rgba(65,18,3,.50)'],  [0.62,0.55,0.10,'rgba(55,15,3,.40)'],
      [0.14,0.60,0.09,'rgba(155,65,18,.38)'],[0.52,0.26,0.15,'rgba(70,22,5,.45)'],
      [0.80,0.34,0.11,'rgba(145,55,12,.32)'],[0.20,0.28,0.12,'rgba(60,18,4,.42)'],
      [0.70,0.70,0.08,'rgba(80,28,6,.35)'],
    ].forEach(([x,y,r,c]) => {
      const g = ctx.createRadialGradient(x*W,y*H,0,x*W,y*H,r*W);
      g.addColorStop(0,c); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    });

    ctx.save();
    ctx.strokeStyle='rgba(50,12,2,.55)'; ctx.lineWidth=14; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(W*.28,H*.46);
    ctx.bezierCurveTo(W*.42,H*.49,W*.57,H*.51,W*.74,H*.46);
    ctx.stroke(); ctx.restore();

    const om = ctx.createRadialGradient(W*.22,H*.38,0,W*.22,H*.38,W*.07);
    om.addColorStop(0,'rgba(210,110,50,.5)'); om.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=om; ctx.fillRect(0,0,W,H);

    const nc = ctx.createRadialGradient(W/2,0,0,W/2,0,H*.17);
    nc.addColorStop(0,'rgba(238,232,222,.90)'); nc.addColorStop(1,'rgba(238,232,222,0)');
    ctx.fillStyle=nc; ctx.fillRect(0,0,W,H*.2);

    const sc = ctx.createRadialGradient(W/2,H,0,W/2,H,H*.09);
    sc.addColorStop(0,'rgba(228,224,215,.75)'); sc.addColorStop(1,'rgba(228,224,215,0)');
    ctx.fillStyle=sc; ctx.fillRect(0,H*.86,W,H*.14);

    return new THREE.CanvasTexture(cv);
  }

  _buildAtmo() {
    const mat = new THREE.MeshPhongMaterial({
      color: 0xd47030, transparent: true, opacity: 0.07,
      side: THREE.FrontSide, depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(2.10,32,32), mat));
  }

  _buildStars() {
    const N=1800, pos=new Float32Array(N*3);
    for (let i=0;i<N;i++){
      const r=70+Math.random()*50, ph=Math.acos(2*Math.random()-1), th=Math.random()*Math.PI*2;
      pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=r*Math.sin(ph)*Math.sin(th); pos[i*3+2]=r*Math.cos(ph);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    this.scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.15,sizeAttenuation:true})));
  }

  /* ── Load historical particles ──────────────────────────────────────────── */
  loadParticles(particles) {
    particles.forEach(({ color, behavior, core }) => {
      if (behavior === 'float') {
        this._spawnOrbiter(color, core || 'NEUTRAL');
      } else {
        this._spawnStatic(color, behavior || 'stable', core || 'NEUTRAL');
      }
    });
  }

  _spawnStatic(hexColor, behavior, core) {
    const pos = this._randSurface(2.06);
    const col = new THREE.Color(hexColor);
    const mat = new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mat);
    mesh.position.set(...pos);
    mesh.scale.setScalar(0.65);
    this.scene.add(mesh);
    if (behavior === 'root') this._growRoots(mesh.position, hexColor);
    this._registerInteractable(mesh, core);
  }

  _spawnOrbiter(hexColor, core) {
    const col = new THREE.Color(hexColor);
    const mat = new THREE.MeshPhongMaterial({
      color: col, emissive: col, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.75,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat);
    this._orbiters.push({ mesh, orbit: this._randOrbit() });
    this.scene.add(mesh);
    this._registerInteractable(mesh, core, 0.7);
  }

  _registerInteractable(mesh, core, baseScale = 0.65) {
    this._interactable.push({
      mesh,
      core:     core || 'NEUTRAL',
      baseScale,
      phaseOff: Math.random() * Math.PI * 2,
    });
  }

  /* ── Launch ─────────────────────────────────────────────────────────────── */
  launch(hexColor, choice, core, count = 7) {
    const CHOICE_MAP = {
      F1:'stable', F2:'dissolve', F3:'recolor',
      F4:'flyaway', F5:'float',   F6:'root',
    };
    const behavior = CHOICE_MAP[choice] || 'stable';
    return { behavior, promise: this._doLaunch(hexColor, behavior, core || 'NEUTRAL', count) };
  }

  _doLaunch(hexColor, behavior, core, count) {
    return new Promise(resolve => {
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const r   = behavior === 'float' ? 2.55 + Math.random() * 0.25 : 2.06;
          const pos = this._randSurface(r);
          const [tx,ty,tz] = pos;

          const col = new THREE.Color(hexColor);
          const mat = new THREE.MeshPhongMaterial({
            color: col, emissive: col, emissiveIntensity: 1.0,
            transparent: behavior === 'dissolve' || behavior === 'float',
            opacity: 1.0,
          });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat);
          const sx=(Math.random()-0.5)*0.7, sy=-4.5-Math.random()*0.8, sz=4.5+Math.random()*0.4;
          mesh.position.set(sx, sy, sz);

          this._active.push({
            mesh, phase:'launch', behavior, hexColor, core,
            sx, sy, sz, tx, ty, tz,
            t:0, speed:0.012+Math.random()*0.007, behT:0,
            flyDir: behavior === 'flyaway'
              ? new THREE.Vector3((Math.random()-0.5)*0.4, 1+Math.random()*0.5, (Math.random()-0.5)*0.4).normalize()
              : null,
          });
          this.scene.add(mesh);

          if (++spawned === count) {
            const flightMs = Math.ceil(1/0.012)*16 + 200;
            const behavMs  = behavior==='dissolve' ? 4500
                           : behavior==='flyaway'  ? 3000
                           : behavior==='recolor'  ? 3000
                           : 1500;
            setTimeout(resolve, flightMs + behavMs);
          }
        }, i * 130);
      }
    });
  }

  /* ── Animation loop ─────────────────────────────────────────────────────── */
  _loop() {
    this.raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt  = Math.min((now - this._lastT) / 1000, 0.05);
    this._lastT = now;
    this._t    += dt;

    if (this.mars) this.mars.rotation.y += 0.0012;

    this._orbiters.forEach(({ mesh, orbit }) => {
      orbit.t += orbit.speed;
      const { r, tilt, yaw, t: phi } = orbit;
      mesh.position.x = r*(Math.cos(phi)*Math.cos(yaw) + Math.sin(phi)*Math.cos(tilt)*Math.sin(yaw));
      mesh.position.y = -r*Math.sin(phi)*Math.sin(tilt);
      mesh.position.z = r*(-Math.cos(phi)*Math.sin(yaw) + Math.sin(phi)*Math.cos(tilt)*Math.cos(yaw));
    });

    this._active = this._active.filter(p =>
      p.phase === 'launch' ? this._updateLaunch(p, dt) : this._updateBehavior(p, dt)
    );

    // Breathing pulse on all persistent emotion particles
    this._interactable.forEach(item => {
      if (item.mesh === this._hovered) return;
      item.mesh.material.emissiveIntensity =
        0.22 + Math.sin(this._t * 1.6 + item.phaseOff) * 0.14;
    });

    // Lusion-style geometric sprites
    this._updateSprites(dt);

    // Hover detection + tooltip
    this._updateHover();

    this.renderer.render(this.scene, this.camera);
  }

  _updateLaunch(p, dt) {
    p.t = Math.min(p.t + p.speed, 1);
    const e = 1 - Math.pow(1 - p.t, 3), ie = 1 - e;
    const mx=(p.sx+p.tx)/2, my=(p.sy+p.ty)/2+2.5, mz=(p.sz+p.tz)/2-1.5;
    p.mesh.position.x = ie*ie*p.sx + 2*ie*e*mx + e*e*p.tx;
    p.mesh.position.y = ie*ie*p.sy + 2*ie*e*my + e*e*p.ty;
    p.mesh.position.z = ie*ie*p.sz + 2*ie*e*mz + e*e*p.tz;
    p.mesh.scale.setScalar(1 - e*0.35);

    if (p.t >= 1) {
      p.mesh.position.set(p.tx, p.ty, p.tz);
      p.mesh.scale.setScalar(0.65);
      p.phase = 'behavior';
      p.behT  = 0;
      this._onLand(p);
      if (p.behavior === 'float') return false;
    }
    return true;
  }

  _onLand(p) {
    const { mesh, behavior, hexColor, core } = p;
    switch (behavior) {
      case 'stable':
        this._registerInteractable(mesh, core); break;
      case 'dissolve':
        mesh.material.transparent = true; mesh.material.opacity = 1; break;
      case 'recolor':
        this._registerInteractable(mesh, core); break;
      case 'flyaway':
        break;
      case 'float':
        mesh.material.opacity = 0.75;
        mesh.scale.setScalar(0.7);
        this._orbiters.push({ mesh, orbit: this._randOrbit() });
        this._registerInteractable(mesh, core, 0.7);
        return;
      case 'root':
        this._growRoots(mesh.position, hexColor);
        this._registerInteractable(mesh, core);
        break;
    }
  }

  _updateBehavior(p, dt) {
    p.behT += dt;
    const { mesh, behavior, behT } = p;
    switch (behavior) {
      case 'stable':
        return true;

      case 'dissolve': {
        const progress = behT / 4.0;
        mesh.material.opacity = Math.max(0, 1 - progress);
        mesh.scale.setScalar(Math.max(0.01, 0.65*(1 - progress*0.6)));
        if (behT > 4.5) { this.scene.remove(mesh); return false; }
        return true;
      }

      case 'recolor': {
        const shiftT = Math.min(behT / 2.0, 1);
        const lerped = new THREE.Color(p.hexColor).lerp(new THREE.Color(RECOLOR_TARGET), shiftT);
        mesh.material.color.set(lerped);
        mesh.material.emissive.set(lerped);
        return true;
      }

      case 'flyaway': {
        if (behT < 0.35) return true;
        const ft = behT - 0.35;
        mesh.position.addScaledVector(p.flyDir, 0.06 + ft*0.12);
        mesh.material.transparent = true;
        mesh.material.opacity = Math.max(0, 1 - ft*0.55);
        mesh.material.emissiveIntensity = Math.max(0, 1.8 - ft*2.5);
        mesh.scale.setScalar(Math.max(0.05, 0.65 + ft*0.4));
        if (ft > 2.5) { this.scene.remove(mesh); return false; }
        return true;
      }

      case 'root':
        return true;

      default:
        return true;
    }
  }

  /* ── Hover / tooltip ────────────────────────────────────────────────────── */
  _updateHover() {
    this._raycaster.setFromCamera(this._mouse, this.camera);
    const hits    = this._raycaster.intersectObjects(this._interactable.map(p => p.mesh));
    const hitMesh = hits.length > 0 ? hits[0].object : null;

    if (hitMesh === this._hovered) {
      if (this._hovered) this._positionTooltip();
      return;
    }

    // Un-hover previous
    if (this._hovered) {
      const prev = this._interactable.find(p => p.mesh === this._hovered);
      if (prev) this._hovered.scale.setScalar(prev.baseScale);
      this._tooltip.style.display = 'none';
    }

    this._hovered = hitMesh;

    if (hitMesh) {
      const item = this._interactable.find(p => p.mesh === hitMesh);
      if (item) {
        hitMesh.scale.setScalar(item.baseScale * 2.4);
        hitMesh.material.emissiveIntensity = 1.5;

        // Burst of geometric fragments
        this._spawnBurst(hitMesh.position, hitMesh.material.color);

        const label = CORE_ZH[item.core] || item.core || '情绪';
        this._tooltip.textContent = label;
        const hex = '#' + hitMesh.material.color.getHexString();
        this._tooltip.style.color       = hex;
        this._tooltip.style.borderColor = hex + '99';
        this._tooltip.style.display     = 'block';
        this._positionTooltip();
      }
    }
  }

  _positionTooltip() {
    const pos = this._hovered.position.clone().project(this.camera);
    const el  = this.renderer.domElement;
    this._tooltip.style.left = ((pos.x *  0.5 + 0.5) * el.clientWidth)  + 'px';
    this._tooltip.style.top  = ((pos.y * -0.5 + 0.5) * el.clientHeight - 10) + 'px';
  }

  /* ── Root tendrils ──────────────────────────────────────────────────────── */
  _growRoots(position, hexColor) {
    const N = position.clone().normalize();
    const up = Math.abs(N.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    const T1 = up.clone().cross(N).normalize();
    const T2 = N.clone().cross(T1).normalize();
    const col  = new THREE.Color(hexColor);
    const mat  = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
    const n    = 4 + Math.floor(Math.random()*3);
    for (let i = 0; i < n; i++) {
      const angle   = (i/n)*Math.PI*2 + (Math.random()-0.5)*0.6;
      const len     = 0.07 + Math.random()*0.06;
      const tangent = T1.clone().multiplyScalar(Math.cos(angle)).addScaledVector(T2, Math.sin(angle));
      const end = position.clone().addScaledVector(tangent, len).addScaledVector(N, -0.018);
      this.scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([position.clone(), end]),
        mat.clone(),
      ));
    }
  }

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  _randSurface(r) {
    const ph=Math.acos(2*Math.random()-1), th=Math.random()*Math.PI*2;
    return [r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th), r*Math.cos(ph)];
  }

  _randOrbit() {
    return {
      r:     2.5 + Math.random()*0.4,
      speed: (0.003 + Math.random()*0.003) * (Math.random()>.5?1:-1),
      tilt:  (Math.random()-0.5)*Math.PI*0.6,
      yaw:   Math.random()*Math.PI*2,
      t:     Math.random()*Math.PI*2,
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer.domElement.removeEventListener('mousemove',  this._onMouseMove);
    this.renderer.domElement.removeEventListener('mouseleave', this._onMouseLeave);
    if (this._tooltip) this._tooltip.remove();
    // Clean up sprite particles
    this._sprites.forEach(p => { this.scene.remove(p.mesh); p.mesh.material.dispose(); });
    this._sprites = [];
    // Dispose cached geometries
    if (this._geos) {
      [...this._geos.solid, ...this._geos.edges].forEach(g => g.dispose());
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
