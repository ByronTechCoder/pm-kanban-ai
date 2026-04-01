import { expect, test, type Page } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

const cloneBoard = () => JSON.parse(JSON.stringify(initialData));

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel(/username/i).fill("user");
  await page.getByLabel(/password/i).fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  let board = cloneBoard();
  await page.route("**/api/board**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      board = (await request.postDataJSON()) as typeof board;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(board),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(board),
    });
  });
});

test("loads the kanban board", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("chat sidebar sends a message and receives a reply", async ({ page }) => {
  const board = cloneBoard();
  await page.route("**/api/chat**", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "I have noted your request.",
        boardUpdatesApplied: false,
        board,
      }),
    });
  });

  await signIn(page);

  await page.getByPlaceholder("Ask AI to update your board").fill("Hello AI");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("Hello AI")).toBeVisible();
  await expect(page.getByText("I have noted your request.")).toBeVisible();
});

test("chat sidebar rolls back message and shows error on failure", async ({ page }) => {
  await page.route("**/api/chat**", async (route) => {
    return route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "AI unavailable" }),
    });
  });

  await signIn(page);

  await page.getByPlaceholder("Ask AI to update your board").fill("This will fail");
  await page.getByRole("button", { name: /^send$/i }).click();

  // Error is shown
  await expect(page.getByText("AI unavailable")).toBeVisible();
  // Message was rolled back — prompt is restored
  await expect(page.getByPlaceholder("Ask AI to update your board")).toHaveValue("This will fail");
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});
