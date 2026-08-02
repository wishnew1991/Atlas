import { AtlasCard } from "./atlas-card";
import { atlasArchitectureLayers, atlasControlLoop } from "@/lib/atlas/architecture";
import { atlasTaskStates } from "@/lib/atlas/workflows";

export function ArchitectureMap() {
  return (
    <div className="atlas-surface">
      <div className="atlas-diagram">
        <div className="atlas-diagram__lane">
          <div className="atlas-diagram__node">
            <div className="atlas-pill">Experience</div>
            <div>
              <div className="atlas-diagram__title">Conversation first</div>
              <div className="atlas-diagram__label">The user describes what they want.</div>
            </div>
          </div>
          <div className="atlas-diagram__node">
            <div className="atlas-pill">Orchestration</div>
            <div>
              <div className="atlas-diagram__title">Search and compare</div>
              <div className="atlas-diagram__label">Atlas coordinates the work behind the scene.</div>
            </div>
          </div>
        </div>
        <div className="atlas-diagram__core">✦</div>
        <div className="atlas-diagram__lane">
          <div className="atlas-diagram__node">
            <div className="atlas-pill">Trust</div>
            <div>
              <div className="atlas-diagram__title">Approve and execute</div>
              <div className="atlas-diagram__label">Nothing commits without user permission.</div>
            </div>
          </div>
          <div className="atlas-diagram__node">
            <div className="atlas-pill">Outcome</div>
            <div>
              <div className="atlas-diagram__title">Track and remember</div>
              <div className="atlas-diagram__label">Task status, receipts, and preferences persist.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="atlas-grid atlas-grid--2">
        {atlasArchitectureLayers.map((layer) => (
          <AtlasCard key={layer.title}>
            <div className="atlas-card__eyebrow">{layer.summary}</div>
            <div className="atlas-card__title">{layer.title}</div>
            <div className="atlas-chip-row">
              {layer.items.map((item) => (
                <span key={item} className="atlas-chip atlas-chip--quiet">
                  {item}
                </span>
              ))}
            </div>
          </AtlasCard>
        ))}
      </div>

      <AtlasCard tone="soft">
        <div className="atlas-card__eyebrow">Control loop</div>
        <div className="atlas-journey">
          {atlasControlLoop.map((step, index) => (
            <div className="atlas-step" key={step}>
              <div className="atlas-step__index">{index + 1}</div>
              <div className="atlas-step__title">{step}</div>
            </div>
          ))}
        </div>
      </AtlasCard>

      <AtlasCard>
        <div className="atlas-card__eyebrow">Task state machine</div>
        <div className="atlas-rows">
          {atlasTaskStates.map((state, index) => (
            <div className="atlas-row" key={state.id}>
              <div className="atlas-row__meta">
                <div className="atlas-row__title">
                  {index + 1}. {state.title}
                </div>
                <div className="atlas-row__body">{state.summary}</div>
              </div>
              <span className="atlas-badge atlas-badge--blue">State</span>
            </div>
          ))}
        </div>
      </AtlasCard>
    </div>
  );
}
