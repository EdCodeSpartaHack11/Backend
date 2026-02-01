import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy,
  where,
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
  return (
    x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.path === "string"
  );
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
async function buildPartsTreeFromRoot(
  rootPartId,
  partsCollectionPath,
  opts,
  visited,
  nodeCountRef,
  completedIds = new Set()
) {
  const { maxDepth = 10, maxNodes = 500 } = opts;

  const colPath = normalizeCollectionPath(partsCollectionPath);
  if (!rootPartId || !colPath) return null;

  async function dfs(partId, depth, parentCompleted) {
    if (!partId) return null;
    if (visited.has(partId)) return null; // avoid cycles
    if (depth > maxDepth) return null;
    if (nodeCountRef.count >= maxNodes) return null;

    visited.add(partId);
    nodeCountRef.count++;

    const partSnap = await getDoc(doc(db, colPath, partId));
    if (!partSnap.exists()) return null;

    const p = partSnap.data();

    // Status Logic
    const isCompleted = completedIds.has(partId);
    let status = "locked";

    if (isCompleted) {
      status = "completed";
    } else if (parentCompleted) {
      status = "open";
    }

    const nextArr = Array.isArray(p.next) ? p.next : [];
    const childIds = nextArr.map(refOrIdToId).filter(Boolean);

    const children = [];
    for (const cid of childIds) {
      const childNode = await dfs(cid, depth + 1, isCompleted);
      if (childNode) children.push(childNode);
    }

    return {
      id: partSnap.id,
      name: p.name || `Part ${partSnap.id}`,
      description: p.description || "",
      project: p.project || false,
      status: status,
      children,
    };
  }

  // Root is always accessible (treat parent as completed)
  return dfs(rootPartId, 0, true);
}

/**
 * ✅ Build a FOREST from track.parts (array of refs/ids)
 * Returns: [treeRoot1, treeRoot2, ...]
 */
async function buildPartsForest(
  trackParts,
  partsCollectionPath,
  completedIds = new Set(),
  opts = {}
) {
  const roots = Array.isArray(trackParts) ? trackParts : [];
  const rootIds = roots.map(refOrIdToId).filter(Boolean);

  if (rootIds.length === 0) return [];

  const visited = new Set();
  const nodeCountRef = { count: 0 };

  const trees = [];
  for (const rid of rootIds) {
    const tree = await buildPartsTreeFromRoot(
      rid,
      partsCollectionPath,
      opts,
      visited,
      nodeCountRef,
      completedIds
    );
    if (tree) trees.push(tree);
  }
  return trees;
}

/* =========================================================
   ✅ BADGE FIX HELPERS
   We compute leaf nodes (nodes with NO children) for each track.
   A track badge is awarded ONLY if ALL leaf nodes under the
   track's main roots (track.parts) are completed.
========================================================= */

async function getPartDataCached(colPath, partId, cache) {
  const key = `${colPath}::${partId}`;
  if (cache.has(key)) return cache.get(key);

  const snap = await getDoc(doc(db, colPath, partId));
  if (!snap.exists()) {
    cache.set(key, null);
    return null;
  }
  const data = snap.data() || {};
  const out = { id: snap.id, data };
  cache.set(key, out);
  return out;
}

/**
 * Traverse from roots and collect leaf IDs.
 * Leaf = a node whose `next` resolves to zero valid child IDs.
 */
async function collectLeafIdsForTrack(track, opts = {}) {
  const { maxDepth = 20, maxNodes = 2000 } = opts;

  const colPath = normalizeCollectionPath(collectionPathFromTrack(track));
  const rootIds = (Array.isArray(track?.parts) ? track.parts : [])
    .map(refOrIdToId)
    .filter(Boolean);

  if (!colPath || rootIds.length === 0) {
    return { leafIds: new Set(), allVisited: new Set() };
  }

  const cache = opts.cache || new Map(); // allow sharing across tracks
  const visited = new Set();
  const leafIds = new Set();
  let nodeCount = 0;

  async function dfs(partId, depth) {
    if (!partId) return;
    if (visited.has(partId)) return;
    if (depth > maxDepth) return;
    if (nodeCount >= maxNodes) return;

    visited.add(partId);
    nodeCount++;

    const got = await getPartDataCached(colPath, partId, cache);
    if (!got) return;

    const nextArr = Array.isArray(got.data?.next) ? got.data.next : [];
    const childIds = nextArr.map(refOrIdToId).filter(Boolean);

    if (childIds.length === 0) {
      leafIds.add(partId);
      return;
    }

    for (const cid of childIds) {
      await dfs(cid, depth + 1);
    }
  }

  for (const rid of rootIds) {
    await dfs(rid, 0);
  }

  return { leafIds, allVisited: visited };
}

// ----------------------
// UI components
// ----------------------
import { Lock, Check, Award } from "lucide-react";

// Variants: 'track', 'project', 'default'
// Status: 'locked', 'completed', 'open' (default)
function NodeCard({
  title,
  subtitle,
  onClick,
  isClickable = false,
  variant = "default",
  status = "open",
}) {
  const isTrack = variant === "track";
  const isProject = variant === "project";

  const isLocked = status === "locked";
  const isCompleted = status === "completed";

  // Game-like styling: Square tiles, thick borders
  let bg, border, titleColor, subColor, shadow;

  if (isTrack) {
    bg = "#ecfdf5";
    border = "#059669"; // Green-600
    titleColor = "#064e3b";
    subColor = "#047857";
    shadow = "0 6px 0 #059669"; // 3D blocky shadow
  } else if (isProject) {
    bg = "#fef2f2";
    border = "#dc2626"; // Red-600
    titleColor = "#991b1b";
    subColor = "#b91c1c";
    shadow = "0 6px 0 #dc2626";
  } else {
    // Default (Part)
    bg = "#fffbeb";
    border = "#d97706"; // Amber-600
    titleColor = "#78350f";
    subColor = "#92400e";
    shadow = "0 6px 0 #d97706";
  }

  // Override styles for Locked state
  if (isLocked) {
    bg = "#f3f4f6"; // gray-100
    border = "#9ca3af"; // gray-400
    titleColor = "#6b7280"; // gray-500
    subColor = "#9ca3af";
    shadow = "0 4px 0 #9ca3af"; // flatter shadow
    isClickable = false; // Disable click
  }

  const dimension = 140; // Square size

  return (
    <div
      onClick={isLocked ? undefined : onClick}
      style={{
        width: dimension,
        height: dimension,
        padding: "16px",
        borderRadius: 16,
        background: bg,
        border: `3px solid ${border}`,
        boxShadow: shadow,
        cursor: isClickable ? "pointer" : "default",
        transition: isClickable ? "all 0.1s ease" : "none",
        transform: "translateY(0)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        position: "relative",
        opacity: isLocked ? 0.8 : 1,
        filter: isLocked ? "grayscale(100%)" : "none",
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = `0 10px 0 ${border}`;
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = shadow;
        }
      }}
      onMouseDown={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(4px)";
          e.currentTarget.style.boxShadow = `0 2px 0 ${border}`;
        }
      }}
      onMouseUp={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = `0 10px 0 ${border}`;
        }
      }}
    >
      {/* Status Badges */}
      {isLocked && (
        <div style={{ marginBottom: 8 }}>
          <Lock size={24} color="#6b7280" strokeWidth={3} />
        </div>
      )}

      {isCompleted && (
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            background: "#fbbf24", // Gold
            borderRadius: "50%",
            padding: 6,
            border: "3px solid white",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <Check size={16} color="white" strokeWidth={4} />
        </div>
      )}

      <div
        style={{
          fontWeight: 800,
          color: titleColor,
          marginBottom: 8,
          fontSize: 15,
          lineHeight: 1.3,
          maxHeight: 60,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        {title}
      </div>
      {subtitle && subtitle !== "\n" && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: subColor,
            opacity: 0.9,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

const NODE_WIDTH = 140;
const GAP_X = 80;

/* =========================================================
   ✅ NEW: subtree width helpers
========================================================= */
function subtreeWidth(node) {
  if (!node?.children?.length) return NODE_WIDTH;

  const childWidths = node.children.map(subtreeWidth);
  const totalChildrenWidth =
    childWidths.reduce((a, b) => a + b, 0) + GAP_X * (childWidths.length - 1);

  return Math.max(NODE_WIDTH, totalChildrenWidth);
}

function childrenLayout(node) {
  const childWidths = (node?.children || []).map(subtreeWidth);
  const totalWidth =
    childWidths.length === 0
      ? NODE_WIDTH
      : childWidths.reduce((a, b) => a + b, 0) + GAP_X * (childWidths.length - 1);
  return { childWidths, totalWidth };
}

/* =========================================================
   ✅ UPDATED: ConnectorSVG now takes childWidths (subtree-aware)
========================================================= */
function ConnectorSVG({ childWidths, count }) {
  const widths =
    Array.isArray(childWidths) && childWidths.length > 0
      ? childWidths
      : Array.from({ length: Math.max(0, count || 0) }, () => NODE_WIDTH);

  const n = widths.length;

  if (n <= 1) {
    return <div style={{ height: 20, width: 4, background: "#cbd5e1" }} />;
  }

  const totalWidth = widths.reduce((a, b) => a + b, 0) + (n - 1) * GAP_X;
  const midY = 10;

  let accX = 0;
  const centers = widths.map((w, i) => {
    const c = accX + w / 2;
    accX += w + (i < n - 1 ? GAP_X : 0);
    return c;
  });

  const firstCenter = centers[0];
  const lastCenter = centers[centers.length - 1];

  return (
    <div
      style={{
        width: totalWidth,
        height: 20,
        position: "relative",
        marginBottom: 0,
      }}
    >
      <svg width={totalWidth} height={20} style={{ overflow: "visible", display: "block" }}>
        <path d={`M ${firstCenter} ${midY} H ${lastCenter}`} stroke="#cbd5e1" strokeWidth="4" fill="none" />
        {centers.map((x, i) => (
          <path key={i} d={`M ${x} ${midY} V 20`} stroke="#cbd5e1" strokeWidth="4" fill="none" />
        ))}
        <path d={`M ${totalWidth / 2} 0 V ${midY}`} stroke="#cbd5e1" strokeWidth="4" fill="none" />
      </svg>
    </div>
  );
}

/* =========================================================
   ✅ UPDATED: TreeNode now lays out children in subtree-width columns
========================================================= */
function TreeNode({ node, onPartClick }) {
  if (!node) return null;

  const hasChildren = node.children?.length > 0;
  const myWidth = subtreeWidth(node);
  const { childWidths, totalWidth } = hasChildren
    ? childrenLayout(node)
    : { childWidths: [], totalWidth: 0 };

  return (
    <div style={{ width: myWidth, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <NodeCard
        title={node.name}
        subtitle={node.description || "\n"}
        onClick={() => onPartClick(node)}
        isClickable
        variant={node.project ? "project" : "default"}
        status={node.status || "open"}
      />

      {hasChildren && (
        <>
          <div style={{ width: 4, height: 20, background: "#cbd5e1" }} />
          <ConnectorSVG childWidths={childWidths} />
          <div style={{ width: totalWidth, display: "flex", gap: GAP_X, alignItems: "flex-start" }}>
            {node.children.map((child, idx) => (
              <div
                key={child.id}
                style={{
                  width: childWidths[idx],
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-start",
                }}
              >
                <TreeNode node={child} onPartClick={onPartClick} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TrackGraph({
  track,
  forest,
  loading,
  error,
  tracks,
  selectedTrackId,
  onSelectTrack,
  onPartClick,
}) {
  const navigate = useNavigate();

  const handleTrackClick = (trackId) => navigate(`/track/${trackId}`);

  const forestWidths = useMemo(() => (forest || []).map(subtreeWidth), [forest]);
  const forestTotalWidth = useMemo(() => {
    if (!forest || forest.length === 0) return 0;
    return forestWidths.reduce((a, b) => a + b, 0) + GAP_X * (forest.length - 1);
  }, [forest, forestWidths]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#111827", marginBottom: 16 }}>
          Tech Tree
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            marginLeft: 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 12 }}>
            Select Path
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {tracks.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTrack(t.id)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: selectedTrackId === t.id ? "3px solid #059669" : "2px solid #e5e7eb",
                  background: selectedTrackId === t.id ? "#ecfdf5" : "white",
                  color: selectedTrackId === t.id ? "#064e3b" : "#374151",
                  fontWeight: 800,
                  cursor: "pointer",
                  transition: "all 0.1s ease",
                  boxShadow: selectedTrackId === t.id ? "0 4px 0 #059669" : "0 4px 0 #e5e7eb",
                  fontSize: 14,
                  transform: selectedTrackId === t.id ? "translateY(2px)" : "translateY(0)",
                }}
              >
                {t.name || t.id}
              </button>
            ))}
          </div>
        </div>

        {loading && <div style={{ marginTop: 8, color: "#6b7280" }}>Loading...</div>}
        {error && <div style={{ marginTop: 8, color: "#b91c1c" }}>{error}</div>}
      </div>

      <div
        style={{
          padding: 40,
          background: "#f1f5f9",
          border: "1px solid #cbd5e1",
          borderRadius: 16,
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.05)",
          overflowX: "auto",
          textAlign: "center",
          minHeight: 600,
          backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: "100%" }}>
          <NodeCard
            title={track?.name || "Track"}
            subtitle={track?.description || "Root"}
            onClick={() => track && handleTrackClick(track.id)}
            isClickable={!!track}
            variant="track"
          />

          {forest?.length > 0 && (
            <>
              <div style={{ width: 4, height: 30, background: "#cbd5e1" }} />
              <ConnectorSVG childWidths={forestWidths} />
              <div style={{ width: forestTotalWidth, display: "flex", gap: GAP_X, alignItems: "flex-start" }}>
                {forest.map((root, idx) => (
                  <div
                    key={root.id}
                    style={{
                      width: forestWidths[idx],
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "flex-start",
                    }}
                  >
                    <TreeNode node={root} onPartClick={onPartClick} />
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && !error && (!forest || forest.length === 0) && (
            <div style={{ marginTop: 24, padding: 20, background: "white", borderRadius: 8, border: "2px dashed #cbd5e1" }}>
              <code style={{ color: "#475569" }}>No tech nodes found.</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ✅ Minimal Track Badge UI
========================================================= */
function TrackBadge({ title, earned, onClick }) {
  const bg = earned ? "#111827" : "#f3f4f6";
  const fg = earned ? "white" : "#6b7280";
  const border = earned ? "#111827" : "#e5e7eb";

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        borderRadius: 12,
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        padding: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        cursor: "pointer",
        transition: "transform 0.08s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      title={earned ? "Badge earned" : "Complete all leaf nodes to earn"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: earned ? "rgba(255,255,255,0.14)" : "white",
            border: earned ? "1px solid rgba(255,255,255,0.18)" : "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {earned ? <Award size={18} color="white" /> : <Award size={18} color="#9ca3af" />}
        </div>
        <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </div>
      </div>

      {earned ? (
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fbbf24",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: "2px solid rgba(255,255,255,0.9)",
          }}
        >
          <Check size={12} color="white" strokeWidth={4} />
        </div>
      ) : (
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#e5e7eb", flexShrink: 0 }} />
      )}
    </button>
  );
}

export default function Dashboard() {
  const days = useMemo(() => getLastNDays(90), []);

  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [track, setTrack] = useState(null);

  const [forest, setForest] = useState([]);
  const [completedIds, setCompletedIds] = useState(new Set()); // Start empty
  const [contributionCounts, setContributionCounts] = useState({}); // YYYY-MM-DD -> count

  /* ✅ Badge state: per-track leaf completion */
  const [trackBadgeEarned, setTrackBadgeEarned] = useState({}); // trackId -> boolean
  const [trackLeafStats, setTrackLeafStats] = useState({}); // trackId -> { leafTotal, leafDone }

  /* Side panel state */
  const [selectedPart, setSelectedPart] = useState(null);

  /* Auth state */
  const [user, setUser] = useState(null);

  const [loadingGraph, setLoadingGraph] = useState(true);
  const [graphError, setGraphError] = useState("");

  const navigate = useNavigate();

  // Scroll detection for side panel
  const panelRef = useRef(null);
  const [hasScrolledBottom, setHasScrolledBottom] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);

  // Reset scroll state when part changes
  useEffect(() => {
    setHasScrolledBottom(false);
    if (panelRef.current) {
      panelRef.current.scrollTop = 0;
      const checkScroll = () => {
        if (panelRef.current) {
          const { scrollHeight, clientHeight } = panelRef.current;
          if (scrollHeight <= clientHeight + 20) {
            setHasScrolledBottom(true);
          }
        }
      };
      checkScroll();
      setTimeout(checkScroll, 100);
    }
  }, [selectedPart]);

  const handlePanelScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setHasScrolledBottom(true);
    }
  };

  const handleMarkCompleted = async () => {
    if (!selectedPart || !user || !user.id || isMarkingComplete) return;

    try {
      setIsMarkingComplete(true);
      const res = await fetch("http://localhost:8000/submit/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, part_id: selectedPart.id }),
      });

      if (res.ok) {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          next.add(selectedPart.id);
          return next;
        });
      } else {
        console.error("Failed to mark complete");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsMarkingComplete(false);
    }
  };

  // ✅ Auth Check (Guest Access Allowed)
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    let currentUser = null;
    if (token && storedUser) {
      try {
        currentUser = JSON.parse(storedUser);
      } catch (e) {
        console.error("Failed to parse user data", e);
      }
    }

    if (!currentUser) {
      currentUser = { name: "Placeholder User", email: "guest@example.com", isGuest: true };
    }

    setUser(currentUser);

    async function fetchContributions() {
      if (currentUser.isGuest || !currentUser.id) return;

      try {
        const q = query(collection(db, "contributions"), where("user_id", "==", currentUser.id));
        const snap = await getDocs(q);
        const ids = new Set();
        const counts = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.part_id) ids.add(data.part_id);
          else ids.add(docSnap.id);

          if (data.completed_at) {
            try {
              const dateStr = new Date(data.completed_at).toISOString().split("T")[0];
              counts[dateStr] = (counts[dateStr] || 0) + 1;
            } catch (e) {
              console.warn("Invalid date in contribution:", data.completed_at);
            }
          }
        });

        setCompletedIds(ids);
        setContributionCounts(counts);
      } catch (err) {
        console.error("Error fetching contributions:", err);
      }
    }

    fetchContributions();
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

        const builtForest = await buildPartsForest(t.parts, partsPath, completedIds, {
          maxDepth: 10,
          maxNodes: 500,
        });

        setForest(builtForest);
      } catch (e) {
        console.error(e);
        setGraphError(String(e?.message || e));
      } finally {
        setLoadingGraph(false);
      }
    }

    build();
  }, [selectedTrackId, tracks, completedIds]);

  /* =========================================================
     ✅ BADGE FIX: recompute earned badges using LEAF NODES
     Badge awarded only if ALL leaf nodes under track.parts
     (the main children under the track root) are completed.
  ========================================================= */
  useEffect(() => {
    let cancelled = false;

    async function computeBadges() {
      if (!tracks || tracks.length === 0) {
        setTrackBadgeEarned({});
        setTrackLeafStats({});
        return;
      }

      const cache = new Map(); // shared doc cache across tracks
      const earnedMap = {};
      const statsMap = {};

      // keep this bounded to avoid runaway fetches
      const opts = { maxDepth: 20, maxNodes: 2500, cache };

      for (const t of tracks) {
        try {
          const { leafIds } = await collectLeafIdsForTrack(t, opts);

          const leafTotal = leafIds.size;
          let leafDone = 0;
          for (const id of leafIds) {
            if (completedIds.has(id)) leafDone++;
          }

          const earned = leafTotal > 0 && leafDone === leafTotal;

          earnedMap[t.id] = earned;
          statsMap[t.id] = { leafTotal, leafDone };
        } catch (e) {
          console.warn("Badge calc failed for track", t?.id, e);
          earnedMap[t.id] = false;
          statsMap[t.id] = { leafTotal: 0, leafDone: 0 };
        }
      }

      if (!cancelled) {
        setTrackBadgeEarned(earnedMap);
        setTrackLeafStats(statsMap);
      }
    }

    computeBadges();

    return () => {
      cancelled = true;
    };
  }, [tracks, completedIds]);

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
              src="/badges/profile/profile.png"
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

          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "600",
              color: "#111827",
              marginBottom: "24px",
            }}
          >
            {user?.name || user?.email || "User"}
          </h3>

          {/* Recent Activity */}
          <div style={{ textAlign: "left", background: "white", padding: "16px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <h4
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Recent Activity
              </h4>
              <span style={{ fontSize: 10, color: "#6b7280" }}>Last 90 Days</span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateRows: "repeat(7, 1fr)", gap: 3, paddingRight: 4, height: 96 }}>
                <span style={{ fontSize: 10, color: "#6b7280", lineHeight: "10px", alignSelf: "center" }}>Mon</span>
                <span />
                <span style={{ fontSize: 10, color: "#6b7280", lineHeight: "10px", alignSelf: "center" }}>Wed</span>
                <span />
                <span style={{ fontSize: 10, color: "#6b7280", lineHeight: "10px", alignSelf: "center" }}>Fri</span>
                <span />
                <span style={{ fontSize: 10, color: "#6b7280", lineHeight: "10px", alignSelf: "center" }}>Sun</span>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingLeft: 2, paddingRight: 2 }}>
                  {[0, 30, 60].map((offset) => {
                    const d = days[offset];
                    return (
                      <span key={offset} style={{ fontSize: 10, color: "#6b7280" }}>
                        {d ? d.toLocaleString("default", { month: "short" }) : ""}
                      </span>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: "repeat(7, 1fr)",
                    gridAutoFlow: "column",
                    gap: 3,
                    height: 96,
                  }}
                >
                  {Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`pad-${i}`} style={{ width: 10, height: 10 }} />
                  ))}

                  {days.map((d) => {
                    const key = formatDateKey(d);
                    const count = contributionCounts[key] || 0;

                    let bg = "#f3f4f6";
                    if (count > 0) bg = "#d1fae5";
                    if (count > 1) bg = "#6ee7b7";
                    if (count > 3) bg = "#10b981";

                    return (
                      <div
                        key={key}
                        title={`${key}: ${count} contribution${count === 1 ? "" : "s"}`}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: bg,
                          border: count === 0 ? "1px solid #e5e7eb" : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ✅ Track Badges (FIXED LOGIC: leaf completion under track.parts) */}
          <div style={{ marginTop: 16, textAlign: "left" }}>
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Track Badges
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {tracks.map((t) => {
                const earned = !!trackBadgeEarned[t.id];
                const stats = trackLeafStats[t.id] || { leafTotal: 0, leafDone: 0 };

                // Use colored badge if earned, grayscale if not
                const badgeSrc = earned
                  ? `/badges/${t.id}.png`
                  : `/badges/${t.id}-gray.png`;

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTrackId(t.id)}
                    title={`${t.name}${earned ? " - Completed!" : ` - ${stats.leafDone}/${stats.leafTotal} completed`}`}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      background: earned ? "#f0fdf4" : "#f9fafb",
                      border: `1px solid ${earned ? "#86efac" : "#e5e7eb"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <img
                      src={badgeSrc}
                      alt={t.name}
                      style={{
                        width: "100%",
                        height: "auto",
                        maxWidth: 60,
                        opacity: earned ? 1 : 0.6
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                );
              })}
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
              ref={panelRef}
              onScroll={handlePanelScroll}
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

              <div
                style={{
                  marginTop: 40,
                  height: 200,
                  background: "#f9fafb",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9ca3af",
                }}
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <p key={i}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et
                    dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
                    aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
                    dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui
                    officia deserunt mollit anim id est laborum.
                  </p>
                ))}
              </div>

              {/* Mark Completed Button */}
              {!selectedPart.project && (
                <div style={{ marginTop: 40, borderTop: "1px solid #e5e7eb", paddingTop: 20, display: "flex", justifyContent: "flex-end" }}>
                  {completedIds.has(selectedPart.id) ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#059669", fontWeight: 700 }}>
                      <Check size={24} />
                      Completed
                    </div>
                  ) : (
                    <button
                      onClick={handleMarkCompleted}
                      disabled={!hasScrolledBottom || isMarkingComplete}
                      style={{
                        padding: "12px 24px",
                        background: hasScrolledBottom ? "#000" : "#e5e7eb",
                        color: hasScrolledBottom ? "white" : "#9ca3af",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: hasScrolledBottom ? "pointer" : "not-allowed",
                        transition: "all 0.2s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {isMarkingComplete ? "Saving..." : hasScrolledBottom ? "Mark as Completed" : "Scroll to finish"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
