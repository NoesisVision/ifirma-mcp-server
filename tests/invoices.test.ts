import { describe, expect, it } from "vitest";
import { LIST_TYPE_MAP, buildInvoiceBody } from "../src/tools/invoices.js";

describe("LIST_TYPE_MAP", () => {
	it("maps krajowa to prz_faktura_kraj", () => {
		expect(LIST_TYPE_MAP.krajowa).toBe("prz_faktura_kraj");
	});

	it("maps all expected invoice types", () => {
		expect(LIST_TYPE_MAP.eksport).toBe("prz_eksport_towarow");
		expect(LIST_TYPE_MAP.wdt).toBe("prz_dostawa_ue_towarow");
		expect(LIST_TYPE_MAP.eu_service).toBe("prz_eksport_dost_uslug_ue");
		expect(LIST_TYPE_MAP.paragon).toBe("prz_faktura_paragon");
		expect(LIST_TYPE_MAP.waluta).toBe("prz_faktura_wys_ter_kraj");
		expect(LIST_TYPE_MAP.wysylka).toBe("prz_faktura_wysylka");
		expect(LIST_TYPE_MAP.out_of_country).toBe("prz_eksport_dost_uslug_nie_ue");
		expect(LIST_TYPE_MAP.rachunek).toBe("prz_rachunek_kraj");
		expect(LIST_TYPE_MAP.zaliczkowa).toBe("prz_faktura_zal");
	});
});

describe("buildInvoiceBody", () => {
	const baseInput = {
		issueDate: "2026-03-01",
		paymentDeadline: "2026-03-15",
		paymentMethod: "przelew",
		items: [
			{
				name: "Consulting",
				unit: "h",
				quantity: 10,
				unitNetPrice: 200,
				vatRate: 23,
			},
		],
		splitPayment: false,
		noSignature: false,
		contractorNip: "1234567890",
	};

	it("produces correct top-level fields", () => {
		const body = buildInvoiceBody(baseInput);
		expect(body.Zaplacono).toBe(0);
		expect(body.LiczOd).toBe("NET");
		expect(body.DataWystawienia).toBe("2026-03-01");
		expect(body.TerminPlatnosci).toBe("2026-03-15");
		expect(body.SposobZaplaty).toBe("PRZ");
		expect(body.FormatDatySprzedazy).toBe("DZN");
		expect(body.WidocznyNumerGios).toBe(false);
		expect(body.Numer).toBeNull();
	});

	it("omits optional fields so iFirma account defaults apply", () => {
		const body = buildInvoiceBody(baseInput);
		expect(body).not.toHaveProperty("NumerKontaBankowego");
		expect(body).not.toHaveProperty("NazwaSzablonu");
		expect(body).not.toHaveProperty("MiejsceWystawienia");
		expect(body).not.toHaveProperty("Uwagi");
	});

	it("passes template, series, place and notes when provided", () => {
		const body = buildInvoiceBody({
			...baseInput,
			issuePlace: "Warszawa",
			templateName: "Logo",
			numberingSeries: "Domyślna miesięczna",
			notes: "Okres rozliczeniowy: 09.2026",
		});
		expect(body.MiejsceWystawienia).toBe("Warszawa");
		expect(body.NazwaSzablonu).toBe("Logo");
		expect(body.NazwaSeriiNumeracji).toBe("Domyślna miesięczna");
		expect(body.Uwagi).toBe("Okres rozliczeniowy: 09.2026");
	});

	it("defaults DataSprzedazy to issueDate when saleDate not provided", () => {
		const body = buildInvoiceBody(baseInput);
		expect(body.DataSprzedazy).toBe("2026-03-01");
	});

	it("uses saleDate when provided", () => {
		const body = buildInvoiceBody({ ...baseInput, saleDate: "2026-02-28" });
		expect(body.DataSprzedazy).toBe("2026-02-28");
	});

	it("maps VAT rate from percentage to decimal", () => {
		const body = buildInvoiceBody(baseInput);
		const pozycje = body.Pozycje as Array<Record<string, unknown>>;
		expect(pozycje[0].StawkaVat).toBe(0.23);
		expect(pozycje[0].TypStawkiVat).toBe("PRC");
	});

	it("maps VAT rate -1 to exempt (zw)", () => {
		const body = buildInvoiceBody({
			...baseInput,
			items: [{ ...baseInput.items[0], vatRate: -1 }],
		});
		const pozycje = body.Pozycje as Array<Record<string, unknown>>;
		expect(pozycje[0].StawkaVat).toBe("zw");
		expect(pozycje[0].TypStawkiVat).toBe("ZW");
	});

	it("maps item fields to Polish names", () => {
		const body = buildInvoiceBody(baseInput);
		const pozycje = body.Pozycje as Array<Record<string, unknown>>;
		expect(pozycje[0].NazwaPelna).toBe("Consulting");
		expect(pozycje[0].Jednostka).toBe("h");
		expect(pozycje[0].Ilosc).toBe(10);
		expect(pozycje[0].CenaJednostkowa).toBe(200);
	});

	it("matches existing contractor by top-level NIP when contractorNip provided", () => {
		const body = buildInvoiceBody(baseInput);
		expect(body.NIPKontrahenta).toBe("1234567890");
		expect(body.Kontrahent).toBeUndefined();
	});

	it("matches existing contractor by identifier when provided", () => {
		const body = buildInvoiceBody({
			...baseInput,
			contractorIdentifier: "ACME",
		});
		expect(body.IdentyfikatorKontrahenta).toBe("ACME");
	});

	it("uses inline contractor when contractorNip not provided", () => {
		const body = buildInvoiceBody({
			...baseInput,
			contractorNip: undefined,
			contractor: {
				name: "Acme Corp",
				nip: "9876543210",
				postalCode: "00-001",
				city: "Warszawa",
				country: "Polska",
			},
		});
		const kontrahent = body.Kontrahent as Record<string, unknown>;
		expect(kontrahent.Nazwa).toBe("Acme Corp");
		expect(kontrahent.NIP).toBe("9876543210");
		expect(kontrahent.KodPocztowy).toBe("00-001");
		expect(kontrahent.Miejscowosc).toBe("Warszawa");
	});

	it("sets BPO when noSignature is true", () => {
		const body = buildInvoiceBody({ ...baseInput, noSignature: true });
		expect(body.RodzajPodpisuOdbiorcy).toBe("BPO");
	});

	it("sets OUP when noSignature is false", () => {
		const body = buildInvoiceBody(baseInput);
		expect(body.RodzajPodpisuOdbiorcy).toBe("OUP");
	});

	it("adds split payment flag when enabled", () => {
		const body = buildInvoiceBody({ ...baseInput, splitPayment: true });
		expect(body.SplitPayment).toBe(true);
	});

	it("omits split payment flag when disabled", () => {
		const body = buildInvoiceBody(baseInput);
		expect(body.SplitPayment).toBeUndefined();
	});

	it("includes PKWiU and GTU when provided", () => {
		const body = buildInvoiceBody({
			...baseInput,
			items: [{ ...baseInput.items[0], pkwiu: "62.01", gtu: "12" }],
		});
		const pozycje = body.Pozycje as Array<Record<string, unknown>>;
		expect(pozycje[0].PKWiU).toBe("62.01");
		expect(pozycje[0].GTU).toBe("12");
	});
});
