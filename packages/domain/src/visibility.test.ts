import { describe, expect, it } from "vitest";
import { containsInternalText, projectForAudience, type ProjectBundle } from "./visibility";
import { buildWinnerMail } from "./winner";

const secret = "IKKE-TIL-KUNDE: asbestmistanke i sjakt";

const bundle: ProjectBundle = {
  project: {
    id: "p1",
    title: "Lyngveien 3",
    contractSumNok: 486000,
    status: "open",
    address: "Lyngveien 3",
    sellerName: "Noah Lien",
    projectManagerName: "Mia Solberg",
  },
  changeOrders: [
    { id: "c1", title: "Ekstra downlights", description: "To stk", amountNok: 12500, status: "approved", internalNote: secret },
    { id: "c2", title: "Utkast", description: "Hemmelig", amountNok: 1000, status: "draft", internalNote: secret },
  ],
  documents: [
    { id: "d1", name: "tilbud.pdf", visibility: "customer" },
    { id: "d2", name: "kalkyle.xlsx", visibility: "internal" },
    { id: "d3", name: "tegning.pdf", visibility: "craftsman" },
  ],
  media: [
    { id: "m1", kind: "photo", internal: true, textContent: secret, fileName: "skjult.jpg" },
    { id: "m2", kind: "photo", internal: false, textContent: "Sluk mot yttervegg", fileName: "sluk.jpg" },
  ],
  notes: [
    { id: "n1", body: secret, internal: true, roomId: "r1", sectionKey: null },
    { id: "n2", body: "Kunden ønsker nisje", internal: false, roomId: "r1", sectionKey: "murer" },
  ],
  answers: [
    { id: "a1", itemId: "i1", value: true, freeText: "Ny dør, hvit", internalNote: secret },
  ],
  activities: [{ id: "act1", subject: "Ring kunden", note: secret, internal: true }],
};

describe("interne notater", () => {
  it("fjerner interne data fra kunde- og håndverkerutsnitt", () => {
    const customer = projectForAudience(bundle, "customer");
    expect(containsInternalText(bundle, "customer", secret)).toBe(false);
    expect(customer.media.map((item) => item.id)).toEqual(["m2"]);
    expect(customer.notes.map((note) => note.id)).toEqual(["n2"]);
    expect(customer.answers[0]?.freeText).toBe("Ny dør, hvit");
    expect(customer.answers[0]?.internalNote).toBeNull();
    expect(customer.documents.map((document) => document.id)).toEqual(["d1"]);
    expect(customer.changeOrders.map((order) => order.id)).toEqual(["c1"]);
    expect(customer.changeOrders[0]?.internalNote).toBeNull();
    expect(customer.activities).toEqual([]);
    expect(customer.project.contractSumNok).toBe(486000);

    const craftsman = projectForAudience(bundle, "craftsman");
    expect(containsInternalText(bundle, "craftsman", secret)).toBe(false);
    expect(craftsman.project.contractSumNok).toBeNull();
    expect(craftsman.changeOrders).toEqual([]);
    expect(craftsman.documents.map((document) => document.id).sort()).toEqual(["d1", "d3"]);

    expect(projectForAudience(bundle, "internal").notes).toHaveLength(2);
  });

  it("behandler manglende intern-flagg som internt", () => {
    const hidden = projectForAudience(
      { ...bundle, media: [{ id: "m3", kind: "text", internal: undefined as unknown as boolean, textContent: secret, fileName: null }] },
      "customer",
    );
    expect(hidden.media).toEqual([]);
  });
});

describe("winner-epost", () => {
  it("tar med mål og delbare notater, og utelater interne", () => {
    const mail = buildWinnerMail({
      projectTitle: "Lyngveien 3",
      address: "Lyngveien 3, 5353 Straume",
      recipient: "tegner@example.com",
      rooms: [
        {
          name: "Bad",
          floorName: "1. etasje",
          perimeterM: 11.7,
          ceilingHeightM: 2.4,
          floorAreaM: 8.225,
          walls: [
            { number: 1, lengthM: 3.5 },
            { number: 2, lengthM: 2.35 },
          ],
          slope: { kneeHeightM: 1.4, ridgeHeightM: 2.4 },
        },
      ],
      notes: [
        { body: secret, internal: true, roomName: "Bad" },
        { body: "Sluk mot yttervegg", internal: false, roomName: "Bad" },
      ],
    });
    expect(mail.to).toBe("tegner@example.com");
    expect(mail.text).toContain("Omkrets: 11.70 m");
    expect(mail.text).toContain("Vegg 1: 3.50 m");
    expect(mail.text).toContain("Sluk mot yttervegg");
    expect(mail.text).not.toContain(secret);
    expect(mail.internalNotesOmitted).toBe(1);
  });
});
