import { en } from "@/i18n/en";
import { RazorpayConfigurationError } from "@/server/billing/razorpay-config";
import { processRazorpaySubscriptionWebhook, RazorpayWebhookError } from "@/server/billing/razorpay-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > 1024 * 1024) {
    return Response.json({ error: en.errors.webhookInvalid }, { status: 413 });
  }

  try {
    const result = await processRazorpaySubscriptionWebhook(
      rawBody,
      request.headers.get("x-razorpay-signature") ?? "",
      request.headers.get("x-razorpay-event-id") ?? "",
    );
    if (!result.processed && !result.replayed) {
      return Response.json({ error: en.errors.orderNotPaid }, { status: 400 });
    }
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof RazorpayConfigurationError) {
      return Response.json({ error: en.errors.webhooksUnavailable }, { status: 503 });
    }
    if (error instanceof RazorpayWebhookError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return Response.json({ error: en.errors.webhookInvalid }, { status: 400 });
    }
    return Response.json({ error: en.errors.webhookInvalid }, { status: 500 });
  }
}