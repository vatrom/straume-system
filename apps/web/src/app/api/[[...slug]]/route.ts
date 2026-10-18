import { handleApi } from "@/server/router";

type Ctx = { params: Promise<{ slug?: string[] }> };

async function run(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  return handleApi(req, slug ?? []);
}

export const GET = run;
export const POST = run;
export const PATCH = run;
export const PUT = run;
export const DELETE = run;
export const OPTIONS = run;
