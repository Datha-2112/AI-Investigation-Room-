import pino from 'pino';
import Case from '../models/Case.js';
import Evidence from '../models/Evidence.js';
import User from '../models/User.js';
import { createBlueprint } from '../ai/blueprint.js';
import { createTextEvidence } from '../ai/textEvidence.js';
import { createImage } from '../ai/mediaGen.js';
import { validateCase } from '../ai/validate.js';

const logger = pino();

async function mapLimit(items, limit, worker) {
  const results = [];
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export async function generateCase(caseId) {
  let caseRecord;

  try {
    caseRecord = await Case.findById(caseId);
    if (!caseRecord) return;

    caseRecord.stage = 'blueprint';
    await caseRecord.save();
    const blueprint = await createBlueprint({
      scenario: caseRecord.scenarioInput,
      difficulty: caseRecord.difficulty,
      tone: caseRecord.tone
    });

    caseRecord.stage = 'evidence_text';
    caseRecord.public = {
      title: blueprint.title,
      setting: blueprint.setting,
      brief: blueprint.incident,
      suspects: blueprint.suspects.map(({ id, name, role, bio, relationship }) => ({ id, name, role, bio, relationship })),
      hints: 3
    };
    await caseRecord.save();

    const text = await createTextEvidence(blueprint);
    const documents = text.documents.map((item) => ({
      case: caseRecord._id,
      type: 'document',
      title: item.title,
      caption: item.caption,
      content: { markdown: item.markdown },
      clueRefs: item.clueRefs
    }));
    const chats = text.chats.map((item) => ({
      case: caseRecord._id,
      type: 'chat',
      title: item.title,
      caption: item.caption,
      content: { participants: item.participants, messages: item.messages },
      clueRefs: item.clueRefs
    }));
    await Evidence.insertMany([...chats, ...documents].map((item, order) => ({ ...item, order })));

    caseRecord.stage = 'evidence_media';
    await caseRecord.save();
    const images = Array.from({ length: 3 }, (_, index) => ({
      type: 'image',
      title: 'Scene photograph ' + (index + 1),
      caption: blueprint.clues[index]?.description || blueprint.setting,
      clueRef: blueprint.clues[index]?.id,
      prompt: blueprint.styleGuide + '. Fictional scene photograph illustrating clue: ' + (blueprint.clues[index]?.description || blueprint.setting) + '. No readable text.'
    }));
    const cameraFrames = Array.from({ length: 6 }, (_, index) => ({
      type: 'cctv',
      camera: Math.floor(index / 3) + 1,
      frame: index % 3,
      clueRef: blueprint.clues[3 + Math.floor(index / 3)]?.id,
      prompt: 'Grainy low-resolution high-angle fixed surveillance camera, desaturated. Fictional scene: ' + blueprint.setting + '. Show this event: ' + (blueprint.clues[3 + Math.floor(index / 3)]?.description || blueprint.setting) + '. Frame ' + (index % 3 + 1) + '. No text.'
    }));

    const media = await mapLimit([...images, ...cameraFrames], 3, async (item, index) => {
      try {
        const url = await createImage(item.prompt);
        if (item.type === 'image') {
          return { ...item, content: { url }, mediaStatus: 'ready' };
        }
        const timelineIndex = Math.min(blueprint.timeline.length - 1, item.frame);
        return {
          ...item,
          content: { cameraId: 'CAM-' + item.camera, frame: { url, ts: blueprint.timeline[timelineIndex].time } },
          mediaStatus: 'ready'
        };
      } catch (error) {
        logger.warn({ err: error, caseId, mediaIndex: index }, 'Media item generation failed');
        return item.type === 'image'
          ? { ...item, content: { url: null }, mediaStatus: 'failed' }
          : { ...item, content: { cameraId: 'CAM-' + item.camera, frame: null }, mediaStatus: 'failed' };
      }
    });

    const imageEvidence = media.filter((item) => item.type === 'image').map((item) => ({
      case: caseRecord._id,
      type: 'image',
      title: item.title,
      caption: item.caption,
      content: item.content,
      mediaStatus: item.mediaStatus,
      clueRefs: item.clueRef ? [item.clueRef] : []
    }));
    const cameraEvidence = [1, 2].map((camera) => {
      const frames = media
        .filter((item) => item.type === 'cctv' && item.camera === camera && item.content.frame)
        .map((item) => item.content.frame);
      return {
        case: caseRecord._id,
        type: 'cctv',
        title: 'CCTV camera ' + camera,
        caption: blueprint.setting,
        content: { cameraId: 'CAM-' + camera, frames },
        mediaStatus: frames.length === 3 ? 'ready' : 'failed',
        clueRefs: blueprint.clues[2 + camera] ? [blueprint.clues[2 + camera].id] : []
      };
    });
    const mediaEvidence = [...imageEvidence, ...cameraEvidence];
    await Evidence.insertMany(mediaEvidence.map((item, index) => ({
      ...item,
      order: chats.length + documents.length + index
    })));

    if (imageEvidence.filter((item) => item.mediaStatus === 'ready').length < 3 || cameraEvidence.some((item) => item.content.frames.length < 3)) {
      throw new Error('The minimum scene images and CCTV keyframes could not be generated.');
    }

    caseRecord.stage = 'validation';
    await caseRecord.save();
    const fullEvidence = await Evidence.find({ case: caseRecord._id }).select('+clueRefs').lean();
    if (!await validateCase(blueprint, fullEvidence)) throw new Error('The generated mystery did not pass the solvability check.');

    caseRecord.solution = {
      culpritId: blueprint.culpritId,
      motive: blueprint.motive,
      method: blueprint.method,
      opportunity: blueprint.opportunity,
      timeline: blueprint.timeline,
      clues: blueprint.clues,
      redHerrings: blueprint.redHerrings,
      hints: blueprint.hints
    };
    caseRecord.status = 'ready';
    caseRecord.stage = 'done';
    await caseRecord.save();
  } catch (error) {
    logger.error({ err: error, caseId }, 'Case generation failed');
    if (!caseRecord) return;

    try {
      caseRecord.status = 'failed';
      caseRecord.stage = 'done';
      caseRecord.error = 'We could not prepare a playable mystery. Your daily case credit has been returned.';
      await caseRecord.save();
      await User.updateOne({ _id: caseRecord.owner }, { $inc: { casesCreatedToday: -1 } });
    } catch (persistenceError) {
      logger.error({ err: persistenceError, caseId }, 'Could not persist case generation failure');
    }
  }
}
