import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IfirmaClient } from "../client/api.js";
import { wrapToolHandler } from "../utils/errors.js";
import {
	DOCUMENT_TYPE_VALUES,
	documentPrefix,
	keyForDocumentType,
	normalizeDocumentId,
} from "./document.js";

export function registerKsefTools(server: McpServer, client: IfirmaClient) {
	server.tool(
		"send_invoice_ksef",
		"Submit an issued invoice to KSeF (Krajowy System e-Faktur). invoiceType selects the path prefix (fakturakraj, fakturawysylka, fakturazaliczka, ...).",
		{
			invoiceId: z
				.union([z.string(), z.number()])
				.describe("Invoice ID or number (slashes become underscores)"),
			invoiceType: z
				.enum(DOCUMENT_TYPE_VALUES)
				.default("krajowa")
				.describe("Invoice type for the KSeF send endpoint"),
		},
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "POST",
					path: `${documentPrefix(input.invoiceType)}/ksef/send/${normalizeDocumentId(input.invoiceId)}.json`,
					keyName: keyForDocumentType(input.invoiceType),
					body: { DataWysylki: null },
				}),
			),
	);
}
