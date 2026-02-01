import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLastNDays(n = 90) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

// ----------------------
// Graph helpers
// ----------------------
function isDocRef(x) {
  return x && typeof x === "object" && typeof x.id === "string" && typeof x.path === "string";
}

function refOrIdToId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (isDocRef(x)) return x.id;
  return null;
}

async function loadFirstTrack() {
  const snap = await getDocs(collection(db, "track")); // your collection name
  if (snap.empty) return null;

  // pick the first track doc (you can later choose by id)
  const first = snap.docs[0];
  return { id: first.id, ...first.data() };
}

/**
 * Traverses:
 * track.first_part -> parts/{id}.next -> parts/{id}.next -> ...
 *
 * Assumptions:
 * - parts are in collection "parts"
 * - each part doc may have { name, description, next }
 */
async function buildPartsChain(firstPart) {
  const steps = [];
  const visited = new Set();
  const MAX = 200;

  let curId = refOrIdToId(firstPart);
  let safety = 0;

  while (curId && safety < MAX) {
    safety++;

    if (visited.has(curId)) break;
    visited.add(curId);

    const partSnap = await getDoc(doc(db, "parts", curId));
    if (!partSnap.exists()) break;

    const p = partSnap.data();

    steps.push({
      id: partSnap.id,
      name: p.name || `Part ${steps.length + 1}`,
      description: p.description || "",
      next: p.next ?? null,
    });

    curId = refOrIdToId(p.next);
  }

  return steps;
}

// UI components
function NodeCard({ title, subtitle, onClick, isClickable = false }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 360,
        padding: "14px 16px",
        borderRadius: 14,
        background: "white",
        border: "1px solid #e5e7eb",
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        cursor: isClickable ? "pointer" : "default",
        transition: isClickable ? "all 0.2s ease" : "none",
        transform: "translateY(0)",
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.target.style.transform = "translateY(-2px)";
          e.target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.target.style.transform = "translateY(0)";
          e.target.style.boxShadow = "0 6px 18px rgba(0,0,0,0.06)";
        }
      }}
    >
      <div style={{ fontWeight: 800, color: "#111827", marginBottom: 6 }}>
        {title}
        {isClickable && (
          <span style={{ 
            marginLeft: "8px", 
            fontSize: "14px", 
            color: "#10b981",
            fontWeight: "normal"
          }}>
            →
          </span>
        )}
      </div>
      {subtitle ? <div style={{ fontSize: 12, color: "#6b7280" }}>{subtitle}</div> : null}
    </div>
  );
}

function TrackGraph({ track, steps, loading, error }) {
  const navigate = useNavigate();

  const handleTrackClick = (trackId) => {
    navigate(`/track/${trackId}`);
  };

  const handlePartClick = (partId) => {
    navigate(`/part/${partId}`);
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#111827" }}>Learning Path</div>
        <div style={{ color: "#6b7280", marginTop: 6 }}>
          {track?.description || "Your connected track → parts graph."}
        </div>

        {loading && <div style={{ marginTop: 8, color: "#6b7280" }}>Loading graph…</div>}
        {error && <div style={{ marginTop: 8, color: "#b91c1c" }}>{error}</div>}
      </div>

      <div
        style={{
          padding: 24,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <NodeCard 
            title={track?.name || "Track"} 
            subtitle="Click to view track details" 
            onClick={() => track && handleTrackClick(track.id)}
            isClickable={!!track}
          />
        </div>

        {steps.length > 0 && (
          <div style={{ height: 28, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 2, height: 28, background: "#d1d5db" }} />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {steps.map((s, idx) => {
            const last = idx === steps.length - 1;
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <NodeCard 
                  title={s.name} 
                  subtitle={s.description || `Step ${idx + 1} - Click to view`}
                  onClick={() => handlePartClick(s.id)}
                  isClickable={true}
                />
                {!last && (
                  <div style={{ height: 30, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <div style={{ width: 2, height: 30, background: "#d1d5db" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && !error && steps.length === 0 && (
          <div style={{ marginTop: 16, textAlign: "center", color: "#6b7280" }}>
            No parts found. Check that track.first_part points to an existing doc in <code>parts</code>.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  // ---- Sidebar: mock activity (unchanged) ----
  const days = useMemo(() => getLastNDays(90), []);
  const mockCounts = useMemo(() => {
    const m = {};
    m[formatDateKey(days[5])] = 1;
    m[formatDateKey(days[12])] = 2;
    m[formatDateKey(days[25])] = 1;
    m[formatDateKey(days[35])] = 3;
    m[formatDateKey(days[48])] = 1;
    m[formatDateKey(days[62])] = 2;
    m[formatDateKey(days[75])] = 1;
    m[formatDateKey(days[82])] = 2;
    m[formatDateKey(days[87])] = 1;
    return m;
  }, [days]);

  // ---- Main area: track graph ----
  const [track, setTrack] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [graphError, setGraphError] = useState("");

  useEffect(() => {
    async function run() {
      try {
        setLoadingGraph(true);
        setGraphError("");

        const t = await loadFirstTrack();
        if (!t) {
          setTrack(null);
          setSteps([]);
          setGraphError("No tracks found in collection: track");
          return;
        }

        setTrack(t);

        const chain = await buildPartsChain(t.first_part);
        setSteps(chain);

        // optional: log for debugging
        console.log("Loaded track:", t);
        console.log("Loaded chain:", chain);
      } catch (e) {
        console.error(e);
        setGraphError(String(e?.message || e));
      } finally {
        setLoadingGraph(false);
      }
    }

    run();
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      {/* Sidebar: 1/4 width */}
      <aside
        style={{
          width: "25%",
          minWidth: 240,
          borderRight: "1px solid #e5e7eb",
          background: "white",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "80%",
            textAlign: "center",
          }}
        >
          <div style={{ width: "100%", aspectRatio: "1", marginBottom: "16px" }}>
            <img
              src="/assets/.png"
              alt="Profile"
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                objectFit: "cover",
                border: "3px solid #e5e7eb",
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              }}
            />
          </div>

          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "600",
              color: "#111827",
              marginBottom: "24px",
            }}
          >
            Kanha Singh
          </h3>

          {/* Recent Activity Section */}
          <div style={{ textAlign: "left" }}>
            <h4
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Recent Activity
            </h4>

            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(15, 1fr)",
                  gap: 1,
                  marginBottom: "12px",
                }}
              >
                {days.map((d) => {
                  const key = formatDateKey(d);
                  const count = mockCounts[key] || 0;
                  const bg = count > 0 ? "#10b981" : "#f3f4f6";
                  const border = "#e5e7eb";

                  return (
                    <div
                      key={key}
                      title={`${key} • ${count} contribution${count === 1 ? "" : "s"}`}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "3px",
                        background: bg,
                        border: `1px solid ${border}`,
                        boxShadow: count > 0 ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      }}
                    />
                  );
                })}
              </div>

              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Last 90 days</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px" }}>Less</span>
                  <div style={{ display: "flex", gap: "2px" }}>
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        borderRadius: "2px",
                      }}
                    />
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        background: "#10b981",
                        border: "1px solid #e5e7eb",
                        borderRadius: "2px",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "10px" }}>More</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main style={{ flex: 1, padding: 24 }}>
        <TrackGraph track={track} steps={steps} loading={loadingGraph} error={graphError} />
      </main>
    </div>
  );
}