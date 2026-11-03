import type { DecisionView } from './store/decisionView.js';

/**
 * Bottom-left chip: a decision model (TypeSafe Jev) decided this turn before
 * any language-model call. Hover or keyboard focus opens a small popover
 * listing every decision it made, with confidence and time, and the model
 * calls that were saved.
 */
export function JevBadge({ view }: { view: DecisionView }): React.ReactElement {
  return (
    <div className={`lume-jev lume-jev-${view.tone}`} tabIndex={0} aria-label={`${view.provider}: ${view.headline}`}>
      <span className="lume-jev-mark" aria-hidden="true">
        ⚡
      </span>
      <span className="lume-jev-provider">{view.provider}</span>
      <span className="lume-jev-headline">{view.headline}</span>
      <div className="lume-jev-popover" role="tooltip">
        <div className="lume-jev-popover-title">
          Über {view.provider} entschieden
          {view.model !== undefined && <span className="lume-jev-model">{view.model}</span>}
        </div>
        <ul className="lume-jev-steps">
          {view.lines.map((line, i) => (
            <li key={`${line.label}-${i}`} className="lume-jev-step">
              <span className="lume-jev-step-label">{line.label}</span>
              <span className="lume-jev-step-value">{line.value}</span>
              {(line.confidencePct !== undefined || line.ms !== undefined) && (
                <span className="lume-jev-step-meta">
                  {line.confidencePct !== undefined ? `${line.confidencePct} %` : ''}
                  {line.confidencePct !== undefined && line.ms !== undefined ? ' · ' : ''}
                  {line.ms !== undefined ? `${line.ms} ms` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="lume-jev-footer">
          {view.saved !== undefined && <span>{view.saved}</span>}
          <span className="lume-jev-total">Entscheidungszeit {view.ms} ms</span>
        </div>
      </div>
    </div>
  );
}
