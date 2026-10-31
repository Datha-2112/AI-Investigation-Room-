import { Router } from 'express';
import Case from '../models/Case.js';
import Evidence from '../models/Evidence.js';
import Attempt from '../models/Attempt.js';
import User from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { caseSchema } from '../schemas/api.js';
import { AppError } from '../middleware/errors.js';
import { env } from '../config/env.js';
import { generateCase } from '../services/generation.js';
import { playerSafeCase } from '../services/playerSafe.js';

const router = Router();

router.post('/', validate(caseSchema), async (req, res, next) => {
  const userId = req.user.id;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    await User.updateOne(
      { _id: userId, quotaResetAt: { $lt: today } },
      { $set: { casesCreatedToday: 0, quotaResetAt: today } }
    );
    const quotaOwner = await User.findOneAndUpdate(
      { _id: userId, quotaResetAt: { $gte: today }, casesCreatedToday: { $lt: env.RATE_LIMIT_CASES_PER_DAY } },
      { $inc: { casesCreatedToday: 1 } },
      { new: true }
    );
    if (!quotaOwner) {
      if (!await User.exists({ _id: userId })) throw new AppError(404, 'NOT_FOUND', 'User not found.');
      throw new AppError(429, 'DAILY_LIMIT', 'You have reached today’s case limit. Try again tomorrow.');
    }

    let createdCase;
    try {
      createdCase = await Case.create({
        owner: quotaOwner._id,
        scenarioInput: req.body.scenario,
        difficulty: req.body.difficulty,
        tone: req.body.tone
      });
    } catch (error) {
      await User.updateOne({ _id: quotaOwner._id }, { $inc: { casesCreatedToday: -1 } });
      throw error;
    }

    setImmediate(() => generateCase(createdCase._id));
    res.status(202).json({ caseId: createdCase._id, status: createdCase.status });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const cases = await Case.find({ owner: req.user.id })
      .select('public.title status createdAt difficulty tone error')
      .sort({ createdAt: -1 })
      .lean();
    const attempts = await Attempt.find({ user: req.user.id }).sort({ startedAt: -1 }).lean();
    res.json({ cases: cases.map((record) => ({
      ...record,
      attempt: attempts.find((attempt) => String(attempt.case) === String(record._id)) || null
    })) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/status', async (req, res, next) => {
  try {
    const record = await Case.findOne({ _id: req.params.id, owner: req.user.id });
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Case not found.');
    const progress = { blueprint: 1, evidence_text: 2, evidence_media: 3, validation: 4, done: 5 };
    res.json({ status: record.status, stage: record.stage, progress: progress[record.stage] || 0, error: record.error });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const record = await Case.findOne({ _id: req.params.id, owner: req.user.id });
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Case not found.');
    const evidence = ['ready', 'solved'].includes(record.status)
      ? await Evidence.find({ case: record._id }).sort({ order: 1 }).lean()
      : [];
    const attempt = await Attempt.findOne({ case: record._id, user: req.user.id }).sort({ startedAt: -1 });
    res.json({ ...playerSafeCase(record, evidence), attempt });
  } catch (error) {
    next(error);
  }
});

export default router;
