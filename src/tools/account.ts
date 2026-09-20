import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IfirmaClient } from "../client/api.js";
import { wrapToolHandler } from "../utils/errors.js";
import { accountingMonthBody } from "./document.js";

export function registerVatRateTools(server: McpServer, client: IfirmaClient) {
	server.tool(
		"get_eu_vat_rates",
		"Get current VAT rates for an EU country. Returns standard and reduced rates. Use ISO 3166-1 alpha-2 country codes (exception: Greece = EL).",
		{
			countryCode: z
				.string()
				.length(2)
				.describe(
					"ISO 3166-1 alpha-2 country code (e.g. DE, FR, CZ). Greece uses EL.",
				),
			date: z
				.string()
				.optional()
				.describe("Optional date (YYYY-MM-DD) for historical rates"),
		},
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "GET",
					path: `slownik/stawki_vat/${encodeURIComponent(input.countryCode)}.json`,
					keyName: "faktura",
					params: input.date ? { data: input.date } : undefined,
				}),
			),
	);
}

export function registerAccountTools(server: McpServer, client: IfirmaClient) {
	server.tool(
		"get_accounting_month",
		"Get the currently set accounting month (miesiąc księgowy). Returns RokKsiegowy and MiesiacKsiegowy.",
		{},
		() =>
			wrapToolHandler(() =>
				client.request({
					method: "GET",
					path: "abonent/miesiacksiegowy.json",
					keyName: "abonent",
				}),
			),
	);

	server.tool(
		"set_accounting_month",
		"Move the active accounting month forward (NAST) or backward (POPRZ). iFirma does not accept an arbitrary month/year — only next/previous. Use carryForwardPreviousYear when crossing into a new year.",
		{
			direction: z
				.enum(["next", "previous"])
				.describe("Move to the next or previous accounting month"),
			carryForwardPreviousYear: z
				.boolean()
				.default(false)
				.describe(
					"PrzeniesDaneZPoprzedniegoRoku — copy data when entering a new year",
				),
		},
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "PUT",
					path: "abonent/miesiacksiegowy.json",
					keyName: "abonent",
					body: accountingMonthBody(
						input.direction,
						input.carryForwardPreviousYear,
					),
				}),
			),
	);

	server.tool(
		"get_api_limits",
		"Check remaining daily and per-minute API request limits. Useful to monitor usage before bulk operations.",
		{},
		() =>
			wrapToolHandler(() =>
				client.request({
					method: "GET",
					path: "abonent/limit.json",
					keyName: "abonent",
				}),
			),
	);
}
