import React from "react";
import { Flame, Zap, Shield } from "lucide-react";

const RESOURCE_META = {
  R: { Icon: Flame, className: "text-red-300" },
  B: { Icon: Zap, className: "text-blue-300" },
  G: { Icon: Shield, className: "text-green-300" },
};

export function ResourceIcon({ resource, size = 12, className = "" }) {
  const meta = RESOURCE_META[resource];
  if (!meta) return null;
  const Icon = meta.Icon;
  const classes = [meta.className, className].filter(Boolean).join(" ");
  return <Icon size={size} className={classes} />;
}

export function ResourceCost({ parts, iconSize = 12, className = "", itemClassName = "", zeroLabel = "0" }) {
  if (!parts || !parts.length) {
    return <span className={["text-slate-300", className].filter(Boolean).join(" ")}>{zeroLabel}</span>;
  }

  return (
    <span className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}>
      {parts.map((p) => {
        const meta = RESOURCE_META[p.key] || {};
        const Icon = meta.Icon;
        const itemClasses = ["inline-flex items-center gap-1", p.className, itemClassName]
          .filter(Boolean)
          .join(" ");
        return (
          <span key={p.key} className={itemClasses}>
            {Icon ? <Icon size={iconSize} className={meta.className} /> : null}
            <span>{p.val}</span>
          </span>
        );
      })}
    </span>
  );
}
