import { moveCard, moveColumn, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("moveColumn", () => {
  const cols: Column[] = [
    { id: "col-a", title: "A", cardIds: [] },
    { id: "col-b", title: "B", cardIds: [] },
    { id: "col-c", title: "C", cardIds: [] },
  ];

  it("moves a column forward", () => {
    const result = moveColumn(cols, "col-a", "col-c");
    expect(result.map((c) => c.id)).toEqual(["col-b", "col-c", "col-a"]);
  });

  it("moves a column backward", () => {
    const result = moveColumn(cols, "col-c", "col-a");
    expect(result.map((c) => c.id)).toEqual(["col-c", "col-a", "col-b"]);
  });

  it("is a no-op when same position", () => {
    const result = moveColumn(cols, "col-b", "col-b");
    expect(result.map((c) => c.id)).toEqual(["col-a", "col-b", "col-c"]);
  });
});
