/** Group order lines by their snapshot category (frozen at send time). */
export function groupByCategory(lines) {
  const groups = [];
  for (const line of lines) {
    let g = groups.find((x) => x.name === line.categoryName);
    if (!g) { g = { name: line.categoryName, lines: [] }; groups.push(g); }
    g.lines.push(line);
  }
  return groups;
}
