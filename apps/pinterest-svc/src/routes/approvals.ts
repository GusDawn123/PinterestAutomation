import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApprovalDecisionSchema } from "@pa/shared-types";
import type { ServiceContext } from "../context.js";

const IdParam = z.object({ id: z.string().uuid() });

export async function approvalRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.get("/approvals", async () => {
    const rows = await ctx.approvals.listPending();
    return { approvals: rows };
  });

  app.get("/approvals/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const row = await ctx.approvals.get(id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.post("/approvals/:id/decide", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const body = ApprovalDecisionSchema.parse(req.body);
    if (body.status === "pending") {
      return reply.code(400).send({ error: "cannot decide to pending" });
    }

    const decided = await ctx.approvals.decide({
      approvalId: id,
      status: body.status,
      decisionData: body.data,
      notes: body.notes,
    });
    return decided;
  });
}
