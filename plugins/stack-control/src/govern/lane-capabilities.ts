import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadAuditBarrageConfig } from '../scope-discovery/audit-barrage/config-loader.js';
import type {
  EnforcementState,
  LivenessState,
  ModelConfig,
  OutputMode,
} from '../scope-discovery/audit-barrage/types.js';
import { isLaneEnforced } from '../scope-discovery/audit-barrage/types.js';

export interface LanePayloadEnvelope {
  readonly maxPromptBytes: number;
  readonly source: 'fleet-knowledge' | 'derived-from-timeout-slope';
}

export interface LaneCapabilityProfile {
  readonly name: string;
  readonly model: string;
  readonly binary: string;
  readonly outputMode: OutputMode;
  readonly enforcement: EnforcementState;
  readonly liveness: LivenessState;
  readonly envelope: LanePayloadEnvelope;
  readonly timeoutBasis:
    | { readonly mode: 'override'; readonly timeoutSeconds: number }
    | {
        readonly mode: 'derived';
        readonly timeoutFloorSeconds: number;
        readonly timeoutSecsPerKb: number;
      };
}

interface FleetKnowledgeDoc {
  readonly lanes?: readonly FleetKnowledgeLane[];
}

interface FleetKnowledgeLane {
  readonly name?: unknown;
  readonly max_prompt_bytes?: unknown;
}

const KNOWLEDGE_REL = join('.stack-control', 'fleet-knowledge.yaml');

export async function loadLaneCapabilities(
  installationRoot: string,
): Promise<readonly LaneCapabilityProfile[]> {
  const config = await loadAuditBarrageConfig(installationRoot);
  const knownEnvelopes = readFleetKnowledge(
    installationRoot,
    config.models.map((model) => model.name),
  );
  return config.models.map((model) => normalizeLaneCapability(model, knownEnvelopes.get(model.name)));
}

function normalizeLaneCapability(
  model: ModelConfig,
  knownEnvelope: number | undefined,
): LaneCapabilityProfile {
  const timeoutBasis =
    model.timeoutSeconds !== undefined
      ? { mode: 'override' as const, timeoutSeconds: model.timeoutSeconds }
      : {
          mode: 'derived' as const,
          timeoutFloorSeconds: model.timeoutFloorSeconds ?? 300,
          timeoutSecsPerKb: model.timeoutSecsPerKb ?? 8,
        };
  return {
    name: model.name,
    model: model.model,
    binary: model.binary,
    outputMode: model.outputMode,
    enforcement: isLaneEnforced(model) ? 'enforced' : 'unenforced',
    liveness: model.livenessSignal === 'none' ? 'unmonitored' : 'monitored',
    envelope:
      knownEnvelope !== undefined
        ? { maxPromptBytes: knownEnvelope, source: 'fleet-knowledge' }
        : {
            maxPromptBytes: deriveEnvelopeBytes(model),
            source: 'derived-from-timeout-slope',
          },
    timeoutBasis,
  };
}

function deriveEnvelopeBytes(model: ModelConfig): number {
  if (model.timeoutSeconds !== undefined) {
    throw new Error(
      `lane '${model.name}' needs fleet-knowledge.yaml max_prompt_bytes when timeout_seconds is used; ` +
        'timeout wall-clock is not a prompt-capacity signal',
    );
  }
  const floor = model.timeoutFloorSeconds ?? 300;
  const secsPerKb = model.timeoutSecsPerKb ?? 8;
  return Math.max(1, Math.floor(floor / secsPerKb)) * 1024;
}

function readFleetKnowledge(
  installationRoot: string,
  expectedLaneNames: readonly string[],
): ReadonlyMap<string, number> {
  const path = join(installationRoot, KNOWLEDGE_REL);
  if (!existsSync(path)) return new Map();
  const parsed = parseYaml(readFileSync(path, 'utf8')) as FleetKnowledgeDoc | null;
  if (parsed === null || parsed === undefined) return new Map();
  if (!Array.isArray(parsed.lanes)) {
    throw new Error(`${path}: lanes must be a list`);
  }
  const pairs: Array<readonly [string, number]> = [];
  const seen = new Set<string>();
  for (const lane of parsed.lanes) {
    if (typeof lane !== 'object' || lane === null) {
      throw new Error(`${path}: each fleet-knowledge lane must be an object`);
    }
    if (typeof lane.name !== 'string' || lane.name.length === 0) {
      throw new Error(`${path}: each fleet-knowledge lane requires a non-empty name`);
    }
    if (seen.has(lane.name)) {
      throw new Error(`${path}: duplicate fleet-knowledge lane '${lane.name}'`);
    }
    if (typeof lane.max_prompt_bytes !== 'number' || !Number.isFinite(lane.max_prompt_bytes) || lane.max_prompt_bytes < 1) {
      throw new Error(`${path}: lane '${lane.name}' max_prompt_bytes must be a positive number`);
    }
    seen.add(lane.name);
    pairs.push([lane.name, lane.max_prompt_bytes]);
  }
  const actual = new Set(pairs.map(([name]) => name));
  const expected = new Set(expectedLaneNames);
  const unknown = Array.from(actual).filter((name) => !expected.has(name)).sort();
  const missing = Array.from(expected).filter((name) => !actual.has(name)).sort();
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${path}: fleet-knowledge lanes must exactly match configured barrage lanes` +
        `${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}` +
        `${unknown.length > 0 ? `; unknown: ${unknown.join(', ')}` : ''}`,
    );
  }
  return new Map(pairs);
}
