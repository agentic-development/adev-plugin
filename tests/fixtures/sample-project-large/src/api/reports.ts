import { buildReport } from "../domain/reports/service";

export function getReportRoute() {
  return buildReport();
}
