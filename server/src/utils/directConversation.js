export function createDirectKey(
  firstUserId,
  secondUserId
) {
  return [
    firstUserId.toString(),
    secondUserId.toString(),
  ]
    .sort()
    .join(":");
}