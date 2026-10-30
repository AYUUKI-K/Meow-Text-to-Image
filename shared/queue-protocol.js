// Capability names are explicit so clients never infer safety from a version.
export const queueCapabilities=['two-phase-generation-v1','bounded-uncertain-v1','shared-nai-cooldown-v1','in-place-retry-v1'];
export const queueProtocol=2;
// Deployment-controlled only. Requests cannot toggle this setting.
export const queueMaintenance=value=>value===true||value==='true'||value==='1';
