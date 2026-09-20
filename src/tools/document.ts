import type { KeyName } from "../client/auth.js";

/** Unified list `typ` values for GET /faktury.json */
export const LIST_TYPE_MAP: Record<string, string> = {
	krajowa: "prz_faktura_kraj",
	wysylka: "prz_faktura_wysylka",
	paragon: "prz_faktura_paragon",
	waluta: "prz_faktura_wys_ter_kraj",
	eksport: "prz_eksport_towarow",
	wdt: "prz_dostawa_ue_towarow",
	eu_service: "prz_eksport_dost_uslug_ue",
	out_of_country: "prz_eksport_dost_uslug_nie_ue",
	zaliczkowa: "prz_faktura_zal",
	koncowa: "prz_faktura_kon",
	wyposazenie: "prz_faktura_wyposaz",
	srodek_trwaly: "prz_faktura_sr_trwaly",
	rachunek: "prz_rachunek_kraj",
	rachunek_zagr: "prz_rachunek_zagr",
	rachunek_srodek_trwaly: "prz_rachunek_sr_trwaly",
	rachunek_wyposazenie: "prz_rachunek_wyposaz",
	metoda_kasowa: "prz_faktura_met_kasowa",
	szczegolny_obowiazek: "prz_faktura_szczeg_obow",
	odwrotne_obciazenie: "prz_faktura_odwr_obciaz",
	odwrotne_obciazenie_budowa: "prz_faktura_odwr_obciaz_budowa",
	budowa: "prz_faktura_budowa",
	oss: "prz_faktura_oss_usl",
	ioss: "prz_faktura_ioss",
};

export const LIST_TYPE_VALUES = [
	"all",
	"proforma",
	...Object.keys(LIST_TYPE_MAP),
] as const;

/** Path prefixes for GET/POST send/KSeF on an existing document */
export const DOCUMENT_PREFIXES: Record<string, string> = {
	krajowa: "fakturakraj",
	wysylka: "fakturawysylka",
	proforma: "fakturaproformakraj",
	export_proforma: "fakturaproformaeksport",
	eksport: "fakturaeksporttowarow",
	wdt: "fakturawdt",
	eu_service: "fakturaeksportuslugue",
	out_of_country: "fakturaeksportuslug",
	waluta: "fakturawaluta",
	paragon: "fakturaparagon",
	oss: "fakturaoss",
	ioss: "fakturaioss",
	zaliczkowa: "fakturazaliczka",
	koncowa: "fakturakoncowa",
	zaliczkowa_waluta: "fakturazaliczkowawaluta",
	koncowa_waluta: "fakturakoncowawaluta",
	budowa: "fakturabudowa",
	wyposazenie: "fakturawyposazenie",
	srodek_trwaly: "fakturasrodektrwaly",
	metoda_kasowa: "fakturametodakasowa",
	szczegolny_obowiazek: "fakturaszczegolnyobowiazek",
	korekta: "fakturakraj/korekta",
	rachunek: "rachunekkraj",
};

export const DOCUMENT_TYPE_VALUES = Object.keys(DOCUMENT_PREFIXES) as [
	string,
	...string[],
];

export const PAYMENT_TYPE_VALUES = [
	"prz_faktura_kraj",
	"prz_faktura_wysylka",
	"prz_faktura_paragon",
	"prz_faktura_wys_ter_kraj",
	"prz_dostawa_ue_towarow",
	"prz_eksport_towarow",
	"prz_eksport_dost_uslug_ue",
	"prz_eksport_dost_uslug_nie_ue",
	"prz_faktura_zal",
	"prz_faktura_kon",
	"prz_faktura_wyposaz",
	"prz_faktura_sr_trwaly",
	"prz_rachunek_kraj",
	"prz_rachunek_zagr",
	"prz_rachunek_sr_trwaly",
	"prz_rachunek_wyposaz",
	"prz_faktura_oss_usl",
	"prz_faktura_oss_usl_ds",
	"prz_faktura_ioss",
	"prz_faktura_ioss_ds",
] as const;

export const EXPENSE_PREFIXES: Record<string, string> = {
	cost: "kosztdzialalnoscivat",
	goods: "zakuptowaruvat",
	other: "kosztdzialalnosci",
	telecom: "oplatatelefon",
};

export function normalizeDocumentId(id: string | number): string {
	return String(id).replace(/\//g, "_");
}

export function documentPrefix(type: string): string {
	return DOCUMENT_PREFIXES[type] || "fakturakraj";
}

export function keyForDocumentType(type: string): KeyName {
	return type.startsWith("rachunek") ? "rachunek" : "faktura";
}

export function accountingMonthBody(
	direction: "next" | "previous",
	carryForwardPreviousYear: boolean,
) {
	return {
		MiesiacKsiegowy: direction === "next" ? "NAST" : "POPRZ",
		PrzeniesDaneZPoprzedniegoRoku: carryForwardPreviousYear,
	};
}
