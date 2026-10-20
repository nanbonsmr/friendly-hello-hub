import { describe, expect, it } from "vitest";
import { normaliseReceipt, parseAmount, receiverMatches, statusOk } from "./payments.server";

describe("receipt checks", () => {
  it("reads telebirr string amounts like '100 Birr'", () => {
    expect(parseAmount("100 Birr")).toBe(100);
    expect(parseAmount("1,250.50 ETB")).toBe(1250.5);
  });
  it("uses the settled amount the receiver got, not the fee-inclusive total", () => {
    const r = normaliseReceipt({ source: "telebirr-html", settledAmount: "100 Birr", totalPaidAmount: "102 Birr", creditedPartyName: "Hawwii PLC", receiptNo: "AB12", transactionStatus: "Completed" });
    expect(r.amount).toBe(100);
    expect(r.reference).toBe("AB12");
  });
  it("rejects payments to someone other than the configured receiver", () => {
    expect(receiverMatches("Abebe Kebede", ["Hawwii PLC"])).toBe(false);
    expect(receiverMatches("HAWWII PLC", ["Hawwii PLC"])).toBe(true);
  });
  it("rejects transactions that are not completed", () => {
    expect(statusOk("Failed")).toBe(false);
    expect(statusOk("COMPLETED")).toBe(true);
  });
});
