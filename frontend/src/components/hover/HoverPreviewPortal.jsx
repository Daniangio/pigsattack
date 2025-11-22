import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ThreatCardDetail from "../threats/ThreatCardDetail";
import MarketCardDetail from "../market/MarketCardDetail";

let externalSetter = null;

export function setHoverPreview(payload) {
  if (!externalSetter) return;
  externalSetter((prev) => {
    if (payload === null) {
      return prev?.locked ? prev : null;
    }

    const { lock = false, sourceId } = payload;

    // Toggle off when clicking the same locked card
    if (lock && prev?.locked && prev?.sourceId === sourceId) {
      return null;
    }

    // Keep current locked card when hover tries to override it
    if (!lock && prev?.locked) {
      return prev;
    }

    return { ...payload, locked: !!lock };
  });
}

export default function HoverPreviewPortal() {
  const [content, setContent] = useState(null);
  externalSetter = setContent;

  if (!content) return null;

  const close = () => setContent(null);
  const wrapperClasses = `fixed inset-0 z-50 flex items-center justify-center ${
    content.locked ? "bg-slate-950/40 backdrop-blur-sm" : "pointer-events-none"
  }`;

  return createPortal(
    <div className={wrapperClasses}>
      <div className="relative">
        {content.locked && (
          <button
            type="button"
            onClick={close}
            className="absolute -top-3 -right-3 bg-slate-900 border border-slate-700 rounded-full p-1 text-slate-200 hover:bg-slate-800 shadow-lg"
          >
            <X size={14} />
          </button>
        )}
        {content.type === "threat" && <ThreatCardDetail threat={content.data} />}
        {content.type === "market" && <MarketCardDetail card={content.data} />}
      </div>
    </div>,
    document.body
  );
}
