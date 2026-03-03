import { useState, useEffect, useRef } from "react";
import * as emailjs from "@emailjs/browser";

// =============================================================================
// EMAILJS CONFIGURATION
// =============================================================================
const EMAILJS_SERVICE_ID  = "service_3ep6pvg";
const EMAILJS_TEMPLATE_ID = "template_kbqv7w4";
const EMAILJS_PUBLIC_KEY  = "uE7sq8OIp9WjhjAa-";

// =============================================================================
// RAPIDAPI KEY — paste your key from rapidapi.com
// =============================================================================
const RAPIDAPI_KEY = "317e81ffcfmsh4078b2f7a745e59p1e250ejsn60fe93181620";

// =============================================================================
// ADMIN CREDENTIALS — change before sharing your site!
// =============================================================================
const ADMIN_EMAIL    = "admin@rateprofessor.edu";
const ADMIN_PASSWORD = "ChangeMe123!";

// =============================================================================

const uid     = () => Math.random().toString(36).slice(2, 10);
const now     = () => new Date().toISOString();
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
const genCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const LS = {
  get: (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
const KEYS = {
  users: "rmp:users",
  professors: "rmp:professors",
  reviews: "rmp:reviews",
  session: "rmp:session",
};

const ADMIN = {
  id: "admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
  username: "Administrator", displayName: "Administrator",
  bio: "Site administrator.", avatar: "", banner: "", location: "", website: "",
  isAdmin: true, verified: true, createdAt: "2024-01-01T00:00:00.000Z",
};

const SEED_PROFESSORS = [
  { id:"p1", name:"Dr. Eleanor Voss", department:"Computer Science", university:"Westbrook University", bio:"Specializes in machine learning and distributed systems.", photo:"https://i.pravatar.cc/200?img=47", tags:["Inspiring","Tough Grader","Lots of Homework"], status:"approved", submittedBy:"seed", ratings:[{userId:"u1",overall:4.5,difficulty:4.0,wouldTakeAgain:true},{userId:"u2",overall:5.0,difficulty:4.5,wouldTakeAgain:true}], createdAt:"2024-01-01T00:00:00.000Z" },
  { id:"p2", name:"Prof. Marcus Chen", department:"Mathematics", university:"Westbrook University", bio:"Expert in topology and abstract algebra.", photo:"https://i.pravatar.cc/200?img=12", tags:["Clear Explanations","Caring"], status:"approved", submittedBy:"seed", ratings:[{userId:"u1",overall:3.5,difficulty:4.5,wouldTakeAgain:false}], createdAt:"2024-01-02T00:00:00.000Z" },
  { id:"p3", name:"Dr. Amara Okonkwo", department:"Philosophy", university:"Harland College", bio:"Focuses on ethics and political philosophy.", photo:"https://i.pravatar.cc/200?img=31", tags:["Thought-Provoking","Fair Tests"], status:"approved", submittedBy:"seed", ratings:[{userId:"u2",overall:5.0,difficulty:3.0,wouldTakeAgain:true}], createdAt:"2024-01-03T00:00:00.000Z" },
];
const SEED_REVIEWS = [
  { id:"r1", professorId:"p1", userId:"u1", username:"student_alex", comment:"Dr. Voss really pushes you to think critically. Best CS professor I have had.", overall:4.5, difficulty:4.0, wouldTakeAgain:true, status:"approved", aiVerdict:"approved", createdAt:"2024-03-10T00:00:00.000Z" },
  { id:"r2", professorId:"p2", userId:"u1", username:"student_alex", comment:"Prof. Chen knows his stuff but can move too fast. Go to office hours.", overall:3.5, difficulty:4.5, wouldTakeAgain:false, status:"approved", aiVerdict:"approved", createdAt:"2024-04-01T00:00:00.000Z" },
  { id:"r3", professorId:"p3", userId:"u2", username:"techguru99", comment:"Every class felt like a revelation. Dr. Okonkwo makes ethics feel urgent.", overall:5.0, difficulty:3.0, wouldTakeAgain:true, status:"approved", aiVerdict:"approved", createdAt:"2024-05-20T00:00:00.000Z" },
];

// =============================================================================
// EMAIL
// =============================================================================
async function sendVerificationEmail(toEmail, toName, code) {
  if (EMAILJS_SERVICE_ID === "YOUR_SERVICE_ID") return { success: false, demo: true };
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: toEmail, to_name: toName, verification_code: code }, EMAILJS_PUBLIC_KEY);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// MODERATION
// =============================================================================
const BANNED_WORDS = [
  "fuck","shit","ass","bitch","bastard","crap","damn","dick","pussy",
  "cock","cunt","asshole","motherfucker","bullshit","piss","fag",
  "retard","dumbass","jackass","loser","pathetic","worthless"
];

function localProfanityCheck(comment) {
  const lower = comment.toLowerCase();
  const found = BANNED_WORDS.find(word => new RegExp(`\\b${word}\\b`, "i").test(lower));
  if (found) return { verdict: "rejected", reason: `Review contains inappropriate language: "${found}"` };
  return null;
}

async function moderateComment(comment, professorName) {
  // Step 1 — instant local word check
  const localResult = localProfanityCheck(comment);
  if (localResult) return localResult;

  // Step 2 — RapidAPI AI moderation
  if (RAPIDAPI_KEY === "YOUR_RAPIDAPI_KEY") {
    return { verdict: "approved", reason: "AI not configured" };
  }

  try {
    const res = await fetch(
      "https://ai-text-moderation-toxicity-aspects-sentiment-analyzer.p.rapidapi.com/analyze.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "ai-text-moderation-toxicity-aspects-sentiment-analyzer.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY,
        },
        body: JSON.stringify({
          text: comment,
          metadata: { request_id: "mod-" + Date.now() }
        }),
      }
    );

    const data = await res.json();
    console.log("Moderation API response:", data);

    const item = data?.data?.items?.[0];
    if (!item) return { verdict: "approved", reason: "No moderation data returned." };

    // API says block it
    if (item.moderation?.allowed === false || item.moderation?.decision === "block") {
      const topViolation = item.moderation?.violations?.[0];
      const reason = topViolation
        ? `Review violates policy: ${topViolation.label} (severity: ${topViolation.severity})`
        : "Review contains inappropriate content.";
      return { verdict: "rejected", reason };
    }

    // High toxicity — flag for admin
    const toxicityScore = item.toxicity?.overall || 0;
    const sentiment     = item.sentiment?.label || "";
    if (toxicityScore > 0.6) {
      return { verdict: "flagged", reason: `Review flagged for high toxicity (${(toxicityScore * 100).toFixed(0)}%).` };
    }
    if (!item.safe && sentiment === "negative") {
      return { verdict: "flagged", reason: "Review flagged as unsafe with negative sentiment." };
    }

    return { verdict: "approved", reason: "Passed AI moderation." };

  } catch (err) {
    console.error("Moderation API error:", err);
    return { verdict: "approved", reason: "AI unavailable, auto-approved" };
  }
}

// =============================================================================
// HELPERS
// =============================================================================
const avgRating = (ratings, field) =>
  !ratings?.length ? 0 : ratings.reduce((s, r) => s + r[field], 0) / ratings.length;
const wouldTakeAgainPct = (ratings) =>
  !ratings?.length ? 0 : Math.round(ratings.filter(r => r.wouldTakeAgain).length / ratings.length * 100);
const ratingColor = (v) => v >= 4 ? "#4ade80" : v >= 3 ? "#fbbf24" : "#f87171";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Image must be under 5MB"));
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// =============================================================================
// IMAGE UPLOAD
// =============================================================================
function ImageUpload({ value, onChange, label, shape = "square", size = 80 }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const isCircle = shape === "circle";
  const handle = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try { onChange(await readFileAsBase64(file)); } catch (e) { alert(e.message); }
  };
  return (
    <div>
      {label && <label style={{ marginBottom: 8 }}>{label}</label>}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        style={{ width:size, height:size, borderRadius:isCircle?"50%":10, background:value?`url(${value}) center/cover`:"#1e1c18", border:`2px dashed ${dragging?"#c9a84c":"#3a3530"}`, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, transition:"border-color 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#c9a84c"}
        onMouseLeave={e => e.currentTarget.style.borderColor = dragging ? "#c9a84c" : "#3a3530"}
      >
        {!value && (
          <div style={{ textAlign:"center", padding:6 }}>
            <svg width="22" height="22" fill="none" stroke="#6b6458" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:10, marginTop:3, lineHeight:1.3 }}>Click or<br/>drop</div>
          </div>
        )}
      </div>
      {value && <button onClick={e => { e.stopPropagation(); onChange(""); }} style={{ marginTop:4, background:"none", border:"none", color:"#f87171", fontFamily:"'Crimson Pro',serif", fontSize:12, cursor:"pointer", display:"block", padding:"2px 0" }}>Remove</button>}
      <input ref={inputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => handle(e.target.files[0])} />
    </div>
  );
}

// =============================================================================
// BANNER UPLOAD
// =============================================================================
function BannerUpload({ value, onChange }) {
  const inputRef = useRef();
  const handle = async (file) => {
    if (!file) return;
    try { onChange(await readFileAsBase64(file)); } catch (e) { alert(e.message); }
  };
  return (
    <div>
      <label style={{ marginBottom:8 }}>Banner Image</label>
      <div onClick={() => inputRef.current?.click()}
        style={{ height:110, borderRadius:10, cursor:"pointer", overflow:"hidden", position:"relative", background:value?`url(${value}) center/cover`:"#1e1c18", border:"2px dashed #3a3530", display:"flex", alignItems:"center", justifyContent:"center", transition:"border-color 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#c9a84c"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "#3a3530"}
      >
        {!value && <div style={{ textAlign:"center" }}><svg width="22" height="22" fill="none" stroke="#6b6458" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13, marginTop:4 }}>Click to upload banner (max 5MB)</div></div>}
        {value && <div style={{ position:"absolute", inset:0, background:"#00000066", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontFamily:"'Crimson Pro',serif", color:"#fff", fontSize:14 }}>Change Banner</span></div>}
      </div>
      {value && <button onClick={() => onChange("")} style={{ marginTop:4, background:"none", border:"none", color:"#f87171", fontFamily:"'Crimson Pro',serif", fontSize:12, cursor:"pointer", display:"block" }}>Remove banner</button>}
      <input ref={inputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => handle(e.target.files[0])} />
    </div>
  );
}

// =============================================================================
// STAR RATING
// =============================================================================
function StarRating({ value, max = 5, onChange, size = 20 }) {
  const [hovered, setHovered] = useState(0);
  return (
    <span style={{ display:"inline-flex", gap:2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          style={{ cursor: onChange ? "pointer" : "default" }}
          onMouseEnter={() => onChange && setHovered(i + 1)}
          onMouseLeave={() => onChange && setHovered(0)}
          onClick={() => onChange && onChange(i + 1)}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
            fill={(hovered || value) > i ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth="2" />
        </svg>
      ))}
    </span>
  );
}

// =============================================================================
// AVATAR
// =============================================================================
function Avatar({ user, size = 40 }) {
  const name = encodeURIComponent(user?.displayName || user?.username || "U");
  const fallback = `https://ui-avatars.com/api/?name=${name}&background=2a2620&color=c9a84c&size=${size * 2}`;
  return <img src={user?.avatar || fallback} alt="" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", border:"2px solid #2a2620", flexShrink:0 }} onError={e => e.target.src = fallback} />;
}

// =============================================================================
// MAIN APP
// =============================================================================
export default function App() {
  const [page, setPage]               = useState("home");
  const [selectedProfId, setSelProf]  = useState(null);
  const [selectedUserId, setSelUser]  = useState(null);
  const [users, setUsers]             = useState([]);
  const [professors, setProfessors]   = useState([]);
  const [reviews, setReviews]         = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [searchQ, setSearchQ]         = useState("");
  const [toast, setToast]             = useState(null);
  const [verifyModal, setVerifyModal] = useState(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  useEffect(() => {
    const u    = LS.get(KEYS.users, []);
    const p    = LS.get(KEYS.professors, null);
    const r    = LS.get(KEYS.reviews, null);
    const sess = LS.get(KEYS.session, null);
    setUsers(u);
    setProfessors(p || SEED_PROFESSORS);
    setReviews(r || SEED_REVIEWS);
    if (sess) setCurrentUser(sess);
    setLoading(false);
  }, []);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4500); };
  const nav = (p, profId = null, userId = null) => { setPage(p); if (profId) setSelProf(profId); if (userId) setSelUser(userId); window.scrollTo(0, 0); };
  const logout = () => { setCurrentUser(null); LS.set(KEYS.session, null); nav("home"); showToast("Logged out."); };
  const updateCurrentUser = (updated) => {
    setCurrentUser(updated); LS.set(KEYS.session, updated);
    const upd = users.map(u => u.id === updated.id ? updated : u);
    setUsers(upd); LS.set(KEYS.users, upd);
  };
  const getUserById = (id) => id === "admin" ? ADMIN : users.find(u => u.id === id);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ color:"#c9a84c", fontFamily:"'Playfair Display',serif", fontSize:22 }}>Loading...</span>
    </div>
  );

  const approvedProfs = professors.filter(p => p.status === "approved");
  const filtered = approvedProfs.filter(p =>
    [p.name, p.department, p.university].some(v => v.toLowerCase().includes(searchQ.toLowerCase()))
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0f0e0c;}
        ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:#1a1814;}::-webkit-scrollbar-thumb{background:#c9a84c55;border-radius:3px;}
        input,textarea,select{outline:none;}button{cursor:pointer;border:none;}
        .card-hover{transition:transform 0.2s,box-shadow 0.2s;}.card-hover:hover{transform:translateY(-3px);box-shadow:0 12px 40px #00000066;}
        .btn-primary{background:linear-gradient(135deg,#c9a84c,#e6c96a);color:#111;font-family:'Crimson Pro',serif;font-size:15px;font-weight:600;padding:10px 22px;border-radius:8px;transition:opacity 0.2s,transform 0.1s;}.btn-primary:hover{opacity:0.9;transform:translateY(-1px);}.btn-primary:disabled{opacity:0.6;cursor:not-allowed;transform:none;}
        .btn-ghost{background:transparent;color:#c9a84c;border:1px solid #c9a84c55;font-family:'Crimson Pro',serif;font-size:15px;padding:9px 20px;border-radius:8px;transition:all 0.2s;}.btn-ghost:hover{border-color:#c9a84c;background:#c9a84c11;}
        .btn-danger{background:#7f1d1d;color:#fca5a5;font-family:'Crimson Pro',serif;font-size:14px;padding:7px 14px;border-radius:6px;}.btn-danger:hover{opacity:0.8;}
        .btn-approve{background:#14532d;color:#86efac;font-family:'Crimson Pro',serif;font-size:14px;padding:7px 14px;border-radius:6px;}.btn-approve:hover{opacity:0.8;}
        .form-field{width:100%;background:#1e1c18;border:1px solid #3a3530;color:#e8dcc8;font-family:'Crimson Pro',serif;font-size:16px;padding:12px 14px;border-radius:8px;transition:border-color 0.2s;}.form-field:focus{border-color:#c9a84c88;}.form-field::placeholder{color:#6b6458;}
        label{font-family:'Crimson Pro',serif;font-size:13px;color:#9b9082;letter-spacing:0.8px;text-transform:uppercase;display:block;margin-bottom:6px;}
        .tag{display:inline-block;background:#2a2620;border:1px solid #3a3530;color:#c9a84c;font-family:'Crimson Pro',serif;font-size:13px;padding:4px 10px;border-radius:20px;}
        .section-title{font-family:'Playfair Display',serif;color:#e8dcc8;font-size:26px;font-weight:700;}
        .nav-link{font-family:'Crimson Pro',serif;font-size:16px;color:#9b9082;background:none;border:none;cursor:pointer;padding:6px 12px;border-radius:6px;transition:color 0.2s;}.nav-link:hover{color:#c9a84c;}
        .modal-overlay{position:fixed;inset:0;background:#000000cc;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;}
        .modal-box{background:#14120e;border:1px solid #3a3530;border-radius:16px;padding:32px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fade-in{animation:fadeIn 0.25s ease forwards;}
      `}</style>

      <nav style={{ background:"#14120e", borderBottom:"1px solid #2a2620", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:100 }}>
        <button onClick={() => nav("home")} style={{ background:"none", border:"none", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#c9a84c,#e6c96a)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, color:"#111", fontSize:18 }}>R</span>
          </div>
          <span style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:18, fontWeight:700 }}>RateMyProfessor</span>
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {currentUser ? (
            <>
              <button className="nav-link" onClick={() => nav("submit")}>+ Submit Professor</button>
              {currentUser.isAdmin && (
                <button className="nav-link" onClick={() => nav("admin")} style={{ color:"#f87171" }}>
                  Admin
                  {(professors.filter(p => p.status === "pending").length + reviews.filter(r => r.status === "flagged").length) > 0 && (
                    <span style={{ background:"#7f1d1d", color:"#fca5a5", borderRadius:12, padding:"1px 7px", fontSize:12, marginLeft:4 }}>
                      {professors.filter(p => p.status === "pending").length + reviews.filter(r => r.status === "flagged").length}
                    </span>
                  )}
                </button>
              )}
              <button onClick={() => nav("profile", null, currentUser.id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:8, padding:"4px 8px", borderRadius:8 }}>
                <Avatar user={currentUser} size={32} />
                <span style={{ fontFamily:"'Crimson Pro',serif", color:"#e8dcc8", fontSize:15 }}>{currentUser.displayName || currentUser.username}</span>
              </button>
              <button className="btn-ghost" onClick={logout} style={{ padding:"6px 14px", fontSize:14 }}>Log Out</button>
            </>
          ) : (
            <>
              <button className="nav-link" onClick={() => nav("login")}>Log In</button>
              <button className="btn-primary" onClick={() => nav("register")} style={{ padding:"8px 18px", fontSize:14 }}>Sign Up</button>
            </>
          )}
        </div>
      </nav>

      {toast && (
        <div className="fade-in" style={{ position:"fixed", bottom:24, right:24, zIndex:999, background:toast.type==="error"?"#7f1d1d":toast.type==="warn"?"#78350f":"#14532d", color:toast.type==="error"?"#fca5a5":toast.type==="warn"?"#fde68a":"#86efac", fontFamily:"'Crimson Pro',serif", fontSize:15, padding:"12px 20px", borderRadius:10, boxShadow:"0 8px 30px #00000088", maxWidth:360 }}>
          {toast.msg}
        </div>
      )}

      {verifyModal && <VerifyModal modal={verifyModal} setModal={setVerifyModal} users={users} setUsers={setUsers} setCurrentUser={setCurrentUser} nav={nav} showToast={showToast} />}
      {editProfileOpen && currentUser && <EditProfileModal currentUser={currentUser} updateCurrentUser={updateCurrentUser} onClose={() => setEditProfileOpen(false)} showToast={showToast} />}

      {page === "home"      && <HomePage filtered={filtered} searchQ={searchQ} setSearchQ={setSearchQ} nav={nav} reviews={reviews} />}
      {page === "professor" && <ProfessorPage profId={selectedProfId} professors={professors} setProfessors={setProfessors} reviews={reviews} setReviews={setReviews} currentUser={currentUser} nav={nav} showToast={showToast} getUserById={getUserById} />}
      {page === "login"     && <LoginPage users={users} setCurrentUser={setCurrentUser} nav={nav} showToast={showToast} />}
      {page === "register"  && <RegisterPage users={users} nav={nav} showToast={showToast} setVerifyModal={setVerifyModal} />}
      {page === "submit"    && <SubmitPage professors={professors} setProfessors={setProfessors} currentUser={currentUser} nav={nav} showToast={showToast} />}
      {page === "profile"   && <ProfilePage userId={selectedUserId} users={users} currentUser={currentUser} reviews={reviews} professors={professors} nav={nav} setEditProfileOpen={setEditProfileOpen} />}
      {page === "admin"     && <AdminPage professors={professors} setProfessors={setProfessors} reviews={reviews} setReviews={setReviews} users={users} currentUser={currentUser} nav={nav} showToast={showToast} />}
    </>
  );
}

// =============================================================================
// VERIFY MODAL
// =============================================================================
function VerifyModal({ modal, setModal, users, setUsers, setCurrentUser, nav, showToast }) {
  const [input, setInput]     = useState("");
  const [error, setError]     = useState("");
  const [sending, setSending] = useState(false);

  const verify = () => {
    if (input.trim() !== modal.code) { setError("Incorrect code. Please try again."); return; }
    const newUser = { ...modal.userData, verified: true };
    const updated = [...users, newUser];
    setUsers(updated); LS.set(KEYS.users, updated);
    setCurrentUser(newUser); LS.set(KEYS.session, newUser);
    setModal(null);
    showToast("Email verified! Welcome, " + newUser.username + "!");
    nav("home");
  };

  const resend = async () => {
    setSending(true);
    const result = await sendVerificationEmail(modal.email, modal.userData.username, modal.code);
    setSending(false);
    if (result.success)   showToast("Code resent to your email!");
    else if (result.demo) showToast("EmailJS not configured — see the code on screen.", "warn");
    else                  showToast("Could not resend. Check EmailJS config.", "error");
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box fade-in">
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ width:64, height:64, background:"#c9a84c22", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
            <svg width="30" height="30" fill="none" stroke="#c9a84c" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:22, fontWeight:700, marginBottom:8 }}>Verify Your Email</h2>
          <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, lineHeight:1.6 }}>
            A 6-digit code was sent to<br/><span style={{ color:"#c9a84c", fontWeight:600 }}>{modal.email}</span>
          </p>
        </div>
        {EMAILJS_SERVICE_ID === "YOUR_SERVICE_ID" && (
          <div style={{ background:"#78350f22", border:"1px solid #78350f55", borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
            <p style={{ fontFamily:"'Crimson Pro',serif", color:"#fde68a", fontSize:13, marginBottom:8 }}><strong>EmailJS not configured yet.</strong> Your demo code is:</p>
            <div style={{ fontFamily:"monospace", fontSize:28, fontWeight:700, letterSpacing:8, color:"#c9a84c", textAlign:"center" }}>{modal.code}</div>
          </div>
        )}
        <div style={{ marginBottom:16 }}>
          <label>Enter 6-Digit Code</label>
          <input className="form-field" placeholder="000000" value={input} onChange={e => setInput(e.target.value.replace(/\D/g,"").slice(0,6))} onKeyDown={e => e.key==="Enter"&&verify()} style={{ marginTop:6, textAlign:"center", fontSize:28, letterSpacing:10, fontFamily:"'Playfair Display',serif" }} />
          {error && <p style={{ fontFamily:"'Crimson Pro',serif", color:"#f87171", fontSize:14, marginTop:8 }}>{error}</p>}
        </div>
        <button className="btn-primary" onClick={verify} style={{ width:"100%", padding:13, fontSize:16 }}>Verify & Create Account</button>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:12 }}>
          <button onClick={resend} disabled={sending} style={{ background:"none", border:"none", color:"#9b9082", fontFamily:"'Crimson Pro',serif", fontSize:14, cursor:"pointer", padding:"6px 0" }}>{sending?"Sending...":"Resend code"}</button>
          <button onClick={() => setModal(null)} style={{ background:"none", border:"none", color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:14, cursor:"pointer", padding:"6px 0" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// EDIT PROFILE MODAL
// =============================================================================
function EditProfileModal({ currentUser, updateCurrentUser, onClose, showToast }) {
  const [form, setForm] = useState({
    displayName: currentUser.displayName||currentUser.username, bio:currentUser.bio||"",
    avatar:currentUser.avatar||"", banner:currentUser.banner||"",
    location:currentUser.location||"", website:currentUser.website||"",
  });
  const save = () => { updateCurrentUser({ ...currentUser, ...form }); onClose(); showToast("Profile updated!"); };
  return (
    <div className="modal-overlay">
      <div className="modal-box fade-in" style={{ maxWidth:540 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:22, fontWeight:700 }}>Edit Profile</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b6458", cursor:"pointer", fontSize:24, lineHeight:1 }}>x</button>
        </div>
        <div style={{ marginBottom:20 }}><BannerUpload value={form.banner} onChange={v => setForm(f => ({ ...f, banner:v }))} /></div>
        <div style={{ display:"flex", gap:16, alignItems:"flex-start", marginBottom:20 }}>
          <ImageUpload value={form.avatar} onChange={v => setForm(f => ({ ...f, avatar:v }))} label="Profile Photo" shape="circle" size={80} />
          <p style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13, lineHeight:1.6, marginTop:22, flex:1 }}>Upload from your computer. Max 5MB.</p>
        </div>
        {[["Display Name","displayName","Your public name"],["Location","location","City, Country"],["Website","website","https://yoursite.com"]].map(([lbl,key,ph]) => (
          <div key={key} style={{ marginBottom:16 }}>
            <label>{lbl}</label>
            <input className="form-field" placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]:e.target.value }))} style={{ marginTop:6 }} />
          </div>
        ))}
        <div style={{ marginBottom:20 }}>
          <label>Bio</label>
          <textarea className="form-field" rows={3} placeholder="Tell us about yourself..." value={form.bio} onChange={e => setForm(f => ({ ...f, bio:e.target.value }))} style={{ resize:"vertical", marginTop:6 }} />
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-primary" onClick={save} style={{ flex:1, padding:13, fontSize:16 }}>Save Changes</button>
          <button className="btn-ghost" onClick={onClose} style={{ padding:"12px 20px" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HOME PAGE
// =============================================================================
function HomePage({ filtered, searchQ, setSearchQ, nav, reviews }) {
  return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c" }}>
      <div style={{ background:"linear-gradient(160deg,#1a1510 0%,#0f0e0c 60%)", borderBottom:"1px solid #2a2620", padding:"72px 24px 64px", textAlign:"center" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <p style={{ fontFamily:"'Crimson Pro',serif", fontStyle:"italic", color:"#c9a84c", fontSize:16, letterSpacing:2, marginBottom:16 }}>Discover · Rate · Decide</p>
          <h1 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:"clamp(36px,6vw,56px)", fontWeight:700, lineHeight:1.15, marginBottom:20 }}>Find the professor<br/>that's right for you.</h1>
          <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:18, marginBottom:40, fontWeight:300 }}>Student-powered reviews, AI-moderated for quality and fairness.</p>
          <div style={{ position:"relative", maxWidth:480, margin:"0 auto" }}>
            <input className="form-field" placeholder="Search by name, department, or university..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ fontSize:17, padding:"14px 48px 14px 18px", borderRadius:12 }} />
            <span style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", color:"#6b6458", pointerEvents:"none" }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
          </div>
        </div>
      </div>
      <div style={{ background:"#14120e", borderBottom:"1px solid #2a2620", padding:"10px 24px", display:"flex", justifyContent:"center", gap:8, alignItems:"center" }}>
        <span style={{ color:"#4ade80" }}>✦</span>
        <span style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:14 }}>Reviews are instantly moderated by AI — no waiting for approval</span>
      </div>
      <div style={{ background:"#14120e", borderBottom:"1px solid #2a2620", padding:"16px 24px", display:"flex", justifyContent:"center", gap:48 }}>
        {[["Professors",filtered.length],["Reviews",reviews.filter(r=>r.status==="approved").length],["Universities",[...new Set(filtered.map(p=>p.university))].length]].map(([label,val]) => (
          <div key={label} style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'Playfair Display',serif", color:"#c9a84c", fontSize:22, fontWeight:700 }}>{val}</div>
            <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"48px 24px" }}>
        {searchQ && <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", marginBottom:24, fontSize:15 }}>Showing {filtered.length} result{filtered.length!==1?"s":""} for "{searchQ}"</p>}
        {filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:"80px 0", color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:18 }}>No professors found.</div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:24 }}>
            {filtered.map(prof => {
              const pRevs = reviews.filter(r => r.professorId===prof.id && r.status==="approved");
              const avg  = avgRating(prof.ratings,"overall");
              const diff = avgRating(prof.ratings,"difficulty");
              const wta  = wouldTakeAgainPct(prof.ratings);
              return (
                <div key={prof.id} className="card-hover" onClick={() => nav("professor",prof.id)} style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:14, overflow:"hidden", cursor:"pointer" }}>
                  <div style={{ padding:"20px 20px 0" }}>
                    <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                      <img src={prof.photo} alt={prof.name} style={{ width:64, height:64, borderRadius:10, objectFit:"cover", border:"2px solid #2a2620", flexShrink:0 }} onError={e => e.target.src="https://ui-avatars.com/api/?name=Prof&background=2a2620&color=c9a84c"} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <h3 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:17, fontWeight:600, marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{prof.name}</h3>
                        <p style={{ fontFamily:"'Crimson Pro',serif", color:"#c9a84c", fontSize:14 }}>{prof.department}</p>
                        <p style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>{prof.university}</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding:"16px 20px" }}>
                    <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                      {[["OVERALL",avg,"o"],["DIFFICULTY",diff,"d"],["TAKE AGAIN",null,"w"]].map(([lbl,val,t]) => (
                        <div key={lbl} style={{ flex:1, background:"#1e1c18", borderRadius:8, padding:"10px 6px", textAlign:"center" }}>
                          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:19, fontWeight:700, color:t==="o"?ratingColor(avg):t==="d"?(diff>3.5?"#f87171":"#e8dcc8"):(wta>=70?"#4ade80":wta>=40?"#fbbf24":"#f87171") }}>
                            {t==="w"?(prof.ratings.length?wta+"%":"—"):(val>0?val.toFixed(1):"—")}
                          </div>
                          <div style={{ fontFamily:"'Crimson Pro',serif", fontSize:10, color:"#6b6458", marginTop:2, letterSpacing:0.5 }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>{prof.tags.slice(0,2).map(t => <span key={t} className="tag">{t}</span>)}</div>
                    <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>{pRevs.length} review{pRevs.length!==1?"s":""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PROFESSOR PAGE
// =============================================================================
function ProfessorPage({ profId, professors, setProfessors, reviews, setReviews, currentUser, nav, showToast, getUserById }) {
  const prof = professors.find(p => p.id===profId);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({ overall:0, difficulty:0, wouldTakeAgain:true, comment:"" });
  const [submitting, setSubmitting] = useState(false);
  const [moderating, setModerating] = useState(false);

  if (!prof) return <div style={{ color:"#e8dcc8", padding:40, textAlign:"center", fontFamily:"'Crimson Pro',serif" }}>Professor not found.</div>;

  const profReviews = reviews.filter(r => r.professorId===prof.id && r.status==="approved");
  const avg  = avgRating(prof.ratings,"overall");
  const diff = avgRating(prof.ratings,"difficulty");
  const wta  = wouldTakeAgainPct(prof.ratings);

  const handleReview = async () => {
    if (!currentUser)          { showToast("Please log in to leave a review.","error"); nav("login"); return; }
    if (!currentUser.verified) { showToast("Please verify your email before posting reviews.","error"); return; }
    if (form.overall===0||form.difficulty===0) { showToast("Please fill in all ratings.","error"); return; }
    if (form.comment.trim().length<10)         { showToast("Comment must be at least 10 characters.","error"); return; }

    setSubmitting(true); setModerating(true);
    showToast("AI is reviewing your comment...","warn");
    const result = await moderateComment(form.comment.trim(), prof.name);
    setModerating(false);

    const newReview = {
      id:uid(), professorId:prof.id, userId:currentUser.id, username:currentUser.username,
      comment:form.comment.trim(), overall:form.overall, difficulty:form.difficulty,
      wouldTakeAgain:form.wouldTakeAgain, aiVerdict:result.verdict, aiReason:result.reason,
      status:result.verdict==="approved"?"approved":result.verdict==="flagged"?"flagged":"rejected",
      createdAt:now(),
    };

    if (result.verdict !== "rejected") {
      const updRev = [...reviews, newReview];
      setReviews(updRev); LS.set(KEYS.reviews, updRev);
    }

    if (result.verdict==="approved") {
      const upd = professors.map(p => p.id===prof.id ? { ...p, ratings:[...p.ratings,{userId:currentUser.id,overall:form.overall,difficulty:form.difficulty,wouldTakeAgain:form.wouldTakeAgain}]} : p);
      setProfessors(upd); LS.set(KEYS.professors,upd);
    }

    setForm({overall:0,difficulty:0,wouldTakeAgain:true,comment:""}); setShowForm(false); setSubmitting(false);
    if      (result.verdict==="approved") showToast("Review approved and posted!");
    else if (result.verdict==="flagged")  showToast("Your review has been flagged for admin review.","warn");
    else                                  showToast("Review rejected: "+result.reason,"error");
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c", padding:"40px 24px" }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <button onClick={() => nav("home")} style={{ background:"none", border:"none", color:"#9b9082", fontFamily:"'Crimson Pro',serif", fontSize:15, cursor:"pointer", marginBottom:28, display:"flex", alignItems:"center", gap:6 }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to search
        </button>
        <div style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:16, padding:"32px", marginBottom:28, display:"flex", gap:32, alignItems:"flex-start", flexWrap:"wrap" }}>
          <img src={prof.photo} alt={prof.name} style={{ width:120, height:120, borderRadius:14, objectFit:"cover", border:"3px solid #2a2620", flexShrink:0 }} onError={e => e.target.src="https://ui-avatars.com/api/?name=Prof&size=120&background=2a2620&color=c9a84c"} />
          <div style={{ flex:1, minWidth:200 }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:30, fontWeight:700, marginBottom:6 }}>{prof.name}</h1>
            <p style={{ fontFamily:"'Crimson Pro',serif", color:"#c9a84c", fontSize:17, marginBottom:4 }}>{prof.department}</p>
            <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, marginBottom:14 }}>{prof.university}</p>
            {prof.bio && <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, lineHeight:1.6, marginBottom:16 }}>{prof.bio}</p>}
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{prof.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
          </div>
          <div style={{ display:"flex", gap:12, flexShrink:0, flexWrap:"wrap" }}>
            {[["Overall",avg,"o"],["Difficulty",diff,"d"],["Take Again",null,"w"]].map(([lbl,val,t]) => (
              <div key={lbl} style={{ textAlign:"center", background:"#1e1c18", padding:"16px 18px", borderRadius:12, minWidth:80 }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:700, color:t==="o"?ratingColor(avg):t==="d"?(diff>3.5?"#f87171":"#e8dcc8"):(wta>=70?"#4ade80":wta>=40?"#fbbf24":"#f87171") }}>
                  {t==="w"?(prof.ratings.length?wta+"%":"—"):(val>0?val.toFixed(1):"—")}
                </div>
                <div style={{ fontFamily:"'Crimson Pro',serif", fontSize:11, color:"#6b6458", letterSpacing:0.5, marginTop:4 }}>{lbl.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <h2 className="section-title">{profReviews.length} Review{profReviews.length!==1?"s":""}</h2>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>{showForm?"Cancel":"+ Write a Review"}</button>
        </div>

        {showForm && (
          <div style={{ background:"#14120e", border:"1px solid #c9a84c33", borderRadius:14, padding:28, marginBottom:28 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, background:"#1e1c18", padding:"10px 14px", borderRadius:8 }}>
              <span style={{ color:"#4ade80" }}>✦</span>
              <span style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:14 }}>Appropriate reviews go <strong style={{ color:"#e8dcc8" }}>live instantly</strong> after AI review.</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
              <div><label>Overall Rating</label><div style={{ marginTop:8 }}><StarRating value={form.overall} onChange={v => setForm(f => ({ ...f,overall:v }))} size={28} /></div></div>
              <div><label>Difficulty (1=Easy, 5=Hard)</label><div style={{ marginTop:8 }}><StarRating value={form.difficulty} onChange={v => setForm(f => ({ ...f,difficulty:v }))} size={28} /></div></div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label>Would you take this professor again?</label>
              <div style={{ display:"flex", gap:12, marginTop:8 }}>
                {[true,false].map(val => (
                  <button key={String(val)} onClick={() => setForm(f => ({ ...f,wouldTakeAgain:val }))}
                    style={{ padding:"8px 20px", borderRadius:8, fontFamily:"'Crimson Pro',serif", fontSize:15, border:`1px solid ${form.wouldTakeAgain===val?"#c9a84c":"#3a3530"}`, background:form.wouldTakeAgain===val?"#c9a84c22":"#1e1c18", color:form.wouldTakeAgain===val?"#c9a84c":"#9b9082", transition:"all 0.2s" }}>
                    {val?"Yes ✓":"No ✗"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label>Your Review</label>
              <textarea className="form-field" rows={4} placeholder="Share your honest experience with this professor..." value={form.comment} onChange={e => setForm(f => ({ ...f,comment:e.target.value }))} style={{ resize:"vertical", marginTop:6 }} />
            </div>
            <button className="btn-primary" onClick={handleReview} disabled={submitting} style={{ opacity:submitting?0.7:1 }}>
              {moderating?"AI Reviewing...":submitting?"Submitting...":"Submit Review"}
            </button>
          </div>
        )}

        {profReviews.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:17 }}>No reviews yet. Be the first!</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {profReviews.map(rv => {
              const reviewer = getUserById(rv.userId);
              return (
                <div key={rv.id} style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:12, padding:22 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      <button onClick={() => reviewer&&nav("profile",null,rv.userId)} style={{ background:"none", border:"none", cursor:reviewer?"pointer":"default" }}>
                        <Avatar user={reviewer||{username:rv.username}} size={38} />
                      </button>
                      <div>
                        <div style={{ fontFamily:"'Crimson Pro',serif", color:"#e8dcc8", fontSize:15, fontWeight:600 }}>{reviewer?.displayName||rv.username}</div>
                        <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>{fmtDate(rv.createdAt)}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ background:ratingColor(rv.overall), color:"#111", fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:18, padding:"3px 10px", borderRadius:6 }}>{rv.overall.toFixed(1)}</span>
                      <span style={{ fontFamily:"'Crimson Pro',serif", fontSize:13, color:"#9b9082", background:"#1e1c18", padding:"3px 10px", borderRadius:6 }}>Diff: {rv.difficulty}/5</span>
                      <span style={{ fontFamily:"'Crimson Pro',serif", fontSize:12, padding:"3px 10px", borderRadius:6, background:rv.wouldTakeAgain?"#14532d":"#7f1d1d", color:rv.wouldTakeAgain?"#86efac":"#fca5a5" }}>{rv.wouldTakeAgain?"Take again ✓":"Won't take again ✗"}</span>
                      <span style={{ background:"#14532d", color:"#86efac", borderRadius:20, padding:"3px 10px", fontFamily:"'Crimson Pro',serif", fontSize:12 }}>✦ AI Verified</span>
                    </div>
                  </div>
                  <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:16, lineHeight:1.65 }}>{rv.comment}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PROFILE PAGE
// =============================================================================
function ProfilePage({ userId, users, currentUser, reviews, professors, nav, setEditProfileOpen }) {
  const isOwn       = currentUser && currentUser.id===userId;
  const profileUser = userId==="admin" ? ADMIN : (userId===currentUser?.id ? currentUser : users.find(u => u.id===userId));
  if (!profileUser) return <div style={{ minHeight:"100vh", background:"#0f0e0c", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:18 }}>User not found.</span></div>;

  const userReviews = reviews.filter(r => r.userId===userId && r.status==="approved");

  return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c" }}>
      <div style={{ height:180, background:profileUser.banner?`url(${profileUser.banner}) center/cover`:"linear-gradient(135deg,#1a1510 0%,#2a2010 50%,#1a1510 100%)", position:"relative" }}>
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,transparent 40%,#0f0e0c)" }} />
      </div>
      <div style={{ maxWidth:800, margin:"0 auto", padding:"0 24px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:-52, marginBottom:20, position:"relative", zIndex:2 }}>
          <img src={profileUser.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(profileUser.displayName||profileUser.username)}&background=2a2620&color=c9a84c&size=200`}
            alt="" style={{ width:100, height:100, borderRadius:"50%", objectFit:"cover", border:"4px solid #0f0e0c" }}
            onError={e => e.target.src="https://ui-avatars.com/api/?name=U&background=2a2620&color=c9a84c"} />
          {isOwn && (
            <button className="btn-ghost" onClick={() => setEditProfileOpen(true)} style={{ marginBottom:4, display:"flex", alignItems:"center", gap:6 }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Profile
            </button>
          )}
        </div>
        <div style={{ marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:26, fontWeight:700 }}>{profileUser.displayName||profileUser.username}</h1>
            {profileUser.isAdmin && <span style={{ background:"#7f1d1d", color:"#fca5a5", fontFamily:"'Crimson Pro',serif", fontSize:12, padding:"2px 10px", borderRadius:20 }}>Admin</span>}
            {profileUser.verified && !profileUser.isAdmin && <span style={{ background:"#1e3a5f", color:"#93c5fd", fontFamily:"'Crimson Pro',serif", fontSize:12, padding:"2px 10px", borderRadius:20 }}>✓ Verified</span>}
          </div>
          <div style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, marginBottom:10 }}>@{profileUser.username}</div>
          {profileUser.bio && <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:16, lineHeight:1.6, marginBottom:14 }}>{profileUser.bio}</p>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:16 }}>
            {profileUser.location && <span style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:14 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>{profileUser.location}</span>}
            {profileUser.website && <a href={profileUser.website} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"'Crimson Pro',serif", color:"#c9a84c", fontSize:14, textDecoration:"none" }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>{profileUser.website.replace(/^https?:\/\//,"")}</a>}
            <span style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:14 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Joined {fmtDate(profileUser.createdAt)}</span>
          </div>
        </div>
        <div style={{ display:"flex", gap:12, marginBottom:32 }}>
          {[["Reviews Posted",userReviews.length],["Avg Rating Given",userReviews.length?(userReviews.reduce((s,r)=>s+r.overall,0)/userReviews.length).toFixed(1):"—"]].map(([lbl,val]) => (
            <div key={lbl} style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:10, padding:"14px 22px", textAlign:"center", flex:1 }}>
              <div style={{ fontFamily:"'Playfair Display',serif", color:"#c9a84c", fontSize:24, fontWeight:700 }}>{val}</div>
              <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13, marginTop:2 }}>{lbl}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:48 }}>
          <h2 className="section-title" style={{ marginBottom:20 }}>Review History</h2>
          {userReviews.length===0 ? (
            <div style={{ textAlign:"center", padding:"48px 0", color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:16, background:"#14120e", borderRadius:12, border:"1px solid #2a2620" }}>No reviews posted yet.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {userReviews.slice().reverse().map(rv => {
                const prof = professors.find(p => p.id===rv.professorId);
                return (
                  <div key={rv.id} style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:12, padding:20 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                      <button onClick={() => prof&&nav("professor",prof.id)} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"left", padding:0 }}>
                        <div style={{ fontFamily:"'Playfair Display',serif", color:"#c9a84c", fontSize:16, fontWeight:600 }}>{prof?.name||"Unknown Professor"}</div>
                        <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>{prof?.department} · {prof?.university}</div>
                      </button>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ background:ratingColor(rv.overall), color:"#111", fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:16, padding:"3px 10px", borderRadius:6 }}>{rv.overall.toFixed(1)}</span>
                        <span style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>{fmtDate(rv.createdAt)}</span>
                      </div>
                    </div>
                    <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, lineHeight:1.6 }}>{rv.comment}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// LOGIN — no admin credentials shown
// =============================================================================
function LoginPage({ users, setCurrentUser, nav, showToast }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const handle = () => {
    const e = email.trim().toLowerCase();
    if (!e||!password) { showToast("Please fill in all fields.","error"); return; }
    let user;
    if (e===ADMIN.email&&password===ADMIN.password) user=ADMIN;
    else user=users.find(u=>u.email===e&&u.password===password);
    if (!user) { showToast("Invalid email or password.","error"); return; }
    setCurrentUser(user); LS.set(KEYS.session,user);
    showToast("Welcome back, "+(user.displayName||user.username)+"!");
    nav("home");
  };
  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your account">
      <div style={{ marginBottom:18 }}><label>Email Address</label><input className="form-field" type="email" placeholder="you@university.edu" value={email} onChange={e=>setEmail(e.target.value)} style={{ marginTop:6 }}/></div>
      <div style={{ marginBottom:24 }}><label>Password</label><input className="form-field" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={ev=>ev.key==="Enter"&&handle()} style={{ marginTop:6 }}/></div>
      <button className="btn-primary" onClick={handle} style={{ width:"100%", padding:13, fontSize:16 }}>Sign In</button>
      <div style={{ marginTop:20, textAlign:"center", fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:15 }}>
        Don't have an account?{" "}<button onClick={()=>nav("register")} style={{ background:"none", border:"none", color:"#c9a84c", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit" }}>Sign up</button>
      </div>
    </AuthLayout>
  );
}

// =============================================================================
// REGISTER
// =============================================================================
function RegisterPage({ users, nav, showToast, setVerifyModal }) {
  const [form, setForm]       = useState({ email:"", username:"", password:"", confirm:"" });
  const [sending, setSending] = useState(false);
  const handle = async () => {
    const { email, username, password, confirm } = form;
    if (!email||!username||!password||!confirm) { showToast("Please fill in all fields.","error"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Please enter a valid email address.","error"); return; }
    if (password!==confirm) { showToast("Passwords do not match.","error"); return; }
    if (password.length<6)  { showToast("Password must be at least 6 characters.","error"); return; }
    if (users.find(u=>u.email===email.toLowerCase())) { showToast("An account with this email already exists.","error"); return; }
    const code=genCode();
    const userData={ id:uid(), email:email.toLowerCase(), username, password, displayName:username, bio:"", avatar:"", banner:"", location:"", website:"", isAdmin:false, verified:false, createdAt:now() };
    setSending(true);
    const result = await sendVerificationEmail(email.toLowerCase(), username, code);
    setSending(false);
    setVerifyModal({ email:email.toLowerCase(), code, userData });
    if      (result.success) showToast("Verification code sent to your email!");
    else if (result.demo)    showToast("EmailJS not configured — your code is shown on screen.","warn");
    else                     showToast("Could not send email. Check EmailJS config.","error");
  };
  return (
    <AuthLayout title="Join the Community" subtitle="Create your free account">
      {[["Email Address","email","you@university.edu","email"],["Username","username","your_username","text"],["Password","password","Min. 6 characters","password"],["Confirm Password","confirm","Repeat password","password"]].map(([lbl,key,ph,type]) => (
        <div key={key} style={{ marginBottom:16 }}>
          <label>{lbl}</label>
          <input className="form-field" type={type} placeholder={ph} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ marginTop:6 }}/>
        </div>
      ))}
      <div style={{ background:"#1e1c18", borderRadius:8, padding:"10px 14px", marginBottom:20, fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13, display:"flex", gap:8 }}>
        <span style={{ color:"#c9a84c" }}>✉</span>
        <span>A 6-digit verification code will be sent to your email to confirm your account.</span>
      </div>
      <button className="btn-primary" onClick={handle} disabled={sending} style={{ width:"100%", padding:13, fontSize:16 }}>{sending?"Sending Code...":"Send Verification Code"}</button>
      <div style={{ marginTop:20, textAlign:"center", fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:15 }}>
        Already have an account?{" "}<button onClick={()=>nav("login")} style={{ background:"none", border:"none", color:"#c9a84c", cursor:"pointer", fontFamily:"inherit", fontSize:"inherit" }}>Log in</button>
      </div>
    </AuthLayout>
  );
}

function AuthLayout({ title, subtitle, children }) {
  return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <h1 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:30, fontWeight:700, marginBottom:8 }}>{title}</h1>
          <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:16 }}>{subtitle}</p>
        </div>
        <div style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:16, padding:32 }}>{children}</div>
      </div>
    </div>
  );
}

// =============================================================================
// SUBMIT PROFESSOR
// =============================================================================
function SubmitPage({ professors, setProfessors, currentUser, nav, showToast }) {
  const [form, setForm] = useState({ name:"", department:"", university:"", bio:"", photo:"", tags:"" });
  if (!currentUser) return <div style={{ minHeight:"100vh", background:"#0f0e0c", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ textAlign:"center" }}><p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:18, marginBottom:20 }}>You need to be logged in to submit a professor.</p><button className="btn-primary" onClick={()=>nav("login")}>Log In</button></div></div>;
  const handle = () => {
    if (!form.name||!form.department||!form.university) { showToast("Name, department, and university are required.","error"); return; }
    const tags=form.tags.split(",").map(t=>t.trim()).filter(Boolean);
    const newProf={ id:uid(), name:form.name.trim(), department:form.department.trim(), university:form.university.trim(), bio:form.bio.trim(), photo:form.photo||`https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&size=200&background=2a2620&color=c9a84c`, tags, status:"pending", submittedBy:currentUser.id, ratings:[], createdAt:now() };
    const updated=[...professors,newProf]; setProfessors(updated); LS.set(KEYS.professors,updated);
    showToast("Professor submitted! Awaiting admin approval."); nav("home");
  };
  return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c", padding:"48px 24px" }}>
      <div style={{ maxWidth:580, margin:"0 auto" }}>
        <h1 className="section-title" style={{ fontSize:30, marginBottom:8 }}>Submit a Professor</h1>
        <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:16, marginBottom:32 }}>All submissions are reviewed by moderators before going live.</p>
        <div style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:16, padding:32 }}>
          {[["Professor Name *","name","Dr. Jane Smith"],["Department *","department","Computer Science"],["University *","university","State University"]].map(([lbl,key,ph]) => (
            <div key={key} style={{ marginBottom:18 }}><label>{lbl}</label><input className="form-field" placeholder={ph} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ marginTop:6 }}/></div>
          ))}
          <div style={{ marginBottom:18 }}>
            <ImageUpload value={form.photo} onChange={v=>setForm(f=>({...f,photo:v}))} label="Professor Photo" shape="square" size={100}/>
            <p style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13, marginTop:8 }}>Upload from your computer. Max 5MB.</p>
          </div>
          <div style={{ marginBottom:18 }}><label>Biography</label><textarea className="form-field" rows={3} placeholder="Brief description..." value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} style={{ resize:"vertical", marginTop:6 }}/></div>
          <div style={{ marginBottom:28 }}><label>Tags (comma-separated)</label><input className="form-field" placeholder="Inspiring, Tough Grader" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} style={{ marginTop:6 }}/></div>
          <button className="btn-primary" onClick={handle} style={{ width:"100%", padding:13, fontSize:16 }}>Submit for Review</button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ADMIN PANEL
// =============================================================================
function AdminPage({ professors, setProfessors, reviews, setReviews, users, currentUser, nav, showToast }) {
  const [tab, setTab] = useState("flagged");
  const isAdmin = currentUser && (currentUser.isAdmin || currentUser.id==="admin");
  if (!isAdmin) return <div style={{ minHeight:"100vh", background:"#0f0e0c", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ textAlign:"center" }}><p style={{ fontFamily:"'Crimson Pro',serif", color:"#f87171", fontSize:18, marginBottom:20 }}>Access Denied.</p><button className="btn-primary" onClick={()=>nav("home")}>Go Home</button></div></div>;

  const pendingProfs = professors.filter(p=>p.status==="pending");
  const flaggedRevs  = reviews.filter(r=>r.status==="flagged");
  const allProfs     = professors.filter(p=>p.status==="approved");
  const allRevs      = reviews.filter(r=>r.status==="approved");

  const approveProf    = (id) => { const u=professors.map(p=>p.id===id?{...p,status:"approved"}:p); setProfessors(u); LS.set(KEYS.professors,u); showToast("Professor approved."); };
  const deleteProf     = (id) => { const u=professors.filter(p=>p.id!==id); setProfessors(u); LS.set(KEYS.professors,u); showToast("Professor removed."); };
  const approveFlagged = (rv) => {
    const u=reviews.map(r=>r.id===rv.id?{...r,status:"approved"}:r); setReviews(u); LS.set(KEYS.reviews,u);
    const prof=professors.find(p=>p.id===rv.professorId);
    if (prof) { const pu=professors.map(p=>p.id===rv.professorId?{...p,ratings:[...p.ratings,{userId:rv.userId,overall:rv.overall,difficulty:rv.difficulty,wouldTakeAgain:rv.wouldTakeAgain}]}:p); setProfessors(pu); LS.set(KEYS.professors,pu); }
    showToast("Review approved and posted.");
  };
  const deleteRev = (id) => { const u=reviews.filter(r=>r.id!==id); setReviews(u); LS.set(KEYS.reviews,u); showToast("Review deleted."); };

  const tabs=[["flagged",`Flagged by AI (${flaggedRevs.length})`],["pending_profs",`Pending Professors (${pendingProfs.length})`],["all_profs",`All Professors (${allProfs.length})`],["all_reviews",`All Reviews (${allRevs.length})`],["users",`Users (${users.length})`]];

  return (
    <div style={{ minHeight:"100vh", background:"#0f0e0c", padding:"40px 24px" }}>
      <div style={{ maxWidth:1000, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
          <div style={{ width:44, height:44, background:"#7f1d1d", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="22" height="22" fill="none" stroke="#fca5a5" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <h1 style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:26, fontWeight:700 }}>Admin Panel</h1>
            <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:14 }}>Human oversight for AI-flagged content</p>
          </div>
        </div>
        <div style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:12, padding:"12px 18px", marginBottom:24, display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:18 }}>🤖</span>
          <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:14 }}><strong style={{ color:"#e8dcc8" }}>AI auto-moderation active.</strong> Only <span style={{ color:"#fde68a" }}>flagged</span> borderline reviews reach this panel.</p>
        </div>
        <div style={{ display:"flex", borderBottom:"1px solid #2a2620", marginBottom:28, overflowX:"auto" }}>
          {tabs.map(([key,label]) => (
            <button key={key} onClick={()=>setTab(key)} style={{ background:"none", border:"none", borderBottom:`2px solid ${tab===key?"#c9a84c":"transparent"}`, color:tab===key?"#c9a84c":"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:15, padding:"10px 16px 12px", cursor:"pointer", whiteSpace:"nowrap", marginBottom:-1, transition:"color 0.2s" }}>{label}</button>
          ))}
        </div>

        {tab==="flagged" && (
          flaggedRevs.length===0 ? <Empty msg="No flagged reviews — AI is handling everything ✦"/> :
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {flaggedRevs.map(r => {
              const prof=professors.find(p=>p.id===r.professorId);
              return (
                <div key={r.id} style={{ background:"#14120e", border:"1px solid #78350f", borderRadius:12, padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:8 }}>
                    <div>
                      <div style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:16, fontWeight:600, marginBottom:2 }}>Review by <span style={{ color:"#c9a84c" }}>{r.username}</span></div>
                      <div style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:14 }}>For: {prof?.name||"Unknown"} · {fmtDate(r.createdAt)} · {r.overall}/5</div>
                    </div>
                    <span style={{ background:"#78350f", color:"#fde68a", borderRadius:20, padding:"3px 10px", fontFamily:"'Crimson Pro',serif", fontSize:12 }}>🚩 AI Flagged</span>
                  </div>
                  {r.aiReason && <div style={{ background:"#78350f22", border:"1px solid #78350f55", borderRadius:8, padding:"8px 12px", marginBottom:12, fontFamily:"'Crimson Pro',serif", color:"#fde68a", fontSize:13 }}>AI reason: {r.aiReason}</div>}
                  <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, lineHeight:1.6, marginBottom:16 }}>{r.comment}</p>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="btn-approve" onClick={()=>approveFlagged(r)}>Approve & Post ✓</button>
                    <button className="btn-danger" onClick={()=>deleteRev(r.id)}>Delete ✗</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab==="pending_profs" && (
          pendingProfs.length===0 ? <Empty msg="No pending professor submissions."/> :
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {pendingProfs.map(p => <AdminCard key={p.id} title={p.name} subtitle={`${p.department} · ${p.university}`} meta={`Submitted: ${fmtDate(p.createdAt)}`} photo={p.photo} extra={p.bio} actions={<><button className="btn-approve" onClick={()=>approveProf(p.id)}>Approve ✓</button><button className="btn-danger" onClick={()=>deleteProf(p.id)}>Delete ✗</button></>}/>)}
          </div>
        )}
        {tab==="all_profs" && (
          allProfs.length===0 ? <Empty msg="No approved professors."/> :
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {allProfs.map(p => <AdminCard key={p.id} title={p.name} subtitle={`${p.department} · ${p.university}`} meta={`${p.ratings.length} rating(s)`} photo={p.photo} actions={<button className="btn-danger" onClick={()=>deleteProf(p.id)}>Remove ✗</button>}/>)}
          </div>
        )}
        {tab==="all_reviews" && (
          allRevs.length===0 ? <Empty msg="No approved reviews."/> :
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {allRevs.map(r => { const prof=professors.find(p=>p.id===r.professorId); return <AdminCard key={r.id} title={`Review by ${r.username}`} subtitle={`For: ${prof?.name||"Unknown"}`} meta={`${fmtDate(r.createdAt)} · ${r.overall}/5`} extra={r.comment} actions={<button className="btn-danger" onClick={()=>deleteRev(r.id)}>Remove ✗</button>}/>; })}
          </div>
        )}
        {tab==="users" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[ADMIN,...users].map(u => (
              <div key={u.id} style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:10, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <Avatar user={u} size={36}/>
                  <div>
                    <span style={{ fontFamily:"'Crimson Pro',serif", color:"#e8dcc8", fontSize:15, fontWeight:600 }}>{u.displayName||u.username}</span>
                    <span style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:14, marginLeft:10 }}>@{u.username} · {u.email}</span>
                    {u.isAdmin  && <span style={{ marginLeft:8, background:"#7f1d1d", color:"#fca5a5", fontFamily:"'Crimson Pro',serif", fontSize:12, padding:"2px 8px", borderRadius:6 }}>Admin</span>}
                    {!u.isAdmin && u.verified  && <span style={{ marginLeft:8, background:"#1e3a5f", color:"#93c5fd", fontFamily:"'Crimson Pro',serif", fontSize:12, padding:"2px 8px", borderRadius:6 }}>✓ Verified</span>}
                    {!u.isAdmin && !u.verified && <span style={{ marginLeft:8, background:"#2a2620", color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:12, padding:"2px 8px", borderRadius:6 }}>Unverified</span>}
                  </div>
                </div>
                <span style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13 }}>Joined {fmtDate(u.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminCard({ title, subtitle, meta, extra, photo, actions }) {
  return (
    <div style={{ background:"#14120e", border:"1px solid #2a2620", borderRadius:12, padding:20, display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
      {photo && <img src={photo} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:"cover", border:"2px solid #2a2620", flexShrink:0 }} onError={e=>e.target.style.display="none"}/>}
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ fontFamily:"'Playfair Display',serif", color:"#e8dcc8", fontSize:17, fontWeight:600, marginBottom:3 }}>{title}</div>
        <div style={{ fontFamily:"'Crimson Pro',serif", color:"#c9a84c", fontSize:14, marginBottom:4 }}>{subtitle}</div>
        <div style={{ fontFamily:"'Crimson Pro',serif", color:"#6b6458", fontSize:13, marginBottom:extra?8:0 }}>{meta}</div>
        {extra && <p style={{ fontFamily:"'Crimson Pro',serif", color:"#9b9082", fontSize:15, lineHeight:1.6, padding:"10px 14px", background:"#1e1c18", borderRadius:8 }}>{extra}</p>}
      </div>
      <div style={{ display:"flex", gap:8, flexShrink:0, alignItems:"center", flexWrap:"wrap" }}>{actions}</div>
    </div>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ textAlign:"center", padding:"60px 0", color:"#6b6458", fontFamily:"'Crimson Pro',serif", fontSize:17 }}>
      <div style={{ fontSize:32, marginBottom:12 }}>✓</div>{msg}
    </div>
  );
}
