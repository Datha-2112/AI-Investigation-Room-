import { z } from 'zod';
import { generateJson } from './geminiClient.js';

const DetectiveReport = z.object({
  culpritId: z.string(),
  evidenceIds: z.array(z.string()).min(2),
  reasoning: z.string()
});

export async function validateCase(blueprint, evidence) {
  const culpritClueIds = new Set(blueprint.clues
    .filter((clue) => clue.pointsToSuspectId === blueprint.culpritId)
    .map((clue) => clue.id));
  const evidencedCulpritClues = new Set(evidence.flatMap((item) => item.clueRefs || [])
    .filter((clueId) => culpritClueIds.has(clueId)));
  if (evidencedCulpritClues.size < 3) return false;

  const publicCase = {
    title: blueprint.title,
    setting: blueprint.setting,
    brief: blueprint.incident,
    suspects: blueprint.suspects.map(({ id, name, role, bio, relationship }) => ({ id, name, role, bio, relationship }))
  };
  const publicEvidence = evidence.map(({ _id, type, title, caption, content, mediaStatus }) => ({
    id: String(_id), type, title, caption, content, mediaStatus
  }));
  const report = await generateJson(
    'In a fresh detective context, identify the culprit from only this public case and evidence. Cite at least two evidence item IDs that support your deduction. Do not guess if evidence is insufficient. Case: ' + JSON.stringify(publicCase) + ' Evidence: ' + JSON.stringify(publicEvidence),
    DetectiveReport
  );
  const clueBearingEvidence = new Set(evidence
    .filter((item) => item.clueRefs?.some((ref) => culpritClueIds.has(ref)))
    .map((item) => String(item._id)));
  const validCitations = new Set(report.evidenceIds.filter((id) => clueBearingEvidence.has(id)));
  return report.culpritId === blueprint.culpritId && validCitations.size >= 2;
}
