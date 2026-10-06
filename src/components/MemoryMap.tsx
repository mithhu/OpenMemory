import { useState, type CSSProperties } from "react";
import { ArrowUpRight, Orbit } from "lucide-react";
import { categoryMeta, type Category, type Connection, type Memory } from "@/lib/memory";
import { categoryIcons } from "./memory-icons";
// Stable spatial layout; distance is decorative. Links come from cited relationships.
const positions = [
  [20, 27],
  [37, 55],
  [66, 20],
  [51, 32],
  [80, 46],
  [70, 72],
  [22, 75],
  [12, 51],
  [37, 13],
  [51, 81],
  [84, 20],
  [88, 76],
  [10, 15],
  [60, 56],
  [35, 83],
  [10, 82],
  [74, 89],
  [54, 12],
];
interface Props {
  memories: Memory[];
  connections: Connection[];
  selectedId: string | null;
  highlightedIds: string[];
  onSelect: (id: string) => void;
  busy: boolean;
}
export function MemoryMap({
  memories,
  connections,
  selectedId,
  highlightedIds,
  onSelect,
  busy,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(memories.length / positions.length));
  const safePage = Math.min(page, pageCount - 1);
  // Updates keep their spatial position; newly created memories append to the map.
  const chronological = [...memories].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const visible = chronological.slice(
    safePage * positions.length,
    (safePage + 1) * positions.length,
  );
  const points = new Map(visible.map((m, i) => [m.id, positions[i] ?? [50, 50]]));
  const focusIds = highlightedIds.length
    ? highlightedIds
    : hoveredId || selectedId
      ? [hoveredId || selectedId || ""]
      : [];
  const active = new Set(focusIds);
  connections.forEach((c) => {
    if (focusIds.includes(c.from) || focusIds.includes(c.to)) {
      active.add(c.from);
      active.add(c.to);
    }
  });
  const links = connections.filter((c) => points.has(c.from) && points.has(c.to));
  return (
    <div className={`memory-map ${busy ? "is-thinking" : ""}`}>
      <div className="map-grain" />
      <div className="map-coordinates map-coordinates-top">YOUR INNER UNIVERSE</div>
      <div className="map-coordinates map-coordinates-bottom">
        EVERY LITTLE THING IS PART OF SOMETHING BIGGER
      </div>
      <svg
        className="map-lines"
        viewBox="0 0 1000 480"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="orbitGlow">
            <stop offset="0%" stopColor="#a995e7" stopOpacity=".07" />
            <stop offset="100%" stopColor="#a995e7" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="linkGradient">
            <stop stopColor="#a899dd" stopOpacity=".35" />
            <stop offset="1" stopColor="#83bfbc" stopOpacity=".35" />
          </linearGradient>
        </defs>
        <ellipse cx="500" cy="240" rx="330" ry="205" fill="url(#orbitGlow)" />
        {[95, 170, 260, 350].map((r) => (
          <ellipse key={r} cx="500" cy="240" rx={r} ry={r * 0.62} className="orbit-ring" />
        ))}
        <line x1="500" y1="15" x2="500" y2="460" className="map-axis" />
        <line x1="20" y1="240" x2="980" y2="240" className="map-axis" />
        {links.map((c) => {
          const [x1 = 0, y1 = 0] = points.get(c.from) ?? [];
          const [x2 = 0, y2 = 0] = points.get(c.to) ?? [];
          const focused = focusIds.includes(c.from) || focusIds.includes(c.to);
          const bend = (x1 + y2) % 2 ? -26 : 26;
          return (
            <path
              key={`${c.from}-${c.to}`}
              d={`M ${x1 * 10} ${y1 * 4.8} Q ${(x1 + x2) * 5 + bend} ${(y1 + y2) * 2.4 - 24} ${x2 * 10} ${y2 * 4.8}`}
              className={`map-link ${c.basis === "inferred" ? "is-inferred" : ""} ${focused ? "is-active" : ""} ${focusIds.length && !focused ? "is-muted" : ""}`}
            >
              <title>
                {c.basis === "inferred" ? "Possible connection · " : ""}
                {c.label}: {c.reason}
              </title>
            </path>
          );
        })}
      </svg>
      {!visible.length && (
        <div className="map-empty">
          <Orbit size={48} strokeWidth={1} />
          <h3>A universe starts with one thought.</h3>
          <p>Add a memory above. The connections will follow.</p>
        </div>
      )}
      {visible.map((memory, i) => {
        const [x = 50, y = 50] = positions[i] ?? [];
        const Icon = categoryIcons[memory.category];
        const degree = links.filter((c) => c.from === memory.id || c.to === memory.id).length;
        return (
          <button
            key={memory.id}
            className={`map-node ${selectedId === memory.id ? "is-selected" : ""} ${focusIds.length && !active.has(memory.id) ? "is-dimmed" : ""}`}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                "--node-color": categoryMeta[memory.category].color,
                "--node-delay": `${i * 45}ms`,
              } as CSSProperties
            }
            onClick={() => onSelect(memory.id)}
            onMouseEnter={() => setHoveredId(memory.id)}
            onMouseLeave={() => setHoveredId(null)}
            aria-label={`Open memory: ${memory.title}`}
          >
            <span className={`node-orb ${degree > 1 ? "has-connections" : ""}`}>
              <Icon size={18} strokeWidth={1.5} />
              {degree > 0 && <span className="node-count">{degree}</span>}
            </span>
            <span className="node-title">{memory.title}</span>
          </button>
        );
      })}
      {busy && (
        <div className="map-processing">
          <span className="processing-dot" /> Astra is updating your connections
        </div>
      )}
      {pageCount > 1 && (
        <div className="map-pages">
          <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            ←
          </button>
          <span>
            {safePage + 1} / {pageCount}
          </span>
          <button disabled={safePage === pageCount - 1} onClick={() => setPage(safePage + 1)}>
            →
          </button>
        </div>
      )}
    </div>
  );
}
export function CategoryLegend({ categories }: { categories: Category[] }) {
  return (
    <div className="category-legend">
      {categories.map((cat) => (
        <span key={cat}>
          <i style={{ background: categoryMeta[cat].color }} />
          {categoryMeta[cat].label}
        </span>
      ))}
      <span className="legend-hint">
        Click a memory to explore <ArrowUpRight size={12} />
      </span>
    </div>
  );
}
