import { z } from "zod";
import { forbidWriteOperations } from "./guards.js";

const RequestSchema = z.object({
  question: z.string().min(3),
  params: z.record(z.any()).optional().default({})
});

export function parseRequest(body) {
  return RequestSchema.parse(body);
}

export function chooseRoute(question, routingRules) {
  const q = question.toLowerCase();
  forbidWriteOperations(question);

  for (const r of routingRules) {
    const ok = r.match.every((w) => q.includes(String(w).toLowerCase()));
    if (ok) return r;
  }
  return routingRules.find((r) => r.id === "tool_usage_for_job") || routingRules[0];
}

export function normalizeJobNum(params) {
  const jobNum = params?.job_num || params?.JobNum || params?.jobNum;
  return jobNum ? String(jobNum) : null;
}

export function normalizeShiftName(params) {
  const s = params?.shift_name || params?.shiftName || params?.ShiftName;
  return s ? String(s) : null;
}
