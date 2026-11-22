import { $, element } from "./dom.js";

const layers = ["Utilities", "Infrastructure", "Campus services"];

export function setupBuilder(current, sample, apply) {
  let draft, selected, raw;
  const error = (message) => {
    $("model-error").textContent = message;
  };
  const copy = (rows) => JSON.parse(JSON.stringify(rows));
  function field(label, input) {
    const wrapper = element("label", label, "builder-field");
    wrapper.append(input);
    return wrapper;
  }
  function action(label, callback) {
    const button = element("button", label, "secondary");
    button.type = "button";
    button.addEventListener("click", callback);
    return button;
  }
  function readRaw() {
    const rows = JSON.parse($("model-json").value);
    if (
      !Array.isArray(rows) ||
      !rows.length ||
      rows.length > 24 ||
      rows.some(
        (node) =>
          !node ||
          typeof node.id !== "string" ||
          !Array.isArray(node.requires ?? []) ||
          (node.requires ?? []).some((group) => !Array.isArray(group)),
      )
    ) {
      throw new Error(
        "Provide 1–24 asset objects with IDs and dependency groups.",
      );
    }
    return rows;
  }
  function render() {
    const panel = $("builder");
    panel.hidden = raw;
    $("raw-editor").hidden = !raw;
    $("builder-view").setAttribute("aria-pressed", String(!raw));
    $("json-view").setAttribute("aria-pressed", String(raw));
    if (raw) {
      $("model-json").value = JSON.stringify(draft, null, 2);
      return;
    }
    const node = draft.find((item) => item.id === selected) ?? draft[0];
    selected = node.id;
    const picker = element("select");
    for (const item of draft)
      picker.add(new Option(item.name || item.id, item.id));
    picker.value = selected;
    picker.onchange = () => {
      selected = picker.value;
      error("");
      render();
      $("asset-picker").focus();
    };
    picker.id = "asset-picker";
    const add = action("Add asset", () => {
      let number = 1;
      while (draft.some((item) => item.id === "asset-" + number)) number++;
      selected = "asset-" + number;
      draft.push({
        id: selected,
        name: "New asset " + number,
        layer: layers[2],
        cost: 1,
        weight: 1,
        hours: 1,
        requires: [],
      });
      error("");
      render();
      $("asset-name").focus();
      $("asset-name").select();
    });
    add.disabled = draft.length >= 24;
    const remove = action("Remove asset", () => {
      const users = draft.filter((item) =>
        (item.requires ?? []).some((group) => group.includes(selected)),
      );
      if (users.length) {
        error(
          "Remove this dependency from " +
            users.map((item) => item.name).join(", ") +
            " first.",
        );
        return;
      }
      draft = draft.filter((item) => item.id !== selected);
      error("");
      render();
      $("asset-picker").focus();
    });
    remove.disabled = draft.length === 1;
    const toolbar = element("div", undefined, "actions");
    toolbar.append(add, remove);
    const fields = element("div", undefined, "builder-fields");
    const name = element("input");
    name.id = "asset-name";
    name.value = node.name ?? "";
    name.maxLength = 32;
    name.oninput = () => {
      node.name = name.value;
      picker.selectedOptions[0].text = name.value || node.id;
    };
    const layer = element("select");
    for (const item of layers) layer.add(new Option(item, item));
    layer.value = node.layer;
    layer.onchange = () => {
      node.layer = layer.value;
    };
    fields.append(field("Asset name", name), field("Layer", layer));
    for (const [label, key, max] of [
      ["Priority", "weight", 100],
      ["Repair cost", "cost", 25],
    ]) {
      const input = element("input");
      Object.assign(input, { type: "number", min: 1, max, value: node[key] });
      input.oninput = () => {
        node[key] = input.valueAsNumber;
      };
      fields.append(field(label, input));
    }
    const groups = element("div", undefined, "dependency-groups");
    const requires = node.requires ?? (node.requires = []);
    requires.forEach((group, index) => {
      const box = element("fieldset");
      box.append(
        element("legend", "Group " + (index + 1) + " · any one source"),
      );
      const choices = element("div", undefined, "source-choices");
      for (const source of draft.filter((item) => item.id !== selected)) {
        const label = element("label");
        const check = element("input");
        check.type = "checkbox";
        check.checked = group.includes(source.id);
        check.onchange = () => {
          if (check.checked) group.push(source.id);
          else group.splice(group.indexOf(source.id), 1);
        };
        label.append(check, document.createTextNode(source.name));
        choices.append(label);
      }
      box.append(
        choices,
        action("Remove group " + (index + 1), () => {
          requires.splice(index, 1);
          render();
          $("add-group").focus();
        }),
      );
      groups.append(box);
    });
    const newGroup = action("Add dependency group", () => {
      requires.push([]);
      render();
      groupsFocus();
    });
    function groupsFocus() {
      $("builder").querySelector("fieldset:last-child input")?.focus();
    }
    newGroup.id = "add-group";
    newGroup.disabled = requires.length >= 8 || draft.length === 1;
    panel.replaceChildren(
      field("Select asset", picker),
      toolbar,
      fields,
      element("h3", "Dependency groups"),
      groups,
      newGroup,
    );
  }
  $("model-open").onclick = () => {
    draft = copy(current());
    selected = draft[0].id;
    raw = false;
    error("");
    render();
    $("model-dialog").showModal();
  };
  $("json-view").onclick = () => {
    if (!raw) {
      raw = true;
      error("");
      render();
    }
  };
  $("builder-view").onclick = () => {
    if (!raw) return;
    try {
      draft = readRaw();
      raw = false;
      error("");
      render();
    } catch (problem) {
      error(problem.message);
    }
  };
  $("model-reset").onclick = () => {
    draft = copy(sample());
    selected = draft[0].id;
    error("");
    render();
  };
  $("model-apply").onclick = async () => {
    const dialog = $("model-dialog");
    const buttons = [
      ...dialog.querySelectorAll("button,input,textarea,select"),
    ].filter((item) => !item.disabled);
    const preventClose = (event) => event.preventDefault();
    dialog.addEventListener("cancel", preventClose);
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await apply(raw ? readRaw() : draft);
      dialog.close();
    } catch (problem) {
      error(problem.message);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
      dialog.removeEventListener("cancel", preventClose);
    }
  };
}
