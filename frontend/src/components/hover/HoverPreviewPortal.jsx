import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ThreatCardDetail from '../threats/ThreatCardDetail';
import MarketCardDetail from '../market/MarketCardDetail';

let externalSetter = null;

export function setHoverPreview(content) {
  if (externalSetter) externalSetter(content);
}

export default function HoverPreviewPortal() {
  const [content, setContent] = useState(null);
  externalSetter = setContent;

  if (!content) return null;

  return createPortal(
    <div className="fixed pointer-events-none z-50" style={{
      top: content.y + 20,
      left: content.x + 20
    }}>
      {content.type === 'threat' && <ThreatCardDetail threat={content.data} />}
      {content.type === 'market' && <MarketCardDetail card={content.data} />}
    </div>,
    document.body
  );
}
