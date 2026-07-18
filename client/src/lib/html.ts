// vis-timeline renders group/item `content` as raw innerHTML, so any
// user-entered text (job/phase/employee names, client names) interpolated
// into it must be escaped — otherwise a name containing "<" or "&" breaks
// the markup, and one containing a script-bearing tag would execute.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
