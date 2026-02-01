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
async function buildPartsTreeFromRoot(rootPartId, partsCollectionPath, opts, visited, nodeCountRef, completedIds = new Set()) {
  const { maxDepth = 10, maxNodes = 500 } = opts;

  const colPath = normalizeCollectionPath(partsCollectionPath);
  if (!rootPartId || !colPath) return null;

  // recursive DFS
  // parentCompleted: boolean (default true for root)
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

    // If this node is completed, children are unlocked (open/completed depending on their own state).
    // If this node is NOT completed, children are locked.
    // So we pass 'isCompleted' as 'parentCompleted' for the next level.
    // EXCEPT: Projects might be 'open' but not 'completed', allowing access to children?
    // Usually in tech trees, you must COMPLETE a node to unlock children. Let's stick to that.

    const nextArr = Array.isArray(p.next) ? p.next : [];
    const childIds = nextArr.map(refOrIdToId).filter(Boolean);

    const children = [];
    for (const cid of childIds) {
      // Pass THIS node's completion status to children
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
 * ✅ NEW: Build a FOREST from track.parts (array of refs/ids)
 * Returns: [treeRoot1, treeRoot2, ...]
 */
async function buildPartsForest(trackParts, partsCollectionPath, completedIds = new Set(), opts = {}) {
  const roots = Array.isArray(trackParts) ? trackParts : [];
  const rootIds = roots.map(refOrIdToId).filter(Boolean);

  if (rootIds.length === 0) return [];

  const visited = new Set();
  const nodeCountRef = { count: 0 };

  const trees = [];
  for (const rid of rootIds) {
    const tree = await buildPartsTreeFromRoot(rid, partsCollectionPath, opts, visited, nodeCountRef, completedIds);
    if (tree) trees.push(tree);
  }
  return trees;
}

// ----------------------
// UI components
// ----------------------
import { Lock, Check } from "lucide-react";

// Variants: 'track', 'project', 'default'
// Status: 'locked', 'completed', 'open' (default)
function NodeCard({ title, subtitle, onClick, isClickable = false, variant = "default", status = "open" }) {
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

  // Override styles for Completed state (Gold/Green tint or just badge?)
  // Let's keep the color but add a visual indicator

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
        <div style={{
          position: "absolute",
          top: -10,
          right: -10,
          background: "#fbbf24", // Gold
          borderRadius: "50%",
          padding: 6,
          border: "3px solid white",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
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
   This is the key fix so connectors span the full subtree.
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
   Kept a backward-compatible fallback for count usage.
========================================================= */
function ConnectorSVG({ childWidths, count }) {
  // Back-compat: if old prop "count" passed, approximate with fixed NODE_WIDTH
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

  // child centers based on cumulative widths
  let accX = 0;
  const centers = widths.map((w, i) => {
    const c = accX + w / 2;
    accX += w + (i < n - 1 ? GAP_X : 0);
    return c;
  });

  const firstCenter = centers[0];
  const lastCenter = centers[centers.length - 1];

  return (
    <div style={{ width: totalWidth, height: 20, position: "relative", marginBottom: 0 }}>
      <svg width={totalWidth} height={20} style={{ overflow: "visible", display: "block" }}>
        {/* Main Horizontal Bar */}
        <path
          d={`M ${firstCenter} ${midY} H ${lastCenter}`}
          stroke="#cbd5e1"
          strokeWidth="4"
          fill="none"
        />

        {/* Vertical drops to each child */}
        {centers.map((x, i) => (
          <path
            key={i}
            d={`M ${x} ${midY} V 20`}
            stroke="#cbd5e1"
            strokeWidth="4"
            fill="none"
          />
        ))}

        {/* Connection to parent (middle of total width) */}
        <path
          d={`M ${totalWidth / 2} 0 V ${midY}`}
          stroke="#cbd5e1"
          strokeWidth="4"
          fill="none"
        />
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

  // NEW: set this node container width = full subtree width
  const myWidth = subtreeWidth(node);

  // NEW: compute child widths so connector + row match real subtree spans
  const { childWidths, totalWidth } = hasChildren ? childrenLayout(node) : { childWidths: [], totalWidth: 0 };

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
          {/* Stem from parent */}
          <div style={{ width: 4, height: 20, background: "#cbd5e1" }} />

          {/* SVG Connector system (subtree-aware) */}
          <ConnectorSVG childWidths={childWidths} />

          {/* Children Row (each child gets a fixed-width column = its subtree width) */}
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

function TrackGraph({ track, forest, loading, error, tracks, selectedTrackId, onSelectTrack, onPartClick }) {
  const navigate = useNavigate();

  const handleTrackClick = (trackId) => navigate(`/track/${trackId}`);

  // NEW: subtree-aware forest widths for root connector
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
          background: "#f1f5f9", // darker background for contrast
          border: "1px solid #cbd5e1",
          borderRadius: 16,
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.05)",
          overflowX: "auto",
          textAlign: "center",
          minHeight: 600,
          backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", // Dot grid
          backgroundSize: "20px 20px"
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
              {/* Connector from root to forest */}
              <div style={{ width: 4, height: 30, background: "#cbd5e1" }} />

              {/* ✅ subtree-aware root connector */}
              <ConnectorSVG childWidths={forestWidths} />

              {/* ✅ subtree-aware forest row */}
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
  const [completedIds, setCompletedIds] = useState(new Set()); // Start empty

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
      // Check iteratively in case of layout shifts or short content
      const checkScroll = () => {
        if (panelRef.current) {
          const { scrollHeight, clientHeight } = panelRef.current;
          if (scrollHeight <= clientHeight + 20) {
            setHasScrolledBottom(true);
          }
        }
      };
      // Run immediately and after a short tick for layout
      checkScroll();
      setTimeout(checkScroll, 100);
    }
  }, [selectedPart]);

  const handlePanelScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Allow a small buffer (e.g. 10px)
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
        body: JSON.stringify({ user_id: user.id, part_id: selectedPart.id })
      });

      if (res.ok) {
        // Update local state immediately
        setCompletedIds(prev => {
          const next = new Set(prev);
          next.add(selectedPart.id);
          return next;
        });
        // Close panel or show success? Let's just update button state
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
      // Fallback
      currentUser = { name: "Placeholder User", email: "guest@example.com", isGuest: true };
    }

    setUser(currentUser);

    // Fetch contributions if not guest
    async function fetchContributions() {
      if (currentUser.isGuest || !currentUser.id) return;

      try {
        // Find docs where user_id == currentUser.id
        const q = query(collection(db, "contributions"), where("user_id", "==", currentUser.id));
        const snap = await getDocs(q);
        const ids = new Set();
        snap.forEach(doc => {
          // Assuming doc ID is the part ID, or there's a field 'part_id'
          // Let's use both for robustness: if doc ID looks like a part ID, add it; if field exists, add it.
          if (doc.data().part_id) ids.add(doc.data().part_id);
          else ids.add(doc.id);
        });
        console.log("Fetched contributions:", ids);
        setCompletedIds(ids);
      } catch (err) {
        console.error("Error fetching contributions:", err);
        // Don't block UI, just empty set
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

        // ✅ KEY CHANGE: start from track.parts (array) immediately
        const builtForest = await buildPartsForest(t.parts, partsPath, completedIds, {
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
  }, [selectedTrackId, tracks, completedIds]);

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

              {/* Placeholder for content */}
              <div style={{ marginTop: 40, height: 200, background: "#f9fafb", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
                {/* Long content simulation */}
                {Array.from({ length: 5 }).map((_, i) => (
                  <p key={i}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
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
                        gap: 8
                      }}
                    >
                      {isMarkingComplete ? "Saving..." : (hasScrolledBottom ? "Mark as Completed" : "Scroll to finish")}
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
