import React, { useMemo, useState } from "react";

const AMOUNT_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
const RESOURCE_OPTIONS = [
  { id: "R", label: "R" },
  { id: "B", label: "B" },
  { id: "G", label: "G" },
];
const SPEC_OPTIONS = [
  { id: "red", label: "red" },
  { id: "blue", label: "blue" },
  { id: "green", label: "green" },
  { id: "all", label: "all" },
];

const makeAmountNodes = (makeTagBase, supportsContext) =>
  AMOUNT_OPTIONS.map((amount) => ({
    id: String(amount),
    label: String(amount),
    tagBase: makeTagBase(amount),
    supportsContext,
  }));

const makeAmountTagNodes = (makeTag) =>
  AMOUNT_OPTIONS.map((amount) => ({
    id: String(amount),
    label: String(amount),
    tag: makeTag(amount),
  }));

const buildCostReductionNodes = (includeStance = true) => {
  const colorNodes = RESOURCE_OPTIONS.map((res) => ({
    id: res.id,
    label: res.label,
    children: makeAmountNodes((amount) => `fight:cost_reduction:${res.id}${amount}`, true),
  }));
  if (!includeStance) return colorNodes;
  return [
    ...colorNodes,
    {
      id: "stance",
      label: "stance",
      children: makeAmountNodes((amount) => `fight:cost_reduction:stance:${amount}`, true),
    },
  ];
};

const buildProductionNodes = () => [
  ...RESOURCE_OPTIONS.map((res) => ({
    id: res.id,
    label: res.label,
    children: makeAmountNodes((amount) => `production:${res.id}${amount}`, true),
  })),
  {
    id: "stance",
    label: "stance",
    children: makeAmountNodes((amount) => `production:stance:${amount}`, true),
  },
  {
    id: "lowest",
    label: "lowest",
    children: makeAmountNodes((amount) => `production:lowest:${amount}`, true),
  },
];

const EFFECT_TREES = {
  weapon: [
    {
      id: "fight",
      label: "fight",
      children: [
        {
          id: "cost_reduction",
          label: "cost_reduction",
          children: buildCostReductionNodes(false),
        },
        {
          id: "range",
          label: "range",
          children: [
            { id: "any", label: "any", tag: "fight:range:any" },
          ],
        },
      ],
    },
    {
      id: "spec",
      label: "spec",
      children: SPEC_OPTIONS.map((spec) => ({
        id: spec.id,
        label: spec.label,
        tag: `spec:${spec.id}`,
      })),
    },
  ],
  upgrade: [
    {
      id: "production",
      label: "production",
      children: buildProductionNodes(),
    },
    {
      id: "fight",
      label: "fight",
      children: [
        {
          id: "cost_reduction",
          label: "cost_reduction",
          children: buildCostReductionNodes(true),
        },
        {
          id: "range",
          label: "range",
          children: [
            { id: "any", label: "any", tag: "fight:range:any" },
          ],
        },
      ],
    },
    {
      id: "active",
      label: "active",
      children: [
        { id: "mass_token", label: "mass_token", tag: "active:mass_token:once_per_turn" },
        { id: "convert_split", label: "convert_split", tag: "active:convert_split" },
      ],
    },
    {
      id: "mass_token",
      label: "mass_token",
      children: [
        {
          id: "defense_boost",
          label: "defense_boost",
          children: makeAmountTagNodes((amount) => `mass_token:defense_boost:${amount}`),
        },
      ],
    },
    {
      id: "on_kill",
      label: "on_kill",
      children: [
        {
          id: "conversion",
          label: "conversion",
          children: makeAmountTagNodes((amount) => `on_kill:conversion:${amount}`),
        },
        {
          id: "stance_change",
          label: "stance_change",
          children: makeAmountTagNodes((amount) => `on_kill:stance_change:${amount}`),
        },
      ],
    },
    {
      id: "spec",
      label: "spec",
      children: SPEC_OPTIONS.map((spec) => ({
        id: spec.id,
        label: spec.label,
        tag: `spec:${spec.id}`,
      })),
    },
  ],
};

const normalizeContext = (context) => {
  if (!context) return null;
  const lowered = String(context).toLowerCase();
  if (lowered === "day" || lowered === "night") return lowered;
  return lowered;
};

const withContextPrefix = (context, text) => {
  if (!context) return text;
  const label = context === "day" ? "Day" : context === "night" ? "Night" : context;
  return `${label}: ${text}`;
};

export const describeEffectTag = (tag) => {
  if (!tag || typeof tag !== "string") return "Unknown effect.";
  if (tag.startsWith("fight:cost_reduction:")) {
    const payload = tag.slice("fight:cost_reduction:".length);
    const parts = payload.split(":");
    if (parts[0] === "stance") {
      const amount = parseInt(parts[1], 10);
      const context = normalizeContext(parts[2]);
      if (!Number.isNaN(amount)) {
        return withContextPrefix(context, `In a fight: reduce cost by your stance color (${amount}).`);
      }
    } else {
      const resKey = parts[0]?.[0]?.toUpperCase?.();
      const amount = parseInt(parts[0]?.slice(1), 10);
      const context = normalizeContext(parts[1]);
      if (resKey && !Number.isNaN(amount)) {
        return withContextPrefix(context, `In a fight: reduce cost by ${resKey}${amount}.`);
      }
    }
  }
  if (tag.startsWith("fight:range:")) {
    const range = tag.slice("fight:range:".length);
    if (range === "any") return "In a fight: can target any threat position.";
    if (range) return `In a fight: range ${range}.`;
  }
  if (tag.startsWith("production:")) {
    const payload = tag.slice("production:".length);
    const parts = payload.split(":");
    if (parts[0] === "stance") {
      const amount = parseInt(parts[1], 10);
      const context = normalizeContext(parts[2]);
      if (!Number.isNaN(amount)) {
        return withContextPrefix(
          context,
          `Start of turn: gain +${amount} in your stance color (Balanced gains +${amount}B).`
        );
      }
    } else if (parts[0] === "lowest") {
      const amount = parseInt(parts[1], 10);
      const context = normalizeContext(parts[2]);
      if (!Number.isNaN(amount)) {
        return withContextPrefix(context, `Start of turn: gain +${amount} of your lowest resource.`);
      }
    } else {
      const resKey = parts[0]?.[0]?.toUpperCase?.();
      const amount = parseInt(parts[0]?.slice(1), 10);
      const context = normalizeContext(parts[1]);
      if (resKey && !Number.isNaN(amount)) {
        return withContextPrefix(context, `Start of turn: gain +${amount}${resKey}.`);
      }
    }
  }
  if (tag.startsWith("active:mass_token:once_per_turn")) {
    return "Once per turn: spend any token + 2G to gain 1 Mass token.";
  }
  if (tag.startsWith("active:convert_split")) {
    return "Once per turn: convert 1 cube into 1 of each other color.";
  }
  if (tag.startsWith("mass_token:defense_boost:")) {
    const amount = parseInt(tag.split(":")[2], 10);
    if (!Number.isNaN(amount)) {
      return `Mass tokens defend for ${amount}G.`;
    }
  }
  if (tag.startsWith("on_kill:conversion:")) {
    const amount = parseInt(tag.split(":")[2], 10);
    if (!Number.isNaN(amount)) {
      return `On kill: gain ${amount} Conversion token${amount === 1 ? "" : "s"}.`;
    }
  }
  if (tag.startsWith("on_kill:stance_change")) {
    const parts = tag.split(":");
    const amount = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
    if (!Number.isNaN(amount)) {
      return `On kill: gain ${amount} free stance change${amount === 1 ? "" : "s"}.`;
    }
  }
  if (tag.startsWith("spec:")) {
    const spec = tag.slice("spec:".length);
    if (spec) {
      const label = spec === "all" ? "all colors" : spec;
      return `Specialization: ${label}.`;
    }
  }
  return "Unknown effect.";
};

export const buildEffectTextFromTags = (tags, options = {}) => {
  const { includeSpec = false } = options;
  if (!Array.isArray(tags)) return "";
  const normalized = tags
    .map((tag) => (tag === null || tag === undefined ? "" : String(tag).trim()))
    .filter(Boolean);
  const filtered = includeSpec ? normalized : normalized.filter((tag) => !tag.startsWith("spec:"));
  const descriptions = filtered
    .map((tag) => {
      const desc = describeEffectTag(tag);
      return desc === "Unknown effect." ? "" : desc;
    })
    .filter(Boolean);
  return descriptions.join(" ");
};

const getPathNodes = (tree, path) => {
  const resolved = [];
  let current = tree;
  for (const id of path) {
    const match = current.find((node) => node.id === id);
    if (!match) break;
    resolved.push(match);
    current = match.children || [];
  }
  return resolved;
};

export default function EffectTagBuilder({
  cardType = "upgrade",
  tags = [],
  disabled = false,
  label = "Effects",
  onAddTag,
  onRemoveTag,
}) {
  const tree = EFFECT_TREES[cardType] || EFFECT_TREES.upgrade;
  const [path, setPath] = useState([]);
  const pathNodes = useMemo(() => getPathNodes(tree, path), [tree, path]);
  const currentNode = pathNodes[pathNodes.length - 1] || null;
  const options = currentNode ? currentNode.children || [] : tree;
  const isLeaf = currentNode && (currentNode.tag || currentNode.tagBase) && (!currentNode.children || currentNode.children.length === 0);

  const handleAdd = (tag) => {
    if (disabled || !tag) return;
    if (tags.includes(tag)) return;
    if (onAddTag) onAddTag(tag);
    setPath([]);
  };

  const renderTag = (tag) => (
    <div key={tag} className="flex items-start gap-2">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-slate-800 text-[11px] text-slate-200">
        {tag}
        {!disabled && (
          <button
            type="button"
            onClick={() => onRemoveTag && onRemoveTag(tag)}
            className="text-amber-200 hover:text-rose-200"
            aria-label={`Remove tag ${tag}`}
          >
            x
          </button>
        )}
      </span>
      <span className="text-[11px] text-slate-400 leading-tight">{describeEffectTag(tag)}</span>
    </div>
  );

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</label>
        <div className="mt-1 space-y-1">
          {tags.length > 0 ? tags.map(renderTag) : <div className="text-xs text-slate-500">No effects yet.</div>}
        </div>
      </div>

      {!disabled && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Add effect</span>
            {path.length > 0 && (
              <button
                type="button"
                onClick={() => setPath([])}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Reset
              </button>
            )}
          </div>

          {pathNodes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {pathNodes.map((node, idx) => (
                <button
                  key={`${node.id}-${idx}`}
                  type="button"
                  onClick={() => setPath(path.slice(0, idx + 1))}
                  className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800 text-[11px] text-slate-200 hover:border-amber-300"
                >
                  {node.label}
                </button>
              ))}
            </div>
          )}

          {!isLeaf && (
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPath([...path, option.id])}
                  className="px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-[11px] text-slate-200 hover:border-amber-300"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {isLeaf && (
            <div className="space-y-2">
              <div className="text-xs text-slate-300">
                Effect: {describeEffectTag(currentNode.tag || currentNode.tagBase)}
              </div>
              {currentNode.tag && (
                <button
                  type="button"
                  onClick={() => handleAdd(currentNode.tag)}
                  disabled={tags.includes(currentNode.tag)}
                  className="px-3 py-1 rounded-md border border-amber-400 text-amber-200 text-xs hover:bg-amber-400/10 disabled:opacity-50"
                >
                  Add effect
                </button>
              )}
              {currentNode.tagBase && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAdd(currentNode.tagBase)}
                    disabled={tags.includes(currentNode.tagBase)}
                    className="px-3 py-1 rounded-md border border-amber-400 text-amber-200 text-xs hover:bg-amber-400/10 disabled:opacity-50"
                  >
                    Add (any phase)
                  </button>
                  {currentNode.supportsContext && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAdd(`${currentNode.tagBase}:day`)}
                        disabled={tags.includes(`${currentNode.tagBase}:day`)}
                        className="px-3 py-1 rounded-md border border-blue-400 text-blue-200 text-xs hover:bg-blue-400/10 disabled:opacity-50"
                      >
                        Add day
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdd(`${currentNode.tagBase}:night`)}
                        disabled={tags.includes(`${currentNode.tagBase}:night`)}
                        className="px-3 py-1 rounded-md border border-indigo-400 text-indigo-200 text-xs hover:bg-indigo-400/10 disabled:opacity-50"
                      >
                        Add night
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
