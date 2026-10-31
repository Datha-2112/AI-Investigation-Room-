export function playerSafeCase(caseRecord, evidence) {
  return {
    case: {
      id: caseRecord._id,
      title: caseRecord.public.title,
      setting: caseRecord.public.setting,
      brief: caseRecord.public.brief,
      suspects: caseRecord.public.suspects,
      hints: caseRecord.public.hints,
      status: caseRecord.status,
      error: caseRecord.error
    },
    evidence: evidence.map(({ clueRefs: _privateRefs, ...item }) => item)
  };
}
