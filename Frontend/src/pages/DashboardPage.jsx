import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";

// ----------------------
// Date helpers
// ----------------------
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
// Firestore helpers
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

function normalizeCollectionPath(p) {
  return String(p || "").replace(/^\/+|\/+$/g, "");
}

/**
 * Track chooses which parts collection it connects to.
 * Add this field on track docs:
 *   parts_collection_path: "tracks/<trackId>/parts"  OR  "parts_math"  OR "parts"
 */
function collectionPathFromTrack(track) {
  return normalizeCollectionPath(track?.parts_collection_path || "parts");
}

async function loadTracksOrderedByName() {
  const q = query(collection(db, "track"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Builds a DOWNWARD TREE from a single root part id in the chosen parts collection.
 */
async function buildPartsTreeFromRoot(rootPartId, partsCollectionPath, opts, visited, nodeCountRef) {
  const { maxDepth = 10, maxNodes = 500 } = opts;

  const colPath = normalizeCollectionPath(partsCollectionPath);
  if (!rootPartId || !colPath) return null;

  async function dfs(partId, depth) {
    if (!partId) return null;
    if (visited.has(partId)) return null; // avoid cycles / shared nodes
    if (depth > maxDepth) return null;
    if (nodeCountRef.count >= maxNodes) return null;

    visited.add(partId);
    nodeCountRef.count++;

    const partSnap = await getDoc(doc(db, colPath, partId));
    if (!partSnap.exists()) return null;

    const p = partSnap.data();
    const nextArr = Array.isArray(p.next) ? p.next : [];
    const childIds = nextArr.map(refOrIdToId).filter(Boolean);

    const children = [];
    for (const cid of childIds) {
      const childNode = await dfs(cid, depth + 1);
      if (childNode) children.push(childNode);
    }

    return {
      id: partSnap.id,
      name: p.name || `Part ${partSnap.id}`,
      description: p.description || "",
      project: p.project || false,
      children,
    };
  }

  return dfs(rootPartId, 0);
}

/**
 * ✅ NEW: Build a FOREST from track.parts (array of refs/ids)
 * Returns: [treeRoot1, treeRoot2, ...]
 */
async function buildPartsForest(trackParts, partsCollectionPath, opts = {}) {
  const roots = Array.isArray(trackParts) ? trackParts : [];
  const rootIds = roots.map(refOrIdToId).filter(Boolean);

  if (rootIds.length === 0) return [];

  const visited = new Set();
  const nodeCountRef = { count: 0 };

  const trees = [];
  for (const rid of rootIds) {
    const tree = await buildPartsTreeFromRoot(rid, partsCollectionPath, opts, visited, nodeCountRef);
    if (tree) trees.push(tree);
  }
  return trees;
}

// ----------------------
// UI components
// ----------------------
// Variants: 'track', 'project', 'default'
function NodeCard({ title, subtitle, onClick, isClickable = false, variant = "default" }) {
  const isTrack = variant === "track";
  const isProject = variant === "project";

  // Define colors based on variant
  let bg, border, titleColor, subColor, shadow;

  if (isTrack) {
    bg = "#ecfdf5";
    border = "#10b981";
    titleColor = "#065f46";
    subColor = "#047857";
    shadow = "0 8px 20px rgba(16, 185, 129, 0.15)";
  } else if (isProject) {
    bg = "#fef2f2"; // red-50
    border = "#ef4444"; // red-500
    titleColor = "#991b1b"; // red-800
    subColor = "#b91c1c"; // red-700
    shadow = "0 4px 12px rgba(239, 68, 68, 0.15)";
  } else {
    // Default (Yellow for parts)
    bg = "#fefce8"; // yellow-50
    border = "#eab308"; // yellow-500
    titleColor = "#854d0e"; // yellow-900
    subColor = "#a16207"; // yellow-800
    shadow = "0 4px 12px rgba(234, 179, 8, 0.15)";
  }

  return (
    <div
      onClick={onClick}
      style={{
        width: isTrack ? 320 : 240,
        padding: isTrack ? "16px 20px" : "10px 12px",
        borderRadius: isTrack ? 14 : 10,
        background: bg,
        border: `2px solid ${border}`,
        boxShadow: shadow,
        cursor: isClickable ? "pointer" : "default",
        transition: isClickable ? "all 0.2s ease" : "none",
        transform: "translateY(0)",
        textAlign: isTrack ? "center" : "left",
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = isTrack
            ? "0 10px 25px rgba(16, 185, 129, 0.25)"
            : isProject
              ? "0 8px 20px rgba(239, 68, 68, 0.25)"
              : "0 8px 20px rgba(234, 179, 8, 0.25)";
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = shadow;
        }
      }}
    >
      <div
        style={{
          fontWeight: 800,
          color: titleColor,
          marginBottom: 4,
          fontSize: isTrack ? 16 : 14,
        }}
      >
        {title}
      </div>
      {subtitle && subtitle !== "\n" ? (
        <div
          style={{
            fontSize: isTrack ? 12 : 11,
            color: subColor,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: isTrack ? 2 : 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function TreeNode({ node, onPartClick }) {
  if (!node) return null;

  const hasMultipleChildren = node.children?.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <NodeCard
        title={node.name}
        subtitle={node.description || "\n"}
        onClick={() => onPartClick(node)}
        isClickable
        variant={node.project ? "project" : "default"}
      />

      {node.children?.length > 0 && (
        <>
          <div style={{ height: 20, display: "flex", justifyContent: "center", alignItems: "flex-end", position: "relative" }}>
            <div style={{ width: 2, height: 20, background: "#d1d5db" }} />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: "6px solid #d1d5db",
              }}
            />
          </div>

          {hasMultipleChildren && (
            <div style={{ position: "relative", width: "100%", height: 16 }}>
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: `${(node.children.length - 1) * 340 + 160}px`,
                  height: "16px",
                  overflow: "visible",
                }}
              >
                {node.children.map((_, index) => {
                  const totalWidth = (node.children.length - 1) * 340;
                  const startX = totalWidth / 2 + 80;
                  const endX = startX + (index - (node.children.length - 1) / 2) * 340;

                  return (
                    <g key={index}>
                      <path d={`M ${startX} 0 Q ${startX} 8 ${endX} 16`} stroke="#d1d5db" strokeWidth="2" fill="none" />
                      <polygon points={`${endX - 3},12 ${endX + 3},12 ${endX},18`} fill="#d1d5db" />
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          <div style={{ display: "flex", gap: 60, alignItems: "flex-start" }}>
            {node.children.map((child) => (
              <div key={child.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {!hasMultipleChildren && (
                  <div style={{ height: 16, display: "flex", justifyContent: "center", alignItems: "flex-end", position: "relative" }}>
                    <div style={{ width: 2, height: 16, background: "#d1d5db" }} />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        width: 0,
                        height: 0,
                        borderLeft: "4px solid transparent",
                        borderRight: "4px solid transparent",
                        borderTop: "6px solid #d1d5db",
                      }}
                    />
                  </div>
                )}

                {hasMultipleChildren && (
                  <div style={{ height: 4, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <div style={{ width: 2, height: 4, background: "#d1d5db" }} />
                  </div>
                )}

                <TreeNode node={child} onPartClick={onPartClick} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TrackGraph({ track, forest, loading, error, tracks, selectedTrackId, onSelectTrack, onPartClick }) {
  const navigate = useNavigate();

  const handleTrackClick = (trackId) => navigate(`/track/${trackId}`);
  /* handlePartClick moved to Dashboard parent */

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#111827", marginBottom: 16 }}>
          Learning Paths
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            marginLeft: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 12 }}>
            Select Track
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTrack(t.id)}
                style={{
                  padding: "12px 18px",
                  borderRadius: 10,
                  border: selectedTrackId === t.id ? "2px solid #10b981" : "1px solid #e5e7eb",
                  background: selectedTrackId === t.id ? "#ecfdf5" : "white",
                  color: selectedTrackId === t.id ? "#065f46" : "#374151",
                  fontWeight: selectedTrackId === t.id ? 600 : 500,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: selectedTrackId === t.id ? "0 2px 8px rgba(16, 185, 129, 0.2)" : "0 1px 3px rgba(0,0,0,0.1)",
                  fontSize: 14,
                }}
              >
                {t.name || t.id}
              </button>
            ))}
          </div>
        </div>

        {loading && <div style={{ marginTop: 8, color: "#6b7280", marginLeft: 20 }}>Loading graph…</div>}
        {error && <div style={{ marginTop: 8, color: "#b91c1c", marginLeft: 20 }}>{error}</div>}
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
            subtitle={track?.description || "Click to view track details"}
            onClick={() => track && handleTrackClick(track.id)}
            isClickable={!!track}
            variant="track"
          />
        </div>

        {forest?.length > 0 && (
          <>
            {/* Connection from track to forest roots */}
            <div style={{ height: 24, display: "flex", justifyContent: "center", alignItems: "flex-end", position: "relative" }}>
              <div style={{ width: 2, height: 24, background: "#d1d5db" }} />
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "6px solid #d1d5db",
                }}
              />
            </div>

            {/* Multiple connections if more than one root */}
            {forest.length > 1 && (
              <div style={{ position: "relative", width: "100%", height: 20 }}>
                <svg
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: `${(forest.length - 1) * 360 + 200}px`,
                    height: "20px",
                    overflow: "visible",
                  }}
                >
                  {forest.map((_, index) => {
                    const totalWidth = (forest.length - 1) * 360;
                    const startX = totalWidth / 2 + 100;
                    const endX = startX + (index - (forest.length - 1) / 2) * 360;

                    return (
                      <g key={index}>
                        <path
                          d={`M ${startX} 0 Q ${startX} 10 ${endX} 20`}
                          stroke="#d1d5db"
                          strokeWidth="2"
                          fill="none"
                        />
                        <polygon
                          points={`${endX - 4},16 ${endX + 4},16 ${endX},24`}
                          fill="#d1d5db"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", gap: 60, flexWrap: "wrap" }}>
              {forest.map((root, index) => (
                <div key={root.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {/* Single root gets a straight connection, multiple roots get small connectors */}
                  {forest.length === 1 && (
                    <div style={{ height: 16, display: "flex", justifyContent: "center", alignItems: "flex-end", position: "relative" }}>
                      <div style={{ width: 2, height: 16, background: "#d1d5db" }} />
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          width: 0,
                          height: 0,
                          borderLeft: "4px solid transparent",
                          borderRight: "4px solid transparent",
                          borderTop: "6px solid #d1d5db",
                        }}
                      />
                    </div>
                  )}

                  {forest.length > 1 && (
                    <div style={{ height: 8, display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <div style={{ width: 2, height: 8, background: "#d1d5db" }} />
                    </div>
                  )}

                  <TreeNode node={root} onPartClick={onPartClick} />
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && !error && (!forest || forest.length === 0) && (
          <div style={{ marginTop: 16, textAlign: "center", color: "#6b7280" }}>
            No parts found. Make sure <code>track.parts</code> is an array of part refs/ids in the track’s parts collection.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
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

  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [track, setTrack] = useState(null);

  // ✅ forest instead of single tree
  const [forest, setForest] = useState([]);

  /* Side panel state */
  const [selectedPart, setSelectedPart] = useState(null);

  /* Auth state */
  const [user, setUser] = useState(null);

  const [loadingGraph, setLoadingGraph] = useState(true);
  const [graphError, setGraphError] = useState("");

  const navigate = useNavigate();

  // ✅ Auth Check (Guest Access Allowed)
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user data", e);
        // Fallback to placeholder
        setUser({ name: "Placeholder User", email: "guest@example.com" });
      }
    } else {
      // No auth -> Placeholder User
      setUser({ name: "Placeholder User", email: "guest@example.com" });
    }
  }, [navigate]);

  const handlePartClick = (node) => {
    if (node.project) {
      navigate(`/editor?partId=${node.id}`);
    } else {
      setSelectedPart(node);
    }
  };

  useEffect(() => {
    async function run() {
      try {
        setLoadingGraph(true);
        setGraphError("");

        const all = await loadTracksOrderedByName();
        if (all.length === 0) {
          setTracks([]);
          setSelectedTrackId("");
          setTrack(null);
          setForest([]);
          setGraphError("No tracks found in collection: track");
          return;
        }

        setTracks(all);
        setSelectedTrackId(all[0].id);
      } catch (e) {
        console.error(e);
        setGraphError(String(e?.message || e));
      } finally {
        setLoadingGraph(false);
      }
    }
    run();
  }, []);

  // ✅ Rebuild the forest when selection changes
  useEffect(() => {
    async function build() {
      if (!selectedTrackId || tracks.length === 0) return;

      try {
        setLoadingGraph(true);
        setGraphError("");

        const t = tracks.find((x) => x.id === selectedTrackId);
        if (!t) {
          setTrack(null);
          setForest([]);
          setGraphError("Selected track not found.");
          return;
        }

        setTrack(t);

        const partsPath = collectionPathFromTrack(t);

        // ✅ KEY CHANGE: start from track.parts (array) immediately
        const builtForest = await buildPartsForest(t.parts, partsPath, {
          maxDepth: 10,
          maxNodes: 500,
        });

        setForest(builtForest);

        console.log("Selected track:", t);
        console.log("Using parts collection:", partsPath);
        console.log("Built forest:", builtForest);
      } catch (e) {
        console.error(e);
        setGraphError(String(e?.message || e));
      } finally {
        setLoadingGraph(false);
      }
    }

    build();
  }, [selectedTrackId, tracks]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      {/* Sidebar */}
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
          <div style={{ marginBottom: "16px" }}>
            <img
              src="/assets/.png"
              alt="Profile"
              style={{
                width: "60%",
                maxWidth: 160,
                minWidth: 80,
                height: "auto",
                aspectRatio: "1/1",
                borderRadius: "50%",
                objectFit: "cover",
                border: "3px solid #e5e7eb",
                boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              }}
            />
          </div>

          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "600", color: "#111827", marginBottom: "24px" }}>
            {user?.name || user?.email || "User"}
          </h3>

          {/* Recent Activity (unchanged mock) */}
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

              <div style={{ fontSize: "11px", color: "#6b7280", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Last 90 days</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px" }}>Less</span>
                  <div style={{ display: "flex", gap: "2px" }}>
                    <div style={{ width: "8px", height: "8px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "2px" }} />
                    <div style={{ width: "8px", height: "8px", background: "#10b981", border: "1px solid #e7e7eb", borderRadius: "2px" }} />
                  </div>
                  <span style={{ fontSize: "10px" }}>More</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: 24 }}>
        <TrackGraph
          track={track}
          forest={forest}
          loading={loadingGraph}
          error={graphError}
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onPartClick={handlePartClick}
        />

        {/* Side Panel Overlay */}
        {selectedPart && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setSelectedPart(null)}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                background: "rgba(0,0,0,0.3)",
                zIndex: 40,
              }}
            />
            {/* Panel */}
            <div
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                width: "75%",
                height: "100vh",
                background: "white",
                zIndex: 50,
                boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
                padding: "40px",
                overflowY: "auto",
                transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                transform: selectedPart ? "translateX(0)" : "translateX(100%)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
                <h2 style={{ fontSize: 32, fontWeight: 800, color: "#111827", margin: 0 }}>
                  {selectedPart.name}
                </h2>
                <button
                  onClick={() => setSelectedPart(null)}
                  style={{
                    background: "#f3f4f6",
                    border: "none",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    color: "#4b5563",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: 18, lineHeight: 1.6, color: "#4b5563" }}>
                {selectedPart.description || "No description available."}
              </div>

              {/* Placeholder for content */}
              <div style={{ marginTop: 40, height: 200, background: "#f9fafb", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
                Content Placeholder
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
