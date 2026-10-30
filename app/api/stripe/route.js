import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
	let event;

	try {
		const body = await request.text();
		const sig = request.headers.get("stripe-signature");
		event = stripe.webhooks.constructEvent(
			body,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET
		);
	} catch (error) {
		console.error("Webhook signature verification failed:", error.message);
		return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
	}

	try {
		switch (event.type) {
			case "checkout.session.completed":
			case "checkout.session.async_payment_succeeded": {
				const session = event.data.object;
				const { orderIds, userId, appId } = session.metadata ?? {};
				if (appId !== "gocart") break;
				if (session.payment_status !== "paid") break; // async method, wait

				await prisma.$transaction([
					prisma.order.updateMany({
						where: { id: { in: orderIds.split(",") } },
						data: { isPaid: true },
					}),
					prisma.user.update({
						where: { id: userId },
						data: { cart: {} },
					}),
				]);
				break;
			}

			case "checkout.session.expired":
			case "checkout.session.async_payment_failed": {
				const session = event.data.object;
				const { orderIds, appId } = session.metadata ?? {};
				if (appId !== "gocart") break;

				await prisma.order.deleteMany({
					where: { id: { in: orderIds.split(",") }, isPaid: false },
				});
				break;
			}

			default:
				console.log("Unhandled event type:", event.type);
		}

		return NextResponse.json({ received: true });
	} catch (error) {
		console.error(error);
		// 500 so Stripe retries
		return NextResponse.json(
			{ error: "Webhook handler failed" },
			{ status: 500 }
		);
	}
}
