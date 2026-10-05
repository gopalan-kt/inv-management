import { useEffect, useState } from 'react';

/**
 * Small dialog used across the catalog manager. Renders a required text input,
 * an optional color swatch row, and an optional number field (e.g. "Max
 * inventory needed"). onConfirm receives (name, color, numberValue).
 */
export default function PromptModal({
  title, label, initialName = '', swatches = null, initialColor = null,
  numberField = null, initialNumber = null, confirmLabel = 'Save',
  onConfirm, onClose,
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [num, setNum] = useState(initialNumber ?? '');

  useEffect(() => {
    setName(initialName);
    setColor(initialColor);
    setNum(initialNumber ?? '');
  }, [initialName, initialColor, initialNumber]);

  const parsedNumber = () => {
    if (!numberField) return undefined;
    if (num === '') return null;
    const n = Number(num);
    if (!Number.isInteger(n) || n < 0) return undefined; // invalid → block submit
    return n;
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsed = parsedNumber();
    if (numberField && parsed === undefined) return;
    onConfirm(trimmed, swatches ? color : undefined, parsed);
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{label}</label>
            <input
              type="text"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>
          {numberField && (
            <div className="form-row">
              <label>{numberField}</label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={num}
                placeholder="No default — manual ordering only"
                onChange={(e) => setNum(e.target.value)}
              />
            </div>
          )}
          {swatches && (
            <div className="form-row">
              <label>Color</label>
              <div className="swatch-row">
                <button
                  className={`swatch${color === null ? ' selected' : ''}`}
                  style={{ background: '#E5E5EA' }}
                  onClick={() => setColor(null)}
                  title="Default (grey)"
                />
                {swatches.map((c) => (
                  <button
                    key={c}
                    className={`swatch${color === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim() || (numberField && parsedNumber() === undefined)}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
