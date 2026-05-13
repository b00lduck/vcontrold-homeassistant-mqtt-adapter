import { describe, expect, it } from "vitest";
import {
  commandToName,
  commandToUniqueId,
  isPlausible,
  parseResponse,
} from "./parsers";

describe("commandToName", () => {
  it("strips the get prefix and splits camel case", () => {
    expect(commandToName("getTempA")).toBe("Temp A");
    expect(commandToName("getTempVorlaufHk1")).toBe("Temp Vorlauf Hk1");
  });

  it("uppercases the first letter when there is no get prefix", () => {
    expect(commandToName("brennerLeistung")).toBe("Brenner Leistung");
  });

  it("handles already-spaced names", () => {
    expect(commandToName("getX")).toBe("X");
  });
});

describe("commandToUniqueId", () => {
  it("converts camelCase to snake_case without leading underscore", () => {
    expect(commandToUniqueId("getTempA")).toBe("get_temp_a");
    expect(commandToUniqueId("getTempVorlaufHk1")).toBe(
      "get_temp_vorlauf_hk1",
    );
  });

  it("keeps an all-lowercase command unchanged", () => {
    expect(commandToUniqueId("foo")).toBe("foo");
  });
});

describe("parseResponse", () => {
  it("parses a bare integer", () => {
    expect(parseResponse("42")).toBe(42);
  });

  it("parses a decimal value with a unit suffix", () => {
    expect(parseResponse("21.5 Grad Celsius")).toBe(21.5);
  });

  it("parses a negative value", () => {
    expect(parseResponse("-3.5 Grad Celsius")).toBe(-3.5);
  });

  it("trims surrounding whitespace", () => {
    expect(parseResponse("   17.25  ")).toBe(17.25);
  });

  it("returns the trimmed string when there is no numeric token", () => {
    expect(parseResponse("AN")).toBe("AN");
  });

  it("returns null for an empty response", () => {
    expect(parseResponse("")).toBeNull();
    expect(parseResponse("   ")).toBeNull();
  });

  it("extracts the first numeric token only", () => {
    expect(parseResponse("12.5 / 30")).toBe(12.5);
  });
});

describe("isPlausible", () => {
  it("accepts values inside the inclusive range", () => {
    expect(isPlausible({ min: -50, max: 120 }, 21.5)).toBe(true);
    expect(isPlausible({ min: 0, max: 100 }, 0)).toBe(true);
    expect(isPlausible({ min: 0, max: 100 }, 100)).toBe(true);
  });

  it("rejects values below min", () => {
    expect(isPlausible({ min: -50, max: 120 }, -50.1)).toBe(false);
  });

  it("rejects values above max", () => {
    // Viessmann sensor-disconnected sentinel: 128.5 °C.
    expect(isPlausible({ min: -50, max: 120 }, 128.5)).toBe(false);
  });

  it("treats undefined bounds as unbounded on that side", () => {
    expect(isPlausible({ min: 0 }, 1e9)).toBe(true);
    expect(isPlausible({ max: 100 }, -1e9)).toBe(true);
    expect(isPlausible({}, 999)).toBe(true);
  });
});
