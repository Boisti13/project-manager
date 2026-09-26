import React from 'react';
import { labelTextColor } from '../labels';
import '../styles/Labels.css';

// A task's labels as colored chips. With onClick, each chip filters by it.
function LabelChips({ labels, onClick, small = false }) {
  if (!labels || labels.length === 0) return null;
  return (
    <span className={`label-chips ${small ? 'small' : ''}`}>
      {labels.map((l) => {
        const style = { backgroundColor: l.color, color: labelTextColor(l.color) };
        return onClick ? (
          <button
            key={l.id}
            type="button"
            className="label-chip"
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onClick(l);
            }}
            title={`Show tasks labeled “${l.name}”`}
          >
            {l.name}
          </button>
        ) : (
          <span key={l.id} className="label-chip" style={style}>
            {l.name}
          </span>
        );
      })}
    </span>
  );
}

export default LabelChips;
