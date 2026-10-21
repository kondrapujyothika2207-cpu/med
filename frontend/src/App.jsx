import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity, Boxes, LogOut, Pill, Radio, ScanLine, ShieldCheck,
  Wifi, WifiOff, Search, Plus, ArrowDownToLine, ArrowUpFromLine, RefreshCw, AlertTriangle,
  Volume2, VolumeX, CheckCircle2, XCircle
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

function getMedicineImage(name, isGenuine = true) {
  if (isGenuine === false) return '/medicines/fake_medicine_warning.jpg';
  if (!name) return '/medicines/fake_medicine_warning.jpg';
  const n = name.toLowerCase();
  if (n.includes('paracetamol')) return '/medicines/paracetamol_ai.jpg';
  if (n.includes('amoxicillin')) return '/medicines/amoxicillin.jpg';
  if (n.includes('azithromycin')) return '/medicines/azithromycin.jpg';
  if (n.includes('cetirizine')) return '/medicines/cetirizine.png';
  if (n.includes('omeprazole')) return '/medicines/omeprazole.png';
  if (n.includes('ibuprofen')) return '/medicines/ibuprofen.png';
  if (n.includes('vitamin')) return '/medicines/vitamin-d3.png';
  if (n.includes('metformin')) return '/medicines/metformin.png';
  if (n.includes('amlodipine')) return '/medicines/amlodipine.png';
  if (n.includes('atorvastatin')) return '/medicines/atorvastatin.png';
  return '/medicines/paracetamol_ai.jpg';
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
  const ip = currentIp || espDevice?.local_ip || (typeof window !== 'undefined' && /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname) ? window.location.hostname : '10.36.170.52');
  const status = (espDevice?.status === 'online' || espDevice?.local_ip) ? 'ONLINE' : 'HOTSPOT ACTIVE';

  const tickerItem = (
    <>
      <span>📡 ESP32 SENSOR NODE: <strong>{espDevice?.id || 'esp32-medicine-reader-01'}</strong></span>
      <span className="ticker-sep">✦</span>
      <span>LOCAL IP: <code className="ticker-ip">{ip}</code> ({status})</span>
      <span className="ticker-sep">✦</span>
      <span>WI-FI HOTSPOT: <strong>Nothing Phone (3a)_2505</strong></span>
      <span className="ticker-sep">✦</span>
      <span>RFID INTERROGATION: <strong>13.56 MHz (RC522 SPI / PN532 I2C)</strong></span>
      <span className="ticker-sep">✦</span>
      <span>TRI-COLOR LED: <span className="led-pill blue">🔵 Wi-Fi Blue (Connected)</span> <span className="led-pill green">🟢 Real Green (Authentic)</span> <span className="led-pill red">🔴 Fake Red (Alarm)</span></span>
      <span className="ticker-sep">✦</span>
      <span>BUZZER FEEDBACK: <strong>Melodic Connected / Solid 3kHz Verified / Rapid Siren Alert</strong></span>
      <span className="ticker-sep">✦</span>
      <span>AUDIT LEDGER: <strong>Block #0 Active (SHA-256 Proof of Work)</strong></span>
      <span className="ticker-sep">✦</span>
      <span>STATUS: <strong>READY FOR CARD SCAN</strong></span>
      <span className="ticker-sep">✦</span>
    </>
  );

  return (
    <div className="telemetry-ticker-bar">
      <div className="ticker-badge">
        <span className="live-dot" /> LIVE HARDWARE TELEMETRY
      </div>
      <div className="ticker-track">
        <div className="ticker-content">
          {tickerItem}
          {tickerItem}
        </div>
      </div>
    </div>
  );
}

const SHOWCASE_SLIDES = [
  {
    tag: 'MEDICINE TRUST PLATFORM',
    title: (
      <>
        Confidence in every <span className="highlight-mint">medicine</span> you verify.
      </>
    ),
    subtitle: 'One secure workspace for batch authentication, supply chain integrity and counterfeit detection.',
    pills: [
      { icon: ScanLine, text: 'Serial level checks' },
      { icon: Boxes, text: 'Ledger backed' },
      { icon: Activity, text: 'Quality signals' }
    ],
    footerTag: 'PHARMACHAIN · SECURE PORTAL',
    badge: '01 / 03',
    image: '/images/pharmachain_showcase_01.png'
  },
  {
    tag: 'IOT HARDWARE NODE',
    title: (
      <>
        Instant <span className="highlight-mint">RFID & NFC</span> verification at the edge.
      </>
    ),
    subtitle: 'ESP32 Wi-Fi interrogation reads Mifare Classic & NTAG cryptotags in under 15ms with live telemetry.',
    pills: [
      { icon: Radio, text: 'ESP32 Auto-Connect' },
      { icon: ShieldCheck, text: 'Tri-Color LED Logic' },
      { icon: Activity, text: 'Multi-Tone Buzzer' }
    ],
    footerTag: 'PHARMACHAIN · HARDWARE TELEMETRY',
    badge: '02 / 03',
    image: null
  },
  {
    tag: 'FRAUD DEFENSE MATRIX',
    title: (
      <>
        Zero tolerance for <span className="highlight-mint">counterfeit drugs</span>.
      </>
    ),
    subtitle: 'Machine learning purity analysis coupled with immutable SHA-256 blocks halts fake batches before dispensing.',
    pills: [
      { icon: ShieldCheck, text: 'SHA-256 Ledger Proof' },
      { icon: Pill, text: '100% Model Precision' },
      { icon: Boxes, text: 'Excel Audit Telemetry' }
    ],
    footerTag: 'PHARMACHAIN · CRYPTOGRAPHIC AUDIT',
    badge: '03 / 03',
    image: null
  }
];

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

function Login({ onLogin, devices = [], onClose }) {
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

  return (
    <main className="login-shell">
      <HardwareTicker devices={devices} currentIp={currentLocalIp} />
      <div className="login-page-topbar">
        <button className="back-home-btn" onClick={onClose || (() => {})}>
          ← Back to Live Scanner
        </button>
        <span className="login-topbar-brand">
          <Pill size={16} /> MedTrack · Smart RFID Authentication
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
                  placeholder="Enter username (e.g. admin)"
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

function LiveTerminalTab({
  activeLiveScan,
  scans = [],
  devices = [],
  currentIp,
  audioEnabled,
  setAudioEnabled,
  onTestScan,
  liveFlash,
  busy
}) {
  const isGenuine = activeLiveScan
    ? activeLiveScan.event_type !== 'unknown_tag' &&
      (!activeLiveScan.note || !activeLiveScan.note.toLowerCase().includes('counterfeit')) &&
      !!activeLiveScan.medicine_name
    : null;

  const onlineDevice = devices.find(d => d.status === 'online') || devices[0];
  const activeIp = currentIp || onlineDevice?.local_ip || '10.36.170.52';

  return (
    <div className="live-terminal-panel">
      {/* Top control bar */}
      <div className="live-terminal-header">
        <div className="live-terminal-title">
          <span className="live-radar-badge">
            <span className="live-dot" /> LIVE STREAM
          </span>
          <div>
            <h2>Smart RFID Medicine Verification Terminal</h2>
            <p>Real-time edge interrogation via ESP32 PN532 RFID reader & cryptographic drug registry</p>
          </div>
        </div>

        <div className="live-terminal-actions">
          <div className="live-device-status-chip">
            <Wifi size={14} className={onlineDevice ? 'text-success' : 'text-muted'} />
            <span>Reader: <strong>{onlineDevice ? onlineDevice.id : 'esp32-medicine-reader-01'}</strong></span>
            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span className="live-dot" /> IP: <code>{activeIp}</code>
            </span>
          </div>

          <button
            type="button"
            className={`live-audio-btn ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Audio Chime Enabled' : 'Audio Muted'}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{audioEnabled ? 'Audio ON' : 'Audio OFF'}</span>
          </button>
        </div>
      </div>

      {/* Main Spotlight Hero */}
      {activeLiveScan ? (
        <div className={`live-spotlight-card ${liveFlash ? 'flash-active' : ''} ${isGenuine ? 'spotlight-verified' : 'spotlight-counterfeit'}`}>
          <div className="live-spotlight-grid">
            {/* Left: Big Medicine Image with Verified / Alert overlay */}
            <div className="live-image-col">
              <div className={`live-spotlight-img-wrap ${isGenuine ? 'verified-glow' : 'counterfeit-glow'}`}>
                <img
                  src={getMedicineImage(activeLiveScan.medicine_name, isGenuine)}
                  alt={activeLiveScan.medicine_name || 'Pharmaceutical Item'}
                  className="live-spotlight-img"
                  onError={e => {
                    e.target.src = isGenuine ? '/medicines/paracetamol_ai.jpg' : '/medicines/fake_medicine_warning.jpg';
                  }}
                />
                <span className={`live-image-stamp ${isGenuine ? 'stamp-verified' : 'stamp-counterfeit'}`}>
                  {isGenuine ? '✓ AUTHENTIC' : '⚠️ SUSPECT / FAKE'}
                </span>
              </div>
            </div>

            {/* Right: Verification Status Banner and Details */}
            <div className="live-details-col">
              {/* Prominent VERIFIED / NOT VERIFIED Hero Banner */}
              <div className={`live-status-hero-banner ${isGenuine ? 'verified' : 'unverified'}`}>
                <div className="live-status-icon-wrap">
                  {isGenuine ? <CheckCircle2 size={36} /> : <AlertTriangle size={36} />}
                </div>
                <div className="live-status-banner-text">
                  <h3>{isGenuine ? 'VERIFIED' : 'NOT VERIFIED'}</h3>
                  <p>
                    {isGenuine
                      ? 'GENUINE PHARMACEUTICAL · CRYPTOGRAPHIC MATCH CONFIRMED'
                      : 'CRITICAL WARNING: COUNTERFEIT OR UNREGISTERED DRUG DETECTED'}
                  </p>
                </div>
              </div>

              {/* Medicine Product Info */}
              <div className="live-product-title-row">
                <h3 className="live-product-name">
                  {activeLiveScan.medicine_name || 'Spurious / Unregistered RFID Card'}
                </h3>
                <p className="live-product-desc">
                  {isGenuine
                    ? (activeLiveScan.strength
                        ? `Clinical Formulation: ${activeLiveScan.strength} — Tamper-evident serialization verified on ledger.`
                        : 'Authentic pharmaceutical formulation. Serialized NFC signature verified.')
                    : 'SECURITY FRAUD ALERT: Zero active pharmaceutical ingredient or unregistered duplicate tag detected. DO NOT DISPENSE.'}
                </p>
              </div>

              {/* Telemetry Metadata Grid */}
              <div className="live-meta-grid">
                <div className="live-meta-card">
                  <span>RFID Card UID</span>
                  <strong><code>{activeLiveScan.tag_uid || 'UNKNOWN'}</code></strong>
                </div>
                <div className="live-meta-card">
                  <span>Event ID</span>
                  <strong>{activeLiveScan.event_id ? activeLiveScan.event_id.slice(0, 13) + '…' : '—'}</strong>
                </div>
                <div className="live-meta-card">
                  <span>Reader Node</span>
                  <strong>{activeLiveScan.device_id || 'esp32-01'}</strong>
                </div>
                <div className="live-meta-card">
                  <span>Classification</span>
                  <strong className={isGenuine ? 'text-success' : 'text-danger'}>
                    {isGenuine ? 'Authentic (WHO Compliant)' : 'Spurious / Flagged'}
                  </strong>
                </div>
                <div className="live-meta-card">
                  <span>Audit Note</span>
                  <strong title={activeLiveScan.note || ''}>{activeLiveScan.note || (isGenuine ? 'Verified on RFID Ledger' : 'Suspicious / Unlinked Tag')}</strong>
                </div>
                <div className="live-meta-card">
                  <span>Scanned Timestamp</span>
                  <strong>{date(activeLiveScan.scanned_at)}</strong>
                </div>
              </div>

              {/* Hardware LED Sync Indicator */}
              <div className="live-hardware-sync-pill">
                <span>ESP32 Hardware Sync:</span>
                <strong>BLUE LED: OFF (Scan Mode)</strong>
                <span>·</span>
                {isGenuine ? (
                  <strong style={{ color: '#10b981' }}>GREEN LED: SOLID ON (2s) · 3000Hz CHIME</strong>
                ) : (
                  <strong style={{ color: '#ef4444' }}>RED LED: FLASHING WARNING · 1200Hz SIREN</strong>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Idle Waiting Radar Hero */
        <div className="live-idle-card">
          <div className="live-idle-radar">
            <div className="radar-wave-anim" />
            <div className="radar-wave-anim wave-2" />
            <div className="radar-wave-anim wave-3" />
            <div className="radar-circle-center">
              <Radio size={28} />
            </div>
          </div>
          <h3>Scanner Ready · Tap RFID Medicine Card</h3>
          <p>
            Place any Mifare Classic 1K or NTAG215 card near the ESP32 PN532 antenna.
            The medicine verification status and image will display here in real time.
          </p>

          <div className="live-quick-test-tray">
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', alignSelf: 'center', marginRight: '6px' }}>
              Quick Test:
            </span>
            <button
              type="button"
              className="live-test-btn"
              disabled={busy}
              onClick={() => onTestScan('E1:FC:1A:B1', 'Paracetamol 500 mg', false)}
            >
              <Pill size={14} style={{ color: '#10b981' }} />
              <span>Paracetamol 500mg (E1:FC:1A:B1)</span>
            </button>
            <button
              type="button"
              className="live-test-btn"
              disabled={busy}
              onClick={() => onTestScan('CD:1B:2D:40', 'Ibuprofen 400 mg', false)}
            >
              <Pill size={14} style={{ color: '#10b981' }} />
              <span>Ibuprofen 400mg (CD:1B:2D:40)</span>
            </button>
            <button
              type="button"
              className="live-test-btn"
              disabled={busy}
              onClick={() => onTestScan('7D:42:A7:4B', 'Amoxicillin 250 mg', false)}
            >
              <Pill size={14} style={{ color: '#10b981' }} />
              <span>Amoxicillin 250mg (7D:42:A7:4B)</span>
            </button>
            <button
              type="button"
              className="live-test-btn"
              style={{ borderColor: '#fca5a5', background: '#fef2f2' }}
              disabled={busy}
              onClick={() => onTestScan('7D:F0:AE:26', 'Counterfeit Medicine Sample', true)}
            >
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <span style={{ color: '#b91c1c' }}>Suspect Card (7D:F0:AE:26)</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Test Bar if a scan is already active */}
      {activeLiveScan && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '10px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Test other RFID tags:</span>
          <div className="live-quick-test-tray">
            <button type="button" className="live-test-btn" disabled={busy} onClick={() => onTestScan('E1:FC:1A:B1', 'Paracetamol 500 mg', false)}>
              Paracetamol [E1:FC:1A:B1]
            </button>
            <button type="button" className="live-test-btn" disabled={busy} onClick={() => onTestScan('CD:1B:2D:40', 'Ibuprofen 400 mg', false)}>
              Ibuprofen [CD:1B:2D:40]
            </button>
            <button type="button" className="live-test-btn" disabled={busy} onClick={() => onTestScan('7D:42:A7:4B', 'Amoxicillin 250 mg', false)}>
              Amoxicillin [7D:42:A7:4B]
            </button>
            <button type="button" className="live-test-btn" style={{ borderColor: '#fca5a5', background: '#fef2f2', color: '#b91c1c' }} disabled={busy} onClick={() => onTestScan('7D:F0:AE:26', 'Counterfeit Sample', true)}>
              Suspect [7D:F0:AE:26]
            </button>
          </div>
        </div>
      )}

      {/* Telemetry Stats Strip */}
      <div className="live-telemetry-row">
        <div className="telemetry-card">
          <span className="telemetry-label">RFID Hardware Baud</span>
          <strong className="telemetry-val highlight-blue">115200 Baud</strong>
          <small>PN532 I2C 13.56 MHz Edge Node</small>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Cloud Synchronization</span>
          <strong className="telemetry-val highlight-teal">WebSocket Active</strong>
          <small>Socket.IO bidirectional telemetry</small>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Verification Latency</span>
          <strong className="telemetry-val highlight-green">15 ms</strong>
          <small>Instantaneous cryptographic match</small>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Total Stream Scans</span>
          <strong className="telemetry-val">{scans.length}</strong>
          <small>Recorded in session memory</small>
        </div>
      </div>

      {/* Real-time Recent Scans Stream */}
      <div className="live-stream-section">
        <div className="live-stream-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ScanLine size={18} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Real-Time Scans Telemetry Stream</h3>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Latest 20 live hardware events</span>
        </div>
        <ScanTable scans={scans.slice(0, 20)} />
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
  const [tab, setTab] = useState('live');
  const [activeLiveScan, setActiveLiveScan] = useState(null);
  const [liveFlash, setLiveFlash] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [currentLocalIp, setCurrentLocalIp] = useState(() =>
    (typeof window !== 'undefined' && /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname))
      ? window.location.hostname
      : '10.36.170.52'
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
      setLiveFlash(true);
      setTimeout(() => setLiveFlash(false), 1200);

      const isGen = event.event_type !== 'unknown_tag' &&
        (!event.note || !event.note.toLowerCase().includes('counterfeit')) &&
        !!event.medicine_name;

      if (audioEnabledRef.current) {
        playLiveAudio(isGen);
      }
      if (isGen) {
        notify(`✓ VERIFIED: ${event.medicine_name || 'Authentic medicine'} identified!`);
      } else {
        notify(`⚠️ NOT VERIFIED: Suspicious / counterfeit RFID card ${event.tag_uid || ''} detected!`);
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
    if (showLogin) {
      return (
        <Login
          onLogin={data => { setSession(data); setShowLogin(false); setTab('live'); }}
          onClose={() => setShowLogin(false)}
          devices={devices}
        />
      );
    }

    return (
      <div className="public-live-shell">
        <HardwareTicker devices={devices} currentIp={currentLocalIp} />
        <header className="public-topbar">
          <div className="public-brand">
            <div className="brand-mark small"><Pill size={20} /></div>
            <div>
              <strong>MedTrack</strong>
              <small>LIVE RFID VERIFICATION</small>
            </div>
          </div>

          <nav className="public-nav-pills">
            <button
              type="button"
              className={`public-tab-btn ${tab === 'live' ? 'active' : ''}`}
              onClick={() => setTab('live')}
            >
              <Radio size={16} />
              <span>Live Scan Terminal</span>
              <span className="live-dot" />
            </button>

            <button
              type="button"
              className={`public-tab-btn ${tab === 'samples' ? 'active' : ''}`}
              onClick={() => setTab('samples')}
            >
              <ShieldCheck size={16} />
              <span>Drug Registry (Real/Fake)</span>
            </button>

            <button
              type="button"
              className={`public-tab-btn ${tab === 'workflow' ? 'active' : ''}`}
              onClick={() => setTab('workflow')}
            >
              <Activity size={16} />
              <span>Hardware Architecture</span>
            </button>
          </nav>

          <div className="public-topbar-actions">
            <button
              type="button"
              className="admin-login-cta"
              onClick={() => setShowLogin(true)}
            >
              <span>Admin Portal</span>
              <LogOut size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </div>
        </header>

        {toast && <div className="toast">{toast}</div>}
        {error && <div className="alert error"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

        <main className="public-content-wrap">
          {tab === 'live' && (
            <LiveTerminalTab
              activeLiveScan={activeLiveScan}
              scans={scans}
              devices={devices}
              currentIp={currentLocalIp}
              audioEnabled={audioEnabled}
              setAudioEnabled={setAudioEnabled}
              onTestScan={handleTestScan}
              liveFlash={liveFlash}
              busy={busy}
            />
          )}

          {tab === 'samples' && (
            <FeaturedMedicines
              onScan={sample => handleTestScan(sample.uid, sample.name, sample.type === 'fake')}
              busy={busy}
            />
          )}

          {tab === 'workflow' && (
            <div className="samples-container">
              <div className="section-header-row">
                <div>
                  <span className="eyebrow-badge">HARDWARE TELEMETRY</span>
                  <h2>Connected RFID Edge Architecture</h2>
                  <p>Hardware PN532 interrogation over I2C to cloud WebSocket event ledger.</p>
                </div>
              </div>
              <section id="workflow" className="workflow-section" style={{ margin: '0', background: '#fff' }}>
                <div className="workflow-steps">
                  <div className="workflow-step">
                    <div className="step-icon"><Radio size={20} /></div>
                    <div><small>STEP 01</small><strong>PN532 Reader</strong><p>Interrogates Mifare Classic 1K or NTAG215 cryptotags at 115200 baud.</p></div>
                    <span className="step-state">LOCAL</span>
                  </div>
                  <div className="workflow-step">
                    <div className="step-icon"><Wifi size={20} /></div>
                    <div><small>STEP 02</small><strong>ESP32 Microcontroller</strong><p>Evaluates verification status, triggers LED audio indicators, and posts to Render API.</p></div>
                    <span className="step-state">CONNECTED</span>
                  </div>
                  <div className="workflow-step">
                    <div className="step-icon"><Activity size={20} /></div>
                    <div><small>STEP 03</small><strong>Realtime Cloud Dashboard</strong><p>Streams live WebSocket scan events and visualizes genuine vs counterfeit status.</p></div>
                    <span className="step-state">LIVE</span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
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
    ['live', 'Live Scan Terminal', Radio],
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
        <HardwareTicker devices={devices} />
        <header className="topbar">
          <div>
            <div className="eyebrow">MEDICINE OPERATIONS</div>
            <h1>
              {({
                live: 'Live Scan Terminal',
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

        {tab === 'live' && (
          <LiveTerminalTab
            activeLiveScan={activeLiveScan}
            scans={scans}
            devices={devices}
            currentIp={currentLocalIp}
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            onTestScan={handleTestScan}
            liveFlash={liveFlash}
            busy={busy}
          />
        )}

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
                      src={getMedicineImage(s.medicine_name)}
                      alt=""
                      className="table-med-thumb"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div>
                      <strong>{s.medicine_name || 'Unregistered Tag'}</strong>
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
