import { describe, expect, it } from "vitest";
import {
	accountingMonthBody,
	documentPrefix,
	keyForDocumentType,
	normalizeDocumentId,
} from "../src/tools/document.js";

describe("normalizeDocumentId", () => {
	it("replaces slashes with underscores", () => {
		expect(normalizeDocumentId("1/8/2026")).toBe("1_8_2026");
	});

	it("stringifies numeric ids", () => {
		expect(normalizeDocumentId(32566241)).toBe("32566241");
	});
});

describe("documentPrefix", () => {
	it("maps known types", () => {
		expect(documentPrefix("krajowa")).toBe("fakturakraj");
		expect(documentPrefix("wysylka")).toBe("fakturawysylka");
		expect(documentPrefix("out_of_country")).toBe("fakturaeksportuslug");
		expect(documentPrefix("rachunek")).toBe("rachunekkraj");
	});

	it("defaults unknown types to fakturakraj", () => {
		expect(documentPrefix("nope")).toBe("fakturakraj");
	});
});

describe("keyForDocumentType", () => {
	it("uses rachunek key for receipts", () => {
		expect(keyForDocumentType("rachunek")).toBe("rachunek");
		expect(keyForDocumentType("rachunek_zagr")).toBe("rachunek");
	});

	it("uses faktura key otherwise", () => {
		expect(keyForDocumentType("krajowa")).toBe("faktura");
	});
});

describe("accountingMonthBody", () => {
	it("maps next to NAST", () => {
		expect(accountingMonthBody("next", false)).toEqual({
			MiesiacKsiegowy: "NAST",
			PrzeniesDaneZPoprzedniegoRoku: false,
		});
	});

	it("maps previous to POPRZ", () => {
		expect(accountingMonthBody("previous", true)).toEqual({
			MiesiacKsiegowy: "POPRZ",
			PrzeniesDaneZPoprzedniegoRoku: true,
		});
	});
});
