// Auto-decompose a goal into independent subtasks using a coordinator agent,
// then return the subtask list for parallel dispatch.

function parseJsonArray(text) {
  const cleaned = String(text ?? '')
    .replace(/```[a-zA-Z]*/g, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (Array.isArray(arr) && arr.every((s) => typeof s === 'string' && s.trim() !== '')) {
      return arr.map((s) => s.trim());
    }
  } catch {
    // fall through
  }
  return null;
}

export async function decompose(ctrl, goal, n, { timeoutMs, coordinatorModel } = {}) {
  const coordinator = await ctrl.spawn({
    name: 'coordinator',
    model: coordinatorModel ?? 'deepseek-v4-pro',
    persona: 'You are a planning coordinator. Output ONLY valid JSON, no commentary.',
  });
  try {
    const prompt =
      `Break the following goal into exactly ${n} independent, parallelizable subtasks. ` +
      `Each subtask must be self-contained (a single worker can do it alone without seeing the others). ` +
      `Respond with ONLY a JSON array of ${n} strings, nothing else.\n\nGoal: ${goal}`;
    const answer = await ctrl.ask(coordinator.id, prompt, { timeoutMs });
    const tasks = parseJsonArray(answer);
    return { tasks, raw: answer };
  } finally {
    await ctrl.stop(coordinator.id);
  }
}

// Merge several worker results into one coherent final answer.
export async function synthesize(ctrl, goal, results, { timeoutMs, coordinatorModel } = {}) {
  const synth = await ctrl.spawn({
    name: 'synthesizer',
    model: coordinatorModel ?? 'deepseek-v4-pro',
    persona: 'You are a synthesis coordinator. Combine results into ONE coherent, well-organized final answer.',
  });
  try {
    const parts = results.map((r, i) => `### Worker ${i + 1}\n${r}`).join('\n\n');
    const prompt =
      `Combine the following independent results into ONE coherent, well-organized final answer for the goal. ` +
      `Preserve key facts, reconcile any conflicts, and do not omit important details.\n\n` +
      `Goal: ${goal}\n\n${parts}\n\nFinal answer:`;
    // await inside try: the finally must not stop the runtime while ask() is in flight.
    const answer = await ctrl.ask(synth.id, prompt, { timeoutMs });
    return answer;
  } finally {
    await ctrl.stop(synth.id);
  }
}
