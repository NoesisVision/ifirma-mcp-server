import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IfirmaClient } from "../client/api.js";
import { wrapToolHandler } from "../utils/errors.js";
import { PAYMENT_TYPE_VALUES, normalizeDocumentId } from "./document.js";

export function registerPaymentTools(server: McpServer, client: IfirmaClient) {
	server.tool(
		"register_payment",
		"Register a payment for an existing invoice. Records the payment amount and date against the specified invoice.",
		{
			invoiceNumber: z
				.string()
				.describe(
					"Full invoice number (e.g. 'A2/2/2026') — slashes are auto-replaced with underscores",
				),
			invoiceType: z
				.enum(PAYMENT_TYPE_VALUES)
				.default("prz_faktura_kraj")
				.describe("Invoice type used in the payment URL"),
			amount: z.number().min(0).describe("Payment amount"),
			paymentDate: z
				.string()
				.optional()
				.describe(
					"Payment date (YYYY-MM-DD) — required for foreign currency and special cash invoices",
				),
			amountPln: z
				.number()
				.optional()
				.describe(
					"Amount in PLN — required when paying a foreign currency invoice in PLN",
				),
			exchangeRate: z
				.number()
				.optional()
				.describe(
					"Exchange rate — required when paying in the invoice's foreign currency",
				),
		},
		(input) =>
			wrapToolHandler(() => {
				const numer = normalizeDocumentId(input.invoiceNumber);
				const body: Record<string, unknown> = { Kwota: input.amount };
				if (input.paymentDate) body.Data = input.paymentDate;
				if (input.amountPln !== undefined) body.KwotaPln = input.amountPln;
				if (input.exchangeRate !== undefined) body.Kurs = input.exchangeRate;
				return client.request({
					method: "POST",
					path: `faktury/wplaty/${input.invoiceType}/${numer}.json`,
					keyName: "faktura",
					body,
				});
			}),
	);
}
