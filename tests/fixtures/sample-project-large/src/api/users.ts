import { getUser } from "../domain/users/service";

export function getUserRoute(userId) {
  return getUser(userId);
}
