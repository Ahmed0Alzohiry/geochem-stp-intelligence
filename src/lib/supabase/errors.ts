export function loadMasterDataError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown reference-data error.";
}
