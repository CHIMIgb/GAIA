import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  type ErrorCode,
  isErrorCode,
  asErrorCode,
} from "./errors";
import { parseRFC3339, toRFC3339, roundtrip } from "./dates";

describe("ERROR_CODES", () => {
  it("exporta exactamente los 7 códigos del catálogo", () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        "VALIDATION_ERROR",
        "NOT_FOUND",
        "UPSTREAM_UNAVAILABLE",
        "UPSTREAM_RATE_LIMITED",
        "UPSTREAM_TIMEOUT",
        "CACHE_MISS",
        "INTERNAL_SERVER_ERROR",
      ].sort(),
    );
  });

  it("isErrorCode distingue códigos válidos de inválidos", () => {
    expect(isErrorCode("NOT_FOUND")).toBe(true);
    expect(isErrorCode("nope")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });

  it("asErrorCode castea con seguridad y rechaza desconocidos", () => {
    const ok: ErrorCode = asErrorCode("VALIDATION_ERROR");
    expect(ok).toBe("VALIDATION_ERROR");
    expect(() => asErrorCode("UNKNOWN")).toThrow();
  });
});

describe("fechas RFC3339", () => {
  it("parseRFC3339 parsea ISO con offset", () => {
    const d = parseRFC3339("2026-09-24T10:00:00Z");
    expect(d.toISOString()).toBe("2026-09-24T10:00:00.000Z");
  });

  it("toRFC3339 serializa a UTC", () => {
    const s = toRFC3339(new Date("2026-09-24T10:00:00.000Z"));
    expect(s).toBe("2026-09-24T10:00:00Z");
  });

  it("roundtrip conserva el instante", () => {
    expect(roundtrip("2026-09-24T10:00:00Z")).toBe("2026-09-24T10:00:00Z");
  });
});
