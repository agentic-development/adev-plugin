import { findUser } from "../../infra/repository/users";

export function getUser(userId) {
  return findUser(userId);
}
