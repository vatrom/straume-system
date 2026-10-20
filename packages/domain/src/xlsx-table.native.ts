export function tableToXlsx(_rows: string[][]): Buffer {
  throw new Error("Regneark er ikke tilgjengelig i befaring-appen");
}

export function xlsxToTable(_buffer: Buffer): string[][] {
  throw new Error("Regneark er ikke tilgjengelig i befaring-appen");
}

export function tableToRecords(table: string[][]): Record<string, string>[] {
  const [header, ...body] = table;
  if (!header) return [];
  return body
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, index) => {
        if (key) record[key] = row[index] ?? "";
      });
      return record;
    });
}
