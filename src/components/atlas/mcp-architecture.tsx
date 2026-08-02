import { AtlasCard } from "./atlas-card";
import { AtlasSection } from "./atlas-section";
import { atlasMcpProviders, atlasDomainPriority } from "@/lib/atlas/mcp-registry";
import { atlasApprovalPolicies } from "@/lib/atlas/approval-policy";
import { atlasExecutionPlans } from "@/lib/atlas/execution-plan";

export function McpArchitecture() {
  return (
    <div className="atlas-page">
      <AtlasSection
        eyebrow="MCP control plane"
        title="Atlas routes each intent to the right execution surface."
        description="The registry separates discovery, approval, execution, and tracking so the assistant stays safe and composable."
      >
        <div className="atlas-grid atlas-grid--2">
          {atlasMcpProviders.map((provider) => (
            <AtlasCard key={provider.id} tone="soft">
              <div className="atlas-mini-row">
                <div>
                  <div className="atlas-card__eyebrow">{provider.source}</div>
                  <div className="atlas-card__title">{provider.name}</div>
                </div>
                <span className="atlas-badge atlas-badge--blue">{provider.readiness}</span>
              </div>
              <div className="atlas-card__body">{provider.role}</div>
              <div className="atlas-chip-row">
                {provider.capabilities.map((capability) => (
                  <span key={capability} className="atlas-chip atlas-chip--quiet">
                    {capability}
                  </span>
                ))}
              </div>
              <div className="atlas-list">
                {provider.notes.map((note) => (
                  <div className="atlas-list__item" key={note}>
                    <div className="atlas-list__label">Note</div>
                    <div className="atlas-list__value">{note}</div>
                  </div>
                ))}
              </div>
            </AtlasCard>
          ))}
        </div>
      </AtlasSection>

      <AtlasSection
        eyebrow="Approval policy"
        title="Anything that spends money or commits a reservation must pass through approval."
        description="The approval screen is the trust boundary, not a courtesy step."
      >
        <div className="atlas-grid atlas-grid--2">
          {atlasDomainPriority.map((domain) => {
            const policy = atlasApprovalPolicies[domain];
            return (
              <AtlasCard key={domain}>
                <div className="atlas-mini-row">
                  <div className="atlas-card__title">{policy.title}</div>
                  <span className="atlas-badge atlas-badge--amber">{policy.trigger}</span>
                </div>
                <div className="atlas-list">
                  {policy.fields.map((field) => (
                    <div className="atlas-list__item" key={field.label}>
                      <div className="atlas-list__label">{field.label}</div>
                      <div className="atlas-list__value">{field.value}</div>
                    </div>
                  ))}
                </div>
                <p className="atlas-quote">{policy.trustNote}</p>
              </AtlasCard>
            );
          })}
        </div>
      </AtlasSection>

      <AtlasSection
        eyebrow="Execution map"
        title="Each domain uses the same control loop, with different providers."
        description="This keeps Atlas consistent even when the underlying execution surfaces change."
      >
        <div className="atlas-rows">
          {atlasExecutionPlans.map((plan) => (
            <div className="atlas-row" key={plan.domain}>
              <div className="atlas-row__meta">
                <div className="atlas-row__title">{plan.domain}</div>
                <div className="atlas-row__body">
                  Primary: {plan.primaryProviderIds.join(", ")}. Fallback:{" "}
                  {plan.fallbackProviderIds.length > 0 ? plan.fallbackProviderIds.join(", ") : "none"}
                </div>
                <div className="atlas-row__body">{plan.coverageNote}</div>
              </div>
              <span className={`atlas-badge ${plan.readiness === "ready" ? "atlas-badge--green" : plan.readiness === "partial" ? "atlas-badge--amber" : "atlas-badge--red"}`}>
                {plan.readiness}
              </span>
            </div>
          ))}
        </div>
      </AtlasSection>
    </div>
  );
}
