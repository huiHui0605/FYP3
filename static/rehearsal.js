import { $, element, icon } from "./dom.js";

function availabilityChart(trial, recommended, result, width) {
  const canvas = element("canvas", undefined, "availability-chart");
  // The following table exposes the exact values to assistive technology.
  canvas.setAttribute("aria-hidden", "true");
  const height = 160;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(ratio, ratio);
  const x = (hour) => 40 + (hour / trial.hours) * (width - 68);
  const y = (fraction) => 130 - 112 * fraction;
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#506765";
  for (const tick of [0, 0.5, 1]) {
    ctx.fillText(Math.round(tick * 100) + "%", 2, y(tick) + 4);
    ctx.strokeStyle = "#c8d7d4";
    ctx.beginPath();
    ctx.moveTo(x(0), y(tick));
    ctx.lineTo(x(trial.hours), y(tick));
    ctx.stroke();
  }
  ctx.fillText("0 h", x(0), 152);
  ctx.fillText(trial.hours + " h", x(trial.hours) - 8, 152);
  function trace(schedule, colour, dashed) {
    let score = result.before;
    ctx.strokeStyle = colour;
    ctx.lineWidth = dashed ? 2 : 3;
    ctx.setLineDash(dashed ? [6, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x(0), y(score / result.total));
    for (const step of schedule.steps) {
      ctx.lineTo(x(step.finish), y(score / result.total));
      score = step.online_score;
      ctx.lineTo(x(step.finish), y(score / result.total));
    }
    ctx.stroke();
  }
  trace(trial, "#985020", false);
  trace(recommended, "#006d61", true);
  return canvas;
}

export function setupRehearsal(readSnapshot, evaluate) {
  const dialog = $("trial-dialog");
  let source,
    order,
    names,
    revision = 0;
  function renderOrder(focusIndex, direction) {
    const rows = order.map((key, index) => {
      const row = element("li");
      row.append(element("strong", names.get(key)));
      for (const [label, offset] of [
        ["Earlier", -1],
        ["Later", 1],
      ]) {
        const move = element("button", undefined, "secondary icon-button");
        move.append(icon(offset === -1 ? "up" : "down"));
        move.title = "Move " + names.get(key) + " " + label.toLowerCase();
        move.setAttribute(
          "aria-label",
          "Move " + names.get(key) + " " + label.toLowerCase(),
        );
        move.disabled = index + offset < 0 || index + offset >= order.length;
        move.onclick = () => {
          const target = index + offset;
          [order[index], order[target]] = [order[target], order[index]];
          revision++;
          $("trial-result").textContent =
            "Order changed. Compare to update the results.";
          renderOrder(target, offset);
        };
        row.append(move);
      }
      return row;
    });
    $("trial-order").replaceChildren(...rows);
    if (focusIndex !== undefined) {
      const buttons = rows[focusIndex].querySelectorAll("button");
      const desired = buttons[direction === -1 ? 0 : 1];
      (desired.disabled
        ? rows[focusIndex].querySelector("button:enabled")
        : desired
      )?.focus();
    }
  }

  function comparison(trial) {
    const baseline = source.result.schedule;
    const delta = trial.lost_priority_hours - baseline.lost_priority_hours;
    const panel = $("trial-result");
    panel.replaceChildren(
      element(
        "h3",
        delta === 0
          ? "Both orders have equal modeled loss"
          : delta + " additional lost priority-hours",
      ),
    );
    panel.append(
      element(
        "p",
        "Your order: " +
          trial.lost_priority_hours +
          " · Recommended: " +
          baseline.lost_priority_hours +
          " · Same " +
          trial.hours +
          "-hour window.",
      ),
    );
    const table = element("table");
    table.createCaption().textContent = "Availability at repair completion";
    const head = table.createTHead().insertRow();
    for (const text of ["Hour", "Your order", "Recommended"])
      head.append(element("th", text));
    const body = table.createTBody();
    function availability(schedule, hour) {
      let score = source.result.before;
      for (const step of schedule.steps) {
        if (step.finish > hour) break;
        score = step.online_score;
      }
      return ((100 * score) / source.result.total).toFixed(1) + "%";
    }
    const hours = new Set([
      0,
      ...trial.steps.map((s) => s.finish),
      ...baseline.steps.map((s) => s.finish),
    ]);
    for (const hour of [...hours].sort((a, b) => a - b)) {
      const row = body.insertRow();
      row.append(
        element("th", hour),
        element("td", availability(trial, hour)),
        element("td", availability(baseline, hour)),
      );
    }
    const key = element("div", undefined, "curve-key");
    key.append(element("span", "Your order"), element("span", "Recommended"));
    panel.append(
      key,
      availabilityChart(trial, baseline, source.result, panel.clientWidth),
      table,
    );
    const changes = trial.goals.filter(
      (goal) =>
        goal.outcome !==
        baseline.goals.find((g) => g.node === goal.node)?.outcome,
    );
    for (const goal of changes)
      panel.append(
        element(
          "p",
          names.get(goal.node) +
            " · " +
            goal.outcome +
            " in your order (deadline " +
            goal.target +
            " h).",
        ),
      );
  }

  $("rehearse").onclick = () => {
    source = readSnapshot();
    order = source.result.schedule.steps.map((step) => step.repair);
    names = new Map(source.nodes.map((node) => [node.id, node.name]));
    revision++;
    $("trial-run").disabled = false;
    $("trial-result").replaceChildren();
    renderOrder();
    dialog.showModal();
  };
  $("trial-run").onclick = async () => {
    const version = revision;
    $("trial-run").disabled = true;
    try {
      const result = await evaluate({
        nodes: source.nodes,
        failures: source.result.failures,
        budget: source.budget,
        order: [...order],
      });
      if (version === revision && dialog.open) comparison(result);
    } catch (problem) {
      if (version === revision) $("trial-result").textContent = problem.message;
    } finally {
      $("trial-run").disabled = false;
    }
  };
}
