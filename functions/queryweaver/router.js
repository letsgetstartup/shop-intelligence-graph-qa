import { z } from "zod";
import { forbidWriteOperations } from "./guards.js";

const RequestSchema = z.object({
  question: z.string().min(3),
  params: z.record(z.any()).optional().default({})
});

export function parseRequest(body) {
  return RequestSchema.parse(body);
}

export function chooseRoute(question, routingRules, params = {}) {
  const q = question.toLowerCase();
  forbidWriteOperations(question);

  // Extract job_num if present in params or question
  const jobNum = normalizeJobNum(params, question);

  // If job_num is present, prioritize routing to job-specific handler
  if (jobNum) {
    const jobRoute = routingRules.find(r => r.id === 'tool_usage_for_job');
    if (jobRoute) return jobRoute;
  }

  // Otherwise, use keyword matching
  for (const r of routingRules) {
    const ok = r.match.every((w) => q.includes(String(w).toLowerCase()));
    if (ok) return r;
  }
  // Use the last route as default fallback (should be general_query)
  return routingRules[routingRules.length - 1] || routingRules[0];
}

export function normalizeJobNum(params, question = "") {
  let jobNum = params?.job_num || params?.JobNum || params?.jobNum;

  // If not in params, try to extract from question text
  if (!jobNum && question) {
    const match = question.match(/[Jj]\d{2}-\d{5}/);
    if (match) jobNum = match[0];
  }

  return jobNum ? String(jobNum).toUpperCase() : null;
}

export function normalizeShiftName(params) {
  const s = params?.shift_name || params?.shiftName || params?.ShiftName;
  return s ? String(s) : null;
}
