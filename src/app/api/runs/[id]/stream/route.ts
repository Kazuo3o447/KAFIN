import { NextRequest } from "next/server";
import { ensureRunBus, getBuffer, isDone, type RunEventName } from "@/lib/orchestrator/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const runId = params.id;
  const entry = ensureRunBus(runId);
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event: RunEventName, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(enc.encode(payload));
        } catch {
          /* closed */
        }
      };

      // Buffer replayen damit late-subscriber alles bekommt
      for (const e of getBuffer(runId)) {
        send(e.name, e.data);
      }

      const onLog = (d: unknown) => send("log", d);
      const onProgress = (d: unknown) => send("progress", d);
      const onStepStart = (d: unknown) => send("step:start", d);
      const onStepDone = (d: unknown) => send("step:done", d);
      const onError = (d: unknown) => {
        send("error", d);
        cleanup();
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
      const onDone = (d: unknown) => {
        send("done", d);
        cleanup();
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      entry.emitter.on("log", onLog);
      entry.emitter.on("progress", onProgress);
      entry.emitter.on("step:start", onStepStart);
      entry.emitter.on("step:done", onStepDone);
      entry.emitter.on("error", onError);
      entry.emitter.on("done", onDone);

      // Falls Run schon fertig: direkt schließen
      if (isDone(runId)) {
        cleanup();
        if (!closed) {
          closed = true;
          controller.close();
        }
        return;
      }

      // Heartbeat alle 15s gegen Proxy-Timeouts
      const hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(hb);
        }
      }, 15_000);

      // Cleanup bei Stream-close (unsubscribe)
      cleanup = () => {
        clearInterval(hb);
        entry.emitter.off("log", onLog);
        entry.emitter.off("progress", onProgress);
        entry.emitter.off("step:start", onStepStart);
        entry.emitter.off("step:done", onStepDone);
        entry.emitter.off("error", onError);
        entry.emitter.off("done", onDone);
        req.signal.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
