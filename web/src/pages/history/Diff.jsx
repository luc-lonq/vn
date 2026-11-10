const LINE_STYLES = {
  '+': 'bg-fg/12',
  '-': 'text-muted line-through decoration-muted/60',
  ' ': '',
};
const SIGNS = { '+': '+', '-': '−', ' ': '' };

/** Adds old/new line numbers to each line of a hunk. */
function numberLines(hunk) {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  return hunk.lines.map((raw) => {
    const sign = raw[0];
    return {
      sign,
      text: raw.slice(1),
      oldNumber: sign === '+' ? '' : oldLine++,
      newNumber: sign === '-' ? '' : newLine++,
    };
  });
}

/** GitHub-style unified diff. */
export default function Diff({ hunks }) {
  return (
    <div className="text-xs overflow-x-auto">
      {hunks.map((hunk, i) => (
        <div key={i}>
          <div className="px-3 py-1 text-muted bg-soft">
            @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {numberLines(hunk).map((line, j) => (
                <tr key={j} className={LINE_STYLES[line.sign]}>
                  <td className="select-none text-right text-muted px-2 w-10 tabular-nums">
                    {line.oldNumber}
                  </td>
                  <td className="select-none text-right text-muted px-2 w-10 tabular-nums border-r border-line">
                    {line.newNumber}
                  </td>
                  <td className="select-none px-2 w-4">{SIGNS[line.sign]}</td>
                  <td className="whitespace-pre pr-4 py-px">{line.text || ' '}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
