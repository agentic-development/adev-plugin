import { publishEvent } from "../shared/events";

export function sendNotification(recipient, message) {
  publishEvent("notification.sent", { recipient, message });
  return true;
}
