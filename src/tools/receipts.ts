import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IfirmaClient } from "../client/api.js";
import { wrapToolHandler } from "../utils/errors.js";
import { buildInvoiceBody } from "./invoices.js";

const receiptSchema = {
	issueDate: z.string().describe("Issue date in YYYY-MM-DD format"),
	saleDate: z
		.string()
		.optional()
		.describe("Sale date in YYYY-MM-DD format, defaults to issueDate"),
	paymentDeadline: z.string().describe("Payment deadline in YYYY-MM-DD format"),
	paymentMethod: z
		.enum(["przelew", "gotowka", "karta", "kompensata", "barter"])
		.default("przelew")
		.describe("Payment method"),
	contractorNip: z.string().optional().describe("Contractor NIP"),
	contractor: z
		.object({
			name: z.string(),
			nip: z.string().optional(),
			street: z.string().optional(),
			postalCode: z.string(),
			city: z.string(),
			country: z.string().default("Polska"),
			email: z.string().optional(),
		})
		.optional()
		.describe("Contractor details when contractorNip is not provided"),
	items: z
		.array(
			z.object({
				name: z.string(),
				unit: z.string().default("szt."),
				quantity: z.number(),
				unitNetPrice: z.number(),
				vatRate: z
					.number()
					.describe("VAT rate: 23, 8, 5, 0, or -1 for exempt (zw)"),
				pkwiu: z.string().optional(),
				gtu: z.string().optional(),
			}),
		)
		.min(1)
		.describe("Receipt line items"),
	notes: z.string().optional(),
	splitPayment: z.boolean().default(false),
	noSignature: z.boolean().default(false),
	accountNumber: z.string().optional(),
};

export function registerReceiptTools(server: McpServer, client: IfirmaClient) {
	server.tool(
		"create_domestic_receipt",
		"Create a domestic sales receipt (rachunek sprzedaży krajowej). Uses the rachunek API key. For listing receipts, use list_invoices with type=rachunek.",
		receiptSchema,
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "POST",
					path: "rachunekkraj.json",
					keyName: "rachunek",
					body: buildInvoiceBody(input),
				}),
			),
	);
}
