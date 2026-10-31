export interface MyAutoCatalogEntry {
  makeId: number;
  make: string;
  modelId: number | null;
  model: string;
  groupTitle: string;
}

function parseCsvRows(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("Unclosed quoted field in MyAuto catalog CSV");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseMyAutoCatalogCsv(source: string): MyAutoCatalogEntry[] {
  const [header, ...data] = parseCsvRows(source);
  if (!header) throw new Error("MyAuto catalog CSV is empty");

  const columns = new Map(header.map((name, index) => [name.trim(), index]));
  const required = ["make_id", "make", "model_id", "model", "group_title"];
  if (required.some((name) => !columns.has(name))) {
    throw new Error("MyAuto catalog CSV has an unexpected header");
  }

  return data.map((values) => {
    const value = (name: string) => values[columns.get(name)!]?.trim() ?? "";
    const makeId = Number(value("make_id"));
    const modelIdValue = value("model_id");
    const modelId = modelIdValue ? Number(modelIdValue) : null;
    const make = value("make");
    const model = value("model");

    if (!Number.isInteger(makeId) || makeId <= 0 || !make) {
      throw new Error("MyAuto catalog CSV contains an invalid make");
    }
    if (modelId !== null && (!Number.isInteger(modelId) || modelId <= 0 || !model)) {
      throw new Error("MyAuto catalog CSV contains an invalid model");
    }

    return {
      makeId,
      make,
      modelId,
      model,
      groupTitle: value("group_title"),
    };
  });
}
