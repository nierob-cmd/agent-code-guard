// Extract candidate file-path targets from direct tool-call params.
// The host only derives paths for apply_patch (extractApplyPatchTargetPaths);
// edit/write params are read directly here.

export function candidatePathsForEditWrite(params) {
  const paths = [];
  const fp = params && (params.file_path ?? params.path);
  if (typeof fp === "string" && fp.trim()) paths.push(fp.trim());
  return paths;
}

export function candidatePathsForApplyPatch(event) {
  const paths = [];
  if (Array.isArray(event.derivedPaths)) {
    for (const p of event.derivedPaths) {
      if (typeof p === "string" && p.trim()) paths.push(p.trim());
    }
  }
  const params = event.params || {};
  const fp = params.file_path ?? params.path;
  if (typeof fp === "string" && fp.trim()) paths.push(fp.trim());
  return paths;
}

export function commandStringOf(params) {
  if (!params) return "";
  const raw = params.command ?? params.cmd ?? params.script;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === "string").join(" ");
  return "";
}
