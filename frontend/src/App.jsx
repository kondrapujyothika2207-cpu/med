import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { Activity, Boxes, LogOut, Pill, Radio, ScanLine, ShieldCheck, Users, Wifi, WifiOff, Search, Plus, ArrowDownToLine, ArrowUpFromLine, RefreshCw } from 'lucide-react';

const API = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/$/, '');
const SOCKET = (import.meta.env.VITE_SOCKET_URL ?? (API || (typeof window !== 'undefined' ? window.location.origin : ''))).replace(/\/$/, '');
async function api(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function date(value) { return value ? new Date(value).toLocaleString() : '—'; }

function Login({ onLogin }) {
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { const data = await api('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ username, password }) }); onLogin(data); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (showLogin) return <main className="login-shell"><button className="back-home" onClick={()=>setShowLogin(false)}>← Back to home</button><div className="login-card entrance">
    <div className="brand-mark"><Pill size={28}/></div><p className="eyebrow">MEDTRACK RFID</p><h1>Welcome<br/>back.</h1>
    <p className="muted">Sign in to your medicine operations workspace.</p>
    <form onSubmit={submit} className="stack">
      <label>Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
      {error && <div className="alert error">{error}</div>}
      <button className="primary full" disabled={busy}>{busy?'Signing in…':'Sign in to workspace'} <span>↗</span></button>
    </form>
    <div className="demo-note"><ShieldCheck size={16}/><span>Development demo: admin/admin123 · user/user123. Change these before production.</span></div>
  </div></main>;
  return <main className="landing-page">
    <nav className="landing-nav"><button className="landing-brand" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><span className="brand-mark small"><Pill size={20}/></span><span><strong>MedTrack</strong><small>RFID INVENTORY</small></span></button><div className="landing-links"><a href="#platform">Platform</a><a href="#workflow">How it works</a><a href="#security">Security</a></div><button className="nav-login" onClick={()=>setShowLogin(true)}>Sign in <span>↗</span></button></nav>
    <section className="landing-hero">
      <div className="hero-copy entrance"><div className="hero-badge"><span className="live-dot"/> RFID-POWERED MEDICINE INTELLIGENCE</div><h1>Every medicine.<br/><span>One clear view.</span></h1><p className="hero-description">A smarter way to identify medicine, monitor stock, and see every RFID scan as it happens — from your local device to your cloud dashboard.</p><div className="hero-actions"><button className="hero-cta" onClick={()=>setShowLogin(true)}>Open your dashboard <span>↗</span></button><a className="hero-secondary" href="#workflow">Explore the platform <span>↓</span></a></div><div className="hero-proof"><div className="proof-avatars"><span>RF</span><span>IoT</span><span>DB</span></div><div><strong>Hardware to cloud, connected</strong><small>ESP32 · PN532 · Live dashboard</small></div></div></div>
      <div className="hero-visual entrance delay-one"><div className="visual-orbit orbit-a"/><div className="visual-orbit orbit-b"/><div className="floating-chip chip-top"><span className="chip-dot"/> Reader online <strong>●</strong></div><div className="floating-chip chip-bottom"><ScanLine size={16}/><span><strong>Tag identified</strong><small>UID · 04 A1 B2 C3</small></span><em>Just now</em></div><div className="dashboard-mock"><div className="mock-top"><div className="mock-logo"><Pill size={16}/></div><div><strong>Live overview</strong><small>Medicine operations</small></div><span className="mock-status"><i/> LIVE</span></div><div className="mock-greeting"><small>MONITORING WORKSPACE</small><strong>Good morning 👋</strong><span>Your inventory at a glance.</span></div><div className="mock-stats"><div><span>Medicines</span><strong>128</strong><small>Registered items</small></div><div><span>RFID scans</span><strong>1,024</strong><small className="positive">↗ Live activity</small></div></div><div className="mock-chart-head"><strong>Scan activity</strong><span>Last 7 days⌄</span></div><div className="mock-chart"><div className="chart-grid"><i/><i/><i/></div><svg viewBox="0 0 440 110" preserveAspectRatio="none" aria-label="Illustrative scan activity chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#43cbb0" stopOpacity=".28"/><stop offset="100%" stopColor="#43cbb0" stopOpacity="0"/></linearGradient></defs><path d="M0 88 C25 82 30 60 58 67 S92 85 119 53 S164 65 190 39 S235 59 262 34 S310 51 335 22 S384 46 410 15 L440 25 L440 110 L0 110Z" fill="url(#chartFill)"/><path d="M0 88 C25 82 30 60 58 67 S92 85 119 53 S164 65 190 39 S235 59 262 34 S310 51 335 22 S384 46 410 15 L440 25" fill="none" stroke="#22ad98" strokeWidth="3" strokeLinecap="round"/></svg></div><div className="mock-bottom"><span><i className="legend-dot teal"/> RFID activity</span><span><i className="legend-dot pale"/> Cloud synced</span><strong>99.9% <small>visibility*</small></strong></div></div></div>
      <div className="hero-glow"/>
    </section>
    <section className="trust-strip"><span>BUILT FOR CONNECTED INVENTORY</span><div><span><Radio size={17}/> ESP32 READY</span><span><ScanLine size={17}/> NFC / RFID</span><span><Activity size={17}/> LIVE EVENTS</span><span><ShieldCheck size={17}/> ROLE-BASED ACCESS</span></div></section>
    <section id="platform" className="platform-section"><div className="section-heading"><p className="eyebrow">THE PLATFORM</p><h2>Less guesswork.<br/><span>More visibility.</span></h2><p>Everything you need to identify, track, and manage medicine inventory in one focused workspace.</p></div><div className="feature-grid"><article className="feature-card feature-dark"><div className="feature-icon"><ScanLine size={22}/></div><span className="feature-number">01 / IDENTIFY</span><h3>Scan in a second.</h3><p>Read NFC tag UIDs through your PN532 reader and match them to registered medicine records.</p><div className="feature-graphic scan-graphic"><div className="scan-ring"><Radio size={30}/></div><span className="scan-wave wave-one"/><span className="scan-wave wave-two"/><span className="scan-wave wave-three"/></div></article><article className="feature-card"><div className="feature-icon"><Activity size={22}/></div><span className="feature-number">02 / SEE LIVE</span><h3>Every event, in view.</h3><p>Follow incoming scan events, device heartbeats, and inventory changes with a responsive dashboard.</p><div className="mini-events"><div><span className="event-check">✓</span><span><strong>Tag identified</strong><small>ESP32 · just now</small></span><b>LIVE</b></div><div><span className="event-check">✓</span><span><strong>Inventory synced</strong><small>Cloud database</small></span><b>OK</b></div></div></article><article className="feature-card"><div className="feature-icon"><Boxes size={22}/></div><span className="feature-number">03 / CONTROL</span><h3>Stock with context.</h3><p>Track quantities, expiry dates, batches, and explicit stock-in or stock-out adjustments.</p><div className="stock-graphic"><div className="stock-bar"><span style={{height:'46%'}}/><span style={{height:'70%'}}/><span style={{height:'56%'}}/><span style={{height:'88%'}}/><span style={{height:'64%'}}/><span style={{height:'96%'}}/><span style={{height:'76%'}}/></div><div className="stock-label"><strong>Inventory activity</strong><span>7-day snapshot</span></div></div></article></div></section>
    <section id="workflow" className="workflow-section"><div className="workflow-copy"><p className="eyebrow">FROM READER TO DASHBOARD</p><h2>Your hardware.<br/><span>Your cloud.</span></h2><p>The ESP32 reads the tag locally, securely sends the scan to your backend, and your website updates with the latest event.</p><button className="hero-cta" onClick={()=>setShowLogin(true)}>Enter workspace <span>↗</span></button></div><div className="workflow-steps"><div className="workflow-line"/><div className="workflow-step"><div className="step-icon"><Radio size={20}/></div><div><small>STEP 01</small><strong>PN532 reader</strong><p>Detects a compatible NFC tag and reads its UID.</p></div><span className="step-state">LOCAL</span></div><div className="workflow-step"><div className="step-icon"><Wifi size={20}/></div><div><small>STEP 02</small><strong>ESP32 over Wi-Fi</strong><p>Sends scan events and heartbeat to your API.</p></div><span className="step-state">CONNECTED</span></div><div className="workflow-step"><div className="step-icon"><Activity size={20}/></div><div><small>STEP 03</small><strong>Cloud dashboard</strong><p>Stores the event and streams updates to authorized users.</p></div><span className="step-state">LIVE</span></div></div></section>
    <section id="security" className="security-band"><div className="security-icon"><ShieldCheck size={28}/></div><div><p className="eyebrow">BUILT WITH GUARDRAILS</p><h2>Clear roles. Controlled access.</h2><p>Separate admin and user permissions, hashed passwords, authenticated API requests, and explicit inventory actions.</p></div><button className="security-link" onClick={()=>setShowLogin(true)}>Sign in securely ↗</button></section>
    <footer className="landing-footer"><button className="landing-brand" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><span className="brand-mark small"><Pill size={20}/></span><span><strong>MedTrack</strong><small>RFID INVENTORY</small></span></button><span>Medicine inventory visibility, from device to cloud.</span><small>Prototype platform · Verify inventory before dispensing.</small></footer>
  </main>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('overview');
  const [medicines, setMedicines] = useState([]);
  const [scans, setScans] = useState([]);
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({name:'',strength:'',batch_number:'',expiry_date:'',quantity:'0',description:''});
  const [tagForm, setTagForm] = useState({uid:'',medicine_id:''});
  const [adjustForm, setAdjustForm] = useState({medicine_id:'',action:'stock_in',quantity:'1',note:''});
  const [busy, setBusy] = useState(false);

  function notify(msg) { setToast(msg); setTimeout(()=>setToast(''), 3000); }
  async function load() {
    if (!session?.token) return;
    try {
      const [m,s,d] = await Promise.all([
        api('/api/medicines',session.token), api('/api/scans?limit=80',session.token), api('/api/devices',session.token)
      ]);
      setMedicines(m); setScans(s); setDevices(d); setError('');
    } catch(e) { setError(e.message); }
  }
  useEffect(()=>{ if(session?.token) load(); },[session?.token]);
  useEffect(()=>{
    if(!session?.token) return;
    const socket = io(SOCKET, { transports: ['websocket','polling'] });
    socket.on('scan:new', event => { setScans(prev=>[event,...prev.filter(s=>s.event_id!==event.event_id)].slice(0,80)); load(); });
    socket.on('inventory:updated', load);
    socket.on('device:heartbeat', load);
    return ()=>socket.disconnect();
  },[session?.token]);
  const isAdmin = session?.user?.role === 'admin';
  const filtered = useMemo(()=>medicines.filter(m=>`${m.name} ${m.strength||''} ${m.batch_number||''} ${m.tag_uid||''}`.toLowerCase().includes(search.toLowerCase())),[medicines,search]);
  const knownScans = scans.filter(s=>s.event_type==='identify').length;
  const lowStock = medicines.filter(m=>Number(m.quantity)<=10).length;
  const onlineDevices = devices.filter(d=>d.status==='online' && d.last_seen && Date.now()-new Date(d.last_seen).getTime()<120000).length;

  if (!session) return <Login onLogin={data=>{setSession(data);setTab('overview');}} />;
  async function addMedicine(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/medicines',session.token,{method:'POST',body:JSON.stringify({...form,quantity:Number(form.quantity)})});
      setForm({name:'',strength:'',batch_number:'',expiry_date:'',quantity:'0',description:''}); setShowAdd(false); await load(); notify('Medicine added');
    } catch(e){setError(e.message);} finally{setBusy(false);}
  }
  async function registerTag(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/rfid/register',session.token,{method:'POST',body:JSON.stringify({uid:tagForm.uid,medicine_id:tagForm.medicine_id})});
      setTagForm({uid:'',medicine_id:''}); await load(); notify('RFID tag registered');
    } catch(e){setError(e.message);} finally{setBusy(false);}
  }
  async function adjustStock(e) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/api/inventory/adjust',session.token,{method:'POST',body:JSON.stringify({...adjustForm,quantity:Number(adjustForm.quantity)})});
      setAdjustForm({...adjustForm,quantity:'1',note:''}); await load(); notify('Inventory updated');
    } catch(e){setError(e.message);} finally{setBusy(false);}
  }
  function logout(){setSession(null);setMedicines([]);setScans([]);}

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark small"><Pill size={20}/></div><div><strong>MedTrack</strong><small>RFID INVENTORY</small></div></div>
      <div className="side-label">WORKSPACE</div>
      {[['overview','Overview',Activity],['medicines','Medicines',Boxes],['scans','RFID scans',ScanLine],['devices','Devices',Radio],...(isAdmin?[['inventory','Stock control',ArrowDownToLine],['tags','Register tag',ShieldCheck]]:[])].map(([id,label,Icon])=><button key={id} className={`nav-item ${tab===id?'active':''}`} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{session.user.username.slice(0,1).toUpperCase()}</div><div><strong>{session.user.username}</strong><small>{session.user.role}</small></div><button className="icon-button" title="Sign out" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">MEDICINE OPERATIONS</div><h1>{({overview:'Overview',medicines:'Medicine inventory',scans:'RFID scan history',devices:'Connected devices',inventory:'Stock control',tags:'RFID registration'})[tab]}</h1></div><div className="top-actions"><span className="live-pill"><span className="live-dot"/> Live updates</span><button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={17}/></button><div className="role-chip">{isAdmin?'Administrator':'User portal'}</div></div></header>
      {error && <div className="alert error"><span>{error}</span><button onClick={()=>setError('')}>Dismiss</button></div>}
      {toast && <div className="toast">{toast}</div>}
      {tab==='overview' && <>
        <section className="welcome-panel"><div><p className="eyebrow light">RFID MONITORING</p><h2>Know what’s in stock.<br/>As it happens.</h2><p>Medicine identification and inventory activity in one place.</p></div><div className="welcome-icon"><Radio size={54}/><span className="signal signal-one"/><span className="signal signal-two"/></div></section>
        <section className="stats-grid">
          <Stat icon={Pill} label="Registered medicines" value={medicines.length} hint="Medicine records"/>
          <Stat icon={ScanLine} label="Known scans" value={knownScans} hint="Recent scan history"/>
          <Stat icon={Boxes} label="Low stock" value={lowStock} hint="10 units or fewer"/>
          <Stat icon={Wifi} label="Online devices" value={onlineDevices} hint={`${devices.length} registered devices`}/>
        </section>
        <section className="content-grid"><div className="panel"><div className="panel-head"><div><h3>Recent RFID scans</h3><p>Latest events received by the backend</p></div><button className="text-button" onClick={()=>setTab('scans')}>View all →</button></div><ScanTable scans={scans.slice(0,7)}/></div>
          <div className="panel"><div className="panel-head"><div><h3>Inventory watch</h3><p>Items needing a stock check</p></div></div>{medicines.filter(m=>Number(m.quantity)<=10).slice(0,5).map(m=><div className="watch-row" key={m.id}><div className="medicine-icon"><Pill size={18}/></div><div className="watch-name"><strong>{m.name}</strong><small>{m.strength||'Strength not set'}</small></div><span className={`quantity ${Number(m.quantity)===0?'danger':''}`}>{m.quantity} left</span></div>)}{!medicines.some(m=>Number(m.quantity)<=10)&&<div className="empty">No low-stock items right now.</div>}</div></section>
      </>}
      {tab==='medicines' && <section className="panel"><div className="panel-head"><div><h3>Medicine catalogue</h3><p>Registered medicines and their linked RFID tags</p></div>{isAdmin&&<button className="primary" onClick={()=>setShowAdd(!showAdd)}><Plus size={16}/> Add medicine</button>}</div>
        {showAdd&&isAdmin&&<form className="form-grid add-form" onSubmit={addMedicine}><label>Medicine name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Strength<input value={form.strength} onChange={e=>setForm({...form,strength:e.target.value})} placeholder="e.g. 500 mg"/></label><label>Batch number<input value={form.batch_number} onChange={e=>setForm({...form,batch_number:e.target.value})}/></label><label>Expiry date<input type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}/></label><label>Opening quantity<input type="number" min="0" step="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label>Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="form-actions"><button className="primary" disabled={busy}>Save medicine</button><button type="button" className="secondary" onClick={()=>setShowAdd(false)}>Cancel</button></div></form>}
        <div className="search-bar"><Search size={18}/><input placeholder="Search medicine, batch or RFID UID…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="table-wrap"><table><thead><tr><th>Medicine</th><th>Batch</th><th>RFID UID</th><th>Expiry</th><th>Stock</th><th>Status</th></tr></thead><tbody>{filtered.map(m=><tr key={m.id}><td><strong>{m.name}</strong><small>{m.strength||'—'}</small></td><td>{m.batch_number||'—'}</td><td><code>{m.tag_uid||'Not linked'}</code></td><td>{m.expiry_date?new Date(m.expiry_date).toLocaleDateString():'—'}</td><td>{m.quantity}</td><td><span className={`status ${Number(m.quantity)<=10?'warning':'good'}`}>{Number(m.quantity)<=10?'Low stock':'In stock'}</span></td></tr>)}</tbody></table>{!filtered.length&&<div className="empty">No medicine records found.</div>}</div>
      </section>}
      {tab==='scans' && <section className="panel"><div className="panel-head"><div><h3>Scan event log</h3><p>Live UID detections, including unknown tags</p></div><span className="live-pill"><span className="live-dot"/> Streaming</span></div><ScanTable scans={scans}/></section>}
      {tab==='devices' && <section className="panel"><div className="panel-head"><div><h3>ESP32 devices</h3><p>Device heartbeat and local network diagnostics</p></div></div><div className="table-wrap"><table><thead><tr><th>Device ID</th><th>Local IP</th><th>Last seen</th><th>Firmware</th><th>Status</th></tr></thead><tbody>{devices.map(d=>{const online=d.status==='online'&&d.last_seen&&Date.now()-new Date(d.last_seen).getTime()<120000;return <tr key={d.id}><td><strong>{d.id}</strong></td><td><code>{d.local_ip||'—'}</code></td><td>{date(d.last_seen)}</td><td>{d.firmware_version||'—'}</td><td><span className={`status ${online?'good':'warning'}`}>{online?'Online':'Offline'}</span></td></tr>})}</tbody></table>{!devices.length&&<div className="empty"><Radio size={28}/><p>No devices have checked in yet. Flash the ESP32 firmware with the API URL and device key.</p></div>}</div></section>}
      {tab==='inventory' && isAdmin && <section className="panel"><div className="panel-head"><div><h3>Adjust stock</h3><p>Use explicit stock actions; tag identification alone does not change quantity.</p></div></div><form className="form-grid" onSubmit={adjustStock}><label>Medicine<select required value={adjustForm.medicine_id} onChange={e=>setAdjustForm({...adjustForm,medicine_id:e.target.value})}><option value="">Choose medicine</option>{medicines.map(m=><option value={m.id} key={m.id}>{m.name} — {m.quantity} available</option>)}</select></label><label>Action<select value={adjustForm.action} onChange={e=>setAdjustForm({...adjustForm,action:e.target.value})}><option value="stock_in">Stock in (+)</option><option value="stock_out">Stock out (−)</option></select></label><label>Quantity<input type="number" min="1" step="1" required value={adjustForm.quantity} onChange={e=>setAdjustForm({...adjustForm,quantity:e.target.value})}/></label><label>Note<input value={adjustForm.note} onChange={e=>setAdjustForm({...adjustForm,note:e.target.value})} placeholder="Reason / reference"/></label><div className="form-actions"><button className="primary" disabled={busy||!medicines.length}>Apply stock change</button></div></form><div className="notice"><ShieldCheck size={18}/><span>Stock-out requests greater than available quantity are rejected by the backend. Every adjustment is recorded in scan history.</span></div></section>}
      {tab==='tags' && isAdmin && <section className="panel"><div className="panel-head"><div><h3>Register RFID UID</h3><p>Scan a tag using the ESP32, then link its UID to a medicine record.</p></div></div><form className="form-grid" onSubmit={registerTag}><label>RFID UID<input required value={tagForm.uid} onChange={e=>setTagForm({...tagForm,uid:e.target.value.toUpperCase()})} placeholder="e.g. 04A1B2C3D4"/></label><label>Medicine<select required value={tagForm.medicine_id} onChange={e=>setTagForm({...tagForm,medicine_id:e.target.value})}><option value="">Choose medicine</option>{medicines.map(m=><option value={m.id} key={m.id}>{m.name} — {m.strength||'no strength'}</option>)}</select></label><div className="form-actions"><button className="primary" disabled={busy||!medicines.length}>Link tag</button></div></form><div className="notice"><Radio size={18}/><span>UIDs can be read from the scan history even when they are not registered. Only admins can register or reassign tags.</span></div></section>}
      <footer>MedTrack RFID · Prototype inventory system <span>·</span> Verify all inventory changes before dispensing.</footer>
    </main>
  </div>;
}

function Stat({icon:Icon,label,value,hint}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={19}/></span></div><strong className="stat-value">{value}</strong><small>{hint}</small></div>; }
function ScanTable({scans}) {
  return <div className="table-wrap"><table><thead><tr><th>Medicine / tag</th><th>Device</th><th>Event</th><th>Timestamp</th></tr></thead><tbody>{scans.map((s,i)=><tr key={s.event_id||s.id||i}><td><div className="scan-medicine"><div className="medicine-icon"><ScanLine size={17}/></div><div><strong>{s.medicine_name||'Unregistered tag'}</strong><small><code>{s.tag_uid||'—'}</code></small></div></div></td><td>{s.device_id||'—'}</td><td><span className={`status ${s.event_type==='unknown_tag'?'warning':'good'}`}>{(s.event_type||'identify').replace('_',' ')}</span></td><td>{date(s.scanned_at)}</td></tr>)}</tbody></table>{!scans.length&&<div className="empty"><ScanLine size={28}/><p>No scans yet. Present an NFC tag to the PN532 reader to start.</p></div>}</div>;
}
