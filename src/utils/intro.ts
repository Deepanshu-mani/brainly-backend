// intros.ts

export function startSelfPing() {
  const url = process.env.RENDER_PING_URL;
  if (!url) {
    throw new Error("Missing RENDER_PING_URL environment variable");
  }

  console.log(`Starting self-ping to keep server awake: ${url}`);

  setInterval(() => {
    fetch(url)
      .then((res) => {
        console.log("Self-ping success:", res.status);
      })
      .catch((err) => {
        console.error("Self-ping failed:", err.message);
      });
  }, 5 * 60 * 1000); // every 5 minutes
}