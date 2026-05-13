import { describe, expect, it } from "vitest";
import {
  parsePort,
  parsePositiveInt,
  validateCommand,
  validateTopicSegment,
} from "./validators";

describe("validateCommand", () => {
  it("accepts simple identifiers", () => {
    expect(validateCommand("getTempA")).toBe("getTempA");
    expect(validateCommand("get_temp_a")).toBe("get_temp_a");
    expect(validateCommand("a".repeat(64))).toBe("a".repeat(64));
  });

  it.each([
    ["empty", ""],
    ["too long", "a".repeat(65)],
    ["with space", "get Temp"],
    ["with newline injection", "getTempA\ngetTempB"],
    ["with semicolon", "getTempA;reset"],
    ["with shell metachar", "getTempA|cat"],
    ["with non-ascii", "getTempÄ"],
    ["with control char", "getTempA\u0007"],
  ])("rejects %s", (_label, value) => {
    expect(() => validateCommand(value)).toThrow(/Invalid vcontrold command/);
  });
});

describe("validateTopicSegment", () => {
  it("accepts safe segments", () => {
    expect(validateTopicSegment("clientId", "vcontrold-adapter")).toBe(
      "vcontrold-adapter",
    );
    expect(validateTopicSegment("prefix", "homeassistant")).toBe(
      "homeassistant",
    );
  });

  it.each([
    ["mqtt wildcard #", "foo#"],
    ["mqtt wildcard +", "foo+"],
    ["topic separator", "foo/bar"],
    ["empty", ""],
    ["dot", "foo.bar"],
    ["nul byte", "foo\u0000bar"],
  ])("rejects %s", (_label, value) => {
    expect(() => validateTopicSegment("name", value)).toThrow(
      /Invalid value for name/,
    );
  });
});

describe("parsePositiveInt", () => {
  it("parses positive integers", () => {
    expect(parsePositiveInt("x", "1")).toBe(1);
    expect(parsePositiveInt("x", "60000")).toBe(60000);
  });

  it.each([
    ["zero", "0"],
    ["negative", "-5"],
    ["non-numeric", "abc"],
    ["empty", ""],
    ["NaN-producing", "NaN"],
  ])("rejects %s", (_label, value) => {
    expect(() => parsePositiveInt("x", value)).toThrow(/positive integer/);
  });
});

describe("parsePort", () => {
  it("accepts ports in 1..65535", () => {
    expect(parsePort("p", "1")).toBe(1);
    expect(parsePort("p", "3002")).toBe(3002);
    expect(parsePort("p", "65535")).toBe(65535);
  });

  it("rejects ports above 65535", () => {
    expect(() => parsePort("p", "65536")).toThrow(/exceeds 65535/);
    expect(() => parsePort("p", "100000")).toThrow(/exceeds 65535/);
  });

  it("rejects zero and negative", () => {
    expect(() => parsePort("p", "0")).toThrow(/positive integer/);
    expect(() => parsePort("p", "-1")).toThrow(/positive integer/);
  });
});
