export function durationSeconds(value) {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || !Number.isSafeInteger(Date.now() + seconds * 1000)) {
    throw new Error("Укажи положительное целое количество секунд.");
  }
  return seconds;
}

export function startClock(seconds, now = Date.now()) {
  return { status: "running", seconds: durationSeconds(seconds), startedAt: now, deadline: now + seconds * 1000 };
}

export function remainingTime(clock, now = Date.now()) {
  return clock?.status === "running" ? Math.max(0, clock.deadline - now) : 0;
}

export function finishClock(clock, now = Date.now()) {
  if (!clock || clock.status !== "running") return clock;
  return { ...clock, status: "finished", expired: now >= clock.deadline,
    elapsed: Math.max(0, Math.min(clock.seconds * 1000, now - clock.startedAt)) };
}

export function clockLabel(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  return minutes < 60 ? `${String(minutes).padStart(2, "0")}:${seconds}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
}
