import { useState } from 'react';
import { copyText } from '../lib/clipboard.js';

/**
 * The legacy bottom-sheet message preview: readonly textarea, Copy to
 * Clipboard, plus an optional primary action (e.g. Send Order).
 */
export default function MessagePreviewModal({ title, text, primaryAction, onClose }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <textarea className="message-preview" readOnly value={text} />
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-success"
            onClick={async () => {
              const ok = await copyText(text);
              if (!ok) alert('Could not copy — please select the text and copy manually.');
            }}
          >
            Copy to Clipboard
          </button>
          {primaryAction && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await primaryAction.onClick();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? '…' : primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
