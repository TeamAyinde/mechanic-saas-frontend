import React, { useState, useEffect, useMemo } from "react";

const API = "http://127.0.0.1:5000/api";

function parseExpertise(w) {
  const raw = w.specialties || w.services || w.expertise;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return raw.split(",").map(s => s.trim()).filter(Boolean);
  return ["General Repair"];
}

// Car issue -> expertise mapping for live search
const ISSUE_MAP = {
  brake: ["brake", "suspension"], squeak: ["brake"], grinding: ["brake"], squeal: ["brake"],
  engine: ["engine", "diagnostic"], "check engine": ["engine", "diagnostic"], overheating: ["engine", "cooling", "radiator", "ac"], overheat: ["engine", "cooling"],
  battery: ["electrical", "battery"], "won't start": ["electrical", "battery"], dead: ["electrical", "battery"], alternator: ["electrical", "battery"],
  electrical: ["electrical"], wiring: ["electrical"], starter: ["electrical", "battery"],
  oil: ["oil", "maintenance"], "oil change": ["oil"], service: ["oil", "maintenance"],
  ac: ["ac", "cooling"], "not cold": ["ac", "cooling"], cooling: ["ac", "cooling", "radiator"],
  suspension: ["suspension", "brake"], steering: ["suspension", "steering"], shock: ["suspension"],
  tire: ["suspension", "alignment"], alignment: ["suspension", "alignment"],
  hybrid: ["hybrid", "prius"], transmission: ["engine", "transmission"], clutch: ["engine", "transmission"],
  radiator: ["cooling", "radiator"], compressor: ["ac", "compressor"],
};

export default function WorkshopsPage({ workshopsData: propWorkshops = [], navToAuth }) {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);

  // LIVE SEARCH STATE — updates on every keystroke, no submit needed
  const [query, setQuery] = useState(""); // name / specialization / issue
  const [location, setLocation] = useState("");
  const [spec, setSpec] = useState("All");
  const [minRating, setMinRating] = useState("Any");
  const [sortBy, setSortBy] = useState("rating");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [wRes, rRes, fRes] = await Promise.allSettled([
          fetch(`${API}/workshops/available`),
          fetch(`${API}/admin/reviews?limit=500`),
          fetch(`${API}/favorites`),
        ]);
        const wRaw = wRes.status === "fulfilled" && wRes.value.ok ? await wRes.value.json().catch(() => []) : [];
        const rRaw = rRes.status === "fulfilled" && rRes.value.ok ? await rRes.value.json().catch(() => []) : [];
        const fRaw = fRes.status === "fulfilled" && fRes.value.ok ? await fRes.value.json().catch(() => []) : [];
        const workshops = Array.isArray(wRaw) ? wRaw : (wRaw.workshops || wRaw.data || propWorkshops || []);
        const reviews = Array.isArray(rRaw) ? rRaw : (rRaw.reviews || rRaw.data || []);
        const favs = Array.isArray(fRaw) ? fRaw : (fRaw.favorites || fRaw.data || []);
        const ratingMap = {};
        reviews.forEach(r => { if (!r.workshop_id) return; const id = String(r.workshop_id); if (!ratingMap[id]) ratingMap[id] = { sum: 0, n: 0 }; ratingMap[id].sum += Number(r.rating || 0); ratingMap[id].n += 1; });
        const likesMap = {};
        favs.forEach(f => { const wid = String(f.workshop_id || f.workshopId || ""); if (!wid) return; likesMap[wid] = (likesMap[wid] || 0) + 1; });
        const mapped = workshops.map(w => {
          const id = String(w.id); const agg = ratingMap[id];
          const rating = agg && agg.n ? Number((agg.sum / agg.n).toFixed(1)) : Number(w.rating || w.avg_rating || 0);
          const likes = likesMap[id] ?? Number(w.likes || w.favorites_count || 0);
          return { id: w.id, name: w.business_name || w.name || "Workshop", location: w.address || [w.city, w.state].filter(Boolean).join(", ") || "—", rating, reviewsCount: agg?.n ?? Number(w.review_count || 0), likes, image: w.logo || w.image_url || w.image || "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=80", expertise: parseExpertise(w) };
        });
        // Keep all active for browsing (don't force 4.0 here — rating filter handles it)
        setAll(mapped);
      } catch { setAll(propWorkshops.map(w => ({ ...w, expertise: parseExpertise(w), rating: Number(w.rating || 0), likes: Number(w.likes || 0), reviewsCount: 0, location: w.location || "—", image: w.image || "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=600&q=80" }))); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const specOptions = useMemo(() => {
    const set = new Set(["All"]);
    all.forEach(w => w.expertise.forEach(e => set.add(e)));
    return Array.from(set).slice(0, 30);
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    const min = minRating === "Any" ? 0 : parseFloat(minRating);
    let list = all.filter(w => {
      if (loc && !w.location.toLowerCase().includes(loc) && !w.name.toLowerCase().includes(loc)) return false;
      if (spec !== "All" && !w.expertise.join(" ").toLowerCase().includes(spec.toLowerCase())) return false;
      if (w.rating < min) return false;
      if (!q) return true;
      const hay = `${w.name} ${w.location} ${w.expertise.join(" ")}`.toLowerCase();
      if (hay.includes(q)) return true;
      // Issue matching: "brakes squeaking" -> expertise "Brakes", "battery dead" -> "Electrical"
      for (const [kw, exps] of Object.entries(ISSUE_MAP)) {
        if (q.includes(kw) && exps.some(e => hay.includes(e.toLowerCase()))) return true;
      }
      return false;
    });
    if (sortBy === "rating") list.sort((a,b) => (b.rating - a.rating) || (b.likes - a.likes));
    if (sortBy === "likes") list.sort((a,b) => (b.likes - a.likes) || (b.rating - a.rating));
    if (sortBy === "name") list.sort((a,b) => a.name.localeCompare(b.name));
    return list;
  }, [all, query, location, spec, minRating, sortBy]);

  const clearAll = () => { setQuery(""); setLocation(""); setSpec("All"); setMinRating("Any"); setSortBy("rating"); };

  return (
    <div className="container" style={{ paddingTop: 110, paddingBottom: 60 }}>
      <div style={{ marginBottom: 18 }}>
        <span className="archive-tag"><i className="bi bi-patch-check-fill me-1"></i>VERIFIED • ACTIVE SUBSCRIPTION</span>
        <h2 style={{ fontWeight: 900, marginTop: 8 }}>Find a Workshop</h2>
        <p style={{ color: "#6B7A90" }}>Live search — type and results update instantly. Search by workshop, location, specialization, or what's wrong with your car.</p>
      </div>

      {/* LIVE SEARCH BAR */}
      <div style={{ background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 16, padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.06)", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search workshop, specialization, or issue — e.g. brakes squeaking, battery dead, oil change…" style={{ flex: "1 1 320px", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14 }} />
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location — e.g. Inglewood" style={{ flex: "1 1 180px", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14 }} />
          <button onClick={clearAll} className="btn btn-light" style={{ borderRadius: 10 }}>Clear</button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7A90" }}>Specialization&nbsp;
            <select value={spec} onChange={e => setSpec(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, marginLeft: 4 }}>{specOptions.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7A90" }}>Min rating&nbsp;
            <select value={minRating} onChange={e => setMinRating(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, marginLeft: 4 }}><option>Any</option><option>4</option><option>4.5</option><option>4.8</option></select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7A90" }}>Sort&nbsp;
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, marginLeft: 4 }}><option value="rating">Highest rating</option><option value="likes">Most liked</option><option value="name">Name A–Z</option></select>
          </label>
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, fontWeight: 700 }}>{filtered.length} workshop{filtered.length !== 1 ? "s" : ""} found</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {["brakes squeaking", "battery dead", "engine overheating", "oil change", "AC not cold"].map(ex => (
            <button key={ex} onClick={() => setQuery(ex)} style={{ background: "#EEF2FF", color: "#4338CA", border: "none", fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer" }}>Try: {ex}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", fontWeight: 700, color: "#6B7A90" }}>Loading workshops…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#fff", border: "1.5px dashed #CBD5E1", borderRadius: 16, padding: 40, textAlign: "center" }}>
          <h4 style={{ fontWeight: 900 }}>No workshops match</h4>
          <p style={{ color: "#6B7A90" }}>Try another location, specialization or issue.</p>
          <button className="btn btn-outline-primary" onClick={clearAll}>Clear all filters</button>
        </div>
      ) : (
        <div className="archive-list">
          {filtered.map((shop, i) => (
            <div className="archive-row" key={shop.id}>
              <div className="archive-index">0{i + 1}</div>
              <div className="archive-thumb-wrap"><div className="archive-thumb" style={{ backgroundImage: `url(${shop.image})` }}></div><div className="archive-rating-float"><i className="bi bi-star-fill me-1"></i>{shop.rating}</div></div>
              <div className="archive-main"><h3 className="archive-name">{shop.name}</h3><div className="archive-meta"><span className="archive-loc"><i className="bi bi-geo-alt-fill me-1"></i>{shop.location}</span><span className="archive-rating"><span className="dot"></span> {shop.rating} • {shop.reviewsCount} reviews • {shop.likes} likes • Verified</span></div><div className="archive-expertise">{shop.expertise.map(tag => <span key={tag} className="exp-pill">{tag}</span>)}</div></div>
              <div className="archive-action"><button className="archive-btn" onClick={() => navToAuth && navToAuth("owner")}>Book <i className="bi bi-arrow-right ms-1"></i></button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}