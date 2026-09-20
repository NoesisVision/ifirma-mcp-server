import { writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IfirmaClient } from "../client/api.js";
import { wrapToolHandler } from "../utils/errors.js";
import {
	DOCUMENT_TYPE_VALUES,
	LIST_TYPE_MAP,
	LIST_TYPE_VALUES,
	documentPrefix,
	keyForDocumentType,
	normalizeDocumentId,
} from "./document.js";

export { LIST_TYPE_MAP };

export function buildInvoiceItem(item: {
	name: string;
	unit: string;
	quantity: number;
	unitNetPrice: number;
	vatRate: number;
	pkwiu?: string;
	gtu?: string;
}) {
	return {
		StawkaVat: item.vatRate === -1 ? "zw" : item.vatRate / 100,
		Ilosc: item.quantity,
		CenaJednostkowa: item.unitNetPrice,
		NazwaPelna: item.name,
		Jednostka: item.unit,
		TypStawkiVat: item.vatRate === -1 ? "ZW" : "PRC",
		PKWiU: item.pkwiu || "",
		GTU: item.gtu || "",
	};
}

export function buildInvoiceBody(input: {
	issueDate: string;
	saleDate?: string;
	paymentDeadline: string;
	paymentMethod: string;
	contractorNip?: string;
	contractor?: {
		name: string;
		nip?: string;
		street?: string;
		postalCode: string;
		city: string;
		country: string;
		email?: string;
	};
	items: {
		name: string;
		unit: string;
		quantity: number;
		unitNetPrice: number;
		vatRate: number;
		pkwiu?: string;
		gtu?: string;
	}[];
	notes?: string;
	splitPayment: boolean;
	noSignature: boolean;
	accountNumber?: string;
}) {
	const body: Record<string, unknown> = {
		Zapilesz: true,
		LiczOd: "netto",
		DataWystawienia: input.issueDate,
		MiejsceWystawienia: "",
		DataSprzedazy: input.saleDate || input.issueDate,
		FormatDatySprzedazy: "DZN",
		TerminPlatnosci: input.paymentDeadline,
		SposobZaplaty: input.paymentMethod,
		NumerKontaBankowego: input.accountNumber || "",
		RodzajPodpisuOdbiorcy: input.noSignature ? "BPO" : "OUP",
		PodpisFaktury: "",
		UwagiNaFakturze: input.notes || "",
		WidocznoscNumeruGios: false,
		Numer: null,
		Pozycje: input.items.map(buildInvoiceItem),
		Kontrahent: input.contractorNip
			? {
					Identyfikator: null,
					NIP: input.contractorNip,
					PrefiksUE: "",
				}
			: {
					Identyfikator: null,
					NIP: input.contractor?.nip || "",
					Nazwa: input.contractor?.name || "",
					Ulica: input.contractor?.street || "",
					KodPocztowy: input.contractor?.postalCode || "",
					Kraj: input.contractor?.country || "Polska",
					Miejscowosc: input.contractor?.city || "",
					Email: input.contractor?.email || "",
					PrefiksUE: "",
				},
	};

	if (input.splitPayment) {
		body.MechanizmPodzielonejPlatnosci = true;
	}

	return body;
}

const invoiceItemSchema = z.object({
	name: z.string().describe("Item name"),
	unit: z.string().default("szt.").describe("Unit of measure"),
	quantity: z.number().describe("Quantity"),
	unitNetPrice: z.number().describe("Net price per unit"),
	vatRate: z.number().describe("VAT rate: 23, 8, 5, 0, or -1 for exempt (zw)"),
	pkwiu: z.string().optional().describe("PKWiU code"),
	gtu: z.string().optional().describe("GTU code"),
});

const contractorSchema = z.object({
	name: z.string().describe("Contractor name"),
	nip: z.string().optional().describe("NIP number"),
	street: z.string().optional().describe("Street address"),
	postalCode: z.string().describe("Postal code"),
	city: z.string().describe("City"),
	country: z.string().default("Polska").describe("Country"),
	email: z.string().optional().describe("Email address"),
});

const domesticInvoiceSchema = {
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
	contractorNip: z
		.string()
		.optional()
		.describe(
			"Contractor NIP — if provided, contractor is matched from iFirma DB",
		),
	contractor: contractorSchema
		.optional()
		.describe("Contractor details — used when contractorNip is not provided"),
	items: z.array(invoiceItemSchema).min(1).describe("Invoice line items"),
	notes: z.string().optional().describe("Notes on the invoice"),
	splitPayment: z
		.boolean()
		.default(false)
		.describe("Enable split payment mechanism"),
	noSignature: z
		.boolean()
		.default(false)
		.describe("If true, invoice has no recipient signature field"),
	accountNumber: z.string().optional().describe("Bank account number"),
};

const sendInvoiceTypeSchema = z
	.enum(DOCUMENT_TYPE_VALUES)
	.default("krajowa")
	.describe("Document type (determines the API path prefix)");

const documentIdSchema = z
	.union([z.string(), z.number()])
	.describe(
		"Document ID from create response, or full number with slashes (e.g. 1/8/2026)",
	);

export function registerInvoiceTools(server: McpServer, client: IfirmaClient) {
	server.tool(
		"list_invoices",
		"List issued invoices with optional filters. Returns invoice numbers, dates, contractor names, amounts, and payment status.",
		{
			dateFrom: z.string().describe("Start date (YYYY-MM-DD) — required"),
			dateTo: z
				.string()
				.optional()
				.describe("End date (YYYY-MM-DD) — defaults to 30 days from dateFrom"),
			type: z
				.enum(LIST_TYPE_VALUES)
				.default("all")
				.describe("Invoice type filter"),
			status: z
				.enum([
					"all",
					"przeterminowane",
					"nieoplacone",
					"oplaconeCzesciowo",
					"oplacone",
				])
				.default("all")
				.optional()
				.describe("Payment status filter"),
			page: z.number().min(1).default(1).describe("Page number"),
			perPage: z
				.number()
				.min(1)
				.max(100)
				.default(20)
				.describe("Results per page"),
			contractorNip: z.string().optional().describe("Filter by contractor NIP"),
			contractorId: z
				.string()
				.optional()
				.describe("Filter by contractor identifier (kontrahent)"),
			amountFrom: z
				.number()
				.optional()
				.describe("Minimum gross amount (kwotaOd)"),
			amountTo: z
				.number()
				.optional()
				.describe("Maximum gross amount (kwotaDo)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const params: Record<string, string> = {
					dataOd: input.dateFrom,
					strona: String(input.page),
					iloscNaStronie: String(input.perPage),
				};
				if (input.dateTo) params.dataDo = input.dateTo;
				if (input.type !== "all" && input.type !== "proforma") {
					params.typ = LIST_TYPE_MAP[input.type] || "";
				}
				if (input.status && input.status !== "all") {
					params.status = input.status;
				}
				if (input.contractorNip) {
					params.nipKontrahenta = input.contractorNip;
				}
				if (input.contractorId) {
					params.kontrahent = input.contractorId;
				}
				if (input.amountFrom !== undefined) {
					params.kwotaOd = String(input.amountFrom);
				}
				if (input.amountTo !== undefined) {
					params.kwotaDo = String(input.amountTo);
				}
				const path =
					input.type === "proforma" ? "proformy.json" : "faktury.json";
				return client.request({
					method: "GET",
					path,
					keyName: "faktura",
					params,
				});
			}),
	);

	server.tool(
		"create_domestic_invoice",
		"Create a new domestic invoice (faktura krajowa). Requires issue date, payment deadline, at least one line item, and contractor info (either NIP for existing or full details for new).",
		domesticInvoiceSchema,
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "POST",
					path: "fakturakraj.json",
					keyName: "faktura",
					body: buildInvoiceBody(input),
				}),
			),
	);

	server.tool(
		"create_proforma",
		"Create a new proforma invoice. Same structure as domestic invoice but posted as proforma. Requires issue date, payment deadline, at least one line item, and contractor info.",
		{
			...domesticInvoiceSchema,
			domesticType: z
				.enum(["SPRZ", "BUD", "ZAL"])
				.default("SPRZ")
				.describe(
					"Underlying domestic invoice type: SPRZ (sale), BUD (construction), ZAL (advance)",
				),
			orderNumber: z
				.string()
				.optional()
				.describe("Related order number (NumerZamowienia, max 30 chars)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.TypFakturyKrajowej = input.domesticType;
				if (input.orderNumber) body.NumerZamowienia = input.orderNumber;
				return client.request({
					method: "POST",
					path: "fakturaproformakraj.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"send_invoice_email",
		"Send an issued invoice by email to the specified address.",
		{
			id: documentIdSchema,
			invoiceType: sendInvoiceTypeSchema,
			email: z.string().describe("Recipient email address"),
			message: z
				.string()
				.optional()
				.describe("Custom message text (max 1000 chars)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body: Record<string, unknown> = {
					SkrzynkaEmailOdbiorcy: input.email,
				};
				if (input.message) body.Tekst = input.message;
				const prefix = documentPrefix(input.invoiceType);
				return client.request({
					method: "POST",
					path: `${prefix}/send/${normalizeDocumentId(input.id)}.json`,
					keyName: keyForDocumentType(input.invoiceType),
					body,
				});
			}),
	);

	server.tool(
		"create_correction_invoice",
		"Create a correction invoice (korekta) for an existing domestic invoice. Requires the original invoice ID or number, correction reason, and corrected line items.",
		{
			invoiceId: z
				.string()
				.describe("Invoice ID or number (with / replaced by _) to correct"),
			issueDate: z.string().describe("Issue date in YYYY-MM-DD format"),
			paymentDeadline: z
				.string()
				.optional()
				.describe("Payment deadline in YYYY-MM-DD format"),
			correctionReason: z
				.enum([
					"OBOW_RABAT",
					"ZWR_SPRZ_TOW",
					"ZWR_NAB_KWOT",
					"ZWR_NAB_ZAL",
					"PODW_CENY",
					"POMYLKI",
				])
				.describe(
					"Correction reason code: OBOW_RABAT (discount), ZWR_SPRZ_TOW (goods return), ZWR_NAB_KWOT (amount return), ZWR_NAB_ZAL (advance return), PODW_CENY (price increase), POMYLKI (errors)",
				),
			paymentMethod: z
				.enum(["przelew", "gotowka", "karta", "kompensata", "barter"])
				.default("przelew")
				.describe("Payment method"),
			items: z.array(invoiceItemSchema).min(1).describe("Corrected line items"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body: Record<string, unknown> = {
					DataWystawienia: input.issueDate,
					PowodKorekty: input.correctionReason,
					SposobZaplaty: input.paymentMethod,
					Pozycje: input.items.map(buildInvoiceItem),
				};
				if (input.paymentDeadline) {
					body.TerminPlatnosci = input.paymentDeadline;
				}
				return client.request({
					method: "POST",
					path: `fakturakraj/korekta/${encodeURIComponent(input.invoiceId)}.json`,
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_domestic_invoice_non_vat",
		"Create a domestic invoice for non-VAT payers (nievatowiec/faktura bez VAT). Same structure as domestic invoice but for businesses not registered as VAT payers.",
		domesticInvoiceSchema,
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "POST",
					path: "fakturakraj2.json",
					keyName: "faktura",
					body: buildInvoiceBody(input),
				}),
			),
	);

	server.tool(
		"create_export_invoice",
		"Create an export invoice (faktura eksportowa) for goods sold outside the EU.",
		domesticInvoiceSchema,
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "POST",
					path: "fakturaeksport.json",
					keyName: "faktura",
					body: buildInvoiceBody(input),
				}),
			),
	);

	server.tool(
		"create_wdt_invoice",
		"Create an intra-community supply invoice (faktura WDT — Wewnątrzwspólnotowa Dostawa Towarów) for goods sold within the EU.",
		{
			...domesticInvoiceSchema,
			euPrefix: z
				.string()
				.describe("EU country prefix for contractor (e.g. DE, FR, CZ)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				(body.Kontrahent as Record<string, unknown>).PrefiksUE = input.euPrefix;
				return client.request({
					method: "POST",
					path: "fakturawdt.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_eu_service_invoice",
		"Create an EU service invoice (art. 28b — świadczenie usług na rzecz podatnika z UE).",
		{
			...domesticInvoiceSchema,
			euPrefix: z
				.string()
				.describe("EU country prefix for contractor (e.g. DE, FR, CZ)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				(body.Kontrahent as Record<string, unknown>).PrefiksUE = input.euPrefix;
				return client.request({
					method: "POST",
					path: "fakturaunijnasluga.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_foreign_currency_invoice",
		"Create a domestic invoice with foreign currency pricing (faktura walutowa). Uses NBP exchange rate unless custom rate is provided.",
		{
			...domesticInvoiceSchema,
			currency: z
				.string()
				.describe("ISO 4217 currency code (e.g. EUR, USD, GBP)"),
			exchangeRate: z
				.number()
				.optional()
				.describe("Custom exchange rate. If omitted, NBP rate is used."),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.Waluta = input.currency;
				if (input.exchangeRate) {
					body.KursWalutyZDniaPoprzedzajacegoDzienWystawieniaFaktury =
						input.exchangeRate;
				}
				return client.request({
					method: "POST",
					path: "fakturawaluta.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_receipt_invoice",
		"Create an invoice for a receipt (faktura do paragonu). Links the invoice to an existing receipt number.",
		{
			...domesticInvoiceSchema,
			receiptNumber: z.string().describe("Receipt (paragon) number"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.NumerParagonu = input.receiptNumber;
				return client.request({
					method: "POST",
					path: "fakturaparagon.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_oss_invoice",
		"Create an OSS invoice (One Stop Shop) for distance selling of goods to EU consumers.",
		{
			...domesticInvoiceSchema,
			deliveryCountry: z
				.string()
				.describe("Country of delivery (e.g. Niemcy, Francja)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.KrajDostawy = input.deliveryCountry;
				return client.request({
					method: "POST",
					path: "fakturaoss.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_ioss_invoice",
		"Create an IOSS invoice (Import One Stop Shop) for distance selling of imported goods to EU consumers.",
		{
			...domesticInvoiceSchema,
			deliveryCountry: z
				.string()
				.describe("Country of delivery (e.g. Niemcy, Francja)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.KrajDostawy = input.deliveryCountry;
				return client.request({
					method: "POST",
					path: "fakturaioss.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"send_invoice_post",
		"Send an invoice via traditional mail (Poczta Polska) through iFirma's mailing service.",
		{
			id: documentIdSchema,
			invoiceType: sendInvoiceTypeSchema,
		},
		(input) =>
			wrapToolHandler(() => {
				const prefix = documentPrefix(input.invoiceType);
				return client.request({
					method: "POST",
					path: `${prefix}/send/${normalizeDocumentId(input.id)}.json`,
					keyName: keyForDocumentType(input.invoiceType),
					params: { wyslijPoczta: "true" },
					body: {},
				});
			}),
	);

	server.tool(
		"get_invoice",
		"Get full details of an issued invoice or receipt (JSON). Use invoice type to pick the correct endpoint. Accepts numeric ID or number with slashes (e.g. 1/8/2026).",
		{
			id: documentIdSchema,
			invoiceType: sendInvoiceTypeSchema,
		},
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "GET",
					path: `${documentPrefix(input.invoiceType)}/${normalizeDocumentId(input.id)}.json`,
					keyName: keyForDocumentType(input.invoiceType),
				}),
			),
	);

	server.tool(
		"download_invoice_pdf",
		"Download an invoice or receipt as PDF. Provide outputPath to save on disk; otherwise returns base64. Use duplicate=true for a duplicate copy dated today.",
		{
			id: documentIdSchema,
			invoiceType: sendInvoiceTypeSchema,
			outputPath: z
				.string()
				.optional()
				.describe("Filesystem path to write the PDF (recommended)"),
			duplicate: z
				.boolean()
				.default(false)
				.describe("If true, download a duplicate (typ=dup)"),
			printLanguage: z
				.enum(["polski", "obcy"])
				.optional()
				.describe("Print language for bilingual invoices (OSS/export)"),
		},
		(input) =>
			wrapToolHandler(async () => {
				const params: Record<string, string> = {};
				if (input.duplicate) params.typ = "dup";
				if (input.printLanguage) params.jezykWydruku = input.printLanguage;
				const result = await client.requestBinary({
					method: "GET",
					path: `${documentPrefix(input.invoiceType)}/${normalizeDocumentId(input.id)}.pdf`,
					keyName: keyForDocumentType(input.invoiceType),
					params: Object.keys(params).length ? params : undefined,
					accept: "application/pdf",
				});
				if (input.outputPath) {
					await writeFile(input.outputPath, result.buffer);
					return {
						savedTo: input.outputPath,
						bytes: result.buffer.length,
						contentType: result.contentType,
					};
				}
				return {
					filename: `${normalizeDocumentId(input.id)}.pdf`,
					contentType: result.contentType,
					bytes: result.buffer.length,
					base64: result.buffer.toString("base64"),
				};
			}),
	);

	server.tool(
		"create_shipment_invoice",
		"Create a shipment invoice (faktura wysyłkowa). Same line items as a domestic invoice, plus payment-received date. Posted to fakturawysylka.json.",
		{
			...domesticInvoiceSchema,
			paymentReceivedDate: z
				.string()
				.describe("Date payment was received (YYYY-MM-DD)"),
			amountPaid: z
				.number()
				.default(0)
				.describe("Amount already paid (Zaplacono)"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.DataOtrzymaniaZaplaty = input.paymentReceivedDate;
				body.Zaplacono = input.amountPaid;
				return client.request({
					method: "POST",
					path: "fakturawysylka.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_out_of_country_service_invoice",
		"Create an invoice for services provided outside Poland (świadczenie usług poza terytorium kraju). Posted to fakturaeksportuslug.json.",
		{
			...domesticInvoiceSchema,
			serviceName: z.string().describe("Service name shown on the invoice"),
			language: z
				.string()
				.default("en")
				.describe("Invoice language code (en, de, fr, ...)"),
			currency: z
				.string()
				.default("PLN")
				.describe("Currency (PLN for this tool)"),
			taxPointDate: z
				.string()
				.optional()
				.describe(
					"Tax obligation date (DataObowiazkuPodatkowego), defaults to issueDate",
				),
			article28b: z
				.boolean()
				.default(false)
				.describe("Whether the service is under VAT Act art. 28b"),
			foreignItemName: z
				.string()
				.optional()
				.describe("Foreign-language name for line items if not set per item"),
			foreignUnit: z
				.string()
				.default("pcs")
				.describe("Foreign-language unit for line items"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.NazwaUslugi = input.serviceName;
				body.UslugaSwiadczonaTrybArt28b = input.article28b;
				body.Jezyk = input.language;
				body.Waluta = input.currency;
				body.DataObowiazkuPodatkowego = input.taxPointDate || input.issueDate;
				const pozycje = body.Pozycje as Array<Record<string, unknown>>;
				for (const item of pozycje) {
					item.NazwaPelnaObca = input.foreignItemName || item.NazwaPelna;
					item.JednostkaObca = input.foreignUnit;
				}
				return client.request({
					method: "POST",
					path: "fakturaeksportuslug.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"create_export_proforma",
		"Create an export/WDT/EU-service proforma (POST fakturaproformaeksport.json).",
		{
			...domesticInvoiceSchema,
			invoiceKind: z
				.enum([
					"prz_eksport_towarow",
					"prz_dostawa_ue_towarow",
					"prz_eksport_dost_uslug_ue",
					"prz_eksport_dost_uslug_nie_ue",
					"prz_faktura_wys_ter_kraj",
				])
				.describe("Underlying invoice type this proforma is for"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body = buildInvoiceBody(input);
				body.TypFaktury = input.invoiceKind;
				return client.request({
					method: "POST",
					path: "fakturaproformaeksport.json",
					keyName: "faktura",
					body,
				});
			}),
	);

	server.tool(
		"convert_proforma_to_invoice",
		"Issue a domestic sales invoice from an existing proforma (GET fakturaproformakraj/add/{id}.json).",
		{
			id: documentIdSchema,
		},
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "GET",
					path: `fakturaproformakraj/add/${normalizeDocumentId(input.id)}.json`,
					keyName: "faktura",
				}),
			),
	);

	server.tool(
		"find_invoices_by_order",
		"Find proformas and related invoices by order number (NumerZamowienia). Only works for documents created via API.",
		{
			orderNumber: z
				.string()
				.describe("Order number used when creating the proforma"),
		},
		(input) =>
			wrapToolHandler(() =>
				client.request({
					method: "GET",
					path: `fakturaproformakraj/find/${encodeURIComponent(input.orderNumber)}.json`,
					keyName: "faktura",
				}),
			),
	);

	server.tool(
		"create_oss_sales_proof",
		"Create an OSS sales proof (dowód sprzedaży OSS) — same as an OSS invoice but without contractor data.",
		{
			...domesticInvoiceSchema,
			deliveryCountry: z
				.string()
				.describe("ISO country code of delivery (e.g. DE, CY)"),
			dispatchCountry: z
				.string()
				.default("PL")
				.describe("ISO country code of dispatch"),
			language: z.string().default("en").describe("Invoice language code"),
			currency: z.string().default("PLN").describe("Currency code"),
			isService: z
				.boolean()
				.default(false)
				.describe("True if selling services rather than goods"),
		},
		(input) =>
			wrapToolHandler(() => {
				const body: Record<string, unknown> = {
					...buildInvoiceBody(input),
					Kontrahent: undefined,
					KrajDostawy: input.deliveryCountry,
					KrajWysylki: input.dispatchCountry,
					Jezyk: input.language,
					Waluta: input.currency,
					SprzedazUslug: input.isService,
					WidocznyNumerBdo: false,
				};
				return client.request({
					method: "POST",
					path: "fakturaoss.json",
					keyName: "faktura",
					body,
				});
			}),
	);
}
