import { z } from 'zod';
import { generateJson } from './geminiClient.js';

const Chat = z.object({
  title: z.string(),
  caption: z.string(),
  participants: z.array(z.string()).min(2),
  messages: z.array(z.object({ sender: z.string(), text: z.string(), ts: z.iso.datetime() })).min(8).max(25),
  clueRefs: z.array(z.string())
});
const Schema = z.object({
  chats: z.array(Chat).min(2),
  documents: z.array(z.object({ title: z.string(), caption: z.string(), markdown: z.string(), clueRefs: z.array(z.string()) }))
});

export async function createTextEvidence(blueprint) {
  const evidence = await generateJson(
    'Generate structured chat threads and documents derived only from this blueprint. Use only clue IDs in the blueprint. Every timestamp must be ISO 8601 and consistent with the timeline. Keep facts consistent. Every chat must involve its listed participants. Blueprint: ' + JSON.stringify(blueprint),
    Schema
  );
  const clueIds = new Set(blueprint.clues.map((clue) => clue.id));
  const firstTime = Date.parse(blueprint.timeline[0].time);
  const lastTime = Date.parse(blueprint.timeline.at(-1).time);
  for (const chat of evidence.chats) {
    if (chat.messages.some((message) => !chat.participants.includes(message.sender))) throw new Error('Chat message sender is not a participant.');
    if (chat.messages.some((message) => Date.parse(message.ts) < firstTime || Date.parse(message.ts) > lastTime)) throw new Error('Chat timestamp falls outside the case timeline.');
    if (chat.messages.some((message, index) => index > 0 && Date.parse(message.ts) < Date.parse(chat.messages[index - 1].ts))) {
      throw new Error('Chat timestamps must be chronological.');
    }
  }
  const allItems = [...evidence.chats, ...evidence.documents];
  if (allItems.some((item) => item.clueRefs.some((id) => !clueIds.has(id)))) throw new Error('Evidence references an unknown clue.');
  const covered = new Set(allItems.flatMap((item) => item.clueRefs));
  const culpritClues = blueprint.clues.filter((clue) => clue.pointsToSuspectId === blueprint.culpritId);
  if (culpritClues.filter((clue) => covered.has(clue.id)).length < 3) throw new Error('Text evidence does not carry three independent culprit clues.');
  return evidence;
}
