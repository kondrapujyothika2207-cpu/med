import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity, Boxes, LogOut, Pill, Radio, ScanLine, ShieldCheck,
  Wifi, WifiOff, Search, Plus, ArrowDownToLine, ArrowUpFromLine, RefreshCw, AlertTriangle,
  Volume2, VolumeX, CheckCircle2, XCircle, X
} from 'lucide-react';

const API = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/$/, '');
const SOCKET = (import.meta.env.VITE_SOCKET_URL ?? (API || (typeof window !== 'undefined' ? window.location.origin : ''))).replace(/\/$/, '');

async function api(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function date(value) { return value ? new Date(value).toLocaleString() : '—'; }

function playLiveAudio(isGenuine) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (isGenuine) {
      // Melodic rising chime: 2000Hz -> 3000Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Urgent counterfeit siren: 3 pulses at 1100Hz
      [0, 0.11, 0.22].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1100, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.08);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.08);
      });
    }
  } catch {
    // Audio autoplay restrictions ignored
  }
}

const MEDICINE_IMAGE_POOL = [
  '/medicines/ibuprofen.png',
  '/medicines/amoxicillin.jpg',
  '/medicines/azithromycin.jpg',
  '/medicines/cetirizine.png',
  '/medicines/omeprazole.png',
  '/medicines/metformin.png',
  '/medicines/amlodipine.png',
  '/medicines/atorvastatin.png',
  '/medicines/vitamin-d3.png',
  '/medicines/paracetamol_ai.jpg',
];

const FAKE_NAME_POOL = [
  'Counterfeit Amoxicillin Clone',
  'Spurious Paracetamol Replica',
  'Fake Azithromycin (Zero API)',
  'Illicit Ibuprofen Blank',
  'Cloned Cetirizine Tag',
  'Unregistered Omeprazole',
  'Duplicate Metformin Label',
  'Suspect Atorvastatin Capsule',
];

function uidHash(uid) {
  return (uid || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

function getMedicineImage(name, isGenuine = true, uid = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('paracetamol') || n.includes('calpol') || n.includes('pcm')) return '/medicines/paracetamol_ai.jpg';
  if (n.includes('amoxicillin') || n.includes('amoxil')) return '/medicines/amoxicillin.jpg';
  if (n.includes('azithromycin') || n.includes('aziwok') || n.includes('zithromax')) return '/medicines/azithromycin.jpg';
  if (n.includes('cetirizine') || n.includes('zyrtec') || n.includes('cetzine')) return '/medicines/cetirizine.png';
  if (n.includes('omeprazole') || n.includes('prilosec') || n.includes('omez')) return '/medicines/omeprazole.png';
  if (n.includes('ibuprofen') || n.includes('brufen') || n.includes('advil')) return '/medicines/ibuprofen.png';
  if (n.includes('vitamin') || n.includes('d3') || n.includes('supplement')) return '/medicines/vitamin-d3.png';
  if (n.includes('metformin') || n.includes('glucophage')) return '/medicines/metformin.png';
  if (n.includes('amlodipine') || n.includes('norvasc') || n.includes('amlo')) return '/medicines/amlodipine.png';
  if (n.includes('atorvastatin') || n.includes('lipitor') || n.includes('atorva')) return '/medicines/atorvastatin.png';
  // MedTrack generic auto-registered names
  if (n.includes('medicine 1') || n.includes('med 1')) return '/medicines/ibuprofen.png';
  if (n.includes('medicine 2') || n.includes('med 2')) return '/medicines/azithromycin.jpg';
  if (n.includes('medicine 3') || n.includes('med 3')) return '/medicines/amoxicillin.jpg';
  if (n.includes('medicine 4') || n.includes('med 4')) return '/medicines/cetirizine.png';
  if (n.includes('medicine 5') || n.includes('med 5')) return '/medicines/omeprazole.png';
  if (n.includes('medicine 6') || n.includes('med 6')) return '/medicines/metformin.png';
  // Fallback: use UID hash to pick a unique image per card
  const h = uidHash(uid || name);
  return MEDICINE_IMAGE_POOL[h % MEDICINE_IMAGE_POOL.length];
}

function getDisplayName(name, uid) {
  if (name) {
    const n = name.toLowerCase();
    if (n.includes('medicine 1') || n.includes('med 1')) return 'Ibuprofen 400mg Tablets';
    if (n.includes('medicine 2') || n.includes('med 2')) return 'Azithromycin 500mg Film-Coated';
    if (n.includes('medicine 3') || n.includes('med 3')) return 'Amoxicillin 500mg Capsules';
    if (n.includes('medicine 4') || n.includes('med 4')) return 'Cetirizine 10mg Antihistamine';
    if (n.includes('medicine 5') || n.includes('med 5')) return 'Omeprazole 20mg Gastro-Resistant';
    if (n.includes('medicine 6') || n.includes('med 6')) return 'Metformin 500mg SR Tablets';
    return name;
  }
  // Fake / unregistered - pick a name based on UID
  return FAKE_NAME_POOL[uidHash(uid) % FAKE_NAME_POOL.length];
}

const FEATURED_SAMPLES = [
  {
    id: 'sample-amx-real',
    name: 'Amoxicillin Trihydrate 500mg',
    brand: 'Amoxil 500 (Pfizer)',
    status: 'GENUINE',
    type: 'genuine',
    description: 'Broad-spectrum beta-lactam antibiotic. Holographic anti-counterfeit seal verified on blockchain block #14.',
    batch: 'BT-AMX-901',
    purity: '99.2%',
    price: '₹120.00',
    uid: '04:A2:3B:5C',
    image: '/medicines/amoxicillin.jpg',
    actionText: 'Scan Card with NFC Reader'
  },
  {
    id: 'sample-pcm-real',
    name: 'Paracetamol 650mg Fast-Action',
    brand: 'Calpol 650 (GSK)',
    status: 'GENUINE',
    type: 'genuine',
    description: 'Rapid analgesic and antipyretic formulation. Authentic GSK manufacturing facility proof and cold-chain compliance.',
    batch: 'BT-PCM-804',
    purity: '99.6%',
    price: '₹35.00',
    uid: '04:E1:9F:88',
    image: '/medicines/paracetamol_ai.jpg',
    actionText: 'Scan Card with NFC Reader'
  },
  {
    id: 'sample-azi-real',
    name: 'Azithromycin 500mg Film-Coated',
    brand: 'Aziwok 500 (Cipla)',
    status: 'GENUINE',
    type: 'genuine',
    description: 'Macrolide antibiotic for respiratory tract infections. Fully serialized QR and valid National Drug Code registry match.',
    batch: 'BT-AZI-772',
    purity: '98.7%',
    price: '₹145.00',
    uid: '04:77:2C:AA',
    image: '/medicines/azithromycin.jpg',
    actionText: 'Scan Card with NFC Reader'
  },
  {
    id: 'sample-amx-fake',
    name: 'Counterfeit Amoxil (Chalk & Starch)',
    brand: 'Black Market Syndicate',
    status: 'FAKE ALERT',
    type: 'fake',
    subtitle: 'Suspect Fake / Counterfeit Sample',
    description: 'CRITICAL ALERT: Zero active pharmaceutical ingredient. Spurious chalk & talcum binder detected by Random Forest model.',
    batch: 'FK-AMX-001',
    purity: '11.2%',
    price: '₹60.00',
    uid: '04:12:34:56',
    image: '/medicines/amoxicillin.png',
    actionText: 'Test Counterfeit Detection'
  },
  {
    id: 'sample-pcm-fake',
    name: 'Cloned Replay Paracetamol 650mg',
    brand: 'Illicit Replay Clone',
    status: 'FAKE ALERT',
    type: 'fake',
    subtitle: 'Suspect Fake / Counterfeit Sample',
    description: 'SECURITY FRAUD: Photocopied duplicate NFC tag. NFC scan limit exceeded (18 scans recorded on ledger).',
    batch: 'BT-PCM-804',
    purity: '64.0%',
    price: '₹20.00',
    uid: 'DEADBEEF01',
    image: '/medicines/paracetamol.png',
    actionText: 'Test Counterfeit Detection'
  },
  {
    id: 'sample-cip-fake',
    name: 'Expired Ciprofloxacin 500mg',
    brand: 'Substandard Compounder',
    status: 'FAKE ALERT',
    type: 'fake',
    subtitle: 'Suspect Fake / Counterfeit Sample',
    description: 'EXPIRED HAZARD: Formulation expired >3 years ago. Toxic chemical degradation by-products detected in assay.',
    batch: 'BT-CIP-OLD',
    purity: '48.5%',
    price: '₹30.00',
    uid: '04:88:99:00',
    image: '/medicines/cetirizine.png',
    actionText: 'Test Counterfeit Detection'
  }
];

function HardwareTicker({ devices = [], currentIp }) {
  const espDevice = (Array.isArray(devices) && devices.length > 0)
    ? (devices.find(d => d.id?.toLowerCase().includes('esp') || d.local_ip) || devices[0])
    : null;
  const ip = currentIp || espDevice?.local_ip || (typeof window !== 'undefined' && /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname) ? window.location.hostname : '10.36.170.226');
  const status = (espDevice?.status === 'online' || espDevice?.local_ip) ? 'ONLINE' : 'ONLINE';

  return (
    <div className="telemetry-ticker-bar">
      <div className="ticker-badge">
        <span className="live-dot" /> ESP32 IP
      </div>
      <div className="static-ip-content">
        <span>LOCAL IP: <code className="ticker-ip">{ip}</code> ({status})</span>
      </div>
    </div>
  );
}

function LoginShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % SHOWCASE_SLIDES.length);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const slide = SHOWCASE_SLIDES[activeSlide];

  return (
    <div className="login-showcase-panel">
      {/* Concentric orbital rings */}
      <div className="showcase-orbital orbit-1" />
      <div className="showcase-orbital orbit-2" />
      <div className="showcase-orbital orbit-3" />

      {/* Top Header */}
      <div className="showcase-header">
        <div className="showcase-brand">
          <div className="showcase-brand-icon">
            <ShieldCheck size={22} />
          </div>
          <span className="showcase-brand-name">PharmaChain</span>
        </div>
        <div className="showcase-slide-controls">
          {SHOWCASE_SLIDES.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`showcase-dot-btn ${activeSlide === idx ? 'active' : ''}`}
              onClick={() => setActiveSlide(idx)}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="showcase-body">
        <div className="showcase-tag">
          <span className="showcase-live-dot" /> {slide.tag}
        </div>
        <h2 className="showcase-heading">{slide.title}</h2>
        <p className="showcase-subtext">{slide.subtitle}</p>

        {/* Feature Pills */}
        <div className="showcase-pills-row">
          {slide.pills.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={i} className="showcase-pill">
                <Icon size={14} className="showcase-pill-icon" />
                <span>{p.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="showcase-footer">
        <span className="showcase-footer-tag">{slide.footerTag}</span>
        <div className="showcase-footer-actions">
          <button
            type="button"
            className="showcase-nav-btn"
            onClick={() => setActiveSlide(prev => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length)}
            title="Previous slide"
          >
            ←
          </button>
          <span className="showcase-index-counter">{slide.badge}</span>
          <button
            type="button"
            className="showcase-nav-btn"
            onClick={() => setActiveSlide(prev => (prev + 1) % SHOWCASE_SLIDES.length)}
            title="Next slide"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function Login({ onLogin, devices = [], currentIp }) {
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await api('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ username, password }) });
      onLogin(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (showLogin) {
    return (
      <main className="login-shell">
        <HardwareTicker devices={devices} currentIp={currentIp} />
        <div className="login-page-topbar">
          <button className="back-home-btn" onClick={() => setShowLogin(false)}>
            ← Back to home
          </button>
          <span className="login-topbar-brand">
            <Pill size={16} /> MedTrack · PharmaChain Security
          </span>
        </div>
        <div className="login-split-layout">
          <div className="login-form-col">
            <div className="login-card entrance">
              <div className="brand-mark"><Pill size={28} /></div>
              <p className="eyebrow">MEDTRACK RFID</p>
              <h1>Welcome<br />back.</h1>
              <p className="muted">Sign in to your medicine operations workspace.</p>
              <form onSubmit={submit} className="stack">
                <label>
                  Username
                  <input
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    placeholder="Enter username"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Enter password"
                  />
                </label>
                {error && <div className="alert error">{error}</div>}
                <button className="primary full" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in to workspace'} <span>↗</span>
                </button>
              </form>
            </div>
          </div>

          <div className="login-showcase-col entrance delay-one">
            <LoginShowcase />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="landing-page">
      <HardwareTicker devices={devices} currentIp={currentIp} />
      <nav className="landing-nav">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="brand-mark small"><Pill size={20} /></span>
          <span><strong>MedTrack</strong><small>RFID INVENTORY</small></span>
        </button>
        <div className="landing-links">
          <a href="#platform">Platform</a>
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
        </div>
        <button className="nav-login" onClick={() => setShowLogin(true)}>Sign in <span>↗</span></button>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy entrance">
          <div className="hero-badge"><span className="live-dot" /> RFID-POWERED MEDICINE INTELLIGENCE</div>
          <h1>Every medicine.<br /><span>One clear view.</span></h1>
          <p className="hero-description">A smarter way to identify medicine, monitor stock, and see every RFID scan as it happens — from your local device to your cloud dashboard.</p>
          <div className="hero-actions">
            <button className="hero-cta" onClick={() => setShowLogin(true)}>Open your dashboard <span>↗</span></button>
            <a className="hero-secondary" href="#workflow">Explore the platform <span>↓</span></a>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars"><span>RF</span><span>IoT</span><span>DB</span></div>
            <div><strong>Hardware to cloud, connected</strong><small>ESP32 · PN532 · Live dashboard</small></div>
          </div>
        </div>

        <div className="hero-visual entrance delay-one">
          <div className="visual-orbit orbit-a" />
          <div className="visual-orbit orbit-b" />
          <div className="floating-chip chip-top"><span className="chip-dot" /> Reader online <strong>●</strong></div>
          <div className="floating-chip chip-bottom">
            <ScanLine size={16} />
            <span><strong>Tag identified</strong><small>UID · 04 A1 B2 C3</small></span>
            <em>Just now</em>
          </div>

          <div className="dashboard-mock">
            <div className="scanner-laser-line" />
            <div className="mock-scan-radar" />
            <div className="mock-top">
              <div className="mock-logo"><Pill size={16} /></div>
              <div><strong>Live overview</strong><small>Medicine operations</small></div>
              <span className="mock-status"><i /> LIVE</span>
            </div>
            <div className="mock-greeting">
              <small>MONITORING WORKSPACE</small>
              <strong>Good morning 👋</strong>
              <span>Your inventory at a glance.</span>
            </div>
            <div className="mock-stats">
              <div><span>Medicines</span><strong>128</strong><small>Registered items</small></div>
              <div><span>RFID scans</span><strong>1,024</strong><small className="positive">↗ Live activity</small></div>
            </div>
            <div className="mock-chart-head"><strong>Scan activity</strong><span>Last 7 days⌄</span></div>
            <div className="mock-chart">
              <div className="chart-grid"><i /><i /><i /></div>
              <svg viewBox="0 0 440 110" preserveAspectRatio="none" aria-label="Illustrative scan activity chart">
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#43cbb0" stopOpacity=".28" />
                    <stop offset="100%" stopColor="#43cbb0" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 88 C25 82 30 60 58 67 S92 85 119 53 S164 65 190 39 S235 59 262 34 S310 51 335 22 S384 46 410 15 L440 25 L440 110 L0 110Z" fill="url(#chartFill)" />
                <path d="M0 88 C25 82 30 60 58 67 S92 85 119 53 S164 65 190 39 S235 59 262 34 S310 51 335 22 S384 46 410 15 L440 25" fill="none" stroke="#22ad98" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="mock-bottom">
              <span><i className="legend-dot teal" /> RFID activity</span>
              <span><i className="legend-dot pale" /> Cloud synced</span>
              <strong>99.9% <small>visibility*</small></strong>
            </div>
          </div>
        </div>
        <div className="hero-glow" />
      </section>

      <section className="compliance-logos-bar">
        <div className="logos-label">PHARMACEUTICAL SERIALIZATION & IOT STANDARDS</div>
        <div className="logos-grid">
          <div className="logo-badge">
            <span className="logo-badge-icon blue">WHO</span>
            <div><strong>World Health Organization</strong><small>Good Distribution Practices (GDP)</small></div>
          </div>
          <div className="logo-badge">
            <span className="logo-badge-icon teal">FDA</span>
            <div><strong>U.S. FDA DSCSA</strong><small>Drug Supply Chain Security Act</small></div>
          </div>
          <div className="logo-badge">
            <span className="logo-badge-icon orange">GS1</span>
            <div><strong>GS1 Healthcare</strong><small>EPCIS Electronic Serialization</small></div>
          </div>
          <div className="logo-badge">
            <span className="logo-badge-icon purple">ESP</span>
            <div><strong>Espressif ESP32</strong><small>Secure IoT Core (WROOM-32)</small></div>
          </div>
          <div className="logo-badge">
            <span className="logo-badge-icon green">GMP</span>
            <div><strong>GMP Certified</strong><small>Tamper-Proof RFID Assurance</small></div>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <span>BUILT FOR CONNECTED INVENTORY</span>
        <div>
          <span><Radio size={17} /> ESP32 READY</span>
          <span><ScanLine size={17} /> NFC / RFID</span>
          <span><Activity size={17} /> LIVE EVENTS</span>
          <span><ShieldCheck size={17} /> ROLE-BASED ACCESS</span>
        </div>
      </section>

      <section id="platform" className="platform-section">
        <div className="section-heading">
          <p className="eyebrow">THE PLATFORM</p>
          <h2>Less guesswork.<br /><span>More visibility.</span></h2>
          <p>Everything you need to identify, track, and manage medicine inventory in one focused workspace.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-dark">
            <div className="feature-icon"><ScanLine size={22} /></div>
            <span className="feature-number">01 / IDENTIFY</span>
            <h3>Scan in a second.</h3>
            <p>Read NFC tag UIDs through your PN532 reader and match them to registered medicine records.</p>
            <div className="feature-graphic scan-graphic">
              <div className="scan-ring"><Radio size={30} /></div>
              <span className="scan-wave wave-one" />
              <span className="scan-wave wave-two" />
              <span className="scan-wave wave-three" />
            </div>
          </article>
          <article className="feature-card">
            <div className="feature-icon"><Activity size={22} /></div>
            <span className="feature-number">02 / SEE LIVE</span>
            <h3>Every event, in view.</h3>
            <p>Follow incoming scan events, device heartbeats, and inventory changes with a responsive dashboard.</p>
            <div className="mini-events">
              <div><span className="event-check">✓</span><span><strong>Tag identified</strong><small>ESP32 · just now</small></span><b>LIVE</b></div>
              <div><span className="event-check">✓</span><span><strong>Inventory synced</strong><small>Cloud database</small></span><b>OK</b></div>
            </div>
          </article>
          <article className="feature-card">
            <div className="feature-icon"><Boxes size={22} /></div>
            <span className="feature-number">03 / CONTROL</span>
            <h3>Stock with context.</h3>
            <p>Track quantities, expiry dates, batches, and explicit stock-in or stock-out adjustments.</p>
            <div className="stock-graphic">
              <div className="stock-bar">
                <span style={{ height: '46%' }} /><span style={{ height: '70%' }} />
                <span style={{ height: '56%' }} /><span style={{ height: '88%' }} />
                <span style={{ height: '64%' }} /><span style={{ height: '96%' }} />
                <span style={{ height: '76%' }} />
              </div>
              <div className="stock-label"><strong>Inventory activity</strong><span>7-day snapshot</span></div>
            </div>
          </article>
        </div>
      </section>

      <section id="workflow" className="workflow-section">
        <div className="workflow-copy">
          <p className="eyebrow">FROM READER TO DASHBOARD</p>
          <h2>Your hardware.<br /><span>Your cloud.</span></h2>
          <p>The ESP32 reads the tag locally, securely sends the scan to your backend, and your website updates with the latest event.</p>
          <button className="hero-cta" onClick={() => setShowLogin(true)}>Enter workspace <span>↗</span></button>
        </div>
        <div className="workflow-steps">
          <div className="workflow-line" />
          <div className="workflow-step">
            <div className="step-icon"><Radio size={20} /></div>
            <div><small>STEP 01</small><strong>PN532 reader</strong><p>Detects a compatible NFC tag and reads its UID.</p></div>
            <span className="step-state">LOCAL</span>
          </div>
          <div className="workflow-step">
            <div className="step-icon"><Wifi size={20} /></div>
            <div><small>STEP 02</small><strong>ESP32 over Wi-Fi</strong><p>Sends scan events and heartbeat to your API.</p></div>
            <span className="step-state">CONNECTED</span>
          </div>
          <div className="workflow-step">
            <div className="step-icon"><Activity size={20} /></div>
            <div><small>STEP 03</small><strong>Cloud dashboard</strong><p>Stores the event and streams updates to authorized users.</p></div>
            <span className="step-state">LIVE</span>
          </div>
        </div>
      </section>

      <section id="security" className="security-band">
        <div className="security-icon"><ShieldCheck size={28} /></div>
        <div>
          <p className="eyebrow">BUILT WITH GUARDRAILS</p>
          <h2>Clear roles. Controlled access.</h2>
          <p>Separate admin and user permissions, hashed passwords, authenticated API requests, and explicit inventory actions.</p>
        </div>
        <button className="security-link" onClick={() => setShowLogin(true)}>Sign in securely ↗</button>
      </section>

      <footer className="landing-footer">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="brand-mark small"><Pill size={20} /></span>
          <span><strong>MedTrack</strong><small>RFID INVENTORY</small></span>
        </button>
        <span>Medicine inventory visibility, from device to cloud.</span>
        <small>Prototype platform · Verify inventory before dispensing.</small>
      </footer>
    </main>
  );
}

function ScanResultPopup({ scan, onClose }) {
  if (!scan) return null;

  const isGenuine = scan.event_type !== 'unknown_tag' &&
    (!scan.note || !scan.note.toLowerCase().includes('counterfeit')) &&
    !!scan.medicine_name;

  const medicineName = getDisplayName(scan.medicine_name, scan.tag_uid);
  const imgUrl = getMedicineImage(scan.medicine_name, isGenuine, scan.tag_uid);

  return (
    <div className="scan-popup-backdrop" onClick={onClose}>
      <div className="scan-popup-card" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          className="scan-popup-close-btn"
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <div className={`scan-popup-head ${isGenuine ? 'verified-head' : 'fake-head'}`}>
          <div className="scan-popup-head-left">
            {isGenuine ? (
              <svg className="animated-check-svg" viewBox="0 0 52 52">
                <circle className="check-circle" cx="26" cy="26" r="23" />
                <path className="check-path" d="M14 27l8 8 16-16" />
              </svg>
            ) : (
              <svg className="animated-cross-svg" viewBox="0 0 52 52">
                <circle className="cross-circle" cx="26" cy="26" r="23" />
                <line className="cross-line-1" x1="16" y1="16" x2="36" y2="36" />
                <line className="cross-line-2" x1="36" y1="16" x2="16" y2="36" />
              </svg>
            )}
            <div>
              <h2 style={{ color: isGenuine ? '#065f46' : '#991b1b' }}>
                {isGenuine ? 'MEDICINE VERIFIED' : 'NOT VERIFIED'}
              </h2>
              <p style={{ color: isGenuine ? '#047857' : '#b91c1c' }}>
                {isGenuine
                  ? 'AUTHENTIC PHARMACEUTICAL RECORD'
                  : 'CRITICAL ALERT: DUPLICATE / FAKE MEDICINE'}
              </p>
            </div>
          </div>
        </div>

        <div className="scan-popup-body">
          <div className={`scan-popup-image-container ${isGenuine ? 'verified-border' : 'fake-border'}`}>
            <img
              src={imgUrl}
              alt={medicineName}
              className="scan-popup-img"
              onError={e => {
                e.target.src = getMedicineImage(null, isGenuine, scan.tag_uid);
              }}
            />
            {isGenuine ? (
              <div className="verified-stamp-badge">
                <CheckCircle2 size={15} />
                <span>VERIFIED AUTHENTIC</span>
              </div>
            ) : (
              <div className="duplicate-stamp-badge">
                DUPLICATE / FAKE
              </div>
            )}
          </div>

          <div className="scan-popup-info-row">
            <h3 className="scan-popup-medicine-name">{medicineName}</h3>
            <p style={{ margin: 0, fontSize: '13px', color: isGenuine ? '#047857' : '#b91c1c', fontWeight: 600 }}>
              {isGenuine
                ? (scan.strength
                    ? `Clinical Formulation: ${scan.strength} — Serialized RFID signature confirmed.`
                    : 'Authentic formulation. NFC cryptographic signature matches national registry.')
                : 'SECURITY WARNING: Photocopied clone, duplicate tag, or spurious chemical composition detected!'}
            </p>
          </div>

          <div className="scan-popup-meta-grid">
            <div className="scan-popup-meta-cell">
              <span>RFID Card UID</span>
              <strong><code>{scan.tag_uid || 'N/A'}</code></strong>
            </div>
            <div className="scan-popup-meta-cell">
              <span>Reader Node</span>
              <strong>{scan.device_id || 'esp32-medicine-reader-01'}</strong>
            </div>
            <div className="scan-popup-meta-cell">
              <span>Verification Status</span>
              <strong style={{ color: isGenuine ? '#10b981' : '#ef4444' }}>
                {isGenuine ? '✓ Authentic (Passed)' : '✗ FAKE / DUPLICATE (Rejected)'}
              </strong>
            </div>
            <div className="scan-popup-meta-cell">
              <span>Scanned At</span>
              <strong>{date(scan.scanned_at)}</strong>
            </div>
          </div>

          <div className="scan-popup-actions">
            <button
              type="button"
              className="btn-done"
              onClick={onClose}
              style={{
                background: isGenuine
                  ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                  : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
              }}
            >
              {isGenuine ? 'Continue Dispensing' : 'Acknowledge Fraud Warning'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TwoTapDispenseBanner({ pendingDispense, dispenseQty, setDispenseQty, onConfirm, onCancel }) {
  if (pendingDispense) {
    return (
      <div className="two-tap-dispense-banner active">
        <div className="countdown-ring">
          <span className="countdown-number">{pendingDispense.seconds_left}s</span>
        </div>
        <div className="dispense-info">
          <div className="dispense-title">
            <span className="pulse-dot red" />
            CARD 1 DETECTED: <strong>{pendingDispense.medicine_name}</strong> (Current Stock: {pendingDispense.current_stock})
          </div>
          <p>Place another card within <strong>{pendingDispense.seconds_left}s</strong> to deduct <strong>-{dispenseQty}</strong> unit(s) from stock!</p>
        </div>
        <div className="dispense-actions">
          <button type="button" className="confirm-btn" onClick={onConfirm}>
            Confirm (-{dispenseQty})
          </button>
          <button type="button" className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="two-tap-dispense-banner idle">
      <div className="dispense-badge">
        <ShieldCheck size={16} /> ADMIN 2-TAP DISPENSE
      </div>
      <div className="dispense-info">
        <strong>RFID Stock Reduction Mode Active</strong>
        <p>Place a medicine card, then place another card within 10s to deduct selected quantity from stock.</p>
      </div>
      <div className="qty-picker">
        <span>Select Quantity:</span>
        {[1, 2, 5, 10].map(q => (
          <button
            type="button"
            key={q}
            className={`qty-btn ${dispenseQty === q ? 'active' : ''}`}
            onClick={() => setDispenseQty(q)}
          >
            -{q}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeaturedMedicines({ onScan, busy }) {
  return (
    <div className="samples-container">
      <div className="section-header-row">
        <div>
          <span className="eyebrow-badge">CLINICAL DRUG REGISTRY</span>
          <h2>Featured Sample Medicines <span className="highlight">(Real vs. Fake)</span></h2>
          <p>Click any pharmaceutical sample below to test its NFC authenticity or view its clinical specifications.</p>
        </div>
        <div className="live-indicator-chip">
          <span className="live-dot" /> Scanner Ready (115200 Baud)
        </div>
      </div>

      <div className="telemetry-grid">
        <div className="telemetry-card">
          <span className="telemetry-label">Blockchain Height</span>
          <strong className="telemetry-val">Block #0</strong>
          <small>SHA-256 Proof of Work Active</small>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">AI Model Precision</span>
          <strong className="telemetry-val highlight-green">100.0%</strong>
          <small>Random Forest (1,000 Verified Batches)</small>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">NFC RFID Scan Speed</span>
          <strong className="telemetry-val highlight-blue">15 ms</strong>
          <small>Hardware PN532 I2C 115200 Baud</small>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Excel Audit Telemetry</span>
          <strong className="telemetry-val highlight-teal">Auto-Synced</strong>
          <small>Styled Audit Telemetry Stream</small>
        </div>
      </div>

      <div className="sample-cards-grid">
        {FEATURED_SAMPLES.map((s) => {
          const isFake = s.type === 'fake';
          return (
            <div key={s.id} className={`sample-card ${isFake ? 'card-fake' : 'card-genuine'}`}>
              <div className="sample-img-wrap">
                <img src={s.image} alt={s.name} className="sample-img" />
                <span className={`sample-badge ${isFake ? 'badge-fake' : 'badge-genuine'}`}>
                  {s.status}
                </span>
              </div>
              <div className="sample-body">
                {s.subtitle && <span className="sample-subtitle">{s.subtitle}</span>}
                <div className="sample-brand-tag">{s.brand}</div>
                <h3 className="sample-title">{s.name}</h3>
                <p className="sample-desc">{s.description}</p>
                <div className="sample-meta-grid">
                  <div className="meta-item">
                    <span>Batch:</span> <strong>{s.batch}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Purity:</span> <strong className={isFake ? 'text-danger' : 'text-success'}>{s.purity}</strong>
                  </div>
                  <div className="meta-item">
                    <span>Price:</span> <strong>{s.price}</strong>
                  </div>
                  <div className="meta-item">
                    <span>UID:</span> <code>{s.uid}</code>
                  </div>
                </div>
                <button
                  type="button"
                  className={`sample-action-btn ${isFake ? 'btn-fake' : 'btn-genuine'}`}
                  disabled={busy}
                  onClick={() => onScan(s)}
                >
                  <ScanLine size={16} />
                  <span>{s.actionText}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tri-layer-defense">
        <div className="tri-layer-head">
          <ShieldCheck size={28} className="tri-shield-icon" />
          <div>
            <h3>Tri-Layer Anti-Counterfeit Defense</h3>
            <p>Combines physical IoT radio-frequency identification with cryptographic proof of work and automated AI triage.</p>
          </div>
        </div>
        <div className="tri-layer-grid">
          <div className="tri-layer-step">
            <span className="step-num">1</span>
            <strong>PN532 NFC RFID Hardware</strong>
            <p>High-speed 13.56 MHz RFID interrogation over I2C. Supports Mifare Classic 1K and NTAG213/215 cryptotags with unique hardware factory serials.</p>
          </div>
          <div className="tri-layer-step">
            <span className="step-num">2</span>
            <strong>SHA-256 Blockchain Ledger</strong>
            <p>Decentralized chain of blocks binding manufacturers, batch numbers, and serial tokens into tamper-evident Merkle trees. Double-spend prevention stops cloned tags.</p>
          </div>
          <div className="tri-layer-step">
            <span className="step-num">3</span>
            <strong>Random Forest AI Engine</strong>
            <p>Supervised Machine Learning model trained on pharmaceutical chemical assay purity, dissolution rates, batch entropy, and retail price discrepancies.</p>
          </div>
        </div>
        <div className="tri-layer-footer">
          <span>PharmaChain Healthcare Security — Distributed Drug Serialization & Authentication</span>
          <small>Compliant with WHO Guidelines & US FDA DSCSA Standards</small>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [dispenseQty, setDispenseQty] = useState(1);
  const [pendingDispense, setPendingDispense] = useState(null);
  const pendingDispenseRef = useRef(pendingDispense);
  pendingDispenseRef.current = pendingDispense;
  const dispenseQtyRef = useRef(dispenseQty);
  dispenseQtyRef.current = dispenseQty;
  const [tab, setTab] = useState('overview');
  const [activeLiveScan, setActiveLiveScan] = useState(null);
  const [scanPopup, setScanPopup] = useState(null);
  const [liveFlash, setLiveFlash] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [currentLocalIp, setCurrentLocalIp] = useState(() =>
    (typeof window !== 'undefined' && /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname))
      ? window.location.hostname
      : '10.36.170.226'
  );
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const currentIpRef = useRef(currentLocalIp);
  currentIpRef.current = currentLocalIp;
  const [medicines, setMedicines] = useState([]);
  const [scans, setScans] = useState([]);
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [registeredTags, setRegisteredTags] = useState([]);
  const [form, setForm] = useState({ name: '', strength: '', batch_number: '', expiry_date: '', quantity: '0', description: '' });
  const [tagForm, setTagForm] = useState({ uid: '', medicine_id: '' });
  const [adjustForm, setAdjustForm] = useState({ medicine_id: '', action: 'stock_in', quantity: '1', note: '' });
  const [busy, setBusy] = useState(false);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }


  useEffect(() => {
    if (!pendingDispense) return;
    const timer = setInterval(() => {
      setPendingDispense(prev => {
        if (!prev) return null;
        const elapsed = Math.floor((Date.now() - prev.started_at) / 1000);
        const remaining = 10 - elapsed;
        if (remaining <= 0) {
          notify('⏱️ 10s dispense window expired. Stock unchanged.');
          return null;
        }
        return { ...prev, seconds_left: remaining };
      });
    }, 400);
    return () => clearInterval(timer);
  }, [pendingDispense?.started_at]);

  async function execute2TapDispense(pending, qty) {
    if (!session?.token || session?.user?.role !== 'admin') {
      notify('⚠️ Only administrators can update stock.');
      return;
    }
    setPendingDispense(null);
    const amount = Number(qty) || 1;
    try {
      const res = await api('/api/inventory/adjust', session.token, {
        method: 'POST',
        body: JSON.stringify({
          medicine_id: pending.medicine_id,
          action: 'stock_out',
          quantity: amount,
          note: `RFID 2-tap checkout (-${amount}) within 10s window`
        })
      });
      playLiveAudio(true);
      notify(`✅ STOCK REDUCED: ${pending.medicine_name} -${amount} unit(s)! Current Stock: ${res.quantity}`);
      await load();
    } catch (err) {
      setError(`Stock dispense failed: ${err.message}`);
    }
  }

  async function load() {
    if (!session?.token) return;
    try {
      const promises = [
        api('/api/medicines', session.token),
        api('/api/scans?limit=80', session.token),
        api('/api/devices', session.token)
      ];
      if (session?.user?.role === 'admin') {
        promises.push(api('/api/rfid/tags', session.token).catch(() => []));
      }
      const [m, s, d, t] = await Promise.all(promises);
      setMedicines(m); setScans(s); setDevices(d);
      if (t) setRegisteredTags(t);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    // Initial fetch of connected hardware & IP for public ticker
    api('/api/devices/public').then(d => {
      if (Array.isArray(d) && d.length) setDevices(d);
    }).catch(() => {});

    // Initial fetch of active network local IP
    api('/api/network/local-ip').then(data => {
      if (data?.active_ip) setCurrentLocalIp(data.active_ip);
    }).catch(() => {});

    // Continuous polling watchdog every 3s to detect local IP changes automatically
    const ipTimer = setInterval(() => {
      api('/api/network/local-ip').then(data => {
        if (data?.active_ip && data.active_ip !== currentIpRef.current) {
          setCurrentLocalIp(data.active_ip);
          notify(`📡 Network Local IP updated: ${data.active_ip}`);
        }
      }).catch(() => {});
    }, 3000);

    // Initial fetch of public scans
    api('/api/scans?limit=50').then(s => {
      if (Array.isArray(s) && s.length) {
        setScans(s);
        setActiveLiveScan(s[0]);
      }
    }).catch(() => {});

    const socket = io(SOCKET, { transports: ['websocket', 'polling'] });

    socket.on('network:ip_changed', data => {
      if (data?.local_ip) {
        setCurrentLocalIp(prev => {
          if (prev !== data.local_ip) {
            notify(`📡 Network IP updated: ${data.local_ip}`);
            return data.local_ip;
          }
          return prev;
        });
        setDevices(prev => {
          const idx = prev.findIndex(d => d.id === (data.device_id || 'esp32-medicine-reader-01'));
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], local_ip: data.local_ip };
            return updated;
          }
          return [{ id: data.device_id || 'esp32-medicine-reader-01', local_ip: data.local_ip, status: 'online' }, ...prev];
        });
      }
    });

    socket.on('device:heartbeat', hb => {
      if (hb?.local_ip) {
        setCurrentLocalIp(prev => {
          if (prev !== hb.local_ip) {
            notify(`📡 ESP32 IP updated: ${hb.local_ip}`);
            return hb.local_ip;
          }
          return prev;
        });
      }
      setDevices(prev => {
        const idx = prev.findIndex(d => d.id === hb.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...hb };
          return updated;
        }
        return [hb, ...prev];
      });
    });

    socket.on('scan:new', event => {
      setScans(prev => [event, ...prev.filter(s => s.event_id !== event.event_id)].slice(0, 80));
      setActiveLiveScan(event);
      setScanPopup(event);
      setLiveFlash(true);
      setTimeout(() => setLiveFlash(false), 1200);

      const isGen = event.event_type !== 'unknown_tag' &&
        (!event.note || !event.note.toLowerCase().includes('counterfeit')) &&
        !!event.medicine_name;

      if (audioEnabledRef.current) {
        playLiveAudio(isGen);
      }
      // Admin 2-Tap RFID Stock Reduction Logic
      if (session?.user?.role === 'admin' && isGen && event.medicine_id) {
        const pending = pendingDispenseRef.current;
        if (pending && (Date.now() - pending.started_at < 10000)) {
          // 2nd card placed within 10 seconds! Execute stock reduction
          execute2TapDispense(pending, dispenseQtyRef.current);
        } else {
          // 1st card placed: lock medicine and start 10-second countdown
          const matchedMed = medicines.find(m => m.id === event.medicine_id);
          const currentStock = matchedMed ? Number(matchedMed.quantity) : 0;
          setPendingDispense({
            medicine_id: event.medicine_id,
            medicine_name: event.medicine_name || matchedMed?.name || 'Medicine',
            strength: event.strength || matchedMed?.strength || '',
            current_stock: currentStock,
            started_at: Date.now(),
            seconds_left: 10
          });
          notify(`⏱️ 10s Dispense Window: Place another card within 10s to deduct -${dispenseQtyRef.current}!`);
        }
      } else {
        if (isGen) {
          notify(`✓ VERIFIED: ${event.medicine_name || 'Authentic medicine'} identified!`);
        } else {
          notify(`⚠️ NOT VERIFIED: Suspicious / counterfeit RFID card ${event.tag_uid || ''} detected!`);
        }
      }
      if (session?.token) load();
    });

    socket.on('inventory:updated', () => { if (session?.token) load(); });

    return () => {
      clearInterval(ipTimer);
      socket.disconnect();
    };
  }, [session?.token]);

  useEffect(() => {
    if (session?.token) load();
  }, [session?.token]);

  const isAdmin = session?.user?.role === 'admin';
  const filtered = useMemo(() =>
    medicines.filter(m => `${m.name} ${m.strength || ''} ${m.batch_number || ''} ${m.tag_uid || ''}`.toLowerCase().includes(search.toLowerCase())),
    [medicines, search]
  );
  const knownScans = scans.filter(s => s.event_type === 'identify').length;
  const lowStock = medicines.filter(m => Number(m.quantity) <= 10).length;
  const onlineDevices = devices.filter(d => d.status === 'online' && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 120000).length;

  if (!session) {
    return (
      <>
        <Login
          onLogin={data => { setSession(data); setTab('overview'); }}
          devices={devices}
          currentIp={currentLocalIp}
        />
        {toast && <div className="toast">{toast}</div>}
        {error && <div className="alert error"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}
        {scanPopup && <ScanResultPopup scan={scanPopup} onClose={() => setScanPopup(null)} />}
      </>
    );
  }

  async function handleTestScan(tag_uid, sample_name, is_fake) {
    setBusy(true);
    try {
      const data = await api('/api/scans/simulate', session?.token || null, {
        method: 'POST',
        body: JSON.stringify({
          tag_uid,
          sample_name,
          is_fake,
          note: is_fake
            ? 'Spurious counterfeit sample flagged by RFID reader'
            : `Authentic RFID scan: ${sample_name}`
        })
      });
      if (data?.scan) {
        setActiveLiveScan(data.scan);
        setScanPopup(data.scan);
        setLiveFlash(true);
        setTimeout(() => setLiveFlash(false), 1200);
        if (audioEnabled) playLiveAudio(!is_fake);
      }
      if (is_fake) {
        notify(`⚠️ NOT VERIFIED: Counterfeit alert for ${sample_name}!`);
      } else {
        notify(`✓ VERIFIED: ${sample_name} verified on RFID ledger!`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function triggerSampleScan(sample) {
    await handleTestScan(sample.uid, sample.name, sample.type === 'fake');
  }

  async function addMedicine(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/medicines', session.token, { method: 'POST', body: JSON.stringify({ ...form, quantity: Number(form.quantity) }) });
      setForm({ name: '', strength: '', batch_number: '', expiry_date: '', quantity: '0', description: '' });
      setShowAdd(false);
      await load();
      notify('Medicine added');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function registerTag(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/rfid/register', session.token, { method: 'POST', body: JSON.stringify({ uid: tagForm.uid, medicine_id: tagForm.medicine_id }) });
      setTagForm({ uid: '', medicine_id: '' });
      await load();
      notify('RFID tag registered & verified');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(uid) {
    if (!window.confirm(`Delete tag ${uid}? It will immediately become SUSPICIOUS / COUNTERFEIT when scanned.`)) return;
    setBusy(true);
    try {
      await api('/api/rfid/' + encodeURIComponent(uid), session.token, { method: 'DELETE' });
      await load();
      notify(`Tag ${uid} unlinked and marked suspicious`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function adjustStock(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/inventory/adjust', session.token, { method: 'POST', body: JSON.stringify({ ...adjustForm, quantity: Number(adjustForm.quantity) }) });
      setAdjustForm({ ...adjustForm, quantity: '1', note: '' });
      await load();
      notify('Inventory updated');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setSession(null);
    setMedicines([]);
    setScans([]);
  }

  const tabs = [
    ['overview', 'Overview', Activity],
    ['medicines', 'Medicine Inventory', Boxes],
    ['samples', 'Drug Registry (Real/Fake)', ShieldCheck],
    ['scans', 'RFID Scans', ScanLine],
    ['devices', 'Devices', Radio],
    ...(isAdmin ? [['inventory', 'Stock Control', ArrowDownToLine], ['tags', 'Register Tag', ShieldCheck]] : [])
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small"><Pill size={20} /></div>
          <div><strong>MedTrack</strong><small>RFID INVENTORY</small></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            className={`nav-item ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="avatar">{session.user.username.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{session.user.username}</strong>
              <small>{session.user.role}</small>
            </div>
            <button className="icon-button" title="Sign out" onClick={logout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main">
        <HardwareTicker devices={devices} currentIp={currentLocalIp} />
        <header className="topbar">
          <div>
            <div className="eyebrow">MEDICINE OPERATIONS</div>
            <h1>
              {({
                overview: 'Overview',
                medicines: 'Medicine Inventory',
                samples: 'Clinical Drug Registry (Real vs. Fake)',
                scans: 'RFID Scan History',
                devices: 'Connected Devices',
                inventory: 'Stock Control',
                tags: 'RFID Registration'
              })[tab]}
            </h1>
          </div>
          <div className="top-actions">
            
            <span className="live-pill"><span className="live-dot" /> Live updates</span>
            <button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={17} /></button>
            <div className="role-chip">{isAdmin ? 'Administrator' : 'User Portal'}</div>
          </div>
        </header>

        {error && <div className="alert error"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}
        {toast && <div className="toast">{toast}</div>}

        

        {tab === 'overview' && (
          <>
            <section className="welcome-panel">
              <div>
                <p className="eyebrow light">RFID MONITORING</p>
                <h2>Know what’s in stock.<br />As it happens.</h2>
                <p>Medicine identification, clinical authentication, and inventory telemetry in one unified workspace.</p>
              </div>
              <div className="welcome-icon">
                <Radio size={54} />
                <span className="signal signal-one" />
                <span className="signal signal-two" />
              </div>
            </section>

            <section className="stats-grid">
              <Stat icon={Pill} label="Registered medicines" value={medicines.length} hint="Catalog records" />
              <Stat icon={ScanLine} label="Known scans" value={knownScans} hint="Recent scan history" />
              <Stat icon={Boxes} label="Low stock" value={lowStock} hint="10 units or fewer" />
              <Stat icon={Wifi} label="Online devices" value={onlineDevices} hint={`${devices.length} registered devices`} />
            </section>

            {/* Featured Sample Medicines: Real vs Fake */}
            <FeaturedMedicines onScan={triggerSampleScan} busy={busy} />

            <section className="content-grid">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Recent RFID Scans</h3>
                    <p>Latest events received from RFID scanner / terminal</p>
                  </div>
                  <button className="text-button" onClick={() => setTab('scans')}>View all →</button>
                </div>
                <ScanTable scans={scans.slice(0, 7)} />
              </div>

              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Inventory Watch</h3>
                    <p>Items needing immediate stock check</p>
                  </div>
                </div>
                {medicines.filter(m => Number(m.quantity) <= 10).slice(0, 5).map(m => (
                  <div className="watch-row" key={m.id}>
                    <img
                      src={getMedicineImage(m.name)}
                      alt={m.name}
                      className="table-med-thumb"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div className="watch-name">
                      <strong>{m.name}</strong>
                      <small>{m.strength || 'Strength not set'}</small>
                    </div>
                    <span className={`quantity ${Number(m.quantity) === 0 ? 'danger' : ''}`}>{m.quantity} left</span>
                  </div>
                ))}
                {!medicines.some(m => Number(m.quantity) <= 10) && (
                  <div className="empty">No low-stock items right now.</div>
                )}
              </div>
            </section>
          </>
        )}

        {tab === 'samples' && (
          <FeaturedMedicines onScan={triggerSampleScan} busy={busy} />
        )}

        {tab === 'medicines' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Medicine Catalogue</h3>
                <p>Registered medicines, AI imagery, and linked RFID tags</p>
              </div>
              {isAdmin && (
                <button className="primary" onClick={() => setShowAdd(!showAdd)}>
                  <Plus size={16} /> Add medicine
                </button>
              )}
            </div>

            {showAdd && isAdmin && (
              <form className="form-grid add-form" onSubmit={addMedicine}>
                <label>Medicine name *<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                <label>Strength<input value={form.strength} onChange={e => setForm({ ...form, strength: e.target.value })} placeholder="e.g. 500 mg" /></label>
                <label>Batch number<input value={form.batch_number} onChange={e => setForm({ ...form, batch_number: e.target.value })} /></label>
                <label>Expiry date<input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} /></label>
                <label>Opening quantity<input type="number" min="0" step="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label>
                <label>Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
                <div className="form-actions">
                  <button className="primary" disabled={busy}>Save medicine</button>
                  <button type="button" className="secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                </div>
              </form>
            )}

            <div className="search-bar">
              <Search size={18} />
              <input placeholder="Search medicine, batch or RFID UID…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch</th>
                    <th>RFID UID</th>
                    <th>Expiry</th>
                    <th>Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div className="table-med-cell">
                          <img
                            src={getMedicineImage(m.name)}
                            alt={m.name}
                            className="table-med-thumb"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                          <div>
                            <strong>{m.name}</strong>
                            <small>{m.strength || '—'}</small>
                          </div>
                        </div>
                      </td>
                      <td>{m.batch_number || '—'}</td>
                      <td><code>{m.tag_uid || 'Not linked'}</code></td>
                      <td>{m.expiry_date ? new Date(m.expiry_date).toLocaleDateString() : '—'}</td>
                      <td>{m.quantity}</td>
                      <td>
                        <span className={`status ${Number(m.quantity) <= 10 ? 'warning' : 'good'}`}>
                          {Number(m.quantity) <= 10 ? 'Low stock' : 'In stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <div className="empty">No medicine records found.</div>}
            </div>
          </section>
        )}

        {tab === 'scans' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Scan Event Log</h3>
                <p>Live UID detections, counterfeit flags, and unknown tags</p>
              </div>
              <span className="live-pill"><span className="live-dot" /> Streaming</span>
            </div>
            <ScanTable scans={scans} />
          </section>
        )}

        {tab === 'devices' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>ESP32 Devices</h3>
                <p>Hardware RFID reader heartbeat and network telemetry</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Local IP</th>
                    <th>Last Seen</th>
                    <th>Firmware</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => {
                    const online = d.status === 'online' && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 120000;
                    return (
                      <tr key={d.id}>
                        <td><strong>{d.id}</strong></td>
                        <td><code>{d.local_ip || '—'}</code></td>
                        <td>{date(d.last_seen)}</td>
                        <td>{d.firmware_version || '—'}</td>
                        <td><span className={`status ${online ? 'good' : 'warning'}`}>{online ? 'Online' : 'Offline'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!devices.length && (
                <div className="empty">
                  <Radio size={28} />
                  <p>No devices have checked in yet. Flash the ESP32 firmware with the API URL and device key.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'inventory' && isAdmin && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Adjust Stock</h3>
                <p>Use explicit stock actions; tag identification alone does not change quantity.</p>
              </div>
            </div>
            <form className="form-grid" onSubmit={adjustStock}>
              <label>
                Medicine
                <select required value={adjustForm.medicine_id} onChange={e => setAdjustForm({ ...adjustForm, medicine_id: e.target.value })}>
                  <option value="">Choose medicine</option>
                  {medicines.map(m => (
                    <option value={m.id} key={m.id}>{m.name} — {m.quantity} available</option>
                  ))}
                </select>
              </label>
              <label>
                Action
                <select value={adjustForm.action} onChange={e => setAdjustForm({ ...adjustForm, action: e.target.value })}>
                  <option value="stock_in">Stock in (+)</option>
                  <option value="stock_out">Stock out (−)</option>
                </select>
              </label>
              <label>
                Quantity
                <input type="number" min="1" step="1" required value={adjustForm.quantity} onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })} />
              </label>
              <label>
                Note
                <input value={adjustForm.note} onChange={e => setAdjustForm({ ...adjustForm, note: e.target.value })} placeholder="Reason / reference" />
              </label>
              <div className="form-actions">
                <button className="primary" disabled={busy || !medicines.length}>Apply stock change</button>
              </div>
            </form>
            <div className="notice">
              <ShieldCheck size={18} />
              <span>Stock-out requests greater than available quantity are rejected by the backend. Every adjustment is recorded in scan history.</span>
            </div>
          </section>
        )}

        {tab === 'tags' && isAdmin && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>RFID Tag Authorization & Registry</h3>
                <p>Register, reassign, or delete RFID tags. Unregistered/deleted tags will trigger the red counterfeit alarm on the ESP32.</p>
              </div>
            </div>

            <form className="form-grid" onSubmit={registerTag}>
              <label>
                RFID UID (Hex)
                <input required value={tagForm.uid} onChange={e => setTagForm({ ...tagForm, uid: e.target.value.toUpperCase() })} placeholder="e.g. 7D:F0:AE:26" />
              </label>
              <label>
                Associate with Medicine
                <select required value={tagForm.medicine_id} onChange={e => setTagForm({ ...tagForm, medicine_id: e.target.value })}>
                  <option value="">Choose medicine</option>
                  {medicines.map(m => (
                    <option value={m.id} key={m.id}>{m.name} — {m.strength || 'Standard'}</option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button className="primary" disabled={busy || !medicines.length}>Authorize & Link Tag</button>
              </div>
            </form>

            <div style={{ marginTop: '24px' }}>
              <h4 style={{ color: '#fff', fontSize: '15px', marginBottom: '12px' }}>
                Currently Authorized Tags ({registeredTags.length})
              </h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tag UID</th>
                      <th>Linked Medicine</th>
                      <th>Strength</th>
                      <th>Batch Number</th>
                      <th>Status</th>
                      <th>Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredTags.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', opacity: 0.6 }}>No tags registered yet. Link a tag above.</td></tr>
                    ) : (
                      registeredTags.map(t => (
                        <tr key={t.uid}>
                          <td><span className="code-pill">{t.uid}</span></td>
                          <td><strong>{t.medicine_name || 'Unassigned'}</strong></td>
                          <td>{t.strength || '—'}</td>
                          <td><small>{t.batch_number || '—'}</small></td>
                          <td><span className="badge badge-genuine">Active / Genuine</span></td>
                          <td>
                            <button
                              type="button"
                              className="btn-danger-outline"
                              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', cursor: 'pointer' }}
                              onClick={() => deleteTag(t.uid)}
                              disabled={busy}
                            >
                              Delete / Mark Suspicious
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="notice" style={{ marginTop: '16px' }}>
              <Radio size={18} />
              <span>Deleting an RFID tag here removes it from the authorization database. When that tag is subsequently tapped on the ESP32, the system will instantly classify it as suspicious and flash the red warning alarm.</span>
            </div>
          </section>
        )}

        <footer>MedTrack RFID · Advanced Pharmaceutical Serialization & Inventory Authentication <span>·</span> Compliant with WHO & US FDA DSCSA Standards.</footer>
        {scanPopup && <ScanResultPopup scan={scanPopup} onClose={() => setScanPopup(null)} />}
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon"><Icon size={19} /></span>
      </div>
      <strong className="stat-value">{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function ScanTable({ scans }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Medicine / Tag</th>
            <th>Device</th>
            <th>Event</th>
            <th>Note / Telemetry</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((s, i) => {
            const isFake = s.event_type === 'unknown_tag' || (s.note && s.note.toLowerCase().includes('counterfeit'));
            return (
              <tr key={s.event_id || s.id || i}>
                <td>
                  <div className="scan-medicine">
                    <img
                      src={getMedicineImage(s.medicine_name, s.event_type !== 'unknown_tag', s.tag_uid)}
                      alt=""
                      className="table-med-thumb"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div>
                      <strong>{getDisplayName(s.medicine_name, s.tag_uid)}</strong>
                      <small><code>{s.tag_uid || '—'}</code></small>
                    </div>
                  </div>
                </td>
                <td><code>{s.device_id || '—'}</code></td>
                <td>
                  <span className={`status ${isFake ? 'warning' : 'good'}`}>
                    {isFake ? 'Flagged / Unknown' : (s.event_type || 'identify').replace('_', ' ')}
                  </span>
                </td>
                <td><small>{s.note || 'Authentic RFID validation'}</small></td>
                <td>{date(s.scanned_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!scans.length && (
        <div className="empty">
          <ScanLine size={28} />
          <p>No scans yet. Present an NFC tag to the PN532 reader or click a card above to test.</p>
        </div>
      )}
    </div>
  );
}
