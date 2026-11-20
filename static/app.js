"use strict";

const $ = (id) => document.getElementById(id);
const layers = ["Utilities", "Infrastructure", "Campus services"];
let sample, presets, csrf, nodes, snapshot, inspected, history;
let faults = new Set();
let busy = false;

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

async function api(path, method = "GET", body) {
  const response = await fetch("/api/" + path, {
    method,
    headers: method === "GET" ? {} : {"Content-Type": "application/json", "X-CSRF-Token": csrf},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function notice(message) {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}

function name(key) {
  return nodes.find((node) => node.id === key)?.name ?? key;
}

function names(keys) {
  return keys.map(name).join(", ");
}

function inputs() {
  return {nodes, failures: [...faults], budget: Number($("budget").value)};
}

function state(key) {
  const result = snapshot?.result;
  const recovery = result && $("stage").value === "recovery";
  if (recovery && result.recovered.includes(key)) return "recovered";
  if (faults.has(key)) return "direct";
  if ((recovery ? result.remaining : result?.offline)?.includes(key)) return "cascade";
  return "online";
}

function graph() {
  const columns = layers.map((layer) => {
    const column = element("section", undefined, "layer");
    column.append(element("h3", layer));
    for (const node of nodes.filter((item) => item.layer === layer)) {
      const status = state(node.id);
      const button = element("button", undefined, "node " + status);
      button.id = "node-" + node.id;
      button.title = node.name + " · " + status;
      button.setAttribute("aria-pressed", String(faults.has(node.id)));
      button.append(element("i", undefined, status), element("span", node.name));
      button.addEventListener("click", () => {
        inspected = node.id;
        if (faults.has(node.id)) faults.delete(node.id);
        else if (faults.size < 12) faults.add(node.id);
        else {
          notice("A scenario supports up to 12 direct outages.");
          inspection();
          return;
        }
        invalidate();
        document.getElementById(button.id).focus({preventScroll: true});
      });
      column.append(button);
    }
    return column;
  });
  $("layers").replaceChildren(...columns);
  drawEdges();
}

function drawEdges() {
  if (!nodes) return;
  const graphBox = $("graph").getBoundingClientRect();
  if (!graphBox.width) return;
  const canvas = $("edges");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(graphBox.width * ratio);
  canvas.height = Math.round(graphBox.height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  canvas.style.width = graphBox.width + "px";
  canvas.style.height = graphBox.height + "px";
  for (const node of nodes) {
    const target = $("node-" + node.id).getBoundingClientRect();
    for (const group of node.requires) {
      for (const key of group) {
        const source = $("node-" + key).getBoundingClientRect();
        const forward = source.left < target.left;
        const sameLayer = source.left === target.left;
        const x1 = (forward || sameLayer ? source.right : source.left) - graphBox.left;
        const y1 = source.top + source.height / 2 - graphBox.top;
        const x2 = (forward ? target.left : target.right) - graphBox.left;
        const y2 = target.top + target.height / 2 - graphBox.top;
        const control = sameLayer ? x1 + 28 : (x1 + x2) / 2;
        const blocked = ["direct", "cascade"].includes(state(key));
        context.strokeStyle = blocked ? "#b98769" : "#566782";
        context.lineWidth = blocked ? 1.7 : 1.15;
        context.setLineDash(group.length > 1 ? [4, 4] : []);
        context.beginPath();
        context.moveTo(x1, y1);
        context.bezierCurveTo(control, y1, control, y2, x2, y2);
        context.stroke();
        const angle = Math.atan2(0, x2 - control);
        context.fillStyle = context.strokeStyle;
        context.beginPath();
        context.moveTo(x2, y2);
        context.lineTo(x2 - 6 * Math.cos(angle - .5), y2 - 6 * Math.sin(angle - .5));
        context.lineTo(x2 - 6 * Math.cos(angle + .5), y2 - 6 * Math.sin(angle + .5));
        context.fill();
      }
    }
  }
}

function inspection() {
  const node = nodes.find((feature) => feature.id === inspected);
  const select = $("inspect-node");
  select.replaceChildren(new Option("Choose a node", ""), ...nodes.map(
    (item) => new Option(item.name, item.id)
  ));
  select.value = node?.id ?? "";
  const content = [element("h3", node?.name ?? "Node details")];
  if (node) {
    content.push(element("p", "Priority " + node.weight + " · repair cost " + node.cost));
    content.push(element("p", node.requires.length
      ? "Requires " + node.requires.map((group) => "(" + group.map(name).join(" or ") + ")").join(" and ")
      : "No upstream dependencies."));
    for (const group of snapshot?.result.causes[node.id] ?? []) {
      content.push(element("p", "Blocked by " + names(group)));
    }
  } else content.push(element("p", "Select a node to inspect its dependencies."));
  $("inspection").replaceChildren(...content);
}

const percent = (score, total) => (100 * score / total).toFixed(1) + "%";

function render() {
  graph();
  inspection();
  $("faults").textContent = faults.size ? "Direct faults · " + names([...faults]) : "No direct faults selected";
  $("budget-value").textContent = $("budget").value + " units";
  $("save").disabled = busy || !snapshot;
  $("export").disabled = !snapshot;
  $("stage").disabled = !snapshot;
  const result = snapshot?.result;
  $("metrics").replaceChildren();
  $("waves").replaceChildren();
  $("plan").replaceChildren();
  $("frontier").replaceChildren();
  $("result-note").textContent = result
    ? result.evaluated + " feasible repair combinations evaluated"
    : "Run the simulation to update the results.";
  if (!result) return;
  for (const [value, label] of [
    [result.offline.length, "Offline after cascade"],
    [percent(result.before, result.total), "Weighted availability"],
    [percent(result.after, result.total), "After optimal repair"],
    [result.spent + " / " + snapshot.budget, "Repair units spent"],
  ]) {
    const card = element("div", undefined, "metric");
    card.append(element("b", value), element("span", label));
    $("metrics").append(card);
  }
  if (!result.failures.length) $("waves").append(element("p", "No outages in this scenario."));
  else {
    const waveList = element("ul");
    result.waves.forEach((wave, index) => {
      waveList.append(element("li", (index === 0 ? "Direct" : "Wave " + index) + " · " + names(wave)));
    });
    $("waves").append(waveList);
  }
  $("plan").append(element("p", result.repairs.length
    ? "Repair " + names(result.repairs) + "."
    : "No budget-feasible repair improves availability."));
  if (result.recovered.length) $("plan").append(element("p", "Restored · " + names(result.recovered)));
  const frontier = $("frontier");
  frontier.append(element("p", "Budget frontier"));
  for (const point of result.frontier) {
    const row = element("div", undefined, "frontier-row");
    const bar = element("progress");
    bar.max = result.total;
    bar.value = point.score;
    bar.setAttribute("aria-label", "Weighted availability at cost " + point.cost);
    row.append(element("span", point.cost + " units"), bar, element("span", percent(point.score, result.total)));
    frontier.append(row);
  }
}

function invalidate() {
  snapshot = null;
  $("stage").value = "cascade";
  render();
}

async function guarded(operation) {
  if (busy) return;
  busy = true;
  $("run").disabled = $("save").disabled = true;
  try {
    await operation();
  } catch (error) {
    notice(error.message);
  } finally {
    busy = false;
    $("run").disabled = false;
    $("save").disabled = !snapshot;
  }
}

async function run() {
  await guarded(async () => {
    const input = inputs();
    const next = await api("simulate", "POST", input);
    if (JSON.stringify(input) !== JSON.stringify(inputs())) return;
    snapshot = next;
    notice("");
    render();
  });
}

function loadPreset(preset) {
  nodes = sample;
  $("model-label").textContent = "Sample campus · " + nodes.length + " nodes";
  faults = new Set(preset.failures);
  $("scenario-name").value = preset.name;
  $("budget").value = preset.budget;
  inspected = null;
  invalidate();
}

function exportCSV() {
  const {result, budget} = snapshot;
  const csvCell = (value) => {
    let text = String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [
    ["Scenario", $("scenario-name").value], ["Budget", budget], ["Spent", result.spent],
    ["Availability before", percent(result.before, result.total)],
    ["Availability after", percent(result.after, result.total)], [],
    ["Node ID", "Node", "Layer", "Priority", "Initial outage", "Repaired", "Final status"],
    ...nodes.map((node) => [
      node.id, node.name, node.layer, node.weight,
      result.failures.includes(node.id) ? "Direct" : result.offline.includes(node.id) ? "Cascade" : "None",
      result.repairs.includes(node.id) ? "Yes" : "No",
      result.remaining.includes(node.id) ? "Offline" : "Operational",
    ]),
  ];
  const url = URL.createObjectURL(new Blob(
    [rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {type: "text/csv;charset=utf-8"}
  ));
  const link = element("a");
  link.href = url;
  link.download = "campus-twin-scenario.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function library() {
  history = await api("runs");
  $("history").replaceChildren();
  $("comparison").replaceChildren();
  $("compare").disabled = history.length < 2;
  if (!history.length) $("history").append(element("p", "Saved scenarios will appear here."));
  for (const record of history) {
    const row = element("div", undefined, "history-row");
    const label = element("label");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.value = record.id;
    label.append(checkbox, element("span", record.name + " · " + new Date(record.created).toLocaleString()));
    const load = element("button", "Load", "secondary");
    load.addEventListener("click", () => {
      nodes = record.nodes;
      faults = new Set(record.result.failures);
      snapshot = record;
      inspected = null;
      $("budget").value = record.budget;
      $("scenario-name").value = record.name;
      $("model-label").textContent = "Saved model · " + nodes.length + " nodes";
      $("preset").value = "";
      $("stage").value = "cascade";
      $("history-dialog").close();
      notice("");
      render();
    });
    const remove = element("button", "Delete", "secondary");
    remove.addEventListener("click", async () => {
      if (!window.confirm("Delete “" + record.name + "”?")) return;
      remove.disabled = true;
      try {
        await api("runs/" + record.id, "DELETE");
        await library();
      } catch (error) {
        remove.disabled = false;
        $("comparison").textContent = error.message;
      }
    });
    row.append(label, load, remove);
    $("history").append(row);
  }
}

function compare() {
  const checked = [...$("history").querySelectorAll("input:checked")];
  const output = $("comparison");
  output.replaceChildren();
  if (checked.length !== 2) {
    output.textContent = "Select exactly two scenarios.";
    return;
  }
  const [a, b] = checked.map((box) => history.find((record) => record.id === Number(box.value)));
  const signature = (record) => JSON.stringify(record.nodes.map((node) => [
    node.id, node.name, node.layer, node.weight, node.cost,
    node.requires.map((group) => [...group].sort().join(",")).sort(),
  ]).sort((left, right) => left[0].localeCompare(right[0])));
  if (signature(a) !== signature(b)) {
    output.textContent = "Choose scenarios that use the same topology and weights.";
    return;
  }
  const table = element("table");
  const head = table.createTHead().insertRow();
  for (const label of ["Metric", a.name, b.name]) {
    const header = element("th", label);
    header.scope = "col";
    head.append(header);
  }
  const rows = table.createTBody();
  const metrics = [
    ["Budget", (run) => run.budget],
    ["Offline after cascade", (run) => run.result.offline.length],
    ["Before repair", (run) => percent(run.result.before, run.result.total)],
    ["After repair", (run) => percent(run.result.after, run.result.total)],
    ["Units spent", (run) => run.result.spent],
    ["Direct repairs", (run) => run.result.repairs.map(
      (id) => run.nodes.find((node) => node.id === id).name
    ).join(", ") || "None"],
  ];
  for (const [label, value] of metrics) {
    const row = rows.insertRow();
    const header = element("th", label);
    header.scope = "row";
    row.append(header, element("td", value(a)), element("td", value(b)));
  }
  output.append(table);
}

async function start() {
  ({nodes: sample, presets, csrf} = await api("bootstrap"));
  presets.forEach((preset, index) => {
    const option = element("option", preset.name);
    option.value = index;
    $("preset").append(option);
  });
  const resize = new ResizeObserver(drawEdges);
  resize.observe($("graph"));
  $("preset").addEventListener("change", () => {
    if ($("preset").value === "") return;
    loadPreset(presets[Number($("preset").value)]);
    run();
  });
  $("clear").addEventListener("click", () => { faults.clear(); invalidate(); });
  $("budget").addEventListener("input", invalidate);
  $("stage").addEventListener("change", graph);
  $("inspect-node").addEventListener("change", () => {
    inspected = $("inspect-node").value;
    inspection();
  });
  $("run").addEventListener("click", run);
  $("save").addEventListener("click", () => guarded(async () => {
    await api("runs", "POST", {...inputs(), name: $("scenario-name").value});
    notice("Scenario saved to the library.");
  }));
  $("export").addEventListener("click", exportCSV);
  for (const button of document.querySelectorAll(".close")) {
    button.addEventListener("click", () => button.closest("dialog").close());
  }
  $("model-open").addEventListener("click", () => {
    $("model-json").value = JSON.stringify(nodes, null, 2);
    $("model-error").textContent = "";
    $("model-dialog").showModal();
  });
  $("model-reset").addEventListener("click", () => {
    $("model-json").value = JSON.stringify(sample, null, 2);
  });
  $("model-apply").addEventListener("click", async () => {
    const button = $("model-apply");
    button.disabled = true;
    try {
      const next = await api("simulate", "POST", {
        nodes: JSON.parse($("model-json").value), failures: [], budget: Number($("budget").value),
      });
      nodes = next.nodes;
      faults.clear();
      inspected = null;
      $("preset").value = "";
      $("model-label").textContent = "Custom model · " + nodes.length + " nodes";
      invalidate();
      $("model-dialog").close();
      notice("Topology validated and applied.");
    } catch (error) {
      $("model-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $("history-open").addEventListener("click", async () => {
    try {
      await library();
      $("history-dialog").showModal();
    } catch (error) {
      notice(error.message);
    }
  });
  $("compare").addEventListener("click", compare);
  $("preset").value = "0";
  loadPreset(presets[0]);
  await run();
}

start().catch((error) => notice("Could not load workspace. " + error.message));
