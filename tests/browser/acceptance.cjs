const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium, firefox, webkit } = require("playwright-core");
(async () => {
  const engine = process.env.BROWSER_ENGINE || "chromium";
  const browser = await { chromium, firefox, webkit }[engine].launch(
    engine === "chromium"
      ? {
          executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
          args: ["--no-sandbox"],
        }
      : {},
  );
  try {
    const page = await browser.newPage({
      viewport: { width: 1360, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("400 (BAD REQUEST)")
      )
        errors.push(message.text());
    });
    await page.goto(process.env.CAMPUS_URL || "http://127.0.0.1:8000");
    await page.getByText("88.0%", { exact: true }).first().waitFor();
    assert.equal(await page.locator(".node.direct").count(), 3);
    assert.equal(await page.locator(".node.cascade").count(), 7);
    // Inspecting or tracing a node preserves the current simulation.
    await page.locator("#node-grid").press("Enter");
    await page.getByRole("button", {name:"Core network", exact:true}).click();
    assert.equal(await page.locator("#inspect-node").inputValue(), "switch");
    assert.equal(await page.locator("#save").isEnabled(), true);
    await page.getByRole("button", {name:"Next recovery stage"}).click();
    assert.equal(await page.locator("#stage").inputValue(), "step-0");
    await page.getByRole("button", {name:"Previous recovery stage"}).click();
    assert.equal(await page.locator("#stage-prev").isDisabled(), true);
    await page.getByRole("button", {name:"Mark as failed", exact:true}).click();
    await page.getByText("Inputs changed. Run the simulation to update results.").waitFor();
    assert.equal(await page.locator("#save").isDisabled(), true);
    await page.getByRole("button", {name:"Remove direct fault", exact:true}).click();
    await page.locator("#run").click();
    await page.getByText("88.0%", { exact: true }).first().waitFor();
    await page.locator("#inspect-node").selectOption("switch");
    await page.getByText("Blocked by Grid supply, Solar microgrid").waitFor();
    await page.locator("#stage").selectOption("recovery");
    assert.equal(await page.locator(".node.recovered").count(), 8);
    await page.getByRole("button", { name: "Save run" }).click();
    await page.getByText("Scenario saved to the library.").waitFor();
    await page.locator("#budget").fill("4");
    await page.locator("#scenario-name").fill("Storm budget 4");
    await page.getByRole("button", { name: "Run simulation" }).click();
    await page.getByText("53.0%", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Save run" }).click();
    await page.getByText("Scenario saved to the library.").waitFor();
    await page.getByRole("button", { name: "Scenario library" }).click();
    await page.locator("#history-dialog").waitFor();
    for (const checkbox of await page.getByRole("checkbox").all())
      await checkbox.check();
    await page.getByRole("button", { name: "Compare selected runs" }).click();
    assert.match(
      await page.locator("#comparison").innerText(),
      /53\.0%\s+88\.0%/,
    );
    await page.reload();
    await page.getByRole("button", { name: "Scenario library" }).click();
    await page
      .getByRole("button", { name: "Load", exact: true })
      .first()
      .click();
    await page.getByText("53.0%", { exact: true }).first().waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    assert.match(
      await fs.readFile(await download.path(), "utf8"),
      /Storm budget 4/,
    );
    await page.getByRole("button", { name: "Edit topology" }).click();
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    const json = JSON.parse(await page.locator("#model-json").inputValue());
    json[0].requires = [[json[0].id]];
    await page.locator("#model-json").fill(JSON.stringify(json));
    await page.getByRole("button", { name: "Validate and apply" }).click();
    await page.getByText("Dependencies must be acyclic.").waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator("#preset").selectOption({ label: "Recovery drill" });
    await page.getByRole("button", { name: "0–2 h · Solar microgrid" }).click();
    await page.getByText(/At hour 2 · 53.0% available/).waitFor();
    assert.equal(await page.locator(".node.recovered").count(), 5);
    await page.locator("#rehearse").click();
    await page
      .getByRole("button", { name: "Move Grid supply earlier" })
      .press("Enter");
    await page.getByRole("button", { name: "Compare orders" }).click();
    await page.getByText("130 additional lost priority-hours").waitFor();
    await page.locator("#trial-dialog .close").click();
    await page.locator("#save").click();
    await page.getByText("Scenario saved to the library.").waitFor();
    await page
      .getByRole("button", { name: "Edit recovery assumptions" })
      .click();
    await page.getByLabel("Learning portal deadline").fill("1");
    await page.getByRole("button", { name: "Apply and simulate" }).click();
    await page.getByRole("cell", { name: "Late", exact: true }).waitFor();
    await page.locator("#scenario-name").fill("Tighter deadline");
    await page.locator("#save").click();
    await page.getByText("Scenario saved to the library.").waitFor();
    await page.locator("#history-open").click();
    await page.getByLabel("Find a scenario").fill("Recovery drill");
    await page.getByRole("checkbox", { name: /Recovery drill/ }).check();
    await page.getByLabel("Find a scenario").fill("Tighter deadline");
    assert.equal(await page.getByRole("checkbox", {name:/Recovery drill/}).isChecked(), true);
    await page.getByRole("checkbox", { name: /Tighter deadline/ }).check();
    await page.locator("#compare").click();
    assert.match(
      await page.locator("#comparison").innerText(),
      /Learning portal · deadline/,
    );
    await page.locator("#history-dialog .close").click();
    await page.getByText("Transfer scenario", { exact: true }).click();
    const jsonDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const savedFile = await (await jsonDownload).path();
    const second = await browser.newPage();
    second.on("pageerror", (error) => errors.push(error.message));
    await second.goto(page.url());
    await second.getByText("88.0%", { exact: true }).first().waitFor();
    await second.getByText("Transfer scenario", { exact: true }).click();
    await second.locator("#import-case").setInputFiles(savedFile);
    await second.getByText(/Scenario opened and recalculated/).waitFor();
    assert.equal(
      await second.locator("#scenario-name").inputValue(),
      "Tighter deadline",
    );
    assert.equal(await second.locator(".goal-late").count(), 1);
    await second.locator("#import-case").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
    await second.getByText("Invalid Campus Twin scenario file.").waitFor();
    assert.equal(await second.locator("#budget").inputValue(), "17");
    await second.close();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      390,
    );
    await page.reload();
    await page.locator("#asset-list .node.direct").first().waitFor();
    assert.equal(
      await page.locator("#list-view").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#map-view").press("Enter");
    await page.locator("#layers .node.direct").first().waitFor();
    await page.locator("#model-open").click();
    await page.getByRole("button", { name: "Add asset", exact: true }).click();
    await page.getByLabel("Asset name", { exact: true }).fill("Night studio");
    await page.getByRole("button", { name: "Add dependency group" }).click();
    await page
      .getByRole("checkbox", { name: "Core network", exact: true })
      .check();
    await page.getByRole("button", { name: "Validate and apply" }).click();
    await page.getByText("Custom model · 12 nodes").waitFor();
    assert.equal(
      await page.locator("#node-asset-1").getAttribute("aria-pressed"),
      "false",
    );
    await page.locator("#list-view").click();
    await page
      .locator("#asset-list #node-asset-1")
      .getByText("Requires Core network")
      .waitFor();
    await page.locator("#inspect-node").selectOption("asset-1");
    await page
      .locator("#inspection")
      .getByText("Requires (Core network)")
      .waitFor();

    // A pre-schedule library entry includes the original topology and scores.
    const legacy = await page.evaluate(
      async () => (await (await fetch("/api/runs")).json())[0],
    );
    delete legacy.result.schedule;
    for (const node of legacy.nodes) {
      delete node.hours;
      delete node.target_hours;
    }
    await page.route("**/api/runs", (route) =>
      route.fulfill({ json: [legacy] }),
    );
    await page.locator("#history-open").click();
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await page
      .getByText("Run this saved scenario again to calculate repair times.")
      .waitFor();
    assert.equal(await page.locator("#rehearse").isDisabled(), true);
    await page.locator("#run").click();
    await page.getByText(/One crew · 3 repair hours/).waitFor();
    assert.equal(await page.locator("#rehearse").isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log(
      "Browser acceptance passed: cascade, recovery, save, compare, reload, CSV, validation, mobile width.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
